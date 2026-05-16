import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getFeatureFlag } from "../lib/feature-flags"
import { sendEmailWithLog, APP_URL } from "../lib/email"
import { communityDigestEmail, type DigestPost } from "../emails/community-digest"

// Weekly "Community Dispatch" — the past week's most-engaged posts, emailed
// to members who keep community email on. Runs once weekly.
export default async function communityWeeklyDigest(
  container: MedusaContainer
): Promise<void> {
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await getFeatureFlag(pg, "COMMUNITY"))) return

  const since = new Date(Date.now() - 7 * 86_400_000)

  // Top posts of the week — real (non-demo) discussion + editorial posts.
  const postRows = await pg("community_post as p")
    .join("community_profile as a", "a.id", "p.author_id")
    .where("p.status", "published")
    .whereIn("p.kind", ["discussion", "editorial"])
    .where("p.published_at", ">=", since)
    .whereRaw("p.author_id NOT LIKE ?", ["cmpro_demo_%"])
    .orderByRaw("(p.reaction_count + p.comment_count) DESC, p.published_at DESC")
    .limit(8)
    .select(
      "p.title", "p.slug", "p.id", "p.excerpt",
      "p.reaction_count", "p.comment_count",
      "a.display_name as author_name"
    )

  if (postRows.length === 0) return // nothing worth a digest

  const posts: DigestPost[] = postRows.map((p: any) => ({
    title: p.title || (p.excerpt ? p.excerpt.slice(0, 70) : "Untitled"),
    author: p.author_name,
    url: `${APP_URL}/community/post/${p.slug || p.id}`,
    reactions: p.reaction_count || 0,
    comments: p.comment_count || 0,
  }))

  // Recipients — real members with community email on.
  const recipients = await pg("community_profile as r")
    .join("customer as c", "c.id", "r.customer_id")
    .where("r.email_notifications", true)
    .where("r.is_banned", false)
    .whereNotNull("c.email")
    .whereRaw("r.id NOT LIKE ?", ["cmpro_demo_%"])
    .select("c.email", "c.first_name", "r.customer_id")

  let sent = 0
  for (const r of recipients) {
    const { subject, html } = communityDigestEmail({
      firstName: r.first_name || "there",
      posts,
      communityUrl: `${APP_URL}/community`,
      settingsUrl: `${APP_URL}/community/settings`,
      customerId: r.customer_id,
    })
    const ok = await sendEmailWithLog(pg, {
      to: r.email,
      subject,
      html,
      template: "community-weekly-digest",
    })
    if (ok) sent++
  }
  if (sent > 0) {
    console.log(`[community-weekly-digest] sent ${sent} digest emails`)
  }
}

export const config = {
  name: "community-weekly-digest",
  // Sundays at 09:10 UTC.
  schedule: "10 9 * * 0",
}
