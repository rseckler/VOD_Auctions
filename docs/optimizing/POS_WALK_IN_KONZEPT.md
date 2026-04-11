# POS Walk-in Sale — Kassen-Oberfläche für den Laden

**Version:** 1.0 (Draft)
**Erstellt:** 2026-04-11
**Autor:** Robin Seckler
**Status:** 📋 Konzept, wartet auf Freigabe + offene Entscheidungen (§10)
**Bezug:** `ERP_WARENWIRTSCHAFT_KONZEPT.md`, `INVENTUR_COHORT_A_KONZEPT.md` §14, `BROTHER_QL_820NWB_SETUP.md`

---

## 1. Kontext

Frank betreibt einen physischen Laden und verkauft dort regelmäßig Platten **zusätzlich** zum Online-Geschäft über `vod-auctions.com`. Heute gibt es **keine POS-Oberfläche** — Walk-in-Verkäufe werden ad-hoc abgewickelt, was zu zwei Problemen führt:

1. **Inventar-Drift**: Im Laden verkaufte Platten bleiben im Online-System als verfügbar → Overselling-Risiko, wenn gleichzeitig jemand online bestellt.
2. **Keine Kassenkonformität**: Bar-Verkäufe ohne TSE-Signierung sind in Deutschland nicht KassenSichV-konform, hohe Bußgeld-Risiken bei Betriebsprüfung.

**Use-Case-Volumen (von Frank):** 5+/Tag → eine dedizierte POS-Page ist gerechtfertigt, eine Quick-Action im Admin reicht nicht.

**Goal:** Frank steht im Laden, Kunde bringt eine Platte. Frank scannt den VOD-Barcode, das Item erscheint auf dem Mac/iPad, optional zweiter/dritter Scan für mehrere Platten, Zahlungsart wählen (Bar/Karte/PayPal), TSE-Signierung, Bon drucken, Items werden aus dem Inventar entfernt, Customer-Stats aktualisiert. Alles **in einer Oberfläche**, in <30 Sekunden pro Verkauf.

## 2. Franks Antworten (2026-04-11)

| Frage | Antwort | Konsequenz |
|---|---|---|
| **F1 — Frequenz im Laden?** | 5+ Verkäufe/Tag | Echte POS-Page mit Cart (Option B), nicht nur Admin Quick-Action |
| **F2 — Gedruckte Quittungen + TSE?** | Ja, brauchen wir | Cloud-TSE-Integration + Bon-Druck auf vorhandener Hardware |
| **F3 — Payment-Terminal?** | SumUp | Extern in Phase 1 (Frank kassiert am SumUp Air), SumUp-API-Integration in Phase 3 |
| **F4 — Kunden anlegen oder anonym?** | **Beides** — Kunden anlegen, aber anonym auch möglich | Customer-Panel mit 3 Modi: bestehend suchen / neu anlegen / anonym |

## 3. Architektur-Entscheidung

**Entscheidung:** Option B aus der Diskussion — **eigene POS-Admin-Route `/app/pos`**, cart-basiert, mit Cloud-TSE-Integration und Bon-Druck auf bestehender Hardware. **Keine** externe POS-Software (Shopify POS / Square / Lightspeed) — wir bleiben in **einem System** mit der bestehenden `transaction`-Tabelle als Source of Truth.

**Warum nicht externe POS-Software:**
- Doppelte Inventory-Wahrheit (VOD_Auctions + externes POS) erfordert permanenten Webhook-Sync mit Konflikt-Risiko
- Steuer-/Umsatz-Reporting über zwei Systeme ist Chaos
- Wir haben bereits `transaction`, `order_event`, `customer_stats`, `erp_inventory_item/movement` — alles was eine POS braucht

**Warum Option B statt A (nur Quick-Action):**
- Bei 5+ Verkäufen/Tag ist ein dedizierter POS-Screen schneller zu bedienen als wiederholtes Item-Suchen im Admin
- Cart erlaubt Mehrfachkäufe (Kunde nimmt 3 Platten gleichzeitig) → ein Zahlvorgang, ein Bon, eine Transaktion
- TSE-Signierung ist komplex und gehört in einen dedizierten Workflow, nicht in einen Modal-Dialog

