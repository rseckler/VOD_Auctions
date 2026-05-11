# Country-ISO-Migration — Option A Plan

**Status:** Draft v1 · 2026-05-11 · Author: Robin / Claude
**Scope:** `Release.country` von Misch-Encoding (English Name / UK-Alias / ISO-2 / Multi-Region) auf **ISO-3166-1 alpha-2 als Single Source of Truth** umstellen
**Out of Scope (Follow-up):** `Artist.country` (leer), `Label.country` (leer), `PressOrga.country` (1.983 Rows in DE-Vollformen), `LabelPerson.country` (458 Rows mixed), `musician.country` (leer), `entity_content.country`, `waitlist_applications.country` — werden in einem zweiten Pass nachgezogen (Plan dafür entsteht aus diesem Pattern)
**Trigger:** Stocktake-Search rc53.19 (`docs/sessions/2026-05-11`) deckte sichtbar auf, dass im Catalog drei Encodings koexistieren

---

## TL;DR

1. **Single Source of Truth:** `Release.country` enthält **immer** einen ISO-3166-1 alpha-2 Code (UPPERCASE, 2 Buchstaben) oder NULL — niemals einen englischen Vollnamen, niemals einen Alias wie „UK".
2. **Multi-Region Strategie (siehe §5):** Pure EU-Releases → `EU` (ISO-3166-1 exceptionally-reserved). Worldwide → `WO` (intern, ohne ISO-Bedeutung). Compound (z.B. „UK & Europe", „USA & Canada") → **primary country** (das zuerst genannte Land), Sekundärinformation geht verloren — akzeptabler Trade-off bei 1.3 % der Rows.
3. **Backfill:** Eine deterministische `UPDATE`-Migration mit 89-Werte-Mapping-Tabelle und Snapshot-Backup als Rollback-Pfad.
4. **Write-Pfade härten:** Vier Codepfade (`legacy_sync_v2`, `discogs-import/commit`, `discogs-preview`, `/admin/media/[id]` Picker) konvergieren auf einen shared `normalizeCountryToIso()`-Helper, der **ausschließlich** ISO-Codes returnt.
5. **Read-Pfade vereinfachen:** Admin-UI, Storefront-Filter, Meili-Sync gehen davon aus dass `country` schon ISO ist — kein Inline-Lookup mehr.
6. **Geschätzter Aufwand:** ~10-12h für Backfill + Code + Verifikation, ohne PressOrga-Follow-up.

---

## 1. Problem Statement

`Release.country` ist heute eine `text`-Spalte ohne Constraint, die parallel mit drei verschiedenen Encoding-Konventionen befüllt wird:

| Encoding | Beispiel | Quelle |
|---|---|---|
| English Full Name | „Germany", „United Kingdom", „United States" | `scripts/legacy_sync_v2.py::translate_country()` (DE→EN-Map) |
| Discogs-Roh-String | „UK", „US", „Europe", „UK & Europe" | `backend/src/api/admin/discogs-import/commit/route.ts:1173` |
| ISO-3166-1 alpha-2 | „DE", „GB", „FR" | `backend/src/api/admin/media/[id]/route.ts:227` (Country-Picker) + `discogs-preview/route.ts::normalizeCountry()` (seit rc53.18) |

Auf der Read-Seite konkurrieren zwei Annahmen:

- **Admin-UI** (`media/[id]/page.tsx:1094` + `country-iso.ts::formatCountryLabel`) erwartet ISO und wirft `⚠️ X (non-ISO)` bei jedem Nicht-ISO-Wert.
- **Storefront-Catalog-Filter** (`route-postgres-fallback.ts::COUNTRY_ALIASES`) erwartet English Name und mappt jegliche User-Eingabe nach „Germany", „United Kingdom" etc.
- **Meili-Sync** (`scripts/meilisearch_sync.py` + `data/country_iso.py`) berechnet `country_code` zur Indexing-Zeit aus dem DB-Wert (English Name → ISO).

Resultat: Jeder Write-Pfad schreibt eine andere Form, jeder Read-Pfad erwartet eine andere Form — das System hält sich nur deswegen über Wasser, weil die Inline-Lookups defensiv die jeweils nicht-erwartete Form schlucken.

---

## 2. Aktuelle Datenverteilung (Snapshot 2026-05-11)

**Tabelle `Release` — 52.788 Rows total, 48.694 mit non-null country, 89 distinct Werte:**

| Bucket | Rows | % | Distinct | Typische Beispiele |
|---|---:|---:|---:|---|
| English Full Name | 43.644 | 82.7 % | 62 | Germany 12.633 · United States 9.062 · United Kingdom 8.693 · France 2.600 · Netherlands 2.004 |
| Short-Alias (Discogs-roh, **nicht ISO**) | 2.161 | 4.1 % | 1 | UK |
| Bereits ISO (zufällig korrekt) | 2.211 | 4.2 % | 14 | US 2.071 · DE 56 · GB 43 · FR 15 · IT 6 · CA 5 · BE 5 · ES 2 · NL 2 · JP 2 · IS 2 · CH 1 · NO 1 · AT 1 |
| Multi-Region | 634 | 1.2 % | 17 | Europe 443 · European Union 100 · UK & Europe 80 · Germany, Austria, & Switzerland 15 · Benelux 12 · USA & Europe 11 · USA & Canada 11 · Worldwide 8 · Scandinavia 3 … |
| NULL / leer | 4.094 | 7.8 % | — | — |
| Other / historisch | 44 | <0.1 % | 5 | USSR 2 · Czechoslovakia 7 · East Germany (GDR) 61 · German Democratic Republic (GDR) 40 · Yugoslavia 63 · Serbia and Montenegro 14 |

