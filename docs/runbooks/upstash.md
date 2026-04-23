# Runbook: Upstash Redis

**Priorität:** P-2 (Customer-Impact — Cache-Layer)
**Letztes Update:** 2026-04-23

## Symptome

- System Health: `upstash` zeigt `error` (oft "fetch failed")
- Storefront-Response-Zeiten steigen (keine Cache-Hits)
- Rate-Limiting (bei Brute-Force-Attack-Prevention) tot

## Diagnose

```bash
# 1. Ping via curl
ssh vps "cd /root/VOD_Auctions/backend && source .env && curl -sS -H \"Authorization: Bearer \$UPSTASH_REDIS_REST_TOKEN\" \"\$UPSTASH_REDIS_REST_URL/ping\""

# 2. Console
open https://console.upstash.com

# 3. Backend-Check ob Env richtig geladen
ssh vps "grep ^UPSTASH /root/VOD_Auctions/backend/.env | head -2"
```

## Bekannte Fixes

### A: "fetch failed" immediate (unter 100ms)
- TLS-Problem oder falsche URL → Env-Vars in `.env` prüfen
- Token rotiert?  Check Upstash-Console → Token regenerieren → update .env → restart

### B: Timeout > 4s
- Upstash-seitiger Outage → Console oder @upstash Twitter
- Oft temporär; Backend nutzt Fallback (in-memory) wo möglich

## Eskalation

- Upstash unreachable > 60min → Redis-dependent Features degraded (nicht blocking). Langzeit-Ausfall: alternative Provider evaluieren (Redis Cloud, Railway-Redis)

## Verwandte Incidents

- 2026-04-23 (rc41-rc42): Erste fetch-failed-Meldungen beim Sampler-Rollout — Ursache zu untersuchen (TLS? rotiertes Token?)
