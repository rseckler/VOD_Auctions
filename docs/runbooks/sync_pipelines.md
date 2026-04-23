# Runbook: Sync Pipelines

**Priorität:** P-2 (Customer-Impact bei langfristigem Stall)
**Letztes Update:** 2026-04-23

## Symptome

- System Health: `sync_log_freshness` `error` (Sync-Cron > 3h nicht gelaufen)
- Frank meldet "neue Excel-Daten sind nicht im Catalog"
- `meili_backlog` steigt über 1000 Rows

## Diagnose

```bash
# 1. Cron-Status
ssh vps "crontab -l | grep -E 'legacy_sync|discogs_daily|meilisearch_sync'"

# 2. Letzte Sync-Logs
ssh vps "tail -20 /root/VOD_Auctions/scripts/legacy_sync.log"
ssh vps "tail -20 /root/VOD_Auctions/scripts/discogs_daily.log"
ssh vps "tail -20 /root/VOD_Auctions/scripts/meilisearch_sync.log"

# 3. Letzter sync_log-DB-Entry
ssh vps "grep DATABASE_URL /root/VOD_Auctions/backend/.env"  # Session-Pooler URL
# via Supabase-MCP:
# SELECT * FROM sync_log WHERE phase IS NOT NULL ORDER BY ended_at DESC LIMIT 5;
```

## Bekannte Fixes

### A: legacy_sync hängt
```bash
ssh vps "ps aux | grep legacy_sync_v2 | grep -v grep"  # läuft einer?
ssh vps "kill -9 <PID>"  # falls hängend
# Manuell starten:
ssh vps "cd /root/VOD_Auctions/scripts && source venv/bin/activate && python3 legacy_sync_v2.py"
```

### B: discogs_daily_sync failed (Rate-Limit)
Memory: "Discogs ~60 req/min". Exponential Backoff schon drin.
```bash
ssh vps "tail -50 /root/VOD_Auctions/scripts/discogs_daily.log | grep -i 'rate\|429\|error' | head -10"
# Bei persistierendem Rate-Limit: am Folgetag nochmal, nicht erzwingen
```

### C: meilisearch_sync skipped Pushes
Hash-Diff detection hält potentially richtige Updates zurück.
```bash
ssh vps ". /root/VOD_Auctions/scripts/meili-cron-env.sh && cd /root/VOD_Auctions/scripts && venv/bin/python3 meilisearch_sync.py --dry-run"
# Zeigt was gepusht würde
# Forced full-rebuild: venv/bin/python3 meilisearch_sync.py --full-rebuild
```

## Eskalation

- sync_log_freshness > 6h error → Blackfire-Mindshare (kein direct user-impact, aber Daten veraltet)
- meili_backlog > 5000 → Vollständiger rebuild nötig (~4 min)

## Verwandte Incidents

- rc24 Discogs-Import-Races (gefixed rc25/rc26)
- rc33 Search-Trigram-Indexes verbessern Sync-Query-Speed
