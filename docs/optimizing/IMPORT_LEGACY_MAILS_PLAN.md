# Mail-Archiv-Import — Vollständiger Plan & Datenkarte

**Status:** ⏸️ **On Hold** — Robin entscheidet Restart-Zeitpunkt
**Last update:** 2026-05-05
**Author:** Robin Seckler + Claude

## Zusammenfassung in einem Absatz

Der erste Mail-Import-Lauf am 2026-05-04 importierte **116.901 von 422.755 Mails** aus
Frank's Mac-Studio-Apple-Mail (Hauptquelle), starb dann durch Statement-Timeout-Sturm
auf Supabase. Drei Drive-Inventory-Läufe auf der externen `/Volumes/VOD BIGRAID`
zeigten: der **alte Apple-Mail-Archive-Export ist BEREITS in den Mac-Studio-Daten enthalten**
(als `Archiv_Mails.mbox` mit 296.729 Mails — 70% des JSONL-Volumens). Was zusätzlich
auf BIGRAID liegt sind **Pre-Apple-Mail-Quellen** (9 PSTs, Thunderbird-Profile,
Outlook 2011 Database) **plus 33 Address-Listen** mit ~10.000 Customer-Mail-Adressen.
Vor Restart soll der Importer auf Low-Load-Pattern umgebaut werden (Batch-Dedup,
Time-Box, State-File-Resume, Index-Migration).

---

## Teil 1: Datenkarte — wo liegen welche Mails?

### Quelle A: Mac-Studio Apple-Mail (BEREITS exportiert als JSONL)

**Datei:** `~/Documents/Claude-Work/PROJECTS/VOD_Auctions/Monkey Office/Mails von Franks Archiven/vod-mails-export.jsonl.gz` (669 MB komprimiert, 422.755 Records)

**6 Apple-Mail-Accounts (V10) auf Frank's Mac Studio:**

| Account-UUID | Mailbox | Mails | Bemerkung |
|---|---|---|---|
| `B9664497-…` | **`Archiv_Mails.mbox`** | **296.729** | ⭐ **DER alte Apple-Mail-Archive-Export** den Robin und Frank vor 1-3 Jahren erstellt haben — als "On My Mac"-Local-Folder integriert |
| | `Outbox.mbox` | 3.491 | |
| | `Wiederhergestellte E-Mails (Vod-Records).mbox` | 21 | Recovery-Folder von Apple Mail |
| | `Wiederhergestellte E-Mails (Vinyl-On-Demand).mbox` | 7 | dito |
| `548617F2-…` | `INBOX.mbox` | 97.620 | aktueller IMAP-Account |
| `DE861BB1-…` | `INBOX.mbox` | 24.686 | weiterer aktueller IMAP-Account |
| `D15D6FEA-…` | `[Google Mail].mbox` | 105 | Google-Account |
| `D34334E9-…` | `INBOX.mbox` | 28 | weiterer Account |
| `A13F6CB7-…` | `INBOX.mbox` + `Sent Messages.mbox` | 6 | weiterer Account |
| **Total** | | **422.755** | |

**Wichtig zur Erinnerung von Robin und Frank:** Der alte Archive-Export wurde
nicht auf eine externe Drive gelegt — er wurde als lokale Apple-Mail-Mailbox
"Archiv_Mails" integriert und liegt damit unter
`~/Library/Mail/V10/B9664497-…/Archiv_Mails.mbox/Messages/*.emlx`. Das hat
v1-Scanner am 2026-05-04 mit-erfasst.

### Quelle B: BIGRAID-Drive (separater Pre-Apple-Mail-Bestand)

**Drive:** `/Volumes/VOD BIGRAID` (16.7 TB belegt von 18 TB)
**Inventory-Datei:** `~/Documents/VOD Mail-Inventory/VOD_BIGRAID_v3_*`
**v3-Scan-Lauf:** 31m 29s am 2026-05-05, 2.127 ZIPs inspiziert (0 mit Mails),
4.976 Text-Files gesnifft (107 mit Adressen)

