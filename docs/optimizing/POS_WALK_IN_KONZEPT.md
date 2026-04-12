# POS Walk-in Sale — Kassen-Oberfläche für den Laden

**Version:** 1.1
**Erstellt:** 2026-04-11
**Aktualisiert:** 2026-04-12
**Autor:** Robin Seckler
**Status:** 🚧 Phase P0 (Dry-Run) in Implementierung — offene Entscheidungen (§11) blockieren P1-P4, nicht P0
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

### 3.1 UX-Form: PWA statt Browser-Tab oder Native App

**Entscheidung (2026-04-12):** Die POS-Oberfläche wird als **Progressive Web App (PWA)** ausgeliefert — nicht als reiner Browser-Tab und nicht als native Desktop-/Tablet-App (Electron/Tauri).

**Bewertete Optionen:**

| Option | Beschreibung | Urteil |
|---|---|---|
| **A — Browser-Tab** | `/app/pos` als normaler Admin-Tab in Chrome/Safari | ❌ Browser-Chrome (Tabs, URL-Leiste) frisst Platz, versehentliches Tab-Schließen, fühlt sich nicht wie Kassen-App an |
| **B — PWA** | Gleiche Web-App + `manifest.json` + Service Worker → installierbar als App auf Mac/iPad, Fullscreen, eigenes Dock-Icon | ✅ **Gewählt** |
| **C — Electron/Tauri** | Native Mac-App die das Frontend wrapped | ❌ Massiver Overhead (Build-Pipeline, Auto-Updates, Code-Signing), separates Deployment, kein iPad-Support |

**Warum PWA:**
- Frank bekommt ein **"VOD POS" Icon** im Mac-Dock und auf dem iPad-Homescreen
- **Fullscreen ohne Browser-Chrome** — sieht aus und fühlt sich an wie eine native Kassen-App
- **Kein versehentliches Tab-Schließen** (eigenes Fenster, nicht im Browser-Tab-Kontext)
- Scanner-Input funktioniert identisch (PWA bekommt Keyboard-Events wie jeder Browser)
- **Kein separates Deployment** — ein `npx medusa build` updated alles, wie jede andere Admin-Route
- Minimaler Mehraufwand: `manifest.json` + minimaler Service Worker + iOS-Meta-Tags (~2h)
- Einzige Einschränkung vs. native App: kein Offline-Mode — aber das brauchen wir nicht (POS braucht Live-DB-Zugriff für Inventory-Checks, ohne Internet kann Frank nicht verkaufen)

**PWA-Implementierung:**
- `manifest.json` in Admin-Build-Output (`backend/public/`) mit `display: standalone`, `theme_color: #1c1915`, App-Name "VOD POS"
- Minimaler Service Worker: nur App-Shell-Caching (HTML, CSS, JS), **kein** Offline-Daten-Cache
- iOS-Unterstützung: `<meta name="apple-mobile-web-app-capable">` + `apple-touch-icon` in Admin-HTML
- Install-Prompt: Beim ersten Öffnen von `/app/pos` ein Banner "Für beste Erfahrung: App installieren" mit Anleitung (Mac: Chrome → ⋮ → "App installieren" / Safari → Datei → "Zum Dock hinzufügen"; iPad: Safari → Teilen → "Zum Home-Bildschirm")

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
  -- TSE (KassenSichV)
  ADD COLUMN tse_signature TEXT,               -- TSE-Signatur (Cloud-TSE response), required für payment_provider IN (cash, sumup)
  ADD COLUMN tse_transaction_number INTEGER,   -- fortlaufende TSE-Transaktions-Nr (pro TSE-Gerät)
  ADD COLUMN tse_signed_at TIMESTAMPTZ,        -- Zeitpunkt der TSE-Signierung
  ADD COLUMN tse_serial_number TEXT,           -- TSE-Seriennummer (aus Cloud-TSE-Setup)
  -- Tax / USt (siehe §8 Tax-Handling)
  ADD COLUMN tax_mode TEXT NOT NULL DEFAULT 'standard',  -- 'standard' (DE/EU, USt enthalten) | 'export_tax_free' (Drittland, §6 UStG)
  ADD COLUMN tax_rate_percent NUMERIC(5,2),    -- angewandter USt-Satz in Prozent (19.00 oder 0.00)
  ADD COLUMN tax_amount NUMERIC(10,2),         -- enthaltener Steuerbetrag in EUR (null wenn tax_mode='export_tax_free')
  ADD COLUMN customer_country_code TEXT,       -- ISO 3166 alpha-2 (z.B. 'US', 'CH', 'JP') — Pflicht wenn tax_mode='export_tax_free'
  ADD COLUMN export_declaration_issued_at TIMESTAMPTZ,   -- Zeitpunkt an dem die Ausfuhr-/Abnehmerbescheinigung ausgehändigt wurde
  ADD COLUMN export_declaration_confirmed_at TIMESTAMPTZ; -- Zeitpunkt an dem der Zoll-Stempel eingegangen ist (nachträglich durch Frank)
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

**Empfehlung: fiskaly** (eine Entscheidung, die vor Implementierung bestätigt werden muss — siehe §11).

### 7.2 Integration

