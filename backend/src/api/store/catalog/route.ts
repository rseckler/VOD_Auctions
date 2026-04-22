import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// Map German (and other common) country names to English DB values
const COUNTRY_ALIASES: Record<string, string> = {
  // German → English
  "deutschland": "Germany",
  "vereinigte staaten": "United States",
  "vereinigte staaten von amerika": "United States",
  "usa": "United States",
  "vereinigtes königreich": "United Kingdom",
  "grossbritannien": "United Kingdom",
  "großbritannien": "United Kingdom",
  "england": "United Kingdom",
  "uk": "United Kingdom",
  "frankreich": "France",
  "niederlande": "Netherlands",
  "holland": "Netherlands",
  "italien": "Italy",
  "belgien": "Belgium",
  "kanada": "Canada",
  "schweiz": "Switzerland",
  "australien": "Australia",
  "spanien": "Spain",
  "österreich": "Austria",
  "oesterreich": "Austria",
  "schweden": "Sweden",
  "norwegen": "Norway",
  "polen": "Poland",
  "dänemark": "Denmark",
  "daenemark": "Denmark",
  "jugoslawien": "Yugoslavia",
  "slowenien": "Slovenia",
  "ungarn": "Hungary",
  "griechenland": "Greece",
  "mexiko": "Mexico",
  "neuseeland": "New Zealand",
  "finnland": "Finland",
  "südafrika": "South Africa",
  "suedafrika": "South Africa",
  "russland": "Russia",
  "russische föderation": "Russia",
  "tschechien": "Czech Republic",
  "tschechische republik": "Czech Republic",
  "brasilien": "Brazil",
  "argentinien": "Argentina",
  "irland": "Ireland",
  "island": "Iceland",
  "indien": "India",
  "slowakei": "Slovakia",
  "hongkong": "Hong Kong",
  "luxemburg": "Luxembourg",
  "rumänien": "Romania",
  "rumaenien": "Romania",
  "kroatien": "Croatia",
  // ISO 2-letter country codes
  "de": "Germany",
  "us": "United States",
  "gb": "United Kingdom",
  "fr": "France",
  "nl": "Netherlands",
  "it": "Italy",
  "be": "Belgium",
  "ca": "Canada",
  "ch": "Switzerland",
  "au": "Australia",
  "es": "Spain",
  "at": "Austria",
  "se": "Sweden",
  "no": "Norway",
  "pl": "Poland",
  "dk": "Denmark",
  "si": "Slovenia",
  "hu": "Hungary",
  "gr": "Greece",
  "mx": "Mexico",
  "nz": "New Zealand",
  "fi": "Finland",
  "za": "South Africa",
  "ru": "Russia",
  "cz": "Czech Republic",
  "br": "Brazil",
  "ar": "Argentina",
  "ie": "Ireland",
  "is": "Iceland",
  "in": "India",
  "sk": "Slovakia",
  "hk": "Hong Kong",
  "lu": "Luxembourg",
  "ro": "Romania",
  "hr": "Croatia",
  "jp": "Japan",
  "pt": "Portugal",
  "yu": "Yugoslavia",
  // French → English
  "états-unis": "United States",
  "etats-unis": "United States",
  "royaume-uni": "United Kingdom",
  "pays-bas": "Netherlands",
  "italie": "Italy",
  "belgique": "Belgium",
  "espagne": "Spain",
  "autriche": "Austria",
  "suède": "Sweden",
  "norvège": "Norway",
  "pologne": "Poland",
  "danemark": "Denmark",
  "hongrie": "Hungary",
  "grèce": "Greece",
  "mexique": "Mexico",
  "nouvelle-zélande": "New Zealand",
  "finlande": "Finland",
  "russie": "Russia",
  "brésil": "Brazil",
  "argentine": "Argentina",
  "irlande": "Ireland",
  "islande": "Iceland",
  "inde": "India",
  "slovaquie": "Slovakia",
  "roumanie": "Romania",
  "croatie": "Croatia",
}

function resolveCountry(input: string): string {
  const trimmed = input.trim()
  const lower = trimmed.toLowerCase()
  return COUNTRY_ALIASES[lower] || trimmed
}

