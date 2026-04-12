# POS Dry-Run (P0) — To-Do-Liste

**Bezug:** `POS_WALK_IN_KONZEPT.md` §12, Phase P0
**UX-Referenz:** `POS_UX_RESEARCH.md` — vor der UI-Implementierung lesen!
**Erstellt:** 2026-04-12
**Status:** Offen

---

## UX-Leitplanken (aus Research, verbindlich fuer P0)

Diese Regeln gelten fuer alle UI-Tasks (P0.7, P0.8):

1. **Split-Screen:** Produkt-Bereich links (60%), Cart rechts (40%). Cart immer sichtbar, nie hinter Toggle.
2. **3-Tap-Regel:** Scan (0 Taps) -> "Bezahlen" (1 Tap) -> Zahlungsart (1 Tap) -> Fertig.
3. **Auto-Add bei Scan:** Item geht direkt in Cart, kein "Hinzufuegen"-Button.
4. **Globaler Scanner-Listener:** Erkennt schnelle Zeicheneingabe als Barcode, egal wo der Fokus liegt.
5. **Default: Anonym:** Customer-Suche ist optional, blockiert nie den Flow.
6. **SumUp vorausgewaehlt:** Haeufigste Zahlungsart = Default.
7. **Inline statt Modal:** Scan-Fehler, Kunden-Suche, Warnungen = alles inline, keine Modals (ausser Checkout-Bestaetigung und "Alles loeschen").
8. **Touch-Targets: 48px+**, primaere Aktionen 56-64px. "Bezahlen"-Button volle Cart-Breite, 56px hoch.
9. **Erfolgs-Feedback:** Gruener Flash auf neuem Cart-Item (300ms). Haekchen nach Checkout (1 Sek), dann Auto-Advance + Focus auf Scan-Input.
10. **Swipe-to-Remove** fuer Cart-Items + Undo-Toast (5 Sek). "Alles loeschen" braucht Bestaetigung.

---

## Vorbereitung

- [ ] **P0.1 — Feature-Flag `POS_WALK_IN`**
  - `backend/src/lib/feature-flags.ts`: Neuen Eintrag in `FEATURES` Registry
  - `key: "POS_WALK_IN"`, `category: "erp"`, `requires: ["ERP_INVENTORY"]`
  - `description: "POS / Walk-in Sale — Kassen-Oberfläche für den Laden"`
  - Kein DB-Change nötig (lebt in `site_config.features` JSONB)