- **Setup:** fiskaly-Account anlegen, TSE-Gerät virtuell registrieren, Seriennummer in `.env` als `FISKALY_TSE_SERIAL`, API-Credentials in `.env`
- **Pro Transaktion:** Backend-Call `POST https://kassensichv.io/api/v2/tss/{tssId}/tx` mit Payload {betrag, steuer, zahlungsart, zeitpunkt} → Response mit `signature`, `time_start`, `time_end`, `transaction_number`
- **Gespeichert in `transaction`:** `tse_signature`, `tse_transaction_number`, `tse_signed_at`, `tse_serial_number`
- **Auf dem Bon:** TSE-Signatur + TSE-Seriennummer + QR-Code (enthält Transaktions-Hash, Pflicht für KassenSichV)

### 7.3 Daily TSE Export

Für die Steuerberater-Übergabe (DSFinV-K-Format) brauchen wir einen täglichen Export aller TSE-signierten Transaktionen. Das ist ein nightly Cron-Job: `SELECT * FROM transaction WHERE tse_signed_at >= yesterday AND item_type='walk_in_sale'` → exportiert als DSFinV-K-konforme CSV ins `./exports/dsfinvk/YYYY-MM-DD.csv`.

## 8. Tax-Handling: Standard 19% vs. Steuerfreier Export (§6 UStG)

**Nach Franks Wunsch (2026-04-11):** Das POS muss eine **steuerfreie Abrechnung für Kunden aus Nicht-EU-Ländern** unterstützen. Ohne diese Option müsste Frank jedem Drittland-Käufer die volle USt (19%) berechnen, obwohl der Kunde bei einer Ausfuhrlieferung eigentlich keine deutsche USt tragen müsste.

### 8.1 Rechtliche Grundlage (in zwei Sätzen)

Ausfuhrlieferungen in Drittländer (= Nicht-EU) sind nach **§4 Nr. 1a + §6 UStG** umsatzsteuerfrei, wenn der Händler den **Ausfuhrnachweis** und den **Abnehmernachweis** erbringen kann. EU-Länder fallen **nicht** darunter (innergemeinschaftliche Lieferungen haben eigene Regeln via OSS/Reverse-Charge), Drittländer schon.

**Praktische Konsequenz:** Frank darf einem Drittland-Käufer im Laden die USt sparen, muss aber beweisen können, dass die Ware Deutschland tatsächlich verlassen hat. Ohne Nachweis droht bei der Betriebsprüfung Nachversteuerung plus Säumniszuschläge.

### 8.2 Zwei Varianten für Walk-in-Kunden

#### Variante A: Steuerfrei direkt ausstellen (Handheld)

- Kunde kommt in den Laden, zahlt **ohne USt** (38€ statt 45,22€ bei 19% USt-Basis)
- Frank händigt **zwei zusätzliche Dokumente** aus:
  1. **Ausfuhr- und Abnehmerbescheinigung** (amtliches Formular des BMF, als PDF generiert, 1 Seite, mit vorab ausgefüllten Händler-, Kunden- und Artikel-Daten) — der Kunde nimmt sie mit, lässt sie beim Ausreise-Zoll abstempeln, und sendet sie per Post oder E-Mail zurück
  2. **Quittung/Rechnung ohne USt** mit explizitem Hinweis „Steuerfreie Ausfuhrlieferung gem. §6 UStG, Nachweis folgt"
- Frank trackt im POS die offene Nachweis-Verpflichtung (`transaction.export_declaration_issued_at` gesetzt, `export_declaration_confirmed_at` noch NULL)
- Bei Eingang des Zoll-Stempels (physisch oder per Foto/E-Mail) setzt Frank im Admin manuell `export_declaration_confirmed_at`
- **Risiko für Frank:** Wenn der Nachweis ausbleibt (Kunde vergisst's, Brief geht verloren), muss Frank nach einer Nachfrist (typisch 3–6 Monate) die USt nachversteuern. Aktuell deutsches Risiko-Modell: Rückstellung in den Büchern bilden, bis Nachweis da ist.

#### Variante B: Zunächst 19% berechnen, nach Nachweis erstatten

- Kunde zahlt die volle Summe inkl. 19% USt
- Frank händigt die Ausfuhr-/Abnehmerbescheinigung mit aus
- Kunde schickt den abgestempelten Nachweis zurück
- Frank überweist die USt-Erstattung (7,22€ bei 45,22€)
- **Vorteil:** Kein Risiko für Frank (kein Vorschuss ohne Nachweis). **Nachteil:** Aufwändiger Rückerstattungsprozess, weniger kundenfreundlich.

**Empfehlung: Variante A** (direkt steuerfrei) — einfacher für Kunden, in Deutschland seit jeher Standard für Laden-Touristen-Sales. Das Risiko wird über eine Prozess-Regel mitigiert: Nur für **namentlich identifizierte Kunden mit verifizierter Drittland-Anschrift**, und eine Rückstellung in der Buchhaltung für pending Nachweise.

### 8.3 UI-Impact im POS

Im POS-Checkout-Dialog ein neuer **Tax-Mode-Toggle**:

```
Payment:                    Tax Mode:
( ) SumUp Karte             ( • ) Standard (19% USt enthalten)
( ) Bar                     (   ) Steuerfrei Export (§6 UStG — Drittland)
( ) PayPal
( ) Überweisung

   [Verkauf abschließen →]
```

Wenn **„Steuerfrei Export"** aktiv → der Customer-Panel erzwingt **Mode B „Neuer Kunde" oder Mode A „Bestehend"** (niemals „Anonymous"), mit Pflichtfeldern:
- Vollständiger Name
- Vollständige Drittland-Anschrift (Straße, PLZ, Stadt, Land)
- Pass- oder Ausweisnummer (optional, aber empfohlen für Nachweis-Sicherheit)
- Land-Code (ISO 3166 alpha-2, z.B. `US`, `CH`, `JP`) — wird in `transaction.customer_country_code` gespeichert

