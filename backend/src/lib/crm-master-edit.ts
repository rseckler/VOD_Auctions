// Helpers für Master-Contact-Edit-Endpoints
//
// Set-primary-Logic: wenn ein Email/Address/Phone als is_primary=true gesetzt
// wird, müssen alle anderen derselben Sorte für denselben Master auf false
// geflippt werden, plus die "primary_*"-Convenience-Felder am master_contact
// synchronisiert werden.

import type { Knex } from "knex"

export const ADMIN_EMAIL_FALLBACK = "admin@vod-auctions.com"

/**
 * Synct master_contact.primary_email + primary_email_lower nach Email-Set-Primary.
 */
export async function syncPrimaryEmail(
  trx: Knex.Transaction,
  masterId: string,
  emailId: string
): Promise<void> {
  // Andere Emails dieses Masters → is_primary=false
  await trx("crm_master_email")
    .where({ master_id: masterId })
    .andWhereNot({ id: emailId })
    .update({ is_primary: false })

  const e = await trx("crm_master_email").where({ id: emailId }).first()
  if (!e) return

  await trx("crm_master_contact")
    .where({ id: masterId })
    .update({
      primary_email: e.email,
      primary_email_lower: e.email_lower,
      updated_at: trx.fn.now(),
    })
}

export async function clearPrimaryEmailIfMatch(
  trx: Knex.Transaction,
  masterId: string,
  removedEmailId: string
): Promise<void> {
  const removed = await trx("crm_master_email")
    .where({ id: removedEmailId })
    .first()
  if (!removed) return

  const master = await trx("crm_master_contact").where({ id: masterId }).first()
  if (!master) return

  if (master.primary_email_lower === removed.email_lower) {
    // Pick erste verbleibende Email
    const next = await trx("crm_master_email")
      .where({ master_id: masterId })
      .andWhereNot({ id: removedEmailId })
      .orderBy("is_primary", "desc")
      .orderBy("created_at", "asc")
      .first()
    await trx("crm_master_contact")
      .where({ id: masterId })
      .update({
        primary_email: next ? next.email : null,
        primary_email_lower: next ? next.email_lower : null,
        updated_at: trx.fn.now(),
      })
    if (next && !next.is_primary) {
      await trx("crm_master_email")
        .where({ id: next.id })
        .update({ is_primary: true })
    }
  }
}

export async function syncPrimaryAddress(
  trx: Knex.Transaction,
  masterId: string,
  addressId: string
): Promise<void> {
  await trx("crm_master_address")
    .where({ master_id: masterId })
    .andWhereNot({ id: addressId })
    .update({ is_primary: false })

  const a = await trx("crm_master_address").where({ id: addressId }).first()
  if (!a) return

  await trx("crm_master_contact")
    .where({ id: masterId })
    .update({
      primary_country_code: a.country_code,
      primary_postal_code: a.postal_code,
      primary_city: a.city,
      updated_at: trx.fn.now(),
    })
}

export async function clearPrimaryAddressIfMatch(
  trx: Knex.Transaction,
  masterId: string,
  removedAddressId: string
): Promise<void> {
  const removed = await trx("crm_master_address")
    .where({ id: removedAddressId })
    .first()
  if (!removed || !removed.is_primary) return

  const next = await trx("crm_master_address")
    .where({ master_id: masterId })
    .andWhereNot({ id: removedAddressId })
    .orderBy("created_at", "asc")
    .first()

  await trx("crm_master_contact")
    .where({ id: masterId })
    .update({
      primary_country_code: next ? next.country_code : null,
      primary_postal_code: next ? next.postal_code : null,
      primary_city: next ? next.city : null,
      updated_at: trx.fn.now(),
    })

  if (next) {
    await trx("crm_master_address")
      .where({ id: next.id })
      .update({ is_primary: true })
  }
}

export async function syncPrimaryPhone(
  trx: Knex.Transaction,
  masterId: string,
  phoneId: string
): Promise<void> {
  await trx("crm_master_phone")
    .where({ master_id: masterId })
    .andWhereNot({ id: phoneId })
    .update({ is_primary: false })

  const p = await trx("crm_master_phone").where({ id: phoneId }).first()
  if (!p) return

  await trx("crm_master_contact")
    .where({ id: masterId })
    .update({
      primary_phone: p.phone_normalized || p.phone_raw,
      updated_at: trx.fn.now(),
    })
}

export async function clearPrimaryPhoneIfMatch(
  trx: Knex.Transaction,
  masterId: string,
  removedPhoneId: string
): Promise<void> {
  const removed = await trx("crm_master_phone")
    .where({ id: removedPhoneId })
    .first()
  if (!removed || !removed.is_primary) return

  const next = await trx("crm_master_phone")
    .where({ master_id: masterId })
    .andWhereNot({ id: removedPhoneId })
    .orderBy("created_at", "asc")
    .first()

  await trx("crm_master_contact")
    .where({ id: masterId })
    .update({
      primary_phone: next ? next.phone_normalized || next.phone_raw : null,
      updated_at: trx.fn.now(),
    })

  if (next) {
    await trx("crm_master_phone")
      .where({ id: next.id })
      .update({ is_primary: true })
  }
}