**Warum Cloud-TSE statt Hardware-TSE:**
- Cloud-TSE (fiskaly, efsta, D-Trust Sign-me) ist ~10–20€/Monat + Cent-Bruchteile pro Bon, **keine** Hardware-Investition
- Hardware-TSE (z.B. Epson TSE-USB-Stick ~200€) erfordert physisches Device am POS-Mac und macht zukünftige iPad-Flexibilität kaputt
- Cloud-TSE ist per REST-API integrierbar, passt zum bestehenden Node-Backend-Stack

## 4. Datenmodell

### 4.1 Keine neuen Haupt-Tabellen — Erweiterung der existierenden

Wir bauen bewusst **kein** separates `pos_order` oder `walk_in_sale` Schema. Die bestehende `transaction`-Tabelle deckt Walk-in-Verkäufe ab, mit einer neuen `item_type`-Ausprägung:

**Existing `transaction` (Auction + Auctions + POS):**
- `item_type`: `auction` | `direct_purchase` | **`walk_in_sale`** ← NEU
- `order_number`: `VOD-ORD-XXXXXX` (Online) | **`VOD-POS-XXXXXX`** ← NEU (separate Sequenz für klare Trennung)
- `payment_provider`: `stripe` | `paypal` | **`sumup`** | **`cash`** | **`bank_transfer`** ← NEU
- `status`: `pending` → `paid` (Walk-in überspringt `pending` meist sofort)
- `fulfillment_status`: `unfulfilled` → **`picked_up`** ← NEU (Walk-in Äquivalent zu `shipped`/`delivered`)

### 4.2 Neue Spalten auf `transaction`

```sql
ALTER TABLE transaction
  ADD COLUMN pos_session_id TEXT,              -- Links zu pos_session (falls wir die noch wollen), NULL für Online
  ADD COLUMN tse_signature TEXT,               -- TSE-Signatur (Cloud-TSE response), required für payment_provider IN (cash, sumup)
  ADD COLUMN tse_transaction_number INTEGER,   -- fortlaufende TSE-Transaktions-Nr (pro TSE-Gerät)
  ADD COLUMN tse_signed_at TIMESTAMPTZ,        -- Zeitpunkt der TSE-Signierung
  ADD COLUMN tse_serial_number TEXT;           -- TSE-Seriennummer (aus Cloud-TSE-Setup)
```

### 4.3 Cart-Session — ephemer oder persistent?

**Entscheidung:** Ephemer im Client-State (Zustand), **nicht** in der DB persistiert. Begründung:
- Eine POS-Cart-Session dauert typisch <2 Min
- Wenn Frank aus Versehen die Browser-Session schließt, ist ein verlorenes Cart kein großes Problem (er scannt einfach nochmal)
- Persistierung würde Cleanup-Cron-Jobs und Abandoned-Cart-Logik erfordern — zu viel Overhead für den Benefit

Alternative, falls später doch gewollt: neue Tabelle `pos_session` mit `id, admin_user_id, status, created_at, expires_at`, Cleanup nach 1h.

### 4.4 Inventory Movements

Jeder Walk-in-Sale erzeugt:
- `transaction` Row mit `item_type='walk_in_sale'`
- Pro verkauftem Item ein `erp_inventory_movement` mit `type='outbound'`, `reason='walk_in_sale'`, `reference={transaction_id, pos_session_id}`
- `erp_inventory_item.status` → `sold`
- `order_event` für Audit-Trail (`event_type='walk_in_completed'`, `details={items, payment_method, tse_signature_hash}`)

### 4.5 Customer-Linkage

3 Modi:

**Mode A — bestehender Kunde:**
- Customer-Suche im POS (Input-Field, tippt Name oder E-Mail, Live-Suggestions aus `customer_stats`)
- Verkauf wird auf `transaction.customer_id` gesetzt → fließt in `customer_stats.total_spent / total_purchases` ein

**Mode B — neuer Kunde:**
- "+ Neuer Kunde" Button → Inline-Formular: Name (pflicht), E-Mail (optional), Telefon (optional)
- Erzeugt Medusa `customer` (leere Stripe-ID) + `customer_stats` Row
- Danach wie Mode A

**Mode C — anonym:**
- Default. Kein Customer-Panel-Eingriff nötig
- `transaction.customer_id` = NULL, `transaction.metadata.walk_in_anonymous = true`
- Umsatz fließt in **nicht** in `customer_stats`, aber in globale `sync_log`/`order_event`-Statistiken