**Validierung beim „Verkauf abschließen":**
- Wenn `tax_mode='export_tax_free'` und `customer_country_code` ist in EU-Liste (`DE`, `AT`, `FR`, `IT`, ... — 27 Länder) → **Fehler**, „§6 UStG gilt nur für Drittländer, nicht EU"
- Wenn `customer_country_code` ist NULL → **Fehler**, „Kundenland muss erfasst sein"
- Wenn Customer-Mode = Anonymous → **Fehler**, „Steuerfreier Export erfordert namentlich identifizierten Kunden"

**Preis-Berechnung:**
- Standard-Mode: Totalsumme enthält 19% USt (z.B. 45,22€ → Netto 38,00€, USt 7,22€). Das `transaction.total` bleibt 45,22€, `tax_rate_percent = 19.00`, `tax_amount = 7.22`.
- Export-Mode: Totalsumme ist Netto (z.B. 38,00€). `transaction.total = 38.00`, `tax_rate_percent = 0.00`, `tax_amount = 0.00`.

**Wichtig zu entscheiden (§11 Punkt 9):** Werden die in der Inventur erfassten `legacy_price`-Werte als **Netto** oder als **Brutto (USt enthalten)** interpretiert? Das ist eine steuerliche Grundsatzfrage, die Franks Steuerberater beantworten muss, weil sie die gesamte Preis-Logik betrifft (nicht nur POS, auch Online-Shop).

### 8.4 Bon-Layout-Variante für Steuerfrei (siehe §9 Bon-Druck)

Für `tax_mode='export_tax_free'` druckt das POS **zwei Dokumente** statt nur den Standard-Bon:

1. **Kassenbon (62mm Thermo)**, angepasst:
   - Zwischensumme und Gesamt ohne USt
   - Kein „MwSt 19% enthalten"-Zeile
   - Neue Zeile: **„Steuerfreie Ausfuhrlieferung gem. §6 UStG"**
   - Neue Zeile: **„Kunden-Land: \<Country\>"**
   - TSE-Signatur bleibt drauf (jeder Bar-/POS-Verkauf muss signiert sein, auch steuerfreie)

2. **Ausfuhr- und Abnehmerbescheinigung (A4 PDF, Standard-Drucker)**:
   - Vorab ausgefüllt mit Händler-Daten (VOD Records, USt-ID, Adresse), Kunden-Daten (Name, Adresse Drittland), Artikel-Daten (Anzahl, Bezeichnung, Netto-Wert, Bon-Nr)
   - Leere Felder für Zoll-Stempel + Datum der Ausreise
   - PDF-Template folgt BMF-Muster (offizielles Formular „Ausfuhr- und Abnehmerbescheinigung für Umsatzsteuerzwecke bei Ausfuhren im nichtkommerziellen Reiseverkehr")
   - Generiert via `pdfkit` auf A4, 1 Seite, PDF-Download + Auto-Print im Standard-Drucker

### 8.5 Tracking offener Nachweise

Neue Admin-Sub-Page unter `/app/pos/tax-free-pending` (oder als Tab im POS-Reports): Liste aller `transaction` wo `tax_mode='export_tax_free' AND export_declaration_confirmed_at IS NULL`, sortiert nach `created_at DESC`. Frank sieht:

- Bon-Nr, Datum, Kunde, Land, Netto-Betrag, USt-Risiko (19% vom Netto als Rückstellungs-Hinweis)
- Action-Button „Nachweis bestätigt" (öffnet Datumsauswahl, setzt `export_declaration_confirmed_at`)
- Action-Button „Nachweis vermisst → USt nachversteuern" (erzeugt eine Korrektur-Transaktion mit positivem USt-Betrag, markiert die ursprüngliche Transaktion als „nicht nachgewiesen")
- Farb-Warnung: nach 90 Tagen gelb, nach 180 Tagen rot (Nachfrist-Grenze)

### 8.6 Entscheidungs-Offenheit

**Zwei Dinge sind in §11 offen und brauchen Steuerberater-Freigabe:**

