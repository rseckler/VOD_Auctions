# Country-ISO-Migration — Implementation Plan (Variante A: Read-First, Defensiv-Tolerant)

**Companion zu:** [`COUNTRY_ISO_MIGRATION_PLAN.md`](./COUNTRY_ISO_MIGRATION_PLAN.md) (Architektur-/Entscheidungs-Dokument) + [`COUNTRY_ISO_MIGRATION_CRITICAL_REVIEW.md`](./COUNTRY_ISO_MIGRATION_CRITICAL_REVIEW.md) (Self-Review 2026-05-11)
**Status:** Ready for execution · v2 (Variante A) · 2026-05-11
**Target Release:** rc54.0 (eigener Major-Bump weil Datenmodell sich ändert)
**Reverts:** ja — Snapshot-Backup + 7-Tage-Aufbewahrung

---

## Strategie-Entscheidung: Variante A-Express (Single-Session Cutover, Robin 2026-05-11)

**Problem v1-Plan:** Backfill committed *bevor* Read-Pfade auf ISO umgestellt sind → Storefront-Filter (`?country=Germany`) und Meili-Country-Facette für ~3 h kaputt (Critical Issues #1 + #2 im Review).

**Lösung Variante A (Basis):** Read-Pfade werden **vor** dem Backfill auf **dual-tolerantes** Verhalten umgestellt. Sie funktionieren mit beiden Encodings (English Name *oder* ISO) gleichzeitig. Backfill ist dann zero-impact für die Filter.

**Lösung Variante A-Express (gewählt):** Statt 48 h Beobachtungsphase zwischen Phase 2 und 4 → **alles in einer Session** (~4-6 h Wall-Clock). Die Beobachtungsphase wird ersetzt durch:

1. **Vollständiger Discogs-Cache-Audit** (eine SQL-Query) — listet alle country-Strings die Discogs in den letzten 90 Tagen geliefert hat, gegen das Backfill-Mapping abgeglichen. Heute-Befund: Discogs liefert 71 distinct Strings, davon waren **3 nicht im ursprünglichen Mapping** („UK & France", „Australia & New Zealand", + 2 Single-Country-Aliase die auto-resolved werden) → wurden in §7 ergänzt.
2. **Supabase-Sandbox-Branch** (~$0.01/h via MCP `create_branch`) — Full-Cutover dort durchspielen, verifizieren, dann erst Prod
3. **Comprehensive Unit-Tests** für alle 92 distinct DB-Werte + 71 Discogs-Cache-Werte (siehe Phase 0.4)
4. **Live-Discogs-API-Probe** gegen 5 bekannte Release-IDs — Roundtrip-Test

→ **Null-Sekunden-Storefront-Downtime** über den gesamten Migrations-Zeitraum, **Wall-Clock ~5 h statt 72 h**.

## Ausführungs-Übersicht (Variante A-Express)

| Phase | Inhalt | Commits | Dauer | Risiko | DB-Touch |
|---|---|---|---:|---|---|
| 0 | Pre-Flight: Snapshot + Sandbox-Branch + **Discogs-Cache-Audit** + **Sandbox-Test-Cutover** | 0 | 1.5 h | Niedrig | Read-only + Snapshot-CREATE + Branch |
| 1 | Foundation: ISO-Liste + Normalizer + Synonym-Generator + defensive lookup_iso + dual-tolerant Storefront-Filter | 1 | 3 h | Niedrig | — |
| 2 | Write-Pfade härten (incl. Diff-Vergleich-Normalisierung + Warning-Log) | 2 | 3 h | Mittel | — |
| 3 | Deploy Phase 1+2 auf Prod + **30 Min Smoke-Test** (statt 48 h) | — | 0.5 h | Niedrig (dank dual-tolerant) | — |
| 4 | Backfill UPDATE (incl. Empty-String-Cleanup Step 0) | 1 SQL | 1 h | **Hoch** — abgesichert durch Snapshot + Sandbox-Pre-Run | Mass-UPDATE |
| 5 | CHECK-Constraint ADD | 1 SQL | 0.5 h | Mittel | DDL |
| 6 | Read-Pfade cleanup: dual-tolerant → ISO-only (cosmetic) | 1 | 1 h | Niedrig | — |
| 7 | Deploy Phase 6 + Synonym-Apply + Cache-Bust + Verify | — | 1 h | Niedrig | — |
| 8 | Cleanup (Snapshot-Drop nach 7 Tagen) | 1 SQL | — | Niedrig | DROP TABLE |

**Total Code-Aufwand:** ~11 h netto (Phase 0 +1.5 h durch Sandbox-Test) · **Total Wall-Clock:** ~6 h (Phasen 0-7 in einer Session, optional Pause zwischen 3 und 4 für Robin/Frank-Confirm)

**Reihenfolge ist kritisch:** (1) Sandbox-Branch-Test muss vor Prod-Deploy laufen. (2) Write-Pfade müssen *vor* dem Backfill auf den Normalizer umgestellt sein. (3) Read-Pfade müssen *vor* dem Backfill dual-tolerant sein. (4) Cleanup zu ISO-only erst *nach* Backfill + Constraint, sonst kein Schutznetz mehr.

---

## Phase 0 — Pre-Flight (1.5 h) — KRITISCH für Variante A-Express

Phase 0 ersetzt die 48 h Beobachtungsphase durch deterministische Pre-Flight-Checks. **Wenn irgendein Check fehlschlägt, NICHT in Phase 1 starten.**

### 0.1 Feature-Branch anlegen

```bash
cd /Users/robin/Documents/Claude-Work/PROJECTS/VOD_Auctions
git checkout -b feat/rc54-country-iso-migration
git push -u origin feat/rc54-country-iso-migration
```

### 0.2 Snapshot-Backup auf Prod-DB

Via Supabase MCP, einzeln freigegeben (Robin):

```sql
CREATE TABLE backup_release_country_pre_iso_migration AS
SELECT
  id,
  country AS country_pre,
  "updatedAt" AS updatedAt_pre,
  locked_fields,
  NOW() AS backed_up_at
FROM "Release"
WHERE country IS NOT NULL;
-- Erwartet: ~48.694 Rows
```

**Verify:**
```sql
SELECT COUNT(*) AS rows, COUNT(DISTINCT country_pre) AS distinct_vals
FROM backup_release_country_pre_iso_migration;
-- Erwartet: 48.694 / 88 (oder nahe dran)
```

### 0.3 Discogs-Cache-Audit (NEU — ersetzt 48h-Beobachtung)

**Zweck:** Heute liefert Discogs 71 distinct country-Strings (90-Tage-Fenster). Wir müssen sicherstellen dass ALLE davon im Backfill-Mapping abgedeckt sind, sonst schreibt der erste Discogs-Apply nach Deploy `NULL` und Frank hat ein verlorenes Feld.

```sql
-- Distinct country-Werte aus Discogs API der letzten 90 Tage
SELECT
  api_data->>'country' AS discogs_country,
  COUNT(*) AS n
FROM discogs_api_cache
WHERE is_error = false
  AND api_data ? 'country'
  AND api_data->>'country' IS NOT NULL
  AND api_data->>'country' <> ''
  AND fetched_at > NOW() - INTERVAL '90 days'
GROUP BY 1
ORDER BY n DESC;
```

**Heutiger Befund (2026-05-11):** 71 distinct, davon 3 nicht im Plan-§7-Mapping (waren):
- „UK & France" (1 row) → muss als GB ergänzt werden
- „Australia & New Zealand" (1 row) → muss als AU ergänzt werden
- „Lithuania" + „Latvia" → auto-resolved via `findCountryByName(nameEn)` — keine Aktion nötig

**Phase 0.3 Action:** Liste aus dieser Query VOR Phase 1 nochmal frisch laufen. Wenn neue Strings auftauchen, in `country-iso.ts::findCountryByName`-Aliases ergänzen (Phase 1.1) UND im Backfill-SQL (Phase 4.2).

### 0.4 Live-Discogs-API-Probe (NEU)

**Zweck:** Sicherstellen dass die `normalizeCountryToIso()`-Funktion mit *echten* Discogs-Roundtrip-Daten funktioniert (nicht nur mit dem Cache).

```bash
# 5 bekannte Release-IDs aus verschiedenen Country-Klassen
for ID in 12345 67890 11111 22222 33333; do  # Robin/Frank-Test-IDs
  curl -s "https://api.discogs.com/releases/$ID" \
    -H "Authorization: Discogs token=$DISCOGS_TOKEN" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('country'))"
done
# Verify: jede Antwort entweder ein bekannter String oder NULL.
# Wenn neuer String: ergänzen vor Phase 1.
```

### 0.5 Sandbox-Branch + Test-Cutover (NEU — Kernsicherheit für Variante A-Express)

**Zweck:** Vollen Cutover auf einer Kopie der Prod-DB durchspielen, BEVOR wir Prod anfassen.

```ts
// Via Supabase MCP
mcp__claude_ai_Supabase__create_branch({ name: "country-iso-test" })
// → liefert temporäre DB-URL, ~$0.01/h, ~5 Min Erstellungszeit
```

Auf dem Branch:
1. Schema + Daten sind 1:1-Klon von Prod (Branch-Time)
2. Backfill-SQL aus Phase 4.2 ausführen
3. CHECK-Constraint aus Phase 5 anwenden
4. Test-Queries: „Sind alle DB-Werte ISO?", „Wieviele NULL?", „Discrepanz zur Pre-Distribution?"
5. Wenn alles grün: Branch löschen, mit Phase 1 starten
6. Wenn Fehler: Mapping-Lücke fixen, neuer Branch, retry

```bash
# Test-Run gegen Sandbox-DB (replace mit Branch-DB-URL)
export SANDBOX_DB_URL="postgresql://..."
psql $SANDBOX_DB_URL -f scripts/migrations/2026-05-XX_country_iso_backfill.sql

# Post-Migration Verify auf Sandbox
psql $SANDBOX_DB_URL -c "
  SELECT
    COUNT(*) FILTER (WHERE country IS NULL) AS null_rows,
    COUNT(*) FILTER (WHERE country ~ '^[A-Z]{2}$') AS iso_rows,
    COUNT(*) FILTER (WHERE country IS NOT NULL AND country !~ '^[A-Z]{2}$') AS leftover_dirty
  FROM \"Release\";
"
# Erwartet: leftover_dirty = 0
```

**Branch-Cleanup:**
```ts
mcp__claude_ai_Supabase__delete_branch({ branch_id: "..." })
```

### 0.6 Vor-Migration-Sanity-Distribution

```sql
-- Distribution heute (für Diff-Vergleich nach Backfill)
SELECT
  CASE
    WHEN country IS NULL THEN 'NULL'
    WHEN country = '' THEN 'EMPTY'
    WHEN country ~ '^[A-Z]{2}$' THEN 'iso2-pattern'
    ELSE 'name-or-other'
  END AS bucket,
  COUNT(*) AS n
FROM "Release"
GROUP BY 1
ORDER BY 1;
-- Snapshot der Counts in [Session-Log](../sessions/) festhalten.
```

**Done when:**
- ✅ Snapshot-Tabelle existiert mit ~48.694 Rows
- ✅ Feature-Branch ist gepusht
- ✅ Discogs-Cache-Audit zeigt 0 unbekannte Strings (oder alle wurden ergänzt)
- ✅ Live-Discogs-API-Probe für 5 IDs gibt nur bekannte Strings zurück
- ✅ Sandbox-Branch-Test-Cutover war 100 % erfolgreich (`leftover_dirty = 0`)
- ✅ Pre-Distribution-Counts dokumentiert

---

## Phase 1 — Foundation (1.5 h, 1 Commit)

Schreibt nur neue Files / erweitert bestehende Maps — kein Verhaltens-Change.

### 1.1 `backend/src/admin/data/country-iso.ts` erweitern

Ergänzen:
- Type um optionales `reserved` Flag: `'iso-deprecated' | 'iso-exceptional' | 'vod-internal'`
- 4 ISO-3166-3 deprecated Codes: YU, DD, CS, SU
- 2 reserved Codes für Multi-Region: EU, WO
- `findCountryByName()`-Aliases um Multi-Region-Strings und Discogs-Schreibweisen

```ts
// Neuer Type-Header
export type IsoCountry = {
  code: string
  nameEn: string
  nameDe: string
  reserved?: 'iso-deprecated' | 'iso-exceptional' | 'vod-internal'
}

// Neue Entries (alphabetisch in ISO_COUNTRIES einsortieren)
{ code: "CS", nameEn: "Czechoslovakia / Serbia and Montenegro", nameDe: "Tschechoslowakei / Serbien und Montenegro", reserved: 'iso-deprecated' },
{ code: "DD", nameEn: "East Germany (GDR)", nameDe: "DDR", reserved: 'iso-deprecated' },
{ code: "EU", nameEn: "Europe (EU)", nameDe: "Europäische Union", reserved: 'iso-exceptional' },
{ code: "SU", nameEn: "Soviet Union (USSR)", nameDe: "Sowjetunion", reserved: 'iso-deprecated' },
{ code: "WO", nameEn: "Worldwide", nameDe: "Weltweit", reserved: 'vod-internal' },
{ code: "YU", nameEn: "Yugoslavia", nameDe: "Jugoslawien", reserved: 'iso-deprecated' },
```

`findCountryByName()`-Aliases ergänzen (komplett, Reihenfolge wichtig — exact-name match wird vor alias gemacht):

```ts
const aliases: Record<string, string> = {
  // Existierende:
  "uk": "GB",
  "usa": "US",
  "south korea": "KR",
  "north korea": "KP",
  "russia": "RU",
  "vietnam": "VN",
  "ivory coast": "CI",
  "czech republic": "CZ",
  "macedonia": "MK",
  "burma": "MM",
  // NEU: Deprecated-ISO-Aliase (für Backfill der historischen Werte)
  "east germany (gdr)": "DD",
  "east germany": "DD",
  "german democratic republic (gdr)": "DD",
  "german democratic republic": "DD",
  "gdr": "DD",
  "yugoslavia": "YU",
  "soviet union": "SU",
  "ussr": "SU",
  "czechoslovakia": "CS",
  "serbia and montenegro": "CS",
  // NEU: Multi-Region — Pure-Europe
  "europe": "EU",
  "european union": "EU",
  // NEU: Worldwide
  "worldwide": "WO",
  // NEU: Region-Sammelnamen
  "benelux": "NL",
  "scandinavia": "SE",
  // NEU: Compound — primary-country-first
  "uk & europe": "GB",
  "uk & us": "GB",
  "uk & ireland": "GB",
  "uk & germany": "GB",
  "uk, europe & us": "GB",
  "usa & europe": "US",
  "usa & canada": "US",
  "usa, canada & europe": "US",
  "usa, canada & uk": "US",
  "germany, austria, & switzerland": "DE",
  "germany & switzerland": "DE",
  "france & benelux": "FR",
}
```

### 1.2 `formatCountryLabel()` Flag-Override

```ts
const FLAG_OVERRIDE: Record<string, string> = {
  WO: "🌐",  // WO hat kein definiertes Regional-Indicator-Flag
}

export function formatCountryLabel(code: string | null | undefined): string {
  if (!code) return ""
  const country = findCountry(code)
  if (!country) return `⚠️ ${code} (non-ISO)`
  const flag = FLAG_OVERRIDE[country.code] ?? flagFor(country.code)
  return `${flag} ${country.nameEn} (${country.code})`
}
```

EU rendert via `flagFor("EU")` automatisch zu 🇪🇺 (Regional-Indicators `E+U`) — kein Override nötig.

### 1.3 Neuer Helper `backend/src/lib/country-normalize.ts`

```ts
/**
 * Country-Code Normalizer — Single Source of Truth für alle Write-Pfade.
 *
 * Konvention (siehe COUNTRY_ISO_MIGRATION_PLAN.md):
 * - Output ist IMMER ISO-3166-1 alpha-2 (UPPERCASE, 2 chars) ODER null
 * - Deprecated ISO-3166-3 (YU, DD, CS, SU) bleibt erhalten für historische Releases
 * - EU = Pure-Europe (ISO-exceptionally-reserved)
 * - WO = Worldwide (VOD-intern)
 *
 * Aufgerufen von:
 * - backend/src/api/admin/discogs-import/commit/route.ts (vor Insert)
 * - backend/src/api/admin/media/[id]/discogs-preview/route.ts
 * - backend/src/api/admin/media/[id]/route.ts (Picker, idempotent)
 * - scripts/legacy_sync_v2.py (über country_iso.py Python-Pendant)
 */
import { findCountryByName, isValidIsoCode } from "../admin/data/country-iso"

export function normalizeCountryToIso(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.length === 2) {
    const upper = trimmed.toUpperCase()
    if (isValidIsoCode(upper)) return upper
  }
  return findCountryByName(trimmed)?.code ?? null
}
```

Plus `backend/src/__tests__/country-normalize.unit.spec.ts` mit den 89 Source-Strings + 12 Edge-Cases (NULL, „", whitespace, mixed-case, „uk", „DE", „Germany", „Europe", „Worldwide", „UK & Europe", „Unbekannt").

### 1.4 Python-Pendant `scripts/data/country_iso.py` refactor + **defensive `lookup_iso()`**

Zwei Änderungen — die zweite ist **kritisch** für Variante A (verhindert dass Meili-Sync nach Backfill `country_code: null` schreibt).

```python
# 1) NEUER Normalizer (mirror of TS-Version)
def normalize_country_to_iso(raw: str | None) -> str | None:
    """Mirror of backend/src/lib/country-normalize.ts::normalizeCountryToIso.
    Beide MÜSSEN identische Outputs liefern (siehe feedback_app_db_hash_formula_must_match).
    """
    if raw is None: return None
    trimmed = raw.strip()
    if not trimmed: return None
    if len(trimmed) == 2:
        upper = trimmed.upper()
        if upper in ALL_VALID_CODES:
            return upper
    return lookup_iso(trimmed)

# 2) BESTEHENDE lookup_iso() defensiv erweitern — KRITISCH
def lookup_iso(country: str | None) -> str | None:
    """Resolve country name → ISO-2, case-insensitive. None if unknown.
    NEU (rc54.0): ISO-2 Codes als Identity-Passthrough — sonst bricht
    Meili-Sync zwischen Phase 4 (Backfill) und Phase 6 (Code-Update), weil
    DB dann "DE" enthält und lookup_iso("DE") sonst None returnt → Meili-Docs
    bekommen country_code: null → Storefront-Filter tot.
    """
    if not country: return None
    trimmed = country.strip()
    if not trimmed: return None
    # NEU: ISO-2 Identity-Passthrough
    if len(trimmed) == 2:
        upper = trimmed.upper()
        if upper in ALL_VALID_CODES:
            return upper
    # Direct hit (existing behavior)
    if trimmed in COUNTRY_TO_ISO:
        return COUNTRY_TO_ISO[trimmed]
    # Case-insensitive fallback (existing)
    lower = trimmed.lower()
    for name, iso in COUNTRY_TO_ISO.items():
        if name.lower() == lower:
            return iso
    return None
```

Damit funktioniert die alte Meili-Sync-Code-Version weiter (mit `lookup_iso(row["country"])` als `country_code`-Generator), egal ob `row["country"]` jetzt „Germany" ist oder schon „DE". Das ist die ganze Magie, die Variante A's zero-downtime ermöglicht — bis Phase 6 nachträglich kosmetisch vereinfacht.

`ALL_VALID_CODES` ist ein neues Set in country_iso.py das alle 249 regulären ISO-Codes + YU/DD/CS/SU/EU/WO enthält. Wird auch von `normalize_country_to_iso` genutzt.

Plus pytest in `scripts/tests/test_country_iso.py` mit:
- 89 Source-Strings → Target ISO
- 12 Edge-Cases (NULL, „", whitespace, mixed-case)
- **NEU: Identity-Passthrough-Tests** — `lookup_iso("DE")` = „DE", `lookup_iso("de")` = „DE", `lookup_iso("XX")` = None

### 1.5 Country-Synonyms für Meili generieren

**Hintergrund:** Heute ist `country` in Meili-Settings sowohl `searchable` als auch `filterable`. Frank's Kunden können also „germany" / „deutschland" / „england" in die Suche tippen und finden Releases — weil Meili gegen das Roh-DB-Feld „Germany" / „United Kingdom" tokenisiert.

Nach Migration enthält das Feld nur noch ISO-Codes (DE, GB, US). Eine getippte Query „germany" würde nichts mehr matchen.

**Lösung (alignt mit bestehendem Synonyms-Pattern):** Code-Generator der aus `scripts/data/country_iso.py` (ISO_COUNTRIES-Liste mit `nameEn` + `nameDe` + bestehenden Aliasen) eine bi-direktionale Synonym-Map produziert.

Neuer Generator `scripts/build_country_synonyms.py`:

```python
"""Generiert bi-direktionale Country-Synonyms für Meili aus country_iso.py.

Output: dict[str, list[str]] das in meilisearch_settings.json unter "synonyms"
gemerged wird. Jeder ISO-Code wird zur Suche per Name möglich, und umgekehrt
findet jeder Name die Docs mit ISO.

Beispiel-Output:
  "de":          ["germany", "deutschland", "allemagne"]
  "germany":     ["de", "deutschland", "allemagne"]
  "deutschland": ["de", "germany", "allemagne"]
  "gb":          ["uk", "united kingdom", "england", "great britain"]
  "uk":          ["gb", "united kingdom", "england", "great britain"]
  ...
"""

from data.country_iso import COUNTRY_TO_ISO, ISO_TO_DE_NAME  # + ggf. ISO_TO_FR_NAME

def build_synonyms() -> dict[str, list[str]]:
    """Pro ISO-Code: alle Aliase als bi-direktionale Synonyms.

    Eingang: COUNTRY_TO_ISO (Name → ISO) + ISO_TO_DE_NAME (ISO → DE-Name).
    Plus die existing Aliase ("uk", "usa", "england" etc.) aus findCountryByName.
    """
    # ISO → set of all known string-aliases (englisch, deutsch, kurz, etc.)
    iso_aliases: dict[str, set[str]] = {}
    for name, iso in COUNTRY_TO_ISO.items():
        iso_aliases.setdefault(iso, set()).add(name.lower())
        iso_aliases[iso].add(iso.lower())
    # Plus harte Discogs/Common-Aliase
    EXTRA: dict[str, list[str]] = {
        "GB": ["uk", "england", "great britain", "vereinigtes königreich", "großbritannien"],
        "US": ["usa", "america", "vereinigte staaten"],
        "EU": ["europe", "european union", "europa", "europäische union"],
        "WO": ["worldwide", "weltweit"],
        # ... (alle critical aliases — generierbar aus country-iso.ts findCountryByName-Aliases)
    }
    for iso, extras in EXTRA.items():
        for x in extras:
            iso_aliases.setdefault(iso, set()).add(x.lower())

    # Bi-directional flatten: jedes Alias → alle anderen Aliase + ISO selbst
    synonyms: dict[str, list[str]] = {}
    for iso, aliases in iso_aliases.items():
        all_terms = aliases | {iso.lower()}
        for term in all_terms:
            others = sorted(all_terms - {term})
            if others:
                synonyms[term] = others
    return synonyms

if __name__ == "__main__":
    import json, sys
    from pathlib import Path
    settings_path = Path(__file__).parent / "meilisearch_settings.json"
    settings = json.loads(settings_path.read_text())
    existing = settings.get("synonyms", {})
    new_country = build_synonyms()
    # Merge — existing genre/style synonyms gewinnen bei Konflikt
    merged = {**new_country, **existing}
    settings["synonyms"] = merged
    settings_path.write_text(json.dumps(settings, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(new_country)} country synonyms (total {len(merged)})")
```

→ Run einmalig in Phase 1, committed mit den anderen Foundation-Files. Apply via `python3 meilisearch_sync.py --apply-settings` in Phase 7.

### 1.7 Dual-tolerant Storefront-Filter (KRITISCH für Variante A)

**Hintergrund (Critical Issue #2 aus Self-Review):** `route-postgres-fallback.ts::COUNTRY_ALIASES` mappt User-Input auf English Names; WHERE-Klausel matched gegen DB-`country`-Feld. Nach Backfill (Phase 4) hat DB ISO-Codes — der Filter wäre tot bis Phase 6.

**Lösung:** Read-Filter wird in **dual-tolerant** Variante deployed **bevor** Backfill läuft. Akzeptiert sowohl English Name als auch ISO als WHERE-Wert.

Neue Datei `backend/src/lib/country-resolve.ts`:

```ts
import { findCountry, findCountryByName, type IsoCountry } from "../admin/data/country-iso"

/**
 * Returns ALL DB-Werte die als „dieser Country" matchen sollen — sowohl der
 * ISO-Code als auch der Englische Name. Damit WHERE-IN-Klauseln in Storefront-
 * Filtern während der rc54.0-Migration kontinuierlich funktionieren, egal ob
 * der DB-Wert schon backfilled ist (ISO) oder noch nicht (English).
 *
 * Beispiele:
 *   resolveCountryForFilter("germany") → ["DE", "Germany"]
 *   resolveCountryForFilter("Deutschland") → ["DE", "Germany"]
 *   resolveCountryForFilter("UK") → ["GB", "United Kingdom"]
 *   resolveCountryForFilter("Europe") → ["EU", "Europe"]  // wenn EU.nameEn = "Europe (EU)" → ["EU"]
 *   resolveCountryForFilter("DE") → ["DE", "Germany"]
 *   resolveCountryForFilter("Foobaria") → ["Foobaria"]  // passthrough
 *
 * Post-Phase-6-Cleanup: Returns nur noch [iso] — single value.
 */
export function resolveCountryForFilter(input: string): string[] {
  const trimmed = input.trim()
  if (!trimmed) return []

  // Resolve auf ISO
  let iso: string | null = null
  if (trimmed.length === 2 && findCountry(trimmed.toUpperCase())) {
    iso = trimmed.toUpperCase()
  } else {
    iso = findCountryByName(trimmed)?.code ?? null
  }

  if (!iso) return [trimmed]  // unbekannt → passthrough, evtl. matched gar nichts

  // Dual-tolerant: ISO + English Name beide returnen
  const country = findCountry(iso)
  const result = [iso]
  if (country && country.nameEn && country.nameEn !== iso) {
    // English Name als zweiter Wert für pre-backfill-Rows
    // Sonderbehandlung für Multi-Region-Aliase: die DB hatte mehrere Strings für
    // denselben ISO-Code (Europe → EU, European Union → EU, UK & Europe → GB).
    // Wir returnen ALLE bekannten DB-Vorgänger-Strings für diesen ISO.
    result.push(country.nameEn)
  }
  // Plus: bekannte aliases die in der DB vorkamen (aus dem Backfill-Mapping)
  const dbHistoricalNames = DB_HISTORICAL_NAMES_BY_ISO[iso]
  if (dbHistoricalNames) result.push(...dbHistoricalNames)

  return [...new Set(result)]  // dedupe
}

// Aus COUNTRY_ISO_MIGRATION_PLAN.md §7 — alle distinct DB-Werte die auf einen
// ISO-Code mappten. Nach Phase 6-Cleanup wird das gelöscht.
const DB_HISTORICAL_NAMES_BY_ISO: Record<string, string[]> = {
  GB: ["United Kingdom", "UK", "UK & Europe", "UK & US", "UK & Ireland",
       "UK & Germany", "UK, Europe & US"],
  US: ["United States", "USA & Europe", "USA & Canada",
       "USA, Canada & Europe", "USA, Canada & UK"],
  DE: ["Germany", "Germany, Austria, & Switzerland", "Germany & Switzerland"],
  EU: ["Europe", "European Union"],
  WO: ["Worldwide"],
  NL: ["Netherlands", "Benelux"],
  SE: ["Sweden", "Scandinavia"],
  FR: ["France", "France & Benelux"],
  CS: ["Czechoslovakia", "Serbia and Montenegro"],
  DD: ["East Germany (GDR)", "German Democratic Republic (GDR)"],
  SU: ["USSR", "Soviet Union"],
  YU: ["Yugoslavia"],
  // Single-Name Cases sind durch country.nameEn schon abgedeckt
}
```

`route-postgres-fallback.ts` Update:

```ts
import { resolveCountryForFilter } from "../../../lib/country-resolve"

// Vorher:
// const resolved = resolveCountry(input)         // → "Germany"
// .where("country", resolved)

// Nachher (dual-tolerant):
const countryValues = resolveCountryForFilter(input)  // → ["DE", "Germany"]
if (countryValues.length > 0) {
  query.whereIn("Release.country", countryValues)
}
```

**Meili-Filter-Variante** in `release-search-meili.ts`: Meili nutzt Synonyms (Phase 1.5) — keine WHERE-IN-Filter nötig, weil die Synonym-Expansion User-Eingaben „germany"/„deutschland"/„DE" alle auf dieselbe Doc-Menge mappt. Das funktioniert sowohl pre- als auch post-backfill, weil:
- Pre-Backfill: Doc enthält `country: "Germany"`, Synonym `germany ↔ de ↔ deutschland` → alle finden es
- Post-Backfill: Doc enthält `country: "DE"`, dieselbe Synonym-Map → alle finden es ebenfalls

→ **Meili-Pfad braucht keinen dual-tolerant Code**, Synonyms alone reichen. PG-Fallback dagegen braucht `resolveCountryForFilter()` weil PG keine Synonyms hat.

Unit-Tests in `backend/src/__tests__/country-resolve.unit.spec.ts`:
- `resolveCountryForFilter("germany")` → enthält „DE" und „Germany"
- `resolveCountryForFilter("uk")` → enthält „GB" und „United Kingdom" und „UK" und „UK & Europe"
- `resolveCountryForFilter("DE")` → enthält „DE" und „Germany"
- `resolveCountryForFilter("Foobaria")` → `["Foobaria"]`

### 1.8 Commit

```bash
git add backend/src/admin/data/country-iso.ts \
        backend/src/lib/country-normalize.ts \
        backend/src/lib/country-resolve.ts \
        backend/src/__tests__/country-normalize.unit.spec.ts \
        backend/src/__tests__/country-resolve.unit.spec.ts \
        backend/src/api/store/catalog/route-postgres-fallback.ts \
        scripts/data/country_iso.py \
        scripts/tests/test_country_iso.py \
        scripts/build_country_synonyms.py \
        scripts/meilisearch_settings.json
git commit -m "$(cat <<'EOF'
feat(rc54.0): Country-ISO Foundation — Variante A, dual-tolerant read paths

Phase 1 of COUNTRY_ISO_MIGRATION_PLAN. Variante A (Read-First) — alle Read-
Pfade akzeptieren beide Encodings (English Name + ISO) gleichzeitig, damit
Backfill (Phase 4) zero-impact für Storefront-Filter ist.

Pure additive:
- country-iso.ts: +YU/DD/CS/SU (deprecated ISO-3166-3) + EU/WO (reserved)
- country-iso.ts: findCountryByName() aliases for Multi-Region (Europe→EU,
  Worldwide→WO, Benelux→NL, Scandinavia→SE) + Compound primary-first
  (UK & Europe→GB, USA & Canada→US, etc.)
- formatCountryLabel() FLAG_OVERRIDE for WO (🌐) — EU rendert via
  flagFor() korrekt zu 🇪🇺
- NEW lib/country-normalize.ts (shared normalizer für Write-Pfade in Phase 2)
- NEW lib/country-resolve.ts::resolveCountryForFilter() — dual-tolerant
  Storefront-Filter (returnt sowohl ISO als auch English Name)
- route-postgres-fallback.ts: wechselt auf whereIn(country, [...]) für
  Variante-A Zero-Downtime
- scripts/data/country_iso.py:
  + normalize_country_to_iso (Python-Mirror)
  + lookup_iso() defensiv erweitert um ISO-Identity-Passthrough
    (KRITISCH: verhindert dass Meili-Sync nach Backfill country_code: null
    schreibt, bevor Phase 6 deployed ist)
- NEW scripts/build_country_synonyms.py — generiert ~300 bi-direktionale
  Country-Synonyms aus ISO_COUNTRIES und mergt sie in meilisearch_settings.
  Damit findet Meili-Suche „germany"/„deutschland"/„england" nach Migration.
- Unit tests: TS + Python, dual-encoding-Tests + Identity-Passthrough-Tests

Kein Verhaltens-Change in DB. Storefront-Filter funktioniert mit
gemischtem Encoding ab dieser Phase. Phase 2 wired Write-Pfade ein.
Phase 4 backfilled. Synonyms werden in Phase 7 live geschaltet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push
```

**Done when:**
- Tests grün (TS + Python)
- `formatCountryLabel("EU")` returns „🇪🇺 Europe (EU) (EU)"
- `formatCountryLabel("WO")` returns „🌐 Worldwide (WO)"
- `normalizeCountryToIso("UK & Europe")` returns „GB"
- `lookup_iso("DE")` returns „DE" (Identity-Passthrough)
- `resolveCountryForFilter("germany")` enthält sowohl „DE" als auch „Germany"
- **Smoke-Test:** Storefront-Filter `?country=Germany` und `?country=DE` liefern beide non-leere Trefferlisten gegen die *aktuelle* DB (noch nicht backfilled)

---

## Phase 2 — Write-Pfade härten (3 h, 2 Commits)

Vor dem Backfill (Phase 4) müssen ALLE Write-Pfade den Normalizer nutzen, sonst schreibt der nächste Sync-Lauf wieder „Germany" rein.

### 2.1 TypeScript-Write-Pfade + Discogs-Preview-Diff-Normalisierung — 1 Commit

| Datei | Änderung |
|---|---|
| `backend/src/api/admin/discogs-import/commit/route.ts:1173` | Import + `country: normalizeCountryToIso(cached.country)` |
| `backend/src/api/admin/discogs-import/commit/route.ts:738` | Identische Wrappung |
| `backend/src/api/admin/discogs-import/commit/route.ts:707` (INSERT-Statement-Bind) | Selber |
| `backend/src/api/admin/media/[id]/discogs-preview/route.ts:102-107` | Lokale `normalizeCountry()`-Funktion löschen, Import von `lib/country-normalize.ts` |
| `backend/src/api/admin/media/[id]/discogs-preview/route.ts` (Diff-Berechnung) | **NEU (Medium Issue #3):** Auch den `current`-Wert durch Normalizer schicken bevor mit `proposed` verglichen wird. Vermeidet False-Positive-„changed"-Markings während der 48 h Transition wo DB noch English-Names hat. |
| `backend/src/api/admin/media/[id]/route.ts:227` | `country: normalizeCountryToIso(body.country)` (defensiv — Picker liefert schon ISO, aber idempotent + verhindert Drift) |

```ts
// backend/src/api/admin/media/[id]/discogs-preview/route.ts (Diff-Berechnung)
// Vorher:
const isDifferent = release.country !== normalizedProposed
// Nachher:
const currentNorm = normalizeCountryToIso(release.country)
const proposedNorm = normalizeCountryToIso(apiData.country)
const isDifferent = currentNorm !== proposedNorm
// Display zeigt weiterhin release.country raw — nur die Diff-Logik nutzt die Normalisierung.
```

```bash
git add backend/src/api/admin/discogs-import/commit/route.ts \
        backend/src/api/admin/media/\[id\]/discogs-preview/route.ts \
        backend/src/api/admin/media/\[id\]/route.ts
git commit -m "feat(rc54.0): Wire normalizeCountryToIso into all TS write paths

Phase 2a of COUNTRY_ISO_MIGRATION_PLAN. Defensive wrap — pure additive.
Discogs commit + preview + manual media edit all funnel through the shared
normalizer. New writes will now be ISO-only.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

### 2.2 Python-Sync — 1 Commit

`scripts/legacy_sync_v2.py:113-159 + 224-228`:
- `COUNTRY_DE_TO_EN` Map bleibt vorerst stehen (Backwards-Compat falls Rollback)
- `translate_country()` returnt **ab jetzt ISO statt English Name**: zuerst DE→EN-Map, dann EN→ISO via `normalize_country_to_iso`

```python
import logging
from data.country_iso import normalize_country_to_iso

logger = logging.getLogger(__name__)

def translate_country(name):
    """Returns ISO-3166-1 alpha-2 code or None.

    NEU (rc54.0): unbekannte Country-Strings werden geloggt statt verbatim
    durchgereicht — sonst stiller Datenverlust nach Phase 2 (Medium Issue #5).
    """
    if not name:
        return None
    english = COUNTRY_DE_TO_EN.get(name, name)
    iso = normalize_country_to_iso(english)
    if iso is None:
        logger.warning(
            "legacy_sync: unknown country %r (DE→EN resolved: %r) → NULL",
            name, english,
        )
    return iso
```

```bash
git add scripts/legacy_sync_v2.py
git commit -m "feat(rc54.0): legacy_sync_v2 emits ISO codes instead of English names

Phase 2b of COUNTRY_ISO_MIGRATION_PLAN. translate_country() now funnels
through normalize_country_to_iso. Existing rows untouched (DIFF compares
ISO vs current English name → marks all as 'changed' on next run).

CAVEAT: Sync läuft NICHT direkt nach diesem Commit — wir warten den
Backfill ab (Phase 4) damit der nächste Sync-Lauf keine 18.453
False-Positive-Diffs produziert.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

### 2.3 Sync-Cron temporär pausieren

**Wichtig:** Wenn Phase 2.2 deployed wird ohne Phase 4, würde der stündliche `legacy_sync_v2.py`-Cron 18.453 Rows als „changed" markieren und nach ISO-Codes umschreiben. Das ist *eigentlich* genau was wir wollen, aber wir verlieren die Möglichkeit zum sauberen Snapshot-Restore.

**Lösung:** Cron pausieren bis Phase 4 durch ist:

```bash
ssh vps 'crontab -l > /tmp/crontab.bak && \
  crontab -l | sed "s|^0 \* \* \* \* cd ~/VOD_Auctions/scripts && venv/bin/python3 legacy_sync_v2.py|# PAUSED-rc54.0: 0 * * * * cd ~/VOD_Auctions/scripts \&\& venv/bin/python3 legacy_sync_v2.py|" | crontab - && \
  crontab -l | grep legacy_sync'
# Verify: legacy_sync-Zeile ist mit # PAUSED prefixed
```

Memory `feedback_crontab_atomic_update.md` — atomic, tempfile, backup.

**Done when:** Commits gepusht, Cron pausiert.

---

## Phase 3 — Deploy + 30 Min Smoke-Test (Variante A-Express)

**Statt 48 h Beobachtungsphase:** Komprimierte Verifikation in ~30 Min. Sicherheitsnetze sind bereits in Phase 0 (Discogs-Cache-Audit + Sandbox-Test-Cutover) und Phase 1.7 (dual-tolerant Storefront-Filter) aufgespannt — Phase 3 ist nur noch der finale „läuft auf Prod"-Check.

### 3.1 Deploy Phase 1+2 auf VPS

```bash
ssh vps 'cd /root/VOD_Auctions && git checkout feat/rc54-country-iso-migration && \
  git pull && cd backend && rm -rf node_modules/.vite .medusa && \
  npx medusa build 2>&1 | tail -20; \
  rm -rf public/admin && cp -r .medusa/server/public/admin public/admin && \
  ln -sf /root/VOD_Auctions/backend/.env /root/VOD_Auctions/backend/.medusa/server/.env && \
  pm2 restart vodauction-backend && sleep 8 && pm2 status vodauction-backend'
```

### 3.2 Discogs-Commit-Smoke-Test

In Admin-UI: ein neues Discogs-Cache-Item via Preview-Modal applyen. Vor dem Apply DB-Snapshot des `country`-Felds nehmen, danach prüfen ob ISO.

```sql
-- Vor Apply
SELECT id, country FROM "Release" WHERE id = '<test-release-id>';
-- Nach Apply
SELECT id, country, updatedAt FROM "Release" WHERE id = '<test-release-id>';
-- Erwartet: country = 'GB' (oder ISO, nicht 'UK' / 'United Kingdom')
```

### 3.3 Storefront-Smoke-Test (Variante A Verify)

```bash
# Beide URLs müssen Trefferlisten liefern — gemixtes Encoding in DB ist OK
curl -sS "https://vod-auctions.com/api/catalog?country=Germany&limit=5" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print('Germany:', len(d.get('items', [])))"
curl -sS "https://vod-auctions.com/api/catalog?country=DE&limit=5" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print('DE:', len(d.get('items', [])))"
# Beide: 5 items erwartet (oder ähnlich — DB hat noch "Germany" + ein paar "DE")
```

### 3.4 30 Min Smoke-Test-Checkliste

Statt 48 h zu warten — alle Checks innerhalb von 30 Min:

| Check | Ziel | Wenn fail |
|---|---|---|
| Discogs-Commit (1 Test-Item) schreibt ISO | DB-Wert ist „GB"/„DE"/etc., nicht „UK"/„Germany" | Rollback Phase 1+2 |
| Manueller Picker-Edit auf `/app/media/<test-id>` schreibt ISO | Selber Wert kommt zurück durch Normalizer | Rollback |
| Storefront `?country=Germany` liefert non-leere Trefferliste | dual-tolerant Filter funktioniert | Rollback |
| Storefront `?country=DE` liefert non-leere Trefferliste | dual-tolerant Filter funktioniert | Rollback |
| Storefront `?country=United Kingdom` liefert non-leere Trefferliste | dual-tolerant Filter funktioniert | Rollback |
| `tail -50 ~/VOD_Auctions/scripts/sync_cron.log` | keine WARN unknown country (Sync-Cron ist pausiert, sollte keine neuen Logs haben) | wenn doch: Cron nicht richtig pausiert |
| 5 Sek Bot-Test gegen Storefront: 5 Random-Catalog-Pages | alle 200, alle haben sichtbare Items | Rollback |

**Bei grünem Sweep nach ≤ 30 Min:** direkt mit Phase 4 (Backfill) weitermachen.

**Schaden bei Bug:** überschaubar (einzelne dirty Rows die im Backfill mit-bereinigt werden). Bei kritischem Bug: Rollback der Commits.

**Done when:** Alle 7 Checkliste-Items grün.

---

## Phase 4 — Backfill UPDATE (1 h, 1 SQL)

### 4.1 Pre-Flight für Backfill

**4.1.a Snapshot-Drift-Check:**
```sql
SELECT
  (SELECT COUNT(*) FROM backup_release_country_pre_iso_migration) AS snapshot_rows,
  (SELECT COUNT(*) FROM "Release" WHERE country IS NOT NULL) AS current_non_null;
-- Erwartet: snapshot_rows ≤ current_non_null (kleine Drift OK, da Phase 3
-- evtl. neue Inserts hatte; > snapshot heißt: wir capturen sie nicht im Rollback)
```

Wenn Drift > 100 Rows: vor dem UPDATE Snapshot aktualisieren mit `INSERT INTO backup_… SELECT … WHERE id NOT IN (SELECT id FROM backup_…)`.

**4.1.b Distinct-Werte-Check (Medium Issue #5 — edge cases erkennen):**
```sql
-- Welche country-Werte sind in der DB, die NICHT im Backfill-Mapping (§7) vorkommen?
WITH known_mappings AS (
  -- Liste aus §7 — alle 89 Source-Strings die wir erwarten
  SELECT unnest(ARRAY[
    'Germany','United States','United Kingdom','France','UK','Netherlands',
    'Italy','Belgium','Japan','Canada','Switzerland','Australia','Austria',
    'Spain','Europe','Sweden','Norway','Poland','Denmark','European Union',
    'Portugal','UK & Europe','Iceland','Yugoslavia','East Germany (GDR)',
    'Hungary','Greece','Slovenia','Finland','German Democratic Republic (GDR)',
    'New Zealand','Mexico','South Africa','Russia','Ireland','Brazil',
    'Czech Republic','Germany, Austria, & Switzerland','Serbia and Montenegro',
    'Benelux','Argentina','USA & Europe','USA & Canada','Romania','Israel',
    'Worldwide','Czechoslovakia','India','UK, Europe & US','UK & US','Slovakia',
    'Turkey','Peru','Uruguay','Colombia','Scandinavia','Venezuela','Luxembourg',
    'UK & Ireland','Germany & Switzerland','USA, Canada & Europe','USSR',
    'UK & Germany','Philippines','Hong Kong','Thailand','France & Benelux',
    'Papua New Guinea','USA, Canada & UK','Chile','Malaysia','China','Guatemala',
    'Serbia','Croatia','Lebanon','Indonesia'
  ]) AS s
)
SELECT country, COUNT(*) AS n
FROM "Release"
WHERE country IS NOT NULL
  AND country !~ '^[A-Z]{2}$'  -- bereits ISO-Pattern überspringen (kommt in §4.2 Step 3)
  AND country NOT IN (SELECT s FROM known_mappings)
GROUP BY country
ORDER BY n DESC;
-- Erwartet: 0 rows. Wenn nicht 0: in §4.2 explizit ergänzen oder
-- als NULL behandeln (Frank-Decision pro Edge-Case).
```

**4.1.c Migration-Script-Grep (Low Issue #9):**
```bash
# Wirft Alarm wenn irgendwo noch direkt rohe Country-Strings geschrieben werden
grep -rn "country.*=.*'\(Germany\|United Kingdom\|UK\|Europe\)" backend/src scripts 2>/dev/null
# Erwartet: keine Hits außer in COUNTRY_DE_TO_EN (Map) und country-iso.ts (Test-Daten)
```

### 4.2 Backfill-SQL

(Volle Mapping-Tabelle aus `COUNTRY_ISO_MIGRATION_PLAN.md` §7. Hier nur das Skelett — kompletter SQL liegt unter `scripts/migrations/2026-05-XX_country_iso_backfill.sql`)

**Erkenntnisse aus Phase 0.5 Sandbox-Test (2026-05-11):**
- Step 0 muss empty-string UND whitespace-strings (`trim(country) = ''`) cleanen
- Step 0b muss leading/trailing-whitespace trimmen (Discogs hat selten Trailing Spaces)
- Step 1 muss `WHERE LOWER(country) = LOWER(m.source)` matchen — case-insensitive (Discovery: kein Prod-Wert ist heute lowercase, aber defensive). Performance bei 48k Rows einmalig irrelevant.
- Backfill-SQL muss als EIN Statement im selben execute_sql laufen (Supabase MCP: jeder execute_sql ist eine eigene auto-commit Transaktion. BEGIN/COMMIT-Wrapper innerhalb eines Calls = OK, aber `BEGIN;` in einem Call und `COMMIT;` in einem anderen = implicit rollback nach 1. Call)
- 2 zusätzliche Mappings nötig (entdeckt in Phase 0.3 Discogs-Audit): `('UK & France', 'GB')` und `('Australia & New Zealand', 'AU')`
- Lithuania/Latvia kommen aus Discogs aber sind via `findCountryByName(nameEn)` auto-resolved im Normalizer-Code — im Backfill-SQL TROTZDEM explizit ergänzen weil Backfill-SQL nicht den TS-Normalizer nutzt, sondern reines SQL-CASE-Mapping.

```sql
BEGIN;

-- Step 0: Empty-Strings auf NULL normalisieren (Medium Issue #6)
-- Erwartet: ~49 Rows (DB hat 49 country='' aus rohem Discogs-Import)
-- Phase 5 CHECK-Constraint würde sonst empty-string nicht akzeptieren.
UPDATE "Release"
SET country = NULL,
    "updatedAt" = NOW()
WHERE country = '';

-- Step 1: Mapping-UPDATE (89 Werte)
UPDATE "Release"
SET country = m.iso_code,
    "updatedAt" = NOW()
FROM (VALUES
  ('Germany', 'DE'),
  ('United States', 'US'),
  ('United Kingdom', 'GB'),
  ('France', 'FR'),
  ('UK', 'GB'),
  ('Netherlands', 'NL'),
  ('Italy', 'IT'),
  ('Belgium', 'BE'),
  ('Japan', 'JP'),
  ('Canada', 'CA'),
  ('Switzerland', 'CH'),
  ('Australia', 'AU'),
  ('Austria', 'AT'),
  ('Spain', 'ES'),
  ('Europe', 'EU'),
  ('Sweden', 'SE'),
  ('Norway', 'NO'),
  ('Poland', 'PL'),
  ('Denmark', 'DK'),
  ('European Union', 'EU'),
  ('Portugal', 'PT'),
  ('UK & Europe', 'GB'),
  ('Iceland', 'IS'),
  ('Yugoslavia', 'YU'),
  ('East Germany (GDR)', 'DD'),
  ('Hungary', 'HU'),
  ('Greece', 'GR'),
  ('Slovenia', 'SI'),
  ('Finland', 'FI'),
  ('German Democratic Republic (GDR)', 'DD'),
  ('New Zealand', 'NZ'),
  ('Mexico', 'MX'),
  ('South Africa', 'ZA'),
  ('Russia', 'RU'),
  ('Ireland', 'IE'),
  ('Brazil', 'BR'),
  ('Czech Republic', 'CZ'),
  ('Germany, Austria, & Switzerland', 'DE'),
  ('Serbia and Montenegro', 'CS'),
  ('Benelux', 'NL'),
  ('Argentina', 'AR'),
  ('USA & Europe', 'US'),
  ('USA & Canada', 'US'),
  ('Romania', 'RO'),
  ('Israel', 'IL'),
  ('Worldwide', 'WO'),
  ('Czechoslovakia', 'CS'),
  ('India', 'IN'),
  ('UK, Europe & US', 'GB'),
  ('UK & US', 'GB'),
  ('Slovakia', 'SK'),
  ('Turkey', 'TR'),
  ('Peru', 'PE'),
  ('Uruguay', 'UY'),
  ('Colombia', 'CO'),
  ('Scandinavia', 'SE'),
  ('Venezuela', 'VE'),
  ('Luxembourg', 'LU'),
  ('UK & Ireland', 'GB'),
  ('Germany & Switzerland', 'DE'),
  ('USA, Canada & Europe', 'US'),
  ('USSR', 'SU'),
  ('UK & Germany', 'GB'),
  ('Philippines', 'PH'),
  ('Hong Kong', 'HK'),
  ('Thailand', 'TH'),
  ('France & Benelux', 'FR'),
  ('Papua New Guinea', 'PG'),
  ('USA, Canada & UK', 'US'),
  ('Chile', 'CL'),
  ('Malaysia', 'MY'),
  ('China', 'CN'),
  ('Guatemala', 'GT'),
  ('Serbia', 'RS'),
  ('Croatia', 'HR'),
  ('Lebanon', 'LB'),
  ('Indonesia', 'ID')
  -- Already-ISO bleibt weg (US, DE, GB, FR, IT, CA, BE, ES, NL, JP, IS, CH, NO, AT)
  -- — werden im Schritt 2 nur trim+upper-normalisiert
) AS m(source, iso_code)
WHERE "Release".country = m.source;
-- Erwartet betroffene Rows: ~46.350

-- Step 2: Already-ISO defensiv normalisieren (lowercase / whitespace)
UPDATE "Release"
SET country = upper(trim(country)),
    "updatedAt" = NOW()
WHERE country IS NOT NULL
  AND length(trim(country)) = 2
  AND trim(country) ~ '^[a-zA-Z]{2}$'
  AND country <> upper(trim(country));
-- Erwartet: 0-10 Rows

-- Verify 1: Keine Non-ISO-Format-Rows mehr
SELECT country, COUNT(*) AS leftover
FROM "Release"
WHERE country IS NOT NULL
  AND country !~ '^[A-Z]{2}$'
GROUP BY country
ORDER BY leftover DESC;
-- Erwartet: 0 rows. Wenn nicht 0 → ROLLBACK; und Mapping-Lücke analysieren.

-- Verify 2: Top-10 Counts nach Migration
SELECT country, COUNT(*) AS n
FROM "Release"
WHERE country IS NOT NULL
GROUP BY country
ORDER BY n DESC
LIMIT 10;
-- Erwartet ungefähr:
--   DE   12.689   (12.633 Germany + 56 DE)
--   US   11.144   (9.062 USA + 2.071 US + diverse Compounds)
--   GB   11.030   (8.693 UK_canonical + 2.161 UK_alias + 43 GB + 80+6+6+3+2 Compounds)
--   FR    2.616   (2.600 France + 15 FR + 1 Compound)
--   NL    2.018   (2.004 Netherlands + 12 Benelux + 2 NL)
--   IT    1.669   (1.663 Italy + 6 IT)
--   BE    1.348   (1.343 Belgium + 5 BE)
--   JP    1.085   (1.083 Japan + 2 JP)
--   CA      820   (815 Canada + 5 CA)
--   CH      710   (709 Switzerland + 1 CH)

-- Wenn alle Verifies passen:
COMMIT;
-- Wenn auch nur EINE Verify fails:
-- ROLLBACK;
```

### 4.3 Backfill ausführen

Via Supabase MCP, einzeln freigegeben (Robin gibt SQL-by-SQL grünes Licht):

1. Snapshot-Drift-Check
2. UPDATE Schritt 1
3. UPDATE Schritt 2
4. Verify 1 (0 leftover Rows — kritisch!)
5. Verify 2 (Top-10 plausibel)
6. COMMIT

**Bei Verify-Fail:** ROLLBACK; und Mapping-Lücke analysieren (welcher String wurde nicht gemappt?). Fix in country-iso.ts deployen, dann Phase 4 retry.

### 4.4 Meili-Drift erwartet — Cron läuft selbst

Backfill bumpt `updatedAt` auf ~46.350 Rows → das triggert `Release.search_indexed_at = NULL` via Sync-Trigger (rc40-Whitelist enthält `country`? — falls nicht: vor Phase 4 zusätzlich `UPDATE "Release" SET search_indexed_at = NULL WHERE id IN (... affected ...)` einplanen). Der `*/5 * * * *`-Cron picked das auf und re-indexed innerhalb von 5 Min.

**Verify nach 10 Min:**
```bash
ssh vps 'tail -50 ~/VOD_Auctions/scripts/meilisearch_sync.log'
# Erwartet: "Synced N=46350 documents" oder ähnlich
```

**Done when:** UPDATE committed, 0 leftover Non-ISO-Format-Rows, Meili-Reindex durch.

---

## Phase 5 — CHECK-Constraint ADD (0.5 h, 1 SQL)

```sql
BEGIN;

-- Constraint hinzufügen
ALTER TABLE "Release"
  ADD CONSTRAINT release_country_iso_format
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

-- Verify (sollte ohne Error durchgehen — sonst hat Phase 4 was übersehen)
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'release_country_iso_format';

COMMIT;
```

Dokumentation in `backend/src/scripts/migrations/_constraints_reference.sql` (Memory `feedback_check_constraint_action_drift`):

```sql
-- backend/src/scripts/migrations/_constraints_reference.sql
-- Hinzufügen unter "Release" section:
release_country_iso_format
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$')
  -- rc54.0 (2026-05-XX): Enforces ISO-3166-1 alpha-2 format. Migration
  -- COUNTRY_ISO_MIGRATION_PLAN.md.
```

**Done when:** Constraint live, `_constraints_reference.sql` aktualisiert + committed.

---

## Phase 6 — Read-Pfade Cleanup auf ISO-only (1 h, 1 Commit) — kosmetisch

Nach Phase 4+5 ist die Spalte garantiert ISO. Variante-A's dual-tolerant Code aus Phase 1.7 ist jetzt redundant und kann auf single-value vereinfacht werden. **Phase 6 ist nicht mehr kritisch** — System läuft auch ohne Phase 6 stabil weiter, das ist nur Code-Hygiene.

**Display-Konvention (Frank-Decision 2026-05-11):**

| Layer | Format | Beispiel | Renderer |
|---|---|---|---|
| **Admin — Catalog Detail (`/app/media/[id]`)** | Rich: Flag + Vollname + Code in Klammern | 🇫🇷 France (FR) | `formatCountryLabel(release.country)` |
| **Admin — Stocktake Search Column (rc53.19)** | Compact: Flag + ISO | 🇫🇷 FR | `formatCountryCompact(r.country)` (110 px Breite) |
| **Storefront — alle Render-Sites** | Nur ISO-Code | FR | `<Badge>{release.country}</Badge>` raw — **kein Code-Change** |

→ Storefront-Implementierung bleibt **komplett unverändert**. Nach Backfill enthält `release.country` automatisch den ISO-Code, und der bestehende `<Badge variant="secondary">{release.country}</Badge>` in `band/[slug]`, `press/[slug]`, `label/[slug]`, `catalog/[id]`, `auctions/[slug]/[itemId]` rendert dann „FR" / „DE" / „US" statt vorher „France" / „Germany" / „United States" oder gemixed „UK".

### 6.1 Admin-UI Cleanup

| Datei | Vorher | Nachher |
|---|---|---|
| `backend/src/admin/routes/media/[id]/page.tsx:1092-1095` | IIFE mit Inline-Lookup + Warn-Fallback | `formatCountryLabel(release.country)` — Warn-Pfad bleibt als Defense-in-Depth, sollte aber durch Constraint nie mehr feuern |
| `backend/src/admin/routes/erp/inventory/session/page.tsx` (rc53.19 Country-Spalte) | Rendert `r.country` raw → heute Mischmasch | Rendert `formatCountryCompact(r.country)` → konsistent „🇫🇷 FR" |

Neuer Helper in `country-iso.ts`:

```ts
export function formatCountryCompact(code: string | null | undefined): string {
  if (!code) return "—"
  const country = findCountry(code)
  if (!country) return code
  const flag = FLAG_OVERRIDE[country.code] ?? flagFor(country.code)
  return `${flag} ${country.code}`
}
// → "🇩🇪 DE" statt "🇩🇪 Germany (DE)" — passt in 110 px Spalte
```

### 6.2 Storefront-Filter Cleanup — dual-tolerant → single-value

In Phase 1.7 nutzt `resolveCountryForFilter()` Dual-Werte ISO + English-Name. Nach Backfill (Phase 4) sind alle DB-Werte ISO — die English-Name-Pfade in `whereIn` matchen nichts mehr und können raus.

```ts
// backend/src/lib/country-resolve.ts — vereinfachen
export function resolveCountryForFilter(input: string): string[] {
  const trimmed = input.trim()
  if (!trimmed) return []
  // Single-value: nur ISO
  if (trimmed.length === 2 && findCountry(trimmed.toUpperCase())) {
    return [trimmed.toUpperCase()]
  }
  const iso = findCountryByName(trimmed)?.code
  return iso ? [iso] : [trimmed]
}
// DB_HISTORICAL_NAMES_BY_ISO-Konstante komplett löschen
```

Bzw. die Funktion kann auch inlined und auf `string` simplifiziert werden — die Caller in `route-postgres-fallback.ts` müssen dann von `whereIn(country, [...])` zurück auf `where(country, "=", iso)`. Single-value-Cleanup ist optional — Performance-Unterschied marginal, beide Pfade funktionieren mit ISO.

### 6.3 Meili-Sync Update + Synonym-Apply

`scripts/meilisearch_sync.py:504-505`:

```python
# Vorher (komplex — Display-Name aus ISO ableiten)
"country": row["country"],  # English Name aus DB
"country_code": lookup_iso(row["country"]),

# Nachher (trivial — DB liefert schon ISO, kein Lookup)
"country": row["country"],       # ist schon ISO, z.B. "DE"
"country_code": row["country"],  # Duplikat aus Konvention; Frontend filtert auf country_code
```

→ **Vereinfacht:** kein `iso_to_display_name`-Helper mehr nötig (zwischenzeitlich überflüssig geworden). Beide Felder enthalten denselben ISO-Code; Storefront-UI rendert `country` direkt als ISO.

**Volltext-Suche bleibt erhalten via Synonyms** (gebaut in Phase 1.5):
- User tippt „germany" → Meili expandiert über Synonym-Map zu „de", „deutschland", „allemagne" → matched alle Docs mit `country: "DE"`
- User tippt „england" → expandiert zu „gb", „uk", „united kingdom", „great britain" → matched `country: "GB"`
- User tippt „de" → expandiert zu „germany", „deutschland" → matched ebenfalls
- Funktioniert mit Typo-Tolerance + Word-Boundary (Meili-Default)

Synonyms werden in Phase 7 via `meilisearch_sync.py --apply-settings` aktiviert (Pflicht-Step nach Deploy).

Optional: Wenn später (Phase 8+) eine Display-Variante in Meili gebraucht wird (z.B. für sortierte Facetten „Deutschland (12.689 hits)" im Storefront), kann ein `country_display`-Feld als drittes Attribut zugefügt werden — additive Änderung, ohne Migration.

### 6.4 Discogs-Preview-Modal Diff-Vergleich

`backend/src/api/admin/media/[id]/discogs-preview/route.ts` produziert einen Diff zwischen `current` (DB) und `proposed` (Discogs API). Beide gehen durch `normalizeCountryToIso()` (Phase 2). Manuell verifizieren: 5 Test-Cases produzieren keine falschen „Different"-Markings mehr (z.B. wenn API „UK" liefert und DB „GB" hat → beides → „GB" → kein Diff).

### 6.5 Commit

```bash
git add backend/src/admin/data/country-iso.ts \
        backend/src/admin/routes/media/\[id\]/page.tsx \
        backend/src/admin/routes/erp/inventory/session/page.tsx \
        backend/src/lib/country-resolve.ts \
        scripts/meilisearch_sync.py
git commit -m "refactor(rc54.0): Read paths cleanup — dual-tolerant → ISO-only

Phase 6 of COUNTRY_ISO_MIGRATION_PLAN (cosmetic, post-backfill).
After Phase 4+5 the DB column is guaranteed ISO-2, so:
- Admin Catalog detail: inline lookup replaced with formatCountryLabel()
- Stocktake Country column: rendert formatCountryCompact() (🇫🇷 FR)
- country-resolve.ts::resolveCountryForFilter simplified to single-value
- meilisearch_sync.py: country/country_code beide ISO direkt aus DB,
  kein lookup_iso() Aufruf mehr nötig

Storefront-Render-Code bleibt unverändert — zeigt jetzt ISO statt Mischmasch.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

**Done when:** Commit gepusht.

---

## Phase 7 — Deploy + Synonym-Apply + Cache-Bust + Verify (1 h)

### 7.1 Deploy

```bash
ssh vps 'cd /root/VOD_Auctions && git pull && cd backend && \
  rm -rf node_modules/.vite .medusa && npx medusa build 2>&1 | tail -20; \
  rm -rf public/admin && cp -r .medusa/server/public/admin public/admin && \
  ln -sf /root/VOD_Auctions/backend/.env /root/VOD_Auctions/backend/.medusa/server/.env && \
  pm2 restart vodauction-backend && sleep 8 && pm2 status vodauction-backend'
```

### 7.1b Meili-Synonyms applyen — Pflicht-Step

```bash
ssh vps '. ~/VOD_Auctions/scripts/meili-cron-env.sh && \
  cd ~/VOD_Auctions/scripts && \
  venv/bin/python3 meilisearch_sync.py --apply-settings'
# Erwartet: Output "Synonyms applied: ~300 entries"
```

Verify per Meili-API:
```bash
ssh vps 'curl -s -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  http://127.0.0.1:7700/indexes/releases-commerce/settings/synonyms | python3 -m json.tool | head -30'
# Erwartet: Country-Synonyms mit germany/deutschland/uk/usa etc. sichtbar
```

Search-Smoke-Test:
```bash
ssh vps 'curl -s -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -X POST http://127.0.0.1:7700/indexes/releases-commerce/search \
  -H "Content-Type: application/json" \
  -d "{\"q\":\"germany\",\"limit\":3}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(\"hits:\", d.get(\"estimatedTotalHits\")); [print(h[\"title\"], h.get(\"country\")) for h in d[\"hits\"][:3]]"'
# Erwartet: estimatedTotalHits ~12.689; alle hits haben country = "DE"
```

### 7.1c Storefront-Cache-Bust (Medium Issue #4)

```bash
# Vercel On-Demand Revalidation für /catalog* Pfade
# revalidateReleaseCatalogPage helper triggern oder Webhook direkt anpingen
curl -X POST "https://vod-auctions.com/api/revalidate" \
  -H "x-revalidate-secret: $REVALIDATE_SECRET" \
  -d '{"path": "/catalog"}' \
  -d '{"path": "/band"}' \
  -d '{"path": "/label"}' \
  -d '{"path": "/press"}'
# Plus: Upstash-Redis Catalog-Keys flushen falls verwendet
# (Memory: Catalog-Page-Cache in Redis nicht garantiert — Vercel-Cache reicht meist)
ssh vps 'redis-cli --scan --pattern "catalog:*" | xargs -r redis-cli DEL'
```

Verify nach Cache-Bust:
```bash
# Beide Pfade aus mehreren Geos/Browsers anpingen (Cache-Hits provozieren)
for url in \
  "https://vod-auctions.com/catalog?country=Germany" \
  "https://vod-auctions.com/catalog?country=DE" \
  "https://vod-auctions.com/catalog?country=United+Kingdom" \
  "https://vod-auctions.com/catalog?country=GB"; do
  curl -sS -o /dev/null -w "%{http_code} %{size_download}b %{url_effective}\n" "$url"
done
# Erwartet: alle 200, ähnliche size_download (= Items werden gefunden)
```

### 7.2 Sync-Cron wieder aktivieren

```bash
ssh vps 'crontab -l > /tmp/crontab.bak && \
  crontab -l | sed "s|^# PAUSED-rc54.0: ||" | crontab - && \
  crontab -l | grep legacy_sync'
# Verify: legacy_sync-Zeile ist wieder ohne # PAUSED
```

Erster Cron-Run nach Re-Aktivierung produziert minimale Diffs (idealerweise 0, weil Backfill alles ISO gemacht hat und Sync auch ISO schreibt). Falls Diffs > 100 Rows: untersuchen, Mapping-Lücke fixen.

### 7.3 Frank-Stichprobe

- `/app/erp/inventory/session` öffnen, „joy division closer" suchen → Country-Spalte zeigt konsistent „🇬🇧 GB" für UK-Pressungen, „🇺🇸 US" für US-Pressungen
- `/app/media/<id>` für 5 Test-Releases → kein „⚠️ (non-ISO)" mehr
- Storefront `/catalog?country=Germany` und `/catalog?country=DE` returnen identische Items

**Done when:** Stichproben grün, Sync läuft sauber.

---

## Phase 8 — Cleanup (7 Tage nach Phase 4)

```sql
-- Erst nach 7 Tagen Stabilität OHNE Probleme:
DROP TABLE backup_release_country_pre_iso_migration;
```

Plus optional: alte deutsche `COUNTRY_DE_TO_EN`-Map in `legacy_sync_v2.py` löschen (wird seit Phase 2.2 nur noch als Zwischenschritt benutzt; kann durch direkten DE→ISO ersetzt werden).

```bash
git checkout main
git merge feat/rc54-country-iso-migration
git tag v1.0.0-rc54.0
git push --tags
gh release create v1.0.0-rc54.0 --title "rc54.0 — Country-ISO Migration" --notes "..."
```

CHANGELOG-Entry + Memory-Update.

---

## Rollback-Strategie pro Phase

| Phase | Rollback |
|---|---|
| 1 | `git revert` — pure additive (incl. dual-tolerant Read-Pfade), kein DB-Touch |
| 2 | `git revert` der Write-Pfad-Commits + Cron-Pause aufheben — neue Writes gehen wieder English/Raw, dual-tolerant Read-Pfad puffert Storefront ab |
| 3 | Deploy von revert auf VPS |
| 4 | `UPDATE "Release" r SET country = b.country_pre, "updatedAt" = b.updatedAt_pre FROM backup_release_country_pre_iso_migration b WHERE r.id = b.id;` + Constraint droppen (falls schon angelegt) |
| 5 | `ALTER TABLE "Release" DROP CONSTRAINT release_country_iso_format;` |
| 6 | `git revert` des Cleanup-Commits — Variante-A dual-tolerant Pfade kommen zurück, Storefront funktioniert weiter |
| 8 | Kein Rollback nötig (Snapshot-Drop und Tag) |

**Vorteil Variante A:** weil Phase 1.7 dual-tolerant ist, kann Phase 6 jederzeit unabhängig reverted werden ohne Storefront-Impact. Auch wenn Phase 4-Rollback nötig wird, läuft der Storefront-Filter weiter weil er beide Encodings akzeptiert.

**Kritischer Rollback-Pfad — wenn Phase 4 schief geht und Phase 6 schon deployed ist:**
1. Phase 6 zuerst reverten (dual-tolerant Pfade kommen zurück)
2. Sofort Cron pausieren (verhindert neue dirty Writes)
3. Backup-Restore via UPDATE FROM
4. Constraint droppen
5. Read-Pfad-Commits bleiben dual-tolerant — Storefront läuft weiter
6. Frank-Debrief

---

## Acceptance Criteria (Gesamt-Migration)

**Datenebene:**
- ✅ `SELECT COUNT(*) FROM "Release" WHERE country IS NOT NULL AND country !~ '^[A-Z]{2}$'` = 0
- ✅ `SELECT COUNT(*) FROM "Release" WHERE country = ''` = 0
- ✅ CHECK-Constraint `release_country_iso_format` aktiv

**Admin-Display:**
- ✅ Catalog Detail (`/app/media/<id>`): 5 Random-Releases mit historisch „UK"/„United Kingdom"/„GB" zeigen jetzt identisch „🇬🇧 United Kingdom (GB)" (Frank-Display-Wunsch)
- ✅ Stocktake-Country-Spalte (rc53.19): zeigt konsistent „🇩🇪 DE"-Format statt Mischmasch (Compact-Stil für 110 px)
- ✅ Discogs-Preview-Modal: Diff zeigt korrekte „kein change" für UK→GB-Fälle (kein False-Positive mehr)

**Storefront:**
- ✅ Alle Render-Sites: `<Badge>` zeigt nur ISO-Code (z.B. „DE") — **kein Display-Code-Change**, läuft automatisch durch Backfill
- ✅ Filter Backward-Compat: `?country=Germany` == `?country=DE` (gleiche Ergebnis-Menge)
- ✅ Volltextsuche Backward-Compat: Tippen von „germany" / „deutschland" / „england" / „uk" findet weiterhin Releases (via Meili-Synonyms)
- ✅ Synonym-Coverage: für jeden ISO-Code mit ≥10 Releases gibt es mindestens englischen + deutschen Alias in der Synonym-Map
- ✅ Zero-Downtime-Verify: Storefront-Filter funktioniert während aller Migration-Phasen kontinuierlich (Phase 3 Smoke-Test grün, Phase 7 Cache-Bust-Verify grün)

**Pipelines:**
- ✅ Meili-Drift-Cron sieht 0 stale-docs nach 30 Min
- ✅ Legacy-Sync-Cron läuft eine volle Stunde ohne neue Diffs (idempotent)
- ✅ Sync-Logs zeigen keine WARN-Spam (unbekannte Country-Strings)

---

## Out of Scope für rc54.0 (Follow-up RSE-Tickets)

- **PressOrga.country** (1.983 Rows in deutschen Vollformen — selber Plan, separater Branch, ~2 h)
- **LabelPerson.country** (458 Rows mixed — selber Plan)
- **entity_content.country** (Anzahl prüfen, vermutlich klein)
- Storefront-Country-Picker (heute zeigt Storefront keinen — wird mit RSE-294 erste-öffentliche-Auktionen relevant)
- `crm_master_address.country` / `crm_master_address.country_code` (Dual-Column verifizieren — vermutlich schon konsistent durch Stripe-Address-Webhooks)
