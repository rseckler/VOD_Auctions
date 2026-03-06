import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendFeedbackRequestEmail } from "../lib/email-helpers"

// Cron job: send feedback request emails 5 days after shipping
export default async function feedbackEmail(container: MedusaContainer) {
  const pgConnection = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const fiveDaysAgo = new Date()
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)

  // Find transactions shipped more than 5 days ago that haven't received feedback email
  const eligibleTransactions = await pgConnection("transaction")
    .where("status", "paid")
    .where("shipping_status", "shipped")
    .where("shipped_at", "<=", fiveDaysAgo)
    .where(function (this: any) {
      this.where("feedback_email_sent", false).orWhereNull("feedback_email_sent")
    })
    .select("id", "order_group_id")

  if (!eligibleTransactions.length) return

  // Deduplicate by order_group_id (only send once per order group)
  const seen = new Set<string>()
  const uniqueTransactions = eligibleTransactions.filter((tx: any) => {
    const key = tx.order_group_id || tx.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  for (const tx of uniqueTransactions) {
    try {
      await sendFeedbackRequestEmail(pgConnection, tx.id)
      console.log(`[feedback-email] Sent feedback request for transaction ${tx.id}`)
    } catch (err) {
      console.error(`[feedback-email] Failed for transaction ${tx.id}:`, err)
    }
  }

  if (uniqueTransactions.length > 0) {
    console.log(`[feedback-email] Processed ${uniqueTransactions.length} feedback emails`)
  }
}

export const config = {
  name: "feedback-email",
  schedule: "0 10 * * *", // Every day at 10:00 UTC
}
