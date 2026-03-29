# Admin Backoffice — Analyse, Marktvergleich & Konzept

**Datum:** 2026-03-30
**Status:** Draft — zur Freigabe vor Umsetzung
**Betrifft:** Admin-Bereich `admin.vod-auctions.com/app/`

---

## 1. ANALYSE — Aktueller Zustand

### 1.1 Grundlegendes Datenmodell (korrekt, kein Rebuild nötig)

Das Datenmodell ist **bereits richtig aufgebaut**:

```
auction_block (1 Block, z.B. "Industrial Classics 1980-1985")
    └── block_item (N Lots, je ein Release)
          ├── Lot #1: Cabaret Voltaire → Gewinner: bidder2 → transaction: TX-001
          ├── Lot #2: Throbbing Gristle → Gewinner: testuser → transaction: TX-002
          └── Lot #3: SPK → Kein Gebot → keine Transaction
```

**Jedes gewonnene Lot = eine eigene Transaction.** Pro Auction können N unterschiedliche Käufer existieren. Das ist korrekt implementiert.

### 1.2 Gefundene Bugs & Probleme

#### Bug #1: Defekter „Post-Auction Workflow →" Button (404)
- **Datei:** `auction-blocks/[id]/post-auction/page.tsx` Zeile 316–324
- **Problem:** Button linkt auf `/app/auction-blocks/{id}/post-auction/workflow` — diese Route existiert nicht → **404 Error**
- **Fix:** Button muss entfernt werden. Die Workflow-Steuerung ist bereits inline pro Lot-Zeile vorhanden (ActionButton-Komponente).

#### Bug #2: Keine klickbaren Zeilen in der Auction Blocks Liste
- **Datei:** `auction-blocks/page.tsx`
- **Problem:** Die Tabelle hat keine klickbaren Zeilen. Nur die Buttons „Edit", „Manage", „Post-Auction →" navigieren weiter. Das entspricht nicht dem erwarteten UX-Pattern (vgl. Orders-Seite).
- **Fix:** Gesamte Zeile klickbar machen → navigiert zu `/app/auction-blocks/{id}`

#### Bug #3: Kein direkter Link von Lot-Zeile zur Transaction
- **Datei:** `auction-blocks/[id]/post-auction/page.tsx`
- **Problem:** In der Lots-Tabelle der Post-Auction-Seite gibt es keinen Link zur Transaction-Detailseite (`/app/transactions/{tx.id}`). Der Admin kann nicht direkt zur Bestelldetailseite eines Lots springen.
- **Fix:** Lot-Zeile klickbar machen (→ Transaction-Detail) + separate „View Order →" Link-Spalte

#### Bug #4: Fehlende Refund-Möglichkeit in Post-Auction-Ansicht
- **Datei:** `auction-blocks/[id]/post-auction/page.tsx`
- **Problem:** Kein Refund-Button in der Lot-Zeile. Standard auf allen Plattformen.
- **Fix:** Refund-Button im ActionButton (Step 2+, wenn paid) → öffnet Confirm-Dialog → POST `/admin/transactions/{id}` mit `action: "refund"`

#### Bug #5: Keine Admin-Dashboard-Startseite
- **Problem:** Das Admin öffnet die Medusa-Standard-Übersicht. Es gibt keine eigene Einstiegsseite mit To-Do-Übersicht für VOD Auctions.
- **Fix:** Neue Seite `/app/dashboard` als Hub, der alle offenen Aufgaben aggregiert.

#### Bug #6: Fehlende „By Buyer" Gruppenansicht in Post-Auction
- **Problem:** Die Post-Auction-Seite zeigt nur „By Lot" (Lot #1, #2, #3...). Wenn ein Käufer 3 Lots gewonnen hat, erscheint er 3× als eigene Zeile. Fulfillment aber = **1 Paket pro Käufer**.
- **Fix:** Toggle „By Lot / By Buyer" in der Post-Auction-Seite

---

## 2. MARKTVERGLEICH — Best Practices

### eBay Seller Hub
- **Jedes gewonnene Lot = eigene Order** (auch wenn gleicher Käufer)
- Standard-Ansicht: **„Awaiting Shipment"** — nicht eine Stats-Seite, sondern eine **To-Do-Queue**
- Bulk-Aktionen: Labels drucken, als versendet markieren
- Refund: Seller-initiiert, voll oder partial, mit Pflichtfeld „Reason"

### Catawiki (direktes Konkurrenzmodell — Auktionen für Sammler)
- **Keine Block-Ansicht** — rein lot-/order-orientiert
- Dashboard = **Aktions-orientiert**: Ship by [Datum], Payment pending
- Seller sieht: pro Lot → Käufer-Land, Deadline, Status-Badge
- Refund nur über Dispute-System (nicht für VOD relevant)

