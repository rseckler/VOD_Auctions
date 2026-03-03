import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// GET /admin/sync/legacy — Legacy sync details
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const [legacyLogs, recentAdded, tableCounts] = await Promise.all([
    // Last 20 legacy sync logs
    pgConnection("sync_log")
      .where("sync_type", "legacy")
      .orderBy("sync_date", "desc")
      .limit(20),

    // Last 50 recently synced releases
    pgConnection("Release")
      .select(
        "Release.id",
        "Release.title",
        "Release.format",
        "Release.year",
        "Release.legacy_last_synced",
        "Artist.name as artist_name"
      )
      .leftJoin("Artist", "Release.artistId", "Artist.id")
      .whereNotNull("Release.legacy_last_synced")
      .orderBy("Release.legacy_last_synced", "desc")
      .limit(50),

    // Table counts
    Promise.all([
      pgConnection("Artist").count("id as count").first(),
      pgConnection("Label").count("id as count").first(),
      pgConnection("Release").count("id as count").first(),
      pgConnection("Image").count("id as count").first(),
    ]),
  ])

  res.json({
    sync_logs: legacyLogs,
    recent_added: recentAdded,
    counts: {
      artists: Number(tableCounts[0]?.count || 0),
      labels: Number(tableCounts[1]?.count || 0),
      releases: Number(tableCounts[2]?.count || 0),
      images: Number(tableCounts[3]?.count || 0),
    },
  })
}
