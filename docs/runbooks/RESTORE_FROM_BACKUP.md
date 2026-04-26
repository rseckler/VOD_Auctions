# Runbook: Restore from Backup

**Priorität:** P-1 Disaster-Recovery
**Letztes Update:** 2026-04-26 (Tier-1 live)

## Symptome

- Datenverlust auf Supabase (vod-auctions / blackfire) — DROP TABLE, falscher DELETE, Migration-Schief, DB-Korruption
- Datenverlust auf VPS-DBs (stromportal, vodfest, kuma.db, n8n)
- R2 Bilder-Verlust (vod-images Bucket)
- Brevo CRM-Verlust (Account-Suspension, falscher Bulk-Delete)
- Disaster: Account-Suspension eines Providers (Cloudflare, Supabase, Hostinger)

## Diagnose (Copy-Paste)

```bash
# 1. Ist das letzte Backup überhaupt da?
ssh vps "rclone size r2-backups:vod-backups/weekly/ && rclone lsf r2-backups:vod-backups/weekly/db/vod-auctions/ | tail -3"

# 2. Wann lief der letzte erfolgreiche Backup-Job?
ssh vps "tail -50 /root/backups/backup.log | grep -E 'DONE|ERROR'"

# 3. Wenn ein Backup-Job tot ist: Kuma checken
# https://status.vod-auctions.com/dashboard
```

## Restore-Verfahren pro DB-Typ

### A. Supabase vod-auctions (oder blackfire)

**Zeitbedarf:** ~5 Min Pull + ~30 Sek Decrypt + ~22 Sek Restore = **~6 Min**.

```bash
# 1. Auf VPS einloggen + Backup-Env laden
ssh vps
set -a && . /root/VOD_Auctions/scripts/backup/.env.backup && set +a

# 2. Backup-Pfad wählen — aktuelle 7-Tage-Window
# Pfad: weekly/db/vod-auctions/<UTC-timestamp>.dump.gpg
# Oder ältere: ändere "weekly" zu "monthly" für 30-180d Backups
LATEST=$(rclone lsf r2-backups:vod-backups/weekly/db/vod-auctions/ | sort | tail -1)
echo "Latest: $LATEST"

# 3. Pull + decrypt
mkdir -p /tmp/restore && cd /tmp/restore
rclone copy "r2-backups:vod-backups/weekly/db/vod-auctions/$LATEST" .
gpg --batch --yes --decrypt --passphrase "$GPG_PASSPHRASE" "$LATEST" > dump.bin

# 4a. RESTORE IN SCRATCH (zum verifizieren bevor Prod-Restore!)
docker rm -f restore-pg 2>/dev/null
docker run -d --name restore-pg -e POSTGRES_PASSWORD=test postgres:17 >/dev/null
until docker exec restore-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
docker cp dump.bin restore-pg:/tmp/dump.bin
docker exec -u postgres restore-pg createdb restore_test
docker exec -u postgres restore-pg pg_restore --no-owner --no-acl --jobs=4 -d restore_test /tmp/dump.bin
docker exec -u postgres restore-pg psql -d restore_test -c \
  "SELECT count(*) FROM \"Release\", count(*) FROM erp_inventory_item, count(*) FROM \"transaction\";"

# 4b. RESTORE GEGEN PRODUKTIONS-SUPABASE (NACH SCRATCH-VERIFY!)
# WICHTIG: Erst manuell Affected Tables backuppen oder neuen Branch nutzen.
# DESTRUCTIVE — pg_restore --clean droppt Tabellen die im Dump sind.
# Empfohlen: in einer neuen Supabase-DB restoren, Storefront/Admin umkonfigurieren, dann verifyen, dann switchen.
# WORKFLOW:
#   1) Supabase Dashboard → "Branch" anlegen (Pro Plan unterstützt das)
#   2) pg_restore -d <branch-DB-URL> dump.bin
#   3) Robin verifiziert via Branch-URL, dann Branch-Promote oder DNS-Switch
```

### B. VPS PostgreSQL (stromportal)

```bash
ssh vps
set -a && . /root/VOD_Auctions/scripts/backup/.env.backup && set +a

# 1. Pull
LATEST=$(rclone lsf r2-backups:vod-backups/weekly/db/vps-pg-stromportal/ | sort | tail -1)
mkdir -p /tmp/restore && cd /tmp/restore
rclone copy "r2-backups:vod-backups/weekly/db/vps-pg-stromportal/$LATEST" .
gpg --batch --yes --decrypt --passphrase "$GPG_PASSPHRASE" "$LATEST" > dump.bin

# 2. Restore
sudo -u postgres dropdb stromportal_restore 2>/dev/null
sudo -u postgres createdb stromportal_restore
sudo -u postgres pg_restore --no-owner --no-acl -d stromportal_restore /tmp/restore/dump.bin

# 3. Verify, dann swap (Stromportal-Service stoppen, DB rename, Service starten)
```

### C. VPS MySQL (vodfest, naegele_db)

