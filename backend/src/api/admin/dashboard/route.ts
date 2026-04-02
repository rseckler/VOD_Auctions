import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { getSiteConfig } from "../../../lib/site-config"

/**
 * GET /admin/dashboard
 * Aggregated dashboard data — adapts to platform_mode.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const config = await getSiteConfig(pg)
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)

  // ── Catalog stats ────────────────────────────────────────────────────────
  const catalogStats = await pg("Release")
    .select(
      pg.raw("COUNT(*) as total"),
      pg.raw("COUNT(*) FILTER (WHERE \"legacy_price\" > 0 AND \"legacy_available\" = true) as for_sale"),
      pg.raw("COUNT(*) FILTER (WHERE \"coverImage\" IS NOT NULL) as with_cover"),
      pg.raw("COUNT(*) FILTER (WHERE product_category = 'release') as releases"),
      pg.raw("COUNT(*) FILTER (WHERE product_category = 'band_literature') as band_lit"),
      pg.raw("COUNT(*) FILTER (WHERE product_category = 'label_literature') as label_lit"),
      pg.raw("COUNT(*) FILTER (WHERE product_category = 'press_literature') as press_lit")
    )
    .first()

  const total = Number(catalogStats?.total || 0)
  const withCover = Number(catalogStats?.with_cover || 0)
  const coverPct = total > 0 ? Math.round((withCover / total) * 1000) / 10 : 0

  // ── Auction stats ────────────────────────────────────────────────────────
  const activeBlocks = await pg("auction_block")
    .where("status", "active")
    .whereNull("deleted_at")
    .select("id", "title", "slug", "block_type", "end_time", "start_time")

  const blockIds = activeBlocks.map((b: any) => b.id)
  let activeBidCount = 0
  let activeItemCount = 0
  let topBidAmount = 0

  if (blockIds.length > 0) {
    const itemStats = await pg("block_item")
      .whereIn("auction_block_id", blockIds)
      .whereNull("deleted_at")
      .select(
        pg.raw("COUNT(*) as item_count"),
        pg.raw("COALESCE(SUM(bid_count), 0) as total_bids"),
        pg.raw("COALESCE(MAX(current_price::numeric), 0) as top_bid")
      )
      .first()
    activeItemCount = Number(itemStats?.item_count || 0)
    activeBidCount = Number(itemStats?.total_bids || 0)
    topBidAmount = Number(itemStats?.top_bid || 0)
  }

  // ── Transaction stats (this week) ────────────────────────────────────────
  const weeklyStats = await pg("transaction")
    .where("created_at", ">=", weekAgo)
    .whereNull("deleted_at")
    .select(
      pg.raw("COUNT(*) FILTER (WHERE status = 'paid') as paid_orders"),
      pg.raw("COALESCE(SUM(total_amount::numeric) FILTER (WHERE status = 'paid'), 0) as revenue"),
      pg.raw("COUNT(*) FILTER (WHERE fulfillment_status = 'shipped') as shipped"),
      pg.raw("COUNT(*) FILTER (WHERE status = 'pending') as pending_payment")
    )
    .first()

  // ── Overdue payments (pending > 3 days) ──────────────────────────────────
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000)
  const [{ count: overdueCount }] = await pg("transaction")
    .where("status", "pending")
    .where("item_type", "auction")
    .where("created_at", "<", threeDaysAgo)
    .whereNull("deleted_at")
    .count("* as count")

  // ── Bids today ───────────────────────────────────────────────────────────
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const [{ count: bidsToday }] = await pg("bid")
    .where("created_at", ">=", todayStart)
    .count("* as count")

  // ── Waitlist stats ───────────────────────────────────────────────────────
  const waitlistStats = await pg("waitlist_applications")
    .select("status")
    .count("* as count")
    .groupBy("status")
  const wl: Record<string, number> = {}
  for (const s of waitlistStats) wl[s.status] = Number(s.count)

  // ── New users this week ──────────────────────────────────────────────────
  const [{ count: newUsersWeek }] = await pg("customer")
    .where("created_at", ">=", weekAgo)
    .count("* as count")

  // ── Ready to pack ────────────────────────────────────────────────────────
  const [{ count: readyToPack }] = await pg("transaction")
    .where("status", "paid")
    .where("fulfillment_status", "unfulfilled")
    .whereNull("deleted_at")
    .count("* as count")

  // ── Labels pending ───────────────────────────────────────────────────────
  const [{ count: labelsPending }] = await pg("transaction")
    .where("status", "paid")
    .where("fulfillment_status", "packing")
    .whereNull("label_printed_at")
    .whereNull("deleted_at")
    .count("* as count")

  // ── Launch readiness checks (for beta_test mode) ─────────────────────────
  let launchReadiness: { checks: Array<{ label: string; ok: boolean; detail: string }>; progress_pct: number } | null = null

  if (config.platform_mode === "beta_test") {
    const checks: Array<{ label: string; ok: boolean; detail: string }> = []

    // Shipping
    const [{ count: shippingCount }] = await pg("shipping_method").count("* as count")
    checks.push({ label: "Shipping rates configured", ok: Number(shippingCount) > 0, detail: `${shippingCount} method(s)` })

    // Stripe
    const stripeOk = !!process.env.STRIPE_WEBHOOK_SECRET
    checks.push({ label: "Stripe webhook configured", ok: stripeOk, detail: stripeOk ? "Active" : "Not set" })

    // PayPal
    const paypalOk = process.env.PAYPAL_MODE === "live"
    checks.push({ label: "PayPal (Live Mode)", ok: paypalOk, detail: paypalOk ? "Live" : `${process.env.PAYPAL_MODE || "not set"}` })

    // Legal pages — exist as hardcoded storefront routes (/agb, /impressum, /datenschutz)
    checks.push({ label: "Legal pages (AGB/Impressum/Datenschutz)", ok: true, detail: "3/3 — hardcoded storefront routes" })

    // Active auction
    checks.push({ label: "Active auction block", ok: activeBlocks.length > 0, detail: activeBlocks.length > 0 ? `${activeBlocks.length} active` : "None" })

    // Pre-launch waitlist
    checks.push({ label: "Pre-launch waitlist activated", ok: config.platform_mode !== "beta_test" || config.invite_mode_active, detail: config.invite_mode_active ? "Ready" : "Not activated" })

    const passed = checks.filter((c) => c.ok).length
    launchReadiness = { checks, progress_pct: Math.round((passed / checks.length) * 100) }
  }

  // ── Actions required ─────────────────────────────────────────────────────
  const actions: Array<{ type: string; message: string; link?: string }> = []

  if (Number(overdueCount) > 0) {
    actions.push({ type: "error", message: `${overdueCount} overdue payment(s) (> 3 days)`, link: "/app/transactions?status=pending" })
  }

  const noPrice = Number(catalogStats?.total || 0) - Number(catalogStats?.for_sale || 0)
  if (noPrice > 1000) {
    actions.push({ type: "warning", message: `${noPrice.toLocaleString()} releases without price — cannot be sold`, link: "/app/catalog" })
  }

  if (Number(readyToPack) > 0) {
    actions.push({ type: "info", message: `${readyToPack} order(s) ready to pack`, link: "/app/transactions?fulfillment=unfulfilled" })
  }

  // ── Recent activity (last 10 events) ─────────────────────────────────────
  const recentBids = await pg("bid")
    .join("block_item", "bid.block_item_id", "block_item.id")
    .join("customer", "bid.user_id", "customer.id")
    .orderBy("bid.created_at", "desc")
    .limit(5)
    .select(
      "bid.created_at",
      "bid.amount",
      "block_item.lot_number",
      "customer.email as customer_email",
      "customer.first_name"
    )

  const recentOrders = await pg("transaction")
    .where("status", "paid")
    .orderBy("paid_at", "desc")
    .limit(5)
    .select("order_number", "total_amount", "paid_at", "payment_provider")

  const activity: Array<{ type: string; message: string; time: string }> = []

  for (const b of recentBids) {
    const name = b.first_name || b.customer_email?.split("@")[0] || "Someone"
    activity.push({
      type: "bid",
      message: `${name} bid €${Number(b.amount).toFixed(2)} on Lot #${b.lot_number}`,
      time: b.created_at,
    })
  }
  for (const o of recentOrders) {
    activity.push({
      type: "order",
      message: `${o.order_number || "Order"} paid €${Number(o.total_amount).toFixed(2)} via ${o.payment_provider}`,
      time: o.paid_at,
    })
  }

  // Sort by time descending, limit to 10
  activity.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  activity.splice(10)

  // ── Discogs sync info ────────────────────────────────────────────────────
  // Check sync log file mtime instead of DB (sync only logs changes, not runs)
  let lastSyncTime: string | null = null
  try {
    const fs = await import("fs")
    const stat = fs.statSync("/root/VOD_Auctions/scripts/legacy_sync.log")
    lastSyncTime = new Date(stat.mtime).toISOString()
  } catch {
    // Dev environment or file not found
  }

  // ── Auction block details for "Live Now" ─────────────────────────────────
  const liveBlocks = activeBlocks.map((b: any) => ({
    id: b.id,
    title: b.title,
    slug: b.slug,
    type: b.block_type,
    ends_at: b.end_time,
    item_count: activeItemCount,
    bid_count: activeBidCount,
    top_bid: topBidAmount,
  }))

  // ── Response ─────────────────────────────────────────────────────────────
  res.json({
    platform_mode: config.platform_mode,
    stats: {
      catalog_total: Number(catalogStats?.total || 0),
      for_sale: Number(catalogStats?.for_sale || 0),
      cover_pct: coverPct,
      releases: Number(catalogStats?.releases || 0),
      band_lit: Number(catalogStats?.band_lit || 0),
      label_lit: Number(catalogStats?.label_lit || 0),
      press_lit: Number(catalogStats?.press_lit || 0),
      active_auctions: activeBlocks.length,
      active_items: activeItemCount,
      active_bids: activeBidCount,
      top_bid: topBidAmount,
      bids_today: Number(bidsToday),
      overdue_payments: Number(overdueCount),
      ready_to_pack: Number(readyToPack),
      labels_pending: Number(labelsPending),
      new_users_week: Number(newUsersWeek),
      waitlist: wl,
    },
    weekly: {
      revenue: Number(weeklyStats?.revenue || 0),
      orders: Number(weeklyStats?.paid_orders || 0),
      shipped: Number(weeklyStats?.shipped || 0),
      pending: Number(weeklyStats?.pending_payment || 0),
    },
    launch_readiness: launchReadiness,
    actions,
    activity,
    auctions: liveBlocks,
    last_sync: lastSyncTime,
  })
}
