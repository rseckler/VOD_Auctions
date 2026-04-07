# ERP / Warenwirtschaft — Architektur- und Entscheidungsdokument

**Version:** 5.0
**Erstellt:** 2026-04-02 | **Aktualisiert:** 2026-04-05
**Autor:** Robin Seckler (digital spread UG)
**Betreiber:** VOD Records, Friedrichshafen (Frank Bull)
**Status:** Entscheidungsvorlage + teilweise umgesetzt — **Infrastructure-Layer (Abschnitte 8 + 9) ist LIVE seit 2026-04-05**. Domain-Layer wartet weiterhin auf fachliche Freigaben aus Abschnitt 14. Siehe **Teil E: Umsetzungsstand 2026-04-05**.

## Versionshistorie

| Version | Datum | Änderungen |
|---------|-------|------------|
| **5.0** | **2026-04-05** | **Infrastructure-Layer umgesetzt:** Feature-Flag-System live (6 ERP-Flags, alle default `false`), Deployment-Methodology als verbindliches Governance-Doc, Staging-DB provisioniert (Supabase Free in `backfire`-Account, Schema 1:1 von Production), Trial-Flag `EXPERIMENTAL_SKIP_BID_CONFIRMATION` End-to-End validiert. Status-Marker an §8.2, §8.3, §8.4, §8.5, §9.1. Teil C aktualisiert (technische Punkte abgehakt). Teil D um Status-Spalte erweitert. **Neuer Teil E** mit vollständigem Implementation-Delta (16-Zeilen-Status-Tabelle, "was wurde nicht umgesetzt und warum", Infrastructure-Invarianten, Next-Step-Empfehlungen, Commit-Liste). Inhaltliche Kapitel 1-7 und 10-13 sowie alle Anhänge sind unverändert — sie beschreiben den Domain-Layer, der weiterhin auf fachliche Freigaben wartet. |
| 4.2 | 2026-04-04 | Formale Bereinigung Abschnitt 13, steuerlich-rechtliche Marker ergänzt, Empfehlung präzisiert. |
| 4.1 | 2026-04-03 | Struktur-Rewrite, Geschäftsmodell-Matrix, Aktivierungs-Matrix. |
| 4.0 | 2026-04-02 | Erste Fassung. |

---

## Inhaltsverzeichnis

