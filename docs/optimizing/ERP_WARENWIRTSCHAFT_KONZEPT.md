# ERP / Warenwirtschaft / Fibu / Logistik — Konzept & Analyse

**Erstellt:** 2026-04-04
**Kontext:** VOD Auctions — 41.500 Produkte, erwartetes Volumen 10-50 Bestellungen/Tag
**Frage:** Brauchen wir ein vollständiges ERP-System?

---

## 1. Die ehrliche Antwort

**Bei 10-50 Bestellungen/Tag von einer Single-Channel-Plattform: Nein, ein vollständiges ERP-System ist nicht notwendig und wäre kontraproduktiv.**

Das bedeutet NICHT, dass wir keine Automatisierung brauchen. Es bedeutet, dass die richtige Lösung ein **modularer Ansatz** ist: spezialisierte Tools für spezifische Funktionen, verbunden über APIs.

---

## 2. Warum kein volles ERP — die Argumente

### Was ein ERP löst (und was wir davon brauchen)

| ERP-Funktion | Brauchen wir das? | Begründung |
|---|---|---|
| Multi-Channel-Sync | **Nein** | Single-Channel (eigene Website). Kein eBay, kein Discogs Marketplace |
| Lagerverwaltung/WMS | **Nein** | Unique Items (Qty 1), keine Varianten, kein Nachbestellen |
| Einkauf/Bestellwesen | **Nein** | Kein Wareneinkauf — Frank hat die Sammlung bereits |
| Produktionsplanung | **Nein** | Keine Produktion |
| Rechnungsstellung | **Ja** | GoBD-konform, fortlaufende Nummern, 10 Jahre Archivierung |
| DATEV-Export | **Ja** | Steuerberater braucht das |
| Versandetiketten | **Ja** | Ab 20+ Bestellungen/Tag manuell nicht skalierbar |
| EU-USt/OSS | **Ja** | Pflicht bei EU-Verkäufen > €10.000/Jahr |
| Bestandsführung | **Teilweise** | Bereits in Medusa (available → sold) |
| Kundenmanagement | **Bereits vorhanden** | CRM in Medusa mit Stats, Notes, Timeline |
| Retourenmanagement | **Minimal** | < 2% bei Vinyl — manuell handhabbar |

**Ergebnis:** Von ~12 ERP-Kernfunktionen brauchen wir 4. Davon sind 2 bereits implementiert.

### Was VOD Auctions bereits hat (Medusa)

| Funktion | Status | Details |
|---|---|---|
| Bestellverwaltung | ✅ Komplett | Lifecycle pending → paid → shipped → delivered, Order Numbers, Audit Trail |
| Zahlungsabwicklung | ✅ Komplett | Stripe + PayPal, Webhooks, Refunds |
| Bestandsführung | ✅ Komplett | available → reserved → in_auction → sold, Daily Sync |
| Kundenmanagement | ✅ Komplett | CRM mit Stats, Notes, Timeline, VIP, DSGVO |
| Rechnungs-PDF | ✅ Vorhanden | pdfkit, muss auf GoBD-Konformität geprüft werden |
| Versandlabel-PDF | ✅ Vorhanden | pdfkit, aber kein echtes DHL-Label mit Tracking |
| CSV-Export | ✅ Vorhanden | Transactions + Customers |
| Bulk-Aktionen | ✅ Vorhanden | Bulk Mark-as-Shipped |
| E-Mail-Automation | ✅ Komplett | 6 transaktionale Mails + Newsletter |

### Die echten Lücken (was fehlt)

| Lücke | Priorität | Lösung |
|---|---|---|
| **DATEV-Export** | Hoch | sevDesk/lexoffice API |
| **DHL API Integration** | Hoch | DHL Geschäftskunden API (echte Labels + Tracking) |
| **GoBD-konforme Rechnungen** | Hoch | sevDesk API (fortlaufende Nummern, Archivierung) |
| **EU-USt/OSS** | Mittel | sevDesk + Steuerberater-Beratung |
| **Differenzbesteuerung §25a** | Mittel | Steuerberater (Margenbesteuerung für Gebrauchtware) |

