# Runbook — Re-Sync vod_auctions_replica nach Slot-Tod

**Wann nutzen:** Wenn der Replication-Slot `vod_auctions_replication_slot` auf Supabase invalidiert wurde (`invalidation_reason: wal_removed`) und die Replica seitdem out-of-sync ist. Erstmals dokumentiert nach Slot-Tod 2026-05-07.

**Linear:** [RSE-323](https://linear.app/rseckler/issue/RSE-323) (oder Folge-Issues)
**Erwartete Dauer:** 1-2h (~1.6 GB Initial-Sync via Internet)
**Maintenance-Window:** keine App-Downtime — Replica ist read-only Cache, App nutzt Source-DB

---

## Vorab-Checks

```bash
# 1. Replica-Container läuft?
ssh vps 'docker ps --filter name=pg17-replica'

# 2. Source-Slot-State (sollte 0 rows zeigen — Slot ist gedropped)
# (via Supabase MCP oder psql gegen Source)
SELECT slot_name, active, invalidation_reason FROM pg_replication_slots
WHERE slot_name = 'vod_auctions_replication_slot';

# 3. Replica-Subscription-State (soll subenabled=false zeigen)
ssh vps 'docker exec -u postgres pg17-replica psql -d vod_auctions_replica -c \
  "SELECT subname, subenabled, subslotname FROM pg_subscription;"'

# 4. Schema-Drift seit Slot-Tod prüfen — gab es Migrations auf Source?
# (Manueller Check in den letzten Commit-Logs + apply_migration-History)
```

Falls Schema-Drift: vor Re-Sync alle DDLs manuell auf Replica nachspielen
(`docker exec -u postgres pg17-replica psql -d vod_auctions_replica -c "<DDL>"`).

---

## Schritt 1 — Replica vorbereiten

```bash
ssh vps
docker exec -u postgres pg17-replica psql -d vod_auctions_replica
```

```sql
-- 1.1) Old subscription cleanup
DROP SUBSCRIPTION IF EXISTS vod_auctions_sub;

-- 1.2) Bestehende replizierte Tabellen leeren OHNE Drop (Schema bleibt).
-- Sicherer als DROP weil App-seitige Foreign Keys + Constraints intakt
-- bleiben. Reihenfolge ggf. anpassen falls FK-Probleme; CASCADE notfalls.
TRUNCATE
  "Release", "Artist", "Label", "Image", "Tag", "Comment", "Rating",
  "ReleaseArtist",
  auction_blocks, block_items, transaction, bid_ending_reminder,
  customer, account_holder,
  email_log, import_log, release_audit_log,
  pages, content_block, shop_categories, countries, labels, label_persons
  -- + alle weiteren in der publication enthaltenen Tabellen
RESTART IDENTITY CASCADE;

-- 1.3) Verify: alle Tabellen leer
SELECT relname, n_live_tup FROM pg_stat_user_tables
WHERE schemaname = 'public' ORDER BY n_live_tup DESC LIMIT 20;
```

**Alternative:** komplettes Drop+Recreate der Replica-DB. Brachialer aber definitiv clean:

```sql
-- Auf pg17-replica, NOT in vod_auctions_replica
\c postgres
DROP DATABASE vod_auctions_replica;
CREATE DATABASE vod_auctions_replica;
\c vod_auctions_replica
-- Schema neu pullen aus Source via pg_dump --schema-only
```

---

## Schritt 2 — Subscription neu erstellen

```sql
-- Source-URL aus 1Password Vault Work, Item "Supabase VOD Auctions"
-- (oder aus /root/.env.backup als SUPABASE_VOD_AUCTIONS_URL)
\c vod_auctions_replica

CREATE SUBSCRIPTION vod_auctions_sub
CONNECTION 'postgres://postgres.bofblwqieuvmqybzxapx:PASS@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
PUBLICATION vod_auctions_pub
WITH (
  copy_data = true,         -- Initial bulk copy aller Tables
  create_slot = true,       -- Neuer Slot auf Source
  slot_name = 'vod_auctions_replication_slot',
  enabled = true,
  streaming = on
);
```

**Was passiert:**
- Replica startet einen Walker-Worker
- Source erstellt neuen Replication-Slot
- Initial bulk copy ~1.6 GB durch (~30-60 Min)
- Danach: Live-Streaming der WAL-Changes seit Slot-Erstellung

---

## Schritt 3 — Initial-Sync überwachen

```bash
# Live-Tail Replica-Logs
ssh vps 'docker logs -f pg17-replica 2>&1 | grep -E "subscription|sync|copy"'

# Progress in pg_stat_subscription_stats / pg_subscription_rel
docker exec -u postgres pg17-replica psql -d vod_auctions_replica -c "
  SELECT srsubid::regclass::text AS subscription, srrelid::regclass::text AS rel, srsubstate
  FROM pg_subscription_rel
  WHERE srsubstate <> 'r'  -- alles was nicht 'ready' ist
  LIMIT 20;
"
# srsubstate-Werte: 'i'=initialize, 'd'=copy, 's'=synced, 'r'=ready
# Wenn alle Rows 'r' sind → Initial-Sync durch
```

---

## Schritt 4 — Verify nach Sync

```sql
-- Lag-Check (sollte sub-Sekunden sein)
SELECT subname,
       EXTRACT(EPOCH FROM (now() - latest_end_time))::int AS lag_s
FROM pg_stat_subscription;

-- Counts pro Tabelle (Source vs Replica) — sollten matchen
-- (Run separat auf Source via Supabase MCP)
SELECT relname, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC LIMIT 20;
```

Source-Counts via Supabase MCP holen, manuell vergleichen.

---

## Schritt 5 — WAL-Lag-Health-Monitor + Backup-Pipeline

```bash
# Health-Monitor sollte selbst grün werden, aber sanity-check
ssh vps 'tail -10 /root/replication_health_check.log 2>/dev/null'

# Backup-Pipeline: nächster Tick (alle 2h) sollte wieder Replica nutzen
ssh vps 'tail -5 /root/backups/backup.log | grep vod-auctions'
# Erwartet: "backup source: replica (lag=Xs)" mit X < 300
```

---

## Rollback / Stop

Falls Initial-Sync hängt oder failed:

```sql
-- Source: dropt slot wieder
\c postgres  -- als superuser auf Source
SELECT pg_drop_replication_slot('vod_auctions_replication_slot');

-- Replica: dropt subscription
DROP SUBSCRIPTION vod_auctions_sub;
```

Backup-Pipeline läuft über Supabase-Direct weiter (Hotfix vom 2026-05-08), keine Datenverlust-Gefahr.

---

## Schema-Migration-Discipline ab jetzt

**KRITISCH:** bei jeder Supabase-DDL muss die DDL parallel auf Replica laufen — sonst bricht der Walker beim ersten DML auf eine "noch nicht existente" Spalte:

```bash
# Pattern (siehe BACKUP_KONZEPT.md §9.5.5)
mcp__claude_ai_Supabase__apply_migration {migration on Source}
ssh vps 'docker exec -u postgres pg17-replica psql -d vod_auctions_replica -c "<gleiche DDL>"'
```

Memory: `project_logical_replication.md`.
