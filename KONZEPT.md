# VOD Auctions Platform - Konzeptdokument

**Projekt:** Auktionsplattform für ~30.000 Tonträger
**Ziel:** Gewinnmaximierung bei maximaler Kontrolle der Wertschöpfungskette
**Stand:** 2026-03-01
**Autor:** Robin Seckler

---

## Executive Summary

Dieses Dokument beschreibt das Konzept einer eigenen Auktionsplattform für ~30.000 Tonträger (Industrial Music, Nischen-Genres). Nach jahrelanger Erfahrung mit eBay und Discogs steht fest: Wir wollen eine eigene Plattform mit voller Kontrolle über Marke, Kundendaten, Preisgestaltung und Nutzererlebnis.

**Kernentscheidung:** Eigene Auktionsplattform mit Themen-Block-Modell (siehe Kapitel 3A + 6)

---

## 1. Problemanalyse

### 1.1 Aktuelle Situation
- **Bestand:** ~30.000 Tonträger (Industrial Music, Nischen-Genres)
- **Bisherige Verkaufskanäle:**
  - Physischer Shop
  - Website tape-mag.com (30.000+ Releases, Shopify-Test)
  - Discogs & eBay (jahrelange Erfahrung)
- **Erfahrung:** Jahrelanger Handel über eBay und Discogs — der Markt, die Zielgruppe und das Auktionsprinzip sind bekannt und validiert
- **Motivation für eigene Plattform:**
  - Volle Kontrolle über Marke, Daten und Kundenerlebnis
  - Keine Abhängigkeit von Drittplattformen (Gebühren, Regeländerungen)
  - Einzigartiges Themen-Block-Modell als Differenzierung
  - Dynamische Preisfindung bei Raritäten
  - Direkte Kundenbindung und Community-Aufbau

### 1.2 Potenziale einer Auktionsplattform
- **Dynamische Preisfindung:** Markt bestimmt den Preis
- **Künstliche Verknappung:** Zeitlimit erhöht Kaufdruck
- **Community-Building:** Sammler treten in Wettbewerb
- **Premium-Positioning:** Auktionen wirken exklusiver als Shop
- **Datengetrieben:** Echte Marktpreise für zukünftige Bewertungen

---

## 2. Plattform-Optionen: Build vs. Buy vs. Hybrid

### 2.1 Option A: Bestehende Plattform nutzen

#### 2.1.1 Spezialisierte Auktionshäuser (High-End)
**Beispiele:** Bonhams, Omega Auctions, Christie's

**Vorteile:**
- ✅ Etablierte Reputation
- ✅ Zahlungskraft der Kundschaft
- ✅ Null technischer Aufwand
- ✅ Marketing inkludiert

**Nachteile:**
- ❌ **Hohe Kommissionen:** 15-25% Käuferaufgeld + 10-20% Verkäuferkommission
- ❌ **Strenge Kuratierung:** Nur hochwertige Items akzeptiert
- ❌ **Keine Kontrolle:** Keine eigene Brand, keine Kundendaten
- ❌ **Langsame Abwicklung:** Wenige Auktionen pro Jahr

**Geeignet für:** Die Top 100-500 Raritäten (z.B. Erstpressungen, signierte Items, Ultra-Raritäten)

#### 2.1.2 Discogs Marketplace
**Status:** Bereits etabliert für Tonträger

**Vorteile:**
- ✅ Spezialisierte Zielgruppe (Musik-Sammler)
- ✅ 80 Millionen Nutzer weltweit
- ✅ Standardisierte Katalogisierung
- ✅ Geringe Einstiegshürde

**Nachteile:**
- ❌ **8% Verkaufsgebühr** (min. $0.10/Item)
- ❌ **3-5% Zahlungsgebühren** (PayPal/Stripe)
- ❌ **Auktionen begrenzt:** Primär Festpreise, Auktionen sind Nische
- ❌ **Preisdruck:** Viele Anbieter, Preisvergleich sehr einfach

**Geeignet für:** Massenabverkauf — wurde bereits jahrelang genutzt

#### 2.1.3 eBay Auktionen
**Status:** Etabliert, aber generisch

**Vorteile:**
- ✅ Große Reichweite
- ✅ Auktionsmechanismus etabliert
- ✅ Schneller Start möglich

**Nachteile:**
- ❌ **12,8% Verkaufsgebühr** (10% + 0,35€ pro Verkauf)
- ❌ **Preiskampf:** Viele billige Angebote drücken Preise
- ❌ **Keine Spezialisierung:** Musik zwischen Elektronik und Mode
- ❌ **Brand-Verlust:** Du bist nur ein Verkäufer unter vielen

**Geeignet für:** Schnelle Tests — wurde bereits ausgiebig genutzt, daher keine weitere Validierung nötig

### 2.2 Option B: Eigene Plattform entwickeln

#### 2.2.1 Vollständig Custom-Built
**Technologie:** Medusa.js + Next.js 15 + Supabase

**Vorteile:**
- ✅ **100% Kontrolle:** Alle Features, Daten, Branding
- ✅ **Keine Kommissionen:** Nur Payment-Provider-Gebühren (1,5-3%)
- ✅ **Differenzierung:** Einzigartige Features möglich
- ✅ **Kundendaten:** Direkter Zugang zu Käuferverhalten
- ✅ **Skalierbarkeit:** Von 100 bis 30.000+ Items

**Nachteile:**
- ❌ **Hoher Entwicklungsaufwand:** 3-6 Monate Vollzeit
- ❌ **Komplexe Features:**
  - Auktionsmechanismus mit Echtzeit-Bidding
  - Zahlungsabwicklung (Escrow)
  - Betrugsbekämpfung
  - Versandintegration
  - SEO für ~30.000 Items
- ❌ **Kaltstartproblem:** Keine Käufer am Anfang
- ❌ **Rechtliche Komplexität:** AGB, Widerrufsrecht, Verbraucherschutz

**Kosten:**
- Entwicklung: 500-1000h × 50€ = **25.000-50.000€** (oder eigene Zeit)
- Hosting: ~50€/Monat (Vercel Pro + Supabase Pro)
- Payment: Stripe (1,5% + 0,25€ pro Transaktion)
- Marketing: 1.000-5.000€/Monat für Kaltstart

**Geeignet für:** Langfristige Strategie mit 3-5 Jahren Zeithorizont

#### 2.2.2 White-Label / SaaS Auktionssoftware
**Beispiele:** AuctionWorx, BidJS, Auction Nudge, Easy Auction

**Vorteile:**
- ✅ **Schneller Start:** 1-4 Wochen Setup
- ✅ **Auktionslogik fertig:** Bidding, Notifications, Escrow
- ✅ **Eigene Domain:** yourauction.com
- ✅ **Weniger Entwicklungsaufwand**

**Nachteile:**
- ❌ **Monatliche Kosten:** 200-1.000€/Monat je nach Volumen
- ❌ **Limitierte Anpassungen:** Design-Templates, keine Custom-Features
- ❌ **Vendor Lock-in:** Abhängigkeit vom Anbieter
- ❌ **Transaktionsgebühren:** Oft 2-5% zusätzlich

**Kosten:**
- Software: 200-500€/Monat
- Transaktionsgebühren: 2-3%
- Setup: 5.000-10.000€

**Geeignet für:** Mittelfristige Strategie (1-2 Jahre) mit Ausstiegsoption

### 2.3 Gewählter Ansatz: Eigene Plattform direkt bauen

**Entscheidung:** Wir überspringen die Validierungsphase auf eBay/Discogs. Der Markt ist durch jahrelange Erfahrung auf beiden Plattformen bekannt. Was fehlt, ist die eigene Infrastruktur — nicht die Marktvalidierung.

**Warum direkt eigene Plattform?**
- eBay und Discogs bereits ausgiebig genutzt → Auktionsprinzip funktioniert für unser Sortiment
- Gebührenstruktur (8-13%) frisst die Marge
- Keine Kontrolle über Kundendaten, Branding, UX
- Themen-Block-Modell ist auf keiner bestehenden Plattform möglich
- Shopify war ein Test — die Daten liegen dort, aber es ist kein strategischer Kanal

**Vorgehen:** Direkter Aufbau der eigenen Auktionsplattform (siehe Phasenplan Kapitel 6)

---

## 3. Inhaltliches Konzept

### 3.1 Produktsegmentierung

#### Tier 1: Premium Auctions (Top 1% = 800 Items)
**Merkmale:**
- Schätzwert >100€
- Erstpressungen, Raritäten, signierte Items
- Limitierte Auflagen <500 Stück

**Auktionsformat:**
- **Dauer:** 7-10 Tage
- **Startpreis:** 50% Schätzwert
- **Reserve Price:** 80% Schätzwert (geheim)
- **Häufigkeit:** 20-50 Items pro Woche (thematische Auktionen)

**Marketing:**
- Newsletter-Feature "Item der Woche"
- Social Media Teasers
- Dedicated Landing Pages mit Hintergrundgeschichte

#### Tier 2: Standard Auctions (Top 10% = 8.000 Items)
**Merkmale:**
- Schätzwert 20-100€
- Gefragte Künstler, beliebte Alben
- Guter bis sehr guter Zustand

**Auktionsformat:**
- **Dauer:** 3-5 Tage
- **Startpreis:** 1€ (Attention-Grabber)
- **Reserve Price:** 40% Schätzwert
- **Häufigkeit:** 100-200 Items pro Woche

#### Tier 3: Festpreis / Bulk (Rest)
**Merkmale:**
- Schätzwert <20€
- Häufige Titel, mittlerer Zustand
- Schnell drehende Artikel

**Format:**
- "Buy It Now" auf eigener Plattform
- Clearance-Blöcke mit 1€-Startpreis (siehe Block-Typ C)
- Bulk-Sales (z.B. "10 Industrial CDs für 50€")

### 3.2 Auktionsformate

