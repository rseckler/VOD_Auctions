# Mail-Archive Tiefen-Scan — Briefing für Frank

**Hintergrund:** Der erste Scan-Lauf hat 422.755 Mails aus deiner Apple-Mail-V10-Library gefunden (laufen gerade bei uns in den Import). Wir wollen jetzt Welle 2 starten und schauen, ob auf dem Mac Studio + auf der externen RAID **noch mehr Mail-Quellen** liegen, die der erste Lauf nicht erfasst hat.

Was möglicherweise noch existiert:
- Alte Apple-Mail-Identities (V8/V9 — falls du in einer früheren macOS-Generation Mails hattest)
- Outlook 2011/2016 Stores
- Thunderbird-Profile
- Mail-Files innerhalb von ZIP/TAR/GZ-Archiven
- Mail-Listen in DOCX/XLSX/CSV/VCF (z.B. alte Member-Exports)
- Die externe RAID `/Volumes/VOD BIGRAID` — die wurde im ersten Lauf gar nicht gescannt

## Schritt 1 — Inventory-Lauf (read-only Diagnose)

Auf dem Mac Studio Terminal öffnen und ausführen:

```bash
curl -fsSL https://raw.githubusercontent.com/rseckler/VOD_Auctions/main/frank-mac-studio-setup/find_mail_stores_v3.py \
  -o /tmp/find_mail_stores_v3.py && \
python3 /tmp/find_mail_stores_v3.py --root "/Volumes/VOD BIGRAID"
```

Das ist **rein lesend** — es findet, listet, reportet, aber öffnet/extrahiert keine Mails. Du bekommst:

- Liste aller gefundenen Mail-Stores mit Pfad + Größe + Typ
- Liste aller mail-haltigen ZIP/TAR/GZ-Archive (ohne sie zu entpacken)
- Mail-Listen-Files (DOCX/CSV/etc.) mit gefundenen Adressen
- Permission-Denied-Liste (Pfade die der Scanner nicht öffnen konnte)

Output landet in `~/Documents/VOD Mails Scan v3/`.

**Falls die RAID nicht gemountet ist** — erst über Finder anmachen, dann Befehl starten.

**Optional zusätzlich** — auch die lokale SSD scannen (parallel zum RAID-Scan in einem zweiten Terminal):

```bash
python3 /tmp/find_mail_stores_v3.py --root "$HOME"
```

## Schritt 2 — Inventory an Robin schicken

Wenn der Scan durch ist (kann je nach RAID-Größe 1-3h dauern, läuft im Hintergrund):

```bash
cd ~/Documents/"VOD Mails Scan v3"
zip -r ../vod-mail-stores-inventory-$(date +%Y%m%d).zip .
```

Die ZIP-Datei ist klein (Reports + Listen, keine Mail-Inhalte) → einfach per WeTransfer/iMessage/Email an Robin.

## Schritt 3 — wartet

Ich (Robin) schaue mir das Inventory an und entscheide:
- Welche Stores extrahieren wir wirklich
- Ob der existierende Extractor reicht oder ich ihn erweitern muss
- Welche JSONL wir produzieren sollen

Dann kriegst du einen **zweiten Befehl** für die Extraktions-Phase. Die Extraktion produziert wieder eine `vod-mails-export-welle2.jsonl.gz`, die du an Robin schickst — Robin scp'd sie auf den VPS, der Importer läuft dann autonom (genauso wie bei Welle 1).

## Was du NICHT machen musst

- Nichts auf dem Mac Studio konfigurieren oder installieren (außer ggf. die RAID mounten)
- Keine Database-Credentials, keine SSH-Tunnel, kein Direct-Upload — die JSONL fließt über dich an Robin, der scp'd sie dann auf den VPS
- Kein Risiko für die Originaldaten — der Scanner ist nur lesend, fasst keine Files an

## Was passiert bei Problemen

- **„Permission denied"-Liste ist lang** → das ist normal, der Scanner reportet dir präzise welche Verzeichnisse er nicht öffnen konnte. Falls da was Wichtiges drin ist, können wir gezielt nachhelfen
- **RAID langsam / Scan hängt** → Strg+C bricht ab, beim nächsten Start läuft er ab dem letzten Fortschrittspunkt weiter (Resumable)
- **Du findest 0 Mail-Stores auf der RAID** → auch ein Ergebnis, dann ist Welle 2 für die RAID nicht nötig

## Status

- Welle 1 (Apple-Mail-V10-Library): läuft seit 2026-05-07, 422.755 Mails im Import
- Welle 2 (dieses Briefing): Inventory-Phase noch nicht gestartet, wartet auf dich
- Welle 3+: ggf. weitere Quellen falls Inventory was findet was der bestehende Extractor noch nicht kann
