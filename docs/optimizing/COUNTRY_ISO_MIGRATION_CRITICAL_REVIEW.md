# Country-ISO-Migration — Kritischer Self-Review

**Datum:** 2026-05-11 · **Trigger:** Robin's „Bug im Plan gefunden — finde mehr"
**Companion zu:** [`COUNTRY_ISO_MIGRATION_PLAN.md`](./COUNTRY_ISO_MIGRATION_PLAN.md) + [`COUNTRY_ISO_MIGRATION_IMPLEMENTATION.md`](./COUNTRY_ISO_MIGRATION_IMPLEMENTATION.md)

---

## TL;DR — was würde der aktuelle Plan tatsächlich kaputt machen?

**2 kritische Bugs, 4 mittlere Risiken, 2 niedrige Risiken.** Die zwei kritischen Bugs würden während der Migration den Storefront-Catalog-Filter und Meili-Country-Facette für **mehrere Stunden** brechen (zwischen Phase 4 Backfill und Phase 6/7 Deploy). Beide sind mit kleinen Plan-Anpassungen heilbar — entscheidend ist die **Reihenfolge der Deploys** und **defensive Read-Pfade ab Phase 1**.

---

## 🔴 CRITICAL Issue #1 — Meili-Sync `lookup_iso()` ist nicht defensiv

**Was passiert:** Direkt nach Phase 4 (Backfill) wird der `*/5`-Meili-Cron mit der **alten** Sync-Code-Version laufen (Phase 6 ist noch nicht deployed). Aktuelle Implementation:

```python
# scripts/meilisearch_sync.py:504-505
"country": row["country"],                  # nach Backfill: "DE"
"country_code": lookup_iso(row["country"]), # lookup_iso("DE") → None !
```

`lookup_iso()` in `scripts/data/country_iso.py` ist eine *Name → ISO* Map. Sie kennt "Germany"→"DE", aber **nicht** "DE"→"DE". Direktes Lookup von `COUNTRY_TO_ISO["DE"]` → KeyError → `None` zurück → Meili-Doc bekommt `country_code: null`.

**Konsequenz:** Sobald Backfill committed ist, lassen sich auf der Storefront alle Country-Facetten + Filter nicht mehr verwenden, weil jedes Doc `country_code: null` hat. Die `*/5`-Cron-Loop überschreibt ALLE 46.350 Docs in den nächsten 5-30 Minuten mit nullen. Dauer der Disruption: bis Phase 6 deployed + Synonyms applyed → realistisch 1-3 Stunden.

**Fix (Phase 1, vor allem anderen):**
```python
def lookup_iso(country: str | None) -> str | None:
    if not country: return None
    trimmed = country.strip()
    # NEU: ISO-Code als Identity-Passthrough akzeptieren (defensiv)
    if len(trimmed) == 2 and trimmed.upper() in ALL_VALID_ISO_CODES:
        return trimmed.upper()
    # ... existing logic
    return COUNTRY_TO_ISO.get(trimmed) or COUNTRY_TO_ISO.get(trimmed.lower())
```

Damit funktioniert das alte Sync-Code-File auch nach Backfill weiter — `country_code` wird korrekt mit ISO befüllt, egal ob DB-Wert "Germany" oder "DE" enthält.

**Plan-Update:** Phase 1.4 (Python-Pendant) muss `lookup_iso()` defensiv machen, nicht erst Phase 6.3.

---

## 🔴 CRITICAL Issue #2 — Storefront-Filter `COUNTRY_ALIASES` bricht nach Backfill

**Was passiert:** Heute mappt `route-postgres-fallback.ts::COUNTRY_ALIASES` jegliche User-Eingabe auf **English Name**. Storefront-Filter-Query:

```ts
// Heute:
const resolved = resolveCountry("germany")  // → "Germany"
.where("country", resolved)                 // WHERE country = 'Germany'
```

Nach Backfill enthält DB `country = "DE"`. Die WHERE-Klausel `country = 'Germany'` liefert **0 Treffer**. Selbe Story für `?country=Deutschland`, `?country=Vereinigtes Königreich` etc.

Mein Plan §6.2 polt das auf ISO um, aber **erst in Phase 6** — also nach Backfill. Zwischen Phase 4 (Backfill) und Phase 6/7 (Deploy) sind alle Country-Filter im Storefront tot.

**Konsequenz:** Frank sieht `/catalog?country=Germany` mit „0 results" obwohl 12.689 DE-Releases existieren. Wenn diese URL gecached ist (Vercel/CDN), bleibt der falsche Stand auch nach Phase 6-Deploy noch hängen bis zur nächsten Revalidation.

