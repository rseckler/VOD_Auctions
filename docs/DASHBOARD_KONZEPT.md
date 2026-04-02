# VOD Auctions — Dashboard Konzept

**Version:** 1.0  
**Erstellt:** 2026-04-02  
**Status:** Zur Umsetzung freigegeben

---

## 1. Ziel

Das Dashboard zeigt dem Admin auf einen Blick was gerade passiert und was Aufmerksamkeit braucht. Es passt sich automatisch an den `platform_mode` an — Beta-Tester brauchen andere Infos als ein Live-Shop.

**Kern-Prinzip:** Keine Vanity-Metrics. Nur was actionable ist oder Kontext gibt.

---

## 2. Phasen-adaptives Layout

### 2.1 `beta_test` (aktueller Zustand)

**Focus:** Launch-Vorbereitung, Katalog-Qualität, Test-Aktivität

```
┌─ STATS ──────────────────────────────────────────────────────┐
│ CATALOG     │ FOR SALE    │ COVER OK    │ TEST BIDS  │ TEST  │
│ 41,529      │ 12,340      │ 97.2%       │ 14         │ ORDERS│
│ releases    │ priced      │ coverage    │ total      │ 3     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  🚀 LAUNCH READINESS                          [67% ████░░]  │
│                                                              │
│  ✅ Shipping rates configured (3 zones, 15 classes)         │
│  ✅ Stripe webhook active (Live Mode)                       │
│  ✅ PayPal webhook active                                   │
│  ⚠️ Legal pages incomplete (2/3 — AGB missing)              │
│  ⬜ First auction block created                              │
│  ⬜ Pre-launch waitlist activated                            │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ⚠️ ACTION REQUIRED                                          │
│  • 3,456 releases without price → cannot be sold            │
│  • AGB page not published → blocks Go Live                  │
│  • Entity content: 1,013 / 3,650 done (P2 paused)          │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  📊 CATALOG HEALTH                                           │
│  ┌──────────┬──────────┬──────────┬──────────┐              │
│  │ Releases │ Band Lit │ Label Lit│ Press Lit│              │
│  │ 30,159   │ 3,915    │ 1,129    │ 6,326   │              │
│  │ 97% img  │ 93% img  │ 95% img  │ 94% img │              │
│  └──────────┴──────────┴──────────┴──────────┘              │
│  Discogs: 8,340 matched · Last sync: today 02:00            │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  📋 RECENT ACTIVITY                                          │
│  10:15  bidder2@test.de bid €18 on Lot #1                   │
│  09:30  testuser created account                             │
│  09:12  Config: gate_password changed by admin               │
│  Yesterday  Legacy sync: 2 updated, 0 errors                │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  🔴 LIVE AUCTIONS                                            │
│  TG & Industrial Records — The Archive                      │
│  Ends 3 Apr 12:00 · 10 items · 14 bids · Top €18           │
│  [Live Monitor →]  [Manage →]                               │
│                                                              │
│  This week: €0 revenue · 0 orders · 0 shipped               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 `pre_launch`

Stats-Karten ändern sich:
```
│ WAITLIST    │ INVITED     │ REGISTERED  │ ACTIVE AUC  │ CATALOG    │
│ 847         │ 127         │ 89          │ 1           │ 41,529     │
│ pending     │ sent        │ converted   │ live        │ releases   │
```

Neue Sektionen:
- **WAITLIST FUNNEL** — Applied → Approved → Invited → Registered (Conversion %)
- **INVITE ACTIVITY** — letzte 10 Token-Einlösungen
- Launch Readiness verschwindet (pre_launch = bereit)

### 2.3 `live`

Stats-Karten:
```
│ REVENUE     │ ORDERS      │ ACTIVE AUC  │ BIDS TODAY  │ NEW USERS  │
│ €1,234      │ 23          │ 3           │ 47          │ 12         │
│ this week   │ this week   │ live now    │ today       │ this week  │
```

Neue Sektionen:
- **REVENUE CHART** — letzte 30 Tage (Balken: Auction vs. Direct Purchase)
- **ORDERS PIPELINE** — Pending → Paid → Packing → Shipped → Delivered (Counts)
- **HOT LOTS** — Top 5 Lots mit meisten Bids (aktuell live)
- **RECENT ORDERS** — letzte 5 Orders mit Status + Betrag

---

## 3. Sektionen im Detail

### 3.1 Stats Row (immer sichtbar)

5 Karten, grid layout. Zeigt die wichtigsten KPIs für den aktuellen Modus.

**API:** `GET /admin/dashboard` → `{ stats: {...}, actions: [...], activity: [...], auctions: [...], catalog: {...}, launch_readiness: {...} }`

### 3.2 Launch Readiness (nur beta_test)

Checklist mit automatischen Checks (gleiche Checks wie Go-Live Pre-Flight):
- Shipping konfiguriert?
- Payment Providers aktiv?
- Legal Pages veröffentlicht?
- Erste Auktion angelegt?
- Pre-Launch aktiviert?

Fortschrittsbalken = erledigte / gesamte Checks.

### 3.3 Action Required (immer, wenn Items vorhanden)

Nur echte Handlungsaufforderungen:
- Unbezahlte Orders > 3 Tage
- Releases ohne Preis (können nicht verkauft werden)
- Fehlende Legal Pages
- Sync-Fehler
- Sentry-Issues (Kritisch)

Wenn leer: grüne "All caught up" Message.

### 3.4 Recent Activity Feed (immer)

Die letzten 15 Events chronologisch:
- Bids (wer, wieviel, welches Lot)
- Orders (Zahlung, Versand)
- Account-Erstellungen
- Config-Änderungen (Audit Log)
- Sync-Events (Legacy, Discogs)

### 3.5 Live Auctions (immer, wenn vorhanden)

Aktive Auction Blocks mit:
- Titel, Typ, Countdown
- Anzahl Items, Bids, Top-Bid
- Quick-Actions: Live Monitor, Manage

### 3.6 Catalog Health (nur beta_test)

Breakdown nach Produkt-Kategorie:
- Releases, Band Lit, Label Lit, Press Lit
- Jeweils: Anzahl, Cover-Image %, Preis-Coverage
- Discogs-Match-Status
- Entity Content Overhaul Status

### 3.7 Revenue + Orders (nur live)

- 30-Tage Revenue-Chart
- Orders Pipeline (Kanban-Counts)
- Wochenzusammenfassung

---

## 4. API-Endpoint

```
GET /admin/dashboard
```

Aggregiert Daten aus mehreren Tabellen in einem Call:

```typescript
{
  platform_mode: "beta_test",
  stats: {
    catalog_total: 41529,
    for_sale: 12340,
    cover_ok_pct: 97.2,
    total_bids: 14,
    total_orders: 3,
    revenue_this_week: 0,
    // ... mode-dependent
  },
  launch_readiness: {
    checks: [{ label, ok, detail }],
    progress_pct: 67,
  },
  actions: [
    { type: "warning", message: "3,456 releases without price", link: "/app/catalog?filter=no_price" },
  ],
  activity: [
    { type: "bid", message: "bidder2@test.de bid €18 on Lot #1", time: "2026-04-02T10:15:00Z" },
  ],
  auctions: [
    { id, title, type, ends_at, item_count, bid_count, top_bid, status },
  ],
  catalog: {
    releases: { count: 30159, cover_pct: 97 },
    band_lit: { count: 3915, cover_pct: 93.5 },
    // ...
  },
  weekly: {
    revenue: 0,
    orders: 0,
    shipped: 0,
    pending: 0,
  },
}
```

---

## 5. Design

- Gleicher Farbstil wie die restlichen Admin-Seiten
- Auto-Refresh: 60 Sekunden
- Responsive: Stats-Karten stacken auf Mobile
- Activity Feed: maximal 15 Einträge, kein Infinite Scroll
- Charts: Einfache Balken (kein Recharts/D3 — inline SVG oder CSS bars)

---

## 6. Implementierungsplan

- [ ] `GET /admin/dashboard` Backend-Route (aggregiert aus 8+ Tabellen)
- [ ] `admin/routes/dashboard/page.tsx` — komplett neu
- [ ] Auto-Refresh (60s)
- [ ] Phasen-Logik (Stats + Sektionen nach platform_mode)

---

*Verknüpfte Dokumente: `ADMIN_CONFIG_KONZEPT.md`, `PRE_LAUNCH_KONZEPT.md`*