#### B1: 9× Outlook-PST-Files (Pre-Apple-Mail-Era)

```
Outlook.pst                          (Frank's Hauptmailbox PC)
_avks_archive.pst                    (PC-Archiv)
OutlookHotmail-00000005.pst          (Hotmail-Account)
archive.pst                          (iMac-Outlook-Archiv)
frank kontakte.pst                   (×2 — Daten + Daten OLD)
kontaktebackupfuerrobin1600.pst      (×2)
```

**Größe:** 3.5 GB total. **Format:** Outlook Windows (proprietär).
**Extract-Tool:** `brew install libpst` → `readpst -o /tmp/extracted <file.pst>`
liefert mbox-Files die durch den existierenden Importer laufen können.

#### B2: Thunderbird-Profile (noch ältere PC-Mails)

```
/Volumes/VOD BIGRAID/Festplatten/Musik 5 (4TB)/Archiv/Backup PC Daten (Frank.VOD2)/
  Anwendungsdaten/Thunderbird/Profiles/c3pbzafi.default/Mail/Local Folders/
    Outlook Nachricht0.sbd/Persönliche Ordner.sbd/
      Posteingang.sbd/vodbis2005       686 MB  ← VOD bis 2005!
      Posteingang                       442 MB
      Gesendete Objekte                 313 MB
      Entwürfe                           13 MB
      Gelöschte Objekte                 746 KB
    (Outlook Nachricht.sbd duplicate, leicht kleiner)
```

**Format:** Naked mbox-Files (Magic-Byte `From `).
**Extract:** Python `mailbox` stdlib parst direkt → JSONL-Records für existing-importer.

#### B3: Outlook 2011 Database (Mac-Outlook-Era)

```
/Volumes/VOD BIGRAID/Festplatten/iMac Intern/Documents/Microsoft-Benutzerdaten/
  Office 2011 Identities/Main Identity/Database  (21 MB)
```

**Format:** Outlook Mac proprietär.
**Extract:** Komplex — Outlook 2011 müsste auf einem alten Mac geöffnet werden,
dann "Datei > Exportieren > Outlook for Mac Data File (.olm)". Alternativ
`emlx-converter` Tools die bedingt funktionieren.

#### B4: Sage GSAuftrag CRM-Datenbank (2010-2011)

```
/Volumes/VOD BIGRAID/Festplatten/RAID iMAC/Daten/GSAuftrag/Backups/
  2018/SG_ADRESSEN.csv         (477 Mails)
  2018/SG_ADR_KOMDATEN.csv     (779 Mails)
  diverse Database.txt         (379 Mails je)
```

Frank's altes ERP. Customer-Stammdaten + Mail-Adressen. **Format:** Plain-Text.

#### B5: 33 Adress-Listen mit ⭐ VOD-Mail-Adressen

**Top-Funde mit Anzahl Mail-Adressen drin:**

| File | Mails | VOD-Hits | Pfad |
|---|---|---|---|
| `tapemag new members.xlsx` | **1.591** | ⭐ 2 | `/Backups/Backup Schreibtisch 16.05.2021/Desktop/` |
| `tapemagusers.xlsx` | 1.195 | ⭐ 2 | `/iMac Intern/Schreibtisch OLD/` |
| `Tape Mag Users.xlsx` | 1.012 | ⭐ 2 | dito |
| `Tape Mag Mitglieder.xlsx` | 967 | ⭐ 2 | dito |
| `Tape mag subscribers.xlsx` | 886 | ⭐ 2 | dito |
| `tapemag subscribers 770.xlsx` | 770 | ⭐ 2 | dito |
| `tapemag mitgliueder.xlsx` | 437 | ⭐ 2 | `/iMac Intern/Schreibtisch OLD/KREAIT GANZ TOLL/` |
| `Members Tape Mag.xlsx` | 404 | ⭐ 2 | `/iMac Intern/Schreibtisch OLD/` |
| `KostenVinylondemand082011.xlsx` | 632 | – | VOD-Kosten-Tabelle 2011 |
| `contacts.vcf` | 1.938 | ⭐ 2 | `/Daten/3_vinylondemand/` |
| `Kontakte.vcf` (Outlook) | 1.740 | – | Outlook-Hauptkontakte |
| `BusinessKontakte.vcf` | 1.718 | – | |
| `contacts.csv` | 1.716 | ⭐ 2 | CSV-Variante |