---

## 3. Benchmark: Wie machen es die Großen?

### Discogs (Marketplace, 30M+ Artikel)
- Stellt **kein ERP** zur Verfügung — Seller sind für Fulfillment selbst verantwortlich
- Die meisten High-Volume Discogs-Seller (50-200 Bestellungen/Woche) nutzen: Tabellen + Buchhaltungssoftware + manuelle Versandworkflows
- eBay PowerSeller in DE nutzen JTL-Wawi oder Billbee für Multi-Channel

### Catawiki (Kuratierte Auktionen, unser direkter Vergleich)
- Bietet: Auktionsmechanik + Payment Escrow + Versandlabel-Integration (Sendcloud/Packlink)
- Bietet NICHT: ERP, Buchhaltung, DATEV, Lagerverwaltung
- Seller handles: Verpackung, Carrier-Abgabe, eigene Buchhaltung
- **Selbst Catawiki, eine große Plattform, bietet keine ERP-Funktionalität**

### Unabhängige Plattenläden
- **HHV Berlin** (50.000+ Artikel, Multi-Channel): Nutzt wahrscheinlich JTL/Xentral — aber die sind Multi-Channel (eBay + Discogs + eigener Shop)
- **Boomkat Manchester** (~1.000 Artikel): Custom Platform + Buchhaltungssoftware, kein ERP
- **Norman Records Leeds** (~5.000 Artikel): Shopify + Xero (Buchhaltung), kein ERP

### Der Muster: ERP wird erst nötig bei
- **Multi-Channel-Verkauf** (gleiches Inventar auf 3+ Plattformen) — DAS ist der Haupttrigger
- **100+ Bestellungen/Tag** mit Lagerpersonal
- **Komplexe Lieferketten** (Einkauf + Produktion + Lager + Versand)

**VOD Auctions hat KEINEN dieser Trigger.**

---

## 4. Der ERP-Markt in Deutschland — Preisvergleich

| Tool | Monatlich | Stärke | Medusa-Integration | Empfehlung |
|---|---|---|---|---|
| **Xentral** | €199-799 | Multi-Channel ERP | Custom API (3-4 Wochen) | ❌ Overkill |
| **Billbee** | €0-94 | Order Management | Custom API (Tage) | ⚠️ Vielleicht später |
| **JTL-Wawi** | Kostenlos | Windows-ERP für eBay/Amazon | Schmerzhaft | ❌ Falsches Ökosystem |
| **sevDesk** | €9-43 | Rechnungen + DATEV | Gute API (1-2 Tage) | ✅ **Empfohlen** |
| **lexoffice** | €4-17 | Rechnungen + DATEV | OK API | ✅ Alternative |
| **Weclapp** | €59-149/User | General-Purpose ERP | Custom API | ❌ Nicht passend |

---

## 5. Die empfohlene Lösung: Composable Stack

```
┌─────────────────────────────────────────────────────┐
│  VOD Auctions (Medusa.js)                            │
│  Orders, Inventory, CRM, Auctions, Payments          │
│                                                       │
│  Bestellung bezahlt ──────┬───────────────────────── │
│                           │                           │
│                           ▼                           │
│                   ┌──────────────┐                    │
│                   │  sevDesk API  │                    │
│                   │  Rechnung     │                    │
│                   │  DATEV Export  │                    │
│                   │  €18/Monat    │                    │
│                   └──────────────┘                    │
│                                                       │
│  Versand bestätigt ───────┬───────────────────────── │
│                           │                           │
│                           ▼                           │
│                   ┌──────────────┐                    │
│                   │  DHL API      │                    │
│                   │  Versandlabel │                    │
│                   │  Tracking-Nr. │                    │
│                   │  Kostenlos    │                    │
│                   └──────────────┘                    │
│                                                       │
│  Alles andere ──── bereits in Medusa implementiert    │
└─────────────────────────────────────────────────────┘
```

### Kosten Composable vs. ERP

