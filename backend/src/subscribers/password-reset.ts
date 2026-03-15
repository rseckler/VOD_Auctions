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
  // Only handle customer password resets (not admin users)
  if (data.actor_type !== "customer") return

  const pgConnection: Knex = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  // Look up customer name by email
  const customer = await pgConnection("customer")
    .select("first_name")
    .where("email", data.entity_id)
    .first()

  const firstName = customer?.first_name || "there"
  const resetUrl = `${APP_URL}/reset-password?token=${data.token}`

  const { subject, html } = passwordResetEmail({ firstName, resetUrl })
  await sendEmail({ to: data.entity_id, subject, html })

  console.log("[password-reset] Sent reset email to:", data.entity_id)
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
