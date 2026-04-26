# Backup-Konzept (Cross-Projekt)

**Erstellt:** 2026-04-26 · **Letztes Update:** 2026-04-26 (V5 — Tier-1 LIVE, Side-Issue Postmortem)
**Scope:** Alle Datenquellen im Workspace
**Status:** **Tier-1 LIVE** seit 2026-04-26 ~10:00 UTC. Tier-2 (Logical Replication etc.) noch offen.

---

## TL;DR

**Aktuell läuft 0 (Null) Off-Site-Backup für irgendeine Datenquelle.** Alle 4 Supabase-Projekte sind auf Free Plan (Daily-Backup mit 7 Tagen Retention serverseitig, kein Download, kein PITR). VPS-eigene Datenbanken haben gar keinen Backup-Mechanismus. **Cloudflare R2 mit ~44.000 Cover-Bildern** (32.886 unwiederbringliche tape-mag-Scans + 11.159 Discogs-Crawls + iPhone-Stocktake-Uploads) ist genauso gefährdet — und stand bisher gar nicht im Plan.

**Plan (V4 — Belt-and-Suspenders):**
- **Supabase Pro Plan** ($35/Mo gesamt für vod-auctions + blackfire) — operationelle Stabilität, downloadable Daily-Backups, IPv4 Direct-Connection, kein Project-Pause-Risk
- **Logical Replication zu eigenem Postgres auf VPS** als Hot-Standby — Sub-Sekunden-RPO, Failover-fähig, ersetzt das $100/Mo PITR-Add-on
- **Frequenz alle 2h** für VOD_Auctions pg_dumps + R2-Image-Mirror, 1×/Tag für Sekundär-DBs und Brevo CRM
- **5-fache Sicherung** der vod-auctions-DB: Live + Supabase-Daily-Download + WAL-Stream-zu-VPS-Replica + R2-Off-Site + VPS-Local-3-Tage
- 3-2-1-Regel mit 2 Provider-Geographien erfüllt (Cloudflare R2 + Hostinger VPS), zusätzlich physische Kopie auf eigener Hardware.
- **Kosten Tier-1+2: ~$36/Monat** ($35 Pro Plan + ~$1.20 R2 Storage). PITR-Add-on **gestrichen**, weil Replication das ersetzt → spart $1.260/Jahr ggü. Pro+PITR.

---

## 1 · Inventar aller Datenquellen

### 1.1 Datenbanken (Supabase, Org `Seckler`)

| Projekt | Ref | Status | Größe | Inhalt | Kritikalität |
|---|---|---|---|---|---|
| **vod-auctions** | `bofblwqieuvmqybzxapx` | active | **836 MB** | 52.788 Releases, 13.389 Inventory-Items, 18 Transactions, 5 Auction-Blocks, 53 Bids, alle CRM-Daten, Stammdaten-Edits seit rc50, Audit-Log | **A — kritisch** |
| **blackfire-service** | `lglvuiuwbrhiqvxcriwa` | active | 119 MB | 1644 Companies, Stock-Prices, Score-History, Sync-Logs | **A — kritisch** (laut Robin) |
| rseckler's Project | `giaodwqnoivynscckeux` | inactive | — | leer/paused | C |
| Banking | `psqfpymxmnpiwvglyriq` | inactive | — | paused | C |

### 1.2 Datenbanken (VPS-eigene, `72.62.148.205`)

| System | Datenbank | Größe | Verwendung | Backup |
|---|---|---|---|---|
| **PostgreSQL 16** | `stromportal` | (Energie-Zeitreihen) | Stromportal via PostgREST | ❌ |
| **MySQL** | `vodfest` | 4.6 MB | VOD_Fest WordPress | ❌ |
| **MySQL** | `naegele_db` | 2.1 MB | Legacy | ❌ |
| **Redis (lokal)** | `db0` | 10 keys | Sessions/Cache | ❌ |
| **SQLite** | `tape-mag-migration/prisma/migration.db` | 78 KB | Migrations-State | ❌ |
| **SQLite** | `uptime-kuma/data/kuma.db` | 15 MB | Monitoring-Historie | ❌ |
| **Docker-Volume** | `n8n_data` | (n/a) | n8n Workflows | ❌ |
| **Docker-Volume** | `blackfire_service_postgres_data` | **4 KB (LEER)** | Abandoned (PG_VERSION-Stub aus 14. Nov 2025, Pre-Vercel-Migration) — Blackfires Daten sind in Supabase | ⏭️ obsolet, kann gelöscht werden |

### 1.3 Object Storage / CDN — kritische Lücke

| Service | Inhalt | Volumen | Wiederherstellbar? | Kritikalität |
|---|---|---|---|---|
| **R2 — `vod-images`** | `tape-mag/standard/` | **32.886 Legacy-Cover** (gescannte Originale) | ❌ NEIN — Vinyl-Cover einmal gescannt | **A — kritisch** |
| | `tape-mag/discogs/` | **11.159 Discogs-Crawls** (WebP) | teilweise | **B — wichtig** |
| | `tape-mag/uploads/` | iPhone-Stocktake-Fotos (heute 0, wächst) | ❌ NEIN | **A — kritisch** |
| **Total** | | ~50–80 GB | | |

### 1.4 SaaS mit eigenem Datenbestand

