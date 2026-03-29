# Post-Auction Workflow — Implementation Plan

**Status:** In Progress
**Erstellt:** 2026-03-29
**Ziel:** Durchgängiger Admin-Workflow für abgeschlossene Auktionen

---

## Übersicht

Nach Auktionsende braucht der Admin einen klaren Workflow:
Gewinner sehen → Zahlungsstatus prüfen → Pakete packen → Label drucken → Versand bestätigen.

---

## Was existiert bereits

- `GET /admin/transactions` — filtert alle Transactions inkl. `fulfillment_status`
- Admin-Seite `/admin/transactions` — Tabelle mit Status-Badges, Ship/Cancel Buttons
- `POST /admin/transactions/:id` mit `action: "ship"` → setzt `fulfillment_status = shipped`
- Email-System: payment-reminder, shipping-Email bereits fertig
- pdfkit bereits installiert (Invoice-PDF vorhanden)

---

## Feature 1 — Post-Auction Block View

**Route:** `/admin/auction-blocks/[id]/post-auction`
**Neuer Tab** in der Auction Block Detail-Seite (neben bestehenden Tabs)

Tabelle aller Lots des Blocks:

| Lot | Titel | Gewinner | Betrag | Zahlung | Fulfillment | Schritt | Aktionen |
|-----|-------|---------|--------|---------|-------------|---------|---------|

- Filterbar: Alle / Unpaid / Paid / Shipped
- Farbcodierung: Rot = unbezahlt, Amber = bezahlt/unversendet, Grün = versendet
- Direktlinks auf Lot + Transaction

---

## Feature 2 — Step Tracker (pro Transaktion)

5-stufiger visueller Workflow in der Transaction-Ansicht:

```
① Auction Ended → ② Payment Received → ③ Packing → ④ Label Printed → ⑤ Shipped
```

- Aktueller Schritt in Gold hervorgehoben
- Direkter Action-Button für nächsten Schritt
- Mapping fulfillment_status:
  - `unfulfilled` = Schritte 1–2 (je nach payment status)
  - `packing` = Schritt 3
  - `shipped` = Schritt 5
  - `label_printed_at IS NOT NULL` = Schritt 4

---

## Feature 3 — Shipping Label PDF

**Endpoint:** `GET /admin/transactions/:id/shipping-label`

PDF-Inhalt:
- VOD AUCTIONS Header
- Absender: VOD Records, Adresse
- Empfänger: Name + vollständige Lieferadresse
- Bestellnummer: VOD-ORD-XXXXXX
- Items: Lot-Nummer, Künstler, Titel
- Implementation: pdfkit

---

## Feature 4 — Bulk-Aktionen

- Checkboxen in Post-Auction-Tabelle
- "Mark selected as Packing" Button
- "Print Labels for selected" → mehrere Labels als separate Downloads

---

## DB-Änderungen

```sql
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS label_printed_at TIMESTAMP;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS shipping_name TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS shipping_line1 TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS shipping_line2 TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS shipping_city TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS shipping_postal_code TEXT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS shipping_country TEXT;
```

> Shipping-Felder bereits vorhanden? → falls ja, nur `label_printed_at` neu.

---

## Neue API Endpoints

| Method | Path | Zweck |
|--------|------|-------|
| `GET` | `/admin/auction-blocks/:id/post-auction` | Alle Lots + Winner + Payment + Fulfillment |
| `POST` | `/admin/transactions/:id` (action: `packing`) | fulfillment_status = packing |
| `POST` | `/admin/transactions/:id` (action: `label_printed`) | label_printed_at = NOW() |
| `GET` | `/admin/transactions/:id/shipping-label` | PDF Label Download |
| `POST` | `/admin/transactions/bulk-action` | Bulk packing / label-printed |

---

## Agent-Partitionierung

| Agent | Tasks | Dateien |
|-------|-------|---------|
| **Agent-Backend** | API-Endpoints, DB-Migration, PDF-Label | `api/admin/auction-blocks/[id]/post-auction/route.ts` (NEU), `api/admin/transactions/[id]/shipping-label/route.ts` (NEU), `api/admin/transactions/[id]/route.ts` (neue actions), `api/admin/transactions/bulk-action/route.ts` (NEU) |
| **Agent-Frontend** | Admin UI — Post-Auction Page, Step Tracker | `admin/routes/auction-blocks/[id]/page.tsx` (Tab hinzufügen), `admin/routes/auction-blocks/[id]/post-auction/page.tsx` (NEU) |

Keine Datei-Konflikte zwischen den Agents.

---

## Fortschritt

| Task | Status |
|------|--------|
| Plan-Dokument | ✅ Done |
| DB Migration (label_printed_at) | ⏳ Todo |
| GET /admin/auction-blocks/:id/post-auction | ⏳ Todo |
| POST /admin/transactions/:id (packing + label_printed) | ⏳ Todo |
| GET /admin/transactions/:id/shipping-label PDF | ⏳ Todo |
| POST /admin/transactions/bulk-action | ⏳ Todo |
| Admin UI — Post-Auction Page | ⏳ Todo |
| Admin UI — Step Tracker in Transaction Detail | ⏳ Todo |
| Deploy + Test | ⏳ Todo |