Weitere 20+ Listen mit jeweils 50-700 Mail-Adressen.
**Format:** XLSX/CSV/VCF.
**Extract:** Python `openpyxl` (XLSX), `csv` stdlib, `vobject` für VCF
(oder Plain-Text-Parsing mit Email-Regex).

#### B6: 103 emlx-Files in IMAP-Cache "Deleted Messages"

```
/Festplatten/Musik 5 (4TB)/Archiv/Mail/
  IMAP-frank@vinyl-on-demand.com@mail.vinyl-on-demand.com/INBOX/
    Deleted Messages.imapmbox/Messages/*.emlx
```

Diese sind ein IMAP-Synced-Apple-Mail-Cache mit DELETED messages. **Vermutlich
sind diese Mails NICHT in Quelle A enthalten** (weil sie auf dem IMAP-Server
gelöscht wurden bevor der Apple-Mail-Archive-Export gemacht wurde). 103 Mails
sind klein, könnten direkt importiert werden.

#### B7: Permission-Denied (7.688 Pfade — alle irrelevant)

Alle 7.688 unlesbaren Pfade sind macOS-System-Sandbox-Container
(`com.apple.AddressBook/Data/Library/Mail`, `com.apple.appstore/Data/Library/Mail`,
`com.apple.calculator/Data/Library/Mail` etc.) — diese sind leere Stub-Folders die
jeder System-App eine `Library/Mail` vortäuschen, nicht wirklich enthalten.
**Kein Full-Disk-Access-Issue, keine echten Mail-Daten dahinter.**

### Quelle C: ZIPs auf BIGRAID (NICHT Mail-Archive)

**Wichtige Erkenntnis aus v3-Scan:** Die 20 großen "Archiv\*.zip"-Files
(1.6-2 GB jeweils) wie `LEBEN UND ARBEITEN FUER ALFRED/Archiv 2.zip` sind
**alle Audio-Backups, KEINE Mail-Archive.** v3-Scanner hat 2.127 ZIPs
inspiziert, **0 enthielten Mail-Files.**

Frank's Erinnerung "Mails archiviert" trifft also zu — aber als
`Archiv_Mails.mbox`-Mailbox in Apple Mail (Quelle A), nicht als ZIP.

---

## Teil 2: Was importieren wir, in welcher Reihenfolge?

### Phase 1: Mac-Studio-Mail-Restart (höchste Priorität)

Wieder-Aufnahme des abgebrochenen Imports der `vod-mails-export.jsonl.gz`.
Nach Importer-Umbau (siehe Teil 3) → ~10k restliche Inserts + Dedup über
die 116.901 schon importierten.

**Erwarteter Mehrwert:** kompletter Apple-Mail-Bestand inkl. Archiv_Mails.mbox
in `crm_imap_message`. Stage-4-Body-Match findet Customer-Email-Verknüpfungen.

### Phase 2: Adress-Listen (Quick-Win, hoher Mehrwert)

Skript `scripts/import_legacy_addresslists.py`:
- liest XLSX (openpyxl) / CSV / VCF
- extrahiert `(name, email)`-Pairs
- schreibt in `crm_staging_contact` mit `source = 'legacy_addresslist'`
- + `raw_payload` mit Original-File-Pfad + Row-Number
- Dedup per email_lower

**Erwartet:** ~10.000-15.000 unique Customer-Email-Adressen (viele bereits in
Mac-Mail-Daten, aber zusätzliche `name → email`-Mappings für CRM-Master-Resolver)

### Phase 3: Thunderbird-mbox-Files (klein, einfach)

