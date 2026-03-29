import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateEntityId,
} from "@medusajs/framework/utils"
import { Knex } from "knex"
import { createHash } from "crypto"
import AuctionModuleService from "../../../../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../../../../modules/auction"
import { sendOutbidEmail } from "../../../../../../../lib/email-helpers"
import { crmSyncBidPlaced } from "../../../../../../../lib/crm-sync"
import { getSupabaseAdminClient } from "../../../../../../../lib/supabase"

/**
 * Tiered bid increment table.
 * Returns the minimum increment that must be added to currentPrice.
 */
function getMinIncrement(currentPrice: number): number {
  if (currentPrice < 10)   return 0.50
  if (currentPrice < 50)   return 1.00
  if (currentPrice < 200)  return 2.50
  if (currentPrice < 500)  return 5.00
  if (currentPrice < 2000) return 10.00
  return 25.00
}

// GET /store/auction-blocks/:slug/items/:itemId/bids — Public: bid history
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)
  const { slug, itemId } = req.params

  // Verify block exists and is public
  const [blocks] = await auctionService.listAndCountAuctionBlocks(
    { slug },
    { limit: 1 }
  )

  if (!blocks.length || !["active", "ended"].includes(blocks[0].status)) {
    res.status(404).json({ message: "Block not found" })
    return
  }

  // Verify item belongs to block
  const [items] = await auctionService.listAndCountBlockItems(
    { id: itemId, auction_block_id: blocks[0].id },
    { limit: 1 }
  )

  if (!items.length) {
    res.status(404).json({ message: "Item not found" })
    return
  }

  // List bids via raw SQL (same connection pool as transactions)
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const bids = await pgConnection("bid")
    .where("block_item_id", itemId)
    .orderBy("created_at", "desc")
    .limit(50)

  // Build anonymized display names via SHA-256 hash of customer ID.
  // Result e.g. "Bidder A3F2C1" — consistent per user, not bruteforceable.
  const uniqueUserIds = [...new Set(bids.map((b: any) => b.user_id).filter(Boolean))]
  const customerMap: Record<string, string> = {}
  uniqueUserIds.forEach((userId) => {
    const hash = createHash("sha256")
      .update(userId as string)
      .digest("hex")
      .slice(0, 6)
      .toUpperCase()
    customerMap[userId as string] = `Bidder ${hash}`
  })

  // Anonymize for public view — no internal user_id in response
  const anonymized = bids.map((bid: any) => ({
    id: bid.id,
    amount: parseFloat(bid.amount),
    is_winning: bid.is_winning,
    user_hint: customerMap[bid.user_id] || "Bidder 000000",
    created_at: bid.created_at,
  }))

  // Reserve status: null if no reserve, true/false if reserve set
  const item = items[0]
  const reserveMet: boolean | null = item.reserve_price
    ? parseFloat(item.current_price || item.start_price) >= parseFloat(item.reserve_price)
    : null

  res.json({ bids: anonymized, count: bids.length, reserve_met: reserveMet })
}

// Helper: create a bid record via raw Knex (inside transaction)
async function insertBid(
  trx: Knex.Transaction,
  data: {
    block_item_id: string
    user_id: string
    amount: number
    max_amount?: number | null
    is_winning: boolean
    is_outbid: boolean
  }
) {
  const id = generateEntityId("", "bid")
  const now = new Date()
  await trx("bid").insert({
    id,
    block_item_id: data.block_item_id,
    user_id: data.user_id,
    amount: data.amount,
    max_amount: data.max_amount ?? null,
    is_winning: data.is_winning,
    is_outbid: data.is_outbid,
    created_at: now,
    updated_at: now,
  })
  return { id, amount: data.amount }
}

