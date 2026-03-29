# Rudderstack Self-Hosted Setup Guide

## Overview
Rudderstack acts as event router between VOD Auctions (backend + storefront) and destinations (Brevo, PostHog, Supabase).

## VPS Deployment (Docker)

### 1. Create docker-compose file on VPS
```bash
ssh root@72.62.148.205
mkdir -p /root/rudderstack && cd /root/rudderstack

cat > docker-compose.yml << 'EOF'
version: "3.8"
services:
  rudder-server:
    image: rudderlabs/rudder-server:latest
    ports:
      - "8080:8080"
    environment:
      - WORKSPACE_TOKEN=<YOUR_WORKSPACE_TOKEN>
    restart: unless-stopped

  rudder-transformer:
    image: rudderlabs/transformer:latest
    ports:
      - "9090:9090"
    restart: unless-stopped
EOF

docker compose up -d
```

### 2. Get workspace token
1. Sign up at https://app.rudderstack.com (free for self-hosted control plane)
2. Create a new workspace
3. Copy the "Workspace Token" from Settings > Company

### 3. Create a Source in Rudderstack Dashboard
1. Sources > Add Source > Node.js
2. Copy the Write Key > add to backend .env as `RUDDERSTACK_WRITE_KEY`
3. Set `RUDDERSTACK_DATA_PLANE_URL=http://72.62.148.205:8080` (or your domain)

### 4. Configure Destinations
- **Brevo:** Add destination > Brevo > map events > Customer Registered > create contact
- **PostHog:** Add destination > PostHog > paste your PostHog project API key

### 5. Backend env vars to add
```
RUDDERSTACK_WRITE_KEY=<from dashboard>
RUDDERSTACK_DATA_PLANE_URL=http://72.62.148.205:8080
```

### 6. Storefront env vars to add
```
NEXT_PUBLIC_RUDDERSTACK_WRITE_KEY=<same or separate browser source key>
NEXT_PUBLIC_RUDDERSTACK_DATA_PLANE_URL=http://72.62.148.205:8080
```

## Events Tracked

### Backend (server-side via crm-sync.ts)
| Event | Properties |
|-------|-----------|
| Customer Registered | email, first_name, last_name |
| Bid Placed | bid_amount, total_bids |
| Auction Won | amount, total_auctions_won |
| Payment Completed | order_group_id, amount, total_purchases, total_spent |
| Order Shipped | transaction_id |
| Order Delivered | transaction_id |

### Storefront (browser-side)
| Event | Properties |
|-------|-----------|
| Page view | (automatic on every route change) |
| Bid Submitted | amount, block_item_id, slug |
| Item Saved | release_id |
| Checkout Started | cart_total, item_count |
| Checkout Completed | order_group_id, amount, provider |

## Estimated RAM usage: ~512MB on VPS

## Graceful Degradation
Both backend and storefront SDKs degrade gracefully if env vars are not set or the SDK package is not installed. No tracking calls will be made and no errors will be thrown.
