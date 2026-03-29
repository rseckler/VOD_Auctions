# Admin UI Konzept — VOD Auctions Backend

**Version:** 1.0
**Datum:** 2026-03-29
**Status:** Konzept / Zur Implementierung

---

## 1. Problem-Analyse: Aktueller Zustand

### 1.1 Ist-Zustand Sidebar

Das Medusa Admin zeigt derzeit **15 flat-items** ohne erkennbare Struktur oder Logik:

```
Extensions
├── Auction Blocks
├── CRM Dashboard
├── Content
├── Email Templates
├── Entity Content
├── Gallery
├── Live Monitor
├── Media
├── Musicians
├── Newsletter
├── Shipping
├── Sync Status
├── System Health
├── Test Runner
└── Transactions
```

### 1.2 Kritische Probleme

**Keine Workflow-Orientierung**
Die Navigation spiegelt die technische Datenbankstruktur wider, nicht den tatsächlichen Arbeitsprozess. Auktionsblöcke, Live-Monitor und Transactions gehören funktional zusammen, sind aber alphabetisch verstreut.

**Kein erkennbarer Einstiegspunkt**
Ein neuer Nutzer (oder der Operator nach einer Pause) sieht keine klare Orientierung: Wo fange ich an? Was ist der nächste Schritt?

**Gleiche Gewichtung für alle Items**
Zeit-kritische Bereiche (Live Monitor, Post-Auction) stehen gleichwertig neben Selten-genutztem (Test Runner, Sync Status).

**Fehlende Gruppierung verwandter Themen**
Content, Gallery, Newsletter, Emails und CRM sind alle Marketing/Content — aber über die gesamte Liste verteilt.

---

## 2. Workflow-Analyse: So arbeitet die Plattform wirklich

### 2.1 Die 4 operativen Kernprozesse

```
┌─────────────────────────────────────────────────────────────────┐
│  PROZESS 1: AUKTION VORBEREITEN                                  │
│  Block anlegen → Lots hinzufügen → Preise & Konditionen setzen   │
│  → Startzeit planen → Block-Newsletter vorbereiten               │
│  Frequenz: pro Auktionsblock (ca. 1–2x/Woche)                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PROZESS 2: AUKTION LIVE BEGLEITEN                               │
│  Bids monitoren → Snipe-Extension beobachten → ggf. manuell     │
│  eingreifen → Lots verlängern/abschließen                        │
│  Frequenz: während aktiver Auktionen (Stunden/Tage)              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PROZESS 3: POST-AUCTION / FULFILLMENT                           │
│  Zahlungseingang prüfen → Pakete packen → Label drucken          │
│  → Versand buchen → als "shipped" markieren                       │
│  Frequenz: täglich nach Auktionsende                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PROZESS 4: KATALOG PFLEGEN                                      │
│  Releases durchsuchen → Beschreibungen enrichen                  │
│  → Bilder prüfen → Künstler-/Label-Content pflegen               │
│  Frequenz: fortlaufend (Entity Overhaul Pipeline)                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Nutzungsfrequenz-Matrix

| Bereich | Frequenz | Kritikalität |
|---|---|---|
| Auction Blocks | täglich | hoch |
| Live Monitor | während Auktionen | **zeitkritisch** |
| Orders (Transactions) | täglich | hoch |
| Post-Auction Workflow | täglich nach Ende | hoch |
| Media / Entity Content | mehrmals/Woche | mittel |
| Newsletter / Emails | pro Auktion | mittel |
| Shipping Config | selten | niedrig |
| System Health | bei Bedarf | niedrig |
| Sync Status / Test Runner | sehr selten | niedrig |

---

## 3. Neues Konzept: Hub-basierte Navigation

### 3.1 Grundprinzip

**Statt 15 flacher Items → 5 thematische Gruppen** (2 direkte Shortcuts + 3 Hub-Seiten)

Die Navigation folgt dem Arbeitsablauf:
1. Auktionen vorbereiten und managen *(direkt)*
2. Bestellungen und Fulfillment *(direkt)*
3. Katalog pflegen *(Hub)*
4. Marketing steuern *(Hub)*
5. Plattform administrieren *(Hub)*

### 3.2 Neue Sidebar-Struktur

```
Extensions
├── 🏆 Auction Blocks      ← direkt (Haupt-Workflow)
├── 📦 Orders              ← direkt (Haupt-Workflow, umbenannt von Transactions)
├── 🗃️  Catalog             ← Hub-Seite
├── 📢 Marketing           ← Hub-Seite
└── ⚙️  Operations          ← Hub-Seite
```

**Von 15 auf 5 Items. Reduktion um 67%.**

---

## 4. Detail-Konzept je Bereich

### 4.1 Auction Blocks *(direkt, unveränderter Inhalt)*

Bleibt als direkter Link. Einzige Änderung: für `status=ended` Blocks direkt "Post-Auction →" Button in der Übersicht (bereits implementiert).

**Enthält:**
- Blockliste (Live / Upcoming / Past & Drafts)
- Create New Auction
- Pro Block: Edit / Manage / Post-Auction-Workflow

---

### 4.2 Orders *(direkt, umbenannt von "Transactions")*

Umbenannt, weil "Transactions" kein Nutzer-Begriff ist. "Orders" ist klarer und international verständlich.

**Enthält:**
- Alle Bestellungen mit Filter (Status, Zahlungsart, Land, Datum)
- Fulfillment-Actions (Packing → Label → Shipped)
- Bulk-Versand
- CSV Export
- Order-Detail mit Audit Trail

---

### 4.3 Catalog Hub

**Zweck:** Alles rund um den Produktkatalog — Releases durchsuchen, Content anreichern, Musiker-Datenbank.

```
┌─────────────────────────────────────────────────────────────────┐
│  CATALOG                                                         │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │    Media         │  │  Entity Content  │  │   Musicians   │  │
│  │                  │  │                  │  │               │  │
│  │  41.500 Releases │  │  AI-Descriptions │  │  897 entries  │  │
│  │  Browse & Search │  │  Bands / Labels  │  │  Roles, bands │  │
│  │  Discogs Sync    │  │  P2 Status       │  │               │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Sub-Seiten (nicht mehr in Sidebar):**
- `/admin/media` — Release-Browser
- `/admin/entity-content` — Entity Overhaul Status
- `/admin/musicians` — Musikerdatenbank

