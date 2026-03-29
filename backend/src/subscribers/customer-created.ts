import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { crmSyncRegistration } from "../lib/crm-sync"

/**
 * Fires on every customer.created event (both storefront + admin-created).
 * - Creates a customer_stats row for fast SQL queries
 * - Syncs to Brevo CRM (idempotent — safe to call even if send-welcome also calls it)
 */
export default async function customerCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const customerId = data.id

  const pgConnection: Knex = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  // Create initial customer_stats row (ON CONFLICT DO NOTHING = idempotent)
  try {
    await pgConnection.raw(
      `INSERT INTO customer_stats (id, customer_id, total_spent, total_purchases, total_bids, total_wins, tags, is_vip, is_dormant, updated_at)
       VALUES (?, ?, 0, 0, 0, 0, '{}', false, false, NOW())
       ON CONFLICT (customer_id) DO NOTHING`,
      [generateEntityId(), customerId]
    )
    console.log(`[customer-created] Stats row created for: ${customerId}`)
  } catch (err: any) {
    console.error(`[customer-created] Failed to create stats row: ${err.message}`)
  }

  // Sync to Brevo CRM (idempotent — safe even if storefront also calls send-welcome)
  crmSyncRegistration(pgConnection, customerId).catch((err) => {
    console.error(`[customer-created] Brevo sync failed: ${err.message}`)
  })
}

export const config: SubscriberConfig = {
  event: "customer.created",
}
