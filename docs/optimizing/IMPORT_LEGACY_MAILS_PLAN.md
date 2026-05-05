# Mail-Archiv-Import — Low-Load-Import-Plan

**Status:** ⏸️ **On Hold** — Robin entscheidet Restart-Zeitpunkt nach Drive-Reanalyse
**Last update:** 2026-05-05
**Author:** Robin Seckler + Claude

## Hintergrund

Frank's Mac-Studio-Mail-Archiv (422.755 Mails, 669 MB JSONL.gz) sollte via
`scripts/import_legacy_mails.py` in `crm_imap_message` (Folder
`LEGACY_ARCHIVE`) importiert werden, damit Stage-4-Body-Match Email-Candidates
für Master ohne Email finden kann.

**Erster Lauf 2026-05-04 16:13–nachts:** ~116.901 von ~127.000 erwarteten Inserts
sind durchgekommen (~92%), dann starb der Process mit einem Statement-Timeout-Sturm:

```
[err] line 228324: canceling statement due to statement timeout
[err] line 228325: canceling statement due to statement timeout
... (~14× hintereinander, dann Process-Exit)
```

Pull-Run `72073e64-9bc2-4083-bc60-1aa4df553c01` hängt seitdem mit
`status='running'`, `finished_at=NULL` — gleicher Bug-Pfad wie beim ersten Test
(siehe Session-Log 2026-05-04).

## Ursachen-Analyse

Importer hatte ein klassisches Anti-Pattern für Supabase Free Plan:

1. **1 Connection, mehrere Stunden offen** — hält Resources fest, kein graceful Retry
2. **Row-by-row Dedup**: pro Mail erst `SELECT message_id_header WHERE = %s LIMIT 1`,
   dann `INSERT` → **~845.000 DB-Round-Trips** für 422k Mails
3. **Konstant 100% DB-Last** — keine Atempause für andere Queries
4. **Parallel zur Konsolidierung** — beide haben um Connections + Index-Pages konkurriert
5. **Crash = Verlust**: kein State-File, bei Restart muss alles erneut durch den Dedup
6. **Hangender pull_run**: bei Process-Kill bleibt `status='running'` ewig

## Vorgeschlagenes neues Vorgehen

### A) Architektur-Änderungen am Importer

| Aspekt | Alt | Neu |
|---|---|---|
| **Dedup** | row-by-row SELECT+INSERT | Batch SELECT 200 message_ids → filter → bulk INSERT |
| **Round-Trips** | ~845.000 | **~4.200** (200× weniger DB-Calls) |
| **Connection** | 1× 6h offen | kurzlebig — open per Batch, close, sleep, repeat |
| **Throttle** | keine | 100 ms Sleep zwischen Batches → DB hat 50% Idle |
| **Idempotenz** | SELECT-then-INSERT (race-prone) | `INSERT … ON CONFLICT (message_id_header) DO NOTHING` |
| **State-File** | kein | `/tmp/import_legacy_mails.state.json` — letzte Zeile + pull_run_id, nach jedem Batch geschrieben |
| **Max-Runtime** | unbegrenzt | `--max-runtime 1800` (30 Min) — clean shutdown bei Time-Box, exit 0 |
| **Error-Handling** | crash bei Timeout | bei Statement-Timeout: 5 s Backoff + 1 Retry, dann Batch skippen + Counter |
| **Pull-Run** | hangt bei Kill | atexit-Handler markiert pull_run als `partial` mit aktuellem Stand |

### B) Operations-Änderungen

| Aspekt | Alt | Neu |
|---|---|---|
| **Lifecycle** | manueller `nohup`-run | Cron stündlich oder via systemd-Unit (auto-restart) |
| **Cron-Slot** | irgendwann | nur Min `15-44` der Stunde (außerhalb `legacy_sync_v2` auf `0` und `meilisearch_sync` auf `2-59/5` — kein Konflikt) |
| **Pre-flight** | nichts | Check ob `crm_imap_message.message_id_header` UNIQUE-Index hat |
| **Logging** | append in 1 Datei | rotating log mit per-run-Stats |
| **Backpressure** | keine | wenn `sync_log` zeigt aktiven `legacy_sync_v2` → diesen Run skippen |

### C) Index-Check vorab

Vor dem Restart einmalig:

```sql
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'crm_imap_message' AND indexdef LIKE '%message_id_header%';
```

