import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  listContacts,
  getListContactCount,
  getCampaigns,
  isBrevoConfigured,
  BREVO_LIST_VOD_AUCTIONS,
  BREVO_LIST_TAPE_MAG,
  BrevoContact,
} from "../../../lib/brevo"

// GET /admin/customers — CRM Dashboard data
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
    // Fetch all data in parallel
    const [
      vodCount,
      tapeMagCount,
      vodContacts,
      tapeMagContacts,
      sentCampaigns,
      customerCount,
      recentCustomers,
    ] = await Promise.all([
      BREVO_LIST_VOD_AUCTIONS
        ? getListContactCount(BREVO_LIST_VOD_AUCTIONS).catch(() => 0)
        : Promise.resolve(0),
      BREVO_LIST_TAPE_MAG
        ? getListContactCount(BREVO_LIST_TAPE_MAG).catch(() => 0)
        : Promise.resolve(0),
      BREVO_LIST_VOD_AUCTIONS
        ? listContacts({ listId: BREVO_LIST_VOD_AUCTIONS, limit: 50, sort: "desc" }).catch(() => ({
            contacts: [],
            count: 0,
          }))
        : Promise.resolve({ contacts: [] as BrevoContact[], count: 0 }),
      BREVO_LIST_TAPE_MAG
        ? listContacts({ listId: BREVO_LIST_TAPE_MAG, limit: 50, sort: "desc" }).catch(() => ({
            contacts: [],
            count: 0,
          }))
        : Promise.resolve({ contacts: [] as BrevoContact[], count: 0 }),
      getCampaigns({ limit: 10, status: "sent" }).catch(() => ({
        campaigns: [],
        count: 0,
      })),
      pgConnection("customer")
        .whereNull("deleted_at")
        .count("id as total")
        .first(),
      pgConnection("customer")
        .select("id", "email", "first_name", "last_name", "created_at")
        .whereNull("deleted_at")
        .orderBy("created_at", "desc")
        .limit(10),
    ])

    // Combine all contacts for segment analysis
    const allContacts = [...vodContacts.contacts, ...tapeMagContacts.contacts]
    // Deduplicate by email
    const seen = new Set<string>()
    const uniqueContacts = allContacts.filter((c) => {
      if (seen.has(c.email)) return false
      seen.add(c.email)
      return true
    })

    // Count by segment
    const segments: Record<string, number> = {}
    let newsletterOptins = 0
    for (const c of uniqueContacts) {
      const seg = c.attributes?.CUSTOMER_SEGMENT || "unknown"
      segments[seg] = (segments[seg] || 0) + 1
      if (c.attributes?.NEWSLETTER_OPTIN === true) {
        newsletterOptins++
      }
    }

    // Top customers by TOTAL_SPENT
    const topCustomers = uniqueContacts
      .filter((c) => c.attributes?.TOTAL_SPENT > 0)
      .sort(
        (a, b) =>
          (Number(b.attributes?.TOTAL_SPENT) || 0) -
          (Number(a.attributes?.TOTAL_SPENT) || 0)
      )
      .slice(0, 10)
      .map((c) => ({
        email: c.email,
        name:
          [c.attributes?.FIRSTNAME, c.attributes?.LASTNAME]
            .filter(Boolean)
            .join(" ") || c.email,
        platform: c.attributes?.PLATFORM_ORIGIN || "unknown",
        segment: c.attributes?.CUSTOMER_SEGMENT || "unknown",
        total_spent: Number(c.attributes?.TOTAL_SPENT) || 0,
        total_purchases: Number(c.attributes?.TOTAL_PURCHASES) || 0,
        total_bids: Number(c.attributes?.TOTAL_BIDS_PLACED) || 0,
        total_wins: Number(c.attributes?.TOTAL_AUCTIONS_WON) || 0,
      }))

    // Recent registrations (from Brevo contacts, newest first)
    const recentContacts = uniqueContacts
      .slice(0, 10)
      .map((c) => ({
        email: c.email,
        name:
          [c.attributes?.FIRSTNAME, c.attributes?.LASTNAME]
            .filter(Boolean)
            .join(" ") || c.email,
        platform: c.attributes?.PLATFORM_ORIGIN || "unknown",
        segment: c.attributes?.CUSTOMER_SEGMENT || "unknown",
        newsletter: c.attributes?.NEWSLETTER_OPTIN === true,
      }))

    // Campaign performance
    const campaigns = (sentCampaigns.campaigns || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      subject: c.subject,
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
    }))

    res.json({
      configured: true,
      overview: {
        total_contacts: vodCount + tapeMagCount,
        vod_auctions: vodCount,
        tape_mag: tapeMagCount,
        newsletter_optins: newsletterOptins,
        medusa_customers: Number(customerCount?.total || 0),
      },
      segments,
      top_customers: topCustomers,
      recent_contacts: recentContacts,
      recent_medusa_customers: recentCustomers,
      campaigns,
      total_campaigns: sentCampaigns.count,
    })
  } catch (err: any) {
    console.error("[admin/customers] Error:", err.message)
    res.status(500).json({ message: "Failed to fetch CRM data" })
  }
}
