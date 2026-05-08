# Session 2026-05-08 — Replica Slot Recovery + Mail-Import Re-Enable

**Status:** ✅ Hotfix live, Re-Sync als RSE-323 dokumentiert (Backlog)
**Vorgänger:** [`2026-05-07_mail_import_reset_restart.md`](2026-05-07_mail_import_reset_restart.md)
**Linear:** [RSE-323](https://linear.app/rseckler/issue/RSE-323/tier-2-replica-re-sync-vod-auctions-replica) (Re-Sync Backlog)

---

## TL;DR

Mail-Import-Cron wurde am 2026-05-07 ~Abend mit Hinweis "DB Critical" disabled. Heute morgen Diagnose:

1. **Replication-Slot `vod_auctions_replication_slot` war invalidated** (`wal_removed`) — Postgres hat ihn als Schutz gegen Disk-Overflow geopfert. Akute Krise war beim Disable schon vorbei (WAL freigegeben).
2. **Stille Backup-Corruption gefunden:** Backup-Pipeline meldete `lag=0s` aber lief seit 12h gegen die out-of-sync Replica → 5 Backups (alle 2h) ohne aktuelle Mutations und ohne CRM (Replica enthält kein CRM).
3. **3 destruktive SQLs einzeln freigegeben** + Backup-Pipeline-Hotfix + Recovery-Backup gemacht + Mail-Import-Cron re-enabled mit NUL-Byte-Fix.

---

## Diagnose

### Postgres-Logs (Source)

Massiver Spam:
```
ERROR: can no longer get changes from replication slot "vod_auctions_replication_slot"
```

### Replication-Slot-State

```
slot_name: vod_auctions_replication_slot
active:    false                          ← Replica disconnected
slot_type: logical
wal_lag:   54 GB                           ← in sich kohärent: WAL-Pointer
restart_lsn: NULL                          ← Slot tot
invalidation_reason: wal_removed           ← Postgres hat WAL freigegeben
```

`wal_removed` heißt: Postgres hat `max_slot_wal_keep_size` erreicht und lieber den Slot geopfert als die DB-Disk zu kippen. Der Slot ist auf Source-Seite physisch tot — kein Reconnect mehr möglich.

### Replica-Subscription-State (vor Fix)

```
subname           | subenabled | subslotname
vod_auctions_sub  | t          | vod_auctions_replication_slot   ← zeigt auf den toten Slot
blackfire_sub     | t          | blackfire_replication_slot       ← unbetroffen
```

Replica versuchte alle 5s zu reconnecten und failed mit:
```
ERROR: could not start WAL streaming: ERROR: replication slot "vod_auctions_replication_slot" does not exist
```

### Stille Backup-Corruption

`backup_supabase.sh` Lag-Guard nutzte:
```sql
SELECT COALESCE(EXTRACT(EPOCH FROM (now() - latest_end_time))::int, 0) FROM pg_stat_subscription WHERE subname = '...';
```

Bei disabled subscription ist `latest_end_time` NULL → `COALESCE(NULL, 0) = 0` → Lag-Guard gibt 0s frei → Backup läuft gegen veraltete Replica.

5 Cron-Backups betroffen:
| Datum-Zeit (UTC) | Source | Größe | Status |
|---|---|---:|---|
| 2026-05-07T18:00Z | replica (lag=0s, **falsch**) | 123 MB | corrupted-snapshot |
| 2026-05-07T20:00Z | replica (lag=0s, **falsch**) | 123 MB | corrupted-snapshot |
| 2026-05-07T22:00Z | replica (lag=0s, **falsch**) | 123 MB | corrupted-snapshot |
| 2026-05-08T00:00Z | replica (lag=0s, **falsch**) | 123 MB | corrupted-snapshot |
| 2026-05-08T02:00Z | replica (lag=0s, **falsch**) | 123 MB | corrupted-snapshot |
| **2026-05-08T03:47Z** | **supabase-direct (Recovery)** | **327 MB** | ✅ aktuell + CRM |

Replica enthält kein CRM (Memory `project_replica_no_crm_tables.md`) — die alten Backups waren also auch generell CRM-frei. Der ~204 MB-Sprung kommt aus den CRM-Tabellen.

---

## Aktionen (mit User-Gate pro destruktivem SQL)

### SQL 1/3 — Drop des invalidierten Slots (Source/Supabase)

```sql
SELECT pg_drop_replication_slot('vod_auctions_replication_slot');
```

Effekt: `pg_replication_slots` ist leer auf vod-auctions Source. Source-DB clean.

### SQL 2/3 — Subscription disablen (Replica)

```sql
ALTER SUBSCRIPTION vod_auctions_sub DISABLE;
ALTER SUBSCRIPTION vod_auctions_sub SET (slot_name = NONE);
```

Effekt: `subenabled=false`, slot_name leer, Reconnect-Spam gestoppt. `blackfire_sub` unbetroffen.

### Code-Hotfix `backup_supabase.sh` (Commit `3ab0086`)

CASE-Logik mit explizitem Check für 3 stale-Cases (Subscription existiert nicht / disabled / latest_end_time NULL) → 999999s sentinel → Fallback auf Supabase-Direct sicher.

### Manueller Recovery-Backup

```bash
/root/VOD_Auctions/scripts/backup/backup_supabase.sh vod-auctions
```

Output:
```
Replica-Lag 999999s > 300s — falling back to Supabase Direct
backup source: supabase-direct (replica stale)
pg_dump done, encrypted size: 327.2 MB
DONE size=327.2MB remote=db/vod-auctions/20260508_034703Z.dump.gpg
```

Recovery-Backup hat aktuelle Daten + CRM → erste valide vod-auctions-Backup seit ~12h.

### Mail-Import wieder aktiv

- **NUL-Byte-Fix** (Commit `1f8b059`): `strip_nul()` Helper in `parse_record()` entfernt `\x00` aus Subject/Body/from/to/cc/msg_id. 9 neue Test-Cases (54 total, alle grün). Gestern hatten 2.549 Mails wegen NUL-Bytes errored.
- **Cron re-enabled** (atomic via tempfile + Backup `/tmp/crontab.bak.before-mail-cron-reenable-20260508-054111`): `15,45 * * * *` wrapper-call wieder aktiv. Resume bei Line 206.034 (48.7%).

---

## Aktueller Stand (heute morgen)

| Komponente | Status |
|---|---|
| vod-auctions Source-DB | ✅ clean, kein Slot, kein WAL-Druck |
| pg17-replica `vod_auctions_replica` | ⏸ frozen Read-Only-Snapshot, out-of-sync seit 2026-05-07 |
| pg17-replica `blackfire_replica` | ✅ unbetroffen, läuft normal |
| `backup_supabase.sh` Lag-Guard | ✅ erkennt disabled subscription |
| vod-auctions-Backup-Pipeline | ✅ läuft via Supabase-Direct (Egress steigt) |
| WAL-Lag-Health-Monitor | ⚠️ noch nicht überprüft, sollte aber jetzt CRITICAL melden |
| Mail-Import-Cron | ✅ re-enabled, NUL-Byte-Fix aktiv |
| Replica-Re-Sync | 📋 RSE-323 + Runbook `docs/runbooks/RESYNC_VOD_AUCTIONS_REPLICA.md` |

---

## Open Items / Backlog

1. **Replica-Re-Sync** (RSE-323) — wenn Robin Zeit hat, ~1-2h, kostet 1.6 GB Egress. Runbook fertig.
2. **WAL-Lag-Health-Monitor sanity-check** — analoger Bug in `replication_health_check.sh`? Wenn ja, gleicher CASE-Logic-Fix wie in backup_supabase.sh.
3. **5 corrupted Replica-Snapshots in R2** (2026-05-07T18Z bis 2026-05-08T02Z, je 123 MB) — können behalten werden (Disk-billig in R2) oder gelöscht. Sind nicht aktuell aber auch nicht aktiv schädlich.

---

## Memory-Updates

Neu:
- `feedback_replica_lag_guard_disabled_subscription.md` — silent backup corruption pattern + CASE-Logic-Fix

Update:
- `project_logical_replication.md` — Stand-Update: Replica out-of-sync seit 2026-05-07, Re-Sync = RSE-323

---

## Lessons

1. **Lag-basierte Health-Checks brauchen explizite "stale = sentinel"-Cases.** `COALESCE(NULL, 0)` ist gefährlich für Disk-Health-Probes — muss `999999` oder ähnlich sein, sonst wird "no signal" als "all good" interpretiert.
2. **Backup-Größe als Sanity-Indikator nutzen.** Vier 123-MB-Backups in Folge ohne wesentliche Schwankung sind verdächtig — bei lebender CRM-Pipeline mit täglich ~thousands von Mutations sollten Backups langsam wachsen. Backup-Daily-Diff-Alert wäre hilfreich.
3. **Postgres' `max_slot_wal_keep_size` ist defensiv aber stumm.** Slot-Invalidation passiert ohne Email-Alert — der Service fühlt sich gesund an, nur die Replica meldet danach Reconnect-Errors.
