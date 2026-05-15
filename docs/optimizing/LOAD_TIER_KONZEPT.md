# Load Tier System + legacy_sync_v2 Härtung — Konzept

**Status:** Draft — Plan, noch nicht implementiert
**Erstellt:** 2026-05-05
**Author:** Robin Seckler + Claude (Sonnet)
**Auslöser:** Disk-IO-Outage 2026-05-05 (siehe Sektion 1)
**Verwandte Dokumente:**
- [`docs/architecture/SYNC_ROBUSTNESS_PLAN.md`](../architecture/SYNC_ROBUSTNESS_PLAN.md) — Sync-Robustness-Plan v1
- [`docs/optimizing/SUPABASE_DISK_IO_AUDIT_2026-04-23.md`](./SUPABASE_DISK_IO_AUDIT_2026-04-23.md) — älterer Disk-IO-Audit
- [`docs/optimizing/SYSTEM_HEALTH_EVOLUTION_PLAN.md`](./SYSTEM_HEALTH_EVOLUTION_PLAN.md) — System-Health-Plan
- [`docs/optimizing/IMPORT_LEGACY_MAILS_PLAN.md`](./IMPORT_LEGACY_MAILS_PLAN.md) — Mail-Archiv-Import-Plan; der `import_legacy_mails_v2.py` ist designter Tier-Konsument (siehe Sektion 4.3)
- Memory: `feedback_mysql_streaming_idle_timeout.md`, `project_system_health_outage_2026-05-01.md`, `feedback_alert_auto_resolve_severities.md`

---

## 1. Problem & Auslöser

### Inzident 2026-05-05
- ~22:00 UTC am Vortag: Frank's `mo_pdf_ai_consolidate_master.py` (5-6h Bulk-Job, 4775 Master-Konsolidierungen) lief Background.
- ~05:00 UTC: VPS rebootet; Job tot.
- ~07:30 UTC: Symptom „Backend hängt" gemeldet.
- Root Cause: **Supabase Free-Tier (Nano Compute) Disk-IO-Budget für 5. Mai zu 100 % verbraucht** — Burst-Limit 2.085 Mbps für 30 min/Tag exhausted, DB lief auf 43 Mbps Baseline.
- Folge: alle DB-Queries 5–60 s langsam, Knex-Pool exhausted, Backend-Boot 93 s, System-Health-Page-DistinctOn 30+ s timeout.
- Fix: Upgrade auf **Micro Compute Add-on** ($10/Monat) → COUNT(*) FROM Release: 16 ms, Probes 49–95 ms.

### Folgeschaden: Stale Sync-Crons
- `legacy_sync_v2` failed seit Disk-IO-Krise mit zwei Fehlerklassen:
  - `FATAL ERROR: 2013 (HY000): Lost connection to MySQL server during query` (während Releases-Pull, ~30k Rows)
  - `psycopg2.InterfaceError: connection already closed` in `end_run()` Zeile 366 (Sync lief erfolgreich, aber Summary-Write nach 5–10 min auf gekillter PG-Connection)
- Konsequenz: `sync_log_freshness`-Probe sah keine fresh `phase=success`-Row → Alert FIRED (608 min alt, obwohl Sync-Daten geschrieben waren).
- `meilisearch_drift_check` failed mit `psycopg2.errors.QueryCanceled: canceling statement due to statement timeout` auf `SELECT COUNT(*) FROM "Release"` (im Disk-IO-Stress >5 min, im Normalbetrieb <20 ms).

### Lehren

1. Lange Sync-Runs sind anfällig für Idle-Disconnects auf beiden Seiten (MySQL-Source + Postgres-Target).
2. Wir haben keinen Knopf für „weniger DB-Druck bitte" — wenn Frank im Inventory arbeitet oder ein Bulk-Job läuft, prügeln Cron-Sync-Jobs und User-Requests gleichzeitig die DB.
3. Operations-Team (Robin) braucht Kontrolle ohne Terminal — UI muss Status zeigen + Toggle.

---

## 2. Konzept-Übersicht

Das Konzept hat **zwei Säulen**, die in einem PR ausgeliefert werden:

### Säule A — `legacy_sync_v2` Härtung
Das Skript wird gegen Idle-Disconnects gehärtet (TCP-Keepalive, ping-reconnect zwischen Phasen, fresh PG-Connection für `end_run`).