**Fix (Phase 1, dual-tolerant):**
```ts
// During-Transition-Version (deployed in Phase 1, vor Backfill):
function resolveCountry(input: string): string[] {
  const iso = COUNTRY_ALIASES_TO_ISO[input.toLowerCase()] || input.toUpperCase()
  if (iso.length === 2) {
    // Return BOTH ISO and English Name so WHERE-IN matches pre- + post-backfill
    const enName = ISO_TO_EN_NAME[iso]
    return enName ? [iso, enName] : [iso]
  }
  return [input]  // Unknown input, passthrough
}

// WHERE-clause:
.whereIn("country", resolveCountry(query.country))
// WHERE country IN ('DE', 'Germany') — matched egal ob alt oder neu
```

Nach Cleanup (Phase 6/Post-Phase-8): zurück auf single-value.

**Plan-Update:** Phase 1 / Phase 2 müssen den Storefront-Filter **vor** Backfill deployen, mit dual-Wert-Tolerance.

---

## 🟡 MEDIUM Issue #3 — Discogs-Preview-Modal zeigt False-Positive-Diffs während Transition

**Was passiert:** Phase 2 wired `normalizeCountryToIso()` in den Discogs-Preview-Diff für `proposed` (Discogs-API-Antwort). Aber der `current`-Vergleichswert wird unverändert aus der DB gezogen.

Während der 48 h zwischen Phase 2 Deploy und Phase 4 Backfill:
- DB-Wert: "UK" (raw, alt)
- Discogs-API liefert: "UK" → normalized → "GB"
- Modal-Diff: „UK" ↔ „GB" — wird als **changed** markiert obwohl semantisch identisch

Frank verwirrt durch Modal-Highlights, applyed evtl. „GB" auf locked-Items wo eigentlich gar nichts zu ändern wäre.

**Fix:** auch `current` durch Normalizer schicken, bevor Diff-Vergleich:

```ts
// backend/src/api/admin/media/[id]/discogs-preview/route.ts
const currentNorm = normalizeCountryToIso(release.country)
const proposedNorm = normalizeCountryToIso(apiData.country)
const isDifferent = currentNorm !== proposedNorm
```

Display zeigt weiterhin `release.country` (für Frank zur Orientierung), aber die `isDifferent`-Logik nutzt die Normalisierung.

**Plan-Update:** Phase 2.1 ergänzen um Normalisierung des `current`-Werts in der Diff-Berechnung.

---

## 🟡 MEDIUM Issue #4 — Storefront-Caching (Vercel/Redis) hält stale country-Antworten

**Was passiert:** Next.js + Vercel cachen `/catalog?country=Germany` Responses. Auch nach Code-Update kann der Cache stale bleiben — User sieht 0 results obwohl Migration sauber durch ist.

Memory `project_storefront_revalidate.md` (rc51.9.3): wir haben einen `revalidateReleaseCatalogPage`-Helper, aber er ist auf einzelne Release-IDs ausgerichtet, nicht auf ganze Catalog-Pages mit Filter-Permutationen.

**Konsequenz:** Erste Stunden nach Phase 7 könnten manche User-Bookmarks/Cache-Hits noch alte Resultate zeigen. Funktional kein Datenproblem, aber UX-Verwirrung.

**Fix:**
1. Phase 7.1c einfügen: Globaler Cache-Bust auf alle `/catalog/*`-Routen (Vercel On-Demand Revalidation per `revalidatePath("/catalog", "page")` oder Pfad-Wildcard)
2. Redis-Cache (falls Catalog-Page-Antworten dort liegen) flushen — `redis-cli FLUSHDB` falls Catalog-Keys betroffen
3. Acceptance-Criteria: 5 Min nach Deploy testen: `?country=Germany` vs `?country=DE` liefern beide non-leere Ergebnisse (über mehrere Browser/Devices um Cache-Hits zu provozieren)

**Plan-Update:** Phase 7.1c ergänzen.

---

## 🟡 MEDIUM Issue #5 — `translate_country()` droppt unbekannte Strings still zu NULL

**Was passiert:** Aktuelle Implementierung (Pre-Phase-2):
```python
def translate_country(name):
    if not name: return None
    return COUNTRY_DE_TO_EN.get(name, name)  # passthrough wenn unbekannt
```

Phase 2 Refactor:
```python
def translate_country(name):
    if not name: return None
    english = COUNTRY_DE_TO_EN.get(name, name)
    return normalize_country_to_iso(english)  # → None wenn unbekannt
```

Unbekannte deutsche Country-Namen werden jetzt zu `None` gemappt statt verbatim durchgereicht. Stiller Datenverlust für edge-cases.

