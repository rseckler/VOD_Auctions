# Auktions-Workflow Konzept-Review — VOD Auctions 2026

**Erstellt:** 2026-03-28
**Autor:** Claude Code (auf Basis CLAUDE.md / Projektstand 2026-03-23)
**Zweck:** Systematischer Vergleich des aktuellen VOD-Auktionsworkflows mit den Marktführern eBay, Catawiki und Paddle8/Invaluable — Identifikation von Gaps und priorisierten Verbesserungsempfehlungen.

---

## Inhaltsverzeichnis

1. [Auktions-Block-Modell](#1-auktions-block-modell)
2. [Bid-Flow / Proxy-Bidding](#2-bid-flow--proxy-bidding)
3. [Lot-End-Times / Anti-Sniping](#3-lot-end-times--anti-sniping)
4. [Payment-Flow](#4-payment-flow)
5. [Versand / Shipping](#5-versand--shipping)
6. [User-Kommunikation / E-Mail-Benachrichtigungen](#6-user-kommunikation--e-mail-benachrichtigungen)
7. [Admin-Workflow](#7-admin-workflow)
8. [SEO & Discovery](#8-seo--discovery)
9. [Vertrauen & Rechtliches](#9-vertrauen--rechtliches)
10. [Offene Punkte / Empfehlungen](#10-offene-punkte--empfehlungen)

---

## 1. Auktions-Block-Modell

### Aktueller Stand VOD

VOD Auctions setzt auf ein **kuratiiertes Themen-Block-Modell**: Alle Auktionen finden in redaktionell kuratierten Blöcken statt, die thematisch (Genre, Künstler, Epoche, Rarität) zusammengestellt werden. Ein Block enthält 1–500 Produkte und läuft für einen definierten Zeitraum (1 Tag Flash-Auktion bis 30 Tage Monatsauktion).

Vorgesehene Block-Typen:
- **Themen-Block** — kuratiert nach Genre/Künstler/Epoche
- **Highlight-Block** — wenige High-Value Items, längere Laufzeit
- **Clearance-Block** — 200–500 Items, €1-Startpreise
- **Flash-Block** — 24h, 1–10 Items, überraschend angekündigt

Der Katalog mit ~41.500 Produkten ist dauerhaft öffentlich durchsuchbar; Artikel sind auf `sale_mode = 'direct_purchase'` (Direktkauf) oder `'auction_only'` gesetzt. Nicht im Auktionsblock befindliche Artikel können — sofern aktiviert — direkt gekauft werden.

**Technisch:** `auction_block` und `block_item` Tabellen (Medusa ORM, ULID-IDs), `auction_status` auf `Release`-Tabelle (`available → reserved → in_auction → sold/unsold`).

### Marktstandard

| Plattform | Modell |
|-----------|--------|
| **eBay** | Einzellistings, Seller legt Dauer (1–10 Tage), Start- und optionalen Sofort-Kaufpreis fest. Kein redaktioneller Kontext, kein kuratiiertes Themenprinzip. |
| **Catawiki** | Kuratiertes Lot-Modell: Experten-geprüfte Einzel-Lots, aber innerhalb wöchentlicher Themen-Auktionen gebündelt (z.B. "Rare Vinyl & Music Memorabilia"). Auktionen laufen 7 Tage. |
| **Paddle8/Invaluable** | Konsignationsmodell für Kunstmarkt, kuratierte Themen-Auktionen durch Auktionshaus. Laufzeiten 7–14 Tage. Höchste Buyer's Premium (20–25%). |

### Gap-Analyse

| Aspekt | VOD | Standard | Bewertung |
|--------|-----|----------|-----------|
| Kuratorischer Ansatz | Themenblöcke mit redaktionellem Content | Catawiki ähnlich (Experten-Kuratierung) | **Vorteil VOD** — differenzierender USP |
| Einzellisting-Option | Nicht vorgesehen | eBay standard | Absichtlich weggelassen (richtige Entscheidung für Community-Plattform) |
| Block-Typenvielfalt | 4 Typen konzipiert | Catawiki: 1 Format (7-Tage-Lot) | **Vorteil VOD** — mehr Flexibilität |
| Buyer's Premium | Nicht dokumentiert | Catawiki 9%+, Invaluable 20–25% | Unklar — zu klären (Umsatzhebel vs. Käufer-Abschreckung) |
| Reserve Price | Nicht implementiert | Catawiki: "Reserve price met/not met" | **Gap** — Seller-Absicherung fehlt |

**Empfehlung:** Das Themen-Block-Modell ist der stärkste Differenzierungsfaktor von VOD gegenüber eBay/Discogs. Es sollte konsequent beibehalten und ausgebaut werden (z.B. durch redaktionelle Begleit-Essays pro Block, Liner-Notes-Stil). Ein Reserve-Price-Mechanismus sollte mittelfristig ergänzt werden.

---

## 2. Bid-Flow / Proxy-Bidding

### Aktueller Stand VOD

VOD implementiert **Proxy-Bidding** (automatisches Maximalgebot): Bieter hinterlegen ein maximales Gebot (`max_amount`); das System bietet automatisch den jeweils minimalen notwendigen Betrag. Das aktuelle Gebot (`current_price`) auf dem `block_item` wird nach jedem Gebot aktualisiert. Das `bid`-Modell enthält `is_winning` und `is_outbid` Flags.

Der Bid-Flow ist:
1. Bieter öffnet `ItemBidSection.tsx` auf der Auktions-Detail-Seite
2. Bieter gibt Betrag ein (oder hinterlegt Maximalgebot)
3. **Bid Confirmation Modal** (Framer Motion, Gavel-Icon) — bestätigt Proxy-Bid-Details vor Absenden
4. POST `/store/auction-blocks/:slug/items/:itemId/bids` (Auth required)
5. Real-time Update über Supabase Realtime (WebSocket)

Bid-History ist abrufbar. Account-Seite `/account/bids` zeigt alle eigenen Gebote.

### Marktstandard

| Plattform | Proxy-Bidding-Mechanismus |
|-----------|--------------------------|
| **eBay** | Proxy-Bidding seit 1998, De-facto-Industriestandard. System bietet in definierten Inkrementen bis zum Maximalgebot. Bieter sieht nur aktuelles Gebot, nicht fremde Maximalgebote. Inkrement-Tabelle: €0–1 → €0.05, €1–5 → €0.25, €5–50 → €0.50, €50–500 → €2.50, etc. |
| **Catawiki** | Proxy-Bidding mit klar sichtbarer "Maximales Gebot"-Erklärung. Strukturierte Gebotsschritte. Bieter erhält sofortige Benachrichtigung bei Überbietung (Push + E-Mail). |
| **Paddle8/Invaluable** | Absentee Bidding (identisch mit Proxy-Bidding), zusätzlich Live-Auktionen mit Telefon-Geboten. |

### Gap-Analyse

| Aspekt | VOD | Standard | Bewertung |
|--------|-----|----------|-----------|
| Proxy-Bidding grundsätzlich | Implementiert (max_amount) | Standard | OK |
| Bid-Inkrement-Tabelle | Nicht dokumentiert | eBay: strukturierte Stufen | **Gap** — zu verifizieren ob Mindesterhöhungen enforced werden |
| Confirmation Modal | Vorhanden (Framer Motion, hochwertig) | Catawiki: einfacher Confirm-Dialog | **Vorteil VOD** |
| Real-time Updates | Supabase Realtime | eBay: Polling alle 30s; Catawiki: WebSockets | **Vorteil VOD** — echter Real-time |
| Bid-History Transparenz | Abrufbar (/account/bids) | eBay: öffentliche Bid-History (anonymisiert) | **Gap** — öffentliche Bid-History pro Lot fehlt |
| Überbietungs-Feedback | E-Mail (outbid Template) | Catawiki: Push + E-Mail sofort | Grundversorgung vorhanden, Push fehlt |
| Maximalgebot-Anzeige | Nicht dokumentiert | Nirgends angezeigt (Vertraulichkeit) | OK — Standard ist Nicht-Anzeige |

**Empfehlung:** Eine dokumentierte Bid-Inkrement-Tabelle einführen und im UI anzeigen ("Nächstes Mindestgebot: €X"). Die öffentliche Bid-History pro Lot (anonymisiert: "Bieter 1", "Bieter 2") sollte auf der Lot-Detailseite sichtbar sein — das erhöht Vertrauen und Spannung.

---

## 3. Lot-End-Times / Anti-Sniping

### Aktueller Stand VOD

Jedes `block_item` hat ein `lot_end_time` (feste Endzeit). Der `auction-lifecycle.ts` Cron-Job (läuft jede Minute) aktiviert und beendet Blöcke automatisch. Ein Countdown wird prominent auf der Lot-Detailseite angezeigt (M3 UX-Overhaul: "Countdown prominent").

**Anti-Sniping ist nicht implementiert.** Es gibt keine dokumentierte automatische Zeitverlängerung bei Last-Minute-Geboten.

### Marktstandard

| Plattform | End-Time-Mechanismus |
|-----------|---------------------|
| **eBay** | Feste Endzeit, kein Anti-Sniping. Bekannte Sniping-Problematik (letztsekunden-Gebote) ist für Käufer ein "Skill", für Verkäufer nachteilig. Sniping-Bots sind weit verbreitet. |
| **Catawiki** | **Anti-Sniping:** Gebot in den letzten 3 Minuten → Verlängerung um 3 Minuten (beliebig oft). Dies gilt pro Lot, nicht pro Block. Methode ist Industrie-Standard für kuratiierte Plattformen. |
| **Paddle8/Invaluable** | Anti-Sniping: Verlängerung um 3–5 Minuten bei Geboten in der letzten Minute. Teilweise wird auch der gesamte Block verlängert. |
| **Discogs Marketplace** | Kein Auktionsformat — Festpreisverkauf. |

### Gap-Analyse

| Aspekt | VOD | Standard | Bewertung |
|--------|-----|----------|-----------|
| Feste Endzeit | Implementiert | eBay-Standard | OK als Fallback |
| Anti-Sniping / Verlängerung | **Nicht implementiert** | Catawiki-Standard (3 min) | **Kritischer Gap** für Nische-Auktionsplattform |
| Countdown-Anzeige | Prominent (UX Overhaul M3) | Standard | OK |
| Lot-individuelle Endzeiten | Implementiert (lot_end_time) | Standard | OK |
| Block-synchroner Abschluss | Konzipiert (Block hat Gesamtendzeit) | Catawiki: Lots enden gestaffelt | Zu evaluieren |

**Empfehlung (Priorität HOCH):** Anti-Sniping ist für VOD's Zielgruppe besonders wichtig. In einer Nischen-Community mit vielen versierten Sammlern ist Last-Minute-Sniping problematisch und schadet dem Vertrauen der Verkäufer. Die Implementierung ist überschaubar:

```
Wenn bid.created_at > lot_end_time - 3min:
    block_item.lot_end_time += 3min
    → Supabase Realtime broadcast "lot_extended" Event
    → Storefront Countdown aktualisiert sich automatisch
```

Der Cron-Job muss entsprechend berücksichtigen, dass `lot_end_time` dynamisch wachsen kann. Empfehlung: Max. 10 Verlängerungen pro Lot (Catawiki hat kein Maximum, was theoretisch Endlosauktionen ermöglicht).

---

## 4. Payment-Flow

### Aktueller Stand VOD

**Mehrstufiger, gut durchdachter Checkout-Flow:**

1. **Gewinnen** → `block_item.status = sold`, Transaction erstellt mit `status = pending`
2. **Wins-Page** `/account/wins` → Bieter sieht alle unbezahlten Gewinne
3. **Combined Checkout** `/account/checkout` — alle unbezahlten Gewinne + Direktkauf-Warenkorb in einer Zahlung
4. **Shopify-Style One-Page-Checkout** (Phase A+B live):
   - Two-Column Layout (Adresse links, Order Summary rechts)
   - Stripe Payment Element (inline, kein Redirect für Kreditkarte)
   - PayPal Direkt-Integration (JS SDK, eigene Order-Erstellung)
   - Klarna, Bancontact, EPS zusätzlich via Stripe
5. **Stripe Webhook** `payment_intent.succeeded` → Transactions auf `paid`, Cart geleert
6. **PayPal Webhook** `PAYMENT.CAPTURE.COMPLETED` → identischer Flow

**Zahlungsfristen:** Nicht explizit dokumentiert. Es gibt keinen automatischen Eskalations-Mechanismus für nicht bezahlte Gewinne.

**Order-Nummern:** VOD-ORD-XXXXXX (6-stellig fortlaufend, generiert bei Payment-Success).

**Refunds:** Admin-seitig möglich (Stripe sofort, PayPal direkt über PayPal API — nicht 5–7 Tage Umweg über Stripe).

### Marktstandard

| Plattform | Payment-Flow |
|-----------|-------------|
| **eBay** | Käufer hat 4 Tage zur Zahlung. Nach 4 Tagen kann Verkäufer Unpaid Item Case eröffnen. Automatische Wiederholung nach 2 Tagen, dann Sperrung möglich. Managed Payments (direkt in eBay), Stripe-ähnlich. |
| **Catawiki** | Käufer hat 5 Tage. Automatische Zahlungserinnerungen (Tag 1, 3, 5). Nach Tag 5: Auktion wird re-listed, Käufer erhält Verwarnung. 3 Verwarnungen → Account-Sperrung. Buyer's Premium (9%) wird direkt abgezogen. |
| **Paddle8/Invaluable** | Zahlung innerhalb 7 Tage, Buyer's Premium 20–25% bereits im Angebotspreis enthalten. Auktionshäuser verwalten Zahlung direkt. |

### Gap-Analyse

| Aspekt | VOD | Standard | Bewertung |
|--------|-----|----------|-----------|
| Checkout-Qualität | Shopify-Style One-Page | eBay: vergleichbar modern | **Sehr gut** |
| Zahlungsmethoden | Stripe (Card/Klarna/EPS/Bancontact) + PayPal direkt | eBay: ähnlich | Gut aufgestellt |
| Zahlungsfrist | Nicht dokumentiert / kein Enforcement | eBay: 4 Tage, Catawiki: 5 Tage | **Gap** — Eskalation fehlt |
| Automatische Erinnerungen | Nicht dokumentiert | Catawiki: Tag 1, 3, 5 | **Gap** — Erinnerungs-E-Mails fehlen |
| Buyer's Premium | Nicht implementiert | Catawiki 9%, Invaluable 20–25% | Strategische Entscheidung nötig |
| Re-Listing bei Nicht-Zahlung | Nicht implementiert | Catawiki: automatisch | **Gap** — manueller Aufwand |
| Combined Checkout | Implementiert (Einzigartigkeit!) | eBay: per Seller, Catawiki: nein | **Starker Vorteil VOD** |
| Refund-Flow | Admin-seitig (Stripe + PayPal direkt) | Standard | Gut |
| Invoice-PDF | Implementiert (pdfkit) | Standard (meist einfacher) | **Vorteil VOD** |

**Empfehlung:** Eine Zahlungsfrist von 5 Tagen implementieren mit automatischen Reminder-E-Mails (Tag 1, Tag 3). Nach Tag 5: Admin-Benachrichtigung, automatisches Re-Listing der ungepayden Items. Dies schützt VOD vor Nicht-Zahlung und ist ein wesentlicher Qualitätsmarker professioneller Auktionsplattformen.

---

## 5. Versand / Shipping

### Aktueller Stand VOD

**Ausgearbeitetes, gewichtsbasiertes Versandsystem (RSE-103):**

- **4 DB-Tabellen:** `shipping_item_type` (13 Artikeltypen mit Gewichten), `shipping_zone` (DE/EU/World), `shipping_rate` (15 Gewichtsstufen × 3 Zonen), `shipping_config`
- **Format-Auto-Mapping:** Release.format_group → Artikeltyp (LP→260g, CASSETTE→80g, CD→110g)
- **Oversized-Erkennung:** Vinyl LPs (>25cm) → DHL Paket; CDs/Kassetten → Deutsche Post
- **Carrier-Management:** Per-Zone, 7 Templates (Deutsche Post, DHL, DPD, Hermes, GLS, Royal Mail, USPS)
- **Tracking-Links:** Klickbar auf Orders/Wins-Seite via `tracking_url_pattern`
- **Free-Shipping-Schwelle** konfigurierbar
- **Marge** konfigurierbar (prozentual auf berechnete Kosten)
- **Combined Shipping:** Bei Combined Checkout wird Versand einmal berechnet (nicht pro Item)

### Marktstandard

| Plattform | Versandsystem |
|-----------|--------------|
| **eBay** | Seller definiert Versandoptionen selbst (Deutsche Post, DHL, etc.), Preise manuell oder via Gewichtsformel. Buyer wählt zwischen angebotenen Optionen. International Shipping via eBay International Shipping (pauschal). Kein zentrales gewichtsbasiertes Kalkulations-Backend. |
| **Catawiki** | Standardisierte Versandoptionen pro Kategorie. Catawiki berechnet Versand automatisch nach Gewicht und Zone. Verpackungsanleitung für Seller. Kombinierter Versand für Gewinne aus derselben Auktion. |
| **Discogs Marketplace** | Seller definiert Versandpolitik manuell in Profil. Käufer sieht Versandkosten erst im Checkout. Bekanntes Reibungsproblem. |

### Gap-Analyse

| Aspekt | VOD | Standard | Bewertung |
|--------|-----|----------|-----------|
| Gewichtsbasierte Kalkulation | Vollständig implementiert | Catawiki: vergleichbar | **Sehr gut** — besser als eBay |
| Carrier-Auswahl (Checkout) | Vorhanden (Radio-Buttons) | Standard | Gut |
| Combined Shipping | Implementiert | Catawiki: vorhanden | **Vorteil VOD** — spart Käufer Geld |
| Tracking-Links | Klickbar mit URL-Pattern | Standard | Gut |
| Internationale Versandabdeckung | DE/EU/World (3 Zonen) | eBay: feingranularer | Ausreichend für Startphase |
| Versicherung / Haftung | Nicht dokumentiert | Catawiki: Versicherung optional | **Gap** — für High-Value Items relevant |
| Verpackungsrichtlinien | Nicht dokumentiert | Catawiki: detaillierte Guides | Niedrige Priorität für Single-Seller |
| Versandkosten-Transparenz | Erst nach Adresseingabe | eBay: vor Login sichtbar | Akzeptabel |

**Empfehlung:** Das Versandsystem ist für eine Eigenplattform bemerkenswert ausgereift. Mittelfristig sollte eine Versicherungsoption für Sendungen über €50 geprüft werden (relevant sobald High-Value Items versteigert werden).

---

## 6. User-Kommunikation / E-Mail-Benachrichtigungen

### Aktueller Stand VOD

**6 Transaktionale E-Mail-Templates (Resend, `noreply@vod-auctions.com`):**
1. Welcome (nach Registrierung)
2. Bid Won (Auktion gewonnen)
3. Outbid (Überboten)
4. Payment Confirmation (Zahlung bestätigt)
5. Shipping (Versandbenachrichtigung mit Tracking)
6. Feedback Request (5 Tage nach Versand)

**4 Newsletter-Templates (Brevo, `newsletter@vod-auctions.com`):**
1. Block Announcement (neue Auktion angekündigt)
2. Weekly Highlights
3. Auction Results
4. Monthly Digest

**Brevo CRM-Integration:** Verhaltensdaten synchronisiert (Gebote, Gewinne, Käufe, Versand). 3.580 tape-mag.com Legacy-User importiert.

**Subscriber-Verwaltung:** GDPR-konform, Double Opt-In für Newsletter, Opt-Out-Link in allen Templates.

### Marktstandard

| Plattform | E-Mail-Kommunikation |
|-----------|---------------------|
| **eBay** | Outbid (sofort, via eBay-System), Auktion gewonnen, Zahlungserinnerung (Tag 1, 3), Versandbestätigung, Feedback-Anfrage (14 Tage nach Delivery). Optionale Push-Benachrichtigungen (App). |
| **Catawiki** | Outbid (sofort), Gewonnen, Countdown-Reminder (24h vor Auktionsende bei gespeichertem Lot), Zahlungserinnerung (Tag 1, 3, 5), Versandbestätigung, Post-Delivery Bewertungsanfrage. |
| **Invaluable** | Weniger automatisiert, Auktionshaus-getrieben. Standard-Transaktionals. |

### Gap-Analyse

| Aspekt | VOD | Standard | Bewertung |
|--------|-----|----------|-----------|
| Outbid-Benachrichtigung | Vorhanden (E-Mail) | Standard | OK — Push fehlt (noch) |
| Won-Benachrichtigung | Vorhanden | Standard | OK |
| Zahlungserinnerung | **Nicht implementiert** | eBay/Catawiki: Tag 1, 3 | **Gap** — hohes Priorität |
| Countdown-Reminder (24h) | Nicht dokumentiert | Catawiki: Standard | **Gap** — erhöht Bidding-Aktivität |
| Versandbenachrichtigung | Vorhanden | Standard | OK |
| Feedback-Request | Vorhanden (5 Tage nach Shipping) | eBay: 14 Tage nach Delivery | OK — früher als Standard |
| Block-Announcement | Vorhanden (Newsletter) | Catawiki: ähnlich | OK |
| Push-Benachrichtigungen | Nicht implementiert | eBay App: Standard | Niedrige Priorität (kein App) |
| Watchlist-Erinnerungen | Nicht dokumentiert (Save-for-Later vorhanden) | Catawiki: Lot saved → Reminder 24h vor Ende | **Gap** — Use-Case vorhanden |

**Empfehlung:** Zwei E-Mail-Automatisierungen haben hohe Priorität:
1. **Zahlungserinnerungen** (Tag 1, Tag 3 nach Gewinn) — schützt vor Nicht-Zahlung
2. **24h-Countdown-Reminder** für gespeicherte Lots (Save-for-Later → E-Mail-Trigger) — steigert Bidding-Aktivität nachweislich

---

## 7. Admin-Workflow

### Aktueller Stand VOD

**Block-Management:**
- `/admin/auction-blocks` — Übersicht aller Blocks (Tabelle mit Status)
- `/admin/auction-blocks/[id]` — Block-Detail: Edit + Items + Produkt-Browser
- **Status-Transitions:** Validiert (draft → scheduled → active → ended)
- **Produkt-Browser:** Direkt aus 41k Releases mit Filtern (Format, Land, Jahr, Label, Kategorie, Auction-Status)
- **Startpreis-Workflow:** `estimated_value` → Auto-Startpreis (% konfigurierbar)

**Media-Management:**
- `/admin/media` — 30k Releases durchsuchbar, 5 Kategorie-Filter
- `/admin/media/[id]` — Release-Detail mit Bewertung, Discogs-Daten, `sale_mode`, `direct_price`, `inventory`
- Sichtbarkeits-Ampel (grün/rot) basierend auf coverImage + legacy_price

**Transaction-Management:**
- Pagination, Search, 7 Filter, Sort
- Bulk-Aktionen (Bulk Mark-as-Shipped)
- CSV-Export (BOM, Excel-kompatibel, 15 Spalten)
- Detail-Seite mit Activity-Timeline, Action-Buttons (Ship, Deliver, Refund, Cancel)

**Sync-Dashboard:**
- `/admin/sync` — Legacy-Sync + Discogs-Status
- Live Batch-Progress Card (Auto-Refresh 15s)

**Entity-Content:**
- `/admin/entity-content` — Bands/Labels/Press-Tabs, AI-Generation-Status
- Budget & Schedule Dashboard für OpenAI-Kosten

### Marktstandard

| Plattform | Admin-Fähigkeiten |
|-----------|------------------|
| **eBay** | Seller Dashboard: Aktive Listings, Sold Items, Orders, Messaging. Bulk-Listing-Tool (CSV-Upload). Performance-Metriken (Views, Watchers, Click-through). Keine Block-Kuratierung. |
| **Catawiki** | Expert Dashboard: Lot-Erstellung mit Experten-Review-Workflow, Multi-Step-Validation, Fotografie-Guidelines-Check, Reserve-Price-Setting. Echtzeit-Bid-Monitoring. Sales-Reports mit Hammer-Preisen. |
| **Paddle8** | Auction-House-Backend: Konsignationsmanagement, Pre-Auction-Estimate vs. Hammer-Preis-Vergleich, Post-Sale-Reports. |

### Gap-Analyse

| Aspekt | VOD | Standard | Bewertung |
|--------|-----|----------|-----------|
| Block-Erstellung | Vollständig | Standard | Gut |
| Produkt-Browser für Block-Befüllung | Ausgereift (Filter, Suche) | eBay: kein entsprechendes Tool | **Vorteil VOD** |
| Live-Bid-Monitoring | Nicht dokumentiert | Catawiki: Echtzeit-Dashboard | **Gap** — während aktiver Auktionen wichtig |
| Performance-Metriken | Nicht dokumentiert | eBay: Views, Watchers | **Gap** — fehlt für Optimierung |
| Bulk-Preisbearbeitung | Nicht dokumentiert | eBay: Bulk-Editor | Mittlere Priorität |
| Post-Block-Analyse | Nicht dokumentiert | Catawiki: Hammer-Preis-Reports | **Gap** — für Strategie relevant |
| Fotografie-Review | Nicht implementiert | Catawiki: Pflichtcheck | Nicht nötig (Single-Seller) |
| Audit Trail | Vorhanden (order_event Tabelle) | Standard | Gut |
| CSV-Export Transaktionen | Vorhanden | Standard | Gut |

**Empfehlung:** Ein Live-Auktions-Monitor für aktive Blocks wäre wertvoll — eine Admin-Seite, die während einer laufenden Auktion Echtzeit-Bid-Aktivität, aktuelle Preise und Top-Lots anzeigt. Dies ist für die Kuratierungsstrategie und für das Erkennen technischer Probleme essentiell.

---

## 8. SEO & Discovery

### Aktueller Stand VOD

**~17.500 SEO-optimierte Entity-Seiten:**
- `/band/[slug]` — Bands/Künstler (12.451 Artists)
- `/label/[slug]` — Labels (3.077)
- `/press/[slug]` — Press/Org (1.983)
- Schema.org JSON-LD (MusicGroup/Organization), generateMetadata(), 300s ISR

**Catalog-SSR (ARCH-1 erledigt):**
- Server-Side-Rendering des Katalogs für Google-Indexierung
- 41.000+ Produkte potenziell indexierbar
- `generateMetadata()` mit dynamischen Titeln

**Entity Content Overhaul (RSE-227):**
- Multi-Agent-Pipeline (GPT-4o + GPT-4o-mini) für qualitative Texte
- P1 abgeschlossen (1.013 Entities, Score 82.3/100)
- P2 pausiert bei 576/3.650 (Budget-Limit)
- Genre-adaptive Tonalität (10 Kategorien: Dark Ambient, Power Electronics, Industrial, etc.)

**Sitemap:** Dynamisch generiert (alle Blocks + Releases bis 1.000 + Entity-Pages).

**Google Search Console:** Eingerichtet, Domain-Property verifiziert, Sitemap eingereicht.

**Gallery-Seite:** `/gallery` — eigene SEO-optimierte Seite mit Schema.org LocalBusiness + Museum, priority 0.8 in Sitemap.

### Marktstandard

| Plattform | SEO-Strategie |
|-----------|-------------|
| **eBay** | Massive Domainautorität. Jedes Listing indexiert, Title-Tag = Listing-Titel. Rich Snippets via Schema.org Product. Keine editorielle Content-Strategie. |
| **Catawiki** | Lots indexiert, Kategorie-Seiten mit statischem Content, Expert-Blog für Long-Tail. |
| **Discogs** | Sehr starke SEO durch umfangreiche Artist/Label/Release-Datenbank. Schema.org MusicAlbum + MusicGroup. Long-Tail-Keywords durch strukturierte Daten (Cat#, Barcode, Matrix). |

### Gap-Analyse

| Aspekt | VOD | Standard | Bewertung |
|--------|-----|----------|-----------|
| Entity-Seiten (Bands/Labels) | 17.500 Seiten, KI-generiert | Discogs: Referenz | **Kompetitiv** — wenn Content-Qualität gut |
| Catalog-SSR | Implementiert (ARCH-1) | Standard | Gut |
| Structured Data | Schema.org auf Entity + Gallery | eBay/Discogs: umfangreicher | Ausbaubar (Product, MusicAlbum) |
| Interlinking | Hub-Spoke (Catalog ↔ Entities) | Discogs: sehr stark | **Gut** — solide Grundlage |
| Blog / Editorial Content | Nicht implementiert | Catawiki: Expert-Blog | Mittelfristig empfohlen |
| Discogs-Integration | Ausgeblendet (Preisvergleich-Problem) | Discogs direkt | Strategische Lücke für Discovery |
| Long-Tail Keywords | Durch Cat#, Land, Jahr im Catalog | Discogs: Stärke | Ausbaufähig |
| URL-Struktur | `/catalog/[id]`, `/band/[slug]` | Gut strukturiert | OK |
| Canonical URLs | Vorhanden | Standard | OK |
| Core Web Vitals / Performance | Next.js Image Optimization, ISR | Standard | Gut |

**Empfehlung:** Die SEO-Grundlage ist solide. Der Content-Overhaul (RSE-227) ist strategisch richtig — qualitative Texte mit korrekter Genre-Tonalität haben bessere Chancen auf Long-Tail-Rankings als generische KI-Texte. Mittelfristig sollte Schema.org `MusicAlbum` auf Catalog-Detail-Seiten ergänzt werden (Format, Tracklist, Artist) — das ist eine relevante Rich-Snippet-Quelle für Musiksuchen.

---

## 9. Vertrauen & Rechtliches

### Aktueller Stand VOD

**5 rechtliche Seiten** (vollständig implementiert):
- `/impressum` — Impressum (Frank Bull, Alpenstrasse 25/1, 88045 Friedrichshafen, USt-IdNr: DE232493058)
- `/agb` — AGB mit Auktions-Bedingungen (Proxy-Bidding, Zuschlag, Stripe, Versandkosten)
- `/datenschutz` — DSGVO-konform (Supabase, Stripe, Upstash, Google Fonts, Discogs, Resend, Hostinger, Brevo, GA4)
- `/widerruf` — Widerrufsbelehrung mit § 312g BGB Auktions-Ausnahme + Muster-Formular
- `/cookies` — Cookie-Richtlinie (3 Kategorien: Essential/Analytics/Marketing)

**Zusätzliche Vertrauenssignale:**
- DSGVO Cookie-Consent-Banner (Marketing-Cookie optional)
- Sentry Error-Tracking (Production-only, 10% Traces)
- Google Analytics (consent-gated)
- Brevo Behavior-Tracking (consent-gated)

**Zustandsbeschreibung (Condition Grading):**
- Felder `media_condition` und `sleeve_condition` auf Release-Tabelle vorhanden
- Condition-Badge und MwSt-Hinweis auf Produktseiten (F-Stream UX-Overhaul)
- Return Policy Badge auf Produktseiten (M3 UX-Overhaul)

**Bezahlte MwSt:** 19% MwSt aufgeschlüsselt in Invoice (Netto + USt), USt-IdNr DE232493058.

### Marktstandard

| Plattform | Vertrauen & Legal |
|-----------|-----------------|
| **eBay** | Käuferschutz-Programm (Money-Back-Guarantee), Feedback-System (positiv/negativ/neutral), Seller-Ratings, Verified Seller Badge. AGB sehr komplex. |
| **Catawiki** | Experten-Authentifizierung (jedes Lot wird von Experte geprüft), Buyer Guarantee (Rückgabe bei Falschbeschreibung), Condition Report verpflichtend, Goldmine/Discogs Grading-Standard. |
| **Invaluable** | Auktionshaus-Zertifizierung, Condition Reports, Provenance-Dokumentation für Kunstwerke. |
| **Discogs** | Community-basiertes Grading (M/NM/VG+/VG/G+/G/F/P), Rating-System für Seller, 45-Tage-Rückgabe bei Fehler. |

### Gap-Analyse

| Aspekt | VOD | Standard | Bewertung |
|--------|-----|----------|-----------|
| Impressum/AGB/Datenschutz | Vollständig vorhanden | Standard | Gut |
| Widerrufsrecht (Auktions-Ausnahme) | Vorhanden (§ 312g BGB) | Rechtlich korrekt | **Wichtig und korrekt** |
| MwSt-Ausweis | 19% korrekt auf Invoice | Standard | Gut |
| Condition Grading System | Felder vorhanden, kein Grading-Standard enforced | Discogs/Goldmine Standard | **Gap** — Grading-Standard für Industrial-Music Community wichtig |
| Käuferschutz / Garantie | Nicht dokumentiert | Catawiki: Buyer Guarantee | **Gap** — Vertrauensfaktor |
| Seller-Ratings / Feedback | Nicht implementiert | eBay: Standard | Single-Seller (VOD selbst) → weniger relevant |
| Authentizitätsprüfung | Nicht dokumentiert | Catawiki: Experten-Review | Single-Seller → entfällt (VOD kennt eigenen Bestand) |
| Datenschutz (DSGVO) | Umfassend | Standard | **Sehr gut** |
| Cookie-Consent | 3-Kategorien, consent-gated | Standard | Gut |

**Empfehlung:** Da VOD als Single-Seller operiert (Frank Bull / VOD Records), sind Seller-Ratings und Auktionshaus-Zertifizierungen nicht nötig. Aber:
1. **Condition-Grading-Standard:** Explizite Anzeige nach Discogs-Standard (M/NM/VG+/VG/G) auf allen Lot-Seiten. Dies ist für die Industrial-Music-Community ein Pflichtstandard — Bieter entscheiden maßgeblich nach Zustand.
2. **Käuferschutz-Statement:** Eine kurze, prominente "Satisfaction Guarantee" auf der AGB/Checkout-Seite (z.B. "Nicht wie beschrieben? Kostenlose Rücksendung innerhalb 14 Tagen.") erhöht Conversion erheblich.

---

## 10. Offene Punkte / Empfehlungen

### Priorität 1 — Kritisch (vor erstem öffentlichen Launch umsetzen)

#### 10.1 Bid-Inkrement-Tabelle
**Problem:** Es ist nicht dokumentiert, ob das System minimale Gebotserhöhungen enforced.
**Risiko:** Ohne Mindestinkrement können Bieter den Preis durch €0.01-Gebote artifiziell dominieren.
**Lösung:**
```
Aktueller Preis → Mindesterhöhung
€0 – €10        → €0.50
€10 – €50       → €1.00
€50 – €200      → €2.50
€200 – €500     → €5.00
€500 – €2.000   → €10.00
€2.000+         → €25.00
```
Im `ItemBidSection.tsx` anzeigen ("Nächstes Mindestgebot: €X.XX"). Im Backend validieren.

#### 10.2 Anti-Sniping (Zeitverlängerung)
**Problem:** Last-Minute-Gebote können die Auktion ohne Reaktionsmöglichkeit für andere Bieter entscheiden.
**Risiko:** Vertrauensverlust, Community-Beschwerden, Seller-Unzufriedenheit.
**Lösung:** Gebot in letzten 3 Minuten → `lot_end_time += 3min` (max. 10 Verlängerungen). Supabase Realtime-Event `lot_extended` → Countdown aktualisiert sich automatisch.

#### 10.3 Zahlungsfrist + Erinnerungsautomatik
**Problem:** Keine dokumentierte Frist, kein automatischer Eskalations-Mechanismus.
**Risiko:** Nicht-Zahler blockieren Artikel dauerhaft, manueller Aufwand für Admin.
**Lösung:**
- Zahlungsfrist: 5 Tage ab Auktionsende
- E-Mail Tag 1: "Du hast gewonnen — jetzt bezahlen" (mit direktem Link zum Checkout)
- E-Mail Tag 3: "Erinnerung — Zahlung ausstehend"
- Tag 5: Admin-Alert + automatisches Re-Listing des Items auf `available`
- Cron-Job: täglich prüfen ob `transaction.status = pending` und `block_item.lot_end_time + 5d < now`

#### 10.4 Condition Grading Standard
**Problem:** Felder `media_condition` und `sleeve_condition` existieren, aber kein enforced Grading-Standard.
**Risiko:** Inconsistente Angaben, Käufer-Verwirrung, Rückgaben.
**Lösung:** Discogs-Standard als Pflicht für alle Auction-Lots: **M / NM / VG+ / VG / G+ / G / F / P**. Dropdown im Admin statt Freitext. Beschreibung jedes Grades im Tooltip (Bieter können darüber hovern).

### Priorität 2 — Hoch (erste 2 Monate nach Launch)

#### 10.5 Öffentliche Bid-History pro Lot
**Problem:** Andere Bieter sehen nicht, wie viele Gebote ein Lot hat (nur Anzahl `bid_count`, keine Zeitstempel/Beträge).
**Lösung:** Öffentliche Tabelle auf Lot-Detailseite: Datum/Uhrzeit, anonymisierter Bieter-Code ("Bieter #3"), Betrag. Erzeugt Spannung und erhöht FOMO-getriebenes Bidding.

#### 10.6 Watchlist-Reminder-E-Mail
**Problem:** "Save for Later"-Feature vorhanden, aber keine Benachrichtigung wenn Lot endet.
**Lösung:** 24h vor `lot_end_time`: E-Mail an alle User, die dieses Item gesaved haben ("Noch 24h: Dein gespeicherter Artikel wird bald versteigert").

#### 10.7 Reserve-Price-Mechanismus
**Problem:** Kein Mechanismus, der einen Mindesterlös für den Seller sichert.
**Empfehlung:** `reserve_price` Feld auf `block_item`. UI-Signal für Käufer ("Mindestpreis noch nicht erreicht" / "Mindestpreis übertroffen"). Lot wird nur vergeben wenn Reserve erreicht.

#### 10.8 Live-Auktions-Monitor (Admin)
**Problem:** Kein Admin-Dashboard für die Monitoring von aktiven Auktionen in Echtzeit.
**Lösung:** Neue Admin-Seite `/admin/live-monitor` — aktive Blöcke, Top-Lots nach Bid-Aktivität, Lots ohne Gebot (Problemkandidaten), Countdown pro Lot, letzte 10 Gebote system-weit. Auto-Refresh 10s.

#### 10.9 Schema.org MusicAlbum auf Catalog-Detail
**Problem:** Catalog-Seiten haben keine strukturierten Daten für Musik-Releases.
**Lösung:** Schema.org `MusicAlbum` auf `/catalog/[id]`: `name`, `byArtist` (MusicGroup), `albumProductionType`, `inLanguage`, `datePublished`, `genre`. Trackliste als `MusicRecording`-Array wenn vorhanden. → Rich-Snippets in Google-Suche.

### Priorität 3 — Mittelfristig (3–6 Monate nach Launch)

#### 10.10 Post-Block-Analyse-Dashboard
**Zweck:** Nach Auktionsende: Analyse welche Lots das stärkste Bieter-Interesse hatten vs. Start-Preis, Hammer-Preis/Schätzwert-Verhältnis, Conversion-Rate (Lots mit mindestens einem Gebot / Gesamt-Lots).
**Nutzen:** Datenbasierte Kuratierungsstrategie für zukünftige Blocks.

#### 10.11 Buyer's Premium-Entscheidung
**Thema:** Catawiki erhebt 9%, Invaluable 20–25% Buyer's Premium. VOD hat keinen.
**Pro Premium:** Erhöht Umsatz pro Transaktion erheblich.
**Contra:** Vertrauensbruch gegenüber Early Adopters, Konkurrenz-Vorteil für VOD wenn weiter 0%.
**Empfehlung:** Kein Buyer's Premium in Phase 1 und 2 — dies ist ein starkes Differenzierungsmerkmal gegenüber Catawiki. Kommunizieren als "Keine versteckten Aufschläge".

#### 10.12 Newsletter-Automatisierung (Block-Launch-Sequenz)
**Problem:** Manueller Newsletter-Versand für Block-Ankündigungen.
**Lösung:** Automatische E-Mail-Sequenz bei Block-Status-Wechsel auf `scheduled`:
- T-7 Tage: "Coming Soon — Themenblock [Name]" (Teaser, 3 Preview-Lots)
- T-24h: "Startet morgen — [Name]" (vollständige Lots-Liste)
- T+0: "Jetzt live — [Name]" (Link zum Block)
- T+End: "Letzte Chance — endet in 6h" (an alle User die Items gesaved haben)

#### 10.13 Käuferschutz-Statement
**Empfehlung:** Explizite, prominente Buyer Guarantee entwickeln:
> "Alle Artikel werden von VOD Records persönlich beschrieben und verpackt. Entspricht ein Artikel nicht der Beschreibung, erstatten wir den vollen Kaufpreis inkl. Versand."

Dieses Statement auf Checkout-Seite, Lot-Detailseite und AGB prominent platzieren. Single-Seller-Vorteil: Das ist glaubwürdig, weil VOD tatsächlich jeden Artikel selbst kennt.

---

## Zusammenfassung: Stärken und Lücken im Überblick

### Stärken von VOD (bereits besser als Marktstandard)

| Stärke | Beschreibung |
|--------|-------------|
| **Themen-Block-Modell** | Stärkster USP — kuratiierte Erfahrung statt eBay-Listingchaos |
| **Combined Checkout** | Gewinne + Direktkauf in einer Zahlung — einzigartig auf dem Markt |
| **Shopify-Style Checkout** | Hochwertig, inline Stripe Elements, PayPal direkt |
| **Real-time Bidding** | Supabase Realtime WebSockets — besser als eBay's Polling |
| **Gewichtsbasiertes Shipping** | Sehr ausgereift für eine Eigenplattform |
| **SEO-Grundlage** | 17.500 Entity-Seiten + SSR Catalog |
| **Legal/DSGVO** | Vollständig und korrekt |
| **Entity-Content-Qualität** | GPT-4o mit Genre-Tonalität (Industrial, Dark Ambient, etc.) |

### Kritische Lücken (vor Launch schließen)

| Lücke | Priorität |
|-------|-----------|
| Kein Anti-Sniping | P1 — Kritisch |
| Keine Bid-Inkrement-Tabelle | P1 — Kritisch |
| Keine Zahlungsfrist/Eskalation | P1 — Kritisch |
| Condition Grading nicht standardisiert | P1 — Kritisch |

### Wichtige Verbesserungen (erste Monate nach Launch)

| Verbesserung | Priorität |
|--------------|-----------|
| Öffentliche Bid-History | P2 — Hoch |
| Watchlist-Reminder-E-Mails | P2 — Hoch |
| Reserve-Price-Mechanismus | P2 — Hoch |
| Live-Auktions-Monitor Admin | P2 — Hoch |
| Schema.org MusicAlbum | P2 — Hoch |

---

*Dokument basiert auf dem Projektstand 2026-03-23 (CLAUDE.md). Für Verifikation einzelner Punkte (insbesondere Bid-Inkrement-Logik in `ItemBidSection.tsx`) empfiehlt sich Code-Review der entsprechenden Dateien.*

*Nächster Review empfohlen: nach erstem öffentlichen Auktionsblock (RSE-77 Testlauf).*