### Säule B — Load Tier System
Ein zentrales Setting `load_tier ∈ {low, medium, high}` steuert Aggressivität pro Sync-Run. UI im Backend unter **Operations → Load Tier**.

Die Säulen sind orthogonal: A löst akute Bugs, B gibt Operations-Kontrolle.

---

## 3. Säule A — `legacy_sync_v2` Härtung

### 3.1 Aktuelle Schwachstellen

| Stelle | Bug | Konsequenz |
|---|---|---|
| `get_pg_connection` Zeile 293 | Keine TCP-Keepalives, keine Application-Name | Pooler/NAT killt idle nach 60–600 s |
| `main()` zwischen Phasen | Keine Connection-Health-Check zwischen Phasen | Phase-1 Timeout-Crash kürzt Run ab |
| `end_run` Zeile 366 | Nutzt long-lived `pg_conn` für Summary-Write | Wenn `pg_conn` gestorben, kein `sync_log` `phase=success` |
| `sync_releases_v2` 538-720 | Streaming MySQL-Cursor, Idle während PG-Writes | MySQL-Server kickt idle Cursor mit "Lost connection" |

### 3.2 Vorgeschlagene Fixes

**Fix 1: TCP-Keepalive auf PG-Connect** (4 Zeilen, risikolos)
```python
conn = psycopg2.connect(
    db_url,
    keepalives=1, keepalives_idle=30,
    keepalives_interval=10, keepalives_count=3,
    application_name="legacy_sync_v2",
)
```
Kernel sendet alle 30 s ein TCP-Paket → Pooler sieht Verbindung nie als idle.

**Fix 2: `pg_ping(conn, db_url) -> conn`** (analog `legacy_db_pull.py::my_ping`)
```python
def pg_ping(conn, db_url):
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        return conn
    except (psycopg2.InterfaceError, psycopg2.OperationalError):
        try: conn.close()
        except: pass
        return get_pg_connection(db_url)
```

**Fix 3: Ping zwischen Phasen in `main()`**
Vor jedem teuren Sync-Block:
```python
mysql_conn = my_ping(mysql_conn, source="legacy")
pg_conn    = pg_ping(pg_conn, args.pg_url)
sync_releases_v2(mysql_conn, pg_conn, run_id, dry_run=args.dry_run)
```
Gilt für: artists, labels, pressorga, releases, band_lit, label_lit, press_lit, run_validation.

**Fix 4: Bulletproof `end_run()` mit fresh PG-Connection**
Wurzel des aktuellen Stale-Sync-Log-Bugs:
```python
def end_run(pg_url, ctx, counters, ...):
    fresh = get_pg_connection(pg_url)
    try:
        cur = fresh.cursor()
        cur.execute("UPDATE sync_log SET ...")
        fresh.commit()
    finally:
        fresh.close()
```
Egal was vorher passierte → Summary-Write klappt immer. Damit verschwindet `sync_log_freshness` als chronische False-Positive-Quelle.

**Fix 5: `fetchall()` für Releases statt streaming** (siehe Memory `feedback_mysql_streaming_idle_timeout.md`)
30.179 Rows × ~2 KB ≈ 60 MB RAM, völlig unkritisch. Cursor schließt nach Pull, kein Idle-Risiko während PG-Writes.

### 3.3 Risiko & Aufwand

| Fix | Risiko | LOC | Bemerkung |
|---|---|---|---|
| 1 TCP-Keepalive | null | ~6 | Standard-Pattern |
| 2 `pg_ping()` | minimal | ~12 | analog `my_ping` |
| 3 Phase-Boundaries | minimal | ~16 | reine Defense-in-Depth |
| 4 `end_run` fresh conn | null | ~10 | atomare Verbesserung, keine Logik-Änderung |
| 5 `fetchall` Releases | gering | ~3 | +60 MB RAM-Peak |
| **Total** | | **~47** | 1 Datei |

---

## 4. Säule B — Load Tier System

### 4.1 Konzept

Globales Setting **`load_tier ∈ {low, medium, high}`** in `site_config.features.load_tier`. Jeder heavy-DB-Cron-Job liest beim Start den Tier und passt seine Parameter an. Ein Tier-Wechsel wirkt **ab dem nächsten Cron-Tick**, nicht zur Laufzeit.

