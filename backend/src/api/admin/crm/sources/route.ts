import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/crm/sources — Pipeline-Health pro CRM-Datenquelle
//
// Aggregiert über `crm_source_status` (View) + `crm_master_resolver_run` +
// `crm_layout_review_queue`. Sprint S1, Decision 3A — Sources-Tab.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const [pipelineRows, resolverRows, layoutQueueRows, masterCounts] =
      await Promise.all([
        pgConnection("crm_source_status").select("*"),
        pgConnection("crm_master_resolver_run")
          .select(
            "id",
            "algorithm_version",
            "status",
            "started_at",
            "finished_at",
            "stage1_email_matches",
            "stage2_address_matches",
            "stage3_name_plz_matches",
            "stage4_imap_enriched",
            "total_master_contacts_existing",
            "total_master_contacts_created",
            "total_source_links_created",
            "manual_review_cases_added",
            "notes"
          )
          .orderBy("started_at", "desc")
          .limit(10),
        pgConnection("crm_layout_review_queue")
          .select("source", "status")
          .count("* as count")
          .groupBy("source", "status"),
        pgConnection("crm_master_contact")
          .whereNull("deleted_at")
          .count("* as total")
          .first(),
      ])

    const layoutByCategory: Record<string, Record<string, number>> = {}
    for (const row of layoutQueueRows as Array<{
      source: string
      status: string
      count: number | string
    }>) {
      if (!layoutByCategory[row.source]) layoutByCategory[row.source] = {}
      layoutByCategory[row.source][row.status] = Number(row.count)
    }

    const sources = (pipelineRows as Array<Record<string, unknown>>).map(
      (row) => {
        const source = String(row.source)
        const lastSuccess = row.last_successful_run_at
          ? new Date(row.last_successful_run_at as string)
          : null
        const lastRun = row.last_run_at
          ? new Date(row.last_run_at as string)
          : null
        const totalRuns = Number(row.total_runs || 0)
        const successfulRuns = Number(row.successful_runs || 0)
        const failedRuns = Number(row.failed_runs || 0)
        const activeRuns = Number(row.active_runs || 0)
        const staleRuns = Number(row.stale_runs || 0)
        const reviewQueue = layoutByCategory[source] || {}
        const openReviews = Number(reviewQueue["open"] || 0)

        // Health-Heuristik
        let health: "ok" | "warning" | "stale" | "failed" | "never_run"
        if (totalRuns === 0) health = "never_run"
        else if (failedRuns > 0 && lastSuccess === null) health = "failed"
        else if (staleRuns > 0) health = "stale"
        else if (failedRuns > 0 || openReviews > 0) health = "warning"
        else health = "ok"

        const successRate =
          totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : null

        return {
          source,
          pipeline: row.pipeline as string,
          health,
          last_run_at: lastRun?.toISOString() || null,
          last_successful_run_at: lastSuccess?.toISOString() || null,
          total_runs: totalRuns,
          successful_runs: successfulRuns,
          failed_runs: failedRuns,
          active_runs: activeRuns,
          stale_runs: staleRuns,
          success_rate_pct: successRate,
          total_rows_inserted: Number(row.total_rows_inserted || 0),
          total_rows_updated: row.total_rows_updated
            ? Number(row.total_rows_updated)
            : null,
          layout_review_open: openReviews,
          layout_review_resolved: Number(reviewQueue["resolved"] || 0),
          layout_review_skipped: Number(reviewQueue["skipped"] || 0),
        }
      }
    )

    sources.sort((a, b) => a.source.localeCompare(b.source))

    const resolverHistory = (resolverRows as Array<Record<string, unknown>>)
      .map((r) => ({
        id: r.id as string,
        algorithm_version: r.algorithm_version as string | null,
        status: r.status as string | null,
        started_at: r.started_at
          ? new Date(r.started_at as string).toISOString()
          : null,
        finished_at: r.finished_at
          ? new Date(r.finished_at as string).toISOString()
          : null,
        duration_sec:
          r.started_at && r.finished_at
            ? Math.round(
                (new Date(r.finished_at as string).getTime() -
                  new Date(r.started_at as string).getTime()) /
                  1000
              )
            : null,
        stage1_email_matches: r.stage1_email_matches
          ? Number(r.stage1_email_matches)
          : null,
        stage2_address_matches: r.stage2_address_matches
          ? Number(r.stage2_address_matches)
          : null,
        stage3_name_plz_matches: r.stage3_name_plz_matches
          ? Number(r.stage3_name_plz_matches)
          : null,
        stage4_imap_enriched: r.stage4_imap_enriched
          ? Number(r.stage4_imap_enriched)
          : null,
        total_master_contacts_existing: r.total_master_contacts_existing
          ? Number(r.total_master_contacts_existing)
          : null,
        total_master_contacts_created: r.total_master_contacts_created
          ? Number(r.total_master_contacts_created)
          : null,
        manual_review_cases_added: r.manual_review_cases_added
          ? Number(r.manual_review_cases_added)
          : null,
        notes: r.notes as string | null,
      }))

    res.json({
      sources,
      resolver_history: resolverHistory,
      master_contacts_total: Number(masterCounts?.total || 0),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[admin/crm/sources] error:", message)
    res.status(500).json({ ok: false, error: message })
  }
}