Falls kein UNIQUE-Index:

```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  idx_crm_imap_message_msgid_unique
  ON crm_imap_message (message_id_header)
  WHERE message_id_header IS NOT NULL;
```

Damit:
- Dedup-Lookups werden Index-Seek statt Sequential-Scan
- ON-CONFLICT-Pattern wird möglich (sicherer als SELECT-then-INSERT)

### D) ETA / Last-Profil

| Modus | Dauer | DB-Last | Crash-Recovery |
|---|---|---|---|
| **Alt** | 30–60 Min konstant 100% | hoch, blockt andere Queries | komplett verloren |
| **Neu** | 30 Min/h × 3–4 Stunden = **3–4 h Wallclock** | gemittelt ~50% | resume from state-file |

In dieser Zeit weiterarbeiten **ohne Beeinträchtigung** möglich — Frank kann
scannen, CRM-UI bleibt nutzbar, andere Crons laufen.

### E) Rollback-Plan

Falls trotzdem etwas schief läuft:

```sql
-- 1. State-File-Inhalt prüfen für letzten erfolgreichen Stand
-- 2. Bad-Run identifizieren:
SELECT id FROM crm_pull_run
WHERE source = 'legacy_mail_archive' AND status = 'running'
ORDER BY started_at DESC LIMIT 1;

-- 3. Cleanup
DELETE FROM crm_imap_message WHERE folder='LEGACY_ARCHIVE' AND pull_run_id = '<bad-run>';
UPDATE crm_pull_run SET status='abandoned', finished_at=NOW() WHERE id = '<bad-run>';
```

Restart mit gleicher JSONL.gz, Dedup macht den Rest.

## Aktueller DB-State (2026-05-05)

```
crm_master_contact:        20.826
LEGACY_ARCHIVE mails:      116.901   (vom abgebrochenen ersten Lauf)
ai_consolidated addresses:   4.673   (Konsolidierung Item 1 ✅ DONE)
```

Hangende Pull-Runs:

```
72073e64-…  status='running'   started_at=2026-05-04 16:13   (zu cleanup'en)
07f48615-…  status='partial'   1.000 rows                    (ist OK so)
```

## Konkretes Build-Set (wenn freigegeben)

1. Neue Datei `scripts/import_legacy_mails_v2.py` (alte als Referenz behalten)
2. Pre-flight-Helper `scripts/_check_imap_indexes.py` (einmalig, idempotent)
3. Optional: systemd-Unit oder Cron-Eintrag in `~/VOD_Auctions/scripts/cron-imap-import.sh`
4. Cleanup-Helper für hangenden pull_run vom letzten Lauf

## Offene Fragen für Restart-Entscheidung

1. **Lauf-Modus:** stündliche 30-Min-Slots (cron) oder einmaliger 3–4 h Marathon
   mit Throttle? Beide haben gleich niedrige DB-Last, der Unterschied ist
   Wallclock-Dauer und Wieder-Startbarkeit bei Crash.
2. **Index-Migration** auf `crm_imap_message.message_id_header` — additive
   Migration, kein Risk, ~30 s auf 116k Rows. OK?
3. **Hangende pull_runs** als `abandoned` flaggen?
4. **Existing 116.901 Rows** lassen wie sie sind (Dedup übernimmt) oder
   `DELETE WHERE pull_run_id = '<bad-run>'` für sauberen Restart-Counter?
5. **Reanalyse VOD BIGRAID:** Vor neuem Import-Lauf erst die Drive-Inventur
   (separates Skript) durchlaufen lassen — Frank's Erinnerung war "viele
   Mails archiviert", aber v2-Scan fand nur 113 davon dort. Wenn ein zweiter
   Mail-Store da ist, müsste der erst gescannt werden, sonst importieren wir
   doppelt mit Dedup-Overhead.

## Verbundene Dokumente

- Session-Log 2026-05-04: `docs/sessions/2026-05-04_mo_pdf_ai_cleanup_pipeline.md`
- v1-Scanner: `frank-mac-studio-setup/scan-old-emails.sh`
- v2-Scanner: `frank-mac-studio-setup/scan-old-emails-v2.sh`
- Importer (v1, broken): `scripts/import_legacy_mails.py`
- Drive-Diagnose: `frank-mac-studio-setup/diagnose-drive-for-mails.sh` (NEU 2026-05-05)
