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
  - Website tape-mag.com (30.000+ Releases, Online-Katalog)
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

| Kriterium | tape-mag-mvp Supabase | Legacy MySQL | Eigene neue DB |
|-----------|----------------------|-------------|---------------|
| **Schema-Qualität** | Excellent (14 Tabellen, Prisma 6) | Schlecht (latin1, HTML-Entities) | Müsste erst gebaut werden |
| **Erweiterbarkeit** | Direkt (neue Tabellen hinzufügen) | Nein (Read-only) | Ja, aber Duplizierung |
| **Performance** | Direkte SQL-Queries | OK, aber Drittanbieter-Server | Direkte SQL |
| **Real-time** | Supabase Realtime inklusive | Nein | Müsste eingerichtet werden |
| **Kosten** | 0€ (Free Tier, bereits bezahlt) | 0€ | Zusätzliches Supabase-Projekt |
| **Sync-Aufwand** | 0 (gleiche DB) | Hoch (ETL-Pipeline) | Hoch (Duplizierung) |

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

---

## 12. Erweiterung: CRM, Newsletter, Social Media & Marketing-Automation

**Stand:** 2026-03-07
**Kontext:** VOD Records betreibt 3 Plattformen (tape-mag.com, vod-records.com, vod-auctions.com) mit überlappender Zielgruppe. Bisher gibt es keine zentrale Kundenverwaltung, kein Newsletter-System und keine systematische Social-Media-Präsenz. Dieses Kapitel definiert die Architektur für den Aufbau einer integrierten Marketing-Infrastruktur.

### 12.1 Ist-Zustand & Bestandsaufnahme

#### 12.1.1 Bestehende Systeme

| System | Plattform | Auth | Kundendaten | Status |
|--------|-----------|------|-------------|--------|
| **vod-auctions.com** | Medusa.js Backend (VPS:9000) | Medusa Auth (JWT) | `customer` Tabelle (Medusa ORM) | Production |
| **tape-mag.com** | Statischer Katalog (Legacy PHP) | Kein Login | Legacy MySQL Customer DB | Production |
| **vod-records.com** | WordPress/WooCommerce | WP Auth | WooCommerce Customer DB | Production |
| **Transaktionale Emails** | Resend | — | — | 6 Templates, Domain verifiziert |
| **Analytics** | Google Analytics 4 | — | GA4 Property `G-M9BJGC5D69` | Consent-gated |
| **Error Tracking** | Sentry | — | — | Production-only |

#### 12.1.2 Bestehende Kundendaten

| Quelle | Geschätzte Kontakte | Verfügbare Daten |
|--------|---------------------|------------------|
| tape-mag.com (Legacy) | ~2.000-5.000 | Email, Name, Kaufhistorie, Adresse |
| vod-records.com (WooCommerce) | ~500-2.000 | Email, Name, Bestellungen |
| vod-auctions.com (Medusa) | ~10-50 (neu) | Email, Name, Gebote, Käufe, Präferenzen |
| Legacy MySQL (vodtapes) | Unbekannt | Ggf. alte Kundeneinträge |

#### 12.1.3 VPS-Infrastruktur (72.62.148.205)

Laufende PM2-Prozesse relevant für die Erweiterung:
- `vodauction-backend` — Medusa.js (Port 9000)
- `vodauction-storefront` — Next.js (Port 3006)
- Cronjobs: Legacy Sync (04:00 UTC), Discogs Weekly (So 02:00 UTC), Feedback Emails (10:00 UTC)

**Freie Kapazität:** VPS hat noch Headroom für 2-3 weitere leichte Services (Newsletter-Cron, Social-Media-Scheduler).

---

### 12.2 CRM — Zentrale Kundenverwaltung

#### 12.2.1 Anforderungen

1. **Unified Customer Profile:** Ein Kontakt über alle 3 Plattformen hinweg (Deduplizierung via Email)
2. **Kaufverhalten tracken:** Auktions-Gebote, Gewinne, Direktkäufe, WooCommerce-Bestellungen
3. **Segmentierung:** Nach Genre-Präferenzen, Kauffrequenz, Durchschnittswert, Plattform-Herkunft
4. **Automatisierung:** Trigger-basierte Aktionen (neuer Auktions-Block → Notification an relevante Segmente)
5. **DSGVO-konform:** Double Opt-in, Löschrechte, Datenexport
6. **API-Zugang:** Bidirektionaler Sync mit Medusa Backend

#### 12.2.2 Plattform-Entscheidung

| Option | Tool | Kosten/Monat | CRM | Newsletter | Automation | API |
|--------|------|-------------|-----|-----------|------------|-----|
| **A: All-in-One SaaS** | **Brevo (ex-Sendinblue)** | Free (300/Tag) → Starter €9 → Business €18 | Ja | Ja | Ja | REST + SMTP |
| **B: CRM + separater Newsletter** | HubSpot Free + Resend | €0 + €0 | Ja | Nein (Resend bleibt) | Begrenzt | REST |
| **C: Self-hosted** | Listmonk + Custom DB | €0 (VPS) | Custom | Ja | Custom | Custom |
| **D: Premium SaaS** | Klaviyo / Mailchimp | €20-100+ | Ja | Ja | Ja | REST |

**Empfehlung: Option A — Brevo**

Begründung:
- **CRM + Newsletter + Automation in einer Plattform** — kein Tooling-Wildwuchs
- **Free Tier** reicht für Start: 300 Emails/Tag, unbegrenzte Kontakte, CRM, Automation
- **Resend bleibt** für transaktionale Emails (Bid-Won, Outbid, Payment, Shipping) — Brevo nur für Marketing
- **REST API** für bidirektionalen Sync mit Medusa Backend
- **DSGVO-konform:** EU-Unternehmen (Frankreich), Server in EU
- **Skalierung:** Starter (€9/Monat, 5.000 Emails/Monat) → Business (€18/Monat, 5.000 Emails/Monat + Marketing Automation)

#### 12.2.3 Datenmodell — Brevo Contact Properties