- [ ] **P0.2 — DB-Migration**
  - Datei: `backend/scripts/migrations/pos_walk_in_columns.sql`
  - 11 neue Spalten auf `transaction` (alle nullable, rein additiv):
    ```
    pos_session_id TEXT
    tse_signature TEXT
    tse_transaction_number INTEGER
    tse_signed_at TIMESTAMPTZ
    tse_serial_number TEXT
    tax_mode TEXT DEFAULT 'standard'
    tax_rate_percent NUMERIC(5,2)
    tax_amount NUMERIC(10,2)
    customer_country_code TEXT
    export_declaration_issued_at TIMESTAMPTZ
    export_declaration_confirmed_at TIMESTAMPTZ
    ```
  - Sequence für POS-Nummernkreis: `CREATE SEQUENCE pos_order_number_seq START 1`
  - Idempotent schreiben (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`)
  - Migration auf Prod-DB anwenden (Supabase SQL Editor)

## Backend API

- [ ] **P0.3 — Session + Cart API**
  - `POST /admin/pos/sessions` → UUID generieren, in-memory oder lightweight DB-Eintrag, return `{session_id}`
  - `POST /admin/pos/sessions/:id/items` → Body: `{barcode}`. Barcode validieren (`VOD-` Prefix), `erp_inventory_item` + Release + Artist + Label joinen. Prüfen: `status != 'sold'`, nicht in aktivem `block_item`. Return Item-Objekt mit Cover, Titel, Artist, Format, Preis.
  - `DELETE /admin/pos/sessions/:id/items/:itemId` → Item aus Session entfernen
  - Alle Routes: `requireFeatureFlag(pg, "POS_WALK_IN")`
  - Dateien:
    - `backend/src/api/admin/pos/sessions/route.ts`
    - `backend/src/api/admin/pos/sessions/[id]/items/route.ts`
    - `backend/src/api/admin/pos/sessions/[id]/items/[itemId]/route.ts`

- [ ] **P0.4 — Checkout API**
  - `POST /admin/pos/sessions/:id/checkout`
  - Body: `{payment_provider, customer_id?, discount_eur?, items: [{inventory_item_id, price}]}`
  - In einer DB-Transaktion (Knex):
    1. Nächste POS-Order-Number holen (`SELECT nextval('pos_order_number_seq')` → `VOD-POS-000001`)
    2. `transaction` INSERT: `item_type='walk_in_sale'`, `status='paid'`, `fulfillment_status='picked_up'`, `payment_provider`, `tse_signature='DRY_RUN'`, `tax_mode='standard'`, `order_number`
    3. Pro Item: `erp_inventory_movement` INSERT (`type='outbound'`, `reason='walk_in_sale'`, `reference_id=transaction.id`)
    4. Pro Item: `UPDATE erp_inventory_item SET status='sold'`
    5. `order_event` INSERT (`event_type='walk_in_completed'`, details mit items/payment/session)
    6. Falls `customer_id`: Customer-Stats-Recalc triggern
  - Return: `{transaction_id, order_number, receipt_pdf_url}`
  - Datei: `backend/src/api/admin/pos/sessions/[id]/checkout/route.ts`

- [ ] **P0.5 — Customer API**
  - `GET /admin/pos/customer-search?q=` → Suche in `customer` (first_name, last_name, email) JOIN `customer_stats`. Top 10 Results. Felder: id, name, email, total_spent, total_purchases, is_vip.
  - `POST /admin/pos/customers` → Body: `{first_name, last_name, email?, phone?}`. Medusa Customer erzeugen + `customer_stats`-Row initialisieren.
  - Dateien:
    - `backend/src/api/admin/pos/customer-search/route.ts`
    - `backend/src/api/admin/pos/customers/route.ts`

- [ ] **P0.6 — Receipt PDF API**
  - `GET /admin/pos/transactions/:id/receipt` → A6-PDF (105x148mm) via pdfkit
  - Inhalt: Header (VOD Records, Adresse), Bon-Nr, Datum, Artikel-Liste (Titel, Format, Preis), Discount (falls), Gesamt, Zahlungsart, Footer ("Dry-Run — keine TSE-Signatur")
  - Content-Type: `application/pdf`, Content-Disposition: `inline; filename="VOD-POS-000001.pdf"`
  - Datei:
    - `backend/src/api/admin/pos/transactions/[id]/receipt/route.ts`
    - `backend/src/lib/pos-receipt.ts` (PDF-Generierung)

## Admin-UI

- [ ] **P0.7 — POS-Page Layout**
  - Datei: `backend/src/admin/routes/pos/page.tsx`
  - `defineRouteConfig({ label: "POS" })` — Top-Level-Route
  - Full-width Layout (kein PageShell max-width-Limit):
    - **Linke Spalte (60%):** Scan-Input (großes Input-Feld, autofocus, monospace), Scanner-Status-Indikator, zuletzt gescanntes Item als Preview-Card (Cover, Titel, Artist, Format, Jahr, Label, Preis)
    - **Rechte Spalte (40%):** Cart-Sidebar (Item-Liste mit Remove-Button, Subtotal, Discount-Input, Total), Customer-Panel, Payment-Radio-Buttons, "Verkauf abschliessen"-Button
  - Responsive: Ab <1024px einspaltiges Layout (Cart unter Scan)
  - Design: Admin-Tokens nutzen (C.gold, C.surface, etc.), DM Sans

- [ ] **P0.8 — POS-Page Interaction**
  - **Scanner-Input:** Keyboard-Event-Listener auf dem Input-Feld. Barcode-Scanner sendet Zeichen schnell hintereinander + Enter. Erkennung: wenn >4 Zeichen in <100ms getippt werden → Barcode-Scan (nicht manuelle Eingabe). Alternativ: einfach auf Enter reagieren und `VOD-`-Prefix prüfen.
  - **Cart-State:** Zustand Store (ephemer, kein DB-Persist). Actions: addItem, removeItem, setDiscount, setCustomer, setPaymentMethod, clearCart.
  - **Schutz-Checks bei Scan:**
    - API gibt `status: 'sold'` zurück → rote Alert "Bereits verkauft am {date}"
    - API gibt `in_auction: true` zurück → rote Alert "In aktivem Auction-Block '{block_title}'"
    - API gibt 404 zurück → gelbe Alert "Barcode nicht gefunden"
    - Erfolg → Item in Cart + Preview aktualisieren + Toast "Added"
  - **Customer-Panel:** 3-Modi-Toggle:
    - "Anonym" (default) — kein Eingabefeld
    - "Suchen" — Input mit Live-Suggestions (debounce 300ms, `/admin/pos/customer-search?q=`)
    - "Neu" — Inline-Formular (Vorname, Nachname pflicht; Email, Telefon optional)
  - **Checkout-Flow:**
    1. "Verkauf abschliessen" → Confirmation-Modal (Zusammenfassung: Items, Total, Kunde, Zahlungsart)
    2. Bei SumUp: Zwischen-Screen "Bitte am SumUp-Terminal kassieren" → "Zahlung erhalten"-Button
    3. Bei Bar/PayPal/Überweisung: direkt Checkout-API-Call
    4. Erfolg: Grüner Success-Screen mit Order-Number + PDF-Download-Link + "Nächster Verkauf"-Button (→ Cart reset, Scan-Input focus)
    5. Fehler: Rote Alert mit Fehlermeldung, Cart bleibt erhalten
  - **Stubs/Platzhalter:**
    - Gelber Banner oben: "Dry-Run Mode — Transaktionen ohne TSE-Signatur"
    - Tax-Mode-Toggle: disabled, Tooltip "Steuerberater-Freigabe ausstehend"

## PWA

- [ ] **P0.9 — PWA-Setup**
  - `backend/public/manifest.json`:
    ```json
    {
      "name": "VOD POS — Walk-in Sale",
      "short_name": "VOD POS",
      "start_url": "/app/pos",
      "scope": "/app/",
      "display": "standalone",
      "theme_color": "#1c1915",
      "background_color": "#1c1915",
      "icons": [
        {"src": "/icons/pos-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "/icons/pos-512.png", "sizes": "512x512", "type": "image/png"}
      ]
    }
    ```
  - `backend/public/sw.js`: Minimaler Service Worker — cacht nur App-Shell (HTML/CSS/JS), kein Offline-Data-Cache. `install` event: Cache öffnen + Shell-Assets cachen. `fetch` event: Cache-first für Shell, Network-first für API-Calls.
  - `backend/public/icons/`: POS-App-Icons generieren (192px + 512px PNG, dunkel mit Gold-Akzent)
  - Meta-Tags in Admin-HTML (Medusa Admin Customization oder `_document` override):
    - `<link rel="manifest" href="/manifest.json">`
    - `<meta name="apple-mobile-web-app-capable" content="yes">`
    - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
    - `<link rel="apple-touch-icon" href="/icons/pos-192.png">`
  - Install-Banner: Auf `/app/pos` prüfen ob `beforeinstallprompt` Event feuert → Banner "Für beste Erfahrung als App installieren" mit Dismiss-Button

## Integration

- [ ] **P0.10 — Operations-Hub-Card**
  - `backend/src/admin/routes/operations/page.tsx`: Neue HubCard im "Platform Tools" Grid
  - Icon: "🛒", Title: "POS / Walk-in Sale"
  - Description: "Scan barcodes, build cart, process walk-in sales. Prints receipt, updates inventory."
  - Status-Line: "Dry-Run Mode — no TSE" (gelb)
  - Href: `/app/pos`
  - Action-Label: "Open POS Terminal →"

- [ ] **P0.11 — Orders-Integration**
  - `/app/transactions` (bestehende Orders-Page): Walk-in-Sale-Transaktionen mit Badge "POS" (lila oder gold) anzeigen
  - Filter-Option `item_type=walk_in_sale` hinzufügen
  - Order-Number `VOD-POS-XXXXXX` statt `VOD-ORD-XXXXXX` anzeigen
  - Detail-View: Zahlungsart "Bar" / "SumUp" korrekt anzeigen, Fulfillment "Picked up" statt "Shipped"

---

## Reihenfolge

```
P0.1  Feature-Flag           ─┐
P0.2  DB-Migration            ├── Foundation (erst diese 2, dann alles andere)
                              ─┘
P0.3  Session + Cart API     ─┐
P0.4  Checkout API             │
P0.5  Customer API             ├── Backend API (parallel möglich)
P0.6  Receipt PDF API         ─┘
                               │
P0.7  POS-Page Layout        ─┤── Admin-UI (nach API)
P0.8  POS-Page Interaction   ─┘
                               │
P0.9  PWA-Setup              ─┤── PWA (parallel zu UI oder danach)
                               │
P0.10 Operations-Hub-Card    ─┤── Integration (zum Schluss)
P0.11 Orders-Integration     ─┘
```

## Validierung (nach Implementierung)

- [ ] Barcode scannen → Item erscheint in Cart mit Cover + Preis
- [ ] Zweiten Barcode scannen → zweites Item im Cart
- [ ] Bereits verkauftes Item scannen → rote Warnung, nicht hinzufügbar
- [ ] Item in aktiver Auction scannen → rote Warnung, nicht hinzufügbar
- [ ] Customer suchen → Suggestions erscheinen, Auswahl funktioniert
- [ ] Neuen Customer anlegen → erscheint danach in Suche
- [ ] Checkout mit "Bar" → Transaction in DB, Item status='sold', Order-Event geloggt
- [ ] Checkout mit "SumUp" → Zwischen-Screen "Zahlung erhalten?", dann wie Bar
- [ ] PDF-Quittung → Download funktioniert, Artikelliste + Summe korrekt
- [ ] Operations-Hub → POS-Card sichtbar, Link funktioniert
- [ ] Orders-Page → POS-Transaktionen mit Badge sichtbar
- [ ] PWA → Installierbar auf Mac (Chrome) und iPad (Safari)
- [ ] iPad-Layout → Einspaltiges Layout, Touch-friendly
- [ ] Cart löschen nach Checkout → Scan-Input hat wieder Focus