#### A) Klassische Auktion (Primary Format)
- Offenes Bieten mit sichtbarem Höchstgebot
- Automatische Verlängerung bei Geboten in letzten 5 Minuten
- Mindestgeboterhöhung: 5-10% des aktuellen Gebots

#### B) Private Auktion (für High-End Items)
- Gebotshöhe nicht sichtbar (nur "X Gebote")
- Verhindert Preisabsprachen
- Erzeugt mehr Spannung

#### C) Reverse Auction (für Bulk-Clearance)
- Preis sinkt täglich um X%
- Erster Käufer gewinnt
- Gut für langsam drehende Items

#### D) Buy It Now + Auktion (Hybrid)
- Sofortkauf-Option parallel zur Auktion
- "Kaufe jetzt für 150€ oder biete ab 80€"
- Reduziert Unsicherheit für Käufer

### 3.3 Thematische Auktionen (Curation)

**Konzept:** Gebündelte Auktionen mit Storytelling

**Beispiel-Themes:**
- "Industrial Legends: Throbbing Gristle bis Einstürzende Neubauten"
- "Japanese Noise: Merzbow, Masonna, Incapacitants"
- "Erstpressungen der 80er"
- "Signed Editions & Artist Collaborations"
- "Test Pressings & White Labels"

**Vorteile:**
- Höhere Aufmerksamkeit durch Kuratierung
- Sammler kaufen mehrere Items in einem Theme
- PR-Möglichkeiten (Blogs, Podcasts)
- Premium-Positionierung

**Frequenz:** 1-2 thematische Auktionen pro Monat (50-100 Items)

### 3.4 Community & Engagement

#### Newsletter
- Wöchentlich: "Diese Woche in der Auktion"
- Monatlich: "Höchste Verkaufspreise & Raritäten"
- Exklusiv: Early Access für Abonnenten (1 Tag vor öffentlicher Auktion)

#### Collector Profiles
- Öffentliche Profile für Bieter (opt-in)
- "Top Collectors" Leaderboard
- Sammlung öffentlich zeigen (wie Discogs Collection)

#### Content Marketing
- Blog: "Die Geschichte hinter dem Album"
- Videos: Vinyl Unboxing, Zustandsbeschreibung
- Podcast: Interviews mit Künstlern

---

## 3A. Themen-Auktionen: Das Block-Modell

### 3A.1 Grundprinzip

Alle Auktionen finden in **Blöcken** statt — niemals als Einzellistings. Ein Block ist eine kuratierte, zeitlich begrenzte Auktionsveranstaltung mit einem optionalen Thema und redaktionellem Content. Dies unterscheidet die Plattform fundamental von eBay/Discogs, wo Items isoliert gelistet werden.

**Vorteile des Block-Modells:**
- **Aufmerksamkeits-Bündelung:** Alle Bieter sind zur gleichen Zeit aktiv
- **Storytelling:** Jedes Thema erzählt eine Geschichte (Editorial Content)
- **FOMO-Effekt:** "Diese Woche: Japanese Noise — nur 7 Tage!"
- **Cross-Selling:** Bieter entdecken verwandte Items im gleichen Block
- **Marketing-Effizienz:** Ein Newsletter/Social-Post pro Block statt pro Item
- **Planbarkeit:** Klarer Auktionskalender für Stammbieter

### 3A.2 Struktur eines Themen-Blocks

```
┌─────────────────────────────────────────────────────┐
│  THEMEN-BLOCK                                        │
│                                                       │
│  Titel:        "Japanese Noise: Merzbow bis Masonna" │
│  Untertitel:   "50 Raritäten aus der Noise-Szene"    │
│  Status:       Entwurf → Geplant → Aktiv → Beendet  │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │  REDAKTIONELLER CONTENT                      │     │
│  │  - Einleitungstext (Rich Text, Markdown)     │     │
│  │  - Headerbild / Banner                       │     │
│  │  - Bildergalerie                              │     │
│  │  - Eingebettetes Video (YouTube/Vimeo)       │     │
│  │  - Audio-Samples / Playlist                  │     │
│  │  - Hintergrundgeschichte zum Thema           │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │  ZEITPLAN                                     │     │
│  │  Start:      2026-04-01 20:00 MESZ           │     │
│  │  Ende:       2026-04-08 22:00 MESZ           │     │
│  │  Dauer:      7 Tage (konfigurierbar)         │     │
│  │  Vorschau:   Ab 2026-03-28 (ohne Bieten)     │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │  PRODUKTE (1-500 Stück)                       │     │
│  │                                               │     │
│  │  Produkt 1: Merzbow - Pulse Demon (Vinyl)   │     │
│  │    → Startpreis: 45€ (aus DB: 90€ Schätzw.) │     │
│  │    → Status: Reserviert für diesen Block      │     │
│  │                                               │     │
│  │  Produkt 2: Masonna - Inner Mind Mystique    │     │
│  │    → Startpreis: 30€ (individuell angepasst) │     │
│  │    → Status: Reserviert für diesen Block      │     │
│  │                                               │     │
│  │  ... bis zu 500 Produkte                      │     │
│  └─────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────┘
```

### 3A.3 Lebenszyklus eines Themen-Blocks

#### Phase 1: Erstellung (Admin)
1. **Thema anlegen:** Titel, Untertitel, Slug (URL-freundlich)
2. **Zeitraum festlegen:** Startdatum/-uhrzeit, Enddatum/-uhrzeit
3. **Redaktionellen Content erstellen:**
   - Einleitungstext (Rich Text Editor)
   - Headerbild hochladen (Banner für Listing + Detail)
   - Optional: Bildergalerie, Video-Embed, Audio-Samples
4. **Status:** `Entwurf`

#### Phase 2: Produktauswahl & Preisfestlegung (Admin)
1. **Produkte aus Gesamtdatenbank auswählen:**
   - Filter nach Genre, Format, Künstler, Zustand, Schätzwert
   - Suche über Volltextsuche
   - Nur Produkte wählbar, die NICHT bereits einem aktiven/geplanten Block zugewiesen sind
2. **Produkte reservieren:**
   - Ausgewählte Produkte werden für diesen Block **reserviert**
   - Reservierte Produkte sind in keinem anderen Block wählbar
   - Reservierung ist reversibel (Admin kann Produkt wieder freigeben)
3. **Startpreise prüfen & anpassen:**
   - Standardmäßig wird der **Schätzwert aus der Datenbank** als Basis verwendet
   - Der Startpreis wird initial auf X% des Schätzwerts gesetzt (konfigurierbar, z.B. 50%)
   - Admin kann jeden Startpreis **individuell überschreiben**
   - Übersichtsliste: Produkt | Schätzwert (DB) | Vorgeschlagener Startpreis | Finaler Startpreis
4. **Status:** `Entwurf` → `Geplant` (nach Freigabe)

#### Phase 3: Vorschau (öffentlich)
- **X Tage vor Start** wird der Block auf der Plattform sichtbar
- Besucher können den redaktionellen Content lesen und Produkte ansehen
- **Bieten ist noch nicht möglich** — nur Vorschau
- "Erinnerung setzen"-Button → Push/Email-Notification bei Start
- Erzeugt Vorfreude und ermöglicht Recherche vor Auktionsbeginn

#### Phase 4: Aktive Auktion
- Ab Startdatum/-uhrzeit: Bieten ist freigeschaltet
- Live-Countdown für das Ende des Blocks
- Jedes Produkt im Block hat eigene Gebots-Historie
- Auto-Extension: Wenn in den letzten 5 Minuten geboten wird → Verlängerung um 5 Min
- **Gestaffeltes Ende** (optional): Nicht alle Lots enden gleichzeitig, sondern im 2-Minuten-Takt
- Newsletter/Push: "Nur noch 24h! / Nur noch 1h!"

#### Phase 5: Abschluss
- Nach Ablauf: Höchstbieter gewinnen
- Automatische Payment-Aufforderung (Stripe)
- Nicht verkaufte Produkte: Reservierung aufheben → zurück in Gesamtdatenbank
- Auswertung: Ergebnisse pro Block (Umsatz, Bids/Item, Sell-Through-Rate)
- Ergebnis-Seite bleibt als Archiv online ("Verkauft für X€")

### 3A.4 Dauer-Konfiguration

| Block-Typ | Dauer | Typischer Einsatz | Produkte |
|-----------|-------|-------------------|----------|
| **Flash-Auktion** | 1 Tag (24h) | Einzelnes Highlight, Überraschungsdrop | 1-10 |
| **Wochenauktion** | 7 Tage | Standard-Themenblock | 20-100 |
| **Monatsauktion** | 30 Tage | Großes Thema, Sammlung | 100-500 |
| **Weekend-Special** | 2-3 Tage | Fr-So Aktion | 10-50 |

**Empfohlener Rhythmus:** 1-2 Wochenauktionen pro Monat + gelegentliche Flash-Auktionen

### 3A.5 Redaktioneller Content pro Block

Jeder Themen-Block hat eine eigene **Landing Page** mit reichhaltigem Content:

**Pflichtfelder:**
- Titel (max. 100 Zeichen)
- Kurzbeschreibung (max. 300 Zeichen, für Listing/SEO/Social)
- Headerbild (Banner, 1920x600px empfohlen)
- Startdatum, Enddatum

**Optionale Content-Elemente:**
- **Langtext:** Rich Text (Markdown oder WYSIWYG) — Geschichte zum Thema, Genre-Erklärung, Sammlertipps
- **Bildergalerie:** Zusätzliche Bilder (z.B. Plattencover-Collage, Studio-Fotos)
- **Video:** YouTube/Vimeo-Embed (z.B. Dokumentar-Clip, Konzertausschnitt)
- **Audio:** Eingebetteter Audio-Player (z.B. Genre-Playlist, Hörproben)
- **Tags:** Genre-Tags für Filterung (z.B. "Industrial", "Noise", "Japan", "Vinyl")
- **Related Blocks:** Verweise auf thematisch verwandte vergangene Auktionen