---

### 4.4 Marketing Hub

**Zweck:** Alles, was nach außen kommuniziert wird — Newsletter, Emails, Content-Seiten, Galerie, CRM.

```
┌─────────────────────────────────────────────────────────────────┐
│  MARKETING                                                       │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Newsletter    │  │  Email Preview  │  │  CRM Dashboard  │  │
│  │                 │  │                 │  │                 │  │
│  │  Brevo Kampagn. │  │  6 Templates    │  │  3.580 Kontakte │  │
│  │  Block-Sequenz  │  │  Test + Edit    │  │  Brevo Sync     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │  Content Pages  │  │    Gallery      │                       │
│  │                 │  │                 │                       │
│  │  Homepage/About │  │  9 Sections     │                       │
│  │  JSONB Blocks   │  │  Media Upload   │                       │
│  └─────────────────┘  └─────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Sub-Seiten (nicht mehr in Sidebar):**
- `/admin/newsletter` — Newsletter-Kampagnen
- `/admin/email-templates` — Email-Vorlagen
- `/admin/crm` — CRM Dashboard
- `/admin/content` — Content Blocks
- `/admin/gallery` — Galerie-Verwaltung

---

### 4.5 Operations Hub

**Zweck:** Plattform-Konfiguration, Monitoring, technische Tools. Selten genutzt, aber wichtig.

```
┌─────────────────────────────────────────────────────────────────┐
│  OPERATIONS                                                      │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Live Monitor   │  │  System Health  │  │  Shipping       │  │
│  │                 │  │                 │  │                 │  │
│  │  Aktive Bids    │  │  9 Services     │  │  Zonen & Raten  │  │
│  │  Anti-Snipe     │  │  Latenz / Uptime│  │  Methoden       │  │
│  │  ↗ opens full   │  │  Auto-Refresh   │  │  Kalkulator     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │   Sync Status   │  │   Test Runner   │                       │
│  │                 │  │                 │                       │
│  │  Discogs Health │  │  Test Accounts  │                       │
│  │  Legacy Sync    │  │  Stripe/PayPal  │                       │
│  └─────────────────┘  └─────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

> **Hinweis Live Monitor:** Die Hub-Karte zeigt Live-Status (ob Auktionen aktiv sind) und einen direkten Link zum vollen Live Monitor. Zeitkritischer Zugang bleibt gewährleistet.

**Sub-Seiten (nicht mehr in Sidebar):**
- `/admin/live-monitor` — Live Bid Monitor
- `/admin/system-health` — System Health Dashboard
- `/admin/shipping` — Shipping-Konfiguration
- `/admin/sync` — Sync Status & Actions
- `/admin/test-runner` — Test Runner

---

## 5. Hub-Seiten Design-Konzept