// GET /store/catalog — Public: browse releases (paginated, searchable)
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const {
    page = "1",
    limit = "24",
    search,
    format,
    category,
    country,
    year_from,
    year_to,
    label,
    artist,
    condition,
    sort = "artist",
    order = "asc",
    genre,
    decade,
    for_sale,
  } = req.query as Record<string, string>

  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit)
  const pageSize = Math.min(100, parseInt(limit))

  let query = pgConnection("Release")
    .select(
      "Release.id",
      "Release.title",
      "Release.slug",
      "Release.format",
      "Release.format_id",
      "Release.product_category",
      "Release.year",
      "Release.country",
      "Release.coverImage",
      "Release.catalogNumber",
      "Release.article_number",
      "Release.legacy_condition",
      "Release.legacy_price",
      "Release.legacy_available",
      "Release.legacy_format_detail",
      "Release.auction_status",
      "Release.sale_mode",
      "Release.direct_price",
      "Artist.name as artist_name",
      "Artist.slug as artist_slug",
      "Label.name as label_name",
      "Label.slug as label_slug",
      "PressOrga.name as press_orga_name",
      "PressOrga.slug as press_orga_slug",
      "Format.name as format_name",
      "Format.format_group"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("PressOrga", "Release.pressOrgaId", "PressOrga.id")
    .leftJoin("Format", "Release.format_id", "Format.id")

  let countQuery = pgConnection("Release")

  // Search filter — uses UNION over 5 index-backed sub-queries instead of
  // ILIKE-OR-across-tables. Each sub-query hits its own GIN trgm index
  // (lower(col) gin_trgm_ops) so Postgres builds a BitmapOr plan with ~100ms
  // execution instead of ~6s Seq-Scan. Same semantic as the old query,
  // verified via count-match for 5 test terms. See migration
  // 2026-04-22_search_trigram_indexes.sql for the index layout.
  if (search && typeof search === "string" && search.trim()) {
    const lowerTerm = `%${search.trim().toLowerCase()}%`
    const matchSubquery = pgConnection.raw(`(
      SELECT r.id FROM "Release" r WHERE lower(r.title) LIKE ?
      UNION
      SELECT r.id FROM "Release" r WHERE lower(r."catalogNumber") LIKE ?
      UNION
      SELECT r.id FROM "Release" r WHERE lower(r.article_number) LIKE ?
      UNION
      SELECT r.id FROM "Release" r JOIN "Artist" a ON a.id = r."artistId"
        WHERE lower(a.name) LIKE ?
      UNION
      SELECT r.id FROM "Release" r JOIN "Label" l ON l.id = r."labelId"
        WHERE lower(l.name) LIKE ?
    )`, [lowerTerm, lowerTerm, lowerTerm, lowerTerm, lowerTerm])
    query = query.whereIn("Release.id", matchSubquery)
    countQuery = countQuery.whereIn("Release.id", matchSubquery)
  }

  // Format filter
  if (format && typeof format === "string") {
    query = query.where("Release.format", format)
    countQuery = countQuery.where("Release.format", format)
  }

  // Category filter (7 categories: tapes, vinyl, cd, vhs, band_literature, label_literature, press_literature)
  //
  // NOTE: Legacy releases classify via Format.kat (a legacy column that groups
  // vinyl-formats as kat=2 and everything-else as kat=1). Discogs-imported
  // releases don't have format_id set (only the `format` enum), so we need
  // an OR-clause that also matches via the enum value when format_id IS NULL.
  // Otherwise Discogs-imports would be invisible in vinyl/tapes categories.
  if (category && typeof category === "string") {
    // Tapes = kat 1 minus CD/VHS minus book/poster/magazine/etc.
    // For Discogs-imports (format_id NULL), map via format enum:
    //   "CASSETTE" → tapes, "REEL" → tapes
    const discogsTapeFormats = ["CASSETTE", "REEL"]
    //   "LP" → vinyl
    const discogsVinylFormats = ["LP"]

    switch (category) {
      case "tapes":
        query = query.where("Release.product_category", "release")
          .whereNotIn("Release.format", ["CD", "VHS"])
          .where(function () {
            this.where("Format.kat", 1)
              .orWhere(function () {
                this.whereNull("Release.format_id")
                  .whereIn("Release.format", discogsTapeFormats)
              })
          })
        countQuery = countQuery
          .leftJoin("Format as F", "Release.format_id", "F.id")
          .where("Release.product_category", "release")
          .whereNotIn("Release.format", ["CD", "VHS"])
          .where(function () {
            this.where("F.kat", 1)
              .orWhere(function () {
                this.whereNull("Release.format_id")
                  .whereIn("Release.format", discogsTapeFormats)
              })
          })
        break
      case "vinyl":
        query = query.where("Release.product_category", "release")
          .where(function () {
            this.where("Format.kat", 2)
              .orWhere(function () {
                this.whereNull("Release.format_id")
                  .whereIn("Release.format", discogsVinylFormats)
              })
          })
        countQuery = countQuery
          .leftJoin("Format as F", "Release.format_id", "F.id")
          .where("Release.product_category", "release")
          .where(function () {
            this.where("F.kat", 2)
              .orWhere(function () {
                this.whereNull("Release.format_id")
                  .whereIn("Release.format", discogsVinylFormats)
              })
          })
        break
      case "cd":
        query = query.where("Release.format", "CD")
        countQuery = countQuery.where("Release.format", "CD")
        break
      case "vhs":
        query = query.where("Release.format", "VHS")
        countQuery = countQuery.where("Release.format", "VHS")
        break
      case "band_literature":
        query = query.where("Release.product_category", "band_literature")
        countQuery = countQuery.where("Release.product_category", "band_literature")
        break
      case "label_literature":
        query = query.where("Release.product_category", "label_literature")
        countQuery = countQuery.where("Release.product_category", "label_literature")
        break
      case "press_literature":
        query = query.where("Release.product_category", "press_literature")
        countQuery = countQuery.where("Release.product_category", "press_literature")
        break
    }
  }

  // Country filter (accepts German, French, English names)
  if (country && typeof country === "string") {
    const resolved = resolveCountry(country)
    query = query.whereILike("Release.country", `%${resolved}%`)
    countQuery = countQuery.whereILike("Release.country", `%${resolved}%`)
  }

  // Year filter (exact match when only year_from, range when both)
  if (year_from && typeof year_from === "string") {
    if (year_to && typeof year_to === "string") {
      query = query.where("Release.year", ">=", parseInt(year_from))
      countQuery = countQuery.where("Release.year", ">=", parseInt(year_from))
      query = query.where("Release.year", "<=", parseInt(year_to))
      countQuery = countQuery.where("Release.year", "<=", parseInt(year_to))
    } else {
      query = query.where("Release.year", parseInt(year_from))
      countQuery = countQuery.where("Release.year", parseInt(year_from))
    }
  }

  // Label filter
  if (label && typeof label === "string" && label.trim()) {
    query = query.whereILike("Label.name", `%${label.trim()}%`)
    countQuery = countQuery
      .leftJoin("Label as LF", "Release.labelId", "LF.id")
      .whereILike("LF.name", `%${label.trim()}%`)
  }

  // Artist filter
  if (artist && typeof artist === "string" && artist.trim()) {
    query = query.whereILike("Artist.name", `%${artist.trim()}%`)
    countQuery = countQuery
      .leftJoin("Artist as AF", "Release.artistId", "AF.id")
      .whereILike("AF.name", `%${artist.trim()}%`)
  }

  // Condition filter
  if (condition && typeof condition === "string" && condition.trim()) {
    query = query.whereILike("Release.legacy_condition", `%${condition.trim()}%`)
    countQuery = countQuery.whereILike("Release.legacy_condition", `%${condition.trim()}%`)
  }

  // Only show releases that have at least one image (coverImage set)
  query = query.whereNotNull("Release.coverImage")
  countQuery = countQuery.whereNotNull("Release.coverImage")

  // For-sale filter: only show purchasable items (with any price).
  // Include both legacy_price (Auction-start / shop) and direct_price
  // (Direct-Purchase only) so Items captured via ERP stocktake session
  // (Non-Cohort-A) aren't excluded when legacy_price is NULL.
  if (for_sale === "true") {
    const salePriceClause = function (this: any) {
      this.where(function (this: any) {
        this.whereNotNull("Release.legacy_price").andWhere("Release.legacy_price", ">", 0)
      }).orWhere(function (this: any) {
        this.whereNotNull("Release.direct_price").andWhere("Release.direct_price", ">", 0)
      })
    }
    query = query.where(salePriceClause).where("Release.legacy_available", true)
    countQuery = countQuery.where(salePriceClause).where("Release.legacy_available", true)
  }

  // Genre filter: match via entity_content genre_tags on artist
  if (genre && typeof genre === "string" && genre.trim()) {
    query = query.join("entity_content as EC_genre", function () {
      this.on("Release.artistId", "=", "EC_genre.entity_id")
        .andOn(pgConnection.raw("\"EC_genre\".\"entity_type\" = 'artist'"))
    }).whereRaw("? = ANY(\"EC_genre\".\"genre_tags\")", [genre.trim()])
    countQuery = countQuery.join("entity_content as EC_genre_c", function () {
      this.on("Release.artistId", "=", "EC_genre_c.entity_id")
        .andOn(pgConnection.raw("\"EC_genre_c\".\"entity_type\" = 'artist'"))
    }).whereRaw("? = ANY(\"EC_genre_c\".\"genre_tags\")", [genre.trim()])
  }

  // Decade filter: e.g. decade=1980 → year BETWEEN 1980 AND 1989
  if (decade && typeof decade === "string") {
    const startYear = parseInt(decade)
    if (!isNaN(startYear)) {
      query = query.where("Release.year", ">=", startYear).where("Release.year", "<=", startYear + 9)
      countQuery = countQuery.where("Release.year", ">=", startYear).where("Release.year", "<=", startYear + 9)
    }
  }

  // Count total
  const [{ count: total }] = await countQuery.count("Release.id as count")

  // Sort. Price sort uses COALESCE so Direct-Purchase items without
  // legacy_price still sort sensibly by their direct_price.
  const sortField =
    sort === "price" ? `COALESCE("Release"."legacy_price", "Release"."direct_price")`
    : sort === "year" ? `"Release"."year"`
    : sort === "artist" ? `"Artist"."name"`
    : `"Release"."title"`
  const sortOrder = order === "desc" ? "desc" : "asc"

  // Secondary sort: artist→title or title→artist
  const secondarySort =
    sort === "artist" ? `"Release"."title" asc NULLS LAST`
    : sort === "title" ? `"Artist"."name" asc NULLS LAST`
    : ""

  query = query
    .orderByRaw(`${sortField} ${sortOrder} NULLS LAST${secondarySort ? `, ${secondarySort}` : ""}`)
    .offset(offset)
    .limit(pageSize)

  const releases = await query

  // Add is_purchasable + effective_price. For direct-purchase-only items
  // (legacy_price NULL, direct_price set — typical for Non-Cohort-A
  // releases captured via ERP stocktake), we also normalize legacy_price
  // to the direct_price so existing frontend code that reads legacy_price
  // doesn't render NaN.
  const enrichedReleases = releases.map((r: any) => {
    const rawLegacy = r.legacy_price != null ? Number(r.legacy_price) : null
    const rawDirect = r.direct_price != null ? Number(r.direct_price) : null
    const effective_price = rawLegacy != null && rawLegacy > 0 ? rawLegacy
      : rawDirect != null && rawDirect > 0 ? rawDirect
      : null
    return {
      ...r,
      legacy_price: rawLegacy != null && rawLegacy > 0 ? rawLegacy
        : rawDirect != null && rawDirect > 0 ? rawDirect
        : r.legacy_price,
      effective_price,
      is_purchasable: effective_price != null && r.legacy_available !== false,
    }
  })

  res.json({
    releases: enrichedReleases,
    total: parseInt(String(total)),
    page: parseInt(page),
    limit: pageSize,
    pages: Math.ceil(parseInt(String(total)) / pageSize),
  })
}