```
# Standard-Felder (Brevo built-in)
EMAIL                    # Primary Key / Deduplizierung
FIRSTNAME, LASTNAME
PHONE

# Custom Contact Attributes
PLATFORM_ORIGIN          # tape-mag | vod-records | vod-auctions | multi
MEDUSA_CUSTOMER_ID       # Mapping zu Medusa customer Tabelle
WOOCOMMERCE_CUSTOMER_ID  # Mapping zu WooCommerce (für Import)
TAPE_MAG_CUSTOMER_ID     # Mapping zu tape-mag.com Legacy (für Import)

# Kaufverhalten
TOTAL_PURCHASES          # Anzahl Käufe (alle Plattformen)
TOTAL_SPENT              # Gesamtumsatz in €
AVG_ORDER_VALUE          # Durchschnittlicher Bestellwert
LAST_PURCHASE_DATE       # Letzter Kauf

# Auktions-spezifisch
TOTAL_BIDS_PLACED        # Anzahl abgegebener Gebote
TOTAL_AUCTIONS_WON       # Anzahl gewonnener Auktionen
HIGHEST_BID_EVER         # Höchstes jemals abgegebenes Gebot
PREFERRED_GENRES         # Komma-separiert: "Industrial, Dark Ambient, Noise"
PREFERRED_FORMATS        # Komma-separiert: "Vinyl, Cassette"

# Engagement
NEWSLETTER_OPTIN         # Boolean: Newsletter-Einwilligung
OPTIN_DATE               # Datum der Einwilligung
LAST_ACTIVITY_DATE       # Letzter Login/Besuch
CUSTOMER_SEGMENT         # VIP | Active | Occasional | Dormant | New
```

#### 12.2.4 Integration: Medusa Backend → Brevo CRM

**Architektur:** Event-driven Sync via Medusa Backend Webhooks → Brevo API

```
┌──────────────────┐     Events      ┌─────────────────┐
│  Medusa Backend  │ ──────────────→ │   Brevo CRM     │
│  (VPS:9000)      │                 │   (SaaS)        │
│                  │                 │                  │
│  • Registration  │  POST /v3/      │  • Contacts      │
│  • Bid placed    │  contacts       │  • Lists          │
│  • Auction won   │                 │  • Automation     │
│  • Purchase      │  ←────────────  │  • Campaigns      │
│  • Shipping      │  Webhooks       │  • Analytics      │
└──────────────────┘                 └─────────────────┘
```

**Sync-Events (Medusa → Brevo):**

| Event | Trigger | Brevo Action |
|-------|---------|-------------|
| **Customer Registration** | `POST /store/auth/register` | Create/Update Contact, add to "VOD Auctions" List |
| **Bid Placed** | `POST /store/.../bids` | Update `TOTAL_BIDS_PLACED`, `LAST_ACTIVITY_DATE` |
| **Auction Won** | `auction-lifecycle.ts` (Block endet) | Update `TOTAL_AUCTIONS_WON`, trigger "Congratulations" Automation |
| **Purchase Completed** | Stripe Webhook → `paid` | Update `TOTAL_PURCHASES`, `TOTAL_SPENT`, `LAST_PURCHASE_DATE` |
| **Shipping Sent** | Admin: shipping_status → `shipped` | Trigger Tracking-Notification |

**Implementation (neues Backend-Modul):**

```
backend/src/lib/brevo.ts              # Brevo API Client (REST, API-Key Auth)
backend/src/lib/crm-sync.ts           # Event-Handler: syncContactToBrevo()
```

**Brevo API-Key:** Wird als `BREVO_API_KEY` in `.env` gespeichert (VPS + lokal).

**Sync-Logik (`crm-sync.ts`):**
```typescript
// Pseudocode — wird bei jedem relevanten Event aufgerufen
async function syncContactToBrevo(email: string, attributes: Record<string, any>) {
  // POST https://api.brevo.com/v3/contacts
  // Body: { email, attributes, listIds: [VOD_AUCTIONS_LIST_ID], updateEnabled: true }
  // updateEnabled: true → Create or Update (Upsert)
}
```

**Kein separater Cronjob nötig:** Events werden synchron im Request-Handler getriggert (fire-and-forget, non-blocking). Bei Fehler: Log + Retry-Queue (optional, Phase 2).

#### 12.2.5 Initialer Datenimport

**Phase 1 — vod-auctions.com Kunden (sofort):**
- SQL-Query auf Medusa `customer` Tabelle → CSV Export
- Brevo CSV-Import mit Mapping auf Custom Attributes
- Automatisch in Liste "VOD Auctions Customers"

**Phase 2 — tape-mag.com Kunden (Launch):**
- Legacy MySQL → Customers Export (SQL-Query → CSV)
- Brevo CSV-Import, `PLATFORM_ORIGIN = tape-mag`
- Automatisch in Liste "TAPE-MAG Customers"
- Deduplizierung via Email (Brevo built-in)

**Phase 3 — vod-records.com Kunden (Launch):**
- WooCommerce → WP Admin → Users/Orders → Export CSV (Plugin: "Users & Customers Export")
- Brevo CSV-Import, `PLATFORM_ORIGIN = vod-records`
- Deduplizierung via Email

**DSGVO-Hinweis:** Bestehende Kunden dürfen nur für transaktionale Kommunikation kontaktiert werden. Für Newsletter-Marketing ist ein erneutes Opt-in erforderlich (Double Opt-in via Brevo Confirmation Email). Import mit `NEWSLETTER_OPTIN = false` als Default.

---

### 12.3 SSO — Single Sign-On Bewertung

#### 12.3.1 Analyse der 3 Plattformen

| Plattform | Auth-System | Änderbarkeit | User-Volumen |
|-----------|------------|-------------|-------------|
| **vod-auctions.com** | Medusa Auth (Custom JWT) | Voll kontrolliert | Gering (neu) |
| **tape-mag.com** | Legacy PHP (kein Login) | Kein Auth-System vorhanden | Gering |
| **vod-records.com** | WordPress Auth | Änderbar (Plugin) | Mittel |

#### 12.3.2 Entscheidung: Kein SSO — CRM-basierte Unified Identity

