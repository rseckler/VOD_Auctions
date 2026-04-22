import type { Knex } from "knex"

/**
 * Release Multi-Word Search Helper — Postgres Full-Text-Search Variante.
 *
 * Nutzt die denormalisierte `Release.search_text` Spalte + GIN tsvector
 * Index (`idx_release_search_fts`). Siehe Migration
 * `2026-04-22_release_search_text_fts.sql`.
 *
 * Query-Pattern:
 *   - User-Query wird in Tokens gesplittet (Whitespace, mind. 2 Zeichen)
 *   - Jedes Token bekommt Prefix-Suffix `:*` (matcht Substrings wie ILIKE)
 *   - Tokens per `&` verbunden → AND-Matching
 *   - `to_tsquery('simple', ...)` + `@@` gegen tsvector
 *   - Bitmap Index Scan via `idx_release_search_fts`, ~20ms bei 52k Rows
 *
 * Beispiel: `"music various"` → tsquery `music:* & various:*`
 *   → findet `VOD-16530 = (Various, Music, Vanity Records)` ✓
 *
 * Die `search_text` Spalte enthaelt title + catalogNumber + article_number +
 * artist.name + label.name (lowercase, space-separated). Trigger
 * `release_update_search_text` haelt sie beim Release INSERT/UPDATE sync.
 *
 * LIMITATION (dokumentiert): Wenn ein Artist/Label umbenannt wird, updated
 * der Trigger NICHT automatisch alle zugehoerigen Release-Rows. Kommt bei
 * VOD praktisch nicht vor; wenn doch, `scripts/refresh_release_search_text.py`
 * (Follow-up) ziehen.
 *
 * USAGE:
 *   const whereClause = buildReleaseSearchWhereIn(q)
 *   if (whereClause) query.whereRaw(whereClause.sql, whereClause.bindings)
 */

function extractTokens(query: string): string[] {
  if (!query || typeof query !== "string") return []
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    // Remove chars that break to_tsquery (: | & ! ( ) ' and control chars)
    .map((t) => t.replace(/[:&|!()'"\\*]/g, ""))
    .filter((t) => t.length >= 2)
}

/**
 * Baut eine `to_tsquery`-kompatible String-Repraesentation.
 * Tokens werden per `&` (AND) verbunden, jedes Token als Prefix-Match `:*`
 * damit `"music"` auch `"musical"` findet.
 */
function tokensToTsQuery(tokens: string[]): string {
  return tokens.map((t) => `${t}:*`).join(" & ")
}

/**
 * Baut ein Knex.Raw-Fragment fuer ein WHERE-Clause, das die FTS-Query
 * gegen `Release.search_text` matcht. Returns `null` wenn keine Tokens.
 *
 * Nutzbar via `.whereRaw(result.sql, result.bindings)` oder in
 * `.whereIn("Release.id", pg.raw(`(SELECT id FROM "Release" WHERE ${result.sql})`, result.bindings))`.
 */
export function buildReleaseSearchWhereRaw(
  query: string
): { sql: string; bindings: string[] } | null {
  const tokens = extractTokens(query)
  if (tokens.length === 0) return null
  const tsquery = tokensToTsQuery(tokens)
  return {
    sql: `to_tsvector('simple', coalesce("Release".search_text, '')) @@ to_tsquery('simple', ?)`,
    bindings: [tsquery],
  }
}

/**
 * Variante fuer Subquery-Kontext: WHERE-Clause auf anonymen Alias `r`
 * (z.B. `FROM "Release" r` in WITH-CTEs oder INTERSECT-Subqueries).
 */
export function buildReleaseSearchWhereRawAliased(
  query: string,
  alias: string = "r"
): { sql: string; bindings: string[] } | null {
  const tokens = extractTokens(query)
  if (tokens.length === 0) return null
  const tsquery = tokensToTsQuery(tokens)
  return {
    sql: `to_tsvector('simple', coalesce("${alias}".search_text, '')) @@ to_tsquery('simple', ?)`,
    bindings: [tsquery],
  }
}

/**
 * Baut ein `Release.id IN (...)` Subquery. Praktisch fuer whereIn-Calls.
 */
export function buildReleaseSearchSubquery(
  pg: Knex,
  query: string
): Knex.Raw | null {
  const tokens = extractTokens(query)
  if (tokens.length === 0) return null
  const tsquery = tokensToTsQuery(tokens)
  return pg.raw(
    `(SELECT id FROM "Release" WHERE to_tsvector('simple', coalesce(search_text, '')) @@ to_tsquery('simple', ?))`,
    [tsquery]
  )
}

/**
 * Fuer Auto-Complete: gibt auch die Tokens einzeln zurueck, damit der
 * Caller ranking-relevante CASE WHEN im ORDER BY bauen kann.
 */
export function getSearchTokens(query: string): string[] {
  return extractTokens(query)
}
