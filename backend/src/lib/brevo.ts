import { blockTeaserEmail } from "../emails/block-teaser"
import { blockTomorrowEmail } from "../emails/block-tomorrow"
import { blockLiveEmail } from "../emails/block-live"
import { blockEndingEmail } from "../emails/block-ending"
import type { NewsletterItem } from "../emails/newsletter-layout"

const BREVO_API_KEY = process.env.BREVO_API_KEY
const BREVO_BASE_URL = "https://api.brevo.com/v3"

if (!BREVO_API_KEY) {
  console.warn("[brevo] BREVO_API_KEY not set — CRM/Newsletter features will not work")
}

// --- Types ---

export interface BrevoContact {
  email: string
  id: number
  attributes: Record<string, any>
  listIds: number[]
}

export interface BrevoContactCreateUpdate {
  email: string
  attributes?: Record<string, any>
  listIds?: number[]
  updateEnabled?: boolean
}

export interface BrevoCampaign {
  id: number
  name: string
  subject: string
  status: string
  sentDate?: string
  statistics?: {
    globalStats: {
      uniqueClicks: number
      uniqueOpens: number
      sent: number
    }
  }
}

// --- Internal fetch helper ---

async function brevoFetch<T = any>(
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<T> {
  if (!BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY not configured")
  }

  const res = await fetch(`${BREVO_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`Brevo API ${res.status}: ${errorBody}`)
  }

  // 204 No Content (e.g. contact created successfully)
  if (res.status === 204) return undefined as T

  return res.json()
}

// --- CRM: Contacts ---

/**
 * Create or update a contact in Brevo (upsert by email).
 */
export async function upsertContact(
  email: string,
  attributes: Record<string, any>,
  listIds?: number[]
): Promise<void> {
  await brevoFetch("/contacts", {
    method: "POST",
    body: {
      email,
      attributes,
      listIds,
      updateEnabled: true, // upsert: create or update
    },
  })
}

/**
 * Get a contact by email.
 */
export async function getContact(email: string): Promise<BrevoContact | null> {
  try {
    return await brevoFetch<BrevoContact>(`/contacts/${encodeURIComponent(email)}`)
  } catch (err: any) {
    if (err.message?.includes("404")) return null
    throw err
  }
}

/**
 * Update specific attributes of an existing contact.
 */
export async function updateContactAttributes(
  email: string,
  attributes: Record<string, any>
): Promise<void> {
  await brevoFetch(`/contacts/${encodeURIComponent(email)}`, {
    method: "PUT",
    body: { attributes },
  })
}

/**
 * Delete a contact by email.
 */
export async function deleteContact(email: string): Promise<void> {
  await brevoFetch(`/contacts/${encodeURIComponent(email)}`, {
    method: "DELETE",
  })
}

// --- CRM: Lists ---

/**
 * Get the number of contacts in a list.
 */
export async function getListContactCount(listId: number): Promise<number> {
  const data = await brevoFetch<{ uniqueSubscribers: number }>(`/contacts/lists/${listId}`)
  return data.uniqueSubscribers
}

// --- Newsletter: Campaigns ---

/**
 * Send a campaign to a list using a Brevo template OR inline HTML.
 * Exactly one of `templateId` or `htmlContent` must be provided.
 */
export async function sendCampaign(opts: {
  name: string
  subject: string
  listIds: number[]
  templateId?: number
  htmlContent?: string
  params?: Record<string, any>
  scheduledAt?: string // ISO 8601
}): Promise<{ id: number }> {
  const body: Record<string, any> = {
    name: opts.name,
    subject: opts.subject,
    sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
    recipients: { listIds: opts.listIds },
    params: opts.params,
    scheduledAt: opts.scheduledAt,
  }

  if (opts.htmlContent) {
    body.htmlContent = opts.htmlContent
  } else if (opts.templateId) {
    body.templateId = opts.templateId
  } else {
    throw new Error("sendCampaign: either templateId or htmlContent is required")
  }

  const campaign = await brevoFetch<{ id: number }>("/emailCampaigns", {
    method: "POST",
    body,
  })

  // If no scheduledAt, send immediately
  if (!opts.scheduledAt) {
    await brevoFetch(`/emailCampaigns/${campaign.id}/sendNow`, {
      method: "POST",
    })
  }

  return campaign
}

/**
 * Get recent campaigns with stats.
 */
export async function getCampaigns(opts?: {
  limit?: number
  offset?: number
  status?: "draft" | "sent" | "archive" | "queued" | "suspended"
}): Promise<{ campaigns: BrevoCampaign[]; count: number }> {
  const params = new URLSearchParams()
  if (opts?.limit) params.set("limit", String(opts.limit))
  if (opts?.offset) params.set("offset", String(opts.offset))
  if (opts?.status) params.set("status", opts.status)
  params.set("sort", "desc")

  return brevoFetch(`/emailCampaigns?${params}`)
}

/**
 * Send a transactional email using a Brevo template.
 */
export async function sendTransactionalTemplate(
  templateId: number,
  to: string,
  params?: Record<string, any>
): Promise<void> {
  await brevoFetch("/smtp/email", {
    method: "POST",
    body: {
      templateId,
      to: [{ email: to }],
      params,
    },
  })
}

// --- CRM: Contact Listing ---

/**
 * List contacts from a specific list with attributes.
 */
export async function listContacts(opts?: {
  listId?: number
  limit?: number
  offset?: number
  sort?: "asc" | "desc"
}): Promise<{ contacts: BrevoContact[]; count: number }> {
  const limit = opts?.limit || 50
  const offset = opts?.offset || 0
  const sort = opts?.sort || "desc"

  if (opts?.listId) {
    return brevoFetch(`/contacts/lists/${opts.listId}/contacts?limit=${limit}&offset=${offset}&sort=${sort}`)
  }

  return brevoFetch(`/contacts?limit=${limit}&offset=${offset}&sort=${sort}`)
}

// --- Config helpers ---

export const BREVO_LIST_VOD_AUCTIONS = Number(process.env.BREVO_LIST_VOD_AUCTIONS) || 0
export const BREVO_LIST_TAPE_MAG = Number(process.env.BREVO_LIST_TAPE_MAG) || 0
export const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "newsletter@vod-auctions.com"
export const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "VOD Auctions"

/**
 * Check if Brevo is configured and ready to use.
 */
export function isBrevoConfigured(): boolean {
  return !!BREVO_API_KEY
}

// --- Newsletter: Auction Block Sequence ---

export type NewsletterType = "teaser" | "tomorrow" | "live" | "ending"

/**
 * Send one of the four auction block newsletter emails to list BREVO_LIST_VOD_AUCTIONS.
 *
 * @param type    Which email in the sequence to send
 * @param block   Auction block record (must have id, title, subtitle, slug, start_time, end_time)
 * @param items   Block items enriched with release/artist data (from Knex join)
 */
export async function sendBlockNewsletter(
  type: NewsletterType,
  block: {
    id: string
    title: string
    subtitle?: string | null
    description?: string | null
    slug: string
    start_time?: Date | string | null
    end_time?: Date | string | null
    item_count?: number
  },
  items: Array<{
    lot_number?: number | null
    release_title?: string | null
    release_artist?: string | null
    release_cover?: string | null
    current_price?: string | number | null
    start_price?: string | number | null
    bid_count?: number | null
  }>
): Promise<void> {
  const listId = BREVO_LIST_VOD_AUCTIONS || 4

  const startTime = block.start_time ? new Date(block.start_time) : new Date()
  const endTime = block.end_time ? new Date(block.end_time) : new Date()
  const itemCount = block.item_count ?? items.length

  // Build NewsletterItem array from enriched block items
  const toNewsletterItem = (item: typeof items[0]): NewsletterItem => ({
    lotNumber: item.lot_number ?? undefined,
    coverImage: item.release_cover ?? undefined,
    artistName: item.release_artist ?? undefined,
    title: item.release_title || "Untitled",
    detail: undefined, // set per email type below
  })

  const campaignTimestamp = Date.now()
  let subject: string
  let htmlContent: string

  switch (type) {
    case "teaser": {
      const previewItems = items.slice(0, 3).map((item) => ({
        ...toNewsletterItem(item),
        detail: item.start_price
          ? `Starting at €${parseFloat(String(item.start_price)).toFixed(2)}`
          : undefined,
      }))
      const result = blockTeaserEmail({
        blockTitle: block.title,
        blockSubtitle: block.subtitle,
        blockSlug: block.slug,
        startTime,
        itemCount,
        previewItems,
      })
      subject = result.subject
      htmlContent = result.html
      break
    }

    case "tomorrow": {
      const previewItems = items.slice(0, 6).map((item) => ({
        ...toNewsletterItem(item),
        detail: item.start_price
          ? `From €${parseFloat(String(item.start_price)).toFixed(2)}`
          : undefined,
      }))
      const result = blockTomorrowEmail({
        blockTitle: block.title,
        blockDescription: block.description,
        blockSlug: block.slug,
        startTime,
        itemCount,
        previewItems,
      })
      subject = result.subject
      htmlContent = result.html
      break
    }

    case "live": {
      const previewItems = items.slice(0, 6).map((item) => ({
        ...toNewsletterItem(item),
        detail: item.start_price
          ? `Starts at €${parseFloat(String(item.start_price)).toFixed(2)}`
          : undefined,
      }))
      const result = blockLiveEmail({
        blockTitle: block.title,
        blockSlug: block.slug,
        endTime,
        itemCount,
        previewItems,
      })
      subject = result.subject
      htmlContent = result.html
      break
    }

    case "ending": {
      const topItems = items.slice(0, 5).map((item) => ({
        ...toNewsletterItem(item),
        detail: item.current_price
          ? `Current bid: €${parseFloat(String(item.current_price)).toFixed(2)}`
          : item.start_price
          ? `Starts at €${parseFloat(String(item.start_price)).toFixed(2)}`
          : undefined,
      }))
      const result = blockEndingEmail({
        blockTitle: block.title,
        blockSlug: block.slug,
        endTime,
        topItems,
      })
      subject = result.subject
      htmlContent = result.html
      break
    }

    default:
      throw new Error(`Unknown newsletter type: ${type}`)
  }

  const campaignName = `newsletter-${type}-${block.id}-${campaignTimestamp}`

  await sendCampaign({
    name: campaignName,
    subject,
    htmlContent,
    listIds: [listId],
  })

  console.log(`[newsletter] Sent ${type} campaign for block "${block.title}" (${block.id}) to list ${listId}`)
}