**Content-Beispiel:**
> **"Japanese Noise: Die radikalste Musik der Welt"**
>
> Von Merzbow über Masonna bis zu den Incapacitants — Japan hat die extremste Klangkunst der Welt hervorgebracht. In dieser Wochenauktion bieten wir 50 handverlesene Raritäten aus unserer Sammlung an, darunter Erstpressungen, limitierte Auflagen und signierte Exemplare.
>
> [Headerbild: Collage japanischer Noise-Cover]
> [Video: 3-Min-Doku über die Noise-Szene]
> [Audio: 30-Sekunden-Samples ausgewählter Lots]

### 3A.6 Produkt-Reservierung & Startpreis-Workflow

#### Reservierungssystem

```
Gesamtdatenbank (~30.000 Produkte)
  │
  ├── Status: "Verfügbar"     → Kann für Blocks ausgewählt werden
  ├── Status: "Reserviert"     → Einem geplanten/aktiven Block zugewiesen
  ├── Status: "In Auktion"    → Block ist aktiv, Bieten läuft
  ├── Status: "Verkauft"       → Auktion gewonnen, Zahlung ausstehend/erledigt
  └── Status: "Nicht verkauft" → Auktion beendet ohne Gebot → wird "Verfügbar"
```

**Regeln:**
- Ein Produkt kann **nur einem Block gleichzeitig** zugewiesen sein
- Bei Block-Löschung im Entwurf: Alle Produkte werden automatisch freigegeben
- Nicht verkaufte Produkte werden nach Block-Ende automatisch freigegeben
- Admin kann Reservierung jederzeit manuell aufheben (solange Block noch nicht aktiv)

#### Startpreis-Workflow

```
Schätzwert (DB)  →  Automatischer Startpreis (50% Schätzwert)  →  Admin-Review  →  Finaler Startpreis
     90€         →              45€                              →   "OK" oder    →     45€
                                                                     "Ändere auf 35€"   35€
```

**Admin-Interface für Startpreis-Review:**
- Tabellenansicht aller Produkte im Block
- Spalten: Bild | Künstler | Titel | Format | Zustand | Schätzwert (DB) | Auto-Startpreis | Finaler Startpreis
- Inline-Editing: Klick auf Startpreis → direktes Ändern
- Bulk-Aktionen: "Alle auf 40% Schätzwert setzen", "Alle auf 1€ setzen" (Attention-Grabber)
- Sortierung: Nach Schätzwert, Künstler, Format
- Validation: Startpreis muss > 0€ sein, Warnung bei Startpreis > Schätzwert

### 3A.7 Block-Typen

#### A) Themen-Block (Standard)
- Kuratiert nach Genre, Künstler, Epoche, Format oder Thema
- Redaktioneller Content erzählt die Geschichte
- Beispiele: "Japanese Noise", "Erstpressungen der 80er", "Test Pressings & White Labels"

#### B) Highlight-Block (Premium)
- Wenige, besonders wertvolle Items (1-20)
- Längere Laufzeit (10-14 Tage)
- Aufwendigerer Content (Video, detaillierte Beschreibungen)
- Höhere Startpreise, Reserve Prices

#### C) Clearance-Block (Bulk)
- Großer Umfang (200-500 Items)
- Niedrige Startpreise (1€)
- Schnelle Rotation, wenig redaktioneller Aufwand
- Ziel: Lagerbestand reduzieren

#### D) Flash-Block (Überraschung)
- Nur 24h, wird kurzfristig angekündigt
- 1-10 besondere Items
- Erzeugt Dringlichkeit und Newsletter-Abos
- "Wer nicht dabei ist, verpasst es"

### 3A.8 Auktionskalender (öffentlich)

Die Plattform zeigt einen öffentlichen **Auktionskalender**:

- **Übersicht:** Alle geplanten, aktiven und vergangenen Blocks
- **Monatsansicht:** Wann startet/endet welcher Block?
- **Filter:** Nach Genre, Format, Preisklasse
- **Abonnieren:** iCal-Export, Newsletter-Abo für neue Blocks
- **Archiv:** Vergangene Blocks mit Ergebnissen ("Verkauft für X€")

**Beispiel-Kalender:**
```
März 2026:
  01.03 - 07.03: "Industrial Legends" (75 Items) ← AKTIV
  10.03 - 10.03: "Flash: Signed Editions" (5 Items) ← GEPLANT
  15.03 - 22.03: "80s First Pressings" (100 Items) ← GEPLANT
  28.03 - 04.04: "Cassette Culture" (50 Items) ← ENTWURF

April 2026:
  05.04 - 12.04: "EBM & Electro" (80 Items) ← GEPLANT
  ...
```

---

## 4. Technisches Konzept

### 4.1 Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                            │
│  Medusa.js + Next.js 15 + React 19 + TypeScript + Tailwind CSS │
│                                                         │
│  - Auktionslisten (Filter, Suche, Sortierung)          │
│  - Einzelauktionen (Live-Bidding, Countdown)            │
│  - User Dashboard (Meine Gebote, Beobachtungsliste)    │
│  - Admin Panel (Item Management, Auktionen erstellen)  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                     API LAYER                           │
│  Next.js API Routes + Supabase Edge Functions           │
│                                                         │
│  - Bid Processing (Validierung, Höchstbieter-Logik)    │
│  - Payment Integration (Stripe)                         │
│  - Email Notifications (Resend/SendGrid)                │
│  - Webhook Handlers (Payment, Outbid-Alerts)           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   DATABASE LAYER                        │
│  Supabase PostgreSQL + Redis (Upstash)                 │
│                                                         │
│  - Items (~30.000 Tonträger mit Metadaten)              │
│  - Auctions (Aktive + Abgeschlossene)                  │
│  - Bids (Alle Gebote mit Timestamps)                   │
│  - Users (Käufer, Verkäufer, Auth)                     │
│  - Redis: Real-time Bid Cache (Performance)            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   INTEGRATIONS                          │
│                                                         │
│  - Stripe (Payments + Escrow)                           │
│  - Discogs API (Metadaten, Preisvergleich)             │
│  - Sendgrid (Transaktions-Emails)                      │
│  - Shippo (Versandlabels)                              │
│  - Google Analytics / Plausible (Tracking)              │
└─────────────────────────────────────────────────────────┘
```

### 4.1A Datenquelle: tape-mag-mvp Supabase (Shared Database)

#### Entscheidung

VOD_Auctions nutzt die **bestehende tape-mag-mvp Supabase-Instanz** (PostgreSQL) als zentrale Produktdatenbank. Keine separate Datenbank, kein Daten-Sync-Problem.

**Supabase-Projekt:** `ouunftsxmuqgfqsoqnxq` (West EU)

#### Begründung

| Kriterium | tape-mag-mvp Supabase | Shopify API | Legacy MySQL | Eigene neue DB |
|-----------|----------------------|------------|-------------|---------------|
| **Schema-Qualität** | Excellent (14 Tabellen, Prisma 6) | Limitiert (Metafields) | Schlecht (latin1, HTML-Entities) | Müsste erst gebaut werden |
| **Erweiterbarkeit** | Direkt (neue Tabellen hinzufügen) | Nein (Shopify API fix) | Nein (Read-only) | Ja, aber Duplizierung |
| **Performance** | Direkte SQL-Queries | API-Rate-Limits (40/s) | OK, aber Drittanbieter-Server | Direkte SQL |
| **Real-time** | Supabase Realtime inklusive | Nein | Nein | Müsste eingerichtet werden |
| **Kosten** | 0€ (Free Tier, bereits bezahlt) | Shopify-Abo nötig | 0€ | Zusätzliches Supabase-Projekt |
| **Sync-Aufwand** | 0 (gleiche DB) | Hoch (API-Polling) | Hoch (ETL-Pipeline) | Hoch (Duplizierung) |

#### Bestehende Datenstruktur (tape-mag-mvp)

Das tape-mag-mvp Prisma-Schema enthält bereits alle relevanten Produktdaten:

```
tape-mag-mvp Supabase (PostgreSQL)
│
├── Release (= Produkt/Tonträger) ← ~30.000 Records
│   ├── id, slug, title, subtitle, description
│   ├── year, releaseDate, format (LP|CD|CASSETTE|BOOK|...)
│   ├── catalogNumber, barcode, country, language
│   ├── coverImage, viewCount, averageRating
│   ├── → Artist (name, country, bio, image)
│   ├── → Label (name, country, description)
│   ├── → Genre[] (many-to-many)
│   ├── → Tag[] (many-to-many)
│   ├── → Image[] (url, alt, width, height, position)
│   └── → Track[] (position, title, duration)
│
├── Artist ← 12.435 Künstler
├── Label ← Record Labels
├── Genre ← Genres (many-to-many mit Release)
├── Tag ← Tags (many-to-many mit Release)
├── Image ← Produktbilder
├── Track ← Tracklisten
│
├── User ← Nutzer (Auth, Profil, Rollen)
├── Comment ← Nutzer-Kommentare
├── Rating ← Bewertungen (1-5 Sterne)
└── Favorite ← Favoriten/Merkliste
```

#### Was fehlt im bestehenden Schema (Erweiterung für Auktionen)

Die folgenden Felder/Tabellen werden als **Supabase-Migrations** zum bestehenden Schema hinzugefügt:

**Erweiterung Release-Tabelle:**
- `estimated_value` (DECIMAL) — Schätzwert für Startpreis-Kalkulation
- `media_condition` (TEXT) — Zustand Medium (Mint, NM, VG+, VG, etc.)
- `sleeve_condition` (TEXT) — Zustand Hülle
- `auction_status` (TEXT) — available | reserved | in_auction | sold
- `current_block_id` (FK) — Verweis auf aktuellen Auktionsblock

**Neue Tabellen (Auktions-Layer):**
- `auction_blocks` — Themen-Auktionsblöcke
- `block_items` — Zuordnung Release → Block (mit Startpreis, Gebotsstatus)
- `bids` — Alle Gebote
- `transactions` — Zahlungen & Versand
- `related_blocks` — Verwandte Blöcke

#### Datenfluss

```
tape-mag-mvp (Archiv/Browse)     VOD_Auctions (Auktionen)
         │                                │
         └────── Shared Supabase DB ──────┘
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
 Release            auction_blocks       bids
 Artist             block_items          transactions
 Label              (verweist auf        (verweist auf
 Genre               Release.id)          block_items.id)
 Image
 Track