### 5.1 Grundstruktur einer Hub-Seite

Jede Hub-Seite folgt demselben Layout-Muster:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Icon] Catalog                                                  │
│  Browse and manage your 41,500-release catalog                   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  QUICK STATS (Live-Zahlen)                                │   │
│  │  41.500 Releases · 576/3.650 enriched · 897 Musicians    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  [Icon]      │  │  [Icon]      │  │  [Icon]      │           │
│  │  Media       │  │  Entity      │  │  Musicians   │           │
│  │              │  │  Content     │  │              │           │
│  │  Description │  │  Description │  │  Description │           │
│  │              │  │              │  │              │           │
│  │  → Open      │  │  → Open      │  │  → Open      │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Card-Komponente (Einheitlich)

Jede Karte zeigt:
- Icon (Medusa Icon oder Heroicon)
- Titel
- Kurzbeschreibung (1 Satz)
- Live-Kennzahl (optional, z.B. "41.500 Releases")
- Status-Badge (optional, z.B. "P2 Paused" bei Entity Content)
- "→ Open" Button / klickbare Karte

---

## 6. Routing & Technische Umsetzung

### 6.1 Medusa Admin Routing-Regeln

```
REGEL: defineRouteConfig() NUR auf Top-Level page.tsx
→ Nur Top-Level-Seiten erscheinen in der Sidebar
→ Sub-Seiten können trotzdem existieren (URL direkt aufrufbar)
→ Hub-Seiten sind Top-Level, Sub-Seiten werden aus Sidebar entfernt
```

### 6.2 Dateisystem-Struktur (Soll)

```
backend/src/admin/routes/
│
├── auction-blocks/
│   ├── page.tsx              ← defineRouteConfig (bleibt in Sidebar)
│   ├── create/page.tsx
│   └── [id]/
│       ├── page.tsx
│       └── post-auction/page.tsx
│
├── orders/                   ← NEU (umbenennen von transactions/)
│   └── page.tsx              ← defineRouteConfig (bleibt in Sidebar)
│       └── [id]/page.tsx
│
├── catalog/                  ← NEU: Hub-Seite
│   └── page.tsx              ← defineRouteConfig ("Catalog")
│
├── marketing/                ← NEU: Hub-Seite
│   └── page.tsx              ← defineRouteConfig ("Marketing")
│
├── operations/               ← NEU: Hub-Seite
│   └── page.tsx              ← defineRouteConfig ("Operations")
│
│   ─── Folgende verlieren defineRouteConfig (bleiben aber erreichbar) ───
│
├── media/page.tsx            ← kein defineRouteConfig mehr
├── entity-content/page.tsx   ← kein defineRouteConfig mehr
├── musicians/page.tsx        ← kein defineRouteConfig mehr
├── gallery/page.tsx          ← kein defineRouteConfig mehr
├── content/page.tsx          ← kein defineRouteConfig mehr
├── email-templates/page.tsx  ← kein defineRouteConfig mehr
├── newsletter/page.tsx       ← kein defineRouteConfig mehr
├── crm/page.tsx              ← kein defineRouteConfig mehr
├── shipping/page.tsx         ← kein defineRouteConfig mehr
├── live-monitor/page.tsx     ← kein defineRouteConfig mehr
├── system-health/page.tsx    ← kein defineRouteConfig mehr
├── sync/page.tsx             ← kein defineRouteConfig mehr
└── test-runner/page.tsx      ← kein defineRouteConfig mehr
```

### 6.3 Navigation innerhalb von Sub-Seiten

Jede Sub-Seite erhält einen Breadcrumb-Header:
```
← Back to Catalog
```
(bereits heute: `← Back to Block`)

---

## 7. Auction & Order Detail Pages (neu)

### 7.1 Konzept: One-Stop Detail View

Jede abgeschlossene Auktion und jeder Direktkauf bekommt eine **vollständige Detail-Seite**, die alles auf einem Blick zeigt: Was wurde verkauft, wer hat gewonnen, wie ist der Zahlungsstatus, was muss noch getan werden.

**Heute:** Nur eine flache Transaktionstabelle — keine Zusammenfassung, kein Überblick.
**Neu:** Jede Auktion und jeder Kauf hat eine eigene Seite mit vollständigem Kontext.

