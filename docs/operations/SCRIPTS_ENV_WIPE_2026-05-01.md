# Postmortem: scripts/.env Wipe (rc52.7-Followup, 2026-05-01)

**Datum erkannt:** 2026-05-01 ~11:35 lokal (= 09:35 UTC)
**Datum behoben:** 2026-05-01 ~12:00 lokal (= 10:00 UTC) für Cron-Funktion · ~14:00 lokal für vollständige Verification + Postmortem
**Outage-Dauer der Sync-Crons:** ~1h 48m (08:00 UTC → 09:48 UTC)
**Schweregrad:** P3 (Sync-Backlog ohne Customer-Impact, kein Daten-Verlust, kein Service-Downtime, AI-Chat-Drift war pre-existing)
**Detected by:** Robin (Operations-Hub-Screenshot mit `Meilisearch Drift: drift check stale: last run 95min ago`)

---

## Symptom

Operations-Hub-Karte zeigte am 2026-05-01 ~11:35 lokal `23/28 services OK` und einen `error`-Alert „Meilisearch Drift: drift check stale: last run 95min ago (expected every 30min)". Plus `26/28 services healthy` (rc52.10-konform: `ok+insufficient_signal` als healthy, Differenz = 3 Services im `insufficient_signal`-State).

Letzter sauberer Eintrag in `meilisearch_drift_log` war von **08:00 UTC** (= 10:00 lokal). Cron sollte hourly laufen seit rc52.6.5 (Disk-IO-Sweep heute morgen).

## Root Cause

**Single Cause:** Eine rc52.7-Session am 2026-05-01 morgens hat `scripts/.env` mit einem `Write`-Tool-Call vollständig überschrieben statt MINIMAX_API_KEY anzuhängen. Vor dem Wipe enthielt die Datei ~14 Keys; nach dem Wipe nur noch `MINIMAX_API_KEY` und `MINIMAX_API_HOST` (234 Bytes, 3 Zeilen).

**Mechanik:** Claude Code's `Write`-Tool ersetzt Datei-Inhalt komplett. Die Guardrail erfordert vorheriges `Read`, nicht aber, dass der vorhandene Inhalt im neuen `Write`-Argument enthalten ist. Wer beim Append `Write(file, "MINIMAX_API_KEY=...\nMINIMAX_API_HOST=...")` aufruft statt `Edit(file, old=last_line, new=last_line+\\n+new_lines)` oder Bash `>>`, wiped die Datei stillschweigend.

**Sister-Vorfall:** Identische Klasse von Fehler wie der rc51.7-Crontab-Wipe vom 2026-04-25. Memory-Eintrag `feedback_crontab_atomic_update.md` existierte, war aber nur für Crontab spezialisiert — die Lesson wurde nicht auf andere Single-Source-of-Truth-Files generalisiert.

## Timeline

