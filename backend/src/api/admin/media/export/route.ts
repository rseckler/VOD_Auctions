import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /admin/media/export — Export selected releases as CSV
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { ids } = req.body as { ids: string[] }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: "ids must be a non-empty array" })
    return
  }

  const releases = await pgConnection("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.article_number",
      "Release.catalogNumber",
      "Release.barcode",
      "Release.format",
      "Release.year",
      "Release.country",
      "Release.estimated_value",
      "Release.media_condition",
      "Release.sleeve_condition",
      "Release.auction_status",
      "Release.sale_mode",
      "Release.direct_price",
      "Release.legacy_price",
      "Release.discogs_id",
      "Release.discogs_lowest_price",
      "Release.discogs_median_price",
      "Release.inventory",
      "Artist.name as artist_name",
      "Label.name as label_name",
      "Format.name as format_name",
      "Format.format_group"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .whereIn("Release.id", ids)

  const headers = [
    "Article No.", "Artist", "Title", "Label", "Format", "Format Group",
    "Year", "Country", "Catalog No.", "Barcode", "Discogs ID",
    "Estimated Value", "Discogs Lowest", "Discogs Median", "Legacy Price",
    "Media Condition", "Sleeve Condition", "Auction Status", "Sale Mode",
    "Direct Price", "Inventory",
  ]

  const escCsv = (val: any): string => {
    if (val === null || val === undefined) return ""
    const s = String(val)
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const rows = releases.map((r: any) => [
    r.article_number, r.artist_name, r.title, r.label_name,
    r.format_name || r.format, r.format_group,
    r.year, r.country, r.catalogNumber, r.barcode, r.discogs_id,
    r.estimated_value, r.discogs_lowest_price, r.discogs_median_price, r.legacy_price,
    r.media_condition, r.sleeve_condition, r.auction_status, r.sale_mode,
    r.direct_price, r.inventory,
  ].map(escCsv).join(","))

  const csv = [headers.join(","), ...rows].join("\n")

  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="media-export-${new Date().toISOString().slice(0, 10)}.csv"`)
  res.send(csv)
}
