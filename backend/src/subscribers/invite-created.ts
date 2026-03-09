import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"

export default async function inviteCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve("query")
  const notificationModuleService = container.resolve("notification")

  const {
    data: [invite],
  } = await query.graph({
    entity: "invite",
    fields: ["email", "token"],
    filters: { id: data.id },
  })

  if (!invite) {
    console.error("[invite] Invite not found:", data.id)
    return
  }

  const backendUrl =
    process.env.BACKEND_URL || "https://admin.vod-auctions.com"

  await notificationModuleService.createNotifications({
    to: invite.email,
    template: "user-invited",
    channel: "email",
    data: {
      invite_url: `${backendUrl}/app/invite?token=${invite.token}`,
    },
  })

  console.log("[invite] Sent invite email to:", invite.email)
}

export const config: SubscriberConfig = {
  event: ["invite.created", "invite.resent"],
}
