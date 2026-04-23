# Runbook: Stripe

**Priorität:** P-1 (Launch-Blocker)
**Letztes Update:** 2026-04-23

## Symptome

- System Health: `stripe` zeigt `critical` oder `error`
- Checkout im Storefront scheitert (`createPaymentIntent` failed)
- Sentry: `health-check:stripe:critical` oder Errors aus `/webhooks/stripe`
- `stripe_webhook_freshness` zeigt `error` (> 24h kein Event in live-mode)

## Diagnose (Copy-Paste)

```bash
# 1. Stripe-API direkt
curl -sS -o /dev/null -w '%{http_code}\n' https://api.stripe.com

# 2. Balance-Call mit Key (liefert immediate Signal ob Key valid)
ssh vps "cd /root/VOD_Auctions/backend && grep STRIPE_SECRET_KEY .env | cut -d= -f2 | xargs -I{} curl -sS -u {}: https://api.stripe.com/v1/balance | head -c 300"

# 3. Stripe-Status-Page
open https://status.stripe.com

# 4. Letzte Webhook-Events im Dashboard
open https://dashboard.stripe.com/webhooks
```

## Bekannte Fixes

### A: Stripe-seitiger Ausfall
Abwarten + Status-Page monitorn. Bei > 15 min: Public Status Page zeigt "Checkout: outage" automatisch.

### B: STRIPE_SECRET_KEY rotiert / abgelaufen
```bash
# 1. Neuen Key aus dashboard.stripe.com/apikeys holen
# 2. Auf VPS ersetzen:
ssh vps "cd /root/VOD_Auctions/backend && nano .env  # STRIPE_SECRET_KEY="
# 3. Restart
ssh vps "pm2 restart vodauction-backend"
```

### C: Webhook-Endpoint unerreichbar von Stripe
```bash
# Test ob api.vod-auctions.com/webhooks/stripe reachable
curl -sS -o /dev/null -w '%{http_code}\n' https://api.vod-auctions.com/webhooks/stripe
# Sollte 400 zurückgeben (invalid signature) — das zeigt dass endpoint lebt.
# 404 → middleware.ts rawBodyMiddleware check, nginx proxy_pass stimmt?
```

### D: Webhook-Signature-Verification schlägt fehl
- `STRIPE_WEBHOOK_SECRET` in .env stimmt mit dem Secret des Webhook-Endpoints auf Stripe-Dashboard überein?
- `rawBodyMiddleware` darf NICHT entfernt sein aus `backend/src/api/middlewares.ts`

## Eskalation

- `critical` > 5 min UND platform_mode=live → Notfall (verlorene Orders). User-Kommunikation über `/status`.
- Für Stripe-seitige Fragen: https://support.stripe.com
- Bei API-Rate-Limit: request-Pattern prüfen (Balance-Retrieval alle 5min sollte 0 Problem sein)

## Verwandte Incidents

- rc40.2: Storefront down (PM2-cache) führte zu Checkout-Ausfall — Stripe selbst war OK, aber E2E-Weg unterbrochen
