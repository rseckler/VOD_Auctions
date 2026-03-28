import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendWatchlistReminderEmail } from "../lib/email-helpers"

export default async function watchlistReminder(container: MedusaContainer) {
  const pgConnection = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const now = new Date()

  // Find active block_items whose lot_end_time falls in the 23–25 hour window from now
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000)

  const items = await pgConnection("block_item")
    .where("status", "active")
    .whereBetween("lot_end_time", [windowStart, windowEnd])
    .whereNull("deleted_at")

  let reminderCount = 0

  for (const item of items) {
    // Find saved_items for this release that haven't been reminded yet
    const savedItems = await pgConnection("saved_item")
      .where("release_id", item.release_id)
      .whereNull("deleted_at")
      .whereNull("watchlist_reminded_at")

    for (const saved of savedItems) {
      try {
        await sendWatchlistReminderEmail(pgConnection, saved.id)
        await pgConnection("saved_item")
          .where("id", saved.id)
          .update({ watchlist_reminded_at: now })
        reminderCount++
      } catch (err) {
        console.error(`[watchlist-reminder] Failed to send reminder for saved_item ${saved.id}:`, err)
      }
    }
  }

  console.log(
    `[watchlist-reminder] Sent ${reminderCount} reminders for ${items.length} item(s) ending in ~24h`
  )
}

export const config = {
  name: "watchlist-reminder",
  schedule: "0 * * * *", // Every hour
}