// POST /store/auction-blocks/:slug/items/:itemId/bids — Authenticated: place bid
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const { slug, itemId } = req.params
  const { amount, max_amount } = req.body as {
    amount: number
    max_amount?: number
  }

  // Input validation
  if (!amount || typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ message: "Invalid bid amount" })
    return
  }
  if (max_amount !== undefined && max_amount < amount) {
    res.status(400).json({
      message: "Maximum bid must be >= bid amount",
    })
    return
  }

  try {
    const result = await pgConnection.transaction(async (trx) => {
      // Lock the block_item row to prevent race conditions
      const item = await trx("block_item")
        .where("id", itemId)
        .forUpdate()
        .first()

      if (!item) {
        throw { status: 404, message: "Item not found" }
      }
      if (item.status !== "active") {
        throw { status: 400, message: "Item is not active" }
      }

      // Check lot end time
      if (item.lot_end_time && new Date(item.lot_end_time) < new Date()) {
        throw { status: 400, message: "Lot has ended" }
      }

      // Get the block
      const block = await trx("auction_block")
        .where("id", item.auction_block_id)
        .first()

      if (!block || block.status !== "active") {
        throw { status: 400, message: "Auction is not active" }
      }

      // Guard against null/undefined start_price (item configuration error)
      const rawStartPrice = item.start_price
      const startPrice = rawStartPrice != null ? parseFloat(String(rawStartPrice)) : 0
      if (!isFinite(startPrice)) {
        throw { status: 500, message: "Item configuration error: invalid start price" }
      }

      // Calculate minimum bid
      const currentPrice = item.current_price != null
        ? parseFloat(String(item.current_price))
        : startPrice
      const minIncrement = getMinIncrement(currentPrice)
      const minimumBid =
        item.bid_count === 0
          ? startPrice
          : currentPrice + minIncrement

      if (amount < minimumBid) {
        throw {
          status: 400,
          message: `Minimum bid: €${minimumBid.toFixed(2)}`,
          minimum_bid: minimumBid,
        }
      }

      // Find existing winning bid (for proxy bidding logic) — locked to prevent race conditions
      const existingWinning = await trx("bid")
        .where({ block_item_id: itemId, is_winning: true })
        .forUpdate()
        .first()

      const now = new Date()

      // Prevent self-outbid (same user can't outbid themselves)
      if (existingWinning && existingWinning.user_id === customerId) {
        if (max_amount && max_amount > (parseFloat(existingWinning.max_amount) || 0)) {
          await trx("bid")
            .where("id", existingWinning.id)
            .update({ max_amount, updated_at: now })
          return {
            status: 200,
            bid_id: existingWinning.id,
            amount: parseFloat(existingWinning.amount),
            current_price: currentPrice,
            message: "Maximum bid updated",
          }
        }
        throw {
          status: 400,
          message: "You are already the highest bidder",
        }
      }

      // Proxy bidding: check if existing winning bid auto-outbids
      if (existingWinning?.max_amount) {
        const existingMax = parseFloat(existingWinning.max_amount)
        const bidAmount = max_amount || amount

        if (bidAmount <= existingMax) {
          const autoResponse = Math.min(
            existingMax,
            amount + getMinIncrement(amount)
          )

          // Update existing bid's visible amount
          await trx("bid")
            .where("id", existingWinning.id)
            .update({ amount: autoResponse, updated_at: now })

          // Create the losing bid
          const newBid = await insertBid(trx, {
            block_item_id: itemId,
            user_id: customerId,
            amount,
            max_amount: max_amount || null,
            is_winning: false,
            is_outbid: true,
          })

          // Update item price
          await trx("block_item")
            .where("id", itemId)
            .update({
              current_price: autoResponse,
              bid_count: (item.bid_count || 0) + 1,
              updated_at: now,
            })

          const _extension1 = await checkAutoExtension(trx, block, item, now)

          return {
            status: 200,
            bid_id: newBid.id,
            amount,
            outbid: true,
            current_price: autoResponse,
            message: "Outbid — a proxy bid was higher",
            _outbid_user: customerId,
            _outbid_amount: amount,
            _current_bid: autoResponse,
            _extension: _extension1,
          }
        }
      }

      // New bid wins
      const outbidUserId = existingWinning?.user_id
      const outbidAmount = existingWinning ? parseFloat(existingWinning.amount) : null

      if (existingWinning) {
        await trx("bid")
          .where("id", existingWinning.id)
          .update({ is_winning: false, is_outbid: true, updated_at: now })
      }

      // If new bidder has max_amount and beats existing proxy, only bid minimum needed
      let finalAmount = amount
      if (max_amount && existingWinning?.max_amount) {
        const existingMax = parseFloat(existingWinning.max_amount)
        const minToWin = existingMax + getMinIncrement(existingMax)
        finalAmount = Math.max(minimumBid, Math.min(max_amount, minToWin))
      }

      // Create winning bid
      const newBid = await insertBid(trx, {
        block_item_id: itemId,
        user_id: customerId,
        amount: finalAmount,
        max_amount: max_amount || null,
        is_winning: true,
        is_outbid: false,
      })

      // Update item
      await trx("block_item")
        .where("id", itemId)
        .update({
          current_price: finalAmount,
          bid_count: (item.bid_count || 0) + 1,
          updated_at: now,
        })

      const _extension2 = await checkAutoExtension(trx, block, item, now)

      return {
        status: 201,
        bid_id: newBid.id,
        amount: finalAmount,
        outbid: false,
        current_price: finalAmount,
        _outbid_user: outbidUserId || null,
        _outbid_amount: outbidAmount,
        _current_bid: finalAmount,
        _extension: _extension2,
      }
    })

    // Send outbid email AFTER transaction commits (async, non-blocking)
    if (result._outbid_user) {
      sendOutbidEmail(
        pgConnection,
        result._outbid_user,
        itemId,
        result._outbid_amount!,
        result._current_bid!
      ).catch((err) =>
        console.error("[bid/outbid-email] Failed to send outbid email:", err instanceof Error ? err.message : err)
      )
    }

    // Broadcast lot extension to storefront via Supabase Realtime (async, non-blocking)
    if (result._extension) {
      const ext = result._extension
      const supabaseAdmin = getSupabaseAdminClient()
      if (supabaseAdmin) {
        supabaseAdmin
          .channel(`lot-${ext.item_id}`)
          .send({
            type: "broadcast",
            event: "lot_extended",
            payload: {
              item_id: ext.item_id,
              new_end_time: ext.new_end_time,
              extension_count: ext.extension_count,
            },
          })
          .catch((err) =>
            console.error("[bid/lot-extension] Supabase Realtime broadcast failed:", err instanceof Error ? err.message : err)
          )
      }
    }

    // Sync bid to Brevo CRM (async, non-blocking)
    crmSyncBidPlaced(pgConnection, customerId, result.amount).catch((err) =>
      console.error("[bid/crm-sync] CRM sync failed:", err instanceof Error ? err.message : err)
    )

    // Fetch item reserve status for response (re-read after transaction)
    const updatedItem = await pgConnection("block_item")
      .where("id", itemId)
      .select("reserve_price", "current_price", "start_price")
      .first()
    const reserveMet: boolean | null = updatedItem?.reserve_price
      ? parseFloat(updatedItem.current_price ?? updatedItem.start_price) >= parseFloat(updatedItem.reserve_price)
      : null

    // Strip internal fields before sending response
    const { _outbid_user, _outbid_amount, _current_bid, _extension, ...response } = result
    const httpStatus = response.status || 201
    res.status(httpStatus).json({ ...response, reserve_met: reserveMet })
  } catch (err: any) {
    const status = err.status || 500
    const message = err.message || "Unknown error"
    res.status(status).json({ message, minimum_bid: err.minimum_bid })
  }
}

