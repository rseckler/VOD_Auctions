import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/crm/contacts/export?<filter>&<sort>&format=csv|json
//
// Streamt die aktuelle Filter-Selection als CSV (oder JSON). Max 50.000 Rows.
// Identische Filter-Logik wie /admin/crm/contacts.

const ALLOWED_FILTERS = new Set([
  "all", "with_email", "only_webshop", "only_mo_pdf", "test", "internal_owner", "blocked",
])

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const q = ((req.query.q as string) || "").trim()
  const filter = (req.query.filter as string) || "all"
  const tier = req.query.tier as string | undefined
  const lifecycleStage = req.query.lifecycle_stage as string | undefined
  const rfmSegment = req.query.rfm_segment as string | undefined
  const acquisitionChannel = req.query.acquisition_channel as string | undefined
  const sortInput = (req.query.sort as string) || "lifetime_revenue"
  const order = (req.query.order as string) === "asc" ? "asc" : "desc"
  const format = (req.query.format as string) === "json" ? "json" : "csv"

  if (!ALLOWED_FILTERS.has(filter)) {
    res.status(400).json({ ok: false, error: "invalid filter" })
    return
  }

  const sortColumn =
    {
      lifetime_revenue: "mc.lifetime_revenue",
      health_score: "mc.health_score",
      last_seen_at: "mc.last_seen_at",
      total_transactions: "mc.total_transactions",
      created_at: "mc.created_at",
      display_name: "mc.display_name",
    }[sortInput] || "mc.lifetime_revenue"

  try {
    let query = pgConnection("crm_master_contact as mc").whereNull("mc.deleted_at")

    if (q) {
      const like = `%${q.toLowerCase()}%`
      query = query.where((b: any) => {
        b.whereRaw("LOWER(mc.display_name) LIKE ?", [like]).orWhereRaw(
          "LOWER(mc.primary_email_lower) LIKE ?",
          [like]
        )
      })
    }
    if (filter === "with_email") query = query.whereNotNull("mc.primary_email_lower")
    else if (filter === "only_webshop") {
      query = query.whereExists(function (this: any) {
        this.select("*")
          .from("crm_master_source_link as sl")
          .whereRaw("sl.master_id = mc.id")
          .whereIn("sl.source", ["vod_records_db1", "vod_records_db2013", "vod_records_db2013_alt"])
      })
    } else if (filter === "only_mo_pdf") {
      query = query.whereExists(function (this: any) {
        this.select("*").from("crm_master_source_link as sl")
          .whereRaw("sl.master_id = mc.id").where("sl.source", "mo_pdf")
      })
      query = query.whereNotExists(function (this: any) {
        this.select("*").from("crm_master_source_link as sl2")
          .whereRaw("sl2.master_id = mc.id").whereNotIn("sl2.source", ["mo_pdf"])
      })
    } else if (filter === "test") query = query.where("mc.is_test", true)
    else if (filter === "internal_owner") query = query.whereRaw("'internal_owner' = ANY(mc.tags)")
    else if (filter === "blocked") query = query.where("mc.is_blocked", true)

    if (tier) query = query.where("mc.tier", tier)
    if (lifecycleStage) query = query.where("mc.lifecycle_stage", lifecycleStage)
    if (rfmSegment) query = query.where("mc.rfm_segment", rfmSegment)
    if (acquisitionChannel) query = query.where("mc.acquisition_channel", acquisitionChannel)

    const rows = await query
      .select(
        "mc.id",
        "mc.display_name",
        "mc.first_name",
        "mc.last_name",
        "mc.company",
        "mc.salutation",
        "mc.title",
        "mc.contact_type",
        "mc.primary_email",
        "mc.primary_phone",
        "mc.primary_country_code",
        "mc.primary_postal_code",
        "mc.primary_city",
        "mc.lifetime_revenue",
        "mc.total_transactions",
        "mc.first_seen_at",
        "mc.last_seen_at",
        "mc.tier",
        "mc.lifecycle_stage",
        "mc.rfm_segment",
        "mc.rfm_recency_score",
        "mc.rfm_frequency_score",
        "mc.rfm_monetary_score",
        "mc.health_score",
        "mc.acquisition_channel",
        "mc.acquisition_date",
        "mc.preferred_language",
        "mc.birthday",
        "mc.medusa_customer_id",
        pgConnection.raw("COALESCE(mc.tags, '{}') as tags"),
        "mc.is_test",
        "mc.is_blocked",
        "mc.created_at"
      )
      .orderBy(sortColumn, order)
      .orderBy("mc.id", "asc")
      .limit(50000)

    if (format === "json") {
      res.json({ contacts: rows, total: rows.length })
      return
    }

    // CSV
    const headers = [
      "id", "display_name", "first_name", "last_name", "company", "salutation", "title",
      "contact_type", "primary_email", "primary_phone",
      "country_code", "postal_code", "city",
      "lifetime_revenue", "total_transactions", "first_seen_at", "last_seen_at",
      "tier", "lifecycle_stage", "rfm_segment", "rfm_r", "rfm_f", "rfm_m",
      "health_score", "acquisition_channel", "acquisition_date",
      "preferred_language", "birthday",
      "medusa_customer_id", "tags", "is_test", "is_blocked", "created_at",
    ]
    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return ""
      const s = Array.isArray(v) ? v.join("|") : String(v)
      // Quote if contains comma, quote, or newline
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const lines: string[] = [headers.join(",")]
    for (const r of rows as Array<Record<string, unknown>>) {
      lines.push(
        [
          r.id, r.display_name, r.first_name, r.last_name, r.company, r.salutation, r.title,
          r.contact_type, r.primary_email, r.primary_phone,
          r.primary_country_code, r.primary_postal_code, r.primary_city,
          r.lifetime_revenue, r.total_transactions, r.first_seen_at, r.last_seen_at,
          r.tier, r.lifecycle_stage, r.rfm_segment,
          r.rfm_recency_score, r.rfm_frequency_score, r.rfm_monetary_score,
          r.health_score, r.acquisition_channel, r.acquisition_date,
          r.preferred_language, r.birthday,
          r.medusa_customer_id, r.tags, r.is_test, r.is_blocked, r.created_at,
        ].map(escape).join(",")
      )
    }
    const csv = lines.join("\n")
    const fname = `crm-contacts-${new Date().toISOString().slice(0, 10)}.csv`
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`)
    res.send("﻿" + csv) // BOM für Excel-UTF-8
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
