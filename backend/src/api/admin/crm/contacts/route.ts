import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/crm/contacts — Master-Contact-Liste mit Pagination + Filter
//
// Query-Params:
//   q          — Volltext-Suche auf display_name + primary_email_lower (ILIKE)
//   filter     — alle | with_email | only_webshop | only_mo_pdf | test | internal_owner | blocked
//   tier       — bronze | silver | gold | platinum (wenn gesetzt)
//   sort       — lifetime_revenue | last_seen_at | total_transactions | created_at
//   order      — asc | desc (default desc)
//   limit      — default 50, max 200
//   offset     — default 0
//
// Sprint S1, Decision 3A — Contacts-Tab.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const q = ((req.query.q as string) || "").trim()
  const filter = (req.query.filter as string) || "all"
  const tier = req.query.tier as string | undefined
  const lifecycleStage = req.query.lifecycle_stage as string | undefined
  const rfmSegment = req.query.rfm_segment as string | undefined
  const acquisitionChannel = req.query.acquisition_channel as string | undefined
  const idsOnly = req.query.ids_only === "true"
  const sortInput = (req.query.sort as string) || "lifetime_revenue"
  const order = (req.query.order as string) === "asc" ? "asc" : "desc"
  const limit = idsOnly
    ? Math.min(Number(req.query.limit) || 5000, 10000)
    : Math.min(Number(req.query.limit) || 50, 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const sortColumn =
    {
      lifetime_revenue: "mc.lifetime_revenue",
      last_seen_at: "mc.last_seen_at",
      total_transactions: "mc.total_transactions",
      created_at: "mc.created_at",
      display_name: "mc.display_name",
      primary_email: "mc.primary_email_lower",
      city: "mc.primary_city",
      country: "mc.primary_country_code",
      health_score: "mc.health_score",
      rfm_segment: "mc.rfm_segment",
      tier: "mc.tier",
      lifecycle_stage: "mc.lifecycle_stage",
    }[sortInput] || "mc.lifetime_revenue"

  try {
    let query = pgConnection("crm_master_contact as mc").whereNull(
      "mc.deleted_at"
    )

    // Search
    if (q) {
      const like = `%${q.toLowerCase()}%`
      query = query.where((b: any) => {
        b.whereRaw("LOWER(mc.display_name) LIKE ?", [like]).orWhereRaw(
          "LOWER(mc.primary_email_lower) LIKE ?",
          [like]
        )
      })
    }

    // Filter
    if (filter === "with_email") {
      query = query.whereNotNull("mc.primary_email_lower")
    } else if (filter === "only_webshop") {
      query = query.whereExists(function (this: any) {
        this.select("*")
          .from("crm_master_source_link as sl")
          .whereRaw("sl.master_id = mc.id")
          .whereIn("sl.source", [
            "vod_records_db1",
            "vod_records_db2013",
            "vod_records_db2013_alt",
          ])
      })
    } else if (filter === "only_mo_pdf") {
      // Master ist NUR via mo_pdf gelinked
      query = query.whereExists(function (this: any) {
        this.select("*")
          .from("crm_master_source_link as sl")
          .whereRaw("sl.master_id = mc.id")
          .where("sl.source", "mo_pdf")
      })
      query = query.whereNotExists(function (this: any) {
        this.select("*")
          .from("crm_master_source_link as sl2")
          .whereRaw("sl2.master_id = mc.id")
          .whereNotIn("sl2.source", ["mo_pdf"])
      })
    } else if (filter === "test") {
      query = query.where("mc.is_test", true)
    } else if (filter === "internal_owner") {
      query = query.whereRaw("'internal_owner' = ANY(mc.tags)")
    } else if (filter === "blocked") {
      query = query.where("mc.is_blocked", true)
    }
    // "all" → no filter

    if (tier) {
      query = query.where("mc.tier", tier)
    }
    if (lifecycleStage) {
      query = query.where("mc.lifecycle_stage", lifecycleStage)
    }
    if (rfmSegment) {
      query = query.where("mc.rfm_segment", rfmSegment)
    }
    if (acquisitionChannel) {
      query = query.where("mc.acquisition_channel", acquisitionChannel)
    }

    // Wenn nur IDs gewünscht (für "Select all matching") — kürzerer Pfad
    if (idsOnly) {
      const idRows = await query.select("mc.id").limit(limit).offset(offset)
      const idsCountRow = await query
        .clone()
        .clearSelect()
        .clearOrder()
        .count("mc.id as total")
        .first()
      res.json({
        ids: (idRows as Array<{ id: string }>).map((r) => r.id),
        total: Number(idsCountRow?.total || 0),
      })
      return
    }

    // Count
    const countResult = await query
      .clone()
      .clearSelect()
      .clearOrder()
      .count("mc.id as total")
      .first()
    const total = Number(countResult?.total || 0)

    // List
    const contacts = await query
      .select(
        "mc.id",
        "mc.display_name",
        "mc.first_name",
        "mc.last_name",
        "mc.company",
        "mc.contact_type",
        "mc.primary_email",
        "mc.primary_email_lower",
        "mc.primary_phone",
        "mc.primary_country_code",
        "mc.primary_postal_code",
        "mc.primary_city",
        pgConnection.raw("COALESCE(mc.lifetime_revenue, 0) as lifetime_revenue"),
        pgConnection.raw(
          "COALESCE(mc.total_transactions, 0) as total_transactions"
        ),
        "mc.first_seen_at",
        "mc.last_seen_at",
        "mc.medusa_customer_id",
        "mc.tier",
        "mc.lifecycle_stage",
        "mc.rfm_segment",
        "mc.health_score",
        "mc.acquisition_channel",
        "mc.avatar_url",
        pgConnection.raw("COALESCE(mc.tags, '{}') as tags"),
        pgConnection.raw("COALESCE(mc.is_test, false) as is_test"),
        pgConnection.raw("COALESCE(mc.is_blocked, false) as is_blocked"),
        "mc.manual_review_status",
        "mc.created_at",
        // Source-Liste als Array (Subquery)
        pgConnection.raw(
          `(SELECT array_agg(DISTINCT sl.source ORDER BY sl.source)
            FROM crm_master_source_link sl
            WHERE sl.master_id = mc.id) as sources`
        ),
        pgConnection.raw(
          `(SELECT COUNT(*) FROM crm_master_source_link sl WHERE sl.master_id = mc.id) as source_link_count`
        )
      )
      .orderBy(sortColumn, order)
      .orderBy("mc.id", "asc")
      .limit(limit)
      .offset(offset)

    res.json({
      contacts: (contacts as Array<Record<string, unknown>>).map((c) => ({
        id: c.id as string,
        display_name: c.display_name as string,
        first_name: c.first_name as string | null,
        last_name: c.last_name as string | null,
        company: c.company as string | null,
        contact_type: c.contact_type as string | null,
        primary_email: c.primary_email as string | null,
        primary_phone: c.primary_phone as string | null,
        primary_country_code: c.primary_country_code as string | null,
        primary_postal_code: c.primary_postal_code as string | null,
        primary_city: c.primary_city as string | null,
        lifetime_revenue: Number(c.lifetime_revenue),
        total_transactions: Number(c.total_transactions),
        first_seen_at: c.first_seen_at
          ? new Date(c.first_seen_at as string).toISOString()
          : null,
        last_seen_at: c.last_seen_at
          ? new Date(c.last_seen_at as string).toISOString()
          : null,
        medusa_customer_id: c.medusa_customer_id as string | null,
        tier: c.tier as string | null,
        lifecycle_stage: c.lifecycle_stage as string | null,
        rfm_segment: c.rfm_segment as string | null,
        health_score: c.health_score !== null && c.health_score !== undefined ? Number(c.health_score) : null,
        acquisition_channel: c.acquisition_channel as string | null,
        avatar_url: c.avatar_url as string | null,
        tags: (c.tags as string[]) || [],
        is_test: Boolean(c.is_test),
        is_blocked: Boolean(c.is_blocked),
        manual_review_status: c.manual_review_status as string | null,
        created_at: c.created_at
          ? new Date(c.created_at as string).toISOString()
          : null,
        sources: (c.sources as string[]) || [],
        source_link_count: Number(c.source_link_count || 0),
      })),
      total,
      limit,
      offset,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[admin/crm/contacts] error:", message)
    res.status(500).json({ ok: false, error: message })
  }
}