1. **Variante A vs. B** — Frank kann Variante A wollen für Kunden-Komfort, Steuerberater kann Variante B empfehlen wegen Risiko. Muss entschieden werden.
2. **BMF-Formular-Version** — das offizielle Ausfuhrnachweis-Formular muss aktuell sein (die Vorgaben ändern sich gelegentlich). Franks Steuerberater kennt das aktuelle Muster am besten und sollte die PDF-Vorlage liefern.
3. **Brutto vs. Netto-Preise in `legacy_price`** — die gesamte Preis-Logik (Online + POS) hängt davon ab, wie die bestehenden Preise steuerlich interpretiert werden.

## 9. Bon-Druck

### 9.1 Hardware-Optionen

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

### 9.2 Bon-Layout (KassenSichV-konform) — Standard-Mode

**Für `tax_mode='standard'`** (DE/EU-Kunden, 19% USt enthalten):

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

### 9.3 Bon-Layout (Steuerfrei-Export-Mode)

**Für `tax_mode='export_tax_free'`** (Drittland-Kunden, §6 UStG):

```
┌──────────────────────────────────────────┐  62mm
│          VOD RECORDS                      │
│       vod-auctions.com                    │
│       [Adresse aus impressum]             │
│       USt-ID: [wenn vorhanden]            │
│ ─────────────────────────────────────    │
│ Bon-Nr: VOD-POS-000124                    │
│ Datum: 2026-04-11 14:23                   │
│ Kasse: VOD-MAIN-001                       │
│ ─────────────────────────────────────    │
│ Cabaret Voltaire                          │
│   Red Mecca · LP               €38,00     │
│ ─────────────────────────────────────    │
│ GESAMT (Netto):                €38,00     │
│                                           │
│ ★ STEUERFREIE AUSFUHRLIEFERUNG ★          │
│   gem. §6 UStG                            │
│                                           │
│ Kunde: Jane Doe                           │
│ Land:  United States (US)                 │
│ Nachweis folgt per Ausfuhrbescheinigung   │
│                                           │
│ Zahlung: SumUp Kartenzahlung              │
│ ─────────────────────────────────────    │
│ TSE-Signatur:                             │
│ abc123def456... (gekürzt)                 │
│ TSE-Seriennummer: F1SK4LY-12345          │
│ Transaktions-Nr: 43                       │
│                                           │
│ ▓▓ QR-Code (TSE-Hash) ▓▓                  │
│                                           │
│ Bitte Ausfuhrbescheinigung beim Zoll      │
│ abstempeln und zurücksenden.              │
└──────────────────────────────────────────┘
```

**Unterschiede zum Standard-Bon:**
- Keine „MwSt 19% (enthalten)"-Zeile
- Gesamtbetrag ausgewiesen als **„(Netto)"**
- Neuer Block: „★ STEUERFREIE AUSFUHRLIEFERUNG ★" + „gem. §6 UStG"
- Kunden-Name + Land explizit auf dem Bon (Pflicht für Nachweis-Kette)
- Bitte-Text zur Rücksendung der Ausfuhrbescheinigung

**Parallel**: Ein A4-PDF mit der **Ausfuhr- und Abnehmerbescheinigung** wird auf dem Standard-Drucker gedruckt (nicht auf der 62mm Thermo-Rolle — passt nicht). Das PDF folgt dem BMF-Muster und wird vom Kunden mitgenommen.

## 10. Neue Admin-API-Routes

| Method | Path | Body | Effekt |
|---|---|---|---|
| POST | `/admin/pos/sessions` | `{}` | Neue ephemere Session, returns `session_id` (UUID) |
| POST | `/admin/pos/sessions/:id/items` | `{barcode}` | Scan-Lookup + Add to Cart, returns `item` |
| DELETE | `/admin/pos/sessions/:id/items/:itemId` | — | Remove from Cart |
| POST | `/admin/pos/sessions/:id/checkout` | `{customer_id?, payment_provider, discount_eur?}` | TSE-Signierung + `transaction`-Erzeugung + `inventory_movement` + `order_event` + Bon-PDF-Generierung. Returns `{transaction_id, order_number, tse_signature, receipt_pdf_url}` |
| GET | `/admin/pos/transactions/:id/receipt` | — | Bon-PDF-Download |
| POST | `/admin/pos/transactions/:id/print-receipt` | `{printer_name?}` | Sendet Bon an QL-820NWB (oder anderen Drucker) |
| GET | `/admin/pos/customer-search` | `?q=` | Live-Suche in `customer_stats`, returns top 10 matches |
| POST | `/admin/pos/customers` | `{name, email?, phone?, country_code?}` | Neuen Customer anlegen (minimal — `country_code` optional aber Pflicht bei Tax-Free) |
| GET | `/admin/pos/transactions/:id/export-declaration` | — | PDF-Download der Ausfuhr- und Abnehmerbescheinigung (A4, BMF-Muster) — nur bei `tax_mode='export_tax_free'` |
| POST | `/admin/pos/transactions/:id/confirm-export` | `{confirmed_at, notes?}` | Frank markiert den Zoll-Stempel-Nachweis als eingegangen — setzt `export_declaration_confirmed_at` |
| GET | `/admin/pos/tax-free-pending` | `?days_since=` | Liste aller Tax-Free-Transactions ohne Nachweis-Bestätigung |

Alle Routes unter `requireFeatureFlag('POS_WALK_IN')` (neues Flag, default OFF).

## 11. Offene Entscheidungen