```

**Vorteile der Shared-DB-Architektur:**
- **Kein Daten-Sync:** Produktänderungen in tape-mag-mvp sind sofort in VOD_Auctions sichtbar
- **Kein Duplikat-Management:** Eine Release = ein Datensatz, egal ob im Shop oder in der Auktion
- **Shared User-Auth:** Nutzer loggen sich einmal ein, können browse + bieten
- **Konsistente Bilder:** Image-Tabelle wird geteilt, keine doppelte Speicherung

#### Voraussetzung: tape-mag-mvp Data Migration

**Status:** tape-mag-mvp Phase 3 (Data Migration) ist bei **0%** — die ~30.000 Releases aus dem Legacy-System müssen erst in Supabase migriert werden.

**Migration-Pipeline (bereits geplant):**
```
Legacy MySQL (213.133.106.99/vodtapes)
    → 30.093 Releases + 12.435 Artists
    → Datenbereinigung (HTML-Entities, fehlende Preise)
    → Prisma Bulk-Insert → Supabase PostgreSQL
    → Bilder-Migration (FTP → Supabase Storage)
```

**Abhängigkeit:** VOD_Auctions kann erst starten, wenn diese Migration abgeschlossen ist. Die Migration ist daher die erste Aufgabe in Phase 1 (Prototyp).

#### Datenqualität & Anreicherung

| Problem | Betrifft | Lösung |
|---------|---------|--------|
| **63% ohne Preis** | 19.061 Releases | Discogs API für Preisschätzung (VOD_discogs Projekt) |
| **26% ohne Bilder** | 7.855 Releases | Nachfotografie oder Discogs-Bilder |
| **26% ohne Label** | 7.711 Releases | Discogs-Metadaten-Anreicherung |
| **Kein Zustand** | Alle Releases | Manuell beim Listing-Prozess bewerten |
| **Kein estimated_value** | Alle Releases | Discogs Median-Preis als Basis |

---

### 4.2 Datenmodell (PostgreSQL Schema)

Die folgenden Tabellen werden als **Ergänzung** zum bestehenden tape-mag-mvp Schema angelegt. Die `Release`-Tabelle (= Produkt) existiert bereits und wird nur um Auktionsfelder erweitert.

#### Erweiterung: Release-Tabelle (bestehend → erweitert)
```sql
-- Migration: Auktionsfelder zu bestehender Release-Tabelle hinzufügen
ALTER TABLE "Release" ADD COLUMN estimated_value DECIMAL(10,2);
ALTER TABLE "Release" ADD COLUMN media_condition TEXT;
ALTER TABLE "Release" ADD COLUMN sleeve_condition TEXT;
ALTER TABLE "Release" ADD COLUMN auction_status TEXT DEFAULT 'available';
ALTER TABLE "Release" ADD COLUMN current_block_id TEXT;

-- Index für Auktionsfilter
CREATE INDEX idx_release_auction_status ON "Release"(auction_status);
CREATE INDEX idx_release_estimated_value ON "Release"(estimated_value);
```

#### Table: auction_blocks (NEU — Themen-Auktionen)
```sql
CREATE TABLE auction_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Basis
  title TEXT NOT NULL,
  subtitle TEXT,
  slug TEXT UNIQUE NOT NULL, -- URL: /auktionen/japanese-noise-2026

  -- Zeitplan
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  preview_from TIMESTAMP, -- Ab wann sichtbar (ohne Bieten)

  -- Status
  status TEXT DEFAULT 'draft', -- draft, scheduled, preview, active, ended, archived

  -- Block-Typ
  block_type TEXT DEFAULT 'theme', -- theme, highlight, clearance, flash

  -- Redaktioneller Content
  short_description TEXT, -- Max 300 Zeichen (Listing/SEO/Social)
  long_description TEXT, -- Rich Text / Markdown (Haupttext)
  header_image TEXT, -- URL zum Banner (1920x600)
  gallery_images TEXT[], -- Array zusätzlicher Bild-URLs
  video_url TEXT, -- YouTube/Vimeo-Embed-URL
  audio_url TEXT, -- Audio-Player URL (Playlist/Samples)
  tags TEXT[], -- Genre-Tags für Filterung

  -- Einstellungen
  staggered_ending BOOLEAN DEFAULT false, -- Gestaffeltes Ende
  stagger_interval_seconds INTEGER DEFAULT 120, -- 2 Min zwischen Lot-Enden
  default_start_price_percent INTEGER DEFAULT 50, -- Standard: 50% des Schätzwerts
  auto_extend BOOLEAN DEFAULT true,
  extension_minutes INTEGER DEFAULT 5,

  -- Ergebnisse (nach Ende)
  total_revenue DECIMAL(10,2),
  total_items INTEGER,
  sold_items INTEGER,
  total_bids INTEGER,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_blocks_status ON auction_blocks(status);
CREATE INDEX idx_blocks_start ON auction_blocks(start_time);
CREATE INDEX idx_blocks_slug ON auction_blocks(slug);
CREATE INDEX idx_blocks_tags ON auction_blocks USING GIN(tags);
```

#### Table: block_items (NEU — Zuordnung Release → Block)
```sql
CREATE TABLE block_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  block_id UUID REFERENCES auction_blocks(id) ON DELETE CASCADE,
  release_id TEXT REFERENCES "Release"(id) ON DELETE CASCADE, -- Verweis auf bestehende Release-Tabelle

  -- Preise
  estimated_value DECIMAL(10,2), -- Schätzwert aus DB (Snapshot)
  start_price DECIMAL(10,2) NOT NULL, -- Finaler Startpreis (Admin-Review)
  reserve_price DECIMAL(10,2), -- Mindestpreis (geheim)
  buy_now_price DECIMAL(10,2), -- Sofortkauf (optional)

  -- Auktionsstatus
  current_price DECIMAL(10,2),
  highest_bidder_id UUID REFERENCES users(id),
  bid_count INTEGER DEFAULT 0,
  lot_number INTEGER, -- Reihenfolge innerhalb des Blocks
  lot_end_time TIMESTAMP, -- Individuelles Ende (bei gestaffeltem Ende)

  -- Status
  status TEXT DEFAULT 'reserved', -- reserved, active, sold, unsold

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(block_id, release_id), -- Ein Release nur einmal pro Block
  UNIQUE(block_id, lot_number) -- Eindeutige Lot-Nummer pro Block
);

CREATE INDEX idx_block_items_block ON block_items(block_id);
CREATE INDEX idx_block_items_release ON block_items(release_id);
CREATE INDEX idx_block_items_status ON block_items(status);
```

#### Table: related_blocks (NEU — Verwandte Blocks)
```sql
CREATE TABLE related_blocks (
  block_id UUID REFERENCES auction_blocks(id) ON DELETE CASCADE,
  related_block_id UUID REFERENCES auction_blocks(id) ON DELETE CASCADE,
  PRIMARY KEY (block_id, related_block_id)
);
```

#### Table: Release (BESTEHEND — tape-mag-mvp)
```sql
-- Die Release-Tabelle existiert bereits im tape-mag-mvp Schema (Prisma 6).
-- Sie enthält: id, slug, title, subtitle, description, year, format,
-- catalogNumber, barcode, country, coverImage, artistId, labelId, etc.
-- Wird nur um Auktionsfelder erweitert (siehe ALTER TABLE oben).
--
-- Zusätzlich bestehend: Artist, Label, Genre, Tag, Image, Track Tabellen
-- → Alle Produktdaten kommen aus dem bestehenden Schema.
```

#### Table: bids
```sql
CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  block_item_id UUID REFERENCES block_items(id) ON DELETE CASCADE, -- Verweis auf Lot im Block
  user_id UUID REFERENCES users(id),

  amount DECIMAL(10,2) NOT NULL,
  max_amount DECIMAL(10,2), -- For proxy bidding

  is_winning BOOLEAN DEFAULT false,
  is_outbid BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bids_block_item ON bids(block_item_id, created_at DESC);
CREATE INDEX idx_bids_user ON bids(user_id);
```

#### Table: users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,

  -- Profile
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,

  -- Reputation
  feedback_score INTEGER DEFAULT 0,
  positive_ratings INTEGER DEFAULT 0,
  negative_ratings INTEGER DEFAULT 0,

  -- Settings
  email_notifications BOOLEAN DEFAULT true,
  max_bid_amount DECIMAL(10,2), -- Spending limit

  -- Auth
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);
```

#### Table: transactions
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  block_item_id UUID REFERENCES block_items(id), -- Verweis auf verkauftes Lot
  block_id UUID REFERENCES auction_blocks(id), -- Verweis auf Block
  buyer_id UUID REFERENCES users(id),

  amount DECIMAL(10,2) NOT NULL,
  shipping_cost DECIMAL(10,2),
  total DECIMAL(10,2) NOT NULL,

  -- Payment
  stripe_payment_intent TEXT,
  payment_status TEXT DEFAULT 'pending', -- pending, paid, refunded

  -- Shipping
  shipping_address JSONB,
  tracking_number TEXT,
  shipped_at TIMESTAMP,
  delivered_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4.3 Core Features & Implementation

#### 4.3.1 Real-time Bidding System

**Challenge:** Sub-second latency für Live-Gebote

**Lösung:** Hybrid Redis + PostgreSQL