**Cadence ≠ Tier:**
- Tier = „wie weh tut ein einzelner Run der DB?"
- Cadence = „wie oft macht er weh?"
Beide sind separate Achsen. Der Tier ändert *nicht* die crontab; Cadence-Wechsel passiert manuell oder via Phase-2-Erweiterung.

### 4.2 Tier → Parameter (für `legacy_sync_v2`)

| Parameter | Niedrig | **Mittel** (default) | Hoch |
|---|---|---|---|
| `batch_size` (UPSERT-Chunks) | 100 | 500 | 1000 |
| Sleep zw. Batches | 1.5 s | 0.2 s | 0 s |
| `statement_timeout` | 2 min | 5 min | 10 min |
| R2 Image-Upload | skip | on, sequential | on |
| Post-Run-Validation | skip | on | on |
| `search_indexed_at`-Bumps | skip | on | on |
| **Erwartete Run-Dauer** (30k rel) | 30–45 min | 5–12 min | 2–5 min |
| **Disk-IO vs. Mittel** | ~30 % | 100 % | ~140 % |

R2-Skip auf „Niedrig" ist sicher: das nächste Run mit höherem Tier holt die fehlenden Bilder nach (idempotent über `r2_uploaded`-Check pro Image).

### 4.3 Affected Scripts

**Phase 1 (dieser PR):**
- `legacy_sync_v2.py` — vollständig

**Phase 2 (Folge-PR — größter Hebel):**
- `import_legacy_mails_v2.py` (zu bauen, siehe [IMPORT_LEGACY_MAILS_PLAN.md](./IMPORT_LEGACY_MAILS_PLAN.md) Teil 3) — der Importer ist DER Use-Case für `low`-Tier-Default beim Restart. Tier steuert: `batch_size` für Dedup-SELECT (50/200/500), `sleep_s` zwischen Batches (1.5/0.1/0), `max_runtime_s` (1800/3600/unlimited), `dedup_strategy` (low: SELECT-then-INSERT-skip, medium/high: ON CONFLICT DO NOTHING), `state_file_flush_every_n_batches` (low: 1/medium: 5/high: 20).
- `import_legacy_addresslists.py` (Phase 2 dort) — Tier steuert XLSX-Parser-Concurrency
- `import_thunderbird_mbox.py`, `import_pst.sh` (Phasen 3-4 dort) — gleiche Pattern
- `import_sage_db.py` (Phase 6 dort) — analog
- `meilisearch_sync.py` — `batch_size` + sleep
- `mo_pdf_ai_consolidate_master.py` + Geschwister — API-Concurrency + DB-Batch-Size
- `discogs_daily_sync.py` — `chunk-rate`

**Bevorzugte Dedup-Pattern für Tier-aware-Importer** (siehe IMPORT_LEGACY_MAILS_PLAN Teil 3):

| Tier | Dedup | Round-Trips/100k | Reasoning |
|---|---|---|---|
| `low` | Batch-SELECT 50 message-ids → in-memory diff → bulk-INSERT | ~2.000 + 50 SELECTs | konstanter Throughput, niedriger Peak |
| `medium` | Bulk-INSERT 500 mit `ON CONFLICT DO NOTHING` | ~200 INSERTs | DB macht Dedup, kein SELECT |
| `high` | Bulk-INSERT 1000 mit `ON CONFLICT DO NOTHING` | ~100 INSERTs | maximaler Throughput |

Voraussetzung: UNIQUE-Index auf der Dedup-Spalte (für Mail-Import: `crm_imap_message.message_id_header`). Migration siehe Mail-Plan Sektion "Pre-flight Index-Migration".

### 4.4 Empfehlungs-Matrix (in UI sichtbar)

| Situation | Tier |
|---|---|
| Normal-Betrieb, Frank arbeitet im Inventory | **mittel** |
| Disk-IO-Budget > 75 % verbraucht | **niedrig** |
| Sonntagnacht, Catch-up nach Outage | **hoch** |
| Bulk-AI-Pipeline läuft (mo_pdf, master-consolidate) | **niedrig** während der Pipeline |
| Mail-Archiv-Restart (siehe IMPORT_LEGACY_MAILS_PLAN) | **niedrig** für die ersten 1-2 Stunden, dann `medium` |

