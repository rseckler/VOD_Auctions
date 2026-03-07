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
 * Send a campaign to a list using a Brevo template.
 */
export async function sendCampaign(opts: {
  name: string
  subject: string
  templateId: number
  listIds: number[]
  params?: Record<string, any>
  scheduledAt?: string // ISO 8601
}): Promise<{ id: number }> {
  const campaign = await brevoFetch<{ id: number }>("/emailCampaigns", {
    method: "POST",
    body: {
      name: opts.name,
      subject: opts.subject,
      templateId: opts.templateId,
      recipients: { listIds: opts.listIds },
      params: opts.params,
      scheduledAt: opts.scheduledAt,
    },
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
