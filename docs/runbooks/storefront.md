# Runbook: Storefront (vod-auctions.com)

**Priorität:** P-1 (Launch-Blocker)
**Letztes Update:** 2026-04-23

## Symptome

- System Health: `storefront_public` zeigt `critical` oder `error`
- User melden "Seite lädt nicht" / 502 Bad Gateway
- Sentry-Downtime-Alert `VOD-AUCTIONS-STOREFRONT-*`
- Public Status Page: "Platform: outage"

## Diagnose (Copy-Paste)

```bash
# 1. Frontend-Response check
curl -sS -o /dev/null -w 'Public: %{http_code} (%{time_total}s)\n' https://vod-auctions.com
# Erwartet: 307 (Gate-Redirect im beta_test) oder 200 (live)

# 2. Local PM2 + PM2-Restart-Counter
ssh vps "pm2 describe vodauction-storefront | head -25"
# Achte auf: restarts-Count, status, uptime, script path

# 3. Error log
ssh vps "pm2 logs vodauction-storefront --lines 50 --nostream --err"

# 4. Nginx-Status
ssh vps "systemctl status nginx --no-pager | head -15"

# 5. Local :3006 direct
ssh vps "curl -sS -o /dev/null -w 'Local 3006: %{http_code} (%{time_total}s)\n' http://127.0.0.1:3006/"
```

## Bekannte Fixes

### A: PM2 crashed-loop (hohe Restarts, SyntaxError in .bin/next)
**Siehe Memory `feedback_pm2_pnpm_next_bin.md`.** pnpm-shell-wrapper Bug.
```bash
ssh vps "cd /root/VOD_Auctions/storefront && pm2 delete vodauction-storefront && pm2 start ecosystem.config.js && pm2 save"
```

### B: Build-Artifact alt / nach Deploy 502
```bash
ssh vps "cd /root/VOD_Auctions/storefront && npm run build && pm2 restart vodauction-storefront"
```

### C: Storefront läuft, aber 502 trotzdem
→ Nginx-Proxy-Config prüfen. proxy_pass muss auf `http://127.0.0.1:3006/` zeigen.
```bash
ssh vps "cat /etc/nginx/sites-enabled/vod-auctions.com | head -30"
ssh vps "nginx -t"
```

### D: "Already up to date" nach git pull
→ Memory `feedback_deploy_order.md`: vergessen zu pushen vom Mac bevor pull auf VPS.

## Eskalation

- Public Status Page zeigt automatisch "Platform: outage" bei error/critical
- Incident-Window > 15 min → Benachrichtigung via Resend + Slack (bei Flag SYSTEM_HEALTH_ALERTING ON + critical)

## Verwandte Incidents

- **rc40.2 Morgen-Ausfall (2026-04-23 06:06):** PM2 hatte 19 Tage lang `.bin/next` gecacht trotz Config-Fix. 43.037 crashes. Fixed durch `pm2 delete` + `pm2 start ecosystem.config.js`
- rc34: Search-Performance-Issues führten zu hohen Response-Zeiten aber kein Outage