### 4.5 Optionale Phase-3 Erweiterung (später)

Auto-Throttle: wenn `meili_drift_check` einen `severity=warning` aus DB-Latenz misst, automatisch auf `niedrig` schalten + Notification.

---

## 5. Web-UI im Backend

### 5.1 Wo

- **Hub:** Operations-Page bekommt Karte „Load Tier" mit Status-Badge in aktueller Tier-Farbe.
- **Detail:** Neue Page `/app/operations/load-tier`.
- **Indicator:** Auf System-Health-Page oben rechts ein Tier-Pill (klickbar → springt auf Detail-Page).

### 5.2 Detail-Page Layout

```
┌────────────────────────────────────────────────────────────┐
│ Operations / Load Tier                            [Refresh]│
├────────────────────────────────────────────────────────────┤
│  Aktueller Modus                                           │
│                                                            │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│   │ NIEDRIG  │  │ ●MITTEL  │  │   HOCH   │   ← 3 Buttons   │
│   │  ⊙       │  │  schnell │  │  catchup │                 │
│   └──────────┘  └──────────┘  └──────────┘                 │
│                                                            │
│  Aktiv seit: 2026-05-05 10:42  von Robin Seckler           │
│  Grund: "Disk-IO-Recovery nach mo_pdf Bulk-Job"            │
├────────────────────────────────────────────────────────────┤
│  Was sich pro Tier ändert  [Tabelle aus Sektion 4.2]       │
├────────────────────────────────────────────────────────────┤
│  Affected Scripts (4)                                      │
│  ✓ legacy_sync_v2.py    nutzt Tier ab Phase 1              │
│  ○ meilisearch_sync.py  Phase 2 (geplant)                  │
│  ○ mo_pdf_ai_*          Phase 2 (geplant)                  │
│  ○ discogs_daily_sync   Phase 2 (geplant)                  │
├────────────────────────────────────────────────────────────┤
│  Wirkt ab: nächstem Cron-Run                               │
│  Aktuell laufender Job: keiner                             │
├────────────────────────────────────────────────────────────┤
│  Audit-Log (letzte 20)                                     │
│  10:42  Robin       MITTEL → NIEDRIG  "Disk-IO Recovery"   │
│  09:15  Robin       NIEDRIG → MITTEL  "Back to normal"     │
└────────────────────────────────────────────────────────────┘
```

Klick auf einen Button öffnet Modal „Tier auf NIEDRIG setzen?" mit optionalem Grund-Feld → POST → Toast → reload.

### 5.3 Design-Tokens

UI baut auf bestehenden `admin-tokens.ts` + `admin-ui.tsx` (siehe Memory `feedback_admin_dark_mode_tokens.md`, `feedback_btn_component_api.md`):
- 3 große Tier-Buttons via `Btn` mit `label`-prop, Variants `primary` / `gold` / `ghost`
- Karten mit `C.card` (kein hardcoded `#fff`)
- Audit-Tabelle nutzt bestehende Tabellenkomponenten

---

## 6. Storage + API

### 6.1 DB-Schema

**`site_config.features` JSONB-Feld** bekommt Eintrag `load_tier`:
```sql
UPDATE site_config
   SET features = features || jsonb_build_object('load_tier', 'medium')
 WHERE id = 'default';
```

**Neue Tabelle `load_tier_audit_log`:**
```sql
CREATE TABLE load_tier_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at    timestamptz NOT NULL DEFAULT now(),
  changed_by    text NOT NULL,             -- email aus Medusa-User
  old_tier      text,
  new_tier      text NOT NULL,
  reason        text
);
CREATE INDEX idx_lta_changed_at ON load_tier_audit_log (changed_at DESC);
```

Audit-Log loggt **nur echte Änderungen** (alt ≠ neu), nicht jeden Save-Click.

### 6.2 Admin-API

```
GET  /admin/operations/load-tier
  → 200 { current: "medium",
          last_changed_at: "...",
          last_changed_by: "...",
          last_reason: "...",
          audit: [{...}, ... 20 entries] }

POST /admin/operations/load-tier
  body: { tier: "low|medium|high", reason?: "..." }
  → 200 { current, last_changed_at, last_changed_by }
  → 400 falls tier ungültig
  → 403 falls user nicht eingeloggt
```

