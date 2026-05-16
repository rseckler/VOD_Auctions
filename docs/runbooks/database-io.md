# Runbook: Database I/O Health

**Priorität:** P-2 (Performance-Degradation, kein Totalausfall)
**Letztes Update:** 2026-05-16
**Probe:** `database_io` (System Health → Infrastructure)

## Symptome

- System Health: `database_io` zeigt `warning` oder `error`
- Supabase-Mail „Your project is depleting its Disk IO Budget"
- Response-Zeiten steigen, CPU hoch durch IO-Wait

Die Probe prüft zwei Dinge:
1. **Invalide Indizes** — `pg_index.indisvalid = false`
2. **Cache-Hit-Ratio** — `pg_stat_database`, kumulativ seit `stats_reset`

## Fall A — `N invalid index(es)`

Ein fehlgeschlagener `CREATE INDEX CONCURRENTLY` hinterlässt eine `indisvalid=false`-Index-Hülle (oft 0 Bytes). Der Planner ignoriert sie **lautlos** → betroffene Queries fallen auf Seq Scans zurück. Genau dieser Vorfall war rc60.2 (`idx_crm_imap_message_msgid_unique`).

### Diagnose (Supabase MCP `execute_sql` oder SQL Editor)

```sql
-- Welche Indizes sind invalid?
SELECT indexrelid::regclass AS idx, indrelid::regclass AS tbl,
       pg_get_indexdef(indexrelid) AS def
FROM pg_index WHERE NOT indisvalid;
```

### Fix

```sql
-- 1. Bei UNIQUE-Indizes vorab prüfen, dass keine Duplikate existieren
--    (sonst schlägt der Rebuild fehl). Spalte/Predikat aus pg_get_indexdef.
SELECT <col>, COUNT(*) FROM <tbl> WHERE <col> IS NOT NULL
GROUP BY <col> HAVING COUNT(*) > 1;

-- 2. Invaliden Index droppen (harmlos — er tut ohnehin nichts)
DROP INDEX <idx>;

-- 3. Sauber neu bauen. CONCURRENTLY = keine Write-Locks; MUSS außerhalb
--    einer Transaktion laufen (Supabase MCP: execute_sql, NICHT apply_migration).
CREATE [UNIQUE] INDEX CONCURRENTLY <idx> ON <tbl> (<col>) [WHERE <predicate>];

-- 4. Verifizieren
SELECT indisvalid, indisready FROM pg_index
WHERE indexrelid = '<idx>'::regclass;
```

Schlägt der `CONCURRENTLY`-Build erneut fehl, bleibt wieder eine invalide Hülle zurück — vor dem Retry erst die alte droppen.

## Fall B — niedrige Cache-Hit-Ratio

`warning` 90–95 %, `error` < 90 %. Heißt: Postgres liest viel von Disk statt aus dem Shared-Buffer-Cache → Disk IO Budget wird verbraucht.

### Diagnose — die teuersten Queries finden

```sql
SELECT calls, shared_blks_read, shared_blks_hit,
       round(100.0*shared_blks_hit/nullif(shared_blks_hit+shared_blks_read,0),1) AS hit_pct,
       left(regexp_replace(query,'\s+',' ','g'),120) AS query
FROM pg_stat_statements
ORDER BY shared_blks_read DESC LIMIT 20;
```

Top-Verbraucher mit niedrigem `hit_pct` per `EXPLAIN (ANALYZE, BUFFERS)` prüfen:
- **Seq Scan** wo ein Index existieren sollte → fehlender/invalider Index (siehe Fall A), oder Query-Pattern, das den Index nicht trifft (z. B. `OR` über JOINed-Tabellen, ILIKE statt FTS).
- Aggregat-Query, die bei jedem Request neu rechnet → cachen (vgl. Mail-Import-Dashboard rc60.2).

### Hinweis zur Trägheit

Die Ratio ist **kumulativ seit `stats_reset`** (`SELECT stats_reset FROM pg_stat_statements_info`). Ein akuter Spike wird verzögert sichtbar. Bei Verdacht trotz „ok"-Probe direkt `pg_stat_statements` nach `shared_blks_read` sortieren.

## Eskalation

- Kein DB-seitiger Fix möglich + anhaltend → Compute-Add-on-Upgrade in der Supabase-Konsole erwägen.
- Supabase High-Disk-IO-Guide: https://supabase.com/docs/guides/platform/exhaust-disk-io

## Verwandte Incidents

- **rc60.2** (2026-05-16) — invalider `idx_crm_imap_message_msgid_unique` → Mail-Import-Dedup-Seq-Scan; Mail-Import-Dashboard cachte Full-Table-Aggregate nicht. Diese Probe entstand als Reaktion darauf.
- **rc52.6.5** (2026-05-01) — Disk-IO-Sweep: Cron-Cadence + Meili-Sync-Drift-Bug.
