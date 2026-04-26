import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { buildReleaseSearchSubquery } from "../../../lib/release-search"
import { getSiteConfig } from "../../../lib/site-config"

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
      "Release.format_v2",
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
      "Release.shop_price",
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
    query = query.where(function () {
      this.where("Release.format", format).orWhere("Release.format_v2", format)
    })
    countQuery = countQuery.where(function () {
      this.where("Release.format", format).orWhere("Release.format_v2", format)
    })
  }

  if (category && typeof category === "string") {
    const discogsTapeFormats = ["CASSETTE", "REEL"]
    const discogsVinylFormats = ["LP"]

    switch (category) {
      case "tapes":
        query = query.where("Release.product_category", "release")
          .whereNotIn("Release.format", ["CD", "VHS"])
          .whereNotIn("Release.format_v2", ["CD", "VHS"])
          .where(function () {
            this.where("Format.kat", 1)
              .orWhere(function () {
                this.whereNull("Release.format_id")
                  .where(function () {
                    this.whereIn("Release.format", discogsTapeFormats)
                      .orWhereIn("Release.format_v2", discogsTapeFormats)
                  })
              })
          })
        countQuery = countQuery
          .leftJoin("Format as F", "Release.format_id", "F.id")
          .where("Release.product_category", "release")
          .whereNotIn("Release.format", ["CD", "VHS"])
          .whereNotIn("Release.format_v2", ["CD", "VHS"])
          .where(function () {
            this.where("F.kat", 1)
              .orWhere(function () {
                this.whereNull("Release.format_id")
                  .where(function () {
                    this.whereIn("Release.format", discogsTapeFormats)
                      .orWhereIn("Release.format_v2", discogsTapeFormats)
                  })
              })
          })
        break
      case "vinyl":
        query = query.where("Release.product_category", "release")
          .where(function () {
            this.where("Format.kat", 2)
              .orWhere(function () {
                this.whereNull("Release.format_id")
                  .where(function () {
                    this.whereIn("Release.format", discogsVinylFormats)
                      .orWhereIn("Release.format_v2", discogsVinylFormats)
                  })
              })
          })
        countQuery = countQuery
          .leftJoin("Format as F", "Release.format_id", "F.id")
          .where("Release.product_category", "release")
          .where(function () {
            this.where("F.kat", 2)
              .orWhere(function () {
                this.whereNull("Release.format_id")
                  .where(function () {
                    this.whereIn("Release.format", discogsVinylFormats)
                      .orWhereIn("Release.format_v2", discogsVinylFormats)
                  })
              })
          })
        break
      case "cd":
        query = query.where(function () {
          this.where("Release.format", "CD").orWhere("Release.format_v2", "CD")
        })
        countQuery = countQuery.where(function () {
          this.where("Release.format", "CD").orWhere("Release.format_v2", "CD")
        })
        break
      case "vhs":
        query = query.where(function () {
          this.where("Release.format", "VHS").orWhere("Release.format_v2", "VHS")
        })
        countQuery = countQuery.where(function () {
          this.where("Release.format", "VHS").orWhere("Release.format_v2", "VHS")
        })
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

  // Shop-Visibility-Gate (rc47.x Preis-Modell):
  //   catalog_visibility='visible' (Default): nur Items mit shop_price > 0
  //     UND mindestens einem verifizierten Exemplar → diese erscheinen mit
  //     Preis + Add-to-Cart
  //   catalog_visibility='all': zeigt zusätzlich Items OHNE Preis (kommen
  //     ohne Preis-Tag + ohne Add-to-Cart)
  // `for_sale=true` URL-Param verschärft immer auf "nur mit Preis +
  // kaufbar", egal was die globale Einstellung sagt (Category-Links mit
  // "zum Verkauf"-Anker).
  const siteConfig = await getSiteConfig(pgConnection)
  const forceOnlyForSale = for_sale === "true"
  const defaultOnlyForSale = siteConfig.catalog_visibility === "visible"

  if (forceOnlyForSale || defaultOnlyForSale) {
    const verifiedWithShopPrice = function (this: any) {
      this.whereNotNull("Release.shop_price")
        .andWhere("Release.shop_price", ">", 0)
        .andWhereRaw(
          `EXISTS (SELECT 1 FROM erp_inventory_item ii WHERE ii.release_id = "Release"."id" AND ii.last_stocktake_at IS NOT NULL AND ii.price_locked = true)`
        )
    }
    // rc49.7: legacy_available nicht mehr im Shop-Visibility-Gate. Franks
    // Verify+price_locked ist Authority — siehe PRICING_MODEL.md.
    query = query.where(verifiedWithShopPrice)
    countQuery = countQuery.where(verifiedWithShopPrice)
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
    sort === "price" ? `"Release"."shop_price"`
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

  // Verified-Set für is_purchasable nachladen (nur für die tatsächlich
  // returned page — max 100 IDs, EXISTS-Scan via Index auf release_id).
  const releaseIds = releases.map((r: any) => r.id)
  const verifiedIds = new Set<string>()
  if (releaseIds.length > 0) {
    const verifiedRows = await pgConnection("erp_inventory_item")
      .whereIn("release_id", releaseIds)
      .whereNotNull("last_stocktake_at")
      .where("price_locked", true)
      .select("release_id")
    for (const row of verifiedRows) verifiedIds.add(row.release_id)
  }

  const enrichedReleases = releases.map((r: any) => {
    const rawShop = r.shop_price != null ? Number(r.shop_price) : null
    const rawLegacy = r.legacy_price != null ? Number(r.legacy_price) : null
    const isVerified = verifiedIds.has(r.id)
    const hasShopPrice = rawShop != null && rawShop > 0
    const effective_price = hasShopPrice && isVerified ? rawShop : null
    return {
      ...r,
      shop_price: rawShop,
      legacy_price: rawLegacy, // info only — NIE als Shop-Preis darstellen
      effective_price,
      is_purchasable: effective_price != null,
      is_verified: isVerified,
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
