# Discogs Import Service — Architecture Audit

**Datum:** 2026-04-10
**Status:** ✅ Audit abgeschlossen — Refactoring IMPLEMENTIERT in rc14 + rc15
**Auslöser:** Pargmann-Import: 5.653 Releases, nur 982 updated + 6 linked, **0 inserted**

**Follow-ups:**
- `docs/DISCOGS_IMPORT_REFACTORING_PLAN.md` — Phase 1 Plan (rc14, DB-Sessions + pg_trgm + Transaktionen)
- `docs/DISCOGS_IMPORT_LIVE_FEEDBACK_PLAN.md` — Phase 2 Plan (rc15, Live-SSE + Resume + Cancel/Pause)
- `docs/DISCOGS_IMPORT_SERVICE.md` v5.0 — Aktuelle Service-Dokumentation

---

## Zusammenfassung

Der Discogs Import Service hat **3 kritische** und **4 hohe** architektonische Mängel. Das System ist für große Imports (>1.000 Releases) nicht produktionsreif.

---

## Kritische Mängel

### K1: In-Memory Sessions (verloren bei Restart)

**Problem:** Sessions werden in einer JavaScript `Map` im Prozess-Speicher gehalten. Bei PM2-Restart, Deploy oder Crash gehen alle Sessions verloren.

**Auswirkung:** User führt 320-min Fetch durch → Server-Restart → Session weg → "Session not found" → muss nochmal uploaden und von vorn fetchen.

**Fix:** Sessions in PostgreSQL speichern (neue Tabelle `import_session`), nicht im RAM.

### K2: Stale DB-Snapshots (Matching gegen veraltete Daten)

**Problem:** Die Analyse matcht gegen statische JSON-Dateien (`db_discogs_ids.json`, `db_unlinked_releases.json`), die manuell per Python-Script erstellt werden. Nach einem Import werden sie **nicht** aktualisiert.

**Auswirkung:** Pargmann-Import: 5.653 Releases, nur 982 matched. Die restlichen 4.671 waren entweder unter leicht anderem Namen in der DB (Matching zu strikt) oder der Snapshot kannte sie nicht (Snapshot veraltet).

**Fix:** Live-DB-Queries statt Snapshots. Oder: Snapshots automatisch nach jedem Import regenerieren.

### K3: Globaler API-Cache ohne Isolation

**Problem:** Ein einziges `discogs_import_cache.json` für alle Imports. Keine Expiry, keine Import-Zuordnung, wächst endlos. 404-Einträge bleiben ewig.

**Fix:** Cache in PostgreSQL-Tabelle `discogs_api_cache` mit TTL (30 Tage) und Import-Zuordnung.

---

## Hohe Mängel

### H1: "Fuzzy" Matching ist kein Fuzzy Matching

**Problem:** `fuzzyKey()` ist ein exakter String-Match nach Normalisierung. "The Beatles" ≠ "Beatles, The". "TAP 1" ≠ "TAP001". Umlaute, Akzente, Sortier-Präfixe nicht behandelt.

**Fix:** Echtes Fuzzy-Matching mit Levenshtein-Distanz oder pg_trgm Extension.

### H2: Fetch nicht crash-resilient

**Problem:** Fetch nutzt die In-Memory Session. Cache auf Disk ist resumable, aber Session muss nach Crash nochmal erstellt werden (Re-Upload).

**Fix:** Mit K1 (DB-Sessions) gelöst.

### H3: Keine Transaktionen bei Import

**Problem:** Releases werden einzeln eingefügt. Fehlt Release #3.500, sind #1-#3.499 schon committed. Kein Rollback möglich.

**Fix:** Gesamten Import in eine DB-Transaktion wrappen.

### H4: Keine Snapshot-Frische-Prüfung

**Problem:** Niemand weiß wie alt die Snapshots sind. Kein Timestamp, keine Warnung.

**Fix:** Timestamp in Snapshots + Warnung wenn >24h alt. Oder: Live-DB-Queries (macht Snapshots überflüssig).

---

## Root Cause: Pargmann-Import

```
5.653 Releases im Export
  → 982 matched via discogs_id (EXISTING → updated)
  → 6 matched via fuzzy key (LINKABLE → linked)  
  → 4.665 als NEW kategorisiert
  → 0 inserted (!)
```

**Warum 0 inserted?**
1. Session expired während Fetch (1h TTL, Fetch dauerte 320 min)
2. User re-uploaded → neue Session
3. "Skip → use cached" → Analyse lief korrekt
4. "Approve & Import" → Commit lief, aber Response war 6ms / 0 bytes
5. Vermutung: SSE-Stream brach sofort ab → nur EXISTING/LINKABLE verarbeitet (schnell), NEW-Schleife nie erreicht

**Warum nur 982 von 5.653 matched?**
1. DB-Snapshot (`db_discogs_ids.json`) hat 15.055 discogs_ids
2. Nur 982 der 5.653 Pargmann-IDs waren in diesem Snapshot
3. Die restlichen 4.671 sind entweder neu (nie in der DB gewesen) oder haben keine discogs_id in der DB
4. Fuzzy-Matching hat nur 6 weitere gefunden (zu strikt)

---

## Architektur-Refactoring-Plan

### Phase 1: Foundations (vor nächstem Import)

| # | Task | Aufwand | Effekt |
|---|------|---------|--------|
| 1 | Sessions → PostgreSQL (`import_session` Tabelle) | 4h | K1, H2 gelöst |
| 2 | Snapshots → Live-DB-Queries (Knex) | 3h | K2, H4 gelöst |
| 3 | API-Cache → PostgreSQL (`discogs_api_cache` Tabelle) | 3h | K3 gelöst |
| 4 | Import in DB-Transaktion wrappen | 2h | H3 gelöst |

### Phase 2: Matching-Qualität

| # | Task | Aufwand | Effekt |
|---|------|---------|--------|
| 5 | Echtes Fuzzy-Matching (Trigram oder Levenshtein) | 4h | H1 gelöst |
| 6 | Match-Confidence Score anzeigen (80%, 95%, 100%) | 2h | Bessere Review-UX |

### Phase 3: Robustheit

| # | Task | Aufwand | Effekt |
|---|------|---------|--------|
| 7 | Fehler-Details im SSE + import_log | 1h | Debugging |
| 8 | Retry-Logik für API-Calls (3x Backoff) | 1h | Weniger Errors |
| 9 | Concurrency Control (File-Lock oder DB) | 1h | Race Conditions |

---

## Entscheidungen (offen)

1. **PostgreSQL vs Redis für Sessions?** → PostgreSQL (haben wir schon, kein neuer Service)
2. **Snapshots komplett ersetzen durch Live-Queries?** → Ja, Snapshots sind das Kernproblem
3. **pg_trgm Extension für Fuzzy-Matching?** → Muss auf Supabase verfügbar sein (prüfen)
4. **Transaktion für gesamten Import oder Batch?** → Batch (1000er Gruppen) mit Savepoints
