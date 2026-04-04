# ERP / Warenwirtschaft / Fibu / Logistik — Konzept & Analyse v2.0

**Erstellt:** 2026-04-04 | **Aktualisiert:** 2026-04-04 (v2.0 — Korrektur Business-Modell)
**Kontext:** VOD Auctions — 3 Business-Modelle, 41.500+ Produkte, erwartetes Volumen 10-50+ Bestellungen/Tag
**Status:** Konzeptphase — Entscheidungsvorlage

---

## 1. Die 3 Business-Modelle (korrigiert)

Die Plattform ist NICHT nur ein Single-Seller-Auktionshaus. Es gibt **3 aktuelle und geplante Geschäftsmodelle:**

| Modell | Beschreibung | Lager | Versand | Abrechnung |
|--------|-------------|-------|---------|-----------|
| **A: Kommissionsverkauf** | Große Sammlungen von Dritten werden über die Plattform verkauft | VOD-Lager (eingelagert) | VOD versendet | Provision an VOD, Rest an Eigentümer |
| **B: B2C Marketplace** | Plattform offen für Seller (à la Discogs) | Seller-Lager | Seller versendet | Monatliche Membership, keine Transaktionskosten |
| **C: VOD Records Eigenware** | Eigene Label-Produkte (Vinyl Reissues, Box Sets) | VOD-Lager | VOD versendet | Vollständiger Erlös |

**Plus das bestehende Auktionsmodell:** Franks persönliche Sammlung (~41.500 Items)

---

## 2. Was wir wirklich brauchen — korrigierte Analyse

| ERP-Funktion | Brauchen wir das? | Begründung |
|---|---|---|
| **Lagerverwaltung/WMS** | **Ja** | VOD Records Eigenware + Kommissionsware = physisches Lager |
| **Bestandsführung** | **Ja** | Qty-basiert für VOD Records (nicht nur Qty 1), Kommissionsware tracken |
| **Einkauf/Bestellwesen** | **Ja (teilweise)** | VOD Records bestellt Pressung/Produktion, Kommissionsware wird eingebucht |
| **Kommissionsabrechnung** | **Ja** | Modell A: Erlös aufteilen (Provision VOD vs. Auszahlung Eigentümer) |
| **Seller-Management** | **Ja** | Modell B: Membership, Seller-Onboarding, Auszahlungen |
| **Rechnungsstellung** | **Ja** | GoBD-konform, fortlaufende Nummern, 10 Jahre Archivierung |
| **Differenzbesteuerung §25a** | **Ja — Prio 1** | Margenbesteuerung für Gebrauchtware (massiver Steuervorteil) |
| **DATEV-Export** | **Ja — Super wichtig** | Steuerberater braucht das, monatlich |
| **Versandautomatisierung** | **Ja** | Multi-Carrier (DHL + weitere), vollautomatisch |
| **EU-USt/OSS** | **Ja** | Pflicht bei EU-Verkäufen > €10.000/Jahr |
| **Multi-Channel-Sync** | **Nein (vorerst)** | Single-Channel, aber B2C Marketplace = zweite "Channel"-Art |
| **Produktionsplanung** | **Nein** | Keine eigene Pressung (wird extern beauftragt) |

### Fazit: Wir brauchen mehr als "2 API-Integrationen"

Die vorherige Einschätzung ("sevDesk + DHL reicht") war **zu simpel**. Mit 3 Business-Modellen brauchen wir einen **dedizierten ERP-Bereich im Admin** mit:
- Lagerverwaltung (Modell A + C)
- Kommissionsabrechnung (Modell A)
- Seller-Management (Modell B)
- Bestandsführung (alle Modelle)
- Rechnungs-Automation
- Versand-Automation
- DATEV-Export
- §25a Differenzbesteuerung

---

## 3. Differenzbesteuerung §25a UStG — Prio 1

### Was ist das?

Bei Gebrauchtware (Second-Hand Vinyl) muss nicht der volle Verkaufspreis mit 19% USt besteuert werden, sondern nur die **Marge** (Differenz zwischen Ein- und Verkaufspreis).

### Beispiel

| | Regelbesteuerung | Differenzbesteuerung §25a |
|---|---|---|
| Einkaufspreis | €10 | €10 |
| Verkaufspreis | €50 | €50 |
| Bemessungsgrundlage | €50 (brutto) | €40 Marge (brutto) |
| USt (19%) | €7,98 | €6,39 |
| **Netto-Erlös** | **€42,02** | **€43,61** |

