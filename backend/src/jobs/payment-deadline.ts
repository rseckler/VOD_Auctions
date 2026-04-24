import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendEmail } from "../lib/email"
import { sendPaymentReminder1Email, sendPaymentReminder3Email } from "../lib/email-helpers"

const ADMIN_EMAIL = "frank@vod-records.com"
const PAYMENT_DEADLINE_DAYS = 5
const REMINDER_1_DAYS = 1
const REMINDER_3_DAYS = 3

export default async function paymentDeadline(container: MedusaContainer) {
  const pgConnection = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const now = new Date()

  // Find all pending auction transactions that have a block_item with lot_end_time
  // Use LEFT JOIN to get lot_end_time in one query
  const pendingTransactions = await pgConnection("transaction as t")
    .join("block_item as bi", "t.block_item_id", "bi.id")
    .where("t.status", "pending")
    .where("t.item_type", "auction")
    .whereNotNull("bi.lot_end_time")
    .whereNull("t.deleted_at")
    .select(
      "t.id",
      "t.user_id",
      "t.amount",
      "t.order_group_id",
      "t.block_item_id",
      "t.payment_reminder_1_sent_at",
      "t.payment_reminder_3_sent_at",
      "bi.lot_end_time",
      "bi.lot_number",
      "bi.release_id as bi_release_id",
      "bi.id as bi_id",
      "bi.auction_block_id"
    )

  // De-duplicate by order_group_id: only process one representative transaction per group
  // (emails sent by helper functions gather all items in the group)
  const processedGroups = new Set<string>()
  const transactionsToProcess: typeof pendingTransactions = []

  for (const tx of pendingTransactions) {
    const groupKey = tx.order_group_id || tx.id
    if (!processedGroups.has(groupKey)) {
      processedGroups.add(groupKey)
      transactionsToProcess.push(tx)
    }
  }

  for (const tx of transactionsToProcess) {
    const lotEndTime = new Date(tx.lot_end_time)
    const deadlineTime = new Date(lotEndTime.getTime() + PAYMENT_DEADLINE_DAYS * 86400000)
    const reminder1Time = new Date(lotEndTime.getTime() + REMINDER_1_DAYS * 86400000)
    const reminder3Time = new Date(lotEndTime.getTime() + REMINDER_3_DAYS * 86400000)

    // --- Day 5: Cancel overdue transactions and re-list items ---
    if (now >= deadlineTime) {
      console.log(`[payment-deadline] Cancelling overdue transaction ${tx.id} (lot_end_time: ${lotEndTime.toISOString()})`)

      try {
        // Get all pending transactions in this group
        const groupTransactions = tx.order_group_id
          ? await pgConnection("transaction")
              .where("order_group_id", tx.order_group_id)
              .where("status", "pending")
              .where("item_type", "auction")
          : [tx]

        for (const groupTx of groupTransactions) {
          if (!groupTx.block_item_id) continue

          const blockItem = await pgConnection("block_item")
            .where("id", groupTx.block_item_id)
            .first()

          if (blockItem) {
            // Reset block_item status to unsold
            await pgConnection("block_item")
              .where("id", blockItem.id)
              .update({ status: "unsold", updated_at: now })

            // Reset release auction_status to available
            const releaseId = blockItem.release_id
            if (releaseId) {
              await pgConnection("Release")
                .where("id", releaseId)
                .update({ auction_status: "available", updatedAt: now })

              // Get release title for admin notification
              const release = await pgConnection("Release")
                .where("id", releaseId)
                .select("title")
                .first()

              const releaseTitleStr = release?.title || `Release ${releaseId}`
              const lotLabel = blockItem.lot_number ? `Lot #${blockItem.lot_number}` : "Unknown Lot"

              // Get a user hint (first_name + masked email)
              const customer = await pgConnection("customer")
                .where("id", groupTx.user_id)
                .select("first_name", "email")
                .first()
              const userHint = customer
                ? `${customer.first_name || ""} (${customer.email?.replace(/(?<=.{3}).(?=[^@]*@)/, "*") || "unknown"})`
                : groupTx.user_id

              // Send admin notification
              await sendEmail({
                to: ADMIN_EMAIL,
                subject: `Item re-listed: ${releaseTitleStr} (${lotLabel}) — payment deadline expired`,
                html: `<p>Hi Frank,</p>
<p>The following item has been automatically re-listed because the buyer did not pay within ${PAYMENT_DEADLINE_DAYS} days:</p>
<ul>
  <li><strong>Item:</strong> ${releaseTitleStr}</li>
  <li><strong>Lot:</strong> ${lotLabel}</li>
  <li><strong>Buyer:</strong> ${userHint}</li>
  <li><strong>Transaction ID:</strong> ${groupTx.id}</li>
  <li><strong>Auction ended:</strong> ${lotEndTime.toUTCString()}</li>
  <li><strong>Deadline was:</strong> ${deadlineTime.toUTCString()}</li>
</ul>
<p>The item is now back to <code>auction_status = available</code>.</p>
<p>— VOD Auctions automated system</p>`,
              }).catch((err) => {
                console.error(`[payment-deadline] Admin notification failed:`, err)
              })
            }
          }

          // Cancel the transaction
          await pgConnection("transaction")
            .where("id", groupTx.id)
            .update({
              status: "cancelled",
              cancelled_at: now,
              cancel_reason: "Payment deadline expired (auto-cancelled after 5 days)",
              updated_at: now,
            })

          console.log(`[payment-deadline] Cancelled transaction ${groupTx.id} and re-listed block_item ${groupTx.block_item_id}`)
        }
      } catch (err) {
        console.error(`[payment-deadline] Error cancelling transaction ${tx.id}:`, err)
      }

      continue // Skip reminder checks for cancelled transactions
    }

    // --- Day 3: Final reminder ---
    if (now >= reminder3Time && !tx.payment_reminder_3_sent_at) {
      console.log(`[payment-deadline] Sending day-3 reminder for transaction ${tx.id}`)
      try {
        await sendPaymentReminder3Email(pgConnection, tx.id, deadlineTime)
        // Mark reminder sent on ALL transactions in this group
        if (tx.order_group_id) {
          await pgConnection("transaction")
            .where("order_group_id", tx.order_group_id)
            .update({ payment_reminder_3_sent_at: now, updated_at: now })
        } else {
          await pgConnection("transaction")
            .where("id", tx.id)
            .update({ payment_reminder_3_sent_at: now, updated_at: now })
        }
        console.log(`[payment-deadline] Day-3 reminder sent for transaction ${tx.id}`)
      } catch (err) {
        console.error(`[payment-deadline] Day-3 reminder failed for transaction ${tx.id}:`, err)
      }
      continue // Don't also send day-1 reminder on the same run
    }

    // --- Day 1: First reminder ---
    if (now >= reminder1Time && !tx.payment_reminder_1_sent_at) {
      console.log(`[payment-deadline] Sending day-1 reminder for transaction ${tx.id}`)
      try {
        await sendPaymentReminder1Email(pgConnection, tx.id)
        // Mark reminder sent on ALL transactions in this group
        if (tx.order_group_id) {
          await pgConnection("transaction")
            .where("order_group_id", tx.order_group_id)
            .update({ payment_reminder_1_sent_at: now, updated_at: now })
        } else {
          await pgConnection("transaction")
            .where("id", tx.id)
            .update({ payment_reminder_1_sent_at: now, updated_at: now })
        }
        console.log(`[payment-deadline] Day-1 reminder sent for transaction ${tx.id}`)
      } catch (err) {
        console.error(`[payment-deadline] Day-1 reminder failed for transaction ${tx.id}:`, err)
      }
    }
  }
}

export const config = {
  name: "payment-deadline",
  schedule: "0 9 * * *", // Daily at 09:00 UTC
}
