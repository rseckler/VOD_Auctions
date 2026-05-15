# Session-Log 2026-05-07 — Disk-IO-Outage + Load-Tier-Konzept

**Tag:** 2026-05-05 → 2026-05-07
**Auslöser:** Robin meldet "Backend läuft nicht" am Morgen
**Outcome:** Outage gefixt (Compute-Upgrade) · 2 Konzept-Docs für Härtung & Tier-System ausgearbeitet · Implementierung steht aus

---

## 1. Inzident-Timeline (2026-05-05)

| Zeit (UTC) | Ereignis |
|---|---|
| ~22:00 (04.05.) | Frank's `mo_pdf_ai_consolidate_master.py` läuft Background, 4775 Master-Konsolidierungen. |
| ~05:00 | VPS Reboot (vermutlich routine) → Job tot. |
| 05:30 | Backend Cold-Boot dauert 93 s. Erster DB-Connect timeoutet bei 60 s, retried. |
| 05:46–05:48 | Admin-Pages liefern 500 mit 60–192 s Latenz (Knex-Pool exhausted). |
| 05:48 | Robin meldet "Backend hängt". |
| 06:00 | Diagnose: `pg_stat_activity` MCP timeoutet → DB selbst überlastet, nicht der Pool. |
| 06:03 | Robin schickt Supabase-Screenshots: **Disk-IO-Budget 100% verbraten** (Free-Tier Nano, Burst 2.085 Mbps × 30 min/Tag exhausted, läuft auf 43 Mbps Baseline). |
| 06:05 | Robin upgradet auf **Micro Compute Add-on** ($10/Monat). |
| 06:09 | Sampler-Probes von 21–44 s → **55–95 ms**. Backend OK. |
| 06:30 | Robin meldet "Backend wieder weg" → Browser-Tab in stale React-Boundary nach Upgrade-Switch. Hard-Refresh nicht ausreichend. |
| 06:35 | Auch `/app/login` crasht — Safari-State-Bug. Empfehlung: Safari → Develop → Empty Caches + Settings → Website Data → Remove. |
| 07:00 | Robin: "läuft jetzt rund". |
| 07:00–08:00 | Robin's Frage: läuft noch ein Heavy-Job? Antwort: Nein — nur Steady-State Crons (legacy_sync, meili_sync, sampler, crm_task_reminders). Frank's Konsolidierung war mit Reboot tot. |
| 08:33 | Stale Alerts auf System-Health: `meili_drift` + `sync_log_freshness` "608min ago". |
| 08:45 | `legacy_sync_v2` 12:00-Cron komplett durchgelaufen — erster grüner Run nach Disk-IO-Krise. `meili_drift_check` manuell getriggert: severity=ok, diff=0. |

## 2. Root Cause

**Supabase Free-Tier (Nano Compute) hat ein tagesbasiertes Disk-IO-Burst-Budget.** 30 min/Tag bei 2.085 Mbps, danach 43 Mbps Baseline. Frank's Konsolidierungs-Job + parallele MO-PDF-Backfills + CRM-Buildout-Scripts der vorigen Tage haben zusammen das Budget für 5. Mai schon vor Mitternacht UTC verbraten. **Reset: 00:00 UTC täglich.**

DB-Latenz auf 43 Mbps:
- COUNT(*) FROM Release: > 5 min (Statement-Timeout)
- Sampler-Probe: 21–44 s
- Backend-Boot Initial-Connect: > 60 s

Nach Compute-Upgrade auf Micro:
- COUNT(*) FROM Release: 16 ms
- Sampler-Probe: 55–95 ms
- Backend-Endpoints: 1–22 ms

## 3. Folge-Bugs (alle durch Compute-Upgrade aufgehoben oder noch offen)

| Bug | Status | Notiz |
|---|---|---|
| `meili_drift_check` Statement-Timeout auf `SELECT COUNT(*) FROM "Release"` | gefixt | Manuell getriggert, durchgelaufen |
| `legacy_sync_v2` MySQL "Lost connection" während Releases-Pull | gefixt | 12:00 Cron grün |
| `legacy_sync_v2` `psycopg2.InterfaceError: connection already closed` in `end_run()` | **offen** | Wurzel: long-lived PG-Connection wird nach 5–10 min vom Pooler gekillt; Sync-Daten geschrieben aber `sync_log` ohne `phase=success` → `sync_log_freshness`-Alert stale 608 min |
| Browser-React-Boundary Stuck-State nach Compute-Upgrade | gefixt | Safari Storage-Clear |

## 4. Entscheidungen & Konzept-Outputs