Skript `scripts/import_thunderbird_mbox.py`:
- Python `mailbox` stdlib → iteriert Messages aus naked-mbox
- Konvertiert zu JSONL-Format kompatibel zu existing-importer
- Pfad-fix: alle `*.sbd/Posteingang`, `*.sbd/vodbis2005` usw.
- Dann durch existierenden Importer (Phase 1)

**Erwartet:** ~50.000-100.000 Mails aus Frank's Pre-Apple-Mail-Era (vor 2010).
**vodbis2005 = explizit "VOD bis 2005"** = älteste Customer-Touchpoints.

### Phase 4: PST-Files (mittel-Aufwand)

Skript `scripts/import_pst.sh` (bash-Wrapper):
1. `brew install libpst` (einmalig)
2. Pro PST: `readpst -o /tmp/pst-out/<basename> <pst-path>` → liefert mbox-Folders
3. Konvertiert via Phase-3-Pipeline

**Erwartet:** unbekannt — PST-Größen reichen von 100 MB bis 2 GB. Vermutlich
zwischen 50.000 und 500.000 Mails total über alle 9 PSTs.

### Phase 5: Outlook 2011 Database (komplex, optional)

**Aufwand hoch.** Outlook 2011 müsste auf altem Mac wieder zum Laufen gebracht
werden, dann manueller `.olm`-Export. Alternativ: Tools wie
[`emlx-converter`](https://github.com/qqilihq/emlx-converter) probieren —
funktionieren nur bedingt mit Outlook-2011-Format.

**Empfehlung:** vorerst NICHT priorisieren — die wichtigen Customer aus dieser
Era sind vermutlich auch in den PSTs (Quelle B1) und im Apple-Mail-Archive
(Quelle A) drin.

### Phase 6: Sage GSAuftrag (Quick-Win für Stammdaten)

Skript `scripts/import_sage_db.py`:
- liest `Database.txt` / `SG_ADRESSEN.csv` etc.
- Schema-Discovery zuerst (Frank's Sage hatte custom-Felder)
- Customer-Stammdaten (Name, Adresse, Email, Tel) → `crm_staging_contact`
  mit `source = 'sage_gsauftrag'`

**Erwartet:** ~500-1.000 Customer-Master mit kompletten Adress-Daten aus 2010-2011.

---

## Teil 3: Importer-Umbau für Supabase-Schonung

### Was beim ersten Lauf schiefging

`scripts/import_legacy_mails.py` (v1) hatte ein klassisches Anti-Pattern:

1. **1 Connection, mehrere Stunden offen** — Resource-Held-Forever
2. **Row-by-row Dedup**: pro Mail erst `SELECT message_id_header WHERE = %s LIMIT 1`,
   dann `INSERT` → **~845.000 DB-Round-Trips** für 422k Mails
3. **Konstant 100% DB-Last** — keine Atempause für andere Queries
4. **Parallel zur Konsolidierung** — beide haben um Connections + Index-Pages konkurriert
5. **Crash = Verlust**: kein State-File, bei Restart muss alles erneut durch den Dedup
6. **Hangender pull_run**: bei Process-Kill bleibt `status='running'` ewig

### Vorgeschlagener Importer-Umbau

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

### Pre-flight Index-Migration

Einmalig vor Restart:

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

### ETA / Last-Profil

| Modus | Dauer | DB-Last | Crash-Recovery |
|---|---|---|---|
| **Alt (broken)** | 30–60 Min konstant 100% | hoch, blockt andere Queries | komplett verloren |
| **Neu** | 30 Min/h × 3–4 Stunden = **3–4 h Wallclock** | gemittelt ~50% | resume from state-file |

Du arbeitest in der Zeit **ohne Beeinträchtigung** weiter — Frank kann scannen,
CRM-UI bleibt nutzbar, andere Crons laufen.

---

## Teil 4: Aktueller DB-State (Stand 2026-05-05)

```
crm_master_contact:        20.826
LEGACY_ARCHIVE mails:     116.901   (vom abgebrochenen ersten Lauf, 92% von ~127k erwartet)
ai_consolidated addresses:  4.673   (Konsolidierung Item 1 ✅ DONE)
```

Hangende Pull-Runs:

```
72073e64-…  status='running'   started_at=2026-05-04 16:13   (zu cleanup'en)
07f48615-…  status='partial'   1.000 rows                    (ist OK so)
```

---

## Teil 5: Rollback-Plan

Falls bei Restart etwas schief läuft:

```sql
-- 1. Bad-Run identifizieren
SELECT id, started_at FROM crm_pull_run
WHERE source = 'legacy_mail_archive' AND status = 'running'
ORDER BY started_at DESC LIMIT 1;

-- 2. Cleanup
DELETE FROM crm_imap_message
WHERE folder = 'LEGACY_ARCHIVE' AND pull_run_id = '<bad-run>';

UPDATE crm_pull_run
SET status = 'abandoned', finished_at = NOW()
WHERE id = '<bad-run>';
```

State-File-Inhalt prüfen für letzten erfolgreichen Stand. Restart mit gleicher
JSONL.gz, Dedup macht den Rest.

---

## Teil 6: Offene Fragen für Restart-Entscheidung

1. **Restart-Modus** für Mac-Studio-JSONL: stündliche 30-Min-Slots (cron)
   oder einmaliger 3–4 h Marathon mit Throttle? Beide haben gleich niedrige
   DB-Last, der Unterschied ist Wallclock-Dauer und Wieder-Startbarkeit bei
   Crash.
2. **Index-Migration** auf `crm_imap_message.message_id_header` — additive
   Migration, kein Risk, ~30 s auf 116k Rows. OK?
3. **Hangende pull_runs** als `abandoned` flaggen?
4. **Existing 116.901 Rows** lassen (Dedup übernimmt) oder
   `DELETE WHERE pull_run_id = '<bad-run>'` für sauberen Counter? Lassen wäre
   schneller, weil ~117k INSERT-Operationen gespart.
5. **Phase-Reihenfolge:** Mac-Studio first (alles in einem) oder parallel
   Adress-Listen-Importer (Phase 2) zuerst weil low-risk + sehr direkter
   CRM-Mehrwert?
6. **Thunderbird/PST** vor oder nach Mac-Studio-Restart? Beide würden eigene
   `pull_run`-Source haben und beim Mac-Studio-Restart NICHT durch Dedup
   gefiltert (andere message_id_headers).

---

## Teil 7: Verbundene Dokumente und Skripte

### Diagnose-Tools (alle deployed)

- `frank-mac-studio-setup/scan-old-emails.sh` (v1, ursprünglich)
- `frank-mac-studio-setup/scan-old-emails-v2.sh` (v2, Auto-Volume + Tier-1/2)
- `frank-mac-studio-setup/diagnose-drive-for-mails.sh` (v2.5 — Drive-Inventory)
- `frank-mac-studio-setup/diagnose-drive-deep.sh` (v3 — ZIP-Content + DOCX-Mail-Listen)
- Output-Dateien: `~/Documents/VOD Mail-Inventory/VOD_BIGRAID_v3_*`

### Importer (broken, zu ersetzen)

- `scripts/import_legacy_mails.py` (broken nach 92% — als Referenz behalten)

### Zu bauende Skripte (siehe Phasen 2-6)

- `scripts/import_legacy_mails_v2.py` (Phase 1 — Low-Load-Importer)
- `scripts/_check_imap_indexes.py` (Pre-flight)
- `scripts/import_legacy_addresslists.py` (Phase 2 — XLSX/CSV/VCF)
- `scripts/import_thunderbird_mbox.py` (Phase 3 — naked-mbox)
- `scripts/import_pst.sh` (Phase 4 — libpst-Wrapper)
- `scripts/import_sage_db.py` (Phase 6 — Database.txt parser)

### Session-Log

`docs/sessions/2026-05-04_mo_pdf_ai_cleanup_pipeline.md` (Konsolidierung Item 1)