**Begründung:**
1. **tape-mag.com hat kein Auth-System:** Legacy PHP-Katalog ohne Login-Funktionalität — SSO kann dort nicht angebunden werden
2. **Unterschiedliche Zwecke:** tape-mag.com (Katalog, kein Login nötig), vod-records.com (Shop), vod-auctions.com (Auktionen) — Nutzer brauchen selten Zugang zu allen 3 gleichzeitig
3. **Kosten-Nutzen:** Keycloak/Auth0 Setup-Aufwand (2-4 Wochen) steht in keinem Verhältnis zum Nutzen bei aktuellen User-Zahlen
4. **CRM löst 90% des Problems:** Brevo CRM führt alle Kontakte über alle Plattformen zusammen (Deduplizierung via Email). Der Kunde muss nicht dieselben Credentials haben — er ist im CRM als ein Kontakt mit mehreren Plattform-IDs gespeichert.

**Zukunftsoption (Phase 4+):**
Wenn tape-mag.com auf ein eigenes Frontend migriert wird (z.B. Next.js + Medusa), kann ein gemeinsames Auth-System eingeführt werden:
- **Supabase Auth** als zentrale Auth-Instanz für alle 3 Plattformen
- Shared Supabase-Projekt `bofblwqieuvmqybzxapx` ist bereits die gemeinsame DB
- Medusa Auth könnte durch Supabase Auth ersetzt oder via Custom Auth Provider verbunden werden

**Voraussetzung:** Erst wenn tape-mag.com ein eigenes Auth-System hat.

---

### 12.4 Newsletter-System

#### 12.4.1 Strategie

**Ziel:** Regelmäßige Newsletter an Sammler-Community mit hohem Engagement (>30% Open Rate erwartet wegen Nische).

**Frequenz:**
- **Auktions-Ankündigungen:** Bei jedem neuen Themen-Block (unregelmäßig, ~2-4× pro Monat)
- **Katalog-Highlights:** 1× pro Woche (neue Zugänge, Preisänderungen, Featured Items)
- **Community-Newsletter:** 1× pro Monat (Rückblick, Statistiken, Szene-News)

#### 12.4.2 Newsletter-Typen

| Typ | Trigger | Zielgruppe | Inhalt |
|-----|---------|-----------|--------|
| **Neuer Auktions-Block** | Admin erstellt Block mit Status "scheduled" | Alle Opt-in Kontakte + Segment nach Genre | Block-Titel, Teaser-Text, 3-5 Highlight-Items mit Bildern, Start-Datum, CTA "View Auction" |
| **Wöchentliche Highlights** | Cronjob (Montags 10:00 UTC) | Alle Opt-in Kontakte | Top 10 neue Katalog-Einträge, Preis-Updates, meistgesuchte Items |
| **Auktions-Ergebnisse** | Block endet (Status "ended") | Teilnehmer des Blocks | Ergebnisse, Verkaufspreise, "Similar items available" |
| **Persönliche Empfehlungen** | Cronjob (monatlich) | Aktive Bieter | AI-generierte Empfehlungen basierend auf Gebotshistorie |
| **Monatlicher Digest** | Cronjob (1. des Monats) | Alle Opt-in Kontakte | Zusammenfassung, Statistiken, Community-Highlights |

#### 12.4.3 Technische Umsetzung

**Brevo als Newsletter-Plattform:**
- Templates in Brevo erstellen (Drag & Drop Editor oder HTML)
- Design: Konsistent mit VOD Auctions Branding (Dark Theme, Gold Akzente, DM Serif Display)
- Variablen: `{{contact.FIRSTNAME}}`, `{{params.BLOCK_TITLE}}`, `{{params.ITEM_IMAGE_URL}}`

**Automatisierte Newsletter via Medusa Backend:**

```
┌──────────────────┐                  ┌─────────────────┐
│  Medusa Backend  │   Brevo API      │   Brevo         │
│                  │   POST /v3/      │                  │
│  auction-        │   smtp/email     │   • Template     │
│  lifecycle.ts    │ ───────────────→ │   • Sending      │
│  (Block → scheduled)               │   • Tracking     │
│                  │                  │   • Unsubscribe   │
│  newsletter-     │                  │                  │
│  cron.ts (weekly)│                  │                  │
└──────────────────┘                  └─────────────────┘
```

**Neue Backend-Dateien:**
```
backend/src/lib/brevo.ts                    # Brevo API Client
backend/src/lib/newsletter.ts               # Newsletter-Logik (Template-Auswahl, Daten-Aggregation)
backend/src/jobs/newsletter-weekly.ts        # Cronjob: Wöchentliche Highlights
backend/src/jobs/newsletter-block-announce.ts # Triggered: Neuer Block angekündigt
```

**Cronjob (VPS):**
```bash
# Wöchentlicher Newsletter (Montags 10:00 UTC)
0 10 * * 1 cd ~/VOD_Auctions/backend && node -e "require('./dist/jobs/newsletter-weekly.js').run()" >> newsletter.log 2>&1
```

Alternativ: Medusa Scheduled Job (wie `auction-lifecycle.ts`), dann ist kein separater Cronjob nötig.

#### 12.4.4 Double Opt-in Flow

1. Kunde registriert sich auf vod-auctions.com
2. Medusa → Brevo: Contact erstellt mit `NEWSLETTER_OPTIN = false`
3. Storefront zeigt Checkbox: "Subscribe to our newsletter" (unchecked by default)
4. Bei Opt-in → Brevo Double Opt-in Email (Brevo built-in Feature)
5. Kunde bestätigt → `NEWSLETTER_OPTIN = true`
6. Unsubscribe: Brevo Unsubscribe-Link in jedem Newsletter (DSGVO-Pflicht)

#### 12.4.5 Resend vs. Brevo — Klare Trennung

| Zweck | System | Beispiele |
|-------|--------|----------|
| **Transaktionale Emails** | Resend (bleibt) | Bid-Won, Outbid, Payment-Confirmation, Shipping, Feedback-Request, Welcome |
| **Marketing-Emails** | Brevo (neu) | Newsletter, Auktions-Ankündigungen, Empfehlungen, Digest |

Begründung: Transaktionale Emails müssen sofort und zuverlässig zugestellt werden (Resend, dedizierte IP, verifizierte Domain `noreply@vod-auctions.com`). Marketing-Emails haben andere Anforderungen (Tracking, A/B-Testing, Unsubscribe, Segmentierung).

---

### 12.5 Social Media System

#### 12.5.1 Plattform-Strategie