```typescript
// Redis für Real-time State
const currentBid = await redis.get(`auction:${auctionId}:current_bid`);
const bidCount = await redis.get(`auction:${auctionId}:bid_count`);

// Optimistic Locking
const newBid = {
  auctionId,
  userId,
  amount,
  timestamp: Date.now()
};

// Atomic increment check
const success = await redis
  .multi()
  .set(`auction:${auctionId}:current_bid`, amount, 'GT', currentBid) // Greater Than
  .incr(`auction:${auctionId}:bid_count`)
  .exec();

if (success) {
  // Persist to PostgreSQL
  await supabase.from('bids').insert(newBid);

  // Notify other clients (Server-Sent Events)
  await notifyBidUpdate(auctionId, newBid);
}
```

**WebSockets vs. Server-Sent Events:**
- **SSE (empfohlen):** Einfacher, unidirektional, HTTP/2-kompatibel
- **WebSockets:** Bidirektional, aber mehr Overhead

**Implementierung:**
```typescript
// app/api/auctions/[id]/stream/route.ts
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const channel = supabase
        .channel(`auction:${params.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'bids',
          filter: `auction_id=eq.${params.id}`
        }, (payload) => {
          const data = `data: ${JSON.stringify(payload.new)}\n\n`;
          controller.enqueue(encoder.encode(data));
        })
        .subscribe();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

#### 4.3.2 Proxy Bidding (Autobid)

**Konzept:** Nutzer setzt Maximalgebot, System bietet automatisch bis zu diesem Limit

```typescript
async function placeBid(auctionId: string, userId: string, maxAmount: number) {
  const auction = await getAuction(auctionId);
  const currentHighestBid = auction.current_price;

  // Check if user can outbid current highest
  const requiredBid = currentHighestBid + auction.min_bid_increment;

  if (maxAmount < requiredBid) {
    throw new Error('Max amount too low');
  }

  // Place bid at minimum required amount
  const actualBid = requiredBid;

  // Store max amount secretly
  await supabase.from('bids').insert({
    auction_id: auctionId,
    user_id: userId,
    amount: actualBid,
    max_amount: maxAmount // Hidden from other users
  });

  // Update auction
  await supabase.from('auctions')
    .update({
      current_price: actualBid,
      highest_bidder_id: userId,
      bid_count: auction.bid_count + 1
    })
    .eq('id', auctionId);

  // Notify outbid users
  await notifyOutbidUsers(auctionId, userId);
}
```

#### 4.3.3 Auktionsende & Auto-Extension

**Cron Job:** Prüft jede Minute ablaufende Auktionen

```typescript
// app/api/cron/check-auctions/route.ts
export async function GET() {
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60000);

  // Find auctions ending soon
  const { data: auctions } = await supabase
    .from('auctions')
    .select('*')
    .eq('status', 'active')
    .lt('end_time', fiveMinutesFromNow);

  for (const auction of auctions) {
    // Check if bid placed in last 5 minutes
    const { data: recentBids } = await supabase
      .from('bids')
      .select('created_at')
      .eq('auction_id', auction.id)
      .gte('created_at', new Date(auction.end_time.getTime() - 5 * 60000))
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentBids.length > 0 && auction.auto_extend) {
      // Extend auction by 5 minutes
      await supabase
        .from('auctions')
        .update({
          end_time: new Date(auction.end_time.getTime() + 5 * 60000)
        })
        .eq('id', auction.id);

      console.log(`Extended auction ${auction.id} by 5 minutes`);
    }
  }

  // End auctions that have passed end_time
  await endExpiredAuctions();

  return Response.json({ success: true });
}
```

#### 4.3.4 Payment Flow (Stripe Integration)

**Flow:**
1. Auktion endet → Höchstbieter wird Käufer
2. System erstellt Payment Intent (Stripe)
3. Käufer bekommt Email mit Zahlungslink
4. Nach Zahlung: Verkäufer verschickt Item
5. Nach Lieferbestätigung: Stripe überweist an Verkäufer (minus Gebühren)

**Escrow-Alternative:** Stripe Connect für Plattform-Kommissionen

```typescript
// Create Payment Intent after auction ends
const paymentIntent = await stripe.paymentIntents.create({
  amount: Math.round(finalPrice * 100), // Convert to cents
  currency: 'eur',
  customer: stripeCustomerId,
  metadata: {
    auction_id: auctionId,
    item_id: itemId
  },
  // Hold funds until shipping confirmed
  capture_method: 'manual'
});

// Later: Capture after shipping
await stripe.paymentIntents.capture(paymentIntent.id);
```

### 4.4 Daten-Migration (Legacy → Supabase)

**Quelle:** Legacy MySQL (30.093 Releases) → tape-mag-mvp Supabase

Die bestehende tape-mag-migration Infrastruktur wird genutzt:

```bash
cd /Users/robin/Documents/4_AI/VOD/tape-mag-migration

# Legacy MySQL → Supabase Migration (tape-mag-mvp Phase 3)
# Details: siehe tape-mag-migration/CLAUDE.md
```

**Anreicherung für Auktionen:**
- Discogs API → `estimated_value` (Preisschätzung)
- Zustandsbewertung → `media_condition`, `sleeve_condition` (manuell beim Listing)
- Bilder → Supabase Storage (Migration aus Legacy FTP)

**Hinweis:** Shopify enthält Testdaten aus einer früheren Evaluierung — diese sind nicht die primäre Datenquelle.

### 4.5 Admin Panel

**Features:**
- Bulk-Upload via CSV
- Discogs Import (via API)
- Auktionen erstellen/bearbeiten
- Gebots-Monitoring (Live-Dashboard)
- Item-Fotografie-Workflow (Upload + Cropping)
- Reporting (Revenue, Conversion Rates, Top Items)

**Tech:** React Admin oder Refine.dev (Open Source Admin Framework)

---

## 5. Rechtliche & Compliance-Aspekte

### 5.1 Verbraucherschutzrecht

**Herausforderung:** Auktionen im B2C-Bereich unterliegen strengen Regeln

**Kernpunkte:**
- **Widerrufsrecht:** Bei Online-Auktionen gelten 14 Tage Widerrufsrecht
  - **Ausnahme:** Bei "öffentlichen Versteigerungen" (§ 312g BGB) KEIN Widerrufsrecht
  - **Aber:** Nur wenn Bieter physisch anwesend ist → Online-Auktionen = kein Ausschluss möglich
- **Lösung:** Widerrufsrecht in AGB klar kommunizieren + kulante Rücknahme anbieten

### 5.2 Gewährleistung

- **Gebrauchte Tonträger:** Sachmängelhaftung kann auf 1 Jahr verkürzt werden (§ 476 BGB)
- **Zustandsbeschreibung:** Muss präzise sein (Mint, VG+, etc.)
- **Fotos:** Gelten als Teil der Beschreibung

### 5.3 Preistransparenz

- **Endpreis:** Muss inkl. Versandkosten angezeigt werden
- **Gebühren:** Käuferaufgeld (falls vorhanden) muss klar ausgewiesen sein

### 5.4 Datenschutz (GDPR)

- **Bieter-Daten:** Nur für Abwicklung nutzen
- **Opt-in:** Für Newsletter erforderlich
- **Löschpflicht:** Nach 3 Jahren inaktive Accounts löschen

### 5.5 Steuern

- **Umsatzsteuer:** Differenzbesteuerung für Gebrauchtware möglich (§ 25a UStG)
  - Nur auf Marge (Verkaufspreis - Einkaufspreis), nicht auf Gesamtpreis
  - Dokumentationspflicht: Einkaufspreis nachweisen
- **Einkommenssteuer:** Gewerblicher Handel (bei ~30.000 Items eindeutig)

---

## 6. Implementierungsplan

### Phase 1: Prototyp — Eigene Auktionsplattform (Monate 1-2)

**Ziel:** Funktionsfähiger Prototyp der eigenen Auktionsplattform mit Block-Modell

**Ausgangslage:** Der Markt ist durch jahrelange Erfahrung mit eBay und Discogs validiert. Wir starten direkt mit dem Aufbau der eigenen Plattform.

**Technologie:** Medusa.js + Next.js + Supabase (tape-mag-mvp Shared DB) + Stripe

**Maßnahmen:**

1. **Datenbank vorbereiten (Woche 1-2):**
   - tape-mag-mvp Data Migration abschließen (~30.000 Releases → Supabase)
   - Auktions-Tabellen anlegen (auction_blocks, block_items, bids, transactions)
   - Release-Tabelle um Auktionsfelder erweitern (estimated_value, auction_status, condition)
   - Discogs-Preisdaten importieren für estimated_value (VOD_discogs Projekt)

2. **Admin-Panel: Block-Erstellung (Woche 2-4):**
   - Themen-Block anlegen (Titel, Beschreibung, Zeitraum, Headerbild)
   - Produkte aus Release-Datenbank auswählen (Suche, Filter, Browse)
   - Produkt-Reservierung implementieren
   - Startpreis-Review (Tabellenansicht mit Inline-Editing)
   - Block-Status-Workflow (Entwurf → Geplant → Aktiv → Beendet)

3. **Public Frontend: Block-Ansicht (Woche 3-5):**
   - Auktionskalender (aktive + geplante Blocks)
   - Block-Detailseite (redaktioneller Content + Produktliste)
   - Einzelprodukt-Ansicht mit Gebots-Historie
   - Countdown-Timer pro Block
   - Responsive Design (Mobile-First)

4. **Bidding-Engine (Woche 4-6):**
   - User-Registrierung & Auth (Supabase Auth)
   - Gebot abgeben (Validierung, Mindesterhöhung)
   - Proxy Bidding (Maximalgebot)
   - Real-time Updates (Supabase Realtime / SSE)
   - Outbid-Benachrichtigungen (Email)
   - Auto-Extension (Sniping-Schutz)

5. **Payment-Integration (Woche 5-7):**
   - Stripe Checkout nach Auktionsende
   - Automatische Zahlungsaufforderung an Höchstbieter
   - Transaktions-Tracking (bezahlt / ausstehend / erstattet)