| | Composable (empfohlen) | ERP (Xentral) |
|---|---|---|
| **Monatliche Kosten** | ~€20-50 | €199-799 |
| **Setup-Kosten** | 1-2 Wochen Dev | €1.000-2.000 + 3-4 Wochen Dev |
| **Jahr 1 Gesamt** | **~€250-600** | **~€10.000-15.000** |
| **Laufend/Jahr** | **~€250-600** | **~€2.400-9.600** |
| **Komplexität** | Niedrig (2 API-Integrationen) | Hoch (neues System lernen + Connector pflegen) |
| **Vendor Lock-in** | Minimal (sevDesk austauschbar) | Hoch (ERP-Migration ist schmerzhaft) |

---

## 6. Konkreter Implementierungsplan

### Phase 1: Launch (Jetzt → erste 30 Verkaufstage)

**Keine zusätzliche Entwicklung nötig.**

- sevDesk Account erstellen (€18/Monat)
- Rechnungen manuell in sevDesk erstellen (Copy-Paste aus Medusa Admin)
- Versandlabels über DHL Geschäftskundenportal Web-UI erstellen
- Bestellverwaltung über bestehendes Medusa Admin

**Zeitaufwand pro Bestellung:** ~5-10 Minuten
**Skalierbar bis:** ~15-20 Bestellungen/Tag (1-2h Adminzeit)

### Phase 2: Automatisierung (bei 15-20 Bestellungen/Tag regelmäßig)

**Entwicklungsaufwand: ~1-2 Wochen**

1. **sevDesk API Integration** (2-3 Tage)
   - Bestellung bezahlt → automatisch Rechnung in sevDesk erstellen
   - GoBD-konforme fortlaufende Nummern
   - DATEV-Export automatisch verfügbar
   - API: `POST /api/v1/Invoice` mit Kundendaten + Positionen

2. **DHL Geschäftskunden API** (3-5 Tage)
   - Admin UI: "Create Shipping Label" Button pro Bestellung
   - DHL API generiert echtes Label mit Barcode + Tracking-Nummer
   - Tracking-Nummer wird in Transaction gespeichert
   - Automatische E-Mail an Kunden mit Tracking-Link
   - API: DHL Paket API 2.0 (REST, gut dokumentiert)

3. **Automatische Zustandsübergänge** (1-2 Tage)
   - Bezahlt → sevDesk-Rechnung erstellt → Admin benachrichtigt
   - Label erstellt → Status "Packing" → Tracking-Nr. gespeichert
   - DHL Tracking-Update → Status "Shipped" → Kunden-E-Mail

**Zeitaufwand pro Bestellung nach Phase 2:** ~1-2 Minuten (statt 5-10)
**Skalierbar bis:** ~50-100 Bestellungen/Tag

### Phase 3: Skalierung (bei 50+ Bestellungen/Tag)

- Batch-Label-Druck (alle offenen Bestellungen → ein Klick → alle Labels)
- Packlisten-PDF generieren
- Multi-Carrier (Shipcloud statt nur DHL)
- Automatisierte Feedback-Requests

### Phase 4: ERP-Evaluation (bei 100+ Bestellungen/Tag ODER Multi-Channel)

- Erst dann: Xentral oder Billbee evaluieren
- Basis: 12-18 Monate operative Daten als Entscheidungsgrundlage
- Migration: Medusa-Daten sind sauber und exportierbar

---

## 7. Warum ERP zu früh kontraproduktiv ist

### 1. Kosten-Nutzen
€200+/Monat für Xentral vs. €18/Monat für sevDesk. Die Differenz (€2.200/Jahr) finanziert 3 Wochen Entwicklungsarbeit.

### 2. Integrations-Overhead
Jede Medusa-Änderung erfordert Testing des ERP-Connectors. Jedes ERP-Update kann die Integration brechen. Zwei Admin-Interfaces statt eins.

### 3. Falscher Fokus
Dev-Zeit sollte in Auktions-Features und Kunden-Experience fließen, nicht in ERP-Integration.

### 4. Vendor Lock-in
ERPs sind klebrig. Einmal eingeführt, werden Prozesse abhängig. Migration weg von einem ERP ist immer schmerzhaft.

