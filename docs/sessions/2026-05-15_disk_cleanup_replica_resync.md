# Session 2026-05-15 — VPS Disk-Cleanup + RSE-323 Replica Re-Sync

**Auslöser:** Daily Warning Digest E-Mail (08:00) — 2 Warnungen: `disk_space` 89.3% (VPS `/`, 11 GB frei) + `discogs_api` rate-limit 21/60.
**Status:** ✅ Disk-Cleanup done · ✅ RSE-323 done · ⚠️ TeamSpeak-Removal vom Auto-Mode-Classifier geblockt (Robin führt selbst aus)

---

## Teil 1 — Disk-Cleanup (90% → 88%)

VPS-`/` war auf 90% (86/96 GB). Befund + Aktionen:

| Aktion | Effekt |
|---|---|
| A — `discogs_image_migration.log` (280 MB, 24. Apr) gelöscht | 280 MB |
| B — Docker: `blackfire-postgres` (Exited 2 Mon, alte Timescale-DB) Container + leeres Volume + Image entfernt | ~1,5 GB |
| C — 61 leere Backup-Dirs in `/root/backups` entfernt | kosmetisch |
| D — Backup-Retention `LOCAL_RETENTION_DAYS` 3 → 2 | ~6 GB beim nächsten Run |
| E — Cron `backup_supabase.sh vod-auctions` 2h → 4h (`0 */2` → `0 */4`) | ~50% weniger Backup-Volume |

**Bug-Fix (Commit `eb1b69f`):** `_backup_common.sh::local_retention_cleanup` löschte leere Backup-Dirs nie — `find -delete` der Files touched den Parent-mtime auf "now", danach matched `-mtime +N` nie mehr. mtime-Gate aus dem empty-dir-Pass entfernt.

**Discogs-API:** 21/60 remaining = 35% Headroom, kein kritisches Limit — keine Aktion.

**TeamSpeak6:** `teamspeak6-server` Container in Restart-Loop seit Beta-Lizenz expired (`v6.0.0-beta8`, License expired). Robin: komplett entfernen. Auto-Mode-Classifier blockt `docker rm`/`volume rm` (sieht AskUserQuestion-Antwort nicht) → Robin führt manuell aus.

---

## Teil 2 — RSE-323 Tier-2 Replica Re-Sync

**Root Cause (bestätigt):** Slot `vod_auctions_replication_slot` auf Supabase seit 2026-05-07 weg (`wal_removed`), Subscription `vod_auctions_sub` disabled, `subslotname` leer. Replica `vod_auctions_replica` 10 Tage out-of-sync. Health-Log spammte alle 15 Min `subscription is DISABLED`.

**Scope-Entscheidung Robin:** Volle CRM-Parität — Replica soll alle 23 `crm_*`-Tabellen mit aufnehmen. Schließt die in `project_replica_no_crm_tables` dokumentierte DR-Lücke (CRM-Master, €5,27M Revenue, war nur einfach via Supabase-Direct-Backup gesichert).

**Drift-Analyse:** Publication `vod_auctions_pub` (273 Tabellen, `FOR TABLES IN SCHEMA public`) vs. Replica 248. Spalten-Signatur-Vergleich (md5 über `column_name:data_type`) zeigte: 27 fehlende Tabellen (23 `crm_*` + 3 `backup_*_country_pre_iso` + `background_job`) **plus** Spalten-Drift auf bestehenden Tabellen (z.B. `invite_tokens`) — rc54.0 Country-ISO lief nach dem Slot-Tod, wurde nicht auf die Replica gespiegelt. → partielles Nachziehen zu fehleranfällig, **DB-Rebuild** gewählt (Runbook-"Alternative").

**Ausführung:**

1. `DROP SUBSCRIPTION vod_auctions_sub` (slot_name war NONE → kein Source-Kontakt)
2. `DROP DATABASE vod_auctions_replica WITH (FORCE)` + `CREATE DATABASE`
3. Schema-Pull: `pg_dump --schema-only --schema=public --no-owner --no-privileges --no-publications --no-subscriptions` aus Supabase (Direct-Connection, pg17-Client via `docker exec pg17-replica`). 543K, 273 `CREATE TABLE`.
4. Vor Restore: `CREATE EXTENSION pg_trgm` (5 gin_trgm_ops-Indizes) + 3 No-Op-Rollen `anon`/`authenticated`/`service_role` (damit RLS-Policies sauber restoren).
5. Restore via `psql -v ON_ERROR_STOP=0` → 273/273 Tabellen, 13 benigne Fehler (RLS-Policies + 4 FKs gegen Supabase-`auth`-Schema — auf Replica irrelevant).
6. `CREATE SUBSCRIPTION vod_auctions_sub ... WITH (copy_data=true, create_slot=true, slot_name='vod_auctions_replication_slot')` — neuer Slot auf Publisher, Initial-Copy ~2,1 GB.

**Verify:**
- Alle 273 Tabellen `srsubstate='r'`
- Row-Counts Source = Replica exakt (Stichprobe 10 Tabellen): `Release` 52.788, `Artist` 64.286, `crm_imap_message` 407.674, `crm_master_contact` 20.826, `crm_master_email` 12.995, `erp_inventory_item` 16.664
- Replica-DB 1925 MB · Health-Monitor `up` · Backup-Pipeline schaltet bei Lag < 300s automatisch zurück auf Replica-Source

**Findings (für Runbook):**
- Frische DB nach `DROP/CREATE DATABASE` hat keine Extensions — `pg_trgm` muss vor dem Schema-Restore rein
- `pg_dump --schema=public` war frei von `extensions.`-qualifizierten Refs; alle UUID-Defaults nutzen `gen_random_uuid()` (PG17-builtin)
- 3 Supabase-Rollen als No-Op anlegen → sauberer Restore-Log, echte Fehler sichtbar

---

## Memory-Updates

- `project_logical_replication.md` — Stand 2026-05-15, Replica jetzt 273 Tabellen ~1925 MB
- `project_replica_no_crm_tables.md` — invertiert: CRM ist ab 2026-05-15 in der Replica

---

## Offene Items

- **TeamSpeak6-Removal** — Robin führt `docker rm`/`volume rm`/`rmi` manuell aus (Classifier-Block)
- `.env.backup`: `SUPABASE_VOD_AUCTIONS_URL` ist leer — latenter Gap (Subscription-Conninfo ist eingebettet, Runbook referenziert die Var). Bei Gelegenheit befüllen.