1. [Executive Summary](#1-executive-summary)
2. [Ausgangslage und Zielbild](#2-ausgangslage-und-zielbild)
3. [Geschäftsmodell-Matrix](#3-geschäftsmodell-matrix)
4. [Prozesslandkarte](#4-prozesslandkarte)
5. [Fachlogik für Bestand, Verkauf, Settlement und Buchhaltung](#5-fachlogik-für-bestand-verkauf-settlement-und-buchhaltung)
6. [Steuerlogik und Validierungsbedarfe](#6-steuerlogik-und-validierungsbedarfe)
7. [Zielarchitektur und Systemprinzipien](#7-zielarchitektur-und-systemprinzipien)
8. [Release-fähige Architektur für Live-System und Next Release](#8-release-fähige-architektur-für-live-system-und-next-release)
9. [Modulare Komponentenübernahme und Aktivierungslogik](#9-modulare-komponentenübernahme-und-aktivierungslogik)
10. [Datenmodell / Kernobjekte](#10-datenmodell--kernobjekte)
11. [Architekturentscheidung / Bewertungsmatrix](#11-architekturentscheidung--bewertungsmatrix)
12. [Risiken, Sonderfälle und offene Punkte](#12-risiken-sonderfälle-und-offene-punkte)
13. [Klare Empfehlung](#13-klare-empfehlung)
14. [Offene fachliche Entscheidungen und Validierungsbedarfe](#14-offene-fachliche-entscheidungen-und-validierungsbedarfe)
A. [Anhänge](#anhänge)
B. [Teil B — Durchgeführte Final Touches (v4.1 → v4.2)](#teil-b--durchgeführte-final-touches-v41--v42)
C. [Teil C — Verbleibende offene Punkte vor finaler Freigabe](#teil-c--verbleibende-offene-punkte-vor-finaler-freigabe)
D. [Teil D — Freigabebedingungen](#teil-d--freigabebedingungen)
E. [Teil E — Umsetzungsstand 2026-04-05 (Delta v4.2 → v5.0)](#teil-e--umsetzungsstand-2026-04-05-delta-v42--v50)

---

## 1. Executive Summary

### Kurzfassung

VOD Auctions betreibt eine Auktions- und Direktverkaufsplattform für ~41.500 Tonträger (Industrial Music, Literatur, Merchandise) auf Medusa.js 2.x. Die Plattform ist als Verkaufskanal funktionsfähig, aber als Geschäftsbetrieb unvollständig: Es fehlen GoBD-konforme Rechnungsstellung, Differenzbesteuerung (§25a UStG), artikelgenaue Bestandsführung, automatisierter Versand, Kommissionsabrechnung und DATEV-Export.

Dieses Dokument beschreibt die Architektur für ein modulares ERP-System als Erweiterung des bestehenden Medusa-Admin. Es wird für das nächste Major Release konzipiert und betrachtet vier Geschäftsmodelle von Anfang an: Franks Sammlung (Eigenbestand), Kommissionsverkauf, B2C Marketplace und VOD Records Eigenware.

### Empfohlene Richtung

**Composable Stack** (Option A): Sendcloud + sevDesk/easybill + Custom-Module im Admin. Kein vollständiges ERP-Produkt (Billbee/Xentral), da keines der Produkte am Markt die Kombination aus Auktionslogik, §25a-Differenzbesteuerung, Kommissionsabrechnung und Marketplace-Payout abbilden kann. Die Eigenentwicklung beschränkt sich auf die Teile, die kein SaaS-Produkt liefert; Rechnungen, Versand und DATEV werden an spezialisierte Dienste delegiert.

**Voraussetzung für die Implementierung:** Diese Empfehlung steht unter dem Vorbehalt, dass die in Abschnitt 14 gelisteten offenen Punkte geklärt werden — insbesondere die steuerliche Validierung durch den Steuerberater und die fachlichen Entscheidungen durch Frank Bull. Ohne diese Klärungen darf die Implementierung nicht beginnen.

### Tragende Prinzipien

1. **Marketplace wird strukturell von Tag 1 mitgedacht** — Tabellen, Fremdschlüssel und Datenflüsse sind darauf vorbereitet. Operative Aktivierung folgt separat.
2. **Dieses Konzept ist für das nächste Major Release** — nicht für eine ferne Zukunftsvision.
3. **Das Live-System darf nicht gestört werden** — kein laufender Betrieb wird durch ERP-Entwicklung beeinträchtigt.
4. **Parallele Entwicklung muss möglich sein** — Bug-Fixes und kleine Verbesserungen am Live-System laufen unabhängig vom ERP-Release.
5. **Einzelne Komponenten müssen unabhängig deploybar und aktivierbar sein** — Sendcloud geht live, bevor Kommissionsabrechnung fertig ist.

### Wichtigste offene Punkte

| Thema | Risiko | Abhängigkeit |
|-------|--------|--------------|
| §25a-Konfiguration | Falsche Steuerbehandlung = Nachzahlung + Zinsen | Steuerberater muss Setup validieren |
| Kommissionsvertrag | Ohne Vertragsvorlage keine Kommissionsabrechnung | Rechtsanwalt oder Steuerberater |
| Sendcloud-Account | Ohne DHL-Geschäftskundennummer kein Versand | DHL-Antrag (2-4 Wochen) |
| sevDesk/easybill §25a | Manuell konfigurierbar, aber nicht "out of the box" | Test mit echten Rechnungen vor Go-Live |
| Parallelbetrieb | Mischzustand alte/neue Logik bei schrittweiser Aktivierung | Feature-Flag-Disziplin |
| Marketplace Payment | Stripe Connect erfordert Plattform-Verifizierung | Stripe Connect Application |

---

## 2. Ausgangslage und Zielbild

### 2.1 Was das aktuelle System leistet

Die Plattform läuft auf Medusa.js 2.x mit einem Custom-Auktionsmodul. Folgende Fähigkeiten sind vorhanden und stabil:

- **Auktionslogik:** Themen-Blöcke mit Lots, Anti-Sniping, Gebotsabgabe, Gewinner-Ermittlung
- **Direktverkauf:** Warenkorb, One-Page-Checkout, Stripe + PayPal Payment
- **Order-Management:** `transaction`-Tabelle mit Status-Lifecycle (pending → paid → shipped → delivered), `order_group_id` für Combined Orders, Fulfillment-Status-Tracking
- **Versand:** Manueller Prozess — Admin markiert als shipped, trägt Tracking-Nummer ein, bestehende Versandkosten-Logik (gewichtsbasiert, 3 Zonen, 13 Artikeltypen)
- **Rechnungen:** PDF-Erzeugung via pdfkit (Bestell-Übersicht), aber keine GoBD-konforme Rechnung
- **Katalog:** ~41.500 Releases mit Bildern, Formatdaten, Preisinformationen, Entity-Content (Bands, Labels, Press)
- **CRM:** Kundenverwaltung mit Stats, Notizen, Audit-Log, VIP-Erkennung
- **E-Mail:** 6 transaktionale Mails via Resend, Newsletter via Brevo
- **Platform-Mode-System:** beta_test → pre_launch → preview → live, mit Invite-Token-Flow

### 2.2 Was fehlt (operative Lücken)

| Bereich | Ist-Zustand | Auswirkung |
|---------|------------|------------|
| **Rechnungsstellung** | PDF-Quittung ohne GoBD-Pflichtangaben, keine fortlaufende Nummerierung, kein Archiv | Nicht geschäftsfähig — jede Verkaufsrechnung ist formal ungültig |
| **Steuerliche Korrektheit** | Keine §25a-Differenzbesteuerung, obwohl der überwiegende Teil der Ware gebraucht ist und von Privatperson stammt | Bei EK=0 ist der Steuervorteil von §25a gering (~1,3%), wird aber bei Kommissionsware mit EK>0 erheblich. Ohne §25a-Konfiguration fehlt zudem die gesetzlich vorgeschriebene Aufzeichnungspflicht |
| **Bestandsführung** | Nur `legacy_available`-Flag (boolean). Kein Bestandsmodell mit Quelle, Eigentum, Einkaufspreis, Lagerort | Unmöglich: Kommissionsabrechnung, §25a-Nachweis, Inventur, Bestandswert-Ermittlung |
| **Versand** | Manueller Prozess: Admin druckt Paketschein bei DHL/Post, tippt Tracking-Nummer ab | Skaliert nicht über 5-10 Orders/Tag, fehleranfällig, kein automatisches Tracking |
| **Buchhaltung** | Kein DATEV-Export, keine Trennung der Erlösarten, keine automatisierte Buchungslogik | Steuerberater muss manuell buchen — teuer, langsam, fehleranfällig |
| **Kommission** | Keine Datenstruktur für Kommissionsgeber, keine Abrechnung, keine Settlement-Logik | Kann keine Drittware annehmen — Geschäftsmodell A nicht aktivierbar |
| **Marketplace** | Keine Seller-Tabelle, kein Split-Payment, kein Listing-Modell | Geschäftsmodell B nicht einmal strukturell vorbereitet |

### 2.3 Zielbild (Soll-Zustand nach Next Release)

Das System muss nach dem nächsten Major Release folgende Fähigkeiten besitzen:

1. **GoBD-konforme Rechnungsstellung** mit automatischer Erzeugung nach Payment-Success, §25a-Unterstützung und fortlaufender Nummerierung (via sevDesk oder easybill)
2. **Artikelgenaue Bestandsführung** mit Quellenzuordnung (Franks Sammlung / Kommission / Eigenware), Einkaufspreiserfassung, Zustandsdokumentation und Bewegungshistorie
3. **Automatisierter Versand** mit Label-Generierung, Carrier-Auswahl, Tracking-Integration und Batch-Verarbeitung (via Sendcloud)
4. **Kommissionsabrechnung** mit zeilengenauem Settlement, Provisionsberechnung, Gutschrift-Erzeugung und Auszahlungs-Workflow
5. **§25a-Differenzbesteuerung** mit artikelgenauer Margen-Aufzeichnung (gesetzliche Pflicht), automatischer Steuerberechnung und Mischwarenkorb-Handling
6. **DATEV-Export** mit korrekter Trennung der Steuer- und Erlösarten, monatlicher Stapelexport
7. **Strukturelle Marketplace-Fähigkeit** — Seller-Tabelle, seller_id auf relevanten Entities, Stripe Connect Application registriert. Operative Aktivierung ist ein separater Schritt, aber die Architektur erfordert keinen Umbau

### 2.4 Timeline-Kontext

- **Aktuell:** Beta-Test-Phase, Pre-Launch-Vorbereitung (Platform Mode: `beta_test`)
- **Nächster Meilenstein:** RSE-77 (Testlauf — 1 Block mit 10-20 Produkten)
- **ERP-Entwicklung:** Parallel zum laufenden Betrieb, ~11 Wochen geschätzt
- **Constraint:** Jeder Commit auf `main` muss das Live-System stabil halten. ERP-Entwicklung läuft auf separaten Feature-Branches und wird erst nach Staging-Test auf `main` gemergt

### 2.5 Betroffene Stakeholder

| Stakeholder | Rolle | Betroffenheit |
|-------------|-------|---------------|
| Frank Bull | Betreiber, Lager, Versand | Tägliche Arbeit mit ERP-Modul (Versand, Bestand, Rechnungen) |
| Steuerberater | Externe Validierung | Muss §25a-Setup, Kontenplan, Buchungslogik freigeben |
| Käufer | Endkunden | Erhalten GoBD-konforme Rechnungen, besseres Tracking |
| Kommissionsgeber (künftig) | Dritte, die Ware einliefern | Erhalten periodische Abrechnungen |
| Seller (künftig) | Marketplace-Teilnehmer | Eigenes Listing, eigener Versand, Stripe Connect Payout |

---

## 3. Geschäftsmodell-Matrix

Die Plattform bedient vier grundlegend verschiedene Geschäftsmodelle. Jedes Modell hat eigene Eigentumsverhältnisse, Steuerregeln, Zahlungsflüsse und Buchhaltungsanforderungen. Sie sind keine Varianten eines Modells, sondern eigenständige operative Prozesslogiken.

### Modell 0: Franks Sammlung (Bestand und Auktionen)

**Das heutige Kerngeschäft.** Frank Bull verkauft seine private Sammlung von ~41.500 Tonträgern über die Plattform.

| Dimension | Ausprägung |
|-----------|------------|
| **Eigentum** | Frank Bull (Privatperson) |
| **Lager** | VOD-Lager, Friedrichshafen |
| **Versand** | VOD |
| **Rechnung** | VOD Records an Käufer |
| **Verkäuferrolle** | VOD Records = Verkäufer (Frank als Gesellschafter/Inhaber) |
| **Zahlungsfluss** | Käufer → Stripe/PayPal → VOD-Konto |
| **Steuer** | §25a möglich [Validierungsbedarf]: Privatsammlung, kein Vorsteuerabzug beim Erwerb |
| **Buchhaltung** | Erlöse auf Erlös-Konto §25a; Marge = Verkaufspreis (da EK = 0 [Fachliche Zielannahme — steuerliche Validierung erforderlich]); USt = 19/119 * Marge |
| **Bestandsführung** | Qty = 1 pro Artikel; Status: available → reserved → sold → shipped |

**Steuerliche Besonderheit — Fachliche Zielannahme, steuerliche Validierung durch Steuerberater erforderlich:**

Bei Franks Sammlung ist der Einkaufspreis typischerweise nicht mehr nachweisbar (über Jahrzehnte gesammelt). **[Validierungsbedarf]** Sofern der Steuerberater bestätigt, dass das Finanzamt EK = 0 akzeptiert, bedeutet dies: die volle Verkaufssumme ist die Marge, und die USt wird auf diese Marge berechnet. Das klingt nach keinem Vorteil gegenüber Regelbesteuerung — der Vorteil liegt darin, dass bei §25a die Marge als Bruttobetrag gilt (USt = 19/119 * Marge statt 19/100 * Netto). **[Fachliche Zielannahme]** Der tatsächliche Steuervorteil bei EK = 0 ist gering (~1,3%), wird aber erheblich, sobald Ware mit nachweisbarem EK > 0 hinzukommt (Kommission, Zukäufe). Diese Annahme zum Vorteil muss durch den Steuerberater mit konkreten Zahlen bestätigt werden.

**Steuerberater-Validierung nötig:** Ob Franks gesamte Sammlung unter §25a fällt, hängt davon ab, ob Frank als Privatperson oder als gewerblicher Händler eingestuft wird. Bei ~41.500 Artikeln und regelmäßigen Auktionen ist eine gewerbliche Einstufung wahrscheinlich. Die §25a-Fähigkeit bleibt davon unberührt (auch gewerbliche Händler können §25a anwenden), aber die formalen Anforderungen ändern sich. **[Validierungsbedarf]**

### Modell A: Kommissionsverkauf

**Dritte liefern große Sammlungen an VOD. VOD lagert, verkauft und versendet — im eigenen Namen, für fremde Rechnung.**

| Dimension | Ausprägung |
|-----------|------------|
| **Eigentum** | Dritter (Kommissionsgeber). Eigentum geht erst bei Verkauf an Käufer über |
| **Lager** | VOD-Lager (eingelagert, physisch getrennt oder zumindest buchhalterisch zugeordnet) |
| **Versand** | VOD |
| **Rechnung** | VOD Records an Käufer (als Kommissionär, §383 HGB) |
| **Verkäuferrolle** | VOD = Kommissionär. Handelt im eigenen Namen, für Rechnung des Kommittenten |
| **Zahlungsfluss** | Käufer → Stripe/PayPal → VOD-Konto → periodische Abrechnung → Auszahlung an Kommissionsgeber |
| **Steuer** | §25a möglich [Validierungsbedarf] wenn Einkauf von Privatperson ohne USt-Ausweis. Bei gewerblichen Kommissionsgebern mit USt-Rechnung: Regelbesteuerung |
| **Buchhaltung** | Erlös = Verkaufspreis; Aufwand = Auszahlung an Kommittent; Differenz = Provision (VODs Ertrag). Separate Konten: Verbindlichkeiten gegenüber Kommittenten, Provisionserlös |
| **Bestandsführung** | Jeder Artikel muss dem Kommissionsgeber zugeordnet sein. EK pro Artikel erfassen (für §25a-Nachweis) |

**Kommissionsabrechnung:**
- VOD erstellt periodisch (monatlich oder nach Block-Ende) eine Abrechnung für jeden Kommissionsgeber
- Inhalt: Verkaufte Artikel, Verkaufspreise, VOD-Provision (%), Netto-Auszahlungsbetrag
- Die Abrechnung ist eine Gutschrift (im steuerlichen Sinne), keine Rechnung
- Auszahlung per Überweisung nach Freigabe

**Vertragliche Anforderung:** Kommissionsvertrag mit:
- Provisionssatz (Standard: 20-30% verhandelbar)
- Mindestverkaufspreis (wenn vereinbart)
- Laufzeit und Kündigungsfrist
- Versicherung der eingelagerten Ware
- Rückgabe unverkaufter Ware
- Haftung bei Beschädigung

### Modell B: B2C Marketplace

**Die Plattform öffnet sich für externe Seller. Seller listen, lagern und versenden selbst. VOD ist reiner Vermittler [Rechtlicher Validierungsbedarf — Einstufung als Vermittler vs. Verkäufer muss durch Rechtsanwalt bestätigt werden].**

| Dimension | Ausprägung |
|-----------|------------|
| **Eigentum** | Seller (bleibt durchgehend beim Seller) |
| **Lager** | Seller-Lager (VOD hat keinen physischen Kontakt mit der Ware) |
| **Versand** | Seller versendet direkt an Käufer |
| **Rechnung** | Seller an Käufer. VOD erstellt KEINE Verkaufsrechnung [Rechtlicher Validierungsbedarf] (VOD ist Vermittler, nicht Verkäufer — Einstufung vorausgesetzt) |
| **Verkäuferrolle** | Seller = Verkäufer. VOD = Plattformbetreiber/Vermittler [Rechtlicher Validierungsbedarf] |
| **Zahlungsfluss** | Käufer → Stripe Connect → Seller-Konto (abzgl. Plattform-Fee). VOD berührt das Geld nie |
| **Steuer** | VOD versteuert nur eigene Provisionseinnahmen (Dienstleistung, 19% USt). Seller ist für seine eigene USt verantwortlich. Kein §25a für VOD (VOD verkauft nicht). DAC7-Meldepflicht [Validierungsbedarf] |
| **Buchhaltung** | VODs Erlöse = Provisionseinnahmen (Dienstleistung). Kein Warenumsatz. Separate Buchung |
| **Bestandsführung** | Seller verwaltet eigenen Bestand. Plattform trackt nur Listing-Status (active/sold/removed) |

**Regulatorische Pflichten (Details in RSE-291) — [Validierungsbedarf] Alle regulatorischen Aussagen zum Marketplace müssen vor Implementierung durch einen Rechtsanwalt mit E-Commerce-Spezialisierung validiert werden:**
- **§22f UStG:** Aufzeichnungspflichten pro Seller (Name, Adresse, Steuer-ID, Transaktionen). 10 Jahre Aufbewahrung
- **§25e UStG:** Gesamtschuldnerische Haftung für Seller-USt. Safe Harbor nur mit F22-Bescheinigung
- **DAC7:** Jährliche Meldung an BZSt (bis 31. Januar). Pro Seller: TIN, IBAN, Umsätze, Gebühren
- **Verbraucherschutz:** Kennzeichnung privat vs. gewerblich, Widerrufsrecht bei gewerblichen Sellern
- **GPSR:** Kontaktstelle für Marktaufsicht benennen

**Fee-Modell (siehe RSE-291 für Marktvergleich):**
- Empfehlung: 10% Verkäuferprovision, 0% Käuferaufschlag, 0 Listing-Gebühr
- Alternative: Membership-Fee monatlich statt Transaktionskosten (Positionierung als "faire Alternative zu Discogs")
- Endgültige Entscheidung noch offen (siehe Abschnitt 14)

**Payment-Architektur:**
- Stripe Connect (Express): Seller erstellt Express-Account, KYC via Stripe. Bei Verkauf: Stripe splittet Payment automatisch. Payout an Seller nach Versandbestätigung
- Später Mangopay: Nativer Escrow, E-Wallet pro Seller, besser für hohe Volumina
- Eigenes Payout-System ist KEINE Option (BaFin-Lizenzpflicht, §10 ZAG)

### 3.5 Operatives Betriebsmodell Seller-/Marketplace-Modell

Dieser Abschnitt beschreibt die operativen Prozesse, die für den Betrieb eines Marketplace erforderlich sind. Die Architektur bereitet diese Prozesse strukturell vor; die operative Aktivierung ist ein separater Schritt.

#### 3.5.1 Seller-Onboarding

**Prozess: Bewerbung → Prüfung → Freigabe → KYC → Live**

1. **Bewerbung:** Seller füllt Formular aus (Name, Adresse, Beschreibung des Sortiments, geschätztes Volumen, privat/gewerblich)
2. **Vorprüfung (Admin):** Passt der Seller zum Plattform-Profil? (Industrial/Experimental Music Fokus). Kriterien: Sortiment-Relevanz, Seriosität, Mindestbestand
3. **Genehmigung:** Admin setzt `seller.status → 'approved'`. Seller erhält Einladungs-E-Mail
4. **KYC (Stripe Connect):** Seller durchläuft Stripe Express Onboarding. Identitätsprüfung, Bankverbindung, Steuer-ID
5. **Steuerliche Erfassung (§22f UStG):** Seller muss Steuer-ID/USt-IdNr. hinterlegen. Bei gewerblichen Sellern: F22-Bescheinigung hochladen. System prüft Gültigkeit
6. **Live:** `seller.status → 'active'`. Seller kann Listings erstellen

**Ablehnungsgründe:** Sortiment passt nicht, unvollständige Angaben, KYC gescheitert, F22 fehlt (bei gewerblich). Ablehnung mit Begründung, Seller kann erneut bewerben.

#### 3.5.2 KYC und Steuerliche Stammdaten

**Pflichtdaten pro Seller (§22f UStG, DAC7):**

| Datum | Privat | Gewerblich |
|-------|--------|------------|
| Name / Firma | Pflicht | Pflicht |
| Adresse | Pflicht | Pflicht |
| Geburtsdatum | Pflicht (DAC7) | — |
| Steuer-ID (TIN) | Pflicht (DAC7) | Pflicht |
| USt-IdNr. | — | Pflicht |
| F22-Bescheinigung | — | Pflicht (§25e Safe Harbor) |
| IBAN | Pflicht (DAC7) | Pflicht |
| Handelsregister-Nr. | — | Wenn vorhanden |

**Aufbewahrung:** 10 Jahre nach Ende der Geschäftsbeziehung (§22f Abs. 1 Satz 5 UStG).

**F22-Gültigkeitsprüfung:** F22-Bescheinigungen haben ein Ablaufdatum. System warnt 30 Tage vor Ablauf. Bei abgelaufener F22: Seller wird suspendiert bis Erneuerung vorliegt (§25e-Haftungsschutz entfällt sonst).

#### 3.5.3 Listing Governance

**Qualitätsstandards:**
- Mindestens 1 Foto (Pflicht), empfohlen 3-5
- Zustandsbewertung nach Goldmine-Standard (Pflicht)
- Beschreibung: Mindestlänge 50 Zeichen, Tracklisting empfohlen
- Preise in EUR, brutto
- Keine Duplikate (System prüft Release-ID wenn angegeben)

**Review-Prozess:**
- Listing wird eingereicht → `status = 'pending_review'`
- Admin prüft: Fotos akzeptabel? Zustand plausibel? Beschreibung ausreichend? Preis realistisch?
- Genehmigung → `status = 'active'` | Ablehnung → `status = 'rejected'` mit Begründung
- Phase 2+: Trusted Seller (> 50 Verkäufe, > 4.5 Sterne) erhalten Auto-Approve

#### 3.5.4 Versand-Verantwortung und SLAs

| Verantwortung | Plattform (VOD) | Seller |
|---------------|-----------------|--------|
| Label-Erstellung | — | Seller (eigener Carrier) |
| Versand innerhalb X Tage nach Zahlung | — | 3 Werktage (SLA) |
| Tracking-Nummer eintragen | System validiert | Seller (Pflicht) |
| Versandkosten festlegen | — | Seller (pro Zone) |
| Verpackungsstandard | Richtlinie bereitstellen | Seller muss einhalten |

**SLA-Verstoß:** Wenn Seller Tracking nicht innerhalb von 5 Werktagen einträgt → automatische Warnung. Nach 7 Werktagen → Admin-Eskalation. Wiederholte Verstöße → Suspendierung.

#### 3.5.5 Kundensupport-Verantwortung

| Thema | Plattform (VOD) | Seller |
|-------|-----------------|--------|
| Plattform-Probleme (Login, Zahlung, Bugs) | VOD | — |
| Produktfragen (Zustand, Details) | — | Seller |
| Versandstatus / Tracking | Erste Anlaufstelle, leitet weiter | Seller klärt mit Carrier |
| Reklamation / Retoure | Mediation wenn nötig | Seller ist Erstansprechpartner |
| Widerrufsrecht (bei gewerbl. Seller) | Hinweis auf Pflicht | Seller muss einhalten |

**Kommunikationskanal:** In Phase 1 über E-Mail. Phase 2+: Plattform-internes Messaging zwischen Käufer und Seller.

#### 3.5.6 Retoure und Reklamation

**Grundregel:** Der Seller ist Verkäufer. Retoure-Abwicklung liegt beim Seller.

1. Käufer meldet Problem über Plattform-Kontaktformular
2. Plattform leitet an Seller weiter (oder Käufer kontaktiert Seller direkt)
3. Seller und Käufer einigen sich (Retoure, Teilerstattung, Ersatz)
4. Bei Einigung: Seller initiiert Erstattung via Stripe Connect Refund
5. Bei Nicht-Einigung: Käufer kann Dispute öffnen (siehe 3.5.7)

**Widerrufsrecht:** Gewerbliche Seller unterliegen dem 14-Tage-Widerrufsrecht. Private Seller nicht. Die Plattform muss den Seller-Typ klar kennzeichnen.

**Rücksendekosten:** Trägt der Käufer, sofern der Seller nicht anders entscheidet. Muss in Seller-AGB stehen.

#### 3.5.7 Disputes und Claims

**Käufer-Seller-Dispute (Phase 1: manuell, Phase 2+: formalisiert):**

1. Käufer öffnet Dispute (Ware nicht erhalten, falsche Ware, Zustand falsch beschrieben)
2. Admin prüft: Tracking vorhanden? Zustellung bestätigt? Fotos vom Käufer?
3. Admin vermittelt zwischen Käufer und Seller
4. Wenn keine Einigung: Admin entscheidet (zugunsten Käufer oder Seller)
5. Bei Entscheidung zugunsten Käufer: Erstattung aus Seller-Guthaben oder nächstem Payout

**Dispute-Fenster:** 14 Tage nach Zustellung (oder 30 Tage nach Versand wenn keine Zustellung bestätigt).

**Chargeback bei Marketplace:** Stripe Connect leitet Chargebacks an den Connected Account (Seller) weiter. Die Plattform stellt dem Seller die Chargeback-Gebühr in Rechnung. Muss im Seller-Vertrag stehen.

#### 3.5.8 Payout-Voraussetzungen

Payout an Seller wird erst freigegeben, wenn:
1. Tracking-Nummer eingetragen UND
2. Carrier bestätigt Zustellung (oder 14 Tage seit Versand ohne Dispute) UND
3. Kein offener Dispute für die Transaktion UND
4. Seller-Account ist `active` (nicht suspendiert)

**Payout-Zyklus:** Automatisch via Stripe Connect (T+14 nach Versandbestätigung, konfigurierbar).

**Einbehalt bei offenen Disputes:** Payout wird zurückgehalten bis Dispute geklärt.

#### 3.5.9 Seller-Suspendierung und Deaktivierung

**Suspendierungsgründe:**
- F22-Bescheinigung abgelaufen (automatisch)
- Wiederholte SLA-Verstöße (> 3 in 30 Tagen)
- Hohe Dispute-Rate (> 5% der Transaktionen)
- Verstoß gegen Listing-Richtlinien (nach Warnung)
- KYC-Daten ungültig geworden

**Suspendierung:** Seller kann keine neuen Listings erstellen. Bestehende Listings werden deaktiviert. Offene Payouts werden einbehalten bis Klärung. Seller wird per E-Mail informiert mit Begründung und Handlungsaufforderung.

**Deaktivierung (endgültig):** Nur bei schwerwiegenden Verstößen (Betrug, Fälschungen, wiederholte Suspendierung). Admin-Entscheidung. Offene Payouts werden nach Ablauf aller Dispute-Fenster ausgezahlt (sofern keine Claims).

#### 3.5.10 Rollenabgrenzung

| Verantwortung | Plattform (VOD) | Seller |
|---------------|-----------------|--------|
| Plattform-Betrieb, Verfügbarkeit | Ja | — |
| Payment-Abwicklung (Stripe Connect) | Ja | — |
| KYC / §22f-Aufzeichnungen | Ja | Daten liefern |
| DAC7-Meldung | Ja | — |
| F22-Prüfung | Ja (Erinnerung + Suspendierung) | Bescheinigung besorgen |
| Listing-Qualität | Review (Phase 1) | Erstellen |
| Produktbeschreibung / Fotos | — | Ja |
| Preisgestaltung | — | Ja |
| Versand | — | Ja |
| Kundensupport (Produkt) | Mediation | Ja |
| Retoure / Erstattung | Mediation | Ja |
| Dispute-Entscheidung | Ja (bei Eskalation) | — |
| Eigene Steuerpflichten | Nur Provision | Ja (eigene USt) |

### Modell C: VOD Records Eigenware

**VOD Records produziert oder kauft eigene Ware (Vinyl Reissues, Box Sets, Merchandise) und verkauft diese über die Plattform.**

| Dimension | Ausprägung |
|-----------|------------|
| **Eigentum** | VOD Records |
| **Lager** | VOD-Lager |
| **Versand** | VOD |
| **Rechnung** | VOD Records an Käufer |
| **Verkäuferrolle** | VOD Records = Verkäufer (Eigengeschäft) |
| **Zahlungsfluss** | Käufer → Stripe/PayPal → VOD-Konto |
| **Steuer** | Regelbesteuerung. Neuware, Einkauf mit Vorsteuerabzug → kein §25a |
| **Buchhaltung** | Wareneinsatz (EK) gegen Erlöse (VK). Vorsteuerabzug auf Einkaufsrechnungen. Standard-GuV |
| **Bestandsführung** | Qty > 1 möglich (z.B. 300 Stück einer Pressung). Bestandsabnahme bei Verkauf. Nachbestellung möglich |

**Besonderheit gegenüber Modell 0:**
- Neuware → kein §25a, Regelbesteuerung mit separatem USt-Ausweis
- Qty > 1 → erfordert echtes Bestandsmanagement (nicht nur Qty 1 wie bei Sammlung)
- Einkaufsrechnungen vorhanden → Vorsteuerabzug
- Nachbestellungen möglich → optional: Bestellwesen/Einkaufsmodul

### Zusammenfassung: Was jedes Modell vom System verlangt

| Anforderung | Mod. 0 | Mod. A | Mod. B | Mod. C |
|-------------|--------|--------|--------|--------|
| Bestandsführung (Qty 1) | Ja | Ja | Nein | — |
| Bestandsführung (Qty > 1) | Nein | Nein | Nein | Ja |
| Einkaufspreis pro Artikel | Optional | Pflicht | Nein | Pflicht |
| Quellenzuordnung (Eigentum) | Ja | Ja | Nein | Ja |
| Kommissionsabrechnung | Nein | Ja | Nein | Nein |
| Seller-Payout | Nein | Nein | Ja | Nein |
| §25a Differenzbesteuerung | Ja | Möglich | Nein | Nein |
| Regelbesteuerung | Nein | Möglich | Nur Provision | Ja |
| GoBD-Rechnung (VOD stellt aus) | Ja | Ja | Nein (nur Fee) | Ja |
| Seller-Rechnung (Dritter stellt aus) | Nein | Nein | Ja | Nein |
| Stripe Connect Split-Payment | Nein | Nein | Ja | Nein |
| DAC7-Meldepflicht | Nein | Nein | Ja | Nein |
| F22-Bescheinigung Seller | Nein | Nein | Ja (gewerbl.) | Nein |
| DATEV-Export | Ja | Ja | Ja (Provision) | Ja |
| Sendcloud Label | Ja | Ja | Nein (Seller) | Ja |

---

## 4. Prozesslandkarte

### 4.1 Gesamtübersicht

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                      WARENEINGANG                           │
                    │  Mod 0: Migration  │  Mod A: Übernahme  │  Mod C: Einkauf  │
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

### 4.2 Wareneingang und Einbuchung

Der Wareneingang unterscheidet sich fundamental je nach Modell.

**Modell 0 — Franks Sammlung:**
Kein klassischer Wareneingang. Die ~41.500 Artikel existieren bereits als `Release`-Datensätze (Legacy-Migration aus MySQL). Für die ERP-Erweiterung müssen diese Bestände einmalig in `inventory_item` überführt werden:
1. Migration: Für jede `Release` mit `legacy_available = true` einen `inventory_item`-Datensatz anlegen
2. Quelle: `source = 'frank_collection'`
3. Einkaufspreis: `purchase_price = 0` — **[Fachliche Zielannahme]** Privatsammlung, kein Nachweis. Ob EK = 0 steuerlich akzeptiert wird, muss der Steuerberater bestätigen
4. Status: `in_stock` (wenn `legacy_available = true`) oder `sold`/`unavailable` (wenn false)
5. Lagerort: Pauschal "VOD-Lager FN" oder, falls bekannt, Regal/Box

**Modell A — Kommissionsware:**
1. Kommissionsgeber liefert Ware an VOD-Lager (persönlich oder per Versand)
2. Admin erstellt Kommissionsgeber-Datensatz (wenn neu): Name, Adresse, Steuer-ID, Provisionssatz
3. Admin bucht Wareneingang:
   - Pro Artikel: Release zuordnen (oder neu anlegen), Zustand dokumentieren, Einkaufspreis eintragen
   - `inventory_item` mit `source = 'commission'`, `commission_owner_id`, `purchase_price`
   - `inventory_movement` mit `type = 'inbound'`, Referenz auf Lieferschein/Übernahmeprotokoll
4. Optionaler Sammeleingang: Konvolut mit pauschalem EK (z.B. 500 Artikel für 1.000 EUR → EK pro Stück = 2 EUR). **[Validierungsbedarf]** Pauschale Aufteilung muss dokumentiert werden — Steuerberater-Abstimmung zur akzeptierten Methode zwingend erforderlich
5. Quittung/Übernahmeprotokoll ausdrucken (für §25a-Nachweis: "Ware von Privatperson erworben, keine USt auf Eingangsrechnung")

**Modell B — Marketplace:**
Kein physischer Wareneingang bei VOD. Seller listet Artikel auf der Plattform:
1. Seller reicht Artikel ein (Fotos, Beschreibung, Zustand, Startpreis/Festpreis)
2. Admin reviewed und genehmigt (kuratiertes Modell)
3. Artikel wird als Listing aktiv — kein `inventory_item` bei VOD, sondern `seller_listing`
4. Bestand liegt beim Seller; Plattform trackt nur Listing-Status

**Modell C — VOD Records Eigenware:**
1. VOD bestellt Ware bei Lieferant/Presswerk (z.B. 300 Stück einer Reissue)
2. Einkaufsrechnung mit USt (Vorsteuerabzug)
3. Wareneingang buchen:
   - `inventory_item` mit `source = 'vod_records'`, `purchase_price` (aus Rechnung), `quantity = 300`
   - `inventory_movement` mit `type = 'inbound'`, Referenz auf Einkaufsrechnung
4. Lagerort zuweisen

### 4.3 Bestandsklassifikation

Jeder Bestandsposten muss folgende Dimensionen tragen:

| Dimension | Felder | Zweck |
|-----------|--------|-------|
| **Quelle** | `source`: frank_collection, commission, vod_records, marketplace | Bestimmt Eigentumsverhältnisse und Abrechnungslogik |
| **Steuerschema** | `tax_scheme`: margin_scheme_25a, standard, exempt | Bestimmt Rechnungsformat und DATEV-Buchung |
| **Zustand** | `condition`: mint, near_mint, very_good_plus, very_good, good_plus, good, fair, poor | Goldmine-Standard, relevant für Preisfindung |
| **Lagerort** | `warehouse_location`: Freitext (Regal A3, Box 17) | Picking-Optimierung |
| **Eigentum** | `commission_owner_id` (nullable) | Kommissionsgeber-Zuordnung |
| **EK** | `purchase_price` | §25a-Marge, GuV, Kommissionsabrechnung |
| **Bestandsstatus** | `status`: in_stock, reserved, in_auction, sold, shipped, returned | Logistik-Steuerung |

### 4.4 Verkauf und Order Management

**Auktion (Modell 0 und A, später auch B):**
1. Admin erstellt Auktionsblock, weist Lots zu (bestehender Workflow)
2. Gebote laufen ein, Anti-Sniping verlängert bei Spätgebot
3. Auktion endet → Höchstbietender gewinnt
4. System erstellt `transaction` mit `status = 'pending'`
5. Käufer erhält Zahlungsaufforderung (bestehender E-Mail-Workflow)
6. Käufer zahlt via Stripe/PayPal → Webhook → `status = 'paid'`
7. **NEU:** Nach Payment-Success → Rechnung erstellen (sevDesk/easybill API)
8. **NEU:** `inventory_item.status` → 'sold', `inventory_movement` → 'sale'

**Direktkauf (alle Modelle außer B):**
1. Käufer legt Artikel in Warenkorb (`cart_item`)
2. Checkout: Adresse → Versandmethode → Zahlung
3. Payment-Success → `transaction` erstellt → Rechnung erstellt
4. Bestandsabnahme

**Marketplace-Verkauf (Modell B):**
1. Käufer kauft Seller-Artikel (Auktion oder Festpreis)
2. Payment via Stripe Connect → Split: Seller-Anteil + Plattform-Fee
3. Seller erhält Benachrichtigung → versendet
4. Seller trägt Tracking-Nummer ein
5. Payout an Seller nach Versandbestätigung (oder 14-Tage Auto-Confirm)
6. VOD bucht nur die Fee als Erlös

**Combined Orders (mehrere Artikel, ein Checkout):**
- Bestehende Logik: `order_group_id` gruppiert Transaktionen
- **Mischfall Steuerschema:** Eine Order kann §25a-Artikel UND Regelbesteuerungs-Artikel enthalten → separate Rechnungspositionen mit unterschiedlichem Schema
- **Mischfall Eigentum:** Eine Order kann Franks-Sammlung UND Kommissionsware enthalten → eine Rechnung, aber unterschiedliche Settlement-Zuordnung
- **Mischfall Modelle:** Eine Order mit VOD-Ware + Marketplace-Ware ist in Phase 1 NICHT vorgesehen (unterschiedliche Payment-Flows)

### 4.5 Rechnungsstellung

**Grundsatz:** Jede Rechnung wird in sevDesk/easybill erzeugt (nicht im eigenen System). Das eigene System hält nur die Referenz (sevDesk-ID, Rechnungsnummer, PDF-URL).

**Regelbesteuerung (Modell C, Kommission mit gewerbl. Einlieferer):**
```
RECHNUNG
VOD Records | [Adresse] | USt-IdNr. DE...
An: [Käufer]
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
An: [Käufer]
Rechnungsnr.: VOD-INV-2026-00002
Datum: 2026-04-15

Pos  Artikel                           Betrag
1    Cabaret Voltaire - Red Mecca (LP)  65,00 EUR
2    Versand DHL Paket                   5,00 EUR
---------------------------------------------------------------------------
     Gesamtbetrag                       70,00 EUR

Differenzbesteuerung gemäß §25a UStG.
Im Rechnungsbetrag ist die Umsatzsteuer enthalten.
Sie wird nicht gesondert ausgewiesen.

Zahlungseingang: 2026-04-15 via Stripe
```

**Pflichtangaben GoBD:**
- Fortlaufende Rechnungsnummer (Nummernkreis: VOD-INV-YYYY-NNNNN)
- Ausstellungsdatum
- Steuernummer oder USt-IdNr. des Leistenden
- Name und Anschrift Leistender + Empfänger
- Menge und Art der Lieferung
- Zeitpunkt der Lieferung
- Entgelt und Steuerbetrag (oder Verweis auf §25a)
- Steuersatz (oder "im Betrag enthalten" bei §25a)

**Gemischte Rechnung (§25a + Regelbesteuerung in einer Order):**
Steuerlich problematisch — es gibt zwei Ansätze:
1. **Separate Rechnungen:** Eine §25a-Rechnung + eine Regelbesteuerung-Rechnung. Sauber, aber aufwendig
2. **Eine Rechnung mit getrennten Blöcken:** Erlaubt, aber erfordert klare Trennung der Positionen

Empfehlung: Separate Rechnungen. Die Komplexität einer Mischrechnung überwiegt den Nutzen.

**Stornierung und Gutschrift:**
- Nach Rechnungsstellung darf die Rechnung NICHT gelöscht oder geändert werden (GoBD)
- Stornierung → Stornorechnung (negative Rechnung mit Verweis auf Original)
- Teilretoure → Gutschrift über retournierte Positionen
- sevDesk/easybill bilden das nativ ab

### 4.6 Versand und Fulfillment

**VOD-Versand (Modell 0, A, C):**

1. Order bezahlt → erscheint in Admin unter "Orders" mit `fulfillment_status = 'unfulfilled'`
2. **NEU: Sendcloud-Integration:**
   - Admin klickt "Create Label" → API-Call an Sendcloud
   - Sendcloud wählt günstigsten Carrier (DHL, DPD, Hermes, GLS) basierend auf Gewicht/Zone
   - Label-PDF wird generiert → Druck
   - Tracking-Nummer wird automatisch zurückgeschrieben → `transaction.tracking_number`
3. Sendcloud Webhook-Events → `shipping_event` Tabelle:
   - `label_created` → `fulfillment_status = 'packing'`
   - `picked_up` → `fulfillment_status = 'shipped'`
   - `in_transit` → (kein Status-Wechsel, nur Event-Log)
   - `delivered` → `fulfillment_status = 'delivered'`
   - `delivery_failed` → Admin-Alert
4. Tracking-Link in Kunden-E-Mail (Resend: shipping-confirmation Template)
5. Branded Tracking-Seite via Sendcloud (vod-auctions.com Branding)

**Batch-Versand:**
- Admin wählt mehrere offene Orders → "Batch Create Labels"
- Sendcloud erstellt alle Labels in einem Call
- Batch-Druck (PDF mit allen Labels)
- Alle Tracking-Nummern werden zurückgeschrieben

**Seller-Versand (Modell B):**
- Seller erhält Benachrichtigung nach Zahlungseingang
- Seller versendet selbst, trägt Tracking-Nummer in Plattform ein
- Plattform validiert Tracking via Carrier-API
- Payout-Release nach Versandbestätigung + X Tage Sicherheitspuffer

**Versandkosten-Integration:**
Die bestehende Versandkosten-Logik (gewichtsbasiert, 3 Zonen, 13 Artikeltypen, 15 Gewichtsstufen) bleibt erhalten. Sendcloud wird in Phase 1 nur für Label-Erstellung und Tracking genutzt, nicht für Preisberechnung. Phase 2+: Sendcloud Checkout evaluieren.

**Zoll (Non-EU-Versand):**
- Sendcloud generiert CN22/CN23-Zollformulare automatisch
- Warenwert und Warenbezeichnung aus Order-Daten
- HS-Code für Schallplatten: 8524 (Tonträger)

### 4.7 Retoure, Storno und Sonderfälle

**Retoure (Ware zurück, Geld zurück):**
1. Käufer meldet Retoure (E-Mail oder Kontaktformular — kein Self-Service in Phase 1)
2. Admin prüft Berechtigung (14-Tage Widerrufsrecht bei gewerblichem Verkäufer; Gebrauchtware von Privatperson: kein Widerrufsrecht, nur bei Mängeln)
3. Admin erstellt Retouren-Label (Sendcloud) oder Käufer versendet auf eigene Kosten
4. Ware kommt zurück → Admin prüft Zustand
5. Admin löst Erstattung aus (Stripe/PayPal Refund via API)
6. Gutschrift in sevDesk/easybill → korrigiert Erlös und USt
7. `inventory_item.status` → 'returned' → nach Prüfung → 'in_stock' (wenn unversehrt)
8. `inventory_movement` mit `type = 'return_inbound'`

**Nicht-Zahlung (Auktion):**
1. Auktion gewonnen, Käufer zahlt nicht
2. Payment Reminder 1 (nach 3 Tagen) → Payment Reminder 2 (nach 7 Tagen)
3. Nach 14 Tagen: Storno, Artikel geht zurück in Bestand
4. Optional: Käufer-Account einschränken (bestehende Block/Unblock-Funktion)
5. Keine Rechnung erstellt (erst nach Zahlungseingang) → kein Storno nötig

### 4.8 Kommissionsabrechnung

**Abrechnungszyklus:**
1. Periodisch (monatlich oder nach Block-Ende — konfigurierbar pro Kommissionsgeber)
2. System sammelt alle verkauften Artikel des Kommissionsgebers im Zeitraum
3. Admin löst Abrechnung aus:

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

Abzüglich Lager-/Versandkosten:                       -24,00 EUR
---------------------------------------------------------------------------
Auszahlungsbetrag:                                     561,00 EUR

Bankverbindung: [IBAN Kommissionsgeber]
Fällig bis: 15.04.2026
```

4. Admin prüft und gibt frei (Status: draft → approved)
5. Überweisung an Kommissionsgeber
6. Status → paid, `paid_at` setzen

**Zeilengenaue Dokumentation:**
Jede Abrechnungsposition (`settlement_line`) referenziert:
- `inventory_item_id` (welcher Artikel)
- `transaction_id` (welche Transaktion)
- `sale_price`, `commission_amount`, `payout_amount`
- `tax_scheme` (§25a oder Standard — relevant für die Marge-Berechnung)

---

## 5. Fachlogik für Bestand, Verkauf, Settlement und Buchhaltung

Dieses Kapitel beschreibt die operative Logik — also wie sich Daten und Status durch das System bewegen, wenn ein realer Geschäftsvorfall eintritt. Es ist bewusst getrennt von der Steuerlogik (Abschnitt 6) und der technischen Architektur (Abschnitt 7).

### 5.1 Bestandsführung: Lebenszyklus eines Artikels

Jeder physische Artikel im VOD-Bestand (Modell 0, A, C) durchläuft einen definierten Lebenszyklus. Marketplace-Artikel (Modell B) werden nicht im VOD-Bestand geführt.

```
                    ┌──────────┐
                    │ EINGANG  │  Wareneingang, Migration, Kommissionsübernahme
                    └────┬─────┘
                         │
                         ▼
                    ┌──────────┐
           ┌───────│ IN_STOCK │◄──────────────────────────────┐
           │       └────┬─────┘                                │
           │            │                                      │
           │     ┌──────▼───────┐     Auktion verloren,       │
           │     │  RESERVED    │────→ Warenkorb-Timeout ──────┘
           │     └──────┬───────┘     → reservation_release
           │            │
           │     ┌──────▼───────┐
           │     │  IN_AUCTION  │     Lot aktiv in laufendem Block
           │     └──────┬───────┘
           │            │
           │     ┌──────▼───────┐
           │     │    SOLD      │     Payment confirmed
           │     └──────┬───────┘
           │            │
           │     ┌──────▼───────┐
           │     │   SHIPPED    │     Label erstellt / versendet
           │     └──────┬───────┘
           │            │
           │     ┌──────▼───────┐     ┌───────────────┐
           │     │  DELIVERED   │     │   RETURNED    │
           │     └──────────────┘     └───────┬───────┘
           │                                  │
           │                           Prüfung: unversehrt?
           │                           ├── Ja → IN_STOCK ──────┘
           │                           └── Nein ───▼
           │                              ┌──────────────┐
           │                              │   DAMAGED    │
           │                              └──────┬───────┘
           │                                     │
           │                              ┌──────▼───────┐
           └─── Inventurkorrektur ───────►│  WRITTEN_OFF │
                                          └──────────────┘
```

**Statusübergänge und ihre Auslöser:**

| Von → Nach | Auslöser | `inventory_movement` Typ | Automatisch? |
|------------|----------|--------------------------|--------------|
| (neu) → in_stock | Wareneingang, Migration | `inbound` | Nein (Admin) |
| in_stock → reserved | Lot wird Auktionsblock zugewiesen | `reservation` | Ja |
| in_stock → reserved | Artikel in Warenkorb gelegt (mit Timeout) | `reservation` | Ja |
| reserved → in_stock | Auktion verloren, Warenkorb-Timeout | `reservation_release` | Ja |
| reserved → sold | Payment-Success (Auktion oder Direktkauf) | `sale` | Ja |
| sold → shipped | Sendcloud Label erstellt | `shipment` | Ja (bei Sendcloud) |
| shipped → delivered | Sendcloud Webhook: delivered | `delivery` | Ja |
| delivered → returned | Retoure eingegangen | `return_inbound` | Nein (Admin) |
| returned → in_stock | Ware unversehrt, wird zurück in Bestand genommen | `return_processed` | Nein (Admin) |
| returned → damaged | Ware beschädigt | `return_processed` | Nein (Admin) |
| * → written_off | Inventurkorrektur, Verlust, irreparabler Schaden | `write_off` | Nein (Admin) |
| * → in_stock | Inventurkorrektur (Bestand gefunden) | `adjustment` | Nein (Admin) |

**Regel: Kein Statuswechsel ohne `inventory_movement`.** Jede Bestandsänderung wird als Event in `inventory_movement` festgehalten. Direkte UPDATE-Statements auf `inventory_item.status` ohne begleitendes Movement sind ein Programmierfehler.

**Regel: `quantity` und `quantity_reserved` bei Modell C (Qty > 1).**
Bei Eigenware mit Qty > 1 wird nicht der gesamte Posten reserviert, sondern `quantity_reserved` inkrementiert. `quantity_available` (computed: `quantity - quantity_reserved`) bestimmt, ob weitere Einheiten verkäuflich sind. Der Status bleibt `in_stock`, solange `quantity_available > 0`.

### 5.2 Verkaufslogik: Auktion vs. Direktkauf vs. Marketplace

Jeder Verkaufsweg löst eine andere Kette von Downstream-Prozessen aus. Die folgende Tabelle zeigt, welche Systeme bei welchem Verkaufstyp angesprochen werden:

| Schritt | Auktion (Mod 0/A) | Direktkauf (Mod 0/A/C) | Marketplace (Mod B) |
|---------|-------------------|------------------------|---------------------|
| **1. Initiierung** | Auktionsende, Höchstgebot | Checkout, Stripe/PayPal | Checkout, Stripe Connect |
| **2. Payment** | Stripe/PayPal → VOD-Konto | Stripe/PayPal → VOD-Konto | Stripe Connect → Split (Seller + VOD-Fee) |
| **3. Transaction** | `transaction` erstellt, `item_type = 'auction'` | `transaction` erstellt, `item_type = 'direct_purchase'` | `transaction` erstellt, `item_type = 'marketplace'`, `seller_id` gesetzt |
| **4. Rechnung** | VOD-Rechnung via sevDesk/easybill (§25a oder Standard) | VOD-Rechnung via sevDesk/easybill | Keine VOD-Rechnung (Seller stellt aus). VOD erstellt nur interne Fee-Buchung |
| **5. Bestand** | `inventory_item.status → sold`, Movement: sale | `inventory_item.status → sold` (oder qty_reserved++) | Kein inventory_item bei VOD. `seller_listing.status → sold` |
| **6. §25a-Record** | Ja, wenn tax_scheme = margin_scheme_25a | Ja, wenn tax_scheme = margin_scheme_25a | Nein (VOD verkauft nicht) |
| **7. Versand** | VOD: Sendcloud Label | VOD: Sendcloud Label | Seller versendet selbst |
| **8. Settlement** | Bei Kommission: settlement_line erstellen | Bei Kommission: settlement_line erstellen | Stripe Connect: automatischer Payout an Seller |
| **9. DATEV** | Erlös-Buchung (§25a oder Standard) | Erlös-Buchung (§25a oder Standard) | Nur Fee-Buchung (Vermittlungserlös 19%) |

**Konsequenz für die Implementierung:** Der Payment-Success-Webhook ist der zentrale Verteilpunkt. Er muss anhand von `source`, `tax_scheme`, `item_type` und `seller_id` entscheiden, welche der obigen Schritte ausgeführt werden. Die Logik darf nicht in einem einzigen Handler verdichtet werden — stattdessen dispatcht der Webhook an spezialisierte Handler:

```
payment_success_webhook
  → invoice_handler.create(transaction)        // wenn ERP_INVOICING aktiv
  → inventory_handler.process_sale(transaction) // wenn ERP_INVENTORY aktiv
  → tax_handler.create_margin_record(transaction) // wenn ERP_TAX_25A aktiv
  → settlement_handler.mark_for_settlement(transaction) // wenn source=commission
```

### 5.3 Settlement-Logik: Kommissionsabrechnung

Die Kommissionsabrechnung ist ein periodischer Prozess, kein Echtzeit-Prozess. Sie wird nicht bei jedem Verkauf ausgelöst, sondern in einem definierten Zyklus.

**Lebenszyklus eines Settlements:**

```
┌──────────────────────────────────────────────────────────────────┐
│ Verkauf eines Kommissionsartikels (laufend)                      │
│                                                                  │
│  transaction.status = 'paid'                                     │
│  inventory_item.source = 'commission'                            │
│  → settlement_line wird noch NICHT erstellt                      │
│  → Artikel wird nur als "settlement-relevant" markiert           │
│     (inventory_item.status = 'sold', commission_owner_id gesetzt)│
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼  (monatlich oder nach Block-Ende)
┌──────────────────────────────────────────────────────────────────┐
│ Admin löst Settlement aus                                        │
│                                                                  │
│  POST /admin/erp/commission/settle                               │
│  Body: { owner_id, period_from, period_to }                      │
│                                                                  │
│  System sammelt:                                                 │
│  - Alle transactions mit paid_at in Zeitraum                     │
│  - deren inventory_item.commission_owner_id = owner_id           │
│  - die noch keinem Settlement zugeordnet sind                    │
│                                                                  │
│  Pro Artikel: settlement_line erstellen                           │
│  Aggregation: commission_settlement (Kopf)                       │
│  Status: DRAFT                                                   │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ Admin prüft und gibt frei                                        │
│                                                                  │
│  POST /admin/erp/commission/settlements/:id/approve              │
│  → Status: APPROVED                                              │
│  → Gutschrift in sevDesk/easybill erstellen                      │
│  → PDF generieren                                                │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ Auszahlung                                                       │
│                                                                  │
│  Admin überweist manuell (Phase 1) oder automatisch (Phase 2+)  │
│  POST /admin/erp/commission/settlements/:id/mark-paid            │
│  Body: { payment_reference }                                     │
│  → Status: PAID                                                  │
│  → paid_at gesetzt                                               │
└──────────────────────────────────────────────────────────────────┘
```

**Provisionsberechnung bei §25a:**
- Marge = Verkaufspreis - Einkaufspreis
- USt auf Marge = 19/119 * Marge (im Bruttobetrag enthalten)
- Provision = X% vom Verkaufspreis (NICHT von der Marge)
- Auszahlung = Verkaufspreis - Provision - ggf. Nebenkosten

**Sonderfall: Retoure nach Settlement.**
Wenn ein Artikel retourniert wird, der bereits in einem abgeschlossenen Settlement abgerechnet wurde:
1. Der bestehende settlement_line-Eintrag wird NICHT gelöscht (Audit-Trail)
2. Im nächsten Abrechnungszyklus wird eine negative settlement_line erstellt (Korrektur)
3. Der Netto-Auszahlungsbetrag des nächsten Settlements wird entsprechend reduziert
4. Falls kein nächstes Settlement absehbar ist: Rückforderung per Vertrag (muss im Kommissionsvertrag geregelt sein)

### 5.4 Buchungslogik: Wie jeder Verkaufstyp Buchungssätze erzeugt

**Kontenplan (Vorschlag, SKR03-basiert — [Validierungsbedarf] muss vom Steuerberater validiert werden):**

| Konto | Bezeichnung | Verwendung |
|-------|-------------|------------|
| 8400 | Erlöse 19% USt | Modell C Neuware, Regelbesteuerung |
| 8409 | Erlöse §25a Differenzbesteuerung | Modell 0 + A (§25a) |
| 8519 | Provisionserlöse 19% | Modell A Kommissions-Provision |
| 8520 | Vermittlungserlöse 19% | Modell B Marketplace-Fees |
| 8720 | Erlöse EU §25a | EU-Lieferungen unter §25a |
| 8125 | Steuerfreie Erlöse EU (OSS) | Wenn OSS-Schwelle überschritten |
| 3300 | Verbindlichkeiten aus L+L | Auszahlungen an Kommissionsgeber |
| 1776 | USt 19% | Ausgangs-USt Regelbesteuerung |
| 1775 | USt §25a | Ausgangs-USt Differenzbesteuerung |
| 1576 | Vorsteuer 19% | Einkaufsrechnungen Modell C |

**Buchungssätze nach Geschäftsmodell:**

**Modell 0/A §25a (Verkauf 65 EUR, EK 10 EUR, Marge 55 EUR):**
```
Soll: 1200 Bank                65,00 EUR
Haben: 8409 Erlöse §25a       56,22 EUR  (65,00 - USt)
Haben: 1775 USt §25a            8,78 EUR  (19/119 * 55,00 = 8,78 auf Marge)
```
**[Validierungsbedarf]** Die korrekte Buchung bei §25a ist komplex. Der Erlös wird brutto gebucht, die USt wird nur intern auf die Marge berechnet. Die exakte Buchungslogik MUSS mit dem Steuerberater abgestimmt werden. Das obige ist eine Annäherung.

**Modell C Regelbesteuerung (Verkauf 49 EUR brutto):**
```
Soll: 1200 Bank                49,00 EUR
Haben: 8400 Erlöse 19%        41,18 EUR
Haben: 1776 USt 19%             7,82 EUR
```

**Modell A Kommissions-Settlement (Auszahlung 585 EUR):**
```
Soll: 3300 Verbindl. Kommittent 585,00 EUR
Haben: 1200 Bank                585,00 EUR
```

**Modell B Marketplace-Fee (10% von 100 EUR Verkauf = 10 EUR):**
```
Soll: 1200 Bank                10,00 EUR
Haben: 8520 Vermittlungserl.    8,40 EUR
Haben: 1776 USt 19%             1,60 EUR
```

**Stornobuchung (Vollretoure eines §25a-Verkaufs):**
```
Soll: 8409 Erlöse §25a        56,22 EUR  (Gegenbuchung)
Soll: 1775 USt §25a            8,78 EUR  (Gegenbuchung)
Haben: 1200 Bank               65,00 EUR  (Erstattung)
```

**[Validierungsbedarf]** Alle Buchungssätze sind vereinfacht. Der Steuerberater muss den Kontenplan und die Buchungslogik validieren. Insbesondere die §25a-Buchung hat Varianten je nach Steuerberater-Praxis.

### 5.5 DATEV-Export

**Format:** DATEV Buchungsstapel (ASCII-Datei, Semikolon-getrennt)

**Felder pro Buchung (Auszug):**

| Feld | Beschreibung | Beispiel |
|------|--------------|---------|
| Umsatz | Betrag | 65,00 |
| Soll/Haben | S oder H | S |
| Konto | Sollkonto | 1200 |
| Gegenkonto | Habenkonto | 8409 |
| BU-Schlüssel | Steuerschlüssel | 12 (§25a) |
| Belegdatum | DDMM | 1504 |
| Belegfeld 1 | Rechnungsnummer | VOD-INV-2026-00002 |
| Buchungstext | Beschreibung | Verkauf LP Cabaret Voltaire |

**BU-Schlüssel (Steuerschlüssel):**
- Leer oder 0 = Automatik
- 1 = USt frei
- 3 = 19% USt
- 12 = §25a Differenzbesteuerung

**Export-Frequenz:** Monatlich, manuell ausgelöst (Admin-Button "DATEV-Export Monat X")

**Trennung der Buchungen:**
Der Export muss pro Buchung klar erkennbar machen:
- Geschäftsmodell (Eigenverkauf / Kommission / Marketplace-Fee / Eigenware)
- Steuerschema (§25a / Regelbesteuerung / steuerfrei)
- Erlös vs. Gutschrift vs. Storno

### 5.6 Finanzielle Ableitung pro Orderline

Dieser Abschnitt beschreibt die vollständige Kette finanzieller Objekte, die aus einer einzelnen Verkaufsposition entsteht — vom Order-Eintrag bis zum DATEV-Export. Jedes Objekt in der Kette trägt eine definierte finanzielle Wahrheit.

#### 5.6.1 Die Objektkette

```
Order (VOD-ORD-XXXXXX, via order_group_id)
  └→ Transaction (eine pro Artikel/Lot)
       └→ Invoice (sevDesk/easybill, VOD-INV-YYYY-NNNNN)
            └→ Invoice Line (eine pro Artikelposition)
                 └→ Tax Decision (margin_scheme_25a / standard / exempt)
       └→ Settlement Line (nur bei Kommission, im nächsten Abrechnungszyklus)
            └→ Commission Settlement (Kopf-Dokument pro Kommissionsgeber/Periode)
       └→ Tax Margin Record (§25a-Nachweis pro Artikel)
       └→ DATEV-Buchung (im Monatsexport)
```

#### 5.6.2 Welches Objekt trägt welche finanzielle Wahrheit?

| Objekt | Finanzielle Wahrheit | Wann angelegt? |
|--------|---------------------|----------------|
| **Transaction** | Brutto-Zahlungsbetrag, Payment-Provider, Payment-Zeitpunkt. Quelle für alle Downstream-Objekte | Bei Payment-Success (Webhook) |
| **Invoice** | Rechtsverbindlicher Rechnungsbetrag, GoBD-Rechnungsnummer, Steuerschema der Rechnung | Automatisch nach Payment-Success (via sevDesk/easybill) |
| **Invoice Line** | Positionsbetrag (brutto/netto), Steuersatz/-betrag pro Position | Gleichzeitig mit Invoice |
| **Tax Decision** | Steuerschema (§25a / Standard), abgeleitet aus `inventory_item.tax_scheme` | Zum Zeitpunkt der Invoice-Erstellung. Festgeschrieben — nachträgliche Änderung nur via Korrekturrechnung |
| **Tax Margin Record** | EK, VK, Marge, USt auf Marge — artikelgenauer §25a-Nachweis (gesetzliche Pflicht) | Nach Payment-Success, wenn tax_scheme = margin_scheme_25a |
| **Settlement Line** | Anteil des Kommissionsgebers: VK, Provision, Auszahlung | Beim Settlement-Lauf (periodisch) |
| **DATEV-Buchung** | Konto, Gegenkonto, BU-Schlüssel, Betrag — buchhalterische Wahrheit | Beim monatlichen DATEV-Export |

#### 5.6.3 Beispielkette: §25a Kommissionsverkauf

```
Order (VOD-ORD-000142)
  └→ Transaction (Lot #7, Coil - Scatology, €45.00, paid via Stripe)
       │
       ├→ Tax Decision: margin_scheme_25a
       │    Begründung: source=commission, commission_owner.is_business=false
       │    EK=€10.00, VK=€45.00, Marge=€35.00, USt=€5.59 (19/119 * 35)
       │
       ├→ Invoice (sevDesk #VOD-INV-2026-00142)
       │    └→ Invoice Line: "Coil - Scatology (LP)", €45.00 brutto
       │       Vermerk: "Differenzbesteuerung gemäß §25a UStG"
       │       Kein separater USt-Ausweis
       │
       ├→ Tax Margin Record
       │    purchase_price=10.00, sale_price=45.00, margin=35.00
       │    vat_on_margin=5.59, net_revenue=39.41
       │
       ├→ Settlement Line (im nächsten Abrechnungszyklus)
       │    sale_price=45.00, commission_rate=25%, commission_amount=11.25
       │    payout_amount=33.75
       │
       └→ DATEV-Buchung (Monatsexport)
            S: 1200 Bank €45.00 | H: 8409 Erlöse §25a €39.41 | H: 1775 USt §25a €5.59
```

#### 5.6.4 Wie Retoure / Teilretoure / Storno / Chargeback die Kette verändern

**Vollretoure:**
```
Retoure-Event (Lot #7, Coil - Scatology returned)
  │
  ├→ Invoice: Gutschrift (sevDesk Stornorechnung VOD-CR-2026-NNNNN)
  │    └→ Invoice Line: €-45.00, Verweis auf VOD-INV-2026-00142
  │
  ├→ Tax Decision: §25a-Marge wird storniert
  │    → Korrektur-Tax-Margin-Record: margin=-35.00, vat_on_margin=-5.59
  │
  ├→ Settlement Line (Korrektur im nächsten Zyklus):
  │    sale_price=-45.00, commission_amount=-11.25, payout_amount=-33.75
  │
  ├→ Inventory: status → 'returned', nach Prüfung → 'in_stock' (re-listable)
  │    → inventory_movement: return_inbound, dann return_processed
  │
  └→ DATEV: Storno-Buchung im nächsten Monatsexport
       S: 8409 Erlöse §25a €39.41 | S: 1775 USt §25a €5.59 | H: 1200 Bank €45.00
```

**Teilretoure (bei Combined Order):**
```
Combined Order (VOD-ORD-000143, 3 Artikel)
  Transaction A: €49.00 (TG - D.O.A.)      → bleibt bestehen
  Transaction B: €65.00 (SPK - Leichenschrei) → RETOURE
  Transaction C: €35.00 (Boyd Rice - Music)  → bleibt bestehen

Retoure nur Transaction B:
  ├→ Gutschrift nur über €65.00 (+ ggf. anteilige Versandkosten)
  ├→ Tax Margin Record B: Korrektur-Record
  ├→ Settlement Line B: Korrektur wenn Kommission
  ├→ Inventory B: returned → in_stock
  └→ Transactions A und C: unverändert, Rechnungen bleiben gültig
```

**Storno (vor Versand, nach Rechnungsstellung):**
```
Storno-Event
  ├→ Invoice: Stornorechnung (negative Rechnung)
  ├→ Tax Margin Record: Korrektur-Record
  ├→ Inventory: status → 'in_stock' (direkt, kein Versand erfolgt)
  ├→ Payment: Stripe/PayPal Refund
  └→ DATEV: Gegenbuchung
```

**Chargeback:**
```
Chargeback-Event (Stripe bucht €45.00 + €15.00 Gebühr zurück)
  ├→ Transaction: status → 'failed' oder 'chargeback'
  ├→ Invoice: Stornorechnung (Gutschrift)
  ├→ Inventory: KEIN Rücklauf — Ware ist beim Käufer/verloren
  ├→ Tax Margin Record: Korrektur-Record
  ├→ Settlement (bei Kommission): VOD trägt Verlust + Gebühr
  │    Verrechnung im nächsten Zyklus oder separate Buchung
  └→ DATEV: Gegenbuchung Erlös + Aufwandsbuchung Chargeback-Gebühr
```

#### 5.6.5 Manuelle Overrides und Auditierbarkeit

**Wann manuelle Overrides möglich sind:**
- `tax_scheme` auf `inventory_item`: Admin kann übersteuern → `tax_scheme_override = true`, `tax_scheme_override_reason` (Pflichtfeld)
- Invoice-Erstellung: Admin kann Rechnung manuell erstellen oder korrigieren → Audit-Log in `order_event`
- Settlement: Admin kann Settlement-Betrag manuell anpassen → `notes`-Feld + Audit-Log

**Wie Auditierbarkeit sichergestellt wird:**
1. Jeder Tax Margin Record hat `calculated_at` und optional `validated_by` + `validated_at`
2. Jede Invoice hat `invoice_type` (invoice / credit_note / cancellation) und `related_invoice_id` für Korrekturen
3. Jede Settlement Line referenziert `inventory_item_id` + `transaction_id` → lückenlose Zuordnung
4. `inventory_movement` speichert jede Bestandsänderung mit `performed_by` (Admin-Email oder 'system')
5. Bestehende `order_event`-Tabelle wird für ERP-Events erweitert (event_type: invoice_created, settlement_approved, tax_override)

---

## 6. Steuerlogik und Validierungsbedarfe

### 6.1 §25a Differenzbesteuerung — Regelwerk

**Gesetzliche Grundlage:** §25a UStG — Besteuerung der Handelsspanne bei Gebrauchtgegenständen.

**Voraussetzungen (alle müssen erfüllt sein):**

1. **Gegenstand:** Beweglicher körperlicher Gegenstand (Schallplatten, CDs, Bücher = ja)
2. **Einkauf von:** Privatperson, Kleinunternehmer (§19), oder anderem §25a-Händler. Entscheidend: KEINE USt auf der Eingangsrechnung/dem Kaufbeleg
3. **Wiederverkäufer:** VOD muss gewerblich tätig sein (Gewinnerzielungsabsicht)
4. **Aufzeichnungspflicht:** Pro Artikel: Einkaufspreis, Verkaufspreis, Marge. Nicht pauschal, sondern artikelgenau (§25a Abs. 6 UStG)

**Abhängigkeitsbaum:**
```
Ist der Gegenstand gebraucht (beweglich, körperlich)?
├── Nein → Regelbesteuerung
└── Ja
    └── Wurde der Gegenstand von einer Privatperson / KU / §25a-Händler erworben?
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
- Marge = 0 (nicht negativ)
- USt = 0
- Der Verlust ist steuerlich nicht absetzbar (kein Vorsteuerabzug bei §25a)
- **[Validierungsbedarf]** Die negative Differenz darf NICHT mit positiven Margen anderer Artikel verrechnet werden (§25a Abs. 3 UStG: Einzeldifferenz, nicht Gesamtdifferenz — Ausnahme: Sammelberechnung nach §25a Abs. 4). Ob Einzeldifferenz oder Sammelberechnung gewählt wird, muss der Steuerberater entscheiden.

**Sammelberechnung (§25a Abs. 4):**
- Erlaubt für Gegenstände, deren Einkaufspreis 500 EUR nicht übersteigt
- Marge wird nicht pro Artikel, sondern als Gesamtdifferenz (Summe VK - Summe EK) eines Besteuerungszeitraums berechnet
- Vorteil: Negative Margen einzelner Artikel werden mit positiven Margen verrechnet
- **[Validierungsbedarf]** Anwendbarkeit für Schallplatten prüfen (manche Einzelstücke > 500 EUR)
- **Steuerberater-Entscheidung:** Einzeldifferenz (artikelgenau) oder Sammelberechnung (pauschal pro Zeitraum)

**Sammeleinkauf (Konvolut):**
Wenn eine Sammlung pauschal gekauft wird (z.B. 200 Platten für 500 EUR):
- Einkaufspreis muss auf die einzelnen Artikel aufgeteilt werden
- Methoden: Gleichmäßig (500/200 = 2,50/Stück) oder gewichtet nach geschätztem Wert
- Die Aufteilungsmethode muss dokumentiert und nachvollziehbar sein
- **[Validierungsbedarf]** Steuerberater-Abstimmung zwingend — das Finanzamt kann die Aufteilung anzweifeln

**Rechnungsformat bei §25a:**
- KEIN separater USt-Ausweis (Pflicht! Verstoß = Käufer könnte Vorsteuer ziehen)
- Pflichttext: "Differenzbesteuerung nach §25a UStG" oder ähnliche Formulierung
- Nur Bruttobetrag je Position
- Zusätzlich: Alle GoBD-Pflichtangaben (Rechnungsnummer, Datum, Anschrift etc.)

**Steuerberater-Validierungspunkte (vor Implementierung):**
1. Ist Franks Sammlung komplett unter §25a führbar? (gewerbliche Einstufung?)
2. Einzeldifferenz oder Sammelberechnung?
3. Aufteilungsmethode für Konvolut-Einkäufe?
4. Kontenplan und Buchungslogik für §25a
5. Rechnungsformulierung genehmigen lassen
6. Mischrechnung oder separate Rechnungen?
7. OSS-Schwellenwert und Interaktion mit §25a bei EU-Versand

**Abhängigkeitsregel Steuerschema — [Technische Ableitung aus den fachlichen Zielannahmen]:**
```
WENN source = 'vod_records' UND Neuware:
    → tax_scheme = 'standard' (Regelbesteuerung, Vorsteuerabzug auf EK)

WENN source = 'frank_collection':
    → tax_scheme = 'margin_scheme_25a' (Privatsammlung, kein USt auf EK)
    [Fachliche Zielannahme — §25a-Anwendbarkeit muss StB bestätigen]

WENN source = 'commission':
    WENN Kommissionsgeber = Privatperson ODER Kleinunternehmer (keine USt auf Übernahme):
        → tax_scheme = 'margin_scheme_25a'
        [Fachliche Zielannahme — Kommissionsfiktion + §25a muss StB bestätigen]
    WENN Kommissionsgeber = gewerblich mit USt-Rechnung:
        → tax_scheme = 'standard'

WENN source = 'marketplace':
    → kein tax_scheme bei VOD (Seller versteuert selbst)
    → VOD bucht nur Provision (Dienstleistung, standard)
    [Validierungsbedarf — steuerliche Behandlung der Marketplace-Provision prüfen]
```

Diese Logik ist NICHT ein einzelnes Feld. Sie ist eine Kombination aus `source`, Kommissionsgeber-Typ und Wareneigenschaft. Das System muss diese Ableitung automatisieren, aber der Admin muss sie übersteuern können (mit Audit-Log).

### 6.2 Kommissionsgeschäft — Steuerliche Behandlung

**VOD als Kommissionär (§383 HGB):**
- VOD handelt im eigenen Namen, für Rechnung des Kommittenten
- **[Validierungsbedarf]** Zwei umsatzsteuerliche Lieferungen (Kommissionsfiktion, §3 Abs. 3 UStG):
  1. Lieferung Kommittent → Kommissionär (= VOD): Innenumsatz
  2. Lieferung Kommissionär (= VOD) → Käufer: Außenumsatz

- **Innenumsatz (Kommittent → VOD):**
  - Privatperson als Kommittent → keine USt → §25a auf Außenumsatz möglich [Validierungsbedarf]
  - Gewerblicher Kommittent mit USt → Vorsteuerabzug → Regelbesteuerung auf Außenumsatz

- **Außenumsatz (VOD → Käufer):**
  - §25a wenn Innenumsatz ohne USt
  - Regelbesteuerung wenn Innenumsatz mit USt

**Abrechnungszeitpunkte:**
- Innenumsatz: Zeitpunkt der Lieferung an den Käufer (nicht bei Übernahme der Ware)
- Außenumsatz: Zeitpunkt der Lieferung an den Käufer
- Kommissionsabrechnung: Periodisch (monatlich empfohlen), spätestens bei Auszahlung

**Provision:**
- VODs Provision ist eine Dienstleistung an den Kommittenten
- Unterliegt der normalen USt (19%)
- Bei Privatperson als Kommittent: VOD stellt Gutschrift (Abrechnung) aus, Kommittent schuldet keine USt
- Bei gewerblichem Kommittent: Provision wird netto abgezogen, Kommittent erhält Gutschrift mit USt-Ausweis

### 6.3 Marketplace — Steuerliche Behandlung

**VOD als Vermittler:**
- **[Fachliche Zielannahme]** VOD ist NICHT Verkäufer → kein §25a, keine Warenerlöse. Diese Einstufung als reiner Vermittler setzt voraus, dass VOD die in §25e UStG genannten Pflichten erfüllt.
- VOD versteuert nur seine eigenen Einnahmen:
  - Provisionseinnahmen (Dienstleistung, 19% USt)
  - Membership-Fees (Dienstleistung, 19% USt)
- Seller ist für seine eigene USt verantwortlich

**[Validierungsbedarf] DAC7-Meldepflicht:**
- Jährlich an BZSt (bis 31. Januar)
- Pro Seller: TIN, IBAN, Gesamtumsatz, einbehaltene Gebühren
- Ausnahme: < 30 Verkäufe UND < 2.000 EUR im Meldezeitraum
- System muss DAC7-Report automatisch generieren können

**Deemed Supplier (fiktiver Lieferer):**
- Greift NICHT für EU-Seller (nur für Nicht-EU-Seller bei Import ≤ 150 EUR)
- Da alle Seller voraussichtlich EU-basiert: irrelevant
- Sollte sich die Seller-Basis auf Nicht-EU ausweiten: erneut prüfen

### 6.4 EU-Umsatzsteuer und One-Stop-Shop (OSS)

**Schwellenwert:** 10.000 EUR/Jahr an B2C-Lieferungen in andere EU-Länder (kumuliert). Bei Überschreitung: USt des Bestimmungslandes fällig.

**OSS-Verfahren:**
- Registrierung beim BZSt
- Quartalsweise Meldung der EU-B2C-Umsätze nach Bestimmungsland
- Steuersatz des Bestimmungslandes anwenden (z.B. 21% NL, 21% BE, 20% FR, 25% SE)
- Keine separate Registrierung in jedem EU-Land nötig

**[Validierungsbedarf] Interaktion §25a und OSS:**
- §25a gilt auch bei EU-Lieferungen — die Marge wird mit dem Steuersatz des Bestimmungslandes besteuert
- Beispiel: §25a-Artikel nach Niederlande, Marge 40 EUR → USt = 21/121 * 40 = 6,94 EUR (statt 19/119 * 40 = 6,39 EUR bei DE)
- sevDesk/easybill können OSS-Steuersätze verwalten

**Umsetzung im System:**
- Checkout erfasst bereits Lieferland (`shipping_country`)
- Rechnungserstellung: Steuersatz basierend auf Lieferland + Steuerschema
- Lookup-Tabelle: EU-Länder → USt-Sätze
- DATEV-Export: Separate Konten für OSS-Erlöse

### 6.5 DSGVO-Implikationen der ERP-Daten

| Tabelle | Personenbezogene Daten | Betroffene | Rechtsgrundlage |
|---------|----------------------|-----------|-----------------|
| `commission_owner` | Name, Email, Adresse, IBAN, Steuer-ID | Kommissionsgeber | Vertrag (Art. 6 Abs. 1 lit. b DSGVO) |
| `seller` | Name, Email, Adresse, IBAN, Steuer-ID | Marketplace-Seller | Vertrag + berechtigtes Interesse |
| `invoice` | Kundenname, Email | Käufer | Vertrag + gesetzliche Aufbewahrung |
| `tax_margin_record` | Keine direkt (über transaction_id zuordbar) | Käufer (indirekt) | Gesetzliche Pflicht (§25a UStG) |

**Aufbewahrungsfristen:**
- Rechnungen: 10 Jahre (§147 AO)
- §25a-Aufzeichnungen: 10 Jahre (§25a Abs. 6 UStG)
- Kommissionsabrechnungen: 10 Jahre (Handelsbriefe, §257 HGB)
- DAC7-Aufzeichnungen: 10 Jahre (§22f UStG)

**Löschpflicht vs. Aufbewahrungspflicht:**
- DSGVO Art. 17 wird durch gesetzliche Aufbewahrungspflichten eingeschränkt
- Praxis: Personenbezogene Daten in `commission_owner` und `seller` werden nach Vertragsende NICHT gelöscht, sondern nach Ablauf der Aufbewahrungsfrist (10 Jahre) automatisch anonymisiert
- Die bestehende GDPR-Export-Funktion (`/store/account/gdpr-export`) muss um ERP-Daten erweitert werden

---

## 7. Zielarchitektur und Systemprinzipien

### 7.1 Gesamtarchitektur

```
┌──────────────────────────────────────────────────────────────────────┐
│                        VOD AUCTIONS PLATFORM                         │
│                                                                      │
│  ┌──────────────────────────┐   ┌──────────────────────────────┐    │
│  │   MEDUSA.JS BACKEND      │   │   STOREFRONT (Next.js)       │    │
│  │                          │   │                              │    │
│  │  ┌────────────────────┐  │   │  Katalog, Auktionen,        │    │
│  │  │ Auction Module     │  │   │  Checkout, Account,          │    │
│  │  │ (bestehend)        │  │   │  Tracking-Seite              │    │
│  │  └────────────────────┘  │   │                              │    │
│  │                          │   └──────────────────────────────┘    │
│  │  ┌────────────────────┐  │                                       │
│  │  │ ERP Module (NEU)   │  │   ┌──────────────────────────────┐    │
│  │  │                    │  │   │   ADMIN UI (Medusa Admin)    │    │
│  │  │  - Inventory       │  │   │                              │    │
│  │  │  - Invoicing       │  │   │  Bestehend: Blocks, Orders,  │    │
│  │  │  - Commission      │  │   │  Catalog, Marketing, Ops     │    │
│  │  │  - Tax Tracking    │  │   │                              │    │
│  │  │  - Shipping        │  │   │  NEU: ERP Hub                │    │
│  │  │  - Marketplace     │  │   │  (Lager, Rechnungen, Versand,│    │
│  │  │                    │  │   │   Kommission, Finanzen, §25a)│    │
│  │  └────────────────────┘  │   │                              │    │
│  │                          │   └──────────────────────────────┘    │
│  │  ┌────────────────────┐  │                                       │
│  │  │ Feature Flags      │  │                                       │
│  │  │ (site_config)      │  │                                       │
│  │  └────────────────────┘  │                                       │
│  │                          │                                       │
│  │  ┌────────────────────┐  │                                       │
│  │  │ LIB (API-Clients)  │  │                                       │
│  │  │                    │  │                                       │
│  │  │  sendcloud.ts      │  │                                       │
│  │  │  sevdesk.ts        │  │                                       │
│  │  │  stripe.ts (best.) │  │                                       │
│  │  │  paypal.ts (best.) │  │                                       │
│  │  │  feature-flags.ts  │  │                                       │
│  │  └────────────────────┘  │                                       │
│  │                          │                                       │
│  └──────────────────────────┘                                       │
│                                                                      │
└──────────┬──────────────┬────────────────┬──────────────────────────┘
           │              │                │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────────────┐
    │  Sendcloud  │ │  sevDesk/  │ │  Stripe             │
    │             │ │  easybill  │ │  (bestehend)        │
    │  Labels     │ │            │ │  + Connect (Mktpl)  │
    │  Tracking   │ │  Rechnungen│ │                     │
    │  Returns    │ │  DATEV     │ │  Payments           │
    └──────┬──────┘ └────────────┘ │  Seller-Payouts     │
           │                       └─────────────────────┘
    ┌──────▼──────┐
    │  Webhooks   │
    │  /webhooks/ │
    │  sendcloud  │
    └─────────────┘
```

### 7.2 Integrationsprinzipien

**API-First:**
Alle externen Dienste (Sendcloud, sevDesk/easybill, Stripe Connect) werden über eigene API-Clients in `backend/src/lib/` angesprochen. Kein direkter API-Call aus Routen oder Admin-Komponenten.

**Event-getrieben wo sinnvoll:**
- Stripe/PayPal Webhooks → Payment-Events (bestehend)
- Sendcloud Webhooks → Versand-Events (neu)
- Interne Events: Payment-Success löst Kaskade aus (Rechnung, Bestand, §25a-Record). Implementierung via synchroner Handler-Chain (kein Message-Queue nötig bei aktuellem Volumen)

**Idempotenz:**
Jeder Webhook-Handler und jede automatische Aktion muss idempotent sein. Doppelte Webhooks dürfen nicht zu doppelten Rechnungen, doppelten Bestandsbewegungen oder doppelten Settlement-Lines führen. Implementierung: UNIQUE-Constraints auf `(transaction_id, type)` wo sinnvoll, plus Check auf Existenz vor INSERT.

### 7.3 Datenhoheit

| Datensatz | Autoritatives System | Kopie in | Begründung |
|-----------|---------------------|----------|------------|
| Release (Produktstamm) | Supabase (`Release`-Tabelle) | — | Legacy-Daten, keine Änderung |
| Bestandsstatus | Supabase (`inventory_item`) | — | ERP-Modul ist Single Source of Truth |
| Rechnung (Volltext, PDF) | sevDesk/easybill | Supabase (`invoice`: ID, Nummer, Beträge) | sevDesk/easybill ist das GoBD-konforme Archiv |
| Tracking-Status | Sendcloud (via Carrier) | Supabase (`shipping_event`) | Sendcloud ist Aggregator, wir spiegeln Events |
| Payment-Status | Stripe/PayPal | Supabase (`transaction`) | Bestehende Logik, unverändert |
| Kundendaten | Medusa (Customer) | sevDesk/easybill (Kontakt) | Medusa ist führend, sevDesk/easybill erhält Kopie bei Rechnungserstellung |
| Kommissionsgeber-Stamm | Supabase (`commission_owner`) | sevDesk/easybill (Kontakt) | VOD-System ist führend |
| Seller-Stamm | Supabase (`seller`) | Stripe Connect (Account) | VOD-System ist führend, Stripe hält KYC-Daten |

### 7.4 Trennung der Zuständigkeiten

**Auction Module** (bestehend, unverändert): Block-Verwaltung, Lot-Zuweisung, Gebots-Logik, Anti-Sniping, Gewinner-Ermittlung. Kommuniziert mit ERP-Modul nur über `transaction`-Tabelle.

**ERP Module** (neu): Bestandsführung, Rechnungsstellung, Versand, Kommission, §25a-Tracking, DATEV-Export. Liest `transaction`-Daten, schreibt `inventory_item`, `invoice`, `shipping_event`, `commission_settlement`, `tax_margin_record`.

**Storefront** (bestehend, minimal erweitert): Tracking-Seite für Käufer (Sendcloud-Tracking-URL), Rechnung-Download in Account-Bereich. Keine ERP-Logik im Frontend.

**Admin UI** (bestehend + neuer ERP Hub): Bestehende Seiten unverändert. Neuer ERP Hub mit 6 Sub-Pages. Kein `defineRouteConfig` auf Sub-Pages.

### 7.5 Wie das ERP-Modul in die bestehende Codebasis passt

```
backend/src/
├── modules/auction/           ← Bestehendes Auktionsmodul (UNVERÄNDERT)
├── modules/erp/               ← NEU: Eigenständiges ERP-Modul
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
├── api/webhooks/sendcloud/    ← NEU: Sendcloud Webhooks
│   └── route.ts
├── lib/
│   ├── sendcloud.ts           ← NEU: Sendcloud API-Client
│   ├── sevdesk.ts             ← NEU: sevDesk API-Client
│   ├── feature-flags.ts       ← NEU: Feature-Flag-Logik
│   ├── stripe.ts              ← Bestehend (unverändert)
│   ├── paypal.ts              ← Bestehend (unverändert)
│   └── ...                    ← Alle bestehenden Dateien unverändert
└── admin/routes/
    └── erp/page.tsx           ← NEU: ERP Hub im Admin
```

**Berührungspunkte mit bestehendem Code:**
1. **Payment-Webhook-Handler** (bestehend): Erhält zusätzliche Aufrufe an ERP-Handler (hinter Feature Flags)
2. **`middlewares.ts`** (bestehend): Neue Webhook-Route für Sendcloud registrieren
3. **Admin Navigation** (`admin-nav.tsx`): Neuer Hub-Eintrag "ERP"
4. **Storefront Account** (bestehend): Rechnung-Download-Link, Tracking-Link

---

## 8. Release-fähige Architektur für Live-System und Next Release

### 8.1 Grundproblem

Das Live-System läuft und wird aktiv genutzt (Beta-Test-Phase, Pre-Launch-Vorbereitung). Gleichzeitig soll das ERP/Wawi-System als nächstes großes Feature entwickelt werden. Beides muss parallel möglich sein:
- Bug-Fixes und kleine Verbesserungen am Live-System müssen jederzeit deployed werden können
- ERP-Tabellen und -Module müssen entwickelt und getestet werden, ohne Live-Daten zu gefährden
- Einzelne ERP-Komponenten sollen VOR dem Gesamt-Release aktivierbar sein
- Die bestehende `transaction`-Tabelle und Order-Logik dürfen nicht gebrochen werden

### 8.2 Feature Flags

Neue ERP-Funktionalität wird hinter Feature Flags deployed:
```typescript
// backend/src/lib/feature-flags.ts
export const FEATURES = {
    ERP_INVOICING: false,       // sevDesk/easybill Integration
    ERP_SENDCLOUD: false,       // Sendcloud Versandautomation
    ERP_INVENTORY: false,       // Bestandsführung (neue Tabellen)
    ERP_COMMISSION: false,      // Kommissionsabrechnung
    ERP_TAX_25A: false,         // §25a Differenzbesteuerung
    ERP_MARKETPLACE: false,     // Seller-Verwaltung (strukturell)
} as const
```

Flags werden in `site_config` gespeichert (bestehende Tabelle) und können im Admin unter `/app/config` umgeschaltet werden. Im Code:
```typescript
if (siteConfig.features.ERP_SENDCLOUD) {
    // Sendcloud Label erstellen
} else {
    // Bestehender manueller Workflow
}
```

### 8.3 Backward-Compatible DB-Migrationen

- Neue Tabellen: `CREATE TABLE IF NOT EXISTS` — sicher, keine Auswirkung auf bestehende Daten
- Neue Spalten: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — nullable, mit Default
- NIEMALS: `DROP COLUMN`, `RENAME COLUMN`, `ALTER TYPE` auf bestehenden Live-Tabellen
- Datenmigration (Release → inventory_item): Separates Script, nicht in DB-Migration. Manuell auslösbar, idempotent

### 8.4 API-Versionierung

- Bestehende Endpunkte (`/admin/transactions`, `/store/catalog`) bleiben unverändert
- Neue ERP-Endpunkte unter eigenem Prefix: `/admin/erp/*`
- Wenn bestehende Endpunkte ERP-Daten zurückgeben sollen: Optional, via Query-Parameter (`?include=erp_data`), geprüft gegen Feature Flag

### 8.5 Umgebungsmodell

```
┌────────────┐    ┌──────────────┐    ┌────────────────┐    ┌────────────┐
│ Local Dev  │ →  │ Feature      │ →  │ Staging        │ →  │ Production │
│            │    │ Branch       │    │ (Testdaten)    │    │ (VPS)      │
│ localhost  │    │ GitHub       │    │ VPS :3007      │    │ VPS :3006  │
│ :3000/9000 │    │              │    │ Separate DB    │    │ Live DB    │
└────────────┘    └──────────────┘    └────────────────┘    └────────────┘
```

**Staging-Umgebung (neu aufzusetzen):**
- Separate Supabase-Datenbank mit Testdaten
- Storefront auf Port 3007, Backend auf Port 9001
- sevDesk/easybill Sandbox-Account für Rechnungstests
- Sendcloud Test-Modus (Labels werden nicht an Carrier übermittelt)
- Stripe Test-Mode (bestehend)

### 8.6 Branching-Strategie

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
- `develop` = Integrationsbranch für nächstes Release
- `feature/erp-*` = Einzelne ERP-Module
- `hotfix/*` = Dringende Fixes. Von `main` abgezweigt, nach `main` UND `develop` gemergt

---

## 9. Modulare Komponentenübernahme und Aktivierungslogik

### 9.1 Philosophie: Deploy early, activate when ready

Jede ERP-Komponente wird deployed, sobald sie code-complete ist — unabhängig davon, ob sie operativ aktiviert wird. Die Tabellen existieren in der Datenbank, die API-Endpunkte antworten (mit 404 oder leeren Ergebnissen wenn Flag = false), die Admin-UI ist erreichbar. Aber die Komponente greift erst in laufende Geschäftsprozesse ein, wenn der Feature Flag auf `true` gesetzt wird.

Das bedeutet: **Deployment ≠ Aktivierung.** Ein Feature kann wochenlang deployed sein, ohne dass es den Betrieb beeinflusst. Es kann auf Staging getestet, vom Steuerberater geprüft und vom Admin inspiziert werden — alles ohne dass ein Käufer oder ein laufender Prozess davon betroffen ist.

### 9.2 Komponentenunabhängigkeit

| Komponente | Eigenständig aktivierbar? | Abhängigkeiten | Risiko bei Aktivierung |
|------------|---------------------------|-----------------|------------------------|
| **Sendcloud Integration** | Ja — sofort aktivierbar | Sendcloud-Account, DHL-GK-Nr | Gering: Neue Funktion, kein Eingriff in bestehende Logik. Manueller Versand bleibt als Fallback |
| **sevDesk/easybill Rechnungen** | Ja — sofort aktivierbar | Account, §25a-Konfiguration mit StB | Gering: Additive Funktion nach Payment-Success. Bestehende PDF-Quittung bleibt als Fallback |
| **inventory_item Tabellen** | Ja — deployed aber inaktiv | Keine | Kein Risiko: Neue Tabellen, bestehende Logik unberührt |
| **Bestandsmigration** | Ja — einmalig ausführbar | inventory_item Tabellen müssen existieren | Gering: Daten werden kopiert, nicht verschoben |
| **§25a-Tracking** | Nein — wartet auf StB-Validierung | Steuerberater muss Konfiguration freigeben | Mittel: Falsche Konfiguration = Steuerfehler |
| **Kommissionsabrechnung** | Nein — wartet auf Gesamt-Release | inventory_item + commission_owner + tax_margin_record | Mittel: Verbindet mehrere Systeme |
| **Marketplace (Seller)** | Nein — operativ später | Strukturell ab Tag 1, aber kein Registrierungs-Flow | Kein Risiko bei Tabellen-Deployment, hoch bei operativer Aktivierung |
| **DATEV-Export** | Ja — sobald Rechnungen existieren | sevDesk/easybill | Gering: Read-only Export |

### 9.3 Aktivierungs-Matrix

Die folgende Matrix zeigt für jede ERP-Komponente den vollständigen Aktivierungspfad — von der technischen Bereitstellung bis zur fachlichen Freigabe.

| Komponente | Technisch deploybar? | Feature-Flag-fähig? | Dark Launch möglich? | Interner Pilot möglich? | Alt/Neu parallel möglich? | Datenmigration vor Aktivierung? | Rollback möglich? | Klarer Cutover nötig? | Fachliche Freigabe erforderlich? | Operative Verantwortung |
|------------|---------------------|--------------------|--------------------|------------------------|--------------------------|--------------------------------|-------------------|----------------------|----------------------------------|------------------------|
| **Sendcloud Integration** | Ja | Ja (ERP_SENDCLOUD) | Ja | Ja (Frank testet 5 Labels) | Ja (manuell bleibt Fallback) | Nein | Ja (Flag → false, 30s) | Nein | Robin + Frank | Frank (Versand) |
| **sevDesk/easybill Rechnungen** | Ja | Ja (ERP_INVOICING) | Ja | Ja (Test-Rechnungen) | Ja (alte Orders ohne, neue mit Rechnung) | Nein | Ja (Flag → false, 30s) | Nein (Stichtag, kein Cutover) | Robin + Frank + StB | Robin (Konfiguration) |
| **Bestandsführung (inventory_item)** | Ja | Ja (ERP_INVENTORY) | Ja (Tabellen existieren, werden nicht gelesen) | Ja (Admin kann Bestand einsehen) | Ja (legacy_available bleibt bis Cutover) | Ja (Bestandsmigration) | Ja (Flag → false + DELETE Migration) | Ja (Umstellung legacy_available → inventory_item) | Robin | Robin (Migration) |
| **Bestandsmigration (Release → inventory_item)** | Ja (idempotentes Script) | Nein (einmaliger Vorgang) | — | Ja (Staging zuerst, dann Production) | — | Ist die Datenmigration | Ja (DELETE + Re-Run) | Nein | Robin | Robin |
| **§25a Differenzbesteuerung** | Ja | Ja (ERP_TAX_25A) | Ja | Ja (Test-Records auf Staging) | Ja (alte Verkäufe ohne, neue mit Record) | Nein | Ja (Flag → false, 30s) | Nein (Stichtag) | Robin + StB (Pflicht) | Robin + StB |
| **Kommissionsabrechnung** | Ja | Ja (ERP_COMMISSION) | Ja | Ja (Test-Settlement mit Fake-Daten) | Nein (Kommission ist neu, kein Alt-System) | Nein (neues Modul) | Ja (Flag → false, offene Drafts bleiben) | Nein | Robin + Frank + StB | Frank (Abrechnungen) |
| **DATEV-Export** | Ja | Ja (Teil von ERP_INVOICING) | Ja | Ja (Export auf Staging) | — (Read-only, kein Parallelbetrieb-Problem) | Nein | Ja (einfach nicht exportieren) | Nein | Robin + StB (Format validieren) | Robin (Export) |
| **Marketplace (Seller-Tabellen)** | Ja | Ja (ERP_MARKETPLACE) | Ja (Tabellen existieren, kein UI) | Nein (erst bei vollständigem Flow) | — (neues Modul) | Nein | Ja (Tabellen bleiben, Flag → false) | Nein | — (Tabellen sind passiv) | — |
| **Marketplace (Seller-Onboarding)** | Nein (eigener Meilenstein) | Ja (ERP_MARKETPLACE) | Ja | Ja (3-5 eingeladene Test-Seller) | — | Nein | Ja (Onboarding-Flow deaktivieren) | Nein | Robin + Frank + Anwalt | Robin |
| **Marketplace (Stripe Connect Payouts)** | Nein (Stripe Connect Application nötig) | Ja (ERP_MARKETPLACE) | Nein (echtes Geld) | Ja (Stripe Test-Mode) | — | Nein | Ja (Flag → false, Payouts stoppen) | Nein (Payouts einzeln steuerbar) | Robin + Frank + Anwalt | Robin + Frank |

**Legende der Aktivierungsstufen:**

Jede Komponente durchläuft diese Stufen:

| Stufe | Beschreibung | Kriterium |
|-------|-------------|-----------|
| **1. Technisch deployed** | Code auf Production, Tabellen existieren, Flag = false | Code-Review bestanden, Tests grün |
| **2. Dark/Inaktiv** | Feature deployed, aber keine Auswirkung auf laufende Prozesse | Flag = false, Tabellen leer oder nur Testdaten |
| **3. Intern nutzbar** | Admin kann Feature sehen und testen, Käufer nicht betroffen | Flag = true auf Staging, false auf Production |
| **4. Selektiv live** | Feature für ausgewählte Vorgänge aktiv (z.B. nur neue Orders) | Flag = true auf Production, Stichtag-Logik |
| **5. Vollständig live** | Feature für alle Vorgänge aktiv, Fallback entfernt | Flag entfernt, Code aufgeräumt (nach 3 Monaten) |

### 9.4 Aktivierungsentscheidung: Wer entscheidet, nach welchen Kriterien?

| Komponente | Entscheider | Kriterien für Aktivierung |
|------------|-------------|---------------------------|
| Sendcloud | Robin + Frank | Sendcloud-Account eingerichtet, DHL-GK-Nr vorhanden, 3 Test-Labels erfolgreich erstellt |
| Rechnungen | Robin + Frank + StB | sevDesk/easybill konfiguriert, §25a-Setup validiert, 5 Testrechnungen korrekt, StB hat Kontenplan bestätigt |
| Bestandsmigration | Robin | Migration auf Staging erfolgreich, Anzahl stimmt, Spot-Check 20 Artikel korrekt |
| §25a-Tracking | Robin + StB | StB hat Berechnungslogik validiert, 10 Test-Records korrekt, Margen stimmen |
| Kommission | Robin + Frank | Erster Kommissionsgeber bereit, Vertrag vorhanden, End-to-End-Test auf Staging |
| DATEV-Export | Robin + StB | StB hat Export-Format validiert, 1 Monat Testdaten exportiert |
| Marketplace | Robin + Frank + Anwalt | Stripe Connect genehmigt, DAC7-Reporting implementiert, §22f/§25e validiert |

### 9.5 Rollback-Strategie pro Komponente

| Komponente | Rollback-Methode | Datenverlust? | Zeitaufwand |
|------------|-----------------|---------------|-------------|
| **Sendcloud** | Feature Flag → false. Zurück zu manuellem Versand. Bereits erstellte Labels bleiben gültig | Nein | 30 Sekunden (Flag umschalten) |
| **Rechnungen** | Feature Flag → false. Bereits erstellte Rechnungen bleiben in sevDesk/easybill. Neue Orders erhalten keine automatische Rechnung | Nein | 30 Sekunden |
| **Bestandsmigration** | `DELETE FROM inventory_item WHERE source = 'frank_collection' AND created_at > [Migrations-Zeitpunkt]`. Release-Tabelle ist unverändert | Migrations-Daten gelöscht, aber reproduzierbar | 5 Minuten |
| **§25a-Tracking** | Feature Flag → false. Bestehende tax_margin_records bleiben. Neue Verkäufe erzeugen keine Records | Nein | 30 Sekunden |
| **Kommission** | Feature Flag → false. Offene Settlements bleiben in Status 'draft'. Keine neuen Settlements möglich | Nein | 30 Sekunden |
| **DATEV-Export** | Feature Flag → false. Bereits exportierte Dateien bleiben | Nein | 30 Sekunden |

### 9.6 Mischbetrieb-Management: Alt und Neu koexistieren

In der Übergangsphase laufen alte und neue Logik parallel. Das ist unvermeidlich und muss sauber gehandhabt werden.

**Grundregel: Pro Prozess EIN Weg, nie hybrid.**

| Prozess | Alt (Flag = false) | Neu (Flag = true) | Hybrid erlaubt? |
|---------|--------------------|--------------------|-----------------|
| Versand | Admin tippt Tracking manuell ein, markiert als shipped | Sendcloud erstellt Label, Tracking automatisch | **NEIN.** Entweder manuell oder Sendcloud. Nie beides für die gleiche Order |
| Rechnung | Keine GoBD-Rechnung (nur PDF-Quittung) | sevDesk/easybill erstellt Rechnung automatisch | **NEIN.** Aber: Alte Orders (vor Aktivierung) haben keine Rechnung, neue schon. Das ist kein Hybrid, sondern ein Stichtag |
| Bestand | `Release.legacy_available` bestimmt Verfügbarkeit | `inventory_item.status` bestimmt Verfügbarkeit | **ÜBERGANGSPHASE:** Bis Migration abgeschlossen ist, gilt `legacy_available`. Danach gilt `inventory_item`. Kein paralleles Lesen beider Quellen für den gleichen Artikel |
| §25a | Keine Steuerberechnung im System | tax_margin_record pro Verkauf | **NEIN.** Aber: Alte Verkäufe haben keinen Record, neue schon |

**Konsequenz für die Admin-UI:**
Der Admin sieht in der Übergangsphase möglicherweise:
- Orders ohne Rechnung (alt) und Orders mit Rechnung (neu) in der gleichen Liste
- Orders ohne Tracking (alt) und Orders mit automatischem Tracking (neu)

Das ist akzeptabel, solange die Darstellung klar macht, welcher Status gilt. Die Orders-Liste erhält ein diskretes Badge ("Rechnung: -" vs. "Rechnung: VOD-INV-..."), das den Unterschied sichtbar macht, ohne zu verwirren.

### 9.7 Konkretes Beispiel: Sendcloud von Entwicklung bis Aktivierung

Dieses Beispiel illustriert den Lebenszyklus einer Komponente von der ersten Code-Zeile bis zur produktiven Nutzung:

**Woche 5: Entwicklung**
1. Branch `feature/erp-sendcloud` wird von `develop` abgezweigt
2. `lib/sendcloud.ts` wird implementiert (API-Client: createParcel, getParcel, createLabel)
3. Webhook-Route `/webhooks/sendcloud` wird implementiert
4. Admin-UI: "Create Label"-Button auf Order-Detail-Seite (hinter `ERP_SENDCLOUD`-Flag)
5. Tests gegen Sendcloud Sandbox-API

**Woche 6: Integration**
1. Branch wird nach `develop` gemergt
2. Staging-Deployment: Feature Flag `ERP_SENDCLOUD = true` auf Staging
3. Frank testet: 5 Test-Labels erstellen, prüft ob Labels druckbar sind
4. Robin prüft: Webhook-Events kommen an, `shipping_event` wird korrekt befüllt
5. Edge Cases: Was passiert wenn Sendcloud-API nicht erreichbar? (Retry-Logik, Fehlermeldung im Admin)

**Woche 7: Staging → Production Deploy**
1. `develop` wird nach `main` gemergt (Release-Tag)
2. VPS: `git pull && npx medusa build && pm2 restart`
3. Feature Flag `ERP_SENDCLOUD = false` in Production (!)
4. Sendcloud-Code ist deployed, aber inaktiv

**Woche 8: Aktivierung**
1. Sendcloud Production-Account ist eingerichtet (DHL-GK-Nr vorhanden)
2. Robin schaltet `ERP_SENDCLOUD = true` im Admin Config Panel
3. Nächste bezahlte Order: Admin sieht "Create Label"-Button
4. Frank erstellt erstes echtes Label, druckt es, klebt es auf Paket
5. DHL holt Paket ab → Sendcloud Webhook → `fulfillment_status = 'shipped'` automatisch

**Wenn etwas schiefgeht:**
- Sendcloud-API antwortet mit 500 → Admin sieht Fehlermeldung, kann manuell weiterarbeiten
- DHL-GK-Nr ist ungültig → Sendcloud lehnt Label ab → Admin kontaktiert DHL
- Generelles Problem → Robin schaltet `ERP_SENDCLOUD = false` → sofort zurück zum manuellen Workflow

### 9.8 Empfohlene Aktivierungsreihenfolge

```
Woche 1-2:  DB-Tabellen (alle) → deployed, alle Flags = false
            │
Woche 3-4:  Sendcloud → aktivierbar (unabhängig)
            sevDesk/easybill → aktivierbar (unabhängig)
            │
Woche 5:    Bestandsmigration → einmalig ausführen
            │
Woche 6:    DATEV-Export → aktivierbar (nach Rechnungen)
            │
Woche 7:    §25a-Tracking → nach Steuerberater-Freigabe
            │
Woche 8:    Kommission → wenn erster Kommissionsgeber bereitsteht
            │
Später:     Marketplace → eigener Meilenstein
```

---

## 10. Datenmodell / Kernobjekte

### 10.1 Designprinzipien

1. **Trennung:** Produktstamm (`Release`) bleibt unverändert. Neue ERP-Daten in eigenen Tabellen. Keine Änderung an Legacy-Spalten.
2. **Audit:** Jede Bestandsbewegung wird als Event gespeichert (`inventory_movement`). Keine direkte Statusänderung ohne Movement-Eintrag.
3. **Flexibilität:** `tax_scheme` und `source` sind Ableitungen, können aber übersteuert werden. Admin-Override mit Audit-Log.
4. **Marketplace-Ready:** `seller_id` als Fremdschlüssel auf allen relevanten Tabellen von Anfang an — nullable, aber strukturell vorhanden.
5. **Settlement-Genauigkeit:** Jede Abrechnungsposition ist einzeln nachvollziehbar. Keine Aggregat-only-Tabellen.

### 10.2 Tabellen

```sql
-- =============================================================================
-- BESTANDSFÜHRUNG
-- =============================================================================

-- Bestandseinheit: Jeder physische Artikel im VOD-Besitz/-Lager
-- Für Modell 0, A, C — NICHT für Modell B (Seller verwaltet selbst)
CREATE TABLE inventory_item (
    id TEXT PRIMARY KEY,                           -- ULID via generateEntityId()
    release_id TEXT NOT NULL,                      -- FK zu Release(id)
    
    -- Quelle und Eigentum
    source TEXT NOT NULL                            -- 'frank_collection' | 'commission' | 'vod_records'
        CHECK (source IN ('frank_collection', 'commission', 'vod_records')),
    commission_owner_id TEXT                        -- FK zu commission_owner(id), nur bei source='commission'
        REFERENCES commission_owner(id),
    seller_id TEXT,                                 -- FK zu seller(id), NULL für Modell 0/A/C
                                                   -- Strukturell vorhanden für spätere Marketplace-Erweiterung
    
    -- Einkauf
    purchase_price NUMERIC(10,2),                  -- Einkaufspreis in EUR (für §25a-Marge)
                                                   -- NULL = unbekannt (z.B. Franks alte Sammlung)
                                                   -- 0 = bewusst kostenlos erhalten
    purchase_date DATE,                            -- Datum des Einkaufs/der Übernahme
    purchase_reference TEXT,                        -- Verweis auf Beleg (Quittung, Übernahmeprotokoll)
    
    -- Steuerschema (abgeleitet, aber überschreibbar)
    tax_scheme TEXT NOT NULL DEFAULT 'margin_scheme_25a'
        CHECK (tax_scheme IN ('margin_scheme_25a', 'standard', 'exempt')),
    tax_scheme_override BOOLEAN DEFAULT false,     -- true wenn Admin manuell geändert hat
    tax_scheme_override_reason TEXT,               -- Pflicht wenn override = true
    
    -- Lager
    warehouse_location TEXT,                       -- Freitext: "Regal A3", "Box 17", "Palette 2"
    condition TEXT                                  -- Goldmine-Standard
        CHECK (condition IN ('mint', 'near_mint', 'very_good_plus', 'very_good', 
                             'good_plus', 'good', 'fair', 'poor', 'unknown')),
    
    -- Bestand
    quantity INTEGER NOT NULL DEFAULT 1,           -- 1 für Modell 0/A, >1 für Modell C
    quantity_reserved INTEGER NOT NULL DEFAULT 0,  -- In Auktion oder Warenkorb reserviert
    quantity_available INTEGER GENERATED ALWAYS AS (quantity - quantity_reserved) STORED,
    
    -- Status (des gesamten Postens)
    status TEXT NOT NULL DEFAULT 'in_stock'
        CHECK (status IN ('in_stock', 'reserved', 'in_auction', 'sold', 'shipped', 
                          'returned', 'damaged', 'written_off')),
    
    -- Provision (nur bei Commission)
    commission_rate NUMERIC(5,2),                  -- Provision % für VOD (z.B. 25.00 = 25%)
    
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


-- Bestandsbewegungen: Jede Änderung am Bestand wird als Event gespeichert
CREATE TABLE inventory_movement (
    id TEXT PRIMARY KEY,
    inventory_item_id TEXT NOT NULL REFERENCES inventory_item(id),
    
    type TEXT NOT NULL
        CHECK (type IN (
            'inbound',              -- Wareneingang (Einlagerung)
            'reservation',          -- Reservierung (Auktion/Warenkorb)
            'reservation_release',  -- Reservierung aufgehoben
            'sale',                 -- Verkauf (Payment confirmed)
            'shipment',             -- Versand (Label erstellt)
            'delivery',             -- Zustellung (Carrier-Bestätigung)
            'return_inbound',       -- Retoure eingegangen
            'return_processed',     -- Retoure verarbeitet
            'adjustment',           -- Manuelle Korrektur (Inventur, Beschädigung)
            'write_off'             -- Abschreibung
        )),
    
    quantity_change INTEGER NOT NULL,              -- positiv = Zugang, negativ = Abgang
    
    -- Referenzen
    transaction_id TEXT,                           -- FK zu transaction(id)
    block_item_id TEXT,                            -- FK zu block_item(id)
    settlement_id TEXT,                            -- FK zu commission_settlement(id)
    
    reference TEXT,                                -- Freitext: Lieferschein-Nr, Quittungs-Nr
    reason TEXT,                                   -- Begründung (Pflicht bei adjustment/write_off)
    performed_by TEXT,                             -- Admin-Email oder 'system'
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_movement_item ON inventory_movement(inventory_item_id);
CREATE INDEX idx_inventory_movement_type ON inventory_movement(type);
CREATE INDEX idx_inventory_movement_transaction ON inventory_movement(transaction_id) WHERE transaction_id IS NOT NULL;


-- =============================================================================
-- KOMMISSION
-- =============================================================================

CREATE TABLE commission_owner (
    id TEXT PRIMARY KEY,
    
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address_line1 TEXT,
    address_city TEXT,
    address_postal_code TEXT,
    address_country TEXT DEFAULT 'DE',
    
    -- Steuerliche Identifikation
    tax_id TEXT,
    vat_id TEXT,
    is_business BOOLEAN NOT NULL DEFAULT false,
    is_small_business BOOLEAN DEFAULT false,       -- Kleinunternehmer §19
    
    -- Konditionen
    default_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 25.00,
    contract_start_date DATE,
    contract_end_date DATE,
    contract_notes TEXT,
    
    -- Bankverbindung
    iban TEXT,
    bic TEXT,
    bank_name TEXT,
    account_holder TEXT,
    
    -- Aggregierte Werte (periodisch neu berechnet)
    total_items INTEGER NOT NULL DEFAULT 0,
    total_sold INTEGER NOT NULL DEFAULT 0,
    total_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_paid_out NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_outstanding NUMERIC(10,2) NOT NULL DEFAULT 0,
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE commission_settlement (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES commission_owner(id),
    
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    
    items_sold INTEGER NOT NULL,
    gross_revenue NUMERIC(10,2) NOT NULL,
    commission_amount NUMERIC(10,2) NOT NULL,
    additional_costs NUMERIC(10,2) DEFAULT 0,
    payout_amount NUMERIC(10,2) NOT NULL,
    
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
    
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payment_reference TEXT,
    
    external_document_id TEXT,
    external_document_number TEXT,
    
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settlement_owner ON commission_settlement(owner_id);
CREATE INDEX idx_settlement_status ON commission_settlement(status);


CREATE TABLE settlement_line (
    id TEXT PRIMARY KEY,
    settlement_id TEXT NOT NULL REFERENCES commission_settlement(id) ON DELETE CASCADE,
    
    inventory_item_id TEXT NOT NULL REFERENCES inventory_item(id),
    transaction_id TEXT NOT NULL,
    release_id TEXT NOT NULL,
    
    sale_price NUMERIC(10,2) NOT NULL,
    purchase_price NUMERIC(10,2) NOT NULL,
    commission_rate NUMERIC(5,2) NOT NULL,
    commission_amount NUMERIC(10,2) NOT NULL,
    payout_amount NUMERIC(10,2) NOT NULL,
    
    tax_scheme TEXT NOT NULL,
    margin NUMERIC(10,2),
    vat_on_margin NUMERIC(10,2),
    
    sale_date DATE NOT NULL,
    article_description TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settlement_line_settlement ON settlement_line(settlement_id);
CREATE INDEX idx_settlement_line_inventory ON settlement_line(inventory_item_id);


-- =============================================================================
-- STEUER-TRACKING
-- =============================================================================

CREATE TABLE tax_margin_record (
    id TEXT PRIMARY KEY,
    
    transaction_id TEXT NOT NULL,
    inventory_item_id TEXT NOT NULL REFERENCES inventory_item(id),
    release_id TEXT NOT NULL,
    
    purchase_price NUMERIC(10,2) NOT NULL,
    sale_price NUMERIC(10,2) NOT NULL,
    margin NUMERIC(10,2) NOT NULL,                 -- MAX(sale_price - purchase_price, 0)
    vat_on_margin NUMERIC(10,2) NOT NULL,          -- 19/119 * margin
    net_revenue NUMERIC(10,2) NOT NULL,
    
    tax_scheme TEXT NOT NULL DEFAULT 'margin_scheme_25a'
        CHECK (tax_scheme IN ('margin_scheme_25a', 'standard')),
    
    source TEXT NOT NULL,
    commission_owner_id TEXT,
    
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validated_by TEXT,
    validated_at TIMESTAMPTZ
);

CREATE INDEX idx_tax_margin_transaction ON tax_margin_record(transaction_id);
CREATE INDEX idx_tax_margin_source ON tax_margin_record(source);
CREATE INDEX idx_tax_margin_date ON tax_margin_record(calculated_at);


-- =============================================================================
-- RECHNUNGEN
-- =============================================================================

CREATE TABLE invoice (
    id TEXT PRIMARY KEY,
    
    transaction_id TEXT,
    order_group_id TEXT,
    
    external_provider TEXT NOT NULL
        CHECK (external_provider IN ('sevdesk', 'easybill')),
    external_id TEXT NOT NULL,
    external_number TEXT NOT NULL,
    external_pdf_url TEXT,
    
    invoice_type TEXT NOT NULL DEFAULT 'invoice'
        CHECK (invoice_type IN ('invoice', 'credit_note', 'cancellation')),
    related_invoice_id TEXT,
    
    total_gross NUMERIC(10,2) NOT NULL,
    total_net NUMERIC(10,2),
    total_vat NUMERIC(10,2),
    tax_scheme TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    
    customer_name TEXT,
    customer_email TEXT,
    
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'sent', 'paid', 'overdue', 'cancelled')),
    
    datev_exported BOOLEAN DEFAULT false,
    datev_exported_at TIMESTAMPTZ,
    datev_export_batch TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_transaction ON invoice(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_invoice_order_group ON invoice(order_group_id) WHERE order_group_id IS NOT NULL;
CREATE INDEX idx_invoice_external ON invoice(external_provider, external_id);
CREATE INDEX idx_invoice_status ON invoice(status);


CREATE TABLE invoice_line (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
    
    release_id TEXT,
    inventory_item_id TEXT,
    description TEXT NOT NULL,
    
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price_gross NUMERIC(10,2) NOT NULL,
    unit_price_net NUMERIC(10,2),
    vat_rate NUMERIC(5,2),
    vat_amount NUMERIC(10,2),
    total_gross NUMERIC(10,2) NOT NULL,
    
    tax_scheme TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_line_invoice ON invoice_line(invoice_id);


-- =============================================================================
-- VERSAND (Sendcloud-Events)
-- =============================================================================

CREATE TABLE shipping_event (
    id TEXT PRIMARY KEY,
    
    transaction_id TEXT NOT NULL,
    order_group_id TEXT,
    
    sendcloud_parcel_id TEXT,
    sendcloud_shipment_id TEXT,
    carrier TEXT,
    tracking_number TEXT,
    tracking_url TEXT,
    label_url TEXT,
    
    event_type TEXT NOT NULL
        CHECK (event_type IN (
            'label_created', 'picked_up', 'in_transit', 'out_for_delivery',
            'delivered', 'delivery_failed', 'returned_to_sender', 'cancelled'
        )),
    event_timestamp TIMESTAMPTZ NOT NULL,
    event_message TEXT,
    
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shipping_event_transaction ON shipping_event(transaction_id);
CREATE INDEX idx_shipping_event_tracking ON shipping_event(tracking_number) WHERE tracking_number IS NOT NULL;
CREATE INDEX idx_shipping_event_type ON shipping_event(event_type);


-- =============================================================================
-- MARKETPLACE (strukturell vorhanden, operativ später aktiviert)
-- =============================================================================

CREATE TABLE seller (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    
    address_line1 TEXT,
    address_city TEXT,
    address_postal_code TEXT,
    address_country TEXT DEFAULT 'DE',
    
    seller_type TEXT NOT NULL DEFAULT 'private'
        CHECK (seller_type IN ('private', 'small_business', 'business')),
    tax_id TEXT,
    vat_id TEXT,
    f22_certificate_uploaded BOOLEAN DEFAULT false,
    f22_certificate_valid_until DATE,
    
    stripe_connect_account_id TEXT,
    stripe_connect_onboarded BOOLEAN DEFAULT false,
    payout_iban TEXT,
    
    fee_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'active', 'suspended', 'closed')),
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    
    dac7_exempt BOOLEAN DEFAULT false,
    dac7_last_reported_year INTEGER,
    
    total_listings INTEGER DEFAULT 0,
    total_sold INTEGER DEFAULT 0,
    total_revenue NUMERIC(10,2) DEFAULT 0,
    total_fees_paid NUMERIC(10,2) DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_seller_status ON seller(status);
CREATE INDEX idx_seller_stripe ON seller(stripe_connect_account_id) WHERE stripe_connect_account_id IS NOT NULL;


CREATE TABLE seller_listing (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL REFERENCES seller(id),
    release_id TEXT,
    
    title TEXT NOT NULL,
    description TEXT,
    condition TEXT,
    images JSONB,
    
    listing_type TEXT NOT NULL DEFAULT 'fixed_price'
        CHECK (listing_type IN ('fixed_price', 'auction')),
    price NUMERIC(10,2),
    
    shipping_cost_de NUMERIC(10,2),
    shipping_cost_eu NUMERIC(10,2),
    shipping_cost_world NUMERIC(10,2),
    
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

### 10.3 Entity-Relationship-Überblick

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
                → seller (bei Marketplace, später)

commission_owner
    ↓ 1:N
commission_settlement (Abrechnung)
    ↓ 1:N
settlement_line (einzelne verkaufte Artikel)

transaction → tax_margin_record (§25a Nachweis)
            → shipping_event (Sendcloud Events)
```

### 10.4 Migrationsstrategie für Bestandsdaten

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
        ELSE 'sold'
    END,
    1                                              -- quantity
FROM "Release"
WHERE "coverImage" IS NOT NULL;
```

Diese Migration ist non-destructive: Die `Release`-Tabelle wird nicht verändert.

### 10.5 API-Endpunkte für ERP-Bereich

Alle neuen Endpunkte liegen unter `/admin/erp/` und sind durch das bestehende Admin-Auth geschützt. Jeder Endpunkt prüft den zugehörigen Feature Flag.

```
# ─── BESTAND ────────────────────────────────────────────────────────────────
GET    /admin/erp/inventory                    # Liste aller Bestandseinheiten
GET    /admin/erp/inventory/:id                # Detail inkl. Bewegungshistorie
POST   /admin/erp/inventory/inbound            # Wareneingang buchen
POST   /admin/erp/inventory/:id/adjust         # Manuelle Bestandskorrektur
GET    /admin/erp/inventory/movements          # Alle Bestandsbewegungen
POST   /admin/erp/inventory/migrate            # Einmalige Migration (idempotent)

# ─── RECHNUNGEN ─────────────────────────────────────────────────────────────
GET    /admin/erp/invoices                     # Rechnungsliste
GET    /admin/erp/invoices/:id                 # Rechnungsdetail
GET    /admin/erp/invoices/:id/pdf             # PDF-Download
POST   /admin/erp/invoices/create              # Rechnung manuell erstellen
POST   /admin/erp/invoices/:id/cancel          # Stornierung → Gutschrift

# ─── DATEV ──────────────────────────────────────────────────────────────────
POST   /admin/erp/datev/export                 # DATEV-Monatsexport generieren
GET    /admin/erp/datev/download/:filename     # CSV-Download

# ─── VERSAND ────────────────────────────────────────────────────────────────
GET    /admin/erp/shipping                     # Offene Sendungen, Tracking
POST   /admin/erp/shipping/label               # Einzelnes Label erstellen
POST   /admin/erp/shipping/batch               # Batch-Labels
POST   /admin/erp/shipping/return-label        # Retouren-Label
POST   /webhooks/sendcloud                     # Sendcloud Tracking-Events

# ─── KOMMISSION ─────────────────────────────────────────────────────────────
GET    /admin/erp/commission/owners            # Kommissionsgeber-Liste
GET    /admin/erp/commission/owners/:id        # Detail + Abrechnungshistorie
POST   /admin/erp/commission/owners            # Neuen Kommissionsgeber anlegen
PATCH  /admin/erp/commission/owners/:id        # Stammdaten aktualisieren
POST   /admin/erp/commission/settle            # Abrechnung erstellen
GET    /admin/erp/commission/settlements/:id   # Settlement-Detail
GET    /admin/erp/commission/settlements/:id/pdf # Settlement-PDF
POST   /admin/erp/commission/settlements/:id/approve  # Freigabe
POST   /admin/erp/commission/settlements/:id/mark-paid # Als bezahlt markieren

# ─── STEUER ─────────────────────────────────────────────────────────────────
GET    /admin/erp/tax/overview                 # §25a-Übersicht
GET    /admin/erp/tax/report                   # Steuerreport für Zeitraum
GET    /admin/erp/tax/margin-records           # §25a Margen-Aufzeichnungen

# ─── ERP DASHBOARD ──────────────────────────────────────────────────────────
GET    /admin/erp/dashboard                    # KPIs, Tagesumsatz, Bestandswert
```

### 10.6 Admin-UI: ERP Hub

Der ERP-Bereich wird als neuer Hub-Eintrag in der Admin-Navigation eingefügt:

```
Dashboard | Auction Blocks | Orders | Catalog | Marketing | Operations | ERP | AI Assistant
```

**ERP Hub-Seite (`/app/erp/page.tsx`) mit 6 Karten:**

| Karte | Sub-Page | Beschreibung |
|-------|----------|-------------|
| Lager / Bestand | `/app/erp/inventory` | Bestandsübersicht, Wareneingang, Bewegungshistorie |
| Rechnungen | `/app/erp/invoices` | Rechnungsliste, sevDesk-Status, PDF-Download |
| Versand | `/app/erp/shipping` | Offene Sendungen, Label-Erstellung, Batch-Druck |
| Kommission | `/app/erp/commission` | Kommissionsgeber, Abrechnungen, Auszahlungen |
| Finanzen / DATEV | `/app/erp/finance` | Tagesumsatz, Monatsreport, DATEV-Export |
| Steuern / §25a | `/app/erp/tax` | §25a-Übersicht, Marge-Tracking, Steuerreport |

Jede Sub-Page folgt dem bestehenden Admin Design System. Kein `defineRouteConfig` auf Sub-Pages.

---

## 11. Architekturentscheidung / Bewertungsmatrix

### 11.1 Optionen

**Option A: Composable Stack**
```
Medusa.js Backend (bestehend)
├── Sendcloud → Versand (160+ Carrier, Labels, Tracking, Returns)
├── sevDesk/easybill → Rechnungen, DATEV, §25a
├── Custom ERP-Modul → Bestandsführung, Kommission, §25a-Tracking
└── Admin ERP Hub → Zentrale Arbeitsoberfläche
```

**Option B: Billbee als Operations-Layer**
```
Medusa.js Backend (bestehend)
├── Billbee → Orders, Rechnungen, Versand, Lager (alles in einem)
├── sevDesk → DATEV/Buchhaltung (Billbee exportiert dorthin)
└── Medusa Admin → Auktionen, Katalog (Billbee für Operations)
```

**Option C: Xentral (vollständiges ERP)**
```
Medusa.js Backend (Storefront + Auktionen)
├── Xentral → Alles: Lager, Rechnungen, Versand, Buchhaltung, DATEV
└── Medusa → nur noch Verkaufskanal
```

### 11.2 Bewertungsmatrix

Gewichtung 1-5 (5 = höchste Wichtigkeit). Bewertung 1-5 (5 = beste Erfüllung).

| Kriterium | Gewicht | A: Composable | B: Billbee | C: Xentral |
|-----------|---------|:---:|:---:|:---:|
| Fit für alle 4 Geschäftsmodelle | 5 | 5 | 2 | 3 |
| Fit für Kommissionsabrechnung | 4 | 4 | 2 | 3 |
| Fit für Marketplace (Seller-Payout) | 4 | 4 | 1 | 2 |
| Fit für §25a Differenzbesteuerung | 5 | 4 | 2 | 3 |
| Flexibilität (eigene Workflows) | 4 | 5 | 2 | 3 |
| Betriebsaufwand (laufend) | 3 | 3 | 4 | 4 |
| Integrationsrisiko | 4 | 4 | 2 | 2 |
| Datenhoheit | 3 | 5 | 3 | 3 |
| Spätere Umbaukosten | 3 | 4 | 2 | 3 |
| Marketplace von Anfang an mitdenkbar | 5 | 5 | 1 | 2 |
| Release-Fähigkeit (parallel entwickelbar) | 4 | 5 | 3 | 2 |
| Modulare Komponentenübernahme | 4 | 5 | 2 | 2 |
| Monatliche Kosten | 3 | 5 | 4 | 2 |
| Entwicklungsaufwand (einmalig) | 3 | 2 | 3 | 3 |
| | | | | |
| **Gewichtete Summe** | | **258** | **138** | **152** |

### 11.3 Begründung

**Option A — Composable (258 Punkte):**
- Perfekter Fit für alle 4 Modelle, weil alles custom gebaut wird
- Volle Kontrolle über Kommission und §25a
- Marketplace-Datenmodell von Tag 1 integrierbar
- Jede Komponente einzeln aktivierbar
- Nachteil: Höherer Einmalaufwand (6-8 Wochen Custom-Entwicklung)
- Nachteil: Custom Code = eigene Wartung

**Option B — Billbee (138 Punkte):**
- Starke Standard-Features für Single-Seller E-Commerce
- Kein Kommissionsmodul, kein Marketplace-Support
- §25a nur über Workarounds
- Medusa→Billbee-Connector muss gebaut werden (2-3 Wochen)
- Zweites Admin-System neben Medusa
- Nicht parallel entwickelbar (Feature-Flags nicht möglich)

**Option C — Xentral (152 Punkte):**
- Vollständiges ERP mit WMS, Buchhaltung, DATEV
- Kein Auktionsmodell, kein Marketplace-Support
- 199-799 EUR/Monat — bei aktuellem Volumen nicht wirtschaftlich
- Medusa→Xentral-Connector: 3-4 Wochen
- Sinnvoll ab 100+ Orders/Tag mit Multi-Warehouse

**Wann die Empfehlung sich ändert:**
- Bei > 100 Orders/Tag und echtem Multi-Warehouse: Xentral evaluieren
- Bei Multi-Channel-Expansion (eBay/Discogs-Shop): Billbee evaluieren
- Bei Übernahme eines Händlers mit bestehendem ERP: dessen System evaluieren

---

## 12. Risiken, Sonderfälle und offene Punkte

### 12.1 Risikomatrix (Überblick)

| # | Risiko | Eintritt | Auswirkung | Gesamt | Maßnahme |
|---|--------|----------|------------|--------|----------|
| R1 | §25a falsch konfiguriert | Mittel | Hoch (Nachzahlung + Zinsen) | **Hoch** | StB-Validierung VOR Go-Live |
| R2 | Inkonsistenz Bestand ↔ Realität | Mittel | Mittel (Fehlverkäufe) | **Mittel** | Inventur-Funktion, Stichproben |
| R3 | sevDesk/easybill API-Ausfall | Gering | Mittel (keine Rechnungen) | **Gering** | Retry-Logik, Fallback: Manuell |
| R4 | Sendcloud Webhook verpasst | Gering | Gering (Status-Verzögerung) | **Gering** | Nächtlicher Batch-Abgleich |
| R5 | Feature-Flag-Mischzustand | Mittel | Mittel (Admin-Verwirrung) | **Mittel** | Klare Flag-Doku, Release-Checklist |
| R6 | Marketplace §25e Haftung | Gering (später) | Hoch (volle USt-Haftung) | **Mittel** | F22-Pflicht vor Seller-Onboarding |
| R7 | Retoure nach Settlement | Gering | Mittel (Rückforderung) | **Gering** | Vertragliche Regelung |
| R8 | Chargeback ohne Evidenz | Gering | Mittel (Verlust + Gebühr) | **Gering** | Sendcloud Tracking als Evidenz |
| R9 | Doppelte Rechnung (Race Condition) | Gering | Mittel (GoBD-Verstoß) | **Gering** | Idempotenz: UNIQUE Constraint |
| R10 | Migration Datenverlust | Gering | Hoch | **Mittel** | Backup, Staging-Test, Idempotenz |

### 12.2 Operative Risiken — Detailanalyse

#### 12.2.1 Teilretoure

**Szenario:** Käufer bestellt 3 Artikel in einer Combined Order (order_group_id). Einer kommt beschädigt an, Käufer retourniert diesen einen Artikel.

**Betroffene Systeme und deren Reaktion:**

| System | Aktion |
|--------|--------|
| **Order-Status** | Die Combined Order bleibt bestehen. Der retournierte Artikel erhält `fulfillment_status = 'returned'`. Die anderen beiden Artikel bleiben auf `delivered`. Die Order-Gruppe hat keinen einheitlichen Status mehr — das Admin-UI muss damit umgehen (Anzeige: "Teilweise retourniert") |
| **Bestand** | `inventory_item` des retournierten Artikels: `status → 'returned'`. Nach Prüfung: `→ 'in_stock'` (wenn unversehrt) oder `→ 'damaged'` (wenn Transportschaden). `inventory_movement`: `return_inbound`, dann `return_processed` |
| **Rechnung** | Gutschrift über den retournierten Artikel in sevDesk/easybill. Betrag = Artikelpreis. Versandkosten: anteilig oder gar nicht erstatten? (AGB-Entscheidung, siehe Abschnitt 14). Die Originalrechnung bleibt unverändert (GoBD) |
| **Settlement** | Falls der retournierte Artikel Kommissionsware war: Settlement-Korrektur im nächsten Zyklus (negative settlement_line). Falls bereits ausgezahlt: Verrechnung oder Rückforderung |
| **§25a-Record** | Der bestehende `tax_margin_record` bleibt (Audit-Trail). Bei Vollerstattung: Neuer Record mit negativem Betrag oder Verweis auf Storno. Steuerlich: Die Marge war falsch, muss in der USt-Erklärung korrigiert werden |
| **Stripe/PayPal** | Teilerstattung (partial refund) über API. Betrag = Artikelpreis (+ ggf. anteilige Versandkosten) |

**Implementierungskonsequenz:** Der Admin braucht einen "Teilretoure"-Flow, der:
1. Aus einer Combined Order einzelne Artikel zur Retoure markieren lässt
2. Den Erstattungsbetrag berechnet (Artikel + anteilige Versandkosten?)
3. Die Gutschrift in sevDesk/easybill erstellt
4. Den Bestand aktualisiert
5. Wenn Kommission: Die Settlement-Korrektur vorbereitet

#### 12.2.2 Beschädigte Ware

**Szenario A — Transportschaden (VOD-Versand):**
1. Käufer meldet: "Platte kam zerbrochen an"
2. Admin prüft Sendcloud-Versicherung (wenn gebucht): Schadensfall melden
3. Alternativ: DHL-Reklamation (Carrier-abhängig, oft langwierig)
4. Erstattung an Käufer (unabhängig vom Versicherungsstatus — VOD trägt das Risiko gegenüber dem Käufer)
5. Bestand: Kein Rücklauf in `in_stock`. Status bleibt `shipped` oder wird `damaged` (Artikel ist physisch beim Käufer oder verloren)
6. Bei Kommissionsware: VOD trägt den Verlust (nicht der Kommissionsgeber), es sei denn, der Kommissionsvertrag regelt etwas anderes
7. Versicherung zahlt ggf. an VOD zurück → separate Buchung (sonstige Erträge)

**Szenario B — Beschädigung im Lager (vor Verkauf):**
1. Admin entdeckt bei Picking: Plattenhülle beschädigt, Vinyl ok
2. `inventory_item.condition` → herabstufen (z.B. `very_good` → `good`)
3. `inventory_movement` type = 'adjustment', reason = "Hüllenschaden bei Lagerung"
4. Preisanpassung nötig? → Admin passt `legacy_price` oder Startpreis an
5. Bei irreparablem Schaden: `write_off`, Verlust in Buchhaltung (Bestandskorrektur)

**Szenario C — Käufer beschädigt und retourniert:**
1. Wertminderung nach §357 BGB abziehen
2. Erstattung = Kaufpreis - Wertminderung
3. Artikel geht in Bestand zurück mit reduziertem `condition`
4. Oder: write_off wenn unverkäuflich

#### 12.2.3 Storno nach Rechnungsstellung

**Szenario:** Rechnung VOD-INV-2026-00042 wurde in sevDesk erstellt und an den Käufer versendet. Jetzt stellt sich heraus: falscher Betrag / falscher Artikel / Käufer storniert.

**Prozess:**
1. Originalrechnung darf NICHT gelöscht oder geändert werden (GoBD)
2. Stornorechnung (Gutschrift) erstellen via sevDesk/easybill API:
   - Rechnungsnummer: VOD-CR-2026-NNNNN (Credit Note Nummernkreis)
   - Verweis auf Originalrechnung
   - Negativer Betrag
3. Erstattung an Käufer (Stripe/PayPal Refund)
4. DATEV: Gegenbuchung auf gleiche Konten (automatisch über sevDesk/easybill)
5. Wenn §25a: Der `tax_margin_record` wird durch einen Korrektur-Record ergänzt (negativer margin)
6. Falls bereits im DATEV-Export: Korrektur erscheint im nächsten Monatsexport

**Risiko:** Zwischen Rechnungserstellung und Storno vergehen möglicherweise Tage. In dieser Zeit könnte der DATEV-Export für den Monat bereits erstellt und an den Steuerberater übermittelt worden sein. Konsequenz: Der nächste DATEV-Export enthält die Korrektur. Der Steuerberater muss darauf hingewiesen werden.

#### 12.2.4 Chargeback

**Szenario:** Käufer reklamiert bei seiner Bank, Stripe bucht 65 EUR + 15 EUR Gebühr zurück.

**Auswirkung auf alle Systeme:**

| System | Konsequenz |
|--------|------------|
| **Transaction** | `status → 'chargeback'` (neuer Status nötig? oder unter 'failed' subsumieren) |
| **Bestand** | Ware ist beim Käufer und physisch nicht zurück. `inventory_item.status` bleibt `shipped` oder `delivered`. Kein Rücklauf in `in_stock`. Die Ware ist wirtschaftlich verloren |
| **Rechnung** | Stornorechnung erstellen (Gutschrift). Auch wenn der Käufer im Unrecht ist — die Buchung muss den Geldfluss abbilden |
| **Settlement** | Falls Kommissionsware: VOD trägt den Verlust (Chargeback-Gebühr). Die Kommissionsabrechnung wurde möglicherweise schon erstellt. Korrektur im nächsten Zyklus |
| **§25a-Record** | Korrektur-Record mit negativem Betrag |
| **Evidenz** | Sendcloud Tracking als Lieferbeweis einreichen. Bei "delivered"-Status: gute Chancen. Ohne Tracking: fast immer verloren |

**Chargeback bei Stripe Connect (Marketplace):**
Bei Marketplace-Transaktionen ist die Lage anders — Stripe Connect hat eigene Chargeback-Mechanismen. Der Chargeback wird vom Connected Account (Seller) getragen, nicht von der Plattform. Das muss im Marketplace-Onboarding klar kommuniziert werden.

#### 12.2.5 Doppelverkauf

**Szenario:** Der gleiche Artikel ist auf tape-mag.com (Legacy-Shop) und auf vod-auctions.com gelistet. Beide Käufer bezahlen gleichzeitig.

**Konsequenz:**
1. Der Artikel kann nur einmal geliefert werden
2. Ein Käufer muss storniert und erstattet werden (+ Entschuldigung)
3. `Release.legacy_available` wird durch den täglichen Legacy-Sync auf `false` gesetzt, aber zwischen zwei Sync-Läufen (bis zu 24h) kann ein Doppelverkauf auftreten

**Prävention:**
- Kurzfristig: Manuelle Prüfung bei hochpreisigen Artikeln vor Versand
- Mittelfristig: Legacy-Sync-Frequenz erhöhen (4x täglich statt 1x)
- Langfristig: ERP-Bestandsführung ist Single Source of Truth. `inventory_item.status = 'sold'` → tape-mag wird über API informiert (oder Listing wird automatisch deaktiviert)

#### 12.2.6 Nicht-Zahlung nach Auktion und Zweitplatzierter

**Szenario:** Höchstbietender (Bidder A) gewinnt Auktion mit 85 EUR, zahlt nicht. Zweitplatzierter (Bidder B) hatte Gebot von 72 EUR.

**Aktueller Prozess:** Nach 14 Tagen wird Bidder A storniert, Artikel geht zurück in Bestand. Kein automatisches Angebot an Bidder B.

**Mögliche ERP-Erweiterung (Phase 2+):** "Second Chance"-Funktion. Admin kann Bidder B kontaktieren und den Artikel zum Preis des Zweitgebots anbieten. Erfordert: Speicherung der Top-N-Gebote pro Lot (bereits vorhanden in `bid`-Tabelle).

### 12.3 Technische Risiken — Detailanalyse

#### 12.3.1 Feature Flag auf false vergessen

**Szenario:** ERP-Release wird deployed. `ERP_SENDCLOUD = true` wird gesetzt, aber `ERP_INVENTORY = true` wird vergessen. Folge: Labels werden erstellt, aber `inventory_item.status` wird nicht auf `sold` gesetzt. Bestand und Realität divergieren.

**Prävention:**
- Release-Checklist: Vor jedem Deploy alle Feature Flags prüfen
- Admin Config Panel: Dashboard-Karte zeigt alle Flags mit aktuellem Status
- Automatisierte Warnung: Wenn `ERP_SENDCLOUD = true` aber `ERP_INVENTORY = false` → gelber Hinweis im Admin
- Flag-Cleanup: Nach 3 Monaten Stabilität → Flag auf `true` hardcoden, Conditional Code entfernen

#### 12.3.2 DB-Migration die nicht rückgängig gemacht werden kann

**Szenario:** `CREATE TABLE inventory_item` und `INSERT INTO inventory_item SELECT ... FROM Release` (Bestandsmigration). Nach Aktivierung stellt sich heraus: 200 Artikel haben falschen Status.

**Prävention:**
- `CREATE TABLE` ist immer safe — leere Tabelle, keine Nebenwirkung
- `INSERT INTO` (Migration) ist riskant. Deshalb: Separates Script, NICHT in DB-Migration
- Idempotent: `INSERT ... ON CONFLICT DO NOTHING`
- Staging-Test: Migration auf Staging ausführen, Spot-Check 50 Artikel
- Rollback: `DELETE FROM inventory_item WHERE source = 'frank_collection' AND created_at > [Timestamp]`
- **Niemals**: `ALTER TABLE Release ...` (Legacy-Tabelle wird nie verändert)

#### 12.3.3 Sendcloud API-Downtime bei Peak

**Szenario:** Großer Auktionsblock endet (200 Lots). 150 Käufer zahlen innerhalb von 2 Stunden. Admin will 150 Labels auf einmal erstellen. Sendcloud-API antwortet mit 429 (Rate Limit) oder 503 (Downtime).

**Maßnahmen:**
- `lib/sendcloud.ts`: Exponentielles Backoff mit 3 Retries
- Batch-Label-Erstellung: Max 50 Labels pro API-Call (Sendcloud Limit)
- Queue-basierte Verarbeitung: Labels werden in eine Warteschlange gestellt, sequentiell abgearbeitet
- Fallback: Admin kann manuell Labels erstellen (DHL-Website) und Tracking-Nummer manuell eintragen
- Monitoring: Wenn > 10% der Label-Requests fehlschlagen → Admin-Alert

#### 12.3.4 sevDesk API Rate Limit bei Bulk-Invoicing

**Szenario:** 150 bezahlte Transactions → 150 Rechnungen sollen automatisch erstellt werden. sevDesk-Limit: 2 Requests/Sekunde.

**Maßnahmen:**
- `lib/sevdesk.ts`: Rate-Limiter (max 2 req/s, Queue-basiert)
- Batch-Invoicing: Nicht alle 150 sofort, sondern im Hintergrund über ~90 Sekunden verteilt
- Fehlerhafte Rechnungen: Status `failed` in `invoice`-Tabelle, Admin sieht Liste offener Rechnungen
- Retry-Logik: Fehlgeschlagene Rechnungen werden 3x nachversucht (mit Backoff)
- Manuelle Nachverarbeitung: Admin kann einzelne fehlgeschlagene Rechnungen manuell neu anstoßen

#### 12.3.5 Inkonsistenz zwischen inventory_item.status und transaction.status

**Szenario:** Stripe Webhook meldet `payment_intent.succeeded` → `transaction.status = 'paid'`. Der Handler für `inventory_item.status = 'sold'` schlägt fehl (DB-Timeout, Bug).

**Folge:** Transaction sagt "bezahlt", Bestand sagt "in_stock". Artikel könnte theoretisch ein zweites Mal verkauft werden.

**Prävention:**
- Transaktion (DB): Status-Updates von `transaction` und `inventory_item` in einer DB-Transaktion
- Wenn die DB-Transaktion fehlschlägt: Webhook antwortet mit 500 → Stripe/PayPal retried
- Monitoring: Cron-Job (täglich) prüft: Gibt es Transactions mit `status = 'paid'`, deren `inventory_item.status != 'sold'`? → Admin-Alert
- Heilung: Admin kann im ERP-Bereich die Inkonsistenz manuell korrigieren

#### 12.3.6 Webhook-Reihenfolge und Duplikate

**Szenario:** Stripe sendet `payment_intent.succeeded` zweimal (Retry). Oder Sendcloud sendet `delivered` bevor `in_transit`.

**Maßnahmen:**
- **Idempotenz:** UNIQUE-Constraint auf `(transaction_id, invoice_type)` für Rechnungen. Check auf Existenz für inventory_movements
- **Reihenfolge:** `shipping_event` speichert alle Events chronologisch. Der `fulfillment_status` wird nur auf den "höchsten" Status gesetzt (delivered > shipped > packing). Ein "in_transit"-Event nach "delivered" ändert den Status nicht
- **Stripe-spezifisch:** `payment_intent.id` als Idempotenz-Key. Webhook-Handler prüft: `transaction.status == 'paid'`? Dann skip

### 12.4 Steuerliche Risiken — Detailanalyse

#### 12.4.1 Falsche §25a-Klassifikation nach DATEV-Export

**Szenario:** 50 Artikel wurden als §25a verkauft und gebucht. Steuerberater stellt bei der Jahresabschluss-Prüfung fest: 5 dieser Artikel hätten unter Regelbesteuerung laufen müssen (Einkauf war doch mit USt-Rechnung).

**Konsequenz:**
- USt-Differenz nachzahlen (19% statt §25a-Marge)
- Möglicherweise Zinsen auf Nachzahlung
- Korrigierte Rechnungen ausstellen (Aufwand)
- DATEV-Korrektur-Export

**Prävention:**
- `tax_scheme_override`-Feld: Admin kann Steuerschema manuell setzen (mit Begründung)
- Validierungsregel: Wenn `source = 'commission'` und `commission_owner.is_business = true` → Warnung im Admin: "Prüfen Sie, ob USt auf Eingangsrechnung"
- Steuerberater-Review vor Go-Live: Stichprobe von 20 Artikeln
- Quartalsmäßige Stichprobe durch StB (empfohlen)

#### 12.4.2 Kommissionsgeber wird nachträglich als umsatzsteuerpflichtig erkannt

**Szenario:** Kommissionsgeber Max war als Privatperson eingestuft → §25a. Dann stellt sich heraus: Max hat ein Gewerbe und hätte USt-Rechnungen ausstellen müssen.

**Konsequenz:**
- Alle Artikel, die NACH der Gewerbeanmeldung übernommen wurden → Regelbesteuerung
- Alle Artikel, die VOR der Gewerbeanmeldung übernommen wurden → §25a bleibt (Zeitpunkt der Übernahme zählt)
- Bestandsanpassung: `inventory_item.tax_scheme` für betroffene Artikel ändern (mit Override-Flag und Grund)
- Noch nicht verkaufte Artikel: Korrektur möglich
- Bereits verkaufte Artikel: Steuerberater konsultieren, möglicherweise Nachversteuerung

**Implementierungskonsequenz:** Das System muss erlauben, den `tax_scheme` eines Artikels nachträglich zu ändern — mit Audit-Log, Begründung und Hinweis auf bereits existierende `tax_margin_records`.

#### 12.4.3 Gemischte Rechnung (§25a + Regelbesteuerung)

**Frage:** Darf eine einzelne Rechnung Positionen mit §25a UND Positionen mit Regelbesteuerung enthalten?

**Antwort:** Grundsätzlich ja — aber die Positionen müssen klar getrennt sein, und der USt-Ausweis muss pro Block korrekt sein. Der §25a-Block darf keinen separaten USt-Ausweis enthalten, der Regelbesteuerung-Block schon.

**Empfehlung:** Separate Rechnungen. Gründe:
- Einfacher in sevDesk/easybill (ein Steuerschema pro Rechnung)
- Sauberer im DATEV-Export
- Kein Risiko formfehlerhafter Mischrechnung
- Für den Käufer transparenter

**Implementierung:** Bei Combined Orders mit gemischtem Steuerschema → System erkennt automatisch → erstellt 2 separate Rechnungen → beide referenzieren die gleiche `order_group_id`.

#### 12.4.4 OSS-Schwelle überschritten, aber nicht registriert

**Szenario:** VOD liefert im Laufe des Jahres für 12.000 EUR an EU-Käufer. Die OSS-Schwelle (10.000 EUR) wurde in Monat 8 überschritten, aber niemand hat es bemerkt.

**Konsequenz:**
- Ab Überschreitung: USt des Bestimmungslandes fällig (nicht DE-USt)
- Nachzahlung der Differenz (z.B. 21% NL statt 19% DE)
- Registrierung beim BZSt nachträglich

**Prävention:**
- ERP Dashboard: Kumulierter EU-B2C-Umsatz pro Jahr (live)
- Warnschwelle: Bei 8.000 EUR → gelber Hinweis im Admin
- Bei 10.000 EUR → roter Hinweis: "OSS-Registrierung erforderlich"
- sevDesk/easybill können OSS-Steuersätze verwalten (muss vor Überschreitung konfiguriert sein)

### 12.5 Parallelbetrieb-Risiken — Detailanalyse

#### 12.5.1 Alter und neuer Versand-Workflow gleichzeitig aktiv

**Szenario:** `ERP_SENDCLOUD = true`, aber für eine spezielle Lieferung (z.B. sehr großes Paket, das Sendcloud nicht abbilden kann) will der Admin manuell ein Etikett erstellen.

**Lösung:** Der Admin-Order-Detail hat zwei Optionen:
1. "Create Sendcloud Label" (wenn `ERP_SENDCLOUD = true`)
2. "Mark as shipped (manual)" — bestehende Funktion, bleibt immer verfügbar

Der manuelle Weg wird NICHT deaktiviert. Er ist der Fallback für Edge Cases. Tracking-Nummer kann manuell eingetragen werden. Es entsteht kein `shipping_event` in Sendcloud, aber der `fulfillment_status` wird korrekt gesetzt.

#### 12.5.2 Zwei verschiedene "Order"-Ansichten im Admin

**Szenario:** Der bestehende `/admin/transactions`-Bereich (Orders) und der neue `/admin/erp/shipping`-Bereich zeigen beide offene Bestellungen, aber mit unterschiedlichen Daten.

**Lösung:** Klare Zuständigkeiten:
- `/admin/transactions` (Orders): Bestehende Ansicht. Zeigt Bestellstatus, Payment-Status, Fulfillment-Status. Bleibt unverändert und ist die primäre Arbeitsansicht
- `/admin/erp/shipping`: Neue Ansicht, fokussiert auf offene Versandaufgaben. Zeigt nur `fulfillment_status = 'unfulfilled'`-Orders mit "Create Label"-Button
- `/admin/erp/inventory`: Neue Ansicht, fokussiert auf Bestandsstatus

Es gibt bewusst Überschneidungen — aber jede Ansicht hat einen anderen Fokus. Der Admin soll nicht zwischen altem und neuem System wählen müssen, sondern beide als Ergänzungen verstehen.

#### 12.5.3 inventory_item.status divergiert von Release.legacy_available

**Szenario:** Legacy-Sync setzt `Release.legacy_available = false` (Artikel auf tape-mag verkauft). Aber `inventory_item.status = 'in_stock'` (ERP weiß nichts davon).

**Lösung (Übergangsphase):**
1. Solange `ERP_INVENTORY = false`: `legacy_available` ist führend (Status quo)
2. Wenn `ERP_INVENTORY = true`: `inventory_item.status` ist führend
3. Der Legacy-Sync muss erweitert werden: Wenn `legacy_available` sich ändert → entsprechenden `inventory_item.status` aktualisieren (mit `inventory_movement` type = 'adjustment', reason = 'legacy_sync')
4. Umgekehrt: Wenn `inventory_item.status → 'sold'` → `Release.legacy_available = false` setzen (für tape-mag-Kompatibilität)

**Langfristig:** `inventory_item` wird einzige Quelle. `legacy_available` wird nur noch für Abwärtskompatibilität geschrieben.

---

## 13. Klare Empfehlung

### 13.1 Bevorzugte Zielrichtung

**Option A: Composable Stack.** Die Kombination aus Auktionslogik, §25a, Kommission und späterem Marketplace ist zu spezifisch für Standard-ERP-Software. Die Eigenentwicklung beschränkt sich auf die Teile, die kein SaaS-Produkt liefert; Rechnungen, Versand und DATEV werden an spezialisierte Dienste delegiert.

### 13.2 Begründung

Kein Produkt am Markt kann Auktions-Blöcke + §25a-Differenzbesteuerung + Kommissionsabrechnung + Marketplace-Split-Payment in einer integrierten Lösung abbilden. Im Detail:

- **Billbee** (Option B) hat kein Kommissionsmodul, keinen Marketplace-Support und §25a nur über Workarounds. Die Medusa-Anbindung müsste ebenfalls custom gebaut werden (2-3 Wochen).
- **Xentral** (Option C) ist ein vollständiges ERP, aber ohne Auktionsmodell und ohne Marketplace-Support. Bei 199-799 EUR/Monat ist es beim aktuellen Volumen nicht wirtschaftlich.
- **Composable Stack** (Option A) gibt volle Kontrolle über die 4 Geschäftsmodelle, ermöglicht modulare Aktivierung einzelner Komponenten und hält die Marketplace-Architektur von Anfang an offen.

Der Mehraufwand für die Marketplace-Ready-Architektur beträgt ~2 Tage (2 Tabellen, seller_id-Spalten, Stripe Connect Application). Der Umbauaufwand, wenn der Marketplace später ohne Vorbereitung nachgerüstet werden muss, beträgt ~2-4 Wochen.

**Wann die Empfehlung sich ändert:**
- Bei > 100 Orders/Tag und echtem Multi-Warehouse: Xentral evaluieren
- Bei Multi-Channel-Expansion (eBay/Discogs-Shop): Billbee evaluieren
- Bei Übernahme eines Händlers mit bestehendem ERP: dessen System evaluieren

### 13.3 Voraussetzungen

Die folgenden Punkte müssen vor Implementierungsbeginn erfüllt sein:

| # | Voraussetzung | Verantwortlich | Status |
|---|--------------|----------------|--------|
| 1 | Steuerberater hat §25a-Grundkonfiguration validiert (Einzeldifferenz/Sammelberechnung, EK=0-Akzeptanz, Kontenplan) | StB + Robin | Offen |
| 2 | Entscheidung sevDesk oder easybill getroffen und Test-Account eingerichtet | Robin + Frank | Offen |
| 3 | DHL-Geschäftskundennummer beantragt (2-4 Wochen Vorlauf) | Frank | Offen |
| 4 | Staging-Umgebung (separate Supabase-DB) aufgesetzt | Robin | Offen |
| 5 | `develop`-Branch erstellt, Branching-Konvention dokumentiert | Robin | Offen |

### 13.4 Offene Validierungen

| # | Validierung | Blockiert |
|---|------------|-----------|
| V1 | §25a: Ist Franks Sammlung komplett unter §25a führbar? | Phase 2 + 4 |
| V2 | §25a: Einzeldifferenz oder Sammelberechnung? | Phase 4 |
| V3 | Kommission: §25a auf Außenumsatz bei privaten Kommissionsgebern? | Phase 5 |
| V4 | Kontenplan + BU-Schlüssel durch StB bestätigt? | Phase 2 (DATEV) |
| V5 | Rechnungsformulierung bei §25a durch StB genehmigt? | Phase 2 |
| V6 | Marketplace: §22f/§25e-Compliance vollständig geprüft? | Marketplace-Meilenstein |
| V7 | Marketplace: Stripe Connect Platform Application genehmigt? | Marketplace-Meilenstein |
| V8 | Marketplace: Rechtliche Einstufung VOD als Vermittler vs. Verkäufer bestätigt? | Marketplace-Meilenstein |

### 13.5 Freigabebedingungen vor Implementierung

Die Empfehlung für Option A ist stark begründet, aber die folgenden Punkte sind nicht abschließend geklärt und dürfen nicht als entschieden behandelt werden:

1. **Steuerliche Konfiguration:** Alle Annahmen zu §25a (EK=0, Sammelberechnung, Kommissionsfiktion) sind fachliche Zielannahmen, keine validierten Fakten. Die Implementierung der Steuerlogik darf erst beginnen, wenn der Steuerberater die Konfiguration schriftlich bestätigt hat.

2. **Rechnungssoftware:** Die Empfehlung für easybill basiert auf API-Vergleich und Preisstruktur. Die endgültige Entscheidung fällt nach einem Praxis-Test mit 5 echten Rechnungen (§25a + Regelbesteuerung + Mischfall).

3. **Marketplace:** Die strukturelle Vorbereitung (Tabellen, seller_id) ist risikoarm und wird empfohlen. Die operative Aktivierung des Marketplace erfordert eine separate Freigabe nach vollständiger Klärung der regulatorischen Pflichten (§22f, §25e, DAC7, Haftungsisolierung) und der rechtlichen Einstufung (Vermittler vs. Verkäufer).

4. **Kommissionsvertrag:** Ohne Vertragsvorlage (Rechtsanwalt) kann Phase 5 (Kommissionsabrechnung) nicht beginnen.

### 13.6 Bedingungen vor Go-Live einzelner Module

Jedes Modul hat eigene Go-Live-Bedingungen. Kein Modul geht live, ohne dass die zugehörigen Bedingungen erfüllt und dokumentiert sind.

| # | Bedingung | Modul | Entscheider |
|---|----------|-------|-------------|
| 1 | 3 Test-Labels erfolgreich erstellt und gedruckt (Sendcloud Production) | Sendcloud | Robin + Frank |
| 2 | StB hat Rechnungsformulierung (§25a + Standard) schriftlich genehmigt | Rechnungen | StB |
| 3 | 5 Testrechnungen in sevDesk/easybill korrekt (§25a + Standard + Misch) | Rechnungen | Robin |
| 4 | Migration auf Staging: Anzahl korrekt, Spot-Check 20 Artikel | Bestandsmigration | Robin |
| 5 | StB hat §25a-Berechnungslogik anhand von 10 Test-Records validiert | §25a-Tracking | StB |
| 6 | StB hat DATEV-Export-Format (1 Monat Testdaten) geprüft und freigegeben | DATEV | StB |
| 7 | Kommissionsvertrag-Vorlage liegt vor, erster Kommissionsgeber hat unterschrieben | Kommission | Frank + Anwalt |
| 8 | End-to-End-Test Kommission auf Staging (Eingang → Verkauf → Settlement → Auszahlung) | Kommission | Robin + Frank |

**Marketplace-Aktivierung (separater Meilenstein):** Stripe Connect genehmigt, §22f/§25e-Compliance geprüft, DAC7-Report implementiert, Seller-Vertrag vom Anwalt erstellt, F22-Prüfungsprozess implementiert, GmbH-Frage geklärt, 3-5 Test-Seller onboarded, Dispute-Prozess geprüft.

### 13.7 Externe Dienste

| Dienst | Empfehlung | Begründung |
|--------|-----------|------------|
| **Rechnungen** | easybill (Plus, 14 EUR/Monat) | Stärkere API, direkter DATEV-Datenservice, §25a manuell konfigurierbar |
| **Versand** | Sendcloud (Free) | 160+ Carrier, Labels, Tracking, Returns. Upgrade auf Growth (59 EUR/Monat) bei Bedarf |
| **Payment** | Stripe (bestehend) + Stripe Connect (Marketplace) | Bereits integriert. Connect für Seller-Payout |
| **DATEV** | Via easybill/sevDesk | Kein separater Dienst nötig |

### 13.8 Implementierungsplan

| Phase | Woche | Aufwand | Abhängigkeit |
|-------|-------|---------|--------------|
| 0: Vorbereitung | 0 | Parallel (extern) | Steuerberater, DHL, Stripe Connect |
| 1: Datenmodell | 1-2 | ~6 Tage | — |
| 2: Rechnungen + DATEV | 3-4 | ~10 Tage | sevDesk/easybill, §25a-Freigabe StB |
| 3: Versand | 5-6 | ~8,5 Tage | Sendcloud, DHL-GK-Nr |
| 4: Bestand + §25a | 7-8 | ~10 Tage | Phase 1 |
| 5: Kommission | 9-10 | ~9 Tage | Phase 1 + 4, Kommissionsvertrag |
| 6: Dashboard | 11 | ~5 Tage | Alle vorherigen |
| **Gesamt** | **~11 Wochen** | **~48,5 Tage** | |

### 13.9 Kostenübersicht

**Monatliche Kosten nach Implementierung:**

| Position                                         | Kosten                   |
| ------------------------------------------------ | ------------------------ |
| Sendcloud (Free → Growth bei > 400 Labels/Monat) | 0-59 EUR/Monat           |
| easybill Plus (oder sevDesk Buchhaltung)         | 14-18 EUR/Monat          |
| DHL Geschäftskunden (per Paket)                  | 0 EUR/Monat (Stückpreis) |
| Stripe Connect (nur Transaktionsgebühr)          | 0 EUR/Monat              |
| **Gesamt**                                       | **~14-77 EUR/Monat**     |

**Einmalige Kosten:**

| Position | Kosten |
|----------|--------|
| Steuerberater §25a-Setup | ~500-1.000 EUR |
| Rechtsberatung Kommissionsvertrag | ~500 EUR |
| Entwicklung (11 Wochen) | Intern |
| **Gesamt einmalig** | **~1.000-1.500 EUR** |

---

## 14. Offene fachliche Entscheidungen und Validierungsbedarfe

### 14.1 Blockierend (müssen vor Implementierungsbeginn geklärt werden)

| # | Entscheidung | Entscheider | Auswirkung auf |
|---|-------------|-------------|----------------|
| 1 | **Steuerberater: §25a-Konfiguration validieren.** Einzeldifferenz oder Sammelberechnung? Franks Sammlung komplett unter §25a? Kontenplan bestätigen. Rechnungsformulierung genehmigen | Steuerberater + Frank | Phase 2, 4 |
| 2 | **sevDesk ODER easybill?** Entscheidung nach: bestehender Account? API-Qualität? §25a-Unterstützung getestet? | Robin + Frank | Phase 2 |
| 3 | **Mischwarenkörbe:** Darf ein Käufer §25a-Ware und Regelbesteuerungs-Ware in einem Checkout kaufen? Wenn ja: separate Rechnungen | StB + Robin | Phase 2 |
| 4 | **Kommissionsprovision Standard-Satz:** 20%? 25%? 30%? Pro Kommissionsgeber verhandelbar? | Frank | Phase 5 |
| 5 | **Versandkosten bei Teilretoure:** Anteilig erstatten oder gar nicht? | Frank | AGB-Text, Phase 3 |
| 6 | **Marketplace Fee-Modell:** 10% Provision oder Membership-Fee? | Frank + Robin | Architektur beeinflusst |

### 14.2 Nicht blockierend, aber relevant

| # | Entscheidung | Entscheider | Auswirkung auf |
|---|-------------|-------------|----------------|
| 7 | Konvolut-Einkauf Aufteilungsmethode: gleichmäßig oder gewichtet? | Steuerberater | Wareneingang-Formular |
| 8 | Lagerort-Granularität: Freitext oder vordefinierte Standorte? | Frank | Admin-UI Wareneingang |
| 9 | Abrechnungszyklus Kommission: monatlich oder nach Block-Ende? | Frank | Phase 5 |
| 10 | Sendcloud Carrier-Auswahl: nur DHL? Oder auch DPD, Hermes, GLS? | Frank | Sendcloud-Konfiguration |
| 11 | Staging-Umgebung: Eigene Supabase-DB oder separates Schema? | Robin | Phase 0 |
| 12 | Marketplace-Zeitplan: Wann operativ aktivieren? | Frank + Robin | Gesamtplanung |
| 13 | GmbH-Gründung für Marketplace? Separate GmbH (§25e Haftung) | Frank + Anwalt | Vor Marketplace |

### 14.3 Steuerlich (Steuerberater-Termin)

Die folgende Liste kann direkt als Agenda für den Steuerberater-Termin verwendet werden.

**Block 1: §25a Grundlagen (15 min)**
1. Ist Franks Sammlung (~41.500 Tonträger, über Jahrzehnte gesammelt) komplett unter §25a führbar?
2. Wird Frank als Privatperson oder als gewerblicher Händler eingestuft?
3. Kann bei EK = 0 die volle Verkaufssumme als Marge angesetzt werden?
4. Einzeldifferenz (§25a Abs. 3) oder Sammelberechnung (§25a Abs. 4)?
5. Bei Sammelberechnung: Gilt die 500-EUR-Grenze pro Einzelstück auch bei Schallplatten > 500 EUR?

**Block 2: Kommission (10 min)**
6. Kommissionsware von Privatpersonen: §25a auf den Außenumsatz anwendbar?
7. Wie muss der "Einkaufspreis" bei Kommission dokumentiert werden?
8. Bei Konvolut-Übernahme: Welche Aufteilungsmethode akzeptiert das Finanzamt?
9. Provisionsabrechnung: Gutschrift-Format korrekt?

**Block 3: Rechnungen und Konten (15 min)**
10. Rechnungsformulierung bei §25a: Ist der Pflichttext ausreichend?
11. Mischwarenkorb: Separate Rechnungen oder eine mit getrennten Blöcken?
12. Kontenplan: SKR03 oder SKR04? Vorgeschlagene Konten bestätigen
13. BU-Schlüssel 12 für §25a im DATEV-Export korrekt?
14. Buchungssätze korrekt?

**Block 4: EU und OSS (10 min)**
15. OSS-Registrierung: Ab welchem EU-Umsatz empfehlenswert?
16. §25a + EU-Versand: Steuersatz des Bestimmungslandes auf die Marge?
17. Schweiz-Versand: Steuerfreie Ausfuhr, Nachweis-Pflichten?

**Block 5: Sonstiges (10 min)**
18. Negative Marge: Bestätigung, dass kein Vorsteuerabzug und keine Verrechnung möglich
19. DATEV-Datenservice vs. Buchungsstapel-Export: Präferenz?
20. Zeitplan: Was muss VOR dem ersten Verkauf stehen?

---

## Anhänge

### Anhang A: Sendcloud Feature-Vergleich

| Feature | Free | Growth (59 EUR/M) | Premium |
|---------|------|-------------------|---------|
| Labels pro Monat | Unlimitiert | Unlimitiert | Unlimitiert |
| Carrier | 6+ | 25+ | 100+ |
| Tracking-Benachrichtigungen | Ja | Ja + Branded | Ja + Custom |
| Return Portal | Nein | Ja | Ja |
| API-Zugang | Ja | Ja | Ja |
| Batch-Labels | Ja (100) | Ja (1000) | Unlimitiert |
| Sendcloud Checkout | Nein | Ja | Ja |

### Anhang B: sevDesk vs. easybill Vergleich

| Feature | sevDesk (17,90/M) | easybill (Plus, 14/M) |
|---------|-------------------|-----------------------|
| GoBD-Konformität | Ja (zertifiziert) | Ja (zertifiziert) |
| DATEV-Export | Ja (Buchungsstapel) | Ja (Datenservice direkt) |
| §25a | Manuell konfigurierbar | Manuell konfigurierbar |
| EU-USt/OSS | Ja | Ja + OSS-Monitoring |
| API Rate Limit | 2 Req/Sek | Höher (dual API) |
| Preis | 17,90 EUR/Monat | 14 EUR/Monat |

### Anhang C: Medusa-native vs. Custom

| Medusa Feature | Genutzt? | Begründung |
|---|---|---|
| Auth (Login/Register/Session) | Ja | Session/Bearer Tokens, Password Reset |
| Admin UI Shell | Ja | Icons, Layout, Routing für Custom Pages |
| ORM + DB Layer | Ja | model.define(), generateEntityId(), PG_CONNECTION |
| Notification (Resend) | Ja | Email-Provider in medusa-config.ts |
| Customer | Teilweise | Auth ja, CRM komplett custom |
| Order | Nein | Custom `transaction` |
| Product | Nein | Custom `Release` |
| Fulfillment | Nein | Custom, wird durch Sendcloud ersetzt |
| Inventory | Nein | Wird durch `inventory_item` ersetzt |
| Payment | Teilweise | Stripe/PayPal direkt |
| Cart | Nein | Custom `cart_item` |

**Fazit:** VOD Auctions nutzt ~15% von Medusa (Auth, Admin-Shell, ORM, Notifications). ERP-Module werden custom gebaut, nicht als Medusa-Plugins.

### Anhang D: Konkreter End-to-End-Workflow (Beispiel)

**Szenario:** Käufer kauft 2 Artikel in einem Checkout. Artikel 1 aus Franks Sammlung (§25a), Artikel 2 Kommissionsware (§25a, EK = 15 EUR).

**Schritt 1: Checkout und Payment**
```
Warenkorb:
  - Throbbing Gristle - D.O.A. (LP), 49 EUR [Frank, §25a, EK=0]
  - SPK - Leichenschrei (LP), 65 EUR [Kommission Max, §25a, EK=15]
  - Versand: DHL Paket DE, 5,49 EUR
  
Käufer zahlt 119,49 EUR via Kreditkarte
```

**Schritt 2: Payment-Success → Rechnungen**
```
System erkennt: Beide Artikel sind §25a → eine §25a-Rechnung

sevDesk/easybill API: Rechnung erstellen
→ invoice: VOD-INV-2026-00042, 119,49 EUR, margin_scheme_25a
→ PDF an Käufer per E-Mail
```

**Schritt 3: Bestandsänderung**
```
inventory_item (TG): status → 'sold', movement: sale, qty_change: -1
inventory_item (SPK): status → 'sold', movement: sale, qty_change: -1
```

**Schritt 4: §25a-Tracking**
```
tax_margin_record (TG): EK=0, VK=49, Marge=49, USt=7,82
tax_margin_record (SPK): EK=15, VK=65, Marge=50, USt=7,98
```

**Schritt 5: Versand**
```
Admin erstellt Sendcloud Label → DHL, Tracking 00340434...
→ shipping_event: label_created
→ fulfillment_status = 'packing'
→ E-Mail an Käufer mit Tracking-Link
```

**Schritt 6: Zustellung**
```
Sendcloud Webhook: delivered
→ shipping_event: delivered
→ fulfillment_status = 'delivered'
```

**Schritt 7: Monatsende — Kommissionsabrechnung**
```
Admin: Settlement für Max Mustermann, April 2026
→ 1 Artikel (SPK): VK=65, Provision 25%=16,25, Auszahlung=48,75
→ PDF generieren → Admin approved → Überweisung → mark-paid
```

**Schritt 8: DATEV-Export**
```
Buchungsstapel April 2026:
  TG-Verkauf:  S:1200 Bank 49,00 | H:8409 §25a 41,18 | H:1775 USt 7,82
  SPK-Verkauf: S:1200 Bank 65,00 | H:8409 §25a 57,02 | H:1775 USt 7,98
  Versand:     S:1200 Bank 5,49  | H:8400 19% 4,61   | H:1776 USt 0,88
```

### Anhang E: Glossar

| Begriff | Erklärung |
|---------|-----------|
| §25a UStG | Differenzbesteuerung / Margenbesteuerung für Gebrauchtgegenstände |
| §22f UStG | Aufzeichnungspflichten für Marketplace-Betreiber |
| §25e UStG | Gesamtschuldnerische Haftung des Marketplace-Betreibers für Seller-USt |
| DAC7 | EU-Richtlinie: Meldepflicht für Plattformbetreiber an Steuerbehörden |
| F22-Bescheinigung | Bescheinigung des Finanzamts, dass Seller steuerlich erfasst ist |
| GoBD | Grundsätze zur ordnungsmäßigen Führung und Aufbewahrung von Büchern |
| OSS | One-Stop-Shop: Vereinfachte USt-Meldung für EU-weite B2C-Verkäufe |
| SKR03 | Standardkontenrahmen 03 (verbreitet im Einzelhandel) |
| DATEV | Datenverarbeitungs-Genossenschaft, Standard-Schnittstelle zur Steuerberatung |
| Kommittent | Auftraggeber im Kommissionsgeschäft |
| Kommissionär | Beauftragter im Kommissionsgeschäft (verkauft im eigenen Namen für fremde Rechnung) |
| ZAG | Zahlungsdiensteaufsichtsgesetz |
| Sendcloud | SaaS für Versandautomation |
| sevDesk | Cloud-Buchhaltungssoftware (DE) |
| easybill | Cloud-Rechnungssoftware mit E-Commerce-Fokus (DE) |

---

## Teil B — Durchgeführte Final Touches (v4.1 → v4.2)

### Formale Bereinigung

- Abschnitt 13 (Klare Empfehlung) in die vorgegebene 6-Punkte-Struktur gebracht: Bevorzugte Zielrichtung, Begründung, Voraussetzungen, Offene Validierungen, Freigabebedingungen vor Implementierung, Bedingungen vor Go-Live einzelner Module
- Nummerierung der Unter-Abschnitte in Abschnitt 13 (13.1-13.9) für bessere Referenzierbarkeit
- Inhaltsverzeichnis aktualisiert (Teil B-D-Titel angepasst)
- Fehlerhafte Tabellenzelle in Abschnitt 2.2 korrigiert ("7,98 EUR statt 7,98 EUR" — sachlich korrekt, aber als Satz sinnlos → umformuliert)

### Steuerlich/rechtlich sensible Stellen nachmarkiert

- Modell B Intro-Text: "VOD ist reiner Vermittler" → ergänzt um **[Rechtlicher Validierungsbedarf]** (Einstufung Vermittler vs. Verkäufer muss Rechtsanwalt bestätigen)
- Modell B Tabelle: "Rechnung" und "Verkäuferrolle" → ergänzt um **[Rechtlicher Validierungsbedarf]**
- Modell 0 Tabelle: "Buchhaltung" → EK=0-Aussage um **[Fachliche Zielannahme]**-Marker ergänzt
- Offene Validierungen (Abschnitt 13.4): V8 ergänzt — Rechtliche Einstufung VOD als Vermittler vs. Verkäufer

### Empfehlung präzisiert

- Abschnitt 13.2 (Begründung): Explizite Gegenüberstellung aller 3 Optionen mit Kurzbewertung, nicht nur Einzeiler
- Abschnitt 13.5: Marketplace-Punkt um "rechtliche Einstufung" erweitert
- Abschnitt 13.6 (Bedingungen vor Go-Live): Aus bisheriger Teil-D-Tabelle übernommen und direkt in die Empfehlung integriert, sodass der Leser Empfehlung und Bedingungen zusammen sieht

### Nicht geändert

- Kapitelstruktur 1-14 beibehalten
- Keine inhaltlichen Änderungen an Abschnitten 1-12, 14 oder Anhängen A-E
- Marketplace bleibt im strukturellen Scope
- Alle bestehenden [Validierungsbedarf]- und [Fachliche Zielannahme]-Marker beibehalten

---

## Teil C — Verbleibende offene Punkte vor finaler Freigabe

### Fachlich

- Marketplace Fee-Modell (Provision vs. Membership) — Entscheidung offen
- Kommissionsprovision Standard-Satz (20%/25%/30%) — Entscheidung offen
- Versandkosten bei Teilretoure (anteilig oder nicht) — AGB-Entscheidung
- Abrechnungszyklus Kommission (monatlich vs. nach Block-Ende) — Entscheidung offen
- Lagerort-Granularität (Freitext vs. vordefiniert) — Entscheidung offen
- Marketplace-Zeitplan (wann operativ aktivieren) — Entscheidung offen
- Seller-AGB und Marketplace-Nutzungsbedingungen — Rechtsanwalt

### Steuerlich

- §25a: Einzeldifferenz oder Sammelberechnung — Steuerberater
- Franks Sammlung komplett unter §25a führbar? — Steuerberater
- EK = 0 bei Privatsammlung akzeptiert? — Steuerberater
- Konvolut-Einkauf Aufteilungsmethode — Steuerberater
- Mischrechnung oder separate Rechnungen — Steuerberater
- Kontenplan (SKR03/04) + BU-Schlüssel validieren — Steuerberater
- Buchungssätze (insb. §25a) validieren — Steuerberater
- OSS-Registrierung ab welchem Schwellenwert empfohlen — Steuerberater
- §25a + EU-Versand: Bestimmungsland-Steuersatz auf Marge — Steuerberater
- Kommissionsfiktion (§3 Abs. 3 UStG) bei Privatperson-Kommittent → §25a — Steuerberater
- Marketplace: Steuerliche Einstufung als reiner Vermittler — Steuerberater + Anwalt
- Marketplace: §22f/§25e vollständig — Anwalt

### Operativ

- sevDesk oder easybill? — Entscheidung nach Praxis-Test
- Sendcloud Carrier-Auswahl (nur DHL oder multi-Carrier) — Entscheidung
- DHL Geschäftskundennummer beantragen (2-4 Wochen Vorlauf) — In Arbeit?
- Kommissionsvertrag-Vorlage erstellen lassen — Rechtsanwalt
- GmbH-Gründung für Marketplace (Haftungsisolierung §25e) — Anwalt + Frank
- Seller-Vertrag / Marketplace-Nutzungsbedingungen — Anwalt

### Technisch

- Staging-Umgebung: Eigene Supabase-DB aufsetzen — Robin
- Stripe Connect Platform Application einreichen — Robin
- Feature-Flag-Abhängigkeiten dokumentieren (welcher Flag setzt welchen voraus) — Robin
- Legacy-Sync-Erweiterung für bidirektionale Bestandssynchronisation — Robin

---

## Teil D — Freigabebedingungen

### Vor Architekturfreigabe

Dieses Dokument wird als Entscheidungsgrundlage akzeptiert, wenn:

| # | Bedingung | Entscheider |
|---|----------|-------------|
| 1 | Robin und Frank bestätigen: Composable Stack (Option A) ist die richtige Richtung | Robin + Frank |
| 2 | Robin und Frank bestätigen: Marketplace wird strukturell mitgedacht, aber nicht operativ aktiviert | Robin + Frank |
| 3 | Steuerberater-Termin ist terminiert (Agenda = Abschnitt 14.3) | Robin |

### Vor Implementierungsstart

| # | Bedingung | Entscheider | Blockiert Phase |
|---|----------|-------------|-----------------|
| 1 | Steuerberater hat §25a-Grundkonfiguration bestätigt (Einzeldiff./Sammelber., EK=0, Kontenplan) | StB | Phase 2, 4 |
| 2 | sevDesk oder easybill gewählt, Test-Account eingerichtet, 5 Test-Rechnungen erstellt | Robin + Frank | Phase 2 |
| 3 | DHL-Geschäftskundennummer beantragt oder vorhanden | Frank | Phase 3 |
| 4 | Staging-Umgebung mit separater DB läuft | Robin | Alle Phasen |
| 5 | `develop`-Branch erstellt | Robin | Alle Phasen |

### Vor Go-Live einzelner Module

Identisch mit Abschnitt 13.6 — dort als Teil der Empfehlung aufgeführt, hier als formale Checkliste:

| # | Bedingung | Modul | Entscheider |
|---|----------|-------|-------------|
| 1 | 3 Test-Labels erfolgreich erstellt und gedruckt (Sendcloud Production) | Sendcloud | Robin + Frank |
| 2 | StB hat Rechnungsformulierung (§25a + Standard) schriftlich genehmigt | Rechnungen | StB |
| 3 | 5 Testrechnungen in sevDesk/easybill korrekt (§25a + Standard + Misch) | Rechnungen | Robin |
| 4 | Migration auf Staging: Anzahl korrekt, Spot-Check 20 Artikel | Bestandsmigration | Robin |
| 5 | StB hat §25a-Berechnungslogik anhand von 10 Test-Records validiert | §25a-Tracking | StB |
| 6 | StB hat DATEV-Export-Format (1 Monat Testdaten) geprüft und freigegeben | DATEV | StB |
| 7 | Kommissionsvertrag-Vorlage liegt vor, erster Kommissionsgeber hat unterschrieben | Kommission | Frank + Anwalt |
| 8 | End-to-End-Test Kommission auf Staging (Eingang → Verkauf → Settlement → Auszahlung) | Kommission | Robin + Frank |

### Vor Marketplace-Aktivierung (separater Meilenstein)

| # | Bedingung | Entscheider |
|---|----------|-------------|
| 1 | Stripe Connect Platform Application genehmigt | Stripe |
| 2 | §22f/§25e-Compliance vollständig geprüft und dokumentiert | Anwalt |
| 3 | DAC7-Report-Funktion implementiert und getestet | Robin |
| 4 | Seller-Vertrag / Marketplace-Nutzungsbedingungen vom Anwalt erstellt | Anwalt |
| 5 | F22-Prüfungsprozess implementiert (Upload, Gültigkeitsprüfung, automatische Suspendierung) | Robin |
| 6 | Entscheidung: Eigene GmbH für Marketplace oder bestehende Struktur | Frank + Anwalt |
| 7 | Rechtliche Einstufung VOD als Vermittler vs. Verkäufer bestätigt | Anwalt |
| 8 | 3-5 eingeladene Test-Seller haben Onboarding durchlaufen | Robin + Frank |
| 9 | Dispute-Prozess dokumentiert und vom Anwalt geprüft | Anwalt |

---

*Dieses Dokument ist eine Entscheidungsvorlage. Es ersetzt keine steuerliche oder rechtliche Beratung. Alle steuerlichen Aussagen sind als fachliche Zielannahmen gekennzeichnet und müssen vom Steuerberater validiert werden. Alle regulatorischen Aussagen zum Marketplace müssen von einem Rechtsanwalt geprüft werden.*

---

## Teil E — Umsetzungsstand 2026-04-05 (Delta v4.2 → v5.0)

Dieser Abschnitt fasst zusammen, **was seit v4.2 tatsächlich umgesetzt wurde**, und markiert damit den Übergang von "reine Entscheidungsvorlage" zu "Infrastructure-Layer live, Domain-Layer wartet auf Freigaben".

### E.1 Was umgesetzt wurde

**Infrastructure-Layer — komplett live:**

| Komponente | Status | Referenz im Konzept | Code / Doc |
|-----------|--------|---------------------|-----------|
| Feature-Flag-Registry (6 ERP-Flags, alle `false`) | ✅ live | §8.2, §9.2 | `backend/src/lib/feature-flags.ts` |
| `site_config.features` JSONB-Spalte + idempotente Migration | ✅ live | §8.2 | `backend/scripts/migrations/2026-04-05_add_site_config_features.sql` |
| Admin-Toggle-UI (generisch, kategorisiert, mit Info-Banner) | ✅ live | §8.2 | `backend/src/admin/routes/config/page.tsx` (Tab "Feature Flags") |
| Transaktionale Flag-Writes (`setFeatureFlag`) mit `FOR UPDATE`-Lock + Audit-Log | ✅ live | §8.2 (implizit) | `backend/src/lib/feature-flags.ts` + `config_audit_log` |
| Admin-API `GET/POST /admin/platform-flags` | ✅ live | — (neu) | `backend/src/api/admin/platform-flags/route.ts` |
| Public Flag-Endpoint `GET /store/platform-flags` (nur whitelisted Flags) | ✅ live | — (neu) | `backend/src/api/store/platform-flags/route.ts` |
| Storefront `FeatureFlagProvider` + `useFeatureFlag` Hook | ✅ live | — (neu) | `storefront/src/components/FeatureFlagProvider.tsx` |
| `CLIENT_SAFE_FLAGS` Whitelist (ERP-Flags bleiben privat) | ✅ live | — (Security-Addition) | `backend/src/lib/feature-flags.ts` |
| Trial-Flag `EXPERIMENTAL_SKIP_BID_CONFIRMATION` End-to-End validiert | ✅ live | — (Infrastruktur-Validierung) | `storefront/src/components/ItemBidSection.tsx` (BidForm) |
| Deployment-Methodology als verbindliches Governance-Doc | ✅ live | §8 + §9 (komplett) | `docs/architecture/DEPLOYMENT_METHODOLOGY.md` |
| Migration-Discipline als Policy (additiv-only, no DROP/RENAME/TYPE) | ✅ verbindlich | §8.3 | `DEPLOYMENT_METHODOLOGY.md` §3 |
| `/admin/erp/*` Prefix-Reservation | ✅ reserviert | §8.4 | `DEPLOYMENT_METHODOLOGY.md` §5 |
| Staging-DB provisioniert (`vod-auctions-staging`, eu-west-1, Schema 1:1) | ✅ live | §8.5 | `docs/architecture/STAGING_ENVIRONMENT.md` |
| 1Password-Integration für Staging-Credentials (`Supabase 2. Account`) | ✅ live | — (Security-Addition) | `STAGING_ENVIRONMENT.md` + `backend/.env.staging.example` |
| PM2-`cwd`-Hotfix (backend → `.medusa/server/`) + `.env`-Symlink | ✅ live | — (Incident 2026-04-05) | `backend/ecosystem.config.js`, `CLAUDE.md` gotchas |
| Fünf neue Supabase/Deployment-Gotchas dokumentiert | ✅ live | — | `CLAUDE.md` |

### E.2 Was NICHT umgesetzt wurde (bewusst)

**Domain-Layer — wartet weiterhin auf fachliche Freigaben (Abschnitt 14):**

| Komponente | Warum noch nicht | Abhängigkeit |
|-----------|------------------|--------------|
| `inventory_item` Tabelle + Bestandsmigration | Wartet auf StB-Validierung EK=0, Lagerort-Granularität | StB + Frank |
| `tax_margin_record` + §25a-Tracking | Wartet auf StB-Entscheidung Einzel/Sammel + Kontenplan | StB (Pflicht) |
| `commission_owner` + Settlement-Logik | Wartet auf Kommissionsvertrag-Vorlage + Abrechnungszyklus | Anwalt + Frank |
| sevDesk/easybill-Integration | Wartet auf Produktwahl + 5 Test-Rechnungen | Robin + Frank + StB |
| Sendcloud-Integration | Wartet auf DHL-Geschäftskundennummer + Sendcloud-Account | Frank |
| DATEV-Export | Baut auf sevDesk/easybill + §25a auf | StB |
| Marketplace-Tabellen (`seller`, `seller_payout`, Stripe Connect) | Wartet auf Stripe Connect Application + §22f/§25e-Prüfung + GmbH-Entscheidung | Anwalt + Frank + Stripe |
| `/admin/erp/*` Routes | Werden erst mit dem jeweils ersten ERP-Feature angelegt | siehe oben |
| Staging HTTP-Layer (PM2 Port 9001, nginx, DNS) | Wird erst mit dem ersten Feature das HTTP-Staging braucht gebaut | Robin (schnell) |
| `develop`-Branch-Workflow | Bisher nicht nötig (solo auf `main`); wird etabliert wenn parallele ERP-Branches starten | — |

### E.3 Welche Infrastructure-Invariante ist jetzt hergestellt?

Ab 2026-04-05 gilt für jede zukünftige ERP-Komponente:

1. **Ein neuer Flag ist eine Code-Zeile in `FEATURES`.** Kein DB-Migration, kein Deploy-Sonderfall. Default `false`.
2. **Der Flag erscheint automatisch in der Admin-UI.** Robin kann ihn toggeln, ohne dass ein Dev etwas macht.
3. **Jeder Toggle ist auditierbar.** `config_audit_log` hat `feature_flag:<KEY>` Einträge, sichtbar im "Change History" Tab.
4. **Deployment und Aktivierung sind entkoppelt.** Ein Feature kann Wochen deployed sein ohne dass irgendwer es merkt. Ein Rollback ist ein Flag-Toggle (30 Sekunden).
5. **Staging steht bereit für Migration-Rehearsals.** Jede neue SQL-Datei kann auf Staging angewendet werden bevor sie Production berührt. Die `docker run postgres:17 pg_dump | psql` Pipeline ist dokumentiert und wiederholbar.
6. **Client-side Flag-Exposure ist sicher by default.** ERP-Flags sind PRIVAT, außer ein Dev ergänzt explizit die `CLIENT_SAFE_FLAGS` Whitelist.

### E.4 Was als nächstes sinnvoll ist

**Nicht-ERP-Arbeit (kann jederzeit, ohne fachliche Freigabe):**
- Storefront-Features mit client-side Flag (z.B. Layout-Experimente, Bid-Flow-Variationen) — nutzen die bestehende Trial-Flag-Infrastruktur
- Backend-Admin-Features mit admin-only Flag (z.B. neue Dashboard-Widgets hinter `EXPERIMENTAL_*`)
- Migration-Rehearsal-Pipeline (Skript das pending Migrations sequentiell auf Staging anwendet)

**ERP-Domain-Arbeit (braucht fachliche Freigaben aus Abschnitt 14):**
- **Wahrscheinlich erster sinnvoller ERP-Meilenstein: Sendcloud-Integration.** Grund: eigenständig aktivierbar, additiv zum bestehenden manuellen Workflow, niedrige Komplexität, einzige externe Abhängigkeit ist die DHL-Geschäftskundennummer (die Frank ohnehin braucht). Kein Steuerberater im Critical Path. `ERP_SENDCLOUD`-Flag + neue `shipping_label` Tabelle + `/admin/erp/shipping/*` Routes + Sendcloud-Client-Wrapper.
- **Zweiter sinnvoller Meilenstein: sevDesk/easybill + Rechnungsstellung.** Braucht StB-Validierung aber ist eigenständig aktivierbar nach Setup. `ERP_INVOICING`-Flag + sevDesk-Client + Webhook-Handler nach Payment-Success.
- **Dritter: `inventory_item` + Bestandsmigration.** Braucht mehr Setup und Validierung. Hebelweise aktivierbar: erst Read-Path (legacy_available bleibt Source-of-Truth), dann Stichtag-Cutover.
- **Später: §25a-Tracking, Kommission, DATEV-Export.** Verbunden, brauchen alle StB, daher als Paket.
- **Noch später: Marketplace.** Eigenständiger Meilenstein mit Rechts-Prüfung, Stripe Connect, etc.

### E.5 Freigabestatus

| Freigabe | Status |
|----------|--------|
| Architektur (Composable Stack A) | ✅ angenommen |
| Marketplace strukturell mitdenken | ✅ angenommen (Whitelist-Policy enforcet private by default) |
| Deployment-Methodology als verbindlich | ✅ `CLAUDE.md` + `DEPLOYMENT_METHODOLOGY.md` |
| Infrastructure-Layer implementiert | ✅ 2026-04-05 |
| Staging-DB einsatzbereit | ✅ 2026-04-05 (nur DB, kein HTTP) |
| StB-Termin für §25a | ⏸ offen |
| sevDesk/easybill Entscheidung | ⏸ offen |
| DHL-Geschäftskundennummer | ⏸ offen (Frank) |
| Kommissionsvertrag-Vorlage | ⏸ offen (Anwalt) |
| Stripe Connect Application | ⏸ offen (Robin) |
| Marketplace Rechts-Prüfung (§22f/§25e) | ⏸ offen (Anwalt) |

Die Infrastructure-Freigaben sind erledigt. Von hier aus ist der nächste Schritt **nicht technisch, sondern fachlich**: sobald Frank die DHL-Nummer hat und/oder ein Steuerberater-Termin stattgefunden hat, kann das erste ERP-Domain-Feature beginnen. Die Code-Seite ist darauf vorbereitet.

### E.6 Commits der Umsetzung

Alle 2026-04-05 auf `main`:

| Commit | Scope |
|--------|-------|
| `b349763` | Feature-Flag-Infrastruktur + Deployment-Methodology (core) |
| `35a99e0` | PM2 cwd + .env symlink Hotfix + Deploy-Sequenz-Doku |
| `f7eeb49` | Minimaler Backend-Trial-Flag (`EXPERIMENTAL_STORE_SITE_MODE_DEBUG`) |
| `0f5976e` | Vollständiger Storefront-Trial-Flag (`EXPERIMENTAL_SKIP_BID_CONFIRMATION`) + `/store/platform-flags` + Provider |
| `5bf2085` | Staging-DB-Umsetzung + 5 neue Gotchas + Env-Templates |

GitHub Release: [`v2026.04.05`](https://github.com/rseckler/VOD_Auctions/releases/tag/v2026.04.05)

---

*Ende Teil E. Teil A-D (v4.2) bleiben inhaltlich unverändert und sind weiterhin der Referenz-Plan für den Domain-Layer.*

---

## Teil F — Implementierungsstart 2026-04-07 (v5.0 → v6.0)

Dieser Teil dokumentiert alle Entscheidungen und Klarstellungen die am 2026-04-07 getroffen wurden, bevor die erste ERP-Implementierungsrunde beginnt. Dient als Referenz für zukünftige Gespräche.

### F.1 Getroffene Architekturentscheidungen

| Entscheidung | Ergebnis | Vorherige Offenheit |
|--------------|----------|---------------------|
| **Invoicing-Dienst** | **easybill** (Plus, 14 EUR/Monat) | Offen: sevDesk vs. easybill |
| **Versand-Automatisierung** | **Sendcloud** | Bereits gesetzt, jetzt bestätigt |
| **Architekturrichtung** | **Composable Stack (Option A)** | Bereits gesetzt in §11, jetzt explizit bestätigt |
| **Marketplace** | Strukturell mitgedacht (Tabellen, Flags) — operativ NICHT aktiviert | Offen: Scope |
| **Staging-Umgebung** | ✅ einsatzbereit (DB `aebcwjjcextzvflrjgei`, eu-west-1) | War bereits live (2026-04-05) |
| **DHL-Geschäftskundennummer** | ✅ `5115313430` — geht in `backend/.env` als `DHL_ACCOUNT_NUMBER` wenn ERP_SENDCLOUD implementiert | War offen (Frank) |

### F.2 Feature Flag Dependencies — Finale Abhängigkeitskette

Neu in v6.0: `FeatureFlagDefinition` erhält ein `requires?: string[]`-Feld. `setFeatureFlag()` blockiert Aktivierung wenn Voraussetzungen nicht erfüllt sind (HTTP 400). Admin-UI deaktiviert Toggles von Flags deren Deps noch off sind.

```
ERP_INVENTORY     requires: []                                                       (Fundament — zuerst aktivieren)
ERP_INVOICING     requires: [ERP_INVENTORY]                                          (Bestand nötig um zu fakturieren)
ERP_SENDCLOUD     requires: [ERP_INVENTORY, ERP_INVOICING]                           (Rechnung geht mit dem Paket)
ERP_COMMISSION    requires: [ERP_INVENTORY, ERP_INVOICING]                           (Bestand + Faktura für Settlement)
ERP_TAX_25A       requires: [ERP_INVENTORY, ERP_INVOICING]                           (Margenverfolgung braucht Bestand)
ERP_MARKETPLACE   requires: [ERP_INVENTORY, ERP_INVOICING, ERP_COMMISSION,
                              ERP_TAX_25A, ERP_SENDCLOUD]                            (alles vorher)
```

**Aktivierungsreihenfolge (Pflicht-Sequence):**
1. `ERP_INVENTORY` — kann solo aktiviert werden
2. `ERP_INVOICING` — nach Inventory
3. `ERP_SENDCLOUD` + `ERP_COMMISSION` + `ERP_TAX_25A` — nach Invoicing (Reihenfolge untereinander frei)
4. `ERP_MARKETPLACE` — als letztes, nach allen anderen

**Enforcement:** Hard Block (HTTP 400, kein Soft-Warning). Admin-UI zeigt Dependency-Status je Toggle ("Requires ERP_INVENTORY ✓/✗").

### F.3 Warehouse Locations — Neue Anforderung

VOD Auctions hat mehrere physische Lagerorte (Details werden im Admin gepflegt). Anforderung:

- Konfigurierbare Tabelle `warehouse_location` (leer gestartet, via Admin-UI befüllt und verwaltet)
- Felder: `code` (eindeutig, z.B. "FRANK_MAIN"), `name`, `description`, `address`, `contact_name`, `contact_email`, `is_active`, `is_default` (genau einer), `sort_order`, `notes`
- Constraint: `UNIQUE INDEX WHERE is_default = true` — verhindert mehrere Defaults auf DB-Ebene
- Soft-Delete: `is_active = false` (nie hard delete — zukünftige `inventory_item`-Referenzen)
- Deaktivierung des Default-Lagerortes geblockt (400) bis ein anderer als Default gesetzt wird
- Erster aktiver Use des reservierten `/admin/erp/*`-Namespace

### F.4 ERP Admin-Navigation

ERP erhält einen **eigenen 8. Sidebar-Eintrag** (statt Unterpunkt von Operations). Begründung: ERP ist ein eigenständiges Domain-Modul das in Umfang mit Operations gleichwertig wird.

- Sidebar-Icon: `DocumentText` aus `@medusajs/icons`
- Sidebar-Label: "ERP"
- Rank: 7 (nach Operations rank 5)
- Hub-Page: `/app/erp` mit 6 Karten (1 aktiv: Locations; 5 muted mit Flag-Status-Badge)
- Sub-Pages erreichbar per URL, kein `defineRouteConfig` (Standard-Konvention)
- `admin-nav.tsx` PARENT_HUB erweitert um `/app/erp/locations → { label: "ERP", href: "/app/erp" }`

### F.5 Überarbeiteter Freigabestatus (2026-04-07)

| Freigabe | Status |
|----------|--------|
| Architektur (Composable Stack A) | ✅ bestätigt |
| Invoicing-Dienst: easybill | ✅ **entschieden 2026-04-07** |
| Sendcloud für Versand | ✅ **bestätigt 2026-04-07** |
| Marketplace strukturell mitgedacht | ✅ bestätigt |
| Deployment-Methodology als verbindlich | ✅ |
| Infrastructure-Layer implementiert | ✅ 2026-04-05 |
| Staging-DB einsatzbereit | ✅ 2026-04-05 |
| Feature Flag Dependencies (Code) | 🔧 **in Implementierung 2026-04-07** |
| Warehouse Locations (Code) | 🔧 **in Implementierung 2026-04-07** |
| DHL-Geschäftskundennummer | ✅ **5115313430** (in Memory + .env.example) |
| StB-Termin für §25a | ⏸ offen |
| Kommissionsvertrag-Vorlage | ⏸ offen (Anwalt) |
| Stripe Connect Application | ⏸ offen (Robin) |
| Marketplace Rechts-Prüfung (§22f/§25e) | ⏸ offen (Anwalt) |

### F.6 Nächste ERP-Implementierungsphasen (revidiert)

Mit den Entscheidungen aus F.1 ist die Implementierungsreihenfolge jetzt klarer:

**Phase 1 (Foundation — 2026-04-07, dieser Sprint):**
- Feature Flag Dependencies in Code
- Warehouse Locations (Tabelle + Admin-UI)
- ERP Hub Page als 8. Sidebar-Eintrag

**Phase 2 (Inventory — nach Phase 1):**
- `inventory_item` Tabelle (Migration, Schema per §10)
- Read-Path: Legacy `Release.legacy_available` bleibt Source-of-Truth, `inventory_item` parallel befüllt
- `ERP_INVENTORY`-Flag aktivierbar wenn Phase 2 deployed und auf Staging getestet

**Phase 3 (Invoicing — nach Phase 2):**
- easybill Client-Wrapper + API-Credentials
- `invoice` + `invoice_line` Tabellen (Migration per §10)
- Webhook-Handler: `payment_intent.succeeded` → `POST /easybill/invoices`
- `ERP_INVOICING`-Flag aktivierbar nach StB-Validierung

**Phase 4 (Sendcloud — nach Phase 3):**
- Sendcloud Client-Wrapper + DHL-Konfiguration (`DHL_ACCOUNT_NUMBER=5115313430`)
- `shipping_event` Tabelle (Webhook-Speicher)
- Admin-UI: Label-Generierung aus Order-View
- `ERP_SENDCLOUD`-Flag aktivierbar nach Sendcloud-Account-Setup

**Phase 5 (Commission + §25a + DATEV — nach Phase 4):**
- Steuerberater-Freigabe Voraussetzung
- `commission_owner`, `commission_settlement`, `tax_margin_record` (Schema per §10)
- DATEV-Export via easybill

**Phase 6 (Marketplace — nach Phase 5 + Rechts-Freigaben):**
- Stripe Connect
- `seller`, `seller_listing` Tabellen
- Eigenständiger Meilenstein

---

*Ende Teil F. v6.0 beginnt mit der Implementierung von Phase 1.*