## 5. Admin POS-UI (`/app/pos`)

### 5.1 Route-Registrierung

- Neues Sidebar-Item? **Nein** — POS gehört nicht in die Top-8-Hubs. Stattdessen:
  - **Eigene Route** `/app/pos` erreichbar via **Operations-Hub** → HubCard „POS / Walk-in Sale"
  - Direkt-URL bookmarkable, damit Frank einen Chrome-Tab permanent offen hat

### 5.2 Layout

**Full-width Layout, optimiert für Mac-Display + iPad-Landscape:**

```
┌───────────────────────────────────────────────────────────────────────┐
│  PageHeader: "POS / Walk-in Sale"              Session #: VOD-POS-XXX │
├─────────────────────────────────────┬─────────────────────────────────┤
│  SCAN-INPUT (große Input-Zeile,    │  CART SIDEBAR                   │
│  automatisch fokussiert)            │  ─────────────                  │
│  ┌────────────────────────────┐     │  [Item 1: Cabaret Voltaire]     │
│  │ Scan barcode to add...     │     │    Red Mecca · LP          €45  │
│  └────────────────────────────┘     │    [Remove]                     │
│                                     │  [Item 2: Einstürzende Neub.]   │
│  🟢 Scanner ready                   │    Halber Mensch · LP      €55  │
│  📷 Last scan: VOD-000042          │    [Remove]                     │
│                                     │  ─────────────                  │
│  CURRENT ITEM PREVIEW               │  Subtotal:              €100    │
│  ┌──────┐  Einstürzende Neubauten  │  Discount: [______] €     €0    │
│  │cover │  Halber Mensch            │  Total:                 €100    │
│  │      │  LP · DE · VG+ · 1985    │                                 │
│  │      │  Mute Records             │  ─────────────                  │
│  └──────┘  Price: €55              │  Customer: [Anonymous ▼]        │
│                                     │  [+ Kunden suchen/anlegen]      │
│  [Remove from Cart]                 │                                 │
│                                     │  Payment:                       │
│                                     │  ( ) SumUp Karte                │
│                                     │  ( ) Bar                        │
│                                     │  ( ) PayPal                     │
│                                     │  ( ) Überweisung                │
│                                     │                                 │
│                                     │  [Verkauf abschließen →]        │
└─────────────────────────────────────┴─────────────────────────────────┘
```

### 5.3 Interaction Flow

1. **Page laden** → Scan-Input ist automatisch fokussiert, Scanner ready (via `onScan.js`)
2. **Scanner piept** → Barcode `VOD-000042` → `GET /admin/erp/inventory/scan/:barcode` → Item wird in Cart hinzugefügt + Preview aktualisiert
3. **Weitere Scans** → mehrere Items landen im Cart
4. **Customer wählen** (optional) — Default bleibt Anonymous
5. **Zahlungsart wählen** — Radio-Buttons, default: SumUp Karte (häufigster Fall)
6. **„Verkauf abschließen"** klicken →
   - **TSE-Signierung** via Cloud-API (fiskaly/efsta): Payload enthält Umsatz, Steuern, Zahlungsart → TSE-Response mit Signatur+Counter
   - Wenn SumUp: Dialog „Kunde soll am SumUp-Terminal zahlen. Bestätige Zahlung eingegangen." → Frank klickt „Zahlung erhalten" **nachdem** SumUp-Terminal die Zahlung bestätigt hat
   - Wenn Bar: sofortige Fortsetzung (TSE-Signierung ist für Bar besonders wichtig)
   - Wenn PayPal: QR-Code anzeigen, Kunde scannt, Zahlung eingegangen-Bestätigung
7. **Nach Zahlung:**
   - `transaction` wird erzeugt mit `status='paid'`, `fulfillment_status='picked_up'`, `tse_signature=...`
   - Alle Items auf `erp_inventory_item.status='sold'` + `erp_inventory_movement.type='outbound'`
   - `order_event` Audit-Eintrag
   - Customer-Stats-Recalc triggern (wenn Kunde gesetzt)
   - **Bon-Druck** auf Brother QL-820NWB (62mm Rolle) oder Fallback A6 auf System-Drucker
8. **Cart wird geleert**, zurück zu Schritt 1

