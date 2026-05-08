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
      masterContactCount,
      newsletterOptInCount,
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
      // Local CRM-Master count (rc53.0+) — replaces "Brevo-only" total_contacts
      pgConnection("crm_master_contact")
        .whereNull("deleted_at")
        .count("id as total")
        .first()
        .catch(() => ({ total: 0 })),
      // Local newsletter opt-in count (rc53.4+) — replaces brittle Brevo-attribute scan
      pgConnection("crm_master_communication_pref")
        .where({ channel: "email_marketing", opted_in: true })
        .count("master_id as total")
        .first()
        .catch(() => ({ total: 0 })),
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

    // Count by segment (Brevo-attribute-based — used for the Customer-Segments-chart)
    const segments: Record<string, number> = {}
    for (const c of uniqueContacts) {
      const seg = c.attributes?.CUSTOMER_SEGMENT || "unknown"
      segments[seg] = (segments[seg] || 0) + 1
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
        // Card 1: full local CRM (replaces Brevo-only sum which was ~3.6k vs 20.8k actual)
        total_contacts: Number(masterContactCount?.total || 0),
        // Cards 2 + 3 keep showing Brevo-list reach — that's the *active newsletter
        // audience*, not total CRM. UI labels make the distinction clear.
        vod_auctions: vodCount,
        tape_mag: tapeMagCount,
        // Card 4: opted-in count from local crm_master_communication_pref
        // (was scanning Brevo NEWSLETTER_OPTIN-attribute which only sees the 50
        // most-recent contacts per list and was returning 0 in production)
        newsletter_optins: Number(newsletterOptInCount?.total || 0),
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