Bei Franks Sammlung (Einkaufspreis = €0, da Privatsammlung → volle Marge) ist der Vorteil kleiner. Aber bei **Kommissionsware (Modell A)** und **VOD Records Einkauf** kann §25a **tausende Euro pro Jahr** sparen.

### Voraussetzungen
- Einkauf von **Privatpersonen oder Kleinunternehmern** (keine USt auf der Eingangsrechnung)
- Detaillierte Aufzeichnungen pro Artikel: Einkaufspreis, Verkaufspreis, Marge
- Rechnung darf **keine USt separat ausweisen** (nur Brutto-Betrag)
- Vermerk auf Rechnung: "Differenzbesteuerung gem. §25a UStG. Im Rechnungsbetrag ist die Umsatzsteuer enthalten."

### Was das für die Plattform bedeutet
- Jeder Artikel braucht ein Feld: `purchase_price` (Einkaufspreis)
- Rechnungen müssen 2 Formate unterstützen: Regelbesteuerung + §25a
- DATEV-Export muss Regel- und Differenzbesteuerung korrekt trennen
- **Steuerberater muss das Setup validieren** — vor Launch!

---

## 4. Dedizierter ERP-Bereich im Admin

### Aktuelle Situation

Das Admin-Backend hat diese Hub-Struktur:
```
Dashboard | Auction Blocks | Orders | Catalog | Marketing | Operations | AI Assistant
```

Operations enthält: System Health, Sync, Shipping Config, Test Runner, Configuration.

**Was fehlt:** Ein dedizierter Bereich für Warenwirtschaft/ERP-Funktionen.

### Vorgeschlagene Erweiterung

```
Dashboard | Auction Blocks | Orders | Catalog | Marketing | Operations | ERP | AI Assistant
```

**ERP Hub mit folgenden Sub-Pages:**

| Sub-Page | Funktion |
|----------|---------|
| **Rechnungen** | Übersicht aller Rechnungen, sevDesk-Status, Download, Gutschriften |
| **Versand** | Label-Erstellung (Sendcloud), Tracking-Übersicht, Batch-Druck |
| **Lager** | Bestandsübersicht (VOD Records + Kommissionsware), Ein-/Ausbuchung |
| **Kommission** | Kommissionsgeber-Verwaltung, Abrechnungen, Auszahlungen |
| **Finanzen** | Tagesumsatz, Monats-Revenue, offene Zahlungen, DATEV-Export |
| **Steuern** | §25a Übersicht, Regel- vs. Differenzbesteuerung, EU-USt/OSS |

---

## 5. Architektur-Entscheidung: Composable vs. ERP-Software

### Option A: Composable Stack (erweitert)

```
VOD Auctions (Medusa.js)
├── Sendcloud → Versand (160+ Carrier, Labels, Tracking, Returns)
├── sevDesk/easybill → Rechnungen, DATEV, §25a, EU-USt
├── Custom ERP-Modul → Lager, Kommission, Bestandsführung
└── Admin ERP Hub → Zentrale Arbeitsumgebung
```

| Pro | Contra |
|-----|--------|
| Volle Kontrolle über Workflows | Lager/Kommission muss custom gebaut werden |
| Günstig (~€30/Monat) | Mehr Entwicklungsaufwand (4-6 Wochen) |
| Perfekt integriert in bestehendes Admin | Custom Code = eigene Wartung |
| Kein Vendor Lock-in | Keine "out-of-box" Lager-Workflows |

### Option B: Billbee als Operations-Layer

```
VOD Auctions (Medusa.js)
├── Billbee → Orders, Rechnungen, Versand, Lager — alles in einem
├── sevDesk → DATEV, Buchhaltung (Billbee exportiert dorthin)
└── Admin → Verlinkt auf Billbee für Operations
```

| Pro | Contra |
|-----|--------|
| Lager, Rechnungen, Versand out-of-box | Zweites Admin-System (Billbee + Medusa) |
| 120+ Integrationen | Medusa↔Billbee Connector muss gebaut werden |
| Bewährt bei deutschen E-Commerce SMBs | Weniger Kontrolle über Workflows |
| €9-94/Monat | Kommissionsabrechnung nicht nativ |