Vor Implementierungs-Start muss Frank (oder der Steuerberater) folgendes klären:

1. **TSE-Anbieter**: fiskaly (Empfehlung) vs. efsta vs. andere? **Preise konkret vergleichen.**

2. **Kleinunternehmer-Status nach §19 UStG?** — wenn ja, dann **kein MwSt-Ausweis auf dem Bon**, dafür Pflicht-Hinweis „Kein Ausweis von Umsatzsteuer aufgrund Kleinunternehmerregelung gem. §19 UStG". Das ändert das Bon-Layout signifikant. → **Steuerberater fragen.**

3. **Bon-Druck-Hardware**: Option X (bestehender QL-820NWB + 62mm Rolle) vs. Option Y (dedizierter POS-Thermo)? Bei Option X: welche Rolle bestellen (DK-22205 weiß 62mm × 30,48m)?

4. **Kassensturz-Workflow**: Wird Frank täglich/wöchentlich einen Kassensturz-Report brauchen (Summe aller POS-Verkäufe, Aufteilung nach Zahlungsart)? → Falls ja, eigene Admin-Page `/app/pos/reports`.

5. **Retoure-Szenario**: Kunde bringt eine gekaufte Platte zurück. Wie wird das abgewickelt? Eine Teil-Retour-Transaction mit negativem Betrag + TSE-Storno-Signierung ist KassenSichV-konform, aber nicht-trivial. **Punkt für Phase 2.**

6. **Storefront-Conflict**: Wenn Frank eine Platte im Laden verkauft, die gerade online in einem Live-Auktions-Block ist, ist das ein harter Konflikt (der Online-Höchstbietende wird enttäuscht). Lösung: POS blockt Add-to-Cart für Items in `block_item.status='active'`. Aber: wie reagieren wir, wenn Frank trotzdem im Laden verkauft (override)? → Hard-block mit Admin-Override? Oder weiche Warnung?

7. **Mobile (iPad) vs. Desktop**: Der POS-Screen muss auf iPad funktionieren (im Laden vermutlich Tablet-Workflow). CSS/Layout-Anpassungen nötig.

8. **SumUp-Integration-Level**: Phase 1 (extern) ist klar. Phase 2 (REST API) nur wenn Frank das wirklich will — klären, wenn Phase 1 läuft.

9. **Tax-Free Export (§6 UStG) — drei Sub-Entscheidungen** (siehe §8):
   - **Variante A vs. B** — direkte Steuerbefreiung mit Risiko (Variante A, kundenfreundlicher) oder volle USt zahlen + nachträgliche Erstattung (Variante B, risikofrei für Frank)? Steuerberater-Entscheidung.
   - **Ausfuhr- und Abnehmerbescheinigung Muster** — aktuelles BMF-Formular als PDF-Template vom Steuerberater besorgen
   - **Brutto vs. Netto in `legacy_price`** — die existierenden Preise in der DB: sind das Brutto-Preise (USt enthalten) oder Netto-Preise? Betrifft die gesamte Preis-Logik (Online + POS). Muss vor POS-Implementierung geklärt sein, weil sonst die USt-Berechnung konsistent falsch ist.
   - **Nachfrist für Nachweise**: Nach wie vielen Tagen gilt ein fehlender Ausfuhrnachweis als „final missing" und Frank muss die USt nachversteuern? Typisch 3–6 Monate. Steuerberater-Entscheidung.

## 12. Implementierungs-Phasen

### Phase P0 — Dry-Run POS (ohne TSE, ohne Tax-Free, ohne Bon-Druck)

**Status:** 🚧 In Implementierung (2026-04-12)
**Ziel:** Frank kann den kompletten Scan→Cart→Checkout-Workflow am echten Inventar üben, bevor die offenen Entscheidungen aus §11 geklärt sind. Echte Transaktionen werden geschrieben, Items werden als `sold` markiert. Alles was externe Abhängigkeiten hat (TSE-Anbieter, Steuerberater-Freigabe, BMF-Formular) ist bewusst als Stub/Platzhalter implementiert.

**Was funktioniert (echt):**
- Barcode-Scanning gegen echtes `erp_inventory_item`-Inventar (Scanner + Items existieren aus Inventur)
- Cart-Management: Add/Remove, Discount-Feld, Summenberechnung
- Customer-Panel: Bestehenden Kunden suchen / Neuen anlegen / Anonym
- Payment-Auswahl: SumUp Karte, Bar, PayPal, Überweisung (Radio-Buttons)
- Checkout: Echte `transaction` mit `item_type='walk_in_sale'`, `erp_inventory_movement` mit `reason='walk_in_sale'`, `order_event`-Audit-Eintrag
- Customer-Stats-Update (wenn Kunde gesetzt)
- Simple Quittung als A6-PDF-Download (pdfkit, ohne TSE-Signatur)
- PWA-Installation auf Mac + iPad (Fullscreen, Dock-Icon)
- Schutz-Checks: Item bereits sold → roter Block; Item in aktiver Auction → roter Block

