# Postmortem: System Health Sampler Outage (rc51.7 → rc52.10)

**Datum erkannt:** 2026-05-01 ~10:30 UTC
**Datum behoben:** 2026-05-01 ~11:05 UTC
**Outage-Dauer:** 2026-04-25 18:44 UTC → 2026-05-01 10:42 UTC ≈ **5 Tage 16 Stunden**
**Schweregrad:** P3 (Observability tot, kein Customer-Impact, kein Daten-Verlust)
**Detected by:** Robin (Screenshot-Report) — **nicht** durch automatisierte Detection.

---

## Symptom

Operations-Hub-Karte zeigte `0/27 services OK`. Alle Service-Cards mit Suffix `[stale 8030–8044min]` (~5,6 Tage). Letzter sauberer Sample-Run: `2026-04-25T18:44:01Z`.

## Timeline

| UTC                  | Event |
|----------------------|-------|
| 2026-04-25 ~20:00    | rc51.7 Release. Crontab wird vermutlich via `echo X \| crontab -` überschrieben. Alle Crons außer `cutover_reminder.py` weg, inkl. **5 health-sampler-Einträge**. |
| 2026-04-26 ~10:30    | rc51.10 Backup-Setup deckt den Wipe auf. **6 Sync-Crons** (legacy_sync, meilisearch_*, discogs_daily, meili_dumps, replication_health) werden re-appendet. **Sampler-Crons übersehen** — sie standen in keinem `crontab.backup.*`-File. |
| 2026-04-26 → 05-01   | UI zeigt 5,6 Tage lang stale Samples. Keine Alerts (Sampler kann nicht alarmieren wenn er nicht läuft). |
| 2026-05-01 10:30     | Robin meldet `0/27 services OK` per Screenshot. |
| 2026-05-01 10:39     | Diagnose: Sampler-Header dokumentiert 5 Cron-Zeilen, Crontab hat 0. Backup `crontab.backup.20260501_103918.pre-sampler-restore.txt` angelegt. |
| 2026-05-01 10:40     | 5 Cron-Einträge atomic appendet. Erste Runs crashen mit `dash: Illegal option -o pipefail`. |
| 2026-05-01 10:42     | Side-Bug: Cron's `/bin/sh` ist dash, Sampler-Header dokumentierte `. /script.sh` (source-Mode). Auf Direktaufruf umgestellt — Bash-Shebang greift. |
| 2026-05-01 10:43     | Erster grüner Sample: `[2026-05-01T08:43:01Z] ok class=fast samples=7 duration_ms=124`. |
| 2026-05-01 10:50     | Drei UI-Bugs entdeckt aus den frischen Samples: discogs_api warning bei 25/25, hub-card filtert `insufficient_signal` als Issue, statusColor orange bei jedem non-ok. Code-Fix in `health-checks.ts` + `operations/page.tsx`. |
| 2026-05-01 11:05     | Deploy rc52.10 (commit `4c76ff6`). Backend PM2 PID 3588680, restart #61, /health OK. Alle 28 Checks fresh, Severity-Verteilung korrekt. |

## Root Causes

### RC1: Crontab-Wipe (rc51.7, 2026-04-25)
Single-write `echo … | crontab -` ohne vorheriges `crontab -l` → Total-Replace statt Append. Bekannt seit rc51.10 (Memory `feedback_crontab_atomic_update.md`).

### RC2: Unvollständiger Restore (rc51.10, 2026-04-26)
Restore-Pfad orientierte sich am letzten erhaltenen `crontab.backup.*`-Snapshot, nicht am Repo-Soll-Zustand. Die 5 Sampler-Crons standen in keinem Backup-File und sind daher durchgerutscht.

### RC3: Sampler-Header-Doku falsch (preexisting)
`scripts/health-sampler.sh:5-7` dokumentierte Crontab-Beispiele mit `. /path/script.sh` (POSIX source-Mode). Cron's Default-Shell `/bin/sh` ist auf Ubuntu/Debian dash und kennt kein `set -o pipefail`. Der Bug wurde nie sichtbar, weil das Script offenbar von Anfang an direkt aufgerufen wurde — die Header-Doku war Wunschform, nie verifiziert.

### RC4: Detection-Lücke
Es gibt **keinen** Dead-Man-Switch der bemerkt hätte, dass der Sampler tot ist. Der Sampler ist die Detection-Schicht — fällt er aus, fehlt die Detection seiner eigenen Stille. Klassische Observer-Self-Reference.