### 7.2 Auktion-Detail-Seite (`/admin/auction-blocks/[id]/summary`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Auction Blocks                                       │
│                                                                  │
│  Industrial Classics 1980–1985          [ENDED] 2026-03-29      │
│                                                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │   24    │  │   18    │  │    4    │  │    2    │            │
│  │  Lots   │  │  Paid   │  │ Unpaid  │  │ No Bid  │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Revenue: €1.247,50  ·  Shipped: 12/18  ·  Open: 6      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐  │
│  │  TASKS               │  │  LOTS                            │  │
│  │                      │  │                                  │  │
│  │  ○ 4 unpaid (3 days) │  │  Filter: All/Unpaid/Paid/Shipped │  │
│  │  ○ 3 not packed      │  │                                  │  │
│  │  ○ 2 label missing   │  │  #1 Cabaret Voltaire  Paid ✓    │  │
│  │  ● 0 overdue         │  │      bidder@test.de  €45.00     │  │
│  │                      │  │      [Mark Packing] [Label ↗]   │  │
│  │  [→ Post-Auction]    │  │                                  │  │
│  └──────────────────────┘  │  #2 Throbbing Gristle  Unpaid   │  │
│                             │      buyer@mail.de   €32.50     │  │
│  AUCTION INFO               │      [Send Reminder]            │  │
│  ────────────────           │                                  │  │
│  Type: Themen-Block         │  …                               │  │
│  Items: 24                  │                                  │  │
│  Started: 2026-03-22        └──────────────────────────────────┘  │
│  Ended: 2026-03-29                                              │
│  Newsletter sent: ✓                                             │
│                                                                  │
│  TROUBLESHOOTING                                                │
│  ─────────────────                                              │
│  ⚠ 1 payment disputed (VOD-ORD-000004)                          │
│  ○ All Stripe webhooks received                                 │
│  ○ No PayPal errors                                             │
└─────────────────────────────────────────────────────────────────┘
```

**Sections auf dieser Seite:**
1. **Summary Bar** — Lots total, paid, unpaid, no-bid, revenue, shipped
2. **Open Tasks** — Was muss noch getan werden? (priorisiert)
3. **Lots Table** — Alle Lots mit Status und Actions (= heutiger Post-Auction Workflow)
4. **Auction Info** — Block-Metadata (Typ, Datum, Newsletter-Status, Analytics-Link)
5. **Troubleshooting** — Webhook-Status, fehlerhafte Payments, Disputes

### 7.3 Order-Detail-Seite (`/admin/orders/[order_group_id]`)

Für jede Bestellung (Auktionsgewinn ODER Direktkauf) gibt es eine vollständige Detail-Seite:

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Orders                                               │
│                                                                  │
│  VOD-ORD-000003                         [PAID] 2026-03-29 13:39 │
│                                                                  │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐  │
│  │  CUSTOMER                    │  │  SHIPPING                │  │
│  │  Robin Seckler               │  │  Robin Seckler           │  │
│  │  robin@seckler.de            │  │  Musterstraße 1          │  │
│  │  [→ Customer Profile]        │  │  80333 München, DE       │  │
│  └──────────────────────────────┘  └──────────────────────────┘  │
│                                                                  │
│  ITEMS                                                          │
│  ──────────────────────────────────────────────                 │
│  [Cover] Factrix — Scheintot                  Auction Win       │
│           Lot #4 · Industrial Classics 1980–85                  │
│           Final Bid: €1.00 · Shipping: €6.49 · Total: €7.49     │
│                                                                  │
│  PAYMENT                           FULFILLMENT                  │
│  ──────────                        ────────────                 │
│  Provider:  PayPal                 Status:   Paid → Pack it     │
│  Amount:    €7.49                  Tracking: —                  │
│  Capture:   97W94113MF528800R      Label:    not printed        │
│  Paid at:   2026-03-29 13:39                                    │
│                                    [Mark Packing]               │
│                                                                  │
│  ACTIONS                                                        │
│  ──────────────────────────────────────────────                 │
│  [Mark Packing]  [Print Label ↗]  [Mark Shipped]  [Refund]     │
│  [Add Note]  [Send Confirmation Email]  [Cancel Order]          │
│                                                                  │
│  AUDIT TRAIL                                                    │
│  ──────────────────────────────────────────────                 │
│  2026-03-29 13:39  Payment received via PayPal (system)         │
│  2026-03-29 13:38  PayPal order created (cus_xxx)              │
│  2026-03-29 13:35  Checkout initiated (cus_xxx)                │
└─────────────────────────────────────────────────────────────────┘
```

