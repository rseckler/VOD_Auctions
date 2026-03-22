import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import * as fs from "fs"
import * as path from "path"

// GET /admin/entity-content/overhaul-status — Status dashboard for entity content overhaul
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  // 1. Read pipeline progress file (if exists)
  const progressPath = path.resolve(
    __dirname,
    "../../../../../../scripts/entity_overhaul/data/entity_overhaul_progress.json"
  )
  let pipelineStatus: any = null
  try {
    if (fs.existsSync(progressPath)) {
      const raw = fs.readFileSync(progressPath, "utf-8")
      pipelineStatus = JSON.parse(raw)
    }
  } catch {
    // File not found or invalid — that's fine
  }

  // 2. DB stats: content quality breakdown per entity type
  const qualityStats = await pgConnection.raw(`
    SELECT
      entity_type,
      COUNT(*)::int as total_entities,
      COUNT(CASE WHEN description IS NOT NULL AND description != '' THEN 1 END)::int as with_description,
      COUNT(CASE WHEN short_description IS NOT NULL AND short_description != '' THEN 1 END)::int as with_short_desc,
      COUNT(CASE WHEN genre_tags IS NOT NULL AND array_length(genre_tags, 1) > 0 THEN 1 END)::int as with_genre_tags,
      COUNT(CASE WHEN country IS NOT NULL AND country != '' THEN 1 END)::int as with_country,
      COUNT(CASE WHEN founded_year IS NOT NULL AND founded_year != '' THEN 1 END)::int as with_year,
      COUNT(CASE WHEN external_links IS NOT NULL AND external_links::text != '{}' AND external_links::text != 'null' THEN 1 END)::int as with_links,
      COUNT(CASE WHEN is_published THEN 1 END)::int as published,
      COUNT(CASE WHEN ai_generated THEN 1 END)::int as ai_generated,
      AVG(CASE WHEN description IS NOT NULL AND description != '' THEN LENGTH(description) END)::int as avg_description_length,
      MIN(ai_generated_at) as first_generated,
      MAX(ai_generated_at) as last_generated
    FROM entity_content
    GROUP BY entity_type
    ORDER BY entity_type
  `)

  // 3. Total entity counts (including those without entity_content records)
  const totalEntities = await pgConnection.raw(`
    SELECT
      'artist' as entity_type,
      (SELECT COUNT(*)::int FROM "Artist") as total
    UNION ALL
    SELECT
      'label' as entity_type,
      (SELECT COUNT(*)::int FROM "Label") as total
    UNION ALL
    SELECT
      'press_orga' as entity_type,
      (SELECT COUNT(*)::int FROM "PressOrga") as total
  `)

  // 4. Priority tier breakdown (based on release counts)
  const priorityBreakdown = await pgConnection.raw(`
    WITH artist_counts AS (
      SELECT "artistId" as entity_id, 'artist' as entity_type, COUNT(*)::int as release_count
      FROM "Release" WHERE "artistId" IS NOT NULL
      GROUP BY "artistId"
    ),
    label_counts AS (
      SELECT "labelId" as entity_id, 'label' as entity_type, COUNT(*)::int as release_count
      FROM "Release" WHERE "labelId" IS NOT NULL
      GROUP BY "labelId"
    ),
    press_counts AS (
      SELECT "pressOrgaId" as entity_id, 'press_orga' as entity_type, COUNT(*)::int as release_count
      FROM "Release" WHERE "pressOrgaId" IS NOT NULL
      GROUP BY "pressOrgaId"
    ),
    all_counts AS (
      SELECT * FROM artist_counts
      UNION ALL SELECT * FROM label_counts
      UNION ALL SELECT * FROM press_counts
    )
    SELECT
      entity_type,
      COUNT(CASE WHEN release_count > 10 THEN 1 END)::int as p1_count,
      COUNT(CASE WHEN release_count BETWEEN 3 AND 10 THEN 1 END)::int as p2_count,
      COUNT(CASE WHEN release_count BETWEEN 1 AND 2 THEN 1 END)::int as p3_count
    FROM all_counts
    GROUP BY entity_type
    ORDER BY entity_type
  `)

  // 5. Check if musician table exists and get counts
  let musicianStats = null
  try {
    const musicianResult = await pgConnection.raw(`
      SELECT
        (SELECT COUNT(*)::int FROM musician) as total_musicians,
        (SELECT COUNT(*)::int FROM musician_role) as total_roles,
        (SELECT COUNT(DISTINCT musician_id)::int FROM musician_role) as musicians_with_roles,
        (SELECT COUNT(DISTINCT artist_id)::int FROM musician_role) as artists_with_members
    `)
    musicianStats = musicianResult.rows[0]
  } catch {
    // Table doesn't exist yet — that's expected
  }

  // 6. Check overhaul script process status on VPS
  let processRunning = false
  try {
    const { execSync } = require("child_process")
    const result = execSync("pgrep -f 'orchestrator.py' 2>/dev/null || echo ''", {
      encoding: "utf-8",
      timeout: 3000,
    }).trim()
    processRunning = result.length > 0
  } catch {
    // Not running or can't check
  }

  // Build response
  const totals: Record<string, number> = {}
  for (const row of totalEntities.rows) {
    totals[row.entity_type] = row.total
  }

  const quality: Record<string, any> = {}
  for (const row of qualityStats.rows) {
    quality[row.entity_type] = {
      total_with_content: row.total_entities,
      total_in_db: totals[row.entity_type] || 0,
      with_description: row.with_description,
      with_short_desc: row.with_short_desc,
      with_genre_tags: row.with_genre_tags,
      with_country: row.with_country,
      with_year: row.with_year,
      with_links: row.with_links,
      published: row.published,
      ai_generated: row.ai_generated,
      avg_description_length: row.avg_description_length,
      first_generated: row.first_generated,
      last_generated: row.last_generated,
    }
  }

  const priorities: Record<string, any> = {}
  for (const row of priorityBreakdown.rows) {
    priorities[row.entity_type] = {
      p1: row.p1_count,
      p2: row.p2_count,
      p3: row.p3_count,
    }
  }

  res.json({
    pipeline: pipelineStatus,
    process_running: processRunning,
    quality,
    totals,
    priorities,
    musician_stats: musicianStats,
  })
}
