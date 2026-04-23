# Runbook: Meilisearch

**Priorität:** P-2 (Customer-Impact)
**Letztes Update:** 2026-04-23

## Symptome

- System Health: `meilisearch` `error` oder `meili_drift`/`meili_backlog` warning/error
- Storefront-Suche langsam (6+s) → 3-Gate-Fallback auf Postgres-FTS
- `event=meili_runtime_fallback` in Backend-Error-Log

## Diagnose

```bash
# 1. Container-Status
ssh vps "docker ps --filter name=meili --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# 2. Health-Endpoint
ssh vps '. /root/VOD_Auctions/scripts/meili-cron-env.sh && curl -sS http://127.0.0.1:7700/health'

# 3. Stats
ssh vps '. /root/VOD_Auctions/scripts/meili-cron-env.sh && curl -sS -H "Authorization: Bearer $MEILI_MASTER_KEY" http://127.0.0.1:7700/stats | head -c 500'

# 4. Drift-Log
ssh vps "tail -5 /root/VOD_Auctions/scripts/meilisearch_drift.log"
```

## Bekannte Fixes

### A: Container down
```bash
ssh vps "cd /root/VOD_Auctions && docker compose -f docker-compose.meili.yml up -d"
```

### B: Drift > 2% (critical)
Sync-Cron hängt. Manuell triggern:
```bash
ssh vps '. /root/VOD_Auctions/scripts/meili-cron-env.sh && cd /root/VOD_Auctions/scripts && venv/bin/python3 meilisearch_sync.py'
```

### C: Backlog > 1000 (error)
Trigger-System schreibt search_indexed_at=NULL für alle betroffenen Releases, aber Sync-Cron läuft nicht ab.
```bash
ssh vps "crontab -l | grep meilisearch_sync"  # cron vorhanden?
ssh vps "tail -20 /root/VOD_Auctions/scripts/meilisearch_sync.log"
# Kill-Switch wenn Meili mal komplett broken: /app/config → SEARCH_MEILI_CATALOG OFF → Postgres-FTS live sofort
```

### D: Settings-Error (z.B. rankingRules sort fehlt)
Passed in rc40 — siehe CHANGELOG rc40.2. Fix via PATCH /settings/ranking-rules + Update im Source.

## Eskalation

- Meili down > 30min → Flag SEARCH_MEILI_CATALOG OFF für stabileren Fallback (Postgres-FTS langsamer aber funktional)
- Drift critical (> 2%) → Full-rebuild: `python3 meilisearch_sync.py --full-rebuild` (4 min)

## Verwandte Incidents

- rc40 Initial-Deploy: primaryKey-Bug in PATCH /settings, tasks-API race → seit rc40.1 gefixt
- rc40.2 Morgen: sort-rankingRule fehlte → Live-PATCH direkt
