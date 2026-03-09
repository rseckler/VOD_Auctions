import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /store/account/orders — My past orders (grouped by order_group_id)
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
    // Fetch all paid transactions for this user
    const transactions = await pgConnection("transaction")
      .select(
        "transaction.*",
        pgConnection.raw(
          "COALESCE(block_item.release_id, transaction.release_id) as resolved_release_id"
        ),
        "block_item.lot_number",
        "auction_block.title as block_title",
        "auction_block.slug as block_slug",
        "shipping_method.tracking_url_pattern"
      )
      .leftJoin("block_item", "block_item.id", "transaction.block_item_id")
      .leftJoin(
        "auction_block",
        "auction_block.id",
        "block_item.auction_block_id"
      )
      .leftJoin("shipping_method", "shipping_method.id", "transaction.shipping_method_id")
      .where("transaction.user_id", customerId)
      .where("transaction.status", "paid")
      .orderBy("transaction.paid_at", "desc")

    if (transactions.length === 0) {
      res.json({ orders: [], count: 0 })
      return
    }

    // Enrich with Release data (title, artist, cover)
    const releaseIds = [
      ...new Set(
        transactions
          .map((t: any) => t.resolved_release_id)
          .filter(Boolean)
      ),
    ]
    const releaseMap = new Map()

    if (releaseIds.length > 0) {
      const releases = await pgConnection("Release")
        .select(
          "Release.id",
          "Release.title",
          "Release.coverImage",
          "Release.article_number",
          "Artist.name as artist_name"
        )
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .whereIn("Release.id", releaseIds)

      for (const r of releases) {
        releaseMap.set(r.id, r)
      }
    }

    // Group transactions by order_group_id
    const orderMap = new Map<string, any>()

    for (const tx of transactions) {
      // Use order_group_id if available, otherwise transaction id as single-item order
      const groupKey = tx.order_group_id || tx.id
      const rel = releaseMap.get(tx.resolved_release_id)

      const item = {
        transaction_id: tx.id,
        item_type: tx.item_type || "auction",
        amount: parseFloat(tx.amount),
        shipping_cost: parseFloat(tx.shipping_cost || "0"),
        title: rel?.title || null,
        artist_name: rel?.artist_name || null,
        cover_image: rel?.coverImage || null,
        article_number: rel?.article_number || null,
        block_title: tx.block_title || null,
        lot_number: tx.lot_number || null,
      }

      if (orderMap.has(groupKey)) {
        const order = orderMap.get(groupKey)
        order.items.push(item)
        order.subtotal += item.amount
        order.shipping_cost += item.shipping_cost
        order.total += parseFloat(tx.total_amount || "0")
        // Aggregate shipping status: worst status wins
        if (tx.shipping_status === "pending") order.shipping_status = "pending"
        else if (
          tx.shipping_status === "shipped" &&
          order.shipping_status !== "pending"
        )
          order.shipping_status = "shipped"
        // Update tracking if available
        if (tx.tracking_number) {
          order.tracking_number = tx.tracking_number
          order.carrier = tx.carrier
          if (tx.tracking_url_pattern) order.tracking_url_pattern = tx.tracking_url_pattern
        }
      } else {
        orderMap.set(groupKey, {
          order_group_id: groupKey,
          order_date: tx.paid_at || tx.created_at,
          items: [item],
          subtotal: item.amount,
          shipping_cost: item.shipping_cost,
          total: parseFloat(tx.total_amount || "0"),
          shipping_status: tx.shipping_status || "pending",
          tracking_number: tx.tracking_number || null,
          carrier: tx.carrier || null,
          shipping_country: tx.shipping_country || null,
          tracking_url_pattern: tx.tracking_url_pattern || null,
        })
      }
    }

    const orders = Array.from(orderMap.values()).map((order) => ({
      ...order,
      items_count: order.items.length,
      subtotal: Math.round(order.subtotal * 100) / 100,
      shipping_cost: Math.round(order.shipping_cost * 100) / 100,
      total: Math.round(order.total * 100) / 100,
    }))

    res.json({ orders, count: orders.length })
  } catch (error: any) {
    console.error("[orders] Error:", error)
    res.status(500).json({ message: "Failed to fetch orders" })
  }
}