```bash
ssh vps
set -a && . /root/VOD_Auctions/scripts/backup/.env.backup && set +a

LATEST=$(rclone lsf r2-backups:vod-backups/weekly/db/vps-mysql/ | sort | tail -1)
cd /tmp/restore
rclone copy "r2-backups:vod-backups/weekly/db/vps-mysql/$LATEST" .
gpg --batch --yes --decrypt --passphrase "$GPG_PASSPHRASE" "$LATEST" | gunzip > dump.sql

# Restore in scratch DB first
mysql -e "CREATE DATABASE vodfest_restore;"
mysql vodfest_restore < dump.sql
# Verify, dann swap
```

### D. SQLite (uptime-kuma, tape-mag-migration)

```bash
ssh vps
set -a && . /root/VOD_Auctions/scripts/backup/.env.backup && set +a

# Beispiel: kuma.db
LATEST=$(rclone lsf r2-backups:vod-backups/weekly/db/vps-sqlite/kuma/ | sort | tail -1)
cd /tmp/restore
rclone copy "r2-backups:vod-backups/weekly/db/vps-sqlite/kuma/$LATEST" .
gpg --batch --yes --decrypt --passphrase "$GPG_PASSPHRASE" "$LATEST" | gunzip > kuma.db

# Container stoppen, swap, restart
docker stop uptime-kuma
cp /root/uptime-kuma/data/kuma.db /root/uptime-kuma/data/kuma.db.broken
cp kuma.db /root/uptime-kuma/data/kuma.db
docker start uptime-kuma
```

### E. R2 Bilder (`vod-images` Bucket)

**Disaster-Szenario:** versehentlicher Bucket-Delete oder rclone-sync-Bug der `vod-images` leert.

```bash
ssh vps
# Mirror enthält 1:1-Spiegel von vod-images zum Zeitpunkt des letzten 2h-Sync.
# Re-sync zurück:
rclone sync r2-backups:vod-backups/images-mirror r2-backups-write:vod-images \
  --fast-list --transfers=8 --progress
# (NB: braucht eigenen write-Token auf vod-images, der existiert aktuell nicht — bei
# Bedarf in Cloudflare Dashboard kurzfristig anlegen, danach revoken)
```

### F. Brevo CRM (Kontakte/Templates)

**Manuelle Re-Import — Brevo hat keine Bulk-Import-API mit Wahrung der Stati.**

```bash
ssh vps
set -a && . /root/VOD_Auctions/scripts/backup/.env.backup && set +a

LATEST=$(rclone lsf r2-backups:vod-backups/weekly/saas/brevo/ | sort | tail -1)
cd /tmp/restore
rclone copy "r2-backups:vod-backups/weekly/saas/brevo/$LATEST" .
gpg --batch --yes --decrypt --passphrase "$GPG_PASSPHRASE" "$LATEST" | tar -xzf -

# Inhalt: contacts.json, lists.json, templates.json, senders.json, account.json
# 1. Brevo Web-UI → Settings → Contacts → "Import contacts" → CSV (aus contacts.json konvertiert)
# 2. Templates: jeweils einzeln über Brevo-Web-UI "+ Create template" einfügen
# 3. Listen-Memberships nach Bulk-Import wiederherstellen (Brevo API: POST /v3/contacts/lists/<id>/contacts/add)
```

## Disaster Recovery — Provider-Komplettausfall

### Cloudflare-Account Suspended

R2 weg → Backups weg. **Mitigation:** in Tier-3 (Live-Phase) Backblaze B2 als Zweit-Provider.
Aktuell (Tier-1+2): einziger Schutz ist die VPS-Local-3-Tage-Retention für DB-Dumps (`/root/backups/`). R2 Image-Mirror geht verloren.

### Supabase-Account Suspended

Supabase-DB weg → R2 hat letzten 2h-Backup. Restore in neue Supabase-Org oder selbst gehosteten Postgres.
Alternative (Tier-2): VPS-Postgres-Replica (Logical Replication) ist Hot-Standby — Sub-Sekunden RPO, kann promoted werden.

### Hostinger-VPS-Ausfall

VPS-eigene DBs (stromportal, mysql, sqlite, n8n_data) weg.
Supabase + R2 sind unaffected — Backups da, Production-DB läuft weiter.
Restore: neuer VPS, R2-Pull, Setup nach Restore-Verfahren oben.

## Eskalation

- **Datenverlust mit Frank-Arbeitsverlust > 2h:** sofort Robin paged via Telegram/SMS, kein Restore ohne Robin-OK
- **R2-Bucket-Delete:** Cloudflare Support kontaktieren — sie haben in seltenen Fällen 24h-Recovery (nicht garantiert)
- **Supabase-Project-Suspended (TOS-Issue):** Supabase Support, neue Org anlegen, Backup einspielen

## Verwandte Doks

- [`docs/architecture/BACKUP_KONZEPT.md`](../architecture/BACKUP_KONZEPT.md) — Vollständige Architektur
- [`/root/VOD_Auctions/scripts/backup/`](../../scripts/backup/) — Live-Scripts auf VPS
- [`docs/runbooks/postgresql.md`](postgresql.md) — Postgres-Probleme generell
