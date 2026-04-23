# Runbook: VPS / API Server (Hostinger)

**Priorität:** P-1 (Launch-Blocker)
**Letztes Update:** 2026-04-23

## Symptome

- System Health: `vps` zeigt `critical`, oder mehrere Services gleichzeitig `error`/`critical`
- `api.vod-auctions.com/health` timeout oder 5xx
- SSH nicht erreichbar (zur Diagnose: Web-Console über Hostinger-Panel)

## Diagnose (Copy-Paste)

```bash
# 1. API-Health
curl -sS -o /dev/null -w '%{http_code} (%{time_total}s)\n' https://api.vod-auctions.com/health

# 2. SSH + basic vitals (falls möglich)
ssh vps "uptime && df -h / && free -h | head -2"

# 3. PM2 full list
ssh vps "pm2 list"

# 4. Log für laufendes Failure-Pattern
ssh vps "journalctl -u nginx --no-pager -n 30"
ssh vps "dmesg | tail -30"  # OOM, Hardware-Probleme
```

## Bekannte Fixes

### A: Disk Full (System Health: disk_space critical)
```bash
# Candidates für Cleanup:
ssh vps "du -sh /var/log /root/.pm2/logs /tmp 2>/dev/null | sort -h"
ssh vps "du -sh /root/VOD_Auctions/* 2>/dev/null | sort -h"
ssh vps "du -sh /root/VOD_Auctions/scripts/*.log /root/VOD_Auctions/backend/*.log 2>/dev/null"

# Häufigster Täter: pm2-Logs
ssh vps "pm2 flush"

# Docker (Meili-Volumes)
ssh vps "docker system df && docker system prune -a --volumes"  # VORSICHT: löscht auch ungenutzte Meili-Dumps
```

### B: Memory-Exhaustion (OOM-Killer aktiv)
```bash
ssh vps "free -h && ps aux --sort=-%mem | head -10"
ssh vps "dmesg | grep -i 'out of memory\|oom-killer' | tail -5"

# Akut-Fix: Einzelnen hog-Prozess restart
ssh vps "pm2 restart <name>"
```

### C: SSH-Rate-Limit (Hostinger blockiert nach 2-3 schnellen Connects)
Siehe CLAUDE.md "SSH Rate-Limiting": ControlMaster in ~/.ssh/config muss gesetzt sein. Falls IP lokal gesperrt: 10-15 min warten. HTTPS/Ping funktionieren weiter.

### D: Nginx down
```bash
ssh vps "systemctl status nginx --no-pager"
ssh vps "nginx -t && systemctl restart nginx"
```

### E: SSL-Cert abgelaufen (ssl_expiry check critical)
Certbot sollte auto-renewen.
```bash
ssh vps "certbot certificates"
ssh vps "certbot renew --dry-run"  # Check + Fix
ssh vps "certbot renew && systemctl reload nginx"
```

## Eskalation

- SSH komplett aus → Hostinger-Panel https://hpanel.hostinger.com → VPS → Emergency-Console
- Hardware-Fehler (dmesg zeigt) → Hostinger-Support-Ticket
- > 15 min Full-Outage → Public Status Page zeigt automatisch (mehrere Service-Checks werden `critical`)

## Verwandte Incidents

- rc40.2: Nicht VPS-seitig, aber Storefront-Crash 43k Restarts → Disk-Space-Check würde das jetzt früher detecten
- Keine echten Hostinger-Outages im letzten Halbjahr