| Plattform | Priorität | Content-Typ | Frequenz | Zielgruppe |
|-----------|----------|-------------|---------|-----------|
| **Instagram** | Hoch | Produkt-Fotos, Auktions-Teaser, Stories | 3-5× pro Woche | Sammler, Vinyl-Community |
| **Facebook** | Mittel | Auktions-Links, Community-Posts, Events | 2-3× pro Woche | Ältere Sammler, Gruppen |
| **TikTok** | Niedrig (Zukunft) | Unboxing, "What's this worth?", Behind-the-scenes | 1-2× pro Woche | Jüngere Sammler |
| **Threads** | Niedrig | Cross-posting von Instagram | Automatisch | Ergänzend |
| **YouTube** | Zukunft (Phase 4+) | Auktions-Previews, Genre-Dokumentationen, Vinyl-Reviews | 1-2× pro Monat | Deep-dive Publikum |

#### 12.5.2 Content-Scheduling Tool

**Empfehlung: Buffer (Free Plan)**
- 3 Kanäle kostenlos (Instagram, Facebook, Threads)
- Scheduling + Analytics
- Kein Self-Hosting nötig
- Upgrade auf Essentials ($6/Monat/Kanal) wenn mehr Kanäle nötig

**Alternativen:** Later (Free: 1 Social Set), Hootsuite (teuer), Publer

#### 12.5.3 AI-gestützte Content-Generierung (Phase 3)

**Konzept:** Automatische Erstellung von Social-Media-Posts aus Auktions-Daten.

**Trigger:** Neuer Auktions-Block wird auf "scheduled" gesetzt.

**Pipeline:**
```
┌──────────────┐     Block-Daten      ┌──────────────┐     Posts        ┌──────────────┐
│  Medusa DB   │ ──────────────────→  │  Python      │ ──────────────→ │  Buffer API  │
│  (Supabase)  │  Items, Images,      │  Script      │  Text + Bild   │  (Scheduling)│
│              │  Artists, Prices     │  + Claude    │  pro Plattform │              │
└──────────────┘                      │  API         │                 └──────────────┘
                                      └──────────────┘
```

**Script:** `scripts/social_media_generator.py`
- Liest Block-Daten aus Supabase (Titel, Items, Bilder, Genres)
- Claude Haiku 4.5 generiert plattformspezifische Texte (Instagram: kurz + Hashtags, Facebook: länger, Threads: casual)
- Wählt 3-5 beste Produktbilder als Carousel
- Optional: Buffer API zum automatischen Scheduling (oder manuelles Posten via Buffer UI)

**Kosten:** ~$0.01-0.05 pro generiertem Post (Claude Haiku 4.5)

**VPS-Integration:**
```bash
# Manuell oder via Cronjob nach Block-Erstellung
cd ~/VOD_Auctions/scripts
python3 social_media_generator.py --block-id <BLOCK_ID>
```

#### 12.5.4 Content-Kategorien

| Kategorie | Anteil | Beispiel |
|-----------|--------|---------|
| **Auktions-Teaser** | 40% | "Coming soon: Dark Ambient Rarities 1990-1995 — 50 lots, starting at €1. Bidding opens March 15." + Carousel |
| **Produkt-Highlights** | 30% | Einzelnes Item mit Story/Hintergrund, Discogs-Bewertung, "Available in our catalog" |
| **Behind-the-scenes** | 15% | Lager, Verpackung, neue Funde, Frank Bulls Expertise |
| **Community/Engagement** | 15% | Polls ("What's your grail?"), Repost von Käufer-Fotos, Genre-Diskussionen |

---

### 12.6 Marketing-Automation & Paid Ads

#### 12.6.1 Phasenplan

| Phase | Zeitraum | Maßnahmen | Budget/Monat |
|-------|----------|----------|-------------|
| **Phase 2 (Launch)** | Monate 3-4 | Newsletter an Bestandskunden, Social Media organisch, Cross-Links tape-mag.com | €0 |
| **Phase 3 (Skalierung)** | Monate 5-8 | Google Ads (Search), Facebook/Instagram Ads, Retargeting | €500-1.000 |
| **Phase 4 (Vollausbau)** | Monate 9-12 | Lookalike Audiences, AI-Empfehlungen, Influencer-Kooperationen | €1.000-3.000 |

#### 12.6.2 Brevo Marketing-Automationen

**Automation 1: Welcome Flow (ab Launch)**
```
Trigger: Neuer Kontakt mit NEWSLETTER_OPTIN = true
→ Sofort: Welcome Email (Brevo Template)
→ +3 Tage: "Discover our catalog" Email (Top-Items nach Genre)
→ +7 Tage: "Your first auction" Email (Anleitung + aktive Blöcke)
```

**Automation 2: Auktions-Engagement (ab Launch)**
```
Trigger: Kontakt hat geboten aber nicht gewonnen (TOTAL_BIDS > 0, TOTAL_AUCTIONS_WON = 0)
→ +1 Tag nach Block-Ende: "Similar items" Email
→ +7 Tage: "New auctions starting soon" Email
```

**Automation 3: Win-Back (ab Phase 3)**
```
Trigger: LAST_ACTIVITY_DATE > 60 Tage
→ "We miss you" Email mit aktuellen Highlights
→ +14 Tage: Exklusiver 10% Gutschein für Direktkauf
```

**Automation 4: VIP Segment (ab Phase 3)**
```
Trigger: TOTAL_SPENT > 500€ ODER TOTAL_AUCTIONS_WON > 5
→ Automatisch in Segment "VIP" verschieben
→ Early Access zu neuen Auktions-Blöcken (24h vor öffentlichem Start)
→ Exklusive Preview-Emails
```

#### 12.6.3 Google Ads (Phase 3)