### 5.4 Error-Cases

- **Barcode-Item nicht gefunden**: Warnung, Frank kann manuell im Admin suchen
- **Barcode-Item bereits `sold`**: Rote Warnung „Dieses Item wurde bereits verkauft am <date> um <time>", Add-to-Cart blockiert
- **Barcode-Item in aktiver Auction**: Rote Warnung „Dieses Item ist aktuell im Auction-Block XYZ — Verkauf im Laden würde den Auction-Bestand korruptieren", Add-to-Cart blockiert
- **TSE-Cloud-API down**: Fallback → Transaktion mit `tse_signature=PENDING`, Bon wird mit „TSE offline, Nachsignierung folgt" gedruckt, Background-Job retriet

## 6. SumUp-Integration

**Phase 1 (jetzt): Externes Terminal**
- Frank hat ein SumUp Air (Bluetooth-Terminal ~30€ einmalig, 1.75% pro Transaktion)
- Im POS-UI: Frank wählt „SumUp Karte", klickt „Verkauf abschließen"
- Frank tippt den Betrag **manuell** am SumUp-Terminal ein, Kunde zahlt
- SumUp-Terminal bestätigt mit grünem Haken
- Frank klickt im POS-UI auf „Zahlung erhalten ✓" → Transaktion wird committed
- **Keine** API-Integration in Phase 1 — einfach, robust, 0€ Entwicklungs-Overhead

**Phase 2 (später, Nice-to-have): SumUp REST API**
- SumUp bietet eine REST API für Händler-Accounts (`api.sumup.com`)
- Wir könnten per Backend-Call einen Payment direkt auf dem Terminal anstoßen (Terminal zeigt dann den Betrag automatisch, Frank muss nichts tippen)
- Vorteil: spart 5 Sek pro Transaktion, weniger Tippfehler
- Kein Muss — nur wenn Volumen das rechtfertigt

## 7. TSE-Integration (KassenSichV-Konformität)

### 7.1 Anbieter-Optionen

| Anbieter | Typ | Kosten (ca.) | Status |
|---|---|---|---|
| **fiskaly** | Cloud-TSE, REST API | ~15€/Monat + 0.01€ pro Bon | ✅ Etablierter Marktführer, DE |
| **efsta** | Cloud-TSE, REST API | ~10€/Monat | ✅ Alternative, AT/DE |
| **D-Trust / Swissbit** | Hardware-USB-Stick | ~200€ einmalig | ❌ Hardware-lock-in, kein Cloud |
| **Epson TSE** | Hardware-Drucker-integriert | ~300€ | ❌ Nur mit Epson-POS-Druckern |

**Empfehlung: fiskaly** (eine Entscheidung, die vor Implementierung bestätigt werden muss — siehe §10).

### 7.2 Integration

- **Setup:** fiskaly-Account anlegen, TSE-Gerät virtuell registrieren, Seriennummer in `.env` als `FISKALY_TSE_SERIAL`, API-Credentials in `.env`
- **Pro Transaktion:** Backend-Call `POST https://kassensichv.io/api/v2/tss/{tssId}/tx` mit Payload {betrag, steuer, zahlungsart, zeitpunkt} → Response mit `signature`, `time_start`, `time_end`, `transaction_number`
- **Gespeichert in `transaction`:** `tse_signature`, `tse_transaction_number`, `tse_signed_at`, `tse_serial_number`
- **Auf dem Bon:** TSE-Signatur + TSE-Seriennummer + QR-Code (enthält Transaktions-Hash, Pflicht für KassenSichV)

### 7.3 Daily TSE Export

Für die Steuerberater-Übergabe (DSFinV-K-Format) brauchen wir einen täglichen Export aller TSE-signierten Transaktionen. Das ist ein nightly Cron-Job: `SELECT * FROM transaction WHERE tse_signed_at >= yesterday AND item_type='walk_in_sale'` → exportiert als DSFinV-K-konforme CSV ins `./exports/dsfinvk/YYYY-MM-DD.csv`.

## 8. Bon-Druck

### 8.1 Hardware-Optionen

