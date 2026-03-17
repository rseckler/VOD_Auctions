import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/transactions — All transactions (admin)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const { status, shipping_status } = req.query as {
      status?: string
      shipping_status?: string
    }

    let query = pgConnection("transaction")
      .select(
        "transaction.*",
        pgConnection.raw("COALESCE(block_item.release_id, transaction.release_id) as release_id"),
        "block_item.lot_number",
        "auction_block.title as block_title",
        "auction_block.slug as block_slug"
      )
      .leftJoin("block_item", "block_item.id", "transaction.block_item_id")
      .leftJoin("auction_block", "auction_block.id", "block_item.auction_block_id")
      .orderBy("transaction.created_at", "desc")

    if (status) query = query.where("transaction.status", status)
    if (shipping_status) query = query.where("transaction.shipping_status", shipping_status)

    const transactions = await query

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
        ...t,
        amount: parseFloat(t.amount),
        shipping_cost: parseFloat(t.shipping_cost),
        total_amount: parseFloat(t.total_amount),
        release_title: rel?.title || null,
        release_artist: rel?.artist_name || null,
      }
    })

    res.json({ transactions: result, count: result.length })
  } catch (error: any) {
    console.error("[admin/transactions] Error:", error)
    res.status(500).json({ message: "Failed to fetch transactions" })
  }
}