### 5. Lösung ohne Problem
Die Hauptgründe für ERP-Einführung (Multi-Channel, Lagerkomplexität, Lieferketten) existieren bei VOD Auctions nicht.

---

## 8. Was wirklich dringend ist (Action Items)

| # | Was | Warum | Wann |
|---|---|---|---|
| 1 | sevDesk Account einrichten | DATEV-Export für Steuerberater | Vor Launch |
| 2 | Rechnungsformat mit Steuerberater abstimmen | GoBD-Konformität, §25a Differenzbesteuerung | Vor Launch |
| 3 | DHL Geschäftskunden-Account beantragen | Günstigere Versandpreise, API-Zugang | Vor Launch |
| 4 | sevDesk API Integration entwickeln | Automatische Rechnungsstellung | Bei 15-20 Bestellungen/Tag |
| 5 | DHL API Integration entwickeln | Automatische Versandlabels + Tracking | Bei 15-20 Bestellungen/Tag |

---

## 9. Fazit

**Die Zweifel sind berechtigt — aber die Lösung ist nicht "ERP kaufen", sondern "die richtigen 2-3 Integrationen bauen".**

VOD Auctions hat mit Medusa bereits 70% der operativen Funktionalität eines ERPs. Die fehlenden 30% (Rechnungen, DATEV, Versandlabels) werden durch 2 API-Integrationen (sevDesk + DHL) abgedeckt — für €18/Monat statt €200+/Monat.

Das ist exakt der Ansatz den erfolgreiche D2C-Marken, unabhängige Plattenläden und selbst große Marktplätze wie Catawiki nutzen: **Composable Commerce** — spezialisierte Tools, verbunden über APIs, statt ein monolithisches ERP das 80% ungenutzte Features mitbringt.

**Die Plattform liefert. Was fehlt sind 2 API-Integrationen und ein sevDesk-Account.**

---

## 10. Medusa-Native vs. Custom — Ehrliche Bestandsaufnahme

### Was wir von Medusa nutzen (10-15%)

| Medusa Feature | Genutzt? | Begründung |
|---|---|---|
| Auth (Login/Register/Session) | ✅ Ja | Session/Bearer Tokens, Password Reset |
| Admin UI Shell | ✅ Ja | Icons, Layout, Routing für custom Pages |
| ORM + DB Layer | ✅ Ja | model.define(), generateEntityId(), PG_CONNECTION |
| Notification (Resend) | ✅ Ja | Email-Provider in medusa-config.ts |
| Customer | ⚠️ Teilweise | Auth ja, CRM komplett custom |
| Order | ❌ Nein | Custom `transaction` Tabelle |
| Product | ❌ Nein | Custom `Release` Tabelle (Legacy) |
| Cart | ❌ Nein | Custom `cart_item` Tabelle |
| Inventory | ❌ Nein | Binary `legacy_available` auf Release |
| Fulfillment | ❌ Nein | Custom shipping.ts |
| Payment | ❌ Nein | Custom Stripe/PayPal Webhooks |

### Warum so viel Custom?

**Berechtigte Gründe:**
- Auktionsmodell (Proxy Bidding, Anti-Sniping, Blöcke) → kein Standard-Commerce-System kann das
- Unique Items (Qty 1, keine Varianten) → Medusa's Product/Inventory Modell passt nicht
- Legacy-Daten (41.500 Releases in camelCase-Tabellen) → waren vor Medusa da
- Dual Payment (Stripe + PayPal Direct) → Medusa's Payment-Modul hat Limitierungen

**Fragwürdige Entscheidungen:**
- Customer CRM hätte als Erweiterung von Medusa's Customer gebaut werden können
- Fulfillment/Shipping hätte über Medusa's Fulfillment Module + Provider laufen können
- Direktkauf-Orders hätten Medusa's native Order nutzen können

### Was wir korrigieren (und was nicht)

**Jetzt integrieren (statt selbst bauen):**
- Sendcloud für Versand → existierendes Medusa Plugin
- sevDesk/easybill für Rechnungen → API-Integration
- Medusa Fulfillment Module → für Sendcloud Provider