**Option X — bestehender Brother QL-820NWB + DK-22205 (62mm Rolle)**
- Gleicher Drucker, andere Rolle (62mm weißes Endlosband, ~€10/Rolle, ~30m)
- Bon ist 62mm breit, Länge variabel (typisch 80-120mm pro Bon)
- ✅ **Nutzt bestehende Hardware**, nur eine zweite Rolle nötig
- ✅ Hardware-Setup + CUPS-Pipeline bereits validiert
- ❌ Nicht-Standard-Bon-Größe (meist nutzen POS-Systeme 58mm oder 80mm Thermo-Rollen)
- ❌ Papier ist nicht hitze-sensitiv → der Brother thermotransfer-druckt nicht dauerhaft (UV-Bleaching-anfällig)

**Option Y — Dedicated POS-Thermodrucker**
- Z.B. Epson TM-m30III oder Star TSP654 (~150-250€)
- 80mm Thermo-Papier, echter POS-Bon-Standard
- ESC/POS Protokoll, einfach zu steuern
- ✅ Industriestandard, langlebig, richtige Bon-Papier-Qualität
- ❌ Zusätzliche Hardware-Anschaffung

**Option Z — A6 PDF auf System-Drucker**
- Bon wird als A6-PDF (105×148mm) generiert (mit `pdfkit`, wie die bestehenden Invoices)
- Druckt auf Franks normalen Tintenstrahl-/Laser-Drucker
- ✅ Kein zusätzlicher Drucker, sieht professionell aus
- ❌ A6 im Laden unpraktisch, Kunden erwarten Thermo-Bon

**Empfehlung: Option X (Brother QL-820NWB + DK-22205 62mm Rolle)** in Phase 1, Option Y (dedizierter POS-Thermo) in Phase 2 falls sich die UV-Bleaching-Sorge bestätigt.

### 8.2 Bon-Layout (KassenSichV-konform)

```
┌──────────────────────────────────────────┐  62mm
│          VOD RECORDS                      │
│       vod-auctions.com                    │
│       [Adresse aus impressum]             │
│       USt-ID: [wenn vorhanden]            │
│ ─────────────────────────────────────    │
│ Bon-Nr: VOD-POS-000123                    │
│ Datum: 2026-04-11 14:23                   │
│ Kasse: VOD-MAIN-001                       │
│ ─────────────────────────────────────    │
│ Cabaret Voltaire                          │
│   Red Mecca · LP               €45,00     │
│                                           │
│ Einstürzende Neubauten                    │
│   Halber Mensch · LP           €55,00     │
│ ─────────────────────────────────────    │
│ Zwischensumme:                 €100,00    │
│ MwSt 19% (enthalten):           €15,97    │
│ ─────────────────────────────────────    │
│ GESAMT:                        €100,00    │
│                                           │
│ Zahlung: SumUp Kartenzahlung              │
│ ─────────────────────────────────────    │
│ TSE-Signatur:                             │
│ abc123def456... (gekürzt)                 │
│ TSE-Seriennummer: F1SK4LY-12345          │
│ Transaktions-Nr: 42                       │
│ Start: 14:23:15 Ende: 14:23:17            │
│                                           │
│ ▓▓ QR-Code (TSE-Hash) ▓▓                  │
│                                           │
│ Vielen Dank für Ihren Einkauf!            │
└──────────────────────────────────────────┘
```

**Pflichtfelder nach KassenSichV §6:**
1. Vollständiger Name und Anschrift des Leistenden
2. Datum und Uhrzeit der Belegausstellung + Zeitpunkt der Transaktion
3. Menge und Art der gelieferten Gegenstände
4. Entgelt und Steuerbetrag
5. Transaktionsnummer (fortlaufend)
6. Seriennummer der TSE
7. QR-Code mit TSE-Signatur (optional aber empfohlen)

## 9. Neue Admin-API-Routes

| Method | Path | Body | Effekt |
|---|---|---|---|
| POST | `/admin/pos/sessions` | `{}` | Neue ephemere Session, returns `session_id` (UUID) |
| POST | `/admin/pos/sessions/:id/items` | `{barcode}` | Scan-Lookup + Add to Cart, returns `item` |
| DELETE | `/admin/pos/sessions/:id/items/:itemId` | — | Remove from Cart |
| POST | `/admin/pos/sessions/:id/checkout` | `{customer_id?, payment_provider, discount_eur?}` | TSE-Signierung + `transaction`-Erzeugung + `inventory_movement` + `order_event` + Bon-PDF-Generierung. Returns `{transaction_id, order_number, tse_signature, receipt_pdf_url}` |
| GET | `/admin/pos/transactions/:id/receipt` | — | Bon-PDF-Download |
| POST | `/admin/pos/transactions/:id/print-receipt` | `{printer_name?}` | Sendet Bon an QL-820NWB (oder anderen Drucker) |
| GET | `/admin/pos/customer-search` | `?q=` | Live-Suche in `customer_stats`, returns top 10 matches |
| POST | `/admin/pos/customers` | `{name, email?, phone?}` | Neuen Customer anlegen (minimal) |