6. **Testlauf (Woche 7-8):**
   - Interner Test: 1 Themen-Block mit 10-20 echten Produkten
   - Freunde/Familie als Test-Bieter einladen
   - Bugs fixen, UX-Feedback einarbeiten
   - Performance-Test (Concurrent Bidding)

**Kosten:**
- Entwicklung: Eigenleistung (Claude Code + eigene Entwicklung)
- Hosting: 0€ (Vercel Free + Supabase Free Tier)
- Stripe: Erst bei echten Transaktionen (1,5% + 0,25€)
- Domain: ~15€/Jahr (vod-auctions.com)

**Ergebnis:** Funktionsfähige Auktionsplattform mit:
- Admin: Blocks erstellen, Produkte zuweisen, Startpreise setzen
- Public: Blocks browsen, Produkte ansehen, Gebote abgeben
- System: Real-time Bidding, Auto-Extension, Payment

**Go/No-Go für Live-Betrieb:**
- Prototyp funktioniert technisch stabil
- Erste echte Themen-Auktion auf eigener Plattform durchführbar

---

### Phase 2: Launch & erste Auktionen (Monate 3-4)

**Ziel:** Erste öffentliche Themen-Auktionen auf der eigenen Plattform

**Maßnahmen:**
1. **Launch vorbereiten:**
   - Domain: vod-auctions.com
   - Design finalisieren (Logo, Farben, Schriften)
   - Zahlungsintegration (Stripe) produktionsreif
   - Versandoptionen konfigurieren
2. **Erste Auktionen:**
   - 2-3 Themen-Blöcke mit je 50-100 Produkten
   - Mix aus Raritäten und Mittelklasse
   - Ergebnisse auswerten (Umsatz, Bids/Item, Sell-Through-Rate)
3. **Marketing:**
   - Newsletter an bestehende tape-mag.com Kunden
   - Social Media Ankündigung
   - Cross-Linking von tape-mag.com

**Kosten:**
- Hosting: 0-50€/Monat (Vercel + Supabase)
- Stripe: 1,5% + 0,25€ pro Transaktion
- Marketing: 1.000€ initial

**Ziel-Metriken:**
- 500 registrierte Nutzer nach 2 Monaten
- 2-3 Themen-Blöcke pro Monat
- 10.000€ Umsatz/Monat

---

### Phase 3: Skalierung (Monate 5-8)

**Ziel:** 5.000+ Items auf Plattform, monatlich 50.000€ Umsatz

**Maßnahmen:**
1. **Katalog erweitern:**
   - Schrittweise Erweiterung auf 5.000+ aktive Items
   - Discogs API für Preisschätzungen und Metadaten-Anreicherung
   - Foto-Batch-Processing für noch nicht fotografierte Items
2. **Marketing-Offensive:**
   - Google Ads (Suchbegriffe: "Industrial Vinyl kaufen", "Rare Industrial Records")
   - Kooperationen mit Musik-Blogs/Magazines
   - Influencer-Seeding (Vinyl-YouTuber)
3. **Feature-Erweiterungen:**
   - "Best Offers" System
   - Watchlist & Saved Searches
   - Collector Profiles
4. **Community-Building:**
   - Forum/Discord für Sammler
   - User-Generated Content (Reviews)

**Kosten:**
- Marketing: 2.000€/Monat
- Software: 500€/Monat (höheres Tier)

---

### Phase 4: Evaluierung & Vollausbau (Monate 9-12)

**Ziel:** Evaluierung der Plattform und Entscheidung über Vollausbau

**Szenarien:**

#### Szenario A: Plattform läuft gut
- **Indikator:** >50.000€ Umsatz/Monat, stabile Bieter-Community
- **Aktion:** Vollausbau auf 20.000+ Items, Premium-Features (AI-Preisempfehlungen, Mobile App)

#### Szenario B: Plattform läuft moderat
- **Indikator:** 20.000-50.000€ Umsatz/Monat
- **Aktion:** Optimierung von Marketing und Sortiment, ggf. Bidlogix API für Bidding-Engine evaluieren

#### Szenario C: Auktionen funktionieren nicht
- **Indikator:** <20.000€ Umsatz/Monat, hohe Retouren, wenig Gebote
- **Aktion:** Plattform als Festpreis-Shop umwidmen oder Betrieb einstellen

---

### Phase 5: Premium-Features & Vollausbau (Jahr 2)

**Ziel:** Plattform mit Premium-Features zum Marktführer im Nischen-Segment ausbauen

**Features:**
- AI-gestützte Preisempfehlungen (ML auf historischen Auktionsdaten)
- Integrierter Player (Audio-Samples der Alben)
- Social Features (User-Sammlungen, Follows, Nachrichten)
- Mobile Apps (iOS/Android) oder PWA
- API für Drittanbieter und Partnerschaften
- Internationalisierung (EN, DE, JP)

**Kosten:**
- Weiterentwicklung: Eigenleistung oder externe Unterstützung nach Bedarf
- Hosting: ~100-200€/Monat (bei 20.000+ Items, Supabase Pro + Vercel Pro)
- Design-Refresh: 3.000-5.000€ (Freelance)

---

## 7. Finanzplanung & ROI

### 7.1 Kostenmodell (3 Szenarien)

#### Szenario 1: eBay + Discogs (Vergleichswert — bisheriger Status quo)
**Umsatz:** 50.000€/Monat (realistisch bei 2.000 Verkäufen/Monat × 25€)

**Kosten:**
- eBay-Gebühren: 12,8% = 6.400€
- Discogs-Gebühren: 8% = 4.000€
- Payment-Gebühren: 3% = 1.500€
- Versand-Handling: 2.000€
- **Gesamt:** 13.900€ (27,8%)

**Nettogewinn:** 36.100€/Monat

---

#### Szenario 2: Eigene Plattform (Ziel)
**Umsatz:** 75.000€/Monat (höherer Durchschnittspreis durch Auktionen)

**Kosten:**
- Hosting (Vercel Pro + Supabase Pro): 150€
- Payment-Gebühren (Stripe 1,5%): 1.125€
- Marketing: 2.000€
- Versand-Handling: 3.000€
- **Gesamt:** 6.275€ (8,4%)

**Nettogewinn:** 68.725€/Monat

**Verbesserung vs. eBay/Discogs:** +32.625€/Monat (90% mehr)

---

#### Szenario 3: Eigene Plattform skaliert (Jahr 2+)
**Umsatz:** 100.000€/Monat (volle Skalierung, ~30.000 Items online)

**Kosten:**
- Hosting (Vercel Pro + Supabase Pro): 200€
- Payment-Gebühren: 1,5% = 1.500€
- Marketing: 3.000€
- Entwickler-Support: 1.000€/Monat (Wartung)
- Versand-Handling: 4.000€
- **Gesamt:** 9.700€ (9,7%)

**Nettogewinn:** 90.300€/Monat

**Verbesserung vs. Szenario 2:** +23.425€/Monat (35% mehr)

---

### 7.2 Break-Even-Analyse

**Annahme:** Start mit eigener Plattform (Phase 1-2)

**Initialkosten:**
- Domain + Setup: 500€
- Initiales Marketing: 2.000€
- Item-Fotografie (Equipment): 2.000€
- **Gesamt:** 4.500€

**Laufende Kosten (ab Phase 2):**
- Hosting (Vercel + Supabase): 50€/Monat
- Marketing: 1.000€/Monat
- **Gesamt:** 1.050€/Monat

**Mindestumsatz für Break-Even:**
- Fixed Costs: 1.050€
- Variable Costs: ~3% (nur Stripe, keine Plattform-Kommissionen)
- **Break-Even-Umsatz:** 1.050 / (1 - 0,03) = 1.082€/Monat

**Realistisch erreichbar nach:** 1 Monat (nur ~40 Verkäufe à 25€ nötig)

---

### 7.3 ROI-Projektion (3 Jahre)

| Jahr | Umsatz/Monat | Nettogewinn/Monat | Kumulativ |
|------|--------------|-------------------|-----------|
| 1    | 50.000€      | 40.000€          | 480.000€  |
| 2    | 75.000€      | 65.000€          | 1.260.000€|
| 3    | 100.000€     | 90.000€          | 2.340.000€|

**Investition über 3 Jahre:**
- Phase 1 (Prototyp): 1.000€ (Domain, Stripe-Gebühren)
- Phase 2 (Launch): 2.000€ (Marketing)
- Phase 3 (Skalierung): 20.000€ (Marketing + Foto-Equipment)
- Phase 5 (Premium-Features): 10.000€ (Design + ggf. externe Entwicklung)
- **Gesamt:** 33.000€ (Entwicklung primär Eigenleistung)

**ROI:** (2.340.000 - 33.000) / 33.000 = **6.991%** über 3 Jahre

---

## 8. Risiken & Mitigation

### 8.1 Technische Risiken

#### Risiko 1: Skalierungsprobleme bei Echtzeit-Bidding
**Eintrittswahrscheinlichkeit:** Mittel
**Impact:** Hoch (Auktionen unbrauchbar)

**Mitigation:**
- Redis für Real-time Caching
- Load Testing mit 1.000 concurrent users
- CDN für statische Assets (Bilder)
- Database Query-Optimierung (Indexes, Views)

#### Risiko 2: Vendor Lock-in bei White-Label
**Eintrittswahrscheinlichkeit:** Hoch
**Impact:** Mittel (Datenexport möglich, aber Aufwand)

**Mitigation:**
- Vertragliche Data-Export-Klausel
- Regelmäßige Backups
- Exit-Strategie zu Custom-Plattform geplant

### 8.2 Business-Risiken

#### Risiko 3: Zu wenig Bieter (Liquiditätsproblem)
**Eintrittswahrscheinlichkeit:** Hoch (Cold Start)
**Impact:** Sehr hoch (Auktionen enden unter Wert)