**Was als Stub/Platzhalter drin ist:**
- **TSE-Signierung:** Gelber Banner "TSE nicht konfiguriert — Transaktion ohne Signatur (Dry-Run)". `tse_signature` wird auf `"DRY_RUN"` gesetzt, nicht NULL, damit spätere TSE-Integration die Dry-Run-Transaktionen identifizieren kann.
- **Tax-Mode-Toggle:** UI-Element vorhanden aber disabled, mit Tooltip "Wartet auf Steuerberater-Freigabe (§11 Punkt 9)". Alle Transaktionen werden mit `tax_mode='standard'` geschrieben.
- **Bon-Druck:** Nur PDF-Download-Button, kein CUPS/Brother-Print. PDF ist A6, enthält Artikeldaten + Summe + Zahlungsart, aber keine TSE-Felder und keinen QR-Code.
- **SumUp:** Manueller "Zahlung erhalten"-Bestätigungs-Button (ist ohnehin Phase 1 lt. §6).

**Was NICHT drin ist:**
- Keine TSE-Integration (fiskaly/efsta) — kein Account nötig
- Kein Tax-Free-Export (§6 UStG) — keine Steuerberater-Freigabe nötig
- Keine Ausfuhr-/Abnehmerbescheinigung
- Kein DSFinV-K-Export
- Kein Bon-Druck auf Brother (nur PDF-Download)
- Keine Retouren
- Keine SumUp-API-Integration

**Warum P0 vor den offenen Entscheidungen sinnvoll ist:**
- Frank kann die **Grundmethodik im Laden durchdenken**: Scanning-Ergonomie, Cart-Handling bei Mehrfachkäufen, Kunden-Suche, Payment-Workflow-Speed
- UX-Probleme werden **vor** der TSE/Tax-Integration entdeckt — Layout-Änderungen sind jetzt billig, nach TSE-Integration teuer
- Frank sieht echte Walk-in-Sale-Transaktionen in `/app/orders` und kann beurteilen ob die Datenstruktur für sein Reporting passt
- iPad-Tauglichkeit wird am echten Gerät validiert bevor wir den Rest bauen
- Die offenen §11-Entscheidungen können parallel geklärt werden

**Voraussetzungen (alle erfüllt):**
- ✅ ERP_INVENTORY Flag existiert in Registry (muss ON sein für Scan-Endpoint)
- ✅ Barcode-Scanner validiert (2026-04-11)
- ✅ Inventur-Session-UI existiert (Pattern für Scanner-Input wiederverwendbar)
- ✅ `erp_inventory_item`-Tabelle mit Cohort-A-Daten befüllt

**Implementierungs-Scope:**