| UTC                  | Lokal | Event |
|----------------------|-------|-------|
| 2026-04-25 ~18:44    | 20:44 | rc51.7-Crontab-Wipe (separater Vorfall, hier referenziert wegen Sister-Pattern) |
| 2026-04-26 ~08:00    | 10:00 | rc51.10 Crontab-Restore (5 Sampler-Crons übersehen → SYSTEM_HEALTH_OUTAGE_2026-05-01) |
| 2026-05-01 ~07:58    | 09:58 | scripts/.env auf Mac wiped (mtime) |
| 2026-05-01 ~09:00:05 | 11:00:05 | scripts/.env auf VPS wiped (mtime) |
| 2026-05-01 09:00     | 11:00 | Cron `0 * * * *` fires: `meilisearch_drift_check.py` failed mit `ERROR: SUPABASE_DB_URL not set`. legacy_sync_v2.py at gleicher Minute lief erfolgreich (lädt aus `/root/VOD_Auctions/.env`, nicht scripts/.env). |
| 2026-05-01 09:05–09:35 | 11:05–11:35 | `meilisearch_sync.py` cron `2-59/5 * * * *` failed bei jedem Run. |
| 2026-05-01 09:35     | 11:35 | Robin meldet Stale-Alert via Screenshot. |
| 2026-05-01 09:48     | 11:48 | Diagnose: `scripts/.env` hat 234 Bytes / 2 Keys. Cross-File-Grep aus `backend/.env` für 8 geteilte Keys (DATABASE_URL, MEILI_*, R2_*, ANTHROPIC, SENTRY, SUPABASE_SERVICE_ROLE_KEY) per `>>` angehängt. Backup als `.env.bak.20260501_114801`. |
| 2026-05-01 09:48     | 11:48 | Manueller drift_check-Run grün. |
| 2026-05-01 09:50     | 11:50 | Robin pasted LEGACY_DB_* (5 Keys) + R2_* (4 Keys) + BRAVE_API_KEY ins Chat. Alle in scripts/.env appended. **Anmerkung:** Die LEGACY_DB_* + R2_* waren parallel in `/root/VOD_Auctions/.env` (untouched seit Apr 3). Nur BRAVE_API_KEY war wirklich nirgends. |
| 2026-05-01 09:55     | 11:55 | DISCOGS_TOKEN aus backend/.env nachgemirrororiert. |
| 2026-05-01 09:59     | 11:59 | Dedup-Pass: `R2_BUCKET`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` waren je 2× drin (1× aus erstem Backend-Grep, 1× aus User-Paste). awk-Dedup behält letzte Occurrence. Backup als `.env.bak.dedup.20260501_115952`. |
| 2026-05-01 10:00     | 12:00 | Nächster `0 * * * *` cron: `legacy_sync_v2` (success/ok/41552/71s) + `meilisearch_drift_check` (commerce + discovery 52788/52788 OK). |
| 2026-05-01 11:35     | 13:35 | User fordert „nun nochmals alles sauber prüfen". Verification-Probe-Script `_verify_connections.py` + `_verify_db_state.py` geschrieben + ausgeführt. |
| 2026-05-01 11:50     | 13:50 | **Wahre Blast-Radius-Korrektur entdeckt** (siehe „Lessons Learned" #5). |

## Tatsächlicher Blast-Radius (korrigiert)

Bei der ursprünglichen Recovery hatte ich ein falsches mentales Modell: dass `scripts/.env` der einzige Env-Loader für alle Scripts ist. Das ist **nicht** so. Die VPS hat **drei** `.env`-Files mit unterschiedlichen Konsumenten:

| File | mtime | Loader-Pattern | Konsumenten |
|------|-------|----------------|-------------|
| `/root/VOD_Auctions/.env` | **Apr 3, untouched** | `load_dotenv(Path(__file__).parent.parent / ".env")` aus `shared.py` | **legacy_sync_v2.py**, `cutover_reminder.py`, `crm_import.py`, `extract_legacy_data.py`, alle `migrate_*.py`, `fix_*.py`, `cleanup_release_artists.py`, `discogs_price_test.py`, etc. |
| `/root/VOD_Auctions/scripts/.env` | **May 1 09:00 UTC, wiped** | `Path(__file__).parent / ".env"` aus einigen Scripts + `meili-cron-env.sh` Wrapper | `audit_discogs_mappings.py`, `backfill_format_v2_dry_run.py`, `backfill_genre_styles.py`, `generate_entity_content.py`, `monitor_entity_gen.py`, `validate_labels.py` + via Wrapper: **`meilisearch_sync.py`**, **`meilisearch_drift_check.py`** |
| `/root/VOD_Auctions/backend/.env` | May 1 10:05 UTC (rc52.7 MINIMAX-Append, intakt) | Medusa-Backend bei Start; einzelne Scripts (`brevo_*`, `send_test_emails.py`) | Backend-Runtime, Brevo-Tools |

Tatsächlich gefailte Cron-Jobs durch den Wipe:
- ✅ `meilisearch_sync.py` (`2-59/5 * * * *`) — **AFFECTED**, ~22 verpasste Läufe (08:05 → 09:48 UTC). Kein Customer-Impact: wenn keine DB-Änderung, hatte keine Daten zu pushen. Backlog-Catchup mit chunked-Sync ohne Probleme.
- ✅ `meilisearch_drift_check.py` (`0 * * * *`) — **AFFECTED**, 1 verpasster Lauf um 09:00 UTC. Kein Operational-Impact: drift_log hat einen 1h48m-Lücke, wurde mit dem 10:00-Lauf eingeholt.
- ❌ `legacy_sync_v2.py` (`0 * * * *`) — **NICHT AFFECTED**: lädt aus `/root/VOD_Auctions/.env` via `shared.py:38`, nicht scripts/.env. Sync-Log zeigt 09:00 UTC + 10:00 UTC beide success/ok/41552/~70s.
- ❌ `cutover_reminder.py` (`0 9 * * *` = 11:00 UTC) — **NICHT AFFECTED**: lädt direkt aus `/root/VOD_Auctions/.env`.
- ❌ `discogs_daily_sync.py` — **NICHT AFFECTED**: läuft nächstes Mal Mo 02:00, kein Run heute betroffen.
- ❌ Alle Health-Sampler (5 Crons) — **NICHT AFFECTED**: nutzen `HEALTH_SAMPLER_TOKEN` aus `backend/.env` direkt via Backend-API-Calls.
- ❌ Alle Backup-Crons — **NICHT AFFECTED**: nutzen eigene Env-Loading-Logik in `scripts/backup/`.

**Konsequenz:** Die User-Paste der LEGACY_DB-Credentials ins Chat war operational unnötig. Die Werte waren parallel in `/root/VOD_Auctions/.env` vorhanden und wurden von `shared.py` automatisch geladen. Wenn ich vor dem Bitten zuerst `ls /root/VOD_Auctions/*.env*` gemacht und `shared.py:38` gegrept hätte, wäre der Cred-Paste vermeidbar gewesen.

## Verification-Ergebnisse (post-Recovery, 2026-05-01 13:50 lokal)

### scripts/.env (`_verify_connections.py`)
| Service | Status | Detail |
|---------|--------|--------|
| Postgres (Supabase) | ✅ OK | PG 17.6 · Release count=52.788 |
| MySQL (tape-mag) | ✅ OK | MariaDB 10.11.14 · releases=2.441 |
| Meilisearch | ✅ OK | v1.20.0 · status=available |
| R2 (Cloudflare) | ✅ OK | bucket=vod-images |
| Anthropic (Claude) | ❌ **FAIL** HTTP 401 | **Pre-existing**: invalid x-api-key in BOTH backend/.env + scripts/.env (byte-identisch). Nicht Folge des Wipes. |
| MiniMax (M2) | ✅ OK | rc52.7-konform |
| Brave Search | ⚠️ HTTP 429 | Daily quota exhausted; recovers tomorrow |
| Discogs API | ✅ OK | username=pripuzzi |
| Supabase REST (svc role) | ✅ OK | HTTP 200 · ref=bofblwqieuvmqybzxapx |
| Sentry (DSN format) | ✅ OK | Format valid (no live ping) |

**8/10 OK · 1 pre-existing FAIL · 1 transient quota.**

### Cron-Pipeline (`_verify_db_state.py`)
- `sync_log`: 24 Einträge in 24h, alle `success/ok/41552 rows`, hourly cadence sauber
- `meilisearch_drift_log`: 80 Einträge in 24h, latest 10:00 UTC, alle severity ok
- `health_check_log`: 648 Einträge in der letzten Stunde (Sampler running, ~10/min)
- Stuck import_sessions: 0
- Meili `search_indexed_at IS NULL` backlog: 0
- Fired alerts in `health_alert_dispatch_log`: 0

### Backup Pipeline
- R2-Bucket `vod-backups` strukturiert in `daily/`, `weekly/`, `monthly/`, `images-mirror/`
- vod-auctions: 02:00, 04:00, 06:00, 08:00, 10:00 UTC alle DONE OK (10:00 UTC = today's 1st-of-month bin → `monthly/db/vod-auctions/20260501_100005Z.dump.gpg` 125MB)
- R2-Mirror: 02:55, 04:56, 06:59, 09:00:15 UTC alle DONE OK (227.056 src = mirror)
- Replication-Lag: durchgängig <30s (sub_lag oft 0s)

### Services
- `vodauction-backend`: PM2 online, /health HTTP 200 in 2.3ms, 80m uptime
- `vodauction-storefront`: PM2 online, HTTP 307 (beta_test gate redirect, expected)
- Meili: 52.788 docs in commerce + 52.788 docs in discovery, isIndexing=false, alle 65 Felder 100% populiert

## Lessons Learned

### 1. **`Write` ist niemals OK für `.env`/`crontab`/Single-Source-Configs.**
Einzig sichere Tools: `Edit` (mit präzisem `old_string`/`new_string`) oder Bash `>>`. Memory: `feedback_env_file_append_only.md` (NEU). Vorher: `feedback_crontab_atomic_update.md` war crontab-spezifisch und nicht generalisiert worden.

### 2. **Recovery-Reihenfolge: erst Diagnose-Inventur, dann erst User-Paste.**
Bei Restore-Szenarien immer ZUERST:
1. `ls /root/VOD_Auctions/*.env*` (alle Env-Files inventarisieren, mtime checken)
2. `grep -l "load_dotenv" /root/VOD_Auctions/scripts/*.py | xargs grep load_dotenv` (welches Script lädt welches File?)
3. Cross-File-Grep auf Schwester-Files für überlappende Keys

DANN erst, falls echt nicht-im-System, User um 1Password-Werte bitten. Memory: `feedback_env_file_append_only.md` Recovery-Reihenfolge erweitert.

### 3. **Verify-Output kritisch lesen, nicht überfliegen.**
Mein erster Cross-File-Grep aus backend/.env hat R2_ACCESS_KEY_ID/SECRET/BUCKET tatsächlich erfolgreich kopiert. Mein nachgeschalteter `grep -oE "^[A-Z_]+=" | sort -u`-Verify zeigte sie aber nicht in der Output-Liste — wahrscheinlich Pipe-Truncation oder ssh-Output-Buffering. Ich habe das als „R2 fehlt" interpretiert und User um Paste gebeten. Hätte ich `wc -l` + `grep ^R2_` direkt gemacht, wäre der Doppel-Eintrag früher aufgefallen.

### 4. **Nicht raten, sondern messen.**
Während der Recovery habe ich „legacy_sync 12:00 wird kritisch failen" gesagt — basierend auf der Annahme, dass scripts/.env die SoT ist. Tatsächlich lädt legacy_sync via `shared.py` aus `/root/VOD_Auctions/.env`, einer separaten Datei, die nie geclobbert war. 1 Minute `grep load_dotenv` hätte das gezeigt. Stattdessen Panik beim User induziert.

### 5. **CLAUDE.md Env-File-Spec ist ungenau.**
CLAUDE.md sagt unter „Credentials (ENV)":
```
# scripts/.env
OPENAI_API_KEY, LASTFM_API_KEY, YOUTUBE_API_KEY, BRAVE_API_KEY,
SUPABASE_DB_URL, LEGACY_DB_*, R2_*
```

Das suggeriert, dass alle script-relevanten Env-Vars in `scripts/.env` liegen. Tatsächlich liegen LEGACY_DB_* + R2_* + SUPABASE_DB_URL in `/root/VOD_Auctions/.env`, das `shared.py:38` lädt. Es gibt drei `.env`-Files mit überlappenden aber unterschiedlichen Konsumenten. Der Spec sollte das transparent dokumentieren (siehe Backlog B5).

### 6. **Credentials in Chat-Transkript sind irreversibel.**
Robin pasted unter Stress LEGACY_DB_PASSWORD, R2_SECRET_ACCESS_KEY, BRAVE_API_KEY direkt. Das Transkript persistiert. Best Practice wäre gewesen: VPS-side Cross-File-Grep mit `>>` (Werte bleiben auf VPS), und nur für genuin nicht-im-System-Werte um Paste bitten — und auch dann lieber via temporäre 1Password-CLI-Pipe, nicht direkt im Chat.

## Fixes (Post-Recovery)

| ID | Fix | Status |
|----|-----|--------|
| F1 | scripts/.env mit 19 unique Keys, Backup unter `.env.bak.dedup.20260501_115952` | ✅ done |
| F2 | Memory `feedback_env_file_append_only.md` mit Recovery-Reihenfolge-Section | ✅ done |
| F3 | Verification-Scripts `_verify_connections.py` + `_verify_db_state.py` committed | ⏳ this session |
| F4 | UI-Threshold drift_check 90→120min + Message „every 60min" (rc52.6.5-Drift) | ⏳ todo (separat von Wipe-Recovery) |

## Backlog (offene Items, P1-P3)

### P1: Strukturelle Prävention

- **B1: ENV-Files in Backup-Plan ergänzen.** [`docs/architecture/BACKUP_KONZEPT.md`](../architecture/BACKUP_KONZEPT.md) schützt aktuell nur Postgres + R2. ENV-Files (`/root/VOD_Auctions/.env`, `scripts/.env`, `backend/.env`, `.env.meili`) müssen in eine täglich-encrypted-zu-R2-Backup-Pipeline. Restore-Kosten heute: User muss 1Password durchforsten + Werte eintippen. Mit Backup: 5-Sekunden-Restore aus `r2://vod-backups/env-snapshots/`.

- **B2: Crontab-as-Code (parallel zu B1 für Crontab-Schutz).** Aus rc52.10-Postmortem übernommen. Soll-Zustand committed im Repo (`scripts/crontab.production.txt`), Diff-Check nach jedem Deploy.

- **B3: 1Password Service Account + `op`-Permissions im Allowlist.** Damit ich Restore-Operationen ohne User-Interaktion durchführen kann (mit kontrolliertem Vault-Scope). Robin hat das selbst angefragt; User muss Service-Account erstellen + Token in `OP_SERVICE_ACCOUNT_TOKEN` exportieren + ich muss Bash-Permissions für `op item get` / `op document get` in `~/.claude/settings.json` whitelisten.

### P2: Laufende Bugs (gefunden während Diagnose, nicht durch Wipe verursacht)

- **B4: ANTHROPIC_API_KEY invalid (HTTP 401) in beiden `.env`-Files.** Pre-existing. Backend AI-Chat (Haiku) + AI-Create-Auction (Sonnet) sind broken seit Key-Rotation. User muss Key in console.anthropic.com rotieren und in `backend/.env` + `scripts/.env` updaten. Deploy-Hinweis: PM2-Restart nach `.env`-Änderung pflicht.

- **B5: CLAUDE.md Env-File-Spec präzisieren.** Klarstellen welcher Loader welches File erwartet. Vorschlag-Section:
  ```
  # /root/VOD_Auctions/.env (Loader: shared.py via load_dotenv)
  Konsumiert von: legacy_sync_v2 (CRON), cutover_reminder, crm_import, alle migrate_*/fix_*

  # /root/VOD_Auctions/scripts/.env (Loader: einige Scripts direkt + meili-cron-env.sh Wrapper)
  Konsumiert von: meilisearch_sync (CRON), meilisearch_drift_check (CRON), backfill_*

  # /root/VOD_Auctions/backend/.env (Loader: Medusa-Runtime + brevo_*)
  Konsumiert von: vodauction-backend (PM2), brevo_*

  # /root/VOD_Auctions/.env.meili (Sourced by meili-cron-env.sh)
  Konsumiert von: meilisearch_sync (CRON), meilisearch_drift_check (CRON)
  ```

- **B6: Cron-Kollision Minute 0 (rc52.6.5 follow-up).** `legacy_sync_v2` UND `meilisearch_drift_check` beide `0 * * * *`. Genau das `feedback_cron_minute_zero_collision.md`-Pattern, das der Disk-IO-Sweep für meilisearch_sync gefixt hat. Vorschlag: drift_check auf `30 * * * *` verschieben. Risiko-Niedrig, Lock-Contention-Stories in legacy_sync.log (3× FATAL deadlock historisch sichtbar) könnten damit zurückgehen.

- **B7: UI-Threshold drift_check stale message.** `backend/src/lib/health-checks.ts:744` sagt „expected every 30min" + Threshold 90min. Cron ist hourly seit rc52.6.5. Threshold auf 120min, Text auf „every 60min". Plus `severity_note:727` analog korrigieren.

- **B8: Crontab-Kommentar-Drift.** `# Meilisearch Drift Check (alle 30 Min)` über `0 * * * *` Cron — Comment veraltet seit rc52.6.5.