### Shopify Admin
- **To-Do als Startseite**: KPIs oben, offene Orders als Hauptliste
- Filter: Unfulfilled, Awaiting payment, Fulfilled
- **Bulk-Fulfillment** + Packing Slips
- Refund: Line-item-Level, Restocking-Option, Reason-Pflichtfeld

### Fazit Marktvergleich für VOD Auctions
1. **Landing-Page = To-Do-Queue**, nicht Statistiken (eBay, Catawiki, Shopify alle gleich)
2. **Dual-View ist Standard**: By-Buyer (für Fulfillment) und By-Lot (für Inventory)
3. **Pro-Käufer-Packing-Slip** (nicht pro Lot) — 1 Paket enthält alle Lots eines Käufers aus einer Auction
4. **Refund muss immer möglich sein** — vollständig oder teilweise, mit Grund

---

## 3. KONZEPT — Was gebaut werden soll

### 3.1 Neue Admin-Startseite: Dashboard

**Route:** `/app/dashboard` (neues `backend/src/admin/routes/dashboard/page.tsx`)
**Ziel:** Tägliche To-Do-Übersicht — der Admin sieht sofort was zu tun ist.

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  VOD Records Admin                               Datum/Zeit  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 HEUTE WICHTIG                                           │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │ 🔴       │ 🟠       │ 🟡       │ 🟢       │ 📦       │  │
│  │ 3 unpaid │ 5 pack   │ 2 labels │ 1 active │ 8 shipped│  │
│  │ overdue  │ ready    │ pending  │ auction  │ in trans.│  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
│                                                             │
│  📋 TO-DO QUEUE                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ● [DRINGEND] 2 Zahlungen überfällig > 5 Tage        │   │
│  │   Lot #1 Cabaret V. | Buyer: John D. | €45 | 6d ago │   │
│  │   → [View Order] [Send Reminder] [Cancel]           │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ● [PACKING] 5 Lots bezahlt, noch nicht gepackt      │   │
│  │   [View all packing queue →]                        │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ● [LABEL] 2 Lots in Packing, Label nicht gedruckt   │   │
│  │   [Print all labels →]                              │   │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  🏷️ AKTIVE AUKTIONEN                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ "Industrial Classics" | 12 Lots | endet in 2h 15m   │   │
│  │ 34 Gebote | 8 Bieter | Höchstgebot €280             │   │
│  │ → [Live Monitor] [Manage]                           │   │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  📈 DIESE WOCHE                                             │
│  Revenue: €1.240 | Orders: 18 | Shipped: 12 | Pending: 6   │
│                                                             │
│  📅 DEMNÄCHST                                               │
│  "Post-Punk Essentials" startet in 3 Tagen [Edit →]        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Datenquellen
- To-Do-Items: `GET /admin/transactions?fulfillment_status=unfulfilled&status=paid` + `GET /admin/transactions?status=pending&date_to=[5_days_ago]`
- Aktive Auktionen: `GET /admin/auction-blocks` (filter: status=active)
- Wochenstatistik: `GET /admin/transactions?date_from=[7_days_ago]`
- Upcoming: `GET /admin/auction-blocks` (filter: status=scheduled/preview)

---

### 3.2 Auction Blocks Liste — Klickbare Zeilen

**Route:** `/app/auction-blocks` (bestehende Datei, kleiner Fix)

- **Gesamte Tabellenzeile klickbar** → `/app/auction-blocks/{id}` (für alle Status)
- **Für „ended" Blocks:** Zusätzlich direkter Link-Button „Post-Auction →" bleibt, aber auch Zeile klickbar
- Cursor `pointer` auf hover

---

### 3.3 Post-Auction-Seite — Fixes & Erweiterungen

**Route:** `/app/auction-blocks/{id}/post-auction`

#### Fix A: Defekter „Post-Auction Workflow →" Button entfernen
→ Komplett löschen. Kein Ersatz nötig — der Workflow ist inline in der Lots-Tabelle.

#### Fix B: Lot-Zeile klickbar → Transaction-Detail
- Klick auf eine Lot-Zeile (die eine Transaction hat) → navigiert zu `/app/transactions/{tx.id}`
- Cursor `pointer`, hover-Highlight
- Lot-Zeilen ohne Transaction (kein Gebot) → nicht klickbar

#### Fix C: Refund-Button
- Erscheint in der ActionButton-Komponente wenn `tx.status === "paid"`
- Klick öffnet Browser `confirm()` mit Betrag
- POST `/admin/transactions/{tx.id}` mit `{ action: "refund" }`
- Nach Erfolg: Zeile aktualisieren