| # | Task | Beschreibung | Aufwand |
|---|---|---|---|
| P0.1 | Feature-Flag | `POS_WALK_IN` in Registry (category: `erp`, requires: `["ERP_INVENTORY"]`) | 15min |
| P0.2 | DB-Migration | `transaction`-Tabelle erweitern: `pos_session_id TEXT`, `tse_signature TEXT`, `tse_transaction_number INTEGER`, `tse_signed_at TIMESTAMPTZ`, `tse_serial_number TEXT`, `tax_mode TEXT DEFAULT 'standard'`, `tax_rate_percent NUMERIC(5,2)`, `tax_amount NUMERIC(10,2)`, `customer_country_code TEXT`, `export_declaration_issued_at TIMESTAMPTZ`, `export_declaration_confirmed_at TIMESTAMPTZ`. Alle nullable, kein Breaking Change für bestehende Online-Transaktionen. | 30min |
| P0.3 | API: Session + Cart | `POST /admin/pos/sessions` (UUID), `POST /sessions/:id/items` (Barcode → Lookup via bestehenden `/erp/inventory/scan/:barcode`-Pattern), `DELETE /sessions/:id/items/:itemId` | 2h |
| P0.4 | API: Checkout | `POST /admin/pos/sessions/:id/checkout` — in einer DB-Transaktion: `transaction`-Insert (`item_type='walk_in_sale'`, `payment_provider`, `status='paid'`, `fulfillment_status='picked_up'`, `tse_signature='DRY_RUN'`), pro Item `erp_inventory_movement` (`type='outbound'`, `reason='walk_in_sale'`), `erp_inventory_item.status='sold'`, `order_event` Audit-Eintrag. Optional: `customer_id`, `discount_eur`. Returns `{transaction_id, order_number, receipt_pdf_url}`. | 3h |
| P0.5 | API: Customer | `GET /admin/pos/customer-search?q=` (Live-Suche in `customer` + `customer_stats`), `POST /admin/pos/customers` (Name pflicht, Email/Phone optional) | 1h |
| P0.6 | API: Receipt | `GET /admin/pos/transactions/:id/receipt` — A6-PDF via pdfkit. Header: VOD Records + Adresse. Body: Artikel-Liste, Summe, Discount, Zahlungsart. Footer: "Dry-Run — keine TSE-Signatur". | 1.5h |
| P0.7 | Admin-UI: POS-Page | `/app/pos/page.tsx` mit `defineRouteConfig`. Full-width Layout (§5.2): Links Scan-Input (autofocus) + Item-Preview, Rechts Cart-Sidebar + Discount + Customer-Panel + Payment-Radio + Checkout-Button. Zustand-basierter Cart-State (ephemer). | 5h |
| P0.8 | Admin-UI: Interaction | Scanner-Input (Keyboard-Event-Listener, `VOD-`-Prefix-Erkennung, debounce). Schutz-Checks: Item already sold → rote Warnung; Item in aktiver Auction → rote Warnung + Block-Name; Item nicht gefunden → gelbe Warnung. Customer-Panel: 3-Modi-Toggle (Anonym / Suchen / Neu). Checkout-Modal mit Bestätigung. Erfolgs-Feedback + PDF-Download-Link + Cart-Reset. | 3h |
| P0.9 | PWA-Setup | `manifest.json` (name: "VOD POS", short_name: "POS", display: standalone, theme_color: #1c1915, background_color: #1c1915, start_url: /app/pos, scope: /app/pos). Minimaler Service Worker (App-Shell-Cache only). iOS-Meta-Tags. App-Icons (192px + 512px). Install-Banner auf `/app/pos` mit Anleitung. | 2h |
| P0.10 | Operations-Hub | Neue HubCard "POS / Walk-in Sale" auf Operations-Page. Icon, Beschreibung, Status-Line ("Dry-Run Mode"), Link zu `/app/pos`. | 30min |
| P0.11 | Orders-Integration | Walk-in-Sale-Transaktionen in `/app/transactions` mit eigenem Badge ("POS") anzeigen. `VOD-POS-XXXXXX` Nummernkreis. Filter `item_type=walk_in_sale`. | 1h |
| | **Summe P0** | | **~2 Tage** |

**File-Struktur P0:**

```
backend/
├── src/
│   ├── api/admin/pos/
│   │   ├── sessions/route.ts                    # POST: neue Session
│   │   ├── sessions/[id]/items/route.ts         # POST: Barcode → Add to Cart
│   │   ├── sessions/[id]/items/[itemId]/route.ts  # DELETE: Remove from Cart
│   │   ├── sessions/[id]/checkout/route.ts      # POST: Finalize + Transaction
│   │   ├── customer-search/route.ts             # GET: Live-Suche
│   │   ├── customers/route.ts                   # POST: Neuen Kunden anlegen
│   │   └── transactions/[id]/receipt/route.ts   # GET: A6-PDF Download
│   ├── lib/pos-receipt.ts                       # pdfkit A6-Quittung
│   └── admin/routes/pos/page.tsx                # POS-UI (Haupt-Page)
├── public/
│   ├── manifest.json                            # PWA Manifest
│   ├── sw.js                                    # Service Worker (minimal)
│   └── icons/pos-*.png                          # App-Icons 192px + 512px
└── scripts/migrations/
    └── pos_walk_in_columns.sql                  # ALTER TABLE transaction ADD COLUMN ...
```

**Dry-Run-Regeln:**
- Alle POS-Transaktionen bekommen `tse_signature='DRY_RUN'` — das erlaubt spätere Identifikation und ggf. Nachsignierung wenn TSE live geht
- `order_number` nutzt separaten Nummernkreis `VOD-POS-XXXXXX` (eigene Sequenz, ab 000001)
- Feature-Flag `POS_WALK_IN` muss ON sein UND `ERP_INVENTORY` muss ON sein (Dependency Chain)
- Dry-Run-Transaktionen sind **echte Transaktionen** — sie erscheinen in Orders, beeinflussen Customer-Stats, und die verkauften Items sind wirklich `sold`. Das ist Absicht: Frank soll den echten Effekt sehen. Zum "Rückgängig machen" eines Test-Verkaufs: manuell Transaction auf `cancelled` setzen + Inventory-Item zurück auf vorherigen Status.

---

### Phase P1 — Production POS (Tax-Logik + Bon-Druck)

**Voraussetzung:** §11 Entscheidungen geklärt (Steuerberater-Freigabe, Brutto/Netto, Kleinunternehmer-Status)
*Ziel: POS ist produktiv nutzbar mit korrekter USt-Berechnung und gedrucktem Kassenbon. Noch ohne TSE-Signierung.*

| Task | Aufwand |
|---|---|
| **Tax-Logik aktivieren**: Tax-Mode-Toggle enablen, Preis-Berechnung Standard (19%) vs. Export (§6 UStG), Drittland-Validation | 3h |
| **Customer-Pflichtfelder bei Tax-Free**: Mode-Enforcement (kein Anonymous), Adress-/Land-Pflichtfelder | 2h |
| Bon-Layout Standard auf Brother QL-820NWB (`lib/pos-receipt.ts`, pdfkit, 62mm × variable Länge) | 4h |
| **Bon-Layout Tax-Free-Variante** (§9.3) mit Kundendaten-Block + §6-Hinweis | 1h |
| `POST /admin/pos/transactions/:id/print-receipt` Route (CUPS-Print) | 1h |
| CUPS-Pipeline `PageSize=Custom.62x<length>mm` validieren mit DK-22205 Rolle | 1h |
| **Summe P1** | **~1.5 Tage** |

### Phase P2 — TSE-Integration (KassenSichV)

**Voraussetzung:** TSE-Anbieter entschieden + Account angelegt (§11 Punkt 1)
*Ziel: Alle POS-Transaktionen sind KassenSichV-konform signiert.*

| Task | Aufwand |
|---|---|
| fiskaly-Account anlegen, TSE registrieren, API-Credentials | 2h |
| Backend-Service `lib/tse.ts` mit `signTransaction()` Funktion | 3h |
| Integration in `POST /admin/pos/sessions/:id/checkout` — TSE-Call vor `transaction`-Insert | 2h |
| Fehlerbehandlung: TSE-down → `tse_signature=PENDING`, Background-Retry | 3h |
| Bon-Template um TSE-Signatur + QR-Code erweitern | 2h |
| DSFinV-K Export-Cron (nightly CSV nach `./exports/dsfinvk/`) | 3h |
| Dry-Run-Transaktionen nachsignieren (einmalig, alle `tse_signature='DRY_RUN'` → echte Signatur) | 1h |
| **Summe P2** | **~2 Tage** |

### Phase P3 — Tax-Free Documents + Tracking

**Voraussetzung:** Steuerberater-Freigabe Variante A/B + BMF-Formular (§11 Punkt 9)
*Ziel: Steuerfreie Ausfuhrlieferungen können korrekt abgewickelt und nachverfolgt werden.*

| Task | Aufwand |
|---|---|
| **Ausfuhr-/Abnehmerbescheinigung** (A4-PDF, BMF-Muster, vorab ausgefüllt via pdfkit) | 3h |
| `GET /admin/pos/transactions/:id/export-declaration` Route | 1h |
| **Admin-Page `/app/pos/tax-free-pending`** (Liste offener Nachweise + Bestätigen-/Nachversteuern-Buttons) | 3h |
| `POST /admin/pos/transactions/:id/confirm-export` + Korrektur-Transaktion bei "Nachweis vermisst" | 2h |
| Farb-Warnungen: >90d gelb, >180d rot | 30min |
| **Summe P3** | **~1.5 Tage** |

### Phase P4 — SumUp REST API (optional, später)

*Ziel: Payment-Terminal wird direkt vom Backend angesprochen, kein manuelles Eintippen.*

| Task | Aufwand |
|---|---|
| SumUp Merchant API-Account, OAuth-Flow | 1 Tag |
| `lib/sumup.ts` Backend-Service | 1 Tag |
| POS-UI: „SumUp: Terminal wartet…" Polling-State | 4h |
| Fallback auf externe Zahlung bei API-Fehler | 2h |
| **Summe P4** | **~2-3 Tage** |

**Gesamtaufwand P0 (Dry-Run, sofort umsetzbar):** ~2 Arbeitstage
**Gesamtaufwand P0-P3 (Mindest-Funktionsumfang produktiv):** ~7 Arbeitstage
**Gesamtaufwand P0-P4 (vollständig):** ~9.5 Arbeitstage

## 13. Abhängigkeiten / Voraussetzungen

- ✅ **ERP_INVENTORY Flag aktiv** (für `erp_inventory_movement` Logging) — aktuell OFF, muss vor POS-Launch ON
- ✅ **Barcode-Label + Scanner validiert** (Setup-Doku fertig) — ✅ done am 2026-04-11
- ✅ **Cohort-A Items haben Barcode** (aus Inventur-Session) — erforderlich, damit Scanning funktioniert
- ⏳ **Steuerberater-Freigabe** für Bon-Pflichtfelder + Kleinunternehmer-Status + **Tax-Free-Variante A/B + Brutto/Netto-Interpretation** — **offen**
- ⏳ **BMF-Musterformular** für Ausfuhr-/Abnehmerbescheinigung vom Steuerberater — **offen**
- ⏳ **fiskaly-Account** (oder Alternativ-TSE-Anbieter) — **offen**
- ⏳ **DK-22205 62mm Rolle bestellen** (falls Option X für Bon-Druck) — **offen**

## 14. Referenzen

- **ERP-Konzept:** `docs/optimizing/ERP_WARENWIRTSCHAFT_KONZEPT.md` (transaction, inventory_movement, customer Schema)
- **Inventur-Konzept:** `docs/optimizing/INVENTUR_COHORT_A_KONZEPT.md` (Scanner + Barcode-Workflow)
- **Hardware-Setup:** `docs/hardware/BROTHER_QL_820NWB_SETUP.md`
- **KassenSichV:** [§146a AO](https://www.gesetze-im-internet.de/ao_1977/__146a.html), [KassenSichV](https://www.gesetze-im-internet.de/kassensichv/)
- **USt-Ausfuhrlieferung:** [§4 Nr. 1a UStG](https://www.gesetze-im-internet.de/ustg_1980/__4.html), [§6 UStG](https://www.gesetze-im-internet.de/ustg_1980/__6.html), BMF-Merkblatt „Steuerfreiheit von Ausfuhrlieferungen im nichtkommerziellen Reiseverkehr"
- **fiskaly-Doku:** https://developer.fiskaly.com/
- **SumUp-Doku:** https://developer.sumup.com/

---

**Next Action:** Phase P0 (Dry-Run) implementieren — keine offenen Entscheidungen blockieren diese Phase. §11-Entscheidungen parallel klären für P1-P4.