### 4.1 Compute-Tier
**Entschieden:** Bleibt auf Micro ($10/Monat). Robin akzeptiert die Kosten — wird bei zukünftigen Bulk-Operationen (CRM-Sprints, Frank's Catalog-Edit-Rollout) ohnehin gebraucht.

### 4.2 Load-Tier-System (neuer Mechanismus)
**Entschieden:** Globales Setting `load_tier ∈ {low, medium, high}` mit Web-UI im Admin unter Operations. Heavy-DB-Skripte respektieren ihn. UI zeigt Status, Toggle, Audit-Log, "wirkt ab nächstem Cron-Tick". Cadence (Cron-Frequenz) bleibt orthogonal — nicht Tier-gebunden.

**Doku:** [`docs/optimizing/LOAD_TIER_KONZEPT.md`](../optimizing/LOAD_TIER_KONZEPT.md) (~340 Zeilen, vollständig)

### 4.3 `legacy_sync_v2` Härtung (5 Fixes)
**Entschieden:** Alles in einem PR mit dem Tier-System.
1. TCP-Keepalive auf PG-Connect (4 Zeilen)
2. `pg_ping(conn, db_url)` Helper (12 Zeilen, analog `my_ping`)
3. Ping zwischen Phasen in `main()` (16 Zeilen)
4. **Fresh PG-Connection für `end_run()`** — eliminiert die chronische Stale-Sync-Log-Quelle
5. `fetchall()` für Releases-Pull statt streaming Cursor

### 4.4 Cross-Link zum Mail-Archiv-Plan
`docs/optimizing/IMPORT_LEGACY_MAILS_PLAN.md` parallel ausgearbeitet (andere Session). Beide Docs **eng cross-linked** statt voll-merge:
- Mail-Importer ist designter größter Tier-Konsument (Phase 2 in LOAD_TIER)
- Importer-Umbau-Tabelle in Mail-Plan jetzt Tier-abhängig
- Restart-Modus-Frage im Mail-Plan löst sich durch Tier-Wahl
- Empfehlung: **LOAD_TIER-PR zuerst**, dann `import_legacy_mails_v2` mit Tier-Lookup vom ersten Tag

## 5. PR-Scope (geplant, nicht umgesetzt)

**1 PR, 4 Commits:**
1. DB-Migration: `site_config.features.load_tier='medium'` + `load_tier_audit_log`-Tabelle (5 min)
2. Backend Admin-Route + UI: `/app/operations/load-tier` Detail-Page + Hub-Karte + System-Health-Pill (90 min)
3. Python-Helper: `scripts/load_tier.py` mit `get_active_tier()` + `TIER_CONFIGS` (20 min)
4. `legacy_sync_v2.py` Härtung + Tier-Integration (60 min)

**Gesamt:** ~3 h Code + 30 min Test/Deploy

## 6. Validierungs-Checkliste (für Implementierung)

- [ ] DB-Migration idempotent + rollback-fähig
- [ ] Admin-UI: Tier-Buttons rendern korrekt (admin-tokens, Btn-`label`-prop)
- [ ] Tier-Wechsel via UI schreibt Audit-Row
- [ ] `python3 legacy_sync_v2.py --dry-run --load-tier low` durchläuft
- [ ] `python3 legacy_sync_v2.py --dry-run --load-tier high` durchläuft
- [ ] VPS-Run mit `medium` verhält sich wie heute
- [ ] 3 stündliche Cron-Runs grün
- [ ] Tier-Wechsel auf `low` zeigt erwartete Sleep + skipped Validation im nächsten Run
- [ ] System-Health-Pill zeigt aktuellen Tier
- [ ] `sync_log_freshness` bleibt OK (kein Stale-False-Positive mehr)

## 7. Offene Punkte für nächste Session

1. **Implementierung des PR** (4 Commits, ~3.5 h)
2. **Frank-Briefing** zur Load-Tier-UI + Empfehlungs-Matrix (welcher Tier wann)
3. **Mail-Archiv-Restart** mit `low`-Tier nach Implementierung
4. **Disk-IO-Monitoring** — Auto-Throttle (Phase 3 LOAD_TIER) später erwägen, wenn Robin sieht dass er den Tier oft manuell drehen muss
5. **GitHub-Release-Tag** vX.X.X-rcXX für den fertigen PR + CHANGELOG-Entry

## 8. Lehren / Updates am Memory-System

- **Supabase Free-Tier Disk-IO:** tagesbasiertes Burst-Budget, hartes Throttling auf 43 Mbps Baseline (Memory hinzugefügt: `reference_supabase_disk_io_budget`)
- **Compute-Upgrade Effekt:** sofort wirksam, kein DB-Restart, ~$10/Monat (Memory hinzugefügt: `project_supabase_micro_compute`)
- **Browser-Stale-State nach Compute-Upgrade:** Safari Storage-Clear nötig, Hard-Refresh reicht nicht (Memory hinzugefügt: `feedback_safari_storage_clear`)

## 9. Verbundene Commits / Files

**Geändert/erstellt in dieser Session:**
- `docs/optimizing/LOAD_TIER_KONZEPT.md` (neu, ~340 Zeilen)
- `docs/optimizing/IMPORT_LEGACY_MAILS_PLAN.md` (cross-linked + Tier-aware Tabellen)
- `docs/sessions/2026-05-07_disk_io_outage_load_tier_konzept.md` (dieses Doku)
- `docs/TODO.md` (LOAD_TIER-Workstream eingetragen)

**Noch nicht geändert (für nächste Session):**
- `backend/src/api/admin/operations/load-tier/route.ts` (zu erstellen)
- `backend/src/admin/routes/operations/load-tier/page.tsx` (zu erstellen)
- `scripts/load_tier.py` (zu erstellen)
- `scripts/legacy_sync_v2.py` (5 Fixes)
- DB-Migration

---

## Anhang — Session-Stats

- **Dauer:** ~5 h interaktiv über 3 Tage
- **Tools:** Bash (VPS-SSH), Supabase MCP (teils timeout), Read/Edit/Write
- **Outage-Recovery-Zeit:** ~1 h von "Backend hängt" bis stabile DB
- **Doku-Output:** 2 Konzept-Docs cross-linked, ~500 Zeilen total
- **Code-Output:** 0 Zeilen (Plan-Phase, bewusst nicht implementiert)