### RC5: UI-Bugs (preexisting)
Drei Severity-Modell-Bugs waren schon vor rc52.10 latent vorhanden, wurden aber nie auffällig weil der Sampler nie genug fresh `insufficient_signal`-Samples in beta_test produziert hatte (vorher waren Probes synchron und nur bei UI-Open).

## Fixes

| ID | Fix | Datei |
|----|-----|-------|
| F1 | 5 Cron-Einträge atomic angehängt (fast/background/synthetic/cleanup/digest) | VPS root crontab |
| F2 | Direktaufruf statt source-Mode in Crontab | VPS root crontab |
| F3 | discogs_api: relative Schwellen (≥40% ok / 20-40% warning / <20% error) | `backend/src/lib/health-checks.ts` |
| F4 | Hub-Karte filtert nur `warning\|error\|critical` als Issue, nicht `insufficient_signal` / `degraded` | `backend/src/admin/routes/operations/page.tsx` |
| F5 | `statusText` zählt `ok+insufficient_signal` als healthy (`26/28 services healthy`) | `backend/src/admin/routes/operations/page.tsx` |
| F6 | `statusColor` strikt nach Severity: error → red, warning → orange, sonst grün | `backend/src/admin/routes/operations/page.tsx` |

## Lessons Learned

1. **Restore-Discipline:** Bei jedem Crontab-Restore explizit gegen `scripts/*.sh`-Wrapper im Repo + `SYSTEM_HEALTH_EVOLUTION_PLAN.md` abgleichen, nicht nur gegen den letzten `crontab.backup.*`-Snapshot. Backup-Files sind möglicherweise selbst schon kaputt.
2. **Cron-Shell-Awareness:** Crontab-Zeilen für Bash-Scripts nie sourcen (`. /script.sh`), immer direkt aufrufen. Cron's Default-Shell ist dash. Memory: `feedback_cron_dash_pipefail.md`.
3. **Header-Comments verifizieren:** Wenn ein Script-Header Crontab-Beispiele zeigt, ist das **kein** Beweis, dass die Form funktioniert. Vor Übernahme prüfen.
4. **Observer Self-Reference:** Eine Detection-Schicht muss extern monitort werden. Der Sampler darf nicht der einzige Watcher seiner selbst sein.
5. **`insufficient_signal` ist Non-Firing per Design (rc51.9.4)** — UI-Komponenten die Severity rendern müssen das wissen, sonst false-positive Issue-Anzeige.

## Backlog (offene Items)

- [ ] **B1: Dead-Man-Switch für health-sampler.** Wenn `MAX(checked_at) WHERE check_class='fast' < NOW() - INTERVAL '10 min'` → Resend-Email an `rseckler@gmail.com`. Trigger muss extern zum Backend sein (sonst gleiches Self-Reference-Problem). Optionen: (a) Uptime-Kuma Push-Heartbeat aus dem Sampler-Wrapper, (b) separater Cron auf der VPS der die DB pollt und bei Stale alarmiert, (c) Supabase pg_cron + Resend.
- [ ] **B2: Crontab-as-Code.** Crontab-Soll-Zustand committed im Repo (`scripts/crontab.production.txt`), Diff-Check nach jedem Deploy + Reminder zur Sync mit VPS. Würde RC1+RC2 strukturell ausschließen.
- [ ] **B3: Sampler-Header korrigieren.** `scripts/health-sampler.sh` Zeilen 5-7 auf Direktaufruf umschreiben damit nächster Restore aus dem Header korrekt wird.
- [ ] **B4: Pre-Deploy-Smoke** für Sampler nach jedem Restart — kurzer Sanity-Curl auf `POST /health-sample?class=fast` direkt im Deploy-Skript, exit nicht-null wenn DB-Row nicht innerhalb 30s erscheint.

## Verbundene Dokumente

- [`SYSTEM_HEALTH_EVOLUTION_PLAN.md`](../optimizing/SYSTEM_HEALTH_EVOLUTION_PLAN.md) — Architektur
- [`docs/architecture/CHANGELOG.md`](../architecture/CHANGELOG.md) — rc52.10-Entry
- Memory: `feedback_crontab_atomic_update.md`, `feedback_cron_dash_pipefail.md`, `project_system_health_outage_2026-05-01.md`
- Commit: `4c76ff6` (UI-Fix), `9fbb01f` (Doku)
- Release: <https://github.com/rseckler/VOD_Auctions/releases/tag/v1.0.0-rc52.10>
