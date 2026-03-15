import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { upsertContact, BREVO_LIST_VOD_AUCTIONS } from "../../../lib/brevo"

// POST /store/newsletter — Public newsletter subscription (no auth required)
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { email } = req.body as { email?: string }

  if (!email || !email.includes("@")) {
    res.status(400).json({ message: "Valid email address is required" })
    return
  }

  try {
    const listIds = BREVO_LIST_VOD_AUCTIONS ? [BREVO_LIST_VOD_AUCTIONS] : undefined
    await upsertContact(email, {
      NEWSLETTER_OPTIN: true,
      PLATFORM_ORIGIN: "vod-auctions",
      NEWSLETTER_SIGNUP_DATE: new Date().toISOString().split("T")[0],
    }, listIds)

    res.json({ success: true })
  } catch (error: any) {
    console.error("[newsletter] Subscription failed:", error.message)
    res.status(500).json({ message: "Failed to subscribe. Please try again." })
  }
}