Implementiert unter `backend/src/api/admin/operations/load-tier/route.ts`.

### 6.3 Python-Side

Neuer Helper `scripts/load_tier.py`:
```python
def get_active_tier(pg_conn) -> str:
    """Reads current load tier. Fallback order: ENV VOD_LOAD_TIER → DB → 'medium'."""
    env_override = os.getenv("VOD_LOAD_TIER")
    if env_override in ("low", "medium", "high"):
        return env_override
    cur = pg_conn.cursor()
    cur.execute("SELECT features->>'load_tier' FROM site_config WHERE id='default'")
    row = cur.fetchone()
    return (row[0] if row and row[0] in ("low", "medium", "high") else "medium")

TIER_CONFIGS = {
    "low":    { "batch_size": 100,  "sleep_s": 1.5, "stmt_timeout": "2min",
                "skip_r2": True,  "skip_validation": True,  "skip_search_indexed_at": True },
    "medium": { "batch_size": 500,  "sleep_s": 0.2, "stmt_timeout": "5min",
                "skip_r2": False, "skip_validation": False, "skip_search_indexed_at": False },
    "high":   { "batch_size": 1000, "sleep_s": 0.0, "stmt_timeout": "10min",
                "skip_r2": False, "skip_validation": False, "skip_search_indexed_at": False },
}

def get_tier_config(tier: str) -> dict:
    return TIER_CONFIGS.get(tier, TIER_CONFIGS["medium"])
```

**Kein Reload zur Laufzeit.** Pro Cron-Run wird einmal gelesen, fertig. ENV-Override für Notfall-Force erlaubt.

### 6.4 ENV vs. CLI vs. DB — Override-Hierarchie

```
CLI flag --load-tier ↗  (höchste Priorität, für Ad-hoc-Runs)
ENV VOD_LOAD_TIER    ↗  (für Notfall-Force, z.B. wenn DB-Read failed)
DB site_config       ↗  (Standard, gesetzt via Admin-UI)
Default 'medium'        (Fallback)
```

---

## 7. PR-Scope & Reihenfolge

**1 Pull Request, 4 logische Commits:**

### Commit 1 — DB-Migration (~5 min)
- `site_config.features.load_tier = 'medium'` Default setzen
- `load_tier_audit_log`-Tabelle anlegen (idempotent, additive)

### Commit 2 — Backend Admin-Route + UI (~90 min)
- `backend/src/api/admin/operations/load-tier/route.ts` (GET + POST)
- `backend/src/admin/routes/operations/load-tier/page.tsx` (UI)
- Operations-Hub-Karte mit Status-Badge
- System-Health-Header-Pill

### Commit 3 — Python-Helper (~20 min)
- `scripts/load_tier.py` mit `get_active_tier()` + `get_tier_config(tier)`
- Unit-Test (optional, sehr einfach)

### Commit 4 — `legacy_sync_v2` Härtung + Tier-Integration (~60 min)
- Die 5 Härtungs-Fixes aus Sektion 3.2
- Tier-Parameter integriert (batch_size, sleep, validation-skip, R2-skip, statement_timeout)
- CLI-Flag `--load-tier {low,medium,high}` als Override

**Total:** ~3 h Code + 30 min Test/Deploy.

---

## 8. Validierung nach Deploy

1. **Dry-Run** lokal: `python3 legacy_sync_v2.py --dry-run --load-tier low` → muss durchlaufen
2. **Dry-Run** lokal: `python3 legacy_sync_v2.py --dry-run --load-tier high` → muss durchlaufen
3. **VPS-Deploy** + manueller Run mit `medium` (= heutiges Verhalten, Sanity-Check)
4. **3 stündliche Cron-Runs** beobachten — alle grün
5. **Tier-Wechsel im Admin-UI** auf `low` → nächster Cron-Run zeigt erwartete Sleep + skipped Validation
6. **System-Health-Page** zeigt Tier-Pill korrekt + `sync_log_freshness` bleibt `OK`

---

## 9. Offene Fragen / Entscheidungen

