import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { buildReleaseSearchSubquery } from "../../../lib/release-search"

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

/**
 * Postgres-FTS catalog handler — the original (pre-Meilisearch) implementation.
 *
 * Kept as named export so the new Meili-backed route.ts can fall through here
 * when (a) the SEARCH_MEILI_CATALOG flag is off, (b) the in-memory health
 * flag has tripped, or (c) a Meili runtime error is caught.
 *
 * No functional changes from the pre-rc40 version — only moved into a named
 * function and the response is returned via callbacks instead of directly
 * on `res`.
 */
export async function catalogGetPostgres(
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

  if (search && typeof search === "string" && search.trim()) {
    const matchSubquery = buildReleaseSearchSubquery(pgConnection, search)
    if (matchSubquery) {
      query = query.whereIn("Release.id", matchSubquery)
      countQuery = countQuery.whereIn("Release.id", matchSubquery)
    }
  }

  if (format && typeof format === "string") {
    query = query.where("Release.format", format)
    countQuery = countQuery.where("Release.format", format)
  }

  if (category && typeof category === "string") {
    const discogsTapeFormats = ["CASSETTE", "REEL"]
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

  if (country && typeof country === "string") {
    const resolved = resolveCountry(country)
    query = query.whereILike("Release.country", `%${resolved}%`)
    countQuery = countQuery.whereILike("Release.country", `%${resolved}%`)
  }

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

  if (label && typeof label === "string" && label.trim()) {
    query = query.whereILike("Label.name", `%${label.trim()}%`)
    countQuery = countQuery
      .leftJoin("Label as LF", "Release.labelId", "LF.id")
      .whereILike("LF.name", `%${label.trim()}%`)
  }

  if (artist && typeof artist === "string" && artist.trim()) {
    query = query.whereILike("Artist.name", `%${artist.trim()}%`)
    countQuery = countQuery
      .leftJoin("Artist as AF", "Release.artistId", "AF.id")
      .whereILike("AF.name", `%${artist.trim()}%`)
  }

  if (condition && typeof condition === "string" && condition.trim()) {
    query = query.whereILike("Release.legacy_condition", `%${condition.trim()}%`)
    countQuery = countQuery.whereILike("Release.legacy_condition", `%${condition.trim()}%`)
  }

  query = query.whereNotNull("Release.coverImage")
  countQuery = countQuery.whereNotNull("Release.coverImage")

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

  if (decade && typeof decade === "string") {
    const startYear = parseInt(decade)
    if (!isNaN(startYear)) {
      query = query.where("Release.year", ">=", startYear).where("Release.year", "<=", startYear + 9)
      countQuery = countQuery.where("Release.year", ">=", startYear).where("Release.year", "<=", startYear + 9)
    }
  }

  const [{ count: total }] = await countQuery.count("Release.id as count")

  const sortField =
    sort === "price" ? `COALESCE("Release"."legacy_price", "Release"."direct_price")`
    : sort === "year" ? `"Release"."year"`
    : sort === "artist" ? `"Artist"."name"`
    : `"Release"."title"`
  const sortOrder = order === "desc" ? "desc" : "asc"

  const secondarySort =
    sort === "artist" ? `"Release"."title" asc NULLS LAST`
    : sort === "title" ? `"Artist"."name" asc NULLS LAST`
    : ""

  query = query
    .orderByRaw(`${sortField} ${sortOrder} NULLS LAST${secondarySort ? `, ${secondarySort}` : ""}`)
    .offset(offset)
    .limit(pageSize)

  const releases = await query

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