Korrelation gegen `discogs_id`:
- **17.520 Rows ohne discogs_id** (nur Legacy-Sync): 100 % English-Names — sauber, weil `translate_country()` der einzige Pfad ist.
- **31.174 Rows mit discogs_id**: 26.124 English-Names + 4.232 UK/US + 627 Multi-Region + 140 ISO + 44 Other → **hier sitzt der Mischmasch**.

→ Der historische Discogs-Commit-Pfad ist die alleinige Quelle für UK/US/Multi-Region-Werte. Der seit rc53.18 aktive `normalizeCountry()` im Preview-Modal hat das Problem stabilisiert, aber nicht zurück-migriert.

---

## 3. Industry Comparison

Wie behandeln vergleichbare Plattformen das gleiche Problem?

| Plattform | Modell | Bewertung |
|---|---|---|
| **Discogs** (eigene DB) | `country` text, free-form. Speichert Compound („UK & Europe") direkt aus der Editor-Eingabe. Keine Normalisierung. Filter-Facette zeigt alle ~150 distinct strings. | Pragmatisch, aber genau die Quelle unseres Problems. Filter ist UX-Chaos: User sucht „US" bekommt nicht „United States"-Items. |
| **MusicBrainz** | 1:N `release-event`-Tabelle mit `country_code` (ISO-3166-1) + `date` pro Event. Multi-Region-Release = mehrere Events. Nutzt User-assigned `XW` (Worldwide), `XE` (Europe) — letzteres bewusst statt EU. | Semantisch korrekt, „Single Source of Truth pro Pressung". Schema-Aufwand erheblich. Für 1.3 % Multi-Region-Cases overkill. |
| **Bandcamp** | Kein country-Feld auf Releases. | Simpel, aber Information fehlt — bei einer Auction-Plattform nicht akzeptabel (Frank: „verschiedene Pressungen aus verschiedenen Ländern"). |
| **eBay** | `Item.ItemLocation.Country` als single ISO-2 Code (origin only). Multi-Region als Marketplace-Filter, nicht am Item. | Industriestandard für E-Commerce. Genau unser Use-Case. |
| **Shopify** | `Product.origin_country` als ISO-2. Genauso bei Storefront-Filtern (`shipping_country` etc.). | Industriestandard. |
| **Wikidata** | Q-IDs (Q183 = Germany) mit Property P495 „country of origin". Statements können qualifiers haben (z.B. „start_time", „end_time"). | Maximalflexibel, aber kein DB-Modell für ein einzelnes Produkt. |
| **ISO-3166 Reserved Codes** | Zwei Klassen: (a) **Exceptionally reserved** (formal in ISO-3166-1 Liste): `EU` European Union, `EZ` Eurozone, `UK` (für GB), `SU` (deprecated), `AC`, `CP`, `DG`, `EA`, `FX`, `IC`, `TA`. (b) **User-assigned ranges** `AA`, `Q[M-Z]`, `X[A-Z]`, `ZZ` — ISO sagt explizit „do as you wish". MusicBrainz nutzt XE für Europe, XW für Worldwide. | EU ist die formalere Wahl für „Europe" (ISO-reserviert, 🇪🇺-Emoji rendert out-of-the-box). |

**Folgerung für VOD:** Wir adoptieren das **eBay/Shopify-Modell** (single ISO-2 Code pro Release) und ergänzen es um zwei reservierte Codes für die seltenen Multi-Region-Fälle: **EU** (ISO-3166-1 *exceptionally-reserved*, mit 🇪🇺-Flag) für Pure-Europe und **WO** (intern für „WOrldwide") für die 8 Worldwide-Rows. Der semantische Verlust gegenüber MusicBrainz' 1:N-Modell ist akzeptabel: VOD ist Auction-/Stocktake-Plattform, kein Discographie-Werkzeug. Frank's Bedarf („wo wurde gepresst, welche Variante habe ich?") wird durch die *primäre* Pressungs-Region erfüllt.

**Bewusste Abweichung von MusicBrainz:** MB nutzt XE statt EU für Europe — Grund: XE ist im User-assigned Range, EU dagegen ISO-reserviert für „Organisation EU". Beide haben Tradeoffs; wir wählen EU wegen (a) formalem ISO-Status und (b) korrektem Flag-Rendering. **Bewusste Abweichung von beidem:** Für Worldwide nehmen wir **WO** statt XW (MB) oder ZZ (CLDR Unknown). WO ist memorable („WOrld") und im aktuellen ISO-3166-1 nicht zugewiesen — strict gesehen *unassigned* statt *user-assignable*; in der Praxis kein Konfliktrisiko, da ISO seit 2011 keine W-Codes mehr vergeben hat. Falls ISO WO jemals zuweist, ist eine spätere Sub-Migration (~8 Rows) trivial.

---

## 4. Target State — Design Decisions

### 4.1 Schema-Invarianten (nach Migration)

```
Release.country IN (
  -- 247 reguläre ISO-3166-1 alpha-2 Codes (DE, GB, US, FR, IT, JP, …)
  -- Plus deprecated ISO-3166-3 Codes (für historische Releases):
  'YU',  -- Yugoslavia (dissolved 2003)
  'DD',  -- East Germany / GDR (reunified 1990)
  'CS',  -- Czechoslovakia (dissolved 1993) / Serbia and Montenegro (dissolved 2006)
  'SU',  -- Soviet Union (dissolved 1991)
  -- Plus user-assigned Reserved Codes für Multi-Region:
  'EU',  -- European Union / Europe (ISO-3166-1 exceptionally-reserved)
  'WO',  -- Worldwide (intern; nicht ISO-zugewiesen, aktuell unassigned-Range)
  NULL   -- explizit unknown
)
```

**Nicht erlaubt:** Vollnamen, „UK"-Alias, Compound-Strings, Whitespace, Mixed-Case.

### 4.2 Validation (DB-Level)

Wir fügen einen **CHECK-Constraint** hinzu, der nach der Migration die Invariante hart macht:

```sql
ALTER TABLE "Release"
  ADD CONSTRAINT release_country_iso_format
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
```

Das verhindert Format-Drift (z.B. „uk" Lowercase oder „US " mit Whitespace). Die *Werte-Whitelist* (gegen `country-iso.ts::ISO_COUNTRIES`) ist Application-Level — DB-Constraint bleibt formal, weil ISO-3166 sich theoretisch ändern kann (siehe Kosovo XK 2008+).

### 4.3 Locked-Fields-Respekt

`Release.locked_fields jsonb` kann den Wert `"country"` enthalten. **Die Migration ignoriert das Lock** — der Lock-Mechanismus dient dem Schutz gegen Sync-Overwrites, nicht gegen Encoding-Cleanup. „UK" → „GB" ist semantisch derselbe Wert, der Lock bleibt nach der Migration unverändert in Place.

### 4.4 Sync-Pipeline Invariante (Write-Side)

Alle vier Write-Pfade rufen vor jedem Insert/Update den shared Helper:

```ts
// backend/src/lib/country-normalize.ts (NEU)
export function normalizeCountryToIso(raw: string | null | undefined): string | null
```

`legacy_sync_v2.py` bekommt ein Python-Pendant:

```python
# scripts/data/country_iso.py — refactored
def normalize_country_to_iso(raw: str | None) -> str | None
```

Beide Helpers nutzen dieselbe Mapping-Tabelle (siehe §6).

---

## 5. Multi-Region Strategie (Detail)

Das ist der konzeptionell schwierigste Teil. Wir haben 17 distinct Multi-Region-Strings (634 Rows = 1.2 %). Drei Lösungsklassen mit Tradeoffs:

### 5.1 Klassifikation der 17 Multi-Region-Werte

| String | Rows | Klasse | Mapping |
|---|---:|---|---|
| Europe | 443 | Pure-Europe | **EU** |
| European Union | 100 | Pure-Europe | **EU** |
| UK & Europe | 80 | Compound (UK first) | **GB** (primary) |
| Germany, Austria, & Switzerland | 15 | Compound (DACH, DE first) | **DE** (primary) |
| Benelux | 12 | Region-Sammelname (NL/BE/LU) | **NL** (de-facto Press-Land) |
| USA & Europe | 11 | Compound (USA first) | **US** (primary) |
| USA & Canada | 11 | Compound (USA first) | **US** (primary) |
| Worldwide | 8 | Pure-Worldwide | **WO** |
| UK, Europe & US | 6 | Compound (UK first) | **GB** (primary) |
| UK & US | 6 | Compound (UK first) | **GB** (primary) |
| UK & Ireland | 3 | Compound (UK first) | **GB** (primary) |
| Scandinavia | 3 | Region-Sammelname (SE/NO/DK/FI) | **SE** (de-facto Press-Land) |
| Germany & Switzerland | 2 | Compound (DE first) | **DE** (primary) |
| USA, Canada & Europe | 2 | Compound (USA first) | **US** (primary) |
| UK & Germany | 2 | Compound (UK first) | **GB** (primary) |
| France & Benelux | 1 | Compound (FR first) | **FR** (primary) |
| USA, Canada & UK | 1 | Compound (USA first) | **US** (primary) |

**Entscheidungs-Logik (deterministisch, dokumentiert im Helper):**

1. **Pure-EU Markers** („Europe", „European Union", „EU") → `EU`
2. **Pure-Worldwide** („Worldwide") → `WO`
3. **Region-Sammelnamen** mit traditionellem Press-Land:
   - Benelux → NL (alle drei NL-pressed historisch)
   - Scandinavia → SE
4. **Compound mit explizitem Ampersand/Komma** → ISO-Code des **erstgenannten Landes** (= primäres Pressland)

**Was wir verlieren:** Bei den 154 Compound-Rows (= 0.29 % aller Releases) geht die Sekundär-Region-Info verloren. Beispiel: „UK & Europe" → wird zu „GB". Wenn jemand später wissen will dass dieselbe Pressung auch in Europa vertrieben wurde, muss er Discogs konsultieren.

### 5.2 Warum kein `country_extra`-Feld?

Diskutierte Alternative: `Release.country` = primary ISO + `Release.country_extra jsonb` mit Sekundär-Regionen.

**Dagegen:**
- 0.3 % der Rows mit zusätzlichen Daten = Schema-Footprint disproportional zum Nutzen
- Dual-Column-Drift-Risiko (siehe `feedback_dual_column_drift.md` aus rc52.6.5 — wir haben das vor 2 Wochen erst gelernt)
- Kein einziger Read-Pfad würde die Spalte heute konsumieren (keine UI, kein Filter)
- Wenn der Bedarf später aufkommt: additive Migration zu jedem Zeitpunkt möglich (`country_extra jsonb DEFAULT '[]'`)

**Dafür spricht:** Curatorial-Detail bleibt erhalten. Audit-Trail.

**Empfehlung:** Vorerst **nicht** einführen. Wenn Frank die 154 Rows später vermissen sollte, eröffnen wir einen Follow-up. Für jetzt: clean schema > theoretical completeness.

### 5.3 Reserved Codes EU / WO — Risikoanalyse

- **EU** ist im **ISO-3166-1 „exceptionally reserved"**-Set:
  - **Formal:** ISO-3166-1 hält EU explizit für „European Union" reserviert (zusammen mit AC, CP, DG, EA, EZ, FX, IC, SU, TA, UK)
  - **Verwendet von:** ISO 4217 (Währungscode EUR), Eurostat, EU-Gesetzgebung, einigen ISO-3166-Implementierungen direkt als Country-Code-Stand-in
  - **Flag-Emoji:** 🇪🇺 — wird über das normale Regional-Indicator-Pair `E+U` (U+1F1EA U+1F1FA) korrekt zur EU-Flagge zusammengesetzt. Unser bestehendes `flagFor()` funktioniert **out-of-the-box ohne Special-Case**.
  - **Caveat:** EU bedeutet semantisch „Organisation/Wirtschaftszone EU", nicht „geografisches Europa". MusicBrainz hat deshalb bewusst XE statt EU gewählt. Für unseren Use-Case (Pressung wurde EU-weit veröffentlicht) trifft EU die Semantik aber genau.
- **WO** ist **nicht** in ISO-3166-1 vergeben — weder als zugewiesener Code noch als exceptionally-reserved noch im user-assignable Range `X[A-Z]`/`Q[M-Z]`/`AA`/`ZZ`. WO sitzt im *unassigned* Bereich.
  - **Risiko:** ISO könnte theoretisch WO an ein neues Land vergeben (passiert aber praktisch nie für W-Codes — letzte ISO-Neuzuweisungen waren XK Kosovo 2008 und SS South Sudan 2011, beide nicht W-Range)
  - **Alternative wäre `ZZ`** (CLDR-Konvention für „Unknown Region", formell user-assigned) oder einfach **NULL**
  - **Frank-Entscheidung:** wir nehmen WO, weil es als Token verständlich ist und 8 Rows betroffen sind — bei ISO-Konflikt später trivialer Sub-Update
  - **Flag-Emoji:** 🇼🇴 wird via Regional-Indicator-Pair `W+O` zusammengesetzt, ist aber kein definiertes Flag — die meisten Systeme rendern es als zwei kleine Buchstaben-Boxen. Wir setzen einen **Special-Case** in `formatCountryLabel()` der für WO 🌐 (Globus) statt der Regional-Indicators returnt.

→ Helper `formatCountryLabel()` muss nur für WO einen Special-Case erhalten (EU funktioniert direkt):

```ts
// Nur WO braucht ein Override — EU rendert via flagFor() automatisch korrekt zu 🇪🇺.
const FLAG_OVERRIDE: Record<string, string> = {
  WO: "🌐",
}

function flagWithOverride(code: string): string {
  return FLAG_OVERRIDE[code] ?? flagFor(code)
}
```

Plus Einträge in `ISO_COUNTRIES`-Liste:
- `EU`: nameEn „Europe (EU)", nameDe „Europäische Union", `reserved: 'iso-exceptional'`
- `WO`: nameEn „Worldwide", nameDe „Weltweit", `reserved: 'vod-internal'`

---

## 6. Migration Plan — Phasenmodell

### Phase 0: Pre-Flight (1h)

- **Snapshot-Backup** als rollback-fähige Quelle anlegen:
  ```sql
  CREATE TABLE backup_release_country_pre_iso_migration AS
  SELECT id, country, updatedAt, locked_fields
  FROM "Release"
  WHERE country IS NOT NULL OR locked_fields @> '"country"'::jsonb;
  -- Erwartet: ~48.700 Rows
  ```
- **Mapping-Validation-View** für Frank-Review:
  ```sql
  -- Zeigt jede Distinct-Source pro vorgeschlagenem Target,
  -- damit Frank vor dem UPDATE die 89 Werte ansehen kann.
  ```
- **Test auf Supabase-Branch** (~$0.01/h via MCP) bevor wir Prod anfassen — siehe CLAUDE.md „Staging-DB ist nicht mehr verfügbar". Alternative: Single-Release-Test-UPDATE auf Prod (rollback-fähig).

### Phase 1: ISO-Code-Liste in `country-iso.ts` erweitern (1h)

Aktuell hat `backend/src/admin/data/country-iso.ts` 249 Einträge — die meisten ISO-3166-1 alpha-2 Hauptcodes. Wir ergänzen:

- 4 deprecated ISO-3166-3-Codes: YU, DD, CS, SU (mit `deprecated: true`-Flag)
- 2 reserved Codes: EU (ISO-exceptionally-reserved), WO (VOD-intern für Worldwide) — beide mit `reserved`-Flag

Plus Erweiterung von `findCountryByName()` Inline-Aliases um die English-Names die in unserer DB stehen:

```ts
const aliases: Record<string, string> = {
  ...existing,
  "east germany (gdr)": "DD",
  "german democratic republic (gdr)": "DD",
  "german democratic republic": "DD",
  "yugoslavia": "YU",
  "soviet union": "SU",
  "czechoslovakia": "CS",
  "serbia and montenegro": "CS",  // war 2003-2006 als CS
  // Multi-Region:
  "europe": "EU",
  "european union": "EU",
  "eu": "EU",
  "worldwide": "WO",
  // Region-Sammelnamen:
  "benelux": "NL",
  "scandinavia": "SE",
  // Compound — primary country first:
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

### Phase 2: Shared `normalizeCountryToIso()`-Helper (1h)

Neue Datei `backend/src/lib/country-normalize.ts`:

```ts
import { findCountryByName, isValidIsoCode } from "../admin/data/country-iso"

/**
 * Single-source canonical normalizer. ALLE Write-Pfade durchlaufen ihn:
 *   1. NULL/empty → NULL
 *   2. Already ISO-2 → uppercase passthrough
 *   3. Name/Alias → ISO via findCountryByName
 *   4. Unknown → NULL (statt "garbage in, garbage stored")
 */
export function normalizeCountryToIso(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.length === 2 && isValidIsoCode(trimmed.toUpperCase())) {
    return trimmed.toUpperCase()
  }
  const found = findCountryByName(trimmed)
  return found?.code ?? null
}
```

Python-Pendant in `scripts/data/country_iso.py` mit identischer Mapping-Tabelle (Doku-Pflicht: beide müssen synchron bleiben — Memory `feedback_app_db_hash_formula_must_match` lehrt uns das).

### Phase 3: Write-Pfade umstellen (3h)

| Datei | Aktuelles Verhalten | Neues Verhalten |
|---|---|---|
| `scripts/legacy_sync_v2.py:113-159 + 224-228` | `translate_country()` returnt English Name | Returnt ISO-Code direkt aus erweiterter `COUNTRY_DE_TO_ISO`-Map |
| `backend/src/api/admin/discogs-import/commit/route.ts:1173` | Schreibt `cached.country` raw | Wrappt in `normalizeCountryToIso(cached.country)` |
| `backend/src/api/admin/discogs-import/fetch/route.ts:281` | Schreibt `data.country \|\| ""` in Cache | Bleibt unverändert (Cache speichert die Raw-API-Antwort, Normalisierung erst beim Commit) |
| `backend/src/api/admin/media/[id]/discogs-preview/route.ts:102-107` | `normalizeCountry()` (lokal) | Ersetzt durch Import von `lib/country-normalize.ts`. Lokale Funktion gelöscht. |
| `backend/src/api/admin/media/[id]/route.ts:227` | Schreibt `body.country` (vom Picker = schon ISO) | Defensiv durch `normalizeCountryToIso()` (idempotent für ISO-Werte) |

### Phase 4: Backfill-UPDATE (1h, idempotent)

```sql
BEGIN;

-- Schritt 1: Snapshot (falls Phase 0 übersprungen)
CREATE TABLE IF NOT EXISTS backup_release_country_pre_iso_migration AS
SELECT id, country, updatedAt, locked_fields
FROM "Release"
WHERE country IS NOT NULL;

-- Schritt 2: Mapping-Update über CASE
UPDATE "Release"
SET country = m.iso_code,
    updatedAt = NOW()
FROM (VALUES
  -- Top 20 mit größter Row-Anzahl explizit (für Verify-Output)
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
) AS m(source, iso_code)
WHERE "Release".country = m.source;

-- Schritt 3: Already-ISO-but-lowercase-or-whitespace (sollte selten sein, aber defensiv)
UPDATE "Release"
SET country = upper(trim(country))
WHERE country IS NOT NULL
  AND country <> upper(trim(country))
  AND length(trim(country)) = 2
  AND trim(country) ~ '^[a-zA-Z]{2}$';

-- Schritt 4: Verify — wieviel ist NICHT-NULL und NICHT-ISO-Format?
SELECT country, COUNT(*) AS leftover_count
FROM "Release"
WHERE country IS NOT NULL
  AND country !~ '^[A-Z]{2}$'
GROUP BY country
ORDER BY leftover_count DESC;
-- Erwartet: 0 rows. Wenn nicht 0: ROLLBACK.

-- Schritt 5: Constraint hinzufügen
ALTER TABLE "Release"
  ADD CONSTRAINT release_country_iso_format
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

COMMIT;
```

**Affected:** ~48.694 Rows werden ge-UPDATEd. `updatedAt` wird gebumpt → triggert `search_indexed_at = NULL` via Trigger (whitelist enthält `country`? — siehe Verification §8.2). Meili-Sync läuft im nächsten 5-Min-Cron und re-indexed alle Affected.

### Phase 5: Read-Pfade vereinfachen (2h)

| Datei | Vorher | Nachher |
|---|---|---|
| `backend/src/admin/routes/media/[id]/page.tsx:1094` | Inline-Lookup mit `⚠️ (non-ISO)` Fallback | Direkt `formatCountryLabel(release.country)` — kein Warn-Pfad mehr nötig |
| `backend/src/admin/routes/erp/inventory/session/page.tsx` (rc53.19) | Rendert `r.country` raw | Rendert `formatCountryLabel(r.country)` → `🇩🇪 DE` Flag + Code |
| `backend/src/api/store/catalog/route-postgres-fallback.ts::resolveCountry()` | User-Input → English Name | User-Input → ISO-2; WHERE-Klausel filtert `country = $iso` |
| `backend/src/api/store/catalog/route.ts` (Meili-Pfad) | Filter sendet country-Name an Meili | Filter sendet ISO-Code an Meili (passt zu `country_code`-Facette) |
| `scripts/meilisearch_sync.py:504-505` | `country: name, country_code: lookup_iso(name)` | `country: format_country_display(iso), country_code: iso` — Display-Name (für UI) wird aus ISO abgeleitet |
| `scripts/data/country_iso.py::lookup_iso()` | Name → ISO | **Inverse Funktion** `iso_to_display_name(iso) -> str` für Meili-Doc (gibt Frank seinen lesbaren „Germany"-String zurück, im UI-Layer) |

### Phase 6: Verifikation & Deploy (1h)

- Lokaler Build-Test (TypeScript-Check, Build-Output verifizieren — siehe CLAUDE.md `feedback_medusa_build_exit_nonzero`)
- 5-Release-Stichprobe via SQL: für 5 zufällige Releases mit ehemals „UK"/„United Kingdom"/„GB" sollte das UI nach Deploy *identisch* „🇬🇧 United Kingdom (GB)" rendern
- Meili-Drift-Check (`scripts/meilisearch_drift_check.py`) bestätigt 0 stale-docs nach Sync-Pass
- Storefront-Filter-Test: `/catalog?country=DE` muss exakt die gleichen Items wie `/catalog?country=Germany` returnen (Backwards-Compat per Alias-Map)

---

## 7. Backfill Mapping Table — komplette Auflistung

| Source-String | Rows | Target ISO | Klasse | Begründung |
|---|---:|---|---|---|
| Germany | 12.633 | DE | Standard | ISO-3166-1 |
| United States | 9.062 | US | Standard | |
| United Kingdom | 8.693 | GB | Standard | UK = nicht-ISO, GB = ISO |
| France | 2.600 | FR | Standard | |
| UK | 2.161 | GB | Alias | UK ist Discogs-Roh, ISO sagt GB |
| US | 2.071 | US | Alias | US ist sowohl Discogs-Roh als auch valid ISO — no-op |
| Netherlands | 2.004 | NL | Standard | |
| Italy | 1.663 | IT | Standard | |
| Belgium | 1.343 | BE | Standard | |
| Japan | 1.083 | JP | Standard | |
| Canada | 815 | CA | Standard | |
| Switzerland | 709 | CH | Standard | |
| Australia | 523 | AU | Standard | |
| Austria | 469 | AT | Standard | |
| Spain | 450 | ES | Standard | |
| Europe | 443 | **EU** | Multi-Region | Pure-EU → ISO-exceptionally-reserved Code |
| Sweden | 372 | SE | Standard | |
| Norway | 170 | NO | Standard | |
| Poland | 137 | PL | Standard | |
| Denmark | 114 | DK | Standard | |
| European Union | 100 | **EU** | Multi-Region | Pure-EU → ISO-exceptionally-reserved Code |
| Portugal | 98 | PT | Standard | |
| UK & Europe | 80 | GB | Compound | Primary = UK = GB |
| Iceland | 64 | IS | Standard | |
| Yugoslavia | 63 | YU | Deprecated-ISO | ISO-3166-3 Code, weiterhin gültig für historische Releases |
| East Germany (GDR) | 61 | DD | Deprecated-ISO | ISO-3166-3 |
| DE | 56 | DE | Already-ISO | No-op |
| Hungary | 56 | HU | Standard | |
| Greece | 54 | GR | Standard | |
| Slovenia | 50 | SI | Standard | |
| Finland | 43 | FI | Standard | |
| GB | 43 | GB | Already-ISO | No-op |
| German Democratic Republic (GDR) | 40 | DD | Deprecated-ISO | Variante-Schreibweise von Row 26 |
| New Zealand | 29 | NZ | Standard | |
| Mexico | 27 | MX | Standard | |
| South Africa | 22 | ZA | Standard | |
| Russia | 20 | RU | Standard | |
| Ireland | 18 | IE | Standard | |
| Brazil | 18 | BR | Standard | |
| Czech Republic | 17 | CZ | Standard | |
| Germany, Austria, & Switzerland | 15 | DE | Compound | Primary = DE |
| FR | 15 | FR | Already-ISO | No-op |
| Serbia and Montenegro | 14 | **CS** | Deprecated-ISO | War 2003-2006 unter CS, dann RS+ME — wir bleiben bei CS für historische Treue |
| Benelux | 12 | NL | Region-Sammel | Benelux = NL-pressed historisch |
| Argentina | 11 | AR | Standard | |
| USA & Europe | 11 | US | Compound | Primary = US |
| USA & Canada | 11 | US | Compound | Primary = US |
| Romania | 8 | RO | Standard | |
| Israel | 8 | IL | Standard | |
| Worldwide | 8 | **WO** | VOD-intern | Nicht ISO-zugewiesen, intern für „WOrldwide" — Sub-Migration trivial falls ISO WO später vergibt |
| Czechoslovakia | 7 | CS | Deprecated-ISO | ISO-3166-3 |
| India | 6 | IN | Standard | |
| UK, Europe & US | 6 | GB | Compound | Primary = UK = GB |
| IT | 6 | IT | Already-ISO | No-op |
| UK & US | 6 | GB | Compound | Primary = UK = GB |
| CA | 5 | CA | Already-ISO | No-op |
| BE | 5 | BE | Already-ISO | No-op |
| Slovakia | 5 | SK | Standard | |
| Turkey | 5 | TR | Standard | |
| Peru | 3 | PE | Standard | |
| Uruguay | 3 | UY | Standard | |
| Colombia | 3 | CO | Standard | |
| Scandinavia | 3 | SE | Region-Sammel | Skandinavien = SE-pressed historisch |
| Venezuela | 3 | VE | Standard | |
| Luxembourg | 3 | LU | Standard | |
| UK & Ireland | 3 | GB | Compound | Primary = UK = GB |
| Germany & Switzerland | 2 | DE | Compound | Primary = DE |
| USA, Canada & Europe | 2 | US | Compound | Primary = US |
| USSR | 2 | SU | Deprecated-ISO | ISO-3166-3 |
| IS | 2 | IS | Already-ISO | No-op |
| UK & Germany | 2 | GB | Compound | Primary = UK = GB |
| Philippines | 2 | PH | Standard | |
| Hong Kong | 2 | HK | Standard | |
| ES | 2 | ES | Already-ISO | No-op |
| NL | 2 | NL | Already-ISO | No-op |
| JP | 2 | JP | Already-ISO | No-op |
| Thailand | 1 | TH | Standard | |
| France & Benelux | 1 | FR | Compound | Primary = FR |
| AT | 1 | AT | Already-ISO | No-op |
| Papua New Guinea | 1 | PG | Standard | |
| USA, Canada & UK | 1 | US | Compound | Primary = US |
| Chile | 1 | CL | Standard | |
| Malaysia | 1 | MY | Standard | |
| CH | 1 | CH | Already-ISO | No-op |
| China | 1 | CN | Standard | |
| Guatemala | 1 | GT | Standard | |
| Serbia | 1 | RS | Standard | (separater Eintrag von „Serbia and Montenegro" — RS ist post-2006-Code) |
| Croatia | 1 | HR | Standard | |
| NO | 1 | NO | Already-ISO | No-op |
| Lebanon | 1 | LB | Standard | |
| Indonesia | 1 | ID | Standard | |

**Gesamt-Coverage:** 89 von 89 distinct Werten gemappt (100 %). 48.694 Non-NULL-Rows werden migriert. 4.094 NULL-Rows bleiben NULL.

**Frank-Confirm-Punkte (vor Phase 4):**
- **„Serbia and Montenegro" → CS** vs **RS**? CS ist historisch korrekt (Land existierte 2003-2006 unter dem Code). RS wäre der Nachfolger ab 2006. Empfehlung: CS, weil die Releases tatsächlich aus dieser Zeit stammen.
- **„Benelux" → NL** und **„Scandinavia" → SE**: pragmatische Entscheidung. Alternative wäre, beide auf NULL zu setzen (Information „Region statt Land" lieber explizit unknown). Empfehlung: NL/SE behalten, weil das die historisch dominante Pressländer waren.
- **Compound „UK & Europe" → GB** mit Verlust der Europe-Info: explizite Bestätigung dass das ok ist.

---

## 8. Verifikation & Acceptance Criteria

### 8.1 Pre-Deploy

- Phase 0 Snapshot-Tabelle hat ~48.694 Rows
- TypeScript-Build ist green (`npx tsc --noEmit` — pre-existing errors aus CLAUDE.md `feedback_medusa_build_exit_nonzero` zählen nicht)
- Unit-Test für `normalizeCountryToIso()` mit 89 Source-Strings → erwartetes Target

### 8.2 Post-Migration (Phase 4)

```sql
-- Verify 1: 0 Non-ISO-Format-Rows
SELECT COUNT(*) FROM "Release" WHERE country IS NOT NULL AND country !~ '^[A-Z]{2}$';
-- Expected: 0

-- Verify 2: Sanity-Check Top-5 Counts (sollte ungefähr stimmen mit Pre-Migration-Counts)
SELECT country, COUNT(*) FROM "Release" WHERE country IS NOT NULL GROUP BY country ORDER BY COUNT(*) DESC LIMIT 5;
-- Expected: DE 12689 · US 11144 · GB 11020 · FR 2615 · NL 2006 (=alte Sums incl. Aliases)

-- Verify 3: Constraint aktiv
SELECT conname FROM pg_constraint WHERE conname = 'release_country_iso_format';
-- Expected: 1 row

-- Verify 4: Trigger-Bumps haben gefeuert
SELECT COUNT(*) FROM "Release" WHERE search_indexed_at IS NULL;
-- Expected: gleich oder größer als pre-migration ~48.694
```

### 8.3 Post-Deploy (Phase 6)

- 5-Release-Stichprobe in `/app/media/<id>` zeigt nirgends mehr `⚠️ (non-ISO)`, sondern überall `🇩🇪 Germany (DE)` etc.
- Stocktake-Search (rc53.19) zeigt in der Country-Spalte konsistente 2-Letter-Codes statt Mischmasch
- Storefront-Filter `?country=Germany` und `?country=DE` returnen exakt dieselben Ergebnisse (Alias-Map-Test)
- Meili-Drift `≤ 5 docs` (5-Min-Sync hat alles re-indexed)

---

## 9. Rollback-Strategie

**Wenn nach Phase 4 ein Show-Stopper auftaucht** (z.B. eine bisher unbekannte Library erwartet die Vollnamen):

```sql
BEGIN;

ALTER TABLE "Release" DROP CONSTRAINT release_country_iso_format;

UPDATE "Release" r
SET country = b.country,
    updatedAt = b.updatedAt
FROM backup_release_country_pre_iso_migration b
WHERE r.id = b.id;

-- Verify
SELECT COUNT(*) FROM "Release" r
JOIN backup_release_country_pre_iso_migration b ON r.id = b.id
WHERE r.country IS DISTINCT FROM b.country;
-- Expected: 0

COMMIT;
```

Dann Code-Revert via `git revert <commit>` und PM2-Restart.

**Cleanup nach erfolgreicher Migration** (frühestens 7 Tage nach Deploy, wenn keine Probleme):

```sql
DROP TABLE backup_release_country_pre_iso_migration;
```

---

## 10. Scope / Out of Scope

**In Scope:**
- `Release.country` (48.694 Non-NULL-Rows, ~52.788 total)
- Alle Write-Pfade (legacy_sync, discogs-import, discogs-preview, manual-edit)
- Alle Read-Pfade (Admin-UI, Storefront-Filter, Meili-Sync)

**Out of Scope (Follow-up als RSE-Tickets):**
- **`PressOrga.country`** (1.983 Rows, in deutschen Vollformen — „Deutschland", „Vereinigtes Königreich von Großbritannien und Nordirland" plus 526× „--" als Unknown-Placeholder). Selbe Migration-Logik anwendbar.
- **`LabelPerson.country`** (458 Rows, mixed)
- **`entity_content.country`** (Anzahl unklar)
- **`waitlist_applications.country`** (Customer-Adressdaten, wahrscheinlich schon ISO via Medusa-Patterns — verifizieren)
- **`musician.country` / `Artist.country` / `Label.country`** (alle 0 Non-NULL-Rows — keine Daten zu migrieren, aber Constraint addieren)
- **`crm_master_address.country` / `crm_master_address.country_code`**: bereits dual-column, vermutlich konsistent — verifizieren ob Cleanup nötig

**Nicht migriert:**
- Medusa-Native-Tabellen (`order_address.country_code`, `customer_address.country_code`, `cart_address.country_code`, `tax_region.country_code`, `geo_zone.country_code`) — die sind bereits ISO via Medusa-Convention und brauchen keinen Touch.

---

## 11. Geschätzter Aufwand

| Phase | Aufwand | Risiko |
|---|---:|---|
| 0 — Pre-Flight + Mapping-Validation | 1h | Niedrig |
| 1 — country-iso.ts erweitern (EU/WO/DD/CS/SU/YU + Aliases) | 1h | Niedrig |
| 2 — Shared Helper `country-normalize.ts` + Python-Pendant | 1h | Niedrig |
| 3 — Write-Pfade umstellen | 3h | Mittel (legacy_sync_v2-Test gegen Staging-Branch nötig) |
| 4 — Backfill-UPDATE | 1h | **Hoch** — destruktive Massen-Operation, Snapshot + Frank-Approval Pflicht |
| 5 — Read-Pfade vereinfachen | 2h | Mittel (Storefront-Filter-Regression-Risiko) |
| 6 — Deploy + Verify | 1h | Niedrig |
| **Gesamt** | **10h** | |

Plus optionaler Follow-up:
- **PressOrga.country** Migration nach demselben Pattern: ~2h (deutsche Vollformen → ISO, ~1.500 Rows betroffen)

---

## 12. Anhang: Mapping in Python / TypeScript

Für die Code-Reviewer:

```python
# scripts/data/country_iso.py — neue Version
COUNTRY_TO_ISO: dict[str, str] = {
  # ... bestehende Map plus die neuen Multi-Region-Einträge aus §7
}

DEPRECATED_ISO: set[str] = {"YU", "DD", "CS", "SU"}  # ISO-3166-3
RESERVED_ISO: set[str] = {"EU", "WO"}  # EU = ISO-exceptionally-reserved, WO = VOD-internal

def normalize_country_to_iso(raw: str | None) -> str | None:
    if not raw: return None
    trimmed = raw.strip()
    if not trimmed: return None
    if len(trimmed) == 2:
        upper = trimmed.upper()
        if upper in ALL_VALID_ISO_CODES: return upper
    return COUNTRY_TO_ISO.get(trimmed) or COUNTRY_TO_ISO.get(trimmed.lower())
```

```ts
// backend/src/lib/country-normalize.ts — neue Datei
import { findCountryByName, isValidIsoCode } from "../admin/data/country-iso"

export function normalizeCountryToIso(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.length === 2 && isValidIsoCode(trimmed.toUpperCase())) {
    return trimmed.toUpperCase()
  }
  return findCountryByName(trimmed)?.code ?? null
}
```

---

**Reviewer-Punkte für Robin/Frank vor Phase 4:**

1. Multi-Region: OK mit „primary country first, sekundär verloren"?
2. ~~Reserved Codes XE/XW~~ → **entschieden: EU (ISO-reserviert) für Pure-Europe, WO (VOD-intern) für Worldwide** (2026-05-11)
3. „Benelux" → NL und „Scandinavia" → SE: OK oder lieber NULL?
4. „Serbia and Montenegro" → CS (historisch) oder RS (Nachfolger)?
5. PressOrga-Follow-up: jetzt mit-migrieren oder als RSE-Ticket parken?