Alle Routes unter `requireFeatureFlag('POS_WALK_IN')` (neues Flag, default OFF).

## 10. Offene Entscheidungen

Vor Implementierungs-Start muss Frank (oder der Steuerberater) folgendes klären:

1. **TSE-Anbieter**: fiskaly (Empfehlung) vs. efsta vs. andere? **Preise konkret vergleichen.**

2. **Kleinunternehmer-Status nach §19 UStG?** — wenn ja, dann **kein MwSt-Ausweis auf dem Bon**, dafür Pflicht-Hinweis „Kein Ausweis von Umsatzsteuer aufgrund Kleinunternehmerregelung gem. §19 UStG". Das ändert das Bon-Layout signifikant. → **Steuerberater fragen.**

3. **Bon-Druck-Hardware**: Option X (bestehender QL-820NWB + 62mm Rolle) vs. Option Y (dedizierter POS-Thermo)? Bei Option X: welche Rolle bestellen (DK-22205 weiß 62mm × 30,48m)?

4. **Kassensturz-Workflow**: Wird Frank täglich/wöchentlich einen Kassensturz-Report brauchen (Summe aller POS-Verkäufe, Aufteilung nach Zahlungsart)? → Falls ja, eigene Admin-Page `/app/pos/reports`.

5. **Retoure-Szenario**: Kunde bringt eine gekaufte Platte zurück. Wie wird das abgewickelt? Eine Teil-Retour-Transaction mit negativem Betrag + TSE-Storno-Signierung ist KassenSichV-konform, aber nicht-trivial. **Punkt für Phase 2.**

6. **Storefront-Conflict**: Wenn Frank eine Platte im Laden verkauft, die gerade online in einem Live-Auktions-Block ist, ist das ein harter Konflikt (der Online-Höchstbietende wird enttäuscht). Lösung: POS blockt Add-to-Cart für Items in `block_item.status='active'`. Aber: wie reagieren wir, wenn Frank trotzdem im Laden verkauft (override)? → Hard-block mit Admin-Override? Oder weiche Warnung?

7. **Mobile (iPad) vs. Desktop**: Der POS-Screen muss auf iPad funktionieren (im Laden vermutlich Tablet-Workflow). CSS/Layout-Anpassungen nötig.

8. **SumUp-Integration-Level**: Phase 1 (extern) ist klar. Phase 2 (REST API) nur wenn Frank das wirklich will — klären, wenn Phase 1 läuft.

## 11. Implementierungs-Phasen

**Phase P1 — Core POS-UI (ohne TSE, ohne Bon-Druck, mit Mock)**
*Ziel: Ein Walk-in-Sale kann end-to-end abgewickelt werden, Transaktion landet in `transaction`-Tabelle, Items werden sold, Customer-Stats aktualisiert. Bon ist ein einfaches A4-PDF ohne TSE-Signatur.*

| Task | Aufwand |
|---|---|
| Migration: `transaction.pos_session_id`, `tse_*` Spalten | 1h |
| POS-Session-State (Zustand client-side, Cart-Management) | 2h |
| Admin-Route `/app/pos` mit Layout, Scan-Input, Cart-Sidebar | 4h |
| `onScan.js` Integration (baut auf Phase B6 aus Inventur auf) | bereits done |
| API-Routes `/admin/pos/sessions/*` (+`/items`, `/checkout`, `/customer-search`) | 4h |
| `transaction`-Erzeugung + `inventory_movement` + `order_event` in einer DB-Transaktion | 3h |
| Mock-Bon-Generierung (A6 PDF via pdfkit, **ohne** TSE-Signatur) | 2h |
| Feature-Flag `POS_WALK_IN` + Registry-Eintrag | 30min |
| Operations-Hub-Card „POS / Walk-in Sale" | 30min |
| **Summe P1** | **~2 Tage** |

