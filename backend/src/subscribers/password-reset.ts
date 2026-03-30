import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { sendEmail, APP_URL } from "../lib/email"
import { passwordResetEmail } from "../emails/password-reset"

type PasswordResetData = {
  entity_id: string // email address
  actor_type: string // "customer" or "user"
  token: string // JWT reset token (15 min expiry)
}

export default async function passwordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<PasswordResetData>) {
  const pgConnection: Knex = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  if (data.actor_type === "customer") {
    // Customer password reset → storefront /reset-password
    const customer = await pgConnection("customer")
      .select("first_name")
      .where("email", data.entity_id)
      .first()

    const firstName = customer?.first_name || "there"
    const resetUrl = `${APP_URL}/reset-password?token=${data.token}`

    const { subject, html } = passwordResetEmail({ firstName, resetUrl })
    await sendEmail({ to: data.entity_id, subject, html })
    console.log("[password-reset] Sent customer reset email to:", data.entity_id)
  } else if (data.actor_type === "user") {
    // Admin user password reset → Medusa admin /app/reset-password
    const adminResetUrl = `https://admin.vod-auctions.com/app/reset-password?token=${data.token}&email=${encodeURIComponent(data.entity_id)}`

    const { subject, html } = passwordResetEmail({
      firstName: "Admin",
      resetUrl: adminResetUrl,
    })
    await sendEmail({ to: data.entity_id, subject, html })
    console.log("[password-reset] Sent admin reset email to:", data.entity_id)
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
