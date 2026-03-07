import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateEntityId,
} from "@medusajs/framework/utils"
import { Knex } from "knex"
import AuctionModuleService from "../../../../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../../../../modules/auction"
import { sendOutbidEmail } from "../../../../../../../lib/email-helpers"
import { crmSyncBidPlaced } from "../../../../../../../lib/crm-sync"

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

  // Anonymize for public view
  const anonymized = bids.map((bid: any) => ({
    id: bid.id,
    amount: parseFloat(bid.amount),
    is_winning: bid.is_winning,
    user_hint: bid.user_id.substring(0, 8) + "…",
    created_at: bid.created_at,
  }))

  res.json({ bids: anonymized, count: bids.length })
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

      // Calculate minimum bid
      const currentPrice = parseFloat(item.current_price || item.start_price)
      const minIncrement = Math.max(1, currentPrice * 0.05)
      const minimumBid =
        item.bid_count === 0
          ? parseFloat(item.start_price)
          : currentPrice + minIncrement

      if (amount < minimumBid) {
        throw {
          status: 400,
          message: `Minimum bid: €${minimumBid.toFixed(2)}`,
          minimum_bid: minimumBid,
        }
      }

      // Find existing winning bid (for proxy bidding logic)
      const existingWinning = await trx("bid")
        .where({ block_item_id: itemId, is_winning: true })
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
            amount + Math.max(1, amount * 0.05)
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

          await checkAutoExtension(trx, block, item, now)

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
        const minToWin = existingMax + Math.max(1, existingMax * 0.05)
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

      await checkAutoExtension(trx, block, item, now)

      return {
        status: 201,
        bid_id: newBid.id,
        amount: finalAmount,
        outbid: false,
        current_price: finalAmount,
        _outbid_user: outbidUserId || null,
        _outbid_amount: outbidAmount,
        _current_bid: finalAmount,
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
      ).catch(() => {})
    }

    // Sync bid to Brevo CRM (async, non-blocking)
    crmSyncBidPlaced(pgConnection, customerId, result.amount).catch(() => {})

    // Strip internal fields before sending response
    const { _outbid_user, _outbid_amount, _current_bid, ...response } = result
    const httpStatus = response.status || 201
    res.status(httpStatus).json(response)
  } catch (err: any) {
    const status = err.status || 500
    const message = err.message || "Unknown error"
    res.status(status).json({ message, minimum_bid: err.minimum_bid })
  }
}

// Check and apply auto-extension if bid is within the extension window
async function checkAutoExtension(
  trx: Knex.Transaction,
  block: any,
  item: any,
  now: Date
) {
  if (!block.auto_extend || !item.lot_end_time) return

  const endTime = new Date(item.lot_end_time)
  const extensionMs = (block.extension_minutes || 5) * 60 * 1000
  const timeUntilEnd = endTime.getTime() - now.getTime()

  if (timeUntilEnd > 0 && timeUntilEnd < extensionMs) {
    const newEndTime = new Date(endTime.getTime() + extensionMs)
    await trx("block_item")
      .where("id", item.id)
      .update({ lot_end_time: newEndTime, updated_at: now })
  }
}