**Phase P2 — TSE-Integration**
*Ziel: Alle POS-Transaktionen sind KassenSichV-konform signiert.*

| Task | Aufwand |
|---|---|
| fiskaly-Account anlegen, TSE registrieren, API-Credentials | 2h |
| Backend-Service `lib/tse.ts` mit `signTransaction()` Funktion | 3h |
| Integration in `POST /admin/pos/sessions/:id/checkout` — TSE-Call vor `transaction`-Insert | 2h |
| Fehlerbehandlung: TSE-down → `tse_signature=PENDING`, Background-Retry | 3h |
| Bon-Template um TSE-Signatur + QR-Code erweitern | 2h |
| DSFinV-K Export-Cron (nightly CSV nach `./exports/dsfinvk/`) | 3h |
| **Summe P2** | **~2 Tage** |

**Phase P3 — Bon-Druck (Brother QL-820NWB + 62mm Rolle)**
*Ziel: Professioneller Kassenbon auf dem vorhandenen Brother-Drucker, wenn Option X gewählt.*

| Task | Aufwand |
|---|---|
| Bon-Layout in `lib/pos-receipt.ts` (pdfkit, 62mm × variable Länge) | 4h |
| KassenSichV-Pflichtfelder vollständig (Kleinunternehmer-Hinweis, TSE, QR) | 2h |
| QR-Code-Generierung (`bwip-js` qrcode) | 1h |
| CUPS-Print-Option `PageSize=Custom.62x<length>mm` + Rolle-Wechsel-Instruktion | 2h |
| `POST /admin/pos/transactions/:id/print-receipt` Route | 1h |
| **Summe P3** | **~1 Tag** |

**Phase P4 — SumUp REST API (optional, später)**
*Ziel: Payment-Terminal wird direkt vom Backend angesprochen, kein manuelles Eintippen.*

| Task | Aufwand |
|---|---|
| SumUp Merchant API-Account, OAuth-Flow | 1 Tag |
| `lib/sumup.ts` Backend-Service | 1 Tag |
| POS-UI: „SumUp: Terminal wartet…" Polling-State | 4h |
| Fallback auf externe Zahlung bei API-Fehler | 2h |
| **Summe P4** | **~2-3 Tage** |

**Gesamtaufwand P1-P3 (Mindest-Funktionsumfang produktiv):** ~5 Arbeitstage
**Gesamtaufwand P1-P4 (vollständig):** ~7-8 Arbeitstage

## 12. Abhängigkeiten / Voraussetzungen

- ✅ **ERP_INVENTORY Flag aktiv** (für `erp_inventory_movement` Logging) — aktuell OFF, muss vor POS-Launch ON
- ✅ **Barcode-Label + Scanner validiert** (Setup-Doku fertig) — ✅ done am 2026-04-11
- ✅ **Cohort-A Items haben Barcode** (aus Inventur-Session) — erforderlich, damit Scanning funktioniert
- ⏳ **Steuerberater-Freigabe** für Bon-Pflichtfelder + Kleinunternehmer-Status — **offen**
- ⏳ **fiskaly-Account** (oder Alternativ-TSE-Anbieter) — **offen**
- ⏳ **DK-22205 62mm Rolle bestellen** (falls Option X für Bon-Druck) — **offen**

## 13. Referenzen

- **ERP-Konzept:** `docs/optimizing/ERP_WARENWIRTSCHAFT_KONZEPT.md` (transaction, inventory_movement, customer Schema)
- **Inventur-Konzept:** `docs/optimizing/INVENTUR_COHORT_A_KONZEPT.md` (Scanner + Barcode-Workflow)
- **Hardware-Setup:** `docs/hardware/BROTHER_QL_820NWB_SETUP.md`
- **KassenSichV:** [§146a AO](https://www.gesetze-im-internet.de/ao_1977/__146a.html), [KassenSichV](https://www.gesetze-im-internet.de/kassensichv/)
- **fiskaly-Doku:** https://developer.fiskaly.com/
- **SumUp-Doku:** https://developer.sumup.com/

---

**Next Action:** Nach Freigabe dieses Konzepts + Klärung der offenen Entscheidungen aus §10 → Start mit Phase P1 (Core POS-UI).