**Nicht umbauen (Risiko > Nutzen):**
- Transaction → zu verschieden von Medusa Order (dual item_type, order_group)
- Release → Legacy-Daten, 41.500 Einträge, Migration wäre massiv
- Auction Module → kein Standard-Framework unterstützt das

---

## 11. Existierende Tools & Medusa-Plugins

### Medusa.js Ökosystem — Was es bereits gibt

| Plugin | GitHub | Funktion |
|---|---|---|
| `@saphes/sendcloud-plugin` | Community | Sendcloud Fulfillment Provider für Medusa |
| `@rsc-labs/medusa-documents-v2` | [GitHub](https://github.com/RSC-Labs/medusa-documents) | PDF Rechnungen im Admin, i18n |
| ShipStation Integration | Offizielle Medusa Docs | Multi-Carrier Shipping |
| Odoo ERP Recipe | Offizielle Medusa Docs | Open Source ERP Connector |
| `medusa-fulfillment-shippo` | [GitHub](https://github.com/macder/medusa-fulfillment-shippo) | Shippo Carrier Integration |

### SaaS-Vergleich Versand

| Platform | Medusa Plugin | EU-Fokus | Free Tier | Label-Preis |
|---|---|---|---|---|
| **Sendcloud** | ✅ Ja | ✅ Stark | Unlimitiert | €0.15/Überschreitung |
| ShipStation | ✅ Ja (offiziell) | ⚠️ Mittel | Nein | ab $14.99/Mo |
| Shippo | ✅ Community | ⚠️ Mittel | 30 Labels/Mo | $0.05/Label |
| Shipcloud | ❌ Nein | ✅ Stark | Nein | Per Carrier |

### SaaS-Vergleich Rechnungen (DE)

| Tool | Preis/Mo | GoBD | DATEV | EU-USt/OSS | API |
|---|---|---|---|---|---|
| **sevDesk** | €8.90+ | ✅ | ✅ | ✅ | Gut |
| **easybill** | €10+ | ✅ | ✅ (direkt) | ✅ + OSS-Monitoring | Stark |
| lexoffice | €8+ | ✅ | ✅ | ✅ | OK |

### 20 Workflows die Sendcloud + sevDesk liefern

**Pre-Shipment:**
1. Packliste (anders als Rechnung)
2. Carrier-Ratenvergleich
3. Adressvalidierung
4. Lieferzeitschätzung
5. Paketgewicht-Berechnung

**Shipment:**
6. Label mit Barcode + Tracking
7. Zollformulare CN22/CN23
8. Batch-Label-Druck
9. Carrier-Pickup
10. Versicherung High-Value

**Post-Shipment:**
11. Branded Tracking-Seite
12. Multi-Stage Notifications
13. Fehlzustellung-Handling
14. Proof of Delivery

**Retouren:**
15. Self-Service Return Portal
16. Return-Label
17. Return-Tracking

**Buchhaltung:**
18. GoBD-konforme Rechnungen + Archivierung
19. DATEV-Export
20. EU-USt/OSS + Gutschriften

---

## 12. Implementierungsplan

### Woche 1: Accounts + Grundsetup
- Sendcloud Account (Free Tier)
- sevDesk Account (€8.90/Monat)
- DHL Geschäftskunden-Account
- Steuerberater: §25a Differenzbesteuerung klären

### Woche 2: sevDesk Integration
- API-Connector im Backend
- Payment Success → Invoice in sevDesk
- Admin: Rechnungen-Übersicht

### Woche 3: Sendcloud Integration
- Medusa Plugin oder eigener Connector
- Admin: "Create Label" Button
- Webhooks → fulfillment_status
- Tracking-Link in Kunden-Emails

### Woche 4: Admin Operations Dashboard
- Rechnungen-Übersicht
- Versand-Übersicht
- Tagesumsatz / Revenue
- DATEV-Export Button

### Gesamtkosten: €8.90/Monat + 2-3 Wochen Entwicklung