**Konsequenz:** Wenn legacy MySQL ein "Färöer" oder "Tahiti" hat (nicht in DE_TO_EN-Map, nicht in ISO-Aliases), gibt's vor Phase 2 noch den verbatim string in DB („Färöer"). Nach Phase 2: `None`. Vor Phase 2 wurde das wenigstens als Warnung im `⚠️ Färöer (non-ISO)`-UI sichtbar — jetzt einfach weg.

**Fix:**
```python
import logging
logger = logging.getLogger(__name__)

def translate_country(name):
    if not name: return None
    english = COUNTRY_DE_TO_EN.get(name, name)
    iso = normalize_country_to_iso(english)
    if iso is None:
        logger.warning(f"legacy_sync: unknown country '{name}' (resolved: '{english}') → NULL")
    return iso
```

Plus: Backfill-SQL §7 muss um die Edge-Cases erweitert werden — z.B. "Färöer" → FO, falls in der DB vorhanden. Pre-Backfill nochmal DISTINCT-Query gegen MySQL fahren um neue Werte zu erkennen.

**Plan-Update:** Phase 2.2 + 4.1 Pre-Flight-Verify aktualisieren.

---

## 🟡 MEDIUM Issue #6 — Backfill behält empty-string vs NULL nicht atomic

**Was passiert:** Aktuelle Plan-Verify §4.2 sucht nur nach `country !~ '^[A-Z]{2}$'`. Empty string `""` matcht das auch (Länge 0, kein ^[A-Z]{2}$), aber CHECK-Constraint erlaubt nur NULL **oder** ISO-Format. Empty string verstößt gegen Constraint → Phase 5 würde fehlschlagen.

```sql
SELECT COUNT(*) FROM "Release" WHERE country = '';
-- 49 Rows (aus dem Snapshot)
```

**Fix:** In den Backfill-SQL (Phase 4.2) als ersten Schritt:
```sql
-- Step 0: Empty-strings auf NULL normalisieren
UPDATE "Release" SET country = NULL WHERE country = '';
-- Erwartet: 49 Rows
```

**Plan-Update:** Phase 4.2 SQL um Step 0 ergänzen.

---

## 🟢 LOW Issue #7 — PressOrga-Cross-Reference

**Was passiert:** PressOrga.country bleibt unmigriert (out-of-scope rc54.0). Wenn irgendeine Query oder JOIN Release.country und PressOrga.country gemeinsam liest und String-Vergleich anstellt, wird das brechen.

**Audit-Befund nach grep:** keine direkten JOINs auf country zwischen den beiden Tabellen gefunden. Storefront `/press/[slug]` rendert nur `press.country` raw. Catalog-Detail rendert Release.country und `press.country` separat. Keine `WHERE release.country = press.country` oder ähnliches.

**Konsequenz:** Display-Inkonsistenz im Storefront — Release zeigt „DE", aber PressOrga-Detail-Page zeigt „Deutschland". Optisch unschön, funktional kein Bug.

**Fix:** Akzeptieren als bekannten Inkonsistenz-Pfad bis PressOrga-Follow-up. In Release-Notes erwähnen.

---

## 🟢 LOW Issue #8 — Migration-Scripts oder One-off-SQL die country direkt schreiben

**Was passiert:** Phase 5 fügt `CHECK (country IS NULL OR country ~ '^[A-Z]{2}$')` hinzu. Wenn nach Constraint-Add irgendwo ein vergessenes Migration-Script läuft das country in Vollform schreibt, scheitert es.

**Audit:**
```bash
$ grep -rn "country" backend/src/scripts/migrations/ scripts/migrations/ 2>/dev/null
```
Nichts kritisches gefunden — keine Migration-Scripts schreiben raw country-Strings.

**Fix:** Trotzdem Phase 4.1 erweitern: vor Backfill nochmal grep-Check.

---

## Tabelle: alle Risiken + Mitigations

| # | Risk | Severity | Status | Fix-Phase | Aufwand-Delta |
|---|---|---|---|---|---|
| 1 | `lookup_iso()` nicht defensiv → Meili filter break | 🔴 Critical | open | Phase 1.4 erweitern | +15 min |
| 2 | `COUNTRY_ALIASES` Storefront-Filter break | 🔴 Critical | open | Phase 1 neue 1.7 oder Phase 2 erweitern | +1 h |
| 3 | `search_indexed_at` Trigger-Whitelist | ✅ resolved | — | — (existing trigger fired) | 0 |
| 4 | Discogs-Preview false-positive diffs | 🟡 Medium | open | Phase 2.1 normalisiert current+proposed | +20 min |
| 5 | Storefront-Cache stale nach Migration | 🟡 Medium | open | Phase 7.1c Cache-Bust | +20 min |
| 6 | `translate_country()` silent drop | 🟡 Medium | open | Phase 2.2 Warning-Log + Pre-Flight Edge-Case-Check | +30 min |
| 7 | Backfill ignoriert empty-strings | 🟡 Medium | open | Phase 4.2 Step 0 ergänzen | +5 min |
| 8 | PressOrga-Cross-Reference | 🟢 Low | accepted | Follow-up RSE-Ticket | 0 (akzeptiert) |
| 9 | Vergessene direct-SQL Migration-Scripts | 🟢 Low | scan clean | Phase 4.1 grep-Check ergänzen | +5 min |

