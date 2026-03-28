import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/auction-blocks/:id/analytics
// Post-auction performance analytics for a single block
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  // Fetch block
  const block = await pgConnection("auction_block").where("id", id).first()
  if (!block) {
    res.status(404).json({ message: "Block not found" })
    return
  }

  // Fetch all items for this block
  const items = await pgConnection("block_item")
    .where("auction_block_id", id)
    .orderBy("lot_number", "asc")

  if (items.length === 0) {
    res.json({
      block_id: id,
      block_title: block.title,
      block_status: block.status,
      total_lots: 0,
      lots_with_bids: 0,
      lots_sold: 0,
      lots_unsold: 0,
      conversion_rate: 0,
      total_bids: 0,
      total_revenue: 0,
      avg_hammer_price: 0,
      avg_start_price: 0,
      avg_price_multiple: 0,
      top_lots: [],
      no_bid_lots: [],
      bid_distribution: { "1": 0, "2-5": 0, "6-10": 0, "10+": 0 },
    })
    return
  }

  const itemIds = items.map((i: any) => i.id)
  const releaseIds = [...new Set(items.map((i: any) => i.release_id).filter(Boolean))] as string[]

  // Batch fetch releases
  const releases = await pgConnection("Release")
    .whereIn("id", releaseIds)
    .select("id", "title", "coverImage")
  const releaseMap: Record<string, { title: string; coverImage: string | null }> = {}
  releases.forEach((r: any) => {
    releaseMap[r.id] = { title: r.title, coverImage: r.coverImage }
  })

  // Batch fetch winning bids (is_winning = true, one per item)
  const winningBids = await pgConnection("bid")
    .whereIn("block_item_id", itemIds)
    .where("is_winning", true)
    .select("id", "block_item_id", "user_id", "amount")

  const winningBidMap: Record<string, { user_id: string; amount: number }> = {}
  winningBids.forEach((b: any) => {
    winningBidMap[b.block_item_id] = {
      user_id: b.user_id,
      amount: parseFloat(b.amount),
    }
  })

  // Batch fetch customers for winning bidders
  const winnerUserIds = [...new Set(winningBids.map((b: any) => b.user_id).filter(Boolean))] as string[]
  const customerMap: Record<string, string> = {}
  if (winnerUserIds.length > 0) {
    const customers = await pgConnection("customer")
      .whereIn("id", winnerUserIds)
      .select("id", "first_name", "last_name", "email")
    customers.forEach((c: any) => {
      customerMap[c.id] =
        [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Bidder"
    })
  }

  // Compute per-lot stats
  const soldItems: any[] = []
  const noBidItems: any[] = []
  let totalBids = 0

  const bidDist: Record<string, number> = { "1": 0, "2-5": 0, "6-10": 0, "10+": 0 }

  for (const item of items) {
    const bidCount: number = item.bid_count || 0
    totalBids += bidCount

    const release = releaseMap[item.release_id] || null
    const startPrice = parseFloat(item.start_price) || 0
    const currentPrice = parseFloat(item.current_price) || startPrice
    const winning = winningBidMap[item.id] || null

    // Bid distribution
    if (bidCount === 1) bidDist["1"]++
    else if (bidCount >= 2 && bidCount <= 5) bidDist["2-5"]++
    else if (bidCount >= 6 && bidCount <= 10) bidDist["6-10"]++
    else if (bidCount > 10) bidDist["10+"]++

    if (item.status === "sold") {
      const priceMultiple = startPrice > 0 ? currentPrice / startPrice : 1
      soldItems.push({
        item,
        release,
        startPrice,
        hammerPrice: currentPrice,
        priceMultiple,
        bidCount,
        winnerHint: winning ? (customerMap[winning.user_id] || "Bidder") : null,
      })
    }

    if (bidCount === 0) {
      noBidItems.push({
        lot_number: item.lot_number,
        release_title: release?.title || item.release_id,
        release_cover: release?.coverImage || null,
        start_price: startPrice,
      })
    }
  }

  const total_lots = items.length
  const lots_with_bids = items.filter((i: any) => (i.bid_count || 0) > 0).length
  const lots_sold = soldItems.length
  const lots_unsold = total_lots - lots_sold
  const conversion_rate = total_lots > 0 ? (lots_sold / total_lots) * 100 : 0
  const total_revenue = soldItems.reduce((s, x) => s + x.hammerPrice, 0)

  const avg_hammer_price =
    lots_sold > 0 ? soldItems.reduce((s, x) => s + x.hammerPrice, 0) / lots_sold : 0
  const avg_start_price =
    lots_sold > 0 ? soldItems.reduce((s, x) => s + x.startPrice, 0) / lots_sold : 0
  const avg_price_multiple =
    lots_sold > 0 ? soldItems.reduce((s, x) => s + x.priceMultiple, 0) / lots_sold : 0

  // Top 5 by price multiple
  const top_lots = [...soldItems]
    .sort((a, b) => b.priceMultiple - a.priceMultiple)
    .slice(0, 5)
    .map((x) => ({
      lot_number: x.item.lot_number,
      release_title: x.release?.title || x.item.release_id,
      release_cover: x.release?.coverImage || null,
      start_price: x.startPrice,
      hammer_price: x.hammerPrice,
      price_multiple: Math.round(x.priceMultiple * 100) / 100,
      bid_count: x.bidCount,
      winning_bidder_hint: x.winnerHint,
    }))

  res.json({
    block_id: id,
    block_title: block.title,
    block_status: block.status,
    total_lots,
    lots_with_bids,
    lots_sold,
    lots_unsold,
    conversion_rate: Math.round(conversion_rate * 10) / 10,
    total_bids: totalBids,
    total_revenue: Math.round(total_revenue * 100) / 100,
    avg_hammer_price: Math.round(avg_hammer_price * 100) / 100,
    avg_start_price: Math.round(avg_start_price * 100) / 100,
    avg_price_multiple: Math.round(avg_price_multiple * 100) / 100,
    top_lots,
    no_bid_lots: noBidItems,
    bid_distribution: bidDist,
  })
}