**Mitigation:**
- Reserve Prices setzen
- Hybrid: "Buy It Now" zusätzlich zu Auktion
- Seeding: Eigene "Gebote" als Shill Bidding (ACHTUNG: Rechtlich fragwürdig! Nur als Startpreis nutzen)
- Marketing-Budget für User-Akquisition

#### Risiko 4: Konkurrenz durch Discogs/eBay
**Eintrittswahrscheinlichkeit:** Hoch
**Impact:** Mittel (Käufer bleiben bei bekannten Plattformen)

**Mitigation:**
- Differenzierung: Exklusive Items nur auf eigener Plattform
- Bessere Curation: Thematische Auktionen
- Community-Features: Forum, Sammler-Profile
- Niedrigere Gebühren als eBay (attraktiv für Verkäufer)

#### Risiko 5: Hohe Retourenquote (Käufer-Reue)
**Eintrittswahrscheinlichkeit:** Mittel
**Impact:** Mittel (Gewinn-Schmälerung)

**Mitigation:**
- Sehr detaillierte Zustandsbeschreibungen
- Viele hochauflösende Fotos
- Audio-Samples (wo möglich)
- Kulante Rücknahme (innerhalb 14 Tage)
- Reputationssystem für Käufer (schlechte Käufer blockieren)

### 8.3 Rechtliche Risiken

#### Risiko 6: Abmahnungen wegen AGB/Impressum
**Eintrittswahrscheinlichkeit:** Mittel
**Impact:** Mittel (Geldstrafe, aber reparierbar)

**Mitigation:**
- Anwalt für E-Commerce beauftragen (AGB-Prüfung)
- Impressum nach DSGVO
- Cookie-Consent (falls Google Analytics genutzt)

#### Risiko 7: Steuerprüfung wegen Differenzbesteuerung
**Eintrittswahrscheinlichkeit:** Mittel
**Impact:** Hoch (Nachzahlungen)

**Mitigation:**
- Einkaufspreise dokumentieren (Quittungen, Lieferantenlisten)
- Steuerberater konsultieren
- Buchhaltungssoftware (Lexoffice, sevDesk)

---

## 9. Empfehlung & Entscheidungshilfe

### 9.1 Zusammenfassung der Optionen

| Kriterium | eBay/Discogs (bisher) | White-Label SaaS | Eigene Plattform (gewählt) |
|-----------|----------------------|------------------|---------------------------|
| **Time to Market** | Sofort | 1 Monat | 2 Monate |
| **Initialkosten** | 0€ | 10.000€ | ~4.500€ (Eigenleistung) |
| **Laufende Kosten** | Hoch (8-13% + Payment) | Mittel (SaaS + 2-3%) | Niedrig (nur Hosting + Stripe 1,5%) |
| **Kontrolle** | Keine | Mittel | Voll |
| **Themen-Blöcke** | Nicht möglich | Nur mit Custom-Dev | Native Unterstützung |
| **Differenzierung** | Keine | Mittel | Hoch |
| **Kundendaten** | Beim Anbieter | Geteilt | 100% eigene Daten |

### 9.2 Entscheidung: Eigene Plattform direkt bauen

**Phase 1 (Monat 1-2):** Prototyp mit Block-Modell
→ Technische Basis aufbauen, Testlauf mit 10-20 Produkten

**Phase 2 (Monat 3-4):** Launch mit ersten Themen-Auktionen
→ Erste öffentliche Blöcke, Marketing an bestehende Kundenbasis

**Phase 3 (Monat 5-8):** Skalierung auf 5.000+ Items
→ Katalog erweitern, Marketing-Offensive, Community aufbauen

**Phase 4 (Monat 9-12):** Evaluierung & Vollausbau
→ Basierend auf Ergebnissen: Premium-Features oder Kurskorrektur

### 9.3 Next Steps (Woche 1-4)

**Woche 1:**
- [ ] tape-mag-mvp Data Migration vorantreiben (~30.000 Releases → Supabase)
- [ ] Auktions-Tabellen in Supabase anlegen (auction_blocks, block_items, bids)
- [ ] Release-Tabelle um Auktionsfelder erweitern

**Woche 2:**
- [ ] Admin-Panel: Block-Erstellung (Titel, Zeitraum, Content)
- [ ] Produktauswahl aus Release-Datenbank implementieren
- [ ] Startpreis-Review Interface

**Woche 3:**
- [ ] Public Frontend: Auktionskalender + Block-Detailseite
- [ ] Einzelprodukt-Ansicht mit Countdown
- [ ] User-Registrierung (Supabase Auth)

**Woche 4:**
- [ ] Bidding-Engine: Gebot abgeben, Validierung, Real-time Updates
- [ ] Interner Testlauf: 1 Block mit 10-20 echten Produkten
- [ ] Bugs fixen, UX-Feedback einarbeiten

---

## 10. Anhang

### 10.1 Plattform-Recherche (Stand: März 2026)

**Zentrale Erkenntnis:** Keine existierende Plattform unterstützt das Konzept "Themen-Auktionsblöcke mit redaktionellem Content" vollständig out-of-the-box. Das ist ein echtes Differenzierungsmerkmal.

#### Kategorie A: Open-Source Plattformen

| Plattform | Tech Stack | Event-Auktionen | API/Headless | Stripe | Bewertung |
|-----------|-----------|-----------------|-------------|--------|-----------|
| **Medusa.js + Custom** | Node/TS/Next.js/PostgreSQL | Muss gebaut werden | REST + GraphQL | Ja | ⭐⭐⭐⭐⭐ |
| **Saleor** | Python/Django/GraphQL/React | Muss gebaut werden | GraphQL | Ja | ⭐⭐⭐ |
| **Bazaar** | PHP/Laravel/MySQL | Nein | Nein | Nein | ⭐⭐ |

**Medusa.js** (28k+ GitHub Stars, MIT-Lizenz):
- Headless Commerce-Plattform mit modularer Architektur
- Community-Auction-Demo-Modul vorhanden (github.com/VariableVic/medusa-auction-demo)
- Identischer Stack wie unsere bestehenden Projekte (Next.js, TypeScript, Stripe)
- Aufwand: 6-10 Wochen für Themen-Auktions-Modul + Real-time Bidding

#### Kategorie B: White-Label SaaS / APIs

| Plattform | Typ | Event-Auktionen | API | Monatl. Kosten | Bewertung |
|-----------|-----|-----------------|-----|----------------|-----------|
| **Bidlogix/BidJS** | Widget + REST API | Ja (Lots in Events) | Ja (Pro) | ~580€ | ⭐⭐⭐⭐ |
| **AuctionWorx Events** | Self-hosted Lizenz | Ja (Kernkonzept) | Nein | Einmalig (Quote) | ⭐⭐⭐ |
| **AuctionMethod** | SaaS Flatrate | Ja (unbegrenzte Events) | Ja (API+Webhooks) | Quote-based | ⭐⭐⭐⭐ |
| **Circuit Auction** | SaaS (WordPress) | Ja | Nein | 2% Kommission | ⭐⭐⭐ |
| **AuctionSoftware.com** | Lizenz | Anpassbar | Ja (React API) | Ab $750 einmalig | ⭐⭐⭐ |
| **Bidsquare Cloud** | SaaS White-label | Ja | Nein | ~510€ | ⭐⭐ |
| **AuctionGo** | SaaS White-label | Teilweise | Nein | ~1.400€ | ⭐⭐ |

**Bidlogix Bidding API** (UK, DSGVO-bewusst):
- Embeddable Auction Widget ODER standalone REST API für komplett eigenes Frontend
- Real-time Bidding, Reserve Prices, Anti-Sniping, Proxy Bidding built-in
- Wir bauen nur das Editorial-Frontend (Next.js), Bidlogix übernimmt die Bidding-Logik
- Trade-off: ~580€/Monat laufend, aber deutlich schnellere Time-to-Market (2-4 Wochen)

**AuctionMethod** (US):
- Unlimited Events, keine Pro-Lot-Gebühren, keine Kommission
- API + Webhooks für Custom-Frontend-Integration
- Speziell für Collectibles-Markt positioniert
- CSV-Bulk-Upload für Datenbank-Sync

#### Kategorie C: Nicht empfohlen

| Plattform | Grund |
|-----------|-------|
| **AuctionGo** | Zu teuer (~1.400€/Monat), B2B-fokussiert |
| **Auction Mobility** | Enterprise-Pricing, kein Headless |
| **Webtron 9AI** | Kein API, proprietär, australisch |
| **WooCommerce + Plugin** | Kein echter Real-time Bidding, Performance-Probleme bei 500-Lot-Events |

#### Entscheidung: Medusa.js (Build)

**Gewählt: Medusa.js** — Volle Kontrolle, identischer Tech-Stack, keine laufenden SaaS-Kosten.

- **Investition:** 6-10 Wochen Entwicklung, danach nur Hosting-Kosten
- **Vorteil:** Themen-Auktionen mit redaktionellem Content exakt nach Konzept, modulare Architektur, 28k+ GitHub Stars, MIT-Lizenz
- **Community:** Auction-Demo-Modul vorhanden (github.com/VariableVic/medusa-auction-demo) als Startpunkt
- **Stack:** Node.js/TypeScript/Next.js/PostgreSQL — identisch mit bestehenden Projekten

**Verworfen: Bidlogix API** — ~580€/Monat laufende Kosten, Vendor-Abhängigkeit, keine eigene Bidding-Logik

### 10.2 Technologie-Stack (Entscheidung)

