import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  getListContactCount,
  getCampaigns,
  isBrevoConfigured,
  BREVO_LIST_VOD_AUCTIONS,
  BREVO_LIST_TAPE_MAG,
} from "../../../../lib/brevo"

// GET /admin/newsletter/stats — Detailed subscriber + campaign stats
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!isBrevoConfigured()) {
    res.json({ configured: false })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const [
      vodCount,
      tapeMagCount,
      sentCampaigns,
      customerCount,
    ] = await Promise.all([
      BREVO_LIST_VOD_AUCTIONS
        ? getListContactCount(BREVO_LIST_VOD_AUCTIONS).catch(() => 0)
        : Promise.resolve(0),
      BREVO_LIST_TAPE_MAG
        ? getListContactCount(BREVO_LIST_TAPE_MAG).catch(() => 0)
        : Promise.resolve(0),
      getCampaigns({ limit: 50, status: "sent" }).catch(() => ({
        campaigns: [],
        count: 0,
      })),
      pgConnection("customer")
        .whereNull("deleted_at")
        .count("id as total")
        .first(),
    ])

    // Aggregate campaign performance
    const campaigns = sentCampaigns.campaigns || []
    const totalSent = campaigns.reduce(
      (sum: number, c: any) =>
        sum + (c.statistics?.globalStats?.sent || 0),
      0
    )
    const totalOpens = campaigns.reduce(
      (sum: number, c: any) =>
        sum + (c.statistics?.globalStats?.uniqueOpens || 0),
      0
    )
    const totalClicks = campaigns.reduce(
      (sum: number, c: any) =>
        sum + (c.statistics?.globalStats?.uniqueClicks || 0),
      0
    )

    res.json({
      configured: true,
      subscribers: {
        vod_auctions: vodCount,
        tape_mag: tapeMagCount,
        total: vodCount + tapeMagCount,
      },
      medusa_customers: Number(customerCount?.total || 0),
      campaigns: {
        total: sentCampaigns.count,
        total_sent: totalSent,
        total_opens: totalOpens,
        total_clicks: totalClicks,
        avg_open_rate:
          totalSent > 0
            ? ((totalOpens / totalSent) * 100).toFixed(1)
            : "0",
        avg_click_rate:
          totalSent > 0
            ? ((totalClicks / totalSent) * 100).toFixed(1)
            : "0",
      },
    })
  } catch (err: any) {
    console.error("[newsletter/stats] Error:", err.message)
    res.status(500).json({ message: "Failed to fetch stats" })
  }
}
