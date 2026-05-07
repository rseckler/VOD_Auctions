# Mail-Import — Reset-Plan (Neustart 2026-05-08)

**Status:** ✅ Phasen A→F abgeschlossen am 2026-05-07 (rc53.12). Welle 1 läuft autonom per Cron mit Auto-Cleanup. Welle 2 (Mac Studio Tiefen-Scan + RAID) dokumentiert als [RSE-322](https://linear.app/rseckler/issue/RSE-322), wartet auf Welle-1-Abschluss.
**Restart-Session-Log:** [`docs/sessions/2026-05-07_mail_import_reset_restart.md`](../sessions/2026-05-07_mail_import_reset_restart.md) — Phasen A-F im Detail mit allen Bug-Fixes
**Original-Schaden-Session:** [`docs/sessions/2026-05-07_mail_import_reset.md`](../sessions/2026-05-07_mail_import_reset.md)
**Vorgänger-Doku:** [`IMPORT_LEGACY_MAILS_PLAN.md`](./IMPORT_LEGACY_MAILS_PLAN.md) (obsolet, nicht mehr verlässlich)
**CHANGELOG-Eintrag:** [`docs/architecture/CHANGELOG.md` rc53.12](../architecture/CHANGELOG.md)
**Operations-UI:** [`/app/mail-import`](https://admin.vod-auctions.com/app/mail-import) — Live-Status der Welle 1

---

## Was diese Doku ersetzt

Der alte `IMPORT_LEGACY_MAILS_PLAN.md` enthält Annahmen die sich am
2026-05-07 als falsch herausgestellt haben (Replica enthält CRM-Tabellen,
Backup ist verlässlich, Cross-Folder-Duplikate sind identisch). **Lies
ihn nicht als Quelle für aktuelle Entscheidungen.** Diese Reset-Plan-Doku
ist die neue Quelle der Wahrheit.

---

## Aktueller Daten-Stand (Stand 2026-05-07 nach DELETE-Schaden)

| Asset | Status |
|---|---|
| `crm_imap_message` total | ~120k Rows (von ~166k vor 2026-05-07) — **46.655 Rows wurden am 2026-05-07 ohne Verifikation gelöscht** |
| LEGACY_ARCHIVE-Rows | 116.901 — vom kaputten v1-Importer (Mai 4) |
| `INBOX.Sent` | 2 Rows (war ~41.496) — **vermutlicher Datenverlust** |
| `INBOX.Sent Messages` | 37.328 Rows, alle mit leerem `body_excerpt` (100%) |
| INBOX | 69.059 Rows — überwiegend mit Body |
| `crm_pull_run` legacy_mail_archive | 3 Einträge (1× abandoned, 1× partial, 1× abandoned-by-me) |
| `idx_crm_imap_message_msgid_unique` | nicht vorhanden — weil Duplikate beim Index-Create blockten (Cleanup hat es entfernt aber Index wurde nicht erstellt) |
| JSONL auf VPS | `/root/imports/vod-mails-export.jsonl.gz` — 669 MB, MD5 `7230e5a2afc8c93fe641e0bd8a700460`, unbeschädigt |
| Scanner-Skripte | `frank-mac-studio-setup/*.sh` + `*.py` — funktionieren, NICHT betroffen |
| `scripts/load_tier.py` | committed, getestet — bleibt |
| `scripts/import_legacy_mails.py` (v1) | broken — wegwerfen |
| `scripts/import_legacy_mails_v2.py` | committed aber ungetestet auf Real-Daten — **neu schreiben** |

---

## Was NICHT mehr zu trauen ist

1. **Annahmen über Cross-Folder-Duplikate.** Der DELETE vom 2026-05-07 lief
   mit `ORDER BY indexed_at, id` und behielt die älteste Row pro
   `message_id_header`. Bei IMAP-Sync wurden möglicherweise erst leere
   Header-Rows inserted und der Body kam später per Update — heißt die
   "ältere" Row hatte keinen Body, die jüngere mit Body wurde gelöscht.
   **Nicht verifiziert.**

2. **Replica als Backup-Quelle.** CRM-Tabellen sind nicht in der Replica-
   Subscription. Daily-Backup wurde aus der Replica gemacht → enthält die
   CRM-Tabellen ebenfalls nicht.

3. **Der alte Plan-Doc.** Er listet Phasen 1-6 und beschreibt einen
   "Low-Load-Importer" der auf falschen Annahmen aufbaut.

---

## Reset-Plan Phasen

Jede Phase ist ein eigener Session-Schritt. **Pro Phase: explizites OK
von Robin vor Ausführung.** Keine autonome Kette.

### Phase A — Bestandsaufnahme (READ-ONLY, ungefährlich)

**Was:**
- SELECT-Queries gegen `crm_imap_message` zur Daten-Realität
- Anzahl Rows pro `folder` × `account` × `pull_run_id`
- Gibt es einen running IMAP-Sync-Prozess? Wann lief er zuletzt?
- Existieren Stage-4-Body-Match-Daten?

**Output:** Markdown-Report für Robin's Einsicht.

**Gate:** Robin sagt "OK weiter" oder "Stopp".

### Phase B — IMAP-Sync-Reparatur (additiv, kein DELETE)

**Was:** Den DELETE-Schaden im `INBOX.Sent`-Folder reparieren, indem der
IMAP-Sync neu gegen den Mail-Server läuft. Mails sind server-side noch
vorhanden, IMAP-Sync inserted die fehlenden Rows wieder.

**Vorab klären:**
- Existiert bereits ein IMAP-Sync-Skript? (vermutlich ja, da `crm_imap_message`-Tabelle existiert)
- Wie wird er getriggert? Cron, manuell, beides?

**Aktion:** ein einzelner manueller Sync-Run. Kein DELETE, nur INSERTs/UPSERTs.

**Gate:** Robin OK vor Trigger. Verify nach Lauf: `INBOX.Sent` wieder bei ~41k Rows mit Body.

### Phase C — LEGACY_ARCHIVE Tabula-Rasa (sicher destruktiv)

**Was:** Alle 116.901 LEGACY_ARCHIVE-Rows wegwerfen + 3 pull_runs als
abandoned flaggen. **Sicher** weil:
- Daten sind vollständig in `/root/imports/vod-mails-export.jsonl.gz`
- Reproduzierbar mit dem neuen Importer
- Kein Verlust, nur Reset auf sauberen Anfangs-Zustand

**SQL (jedes vorab Robin gezeigt):**
```sql
-- 1. Pull-Runs flaggen
UPDATE crm_pull_run
SET status = 'abandoned',
    finished_at = COALESCE(finished_at, NOW()),
    notes = COALESCE(notes,'') || ' [reset 2026-05-08]'
WHERE source = 'legacy_mail_archive';

-- 2. LEGACY_ARCHIVE rows weg
DELETE FROM crm_imap_message WHERE folder = 'LEGACY_ARCHIVE';
```

**Verify nach Lauf:**
```sql
SELECT COUNT(*) FROM crm_imap_message WHERE folder = 'LEGACY_ARCHIVE'; -- 0
SELECT status, COUNT(*) FROM crm_pull_run WHERE source = 'legacy_mail_archive' GROUP BY status;
-- alle in 'abandoned'
```

**Gate:** Robin OK vor jedem SQL einzeln.

### Phase D — Neuer Importer (lokal getestet, NICHT auf Real-DB)

**Was:** `scripts/import_legacy_mails_v2.py` von 2026-05-07 wird **gelöscht**.
Neuer Importer wird mit folgender Disziplin geschrieben:

**Hard-Gates:**
1. **Test-Suite mit synthetischen Daten** (10/100/1000 Rows) — passes vor
   jedem Real-Run
2. **Pre-flight Index-Check** — Importer **refused to start** wenn UNIQUE-
   Index `idx_crm_imap_message_msgid_unique` nicht existiert
3. **Statement-Timeout 2 Min + Backoff** — bewiesen funktionierend in Test
4. **State-File + atexit-Handler** — Test-Coverage für Crash-Recovery
5. **Time-Box 30 Min** — Hard-Stop, kein autonomer Marathon-Run
6. **Pro-Batch Connection-Recycle** — keine 6h-Connection-Halten

**WICHTIG:**
- Importer wird gegen Sample-JSONL getestet (lokal oder VPS-Sandbox), NICHT gegen Production
- Code-Review-Gate: Robin liest Code vor erstem Real-Run

**Gate:** Robin OK vor Phase E.

### Phase E — Index erstellen + 1.000-Row-Smoke-Test

**Reihenfolge:**
1. **CREATE UNIQUE INDEX** `idx_crm_imap_message_msgid_unique` —
   `CONCURRENTLY`, additiv, ~30 s. Block-Free wenn Phase C erfolgreich
   (keine Duplikate mehr in LEGACY_ARCHIVE).
2. **Smoke-Test:** Importer mit `--limit 1000` ausführen
3. **Sample-Verifikation** (5 inserted Rows): Body vorhanden? detected_emails populated? korrekter folder?

**Gate:** Robin OK vor Phase F.

### Phase F — Rest in 30-Min-Slots

**Wenn Phase E sauber war.** Cron-Eintrag, low-tier, time-boxed. Kein
einmaliger Marathon-Run. Robin überwacht erste 2-3 Slots.

---

## Sicherheits-Regeln für die nächste Session

1. **Keine DELETE-Operationen ohne Robin's vorherige explizite Freigabe pro
   SQL-Statement.**
2. **Keine Annahmen über externe Systeme (Replica, Backups) ohne
   Verifikation vorab.**
3. **Pre-flight ist Pflicht, nicht Optional.**
4. **Bei Unsicherheit: Stop und fragen, NICHT pragmatisch entscheiden.**
5. **Keine destruktive Aktion in einem Bash-Block der mehrere Operationen
   chain't** — destruktiv ist atomar pro Befehl.

---

## Was wegzuwerfen / aufzuräumen ist

- `scripts/import_legacy_mails.py` — broken v1, in nächster Session löschen
- `scripts/import_legacy_mails_v2.py` — ungetestet, in nächster Session löschen, neu bauen
- 3 `crm_pull_run` legacy_mail_archive — Phase C SQL flaggt sie ab
- 116.901 LEGACY_ARCHIVE-Rows — Phase C SQL löscht sie

## Was bleibt

- `scripts/load_tier.py` — sauber
- `frank-mac-studio-setup/*` — alle Scanner-Skripte, sauber
- `/root/imports/vod-mails-export.jsonl.gz` — die Quell-Daten, MD5-verified
- `docs/optimizing/IMPORT_LEGACY_MAILS_PLAN.md` — als historisches Reference,
  nicht mehr handlungsrelevant
- Diese Reset-Plan-Doku — neue Quelle der Wahrheit
