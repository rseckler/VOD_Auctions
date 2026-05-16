import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getFeatureFlag } from "../lib/feature-flags"
import { sendEmailWithLog, APP_URL } from "../lib/email"
import { communityNotificationsEmail } from "../emails/community-notifications"

function lineFor(kind: string, actor: string): string {
  switch (kind) {
    case "comment":
      return `<strong>${actor}</strong> commented on your post`
    case "reply":
      return `<strong>${actor}</strong> replied to your comment`
    case "follow":
      return `<strong>${actor}</strong> started following you`
    case "mention":
      return `<strong>${actor}</strong> mentioned you`
    case "editorial":
      return `<strong>${actor}</strong> published a new editorial`
    default:
      return `<strong>${actor}</strong> interacted with you`
  }
}

// Emails members a digest of their un-emailed community notifications.
// Opt-out via community_profile.email_notifications. Idempotent — each
// notification's is_emailed flag is set once it has been included.
export default async function communityNotificationEmails(
  container: MedusaContainer
): Promise<void> {
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await getFeatureFlag(pg, "COMMUNITY"))) return

  const since = new Date(Date.now() - 7 * 86_400_000)
  const rows = await pg("community_notification as n")
    .join("community_profile as r", "r.id", "n.recipient_id")
    .leftJoin("community_profile as a", "a.id", "n.actor_id")
    .leftJoin("customer as c", "c.id", "r.customer_id")
    .where("n.is_emailed", false)
    .where("n.created_at", ">=", since)
    .where("r.email_notifications", true)
    .whereNotNull("r.customer_id")
    .whereNotNull("c.email")
    .select(
      "n.id as notif_id",
      "n.kind",
      "r.id as recipient_id",
      "c.email as recipient_email",
      "c.first_name as recipient_first_name",
      "r.customer_id",
      "a.display_name as actor_name"
    )

  if (rows.length === 0) return

  // Group by recipient.
  const byRecipient = new Map<string, any[]>()
  for (const r of rows) {
    const arr = byRecipient.get(r.recipient_id) || []
    arr.push(r)
    byRecipient.set(r.recipient_id, arr)
  }

  let sent = 0
  for (const [, group] of byRecipient) {
    const first = group[0]
    const lines = group.map((g) =>
      lineFor(g.kind, g.actor_name || "Someone")
    )
    const { subject, html } = communityNotificationsEmail({
      firstName: first.recipient_first_name || "there",
      lines,
      communityUrl: `${APP_URL}/community/notifications`,
      settingsUrl: `${APP_URL}/community/settings`,
      customerId: first.customer_id,
    })
    const ok = await sendEmailWithLog(pg, {
      to: first.recipient_email,
      subject,
      html,
      template: "community-notifications",
    })
    if (ok) {
      await pg("community_notification")
        .whereIn(
          "id",
          group.map((g) => g.notif_id)
        )
        .update({ is_emailed: true })
      sent++
    }
  }
  if (sent > 0) {
    console.log(`[community-notification-emails] sent ${sent} digest emails`)
  }
}

export const config = {
  name: "community-notification-emails",
  // Every two hours, offset off the top of the hour.
  schedule: "20 */2 * * *",
}