**Sections auf dieser Seite:**
1. **Header** — Order-Nummer, Status-Badge, Datum
2. **Customer** — Name, Email, Link zum Kundenprofil
3. **Shipping Address** — Lieferadresse
4. **Items** — Was wurde gekauft (mit Release-Info, Lot-Nummer, Block-Link)
5. **Payment** — Provider, Betrag, Capture-ID, Transaktions-IDs
6. **Fulfillment** — Aktueller Status, Tracking-Nummer, Label-Status
7. **Actions** — Alle möglichen nächsten Schritte (kontextuell, je nach Status)
8. **Audit Trail** — Lückenloser Verlauf aller Events

### 7.4 Unterschied Auktionsgewinn vs. Direktkauf

| Feld | Auktionsgewinn | Direktkauf |
|---|---|---|
| Quelle | Bid → Block Item | Cart Item |
| Preis | Winning Bid | Legacy Price |
| Block-Link | Ja (Lot #X im Block Y) | Nein |
| Payment Deadline | 5 Tage (Erinnerungsmail) | Sofort |
| Sonderfall | Reserve Price | Stock-Check |

---

## 8. Detailkonzept: Orders (umbenannt)

### 7.1 Begründung Umbenennung

| Heute | Neu | Warum |
|---|---|---|
| "Transactions" | "Orders" | Nutzersprache, klarer Intent |
| Setzt DB-Begriff voraus | Beschreibt Workflow | Onboarding-freundlich |

### 7.2 Orders-Seite: Erweiterter Scope

Die heutige Transactions-Seite kann um einen zweiten Tab erweitert werden:

**Tab 1: All Orders** — bestehende Transaktions-Übersicht
**Tab 2: Fulfillment Queue** — nur unbezahlte + unversendete Lots (direkter Einstieg in Post-Auction Workflow)

---

## 8. Live Monitor: Sonderbehandlung

Der Live Monitor ist **zeitkritisch** — bei laufender Auktion muss er sofort erreichbar sein.

### Option A (empfohlen): In Operations Hub mit Schnellzugang
- Operations Hub zeigt Live-Status-Badge ("2 active auctions")
- Karte öffnet den Live Monitor direkt (kein Zwischenschritt)
- Bei aktiver Auktion: rotes Pulsing-Badge auf dem Operations Hub-Item in der Sidebar

### Option B: Eigener Sidebar-Eintrag (nur wenn aktiv)
- Live Monitor nur dann in der Sidebar sichtbar, wenn eine Auktion aktiv ist
- Technisch komplex (Sidebar-Items sind statisch in Medusa)

**→ Option A implementieren.**

---

## 9. Vorher / Nachher

### Vorher (15 Items)
```
Auction Blocks · CRM Dashboard · Content · Email Templates ·
Entity Content · Gallery · Live Monitor · Media · Musicians ·
Newsletter · Shipping · Sync Status · System Health ·
Test Runner · Transactions
```

### Nachher (5 Items)
```
Auction Blocks
Orders
Catalog          → Media · Entity Content · Musicians
Marketing        → Newsletter · Emails · CRM · Content · Gallery
Operations       → Live Monitor · System Health · Shipping · Sync · Test
```

---

## 10. Implementierungsplan

### Phase 1 — Grundstruktur (1 Session)
- [ ] Hub-Seite `operations/page.tsx` mit defineRouteConfig erstellen
- [ ] Hub-Seite `catalog/page.tsx` mit defineRouteConfig erstellen
- [ ] Hub-Seite `marketing/page.tsx` mit defineRouteConfig erstellen
- [ ] `defineRouteConfig` aus 12 Sub-Seiten entfernen
- [ ] `transactions/page.tsx` → umbenennen zu `orders/page.tsx`

### Phase 2 — Hub-Seiten ausarbeiten (1 Session)
- [ ] Catalog Hub: Live-Stats (Release-Count, Entity-Progress)
- [ ] Marketing Hub: Kampagnen-Status, Template-Übersicht
- [ ] Operations Hub: System-Health-Badge, aktive Auktionen Badge

### Phase 3 — Polish (Optional)
- [ ] Breadcrumb-Navigation auf allen Sub-Seiten vereinheitlichen
- [ ] Keyboard Shortcuts (z.B. `G A` → Auction Blocks)
- [ ] Lesezeichen / Favoriten für häufig genutzte Sub-Seiten

---

## 11. Nicht verändert

Folgende Elemente bleiben **unverändert**:
- Alle bestehenden Funktionen und APIs
- URL-Struktur der Sub-Seiten (SEO/Bookmarks stabil)
- Medusa-eigene Navigation (Einstellungen, etc.)
- Das gesamte Storefront

---

*Dokument erstellt von Claude (claude-sonnet-4-6) am 2026-03-29*
*Basierend auf Analyse der bestehenden Sidebar und Workflow-Gespräch mit Robin Seckler*