**Total Aufwand-Delta:** +~2.5 h (7.5 h → 10 h netto)

---

## Empfohlene Plan-Reihenfolgen-Anpassung

Die **kritischste Erkenntnis:** Die jetzige Reihenfolge „Phase 1+2 deploy → 48h wait → Phase 4 backfill → Phase 6+7 deploy" verteilt den Risk-Moment auf eine offene Periode mit kaputter Storefront-Filter-Funktion. Sauberere Reihenfolge:

### Variante A — „Read-First, Defensiv-Tolerant" (empfohlen)

1. **Phase 1+2** deploy mit **dual-tolerant Read-Pfaden** (Storefront-Filter akzeptiert beide Encodings, `lookup_iso()` defensiv)
2. 48 h Beobachtung — Storefront funktioniert mit pre-backfill DB normal
3. **Phase 4** Backfill — Storefront funktioniert weiter (`?country=Germany` matched über die OR-Klausel jetzt die ISO-Rows)
4. **Phase 5** Constraint
5. **Phase 6** Read-Cleanup: dual-tolerant Pfade auf ISO-only vereinfacht, Compact-Display, etc.
6. **Phase 7** Synonym-Apply + Cache-Bust

Vorteil: **Nullsekunden-Downtime** für Storefront-Filter. Die Read-Pfade arbeiten *jederzeit* mit beiden Encodings, bis wir final cleanen.

### Variante B — „Atomic-Cut" (Hochrisiko, nicht empfohlen)

1. Maintenance-Window (1-2h)
2. Phase 1+2 deploy + Phase 4 Backfill + Phase 6+7 Deploy in einem Schwung
3. Sync-Cron pausiert + Storefront Maintenance-Page während des Cuts

Vorteil: kein dual-tolerant Read-Code (sauberer). Nachteil: explizites Downtime-Fenster + Risiko dass irgendwas im Cut hängenbleibt.

→ **Empfehlung: Variante A.** Die ~1 h extra Coding-Aufwand für dual-tolerant `COUNTRY_ALIASES` rechtfertigt sich durch zero-downtime.

---

## Was tatsächlich der Plan vor diesem Review riskiert hätte

Wenn ich den jetzigen Plan stur durchziehe (Variante implicit B aber ohne Maintenance-Window):

| Zeitpunkt | Storefront-Filter `?country=Germany` | Meili-Country-Facette | Admin-Catalog-Detail |
|---|---|---|---|
| T-0 (vor Migration) | ✅ funktioniert (DB "Germany", Filter "Germany") | ✅ funktioniert (Meili "Germany", country_code "DE") | ⚠️ broken (zeigt non-ISO-Warning) |
| T+1 (Phase 1+2 deployed) | ✅ unchanged | ✅ unchanged | ⚠️ unchanged |
| T+24 (48h Beobachtung) | ✅ unchanged | ⚠️ einzelne neue Discogs-Commits haben country_code=null (lookup_iso "DE" → None) | unchanged |
| T+48 + 1min (Phase 4 Backfill commit) | 🔴 **BROKEN — 0 results für `?country=Germany`** | 🔴 **BROKEN — 46k Docs werden über *5/-Cron mit `country_code: null` re-indexed** | ✅ funktioniert (DB hat ISO, alter Code resolved korrekt) |
| T+48 + 5 min | 🔴 broken | 🔴 broken | ✅ |
| T+48 + 3 h (Phase 6+7 deploy) | ✅ recovered | ✅ recovered (apply-settings + reindex) | ✅ |

Also **3 h Storefront-Country-Filter-Outage** in der jetzigen Plan-Form. Das wäre für Frank in der Bulk-Invite-Test-Welle ein No-Go.

---

## Nächster Schritt

1. Updates an `COUNTRY_ISO_MIGRATION_IMPLEMENTATION.md` für alle 7 Issues durchziehen
2. Phase-Reihenfolge auf Variante A anpassen
3. Total-Aufwand 7.5h → 10h netto, Wall-Clock unverändert ~72h

Nach Frank/Robin-OK starten wir mit Phase 0 (Snapshot-Backup).
