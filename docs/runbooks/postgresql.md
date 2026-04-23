# Runbook: PostgreSQL / Supabase

**Priorität:** P-1 (Launch-Blocker)
**Letztes Update:** 2026-04-23

## Symptome

- System Health: `postgresql` zeigt `critical` oder `error`
- Admin-UI lädt gar nicht / 500er überall
- Storefront `/catalog` zurück mit 500
- Sentry-Alerts mit `health-check:postgresql:critical` Fingerprint

## Diagnose (Copy-Paste)

```bash
# 1. Ist Supabase erreichbar?
curl -sS -o /dev/null -w '%{http_code}\n' https://bofblwqieuvmqybzxapx.supabase.co/rest/v1/

# 2. Pool-Status auf VPS (SELECT 1)
ssh vps "cd /root/VOD_Auctions/backend && source .env && PGPASSWORD=\$(echo \$DATABASE_URL | grep -oP '(?<=:)[^@]+(?=@)') psql \"\$DATABASE_URL\" -c 'SELECT 1'"

# 3. Supabase-Status-Page
open https://status.supabase.com
```

## Bekannte Fixes

### A: Supabase-seitiger Ausfall
Nichts zu tun außer abwarten. Monitor https://status.supabase.com. Falls > 30 min: User informieren via Public Status Page (Flag ist auf — zeigt "Platform: outage" automatisch).

### B: Connection-Pool erschöpft
```bash
ssh vps "pm2 restart vodauction-backend"
# Symptom: "too many connections for role"
# Fix: Backend restart schließt alle Verbindungen; Supabase-Dashboard Pool-Grenze prüfen (Transaction Pooler: 200 connections)
```

### C: DATABASE_URL in .env falsch
```bash
ssh vps "grep DATABASE_URL /root/VOD_Auctions/backend/.env"
# Muss Session-Pooler sein: aws-0-<region>.pooler.supabase.com:5432 mit user postgres.<ref>
# Transaction-Pooler (Port 6543) für Medusa OK, aber pg_dump braucht 5432
```

## Eskalation

- `critical` > 5 min → Supabase Support ticket (https://supabase.com/dashboard/support)
- Paralleler Storefront-Ausfall → Public Status Page prüfen dass User informiert sind
- Bei mutmaßlicher Supabase-Side-Outage → Twitter @supabase + status-page

## Verwandte Incidents

- rc26: Connection-Pool-Exhaustion durch Discogs-Import-Bug, seit Session-Locks fixed