| # | Frage | Status |
|---|---|---|
| 1 | Audit nur bei echten Änderungen oder jeden Save? | **entschieden:** nur echte Änderungen |
| 2 | ENV-Var + CLI + DB als Override-Stack OK? | **entschieden:** ja, Hierarchie wie Sektion 6.4 |
| 3 | Phase-1 nur `legacy_sync_v2`, Rest in Phase 2? | **entschieden:** ja |
| 4 | Cron-Cadence-Wechsel auch via UI? | offen — Phase 3 |
| 5 | Auto-Throttle bei DB-Stress? | offen — Phase 3 |
| 6 | Soll Tier-Pill auf System-Health klickbar sein oder nur Anzeige? | offen — Vorschlag: klickbar, springt auf Detail-Page |

---

## 10. Risiken & Mitigation

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Tier-Read-Query selbst belastet die DB | sehr niedrig | sehr niedrig | 1 SELECT pro Cron-Run, ms-Latenz, indexed PK-Lookup |
| ENV-Override versehentlich gesetzt und vergessen | mittel | mittel | UI zeigt explizit "ENV-Override aktiv: VOD_LOAD_TIER=low" Banner |
| `low` Tier-Run dauert > 60 min → überlappt nächsten Hourly-Cron | mittel | niedrig | `session_locks`-Mechanismus existiert bereits (rc26+); zweiter Run skippt sich |
| Fix 4 (`fresh end_run`) crasht selbst | sehr niedrig | niedrig | Try/except mit Fallback auf `pg_conn`-Cursor und Log-Warning |
| R2-Skip in `low` führt zu Bilder-Lücke | niedrig | niedrig | Nächster Run mit höherem Tier holt nach; sichtbar in `r2_sync_progress.json` |

---

## 11. Bekannte Anti-Patterns die wir vermeiden

- **`process.cwd()`** in Skripten — wir nutzen `Path(__file__).parent` (siehe `feedback_*` Memory)
- **Korrelierte Subqueries** auf großen Tabellen für Tier-Read — nein, simple PK-Lookup
- **JSON.stringify auf JSONB** ohne Cast — sicher mit `||` JSONB-Concat in der Migration
- **Hardcoded `#fff`** in Admin-UI — alles über `admin-tokens.ts` (Memory `feedback_admin_dark_mode_tokens.md`)
- **`Btn` mit children** statt `label`-prop — siehe Memory `feedback_btn_component_api.md`
- **`defineRouteConfig` auf `[id]/page.tsx`** — wir machen nur Top-Level-Page-Config

---

## 12. Nicht-Ziele (bewusst out-of-scope)

- Resume-Logik für gekillte Sync-Runs (Diff-basierter Sync ist intrinsisch idempotent, Re-Run ist Resume)
- Connection-Pool-Erweiterung (Sync läuft single-threaded)
- Migration auf `supabase-py` (disruptiv, kein klarer Win)
- Per-Skript-Tier-Override (Over-Engineering — globaler Tier reicht)
- Cron-Cadence-Wechsel via UI (Phase 3)
- Auto-Throttle (Phase 3)

---

## Anhang A — Cron-Cadence (Stand 2026-05-05)

```cron
# Sync Pipelines (UTC, hourly+5min)
0 * * * *      legacy_sync_v2.py
0 2 * * 1-5    discogs_daily_sync.py

# Meili (UTC, mit env-loader)
*/5 * * * *    meilisearch_sync.py
*/30 * * * *   meilisearch_drift_check.py
0 3 * * *      meilisearch_sync.py --cleanup
0 4 * * *      meili-dump

# Health Sampler (UTC)
* * * * *      health-sampler.sh fast
*/5 * * * *    health-sampler.sh background
*/15 * * * *   health-sampler.sh synthetic

# Backup
*/15 * * * *   replication_health_check.sh
```

Cadence-Änderungen pro Tier sind **nicht** Teil dieses Konzepts. Bei Bedarf manuell oder Phase-3-Auto.

---

## Anhang B — Wann muss man dieses Doc updaten?

- Wenn ein neuer Sync-Job dazukommt der den Tier respektiert → Sektion 4.3 erweitern
- Wenn ein Tier-Parameter geändert wird → Sektion 4.2 + `TIER_CONFIGS` synchron halten
- Wenn Phase 2 (`meilisearch_sync` etc.) live geht → Sektion 4.3 Phase 1 ✓ markieren, Phase 2 spezifizieren
- Wenn Auto-Throttle (Phase 3) gebaut wird → Sektion 4.5 ausarbeiten