### Option C: Xentral (vollständiges ERP)

```
VOD Auctions (Medusa.js)
├── Xentral → Alles: Lager, Rechnungen, Versand, Buchhaltung, DATEV
└── Medusa → Nur noch Storefront + Auktionen
```

| Pro | Contra |
|-----|--------|
| Komplettes ERP out-of-box | €199-799/Monat |
| Lager, WMS, Kommission, §25a | Medusa↔Xentral Connector = 3-4 Wochen Dev |
| DATEV direkt integriert | Zwei Admin-Systeme |
| Skaliert bis 500+ Orders/Tag | Overkill für aktuelle Phase |

### Empfehlung

**Phase 1 (Launch → 30 Orders/Tag): Option A — Composable**
- Sendcloud + sevDesk + Custom ERP-Modul im Admin
- Lager-Verwaltung als einfache Ein-/Ausbuchung
- §25a Setup mit Steuerberater

**Phase 2 (30-100 Orders/Tag): Option A erweitern ODER Option B evaluieren**
- Wenn Custom-Lager zu komplex wird → Billbee evaluieren
- Wenn Multi-Seller (Modell B) live → Billbee oder Xentral evaluieren

**Phase 3 (100+ Orders/Tag + Multi-Seller): Option B oder C**
- Abhängig vom Volumen und der Komplexität

---

## 6. Datenbank-Erweiterungen für ERP

### Neue Tabellen

```sql
-- Lagerbestände (VOD Records + Kommissionsware)
CREATE TABLE inventory_item (
    id TEXT PRIMARY KEY,
    release_id TEXT REFERENCES "Release"(id),
    source TEXT NOT NULL CHECK (source IN ('vod_records', 'commission', 'frank_collection')),
    purchase_price NUMERIC,              -- Einkaufspreis (für §25a)
    commission_owner_id TEXT,            -- FK zu commission_owner (Modell A)
    commission_rate NUMERIC DEFAULT 0,   -- Provision % für VOD
    location TEXT,                        -- Lagerort (Regal, Box, etc.)
    status TEXT DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'reserved', 'sold', 'shipped', 'returned')),
    quantity INTEGER DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kommissionsgeber (Modell A)
CREATE TABLE commission_owner (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    tax_id TEXT,                          -- Steuernummer (für §25a Nachweis)
    default_commission_rate NUMERIC DEFAULT 20, -- Standard-Provision %
    total_items INTEGER DEFAULT 0,
    total_sold INTEGER DEFAULT 0,
    total_revenue NUMERIC DEFAULT 0,
    total_paid_out NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kommissionsabrechnungen
CREATE TABLE commission_settlement (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES commission_owner(id),
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    items_sold INTEGER NOT NULL,
    gross_revenue NUMERIC NOT NULL,
    commission_amount NUMERIC NOT NULL,   -- VODs Anteil
    payout_amount NUMERIC NOT NULL,       -- Auszahlung an Eigentümer
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- §25a Differenzbesteuerung Tracking
CREATE TABLE tax_margin_record (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    release_id TEXT NOT NULL,
    purchase_price NUMERIC NOT NULL,      -- Einkaufspreis
    sale_price NUMERIC NOT NULL,          -- Verkaufspreis (brutto)
    margin NUMERIC NOT NULL,              -- Differenz
    vat_on_margin NUMERIC NOT NULL,       -- USt auf Marge (19/119 * margin)
    tax_scheme TEXT NOT NULL CHECK (tax_scheme IN ('margin_scheme', 'standard')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Erweiterung Release-Tabelle

```sql
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS purchase_price NUMERIC;
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS inventory_source TEXT DEFAULT 'frank_collection';
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS warehouse_location TEXT;
```

---

## 7. API-Endpunkte für ERP-Bereich

```
# ERP Admin Routes
GET    /admin/erp/dashboard          — KPIs: Revenue, Offene Zahlungen, Lagerbestand
GET    /admin/erp/invoices           — Rechnungen-Liste (sevDesk Status)
POST   /admin/erp/invoices/create    — Rechnung manuell erstellen
GET    /admin/erp/invoices/:id/pdf   — PDF Download
POST   /admin/erp/invoices/datev     — DATEV-Monatsexport

GET    /admin/erp/shipping           — Offene Sendungen, Tracking-Übersicht
POST   /admin/erp/shipping/label     — Sendcloud Label erstellen
POST   /admin/erp/shipping/batch     — Batch Labels (alle offenen)

