# ERP / Warenwirtschaft — Architektur- und Entscheidungsdokument

**Version:** 3.0
**Erstellt:** 2026-04-02 | **Aktualisiert:** 2026-04-02
**Autor:** Robin Seckler (digital spread UG)
**Betreiber:** VOD Records, Friedrichshafen (Frank Bull)
**Status:** Entscheidungsvorlage — vor Implementierung müssen die unter Abschnitt 11 gelisteten offenen Punkte geklärt werden

---

## Inhaltsverzeichnis

1. [Executive Summary](#1-executive-summary)
2. [Geschäftsmodelle und operative Prozesslogiken](#2-geschäftsmodelle-und-operative-prozesslogiken)
3. [Prozesssicht entlang echter Prozessketten](#3-prozesssicht-entlang-echter-prozessketten)
4. [Steuer- und Buchungslogik](#4-steuer--und-buchungslogik)
5. [Datenmodell](#5-datenmodell)
6. [Release-fähige Zielarchitektur und Parallelentwicklung](#6-release-fähige-zielarchitektur-und-parallelentwicklung)
7. [Architekturentscheidung: Composable vs. ERP-Software](#7-architekturentscheidung-composable-vs-erp-software)
8. [Marketplace von Anfang an mitdenken](#8-marketplace-von-anfang-an-mitdenken)
9. [Risiken und Ausnahmefälle](#9-risiken-und-ausnahmefälle)
10. [Empfehlung und Implementierungsplan](#10-empfehlung-und-implementierungsplan)
11. [Offene fachliche Entscheidungen](#11-offene-fachliche-entscheidungen)
12. [Anhang](#12-anhang)

---

## 1. Executive Summary

### Ausgangslage

VOD Auctions betreibt eine Auktions- und Direktverkaufsplattform fuer ~41.500 Tontraeger (Industrial Music, Literatur, Merchandise). Die Plattform laeuft auf Medusa.js 2.x mit einem Custom-Auktionsmodul, Stripe/PayPal-Payment, und eigenem Order-Management. Es gibt kein ERP-System, keine automatisierte Rechnungsstellung, keine Bestandsfuehrung jenseits des `legacy_available`-Flags, und keinen strukturierten Versandprozess.

### Kernproblem

Die Plattform ist als Verkaufskanal funktionsfaehig, aber als Geschaeftsbetrieb unvollstaendig. Es fehlen:

- **Rechnungsstellung:** Keine GoBD-konforme Rechnungserzeugung, keine fortlaufenden Nummern, kein Archiv.
- **Steuerliche Korrektheit:** Keine Differenzbesteuerung (§25a UStG), obwohl der ueberwiegende Teil der Ware gebraucht ist und von Privatpersonen stammt. Das bedeutet aktuell: zu hohe Steuerlast.
- **Bestandsfuehrung:** Kein Bestandsmodell, das Eigentum, Quelle, Einkaufspreis und Lagerort pro Einheit trackt. Kritisch fuer Kommission und §25a.
- **Versand:** Manueller Prozess ohne Label-Automatisierung, ohne Tracking-Integration, ohne Carrier-Management.
- **Buchhaltung:** Kein DATEV-Export, keine strukturierte Trennung der Erloesarten.
- **Skalierbarkeit:** Die aktuelle Architektur traegt weder Kommissionsverkauf noch Marketplace noch Eigenware mit Qty > 1.

### Zielbild

Ein modulares ERP-System, das als Erweiterung des bestehenden Medusa-Admin aufgebaut wird und folgende Faehigkeiten bietet:

1. GoBD-konforme Rechnungsstellung mit §25a-Unterstuetzung (via sevDesk oder easybill)
2. Artikelgenaue Bestandsfuehrung mit Quellenzuordnung und Einkaufspreiserfassung
3. Automatisierter Versand mit Label-Generierung und Tracking (via Sendcloud)
4. Kommissionsabrechnung mit zeilengenauem Settlement
5. DATEV-Export mit korrekter Trennung der Steuer- und Erloesarten
6. Strukturelle Marketplace-Faehigkeit ab Tag 1, operative Aktivierung spaeter

### Empfohlene Richtung

**Composable Stack** (Option A): Sendcloud + sevDesk/easybill + Custom-Module im Admin. Kein vollstaendiges ERP-Produkt (Billbee/Xentral), da keines der Produkte am Markt die Kombination aus Auktionslogik, §25a-Differenzbesteuerung, Kommissionsabrechnung und Marketplace-Payout abbilden kann. Die Eigenentwicklung beschraenkt sich auf die Teile, die kein SaaS-Produkt liefert; Rechnungen, Versand und DATEV werden an spezialisierte Dienste delegiert.

### Wichtigste offene Punkte und Risiken

| Thema | Risiko | Abhaengigkeit |
|-------|--------|---------------|
| §25a-Konfiguration | Falsche Steuerbehandlung = Nachzahlung + Zinsen | Steuerberater muss Setup validieren |
| Kommissionsvertrag | Ohne Vertragsvorlage keine Kommissionsabrechnung | Rechtsanwalt oder Steuerberater |
| Sendcloud-Account | Ohne DHL-Geschaeftskundennummer kein Versand | DHL-Antrag (2-4 Wochen) |
| sevDesk/easybill §25a | Manuell konfigurierbar, aber nicht "out of the box" | Test mit echten Rechnungen vor Go-Live |
| Parallelbetrieb | Mischzustand alte/neue Logik bei schrittweiser Aktivierung | Feature-Flag-Disziplin |
| Marketplace Payment | Stripe Connect erfordert Plattform-Verifizierung | Stripe Connect Application |

---

## 2. Geschaeftsmodelle und operative Prozesslogiken

Die Plattform bedient vier grundlegend verschiedene Geschaeftsmodelle. Jedes Modell hat eigene Eigentumsverhaeltnisse, Steuerregeln, Zahlungsfluesse und Buchhaltungsanforderungen. Sie sind keine Varianten eines Modells, sondern eigenstaendige operative Prozesslogiken.

### Modell 0: Franks Sammlung (Bestand und Auktionen)

**Das heutige Kerngeschaeft.** Frank Bull verkauft seine private Sammlung von ~41.500 Tontraegern ueber die Plattform.

| Dimension | Auspraegung |
|-----------|-------------|
| **Eigentum** | Frank Bull (Privatperson) |
| **Lager** | VOD-Lager, Friedrichshafen |
| **Versand** | VOD |
| **Rechnung** | VOD Records an Kaeufer |
| **Verkaeuferrolle** | VOD Records = Verkaeufer (Frank als Gesellschafter/Inhaber) |
| **Zahlungsfluss** | Kaeufer → Stripe/PayPal → VOD-Konto |
| **Steuer** | §25a moeglich: Privatsammlung, kein Vorsteuerabzug beim Erwerb, Einkaufspreis = 0 bei Eigensammlung |
| **Buchhaltung** | Erloese auf Erloes-Konto §25a; Marge = Verkaufspreis (da EK = 0); USt = 19/119 * Marge |
| **Bestandsfuehrung** | Qty = 1 pro Artikel; Status: available → reserved → sold → shipped |

**Steuerliche Besonderheit:** Bei Franks Sammlung ist der Einkaufspreis typischerweise nicht mehr nachweisbar (ueber Jahrzehnte gesammelt). Das Finanzamt akzeptiert in solchen Faellen haeufig EK = 0, was bedeutet: die volle Verkaufssumme ist die Marge, und die USt wird auf diese Marge berechnet. Das klingt nach keinem Vorteil gegenueber Regelbesteuerung — der Vorteil liegt darin, dass bei §25a die Marge als Bruttobetrag gilt (USt = 19/119 * Marge statt 19/100 * Netto). Der tatsaechliche Steuervorteil bei EK = 0 ist gering (~1,3%), wird aber erheblich, sobald Ware mit nachweisbarem EK > 0 hinzukommt (Kommission, Zukaeufe).

**Steuerberater-Validierung noetig:** Ob Franks gesamte Sammlung unter §25a faellt, haengt davon ab, ob Frank als Privatperson oder als gewerblicher Haendler eingestuft wird. Bei ~41.500 Artikeln und regelmaessigen Auktionen ist eine gewerbliche Einstufung wahrscheinlich. Die §25a-Faehigkeit bleibt davon unberuehrt (auch gewerbliche Haendler koennen §25a anwenden), aber die formalen Anforderungen aendern sich.

### Modell A: Kommissionsverkauf

**Dritte liefern grosse Sammlungen an VOD. VOD lagert, verkauft und versendet — im eigenen Namen, fuer fremde Rechnung.**

| Dimension | Auspraegung |
|-----------|-------------|
| **Eigentum** | Dritter (Kommissionsgeber). Eigentum geht erst bei Verkauf an Kaeufer ueber |
| **Lager** | VOD-Lager (eingelagert, physisch getrennt oder zumindest buchhalterisch zugeordnet) |
| **Versand** | VOD |
| **Rechnung** | VOD Records an Kaeufer (als Kommissionaer, §383 HGB) |
| **Verkaeuferrolle** | VOD = Kommissionaer. Handelt im eigenen Namen, fuer Rechnung des Kommittenten |
| **Zahlungsfluss** | Kaeufer → Stripe/PayPal → VOD-Konto → periodische Abrechnung → Auszahlung an Kommissionsgeber |
| **Steuer** | §25a moeglich wenn Einkauf von Privatperson ohne USt-Ausweis. VOD stellt Rechnung ohne separaten USt-Ausweis. Bei gewerblichen Kommissionsgebern mit USt-Rechnung: Regelbesteuerung |
| **Buchhaltung** | Erloes = Verkaufspreis; Aufwand = Auszahlung an Kommittent; Differenz = Provision (VODs Ertrag). Separate Konten: Verbindlichkeiten gegenueber Kommittenten, Provisionserloes |
| **Bestandsfuehrung** | Jeder Artikel muss dem Kommissionsgeber zugeordnet sein. EK pro Artikel erfassen (fuer §25a-Nachweis) |

**Kommissionsabrechnung:**
- VOD erstellt periodisch (monatlich oder nach Block-Ende) eine Abrechnung fuer jeden Kommissionsgeber
- Inhalt: Verkaufte Artikel, Verkaufspreise, VOD-Provision (%), Netto-Auszahlungsbetrag
- Die Abrechnung ist eine Gutschrift (im steuerlichen Sinne), keine Rechnung
- Auszahlung per Ueberweisung nach Freigabe

**Vertragliche Anforderung:** Kommissionsvertrag mit:
- Provisionssatz (Standard: 20-30% verhandelbar)
- Mindestverkaufspreis (wenn vereinbart)
- Laufzeit und Kuendigungsfrist
- Versicherung der eingelagerten Ware
- Rueckgabe unverkaufter Ware
- Haftung bei Beschaedigung

### Modell B: B2C Marketplace

**Die Plattform oeffnet sich fuer externe Seller. Seller listen, lagern und versenden selbst. VOD ist reiner Vermittler.**

| Dimension | Auspraegung |
|-----------|-------------|
| **Eigentum** | Seller (bleibt durchgehend beim Seller) |
| **Lager** | Seller-Lager (VOD hat keinen physischen Kontakt mit der Ware) |
| **Versand** | Seller versendet direkt an Kaeufer |
| **Rechnung** | Seller an Kaeufer. VOD erstellt KEINE Verkaufsrechnung (VOD ist Vermittler, nicht Verkaeufer) |
| **Verkaeuferrolle** | Seller = Verkaeufer. VOD = Plattformbetreiber/Vermittler |
| **Zahlungsfluss** | Kaeufer → Stripe Connect → Seller-Konto (abzgl. Plattform-Fee). VOD beruehrt das Geld nie |
| **Steuer** | VOD versteuert nur eigene Provisionseinnahmen (Dienstleistung, 19% USt). Seller ist fuer seine eigene USt verantwortlich. Kein §25a fuer VOD (VOD verkauft nicht). DAC7-Meldepflicht |
| **Buchhaltung** | VODs Erloese = Provisionseinnahmen (Dienstleistung). Kein Warenumsatz. Separate Buchung |
| **Bestandsfuehrung** | Seller verwaltet eigenen Bestand. Plattform trackt nur Listing-Status (active/sold/removed) |

**Regulatorische Pflichten (Details in RSE-291):**
- **§22f UStG:** Aufzeichnungspflichten pro Seller (Name, Adresse, Steuer-ID, Transaktionen). 10 Jahre Aufbewahrung
- **§25e UStG:** Gesamtschuldnerische Haftung fuer Seller-USt. Safe Harbor nur mit F22-Bescheinigung
- **DAC7:** Jaehrliche Meldung an BZSt (bis 31. Januar). Pro Seller: TIN, IBAN, Umsaetze, Gebuehren
- **Verbraucherschutz:** Kennzeichnung privat vs. gewerblich, Widerrufsrecht bei gewerblichen Sellern
- **GPSR:** Kontaktstelle fuer Marktaufsicht benennen

**Fee-Modell (siehe RSE-291 fuer Marktvergleich):**
- Empfehlung: 10% Verkaeuferprovision, 0% Kaeuferaufschlag, 0 Listing-Gebuehr
- Alternative: Membership-Fee monatlich statt Transaktionskosten (Positionierung als "faire Alternative zu Discogs")
- Endgueltige Entscheidung noch offen (siehe Abschnitt 11)

**Payment-Architektur:**
- Stripe Connect (Express): Seller erstellt Express-Account, KYC via Stripe. Bei Verkauf: Stripe splittet Payment automatisch. Payout an Seller nach Versandbestaetigung
- Spaeter Mangopay: Nativer Escrow, E-Wallet pro Seller, besser fuer hohe Volumina
- Eigenes Payout-System ist KEINE Option (BaFin-Lizenzpflicht, §10 ZAG)

### Modell C: VOD Records Eigenware

**VOD Records produziert oder kauft eigene Ware (Vinyl Reissues, Box Sets, Merchandise) und verkauft diese ueber die Plattform.**

| Dimension | Auspraegung |
|-----------|-------------|
| **Eigentum** | VOD Records |
| **Lager** | VOD-Lager |
| **Versand** | VOD |
| **Rechnung** | VOD Records an Kaeufer |
| **Verkaeuferrolle** | VOD Records = Verkaeufer (Eigengeschaeft) |
| **Zahlungsfluss** | Kaeufer → Stripe/PayPal → VOD-Konto |
| **Steuer** | Regelbesteuerung. Neuware, Einkauf mit Vorsteuerabzug → kein §25a |
| **Buchhaltung** | Wareneinsatz (EK) gegen Erloese (VK). Vorsteuerabzug auf Einkaufsrechnungen. Standard-GuV |
| **Bestandsfuehrung** | Qty > 1 moeglich (z.B. 300 Stueck einer Pressung). Bestandsabnahme bei Verkauf. Nachbestellung moeglich |

**Besonderheit gegenueber Modell 0:**
- Neuware → kein §25a, Regelbesteuerung mit separatem USt-Ausweis
- Qty > 1 → erfordert echtes Bestandsmanagement (nicht nur Qty 1 wie bei Sammlung)
- Einkaufsrechnungen vorhanden → Vorsteuerabzug
- Nachbestellungen moeglich → optional: Bestellwesen/Einkaufsmodul

### Zusammenfassung: Was jedes Modell vom System verlangt

| Anforderung | Mod. 0 | Mod. A | Mod. B | Mod. C |
|-------------|--------|--------|--------|--------|
| Bestandsfuehrung (Qty 1) | Ja | Ja | Nein | — |
| Bestandsfuehrung (Qty > 1) | Nein | Nein | Nein | Ja |
| Einkaufspreis pro Artikel | Optional | Pflicht | Nein | Pflicht |
| Quellenzuordnung (Eigentum) | Ja | Ja | Nein | Ja |
| Kommissionsabrechnung | Nein | Ja | Nein | Nein |
| Seller-Payout | Nein | Nein | Ja | Nein |
| §25a Differenzbesteuerung | Ja | Moeglich | Nein | Nein |
| Regelbesteuerung | Nein | Moeglich | Nur Provision | Ja |
| GoBD-Rechnung (VOD stellt aus) | Ja | Ja | Nein (nur Fee) | Ja |
| Seller-Rechnung (Dritter stellt aus) | Nein | Nein | Ja | Nein |
| Stripe Connect Split-Payment | Nein | Nein | Ja | Nein |
| DAC7-Meldepflicht | Nein | Nein | Ja | Nein |
| F22-Bescheinigung Seller | Nein | Nein | Ja (gewerbl.) | Nein |
| DATEV-Export | Ja | Ja | Ja (Provision) | Ja |
| Sendcloud Label | Ja | Ja | Nein (Seller) | Ja |

---

## 3. Prozesssicht entlang echter Prozessketten

### Prozesslandkarte

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                      WARENEINGANG                           │
                    │  Mod 0: Migration  │  Mod A: Uebernahme  │  Mod C: Einkauf │
                    └─────────┬───────────────────┬──────────────────────┬────────┘
                              │                   │                      │
                              ▼                   ▼                      ▼
                    ┌─────────────────────────────────────────────────────────────┐
                    │                  BESTANDSKLASSIFIKATION                     │
                    │  Quelle │ Steuerschema │ Zustand │ Lagerort │ EK-Zuordnung │
                    └─────────┬──────────────────────────────────────────────────┘
                              │
                    ┌─────────▼──────────────────────────────────────────────────┐
                    │                   VERKAUF / ORDER MGMT                      │
                    │     Auktion        │    Direktkauf     │   Marketplace      │
                    └─────────┬──────────────────┬───────────────────┬───────────┘
                              │                  │                   │
                    ┌─────────▼──────────────────▼───────────────────▼───────────┐
                    │                   RECHNUNGSSTELLUNG                         │
                    │  §25a-Rechnung │ Regel-Rechnung │ Keine (Marketplace)      │
                    └─────────┬──────────────────────────────────────────────────┘
                              │
                    ┌─────────▼──────────────────────────────────────────────────┐
                    │                   VERSAND / FULFILLMENT                     │
                    │  Sendcloud Label │ Tracking │ Zustellung │ Seller-Versand  │
                    └─────────┬──────────────────────────────────────────────────┘
                              │
              ┌───────────────┼──────────────────┐
              ▼               ▼                  ▼
    ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐
    │ RETOURE /   │  │ SETTLEMENT / │  │ BUCHHALTUNG /      │
    │ STORNO      │  │ KOMMISSION   │  │ DATEV              │
    └─────────────┘  └──────────────┘  └────────────────────┘
```

### 3.1 Wareneingang und Einbuchung

Der Wareneingang unterscheidet sich fundamental je nach Modell.

**Modell 0 — Franks Sammlung:**
Kein klassischer Wareneingang. Die ~41.500 Artikel existieren bereits als `Release`-Datensaetze (Legacy-Migration aus MySQL). Fuer die ERP-Erweiterung muessen diese Bestaende einmalig in `inventory_item` ueberfuehrt werden:
1. Migration: Fuer jede `Release` mit `legacy_available = true` einen `inventory_item`-Datensatz anlegen
2. Quelle: `source = 'frank_collection'`
3. Einkaufspreis: `purchase_price = 0` (Privatsammlung, kein Nachweis)
4. Status: `in_stock` (wenn `legacy_available = true`) oder `sold`/`unavailable` (wenn false)
5. Lagerort: Pauschal "VOD-Lager FN" oder, falls bekannt, Regal/Box

**Modell A — Kommissionsware:**
1. Kommissionsgeber liefert Ware an VOD-Lager (persoenlich oder per Versand)
2. Admin erstellt Kommissionsgeber-Datensatz (wenn neu): Name, Adresse, Steuer-ID, Provisionssatz
3. Admin bucht Wareneingang:
   - Pro Artikel: Release zuordnen (oder neu anlegen), Zustand dokumentieren, Einkaufspreis eintragen
   - `inventory_item` mit `source = 'commission'`, `commission_owner_id`, `purchase_price`
   - `inventory_movement` mit `type = 'inbound'`, Referenz auf Lieferschein/Uebernahmeprotokoll
4. Optionaler Sammeleingang: Konvolut mit pauschalem EK (z.B. 500 Artikel fuer 1.000 EUR → EK pro Stueck = 2 EUR). Pauschale Aufteilung muss dokumentiert werden (Steuerberater-Abstimmung noetig)
5. Quittung/Uebernahmeprotokoll ausdrucken (fuer §25a-Nachweis: "Ware von Privatperson erworben, keine USt auf Eingangsrechnung")

**Modell B — Marketplace:**
Kein physischer Wareneingang bei VOD. Seller listet Artikel auf der Plattform:
1. Seller reicht Artikel ein (Fotos, Beschreibung, Zustand, Startpreis/Festpreis)
2. Admin reviewed und genehmigt (kuratiertes Modell)
3. Artikel wird als Listing aktiv — kein `inventory_item` bei VOD, sondern `seller_listing`
4. Bestand liegt beim Seller; Plattform trackt nur Listing-Status

**Modell C — VOD Records Eigenware:**
1. VOD bestellt Ware bei Lieferant/Presswerk (z.B. 300 Stueck einer Reissue)
2. Einkaufsrechnung mit USt (Vorsteuerabzug)
3. Wareneingang buchen:
   - `inventory_item` mit `source = 'vod_records'`, `purchase_price` (aus Rechnung), `quantity = 300`
   - `inventory_movement` mit `type = 'inbound'`, Referenz auf Einkaufsrechnung
4. Lagerort zuweisen

### 3.2 Bestandsklassifikation

Jeder Bestandsposten muss folgende Dimensionen tragen:

| Dimension | Felder | Zweck |
|-----------|--------|-------|
| **Quelle** | `source`: frank_collection, commission, vod_records, marketplace | Bestimmt Eigentumsverhaeltnisse und Abrechnungslogik |
| **Steuerschema** | `tax_scheme`: margin_scheme_25a, standard, exempt | Bestimmt Rechnungsformat und DATEV-Buchung |
| **Zustand** | `condition`: mint, near_mint, very_good_plus, very_good, good_plus, good, fair, poor | Goldmine-Standard, relevant fuer Preisfindung |
| **Lagerort** | `warehouse_location`: Freitext (Regal A3, Box 17) | Picking-Optimierung |
| **Eigentum** | `commission_owner_id` (nullable) | Kommissionsgeber-Zuordnung |
| **EK** | `purchase_price` | §25a-Marge, GuV, Kommissionsabrechnung |
| **Bestandsstatus** | `status`: in_stock, reserved, in_auction, sold, shipped, returned | Logistik-Steuerung |

**Abhaengigkeitsregel Steuerschema:**
```
WENN source = 'vod_records' UND Neuware:
    → tax_scheme = 'standard' (Regelbesteuerung, Vorsteuerabzug auf EK)

WENN source = 'frank_collection':
    → tax_scheme = 'margin_scheme_25a' (Privatsammlung, kein USt auf EK)

WENN source = 'commission':
    WENN Kommissionsgeber = Privatperson ODER Kleinunternehmer (keine USt auf Uebernahme):
        → tax_scheme = 'margin_scheme_25a'
    WENN Kommissionsgeber = gewerblich mit USt-Rechnung:
        → tax_scheme = 'standard'

WENN source = 'marketplace':
    → kein tax_scheme bei VOD (Seller versteuert selbst)
    → VOD bucht nur Provision (Dienstleistung, standard)
```

Diese Logik ist NICHT ein einzelnes Feld. Sie ist eine Kombination aus `source`, Kommissionsgeber-Typ und Wareneigenschaft. Das System muss diese Ableitung automatisieren, aber der Admin muss sie uebersteuern koennen (mit Audit-Log).

### 3.3 Verkauf und Order Management

**Auktion (Modell 0 und A, spaeter auch B):**
1. Admin erstellt Auktionsblock, weist Lots zu (bestehender Workflow)
2. Gebote laufen ein, Anti-Sniping verlaengert bei Spaegebot
3. Auktion endet → Hoechstbietender gewinnt
4. System erstellt `transaction` mit `status = 'pending'`
5. Kaeufer erhaelt Zahlungsaufforderung (bestehender E-Mail-Workflow)
6. Kaeufer zahlt via Stripe/PayPal → Webhook → `status = 'paid'`
7. **NEU:** Nach Payment-Success → Rechnung erstellen (sevDesk/easybill API)
8. **NEU:** `inventory_item.status` → 'sold', `inventory_movement` → 'sale'

**Direktkauf (alle Modelle ausser B):**
1. Kaeufer legt Artikel in Warenkorb (`cart_item`)
2. Checkout: Adresse → Versandmethode → Zahlung
3. Payment-Success → `transaction` erstellt → Rechnung erstellt
4. Bestandsabnahme

**Marketplace-Verkauf (Modell B):**
1. Kaeufer kauft Seller-Artikel (Auktion oder Festpreis)
2. Payment via Stripe Connect → Split: Seller-Anteil + Plattform-Fee
3. Seller erhaelt Benachrichtigung → versendet
4. Seller traegt Tracking-Nummer ein
5. Payout an Seller nach Versandbestaetigung (oder 14-Tage Auto-Confirm)
6. VOD bucht nur die Fee als Erloes

**Combined Orders (Mehrere Artikel, ein Checkout):**
- Bestehende Logik: `order_group_id` gruppiert Transaktionen
- **Mischfall Steuerschema:** Eine Order kann §25a-Artikel UND Regelbesteuerungs-Artikel enthalten → separate Rechnungspositionen mit unterschiedlichem Schema
- **Mischfall Eigentum:** Eine Order kann Franks-Sammlung UND Kommissionsware enthalten → eine Rechnung, aber unterschiedliche Settlement-Zuordnung
- **Mischfall Modelle:** Eine Order mit VOD-Ware + Marketplace-Ware ist in Phase 1 NICHT vorgesehen (unterschiedliche Payment-Flows)

### 3.4 Rechnungsstellung

**Grundsatz:** Jede Rechnung wird in sevDesk/easybill erzeugt (nicht im eigenen System). Das eigene System haelt nur die Referenz (sevDesk-ID, Rechnungsnummer, PDF-URL).

**Regelbesteuerung (Modell C, Kommission mit gewerbl. Einlieferer):**
```
RECHNUNG
VOD Records | [Adresse] | USt-IdNr. DE...
An: [Kaeufer]
Rechnungsnr.: VOD-INV-2026-00001
Datum: 2026-04-15

Pos  Artikel                           Netto      USt 19%    Brutto
1    Throbbing Gristle - D.O.A (LP)    41,18 EUR  7,82 EUR   49,00 EUR
2    Versand DHL Paket                   4,20 EUR  0,80 EUR    5,00 EUR
---------------------------------------------------------------------------
     Summe                              45,38 EUR  8,62 EUR   54,00 EUR

Zahlungseingang: 2026-04-15 via Stripe
```

**Differenzbesteuerung §25a (Modell 0, Kommission von Privatpersonen):**
```
RECHNUNG
VOD Records | [Adresse] | USt-IdNr. DE...
An: [Kaeufer]
Rechnungsnr.: VOD-INV-2026-00002
Datum: 2026-04-15

Pos  Artikel                           Betrag
1    Cabaret Voltaire - Red Mecca (LP)  65,00 EUR
2    Versand DHL Paket                   5,00 EUR
---------------------------------------------------------------------------
     Gesamtbetrag                       70,00 EUR

Differenzbesteuerung gemaess §25a UStG.
Im Rechnungsbetrag ist die Umsatzsteuer enthalten.
Sie wird nicht gesondert ausgewiesen.

Zahlungseingang: 2026-04-15 via Stripe
```

**Pflichtangaben GoBD:**
- Fortlaufende Rechnungsnummer (Nummernkreis: VOD-INV-YYYY-NNNNN)
- Ausstellungsdatum
- Steuernummer oder USt-IdNr. des Leistenden
- Name und Anschrift Leistender + Empfaenger
- Menge und Art der Lieferung
- Zeitpunkt der Lieferung
- Entgelt und Steuerbetrag (oder Verweis auf §25a)
- Steuersatz (oder "im Betrag enthalten" bei §25a)

**Gemischte Rechnung (§25a + Regelbesteuerung in einer Order):**
Steuerlich problematisch — es gibt zwei Ansaetze:
1. **Separate Rechnungen:** Eine §25a-Rechnung + eine Regelbesteuerung-Rechnung. Sauber, aber aufwaendig
2. **Eine Rechnung mit getrennten Bloecken:** Erlaubt, aber erfordert klare Trennung der Positionen

Empfehlung: Separate Rechnungen. Die Komplexitaet einer Mischrechnung ueberwiegt den Nutzen.

**Stornierung und Gutschrift:**
- Nach Rechnungsstellung darf die Rechnung NICHT geloescht oder geaendert werden (GoBD)
- Stornierung → Stornorechnung (negative Rechnung mit Verweis auf Original)
- Teilretoure → Gutschrift ueber retournierte Positionen
- sevDesk/easybill bilden das nativ ab

### 3.5 Versand und Fulfillment

**VOD-Versand (Modell 0, A, C):**

1. Order bezahlt → erscheint in Admin unter "Orders" mit `fulfillment_status = 'unfulfilled'`
2. **NEU: Sendcloud-Integration:**
   - Admin klickt "Create Label" → API-Call an Sendcloud
   - Sendcloud waehlt guenstigsten Carrier (DHL, DPD, Hermes, GLS) basierend auf Gewicht/Zone
   - Label-PDF wird generiert → Druck
   - Tracking-Nummer wird automatisch zurueckgeschrieben → `transaction.tracking_number`
3. Sendcloud Webhook-Events → `shipping_event` Tabelle:
   - `label_created` → `fulfillment_status = 'packing'`
   - `picked_up` → `fulfillment_status = 'shipped'`
   - `in_transit` → (kein Status-Wechsel, nur Event-Log)
   - `delivered` → `fulfillment_status = 'delivered'`
   - `delivery_failed` → Admin-Alert
4. Tracking-Link in Kunden-E-Mail (Resend: shipping-confirmation Template)
5. Branded Tracking-Seite via Sendcloud (vod-auctions.com Branding)

**Batch-Versand:**
- Admin waehlt mehrere offene Orders → "Batch Create Labels"
- Sendcloud erstellt alle Labels in einem Call
- Batch-Druck (PDF mit allen Labels)
- Alle Tracking-Nummern werden zurueckgeschrieben

**Seller-Versand (Modell B):**
- Seller erhaelt Benachrichtigung nach Zahlungseingang
- Seller versendet selbst, traegt Tracking-Nummer in Plattform ein
- Plattform validiert Tracking via Carrier-API
- Payout-Release nach Versandbestaetigung + X Tage Sicherheitspuffer

**Zoll (Non-EU-Versand):**
- Sendcloud generiert CN22/CN23-Zollformulare automatisch
- Warenwert und Warenbezeichnung aus Order-Daten
- HS-Code fuer Schallplatten: 8524 (Tontraeger)

**Verpackungsrichtlinien (Vinyl-spezifisch):**
- Schallplatten: LP-Mailer (Karton, verstaerkt), Platte ausserhalb des Covers transportieren
- CDs: Luftpolsterumschlag oder Karton
- Box Sets: Karton mit Polsterung
- Dokumentation im Admin als Fulfillment-Anleitung

### 3.6 Versandkosten-Berechnung (Integration Bestand → Checkout)

Die bestehende Versandkosten-Logik (gewichtsbasiert, 3 Zonen, 13 Artikeltypen, 15 Gewichtsstufen in `shipping_rate`, `shipping_zone`, `shipping_item_type`) bleibt erhalten. Die ERP-Erweiterung aendert daran nichts, aber es gibt Integrationspunkte:

**Sendcloud Carrier-Raten vs. eigene Versandkosten:**
Zwei Ansaetze:
1. **Eigene Preistabelle (aktuell):** VOD definiert Versandpreise in `shipping_rate`. Sendcloud wird nur fuer Label-Erstellung und Tracking genutzt, nicht fuer Preisberechnung. Der Carrier mit den guenstigsten Konditionen wird von VOD gewaehlt, die Differenz zum Kundenpreis ist Versandmarge.
2. **Sendcloud Checkout (spaeter):** Sendcloud berechnet Echtzeit-Preise basierend auf Gewicht und Zielland. Kaeufer sieht mehrere Carrier-Optionen mit Preisen. Erfordert Sendcloud Growth Plan (59 EUR/Monat).

**Empfehlung Phase 1:** Eigene Preistabelle beibehalten. Sendcloud nur fuer Label + Tracking. Einfacher, kein Mehraufwand, keine Abhaengigkeit von Sendcloud-Preisen.

**Empfehlung Phase 2+:** Sendcloud Checkout evaluieren, wenn Carrier-Vielfalt vom Kunden gewuenscht wird (z.B. Express-Option, Packstation).

**Versandkostenpauschale bei Combined Orders:**
- Aktuell: Gewichtsbasierte Berechnung pro Order-Gruppe
- Mit ERP: Keine Aenderung. Versandkosten werden weiterhin im Checkout berechnet
- Sendcloud Label: Gesamtgewicht der Order-Gruppe → ein Label pro Paket
- Mehrere Pakete pro Order: Manuell im Admin splitten (z.B. bei 10+ LPs)

### 3.7 Retoure, Storno und Sonderfaelle

**Retoure (Ware zurueck, Geld zurueck):**
1. Kaeufer meldet Retoure (E-Mail oder Kontaktformular — kein Self-Service in Phase 1)
2. Admin prueft Berechtigung (14-Tage Widerrufsrecht bei gewerblichem Verkaeufer; Gebrauchtware von Privatperson: kein Widerrufsrecht, nur bei Maengeln)
3. Admin erstellt Retouren-Label (Sendcloud) oder Kaeufer versendet auf eigene Kosten
4. Ware kommt zurueck → Admin prueft Zustand
5. Admin loest Erstattung aus:
   - Stripe: `refund` via API (voll oder teilweise)
   - PayPal: `refund capture` via API
6. Gutschrift in sevDesk/easybill → korrigiert Erloes und USt
7. `inventory_item.status` → 'returned' → nach Pruefung → 'in_stock' (wenn unversehrt)
8. `inventory_movement` mit `type = 'return_inbound'`

**Teilretoure (aus Combined Order):**
- Nur retournierte Positionen erstatten
- Versandkosten: anteilig oder komplett, abhaengig von AGB
- Separate Gutschrift fuer retournierte Positionen
- Verbleibende Positionen bleiben unveraendert

**Storno nach Rechnungsstellung:**
- Rechnung kann NICHT geloescht werden (GoBD)
- Stornorechnung erstellen (sevDesk/easybill: "Storno" oder "Gutschrift")
- Fortlaufende Nummer im Gutschrift-Nummernkreis
- DATEV: Stornobuchung auf gleiche Konten (Gegenbuchung)

**Beschaedigte Ware:**
- Bei Versand: Transportschaeden → Sendcloud-Versicherung (wenn gebucht) oder Carrier-Reklamation
- Bei Retoure: Kaeufer hat Ware beschaedigt → Wertminderung abziehen (nach BGB §357)
- Bei Lager: Beschaedigung vor Verkauf → Bestandskorrektur, ggf. Abschreibung

**Nicht-Zahlung (Auktion):**
1. Auktion gewonnen, Kaeufer zahlt nicht
2. Payment Reminder 1 (nach 3 Tagen) → Payment Reminder 2 (nach 7 Tagen)
3. Nach 14 Tagen: Storno, Artikel geht zurueck in Bestand
4. Optional: Kaeufer-Account einschraenken (bestehende Block/Unblock-Funktion)
5. `inventory_item.status` → zurueck zu 'in_stock'
6. Keine Rechnung erstellt (erst nach Zahlungseingang) → kein Storno noetig

### 3.7 Kommissionsabrechnung und Settlement

**Abrechnungszyklus:**
1. Periodisch (monatlich oder nach Block-Ende — konfigurierbar pro Kommissionsgeber)
2. System sammelt alle verkauften Artikel des Kommissionsgebers im Zeitraum
3. Admin loest Abrechnung aus:

```
KOMMISSIONSABRECHNUNG
VOD Records an: [Kommissionsgeber Name]
Abrechnungszeitraum: 01.03.2026 - 31.03.2026

Pos  Artikel                    Lot#   Verkaufspreis  Provision 25%  Netto Auszahlung
1    TG - 20 Jazz Funk Greats   A-012  85,00 EUR      21,25 EUR      63,75 EUR
2    SPK - Leichenschrei        A-015  45,00 EUR      11,25 EUR      33,75 EUR
3    Coil - Scatology            A-018  120,00 EUR     30,00 EUR      90,00 EUR
...
---------------------------------------------------------------------------
     Summe (12 Artikel)                 780,00 EUR     195,00 EUR     585,00 EUR

Abzueglich Lager-/Versandkosten:                       -24,00 EUR
---------------------------------------------------------------------------
Auszahlungsbetrag:                                     561,00 EUR

Bankverbindung: [IBAN Kommissionsgeber]
Faellig bis: 15.04.2026
```

4. Admin prueft und gibt frei (Status: draft → approved)
5. Ueberweisung an Kommissionsgeber
6. Status → paid, `paid_at` setzen

**Zeilengenaue Dokumentation:**
Jede Abrechnungsposition (`settlement_line`) referenziert:
- `inventory_item_id` (welcher Artikel)
- `transaction_id` (welche Transaktion)
- `sale_price`, `commission_amount`, `payout_amount`
- `tax_scheme` (§25a oder Standard — relevant fuer die Marge-Berechnung)

**Provisionsberechnung bei §25a:**
- Marge = Verkaufspreis - Einkaufspreis
- USt auf Marge = 19/119 * Marge (im Bruttobetrag enthalten)
- Provision = X% vom Verkaufspreis (NICHT von der Marge)
- Auszahlung = Verkaufspreis - Provision - ggf. Nebenkosten

### 3.8 Buchhaltung, DATEV und Steuerlogik

**DATEV-Export:**
- Monatlicher Export als DATEV-Buchungsstapel (ASCII-Format)
- Kontenrahmen: SKR03 (Standard Einzelhandel, Steuerberater bestaetigen lassen)
- Trennung der Erloeskonten nach Steuerschema und Geschaeftsmodell

**Kontenplan (Vorschlag, SKR03-basiert):**

| Konto | Bezeichnung | Verwendung |
|-------|-------------|------------|
| 8400 | Erloese 19% USt | Modell C Neuware, Regelbesteuerung |
| 8409 | Erloese §25a Differenzbesteuerung | Modell 0 + A (§25a) |
| 8519 | Provisionserlöse 19% | Modell A Kommissions-Provision |
| 8520 | Vermittlungserlöse 19% | Modell B Marketplace-Fees |
| 8720 | Erloese EU §25a | EU-Lieferungen unter §25a |
| 8125 | Steuerfreie Erloese EU (OSS) | Wenn OSS-Schwelle ueberschritten |
| 3300 | Verbindlichkeiten aus L+L | Auszahlungen an Kommissionsgeber |
| 1776 | USt 19% | Ausgangs-USt Regelbesteuerung |
| 1775 | USt §25a | Ausgangs-USt Differenzbesteuerung |
| 1576 | Vorsteuer 19% | Einkaufsrechnungen Modell C |

**Buchungssaetze nach Modell:**

Modell 0/A §25a (Verkauf 65 EUR, EK 10 EUR, Marge 55 EUR):
```
Soll: 1200 Bank                65,00 EUR
Haben: 8409 Erloese §25a       56,22 EUR  (65,00 - USt)
Haben: 1775 USt §25a            8,78 EUR  (19/119 * 55,00 = 8,78 auf Marge)
```
Anmerkung: Die korrekte Buchung bei §25a ist komplex. Der Erloes wird brutto gebucht, die USt wird nur intern auf die Marge berechnet. Die exakte Buchungslogik MUSS mit dem Steuerberater abgestimmt werden. Das obige ist eine Annaeherung.

Modell C Regelbesteuerung (Verkauf 49 EUR brutto):
```
Soll: 1200 Bank                49,00 EUR
Haben: 8400 Erloese 19%        41,18 EUR
Haben: 1776 USt 19%             7,82 EUR
```

Modell A Kommissions-Settlement (Auszahlung 585 EUR):
```
Soll: 3300 Verbindl. Kommittent 585,00 EUR
Haben: 1200 Bank                585,00 EUR
```

Modell B Marketplace-Fee (10% von 100 EUR Verkauf = 10 EUR):
```
Soll: 1200 Bank                10,00 EUR
Haben: 8520 Vermittlungserl.    8,40 EUR
Haben: 1776 USt 19%             1,60 EUR
```

**Wichtig:** Die Buchungssaetze oben sind vereinfacht. Der Steuerberater muss den Kontenplan und die Buchungslogik validieren. Insbesondere die §25a-Buchung hat Varianten je nach Steuerberater-Praxis.

---

## 4. Steuer- und Buchungslogik

### 4.1 §25a Differenzbesteuerung — Regelwerk

**Gesetzliche Grundlage:** §25a UStG — Besteuerung der Handelsspanne bei Gebrauchtgegenstaenden.

**Voraussetzungen (alle muessen erfuellt sein):**

1. **Gegenstand:** Beweglicher koerperlicher Gegenstand (Schallplatten, CDs, Buecher = ja)
2. **Einkauf von:** Privatperson, Kleinunternehmer (§19), oder anderem §25a-Haendler. Entscheidend: KEINE USt auf der Eingangsrechnung/dem Kaufbeleg
3. **Wiederverkaeufer:** VOD muss gewerblich taetig sein (Gewinnerzielungsabsicht)
4. **Aufzeichnungspflicht:** Pro Artikel: Einkaufspreis, Verkaufspreis, Marge. Nicht pauschal, sondern artikelgenau (§25a Abs. 6 UStG)

**Abhaengigkeitsbaum:**
```
Ist der Gegenstand gebraucht (beweglich, koerperlich)?
├── Nein → Regelbesteuerung
└── Ja
    └── Wurde der Gegenstand von einer Privatperson / KU / §25a-Haendler erworben?
        ├── Nein (USt auf Eingangsrechnung) → Regelbesteuerung + Vorsteuerabzug
        └── Ja
            └── Sind artikelgenaue Aufzeichnungen vorhanden (EK, VK)?
                ├── Nein → Regelbesteuerung (Nachweis fehlt)
                └── Ja → §25a anwendbar
                    └── Ist die Marge positiv?
                        ├── Nein (VK <= EK) → Marge = 0, keine USt
                        └── Ja → USt = 19/119 * Marge
```

**Berechnung:**
```
Marge = Verkaufspreis (brutto) - Einkaufspreis
USt   = Marge * 19/119
Netto = Verkaufspreis - USt

Beispiel: VK = 50 EUR, EK = 10 EUR
Marge = 40 EUR
USt   = 40 * 19/119 = 6,39 EUR
Netto = 50 - 6,39 = 43,61 EUR
```

**Negative Marge (VK < EK):**
Wenn der Verkaufspreis unter dem Einkaufspreis liegt:
- Marge = 0 (nicht negativ)
- USt = 0
- Der Verlust ist steuerlich nicht absetzbar (kein Vorsteuerabzug bei §25a)
- Die negative Differenz darf NICHT mit positiven Margen anderer Artikel verrechnet werden (§25a Abs. 3 UStG: Einzeldifferenz, nicht Gesamtdifferenz — Ausnahme: Sammelberechnung nach §25a Abs. 4, die aber nur auf bestimmte Warengruppen anwendbar ist)

**Sammelberechnung (§25a Abs. 4):**
- Erlaubt fuer Gegenstaende, deren Einkaufspreis 500 EUR nicht uebersteigt
- Marge wird nicht pro Artikel, sondern als Gesamtdifferenz (Summe VK - Summe EK) eines Besteuerungszeitraums berechnet
- Vorteil: Negative Margen einzelner Artikel werden mit positiven Margen verrechnet
- **ACHTUNG:** Anwendbarkeit fuer Schallplatten pruefen (manche Einzelstuecke > 500 EUR)
- **Steuerberater-Entscheidung:** Einzeldifferenz (artikelgenau, aufwaendiger, kein Verrechnungsvorteil) oder Sammelberechnung (pauschal pro Zeitraum, Verrechnungsvorteil, aber 500-EUR-Grenze)

**Sammeleinkauf (Konvolut):**
Wenn eine Sammlung pauschal gekauft wird (z.B. 200 Platten fuer 500 EUR):
- Einkaufspreis muss auf die einzelnen Artikel aufgeteilt werden
- Methoden: Gleichmaessig (500/200 = 2,50/Stueck) oder gewichtet nach geschaetztem Wert
- Die Aufteilungsmethode muss dokumentiert und nachvollziehbar sein
- **Steuerberater-Abstimmung zwingend** — das Finanzamt kann die Aufteilung anzweifeln

**Rechnungsformat bei §25a:**
- KEIN separater USt-Ausweis (Pflicht! Verstoss = Kaeufer koennte Vorsteuer ziehen)
- Pflichttext: "Differenzbesteuerung nach §25a UStG" oder aehnliche Formulierung
- Nur Bruttobetrag je Position
- Zusaetzlich: Alle GoBD-Pflichtangaben (Rechnungsnummer, Datum, Anschrift etc.)

**Mischfaelle innerhalb einer Order:**
Ein Kaeufer bestellt:
- Artikel 1: Gebrauchte LP (§25a, EK = 5 EUR, VK = 40 EUR)
- Artikel 2: Neues Box Set (Regelbesteuerung, EK = 25 EUR, VK = 59 EUR)

Loesung: Zwei separate Rechnungen (oder eine Rechnung mit zwei klar getrennten Bloecken und unterschiedlichen Steuervermerken). Empfehlung: Separate Rechnungen, weil:
- Einfacher in sevDesk/easybill
- Sauberer im DATEV-Export
- Kein Risiko einer formfehlerhaften Mischrechnung

**Steuerberater-Validierungspunkte (vor Implementierung):**
1. Ist Franks Sammlung komplett unter §25a fuehrbar? (gewerbliche Einstufung?)
2. Einzeldifferenz oder Sammelberechnung?
3. Aufteilungsmethode fuer Konvolut-Einkaeufe?
4. Kontenplan und Buchungslogik fuer §25a
5. Rechnungsformulierung genehmigen lassen
6. Mischrechnung oder separate Rechnungen?
7. OSS-Schwellenwert und Interaktion mit §25a bei EU-Versand

### 4.2 Kommissionsgeschaeft — Steuerliche Behandlung

**VOD als Kommissionaer (§383 HGB):**
- VOD handelt im eigenen Namen, fuer Rechnung des Kommittenten
- Zwei umsatzsteuerliche Lieferungen (Kommissionsfiktion, §3 Abs. 3 UStG):
  1. Lieferung Kommittent → Kommissionaer (= VOD): Innenumsatz
  2. Lieferung Kommissionaer (= VOD) → Kaeufer: Aussenumsatz

- **Innenumsatz (Kommittent → VOD):**
  - Privatperson als Kommittent → keine USt → §25a auf Aussenumsatz moeglich
  - Gewerblicher Kommittent mit USt → Vorsteuerabzug → Regelbesteuerung auf Aussenumsatz

- **Aussenumsatz (VOD → Kaeufer):**
  - §25a wenn Innenumsatz ohne USt
  - Regelbesteuerung wenn Innenumsatz mit USt

**Abrechnungszeitpunkte:**
- Innenumsatz: Zeitpunkt der Lieferung an den Kaeufer (nicht bei Uebernahme der Ware)
- Aussenumsatz: Zeitpunkt der Lieferung an den Kaeufer
- Kommissionsabrechnung: Periodisch (monatlich empfohlen), spaetestens bei Auszahlung

**Provision:**
- VODs Provision ist eine Dienstleistung an den Kommittenten
- Unterliegt der normalen USt (19%)
- Bei Privatperson als Kommittent: VOD stellt Gutschrift (Abrechnung) aus, Kommittent schuldet keine USt
- Bei gewerblichem Kommittent: Provision wird netto abgezogen, Kommittent erhaelt Gutschrift mit USt-Ausweis

### 4.3 Marketplace — Steuerliche Behandlung

**VOD als Vermittler:**
- VOD ist NICHT Verkaeufer → kein §25a, keine Warenerlöse
- VOD versteuert nur seine eigenen Einnahmen:
  - Provisionseinnahmen (Dienstleistung, 19% USt)
  - Membership-Fees (Dienstleistung, 19% USt)
- Seller ist fuer seine eigene USt verantwortlich

**DAC7-Meldepflicht:**
- Jaehrlich an BZSt (bis 31. Januar)
- Pro Seller: TIN, IBAN, Gesamtumsatz, einbehaltene Gebuehren
- Ausnahme: < 30 Verkaeufe UND < 2.000 EUR im Meldezeitraum
- System muss DAC7-Report automatisch generieren koennen

**Deemed Supplier (fiktiver Lieferer):**
- Greift NICHT fuer EU-Seller (nur fuer Nicht-EU-Seller bei Import ≤ 150 EUR oder Intra-EU B2C von Nicht-EU-Sellern)
- Da alle Seller voraussichtlich EU-basiert: irrelevant
- Sollte sich die Seller-Basis auf Nicht-EU ausweiten: erneut pruefen

### 4.4 EU-Umsatzsteuer und One-Stop-Shop (OSS)

**Schwellenwert:** 10.000 EUR/Jahr an B2C-Lieferungen in andere EU-Laender (kumuliert ueber alle EU-Laender). Bei Ueberschreitung: USt des Bestimmungslandes faellig.

**Aktueller Stand:** VOD Auctions hat noch kein signifikantes EU-Volumen. Aber mit Industrial Music als Nische sind EU-Kaeufer (Niederlande, Belgien, Frankreich, Skandinavien) wahrscheinlich.

**OSS-Verfahren:**
- Registrierung beim BZSt (Bundeszentralamt fuer Steuern)
- Quartalsweise Meldung der EU-B2C-Umsaetze nach Bestimmungsland
- Steuersatz des Bestimmungslandes anwenden (z.B. 21% NL, 21% BE, 20% FR, 25% SE)
- Keine separate Registrierung in jedem EU-Land noetig

**Interaktion §25a und OSS:**
- §25a gilt auch bei EU-Lieferungen — die Marge wird mit dem Steuersatz des Bestimmungslandes besteuert
- Beispiel: §25a-Artikel nach Niederlande, Marge 40 EUR → USt = 21/121 * 40 = 6,94 EUR (statt 19/119 * 40 = 6,39 EUR bei DE)
- sevDesk/easybill koennen OSS-Steuersaetze verwalten. Das richtige Land muss pro Rechnung gesetzt werden (basierend auf Lieferadresse)

**Umsetzung im System:**
- Checkout erfasst bereits Lieferland (`shipping_country`)
- Rechnungserstellung: Steuersatz basierend auf Lieferland + Steuerschema
- Lookup-Tabelle: EU-Laender → USt-Saetze (Standard + ermaessigt)
- DATEV-Export: Separate Konten fuer OSS-Erloese (nach Land oder aggregiert, Steuerberater entscheidet)
- Feature Flag: Nicht separat noetig. OSS ist Teil der Rechnungslogik und wird beim Rechnungs-Setup konfiguriert

**Steuerberater-Validierung noetig:** OSS-Registrierung, Kontenplan fuer OSS-Erloese, Quartalsweise Meldung.

### 4.5 DSGVO-Implikationen der ERP-Daten

Die neuen ERP-Tabellen enthalten personenbezogene Daten:

| Tabelle | Personenbezogene Daten | Betroffene | Rechtsgrundlage |
|---------|----------------------|-----------|-----------------|
| `commission_owner` | Name, Email, Adresse, IBAN, Steuer-ID | Kommissionsgeber | Vertrag (Art. 6 Abs. 1 lit. b DSGVO) |
| `seller` | Name, Email, Adresse, IBAN, Steuer-ID | Marketplace-Seller | Vertrag + berechtigtes Interesse |
| `invoice` | Kundenname, Email | Kaeufer | Vertrag + gesetzliche Aufbewahrung |
| `tax_margin_record` | Keine direkt (ueber transaction_id zuordbar) | Kaeufer (indirekt) | Gesetzliche Pflicht (§25a UStG) |

**Aufbewahrungsfristen:**
- Rechnungen: 10 Jahre (§147 AO)
- §25a-Aufzeichnungen: 10 Jahre (§25a Abs. 6 UStG)
- Kommissionsabrechnungen: 10 Jahre (Handelsbriefe, §257 HGB)
- DAC7-Aufzeichnungen: 10 Jahre (§22f UStG)

**Loeschpflicht vs. Aufbewahrungspflicht:**
- DSGVO Art. 17 (Recht auf Loeschung) wird durch gesetzliche Aufbewahrungspflichten eingeschraenkt
- Praxis: Personenbezogene Daten in `commission_owner` und `seller` werden nach Vertragsende NICHT geloescht, sondern nach Ablauf der Aufbewahrungsfrist (10 Jahre) automatisch anonymisiert
- Die bestehende GDPR-Export-Funktion (`/store/account/gdpr-export`) muss um ERP-Daten erweitert werden

### 4.6 DATEV-Export

**Format:** DATEV Buchungsstapel (ASCII-Datei, Semikolon-getrennt)

**Header:**
```
"EXTF";700;21;"Buchungsstapel";13;...
```

**Felder pro Buchung (Auszug):**
| Feld | Beschreibung | Beispiel |
|------|--------------|---------|
| Umsatz | Betrag | 65,00 |
| Soll/Haben | S oder H | S |
| Konto | Sollkonto | 1200 |
| Gegenkonto | Habenkonto | 8409 |
| BU-Schluessel | Steuerschluessel | 12 (§25a) |
| Belegdatum | DDMM | 1504 |
| Belegfeld 1 | Rechnungsnummer | VOD-INV-2026-00002 |
| Buchungstext | Beschreibung | Verkauf LP Cabaret Voltaire |

**BU-Schluessel (Steuerschluessel):**
- Leer oder 0 = Automatik
- 1 = USt frei
- 3 = 19% USt
- 12 = §25a Differenzbesteuerung
- Weitere je nach Kontenrahmen-Konfiguration beim Steuerberater

**Export-Frequenz:** Monatlich, manuell ausgeloest (Admin-Button "DATEV-Export Monat X")

**Trennung der Buchungen:**
Der Export muss pro Buchung klar erkennbar machen:
- Geschaeftsmodell (Eigenverkauf / Kommission / Marketplace-Fee / Eigenware)
- Steuerschema (§25a / Regelbesteuerung / steuerfrei)
- Erloes vs. Gutschrift vs. Storno

---

## 5. Datenmodell

### Designprinzipien

1. **Trennung:** Produktstamm (`Release`) bleibt unveraendert. Neue ERP-Daten in eigenen Tabellen. Keine Aenderung an Legacy-Spalten.
2. **Audit:** Jede Bestandsbewegung wird als Event gespeichert (`inventory_movement`). Keine direkte Statusaenderung ohne Movement-Eintrag.
3. **Flexibilitaet:** `tax_scheme` und `source` sind Ableitungen, koennen aber uebersteuert werden. Admin-Override mit Audit-Log.
4. **Marketplace-Ready:** `seller_id` als Fremdschluessel auf allen relevanten Tabellen von Anfang an — nullable, aber strukturell vorhanden.
5. **Settlement-Genauigkeit:** Jede Abrechnungsposition ist einzeln nachvollziehbar. Keine Aggregat-only-Tabellen.

### Tabellen

```sql
-- =============================================================================
-- BESTANDSFUEHRUNG
-- =============================================================================

-- Bestandseinheit: Jeder physische Artikel im VOD-Besitz/-Lager
-- Fuer Modell 0, A, C — NICHT fuer Modell B (Seller verwaltet selbst)
CREATE TABLE inventory_item (
    id TEXT PRIMARY KEY,                           -- ULID via generateEntityId()
    release_id TEXT NOT NULL,                      -- FK zu Release(id)
    
    -- Quelle und Eigentum
    source TEXT NOT NULL                            -- 'frank_collection' | 'commission' | 'vod_records'
        CHECK (source IN ('frank_collection', 'commission', 'vod_records')),
    commission_owner_id TEXT                        -- FK zu commission_owner(id), nur bei source='commission'
        REFERENCES commission_owner(id),
    seller_id TEXT,                                 -- FK zu seller(id), NULL fuer Modell 0/A/C
                                                   -- Strukturell vorhanden fuer spaetere Marketplace-Erweiterung
    
    -- Einkauf
    purchase_price NUMERIC(10,2),                  -- Einkaufspreis in EUR (fuer §25a-Marge)
                                                   -- NULL = unbekannt (z.B. Franks alte Sammlung)
                                                   -- 0 = bewusst kostenlos erhalten
    purchase_date DATE,                            -- Datum des Einkaufs/der Uebernahme
    purchase_reference TEXT,                        -- Verweis auf Beleg (Quittung, Uebernahmeprotokoll)
    
    -- Steuerschema (abgeleitet, aber ueberschreibbar)
    tax_scheme TEXT NOT NULL DEFAULT 'margin_scheme_25a'
        CHECK (tax_scheme IN ('margin_scheme_25a', 'standard', 'exempt')),
    tax_scheme_override BOOLEAN DEFAULT false,     -- true wenn Admin manuell geaendert hat
    tax_scheme_override_reason TEXT,               -- Pflicht wenn override = true
    
    -- Lager
    warehouse_location TEXT,                       -- Freitext: "Regal A3", "Box 17", "Palette 2"
    condition TEXT                                  -- Goldmine-Standard: mint, near_mint, very_good_plus, etc.
        CHECK (condition IN ('mint', 'near_mint', 'very_good_plus', 'very_good', 
                             'good_plus', 'good', 'fair', 'poor', 'unknown')),
    
    -- Bestand
    quantity INTEGER NOT NULL DEFAULT 1,           -- 1 fuer Modell 0/A, >1 fuer Modell C
    quantity_reserved INTEGER NOT NULL DEFAULT 0,  -- In Auktion oder Warenkorb reserviert
    quantity_available INTEGER GENERATED ALWAYS AS (quantity - quantity_reserved) STORED,
    
    -- Status (des gesamten Postens, nicht einzelner Einheiten)
    status TEXT NOT NULL DEFAULT 'in_stock'
        CHECK (status IN ('in_stock', 'reserved', 'in_auction', 'sold', 'shipped', 'returned', 'damaged', 'written_off')),
    
    -- Provision (nur bei Commission)
    commission_rate NUMERIC(5,2),                  -- Provision % fuer VOD (z.B. 25.00 = 25%)
                                                   -- NULL bei source != 'commission'
    
    -- Metadaten
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT commission_requires_owner 
        CHECK (source != 'commission' OR commission_owner_id IS NOT NULL),
    CONSTRAINT commission_requires_rate 
        CHECK (source != 'commission' OR commission_rate IS NOT NULL)
);

CREATE INDEX idx_inventory_item_release ON inventory_item(release_id);
CREATE INDEX idx_inventory_item_source ON inventory_item(source);
CREATE INDEX idx_inventory_item_status ON inventory_item(status);
CREATE INDEX idx_inventory_item_owner ON inventory_item(commission_owner_id) WHERE commission_owner_id IS NOT NULL;


-- Bestandsbewegungen: Jede Aenderung am Bestand wird als Event gespeichert
CREATE TABLE inventory_movement (
    id TEXT PRIMARY KEY,
    inventory_item_id TEXT NOT NULL REFERENCES inventory_item(id),
    
    -- Bewegungsart
    type TEXT NOT NULL
        CHECK (type IN (
            'inbound',              -- Wareneingang (Einlagerung)
            'reservation',          -- Reservierung (Auktion/Warenkorb)
            'reservation_release',  -- Reservierung aufgehoben (Auktion verloren, Warenkorb timeout)
            'sale',                 -- Verkauf (Payment confirmed)
            'shipment',             -- Versand (Label erstellt)
            'delivery',             -- Zustellung (Carrier-Bestaetigung)
            'return_inbound',       -- Retoure eingegangen
            'return_processed',     -- Retoure verarbeitet (zurueck in Bestand oder abgeschrieben)
            'adjustment',           -- Manuelle Korrektur (Inventur, Beschaedigung)
            'write_off'             -- Abschreibung (beschaedigt, verloren)
        )),
    
    -- Menge (positiv = Zugang, negativ = Abgang)
    quantity_change INTEGER NOT NULL,
    
    -- Referenzen (je nach Typ)
    transaction_id TEXT,                           -- FK zu transaction(id), bei sale/shipment/return
    block_item_id TEXT,                            -- FK zu block_item(id), bei reservation (Auktion)
    settlement_id TEXT,                            -- FK zu commission_settlement(id), bei Settlement-Referenz
    
    -- Kontext
    reference TEXT,                                -- Freitext: Lieferschein-Nr, Quittungs-Nr, Inventur-Nr
    reason TEXT,                                   -- Begruendung (Pflicht bei adjustment/write_off)
    performed_by TEXT,                             -- Admin-Email oder 'system'
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_movement_item ON inventory_movement(inventory_item_id);
CREATE INDEX idx_inventory_movement_type ON inventory_movement(type);
CREATE INDEX idx_inventory_movement_transaction ON inventory_movement(transaction_id) WHERE transaction_id IS NOT NULL;


-- =============================================================================
-- KOMMISSION
-- =============================================================================

-- Kommissionsgeber (Personen die Ware zur Vermarktung ueberlassen)
CREATE TABLE commission_owner (
    id TEXT PRIMARY KEY,
    
    -- Stammdaten
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address_line1 TEXT,
    address_city TEXT,
    address_postal_code TEXT,
    address_country TEXT DEFAULT 'DE',
    
    -- Steuerliche Identifikation
    tax_id TEXT,                                   -- Steuernummer
    vat_id TEXT,                                   -- USt-IdNr. (nur bei gewerblichen)
    is_business BOOLEAN NOT NULL DEFAULT false,    -- Gewerblich = true, Privat = false
    is_small_business BOOLEAN DEFAULT false,       -- Kleinunternehmer §19
    
    -- Konditionen
    default_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 25.00,  -- Standard-Provision %
    contract_start_date DATE,
    contract_end_date DATE,
    contract_notes TEXT,                            -- Sondervereinbarungen
    
    -- Bankverbindung
    iban TEXT,
    bic TEXT,
    bank_name TEXT,
    account_holder TEXT,
    
    -- Aggregierte Werte (periodisch neu berechnet, wie customer_stats)
    total_items INTEGER NOT NULL DEFAULT 0,
    total_sold INTEGER NOT NULL DEFAULT 0,
    total_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_paid_out NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_outstanding NUMERIC(10,2) NOT NULL DEFAULT 0,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Kommissionsabrechnung (Kopf)
CREATE TABLE commission_settlement (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES commission_owner(id),
    
    -- Zeitraum
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    
    -- Aggregierte Werte (berechnet aus settlement_lines)
    items_sold INTEGER NOT NULL,
    gross_revenue NUMERIC(10,2) NOT NULL,          -- Summe Verkaufspreise
    commission_amount NUMERIC(10,2) NOT NULL,      -- VODs Anteil (Provision)
    additional_costs NUMERIC(10,2) DEFAULT 0,      -- Lager-/Versandkostenpauschale
    payout_amount NUMERIC(10,2) NOT NULL,          -- Netto-Auszahlung an Kommittent
    
    -- Status
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
    
    -- Freigabe und Zahlung
    approved_by TEXT,                              -- Admin-Email
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payment_reference TEXT,                        -- Ueberweisungsreferenz
    
    -- sevDesk/easybill Referenz
    external_document_id TEXT,                     -- Gutschrift-ID in Buchhaltungssoftware
    external_document_number TEXT,                 -- Gutschrift-Nummer
    
    -- Storno
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settlement_owner ON commission_settlement(owner_id);
CREATE INDEX idx_settlement_status ON commission_settlement(status);


-- Kommissionsabrechnung (Zeilen — eine pro verkauftem Artikel)
CREATE TABLE settlement_line (
    id TEXT PRIMARY KEY,
    settlement_id TEXT NOT NULL REFERENCES commission_settlement(id) ON DELETE CASCADE,
    
    -- Referenzen
    inventory_item_id TEXT NOT NULL REFERENCES inventory_item(id),
    transaction_id TEXT NOT NULL,                   -- FK zu transaction(id)
    release_id TEXT NOT NULL,                       -- FK zu Release(id) (Denormalisierung fuer Reports)
    
    -- Betraege
    sale_price NUMERIC(10,2) NOT NULL,             -- Verkaufspreis (brutto)
    purchase_price NUMERIC(10,2) NOT NULL,         -- Einkaufspreis (fuer Marge-Berechnung)
    commission_rate NUMERIC(5,2) NOT NULL,         -- Angewendeter Provisionssatz
    commission_amount NUMERIC(10,2) NOT NULL,      -- VOD-Provision (sale_price * commission_rate / 100)
    payout_amount NUMERIC(10,2) NOT NULL,          -- Auszahlung (sale_price - commission_amount)
    
    -- Steuer
    tax_scheme TEXT NOT NULL,                       -- 'margin_scheme_25a' oder 'standard'
    margin NUMERIC(10,2),                          -- sale_price - purchase_price (nur bei §25a relevant)
    vat_on_margin NUMERIC(10,2),                   -- 19/119 * margin (nur bei §25a)
    
    -- Metadaten
    sale_date DATE NOT NULL,                       -- Verkaufsdatum
    article_description TEXT,                      -- Artikelbezeichnung (Denormalisierung fuer PDF)
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settlement_line_settlement ON settlement_line(settlement_id);
CREATE INDEX idx_settlement_line_inventory ON settlement_line(inventory_item_id);


-- =============================================================================
-- STEUER-TRACKING
-- =============================================================================

-- §25a Margen-Aufzeichnung (gesetzliche Pflicht: artikelgenaue Dokumentation)
-- Wird bei jedem Verkauf eines §25a-Artikels automatisch angelegt
CREATE TABLE tax_margin_record (
    id TEXT PRIMARY KEY,
    
    -- Referenzen
    transaction_id TEXT NOT NULL,                   -- FK zu transaction(id)
    inventory_item_id TEXT NOT NULL REFERENCES inventory_item(id),
    release_id TEXT NOT NULL,                       -- FK zu Release(id)
    
    -- Betraege
    purchase_price NUMERIC(10,2) NOT NULL,         -- Einkaufspreis
    sale_price NUMERIC(10,2) NOT NULL,             -- Verkaufspreis (brutto)
    margin NUMERIC(10,2) NOT NULL,                 -- MAX(sale_price - purchase_price, 0)
    vat_on_margin NUMERIC(10,2) NOT NULL,          -- 19/119 * margin
    net_revenue NUMERIC(10,2) NOT NULL,            -- sale_price - vat_on_margin
    
    -- Schema
    tax_scheme TEXT NOT NULL DEFAULT 'margin_scheme_25a'
        CHECK (tax_scheme IN ('margin_scheme_25a', 'standard')),
    
    -- Zuordnung
    source TEXT NOT NULL,                           -- 'frank_collection' | 'commission'
    commission_owner_id TEXT,                       -- Wenn Commission
    
    -- Audit
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validated_by TEXT,                              -- Admin-Email (wenn manuell geprueft)
    validated_at TIMESTAMPTZ
);

CREATE INDEX idx_tax_margin_transaction ON tax_margin_record(transaction_id);
CREATE INDEX idx_tax_margin_source ON tax_margin_record(source);
CREATE INDEX idx_tax_margin_date ON tax_margin_record(calculated_at);


-- =============================================================================
-- RECHNUNGEN
-- =============================================================================

-- Rechnungskopf (Referenz auf sevDesk/easybill — die Rechnung wird DORT erstellt)
CREATE TABLE invoice (
    id TEXT PRIMARY KEY,
    
    -- Referenzen
    transaction_id TEXT,                           -- FK zu transaction(id) — kann mehrere Transaktionen abdecken
    order_group_id TEXT,                            -- Alternativ: Gruppen-Referenz
    
    -- sevDesk/easybill Referenz
    external_provider TEXT NOT NULL                 -- 'sevdesk' | 'easybill'
        CHECK (external_provider IN ('sevdesk', 'easybill')),
    external_id TEXT NOT NULL,                     -- ID im externen System
    external_number TEXT NOT NULL,                 -- Rechnungsnummer (VOD-INV-YYYY-NNNNN)
    external_pdf_url TEXT,                         -- PDF-Download-URL
    
    -- Typ
    invoice_type TEXT NOT NULL DEFAULT 'invoice'
        CHECK (invoice_type IN ('invoice', 'credit_note', 'cancellation')),
    related_invoice_id TEXT,                       -- Bei Gutschrift/Storno: Referenz auf Original
    
    -- Betraege (Kopie aus externem System, fuer Reports)
    total_gross NUMERIC(10,2) NOT NULL,
    total_net NUMERIC(10,2),
    total_vat NUMERIC(10,2),
    tax_scheme TEXT NOT NULL,                       -- Vorherrschendes Steuerschema dieser Rechnung
    currency TEXT NOT NULL DEFAULT 'EUR',
    
    -- Empfaenger
    customer_name TEXT,
    customer_email TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'sent', 'paid', 'overdue', 'cancelled')),
    
    -- DATEV
    datev_exported BOOLEAN DEFAULT false,
    datev_exported_at TIMESTAMPTZ,
    datev_export_batch TEXT,                        -- Batch-ID des DATEV-Exports
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_transaction ON invoice(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_invoice_order_group ON invoice(order_group_id) WHERE order_group_id IS NOT NULL;
CREATE INDEX idx_invoice_external ON invoice(external_provider, external_id);
CREATE INDEX idx_invoice_status ON invoice(status);


-- Rechnungspositionen (Denormalisierung fuer lokale Reports, Steuer-Auswertung)
CREATE TABLE invoice_line (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
    
    -- Artikel
    release_id TEXT,                               -- FK zu Release(id)
    inventory_item_id TEXT,                        -- FK zu inventory_item(id)
    description TEXT NOT NULL,                     -- Positionstext
    
    -- Betraege
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price_gross NUMERIC(10,2) NOT NULL,       -- Brutto-Einzelpreis
    unit_price_net NUMERIC(10,2),                  -- Netto-Einzelpreis (NULL bei §25a)
    vat_rate NUMERIC(5,2),                         -- 19.00, 7.00, 0.00 — NULL bei §25a
    vat_amount NUMERIC(10,2),                      -- USt-Betrag — NULL bei §25a
    total_gross NUMERIC(10,2) NOT NULL,            -- Brutto-Gesamtpreis
    
    -- Steuer
    tax_scheme TEXT NOT NULL,                       -- 'margin_scheme_25a' | 'standard' | 'exempt'
    
    -- Sortierung
    position INTEGER NOT NULL DEFAULT 0,           -- Reihenfolge auf Rechnung
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_line_invoice ON invoice_line(invoice_id);


-- =============================================================================
-- VERSAND (Sendcloud-Events)
-- =============================================================================

-- Versand-Events von Sendcloud Webhooks
CREATE TABLE shipping_event (
    id TEXT PRIMARY KEY,
    
    -- Referenzen
    transaction_id TEXT NOT NULL,                   -- FK zu transaction(id)
    order_group_id TEXT,                            -- FK zu order_group_id
    
    -- Sendcloud-Daten
    sendcloud_parcel_id TEXT,                      -- Sendcloud Parcel-ID
    sendcloud_shipment_id TEXT,                    -- Sendcloud Shipment-ID
    carrier TEXT,                                   -- 'dhl', 'dpd', 'hermes', 'gls', etc.
    tracking_number TEXT,
    tracking_url TEXT,
    label_url TEXT,                                 -- PDF-Download-URL
    
    -- Event
    event_type TEXT NOT NULL
        CHECK (event_type IN (
            'label_created',
            'picked_up',
            'in_transit',
            'out_for_delivery',
            'delivered',
            'delivery_failed',
            'returned_to_sender',
            'cancelled'
        )),
    event_timestamp TIMESTAMPTZ NOT NULL,          -- Zeitpunkt des Events beim Carrier
    event_message TEXT,                            -- Carrier-spezifische Nachricht
    
    -- Sendcloud Raw Payload (fuer Debugging)
    raw_payload JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shipping_event_transaction ON shipping_event(transaction_id);
CREATE INDEX idx_shipping_event_tracking ON shipping_event(tracking_number) WHERE tracking_number IS NOT NULL;
CREATE INDEX idx_shipping_event_type ON shipping_event(event_type);


-- =============================================================================
-- MARKETPLACE (strukturell vorhanden, operativ spaeter aktiviert)
-- =============================================================================

-- Seller (fuer Modell B — Tabelle existiert ab Tag 1, aber ohne Registrierungs-Flow)
CREATE TABLE seller (
    id TEXT PRIMARY KEY,
    customer_id TEXT,                              -- FK zu Medusa customer(id), wenn Seller auch Kaeufer ist
    
    -- Stammdaten
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    
    -- Adresse
    address_line1 TEXT,
    address_city TEXT,
    address_postal_code TEXT,
    address_country TEXT DEFAULT 'DE',
    
    -- Steuerlich
    seller_type TEXT NOT NULL DEFAULT 'private'
        CHECK (seller_type IN ('private', 'small_business', 'business')),
    tax_id TEXT,                                   -- Steuer-ID (fuer DAC7)
    vat_id TEXT,                                   -- USt-IdNr. (nur business)
    f22_certificate_uploaded BOOLEAN DEFAULT false, -- §25e Safe Harbor
    f22_certificate_valid_until DATE,
    
    -- Payment
    stripe_connect_account_id TEXT,                -- Stripe Connect Account-ID
    stripe_connect_onboarded BOOLEAN DEFAULT false,
    payout_iban TEXT,
    
    -- Konditionen
    fee_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,  -- Plattform-Fee %
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'active', 'suspended', 'closed')),
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    
    -- DAC7
    dac7_exempt BOOLEAN DEFAULT false,             -- true wenn < 30 Verkaeufe + < 2.000 EUR
    dac7_last_reported_year INTEGER,
    
    -- Aggregierte Werte
    total_listings INTEGER DEFAULT 0,
    total_sold INTEGER DEFAULT 0,
    total_revenue NUMERIC(10,2) DEFAULT 0,
    total_fees_paid NUMERIC(10,2) DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seller_status ON seller(status);
CREATE INDEX idx_seller_stripe ON seller(stripe_connect_account_id) WHERE stripe_connect_account_id IS NOT NULL;


-- Seller-Listings (Modell B — Artikel die ein Seller ueber die Plattform anbietet)
CREATE TABLE seller_listing (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL REFERENCES seller(id),
    release_id TEXT,                               -- FK zu Release(id), wenn bestehendes Release
    
    -- Falls kein bestehendes Release: Artikeldaten direkt
    title TEXT NOT NULL,
    description TEXT,
    condition TEXT,
    images JSONB,                                  -- Array von Bild-URLs
    
    -- Preis
    listing_type TEXT NOT NULL DEFAULT 'fixed_price'
        CHECK (listing_type IN ('fixed_price', 'auction')),
    price NUMERIC(10,2),                           -- Festpreis oder Startpreis
    
    -- Versand (Seller definiert)
    shipping_cost_de NUMERIC(10,2),
    shipping_cost_eu NUMERIC(10,2),
    shipping_cost_world NUMERIC(10,2),
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review', 'approved', 'active', 'sold', 'removed', 'rejected')),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seller_listing_seller ON seller_listing(seller_id);
CREATE INDEX idx_seller_listing_status ON seller_listing(status);
```

### API-Endpunkte fuer ERP-Bereich

Alle neuen Endpunkte liegen unter `/admin/erp/` und sind durch das bestehende Admin-Auth geschuetzt. Jeder Endpunkt prueft den zugehoerigen Feature Flag.

```
# ─── BESTAND ────────────────────────────────────────────────────────────────
GET    /admin/erp/inventory
       # Liste aller Bestandseinheiten
       # Query: ?source=commission&status=in_stock&q=cabaret&sort=created_at:desc&limit=50&offset=0
       # Response: { items: [...], total: 1234 }

GET    /admin/erp/inventory/:id
       # Detail einer Bestandseinheit inkl. Bewegungshistorie

POST   /admin/erp/inventory/inbound
       # Wareneingang buchen
       # Body: { release_id, source, purchase_price, commission_owner_id?, warehouse_location, condition, quantity, reference }

POST   /admin/erp/inventory/:id/adjust
       # Manuelle Bestandskorrektur
       # Body: { quantity_change, reason }

GET    /admin/erp/inventory/movements
       # Alle Bestandsbewegungen (chronologisch)
       # Query: ?type=sale&from=2026-04-01&to=2026-04-30&limit=100

POST   /admin/erp/inventory/migrate
       # Einmalige Migration Release → inventory_item (idempotent)
       # Body: { dry_run: true } — Vorschau ohne Ausfuehrung

# ─── RECHNUNGEN ─────────────────────────────────────────────────────────────
GET    /admin/erp/invoices
       # Rechnungsliste mit sevDesk/easybill-Status
       # Query: ?status=created&tax_scheme=margin_scheme_25a&from=2026-04-01&limit=50

GET    /admin/erp/invoices/:id
       # Rechnungsdetail inkl. Positionen

GET    /admin/erp/invoices/:id/pdf
       # PDF-Download (Redirect auf sevDesk/easybill PDF-URL)

POST   /admin/erp/invoices/create
       # Rechnung manuell erstellen (Ausnahmefall, normalerweise automatisch nach Payment)
       # Body: { transaction_id, tax_scheme }

POST   /admin/erp/invoices/:id/cancel
       # Stornierung → Gutschrift in sevDesk/easybill

# ─── DATEV ──────────────────────────────────────────────────────────────────
POST   /admin/erp/datev/export
       # DATEV-Monatsexport generieren
       # Body: { year: 2026, month: 4 }
       # Response: { download_url: "/admin/erp/datev/download/2026-04.csv", entries: 142 }

GET    /admin/erp/datev/download/:filename
       # CSV-Download des DATEV-Exports

# ─── VERSAND ────────────────────────────────────────────────────────────────
GET    /admin/erp/shipping
       # Offene Sendungen, Tracking-Uebersicht
       # Query: ?status=label_created&carrier=dhl&limit=50

POST   /admin/erp/shipping/label
       # Einzelnes Label erstellen
       # Body: { transaction_id } oder { order_group_id }

POST   /admin/erp/shipping/batch
       # Batch-Labels fuer alle offenen Orders
       # Body: { transaction_ids: [...] } oder { all_unfulfilled: true }
       # Response: { labels_created: 15, pdf_url: "/admin/erp/shipping/batch/2026-04-15.pdf" }

POST   /admin/erp/shipping/return-label
       # Retouren-Label erstellen
       # Body: { transaction_id }

# ─── WEBHOOKS (nicht unter /admin, sondern /webhooks) ──────────────────────
POST   /webhooks/sendcloud
       # Sendcloud Tracking-Events → shipping_event + fulfillment_status Update

# ─── KOMMISSION ─────────────────────────────────────────────────────────────
GET    /admin/erp/commission/owners
       # Kommissionsgeber-Liste
       # Query: ?is_active=true&sort=name

GET    /admin/erp/commission/owners/:id
       # Detail + Abrechnungshistorie + offene Artikel

POST   /admin/erp/commission/owners
       # Neuen Kommissionsgeber anlegen
       # Body: { name, email, phone, address, tax_id, is_business, default_commission_rate, iban }

PATCH  /admin/erp/commission/owners/:id
       # Stammdaten aktualisieren

POST   /admin/erp/commission/settle
       # Abrechnung erstellen
       # Body: { owner_id, period_from, period_to }
       # Response: { settlement_id, items_sold, gross_revenue, commission_amount, payout_amount }

GET    /admin/erp/commission/settlements/:id
       # Settlement-Detail mit allen Zeilen

GET    /admin/erp/commission/settlements/:id/pdf
       # Settlement-PDF (pdfkit)

POST   /admin/erp/commission/settlements/:id/approve
       # Freigabe der Abrechnung

POST   /admin/erp/commission/settlements/:id/mark-paid
       # Als bezahlt markieren
       # Body: { payment_reference }

# ─── STEUER ─────────────────────────────────────────────────────────────────
GET    /admin/erp/tax/overview
       # §25a-Uebersicht: Marge, USt, Erloes nach Schema und Zeitraum
       # Query: ?from=2026-04-01&to=2026-04-30

GET    /admin/erp/tax/report
       # Steuerreport fuer Zeitraum (Regel vs. §25a vs. Kommission vs. Fee)
       # Query: ?year=2026&month=4

GET    /admin/erp/tax/margin-records
       # §25a Margen-Aufzeichnungen (gesetzliche Pflicht)
       # Query: ?source=commission&from=2026-04-01&limit=100

# ─── ERP DASHBOARD ──────────────────────────────────────────────────────────
GET    /admin/erp/dashboard
       # KPIs: Tagesumsatz, Monatsumsatz, offene Zahlungen, Lagerbestand, Lagerbestandswert
       # Kommissions-Status: offene Abrechnungen, ausstehende Auszahlungen
       # Steuer-Split: §25a vs. Regelbesteuerung (Monat)
```

### Admin-UI: ERP Hub

Der ERP-Bereich wird als neuer Hub-Eintrag in der Admin-Navigation eingefuegt:

```
Dashboard | Auction Blocks | Orders | Catalog | Marketing | Operations | ERP | AI Assistant
```

**ERP Hub-Seite (`/app/erp/page.tsx`) mit 6 Karten:**

| Karte | Sub-Page | Beschreibung |
|-------|----------|-------------|
| Lager / Bestand | `/app/erp/inventory` | Bestandsuebersicht, Wareneingang, Bewegungshistorie, Inventur |
| Rechnungen | `/app/erp/invoices` | Rechnungsliste, sevDesk-Status, PDF-Download, Gutschriften |
| Versand | `/app/erp/shipping` | Offene Sendungen, Label-Erstellung, Batch-Druck, Tracking |
| Kommission | `/app/erp/commission` | Kommissionsgeber, Abrechnungen, Auszahlungen |
| Finanzen / DATEV | `/app/erp/finance` | Tagesumsatz, Monatsreport, DATEV-Export |
| Steuern / §25a | `/app/erp/tax` | §25a-Uebersicht, Marge-Tracking, Steuerreport |

Jede Sub-Page folgt dem bestehenden Admin Design System (`admin-tokens.ts`, `admin-layout.tsx`). Kein `defineRouteConfig` auf Sub-Pages (nur auf Hub-Page).

### Entity-Relationship-Ueberblick

```
Release (Legacy, ~41.500)
    ↓ 1:N
inventory_item (Bestandseinheit)
    ↓ 1:N
inventory_movement (Bewegungen: Eingang, Reservierung, Verkauf, Versand, Retoure)
    ↓ N:1
transaction (Verkauf, bestehend)
    ↓ 1:N
invoice (sevDesk/easybill Referenz)
    ↓ 1:N
invoice_line (Positionen)

inventory_item → commission_owner (bei Kommission)
                → seller (bei Marketplace, spaeter)

commission_owner
    ↓ 1:N
commission_settlement (Abrechnung)
    ↓ 1:N
settlement_line (einzelne verkaufte Artikel)

transaction → tax_margin_record (§25a Nachweis)
            → shipping_event (Sendcloud Events)
```

### Migrationsstrategie fuer Bestandsdaten

Die bestehenden ~41.500 Release-Datensaetze muessen in das neue Bestandsmodell ueberfuehrt werden:

```sql
-- Einmalige Migration: Release → inventory_item
INSERT INTO inventory_item (id, release_id, source, purchase_price, tax_scheme, status, quantity)
SELECT
    'inv_' || "id",                                -- Deterministisches ID-Schema
    "id",                                          -- release_id
    'frank_collection',                            -- source
    0,                                             -- purchase_price (Privatsammlung)
    'margin_scheme_25a',                           -- tax_scheme
    CASE 
        WHEN legacy_available = true THEN 'in_stock'
        ELSE 'sold'                                -- oder 'unavailable' je nach Kontext
    END,
    1                                              -- quantity
FROM "Release"
WHERE "coverImage" IS NOT NULL;                    -- Nur sichtbare Artikel
```

Diese Migration ist non-destructive: Die `Release`-Tabelle wird nicht veraendert. `inventory_item` ist eine zusaetzliche Schicht.

---

## 6. Release-faehige Zielarchitektur und Parallelentwicklung

### 6.1 Grundproblem

Das Live-System laeuft und wird aktiv genutzt (Beta-Test-Phase, Pre-Launch-Vorbereitung). Gleichzeitig soll das ERP/Wawi-System als naechstes grosses Feature entwickelt werden. Beides muss parallel moeglich sein, ohne dass sich die Arbeitsstroeme blockieren.

Konkret:
- Bug-Fixes und kleine Verbesserungen am Live-System muessen jederzeit deployed werden koennen
- ERP-Tabellen und -Module muessen entwickelt und getestet werden, ohne Live-Daten zu gefaehrden
- Einzelne ERP-Komponenten (z.B. Sendcloud) sollen VOR dem Gesamt-Release aktivierbar sein
- Die bestehende `transaction`-Tabelle und Order-Logik duerfen nicht gebrochen werden

### 6.2 Architekturprinzipien

**Feature Flags:**
Neue ERP-Funktionalitaet wird hinter Feature Flags deployed:
```typescript
// backend/src/lib/feature-flags.ts
export const FEATURES = {
    ERP_INVOICING: false,       // sevDesk/easybill Integration
    ERP_SENDCLOUD: false,       // Sendcloud Versandautomation
    ERP_INVENTORY: false,       // Bestandsfuehrung (neue Tabellen)
    ERP_COMMISSION: false,      // Kommissionsabrechnung
    ERP_TAX_25A: false,         // §25a Differenzbesteuerung
    ERP_MARKETPLACE: false,     // Seller-Verwaltung (strukturell)
} as const
```
Flags werden in `site_config` gespeichert (bestehende Tabelle) und koennen im Admin unter `/app/config` umgeschaltet werden. Im Code wird jedes neue Feature geprueft:
```typescript
if (siteConfig.features.ERP_SENDCLOUD) {
    // Sendcloud Label erstellen
} else {
    // Bestehender manueller Workflow
}
```

**Modulare Architektur:**
ERP-Module sind eigenstaendig und nicht in bestehenden Code verwoben:
```
backend/src/
├── modules/auction/           ← Bestehendes Auktionsmodul (unveraendert)
├── modules/erp/               ← NEU: Eigenstaendiges ERP-Modul
│   ├── models/
│   │   ├── inventory-item.ts
│   │   ├── inventory-movement.ts
│   │   ├── commission-owner.ts
│   │   ├── commission-settlement.ts
│   │   ├── settlement-line.ts
│   │   ├── tax-margin-record.ts
│   │   ├── invoice.ts
│   │   ├── invoice-line.ts
│   │   ├── shipping-event.ts
│   │   ├── seller.ts
│   │   └── seller-listing.ts
│   └── service.ts
├── api/admin/erp/             ← NEU: ERP Admin-API-Routen
│   ├── inventory/route.ts
│   ├── commission/route.ts
│   ├── invoices/route.ts
│   ├── shipping/route.ts
│   ├── tax/route.ts
│   └── datev/route.ts
├── lib/
│   ├── sendcloud.ts           ← NEU: Sendcloud API-Client
│   ├── sevdesk.ts             ← NEU: sevDesk API-Client
│   ├── feature-flags.ts       ← NEU: Feature-Flag-Logik
│   └── (bestehende Dateien unveraendert)
└── admin/routes/
    └── erp/page.tsx           ← NEU: ERP Hub im Admin
```

**Backward-Compatible DB-Migrationen:**
- Neue Tabellen: `CREATE TABLE IF NOT EXISTS` — sicher, keine Auswirkung auf bestehende Daten
- Neue Spalten: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — nullable, mit Default
- NIEMALS: `DROP COLUMN`, `RENAME COLUMN`, `ALTER TYPE` auf bestehenden Live-Tabellen
- Datenmigration (Release → inventory_item): Separates Script, nicht in DB-Migration. Manuell ausloesbar, idempotent

**API-Versionierung:**
- Bestehende Endpunkte (`/admin/transactions`, `/store/catalog`) bleiben unveraendert
- Neue ERP-Endpunkte unter eigenem Prefix: `/admin/erp/*`
- Wenn bestehende Endpunkte ERP-Daten zurueckgeben sollen (z.B. `inventory_status` in `/admin/transactions`): Optional, via Query-Parameter (`?include=erp_data`), geprueft gegen Feature Flag

### 6.3 Umgebungsmodell

```
┌────────────┐    ┌──────────────┐    ┌────────────────┐    ┌────────────┐
│ Local Dev  │ →  │ Feature      │ →  │ Staging        │ →  │ Production │
│            │    │ Branch       │    │ (Testdaten)    │    │ (VPS)      │
│ localhost  │    │ GitHub       │    │ VPS :3007      │    │ VPS :3006  │
│ :3000/9000 │    │              │    │ Separate DB    │    │ Live DB    │
└────────────┘    └──────────────┘    └────────────────┘    └────────────┘
```

**Staging-Umgebung (neu aufzusetzen):**
- Separate Supabase-Datenbank (oder Schema) mit Testdaten
- Storefront auf Port 3007, Backend auf Port 9001
- Vollstaendige Kopie der Produktionsumgebung (ohne echte Kundendaten)
- sevDesk/easybill Sandbox-Account fuer Rechnungstests
- Sendcloud Test-Modus (Labels werden nicht an Carrier uebermittelt)
- Stripe Test-Mode (bestehend)

**Kosten Staging:** Supabase Free Tier reicht fuer zweite DB. Keine Zusatzkosten (VPS bereits vorhanden).

### 6.4 Branching-Strategie

```
main ─────────────────────────────────────────────────────→  (Production)
  │                                                    ↑
  ├── hotfix/fix-xyz ─────────────────────────────────→┤    (Hotfixes direkt auf main)
  │                                                    │
  └── develop ────────────────────────────────────────→┤    (Next Release Integration)
        │                                              │
        ├── feature/erp-inventory ──→┐                 │
        ├── feature/erp-sendcloud ──→┤  merge nach     │
        ├── feature/erp-invoicing ──→┤  develop wenn   │
        ├── feature/erp-commission ─→┤  Feature fertig │
        └── feature/erp-tax-25a ───→┘                  │
                                                       │
        develop → main (Release-Tag, getestet)────────→┘
```

- `main` = Production. Nur getesteter, stabiler Code
- `develop` = Integrationsbranch fuer naechstes Release. Hier laufen alle Feature-Branches zusammen
- `feature/erp-*` = Einzelne ERP-Module. Jedes Feature ist ein eigener Branch
- `hotfix/*` = Dringende Fixes. Von `main` abgezweigt, nach `main` UND `develop` gemergt

### 6.5 Modulare Komponentenuebernahme

Nicht alle ERP-Komponenten muessen gleichzeitig live gehen. Die folgende Matrix zeigt, welche Komponenten unabhaengig aktivierbar sind:

| Komponente | Eigenstaendig aktivierbar? | Abhaengigkeiten | Risiko |
|------------|---------------------------|-----------------|--------|
| **Sendcloud Integration** | Ja — sofort aktivierbar | Sendcloud-Account, DHL-GK-Nr | Gering: Neue Funktion, kein Eingriff in bestehende Logik |
| **sevDesk/easybill Rechnungen** | Ja — sofort aktivierbar | Account, §25a-Konfiguration mit StB | Gering: Additive Funktion nach Payment-Success |
| **inventory_item Tabellen** | Ja — deployed aber inaktiv | Keine | Kein Risiko: Neue Tabellen, bestehende Logik unberuehrt |
| **Bestandsmigration** | Ja — einmalig ausfuehrbar | inventory_item Tabellen muessen existieren | Gering: Daten werden kopiert, nicht verschoben |
| **§25a-Tracking** | Nein — wartet auf StB-Validierung | Steuerberater muss Konfiguration freigeben | Mittel: Falsche Konfiguration = Steuerfehler |
| **Kommissionsabrechnung** | Nein — wartet auf Gesamt-Release | inventory_item + commission_owner + tax_margin_record | Mittel: Verbindet mehrere Systeme |
| **Marketplace (Seller)** | Nein — operativ spaeter | Strukturell ab Tag 1, aber kein Registrierungs-Flow | Kein Risiko bei Tabellen-Deployment, hoch bei operativer Aktivierung |
| **DATEV-Export** | Ja — sobald Rechnungen existieren | sevDesk/easybill | Gering: Read-only Export |

**Empfohlene Aktivierungsreihenfolge:**
1. Sendcloud → sofort (unabhaengig)
2. sevDesk/easybill Rechnungen → sofort (unabhaengig)
3. DB-Tabellen (alle) → deployed, aber nur ueber Admin sichtbar
4. Bestandsmigration → nach DB-Tabellen
5. DATEV-Export → nach Rechnungen
6. §25a → nach Steuerberater-Freigabe
7. Kommission → wenn erster Kommissionsgeber bereitsteht
8. Marketplace → eigener Meilenstein, spaeter

### 6.6 Risiken der Parallelentwicklung

| Risiko | Beschreibung | Gegenmassnahme |
|--------|-------------|----------------|
| **Mischzustand** | Alte Logik (manueller Versand) und neue Logik (Sendcloud) laufen parallel. Admin sieht zwei Wege, einer davon unvollstaendig | Feature Flags: Entweder altes ODER neues System aktiv, nie beide gleichzeitig fuer den gleichen Prozess |
| **DB-Migration nicht rueckgaengig machbar** | `CREATE TABLE` ist safe, aber `INSERT INTO inventory_item` (Migration) kann nicht einfach zurueckgerollt werden | Migrationsskript idempotent schreiben (INSERT ... ON CONFLICT DO NOTHING). Rollback-Skript vorbereiten (DELETE FROM inventory_item WHERE source = 'frank_collection' AND created_at > X) |
| **Feature Flags vergessen** | Flag bleibt nach Release auf false; Code ist deployed aber nie aktiviert | Review-Checklist vor jedem Release: Alle Feature Flags pruefen. Flag-Cleanup-Task nach Stabilisierung |
| **Testdaten in Produktion** | Staging-Testdaten (Fake-Kommissionsgeber, Test-Rechnungen) versehentlich in Prod | Staging hat eigene DB. Kein Cross-DB-Zugriff. Testdaten-Prefix "TEST_" fuer Safety |
| **Merge-Konflikte** | Mehrere ERP-Feature-Branches aendern gleiche Dateien | Klare Modulaufteilung: Jeder Branch hat eigenes Verzeichnis. Shared Dependencies (feature-flags.ts) nur in develop aendern |
| **Performance-Regression** | Neue Tabellen + JOINs verlangsamen bestehende Queries | Neue Tabellen haben keine Auswirkung auf bestehende Queries (getrennte Module). Neue JOINs nur in neuen Endpunkten. Monitoring: Query-Zeit-Logging |

---

## 7. Architekturentscheidung: Composable vs. ERP-Software

### Optionen

**Option A: Composable Stack**
```
Medusa.js Backend (bestehend)
├── Sendcloud → Versand (160+ Carrier, Labels, Tracking, Returns)
├── sevDesk/easybill → Rechnungen, DATEV, §25a
├── Custom ERP-Modul → Bestandsfuehrung, Kommission, §25a-Tracking
└── Admin ERP Hub → Zentrale Arbeitsoberflaeche
```

**Option B: Billbee als Operations-Layer**
```
Medusa.js Backend (bestehend)
├── Billbee → Orders, Rechnungen, Versand, Lager (alles in einem)
├── sevDesk → DATEV/Buchhaltung (Billbee exportiert dorthin)
└── Medusa Admin → Auktionen, Katalog (Billbee fuer Operations)
```

**Option C: Xentral (vollstaendiges ERP)**
```
Medusa.js Backend (Storefront + Auktionen)
├── Xentral → Alles: Lager, Rechnungen, Versand, Buchhaltung, DATEV
└── Medusa → nur noch Verkaufskanal
```

### Bewertungsmatrix

Gewichtung auf einer Skala von 1-5 (5 = hoechste Wichtigkeit). Bewertung auf einer Skala von 1-5 (5 = beste Erfuellung).

| Kriterium | Gewicht | A: Composable | B: Billbee | C: Xentral |
|-----------|---------|:---:|:---:|:---:|
| **Fit fuer alle 4 Geschaeftsmodelle** | 5 | 5 | 2 | 3 |
| **Fit fuer Kommissionsabrechnung** | 4 | 4 | 2 | 3 |
| **Fit fuer Marketplace (Seller-Payout)** | 4 | 4 | 1 | 2 |
| **Fit fuer §25a Differenzbesteuerung** | 5 | 4 | 2 | 3 |
| **Flexibilitaet (eigene Workflows)** | 4 | 5 | 2 | 3 |
| **Betriebsaufwand (laufend)** | 3 | 3 | 4 | 4 |
| **Integrationsrisiko** | 4 | 4 | 2 | 2 |
| **Datenhoheit** | 3 | 5 | 3 | 3 |
| **Spaetere Umbaukosten** | 3 | 4 | 2 | 3 |
| **Marketplace von Anfang an mitdenkbar** | 5 | 5 | 1 | 2 |
| **Release-Faehigkeit (parallel entwickelbar)** | 4 | 5 | 3 | 2 |
| **Modulare Komponentenuebernahme** | 4 | 5 | 2 | 2 |
| **Monatliche Kosten** | 3 | 5 | 4 | 2 |
| **Entwicklungsaufwand (einmalig)** | 3 | 2 | 3 | 3 |
| | | | | |
| **Gewichtete Summe** | | **258** | **138** | **152** |

### Begruendung der Bewertungen

**Option A — Composable (Gewinner: 258 Punkte):**
- Perfekter Fit fuer alle 4 Modelle, weil alles custom gebaut wird
- Volle Kontrolle ueber Kommission und §25a
- Marketplace-Datenmodell von Tag 1 integrierbar
- Jede Komponente einzeln aktivierbar (modulare Uebernahme)
- Nachteil: Hoeherer Einmalaufwand fuer Custom-Entwicklung (6-8 Wochen)
- Nachteil: Custom Code = eigene Wartung

**Option B — Billbee (138 Punkte):**
- Starke Standard-Features fuer Single-Seller E-Commerce
- Kein Kommissionsmodul
- Kein Marketplace-Support
- §25a nur ueber Workarounds (manuelles Steuerschema pro Artikel)
- Medusa→Billbee-Connector muss gebaut werden (2-3 Wochen)
- Zweites Admin-System neben Medusa
- Nicht parallel entwickelbar (Billbee ist extern, Feature-Flags nicht moeglich)

**Option C — Xentral (152 Punkte):**
- Vollstaendiges ERP mit WMS, Buchhaltung, DATEV
- Kommission ansatzweise abbildbar, aber nicht fuer Vinyl-/Auktions-Workflows
- Kein Marketplace-Support
- §25a theoretisch moeglich, aber nicht der primaere Use Case
- Medusa→Xentral-Connector: 3-4 Wochen Entwicklung
- Zweites Admin-System
- 199-799 EUR/Monat — erhebliche laufende Kosten bei aktuellem Volumen
- Overkill fuer die aktuelle Phase

### Detailanalyse der Optionen

**Option A — Composable: Wo liegt der Aufwand?**

Der Hauptaufwand liegt in den Custom-Modulen, die kein SaaS-Produkt liefert:
- Kommissionsabrechnung mit zeilengenauem Settlement (~2 Wochen)
- §25a-Tracking mit Abhaengigkeitslogik (~1 Woche)
- Bestandsfuehrung mit Quellenzuordnung und Bewegungshistorie (~1,5 Wochen)
- ERP Admin-UI (6 Sub-Pages) (~2 Wochen)

Was NICHT custom gebaut wird:
- Rechnungserstellung → sevDesk/easybill (API-Call, 1 Tag pro Rechnungstyp)
- Versand → Sendcloud (API-Call + Webhooks, 1 Woche)
- DATEV → Export-Format generieren (Standard-ASCII, 2 Tage)
- PDF-Erzeugung → pdfkit (bereits im Projekt fuer Invoices und Shipping Labels)

**Option B — Billbee: Warum nicht?**

Billbee ist fuer den klassischen Multi-Channel-E-Commerce gebaut (eBay + Amazon + Shopify synchronisieren). Die Kernprobleme fuer VOD:
1. **Kein Auktionsmodell:** Billbee kennt nur Festpreis-Orders. Der gesamte Auktions-Workflow (Block, Lot, Gebot, Anti-Sniping, Gewinner → Payment) muesste ausserhalb von Billbee bleiben
2. **Kein Kommissionsmodul:** Keine Kommissionsgeber-Verwaltung, kein Settlement, keine Provisionssplitting
3. **Kein Marketplace:** Kein Seller-Konzept, kein Split-Payment, kein DAC7
4. **§25a:** Billbee unterstuetzt "Differenzbesteuerung" als Steuerkategorie, aber ohne artikelgenaue Marge-Berechnung (EK-VK-Differenz pro Stueck)
5. **Medusa-Connector:** Existiert nicht. Muesste custom gebaut werden (API-Sync Orders, Kunden, Produkte). Aufwand: 2-3 Wochen — fast gleich viel wie die Custom-Module in Option A
6. **Zweites Admin:** Frank muesste in Billbee UND im Medusa-Admin arbeiten. Fragmentierte Workflows

**Option C — Xentral: Warum nicht?**

Xentral ist ein vollwertiges ERP (Lager, Einkauf, Produktion, Buchhaltung, Versand). Die Kernprobleme:
1. **Kosten:** 199 EUR/Monat (Starter) bis 799 EUR/Monat (Professional). Bei aktuellem Volumen (< 10 Orders/Tag) nicht wirtschaftlich
2. **Overkill:** Produktionsplanung, Einkaufsbestellwesen, Multi-Warehouse-Logik — Funktionen die VOD nicht braucht
3. **Kein Auktionsmodell:** Gleiche Luecke wie Billbee
4. **Kein Marketplace:** Kein Seller-Konzept
5. **Medusa-Connector:** Xentral hat eine REST-API, aber keinen Medusa-Connector. Custom-Entwicklung: 3-4 Wochen
6. **Migrationskomplexitaet:** Xentral erwartet Produkte, Lager, Kunden im Xentral-Format. ~41.500 Releases muessten importiert und synchron gehalten werden
7. **Sinnvoll ab:** 100+ Orders/Tag mit echtem Lager-Management (Pick-Pack-Ship mit Barcode-Scannern, Multi-Warehouse). Nicht in den naechsten 12-18 Monaten realistisch

### Empfehlung

**Option A: Composable Stack.** Die Kombination aus Auktionslogik, §25a, Kommission und spaeterem Marketplace ist zu spezifisch fuer Standard-ERP-Software. Der hoehere Einmalaufwand zahlt sich aus durch:
- Null Vendor-Lock-in
- Volle Kontrolle ueber alle Prozesse
- Keine monatlichen SaaS-Kosten ueber sevDesk/easybill + Sendcloud hinaus
- Marketplace-Ready-Architektur ohne spaetere Umbauten

**Wann die Empfehlung sich aendert:**
- Bei > 100 Orders/Tag und echtem Multi-Warehouse: Xentral evaluieren
- Bei Multi-Channel-Expansion (eigener eBay/Discogs-Shop): Billbee evaluieren
- Bei Uebernahme/Fusion mit anderem Haendler der bereits ERP nutzt: dessen System evaluieren

---

## 8. Marketplace von Anfang an mitdenken

### Warum nicht aufschieben

Das gaengige Muster "Erst Single-Seller stabilisieren, dann Marketplace hinzufuegen" fuehrt in der Praxis zu teuren Umbauten. Die folgenden Entscheidungen, die jetzt getroffen werden, sind spaeter nur mit erheblichem Aufwand aenderbar:

| Bereich | Ohne Marketplace-Denke jetzt | Mit Marketplace-Denke jetzt |
|---------|------------------------------|----------------------------|
| **Datenmodell** | `inventory_item` hat kein `seller_id` → spaeter ALTER TABLE + Daten-Migration + alle Queries anpassen | `seller_id` nullable von Anfang an → kein Umbau |
| **Payment-Architektur** | Nur VOD-Konto als Empfaenger → spaeter Stripe Connect nachrüsten = neue Payment-Flows, neue Webhook-Logik, neue Frontend-Komponenten | Stripe Connect App-ID registriert, Tabelle `seller` mit `stripe_connect_account_id` vorhanden → Aktivierung = Konfiguration, kein Umbau |
| **Rechnungslogik** | Alle Rechnungen = VOD-Rechnungen → spaeter: "Wer stellt die Rechnung bei Marketplace?" = Architekturproblem | Invoice-Tabelle hat `issuer`-Konzept → VOD oder Seller als Rechnungssteller |
| **Versandlogik** | Nur VOD-Versand → spaeter: Seller-Tracking einfuegen = neuer Workflow im Order-Management | `shipping_event` ist vom Versender entkoppelt → egal ob VOD oder Seller |
| **Order-Management** | `transaction` gehoert immer VOD → spaeter: Seller-Zuordnung = Tabellen-Umbau | `seller_id` auf relevanten Tabellen von Tag 1 |
| **Admin-UI** | Orders-Liste zeigt nur VOD-Orders → spaeter: Seller-Filter = neues UI-Konzept | Orders-Liste hat `source`-Filter-Option (auch wenn nur "VOD" als Wert existiert) |

### Was strukturell ab Tag 1 vorhanden sein muss

1. **Tabelle `seller`:** Existiert, aber ohne Registrierungs-Flow. Wird nur intern genutzt (VOD selbst als "Seller" fuer eigene Ware)
2. **Tabelle `seller_listing`:** Existiert, aber keine oeffentliche Einreichung
3. **`seller_id` auf `inventory_item`, `transaction` (optional), `invoice`:** Nullable. Fuer Modell 0/A/C = NULL (= VOD)
4. **Stripe Connect Application:** Registriert bei Stripe (dauert 1-2 Wochen), aber kein Seller-Onboarding-Flow aktiv
5. **DAC7-Felder auf `seller`:** tax_id, annual_revenue, total_transactions — fuer spaetere Meldepflicht
6. **Feature Flag `ERP_MARKETPLACE`:** false. Alle Marketplace-Codepfade hinter Flag

### Was operativ spaeter aktiviert wird

1. Seller-Registrierungs-Flow (oeffentliches Bewerbungsformular)
2. Seller-Dashboard (eigene Listings verwalten, Umsaetze einsehen)
3. Stripe Connect Onboarding fuer Seller
4. Payout-Logik (automatisch nach Versandbestaetigung)
5. Seller-Profilseite im Storefront
6. Admin: Seller-Verwaltung und -Review

### Stripe Connect: Was konkret vorbereitet werden muss

**Stripe Connect Account-Typen:**

| Typ | Beschreibung | Fuer VOD |
|-----|-------------|---------|
| Standard | Seller hat eigenes Stripe Dashboard. Maximale Kontrolle fuer Seller | Nein (zu viel Selbstverwaltung) |
| Express | Stripe-gehostetes Onboarding + Mini-Dashboard. Plattform kontrolliert Payouts | **Ja (empfohlen)** |
| Custom | Plattform baut alles selbst. Volle Kontrolle, hoher Aufwand | Nein (Overkill) |

**Vorbereitung (Phase 0):**
1. Stripe Connect Platform Application einreichen (Stripe Dashboard → Connect → Get started)
2. Business-Informationen: VOD Records, Friedrichshafen, Deutschland
3. Platform-Profil: "Curated auction platform for industrial music vinyl records"
4. Stripe prueft und genehmigt (1-2 Wochen)
5. Nach Genehmigung: Connect-API steht zur Verfuegung

**Technische Integration (spaeter, bei Marketplace-Aktivierung):**
```typescript
// Seller-Onboarding: Express Account erstellen
const account = await stripe.accounts.create({
    type: 'express',
    country: 'DE',
    email: seller.email,
    capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
    },
});

// Onboarding-Link generieren (Seller durchlaeuft KYC)
const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: 'https://vod-auctions.com/seller/onboarding/refresh',
    return_url: 'https://vod-auctions.com/seller/onboarding/complete',
    type: 'account_onboarding',
});

// Bei Verkauf: Payment Intent mit Transfer
const paymentIntent = await stripe.paymentIntents.create({
    amount: 5000,  // 50.00 EUR
    currency: 'eur',
    transfer_data: {
        destination: seller.stripe_connect_account_id,
        amount: 4500,  // 45.00 EUR (90% an Seller)
    },
    // Plattform behaelt 5.00 EUR (10% Fee)
});
```

**Was JETZT registriert wird, was SPAETER implementiert wird:**
- JETZT: Stripe Connect Application einreichen + genehmigen lassen (0 Code, 0 Kosten)
- JETZT: `seller.stripe_connect_account_id` Feld in DB
- SPAETER: Onboarding-Flow, Payment-Splitting, Payout-Logik, Seller-Dashboard

### Kosten des Mitdenkens

Der Mehraufwand fuer die Marketplace-Ready-Architektur betraegt geschaetzt:
- Datenmodell: ~2 zusaetzliche Tabellen (`seller`, `seller_listing`) + `seller_id`-Spalten = 1 Tag
- Stripe Connect Registration: 2 Stunden (Formular ausfuellen, warten)
- Feature Flag: 0,5 Tage (in bestehendes Flag-System integrieren)
- **Gesamt: ~2 Tage Mehraufwand jetzt, statt 2-4 Wochen Umbau spaeter**

### Risiko des NICHT-Mitdenkens

Wenn der Marketplace spaeter hinzugefuegt werden soll, ohne dass die Architektur darauf vorbereitet ist:
- Datenbank-Migration unter Last (ALTER TABLE auf grosse Tabellen)
- Alle bestehenden Queries muessen auf `seller_id`-Logik angepasst werden
- Payment-Flow muss komplett umgebaut werden (nicht nur erweitert)
- Frontend-Komponenten (Order-Liste, Rechnung, Versand) muessen Multi-Seller faehig werden
- Geschaetzer Aufwand: 2-4 Wochen reiner Umbau, plus Regressionstests
- Risiko: Bugs in bestehender Logik durch invasive Aenderungen

---

## 9. Risiken und Ausnahmefaelle

### Risikomatrix (Ueberblick)

| # | Risiko | Eintritt | Auswirkung | Gesamt | Massnahme |
|---|--------|----------|------------|--------|-----------|
| R1 | §25a falsch konfiguriert | Mittel | Hoch (Nachzahlung + Zinsen) | **Hoch** | Steuerberater-Validierung VOR Go-Live |
| R2 | Inkonsistenz Bestand ↔ Realitaet | Mittel | Mittel (Fehlverkaeufe) | **Mittel** | Inventur-Funktion, Stichproben |
| R3 | sevDesk/easybill API-Ausfall | Gering | Mittel (keine Rechnungen) | **Gering** | Retry-Logik, Fallback: Manuelle Rechnung |
| R4 | Sendcloud Webhook verpasst | Gering | Gering (Status-Verzoegerung) | **Gering** | Naechtlicher Batch-Abgleich |
| R5 | Feature-Flag-Mischzustand | Mittel | Mittel (Admin-Verwirrung) | **Mittel** | Klare Flag-Dokumentation, Release-Checklist |
| R6 | Marketplace §25e Haftung | Gering (spaeter) | Hoch (volle USt-Haftung) | **Mittel** | F22-Pflicht vor Seller-Onboarding |
| R7 | Retoure nach Settlement | Gering | Mittel (Rueckforderung) | **Gering** | Vertragliche Regelung, Verrechnungsklausel |
| R8 | Chargeback ohne Evidenz | Gering | Mittel (Verlust + Gebuehr) | **Gering** | Sendcloud Tracking als Evidenz |
| R9 | Doppelte Rechnung (Race Condition) | Gering | Mittel (GoBD-Verstoss) | **Gering** | Idempotenz: Invoice pro transaction_id UNIQUE |
| R10 | Migration Datenverlust | Gering | Hoch | **Mittel** | Backup vor Migration, idempotentes Script, Staging-Test |

### 9.1 Retoure und Teilretoure

| Szenario | Prozess | Buchhalterische Auswirkung |
|----------|---------|---------------------------|
| **Vollretoure** | Ware zurueck, volle Erstattung | Stornorechnung via sevDesk/easybill. DATEV: Stornobuchung. inventory_item → 'returned' → nach Pruefung → 'in_stock' |
| **Teilretoure (aus Combined Order)** | Nur einzelne Position zurueck | Gutschrift ueber retournierte Position. Verbleibende Positionen unveraendert. Versandkosten: anteilig oder voll (AGB-Entscheidung) |
| **Retoure beschaedigte Ware** | Kaeufer sendet beschaedigte Ware zurueck | Pruefung: War die Ware schon beschaedigt (VOD-Fehler) oder hat Kaeufer beschaedigt? Bei VOD-Fehler: volle Erstattung. Bei Kaeufer: Wertminderung abziehen (§357 BGB) |
| **Retoure Kommissionsware** | Ware gehoert Kommissionsgeber, wurde verkauft und zurueckgenommen | Erstattung an Kaeufer. Settlement-Korrektur: settlement_line stornieren oder negatives Settlement erstellen. commission_owner.total_sold -= 1 |
| **Retoure nach Settlement** | Ware wurde bereits an Kommissionsgeber abgerechnet und ausgezahlt | Verrechnung im naechsten Settlement (payout_amount = netto - Rueckbuchung). Oder: Rueckforderung an Kommissionsgeber (vertraglich regeln!) |

### 9.2 Storno nach Rechnungsstellung

- GoBD verbietet das Loeschen oder Aendern einer erstellten Rechnung
- Storno = Stornorechnung erstellen (Gutschrift mit Verweis auf Originalrechnung)
- sevDesk/easybill bilden das nativ ab (Button "Stornieren" → automatische Gutschrift)
- DATEV: Gegenbuchung auf gleiche Konten
- Rechnungsnummernkreis fuer Gutschriften: VOD-CR-YYYY-NNNNN (Credit Note)

### 9.3 Chargebacks und Zahlungsausfaelle

| Szenario | Auswirkung | Massnahme |
|----------|-----------|-----------|
| **Stripe Chargeback** | Kaeufer reklamiert bei Bank. Stripe bucht Betrag zurueck + 15 EUR Gebuehr | Evidenz liefern (Tracking, Lieferbestaetigung). Bei Verlust: Stornorechnung. inventory_item bleibt 'shipped' (Ware ist beim Kaeufer) |
| **PayPal Dispute** | Kaeufer oeffnet Fall. PayPal haelt Betrag | Evidenz ueber PayPal Resolution Center. Gleiche Logik wie Chargeback |
| **Nicht-Zahlung (Auktion)** | Kaeufer gewinnt Auktion, zahlt nicht | Erinnerungen (3d, 7d). Nach 14d: Storno. Kein Rechnungsproblem (Rechnung wird erst nach Zahlung erstellt) |
| **Doppelzahlung** | Kaeufer zahlt versehentlich zweimal (z.B. Stripe + PayPal) | Manuelle Erstattung eines Betrags. Zweite Transaktion als 'refunded' markieren |

### 9.4 Inkonsistenzen zwischen Systemen

| Inkonsistenz | Ursache | Erkennung | Behebung |
|-------------|---------|-----------|----------|
| **Bestand sagt 'in_stock', aber Ware physisch nicht da** | Inventurunterschied, Ware verlorengegangen | Jaehrliche Inventur + Stichproben | inventory_movement type='adjustment' mit reason |
| **Rechnung erstellt, aber Payment fehlgeschlagen** | Webhook-Reihenfolge-Problem | Invoice mit status='created' aber transaction.status='failed' | Cron-Job: Rechnungen ohne Payment nach 24h flaggen. Admin reviewed manuell |
| **Sendcloud sagt 'delivered', transaction sagt 'shipped'** | Webhook verpasst oder verzoegert | Naechtlicher Abgleich: Sendcloud Parcel Status vs. lokaler Status | Automatischer Status-Update bei naechstem Webhook oder Batch-Abgleich |
| **§25a-Marge falsch berechnet** | Einkaufspreis nachtraeglich korrigiert | Audit: tax_margin_record.purchase_price vs. inventory_item.purchase_price | Korrektur-Record erstellen (alter Record bleibt, neuer mit korrekten Werten + Verweis). Steuerberater informieren |
| **Settlement ausgezahlt, Transaktion spaeter storniert** | Kaeufer retourniert nach Kommissionsabrechnung | Settlement-Line ohne aktive Transaktion | Negatives Settlement-Line im naechsten Abrechnungszyklus |

### 9.5 Steuerliche Sonderfaelle

| Sonderfall | Regelung | Umsetzung |
|-----------|----------|-----------|
| **EU-Versand > 10.000 EUR/Jahr** | OSS-Schwelle ueberschritten → USt des Bestimmungslandes | sevDesk/easybill kennt OSS. Land des Kaeufers bestimmt Steuersatz. DATEV: Separates Konto fuer OSS-Erloese |
| **Schweizer Kaeufer** | Drittland, steuerfreie Ausfuhr | Zollformular CN22 (Sendcloud), Rechnung ohne USt, Nachweis der Ausfuhr aufbewahren |
| **Mischwarenkorb §25a + Standard** | Zwei Steuerschemata in einer Order | Separate Rechnungen (nicht Mischrechnung) |
| **Kommittent wird gewerblich** | War privat, meldet Gewerbe an | Ab Gewerbeanmeldung: Neue Artikel = Regelbesteuerung (USt auf Lieferung). Alte Artikel (bereits eingelagert): §25a bleibt (Zeitpunkt der Uebernahme zaehlt) |
| **Einkaufspreis unbekannt** | Franks alte Sammlung, keine Belege | EK = 0 ansetzen. Marge = VK. Steuerberater muss bestaetigen. Alternative: Schaetzung (nachvollziehbar dokumentieren) |
| **Sammelberechnung vs. Einzeldifferenz** | §25a Abs. 4 erlaubt Sammelberechnung bei EK < 500 EUR | Steuerberater-Entscheidung. System muss beide Varianten unterstuetzen |

### 9.6 Risiken aus Parallelbetrieb und Migration

| Risiko | Beschreibung | Eintrittswahrscheinlichkeit | Massnahme |
|--------|-------------|----------------------------|-----------|
| **Feature Flag vergessen** | ERP-Komponente deployed aber nie aktiviert, toter Code | Mittel | Release-Checklist, Flag-Cleanup alle 3 Monate |
| **Migration korrumpiert Daten** | Einmalige Migration Release → inventory_item erzeugt falsche Zuordnungen | Gering (idempotent) | Migration auf Staging testen. Rollback-Script vorbereiten. Migration manuell ausloesen (nicht automatisch) |
| **Sendcloud Webhook flood** | Viele Sendcloud-Events gleichzeitig | Gering | Queue-basierte Verarbeitung. Idempotente Webhook-Handler |
| **sevDesk API-Limit** | sevDesk: 2 Requests/Sekunde. Bei Batch-Rechnungserstellung | Mittel | Rate-Limiting im Client. Batch-Jobs sequentiell mit Delay |
| **Feature-Flag-Mischzustand** | Admin sieht alte UND neue Versandlogik gleichzeitig | Mittel | Pro Prozess EIN Flag: Alt ODER Neu. Admin-UI zeigt nur den aktiven Workflow. Kein "Hybrid" innerhalb eines Prozesses |

---

## 10. Empfehlung und Implementierungsplan

### Integrationsarchitektur

```
┌──────────────────────────────────────────────────────────────────┐
│                       MEDUSA.JS BACKEND                          │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Auction     │  │ ERP Module   │  │ Admin Routes           │  │
│  │ Module      │  │ (Models,     │  │ /admin/erp/*           │  │
│  │ (bestehend) │  │  Service)    │  │                        │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬────────────┘  │
│         │                │                      │                │
│         │         ┌──────▼───────┐              │                │
│         │         │ Feature      │              │                │
│         │         │ Flags        │◄─────────────┘                │
│         │         └──────────────┘                               │
│         │                                                        │
│  ┌──────▼──────────────────────────────────────────────────────┐ │
│  │                    LIB (API-Clients)                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │ │
│  │  │sendcloud │  │ sevdesk  │  │ stripe   │  │ feature-   │  │ │
│  │  │.ts       │  │ .ts      │  │ .ts      │  │ flags.ts   │  │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────────┘  │ │
│  └───────┼──────────────┼────────────┼─────────────────────────┘ │
│          │              │            │                            │
└──────────┼──────────────┼────────────┼────────────────────────────┘
           │              │            │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌──▼──────────────┐
    │  Sendcloud  │ │  sevDesk/  │ │  Stripe         │
    │  API        │ │  easybill  │ │  (bestehend)    │
    │             │ │  API       │ │  + Connect      │
    │  Labels     │ │            │ │                  │
    │  Tracking   │ │  Rechnungen│ │  Payments       │
    │  Returns    │ │  DATEV     │ │  Seller-Payouts │
    └──────┬──────┘ └────────────┘ └──────────────────┘
           │
    ┌──────▼──────┐
    │  Webhooks   │
    │  /webhooks/ │
    │  sendcloud  │
    └─────────────┘
```

**Datenflussbeschreibung:**

1. **Payment Success → Rechnung:**
   Stripe/PayPal Webhook → `transaction.status = 'paid'` → System prueft Feature Flag `ERP_INVOICING` → wenn aktiv: `lib/sevdesk.ts` erstellt Rechnung via API → `invoice`-Datensatz mit sevDesk-Referenz → E-Mail an Kaeufer mit PDF-Link

2. **Payment Success → Bestandsaenderung:**
   `transaction.status = 'paid'` → System prueft Feature Flag `ERP_INVENTORY` → wenn aktiv: `inventory_item.status = 'sold'` + `inventory_movement` type='sale' → bei §25a: `tax_margin_record` erstellen

3. **Admin "Create Label" → Versand:**
   Admin-Klick → `lib/sendcloud.ts` → Sendcloud API erstellt Label → Label-PDF zurueck → `shipping_event` type='label_created' → `transaction.tracking_number` setzen → `fulfillment_status = 'packing'`

4. **Sendcloud Webhook → Status-Update:**
   Carrier-Event → Sendcloud → Webhook → `/webhooks/sendcloud` → `shipping_event` anlegen → `fulfillment_status` aktualisieren → bei 'delivered': E-Mail-Benachrichtigung (optional)

5. **Kommissionsabrechnung → Gutschrift:**
   Admin loest Settlement aus → System sammelt verkaufte Artikel des Kommissionsgebers → `settlement_line` pro Artikel → Aggregation → `commission_settlement` → bei Freigabe: Gutschrift in sevDesk/easybill → Ueberweisung

### Phase 0: Vorbereitung (Woche 0 — parallel zur Entwicklung)

| Aufgabe | Verantwortlich | Abhaengigkeit | Geschaetzter Aufwand |
|---------|---------------|---------------|---------------------|
| Steuerberater: §25a-Setup, Kontenplan, Buchungslogik validieren | Robin + Frank | Termin vereinbaren | 2-4 Stunden + Wartezeit |
| sevDesk ODER easybill Account einrichten | Robin | Entscheidung sevDesk vs. easybill | 1 Stunde |
| Sendcloud Account einrichten | Robin | — | 0,5 Stunden |
| DHL Geschaeftskunden-Nr. beantragen | Frank | Gewerbenachweis | 2-4 Wochen Wartezeit |
| Stripe Connect Platform Application einreichen | Robin | Stripe Account | 1-2 Wochen Wartezeit |
| Staging-Umgebung aufsetzen (Supabase DB, PM2 Config) | Robin | — | 0,5 Tage |
| Kommissionsvertrag-Vorlage erstellen lassen | Frank + Anwalt/StB | — | Extern |

**Kosten Phase 0:** Steuerberater ~500-1.000 EUR, Anwalt fuer Kommissionsvertrag ~500 EUR, SaaS-Accounts ~0 EUR (Free Tiers)

### Phase 1: Datenmodell und Grundstruktur (Woche 1-2)

| Aufgabe | Branch | Aufwand |
|---------|--------|---------|
| ERP-Modul anlegen: Models, Service, Migrations | feature/erp-models | 2 Tage |
| Feature-Flag-System implementieren | feature/erp-flags | 0,5 Tage |
| `seller` + `seller_listing` Tabellen (Marketplace-Ready) | feature/erp-models | 0,5 Tage |
| Bestandsmigration (Release → inventory_item) als Script | feature/erp-migration | 1 Tag |
| Admin ERP Hub (Leerseite mit Navigation) | feature/erp-admin | 1 Tag |
| Tests auf Staging | — | 1 Tag |

**Ergebnis:** Alle Tabellen existieren. Feature Flags deployed (alle auf false). Keine Auswirkung auf Live-System.

**Akzeptanzkriterien Phase 1:**
- [ ] Alle ERP-Tabellen existieren in Staging-DB (via `npx medusa db:migrate`)
- [ ] Feature-Flag-System funktioniert (Flag umschalten → Verhalten aendert sich)
- [ ] Bestandsmigration auf Staging erfolgreich (Anzahl inventory_items = Anzahl sichtbare Releases)
- [ ] ERP Hub-Seite im Admin erreichbar (Leerseite mit 6 Karten)
- [ ] Keine Regression: Bestehende Auktions-, Direktkauf- und Versand-Workflows funktionieren unveraendert

### Phase 2: Rechnungen und DATEV (Woche 3-4)

| Aufgabe | Branch | Aufwand |
|---------|--------|---------|
| sevDesk/easybill API-Client (`lib/sevdesk.ts` oder `lib/easybill.ts`) | feature/erp-invoicing | 2 Tage |
| Invoice-Erstellung nach Payment-Success (§25a + Regelbesteuerung) | feature/erp-invoicing | 2 Tage |
| Admin: Rechnungsuebersicht (Liste, Status, PDF-Download) | feature/erp-invoicing | 1,5 Tage |
| Gutschrift bei Erstattung/Storno | feature/erp-invoicing | 1 Tag |
| DATEV-Export (Monatlich, Button im Admin) | feature/erp-datev | 2 Tage |
| §25a-Konfiguration in sevDesk/easybill (nach StB-Freigabe) | — | 0,5 Tage |
| Tests: Mischwarenkoerbe, Storno, EU-Versand | — | 1 Tag |

**Ergebnis:** Automatische Rechnungserstellung nach Zahlung. DATEV-Export moeglich. Aktivierbar via Feature Flag `ERP_INVOICING`.

**Akzeptanzkriterien Phase 2:**
- [ ] Nach Stripe/PayPal Payment-Success: Rechnung automatisch in sevDesk/easybill erstellt
- [ ] §25a-Rechnung: Kein separater USt-Ausweis, Pflichttext vorhanden
- [ ] Regelbesteuerungs-Rechnung: Netto + 19% USt + Brutto korrekt
- [ ] Gutschrift bei Storno/Erstattung wird automatisch erstellt
- [ ] DATEV-Export fuer April 2026: CSV mit korrekten Konten, BU-Schluesseln, Betraegen
- [ ] Steuerberater bestaetigt: Kontenplan und Buchungslogik korrekt

### Phase 3: Versandautomation (Woche 5-6)

| Aufgabe | Branch | Aufwand |
|---------|--------|---------|
| Sendcloud API-Client (`lib/sendcloud.ts`) | feature/erp-sendcloud | 1,5 Tage |
| Admin: "Create Label" pro Transaction | feature/erp-sendcloud | 1 Tag |
| Batch-Label-Erstellung (alle offenen Orders) | feature/erp-sendcloud | 1 Tag |
| Sendcloud Webhooks → shipping_event → fulfillment_status Update | feature/erp-sendcloud | 1,5 Tage |
| Tracking-Link in Versand-E-Mail (Resend Template Update) | feature/erp-sendcloud | 0,5 Tage |
| Branded Tracking-Seite konfigurieren (Sendcloud Dashboard) | — | 0,5 Tage |
| Zollformulare (CN22/CN23) fuer Non-EU | feature/erp-sendcloud | 0,5 Tage |
| Retouren-Label via Sendcloud | feature/erp-sendcloud | 1 Tag |
| Tests: DE, EU, Non-EU, Batch, Retoure | — | 1 Tag |

**Ergebnis:** Label-Erstellung und Tracking automatisiert. Aktivierbar via Feature Flag `ERP_SENDCLOUD`.

**Akzeptanzkriterien Phase 3:**
- [ ] Admin kann Label fuer einzelne Transaction erstellen → PDF wird angezeigt
- [ ] Batch-Labels: 10 offene Orders → 10 Labels in einem Call → Sammel-PDF
- [ ] Sendcloud Webhook 'delivered' → fulfillment_status automatisch auf 'delivered'
- [ ] Tracking-Link in Versand-E-Mail korrekt und klickbar
- [ ] Non-EU Versand: CN22-Formular wird automatisch generiert
- [ ] Retouren-Label kann erstellt werden

### Phase 4: Bestandsfuehrung und §25a (Woche 7-8)

| Aufgabe | Branch | Aufwand |
|---------|--------|---------|
| Admin: Bestandsuebersicht (Filter: Source, Status, Lagerort) | feature/erp-inventory | 2 Tage |
| Wareneingang buchen (Formular: Release, Quelle, EK, Lagerort) | feature/erp-inventory | 1,5 Tage |
| Bestandsbewegungen automatisch bei Verkauf/Versand/Retoure | feature/erp-inventory | 2 Tage |
| §25a-Tracking: tax_margin_record automatisch bei Verkauf | feature/erp-tax-25a | 1 Tag |
| Admin: §25a-Uebersicht (Marge, USt, Erloes pro Periode) | feature/erp-tax-25a | 1,5 Tage |
| Inventur-Funktion (Soll-Ist-Abgleich) | feature/erp-inventory | 1 Tag |
| Tests | — | 1 Tag |

**Ergebnis:** Artikelgenaue Bestandsfuehrung mit §25a-Nachweis. Aktivierbar via Feature Flags `ERP_INVENTORY` + `ERP_TAX_25A`.

**Akzeptanzkriterien Phase 4:**
- [ ] Admin-Bestandsuebersicht: Filter nach Quelle, Status, Lagerort funktionieren
- [ ] Wareneingang buchen: Neuer inventory_item + inventory_movement type='inbound'
- [ ] Verkauf: inventory_item.status → 'sold' + inventory_movement type='sale' (automatisch)
- [ ] §25a: tax_margin_record wird bei Verkauf eines §25a-Artikels automatisch angelegt
- [ ] §25a-Uebersicht: Marge, USt auf Marge, Netto-Erloes pro Zeitraum korrekt
- [ ] Negative Marge: Kein negativer USt-Betrag (Marge = max(VK-EK, 0))

### Phase 5: Kommissionsabrechnung (Woche 9-10)

| Aufgabe | Branch | Aufwand |
|---------|--------|---------|
| Admin: Kommissionsgeber-Verwaltung (CRUD, Stammdaten, Konditionen) | feature/erp-commission | 2 Tage |
| Kommissionsabrechnung generieren (Zeitraum, Positionen, Provision) | feature/erp-commission | 2 Tage |
| Settlement-PDF generieren (pdfkit, Format wie in Abschnitt 3.7) | feature/erp-commission | 1 Tag |
| Settlement-Workflow: draft → approved → paid | feature/erp-commission | 1 Tag |
| Storno/Korrektur im Settlement (Retoure nach Abrechnung) | feature/erp-commission | 1 Tag |
| Admin: Kommissions-Dashboard (ausstehend, ausgezahlt, offen) | feature/erp-commission | 1 Tag |
| Tests | — | 1 Tag |

**Ergebnis:** Vollstaendige Kommissionsabrechnung. Aktivierbar via Feature Flag `ERP_COMMISSION`.

**Akzeptanzkriterien Phase 5:**
- [ ] Kommissionsgeber anlegen: Stammdaten, Provisionssatz, Bankverbindung
- [ ] Abrechnung erstellen: Zeitraum waehlen → alle verkauften Artikel des Kommissionsgebers werden gelistet
- [ ] Jede Abrechnungszeile zeigt: Artikel, VK, EK, Provision, Auszahlung, Steuerschema
- [ ] Settlement-PDF sieht professionell aus (pdfkit, Format wie in 3.8)
- [ ] Workflow: draft → approved (Admin-Freigabe) → paid (nach Ueberweisung)
- [ ] Storno einer Settlement-Line: Korrektur im naechsten Abrechnungszyklus

### Phase 6: ERP Dashboard und Konsolidierung (Woche 11)

| Aufgabe | Branch | Aufwand |
|---------|--------|---------|
| ERP Dashboard: Tagesumsatz, Monatsumsatz, offene Zahlungen | feature/erp-dashboard | 1,5 Tage |
| Bestandswert-Berechnung (EK-Summe aller in_stock Artikel) | feature/erp-dashboard | 0,5 Tage |
| Steuerbericht: Regel vs. §25a vs. Kommission vs. Marketplace-Fee | feature/erp-dashboard | 1 Tag |
| Feature-Flag-Cleanup: Stabile Features auf true setzen, Code bereinigen | — | 1 Tag |
| Dokumentation: Admin-Handbuch fuer ERP-Funktionen | — | 1 Tag |

**Ergebnis:** Konsolidiertes ERP-System, alle Flags aktiv, Dokumentation fertig.

### Zusammenfassung

| Phase | Woche | Aufwand | Abhaengigkeit |
|-------|-------|---------|---------------|
| 0: Vorbereitung | 0 | Parallel (extern) | Steuerberater, DHL, Stripe |
| 1: Datenmodell | 1-2 | ~6 Tage | — |
| 2: Rechnungen + DATEV | 3-4 | ~10 Tage | sevDesk/easybill Account, §25a-Freigabe StB |
| 3: Versand | 5-6 | ~8,5 Tage | Sendcloud Account, DHL-GK-Nr |
| 4: Bestand + §25a | 7-8 | ~10 Tage | Phase 1 |
| 5: Kommission | 9-10 | ~9 Tage | Phase 1 + 4, Kommissionsvertrag |
| 6: Dashboard | 11 | ~5 Tage | Alle vorherigen Phasen |
| **Gesamt** | **~11 Wochen** | **~48,5 Tage** | |

**Monatliche Kosten nach Implementierung:**

| Position | Kosten |
|----------|--------|
| Sendcloud (Free → Growth bei > 400 Labels/Monat) | 0-59 EUR/Monat |
| sevDesk Buchhaltung oder easybill Plus | 9-18 EUR/Monat |
| DHL Geschaeftskunden (per Paket) | 0 EUR/Monat (Stueckpreis) |
| Stripe Connect (zusaetzlich zu Standard-Stripe) | 0 EUR/Monat (pro Transaktion) |
| **Gesamt** | **~10-80 EUR/Monat** |

**Einmalige Kosten:**

| Position | Kosten |
|----------|--------|
| Steuerberater §25a-Setup | ~500-1.000 EUR |
| Rechtsberatung Kommissionsvertrag | ~500 EUR |
| Entwicklung (11 Wochen) | Intern |
| **Gesamt einmalig** | **~1.000-1.500 EUR** |

---

## 11. Offene fachliche Entscheidungen

Die folgenden Punkte muessen VOR Implementierungsbeginn geklaert werden. Ohne diese Entscheidungen kann die Entwicklung nicht sinnvoll starten.

### Muss entschieden werden (blockierend)

| # | Entscheidung | Entscheider | Auswirkung auf |
|---|-------------|-------------|----------------|
| 1 | **Steuerberater: §25a-Konfiguration validieren.** Einzeldifferenz oder Sammelberechnung? Franks Sammlung komplett unter §25a? Kontenplan bestaetigen. Rechnungsformulierung genehmigen. | Steuerberater + Frank | Phase 2, 4 |
| 2 | **sevDesk ODER easybill?** Beides funktioniert. Entscheidung nach: bestehender Account vorhanden? API-Qualitaet? §25a-Unterstuetzung getestet? | Robin + Frank | Phase 2 |
| 3 | **Marketplace Fee-Modell:** 10% Provision oder Membership-Fee? Kaeufer-Aufschlag ja/nein? | Frank + Robin | Phase 6 (Marketplace), aber Architektur beeinflusst |
| 4 | **Kommissionsprovision Standard-Satz:** 20%? 25%? 30%? Pro Kommissionsgeber verhandelbar? | Frank | Phase 5 |
| 5 | **Versandkosten bei Teilretoure:** Anteilig erstatten oder gar nicht? | Frank | AGB-Text, Phase 3 |
| 6 | **Mischwarenkoerbe:** Darf ein Kaeufer §25a-Ware und Regelbesteuerungs-Ware in einem Checkout kaufen? Wenn ja: separate Rechnungen. | StB + Robin | Phase 2 |

### Sollte entschieden werden (nicht blockierend, aber relevant)

| # | Entscheidung | Entscheider | Auswirkung auf |
|---|-------------|-------------|----------------|
| 7 | **Konvolut-Einkauf Aufteilungsmethode:** Gleichmaessig oder gewichtet? | Steuerberater | Wareneingang-Formular |
| 8 | **Lagerort-Granularitaet:** Freitext oder vordefinierte Standorte? | Frank | Admin-UI Wareneingang |
| 9 | **Abrechnungszyklus Kommission:** Monatlich oder nach Block-Ende? | Frank | Phase 5 |
| 10 | **Sendcloud Carrier-Auswahl:** Nur DHL? Oder auch DPD, Hermes, GLS? | Frank | Sendcloud-Konfiguration |
| 11 | **Staging-Umgebung:** Eigene Supabase-DB oder separates Schema? | Robin | Phase 0 |
| 12 | **Marketplace-Zeitplan:** Wann soll der Marketplace operativ aktiviert werden? Bevor Eigenware-Modell (C) live ist? Nachher? | Frank + Robin | Gesamtplanung |
| 13 | **GmbH-Gruendung fuer Marketplace?** Separate GmbH (Haftungsisolierung §25e) oder bestehendes Unternehmen? | Frank + Anwalt | Vor Marketplace-Aktivierung |

---

## 12. Anhang

### Anhang A: Sendcloud Feature-Vergleich

| Feature | Free | Growth (59 EUR/M) | Premium (individuell) |
|---------|------|-------------------|----------------------|
| Labels pro Monat | Unlimitiert | Unlimitiert | Unlimitiert |
| Carrier | 6+ | 25+ | 100+ |
| Tracking-Benachrichtigungen | Ja | Ja + Branded | Ja + Branded + Custom |
| Return Portal | Nein | Ja | Ja |
| Adressvalidierung | Nein | Ja | Ja |
| API-Zugang | Ja | Ja | Ja |
| Batch-Labels | Ja (100) | Ja (1000) | Ja (unlimitiert) |
| Carrier-Ratenvergleich | Nein | Ja | Ja |
| Zollformulare CN22/CN23 | Ja | Ja | Ja |
| Sendcloud Checkout | Nein | Ja | Ja |
| SLA Support | Community | 24h | 4h |

**Empfehlung:** Start mit Free (ausreichend fuer < 50 Labels/Tag). Upgrade auf Growth wenn Carrier-Ratenvergleich und Return Portal benoetigt werden.

### Anhang B: sevDesk vs. easybill Vergleich

| Feature | sevDesk (Buchhaltung, 17,90/M) | easybill (Plus, 14/M) |
|---------|-------------------------------|----------------------|
| GoBD-Konformitaet | Ja (zertifiziert) | Ja (zertifiziert) |
| DATEV-Export | Ja (Buchungsstapel) | Ja (Datenservice direkt) |
| §25a Differenzbesteuerung | Manuell konfigurierbar (Steuerposition) | Manuell konfigurierbar |
| EU-USt/OSS | Ja | Ja + OSS-Monitoring |
| E-Rechnung (XRechnung/ZUGFeRD) | Ja | Ja |
| API Rate Limit | 2 Req/Sek | Hoeher (dual API) |
| API-Dokumentation | Gut | Sehr gut |
| Automatische Bankanbindung | Ja | Ja |
| Gutschriften / Stornos | Ja | Ja |
| Anzahl Kunden/Rechnungen | Unlimitiert | Unlimitiert |
| Preis (relevanter Tarif) | 17,90 EUR/Monat | 14 EUR/Monat |

**Empfehlung:** easybill, wenn kein bestehender sevDesk-Account. Staerkeres API, direkter DATEV-Datenservice, marginaler Preisvorteil. Beide unterstuetzen §25a nur manuell — das Setup muss in beiden Faellen sauber konfiguriert werden.

### Anhang C: Medusa-native vs. Custom — Ehrliche Bestandsaufnahme

| Medusa Feature | Genutzt? | Begruendung |
|---|---|---|
| Auth (Login/Register/Session) | Ja | Session/Bearer Tokens, Password Reset |
| Admin UI Shell | Ja | Icons, Layout, Routing fuer Custom Pages |
| ORM + DB Layer | Ja | model.define(), generateEntityId(), PG_CONNECTION |
| Notification (Resend) | Ja | Email-Provider in medusa-config.ts |
| Customer | Teilweise | Auth ja, CRM komplett custom |
| Order | Nein | Custom `transaction` (Auktions-Workflow) |
| Product | Nein | Custom `Release` (Legacy-Daten) |
| Fulfillment | Nein | Custom shipping.ts, wird durch Sendcloud ersetzt |
| Inventory | Nein | Wird durch `inventory_item` ersetzt |
| Payment | Teilweise | Stripe/PayPal direkt, nicht ueber Medusa Payment Module |
| Cart | Nein | Custom `cart_item` |

**Fazit:** VOD Auctions nutzt ~15% von Medusa (Auth, Admin-Shell, ORM, Notifications). Der Rest ist custom. Das ist kein Problem — Medusa als Framework ist dafuer designed. Aber es bedeutet: ERP-Module werden ebenfalls custom gebaut, nicht als Medusa-Plugins.

### Anhang D: Existierende Medusa-Plugins (Relevanz-Pruefung)

| Plugin | Beschreibung | Nutzbar? | Begruendung |
|--------|-------------|----------|-------------|
| medusa-fulfillment-sendcloud | Sendcloud als Fulfillment Provider | Bedingt | Setzt auf Medusa Fulfillment Module auf, das wir nicht nutzen. Besser: Eigener Sendcloud-Client |
| medusa-payment-stripe | Stripe Payment Provider | Nein (bereits custom) | Wir nutzen Stripe direkt (custom checkout) |
| medusa-plugin-economic | Buchhaltungs-Integration | Nein | Fuer e-conomic, nicht sevDesk/easybill |
| medusa-plugin-sendgrid | E-Mail via SendGrid | Nein | Wir nutzen Resend |
| medusa-plugin-segment | Analytics | Nein | Wir nutzen RudderStack |

**Fazit:** Keine relevanten Plugins fuer den ERP-Use-Case. Custom-Entwicklung ist der richtige Weg.

### Anhang E: Konkreter End-to-End-Workflow (Beispiel)

**Szenario:** Kaeufer kauft 2 Artikel in einem Checkout. Artikel 1 ist aus Franks Sammlung (§25a), Artikel 2 ist Kommissionsware von Kommissionsgeber "Max Mustermann" (§25a, EK = 15 EUR).

**Schritt 1: Checkout und Payment**
```
Kaeufer legt in Warenkorb:
  - Artikel 1: Throbbing Gristle - D.O.A. (LP), 49 EUR [Frank, §25a, EK=0]
  - Artikel 2: SPK - Leichenschrei (LP), 65 EUR [Kommission Max, §25a, EK=15]
  - Versand: DHL Paket DE, 5,49 EUR

Checkout: Adresse eingeben → Versandmethode → Stripe Payment Element
Kaeufer zahlt 119,49 EUR via Kreditkarte
```

**Schritt 2: Payment-Success Webhook**
```
Stripe webhook: payment_intent.succeeded
→ transaction 1: { release_id: TG, amount: 49.00, item_type: 'direct_purchase', order_group_id: 'grp_xyz' }
→ transaction 2: { release_id: SPK, amount: 65.00, item_type: 'direct_purchase', order_group_id: 'grp_xyz' }
→ transaction 1 oder 2 traegt shipping_cost: 5.49
→ Beide: status = 'paid', order_number = 'VOD-ORD-000042'
```

**Schritt 3: Automatische Rechnungserstellung (Feature Flag ERP_INVOICING = true)**
```
System erkennt: Beide Artikel sind §25a → eine §25a-Rechnung

sevDesk API Call:
POST /api/v1/Invoice
{
  "contact": { "name": "Max Meier", "address": "..." },
  "invoiceNumber": "VOD-INV-2026-00042",
  "taxType": "margin",  // §25a
  "invoicePositions": [
    { "name": "Throbbing Gristle - D.O.A. (LP)", "unitPrice": 49.00, "taxRate": 0 },
    { "name": "SPK - Leichenschrei (LP)", "unitPrice": 65.00, "taxRate": 0 },
    { "name": "Versand DHL Paket", "unitPrice": 5.49, "taxRate": 0 }
  ],
  "footNote": "Differenzbesteuerung gemaess §25a UStG. Im Rechnungsbetrag ist die Umsatzsteuer enthalten."
}

→ invoice Datensatz: { external_id: 'sv_123', external_number: 'VOD-INV-2026-00042', total_gross: 119.49, tax_scheme: 'margin_scheme_25a' }
```

**Schritt 4: Automatische Bestandsaenderung (Feature Flag ERP_INVENTORY = true)**
```
inventory_item (TG):
  status: 'in_stock' → 'sold'
  inventory_movement: { type: 'sale', quantity_change: -1, transaction_id: 'txn_1' }

inventory_item (SPK):
  status: 'in_stock' → 'sold'
  inventory_movement: { type: 'sale', quantity_change: -1, transaction_id: 'txn_2' }
```

**Schritt 5: Automatisches §25a-Tracking (Feature Flag ERP_TAX_25A = true)**
```
tax_margin_record (TG):
  purchase_price: 0, sale_price: 49.00
  margin: 49.00, vat_on_margin: 7.82 (19/119 * 49)
  source: 'frank_collection'

tax_margin_record (SPK):
  purchase_price: 15.00, sale_price: 65.00
  margin: 50.00, vat_on_margin: 7.98 (19/119 * 50)
  source: 'commission', commission_owner_id: 'max_001'
```

**Schritt 6: Admin erstellt Versandlabel**
```
Admin: /app/erp/shipping → "Create Label" fuer Order VOD-ORD-000042

Sendcloud API Call:
POST /api/v2/parcels
{
  "name": "Max Meier", "address": "...",
  "weight": 0.7,  // 2 LPs ~ 350g + Verpackung
  "order_number": "VOD-ORD-000042",
  "shipment": { "id": 8 }  // DHL Paket
}

→ shipping_event: { event_type: 'label_created', carrier: 'dhl', tracking_number: '00340434...' }
→ transaction.tracking_number = '00340434...'
→ transaction.fulfillment_status = 'packing'
→ E-Mail an Kaeufer: "Deine Bestellung wurde versendet. Tracking: ..."
```

**Schritt 7: Zustellung**
```
Sendcloud Webhook: parcel status = 'delivered'
→ shipping_event: { event_type: 'delivered' }
→ transaction.fulfillment_status = 'delivered'
```

**Schritt 8: Monatsende — Kommissionsabrechnung**
```
Admin: /app/erp/commission → "Abrechnung erstellen" fuer Max Mustermann, April 2026

System sammelt: 1 verkaufter Artikel (SPK - Leichenschrei)

commission_settlement:
  owner_id: 'max_001', period: 01.04.-30.04.2026
  items_sold: 1, gross_revenue: 65.00
  commission_amount: 16.25 (25% Provision)
  payout_amount: 48.75

settlement_line:
  sale_price: 65.00, purchase_price: 15.00
  commission_rate: 25.00, commission_amount: 16.25, payout_amount: 48.75
  tax_scheme: 'margin_scheme_25a', margin: 50.00, vat_on_margin: 7.98

Admin prueft → Approve → Ueberweisung 48.75 EUR an Max → Mark as Paid
```

**Schritt 9: DATEV-Export April 2026**
```
Admin: /app/erp/finance → "DATEV Export April 2026"

Buchungsstapel enthaelt:
1. TG-Verkauf:    S: 1200 Bank 49.00 | H: 8409 Erloese §25a 41.18 | H: 1775 USt §25a 7.82
2. SPK-Verkauf:   S: 1200 Bank 65.00 | H: 8409 Erloese §25a 57.02 | H: 1775 USt §25a 7.98
3. Versand:       S: 1200 Bank 5.49  | H: 8400 Erloese 19% 4.61  | H: 1776 USt 19% 0.88
4. Kommission:    S: 8519 Prov.erl. 16.25 | H: 3300 Verbindl. 48.75 | S: ... (vereinfacht)

CSV-Download: datev_2026_04.csv
```

### Anhang F: Pruefpunkte fuer Steuerberater-Termin

Folgende Fragen muessen im Steuerberater-Termin geklaert werden. Diese Liste kann direkt als Agenda verwendet werden.

**Block 1: §25a Grundlagen (15 min)**
1. Ist Franks Sammlung (~41.500 Tontraeger, ueber Jahrzehnte gesammelt) komplett unter §25a fuehrbar?
2. Wird Frank als Privatperson oder als gewerblicher Haendler eingestuft? Welche formalen Konsequenzen hat das?
3. Kann bei Einkaufspreis = 0 (Privatsammlung, keine Belege) die volle Verkaufssumme als Marge angesetzt werden?
4. Einzeldifferenz (§25a Abs. 3) oder Sammelberechnung (§25a Abs. 4)? Was empfehlen Sie fuer Tontraeger?
5. Bei Sammelberechnung: Gilt die 500-EUR-Grenze pro Einzelstueck auch bei Schallplatten die > 500 EUR erzielen?

**Block 2: Kommission (10 min)**
6. Kommissionsware von Privatpersonen: §25a auf den Aussenumsatz anwendbar?
7. Wie muss der "Einkaufspreis" bei Kommission dokumentiert werden? Reicht das Uebernahmeprotokoll?
8. Bei Konvolut-Uebernahme (z.B. 200 Platten fuer 500 EUR): Welche Aufteilungsmethode akzeptiert das Finanzamt?
9. Provisionsabrechnung: Gutschrift-Format korrekt? Braucht der Kommittent eine Steuernummer?

**Block 3: Rechnungen und Konten (15 min)**
10. Rechnungsformulierung bei §25a: Ist "Differenzbesteuerung gemaess §25a UStG. Im Rechnungsbetrag ist die Umsatzsteuer enthalten." ausreichend?
11. Mischwarenkorb (§25a + Regelbesteuerung in einem Checkout): Separate Rechnungen oder eine mit getrennten Bloecken?
12. Kontenplan: SKR03 oder SKR04? Vorgeschlagene Konten (siehe Abschnitt 3.8) bestaetigen
13. BU-Schluessel 12 fuer §25a im DATEV-Export korrekt?
14. Sind die vorgeschlagenen Buchungssaetze (Abschnitt 3.8) korrekt?

**Block 4: EU und OSS (10 min)**
15. OSS-Registrierung: Ab welchem EU-Umsatz empfehlenswert?
16. §25a + EU-Versand: Steuersatz des Bestimmungslandes auf die Marge?
17. Schweiz-Versand: Steuerfreie Ausfuhr, Nachweis-Pflichten?

**Block 5: Sonstiges (10 min)**
18. Negative Marge: Bestaetigung, dass kein Vorsteuerabzug und keine Verrechnung moeglich
19. DATEV-Datenservice (easybill) vs. Buchungsstapel-Export: Praeferenz?
20. Zeitplan: Was muss VOR dem ersten Verkauf stehen? Was kann nachgeholt werden?

### Anhang G: Glossar

| Begriff | Erklaerung |
|---------|------------|
| §25a UStG | Differenzbesteuerung / Margenbesteuerung fuer Gebrauchtgegenstaende |
| §22f UStG | Aufzeichnungspflichten fuer Marketplace-Betreiber |
| §25e UStG | Gesamtschuldnerische Haftung des Marketplace-Betreibers fuer Seller-USt |
| DAC7 | EU-Richtlinie: Meldepflicht fuer Plattformbetreiber an Steuerbehoerden |
| F22-Bescheinigung | Bescheinigung des Finanzamts, dass Seller steuerlich erfasst ist (Safe Harbor fuer §25e) |
| GoBD | Grundsaetze zur ordnungsmaessigen Fuehrung und Aufbewahrung von Buechern (BMF) |
| OSS | One-Stop-Shop: Vereinfachte USt-Meldung fuer EU-weite B2C-Verkaeufe |
| SKR03 | Standardkontenrahmen 03 (verbreitet im Einzelhandel) |
| DATEV | Datenverarbeitungs-Genossenschaft, Standard-Schnittstelle zur Steuerberatung |
| Kommittent | Auftraggeber im Kommissionsgeschaeft (gibt Ware zur Vermarktung) |
| Kommissionaer | Beauftragter im Kommissionsgeschaeft (verkauft im eigenen Namen fuer fremde Rechnung) |
| ZAG | Zahlungsdiensteaufsichtsgesetz — reguliert Zahlungsinstitute in DE |
| Sendcloud | SaaS fuer Versandautomation (Label, Tracking, Returns) |
| sevDesk | Cloud-Buchhaltungssoftware (DE) |
| easybill | Cloud-Rechnungssoftware mit starkem E-Commerce-Fokus (DE) |

---

*Dieses Dokument ist eine Entscheidungsvorlage. Es ersetzt keine steuerliche oder rechtliche Beratung. Alle steuerlichen Aussagen muessen vom Steuerberater validiert werden.*