**Kampagnen-Struktur:**
- **Search Ads:** Keywords wie "Industrial Vinyl kaufen", "Rare Cassettes auction", "Throbbing Gristle vinyl", "Dark Ambient records"
- **Shopping Ads:** Katalog-Feed aus Supabase → Google Merchant Center (Produkt-URLs von vod-auctions.com/catalog/*)
- **Display Retargeting:** GA4 Audiences → Besucher die Katalog/Auktionen angesehen aber nicht geboten haben

**GA4 Integration:**
- Audiences in GA4 anlegen (basierend auf bestehenden Events: `trackCatalogView`, `trackAuctionView`, `trackBidPlaced`)
- Google Ads Conversion Tracking: `trackAuctionWon` + Stripe Payment Confirmed als Conversions
- Bereits implementiert: `analytics.ts` mit 7 Event-Tracking-Helpers (RSE-106)

**Kosten-Kontrolle:**
- Tages-Budget: €20-30 (€600-900/Monat)
- CPC-Erwartung: €0.30-0.80 (Nischen-Keywords, wenig Wettbewerb)
- Ziel-ROAS: 5:1 (€5 Umsatz pro €1 Ads-Ausgabe)

#### 12.6.4 Meta Ads — Facebook & Instagram (Phase 3)

**Kampagnen-Typen:**
- **Awareness:** Carousel Ads mit Auktions-Highlights → Link zu Block-Seite
- **Retargeting:** Facebook Pixel auf vod-auctions.com → Besucher die nicht geboten haben
- **Lookalike:** Basierend auf bestehenden Käufern (Brevo CRM Export → Facebook Custom Audience)

**Implementation:**
- Facebook Pixel in Storefront einbauen (ähnlich GoogleAnalytics.tsx, consent-gated)
- Conversion API (Server-side) über Medusa Backend für Bid/Purchase Events

**Geschätzte Kosten:** €300-500/Monat

---

### 12.7 Backend-Integrationen — Zentralisierung im Medusa Backend

**Prinzip:** Das Medusa Backend (VPS:9000) ist bereits der zentrale Hub für alle Kunden-Events (Registration, Bids, Wins, Purchases, Shipping). Statt separate Tools für CRM, Newsletter und Social Media zu verwalten, werden alle Integrationen als Module im Backend gebündelt. Frank bedient alles über eine Oberfläche — das Admin-Panel.

**Leitlinie:** Alles was durch Kundenaktionen getriggert wird, gehört ins Backend. Externe Tools (Brevo, Buffer) sind nur für Delivery zuständig (Emails versenden, Posts publizieren).

#### 12.7.1 Übersicht — Neue Backend-Module

| Modul | Dateien | Aufwand | Priorität | Phase |
|-------|---------|---------|-----------|-------|
| **Brevo API Client** | `lib/brevo.ts` | ~100 Zeilen | Hoch | 2 (Launch) |
| **CRM Event-Sync** | `lib/crm-sync.ts` | ~150 Zeilen | Hoch | 2 (Launch) |
| **Newsletter Admin API** | `api/admin/newsletter/` | ~80 Zeilen | Hoch | 2 (Launch) |
| **Newsletter Admin UI** | `admin/routes/newsletter/page.tsx` | ~200 Zeilen | Hoch | 2 (Launch) |
| **Brevo Webhook Handler** | `api/webhooks/brevo/route.ts` | ~50 Zeilen | Mittel | 2 (Launch) |
| **CRM Dashboard** | `admin/routes/customers/page.tsx` | ~150 Zeilen | Mittel | 3 (Skalierung) |
| **Social Media Generator** | `api/admin/social-media/` | ~120 Zeilen | Niedrig | 3 (Skalierung) |

**Gesamt:** ~850 Zeilen neuer Code. Kein neues DB-Modell nötig (Brevo ist die CRM-Datenbank).

#### 12.7.2 Brevo API Client (`lib/brevo.ts`)

Zentraler, stateless REST-Client für alle Brevo-Interaktionen.

```typescript
// backend/src/lib/brevo.ts — Pseudocode
class BrevoClient {
  private apiKey: string;
  private baseUrl = 'https://api.brevo.com/v3';

  // CRM
  async upsertContact(email: string, attributes: Record<string, any>, listIds?: number[])
  async getContact(email: string): Promise<BrevoContact>
  async updateContactAttributes(email: string, attributes: Record<string, any>)

  // Newsletter
  async sendCampaign(templateId: number, listId: number, params: Record<string, any>)
  async sendTransactionalTemplate(templateId: number, to: string, params: Record<string, any>)

  // Segments
  async getListContacts(listId: number): Promise<{ count: number }>
  async getContactsBySegment(segmentId: number): Promise<BrevoContact[]>
}

export const brevo = new BrevoClient(process.env.BREVO_API_KEY);
```

#### 12.7.3 CRM Event-Sync (`lib/crm-sync.ts`)

Event-Router: Jede relevante Aktion im Backend triggered einen Brevo-Sync. Alle Calls sind **fire-and-forget** (non-blocking, kein `await` im Request-Handler). Wenn Brevo down ist, geht kein Bid oder Kauf verloren — nur der CRM-Sync fehlt temporär.

**Hook-Points in bestehenden Routes (je 1 Zeile Ergänzung):**

| Bestehende Route | Neuer Aufruf | Brevo-Aktion |
|---|---|---|
| `POST /store/auth/register` | `crmSync.contactCreated(customer)` | Contact anlegen, Liste "VOD Auctions" zuweisen |
| `POST /store/.../bids` | `crmSync.bidPlaced(customer, item)` | `TOTAL_BIDS_PLACED` +1, `PREFERRED_GENRES` updaten |
| `auction-lifecycle.ts` (Block endet) | `crmSync.auctionWon(customer, items)` | `TOTAL_AUCTIONS_WON` +1, Segment-Check (VIP?) |
| Stripe Webhook → `paid` | `crmSync.purchaseCompleted(customer, total)` | `TOTAL_SPENT`, `TOTAL_PURCHASES`, `LAST_PURCHASE_DATE` |
| `POST /admin/transactions/:id` → shipped | `crmSync.orderShipped(customer)` | Trigger Brevo Tracking-Automation |

```typescript
// backend/src/lib/crm-sync.ts — Pseudocode
import { brevo } from './brevo';

export const crmSync = {
  async contactCreated(customer: { email: string; first_name: string; last_name: string }) {
    brevo.upsertContact(customer.email, {
      FIRSTNAME: customer.first_name,
      LASTNAME: customer.last_name,
      PLATFORM_ORIGIN: 'vod-auctions',
      MEDUSA_CUSTOMER_ID: customer.id,
      CUSTOMER_SEGMENT: 'New',
      LAST_ACTIVITY_DATE: new Date().toISOString(),
    }, [BREVO_LIST_VOD_AUCTIONS]).catch(logBrevoError);
  },

  async bidPlaced(customer: { email: string }, item: { genres?: string[] }) {
    brevo.updateContactAttributes(customer.email, {
      TOTAL_BIDS_PLACED: { operation: 'increment', value: 1 },
      LAST_ACTIVITY_DATE: new Date().toISOString(),
      PREFERRED_GENRES: item.genres?.join(', '),
    }).catch(logBrevoError);
  },

  async auctionWon(customer: { email: string }, items: any[]) {
    brevo.updateContactAttributes(customer.email, {
      TOTAL_AUCTIONS_WON: { operation: 'increment', value: items.length },
      LAST_ACTIVITY_DATE: new Date().toISOString(),
    }).catch(logBrevoError);
  },

  async purchaseCompleted(customer: { email: string }, total: number) {
    brevo.updateContactAttributes(customer.email, {
      TOTAL_PURCHASES: { operation: 'increment', value: 1 },
      TOTAL_SPENT: { operation: 'increment', value: total },
      LAST_PURCHASE_DATE: new Date().toISOString(),
      CUSTOMER_SEGMENT: total > 500 ? 'VIP' : 'Active',
    }).catch(logBrevoError);
  },

  async orderShipped(customer: { email: string }) {
    // Brevo Automation wird durch Attribut-Update getriggert
    brevo.updateContactAttributes(customer.email, {
      LAST_ACTIVITY_DATE: new Date().toISOString(),
    }).catch(logBrevoError);
  },
};
```

#### 12.7.4 Newsletter Admin API + UI

**Ziel:** Frank kann Newsletter direkt aus dem Medusa Admin-Panel senden — kein Login bei Brevo nötig für den Alltag.

**Neue Admin API Endpoints:**

```
GET  /admin/newsletter              # Liste: Brevo Campaigns + Stats
POST /admin/newsletter/send         # Newsletter versenden (Template + Daten)
POST /admin/newsletter/preview      # Preview HTML generieren
GET  /admin/newsletter/stats        # Subscriber-Count, Open Rates, etc.
```

**Neue Admin-Seite:** `/admin/newsletter`

Funktionen:
- **Block-Ankündigung:** Button "Send Announcement" auf der Block-Detail-Seite → Backend aggregiert Block-Daten (Titel, 5 Highlight-Items mit Bildern, Start-Datum) → sendet an Brevo API als Campaign
- **Wöchentliche Highlights:** Medusa Scheduled Job (wie `auction-lifecycle.ts`) → aggregiert Top-10 neue Releases der Woche → sendet an Brevo
- **Auktions-Ergebnisse:** Automatisch wenn Block auf "ended" geht (Hook in `auction-lifecycle.ts`)
- **Stats-Anzeige:** Subscriber-Count pro Liste, letzte Campaigns, Open/Click Rates

**Dateien:**
```
backend/src/api/admin/newsletter/route.ts           # GET: Campaigns + Stats
backend/src/api/admin/newsletter/send/route.ts      # POST: Campaign senden
backend/src/api/admin/newsletter/preview/route.ts   # POST: Preview generieren
backend/src/admin/routes/newsletter/page.tsx         # Admin UI: Newsletter Dashboard
backend/src/jobs/newsletter-weekly.ts                # Scheduled Job: Wöchentliche Highlights
```

**Auktions-Block Integration (bestehende Datei):**
```typescript
// backend/src/admin/routes/auction-blocks/[id]/page.tsx — Ergänzung
// Neuer Button "Send Newsletter Announcement" im Block-Detail
// → POST /admin/newsletter/send { type: 'block_announcement', block_id: '...' }
```

#### 12.7.5 Brevo Inbound Webhooks

Brevo meldet Events zurück (Unsubscribe, Bounce, Spam). Diese werden im Backend verarbeitet.

```
backend/src/api/webhooks/brevo/route.ts    # POST: Brevo Webhook Handler
```

**Webhook-URL:** `https://api.vod-auctions.com/webhooks/brevo`

**Events:**
| Brevo Event | Backend-Aktion |
|---|---|
| `unsubscribe` | `NEWSLETTER_OPTIN = false` in Brevo (automatisch) + optionales Logging |
| `hard_bounce` | Email-Adresse als ungültig markieren, aus aktiven Kampagnen entfernen |
| `spam` | Kontakt aus allen Marketing-Listen entfernen |
| `delivered` / `opened` / `clicked` | Statistiken (werden von Brevo selbst getrackt, optional loggen) |

**Middleware:** Raw Body Parsing analog zu Stripe Webhook (`middlewares.ts` Ergänzung).

#### 12.7.6 CRM Dashboard im Admin (Phase 3)

```
backend/src/api/admin/customers/route.ts          # GET: CRM Stats von Brevo API
backend/src/admin/routes/customers/page.tsx        # Admin UI: Kunden-Dashboard
```

**Zeigt auf einen Blick (Daten von Brevo API, kein eigenes DB-Modell):**
- Kontakte gesamt / Newsletter Opt-ins / Aktive Bieter
- Segment-Verteilung: VIP | Active | Occasional | Dormant | New (Pie Chart)
- Letzte 10 Registrierungen mit Plattform-Herkunft
- Top-10 Kunden nach Umsatz
- Newsletter-Performance: Letzte 5 Campaigns mit Open/Click Rate

#### 12.7.7 Social Media Content-Generator (Phase 3)

Admin klickt auf Block-Detail-Seite "Generate Social Posts" → Backend ruft Claude API → generiert plattformspezifische Texte → zeigt Preview im Admin → Admin klickt "Schedule" → Backend sendet an Buffer API.

```
backend/src/api/admin/social-media/generate/route.ts   # POST: AI Content generieren
backend/src/api/admin/social-media/schedule/route.ts    # POST: An Buffer API senden
backend/src/admin/routes/social-media/page.tsx          # Admin UI: Social Media Queue
```

**Bis Phase 3:** Social Media manuell über Buffer UI. Das Script `scripts/social_media_generator.py` bleibt als Alternative für CLI-Nutzung.

#### 12.7.8 Abgrenzung — Was NICHT ins Backend gehört

| Bereich | Warum extern | Tool |
|---|---|---|
| **Newsletter-Templates** | Brevo Drag & Drop Editor ist besser als custom HTML im Backend | Brevo UI |
| **Email-Zustellung** | Dedizierte Infrastruktur (IP-Reputation, SPF, DKIM) | Brevo + Resend |
| **Automation-Flows** | Brevo Automation Builder (visuell, drag & drop) — im Backend nachbauen wäre Overengineering | Brevo UI |
| **Social Media Scheduling** | Buffer UI ist dafür optimiert | Buffer |
| **Paid Ads Management** | Google/Meta Ads Dashboards sind nicht ersetzbar | Google/Meta UI |

#### 12.7.9 Erweiterte Projektstruktur (Neue Dateien)

```
backend/src/
├── lib/
│   ├── brevo.ts                    # NEU: Brevo REST API Client
│   ├── crm-sync.ts                 # NEU: Event-Router (6 Methoden)
│   ├── stripe.ts                   # (bestehend)
│   ├── resend.ts                   # (bestehend — transaktionale Emails)
│   ├── auction-helpers.ts          # (bestehend)
│   └── shipping.ts                 # (bestehend)
├── api/
│   ├── admin/
│   │   ├── newsletter/             # NEU
│   │   │   ├── route.ts            #   GET: Campaigns + Stats
│   │   │   ├── send/route.ts       #   POST: Campaign senden
│   │   │   └── preview/route.ts    #   POST: Preview HTML
│   │   ├── customers/              # NEU (Phase 3)
│   │   │   └── route.ts            #   GET: CRM Stats
│   │   ├── social-media/           # NEU (Phase 3)
│   │   │   ├── generate/route.ts   #   POST: AI Content
│   │   │   └── schedule/route.ts   #   POST: Buffer API
│   │   ├── auction-blocks/         # (bestehend)
│   │   ├── media/                  # (bestehend)
│   │   ├── transactions/           # (bestehend)
│   │   └── ...
│   ├── webhooks/
│   │   ├── stripe/route.ts         # (bestehend)
│   │   └── brevo/route.ts          # NEU: Unsubscribe/Bounce Handler
│   └── store/                      # (bestehend)
├── jobs/
│   ├── auction-lifecycle.ts        # (bestehend) + crmSync Hooks
│   └── newsletter-weekly.ts        # NEU: Wöchentliche Highlights
├── admin/routes/
│   ├── newsletter/page.tsx         # NEU: Newsletter Dashboard
│   ├── customers/page.tsx          # NEU: CRM Dashboard (Phase 3)
│   ├── social-media/page.tsx       # NEU: Social Media Queue (Phase 3)
│   ├── auction-blocks/             # (bestehend)
│   ├── media/                      # (bestehend)
│   └── ...
```

#### 12.7.10 Änderungen an bestehenden Dateien (minimal-invasiv)

Nur 1-Zeile-Hooks werden in bestehende Routes eingefügt:

```typescript
// 1. backend/src/api/store/auth/register — nach erfolgreicher Registration
crmSync.contactCreated(customer);

// 2. backend/src/api/store/.../bids/route.ts — nach erfolgreichem Bid
crmSync.bidPlaced(customer, { genres: release.genres });

// 3. backend/src/api/webhooks/stripe/route.ts — nach payment confirmed
crmSync.purchaseCompleted(customer, totalAmount);

// 4. backend/src/api/admin/transactions/[id]/route.ts — nach shipping update
if (newStatus === 'shipped') crmSync.orderShipped(customer);

// 5. backend/src/jobs/auction-lifecycle.ts — nach Block-Ende, für jeden Gewinner
crmSync.auctionWon(winner, wonItems);

// 6. backend/src/api/middlewares.ts — Brevo Webhook Route hinzufügen
// { path: '/webhooks/brevo', bodyParser: false }
```

**Keine bestehende Funktionalität wird verändert.** Die CRM-Sync Calls sind fire-and-forget und blockieren nicht.

---

### 12.8 Gesamtarchitektur — Marketing-Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MEDUSA ADMIN PANEL                                │
│                    (api.vod-auctions.com/app)                       │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Auction  │ │  Media   │ │Newsletter │ │Customers │ │ Social  │ │
│  │ Blocks   │ │ Mgmt     │ │  Send     │ │  CRM     │ │ Media   │ │
│  │          │ │          │ │  Preview  │ │  Stats   │ │ Generate│ │
│  │(bestehd.)│ │(bestehd.)│ │  (neu)    │ │ (neu,P3) │ │(neu,P3) │ │
│  └──────────┘ └──────────┘ └───────────┘ └──────────┘ └─────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────────┐
│                        VPS (72.62.148.205)                          │
│                                                                     │
│  ┌──────────────────────────────┐  ┌────────────────────────┐      │
│  │  Medusa Backend (PM2:9000)   │  │  Storefront (PM2:3006) │      │
│  │                              │  │                         │      │
│  │  lib/brevo.ts ──→ Brevo API  │  │  • Newsletter Opt-in   │      │
│  │  lib/crm-sync.ts (Events)    │  │  • Cookie Consent      │      │
│  │  lib/resend.ts ──→ Resend    │  │  • FB Pixel (Phase 3)  │      │
│  │  lib/stripe.ts ──→ Stripe    │  │                         │      │
│  │                              │  └────────────────────────┘      │
│  │  jobs/newsletter-weekly.ts   │                                   │
│  │  jobs/auction-lifecycle.ts   │                                   │
│  │                              │                                   │
│  │  webhooks/brevo/ ←── Brevo   │                                   │
│  │  webhooks/stripe/ ←── Stripe │                                   │
│  └──────────────────────────────┘                                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────┐            │
│  │  Python Scripts (Cronjobs)                          │            │
│  │  • social_media_generator.py (AI Content, Phase 3)  │            │
│  │  • crm_sync_batch.py (Initialer Import)             │            │
│  └─────────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│   Brevo      │    │   Resend     │    │   Buffer         │
│   (SaaS)     │    │   (SaaS)     │    │   (SaaS)         │
│              │    │              │    │                    │
│  • CRM       │    │  • Trans-    │    │  • Social Media   │
│  • Newsletter│    │    aktionale │    │    Scheduling      │
│  • Automation│    │    Emails    │    │  • IG, FB, Threads │
│  • Segments  │    │  • 6 Templ.  │    │  • Analytics       │
│  • Analytics │    │  • Domain    │    │                    │
│              │    │    verified  │    │                    │
└──────────────┘    └──────────────┘    └──────────────────┘
          │                                      │
          ▼                                      ▼
┌──────────────┐                      ┌──────────────────┐
│  Google Ads  │                      │  Meta Ads        │
│  (Phase 3)   │                      │  (Phase 3)       │
│              │                      │                    │
│  • Search    │                      │  • FB/IG Ads      │
│  • Shopping  │                      │  • Retargeting    │
│  • Retarget  │                      │  • Lookalike      │
└──────────────┘                      └──────────────────┘
```

### 12.9 Kosten-Übersicht Marketing-Stack

| Komponente | Phase 2 (Launch) | Phase 3 (Skalierung) | Phase 4 (Vollausbau) |
|------------|-----------------|---------------------|---------------------|
| **Brevo CRM + Newsletter** | €0 (Free) | €9-18/Monat (Starter/Business) | €18-49/Monat |
| **Resend (transaktional)** | €0 (Free Tier) | €0 (Free Tier reicht) | €20/Monat (bei >3k Emails) |
| **Buffer (Social Media)** | €0 (Free, 3 Kanäle) | €6-18/Monat | €18-36/Monat |
| **Claude API (Content-Gen)** | €0 | ~€2/Monat | ~€5/Monat |
| **Google Ads** | €0 | €600-900/Monat | €1.000-2.000/Monat |
| **Meta Ads** | €0 | €300-500/Monat | €500-1.000/Monat |
| **Gesamt** | **€0/Monat** | **€917-1.447/Monat** | **€1.561-3.110/Monat** |

### 12.10 Implementierungsroadmap

#### Phase 2 — Launch (Monate 3-4)
- [ ] Brevo Account erstellen + API-Key generieren
- [ ] `backend/src/lib/brevo.ts` — Brevo API Client implementieren
- [ ] `backend/src/lib/crm-sync.ts` — Event-Handler für Customer Registration + Purchase
- [ ] Brevo CRM: Contact Properties anlegen (Custom Attributes)
- [ ] Initialer Import: vod-auctions.com Kunden → Brevo (CSV)
- [ ] Initialer Import: tape-mag.com Kunden → Brevo (Legacy MySQL Export)
- [ ] Initialer Import: vod-records.com Kunden → Brevo (WooCommerce Export)
- [ ] Newsletter Opt-in Checkbox in Storefront Registration/Settings
- [ ] Brevo Double Opt-in Flow konfigurieren
- [ ] Erster Newsletter-Template in Brevo (VOD Auctions Branding)
- [ ] Buffer Account + Instagram/Facebook/Threads verbinden
- [ ] Manuelles Social-Media-Posting zu ersten Auktions-Blöcken

#### Phase 3 — Skalierung (Monate 5-8)
- [ ] Brevo Automationen einrichten (Welcome Flow, Auktions-Engagement)
- [ ] `scripts/social_media_generator.py` — AI Content-Generator (Claude Haiku)
- [ ] Wöchentlicher Newsletter-Cronjob (Highlights)
- [ ] Google Ads Setup (Merchant Center, Search Campaigns)
- [ ] Facebook Pixel in Storefront (consent-gated)
- [ ] Meta Ads: Erste Retargeting-Kampagnen
- [ ] Brevo Segmentierung: VIP, Active, Dormant

#### Phase 4 — Vollausbau (Monate 9-12)
- [ ] Brevo Marketing Automation erweitern (Win-Back, VIP Early Access)
- [ ] Lookalike Audiences (Brevo → Meta Ads)
- [ ] AI-Empfehlungen im Newsletter (personalisiert nach Genre/Format)
- [ ] TikTok-Kanal starten (wenn Instagram-Community > 1.000 Follower)
- [ ] YouTube-Kanal evaluieren
- [ ] SSO re-evaluieren (abhängig von tape-mag.com Migration)

### 12.11 Env-Variablen (Neu)

```bash
# Brevo CRM + Newsletter (backend/.env)
BREVO_API_KEY=xkeysib-...              # Brevo REST API Key
BREVO_LIST_VOD_AUCTIONS=<list_id>      # Brevo Contact List ID
BREVO_LIST_TAPE_MAG=<list_id>          # Brevo Contact List ID
BREVO_SENDER_EMAIL=newsletter@vod-auctions.com
BREVO_SENDER_NAME=VOD Auctions

# Buffer (nur für AI Content-Generator Script)
BUFFER_ACCESS_TOKEN=...                 # Buffer API Token (Phase 3)

# Meta Ads (storefront/.env.local)
NEXT_PUBLIC_FB_PIXEL_ID=...            # Facebook Pixel ID (Phase 3)
```

### 12.12 Datenschutz-Ergänzung

Die Datenschutzerklärung (`/datenschutz`) muss um folgende Dienste erweitert werden:

- **Brevo (Sendinblue SAS):** CRM und Newsletter-Versand, Sitz in Paris (Frankreich), EU-Server, Auftragsverarbeitungsvertrag (AVV) über Brevo Dashboard abschließen
- **Buffer Inc.:** Social-Media-Management, Sitz in San Francisco (USA), Standard Contractual Clauses (SCC)
- **Facebook/Meta Pixel:** Conversion-Tracking und Retargeting (nur mit Cookie-Consent), Meta Platforms Ireland Ltd.
- **Google Ads:** Suchmaschinen-Werbung und Remarketing (nur mit Cookie-Consent), Google Ireland Ltd.

Die Cookie-Richtlinie (`/cookies`) muss um Marketing-Cookies erweitert werden:
- Facebook Pixel (`_fbp`, `_fbc`) — Kategorie: Marketing (Opt-in erforderlich)
- Google Ads (`_gcl_*`) — Kategorie: Marketing (Opt-in erforderlich)

Der Cookie-Consent-Banner (`CookieConsent.tsx`) muss um die Kategorie "Marketing" erweitert werden (neben "Analytics").

---

**Ende des Konzeptdokuments**

*Nächster Schritt: Phase 1 abschließen (RSE-77 Testlauf) → Phase 2 mit CRM + Newsletter starten*