GET    /admin/erp/inventory          — Lagerbestand (VOD Records + Kommission)
POST   /admin/erp/inventory/inbound  — Wareneingang buchen
POST   /admin/erp/inventory/outbound — Warenausgang buchen

GET    /admin/erp/commission         — Kommissionsgeber-Liste
GET    /admin/erp/commission/:id     — Detail + Abrechnungshistorie
POST   /admin/erp/commission/settle  — Abrechnung erstellen

GET    /admin/erp/tax                — §25a Übersicht (Regel vs. Differenz)
GET    /admin/erp/tax/report         — Steuerreport für Periode
```

---

## 8. Sendcloud Integration (Detail)

### Warum Sendcloud

| Feature | Sendcloud | DHL direkt | Shipcloud |
|---------|-----------|-----------|-----------|
| Carrier | 160+ (DHL, DPD, Hermes, GLS...) | Nur DHL | Multi-Carrier |
| Medusa Plugin | ✅ Ja | ❌ Nein | ❌ Nein |
| Free Tier | ✅ Unlimitiert | N/A | ❌ Nein |
| Returns Portal | ✅ Ja | ❌ Nein | ❌ Nein |
| Branded Tracking | ✅ Ja | ❌ Nein | ❌ Nein |
| Zollformulare | ✅ Automatisch | Manuell | ✅ Ja |
| Adressvalidierung | ✅ Ja | ❌ Nein | ✅ Ja |

### Workflows die Sendcloud automatisch liefert
1. Label mit Barcode + Tracking-Nummer
2. Carrier-Ratenvergleich (günstigster Versand)
3. Adressvalidierung vor Versand
4. Lieferzeitschätzung
5. Branded Tracking-Seite (vod-auctions.com Branding)
6. Multi-Stage Notifications (Label → Abgeholt → Transit → Zugestellt)
7. Fehlzustellung-Handling
8. Zollformulare CN22/CN23 (automatisch für Non-EU)
9. Batch-Label-Druck
10. Self-Service Return Portal
11. Return-Label + Tracking
12. Paketversicherung

---

## 9. sevDesk/easybill Integration (Detail)

### Warum sevDesk oder easybill

| Feature | sevDesk | easybill | lexoffice |
|---------|---------|---------|-----------|
| GoBD | ✅ | ✅ | ✅ |
| DATEV | ✅ | ✅ (direkt) | ✅ |
| EU-USt/OSS | ✅ | ✅ + Monitoring | ✅ |
| §25a Differenzbesteuerung | ⚠️ Manuell konfigurierbar | ⚠️ Manuell | ⚠️ Manuell |
| E-Rechnung (XRechnung) | ✅ | ✅ | ✅ |
| API | Gut (2 req/s) | Stark (dual API) | OK |
| Preis/Monat | €8.90+ | €10+ | €8+ |

**Empfehlung:** **easybill** — stärkstes E-Commerce-API und direkter DATEV-Datenservice. Oder **sevDesk** wenn bereits Account vorhanden.

### §25a in der Rechnungssoftware

Die Rechnungssoftware muss 2 Rechnungsformate unterstützen:
- **Regelbesteuerung:** Netto + 19% USt + Brutto (Standard für VOD Records Neuware)
- **Differenzbesteuerung §25a:** Nur Brutto, Vermerk "Differenzbesteuerung gem. §25a UStG"

→ Erfordert pro Rechnung die Angabe welches Schema gilt. Das wird über `tax_margin_record` gesteuert.

---

## 10. Implementierungsplan (aktualisiert)

### Phase 1: Fundament (Woche 1-2)
- [ ] Steuerberater: §25a Differenzbesteuerung Setup + Validierung
- [ ] sevDesk oder easybill Account einrichten
- [ ] Sendcloud Account erstellen (Free Tier)
- [ ] DHL Geschäftskunden-Account beantragen
- [ ] DB: `inventory_item`, `commission_owner`, `tax_margin_record` Tabellen erstellen
- [ ] DB: `purchase_price`, `inventory_source`, `warehouse_location` auf Release

### Phase 2: Rechnungen + DATEV (Woche 3)
- [ ] sevDesk/easybill API-Connector
- [ ] Payment Success → Invoice erstellen (Regel- oder §25a-Format)
- [ ] Admin: Rechnungen-Übersicht im ERP Hub
- [ ] DATEV-Export Button
- [ ] Gutschriften bei Retouren

### Phase 3: Versand-Automation (Woche 4)
- [ ] Sendcloud Connector (Medusa Plugin oder custom)
- [ ] Admin: "Create Label" pro Transaction
- [ ] Sendcloud Webhooks → fulfillment_status
- [ ] Tracking-Link in Kunden-Emails
- [ ] Batch-Label-Druck
- [ ] Branded Tracking-Seite konfigurieren

### Phase 4: Lager + Kommission (Woche 5-6)
- [ ] Admin: Lager-Übersicht (Bestand nach Source: Frank/VOD Records/Kommission)
- [ ] Wareneingang/-ausgang buchen
- [ ] Kommissionsgeber-Verwaltung
- [ ] Kommissionsabrechnung erstellen + PDF
- [ ] §25a Tracking pro Artikel (Einkaufs- vs. Verkaufspreis)

### Phase 5: ERP Dashboard (Woche 7)
- [ ] Tagesumsatz, Monats-Revenue, offene Zahlungen
- [ ] Steuerbericht (Regel- vs. Differenzbesteuerung)
- [ ] Lagerbestandswert
- [ ] Kommissions-Übersicht (ausstehende Auszahlungen)

---

## 11. Kosten

| Position | Monatlich | Einmalig |
|----------|----------|---------|
| Sendcloud Free → Growth | €0 → €59 | — |
| sevDesk/easybill | €9-18 | — |
| DHL Geschäftskunden | €0 (per Paket) | — |
| Entwicklung Phase 1-5 | — | ~6-7 Wochen |
| Steuerberater §25a Setup | — | ~€500-1.000 |
| **Gesamt Start** | **~€10-20/Monat** | **~€500-1.000 + Dev** |
| **Gesamt bei Skalierung** | **~€60-80/Monat** | — |

---

## 12. Medusa-Native vs. Custom — Ehrliche Bestandsaufnahme

### Was wir von Medusa nutzen (10-15%)

| Medusa Feature | Genutzt? | Begründung |
|---|---|---|
| Auth (Login/Register/Session) | ✅ Ja | Session/Bearer Tokens, Password Reset |
| Admin UI Shell | ✅ Ja | Icons, Layout, Routing für custom Pages |
| ORM + DB Layer | ✅ Ja | model.define(), generateEntityId(), PG_CONNECTION |
| Notification (Resend) | ✅ Ja | Email-Provider in medusa-config.ts |
| Customer | ⚠️ Teilweise | Auth ja, CRM komplett custom |
| Order | ❌ Nein | Custom `transaction` (Auktions-Workflow) |
| Product | ❌ Nein | Custom `Release` (Legacy-Daten) |
| Fulfillment | ❌ Nein | Custom shipping.ts → wird durch Sendcloud ersetzt |
| Inventory | ❌ Nein | Wird durch `inventory_item` Tabelle ersetzt |

### Was wir korrigieren

**Jetzt integrieren (statt selbst bauen):**
- Sendcloud für Versand (existierendes Medusa Plugin)
- sevDesk/easybill für Rechnungen + DATEV
- Medusa Fulfillment Module für Sendcloud Provider

**Custom bauen (kein Tool am Markt liefert das):**
- ERP Admin Hub (Operations-Zentrale)
- Kommissionsabrechnung (Modell A)
- §25a Differenzbesteuerung Tracking
- Lager-Verwaltung (einfache Ein-/Ausbuchung)

**Nicht umbauen (Risiko > Nutzen):**
- Transaction → zu verschieden von Medusa Order
- Release → Legacy-Daten, Migration wäre massiv
- Auction Module → kein Standard-Framework kann das

---

## 13. Action Items — Sofort

| # | Was | Wer | Wann |
|---|---|---|---|
| 1 | **Steuerberater: §25a Differenzbesteuerung klären** | Robin + Frank | **Sofort, vor Launch** |
| 2 | sevDesk oder easybill Account einrichten | Robin | Diese Woche |
| 3 | Sendcloud Account erstellen | Robin | Diese Woche |
| 4 | DHL Geschäftskunden beantragen | Frank | Diese Woche |
| 5 | `purchase_price` Feld auf Release-Tabelle planen | Robin | Vor Phase 2 |