| Komponente | Gewählt | Begründung |
|------------|---------|------------|
| **Commerce-Engine** | Medusa.js 2.x | Open Source, modulare Architektur, Auction-Demo vorhanden |
| **Frontend** | Next.js 15+ | Bewährt (Blackfire_service, MyNews.com), SSR/SSG, React 19 |
| **Database** | Supabase PostgreSQL | Shared DB mit tape-mag-mvp, Realtime inkl., Free Tier |
| **Real-time** | Supabase Realtime | Für Live-Bidding, keine Extra-Kosten |
| **Cache** | Upstash Redis | Serverless Redis, Bid-Cache für Sub-Second Latency |
| **Payment** | Stripe | 1,5% + 0,25€, Stripe Connect für Escrow |
| **Storage** | Supabase Storage | Produktbilder, Editorial Content, CDN inkl. |
| **Hosting** | Vercel | Auto-Deploy, Edge Functions, bewährt |
| **Styling** | Tailwind CSS | Konsistent mit bestehenden Projekten |
| **UI** | shadcn/ui | Bewährt, zugänglich, anpassbar |

**Begründung:**
- Identischer Stack wie bestehende Projekte (Blackfire_service, MyNews.com, tape-mag-mvp)
- Supabase: All-in-One (DB, Auth, Storage, Realtime) — Shared DB eliminiert Sync-Probleme
- Medusa.js: Headless Commerce mit Plugin-System, perfekt für Custom-Auction-Modul
- Kosteneffizient: Free Tier bis 500 MB DB, Vercel Free für Start

### 10.3 Beispiel-Kalkulation: 1 Jahr eigene Plattform

**Annahmen:**
- 5.000 Items online
- 500 Verkäufe/Monat
- Ø Verkaufspreis: 50€
- Umsatz: 25.000€/Monat

**Kosten (eigene Plattform):**
- Hosting (Vercel Pro + Supabase Pro): 100€
- Payment (Stripe 1,5%): 375€
- Marketing: 1.000€
- Versand-Handling: 1.000€
- **Gesamt:** 2.475€

**Nettogewinn:** 22.525€/Monat = **270.300€/Jahr**

**Vergleich zu eBay/Discogs (8-13% Gebühr):**
- Gebühr bei Discogs (8%): 2.000€/Monat → Nettogewinn: 20.500€/Monat = 246.000€/Jahr
- Gebühr bei eBay (12,8%): 3.200€/Monat → Nettogewinn: 19.300€/Monat = 231.600€/Jahr

**Mehrgewinn vs. Discogs:** 24.300€/Jahr (9,9% mehr)
**Mehrgewinn vs. eBay:** 38.700€/Jahr (16,7% mehr)

---

## 8. Datenpflege & Preisanreicherung

### 8.1 Architektur-Übersicht

```
┌─────────────┐      täglich 04:00 UTC       ┌──────────────┐
│ Legacy MySQL │ ──────────────────────────→  │   Supabase   │
│  (vodtapes)  │  legacy_sync.py              │  PostgreSQL  │
│  ~30.000     │  neue/geänderte Einträge     │  ~30.000     │
└─────────────┘                                │  Releases    │
                                               │              │
┌─────────────┐      initial + wöchentlich    │  + discogs_* │
│  Discogs    │ ──────────────────────────→   │  + sync_log  │
│  API        │  discogs_batch.py (einmalig)  │              │
│  Marketplace│  discogs_weekly_sync.py (So)  └──────┬───────┘
└─────────────┘                                       │
                                                      ▼
                                               ┌──────────────┐
                                               │  Admin Panel  │
                                               │  /admin/media │
                                               │  /admin/sync  │
                                               │  Medusa.js    │
                                               └──────────────┘
```

### 8.2 Permanente Legacy-Synchronisation

**Zweck:** Neue Tonträger, die in der Legacy-Datenbank (MySQL/vodtapes) eingetragen werden, sollen automatisch in die neue Supabase-Datenbank übernommen werden.

**Technik:**
- Python-Script `scripts/legacy_sync.py`
- Täglicher Cronjob auf VPS (04:00 UTC)
- Vergleicht Legacy-IDs mit vorhandenen `legacy-*` IDs in Supabase
- INSERT neue Einträge (Artists, Labels, Releases, Images)
- UPSERT geänderte Einträge (title, catalogNumber, year, format, country)
- **Geschützte Felder:** discogs_*, estimated_value, media_condition, sleeve_condition, auction_status werden NIE überschrieben

**Logging:**
- Ergebnisse in `sync_log` Tabelle (sync_type='legacy')
- Console-Log + Logdatei auf VPS

### 8.3 Discogs-Preisanreicherung

#### Machbarkeitsprüfung (2026-03-03)

Test mit 100 zufälligen Tonträgern aus der Datenbank:

| Metrik | Ergebnis |
|--------|----------|
| **Match-Rate gesamt** | 69% |
| **Mit Preis (lowest_price)** | 34% |
| **LP Match-Rate** | 86% (82% mit Preis) |
| **Kassette Match-Rate** | 64% (20% mit Preis) |
| **Preis-Median** | 19,99€ |

**API-Limitation:** Discogs API liefert nur `lowest_price` (nicht Median/Durchschnitt). Community-Daten (`have`/`want`) sind verfügbar.

**Matching-Strategien (4-Tier, absteigend nach Präzision):**
1. Katalognummer + Artist (14,5% der Matches)
2. Barcode (wenn vorhanden)
3. Artist + Title + Format (78,3% der Matches)
4. Artist + Title ohne Format (7,2% der Matches)

#### 8.3.1 Initialer Batch (einmalig)

**Script:** `scripts/discogs_batch.py`
- Verarbeitet alle ~30.000 Releases (ohne BOOK/POSTER/ZINE)
- 4-Tier Matching-Strategie
- Speichert: `discogs_id`, `discogs_lowest_price`, `discogs_num_for_sale`, `discogs_have`, `discogs_want`
- **Resumierbar:** Bei Unterbrechung fortsetzbar (Progress-Datei)
- **Rate Limit:** 55 req/min (konservativ unter 60 API-Limit)
- **Geschätzte Laufzeit:** 8-12 Stunden

#### 8.3.2 Wöchentlicher Preis-Sync

**Script:** `scripts/discogs_weekly_sync.py`
- Sonntags 02:00 UTC via Cronjob
- Nur Releases mit `discogs_id` (~15.000-20.000)
- 1 API-Call pro Release (`/marketplace/stats/{discogs_id}`)
- Loggt Preisänderungen in `sync_log` mit JSONB-Diff
- **Geschätzte Laufzeit:** 4-5 Stunden

#### Datenbank-Erweiterung

Neue Spalten auf Release-Tabelle:
```sql
discogs_id INTEGER                  -- Discogs Release ID
discogs_lowest_price DECIMAL(10,2)  -- Aktueller niedrigster Preis
discogs_num_for_sale INTEGER        -- Anzahl aktiver Listings
discogs_have INTEGER                -- Community: Besitzer
discogs_want INTEGER                -- Community: Wunschliste
discogs_last_synced TIMESTAMP       -- Letzter Discogs-Abgleich
legacy_last_synced TIMESTAMP        -- Letzter Legacy-Abgleich
```

Neue Tabelle `sync_log`:
```sql
id SERIAL PRIMARY KEY
release_id TEXT FK → Release.id
sync_type TEXT ('discogs' | 'legacy')
sync_date TIMESTAMP
changes JSONB                        -- z.B. {"lowest_price": {"old": 12.50, "new": 15.00}}
status TEXT ('success' | 'error')
error_message TEXT
```

#### Startpreis-Kalkulation

```
estimated_value = discogs_lowest_price (oder manuell gesetzt)
start_price = estimated_value × default_start_price_percent (Standard: 50%)
→ Admin kann Startpreis individuell anpassen
```

Für Items ohne Discogs-Preis: pauschale Startpreise (1€-5€ je nach Format).

### 8.4 Medienverwaltung (Admin Panel)

Neuer Admin-Bereich unter `/admin/media` für die Verwaltung aller ~30.000 Tonträger.

**Features:**
- **Dashboard-Header:** Gesamt-Releases, mit Discogs-Match, mit Preis, letzter Sync
- **Tabelle:** Cover, Artist, Title, Format, Jahr, Label, CatNo, Discogs-Preis, Discogs-ID (Link), Status
- **Suche:** Volltextsuche über Artist, Title, Katalognummer
- **Filter:** Format (Pill-Buttons), Jahr-Range, Land, Label, Hat Discogs (Ja/Nein), Hat Preis (Ja/Nein), Auktions-Status
- **Sortierung:** Alle Spalten sortierbar
- **Pagination:** 25/50/100 pro Seite
- **Detail-Ansicht:** Alle Felder, editierbare Felder (estimated_value, media_condition, sleeve_condition), Discogs-Daten, Sync-Historie

### 8.5 Sync-Dashboard (Admin Panel)

Neuer Admin-Bereich unter `/admin/sync` für den Überblick über alle Sync-Prozesse.

**Features:**
- **Legacy Sync Status:** Letzter Sync, neue/geänderte/fehlerhafte Einträge, Differenz Legacy vs. Supabase
- **Discogs Sync Status:** Coverage (% mit Match, % mit Preis), letzter Batch/Weekly-Lauf
- **Sync-Log:** Letzte 50 Einträge (Datum, Typ, Release, Status, Änderungen)
- **Legacy Details:** Tabellen-Counts, zuletzt hinzugefügte Releases
- **Discogs Details:** Coverage nach Format, Preis-Statistiken, Top 20 wertvollste Releases, letzte Preisänderungen

---

## 11. Glossar

- **Reserve Price:** Mindestpreis, unter dem Item nicht verkauft wird (geheim)
- **Proxy Bidding:** Automatisches Bieten bis zu einem vom Nutzer gesetzten Maximum
- **Shill Bidding:** Illegales "Hochbieten" durch Verkäufer selbst
- **Escrow:** Treuhanddienst, der Zahlung bis zur Lieferung hält
- **White-Label:** Software, die als eigene Marke verwendet werden kann
- **SSE (Server-Sent Events):** Echtzeit-Updates vom Server an Client
- **Differenzbesteuerung:** Umsatzsteuer nur auf Marge, nicht Gesamtpreis

---

**Ende des Konzeptdokuments**

*Nächster Schritt: Phase 1 starten — Data Migration + Prototyp-Entwicklung*