#### Fix D: „By Buyer" Toggle (neue Ansicht)
- Toggle-Button oben rechts in der Lots-Tabelle: `[By Lot]  [By Buyer]`
- **By Buyer View:**
  - Gruppiert Lots nach `lot.winner.email`
  - Pro Käufer-Zeile: Name, Email, Anzahl gewonnener Lots, Gesamt-Betrag, Status
  - Expandierbar: Zeigt einzelne Lots dieser Person
  - Action: „Print Packing Slip" (alle Lots eines Käufers in einem Dokument)
  - Action: „Mark all shipped" (für diesen Käufer)

#### Fix E: Lot-Zeile zeigt Order-Nummer als Link
- Wenn `tx.order_number` vorhanden: `VOD-ORD-XXXXXX` als klickbarer Link → `/app/transactions/{tx.id}`

---

### 3.4 Transaction-Detail-Seite — Refund-Verbesserung

**Route:** `/app/transactions/{id}`

- Refund-Button bereits vorhanden, aber:
  - Partial Refund (eigener Betrag) hinzufügen
  - Reason-Auswahl (Dropdown): Defective / Not as described / Buyer request / No payment / Other
  - Nach Refund: Status-Update sichtbar in Audit-Trail

---

## 4. UMSETZUNGSPLAN

### Priorität 1 — Kritische Fixes (1-2h)

| # | Task | Datei | Aufwand |
|---|------|-------|---------|
| P1-1 | „Post-Auction Workflow →" Button entfernen | `post-auction/page.tsx` | 5 min |
| P1-2 | Lot-Zeile klickbar → `/app/transactions/{tx.id}` | `post-auction/page.tsx` | 15 min |
| P1-3 | Refund-Button in Lot-Zeile (nach paid) | `post-auction/page.tsx` | 20 min |
| P1-4 | Auction Blocks Liste: Zeilen klickbar | `auction-blocks/page.tsx` | 15 min |

### Priorität 2 — Dashboard-Startseite (2-3h)

| # | Task | Datei | Aufwand |
|---|------|-------|---------|
| P2-1 | Neue Route `dashboard/page.tsx` anlegen | neu | 30 min |
| P2-2 | Dashboard API: aggregierte To-Do-Daten | bestehende Endpoints kombinieren | 30 min |
| P2-3 | Dashboard Layout: KPI-Cards + To-Do-Queue | `dashboard/page.tsx` | 60 min |
| P2-4 | Dashboard: Aktive Auktionen Widget | `dashboard/page.tsx` | 30 min |
| P2-5 | Dashboard: Sidebar-Item hinzufügen (rank 0) | `operations/page.tsx` oder eigene Seite | 15 min |

### Priorität 3 — By-Buyer-Ansicht (1-2h)

| # | Task | Datei | Aufwand |
|---|------|-------|---------|
| P3-1 | Toggle „By Lot / By Buyer" in Post-Auction | `post-auction/page.tsx` | 45 min |
| P3-2 | By-Buyer-Gruppierungslogik (Frontend only) | `post-auction/page.tsx` | 45 min |
| P3-3 | „Print Packing Slip" per Käufer-Gruppe | API: `GET /admin/transactions/packing-slip?buyer={email}&block={id}` | 60 min |

### Priorität 4 — Partial Refund (30min)

| # | Task | Datei | Aufwand |
|---|------|-------|---------|
| P4-1 | Partial-Refund-Modal mit Betrag + Reason | `transactions/[id]/page.tsx` | 30 min |

---

## 5. OFFENE FRAGEN VOR UMSETZUNG

1. **Dashboard als Sidebar-Item**: Soll `/app/dashboard` in der Sidebar erscheinen (als erster Punkt, rank 0) oder ist es die automatische Startseite wenn Admin öffnet?
   → Empfehlung: Eigener Sidebar-Punkt „Dashboard" (rank 0) mit Home-Icon.

2. **By-Buyer-Packing-Slip**: Ist ein neuer API-Endpoint für kombinierten Packing-Slip (mehrere Lots eines Käufers) gewünscht, oder reicht erstmal das Drucken der individuellen Shipping Labels pro Lot?

3. **Partial Refund**: Welche Refund-Gründe sollen im Dropdown erscheinen? Vorschlag: `Defective item / Not as described / Buyer cancelled / Technical error / Other`

4. **Unsold Lots Workflow**: Lots ohne Gebot → automatisch zurück auf `available`? Oder manuell im Admin? (Wird in der aktuellen Post-Auction-Seite noch nicht behandelt)

---

*Dieses Dokument wird nach Freigabe als Grundlage für die Umsetzung verwendet.*
