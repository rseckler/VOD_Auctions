import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendBidEndingSoonEmail } from "../lib/email-helpers"
import { BidEndingReminderType } from "../emails/bid-ending-soon"

// Time windows: send reminder when lot_end_time is within this range from now.
// Wide windows are safe — bid_ending_reminder table deduplicates per (block_item, user, type).
const REMINDER_WINDOWS: Array<{
  type: BidEndingReminderType
  minMs: number  // lower bound (lot ends at least this far away)
  maxMs: number  // upper bound (lot ends at most this far away)
}> = [
  { type: "24h", minMs: 23 * 60 * 60 * 1000,       maxMs: 25 * 60 * 60 * 1000 },
  { type: "8h",  minMs: 7.5 * 60 * 60 * 1000,      maxMs: 8.5 * 60 * 60 * 1000 },
  { type: "1h",  minMs: 45 * 60 * 1000,             maxMs: 75 * 60 * 1000 },
  { type: "5m",  minMs: 3 * 60 * 1000,              maxMs: 8 * 60 * 1000 },
]

export default async function bidEndingReminder(container: MedusaContainer) {
  const pgConnection = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const now = new Date()

  // Ensure tracking table exists (idempotent)
  await pgConnection.raw(`
    CREATE TABLE IF NOT EXISTS bid_ending_reminder (
      block_item_id text NOT NULL,
      user_id       text NOT NULL,
      reminder_type text NOT NULL,
      sent_at       timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (block_item_id, user_id, reminder_type)
    )
  `)

  let totalSent = 0

  for (const window of REMINDER_WINDOWS) {
    const windowStart = new Date(now.getTime() + window.minMs)
    const windowEnd   = new Date(now.getTime() + window.maxMs)

    // Find active lots ending within this window
    const items = await pgConnection("block_item")
      .where("status", "active")
      .whereBetween("lot_end_time", [windowStart, windowEnd])
      .whereNull("deleted_at")
      .select("id", "release_id", "lot_number", "auction_block_id")

    if (!items.length) continue

    for (const item of items) {
      // Find all distinct bidders on this lot
      const bidders = await pgConnection("bid")
        .where("block_item_id", item.id)
        .distinct("user_id")
        .select("user_id")

      for (const { user_id } of bidders) {
        // Deduplication check
        const alreadySent = await pgConnection("bid_ending_reminder")
          .where({ block_item_id: item.id, user_id, reminder_type: window.type })
          .first()

        if (alreadySent) continue

        try {
          await sendBidEndingSoonEmail(pgConnection, user_id, item.id, window.type)

          // Mark as sent
          await pgConnection("bid_ending_reminder").insert({
            block_item_id: item.id,
            user_id,
            reminder_type: window.type,
            sent_at: now,
          })

          totalSent++
        } catch (err) {
          console.error(
            `[bid-ending-reminder] Failed ${window.type} for user ${user_id} on item ${item.id}:`,
            err instanceof Error ? err.message : err
          )
        }
      }
    }
  }

  if (totalSent > 0) {
    console.log(`[bid-ending-reminder] Sent ${totalSent} ending-soon reminder(s)`)
  }
}

export const config = {
  name: "bid-ending-reminder",
  schedule: "* * * * *", // Every minute
}
