import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /admin/crm/contacts/:id/anonymize
// DSGVO Art. 17 Recht auf Vergessenwerden. Master-Contact wird soft-deleted,
// alle PII (Emails, Adressen, Phones, Notes) gelöscht. Lifetime-Revenue +
// Transactions bleiben anonymisiert für Buchhaltung erhalten.
export async function POST(
  req: MedusaRequest<{ confirm?: string; reason?: string }, { id?: string }>,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const id = (req.params as { id?: string })?.id
  const body = (req.body || {}) as { confirm?: string; reason?: string }
  const admin = "admin@vod-auctions.com"

  if (!id) {
    res.status(400).json({ ok: false, error: "id required" })
    return
  }
  if (body.confirm !== "ANONYMIZE") {
    res.status(400).json({ ok: false, error: "Pass confirm: 'ANONYMIZE' to proceed" })
    return
  }

  try {
    const result = await pgConnection.transaction(async (trx) => {
      const master = await trx("crm_master_contact").where({ id, deleted_at: null }).first()
      if (!master) throw new Error("Contact not found or already anonymized")

      // 1) Emails / Addresses / Phones löschen (volle PII)
      await trx("crm_master_email").where({ master_id: id }).delete()
      await trx("crm_master_address").where({ master_id: id }).delete()
      await trx("crm_master_phone").where({ master_id: id }).delete()

      // 2) Notes löschen (kann persönliche Bemerkungen enthalten)
      await trx("crm_master_note").where({ master_id: id }).delete()

      // 3) Master-Felder anonymisieren — Display-Name + structured names + acquisition
      await trx("crm_master_contact").where({ id }).update({
        display_name: "[anonymized]",
        first_name: null,
        last_name: null,
        company: null,
        salutation: null,
        title: null,
        primary_email: null,
        primary_email_lower: null,
        primary_phone: null,
        primary_country_code: null,
        primary_postal_code: null,
        primary_city: null,
        avatar_url: null,
        birthday: null,
        notable_dates: null,
        preferred_language: null,
        acquisition_campaign: null,
        // Erhalten: lifetime_revenue, total_transactions, tier, lifecycle, tags, source_links
        // (anonymisierte Aggregate sind kein PII mehr)
        deleted_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })

      // 4) Audit-Log Eintrag (last action vor sealed)
      await trx("crm_master_audit_log").insert({
        master_id: id,
        action: "gdpr_anonymize",
        details: {
          reason: body.reason || null,
          original_display_name_hash: hashShort(master.display_name || ""),
          had_email: !!master.primary_email_lower,
          had_phone: !!master.primary_phone,
        },
        source: "admin_ui",
        admin_email: admin,
      })

      return { id, anonymized_at: new Date().toISOString() }
    })

    res.json({ ok: true, ...result })
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err)
    res.status(m === "Contact not found or already anonymized" ? 404 : 500).json({ ok: false, error: m })
  }
}

function hashShort(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(16)
}
