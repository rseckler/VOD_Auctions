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
    visibility,
    sort = "artist",
    order = "asc",
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
      "Release.legacy_format_detail",
      "Release.auction_status",
      "Release.sale_mode",
      "Release.direct_price",
      "Artist.name as artist_name",
      "Artist.slug as artist_slug",
      "Label.name as label_name",
      "Label.slug as label_slug",
      "Format.name as format_name",
      "Format.format_group"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")

  let countQuery = pgConnection("Release")

  // Search filter
  if (search && typeof search === "string" && search.trim()) {
    const term = `%${search.trim()}%`
    query = query.where(function () {
      this.whereILike("Release.title", term)
        .orWhereILike("Release.catalogNumber", term)
        .orWhereILike("Release.article_number", term)
        .orWhereILike("Artist.name", term)
        .orWhereILike("Label.name", term)
    })
    countQuery = countQuery
      .leftJoin("Artist", "Release.artistId", "Artist.id")
      .leftJoin("Label", "Release.labelId", "Label.id")
      .where(function () {
        this.whereILike("Release.title", term)
          .orWhereILike("Release.catalogNumber", term)
          .orWhereILike("Artist.name", term)
          .orWhereILike("Label.name", term)
      })
  }

  // Format filter
  if (format && typeof format === "string") {
    query = query.where("Release.format", format)
    countQuery = countQuery.where("Release.format", format)
  }

  // Category filter (typ/kat-based: tapes, vinyl, band_literature, label_literature, press_literature)
  if (category && typeof category === "string") {
    switch (category) {
      case "tapes":
        query = query.where("Release.product_category", "release").where("Format.kat", 1)
        countQuery = countQuery
          .leftJoin("Format as F", "Release.format_id", "F.id")
          .where("Release.product_category", "release").where("F.kat", 1)
        break
      case "vinyl":
        query = query.where("Release.product_category", "release").where("Format.kat", 2)
        countQuery = countQuery
          .leftJoin("Format as F", "Release.format_id", "F.id")
          .where("Release.product_category", "release").where("F.kat", 2)
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

  // Visibility filter — read from site_config if not explicitly passed
  const siteConfig = await pgConnection("site_config").where("id", "default").first()
  const effectiveVisibility = visibility || siteConfig?.catalog_visibility || "all"

  if (effectiveVisibility === "visible") {
    query = query
      .whereNotNull("Release.coverImage")
      .whereNotNull("Release.legacy_price")
    countQuery = countQuery
      .whereNotNull("Release.coverImage")
      .whereNotNull("Release.legacy_price")
  } else if (effectiveVisibility === "hidden") {
    query = query.where(function () {
      this.whereNull("Release.coverImage")
        .orWhereNull("Release.legacy_price")
    })
    countQuery = countQuery.where(function () {
      this.whereNull("Release.coverImage")
        .orWhereNull("Release.legacy_price")
    })
  }

  // Count total
  const [{ count: total }] = await countQuery.count("Release.id as count")

  // Sort
  const sortField =
    sort === "price" ? `"Release"."legacy_price"`
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

  res.json({
    releases,
    total: parseInt(String(total)),
    page: parseInt(page),
    limit: pageSize,
    pages: Math.ceil(parseInt(String(total)) / pageSize),
  })
}