### P3: Hygiene

- **B9: Credentials rotieren** die in der Chat-Transcript gepastet wurden:
  - `LEGACY_DB_PASSWORD` (tape-mag MySQL — Hetzner/all-inkl)
  - `R2_SECRET_ACCESS_KEY` (Cloudflare R2 vod-images)
  - `BRAVE_API_KEY` (Brave Search)
  - Nicht akut, aber Best-Practice nach Cred-Exposure.

- **B10: ENV-File-Konsolidierung.** Aktuell teilen `/root/VOD_Auctions/.env` + `scripts/.env` einige Keys (LEGACY_DB_*, R2_*, SUPABASE_DB_URL). Bei Rotation müssen beide gepflegt werden. Optionen: (a) Konsolidieren auf eine Datei und alle `Path(__file__).parent / ".env"`-Loader anpassen, (b) Symlink, (c) Live-with-it und Drift-Risk explizit dokumentieren.

## Verbundene Dokumente

- [`SYSTEM_HEALTH_OUTAGE_2026-05-01.md`](SYSTEM_HEALTH_OUTAGE_2026-05-01.md) — Sister-Vorfall vom selben Tag (Crontab-Wipe rc51.7)
- [`docs/architecture/BACKUP_KONZEPT.md`](../architecture/BACKUP_KONZEPT.md) — V6, B1 Backlog: ENV-Files ergänzen
- [`docs/architecture/CHANGELOG.md`](../architecture/CHANGELOG.md) — rc52.7 (MiniMax M2 Foundation)
- Memory: `feedback_env_file_append_only.md`, `feedback_crontab_atomic_update.md`
- Verify-Scripts: `scripts/_verify_connections.py`, `scripts/_verify_db_state.py`