| Service | Inhalt | Backup-Bedarf | Frequenz |
|---|---|---|---|
| **Brevo** | 3.580 Kontakte (List 5), 4 Newsletter-Templates, Versand-History, Opt-Out-State | **A — wichtig** | **täglich** (Robin's Wunsch — von "wöchentlich" eskaliert) |
| Stripe / PayPal | Payment-History (Provider ist Source-of-Truth) | C — Compliance | Quartals-CSV-Export für StB |
| Resend | Email-Versand-Logs | ⏭️ nein | — |

### 1.5 Geplante Integrationen — Compliance-Pflicht bei Aktivierung

**Verantwortung Robin (laut §7.6):** wir stellen sicher dass Backup vor erstem Produktiv-Vorgang steht. Operativ heißt das: bevor easybill/Fiskaly/Sendcloud-Module in `feature_flags` auf `enabled=true` flippen, muss der entsprechende Cron-Job (mit Test-Run) laufen.

| Modul | Daten | Aufbewahrungspflicht | Backup-Strategie |
|---|---|---|---|
| **easybill** (ERP_INVOICING) | Rechnungen, Gutschriften, Datev-Journal | **10 Jahre §147 AO + GoBD-konform unveränderbar** | Tägliches API-Export PDF+XML → R2 mit Object-Lock (immutable, 10y) + quartalsweise Datev-Export an StB |
| **Fiskaly TSE** (POS_WALK_IN P1) | TSE-signierte Kassenbelege | **10 Jahre KassenSichV §146a AO** | Tägliches TSE-Export-API → R2 mit Object-Lock (immutable, 10y) |
| **Sendcloud** | Versand-Labels, Tracking, Adressbuch | normal | Wöchentlich aktive Sendungen → R2 |

### 1.6 Services ohne Backup-Bedarf (begründet)

| Service | Begründung |
|---|---|
| Meilisearch | Index regenerierbar via `meilisearch_sync.py --full-rebuild` (~10 Min); Settings in Git |
| Upstash Redis | Reiner Cache (rate-limit, idempotency); Upstash hat eigene Snapshots |
| Supabase Realtime | Stateless Pub-Sub; Bid-Daten persistieren in Postgres `bid` |
| RudderStack | Pass-through-Forwarder, kein eigener Storage |
| Microsoft Clarity | Microsoft-managed, ephemere UX-Replays |
| Sentry | Sentry-managed Issue-Storage, reaktiv |

---

## 2 · Risiko-Bewertung

| Szenario | Wahrscheinlichkeit | Impact | Mitigation aktuell | Mitigation nach Tier-1+2 |
|---|---|---|---|---|
| Versehentliches `DROP TABLE` auf VOD_Auctions | mittel | **kritisch** (€465k DB-Wert) | Supabase 7d-Restore | **Pro PITR auf Sekunde** + 2h Off-Site |
| `DROP` älter als 7 Tage entdeckt | niedrig | **kritisch** | keine | R2-Retention 6 Monate |
| `rclone delete`-Bug auf R2 | mittel | **fatal** | keine | R2→R2 Mirror (separater Bucket+Token) |
| Supabase Account-Suspendierung | niedrig | **kritisch** | keine | R2 Off-Site + monthly downloadable Backup |
| Cloudflare Account-Suspendierung | niedrig | **fatal** (DB+Bilder beide weg) | keine | (Tier-3 zukünftig: Backblaze als Zweit-Provider) |
| VPS-Disk-Failure | niedrig | **kritisch** für Stromportal/n8n | keine | R2 Off-Site |
| Brevo Account-Loss | niedrig | hoch | keine | tägliche API-Exports |
| Live-Phase: Bestellungs-Datenverlust | niedrig | **fatal** | n/a (noch nicht live) | PITR <1 Min RPO |

---

## 3 · Empfohlenes Konzept

### 3.1 Architektur (V4 — Pro + Logical Replication)

```
SUPABASE Pro vod-auctions (PG17) ──┬─► Daily Backup 7d downloadable (Supabase intern)
                                   │
                                   ├─► Logical Replication via WAL ──► VPS Postgres 17 (Hot-Standby)
                                   │   <1s lag                          │
                                   │                                    ├─► pg_dump alle 2h aus Replica
                                   │                                    │   (zero Supabase-Egress)
                                   │                                    ▼
                                   │                          ┌─────────────────────┐
                                   │                          │ /root/backups/      │
                                   │                          │ 3 Tage local        │
                                   │                          └──────────┬──────────┘
                                   │                                     │
                                   └─► pg_dump direkt alle 2h ──────────►│ rclone
                                       (Belt-and-Suspenders)             │ push
                                                                         ▼
SUPABASE Pro blackfire ──────► pg_dump 1×/Tag ──────────────────────────►│ R2 vod-backups
                                                                         │ (EEUR EU)
VPS PostgreSQL 16 (stromportal) ──► pg_dump 1×/Tag ─────────────────────►│ Lifecycle:
VPS MySQL (vodfest, naegele_db) ──► mysqldump 1×/Tag ───────────────────►│  daily → 7d
VPS SQLite + Redis + n8n Volume ──► 1×/Tag ─────────────────────────────►│  weekly → 4w
BREVO API (Kontakte+Templates) ───► api-export 1×/Tag ──────────────────►│  monthly → 6m
                                                                         │  compliance/
R2 vod-images (Cover-Bilder) ─────► rclone sync alle 2h (delta) ────────►│   immutable 10y
                                                                         └─────────────────────┘
```

**Failover-Fähigkeit:** Bei Supabase-Outage kann Medusa temporär auf VPS-Postgres-Replica geschwenkt werden (Read-Only sofort, Read-Write nach `pg_promote_role`). Ist nicht Tier-1, aber die Architektur ermöglicht es.

### 3.2 Tier-1 (sofort — diese Woche)

| # | Aktion | Owner |
|---|---|---|
| 1.1 | **Supabase Pro Plan aktivieren** (Org `Seckler`) → PITR sofort live, 250 GB Egress | Robin |
| 1.2 | R2 Bucket `vod-backups` (EEUR Frankfurt) anlegen | Robin |
| 1.3 | API-Token A: write nur auf `vod-backups` | Robin |
| 1.4 | API-Token B: read-only auf `vod-images` (für Mirror) | Robin |
| 1.5 | GPG-Passphrase generieren + 1Password "VOD Backup GPG Passphrase" (Work) | Claude generiert, Robin speichert |
| 1.6 | `rclone` + `postgres:17` auf VPS aufsetzen | Claude |
| 1.7 | Backup-Scripts schreiben (`backup_databases.sh`, `backup_r2_images.sh`, `backup_brevo.sh`) | Claude |
| 1.8 | Cron einrichten (siehe §3.5) | Claude |
| 1.9 | R2-Lifecycle-Rules konfigurieren (Tag-basiert, siehe §5) | Claude |
| 1.10 | Uptime-Kuma 5× Heartbeat-Monitor | Robin (URL-Vergabe) + Claude (Cron-Integration) |
| 1.11 | **Restore-Test:** vod-auctions Dump in scratch-Postgres-Container zurückspielen, smoke-test | Claude+Robin |
| 1.12 | Blackfire-Volume `blackfire_service_postgres_data` löschen (leer, obsolet) — Robin OK? | Robin OK → Claude |

### 3.3 Tier-2 (Woche 2)

| Aktion |
|---|
| **Logical Replication zu VPS-Postgres 17** als Hot-Standby (Sub-Sekunden-RPO + Failover-Fähigkeit) — Details §3.6 |
| Backups dann lokal aus VPS-Replica (zero Supabase-Egress) |
| WAL-Lag-Monitor (Uptime-Kuma-Heartbeat: lag <60s) |
| **Brevo API-Export** täglich: Kontakte (CSV) + Templates (HTML) + Versand-History → R2 |
| SQLite-Files (kuma.db, migration.db) `sqlite3 .backup` → R2 |
| Redis `BGSAVE` + `dump.rdb` Copy → R2 |
| Docker-Volume `n8n_data` per `tar` während `docker stop n8n` (5-Min-Window in 03:00) → R2 |
| InfluxDB-Backup auf Mac mini (`influxdb3 backup`) → SCP zu VPS → R2 |
| Stripe + PayPal Quartals-CSV-Export für StB (manueller Trigger oder Cron) |
| **Restore-Runbook** `docs/runbooks/RESTORE_FROM_BACKUP.md` mit Schritt-für-Schritt pro DB-Typ |

### 3.4 Tier-3 (zum Live-Launch)

| Aktion |
|---|
| Backblaze B2 zweite Off-Site-Region (~€1/Mo, 10 GB free) |
| Quartals-Restore-Drill institutionalisieren |
| Compliance-Reports automatisiert (Stripe/PayPal/easybill quarterly) |
| ~~PITR-Add-on~~ — **gestrichen**, weil Logical Replication das ersetzt (spart $1.260/Jahr) |

### 3.6 Logical Replication Details

**Setup-Schritte (Tier-2, Claude führt aus):**

1. Auf VPS: `postgresql-17` parallel zu PG16 installieren (Stromportal nutzt PG16 weiter)
   - Port `5433` (5432 ist von Stromportal-PG16 belegt)
   - Datadir `/var/lib/postgresql/17/replica`
2. PG17 als logischer Subscriber konfigurieren: `wal_level=logical`, `max_replication_slots=4`, `max_logical_replication_workers=4`
3. Für jedes Supabase-Projekt (vod-auctions, blackfire):
   - Auf Supabase: `CREATE PUBLICATION vod_auctions_pub FOR ALL TABLES;`
   - Auf VPS: Ziel-DB anlegen + Schema einmalig via `pg_dump --schema-only` von Supabase rüberziehen
   - Auf VPS: `CREATE SUBSCRIPTION vod_auctions_sub CONNECTION '...' PUBLICATION vod_auctions_pub;`
4. Initial-Sync läuft (~836 MB für vod-auctions, ~120 MB für blackfire) — einmaliger Pooler-Egress
5. WAL-Stream live, kontinuierlich, ~10–50 MB/Tag Egress
6. Backup-Scripts: pg_dump aus VPS-Replica statt Supabase-Pooler → zero Supabase-Egress nach Initial-Sync

**Schema-Migration-Discipline:**
Robin's Wahl in §9.10 — entweder:
- (a) **Auto-Forwarding-Cron** (täglich 02:00): Schema-Diff zwischen Supabase und VPS-Replica via `pg_dump --schema-only` → DDL-Apply auf Replica. Migrations werden mit ~1d Delay propagiert. Vorteil: keine Manual-Discipline. Nachteil: Migration-Window kann Conflicts erzeugen wenn Migration auf Supabase Daten ändert die Replication noch nicht weiß.
- (b) **Manueller Workflow-Schritt**: jede `apply_migration` auf Supabase muss innerhalb der gleichen Session via `psql -p 5433` auch auf VPS-Replica laufen. Wird im CLAUDE.md als Pflicht-Schritt dokumentiert. Vorteil: Conflict-frei. Nachteil: Disziplin-Anforderung.

**Empfehlung:** (b) — mit klarer Doku im CLAUDE.md Migration-Workflow.

**Monitoring:**
- Uptime-Kuma Push-Monitor "Replication-Lag-vod-auctions" (alle 5 Min, Toleranz 15 Min)
- Cron-Skript `replication_health_check.sh` prüft `pg_stat_replication.replay_lag` < 60s, pingt Kuma
- Bei Lag >5 Min: Email-Alert via Resend
- Bei Lag >30 Min: `DROP SUBSCRIPTION` + `CREATE SUBSCRIPTION` mit `copy_data=false` (assume-OK), oder bei Drift: full re-init

### 3.5 Cron-Schedule

```cron
# vod-auctions: alle 2h (12×/Tag)
0 */2 * * *   /root/VOD_Auctions/scripts/backup_supabase.sh vod-auctions    >> /root/backups/backup.log 2>&1

# blackfire: 1×/Tag
30 3 * * *    /root/VOD_Auctions/scripts/backup_supabase.sh blackfire       >> /root/backups/backup.log 2>&1

# VPS-DBs (PG + MySQL + SQLite + Redis): 1×/Tag
0 3 * * *     /root/VOD_Auctions/scripts/backup_vps_databases.sh            >> /root/backups/backup.log 2>&1

# R2 Image-Mirror: alle 2h (Frank lädt iPhone-Fotos hoch — lock-step mit Postgres)
30 */2 * * *  /root/VOD_Auctions/scripts/backup_r2_images.sh                >> /root/backups/backup.log 2>&1

# Brevo daily
0 4 * * *     /root/VOD_Auctions/scripts/backup_brevo.sh                    >> /root/backups/backup.log 2>&1

# n8n Volume mit Container-Stop: 1×/Tag im Wartungsfenster
15 3 * * *    /root/VOD_Auctions/scripts/backup_n8n_volume.sh               >> /root/backups/backup.log 2>&1

# Local-Retention-Cleanup: stündlich
*/30 * * * *  find /root/backups -maxdepth 1 -type d -mtime +3 -exec rm -rf {} \;
```

**12×/Tag pg_dump auf vod-auctions:** ~150–250 MB komprimierter Pooler-Egress pro Dump → ~2.5 GB/Tag, 75 GB/Monat. Pro-Plan-Quota 250 GB/Mo → unkritisch (~30% Auslastung).

---

## 4 · Backup-Frequenz pro Datenklasse (Final V3)

### 4.1 Beta-Phase (jetzt)

| Datenklasse | Frequenz | RPO max |
|---|---|---|
| **Supabase vod-auctions** | **alle 2h** + PITR (Pro Plan) | <1 Min PITR, 2h Off-Site |
| **Supabase blackfire** | 1×/Tag + PITR | <1 Min PITR, 24h Off-Site |
| **R2 vod-images** | **alle 2h** delta-sync | 2h |
| Brevo CRM | **1×/Tag** (Robin's Eskalation) | 24h |
| VPS stromportal | 1×/Tag | 24h |
| VPS MySQL (vodfest, naegele_db) | 1×/Tag | 24h |
| SQLite + Redis + n8n | 1×/Tag | 24h |
| InfluxDB Mac mini (Tier-2) | 1×/Tag | 24h |

### 4.2 Live-Phase (zukünftig)

Im Wesentlichen unverändert — PITR ist schon ab Tier-1 aktiv. Tier-3 ergänzt zweiten Off-Site-Provider.

---

## 5 · Backup-Script Spezifikation

**Pfad:** `/root/VOD_Auctions/scripts/`
**Sub-Scripts:** `backup_supabase.sh` (Argument: project-slug), `backup_vps_databases.sh`, `backup_r2_images.sh`, `backup_brevo.sh`, `backup_n8n_volume.sh`

**Gemeinsame Bibliothek `_backup_common.sh`:**
- Loading `.env.backup` (GPG, R2, DB-URLs, Brevo-Key, Kuma-URLs)
- `gpg_encrypt()` Wrapper
- `rclone_push()` Wrapper mit Lifecycle-Tag
- `kuma_heartbeat()` Wrapper
- Error-Handler mit Resend-Email-Alert bei Failure

**Beispiel `backup_supabase.sh`:**
```bash
#!/usr/bin/env bash
set -euo pipefail
source /root/VOD_Auctions/scripts/_backup_common.sh

PROJECT=${1:?usage: backup_supabase.sh <vod-auctions|blackfire>}
DATE=$(date -u +%Y%m%d_%H%M)
LIFECYCLE_TAG=$(get_lifecycle_tag "$DATE")  # daily | weekly | monthly

case "$PROJECT" in
  vod-auctions) URL="$SUPABASE_VOD_AUCTIONS_URL" ;;
  blackfire)    URL="$SUPABASE_BLACKFIRE_URL" ;;
  *) echo "unknown project"; exit 1 ;;
esac

OUT=/tmp/backup_${PROJECT}_${DATE}.dump.gpg
docker run --rm --network=host postgres:17 \
  pg_dump --format=custom --no-owner --no-acl --compress=9 "$URL" \
  | gpg --batch --symmetric --passphrase "$GPG_PASSPHRASE" > "$OUT"

rclone copyto "$OUT" "r2-backups:vod-backups/db/$PROJECT/$DATE.dump.gpg" \
  --header-upload "x-amz-tagging:lifecycle=$LIFECYCLE_TAG"

rm "$OUT"
kuma_heartbeat "$KUMA_HEARTBEAT_$PROJECT"
log_ok "$PROJECT" "$DATE" "$(stat -c%s "$OUT")"
```

**R2-Lifecycle (Cloudflare-Dashboard, Tag-basiert):**
- `lifecycle=daily` → 7 Tage
- `lifecycle=weekly` (Sonntags 03:00 Run) → 4 Wochen
- `lifecycle=monthly` (1. des Monats 03:00 Run) → 6 Monate
- `lifecycle=compliance` (easybill/Fiskaly bei Aktivierung) → 10 Jahre, immutable
- `images-mirror/` (rclone-sync) → permanent, keine Lifecycle-Rule

---

### 5.1 · Setup-Workflow (Initial-Deploy / Re-Setup nach Token-Rotation / Disaster-Recovery)

**Wann nutzen:**
- Initial-Deploy auf neuen VPS
- Nach Token-Rotation (R2-Roll, GPG-Passphrase-Wechsel)
- Nach Hostinger-VPS-Migration
- Disaster-Recovery: alter VPS weg, neuer VPS + alle Credentials neu deployen

**Voraussetzungen:**
- 1Password CLI auf Robin's Mac installiert + eingeloggt: `eval $(op signin)` (TouchID)
- Folgende Items existieren im **1Password Work-Vault** (Namen / UUIDs):
  - `VOD Backup GPG Passphrase` → `u2wtf3nzhon4wk7mafty3mwebm` (password field)
  - `VOD R2 Backup Token (write)` → `efs63hfeei5r5qadiriyei7ehu` (Access Key ID + Secret Access Key)
  - `VOD R2 Images Token (read-only)` → `2pffsxceotwitwxrpvm3xtpmg4` (Access Key ID + Secret Access Key)
  - `VOD Uptime-Kuma Heartbeats` → `oniyzboj6qrhh6swzfxb6k4igq` (6 Push-URLs)
- 1Password **Persönlich**-Vault: `Supabase Blackfire` → `svuu4vwwzxbx6pkmfh45x7ou5q` (postgres-User-Password)
- Cron-fähiger VPS, erreichbar via `ssh vps` (ControlMaster aus `~/.ssh/config`)
- `rclone` installiert auf VPS, mit beiden R2-Profilen in `~/.config/rclone/rclone.conf` (`r2-backups` + `r2-images`)
- Docker-Image `postgres:17` auf VPS (`docker pull postgres:17`)

**Workflow:**

```bash
# 1. Lokal auf Mac (in VOD_Auctions Repo-Root)
eval $(op signin)   # TouchID-Bestätigung

# 2. .env.backup deployment script ausführen
./scripts/backup/setup_env_backup_local.sh
```

Das Script:
1. Pullt GPG-Passphrase + 6 Kuma-Heartbeat-URLs + Blackfire-DB-Password aus 1Password (Work + Persönlich)
2. Sanity-Check: alle Werte non-empty
3. Schreibt komplette `.env.backup`-Datei mit allen Credentials (Pro-Quote-Behandlung gegen `&` in URLs)
4. SCP zu VPS: `/root/VOD_Auctions/scripts/backup/.env.backup` mit `chmod 600`
5. Verifikations-Output: zeigt Längen / 60-char-Prefix der ankommenden Werte

**Manueller Smoke-Test nach Setup:**

```bash
# Auf VPS — alle 4 schnellen Backup-Jobs laufen lassen
ssh vps
/root/VOD_Auctions/scripts/backup/backup_supabase.sh vod-auctions
/root/VOD_Auctions/scripts/backup/backup_supabase.sh blackfire
/root/VOD_Auctions/scripts/backup/backup_vps_databases.sh
/root/VOD_Auctions/scripts/backup/backup_brevo.sh
# R2 Image-Mirror (lange — initial 110 GB ~3h, läuft im Background)
/root/VOD_Auctions/scripts/backup/backup_r2_images.sh
```

**Nach erfolgreichem Smoke-Test:**

```bash
# Cron-Jobs einrichten (siehe §3.5 für vollständige Cron-Schedule)
crontab -l > /tmp/crontab.current   # WICHTIG: nicht überschreiben (siehe §9.6 Postmortem)
cat >> /tmp/crontab.current <<'EOF'
0 */2 * * *   /root/VOD_Auctions/scripts/backup/backup_supabase.sh vod-auctions    >> /root/backups/backup.log 2>&1
30 */2 * * *  /root/VOD_Auctions/scripts/backup/backup_r2_images.sh                >> /root/backups/backup.log 2>&1
30 3 * * *    /root/VOD_Auctions/scripts/backup/backup_supabase.sh blackfire       >> /root/backups/backup.log 2>&1
0 3 * * *     /root/VOD_Auctions/scripts/backup/backup_vps_databases.sh            >> /root/backups/backup.log 2>&1
0 4 * * *     /root/VOD_Auctions/scripts/backup/backup_brevo.sh                    >> /root/backups/backup.log 2>&1
EOF
crontab /tmp/crontab.current
```

**Token-Rotation-spezifisch (z.B. bei R2-Token-Roll):**

```bash
# 1. Cloudflare-Dashboard: Token rollen → neue Access Key ID + Secret notieren
# 2. 1Password-Item updaten (z.B. via UI oder `op item edit`)
# 3. Lokal: setup_env_backup_local.sh re-ausführen → deployt .env.backup neu
# 4. Plus rclone.conf auf VPS aktualisieren:
ssh vps "sed -i \"s|^secret_access_key = OLD|secret_access_key = NEW|\" ~/.config/rclone/rclone.conf"
# 5. Smoke-Test ein Backup-Job, der den geänderten Token nutzt
```

**Anti-Pattern (wir hatten alle drei während des Initial-Deploys):**
- `setup_env_backup_local.sh` aus Subagent-Bash-Subshell aufrufen — `op` Session ist Shell-lokal, Subshells erben sie nicht. Daher nur lokal von Robin's Terminal ausführen.
- `.env.backup` auf VPS hand-editieren statt re-deploy — synchronisiert dann nicht mit 1Password. Bei nächstem Token-Roll fällt's auseinander.
- 1Password-Item-Wert ändern, aber Setup-Script nicht re-ausführen — `.env.backup` ist stale.

---

## 6 · Kosten

| Position | Tier-1+2 | Tier-3 (Live) |
|---|---|---|
| **Supabase Pro Plan** Org Seckler (2 Projekte: vod-auctions + blackfire auf Micro) | **$35/Mo** ($25 Pro + 2× $10 Compute − $10 Credits) | $35/Mo |
| R2 Storage DB-Dumps (~5 GB komprimiert) | ~$0.07/Mo | ~$0.07/Mo |
| R2 Storage Image-Mirror (~50–80 GB) | ~$1.20/Mo | ~$1.20/Mo |
| R2 Egress | $0 | $0 |
| Backblaze B2 Zweit-Off-Site | — | ~$1/Mo |
| **Total** | **~$36/Mo** | **~$37/Mo** |

**Eingesparter PITR-Add-on:** −$100/Mo durch Logical Replication als Ersatz = **$1.200/Jahr Ersparnis** ggü. Pro+PITR-Stack.

---

## 7 · Robin's Entscheidungen (bestätigt 2026-04-26)

| # | Entscheidung | Status |
|---|---|---|
| 1 | Pro Plan jetzt aktivieren | ✅ — $35/Mo (2 Projekte, ohne PITR-Add-on) |
| 2 | GPG-Passphrase 1Password anlegen | ✅ — siehe §9.5 |
| 3 | R2 Tokens anlegen (write + read-only) | ✅ — siehe §9.3, §9.4 |
| 4 | R2 Region EEUR | ✅ — siehe §9.2 |
| 5 | Blackfire ist sehr wichtig | ✅ — Tier-1 mit Pro-Plan-Backup + Logical Replication mit eigenem Subscription-Slot |
| 6 | Compliance-Trigger: wir sind verantwortlich vor erstem Produktiv-Vorgang | ✅ — Pre-Activation-Checkliste pro Modul (easybill, Fiskaly, Sendcloud) |
| 7 | Image-Mirror initial sync ~50–80 GB intern bei Cloudflare | ✅ — kein Egress |
| 8 | Architektur: **Pro Plan + Logical Replication parallel** (Belt-and-Suspenders) | ✅ — V4 final |
| 9 | Backend Daten-Export-Modul | ✅ — Konzept-Doku nach Tier-1+2 |

---

## 8 · Backend Daten-Export-Modul (Konzept-Skizze)

**Robins Anforderung:** "Im Backend einen umfangreichen Bereich, um die wichtigsten Daten downloaden/exportieren zu können."

**Detaillierung erfolgt nach Tier-1+2 — hier nur die Skizze für Alignment:**

### 8.1 Position im Admin

Neuer Sidebar-Eintrag oder Sub-Page unter `Operations`:
- **Pfad:** `/app/data-export`
- **Sub-Pages:** Live-Exports / Backup-Browser / Compliance-Reports
- **Permission:** Admin only (kein Frank, falls separater Role gebraucht)

### 8.2 Geplante Funktionen

| Bereich | Inhalt |
|---|---|
| **Live-Export** (on-demand aus Live-DB) | Per-Datentyp Download-Button: Releases, Inventory, Transactions, Bids, Customers (GDPR), Auction-Blocks, Audit-Log, Brevo-Kontakte (Mirror), Sync-History. Format: CSV / Excel / JSON. Time-Range-Filter. Streaming-Download für >10k-Rows |
| **Backup-Browser** | Liste aller R2-Backups (DB-Dumps, Image-Snapshots, Brevo-Exports) mit Download-Link via signierter R2-URL (15 Min Ablauf). Filter nach Datum, Typ, Project. Restore-Runbook-Link pro Backup-Typ |
| **Compliance-Reports** | Quartalsweise auto-generierte ZIP-Pakete: alle Stripe-Payouts (CSV) + PayPal-Transactions (CSV) + ggf. easybill-Datev-Export + Fiskaly-TSE-Export. Read-only Audit-View für Steuerberater-Account (separate Auth) |
| **Bulk-Snapshot** | "Sicher meine Daten jetzt" Button: erzeugt sofort ein Full-Snapshot aller wichtigen Daten als verschlüsseltes ZIP (passphrase per Email an Robin), unabhängig vom Cron |
| **Export-Audit** | Wer hat wann was exportiert (CSV-Downloads, Bulk-Snapshots) — pflicht für GDPR |

### 8.3 Technische Stack-Entscheidung (vorläufig)

- Server-side: neue Routes unter `backend/src/api/admin/data-export/*`
- Streaming via `pg_query` cursor + `csv-stringify` für große Datasets
- Backup-Browser nutzt rclone-API auf VPS oder R2-S3-API direkt
- Signierte URLs via R2 Pre-Signed (15 Min)
- Audit in neuer Tabelle `data_export_log`

### 8.4 Detaillierung

→ Eigenes Konzept-Dokument `docs/architecture/DATA_EXPORT_MODUL.md` **nach** Tier-1+2 ist abgeschlossen. Dann konkrete UI-Skizzen, Route-Liste, Permission-Modell, Performance-Ziele.

---

## 9 · Schritt-für-Schritt-Anleitung für Robin

**Geschätzter Gesamtaufwand für dich: 45–60 Minuten.** Du arbeitest die Punkte 9.1 → 9.10 der Reihe nach ab; nach jedem Punkt steht "Verifizieren". Wenn alle Punkte erledigt: einmal "alles bereit" im Chat, ich übernehme den Rest.

---

### 9.1 — Supabase Pro Plan aktivieren (~5 Min)

**Ziel:** Org `Seckler` von Free auf Pro upgraden, Spend Cap aktiv lassen.

1. Browser öffnen: <https://supabase.com/dashboard/org/druewgffxwafpgtyvtbr/billing>
2. Sicherstellen, dass du als Owner der Org `Seckler` eingeloggt bist (oben rechts Profil-Bild)
3. Klick auf **"Change subscription plan"** (oder "Upgrade")
4. **Pro Plan** auswählen ($25/Monat Subscription)
5. **Spend Cap: ON** lassen (Default — verhindert dass über-Quota-Nutzung billable wird; wir sind weit unter Quota)
6. Falls noch keine Payment-Methode hinterlegt: Kreditkarte hinzufügen
7. Falls Geschäftsadresse: VAT/Tax-ID unter "Billing details" eintragen (für korrekte Rechnung)
8. **Confirm Subscription**
9. **Verifizieren:** auf der Billing-Seite steht jetzt "Pro Plan" + "Next invoice on …"

✅ **Done-Signal:** Chat-Nachricht "Pro aktiv" — ich verifiziere via Supabase MCP

---

### 9.2 — Cloudflare R2 Bucket `vod-backups` anlegen (~3 Min)

**Ziel:** Separater Bucket für alle Backup-Artefakte, getrennt vom existierenden `vod-images`.

1. Browser öffnen: <https://dash.cloudflare.com> → Account auswählen → **R2 Object Storage** in der linken Sidebar
2. Klick **"Create bucket"**
3. Bucket name: **`vod-backups`** (exakt so)
4. Location: **Automatic** auswählen, dann **Location Hint: "European Union (EEUR)"**
   - Falls eine "Default Storage Class"-Auswahl erscheint: **Standard** (nicht "Infrequent Access")
5. Klick **"Create bucket"**
6. **Verifizieren:** Bucket-Liste zeigt jetzt `vod-images` UND `vod-backups`

✅ **Done-Signal:** im Chat OK

---

### 9.3 — R2 API Token A: Write auf `vod-backups` (~5 Min)

**Ziel:** Token mit minimalen Permissions, die der VPS-Backup-Cron nutzt.

1. Im R2-Bereich: links **"Manage R2 API Tokens"** klicken
2. **"Create API Token"**
3. Token Name: **`VOD Backup Writer (vod-backups)`**
4. Permissions: **"Object Read & Write"** (NICHT Admin)
5. **"Specify bucket(s)"** auswählen — und nur `vod-backups` aus der Liste anhaken
6. TTL: **leer lassen** (= no expiry)
7. Optional: "Client IP Address Filtering" → IP `72.62.148.205` (VPS) eintragen für extra Sicherheit
8. **"Create API Token"**
9. **Sofort kopieren** (wird nur einmal gezeigt!):
   - `Access Key ID`
   - `Secret Access Key`
   - `Endpoint` (S3 API URL, sieht aus wie `https://<account>.r2.cloudflarestorage.com`)
10. 1Password öffnen → **Work-Vault** → **"+ New Item" → "API Credential"** (oder "Login")
    - Title: `VOD R2 Backup Token (write)`
    - Felder: Access Key ID, Secret Access Key, Endpoint, Bucket: `vod-backups`, Region: `auto`
    - Speichern

✅ **Done-Signal:** im Chat OK

---

### 9.4 — R2 API Token B: Read-Only auf `vod-images` (~5 Min)

**Ziel:** Token für den Image-Mirror-Sync, der Bilder vom Live-Bucket in den Backup-Bucket kopiert.

1. Wieder bei **"Manage R2 API Tokens"** → **"Create API Token"**
2. Token Name: **`VOD Image Mirror Reader (vod-images)`**
3. Permissions: **"Object Read only"**
4. **"Specify bucket(s)"** → nur `vod-images`
5. TTL leer, IP-Filter optional `72.62.148.205`
6. **"Create API Token"**
7. **Sofort kopieren**: Access Key ID, Secret Access Key, Endpoint
8. 1Password → Work-Vault → neues Item:
    - Title: `VOD R2 Images Token (read-only)`
    - Felder: Access Key ID, Secret Access Key, Endpoint, Bucket: `vod-images`

✅ **Done-Signal:** im Chat OK

---

### 9.5 — GPG-Passphrase generieren und in 1Password ablegen (~2 Min)

**Ziel:** symmetrischer Schlüssel zur Verschlüsselung aller Backup-Dumps. Ohne diese Passphrase sind die Backups nutzlos — auch für uns.

**Du machst (Mac-Terminal):**

```bash
# 1. Generiere 48-char URL-safe Passphrase
PASS=$(openssl rand -base64 36 | tr -d '/+=' | head -c 48)
echo "Passphrase generiert: $PASS"

# 2. Lege im 1Password Work-Vault ab (1Password CLI muss eingeloggt sein: `op signin`)
op item create \
  --category=password \
  --vault=Work \
  --title='VOD Backup GPG Passphrase' \
  password="$PASS"

# 3. Verifizieren
op item get "VOD Backup GPG Passphrase" --vault=Work --fields password
```

Falls `op` nicht eingeloggt: `eval $(op signin)` vorher ausführen.

**Alternative ohne CLI:** im 1Password-App manuell ein Password-Item "VOD Backup GPG Passphrase" im Work-Vault anlegen, Wert mit dem Mac-Built-in-Passwort-Generator (Generate Strong Password) füllen.

✅ **Done-Signal:** im Chat OK — ich pulle dann via `op item get` während des VPS-Setups

---

### 9.6 — Brevo API-Key Permissions verifizieren (~3 Min)

**Ziel:** sicherstellen dass der existierende API-Key Contacts + Templates lesen kann (für Daily-Export).

1. Login: <https://app.brevo.com>
2. Oben rechts auf Profil-Icon → **SMTP & API**
3. Tab **"API Keys"**
4. Den existierenden Key (vermutlich derjenige der schon in `.env` steht) anklicken
5. Berechtigungen prüfen — Brevo unterscheidet zwischen "Old" Keys (full access) und "v3" Keys mit Scopes
   - Falls **"Full Access" / unrestricted**: ✅ alles gut, fertig
   - Falls **restricted**: notiere dir welche Scopes fehlen
6. Falls restricted: **"Generate a new API key"** klicken
   - Name: `VOD Backup Reader`
   - Permissions / Scopes: alle Read-Scopes anhaken (Account, Contacts, Lists, Senders, Templates, Email Campaigns)
   - **NICHT** Write/Send-Scopes geben (Principle of Least Privilege)
   - Generieren, Wert kopieren
7. Falls neuer Key: 1Password Work-Vault → existierendes "Brevo API" Item öffnen → neues Feld `Backup Reader Key` hinzufügen mit dem neuen Key (alten Key NICHT überschreiben — der wird vom Live-System genutzt)

✅ **Done-Signal:** im Chat: "Brevo Key OK" (mit Hinweis ob neuer Key oder existierender ausreicht)

---

### 9.7 — Uptime-Kuma 6 Push-Monitore anlegen (~10 Min)

**Ziel:** Heartbeat-Monitor für jeden Backup-Job — wenn der Cron nicht pingt, schlägt Kuma Alarm.

**Für jeden der 6 Monitore:**

1. Login Uptime-Kuma (URL hast du, vermutlich `https://uptime.thehotshit.de` oder ähnlich)
2. **"+ Add New Monitor"**
3. **Monitor Type: "Push"**
4. Friendly Name: siehe Tabelle unten
5. **Heartbeat Interval:** siehe Tabelle (in Sekunden)
6. **Heartbeat Retries:** 1
7. **Resend Notification:** every 1 retry
8. **Save** → die "Push URL" erscheint (z.B. `https://uptime.thehotshit.de/api/push/XXX?status=up&msg=OK&ping=`)
9. URL kopieren

| Monitor-Name | Interval (Sek) | Bedeutung |
|---|---|---|
| `Backup-vod-auctions-2h` | 8400 | 2h + 20 Min Toleranz |
| `Backup-blackfire-daily` | 90000 | 24h + 1h Toleranz |
| `Backup-vps-daily` | 90000 | 24h + 1h Toleranz |
| `Backup-r2-images-2h` | 8400 | 2h + 20 Min Toleranz |
| `Backup-brevo-daily` | 90000 | 24h + 1h Toleranz |
| `Replication-Lag` | 600 | 10 Min Toleranz für WAL-Lag-Check |

10. Alle 6 URLs in 1Password Work-Vault ablegen:
    - **"+ New Item" → "Secure Note"** oder "API Credential"
    - Title: `VOD Uptime-Kuma Heartbeats`
    - 6 Felder, jeweils Name + URL

✅ **Done-Signal:** im Chat OK

---

### 9.8 — Bestätigung: Volume `blackfire_service_postgres_data` löschen (~30 Sek)

**Ziel:** abandoned Docker-Volume aus Pre-Vercel-Zeit (4 KB, leer) entfernen — kein Datenverlust, da Blackfires Daten in Supabase liegen.

Antworte einfach im Chat: **"Volume löschen ja"** oder **"erstmal lassen"** — ich übernehme den `docker volume rm` falls "ja".

✅ **Done-Signal:** Chat-Antwort

---

### 9.9 — Email-Alert-Empfänger für Backup-Failures festlegen (~1 Min)

**Ziel:** wenn ein Backup-Cron failt (z.B. R2-Upload-Error), bekommst du eine Resend-Email.

Antworte im Chat eine der drei Varianten:

- **"rseckler@gmail.com"** (Default)
- **"alerts@vod-auctions.com"** (separat, Mailbox müsste neu angelegt werden — Aufwand 5 Min via all-inkl)
- **eine andere Adresse**

✅ **Done-Signal:** Chat-Antwort

---

### 9.10 — Schema-Migration-Workflow für Logical Replication (~1 Min Entscheidung)

**Ziel:** wir haben jetzt eine VPS-Postgres-Replica. Bei jeder zukünftigen `apply_migration` auf Supabase muss dieselbe DDL auch auf der Replica laufen, sonst bricht Replication beim ersten Write auf eine "noch nicht existente" Spalte.

Wähle eine Strategie:

- **(a) Auto-Forwarding-Cron** — Schema-Diff-Skript läuft täglich 02:00, syncht DDL-Änderungen automatisch von Supabase → Replica. **Nachteil:** bis zu 24h-Drift möglich; bei Migration die unmittelbar Daten ändert kann's zu Replication-Pause kommen.
- **(b) Manueller Workflow-Schritt** — wir dokumentieren in CLAUDE.md, dass jede `apply_migration` nach Supabase **innerhalb der gleichen Session** auch via `psql -h vps -p 5433` auf Replica laufen muss. **Vorteil:** Conflict-frei, sofortiger Sync. **Nachteil:** 1 zusätzlicher Befehl pro Migration.

**Meine Empfehlung:** (b) — du machst eh fast alle Migrations selbst oder mit mir, der zusätzliche Schritt ist trivial. Ich packe einen Wrapper-Script `scripts/apply_migration.sh` der beides parallel macht.

Antworte im Chat: **"a"** oder **"b"**

✅ **Done-Signal:** Chat-Antwort

---

## 9 · Übersicht Zeitplan

```
DU (Robin)                                 CLAUDE
─────────                                  ──────
9.1  Pro Plan aktivieren           5 Min   ─►  parallel: Backup-Scripts schreiben
9.2  R2 Bucket anlegen             3 Min        Restore-Runbook-Skelett
9.3  R2 Token A                    5 Min        postgres:17 Image pullen
9.4  R2 Token B                    5 Min        rclone install
9.5  GPG Passphrase                2 Min        VPS PG17 für Replica vorbereiten
9.6  Brevo API Key                 3 Min
9.7  Uptime-Kuma 6 Monitore       10 Min
9.8  Volume-Löschung Bestätigung   1 Min
9.9  Email-Alert-Adresse           1 Min
9.10 Migration-Strategie           1 Min
                                  ──────
                              ~36 Min DU

Du sagst "alles bereit" ───►  CLAUDE startet Tier-1-Implementation:
                              4–6h: Scripts deployen, Cron einrichten,
                                    R2-Lifecycle, erster Backup-Lauf,
                                    Restore-Test gemeinsam
                              ───►
                              7–10h: Tier-2 inkl. Logical Replication,
                                    Brevo, SQLite, Redis, n8n, InfluxDB
                              ───►
                              Erst dann: Daten-Export-Modul-Konzept (§8)
```

---

## 9.5 · Tier-1 LIVE-Status (Stand 2026-04-26 ~10:00 UTC)

### Was ist live

**6 Backup-Cronjobs aktiv** (`crontab -l` auf VPS):

| Job | Cadence | Letzter erfolgreicher Run | Output-Größe (komprimiert+GPG) |
|---|---|---|---|
| `backup_supabase.sh vod-auctions` | alle 2h | 2026-04-26 09:56 UTC | 110.8 MB |
| `backup_supabase.sh blackfire` | täglich 03:30 UTC | 2026-04-26 09:56 UTC | 8.4 MB |
| `backup_vps_databases.sh` | täglich 03:00 UTC | 2026-04-26 09:58 UTC | 42.3 MB total |
| `backup_brevo.sh` | täglich 04:00 UTC | 2026-04-26 09:57 UTC | 90 KB (3.602 contacts) |
| `backup_r2_images.sh` | alle 2h | 2026-04-26 09:57 UTC (initial sync läuft) | ~110 GB Mirror |

**3 R2-Lifecycle-Rules aktiv**:
- `daily/` → 7 Tage
- `weekly/` → 30 Tage
- `monthly/` → 180 Tage
- `images-mirror/` → permanent (keine Rule)

**5 Uptime-Kuma-Heartbeat-Monitore initial-grün**:
- Backup-vod-auctions-2h, Backup-blackfire-daily, Backup-vps-daily, Backup-r2-images-2h, Backup-brevo-daily

**Resend-Email-Alerts aktiv** — bei Cron-Failure landet eine Email an `rseckler@gmail.com` mit Job-Name + Exit-Code + Hint zum Log.

**Restore-Test bestanden** (2026-04-26 12:02 UTC):
- vod-auctions Dump (110 MB GPG → 117 MB decrypted → 598 MB Postgres)
- 22 Sekunden Restore in scratch postgres:17 Container
- Counts validiert: Releases 52.788, Inventory 13.439, Transactions 18, Bids 53, Blocks 5, Audit 85, Artists 64.286, Labels 9.106

### Was noch fehlt (Tier-2)

- Logical Replication zu eigenem Postgres 17 auf VPS (Hot-Standby + Sub-Sekunden RPO)
- n8n_data Docker-Volume tar-Backup (5-Min-Downtime im 03:00-Window)
- InfluxDB Backup (Stromportal Mac mini → SCP → R2)
- Stripe + PayPal Quartals-CSV-Export für StB
- Erster Restore-Drill institutionalisieren (Quartal)

### Implementierungs-Details

**Scripts** in `/root/VOD_Auctions/scripts/backup/` (mirror lokal in `scripts/backup/`):
- `_backup_common.sh` — gemeinsame Library: GPG-encrypt, R2-Push (Path-Lifecycle), Kuma-Heartbeat (GET mit Query-Params), Resend-Failure-Email, Local-Retention-Cleanup
- `backup_supabase.sh <project>` — vod-auctions / blackfire via Docker postgres:17 + Direct-Connection
- `backup_vps_databases.sh` — sudo PG-dump, mysqldump, sqlite3 .backup, redis BGSAVE
- `backup_r2_images.sh` — rclone sync R2-zu-R2 (kein Egress, intern bei Cloudflare)
- `backup_brevo.sh` — Brevo API Export (contacts paginiert + lists + templates + senders + account)
- `setup_env_backup_local.sh` — Helper: pullt Credentials aus 1Password Work-Vault auf Robin's Mac via `op`, deployed `.env.backup` zu VPS

**Verschlüsselung:** GPG symmetric AES256, Passphrase aus 1Password "VOD Backup GPG Passphrase" (Work). 46 Zeichen base64.

**Retention:** `/root/backups/` lokal 3 Tage (per `find -mtime +3`), R2 per Lifecycle-Rules.

**Path-basierte R2-Struktur** (Lifecycle-Tag wird als Pfad-Komponente kodiert weil Cloudflare R2 keine Object-Tags-API unterstützt):
```
r2://vod-backups/
├── daily/db/<project>/<UTC-timestamp>.dump.gpg     ← 7 Tage
├── weekly/db/<project>/<UTC-timestamp>.dump.gpg    ← 30 Tage (Sonntags)
├── monthly/db/<project>/<UTC-timestamp>.dump.gpg   ← 180 Tage (1. des Monats)
├── images-mirror/                                  ← permanent
└── logs/r2-mirror/                                 ← rclone-sync-logs
```

**Fixe vs. ursprünglicher V4-Plan:**
1. R2 unterstützt nicht `x-amz-tagging` Header (501 Not Implemented) → Switch zu Path-basierten Lifecycle-Rules
2. R2 Object Read & Write Permission **inkludiert NICHT** ListBuckets — `rclone` macht aber default einen `GET /` als Bucket-Check → 403. Fix: `no_check_bucket = true` im rclone-config
3. Cloudflare hat zwei Token-Systeme — User API Tokens (`cfat_` Prefix, für Cloudflare-Management-API) ≠ R2 Account API Tokens (für S3-API). Nur letztere funktionieren mit AWS-Sigv4
4. `op` CLI Sessions sind shell-lokal — Background-Bash-Subshells erben sie nicht. Setup via lokales Helper-Script auf Mac, nicht direkter Pull aus Subagent
5. Bash-Env-Files: URLs mit `&` müssen in einfache Quotes — sonst wird Background-Job-Separator getriggert
6. Kuma Push-Heartbeat braucht GET mit Query-Params (`curl --get --data-urlencode`), nicht POST — sonst silent 200 ohne Heartbeat-Update

---

## 9.6 · Postmortem: Crontab-Overwrite (2026-04-25 ~20:00 UTC)

**Während des Backup-Setups aufgefallen.** Vermutlich nicht kausal mit Backup-Arbeit, sondern älterer Vorfall.

### Symptom

`crontab -l` (root) auf VPS zeigte am 2026-04-26 nur einen einzigen Eintrag:
```
0 9 * * * cd /root/VOD_Auctions/scripts && venv/bin/python3 cutover_reminder.py >> cutover_reminder.log 2>&1
```

In CLAUDE.md sind aber 7 Cronjobs dokumentiert. Log-Dateien aller anderen Jobs (`legacy_sync.log`, `meilisearch_sync.log`, `discogs_daily.log`, `meili_dumps.log`, `meilisearch_drift.log`) hatten letzte Einträge alle zwischen **2026-04-25 20:01–20:44 UTC**.

### Impact (begrenzt)

- **legacy_sync_v2.py** lief 16h nicht → Excel-Edits aus tape-mag wurden nicht in Supabase repliziert.
  - Tatsächlicher Impact NULL: manueller Re-Run am 2026-04-26 12:31 UTC zeigte `rows_changed: 0, rows_inserted: 0` (Frank hatte zwischen 25.04. 20:01 und 26.04. 12:31 nichts in Excel ediert oder Änderungen waren idempotent)
- **meilisearch_sync.py** lief 16h nicht → Meili-Index war 16h hinter Postgres
  - Tatsächlicher Impact: 104 Delta-Candidates beim ersten Re-Run (manuell am 2026-04-26 12:31 UTC), 9.5s Pushed. Storefront-Suche hätte 16h fehlerhafte Treffer für die letzten 104 Stammdaten-Edits gezeigt.
- **discogs_daily_sync.py** läuft Mo-Fr 02:00 — der 2026-04-25-Run um 02:00 UTC lief noch (steht im Log), der 2026-04-26-Sa-Run war ohnehin geskippt
- **meili_dumps + retention** — Meili-Snapshot vom 2026-04-26 03:00 fehlt, kein Drama bei wöchentlicher Sicht
- **meilisearch_drift_check** — keine 30-min-Drift-Reports für 16h, aber andere Monitore kompensieren

### Root Cause (vermutet)

Klassischer Cron-Update-Fehler: `crontab` mit `<` redirect statt `crontab -l > tmp; echo new >> tmp; crontab tmp`.
**Timing passt:** rc51.7 wurde am 2026-04-25 released, der `cutover_reminder.py`-Cron wurde im Rahmen dieses Releases neu hinzugefügt. Die Vermutung: bei der Cron-Aktualisierung wurde `echo "..." | crontab -` statt einer Append-Operation genutzt.

### Fix (2026-04-26 ~12:32 UTC)

1. Defensive: aktuelle (kaputte) crontab gesichert nach `/root/crontab.backup.20260426_103154.before-restore.txt`
2. Manueller Test `legacy_sync_v2.py` → 58.7s, validation_status=ok, alle Tabellen reachable ✅
3. Append der 6 fehlenden Crons zur existierenden crontab (cutover_reminder bleibt drin):
   ```cron
   0 * * * * cd /root/VOD_Auctions/scripts && venv/bin/python3 legacy_sync_v2.py >> ...
   0 2 * * 1-5 cd /root/VOD_Auctions/scripts && venv/bin/python3 discogs_daily_sync.py >> ...
   */5 * * * * . meili-cron-env.sh && venv/bin/python3 meilisearch_sync.py >> ...
   */30 * * * * . meili-cron-env.sh && venv/bin/python3 meilisearch_drift_check.py >> ...
   0 3 * * * . meili-cron-env.sh && curl ... /dumps
   0 4 * * * find /root/meilisearch/dumps -mtime +7 -delete
   ```
4. Smoke-Test `meilisearch_sync.py` → 104 deltas pushed in 9.5s ✅

**Aktuelle crontab: 12 aktive Einträge** (6 Sync + 6 Backup).

### Wiederholungs-Vermeidung

**Goldene Regel:** Crontab nur via `crontab -l > /tmp/crontab.current && echo "NEW" >> /tmp/crontab.current && crontab /tmp/crontab.current` modifizieren. **Niemals** `echo "X" | crontab -` ohne expliziten `crontab -l > tmp;`-Schritt davor.

**Detection:** ein Dead-Man-Switch-Check für `legacy_sync_v2` ist im TODO (System-Health P3-Followup) — würde so einen Vorfall in <2h via Resend-Email entdecken.

---

## 10 · Nicht-Ziele

- Continuous Replication (Multi-Master) — Pro PITR reicht
- RPO=0 — <1 Min via PITR ist genug
- Backup für regenerierbare Caches (Meili, Upstash, Sentry)
- Stripe/PayPal-Daten-Backup (Provider ist Source-of-Truth, nur Compliance-CSV)
- Zweiter Off-Site-Provider in Tier-1+2 (erst Tier-3 ab Live)

---

**Status:** Wartet auf Robin's Aktion §9.1–§9.8.