type ExtensionResult = {
  item_id: string
  new_end_time: string
  extension_count: number
} | null

// Check and apply auto-extension if bid is within the extension window.
// Returns extension info if an extension was applied, null otherwise.
async function checkAutoExtension(
  trx: Knex.Transaction,
  block: any,
  item: any,
  now: Date
): Promise<ExtensionResult> {
  // Default auto_extend to true if not explicitly set to false
  if (block.auto_extend === false || !item.lot_end_time) return null

  const extensionMs = (block.extension_minutes || 3) * 60 * 1000
  const maxExtensions = block.max_extensions ?? 10
  const currentExtensions = item.extension_count || 0

  if (currentExtensions >= maxExtensions) return null

  const endTime = new Date(item.lot_end_time)
  const timeUntilEnd = endTime.getTime() - now.getTime()

  if (timeUntilEnd > 0 && timeUntilEnd < extensionMs) {
    const newEndTime = new Date(endTime.getTime() + extensionMs)
    const newExtensionCount = currentExtensions + 1
    await trx("block_item")
      .where("id", item.id)
      .update({ lot_end_time: newEndTime, extension_count: newExtensionCount, updated_at: now })
    console.log(`[anti-snipe] Lot #${item.lot_number} extended to ${newEndTime.toISOString()} (extension ${newExtensionCount}/${maxExtensions})`)
    return { item_id: item.id, new_end_time: newEndTime.toISOString(), extension_count: newExtensionCount }
  }

  return null
}
