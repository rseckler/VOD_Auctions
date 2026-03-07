import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  getCampaigns,
  getListContactCount,
  isBrevoConfigured,
  BREVO_LIST_VOD_AUCTIONS,
  BREVO_LIST_TAPE_MAG,
} from "../../../lib/brevo"

// GET /admin/newsletter — Overview: campaigns + subscriber counts
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!isBrevoConfigured()) {
    res.json({
      configured: false,
      campaigns: [],
      lists: [],
    })
    return
  }

  try {
    const [campaignsData, vodCount, tapeMagCount] = await Promise.all([
      getCampaigns({ limit: 20, status: "sent" }).catch(() => ({
        campaigns: [],
        count: 0,
      })),
      BREVO_LIST_VOD_AUCTIONS
        ? getListContactCount(BREVO_LIST_VOD_AUCTIONS).catch(() => 0)
        : Promise.resolve(0),
      BREVO_LIST_TAPE_MAG
        ? getListContactCount(BREVO_LIST_TAPE_MAG).catch(() => 0)
        : Promise.resolve(0),
    ])

    res.json({
      configured: true,
      campaigns: campaignsData.campaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        status: c.status,
        sentDate: c.sentDate,
        stats: c.statistics?.globalStats
          ? {
              sent: c.statistics.globalStats.sent,
              opens: c.statistics.globalStats.uniqueOpens,
              clicks: c.statistics.globalStats.uniqueClicks,
              openRate: c.statistics.globalStats.sent
                ? (
                    (c.statistics.globalStats.uniqueOpens /
                      c.statistics.globalStats.sent) *
                    100
                  ).toFixed(1)
                : "0",
              clickRate: c.statistics.globalStats.sent
                ? (
                    (c.statistics.globalStats.uniqueClicks /
                      c.statistics.globalStats.sent) *
                    100
                  ).toFixed(1)
                : "0",
            }
          : null,
      })),
      totalCampaigns: campaignsData.count,
      lists: [
        {
          id: BREVO_LIST_VOD_AUCTIONS,
          name: "VOD Auctions Customers",
          subscribers: vodCount,
        },
        {
          id: BREVO_LIST_TAPE_MAG,
          name: "TAPE-MAG Customers",
          subscribers: tapeMagCount,
        },
      ],
    })
  } catch (err: any) {
    console.error("[admin/newsletter] Error:", err.message)
    res.status(500).json({ message: "Failed to fetch newsletter data" })
  }
}
