# Monitoring Services — Setup Guide

This guide explains how to activate the three monitoring services that currently show as **"unconfigured"** in the System Health dashboard.

---

## 1. Google Analytics 4 (GA4)

**Status:** Already configured — `G-M9BJGC5D69` is set in `storefront/.env.local`.

If System Health still shows "unconfigured", the env var needs to be set on the **backend** as well (it reads from backend's `.env`):

**Backend `.env` addition:**
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-M9BJGC5D69
```

**Verification:**
- Dashboard: https://analytics.google.com → Property: VOD Auctions
- Measurement ID format: `G-XXXXXXXXXX`
- The storefront already includes the GA4 script via `storefront/src/components/Analytics.tsx` (or similar)

**If you need a new GA4 property:**
1. Go to https://analytics.google.com → Admin → Create Property
2. Copy the Measurement ID (`G-...`)
3. Add to `storefront/.env.local` and backend `.env`

---

## 2. Sentry (Error Tracking)

**Status:** Not yet set up — no Sentry project exists for VOD Auctions.

### Step 1: Create Sentry Project
1. Go to https://sentry.io → sign in (or create account)
2. Create a new project: **Platform → Next.js**, name: `vod-auctions`
3. Note the **DSN** (looks like `https://xxxxx@o123456.ingest.sentry.io/789012`)
4. Also note: **Organization slug** and **Project slug**

### Step 2: Install Sentry in Storefront
```bash
cd storefront
npx @sentry/wizard@latest -i nextjs
```
This runs the Sentry setup wizard — it creates `sentry.client.config.ts`, `sentry.server.config.ts`, and patches `next.config.ts`.

### Step 3: Set environment variables

**Backend `.env`:**
```
SENTRY_DSN=https://xxxxx@o123456.ingest.sentry.io/789012
SENTRY_ORG=vod-records          # your org slug on sentry.io
SENTRY_PROJECT=vod-auctions     # your project slug
```

**Storefront `.env.local`:**
```
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@o123456.ingest.sentry.io/789012
SENTRY_ORG=vod-records
SENTRY_PROJECT=vod-auctions
SENTRY_AUTH_TOKEN=sntrys_xxxx   # from: Settings → Auth Tokens → Create
```

**On VPS** — add to backend `.env`:
```bash
ssh root@72.62.148.205
echo 'SENTRY_DSN=https://xxxxx@o123456.ingest.sentry.io/789012' >> /root/VOD_Auctions/backend/.env
echo 'SENTRY_ORG=vod-records' >> /root/VOD_Auctions/backend/.env
echo 'SENTRY_PROJECT=vod-auctions' >> /root/VOD_Auctions/backend/.env
pm2 restart vodauction-backend
```

### Step 4: Verify
- System Health will show "DSN configured" (green) once `SENTRY_DSN` is set
- Trigger a test error in the storefront to verify events appear in Sentry

**Cost:** Free tier — 5,000 errors/month, unlimited projects.

---

## 3. ContentSquare (UX Analytics)

**Status:** Not yet set up. ContentSquare is an enterprise UX analytics tool (heatmaps, session recordings, journey analysis).

> ⚠️ **Note:** ContentSquare is enterprise software with pricing based on page views. Evaluate whether you need it — for early-stage, **Hotjar** (free tier: 35 sessions/day) or **Microsoft Clarity** (completely free, no limits) are good alternatives.

### Option A: ContentSquare

1. Go to https://contentsquare.com → request a demo / start trial
2. After account setup, get your **Site ID** from the ContentSquare dashboard
3. The storefront already has ContentSquare consent integration — just add the Site ID

**Storefront `.env.local`:**
```
NEXT_PUBLIC_CS_SITE_ID=your-site-id-here
```

**Backend `.env`** (for System Health to read):
```
NEXT_PUBLIC_CS_SITE_ID=your-site-id-here
```

### Option B: Microsoft Clarity (Recommended for pre-launch)

Free, unlimited, privacy-friendly alternative with heatmaps + session recordings.

1. Go to https://clarity.microsoft.com → Create project → copy **Project ID**
2. Add to `storefront/src/components/` a `Clarity.tsx` component:

```tsx
// storefront/src/components/Clarity.tsx
"use client"
import { useEffect } from "react"

export function Clarity() {
  useEffect(() => {
    const id = process.env.NEXT_PUBLIC_CLARITY_ID
    if (!id || typeof window === "undefined") return
    ;(function(c: any, l: any, a: any, r: any, i: any) {
      c[a] = c[a] || function() { (c[a].q = c[a].q || []).push(arguments) }
      const t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i
      const y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y)
    })(window, document, "clarity", "script", id)
  }, [])
  return null
}
```

**Storefront `.env.local`:**
```
NEXT_PUBLIC_CLARITY_ID=your-project-id
```

Include `<Clarity />` in `storefront/src/app/layout.tsx` inside `<body>`.

---

## System Health Dashboard Summary

After setup, System Health (`/app/system-health` or `/app/operations → System Health`) will show:

| Service | What it checks | Env var needed |
|---------|---------------|----------------|
| GA4 | Measurement ID configured | `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| Sentry | DSN configured | `SENTRY_DSN` |
| ContentSquare | Site ID configured | `NEXT_PUBLIC_CS_SITE_ID` |
| VPS / API | HTTP check to `api.vod-auctions.com` | _(none — live check)_ |
| Storefront (public) | HTTP check to `vod-auctions.com` | _(none — live check)_ |

All env vars marked `NEXT_PUBLIC_*` need to be set in **both** `storefront/.env.local` (for storefront) **and** `backend/.env` (for System Health to read them). The backend doesn't use them at runtime — it just checks if they're set.
