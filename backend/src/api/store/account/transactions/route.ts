import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/account/transactions — My transactions
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const transactions = await pgConnection("transaction")
      .select(
        "transaction.*",
        pgConnection.raw("COALESCE(block_item.release_id, transaction.release_id) as release_id"),
        "block_item.lot_number",
        "auction_block.title as block_title",
        "auction_block.slug as block_slug"
      )
      .leftJoin("block_item", "block_item.id", "transaction.block_item_id")
      .leftJoin("auction_block", "auction_block.id", "block_item.auction_block_id")
      .where("transaction.user_id", customerId)
      .orderBy("transaction.created_at", "desc")

    // Enrich with Release data
    const releaseIds = [...new Set(transactions.map((t: any) => t.release_id).filter(Boolean))]
    const releaseMap = new Map()

    if (releaseIds.length > 0) {
      const releases = await pgConnection("Release")
        .select("Release.id", "Release.title", "Artist.name as artist_name")
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .whereIn("Release.id", releaseIds)

      for (const r of releases) {
        releaseMap.set(r.id, r)
      }
    }

    const result = transactions.map((t: any) => {
      const rel = releaseMap.get(t.release_id)
      return {
        id: t.id,
        block_item_id: t.block_item_id,
        item_type: t.item_type || "auction",
        order_group_id: t.order_group_id,
        amount: parseFloat(t.amount),
        shipping_cost: parseFloat(t.shipping_cost),
        total_amount: parseFloat(t.total_amount),
        currency: t.currency,
        status: t.status,
        shipping_status: t.shipping_status,
        paid_at: t.paid_at,
        shipped_at: t.shipped_at,
        delivered_at: t.delivered_at,
        created_at: t.created_at,
        release_title: rel?.title || null,
        release_artist: rel?.artist_name || null,
        block_title: t.block_title || null,
        block_slug: t.block_slug || null,
        lot_number: t.lot_number || null,
      }
    })

    res.json({ transactions: result })
  } catch (error: any) {
    console.error("[transactions] Error:", error)
    res.status(500).json({ message: "Failed to fetch transactions" })
  }
}
