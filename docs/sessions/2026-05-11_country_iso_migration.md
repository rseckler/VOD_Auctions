# 2026-05-11 — Country-ISO Migration (rc54.0 + RSE-324)

**Tag-Releases:** [v1.0.0-rc54.0](https://github.com/rseckler/VOD_Auctions/releases/tag/v1.0.0-rc54.0)
**PR:** [#1](https://github.com/rseckler/VOD_Auctions/pull/1)
**Linear:** [RSE-324](https://linear.app/rseckler/issue/RSE-324) (Done)
**Wall-Clock:** ~7 h (inkl. PressOrga/LabelPerson Follow-up)
**Code-Aufwand netto:** ~10 h (über 5 Commits)

## Trigger

Robin's Screenshot zeigte „⚠️ UK (non-ISO)" in Admin Catalog-Detail-Page. Discovery-Audit deckte auf, dass `Release.country` mit **3 verschiedenen Encodings** befüllt war:

- 43.644 Rows (82.7 %) English Full Names („Germany", „United Kingdom", „United States")
- 2.161 Rows (4.1 %) Short-Alias „UK" (Discogs-Roh — kein ISO, ISO sagt „GB")
- 2.211 Rows (4.2 %) bereits ISO (U.S „US", DE 56, GB 43, FR 15, …)
- 634 Rows (1.2 %) Multi-Region („Europe", „European Union", „UK & Europe", „Worldwide", „USA & Canada", …)
- 4.094 Rows (7.8 %) NULL
- 44 Rows (<0.1 %) historische Edge-Cases (USSR, Czechoslovakia, East Germany)

Read-Pfade widersprachen sich: Admin-UI erwartete ISO und warf Warning, Storefront-Filter mappte alles auf English-Name, Meili-Sync rechnete `country_code` zur Indexing-Zeit aus dem English-Name aus.

## Strategie-Entscheidung

**Variante A-Express:** Single-Session-Cutover in einer ~6h-Session statt 72h Plan v1 mit 48h-Beobachtungsphase. Schlüssel war **dual-tolerant Read-Pfade ab Phase 1**: Storefront-Filter akzeptiert beide Encodings (ISO + English-Name) via `whereIn(country, [...])` — Backfill ist zero-impact.

Sicherheitsnetze (ersetzen 48h-Beobachtung):
1. **Discogs-Cache-Audit** — 71 distinct Strings im 90d-Fenster gegen Backfill-Mapping abgeglichen → 2 Lücken entdeckt: „UK & France" + „Australia & New Zealand" (vor Implementation ergänzt)
2. **Live-Discogs-API-Probe** — 10 Roundtrips mit echten Release-IDs gegen api.discogs.com, alle Strings im Mapping
3. **Supabase-Sandbox-Branch** — `mcp create_branch` ($0.02 Kosten), 99 synthetic Test-Rows mit 93 distinct DB-Werten + 6 Edge-Cases gegen Backfill-SQL → entdeckte Bedarf für case-insensitive Matching
4. **Snapshot-Backups** — 48.743 Rows für Release.country, plus 1.983/458 für PressOrga/LabelPerson; auto-drop nach 7 Tagen

## Self-Review entdeckte 2 Critical Bugs in Plan v1

**Critical Issue #1: Meili-Sync `lookup_iso()` nicht defensiv.** Nach Backfill enthält DB ISO. Alter Sync-Code: `country_code: lookup_iso(row["country"])` ruft `lookup_iso("DE")` — die Funktion kannte nur Name→ISO, nicht ISO→ISO, returnt `None`. **Konsequenz:** in den 3h zwischen Backfill und Phase-6-Deploy hätten alle 46k Meili-Docs `country_code: null` bekommen → Storefront-Country-Facette tot.

**Fix:** `lookup_iso()` defensiv erweitert um ISO-Identity-Passthrough. Alte Sync-Code-Version funktioniert dann auch nach Backfill.

**Critical Issue #2: Storefront `COUNTRY_ALIASES` mappt auf English-Name.** Pre-Backfill: `?country=Germany` → resolved zu „Germany" → WHERE country='Germany' → 12k Treffer. Post-Backfill: DB hat „DE" → 0 Treffer.

**Fix:** `lib/country-resolve.ts::resolveCountryForFilter()` returnt BEIDE Werte (ISO + English-Name + historische Multi-Region-Strings). WHERE-IN matched beide Welten.

## Multi-Region-Strategie (Frank-Decision)

| Klasse | Entscheidung | Begründung |
|---|---|---|
| Pure-Europe („Europe", „European Union") | → **EU** | ISO-3166-1 exceptionally-reserved, 🇪🇺-Flag rendert out-of-the-box via flagFor() |
| Worldwide | → **WO** | ISO hat keinen offiziellen World-Code; W-Range seit Dekaden unassigned, kein Konfliktrisiko. MusicBrainz nutzt XW (user-assigned), wir nehmen WO weil memorable |
| Compound („UK & Europe", „USA & Canada", „Germany, Austria, & Switzerland") | → **primary country** (zuerst-genanntes Land) | Sekundär-Info verloren bei 154 Rows = 0.29 %. Akzeptabler Trade-off; MusicBrainz' 1:N release-events-Modell overkill für 1.3 % Cases |
| Region-Sammelnamen (Benelux, Scandinavia) | → traditionelles Press-Land (NL, SE) | Historisches Pressland |
| „--" Placeholder (PressOrga/LabelPerson) | → NULL | Explizit unbekannt |
| Deprecated (Yugoslavia, East Germany, USSR, Czechoslovakia) | → ISO-3166-3 (YU/DD/SU/CS) | Historische Treue |

Bewusste Abweichung von MusicBrainz: **MB nutzt XE statt EU** für Europe weil XE im user-assigned Range, EU ISO-reserviert für „Organisation". Wir nehmen EU wegen formalem ISO-Status + Flag-Rendering.

## Numbers

### Release.country (rc54.0, Phase 4 Backfill)

- 48.694 ISO Rows + 4.094 NULL = 52.788 total
- 59 distinct ISO-Codes
- Top: DE 12.706 · US 11.159 · GB 10.994 · FR 2.616 · NL 2.018 · IT 1.669 · BE 1.348 · JP 1.085 · CA 820 · CH 710
- 0 leftover_dirty

### PressOrga.country (RSE-324, selbe Tag)

- 1.457 ISO + 526 NULL = 1.983 total
- 21 distinct ISO-Codes (alle aus deutschen Vollformen + „--"→NULL)
- Top: DE 460 · GB 444 · US 229 · FR 82 · IT 59
- 0 leftover_dirty

### LabelPerson.country (RSE-324, selbe Tag)

- 447 ISO + 11 NULL = 458 total
- 18 distinct ISO-Codes
- 0 leftover_dirty

### Volltextsuche-Verify (post-Migration)

- „germany" → 13.947 hits (höher als 12.706 DE-Rows allein wegen Synonym-Expansion in Compound-Strings + Typo-Tolerance)
- „england" → 11.144 hits (Synonym → uk → gb)

## Code-Architektur

**Single-Source-of-Truth Helpers:**
- `backend/src/lib/country-normalize.ts::normalizeCountryToIso()` — TS, alle Write-Pfade
- `scripts/data/country_iso.py::normalize_country_to_iso()` / `lookup_iso()` — Python-Pendant mit defensive Identity-Passthrough
- `backend/src/admin/data/country-iso.ts::ISO_COUNTRIES` (255 entries, +6 deprecated/reserved) + `findCountryByName()` (~35 Aliases)

**Display-Helpers:**
- `formatCountryLabel("DE")` → „🇩🇪 Germany (DE)" (Admin Catalog-Detail)
- `formatCountryCompact("DE")` → „🇩🇪 DE" (Stocktake-Spalte 90px)
- Storefront: raw ISO via `<Badge>{release.country}</Badge>` (kein Display-Code-Change)

**Storefront-Filter (dual-tolerant Failsafe):**
- `backend/src/lib/country-resolve.ts::resolveCountryForFilter()` — returnt ISO + Name + Compound-Strings
- `route-postgres-fallback.ts` nutzt `whereIn(country, [...])`
- Cleanup auf single-value = Backlog (kein Performance-Issue)

**Meili-Sync:**
- `scripts/meilisearch_sync.py`: `country` + `country_code` beide aus row["country"] (ist seit Backfill ISO)
- `scripts/build_country_synonyms.py` generiert 255 bi-direktionale Synonyms aus ISO_COUNTRIES
- Volltextsuche „germany"/„deutschland"/„england" → Synonym-Expansion → ISO-Docs

## 6 CHECK-Constraints live

```sql
ALTER TABLE "Release"     ADD CONSTRAINT release_country_iso_format     CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
ALTER TABLE "PressOrga"   ADD CONSTRAINT pressorga_country_iso_format   CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
ALTER TABLE "LabelPerson" ADD CONSTRAINT labelperson_country_iso_format CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
ALTER TABLE "Artist"      ADD CONSTRAINT artist_country_iso_format      CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
ALTER TABLE "Label"       ADD CONSTRAINT label_country_iso_format       CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
ALTER TABLE musician      ADD CONSTRAINT musician_country_iso_format    CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
```

## Commits

```
46fa014  feat(rc54.0): Country-ISO Foundation (Phase 1) — Variante A dual-tolerant
b365f4f  feat(rc54.0): Country-ISO Phase 2 — Write-Pfade härten + Diff-Normalisierung
ab9761d  chore(rc54.0): Country-ISO Backfill SQL — Phase 4+5 Migration Artifact
3ba955d  refactor(rc54.0): Country-ISO Phase 6 — Read-Pfade Cleanup auf ISO-only
71f2b09  Merge pull request #1 from rseckler/feat/rc54-country-iso-migration
fef4b32  docs(rc54.0): CHANGELOG + CLAUDE.md updated for Country-ISO Migration
fd0ce20  chore(rc54.0): PressOrga + LabelPerson Country-ISO Backfill SQL (RSE-324)
24e8292  docs(RSE-324): PressOrga + LabelPerson Country-ISO Migration done
```

## Tests

- 138 TS unit-tests (country-normalize.unit.spec.ts + country-resolve.unit.spec.ts)
- 20 Python unit-tests (country_iso_test.py)
- Coverage: 89 DB-Werte + 71 Discogs-Cache-Werte + Edge-Cases (NULL, empty, whitespace, lowercase, ISO-Identity, Compound, deprecated ISO-3166-3)
- Sandbox-Branch Test-Cutover: 99 synthetic Rows mit allen Edge-Cases → 0 leftover_dirty

## Display-Verify (was Robin/Frank im UI sehen)

- **`/app/media/<id>` Catalog Detail:** „🇫🇷 France (FR)" wie Frank-Screenshot-Wunsch
- **`/app/erp/inventory/session` Stocktake-Search-Country-Spalte:** „🇩🇪 DE" (Compact, 90px Spalte)
- **Storefront `/catalog/<id>` Badge:** „DE" (Raw ISO wie gewünscht)
- **Storefront `?country=Germany` und `?country=DE`** liefern identische Treffer-Mengen (dual-tolerant Filter)
- **Storefront Volltextsuche** „germany"/„deutschland"/„england"/„uk" findet weiterhin Releases via Meili-Synonyms

## Lessons Learned

1. **Variante A (Read-First, dual-tolerant) > Variante B (Atomic Cut):** ~1h extra Code-Aufwand für dual-tolerant Filter spart 3h Storefront-Downtime + Maintenance-Window
2. **Sandbox-Branch lohnt sich auch wenn er leer ist:** $0.02 für 1 Stunde sind billig für SQL-Syntax-Verify gegen 99 Edge-Cases. Hat den case-insensitive-Backfill-Bedarf entdeckt
3. **Discogs-Cache-Audit ersetzt 48h-Beobachtung:** 1 SQL-Query gegen `discogs_api_cache` zeigte 2 Mapping-Lücken die sonst erst im Live-Apply aufgeschlagen wären
4. **`lookup_iso(ISO)` Identity-Passthrough ist kritisch:** Defensive Pattern für Sync-Code-Files die zwischen Backfill und Code-Update laufen
5. **EU-Code rendert via Standard `flagFor()`:** Regional-Indicators E+U sind etabliertes Pair, kein Special-Case nötig
6. **MEMORY/CLAUDE.md/CHANGELOG/Linear/Session-Log/Migration-SQL/PR/Tag/Release-Notes** alle zusammen pflegen — sonst fragt die nächste Session „warum ist da ein CHECK-Constraint?" und Robin muss erklären
