# VOD_Auctions - CLAUDE.md

This file provides guidance to Claude Code when working with the VOD Auctions project.

## Project Overview

**Purpose:** Auktionsplattform für ~41.500 Produkte (Industrial Music Tonträger + Literatur/Merchandise)

**Goal:** Eigene Plattform mit voller Kontrolle über Marke, Kundendaten, Preisgestaltung — statt 8-13% Gebühren an eBay/Discogs

**Status:** Phase 1 — RSE-72 bis RSE-97 + RSE-76 + RSE-101 + RSE-102 + RSE-103 + RSE-104 + RSE-105 + RSE-109 + RSE-111 + RSE-112 + RSE-113 + RSE-114 + RSE-115 + RSE-116 + RSE-117 + RSE-78 (teilweise) + RSE-147 bis RSE-152 (SEO Entity Pages) + RSE-156 (Discogs Daily Sync + Health Dashboard) erledigt. Nächstes: RSE-77 (Testlauf)

**Sprache:** Storefront und Admin-UI komplett auf Englisch (seit 2026-03-03)

**Created:** 2026-02-10
**Last Updated:** 2026-03-15

### UX/UI Overhaul — 37 CRITICAL+HIGH Findings (2026-03-15, IN PROGRESS)

**Audit:** `docs/UX_UI_AUDIT_2026-03-15.md` — 95 Findings (9 CRITICAL, 28 HIGH, 35 MEDIUM, 31 LOW)
**Scope:** Alle 37 CRITICAL + HIGH Items werden implementiert

#### 8 Parallel Streams

| Stream | Bereich | Owner-Dateien | Items | Status |
|--------|---------|---------------|-------|--------|
| **A** | Checkout Overhaul | `checkout/page.tsx` | AGB-Checkbox, Formvalidierung, Order Review, Billing-Adresse, Success-Page, MwSt-Hinweis | Done |
| **B** | Auth & Registration | `AuthModal.tsx`, `AuthProvider.tsx`, `auth.ts` | AGB-Checkbox Registration, Passwort-Stärke, Confirm-PW, Token-Expiry | Done |
| **C** | Header/Footer/Nav | `Header.tsx`, `MobileNav.tsx`, `Footer.tsx`, `CookieConsent.tsx`, `layout.tsx` | Suchleiste, Anon-Icons, Mobile Nav, Payment-Icons, Newsletter, Social, Cookie-Revoke, Skip-to-Content | Done |
| **D** | Account Settings | `settings/page.tsx`, neue `addresses/page.tsx` | Profil editieren, PW ändern, Adressverwaltung, Account löschen (DSGVO) | Done |
| **E** | Cart/Wins/Orders/Saved | `cart/page.tsx`, `wins/page.tsx`, `orders/page.tsx`, `saved/page.tsx`, `DirectPurchaseButton.tsx` | Shipping-Preview, Anon-Button, Cart-Fixes, Wins-Deadline, Saved→Cart, Order-Nummern | Done |
| **F** | Catalog/Product | `catalog/page.tsx`, `catalog/[id]/page.tsx`, `ItemBidSection.tsx` | Sort-Optionen, MwSt-Hinweis, Proxy-Bid-Erklärung, Product JSON-LD | Done |
| **G** | Error Pages/Loading | Neue Dateien nur | Custom 404, Loading Skeletons | Done |
| **H** | Backend APIs | Neue Routes | Adress-CRUD, Newsletter-Public, E-Mail-Verifizierung (DB-Migration + 8 Dateien) | Done |

#### Dependency Graph
```
G (404/Loading)      → Keine Dependencies, startet zuerst
C (Header/Footer)    → Keine Dependencies
F (Catalog/Product)  → Keine Dependencies
B (Auth/Registration)→ Keine Dependencies
D (Settings/Profile) → Backend H (Address/PW/Deletion APIs)
A (Checkout)         → Backend H (Promo-Code API)
E (Cart/Wins/Orders) → Backend H (Invoice/Order-Nummern)
H (Backend APIs)     → Keine Dependencies, startet sofort
```

### MEDIUM UX/UI Items — Multi-Agent Plan (35 Items)

**Status:** In Progress
**Referenz:** `docs/UX_UI_AUDIT_2026-03-15.md` Items #18-27, #40-48, #57-68, #79-88, #91-93

#### 5 Parallel Streams

| Stream | Bereich | Owner-Dateien | Items |
|--------|---------|---------------|-------|
| **M1** | Checkout/Cart Polish | `checkout/page.tsx`, `cart/page.tsx` | #18 Telefon-Feld, #21 Mobile-collapsible Summary, #22 Estimated Delivery, #23 Cart MwSt-Hinweis, #24 Cart Save-for-Later, #25 Cart Condition-Info, #26 Stale Cart Detection, #27 Session-Expiry im Checkout, #87 Secure Checkout Badge |
| **M2** | Auth/Account Polish | `AuthModal.tsx`, `AuthProvider.tsx`, `settings/page.tsx` | #40 Login-Error generisch, #41 Rate-Limiting Feedback, #42 Auto-Login nach PW-Reset, #43 Notification-Preferences, #44 Cross-Tab Session Sync, #47 Redirect nach Login |
| **M3** | Catalog/Auction UX | `catalog/page.tsx`, `catalog/[id]/page.tsx`, `auctions/` pages, `ImageGallery.tsx`, `BlockItemsGrid.tsx` | #57 Such-Autocomplete, #58 Grid/List Toggle, #59 Seitenzahlen-Pagination, #60 Image-Zoom, #61 Breadcrumb Filter-State, #62 Stock-Indicator, #63 Countdown prominent, #64 Bid-Status-Indikator, #65 Item-Card Countdown, #66 Filter-Pills horizontal scroll, #67 No-results Suggestions, #68 Live-Search |
| **M4** | Navigation/Legal/Error | `Header.tsx`, `Footer.tsx`, `global-error.tsx`, Legal Pages | #79 Active Nav-Link, #80 Back-to-Top, #81 Kontaktinfo Footer, #82 AGB Versandkosten aktualisieren, #83 Datenschutz Google Fonts Fix, #84 Global Error Page stylen, #85 Per-Route Error Boundaries, #88 Rückgaberecht auf Produktseiten |
| **M5** | Accessibility | Diverse Dateien | #86 ARIA Landmarks + Focus Indicators, #91 Focus-Indicators auf Links/Buttons, #92 aria-expanded/aria-controls, #93 Toast role="alert" |

### Letzte Änderungen (2026-03-15)
- **Shopify-Style One-Page Checkout (Phase A+B implementiert):**
  - **Architektur-Wechsel:** Stripe Hosted Checkout (Redirect) → Stripe Payment Element (eingebettet, kein Redirect)
  - **Phase A — Backend:**
    - Neuer Endpoint `POST /store/account/create-payment-intent` — erstellt Stripe PaymentIntent, gibt `client_secret` zurück
    - Neuer Endpoint `POST /store/account/update-payment-intent` — aktualisiert Betrag bei Shipping-Änderung
    - Webhook: `payment_intent.succeeded` + `payment_intent.payment_failed` Handler hinzugefügt (neben bestehendem `checkout.session.completed`)
    - Stripe Dashboard: 4 Events aktiv (checkout.session.completed/expired + payment_intent.succeeded/payment_failed)
    - Adresse wird auf Transaction bei Erstellung gespeichert (nicht mehr via Webhook)
    - Idempotency via `orderGroupId` als Idempotency-Key
  - **Phase B — Frontend:**
    - Checkout-Seite komplett umgeschrieben: Two-Column Layout (Form links 60%, Order Summary rechts 40%)
    - Section 1: **Shipping Address** — Name, Adresse, Stadt, PLZ, Land (pre-filled aus Kundenprofil)
    - Section 2: **Shipping Method** — Radio-Buttons mit Carrier, Lieferzeit, Tracking-Badge (dynamisch nach Adresse)
    - Section 3: **Payment** — Stripe `<PaymentElement />` inline (Card, PayPal, Klarna, Bancontact, EPS, Link)
    - **Order Summary Sidebar** — sticky auf Desktop, mit Item-Covers, Subtotal, Shipping, Total
    - VOD Dark Theme für Stripe Elements (Gold #d4a54a, Dark #1c1915, DM Sans)
    - "Continue to Payment" Button erstellt PaymentIntent, dann erscheint Payment Element
    - "Pay Now" Button → `stripe.confirmPayment()` — kein Redirect für Karten, Redirect nur für PayPal/Klarna
    - Success State mit grünem Checkmark + "View Orders" Link
    - Handles redirect-basierte Methoden via `redirect_status=succeeded` URL-Parameter
    - `@stripe/stripe-js` + `@stripe/react-stripe-js` installiert
    - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env.local` auf VPS gesetzt
  - **Phase C (offen):** Express Checkout (Apple Pay/Google Pay Buttons), Google Places Autocomplete, gespeicherte Adressen
  - **Alter Checkout:** Route + Webhook bleiben bestehen (Rollback-Option)
  - **Neue Dateien:** `create-payment-intent/route.ts`, `update-payment-intent/route.ts`, `stripe-client.ts`
  - **Geänderte Dateien:** `webhooks/stripe/route.ts`, `checkout/page.tsx`
  - **VPS:** Backend + Storefront deployed
- **Password Reset ("Passwort vergessen"):**
  - **Login-Modal:** "Forgot password?" Link unter Passwort-Feld → E-Mail eingeben → Reset-Link (15 Min.)
  - **Backend:** `password-reset` Subscriber hört auf `auth.password_reset` Event → Resend E-Mail
  - **Frontend:** `/reset-password?token=...` Seite mit neuem Passwort-Formular
  - **Middleware:** `/reset-password` durch Password Gate erlaubt
  - **Neue Dateien:** `emails/password-reset.ts`, `subscribers/password-reset.ts`, `reset-password/page.tsx`
  - **Geänderte Dateien:** `AuthModal.tsx`, `auth.ts`, `middleware.ts`
  - **VPS:** Backend + Storefront deployed
- **Checkout-Flow Bugfixes (10 Issues aus PayPal-Testtransaktion):**
  - **Stripe Webhook Raw Body Fix (ROOT CAUSE für Issues #2, #4, #5, #6, #8):**
    - **Problem:** ALLE Stripe Webhooks scheiterten seit Go-Live mit "No webhook payload was provided" — `req.body` war leer weil Medusa.js 2.x mit `bodyParser: false` den Raw Body nicht als Buffer bereitstellt
    - **Fix:** Custom `rawBodyMiddleware` in `middlewares.ts` — liest Raw Stream VOR dem Parsing, speichert als `req.rawBody`. Webhook-Handler liest `req.rawBody` mit Fallback-Kette (rawBody → Buffer body → string body → JSON stringify)
    - **Auswirkung:** Webhooks funktionieren jetzt → Transactions werden auf `paid` gesetzt, Cart wird geleert, E-Mails werden gesendet, Orders sind sichtbar
  - **Kundenname an Stripe/PayPal übergeben (Issue #9):**
    - **Problem:** PayPal zeigte kryptische Medusa-ULID statt Kundennamen
    - **Fix:** Checkout-API holt `first_name` + `last_name` aus customer-Tabelle, übergibt an Stripe via `metadata.customer_name` + `payment_intent_data.description`
  - **Admin-Transaktion mit Kundenname (Issue #7):**
    - **Problem:** Admin Transactions-Seite zeigte nur `shipping_name` (erst nach Stripe-Adresseingabe verfügbar)
    - **Fix:** Admin-API joined jetzt `customer`-Tabelle, zeigt `customer_name` (first + last) + `customer_email`. Webhook speichert `customer_name` aus Metadata als Fallback
  - **Cart-Clearing Race Condition (Issues #2, #8):**
    - **Problem:** Nach PayPal-Zahlung war Warenkorb noch voll (Webhook kam nach Frontend-Redirect)
    - **Fix:** Optimistisches Leeren (`setCartItems([])`, `setWins([])`) bei `?payment=success`, Polling (max 36s, alle 3s) wartet auf Webhook-Completion
  - **Checkout Success State:**
    - Nach Zahlung: Grüner Success-Screen mit "Payment Successful!" + Links zu "View Orders" / "Continue Shopping" statt leerer "Nothing to check out" Seite
  - **Shipping prominenter im Checkout (Issue #3):**
    - **Vorher:** Shipping war eine kleine Zeile im Order Summary
    - **Nachher:** Eigene "Shipping" Card mit Package-Icon, volle Breite Country-Dropdown, prominente Kostenzeile VOR dem Order Summary
  - **PayPal Testtransaktion bereinigt:**
    - Transaction manuell auf `refunded` gesetzt (Refund über Stripe/PayPal durchgeführt)
    - Release zurück auf `available`, 4 alte pending Transactions → `failed`
  - **Geänderte Dateien:** `middlewares.ts`, `webhooks/stripe/route.ts`, `store/account/checkout/route.ts`, `admin/transactions/route.ts`, `admin/routes/transactions/page.tsx`, `storefront checkout/page.tsx`
  - **VPS:** Backend + Storefront deployed
- **Stripe API-Zugriff via VPS:**
  - Direkter API-Zugriff über `curl` mit `STRIPE_SECRET_KEY` vom VPS
  - Getestete Endpoints: `charges`, `checkout/sessions`, `balance`, `refunds`
  - **7 Zahlungsmethoden aktiv:** Card, PayPal, Klarna, Bancontact (BE), EPS (AT), Link (Stripe One-Click), Amazon Pay
  - **Stripe Balance nach Refund:** 0,00 EUR available, -0,13 EUR pending (Gebühr)

### Frühere Änderungen (2026-03-11)
- **Catalog Visibility Redesign — Image-basierte Filterung:**
  - **Neue Logik:** Artikel mit mindestens 1 Bild = im Katalog sichtbar. Ohne Bild = unsichtbar + nicht gezählt. Preis bestimmt nur Kaufbarkeit, nicht Sichtbarkeit.
  - **is_purchasable Flag:** Neues Boolean-Feld in API-Responses (List + Detail) — `true` wenn `legacy_price > 0`
  - **Backend Catalog List API:** `visibility` Query-Parameter + `site_config` Lookup entfernt, stattdessen hartes `WHERE coverImage IS NOT NULL`
  - **Backend Catalog Detail API:** `whereNotNull("Release.coverImage")` — Releases ohne Bild = 404
  - **Storefront Catalog Page:** "Complete Catalog" / "Sales Catalog" Toggle entfernt, nur noch ein Katalog. Artikel ohne Preis zeigen "Not for sale" Hinweis
  - **Storefront Catalog Detail:** Preis-Box zeigt "This item is currently not available for purchase or in a planned auction." bei `!is_purchasable`, DirectPurchaseButton nur bei `is_purchasable`
  - **Storefront Homepage:** 2 Catalog-Buttons → 1 "Browse Catalog", Count zeigt nur Artikel mit Bild
  - **Release Type:** `is_purchasable?: boolean` zu `storefront/src/types/index.ts` hinzugefügt
  - **"For Sale" Filter-Toggle:** "All Items" / "For Sale" Segmented Control rechts neben Kategorie-Pills — filtert auf Artikel mit Preis (`for_sale=true` Query-Parameter), URL-persistent, mobile-responsive
  - **Geänderte Dateien:** `store/catalog/route.ts`, `store/catalog/[id]/route.ts`, `catalog/page.tsx`, `catalog/[id]/page.tsx`, `page.tsx`, `types/index.ts`
  - **VPS:** Backend + Storefront deployed

### Frühere Änderungen (2026-03-10)
- **GitHub Releases eingerichtet:**
  - **9 historische Releases** erstellt (v0.1.0 bis v0.9.0), jeweils pro Entwicklungstag mit SemVer-Tags
  - **Versionierung:** SemVer (MAJOR.MINOR.PATCH), aktuell v0.9.0
  - **Helper-Script:** `scripts/create-release.sh` — interaktive Release-Erstellung mit Auto-Version-Vorschlag, Git-Commit-Anzeige, Editor-Modus
  - **Nutzung:** `./scripts/create-release.sh` (interaktiv), `--today` (Commits anzeigen), `--list` (Releases auflisten)
  - **Releases sichtbar unter:** https://github.com/rseckler/VOD_Auctions/releases
  - **Neue Dateien:** `scripts/create-release.sh`
- **Sharing-Funktionen (Catalog + Auction Detail Pages):**
  - **Hybrid-Ansatz:** Mobile → natives OS Share Sheet (`navigator.share`), Desktop → Dropdown mit 6 Optionen
  - **Share-Optionen (Desktop):** Copy Link (mit Toast-Feedback), WhatsApp, X (Twitter), Facebook, Telegram, Email
  - **ShareButton:** Client-Komponente (44×44px, `Share2` Lucide Icon), gleicher Stil wie SaveForLaterButton
  - **Platzierung:** Rechts neben Heart-Icon am Titel (beide Detail-Seiten)
  - **OG-Tags:** Bereits vorhanden (title, description, image) — Link-Previews funktionieren out-of-the-box
  - **Keine neuen Dependencies** — Lucide Icons + native Browser APIs
  - **Neue Dateien:** `ShareButton.tsx`
  - **Geänderte Dateien:** `catalog/[id]/page.tsx`, `auctions/[slug]/[itemId]/page.tsx`
  - **Docs:** `PLAN_Sharing.md`, `sharing-mockup.html`
  - **VPS:** Storefront deployed
- **Catalog Mobile Fix — Text/Button Overlap:**
  - **Problem:** "41,534 releases from the..." Text wurde vom "Complete Catalog" Toggle-Button überdeckt auf kleinen Screens
  - **Fix:** `flex items-center justify-between` → `flex flex-col sm:flex-row sm:items-center justify-between gap-4` — Titel und Toggle stacken vertikal auf Mobile, horizontal ab 640px
  - **Geänderte Dateien:** `catalog/page.tsx`
  - **VPS:** Storefront deployed
- **Save for Later (Merken) Feature:**
  - **Backend:** `saved_item` Medusa DML Model (soft-delete Pattern), registriert als 6. Model in AuctionModuleService
  - **APIs:** `GET/POST /store/account/saved` (List mit Release+Artist JOIN, Save mit Duplikat-Check), `DELETE /store/account/saved/:id` (Soft-Delete)
  - **Status API:** Erweitert um `saved_count` neben `cart_count`
  - **Auth Middleware:** Bereits abgedeckt durch `/store/account/*` Wildcard (GET/POST/DELETE)
  - **SaveForLaterButton:** Client-Komponente mit 2 Varianten — "icon" (44×44px Heart, neben Titel) und "button" (Text + Heart)
  - **AuthProvider:** `savedCount` State, wird bei Login/Logout/Save/Unsave aktualisiert
  - **Header:** Heart-Icon mit Rose-Badge-Counter neben Cart-Icon (Desktop)
  - **Account Saved Page:** `/account/saved` — Liste aller gemerkten Artikel mit Cover, Artist, Titel, Preis, Remove-Button
  - **Account Sidebar:** "Saved" Nav-Item mit Heart-Icon zwischen Won und Cart
  - **Account Overview:** 5. Summary-Card (Saved, rose-500 Farbe)
  - **Detail-Seiten:** Heart-Icon neben Titel auf Catalog-Detail + Auction-Item-Detail
  - **DB Migration:** `saved_item` Tabelle (Migration20260310132158)
  - **Neue Dateien:** `saved-item.ts`, `saved/route.ts`, `saved/[id]/route.ts`, `SaveForLaterButton.tsx`, `saved/page.tsx`, `save-for-later-mockup.html`
  - **Geänderte Dateien:** `service.ts`, `status/route.ts`, `AuthProvider.tsx`, `Header.tsx`, `AccountLayoutClient.tsx`, `account/page.tsx`, `catalog/[id]/page.tsx`, `auctions/[slug]/[itemId]/page.tsx`
  - **VPS:** Backend + Storefront deployed
- **Homepage: Dynamischer Release-Count im Catalog Teaser:**
  - **Problem:** Hardcoded "40,000+" im Teaser-Titel, CMS-Wert überschrieb Fallback
  - **Fix:** `getTotalReleaseCount()` fetcht `/store/catalog?limit=0` (revalidate 3600s), Titel wird immer dynamisch generiert (z.B. "41,534 Releases in Catalog")
  - **Dateien:** `storefront/src/app/page.tsx`
  - **VPS:** Storefront deployed
- **AI Content Generation für neue Labels (abgeschlossen):**
  - **Kontext:** Nach Label Enrichment (2.829 neue Labels aus Katalognummern-Parsing) fehlte AI-Content für die neuen Label-Seiten
  - **Prozess:** `generate_entity_content.py --type label` auf VPS ausgeführt (identischer Prozess wie für bisherige Entities)
  - **Ergebnis:** 2.829 Labels generiert (P1: 54, P2: 411, P3: 2.364), 1 Fehler (Duplikat-Constraint)
  - **Laufzeit:** ~60 Minuten (50 req/min Rate Limit, Claude Haiku 4.5)
  - **Fix:** `anthropic` Python-Paket musste auf VPS nachinstalliert werden (`pip3 install --break-system-packages --ignore-installed anthropic`)
  - **Seiten live:** Alle neuen Labels unter `vod-auctions.com/label/[slug]` erreichbar (ISR 300s)

### Frühere Änderungen (2026-03-09)
- **ReleaseArtist-Bereinigung + Discogs Extraartists Import:**
  - **Problem:** ~50% der ReleaseArtist-Einträge (20.938 von 42.174) waren Garbage — generische Wörter (FROM, NO, Tape, A4, Logo...) aus Legacy-System als Band-Einträge gespeichert
  - **Schritt 1 — Garbage Cleanup:** 60 Fake-Artists identifiziert, Smart-Heuristik: nur löschen wenn Artist-Name im Credits-Text des jeweiligen Releases vorkommt. 10.170 Garbage-Links entfernt, 10.765 legitimate Links behalten
  - **Schritt 2 — Discogs Extraartists Import:** Für 16.590 Releases mit discogs_id: Discogs API `/releases/{id}` → `extraartists` Array parsen → Artist matchen/erstellen → ReleaseArtist mit korrekten Rollen (Design, Mastering, Producer, etc.) befüllen
  - **Script:** `scripts/import_discogs_extraartists.py` — resumable, signal handling, exponential backoff, 25 req/min, ~9h Laufzeit
  - **Admin Monitoring:** Neuer "Discogs Extraartists Import" Card auf Sync Dashboard — Progress Bar, Stats (With Extras, No Extras, New Artists, Links Created/Deleted, Errors), Recent Log, auto-refresh 15s
  - **API:** `GET /admin/sync/extraartists-progress` — liest Progress-JSON + prüft ob Script läuft (pgrep)
  - **Blacklist:** `scripts/garbage_artists_blacklist.json` — 60 Artists mit smart remove/keep Counts
  - **Cleanup Script:** `scripts/cleanup_release_artists.py` — löscht ReleaseArtist-Links wo Artist-Name in Release-Credits vorkommt
  - **Plan:** `PLAN_ReleaseArtist_Bereinigung.md` — 5-Schritte-Plan (Blacklist → Discogs Import → Garbage Cleanup → Frontend → Daily Sync)
  - **Neue Dateien:** `import_discogs_extraartists.py`, `cleanup_release_artists.py`, `garbage_artists_blacklist.json`, `PLAN_ReleaseArtist_Bereinigung.md`, `extraartists-progress/route.ts`
  - **Geänderte Dateien:** `sync/page.tsx` (Extraartists Progress Card)
  - **VPS:** Script läuft, Backend deployed
- **Discogs Preise & Links auf Storefront ausgeblendet (temporär):**
  - **Grund:** `/marketplace/price_suggestions` API liefert empfohlene Preise pro Zustand (Mint, NM, VG+…), NICHT die tatsächlichen Verkaufsstatistiken (Sale History) die auf der Discogs-Seite angezeigt werden — Preise stimmten daher nicht mit Discogs überein
  - **Ausgeblendet:** Discogs Prices Section (Low/Median/High) + "View on Discogs" Link auf Catalog-Detail + Auction-Detail, Discogs-Links auf Band/Label/Press Entity-Pages
  - **Nicht geändert:** Backend-APIs, DB-Spalten, Discogs Daily Sync Cronjob, Admin-Panel (zeigt Discogs-Daten weiterhin), Datenschutz-Seite (rechtlich nötig da API weiter genutzt)
  - **Wiederherstellen:** JSX-Comment-Marker (`{/* HIDDEN: ... */}`) in 5 Dateien entfernen
  - **Dateien:** `catalog/[id]/page.tsx`, `auctions/[slug]/[itemId]/page.tsx`, `band/[slug]/page.tsx`, `label/[slug]/page.tsx`, `press/[slug]/page.tsx`
  - **VPS:** Storefront deployed
- **Credits/Tracklist Separation Fix:**
  - **Problem:** ~3.900 Releases zeigten Tracklist-Daten im Credits-Bereich, obwohl die Tracklist bereits als JSONB existierte
  - **Ursache:** `extractTracklistFromText()` wurde nur aufgerufen wenn `tracklist` JSONB leer war — bei gefülltem JSONB blieben die Tracklist-Zeilen im Credits-Text stehen
  - **Fix:** `extractTracklistFromText()` wird jetzt IMMER auf credits angewendet, unabhängig ob tracklist JSONB existiert
  - **Dateien:** `catalog/[id]/page.tsx`, `auctions/[slug]/[itemId]/page.tsx`
  - **VPS:** Storefront deployed
- **Admin User Fix (frank@vinyl-on-demand.com):**
  - **Problem:** Login nach Invite-Annahme schlug fehl — `auth_identity.app_metadata` war NULL, Medusa konnte Login keinem User zuordnen
  - **Fix:** `app_metadata` manuell auf `{"user_id": "user_01KK9D34HRWG5SB3MWR5ZWY2XC"}` gesetzt
  - **Bekanntes Issue:** `frank@vod-records.com` kann nicht als Admin eingeladen werden — E-Mail bereits als Store-Customer registriert (Medusa erlaubt keine doppelte E-Mail über Actor-Typen hinweg)
  - **Admin-User:** `admin@vod.de`, `rseckler@gmail.com`, `frank@vinyl-on-demand.com`
- **Admin-Subdomain `admin.vod-auctions.com`:**
  - **Nginx:** Neue Config `vodauction-admin.conf` — Proxy zu Port 9000, Root `/` redirected auf `/app`
  - **SSL:** Certbot Let's Encrypt Zertifikat (gültig bis 2026-06-07, auto-renewal)
  - **DNS:** A-Record `admin.vod-auctions.com` → `72.62.148.205` (war bereits vorhanden)
  - **Zugang:** `https://admin.vod-auctions.com` → Medusa Admin Dashboard
  - **Neue Dateien:** `nginx/vodauction-admin.conf`
- **Medusa Invite-E-Mails (Notification Provider):**
  - **Resend Notification Module:** `src/modules/resend/` — Medusa-kompatibler Notification Provider mit Resend
  - **Invite Subscriber:** `src/subscribers/invite-created.ts` — hört auf `invite.created` + `invite.resent` Events, sendet Invite-E-Mail im VOD Auctions Design
  - **medusa-config.ts:** `@medusajs/medusa/notification` Modul mit Resend Provider registriert
  - **E-Mail-Template:** Gold/Dark Header, "Accept Invitation" Button, Fallback-Link
  - **Neue Dateien:** `src/modules/resend/service.ts`, `src/modules/resend/index.ts`, `src/subscribers/invite-created.ts`
  - **Geänderte Dateien:** `medusa-config.ts`
  - **VPS:** Backend deployed + neugestartet
- **Pre-Launch Password Gate:**
  - **Middleware:** `storefront/src/middleware.ts` — prüft `vod_access` Cookie, leitet auf `/gate` wenn nicht gesetzt
  - **Gate Page:** `storefront/src/app/gate/page.tsx` — Coming Soon Seite im VOD Auctions Design (Logo, Passwort-Eingabe, Gold-Button)
  - **Gate API:** `storefront/src/app/api/gate/route.ts` — prüft Passwort, setzt httpOnly Cookie (30 Tage)
  - **Layout:** Root-Layout rendert Header/Footer nur wenn `vod_access` Cookie gesetzt (Gate-Seite ohne Chrome)
  - **Passwort:** `vod2026` (änderbar via `GATE_PASSWORD` in `.env.local`)
  - **Bypass:** Gate erlaubt: `/gate`, `/api/gate`, `/_next`, `/api/revalidate`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml`
  - **Entfernen beim Launch:** `middleware.ts` löschen + `layout.tsx` Cookie-Check entfernen + neu deployen
  - **Neue Dateien:** `middleware.ts`, `gate/page.tsx`, `api/gate/route.ts`
  - **Geänderte Dateien:** `layout.tsx` (async, Cookie-basiertes Layout-Switching)
  - **VPS:** Storefront deployed
- **Label Enrichment from Catalog Numbers (abgeschlossen):**
  - **Problem:** ~7.176 Releases ohne Label-Zuordnung, aber mit Katalognummer die den Label-Namen enthält (z.B. "Hot Records, HOT 1019" → Label: "Hot Records")
  - **Lösung:** 3-Phasen-Validierungs-Pipeline `validate_labels.py` (ersetzt `enrich_labels_from_catno.py` als primäres Tool):
    - **Phase 1 (Discogs Release API):** Für Releases mit discogs_id → `GET /releases/{id}` → exakter Label-Name (4.461 Releases)
    - **Phase 2 (Discogs Label Search):** Für Releases ohne discogs_id → Parse + `GET /database/search?type=label` → String-Similarity-Vergleich (2.177 Releases)
    - **Phase 3 (AI Cleanup):** Für UNMATCHED aus Phase 2 → Claude Haiku Batch-Cleanup (519 Releases, ~$0.05)
  - **Output:** Review-CSV `data/label_validation_review.csv` → manuell geprüft → `--commit` auf VPS ausgeführt
  - **Ergebnis:** 7.002 Releases enriched, 2.829 neue Labels erstellt, Label-Abdeckung von 57% → 74% (30.739/41.534)
  - **Hilfscript:** `enrich_labels_from_catno.py` liefert Parsing-Funktionen (parse_label_from_catno, find_or_create_label, etc.)
  - **DB:** `label_enriched BOOLEAN DEFAULT FALSE` Spalte auf Release-Tabelle — markiert enriched Labels
  - **Sync-Schutz:** `legacy_sync.py` geändert — `labelId` wird NICHT überschrieben wenn `label_enriched = TRUE` (CASE-Statement in ON CONFLICT)
  - **Neue Dateien:** `scripts/validate_labels.py`, `scripts/enrich_labels_from_catno.py`
  - **Geänderte Dateien:** `scripts/legacy_sync.py` (labelId-Schutz in sync_releases + sync_literature)
- **E-Mail Sender & Brevo Domain-Authentifizierung:**
  - **Brevo Sender:** `newsletter@vod-auctions.com` (ID: 3) verifiziert und aktiv, ersetzt `admin@vod-auctions.com` für Newsletter
  - **Brevo Domain:** `vod-auctions.com` vollständig authentifiziert (DKIM, DMARC, SPF mit `include:sendinblue.com`, Brevo-Code)
  - **4 Newsletter-Templates** (IDs 2-5) auf neuen Sender umgestellt
  - **Code:** `brevo.ts` Default → `newsletter@vod-auctions.com`, `brevo_create_templates.py` Sender aktualisiert
  - **DNS-Records hinzugefügt:** 2× CNAME (brevo1/brevo2._domainkey), TXT (brevo-code), TXT (_dmarc mit rua), SPF um sendinblue.com ergänzt
  - **E-Mail-Architektur:** Resend (`noreply@`) für 6 transaktionale E-Mails, Brevo (`newsletter@`) für 4 Newsletter-Templates
  - **Dokumentation:** `Email-Content.md` — alle 10 E-Mail-Inhalte, Customer Journey, Testplan
  - **Test-Scripts:** `scripts/send_test_emails.py` (alle 10 E-Mails an Testadresse), `scripts/brevo_verify_sender.py` (Sender-Management)
  - **Neue Dateien:** `Email-Content.md`, `scripts/send_test_emails.py`, `scripts/brevo_verify_sender.py`
  - **Geänderte Dateien:** `brevo.ts`, `brevo_create_templates.py`
- **Brevo Behavior Tracking Integration:**
  - **BrevoTracker.tsx:** Consent-gated (Marketing-Cookie) Brevo JS Tracker, auto-identifiziert eingeloggte User (Email, Name, Medusa-ID), trackt Page Views bei Route-Wechsel
  - **brevo-tracking.ts:** 8 Event-Helper: `productViewed`, `addToCart`, `cartAbandoned`, `checkoutStarted`, `orderCompleted`, `bidPlaced`, `auctionViewed`, `catalogSearch`
  - **Tracking-Hooks:** `DirectPurchaseButton` (add_to_cart), `ItemBidSection` (bid_placed), `checkout/page.tsx` (checkout_started + order_completed)
  - **Cookie Consent:** Marketing-Text aktualisiert ("Behavior tracking and personalized recommendations")
  - **Datenschutz:** Brevo-Sektion um Behavior-Tracking-Daten erweitert
  - **Cookies-Seite:** Brevo Cookies (sib_cuid, sib_sesn) dokumentiert, Marketing-Sektion aktiviert
  - **Env:** `NEXT_PUBLIC_BREVO_CLIENT_KEY` in Storefront `.env.local` auf VPS
  - **VPS:** Storefront deployed
- **CRM Import tape-mag.com:** 3.580 Legacy-User aus tape-mag.com erfolgreich in Brevo importiert (List ID 5, NEWSLETTER_OPTIN=false, GDPR-konform)
- **Feature B+C: Per-Country Shipping, Carrier Management, Order History:**
  - **shipping_method Tabelle:** Per-Zone Carriers mit Tracking-URL-Patterns, Delivery Days, Default/Active Flags
  - **Admin Shipping Methods Tab:** CRUD für Carrier/Methods pro Zone, 7 Carrier-Templates (Deutsche Post, DHL, DPD, Hermes, GLS, Royal Mail, USPS) mit vorkonfigurierten Tracking-URLs
  - **Admin API:** `GET/POST/DELETE /admin/shipping/methods` — Erstellen, Aktualisieren, Löschen von Versandmethoden
  - **Store Shipping API:** Liefert jetzt `methods` gruppiert nach Zone-ID für Frontend-Auswahl
  - **Checkout Method Selection:** Radio-Buttons für Versandmethoden wenn Zone mehrere Carrier hat, Auto-Selection der Default-Methode
  - **shipping_method_id:** Wird auf Transaction gespeichert, Checkout akzeptiert `shipping_method_id` im Request Body
  - **shipping_country Bug Fix:** War nach DB-Insert gesetzt (nie gespeichert), jetzt korrekt VOR dem Insert
  - **Order History Page:** `/account/orders` — Bestellungen gruppiert nach `order_group_id`, Cover-Thumbnails, expandable Detail, Progress Bar (Paid→Shipped→Delivered), Status-Badges
  - **Clickable Tracking Links:** Tracking-Nummern auf Orders + Wins Pages sind jetzt klickbare Links (via `tracking_url_pattern` aus shipping_method)
  - **Neue Dateien:** `shipping/methods/route.ts`, `account/orders/route.ts`, `account/orders/page.tsx`, `20260308_shipping_methods.sql`
  - **Geänderte Dateien:** `store/shipping/route.ts`, `checkout/route.ts`, `transactions/route.ts`, `orders/route.ts`, `checkout/page.tsx`, `wins/page.tsx`, `types/index.ts`, `admin/shipping/page.tsx`
  - **DB Migration:** `shipping_method` Tabelle + FK auf `shipping_rate` + `transaction`, 6 Default-Methods geseeded
  - **VPS:** Backend + Storefront deployed

### Frühere Änderungen (2026-03-08)
- **Direct Purchase für alle User geöffnet + 13.571 Artikel aktiviert:**
  - **hasWonAuction-Gate entfernt:** Warenkorb und Direktkauf stehen jetzt allen eingeloggten Usern zur Verfügung (vorher nur nach gewonnener Auktion)
  - **Backend:** `hasWonAuction`-Check aus Cart POST API entfernt, Status API liefert nur noch `cart_count` (kein `has_won_auction` mehr)
  - **Frontend:** `hasWonAuction`-State aus AuthProvider entfernt, Header zeigt Cart-Icon für alle authentifizierten User, DirectPurchaseButton prüft nur noch `isAuthenticated`
  - **13.571 Releases aktiviert:** Alle Artikel mit `legacy_price > 0` auf `sale_mode = 'direct_purchase'` gesetzt, `direct_price = legacy_price`
  - **Dateien:** `cart/route.ts`, `status/route.ts`, `AuthProvider.tsx`, `Header.tsx`, `DirectPurchaseButton.tsx`, `CLAUDE.md`
  - **VPS:** Backend + Storefront deployed

- **Image Ordering Fix (rang-basiert):**
  - **Problem:** Gallery-Bilder und coverImage in falscher Reihenfolge — `legacy_sync.py` verwendete `GROUP BY r.id` (willkürliches Bild), Image-Tabelle hatte kein Ordering-Feld
  - **Fix:** `rang` INTEGER Spalte auf Image-Tabelle hinzugefügt, aus Legacy MySQL `bilder_1.rang` befüllt (17.787 Images)
  - **coverImage:** 4.593 Releases korrigiert (erstes Bild nach `rang, id` aus Legacy)
  - **Backend APIs:** Catalog Detail + Auction Item Detail + Admin Media → `ORDER BY rang ASC, id ASC`
  - **Storefront:** Catalog + Auction Detail Pages verwenden jetzt API-Reihenfolge statt coverImage-Override
  - **legacy_sync.py:** `GROUP BY` durch Subquery `ORDER BY rang, id LIMIT 1` ersetzt (verhindert Regression)
  - **Index:** `idx_image_release_rang` für Performance
  - **Script:** `fix_cover_images_from_url_order.py` — One-time Fix (rang + coverImage + Index)
  - **VPS:** Backend + Storefront deployed, Script ausgeführt

- **CMS On-Demand Revalidation + Subtitle Line Breaks:**
  - **Revalidation:** Backend CMS-Save triggert `revalidatePath()` auf Storefront via `POST /api/revalidate` (shared secret auth, fire-and-forget)
  - **Subtitle:** CMS-Text mit `\n` wird jetzt als separate `<p>`-Elemente gerendert (`.split("\n").map()`)
  - **VPS:** `REVALIDATE_SECRET` + `STOREFRONT_URL` in Backend `.env`, `REVALIDATE_SECRET` in Storefront `.env.local`

- **Google Search Console eingerichtet:**
  - Domain-Property `vod-auctions.com` verifiziert (DNS TXT-Record)
  - Sitemap `https://vod-auctions.com/sitemap.xml` eingereicht (900+ URLs)
  - Indexierung beantragt für Homepage + Catalog (Auctions-Seite abgelehnt wegen Thin Content — keine aktiven Auktionen)
  - SEO-Check bestanden: robots.txt OK, meta robots `index,follow`, canonical, OG-Tags, Twitter Card alles vorhanden

- **Homepage Spacing + Catalog Filter Redesign + Unknown Artist Fix:**
  - **Homepage Spacing:** Abstand zwischen Hero-Buttons und "40,000+ Releases" Teaser-Box um 50% reduziert (Hero pb halved, Teaser pt halved)
  - **Catalog Filter Redesign:** 5 Kategorien → 7 Hauptfilter (Tapes, Vinyl, CD, VHS, Artists/Bands Lit, Labels Lit, Press/Org Lit). Format-Subfilter (Magazine, Poster, Photo, Postcard) nur bei Literature-Kategorien sichtbar. Backend: `cd` und `vhs` Cases hinzugefügt, `tapes` excludiert jetzt CD/VHS
  - **Unknown Artist Fix:** Literature-Items ohne Artist zeigen jetzt Label-Name statt "Unknown Artist" (Fallback: artist_name → label_name → "Unknown Artist" in Catalog + Auction Detail Pages)
  - **VPS:** Backend + Storefront deployed

- **Entity Page Fixes + Admin Generation Progress:**
  - **Storefront Entity Pages Fix:** Band/Label/Press Detail-Seiten (`/band/[slug]`, `/label/[slug]`, `/press/[slug]`) crashten mit "Something went wrong" — API-Response-Struktur-Mismatch (Pages erwarteten verschachtelte Struktur `data.press.press_literature`, API liefert flache Struktur `data.publications`). Alle 3 Pages rewritten mit korrekten Types.
  - **Admin Entity Content Fix:** `/admin/entity-content` zeigte keine Einträge trotz 610+ Records — `__BACKEND_URL__` resolvte zu `"/"`, Fetch-URL wurde `//admin/entity-content` (Protocol-relative URL). Fix: Direkter Pfad `/admin/entity-content` wie alle anderen Admin-Pages.
  - **Admin Generation Progress Panel:** Neuer Bereich oben auf Entity Content Page — zeigt Progress Bars für alle 3 Entity-Typen (Bands/Labels/Press) mit Prozent, Counts, farbcodierten Balken (orange→gold→grün) und Gesamtübersicht.
  - **AI Content Generation:** P1 komplett (897 Entities), P2 läuft (Artists done, Labels in Progress), P3 startet automatisch via `check_p2_and_start_p3.sh`
  - **VPS:** Backend + Storefront + Admin deployed

- **Literature Image Regression Fix (bilder_typ Mapping):**
  - **Problem:** Nightly `legacy_sync.py` verwendete falsche `bilder_1.typ`-Werte für label_literature (typ=15 statt 14) und press_literature (typ=14 statt 12), überschrieb jede Nacht die zuvor korrigierten Cover-Bilder
  - **Symptome:** Labels Lit (visible) nur 2 statt 116 Ergebnisse, Press/Org Lit nur 255 statt 1.381, falsche Bilder durch Cross-Category-Zuordnung
  - **Fix:** `legacy_sync.py` + `migrate_literature.py` korrigiert: label_lit bilder_typ=15→14, press_lit bilder_typ=14→12
  - **Korrekte Mapping-Referenz:** typ=10 (releases), typ=12 (pressorga_lit), typ=13 (band_lit), typ=14 (labels_lit)
  - **Re-Sync:** Alle 1.129 label_lit + 6.326 press_lit neu synchronisiert → 1.077 + 5.807 mit korrekten Covers
  - **VPS:** Scripts deployed, Re-Sync ausgeführt
- **Catalog Country Filter — ISO Codes:**
  - 37 ISO 2-Letter Country Codes (DE, US, GB, FR, etc.) zu `COUNTRY_ALIASES` in Store Catalog API hinzugefügt
  - Eingabe "DE" filtert jetzt korrekt nach "Germany"

- **RSE-156: Discogs Daily Sync + Health Dashboard:**
  - **Problem:** Wöchentlicher Discogs-Sync (Sonntag, 16.500+ Releases auf einmal) führte zu 58% 429-Fehlerrate durch Discogs API Rate Limiting
  - **Fix:** `discogs_daily_sync.py` ersetzt `discogs_weekly_sync.py` — 5 tägliche Chunks (Mo-Fr, ~3.300/Tag), exponentieller Backoff (30s→60s→120s), Emergency Stop nach 20 konsekutiven 429s, Rate Limit 40 req/min
  - **Health Dashboard:** Neuer Admin-Bereich in `/admin/sync` — Echtzeit-Statusanzeige (Chunk, Processed, Updated, 429 Errors, Error Rate, Rate Limit), Progress Bar, 4 Action Buttons (Reduce Rate, Reset & Run, Run Chunk, Run Conservative)
  - **API:** `GET/POST /admin/sync/discogs-health` — liest `discogs_sync_health.json`, führt Actions aus (startet Python-Prozesse via nohup)
  - **Crontab:** Täglich Mo-Fr 02:00 UTC statt Sonntag 02:00 UTC
  - **Neue Dateien:** `scripts/discogs_daily_sync.py`, `backend/src/api/admin/sync/discogs-health/route.ts`
  - **VPS:** Script + Backend + Crontab deployed

- **RSE-147–152: SEO Entity Pages (Bands, Labels, Press Orgas):**
  - **RSE-147: Entity Content DB:** `entity_content` Tabelle (entity_type, entity_id, description, short_description, country, founded_year, genre_tags TEXT[], external_links JSONB, is_published, ai_generated), UNIQUE(entity_type, entity_id), RLS, Indexes
  - **RSE-148: Backend APIs:** 6 neue Routes — Admin CRUD (`/admin/entity-content`), Store public detail (`/store/band/:slug`, `/store/label/:slug`, `/store/press/:slug`), Sitemap feed (`/store/entities`). Bestehende APIs erweitert: artist_slug + label_slug in Catalog + Auction APIs
  - **RSE-149: Storefront Pages:** `/band/[slug]`, `/label/[slug]`, `/press/[slug]` — Vinyl Groove Design, Discography/Katalog/Publications-Tabellen, Schema.org JSON-LD (MusicGroup/Organization), generateMetadata(), 300s ISR, Breadcrumbs
  - **RSE-150: Internal Linking:** Hub-Spoke Modell — Catalog/Auction Detail-Seiten linken zu Entity-Pages (artist_slug, label_slug, pressorga_slug), CatalogRelatedSection mit Artist-Links, Sitemap erweitert mit Entity-Pages
  - **RSE-151: Admin Entity Content Editor:** `/admin/entity-content` — 3 Tabs (Bands/Labels/Press), Stats-Bar, Search + Filter, Expand/Edit Panel, AI Generate Button
  - **RSE-152: AI Content Script:** `scripts/generate_entity_content.py` — Claude Haiku 4.5, Priority-Tiers (P1/P2/P3), --dry-run, Rate Limiting 50 req/min
  - **Konzept-Dokument:** `SEO_Optimierung.md` (10 Kapitel, Wireframes, URL-Struktur, Implementation Plan)
  - **~17.500 neue indexierbare Seiten** aus bestehenden Daten (12.451 Artists + 3.077 Labels + 1.983 PressOrga)
  - **VPS:** Backend + Storefront deployed

### Frühere Änderungen (2026-03-07)
- **Concept C "Vinyl Groove" Detail Page Design:**
  - Applied unified section design to catalog detail (`/catalog/[id]`) and auction item detail (`/auctions/[slug]/[itemId]`)
  - **Design pattern:** Gold gradient left-border (`bg-gradient-to-b from-primary via-primary/60 to-transparent`), DM Serif Display section headers (`font-serif text-[15px] text-primary`), dotted row separators
  - **Tracklist:** Auto-detected Side A/B labels from position letters, vinyl-style card with side dividers
  - **Contributing Artists:** Gold-accented pills with left bar indicator
  - **Credits:** `CreditsTable` component — CSS grid (`grid-cols-[auto_1fr]`) with gold role labels, fallback to cleaned plain-text
  - **Details:** Array-based rendering with `filter(Boolean)` pattern, dotted separators
  - **Files:** `storefront/src/app/catalog/[id]/page.tsx`, `storefront/src/app/auctions/[slug]/[itemId]/page.tsx`, `storefront/src/components/CreditsTable.tsx`
  - **VPS:** Storefront deployed
- **RSE-128-131,133,138: Newsletter + CRM Dashboard + GDPR:**
  - **RSE-129: Newsletter Admin API + UI:** `/admin/newsletter` page — campaigns list with open/click rates, subscriber counts per list, send campaign endpoint (generic + block announcement), Brevo dashboard link
  - **RSE-128: Newsletter Opt-in Flow:** Registration checkbox (unchecked by default), account settings toggle with live Brevo status, `GET/POST /store/account/newsletter` API
  - **RSE-130: Brevo Email Templates:** 4 HTML templates (block_announcement, weekly_highlights, auction_results, monthly_digest) + `scripts/brevo_create_templates.py` upload script, sender: `newsletter@vod-auctions.com`
  - **RSE-131: Brevo Webhook Handler:** `POST /webhooks/brevo` — handles unsubscribed, hardBounce, softBounce, complaint/spam, delivered/opened/click events
  - **RSE-133: Datenschutz-Erweiterung:** New sections for Brevo (CRM/Newsletter) + Google Analytics (GA4, consent-gated), 3-category cookie consent (Essential/Analytics/Marketing), marketing cookies table (FB Pixel, Google Ads — prepared for future)
  - **RSE-138: CRM Dashboard:** `/admin/customers` — 5 overview cards (total contacts, per-list, newsletter opt-ins, Medusa customers), segment distribution bars, recent CRM contacts table, top customers by spend, campaign performance table
  - **Brevo Lib:** +`listContacts()` for contact listing with attributes
  - **Templates:** Brevo IDs: Block Announcement (2), Weekly Highlights (3), Auction Results (4), Monthly Digest (5)
  - **Brevo Senders:** `newsletter@vod-auctions.com` (id: 3, active, for newsletters) + `admin@vod-auctions.com` (id: 1, legacy). Domain `vod-auctions.com` fully authenticated (DKIM, DMARC, SPF, Brevo-Code)
- **Comprehensive Moreinfo Parser** — `scripts/fix_moreinfo_comprehensive.py`:
  - Fills gaps left by `fix_description_parser.py` and `fix_reparse_descriptions.py`
  - Handles 6 format variants: Discogs V1 playlist tables (schema.org), V2/V3 MUI tables (hashed CSS classes), section text with `<h3 class="group">` headers, simple div wraps, colon format (`A1 : Artist - Title`), plain text (no HTML)
  - Supports letter-only positions (A, B, C) not just A1/B2
  - Results: +463 new tracklists, +91 improved, +6 new credits, +10 improved credits, +251 notes appended to credits
  - Coverage improvement: tracklist 87.3% → 89.4% of releases with description (remaining 2,390 genuinely have no tracklist data — tape format only, archive numbers, etc.)
  - Idempotent — safe to re-run, skips already-filled fields
- **RSE-125/126/127: Brevo CRM Integration** — API Client + Event-Sync + Batch-Import:
  - **Brevo API Client:** `backend/src/lib/brevo.ts` — Stateless REST client (contacts, lists, campaigns, transactional emails)
  - **CRM Event-Sync:** `backend/src/lib/crm-sync.ts` — Fire-and-forget Brevo sync for 5 events:
    - Registration → upsert contact (name, segment=registered, list assignment)
    - Bid placed → update TOTAL_BIDS_PLACED, LAST_BID_DATE, segment=bidder
    - Auction won → update TOTAL_AUCTIONS_WON, segment=buyer
    - Payment completed → update TOTAL_PURCHASES, TOTAL_SPENT
    - Shipping update → update LAST_SHIPMENT_DATE / LAST_DELIVERY_DATE
  - **Route Hooks:** 1-line async CRM hooks in 5 routes (send-welcome, bids, auction-lifecycle, stripe webhook, admin transactions)
  - **Batch Import:** `scripts/crm_import.py` — Phase 1: vod-auctions (3 customers synced), Phase 2: tape-mag (3,580 synced ✅), Phase 3: vod-records (manual CSV)
  - **Behavior Tracking:** `BrevoTracker.tsx` — Consent-gated JS Tracker für Page Views, User Identification, E-Commerce Events (add_to_cart, bid_placed, checkout_started, order_completed)
  - **Brevo Account:** VOD Records (free plan, 300 emails/day)
  - **Lists:** VOD Auctions Customers (id=4), TAPE-MAG Customers (id=5)
  - **17 Custom Attributes:** PLATFORM_ORIGIN, MEDUSA_CUSTOMER_ID, TOTAL_PURCHASES, TOTAL_SPENT, TOTAL_BIDS_PLACED, TOTAL_AUCTIONS_WON, CUSTOMER_SEGMENT, etc.
  - **GDPR:** All imports with NEWSLETTER_OPTIN=false, newsletter requires Double Opt-in
  - **VPS:** Backend deployed, BREVO_API_KEY in .env

### Frühere Änderungen (2026-03-06)
- **Admin Detail Lightbox + Frontend Link + Catalog URL State:**
  - **Admin Detail Lightbox:** Klick auf Bild öffnet Fullscreen-Lightbox mit Prev/Next, Tastatur (←/→/Esc), Thumbnail-Leiste, Counter-Badge
  - **Admin Frontend Link:** "View in Catalog" Link zu `vod-auctions.com/catalog/{id}` in Release Information
  - **Catalog URL Persistence:** Filter, Sortierung und Paginierung werden in URL-Query-Params gespeichert (`/catalog?category=vinyl&page=5`), Back-Button stellt exakten Zustand wieder her
  - **VPS:** Backend + Storefront deployed
- **Data Quality Fix — Images, Covers, Tracklists, Credits:**
  - **band_literature images:** +3.437 fehlende Bilder für 885 Artikel importiert (typ=13 aus Legacy bilder_1)
  - **Release coverImage:** 3.198 Covers korrigiert (Sortierung nach rang/id statt zufällig)
  - **band_lit covers:** 239 korrigiert
  - **Tracklists:** 774 kaputte repariert + 332 neue (content_ETGfR Discogs-HTML-Format)
  - **Credits:** 1.736 abgeschnittene vervollständigt + 555 neue (UL/LI HTML-Format)
  - **Notes:** 3.764 aus Discogs-HTML extrahiert und an Credits angehängt
  - **Vergleichstest:** 50 zufällige Artikel gegen Legacy DB: 94% perfekt, 100% Cover korrekt, 100% Titel korrekt
  - **Scripts:** `fix_bandlit_images_and_covers.py`, `fix_reparse_descriptions.py`, `compare_vod_vs_legacy.py`
- **Image Gallery Overlay + tape_mag_url:**
  - **Admin Media:** "Browse Images" Button öffnet Fullscreen-Overlay mit Bildergrid (60/Seite), Suche, Lightbox, Detail-Navigation
  - **API:** `has_image` Query-Parameter für `/admin/media` (true/false)
  - **DB:** `tape_mag_url` TEXT-Spalte auf `Release` — alle 41.529 Releases mit tape-mag.com URL befüllt
  - **Detail-Seite:** Zeigt tape-mag.com Link aus DB-Feld in Release Information
  - **VPS:** Backend deployed
- **Catalog Visibility Admin Toggle:**
  - **DB:** `site_config` Tabelle (Key-Value, single row `default`) mit `catalog_visibility` Feld (`all` oder `visible`)
  - **Admin API:** `GET/POST /admin/site-config` — Lesen + Umschalten der Einstellung
  - **Store Catalog API:** Liest `site_config.catalog_visibility` als Default wenn kein `visibility` Query-Parameter übergeben wird
  - **Admin UI:** Toggle-Button auf Media Management Seite — "Filter OFF — Showing All" (gold) ↔ "Filter ON — Only with Image + Price" (grün)
  - **Wirkung:** `visible` = Kunden sehen nur Artikel mit coverImage + legacy_price, `all` = alles sichtbar
  - **Storefront-Filter entfernt:** Leere Formate (Boxset/Zine/Book/Merchandise/Reel) + Year/Price Sort+Filter aus Katalog-UI entfernt
  - **VPS:** Backend + Admin deployed
- **Literature Image Fix + Visibility Filter Removal + LabelPerson Import:**
  - **CoverImage Fix:** label_literature 24→1.080 (95.7%), press_literature 1.001→5.956 (94.2%) — Migration hatte falschen bilder_1.typ (15 statt 14). **Achtung:** `legacy_sync.py` hatte gleichen Bug → Regression-Fix am 2026-03-08 (siehe oben)
  - **Gallery-Bilder:** +15.098 neue Image-Einträge aus Legacy bilder_1 typ=12 (band/label/press literature)
  - **API-Filter entfernt:** `whereNotNull(coverImage/legacy_price)` aus allen 4 Store-APIs entfernt (Catalog list+detail, Auction block+item detail)
  - **Image-Limit:** 20→50 in Catalog-Detail + Auction-Item-Detail APIs
  - **LabelPerson:** 458 Personen + 362 Links zu Labels als Backend-Referenzdaten (nicht public)
  - **DB-Tabellen:** `LabelPerson` + `LabelPersonLink` (RLS, Indexes)
  - **Script:** `scripts/fix_literature_images.py` für Nachimport
  - **VPS:** Backend deployed
- **Extended Image Gallery + Catalog Result Count:**
  - **ImageGallery:** "Show all X images" Button bei >8 Bildern → Fullscreen-Grid-Overlay (2-5 Spalten, responsive)
  - **Lightbox-Verbesserungen:** Prev/Next-Pfeile, Tastatur-Navigation (←/→), scrollbare Thumbnail-Leiste, Bild-Zähler "X / Y"
  - **Counter-Badge:** Auf dem Hauptbild unten rechts "1 / 154"
  - **Katalog-Suche:** Gesamtzahl gefundener Artikel rechts in der Filter-Zeile ("12,067 results")
  - **Backend:** Image-Limit pro Release von 20 auf 50 erhöht, Visibility-Filter (coverImage/legacy_price required) aus Catalog-API entfernt
  - **VPS:** Backend + Storefront deployed
- **RSE-77: Smoke-Test / Phase 1 VPS-Check (bestanden):**
  - **Backend (PM2):** online, Port 9000, 56 MB RAM, `/health` → 200 in 55ms
  - **Storefront (PM2):** online, Port 3006, 197 MB RAM, `https://vod-auctions.com` → 200 in 69ms
  - **Nginx:** aktiv, SSL valid, Domains `vod-auctions.com` + `api.vod-auctions.com` korrekt
  - **Store API:** Auction-Blocks (leer — erwartungsgemäß), Catalog (12.067 Releases), Shipping (3 Zones, 15 Gewichtsstufen) — alle OK
  - **Stripe Live-Mode:** `sk_live_*` + `whsec_*` auf VPS gesetzt, Checkout-Code generiert IDs korrekt (`generateEntityId()`)
  - **Email (Resend):** API-Key gesetzt, FROM `VOD Auctions <noreply@vod-auctions.com>`, 6 Templates vorhanden
  - **Redis (Upstash):** `REDIS_URL` gesetzt
  - **Supabase Realtime:** `NEXT_PUBLIC_SUPABASE_URL` gesetzt
  - **Sentry:** DSN gesetzt, Production-only
  - **PM2 Restart-Counter zurückgesetzt** (waren 457/1180 durch alte Crash-Loop wegen fehlendem Build)
  - **Bekannte nicht-kritische Issues:** Nginx doppelter Servername `vodauction.thehotshit.de` (kosmetisch), Stripe-Webhook Spam von Bots ("No webhook payload")
  - **Nächster Schritt:** Phase 2 — Auction-Block mit 2 Artikeln anlegen + E2E-Testlauf
- **RSE-78: Launch-Vorbereitung (teilweise):**
  - **Stripe Live-Mode:** `.env.example` + `backend/.env.template` auf Live-Key-Platzhalter aktualisiert, Live-Keys auf VPS deployed
  - **Cookie-Consent-Banner:** DSGVO-konformer Banner (`CookieConsent.tsx`), GA4 wird nur bei explizitem Opt-In geladen, Consent in `localStorage` (`vod-cookie-consent`)
  - **Cookies-Seite korrigiert:** GA-Cookies dokumentiert (war fälschlich als "kein Analytics" deklariert), Consent-Banner referenziert
  - **Sentry Error-Tracking:** `@sentry/nextjs` integriert, `sentry.client/server/edge.config.ts`, `global-error.tsx`, nur in Production aktiv (10% Traces), DSN auf VPS deployed
  - **Offen:** E-Commerce-Anwalt für AGB-Prüfung (externer Prozess)
- **RSE-117: CMS Content Management** — Admin-Editor + Storefront-Integration:
  - **DB:** `content_block` Tabelle (JSONB content, page+section unique key, RLS, Indexes)
  - **Admin API:** `GET /admin/content`, `GET/POST /admin/content/:page/:section` (Upsert)
  - **Store API:** `GET /store/content?page=X` (Public, nur is_published=true)
  - **Admin UI:** `/admin/content` — Tabs (Home/About/Auctions), TipTap Richtext, 6 Feldtypen (text, textarea, richtext, list, object-list, url), Section-Level Save mit Modified/Saved/New Badges
  - **Storefront:** About-Seite + Homepage holen Content von CMS, Fallback auf Hardcoded-Defaults wenn DB leer
  - **Seeded:** 12 Content-Blocks (2 Home, 1 Auctions, 9 About)
  - **VPS:** Backend + Storefront deployed
- **Credits Parsing Fix** — Kaputte Credits bei VA-Compilations mit gescraptem Discogs-HTML behoben:
  - **`cleanRawCredits`:** Standalone `*` (Discogs Artist-Credit-Variante) wird in vorherige Zeile gemergt, `/` (Multi-Artist-Separator) wird als Joiner behandelt (prev / next), `–` Dash-Merge überspringt jetzt leere Zeilen korrekt
  - **`extractTracklistFromText`:** Durations die VOR Positions stehen (gescraptes Discogs-HTML Muster) werden als Track-Duration konsumiert statt als Garbage-Credits
  - **Ergebnis:** z.B. `legacy-release-29569` zeigt jetzt 14 saubere Tracks statt kaputten Credits-Text
  - **VPS:** Deployed (`NEXT_PRIVATE_WORKER_THREADS=false` für Build nötig wegen Turbopack-Bug auf Node 20)
- **RSE-116: About VOD Records** — Neuer `/about` Bereich:
  - **about/page.tsx:** Statische Seite mit 9 Sektionen: Hero, Founder (Frank Bull), Mission, Genres, Notable Artists (20), Sub-Labels (3), TAPE-MAG, VOD Fest 2026, External Links
  - **Externe Links:** vod-records.com, tape-mag.com, vod-records.com/vod-fest
  - **Navigation:** About-Link in Header, MobileNav und Footer hinzugefügt
  - **SEO:** metadata mit title, description, OpenGraph
  - **VPS:** Deployed, Storefront neugestartet
- **RSE-106: Google Analytics — Setup + Integration** — GA4 Property `G-M9BJGC5D69`:
  - **GoogleAnalytics.tsx:** Client-Komponente, lädt gtag.js via `next/script` (afterInteractive), rendert nichts ohne Measurement ID
  - **analytics.ts:** 7 Event-Tracking-Helpers: `trackBidPlaced`, `trackAuctionWon`, `trackRegistration`, `trackLogin`, `trackCatalogSearch`, `trackCatalogView`, `trackAuctionView`
  - **layout.tsx:** `<GoogleAnalytics />` eingebunden
  - **Env:** `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-M9BJGC5D69` (lokal + VPS)
  - **VPS:** Deployed, Storefront neugestartet
- **Google Search Console** — Domain-Property `vod-auctions.com`, verifiziert via DNS TXT-Record (`google-site-verification=lfq-yKrCxgafV9Nq2Er-_ULcVlnuGeNrG0KE4qRLeqQ`), Sitemap eingereicht
- **RSE-98: Image Optimization** — All raw `<img>` tags converted to Next.js `<Image>`:
  - **ImageGallery:** Main image (motion.div wrapper), thumbnails, lightbox — all with responsive `sizes`
  - **BlockCard:** Vertical + Horizontal variants with `fill` + `sizes`
  - **BlockItemsGrid:** Auction item grid with responsive `sizes`
  - **Auction Detail:** Hero image with `priority` (above-the-fold)
  - **Wins + Checkout:** Small thumbnails (48-64px) with fixed `sizes`
  - **Benefits:** Automatic WebP/AVIF, responsive srcset, lazy loading by default, `priority` for above-fold
  - **Catalog page** already used `<Image>` — no changes needed
  - **Zero raw `<img>` tags remaining** in storefront
- **RSE-97: SEO & Meta Tags** — Storefront pages:
  - **Root Layout:** `metadataBase`, title template (`%s — VOD Auctions`), keywords, OpenGraph + Twitter Card defaults, canonical URL
  - **OG Image:** `opengraph-image.tsx` — generated vinyl-branded OG image
  - **Catalog:** Static meta via `catalog/layout.tsx` (client component workaround), dynamic `generateMetadata` on detail page with cover image
  - **Auctions:** Static meta on list, dynamic `generateMetadata` on block detail (header image) and item detail (cover image)
  - **Account:** Refactored to server layout + `AccountLayoutClient.tsx`, `noindex/nofollow`
  - **Legal Pages:** All 5 pages with template titles + descriptions
  - **robots.ts:** Allow `/`, disallow `/account/` and `/api/`
  - **sitemap.ts:** Dynamic — homepage, catalog, auctions, legal pages, all auction blocks + catalog releases (up to 1000)
- **RSE-103: Shipping Configuration** — Gewichtsbasierte Versandkostenberechnung:
  - **4 neue DB-Tabellen:** `shipping_item_type` (13 Artikeltypen mit Gewichten), `shipping_zone` (DE/EU/World), `shipping_rate` (15 Gewichtsstufen × 3 Zonen), `shipping_config` (Global-Settings)
  - **Oversized-Erkennung:** Vinyl LPs (>25cm) automatisch als "oversized" → DHL Paket statt Deutsche Post
  - **Format-Auto-Mapping:** Release.format_group → shipping_item_type (z.B. LP→260g, CASSETTE→80g, CD→110g)
  - **Admin UI:** 4-Tab Shipping-Seite (Settings, Item Types, Zones & Rates, Calculator) unter `/admin/shipping`
  - **Admin APIs:** `/admin/shipping` (overview), `/admin/shipping/config`, `/admin/shipping/item-types`, `/admin/shipping/zones`, `/admin/shipping/rates`, `/admin/shipping/methods`, `/admin/shipping/estimate`
  - **Store API:** `GET /store/shipping` (Zonen für Frontend), `POST /store/shipping` (Schätzung mit release_ids)
  - **Checkout:** Dynamische Berechnung mit Fallback auf Flat-Rates, Free-Shipping-Threshold Support
  - **Margin:** Konfigurierbare Marge auf berechnete Versandkosten
  - **Bugfix:** `.js` Import-Erweiterungen in RSE-102 Email-Dateien entfernt (brachen Medusa Dev-Server)

### Frühere Änderungen (2026-03-06)
- **RSE-102: Transactional Emails + Feedback** — 6 Email-Templates + Feedback-System:
  - **Email-System:** Resend als Provider, 6 HTML-Templates (welcome, bid-won, outbid, payment-confirmation, shipping, feedback-request)
  - **Resend Domain:** `vod-auctions.com` verifiziert (SPF, DKIM, MX bei All-Inkl), FROM: `noreply@vod-auctions.com`
  - **Resend Account:** frank@vod-records.com
  - **Email-Helpers:** `sendShippingEmail()` + `sendFeedbackRequestEmail()` — automatisch getriggert bei Shipping-Status-Änderung
  - **Feedback-Seite:** `/account/feedback` — Post-Delivery Rating + Textfeld
  - **Feedback-Cron:** `feedback-email.ts` — täglich 10:00 UTC, sendet Feedback-Request 5 Tage nach Shipping
  - **DB:** Feedback-Spalten auf Transaction-Tabelle (`feedback_email_sent`, `feedback_rating`, `feedback_comment`, `feedback_at`)
  - **Checkout:** Verbesserte Combined-Checkout-Logik
  - **Auction Lifecycle:** Email-Benachrichtigungen bei Bid-Events
  - **Tracking URLs:** Carrier-spezifische Tracking-Links (DHL, DPD, Hermes, etc.)
  - **VPS:** RESEND_API_KEY in `.env` konfiguriert, Backend + Storefront deployed

### Frühere Änderungen (2026-03-06)
- **RSE-105: Legal Pages** — 5 rechtliche Seiten + Footer-Update:
  - `/impressum` — Impressum (von vod-records.com), Verweis auf alle 3 Plattformen
  - `/agb` — AGB mit Auktions-Bedingungen (Proxy-Bidding, Zuschlag, Stripe, Versandkosten)
  - `/datenschutz` — DSGVO-konform, alle Dienste erfasst (Supabase, Stripe, Upstash, Google Fonts, Discogs, Resend, Hostinger)
  - `/widerruf` — Widerrufsbelehrung mit § 312g BGB Auktions-Ausnahme + Muster-Formular
  - `/cookies` — Cookie-Richtlinie (nur technisch notwendige Cookies, kein Tracking)
  - **Footer:** Neue "Legal"-Spalte mit Links zu allen 5 Seiten

### Frühere Änderungen (2026-03-06)
- **RSE-101: Order Progress Tracking** — Paid/Shipped/Delivered Lifecycle komplett:
  - **Transaction Model:** +`tracking_number`, +`carrier` Felder (nullable text)
  - **Admin API:** `POST /admin/transactions/:id` akzeptiert jetzt `tracking_number` + `carrier` beim "shipped" Update
  - **Admin UI:** Neue Transactions-Seite (`/app/transactions`) — Tabelle mit Status-Filtern, Ship-Button (Carrier-Dropdown + Tracking-Eingabe), Delivered-Button
  - **Storefront Wins Page:** Status-Badges durch 3-Step Progress Bar ersetzt (Paid → Shipped → Delivered), Tracking-Nummer + Carrier Anzeige bei "Shipped"
  - **DB Migration:** `tracking_number` + `carrier` Spalten in Supabase angelegt

### Frühere Änderungen (2026-03-06)
- **RSE-104: Bid Confirmation Modal** — shadcn Dialog durch custom Framer Motion Modal ersetzt:
  - Gavel-Icon zentriert, "Confirm your bid" Titel (serif), Betrag prominent in Primary-Farbe
  - Backdrop blur + click-outside-to-close, scale/slide Animationen (AnimatePresence)
  - Proxy-Bid Anzeige falls Maximum gesetzt, Cancel + Confirm Buttons mit Check-Icon
  - shadcn Dialog-Imports entfernt, Design matching Clickdummy `BidSection.tsx`

### Frühere Änderungen (2026-03-05)
- **RSE-115: Sync Dashboard Enhancement + Discogs Batch Fix** — Sync-Monitoring erweitert + Batch-Bug behoben:
  - **Batch Fix:** PostgreSQL transaction error in `discogs_batch.py` — fehlender `pg_conn.rollback()` nach DB-Fehlern führte zu Kaskaden-Fehlern (nur 692 statt ~2400 Matches geschrieben). Fix in allen 3 Scripts: `discogs_batch.py`, `discogs_weekly_sync.py`, `backfill_discogs_prices.py`
  - **Tracklist-in-Credits Fix:** `extractTracklistFromText()` erkennt Tracklist-Daten im Credits-Feld (~2.311 Releases betroffen) und zeigt sie als Tracklist statt Credits
  - **Neue API:** `GET /admin/sync/batch-progress` — Live-Fortschritt aus `discogs_batch_progress.json` + JSONL-Zähler + DB-Unmatched-Count
  - **Sync Overview API:** Neue Felder `eligible`, `eligible_matched`, `eligible_with_price` (nur music releases)
  - **Dashboard Frontend:** Field-Mismatches gefixt (`total_releases`→`total`, `percentage`→`match_rate`, `unscanned` array statt number), Coverage zeigt jetzt eligible-Counts
  - **Batch Progress Card:** Live-Auto-Refresh (15s), Fortschrittsbalken, Matched/Errors/WithPrice Stats, Strategy-Breakdown (catno/barcode/full/basic), RUNNING/IDLE Status

### Frühere Änderungen (2026-03-05)
- **RSE-114: Credits Structured Rendering** — Credits sauber als Tabelle statt Fließtext:
  - `parseCredits()` in utils.ts: Parst Discogs-Style "Role – Name", "Role by Name", "Role: Name" Patterns
  - `CreditsTable` Komponente: Strukturierte `<dl>` Darstellung mit Role/Name Spalten
  - Fallback auf cleaned plain-text wenn keine Patterns erkannt
  - Katalog-Detail + Auktions-Detail nutzen neue Komponente

### Frühere Änderungen (2026-03-05)
- **RSE-113: Inventory-Verwaltung** — Neues `inventory` Feld (Anzahl Stück) pro Release:
  - DB: `inventory` INTEGER Spalte, initial auf 1 gesetzt für alle sichtbaren Artikel
  - Admin Media Liste: Neue "Inv." Spalte (nach Cover)
  - Admin Media Detail: Editierbares Inventory-Feld im "Edit Valuation" Bereich
  - Backend API: `inventory` in SELECT + allowedFields für Update
- **RSE-112: Visibility-System** — Artikel ohne Bild/Preis ausblenden + Admin-Ampel:
  - **Storefront:** Katalog-API filtert Releases ohne `coverImage` oder `legacy_price` komplett aus
  - **Storefront:** Katalog-Detail + Auktions-Item-Detail geben 404 für versteckte Artikel
  - **Auktionen:** Block-Items ohne Bild/Preis werden nach Enrichment gefiltert
  - **Admin Media Liste:** Neue "Vis." Spalte (erste Spalte) mit Ampel: grün (●) = sichtbar, rot (●) = versteckt
  - **Admin Media Liste:** Neuer "Visibility" Filter (All / Visible / Hidden)
  - **Admin Media API:** `legacy_price` + `visibility` Query-Parameter hinzugefügt

### Frühere Änderungen (2026-03-05)
- **RSE-111: Direktkauf / Warenkorb-System** — Komplettes Direct Purchase + Cart + Combined Checkout:
  - **DB:** `cart_item` Model (Medusa DML), Transaction erweitert (block_item_id nullable, +release_id, +item_type, +order_group_id), Release +sale_mode +direct_price
  - **Backend:** `auction-helpers.ts` (hasWonAuction, isAvailableForDirectPurchase), Cart API (GET/POST/DELETE), Status API, Combined Checkout (multi-item Stripe Session mit order_group_id), Webhook erweitert, Transaction APIs LEFT JOIN
  - **Admin:** sale_mode Dropdown + direct_price Input auf Media Detail, sale_mode Badge auf Media Liste
  - **Storefront:** AuthProvider (+hasWonAuction, +cartCount, +refreshStatus), Header Cart-Icon mit Badge, DirectPurchaseButton Komponente, Cart-Seite, Combined Checkout-Seite, Account-Nav erweitert, Wins-Page Checkout-Banner
  - **Voraussetzung:** Jeder eingeloggte Kunde kann direkt kaufen (hasWonAuction-Gate entfernt)
  - **31 Dateien, +1446/-198 Zeilen**

### Frühere Änderungen (2026-03-05)
- **5-Kategorie Filter-System** — Category-Filter in allen APIs und UIs umgebaut:
  - 5 Kategorien basierend auf Format.typ/kat: Tapes (kat=1) | Vinyl (kat=2) | Artists/Bands Lit (typ=3) | Labels Lit (typ=2) | Press/Org Lit (typ=4)
  - Backend: `category` Query-Parameter (statt `product_category`) in allen 5 API-Routes
  - SQL: CASE-basierte Kategorie-Ableitung mit Format LEFT JOIN
  - Admin Media: 5 Kategorie-Pills + format_kat in API-Response
  - Storefront Katalog: Kategorie-Pills + Format-Pills + erweiterte Filter (Country, Year Range, Label, Condition)
  - Store Catalog API: Alle Legacy-Filter übernommen (country, year_from, year_to, label, artist, condition)
- **Literature Migration** — 3 fehlende Produkt-Kategorien + Format-Tabelle migriert:
  - `Format`-Tabelle: 39 Einträge aus Legacy `3wadmin_tapes_formate` (ID-basiert, mit `format_group` für Filter)
  - `PressOrga`-Tabelle: 1.983 Press/Org-Entitäten
  - 11.370 neue Releases: 3.915 band_literature + 1.129 label_literature + 6.326 press_literature
  - ~4.686 neue Bilder (band_lit typ=13, pressorga_lit typ=14, labels_lit typ=15)
  - Release-Erweiterung: `product_category`, `format_id` (FK → Format), `pressOrgaId` (FK → PressOrga)
  - ReleaseFormat Enum: +MAGAZINE, +PHOTO, +POSTCARD, +MERCHANDISE, +REEL
  - Legacy Sync: 4 neue sync-Funktionen (pressorga, band_lit, labels_lit, press_lit)
  - Discogs Scripts: Literature-Items korrekt übersprungen (DISCOGS_SKIP_FORMATS)

### Frühere Änderungen (2026-03-05)
- **RSE-76: Stripe Payment Integration** — Komplette Zahlungsabwicklung implementiert:
  - Transaction Model, Stripe Checkout Session, Webhook Handler
  - Flat-Rate Versand: DE €4.99 / EU €9.99 / Worldwide €14.99
  - Wins-Page mit Pay-Button, Stripe Account: VOD Records Sandbox

### Frühere Änderungen (2026-03-03)
- **RSE-87–96:** English Translation, Article Numbers, Discogs Prices, Credits Fix, Admin Fixes, Backfill, VPS Deploy, Cronjobs

**Clickdummy:** https://vodauction.thehotshit.de (VPS, PM2, Port 3005)

**GitHub:** https://github.com/rseckler/VOD_Auctions
**Linear:** VOD Auctions Projekt (rseckler Workspace)

## Key Decisions

- **Keine eBay/Discogs-Validierung nötig** — jahrelange Erfahrung auf beiden Plattformen, Markt ist bekannt
- **Shopify war nur ein Test** — Daten dort sind nicht die primäre Quelle
- **Commerce-Engine:** Medusa.js (Open Source, MIT-Lizenz, 28k+ GitHub Stars)
- **Eigene Plattform direkt bauen** — kein White-Label, kein SaaS
- **Themen-Block-Modell** — Alle Auktionen in kuratierten Blöcken, nie als Einzellistings

## Documentation

1. **[KONZEPT.md](KONZEPT.md)** — Vollständiges Konzeptdokument
   - Plattform-Optionen Analyse
   - Themen-Block-Modell (Kapitel 3A)
   - Technische Architektur & Datenmodell
   - Datenquelle: tape-mag-mvp Supabase (Kapitel 4.1A)
   - Implementierungsplan (5 Phasen)
   - Finanzplanung & ROI

2. **[README.md](README.md)** — Kurzübersicht

3. **[SEO_Optimierung.md](SEO_Optimierung.md)** — SEO Entity Pages Konzept
   - 10 Kapitel: SEO-Analyse, URL-Struktur, Wireframes, DB-Schema, AI-Pipeline, Implementation Plan
   - ~17.500 neue Seiten (Bands, Labels, Press Orga)

## Technology Stack

| Komponente | Technologie |
|------------|-------------|
| **Commerce-Engine** | Medusa.js 2.x |
| **Frontend** | Next.js 16, React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4, shadcn/ui, Framer Motion |
| **Design** | "Vinyl Culture" Theme (DM Serif Display + DM Sans, Gold #d4a54a, warm dark #1c1915) |
| **Database** | Supabase PostgreSQL (Shared mit tape-mag-mvp) |
| **Real-time** | Supabase Realtime (Live-Bidding) |
| **Cache** | Upstash Redis (Bid-Cache) |
| **Payments** | Stripe (+ Stripe Connect) |
| **Storage** | Supabase Storage (Bilder, Content) |
| **Hosting** | VPS (PM2, nginx reverse proxy) |
| **State** | Zustand (global) + React Query (server) |
| **Rich-Text Editor** | TipTap (Prosemirror) — Admin Langbeschreibung |

### Supabase-Projekt (Shared)

**Projekt-ID:** `bofblwqieuvmqybzxapx` (eu-central-1, Frankfurt)
**URL:** https://bofblwqieuvmqybzxapx.supabase.co
**Dashboard:** https://supabase.com/dashboard/project/bofblwqieuvmqybzxapx

Shared DB für tape-mag-mvp + VOD_Auctions. Schema enthält 24 Tabellen (14 Basis + 4 Referenz + 6 Auktions-Erweiterung).

**Migrierte Daten (aktuell):**
- 12.451 Artists, 3.077 Labels, ~41.529 Releases, ~75.124 Images, 1.983 PressOrga, 39 Formats, 458 LabelPersons
- **Releases nach Kategorie:** 30.159 release + 3.915 band_literature + 1.129 label_literature + 6.326 press_literature
- **CoverImage-Abdeckung:** release 97%+, band_literature 93.5%, label_literature 95.7%, press_literature 94.2%
- Quelle: Legacy MySQL (213.133.106.99/vodtapes)
- IDs: `legacy-artist-{id}`, `legacy-label-{id}`, `legacy-release-{id}`, `legacy-image-{id}`, `legacy-bandlit-{id}`, `legacy-labellit-{id}`, `legacy-presslit-{id}`, `legacy-pressorga-{id}`, `legacy-labelperson-{id}`
- Auktions-Tabellen angelegt: auction_blocks, block_items, bids, transactions, auction_users, related_blocks
- 75+ Indexes, RLS auf allen Tabellen aktiv

## Implementation Plan

### Phase 1: Prototyp (Monate 1-2)
- ~~RSE-72: Datenbank vorbereiten~~ ✅
- ~~RSE-73: Admin-Panel~~ ✅
- ~~RSE-74: Public Frontend~~ ✅
- ~~RSE-75: Bidding-Engine~~ ✅
- ~~RSE-84: UX Polish & Auktions-Workflow~~ ✅
- ~~RSE-85: Storefront UX Redesign~~ ✅
- ~~RSE-87–94: Translation, Article Numbers, Discogs Prices, Credits, Bugfixes, Backfill, Deploy~~ ✅
- ~~RSE-95–96: Discogs Backfill Completed, VPS Cronjobs Active~~ ✅
- ~~RSE-76: Payment & Stripe Integration~~ ✅
- ~~RSE-111: Direktkauf / Warenkorb-System~~ ✅
- ~~RSE-100: Checkout Flow~~ ✅ (durch RSE-111 abgedeckt)
- ~~RSE-112: Visibility-System (Artikel ohne Bild/Preis ausblenden + Admin-Ampel)~~ ✅
- ~~RSE-113: Inventory-Verwaltung (Anzahl Stück pro Release)~~ ✅
- **RSE-77: Testlauf: 1 Block mit 10-20 Produkten** ← NÄCHSTER SCHRITT
- ~~RSE-101: Order Progress Tracking (Paid/Shipped/Delivered UI)~~ ✅
- ~~RSE-102: Transactional Emails (6 Templates)~~ ✅
- ~~RSE-103: Shipping Config (Gewichtsbasiert, Admin-konfigurierbar)~~ ✅
- ~~RSE-104: Bid Confirmation Modal~~ ✅
- ~~RSE-105: Legal Pages (Impressum, AGB, Datenschutz, Widerrufsbelehrung, Cookie-Richtlinie)~~ ✅

### Phase 2: Launch (Monate 3-4)
- Erste öffentliche Themen-Auktionen
- Marketing an tape-mag.com Kundenbasis
- Domain: vod-auctions.com

### Phase 3: Skalierung (Monate 5-8)
- 5.000+ Items, Marketing-Offensive

### Phase 4: Evaluierung (Monate 9-12)
- Datenbasierte Entscheidung über Vollausbau

### Phase 5: Premium-Features (Jahr 2)
- AI-Preisempfehlungen, Mobile App, Internationalisierung

## Database Schema

### Bestehend (tape-mag-mvp)
- `Release` — ~41.500 Produkte (4 Kategorien: release, band_literature, label_literature, press_literature), +inventory (INTEGER), Sichtbarkeit: coverImage + legacy_price NOT NULL
- `Artist`, `Label`, `Genre`, `Tag`, `Image`, `Track`
- `User`, `Comment`, `Rating`, `Favorite`
- `Format` — 39 Referenz-Einträge (Legacy-Format-IDs, name, typ, kat, format_group)
- `PressOrga` — 1.983 Press/Org-Entitäten (für press_literature)

### Neu (Auktions-Layer, Medusa ORM — Singular-Tabellennamen)
- `auction_block` — Themen-Auktionsblöcke (status, timing, content, settings, results)
- `block_item` — Zuordnung Release → Block (Startpreis, current_price, bid_count, lot_end_time, Status)
- `bid` — Alle Gebote (amount, max_amount, is_winning, is_outbid)
- `transaction` — Zahlungen & Versand (RSE-76: Stripe, status, shipping_status, Adresse; RSE-111: +release_id, +item_type, +order_group_id, block_item_id nullable; +shipping_method_id, +shipping_country)
- `cart_item` — Warenkorb für Direktkäufe (RSE-111: user_id, release_id, price-Snapshot)
- `saved_item` — Merkliste / Save for Later (user_id, release_id, soft-delete via deleted_at)
- `related_blocks` — Verwandte Blöcke
- `shipping_item_type` — 13 Artikeltypen mit Gewichten (RSE-103)
- `shipping_zone` — 3 Versandzonen DE/EU/World (RSE-103)
- `shipping_rate` — 15 Gewichtsstufen-Tarife (RSE-103)
- `shipping_config` — Globale Versand-Einstellungen (RSE-103)
- `shipping_method` — Per-Zone Carrier/Methoden mit Tracking-URL-Patterns (carrier_name, method_name, delivery_days, has_tracking, tracking_url_pattern, is_default, is_active)
- `site_config` — Globale Site-Einstellungen (catalog_visibility: all/visible)
- `entity_content` — CMS-Content für Entity-Seiten (RSE-147: description, short_description, genre_tags TEXT[], external_links JSONB, is_published, ai_generated)

### Release-Erweiterung
```sql
ALTER TABLE "Release" ADD COLUMN estimated_value DECIMAL(10,2);
ALTER TABLE "Release" ADD COLUMN media_condition TEXT;
ALTER TABLE "Release" ADD COLUMN sleeve_condition TEXT;
ALTER TABLE "Release" ADD COLUMN auction_status TEXT DEFAULT 'available';
ALTER TABLE "Release" ADD COLUMN current_block_id TEXT;
ALTER TABLE "Release" ADD COLUMN article_number TEXT;  -- VOD-XXXXX, unique
ALTER TABLE "Release" ADD COLUMN discogs_median_price DECIMAL(10,2);
ALTER TABLE "Release" ADD COLUMN discogs_highest_price DECIMAL(10,2);
ALTER TABLE "Release" ADD COLUMN product_category TEXT NOT NULL DEFAULT 'release';  -- release|band_literature|label_literature|press_literature
ALTER TABLE "Release" ADD COLUMN format_id INTEGER REFERENCES "Format"(id);  -- FK zur Format-Tabelle
ALTER TABLE "Release" ADD COLUMN "pressOrgaId" TEXT;  -- FK für Press/Org Literature
ALTER TABLE "Release" ADD COLUMN sale_mode TEXT NOT NULL DEFAULT 'auction_only';  -- auction_only|direct_purchase|both
ALTER TABLE "Release" ADD COLUMN direct_price DECIMAL(10,2);  -- Preis für Direktkauf
```

### Format-Tabelle
```sql
CREATE TABLE "Format" (
    id INTEGER PRIMARY KEY,          -- Legacy-ID beibehalten (4, 5, 15, ...)
    name TEXT NOT NULL,              -- ANZEIGE-NAME: "Tape-3", "Vinyl-Lp", "Mag/Lit"
    typ INTEGER NOT NULL,            -- 1=Release, 2=Labels-Lit, 3=Band/Labels/Press-Lit, 4=Press-Lit
    kat INTEGER NOT NULL,            -- 1=Tapes/Sonstiges, 2=Vinyl
    format_group TEXT NOT NULL       -- FILTER-GRUPPE: CASSETTE, LP, MAGAZINE, etc.
);
```

**Format-Darstellungs-Prinzip:**
- `Format.name` = primäre Anzeige überall (z.B. "Tape-3", "Vinyl-12"", "Mag/Lit")
- `Format.format_group` = nur für Gruppierung/Filter (CASSETTE, LP, MAGAZINE, etc.)
- API liefert: `format` (Enum), `format_id` (FK), `format_name` (Anzeige), `format_group` (Filter)

### PressOrga-Tabelle
```sql
CREATE TABLE "PressOrga" (
    id TEXT PRIMARY KEY,             -- legacy-pressorga-{id}
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT, country TEXT, year TEXT
);
```

### LabelPerson-Tabelle (Backend-Referenzdaten, nicht public)
```sql
CREATE TABLE "LabelPerson" (
    id TEXT PRIMARY KEY,             -- legacy-labelperson-{id}
    name TEXT NOT NULL,
    description TEXT, gender INTEGER, country TEXT, year TEXT
);
CREATE TABLE "LabelPersonLink" (
    id TEXT PRIMARY KEY,             -- legacy-perslink-{id}
    "personId" TEXT REFERENCES "LabelPerson"(id),
    "labelId" TEXT REFERENCES "Label"(id)
);
```
458 Personen hinter Labels + 362 Verknüpfungen. Keine Storefront-Anzeige — reine Referenzdaten.

**Artikelnummern generieren:**
```bash
# SQL-Script ausführen (einmalig, generiert VOD-00001 bis VOD-XXXXX)
psql $SUPABASE_DB_URL -f scripts/generate_article_numbers.sql
```

## Core Concepts

### Themen-Block-Modell
- Auktionen nur in Blöcken (1-500 Produkte pro Block)
- Jeder Block hat redaktionellen Content (Text, Bilder, Video, Audio)
- Dauer: 1 Tag (Flash) bis 30 Tage (Monatsauktion)
- Produkt-Reservierung: available → reserved → in_auction → sold/unsold
- Startpreis-Workflow: estimated_value → Auto-Startpreis (% konfigurierbar) → Admin-Review

### Block-Typen
- **Themen-Block:** Kuratiert nach Genre/Künstler/Epoche
- **Highlight-Block:** Wenige High-Value Items, längere Laufzeit
- **Clearance-Block:** 200-500 Items, 1€ Startpreise
- **Flash-Block:** 24h, 1-10 Items, überraschend

## Project Structure

```
VOD_Auctions/
├── CLAUDE.md                    # Claude Code Guidance
├── KONZEPT.md                   # Vollständiges Konzeptdokument
├── README.md                    # Kurzübersicht
├── nginx/                       # Nginx Config Templates
│   ├── vodauction-api.conf      # api.vod-auctions.com → Port 9000
│   ├── vodauction-store.conf    # vod-auctions.com → Port 3006
│   └── vodauction-admin.conf    # admin.vod-auctions.com → Port 9000 (/ → /app redirect)
├── backend/                     # Medusa.js 2.x Backend (Port 9000)
│   ├── medusa-config.ts         # Medusa Config (DB, CORS, Modules, Notification Provider)
│   ├── .env                     # Backend Env (DATABASE_URL, JWT, CORS)
│   ├── src/
│   │   ├── modules/auction/     # Custom Auction Module
│   │   │   ├── models/
│   │   │   │   ├── auction-block.ts  # AuctionBlock Entity (DML)
│   │   │   │   ├── block-item.ts     # BlockItem Entity (DML)
│   │   │   │   ├── bid.ts            # Bid Entity (DML, RSE-75)
│   │   │   │   ├── transaction.ts    # Transaction Entity (DML, RSE-76/110)
│   │   │   │   ├── cart-item.ts      # CartItem Entity (DML, RSE-111)
│   │   │   │   └── saved-item.ts    # SavedItem Entity (DML, Save for Later)
│   │   │   ├── service.ts       # AuctionModuleService (auto-CRUD, 6 models)
│   │   │   └── index.ts         # Module Registration
│   │   ├── modules/resend/      # Resend Notification Provider (Medusa Module)
│   │   │   ├── service.ts       # ResendNotificationProviderService (invite email template)
│   │   │   └── index.ts         # ModuleProvider Registration
│   │   ├── subscribers/
│   │   │   └── invite-created.ts # Subscriber: invite.created + invite.resent → send invite email
│   │   ├── api/
│   │   │   ├── admin/           # Admin API (Auth required)
│   │   │   │   ├── auction-blocks/   # CRUD: list, create, update, delete
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── route.ts  # GET/POST with status-transition validation (RSE-75b)
│   │   │   │   │       └── items/    # Block Items: add, update price, remove
│   │   │   │   ├── releases/    # Search 41k Releases (Knex raw SQL, 5-category + auction_status filter)
│   │   │   │   │   └── filters/route.ts  # GET filter options with counts (format/country/year/5 categories)
│   │   │   │   ├── media/       # Medien-Verwaltung API (browse, edit, stats, 5-category filter)
│   │   │   │   │   └── [id]/route.ts     # GET/POST Release-Detail + Format + PressOrga JOINs
│   │   │   │   ├── site-config/route.ts   # GET/POST: Catalog visibility toggle (site_config)
│   │   │   │   └── transactions/         # Transaction Management (RSE-76)
│   │   │   │       ├── route.ts          # GET: All transactions (filter by status)
│   │   │   │       └── [id]/route.ts     # GET detail + POST shipping status update
│   │   │   ├── newsletter/          # Newsletter Admin API (RSE-129)
│   │   │   │   ├── route.ts          # GET: Campaigns + subscriber counts
│   │   │   │   ├── stats/route.ts    # GET: Detailed subscriber + campaign stats
│   │   │   │   └── send/route.ts     # POST: Send campaign (generic or block announcement)
│   │   │   ├── customers/route.ts    # GET: CRM Dashboard data (Brevo + Medusa DB) (RSE-138)
│   │   │   ├── entity-content/       # Entity Content CRUD (RSE-148)
│   │   │   │   ├── route.ts          # GET: List with filters + stats
│   │   │   │   └── [type]/[entityId]/route.ts  # GET/POST/DELETE: Single entity content
│   │   │   └── store/           # Store API (Publishable Key required)
│   │   │       ├── auction-blocks/   # Public: list, detail, item detail
│   │   │       │   ├── route.ts      # List blocks (items_count, status filter)
│   │   │       │   └── [slug]/
│   │   │       │       ├── route.ts       # Block detail + items + Release data
│   │   │       │       └── items/[itemId]/
│   │   │       │           ├── route.ts   # Item detail + Release + Images
│   │   │       │           └── bids/route.ts  # GET bids + POST bid (auth required)
│   │   │       ├── band/[slug]/route.ts    # GET: Public band detail (RSE-148)
│   │   │       ├── label/[slug]/route.ts  # GET: Public label detail (RSE-148)
│   │   │       ├── press/[slug]/route.ts  # GET: Public press orga detail (RSE-148)
│   │   │       ├── entities/route.ts      # GET: Sitemap feed for entity pages (RSE-148)
│   │   │       ├── catalog/          # Katalog API (alle 41k Releases, 5-category + legacy filters)
│   │   │       │   └── [id]/route.ts # Release-Detail + Images + Format + PressOrga + Related Releases
│   │   │       └── account/          # Account APIs (RSE-75b + RSE-76 + RSE-111)
│   │   │           ├── bids/route.ts         # GET: Meine Gebote
│   │   │           ├── wins/route.ts         # GET: Gewonnene Items
│   │   │           ├── cart/route.ts         # GET + POST: Warenkorb (RSE-111)
│   │   │           ├── cart/[id]/route.ts    # DELETE: Cart-Item entfernen (RSE-111)
│   │   │           ├── saved/route.ts         # GET + POST: Saved items (Save for Later)
│   │   │           ├── saved/[id]/route.ts   # DELETE: Remove saved item
│   │   │           ├── status/route.ts       # GET: cart_count + saved_count
│   │   │           ├── checkout/route.ts     # POST: Combined Checkout (RSE-111, multi-item Stripe)
│   │   │           ├── newsletter/route.ts   # GET/POST: Newsletter opt-in/opt-out (RSE-128)
│   │   │           ├── orders/route.ts        # GET: Order History (grouped by order_group_id)
│   │   │           └── transactions/route.ts # GET: Meine Transactions (RSE-76)
│   │   │   ├── webhooks/
│   │   │   │   ├── stripe/route.ts  # POST: Stripe Webhook (RSE-76)
│   │   │   │   └── brevo/route.ts   # POST: Brevo Webhook (unsubscribe/bounce/spam) (RSE-131)
│   │   │   ├── middlewares.ts   # Auth middleware (bids + account + webhook raw body)
│   │   ├── lib/
│   │   │   ├── stripe.ts       # Stripe Client + Shipping-Rates Config
│   │   │   └── auction-helpers.ts  # isAvailableForDirectPurchase() (RSE-111)
│   │   │   └── jobs/
│   │   │       └── auction-lifecycle.ts  # Cron: Block activation/ending (every min)
│   │   └── admin/routes/        # Admin Dashboard UI Extensions (Englisch)
│   │       ├── auction-blocks/
│   │       │   ├── page.tsx     # Block-Übersicht (Tabelle)
│   │       │   └── [id]/page.tsx # Block-Detail (Edit + Items + Produkt-Browser)
│   │       ├── media/
│   │       │   ├── page.tsx     # Media Management (30k Releases, Filter, Sortierung)
│   │       │   └── [id]/page.tsx # Release-Detail (Info, Bewertung, Discogs-Daten)
│   │       ├── content/
│   │       │   └── page.tsx     # CMS Content Editor (Home/About/Auctions Tabs, TipTap)
│   │       ├── sync/
│   │       │   └── page.tsx     # Sync-Dashboard (Legacy + Discogs Status)
│   │       ├── newsletter/
│   │       │   └── page.tsx     # Newsletter Admin (Campaigns, Stats, Send)
│   │       ├── customers/
│   │       │   └── page.tsx     # CRM Dashboard (Segments, Top Customers, Campaigns)
│   │       ├── entity-content/
│   │       │   └── page.tsx     # Entity Content Editor (Bands/Labels/Press Tabs, RSE-151)
│   │       └── components/
│   │           └── rich-text-editor.tsx  # TipTap WYSIWYG Editor
│   └── node_modules/
├── storefront/                  # Next.js 16 Storefront (Port 3000)
│   ├── .env.local               # MEDUSA_URL + Publishable API Key
│   ├── src/
│   │   ├── middleware.ts        # Pre-launch password gate (checks vod_access cookie)
│   │   ├── app/
│   │   │   ├── layout.tsx       # Layout: Header, Footer, Dark Theme, AuthProvider (cookie-gated)
│   │   │   ├── page.tsx         # Homepage: Hero, aktive/demnächst Blöcke
│   │   │   ├── gate/page.tsx    # Pre-launch password page (Coming Soon)
│   │   │   ├── api/gate/route.ts # Password verification + cookie setter
│   │   │   ├── auctions/
│   │   │   │   ├── page.tsx     # Auktionsübersicht + AuctionListFilter
│   │   │   │   └── [slug]/
│   │   │   │       ├── page.tsx # Block-Detail: Hero, BlockItemsGrid
│   │   │   │       └── [itemId]/page.tsx  # Item-Detail + ItemBidSection + RelatedSection
│   │   │   ├── about/page.tsx   # About VOD Records: Founder, Mission, Genres, Artists, Sub-Labels, TAPE-MAG, VOD Fest, Links
│   │   │   ├── band/[slug]/page.tsx    # Band-Detail: Discography, Literature, Labels, Schema.org MusicGroup (RSE-149)
│   │   │   ├── label/[slug]/page.tsx   # Label-Detail: Katalog, Literature, Persons, Artists, Schema.org Org (RSE-149)
│   │   │   ├── press/[slug]/page.tsx   # Press-Detail: Publications, Schema.org Organization (RSE-149)
│   │   │   ├── catalog/
│   │   │   │   ├── page.tsx     # Katalog-Liste (alle 41k Releases, 5-Kategorie + Format + Advanced Filter)
│   │   │   │   └── [id]/page.tsx # Katalog-Detail + CatalogRelatedSection
│   │   │   └── account/         # Account-Bereich (RSE-75b + RSE-111)
│   │   │       ├── layout.tsx   # Auth-Guard, Sidebar-Nav (+Cart, +Checkout)
│   │   │       ├── page.tsx     # Übersicht: Willkommen + Summary-Karten
│   │   │       ├── bids/page.tsx    # Meine Gebote (gruppiert, Status-Badges)
│   │   │       ├── wins/page.tsx    # Gewonnene Items + Pay + Combined Checkout Banner
│   │   │       ├── cart/page.tsx    # Warenkorb (RSE-111)
│   │   │       ├── checkout/page.tsx # Combined Checkout (RSE-111) + method selection
│   │   │       ├── orders/page.tsx  # Order History (grouped, expandable, tracking links)
│   │   │       ├── settings/page.tsx # Profil-Informationen + Newsletter Toggle
│   │   │       ├── saved/page.tsx     # Saved Items (Save for Later)
│   │   │       └── feedback/page.tsx # Post-Delivery Feedback
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx        # Disc3 Logo + Gold Gradient, sticky header
│   │   │   │   ├── Footer.tsx        # Warm footer mit Disc3 icon
│   │   │   │   └── MobileNav.tsx     # Sheet-based mobile nav
│   │   │   ├── ui/                   # shadcn/ui Komponenten (17 installiert)
│   │   │   ├── AuthProvider.tsx      # Auth Context (JWT, Customer, cartCount, savedCount)
│   │   │   ├── AuthModal.tsx         # Login/Register Modal
│   │   │   ├── HeaderAuth.tsx        # Login/Logout/My Account im Header
│   │   │   ├── DirectPurchaseButton.tsx # "Add to Cart" (RSE-111, für alle eingeloggten User)
│   │   │   ├── SaveForLaterButton.tsx  # Heart icon — Save for Later (icon/button variants)
│   │   │   ├── HomeContent.tsx       # Homepage Sections (Running/Upcoming)
│   │   │   ├── BlockCard.tsx         # BlockCardVertical + BlockCardHorizontal
│   │   │   ├── ItemBidSection.tsx    # BidForm + BidHistory + Countdown + Realtime
│   │   │   ├── AuctionListFilter.tsx # Pill-Filter (All/Running/Upcoming/Ended)
│   │   │   ├── BlockItemsGrid.tsx    # Sort-Pills + Suche + Item-Grid
│   │   │   ├── ImageGallery.tsx      # Lightbox + Thumbnails mit Gold-Ring
│   │   │   ├── RelatedSection.tsx    # Related-Info Tabs (Artist/Label/Block Items) — Auktionen
│   │   │   ├── CatalogRelatedSection.tsx # Related-Tabs (by Artist/Label) — Katalog
│   │   │   ├── CookieConsent.tsx      # GDPR Cookie Consent Banner (RSE-78)
│   │   │   ├── GoogleAnalytics.tsx    # GA4 Script Loader, consent-gated (RSE-106/78)
│   │   │   ├── BrevoTracker.tsx       # Brevo Behavior Tracker, consent-gated (Marketing Cookie)
│   │   │   └── EmptyState.tsx        # Reusable Empty State
│   │   └── lib/
│   │       ├── api.ts           # medusaFetch Helper
│   │       ├── auth.ts          # Medusa Auth Helpers
│   │       ├── motion.ts        # Framer Motion Variants
│   │       ├── analytics.ts     # Google Analytics event tracking helpers (RSE-106)
│   │       ├── brevo-tracking.ts # Brevo behavior tracking helpers (8 events)
│   │       ├── utils.ts         # cn() Helper + cleanCredits() for legacy data cleanup
│   │       └── supabase.ts      # Supabase Client (Realtime)
│   └── node_modules/
├── clickdummy/                  # Interaktiver Clickdummy (Port 3005)
│   ├── ecosystem.config.js      # PM2 Config
│   ├── nginx-vodauction.conf    # Nginx Template
│   ├── src/
│   │   ├── app/                 # 18 Screens (Homepage, Auctions, Account, Emails)
│   │   ├── components/          # Header, Footer, FlowGuide, BidSection, etc.
│   │   ├── context/FlowContext.tsx  # 10-Step Flow State (localStorage)
│   │   └── data/                # Static JSON (50 Items, 3 Blocks, Bids)
│   └── node_modules/
├── scripts/                     # Migration-Scripts (Python)
│   ├── shared.py                # DB connections, format mapping, Discogs config, RateLimiter
│   ├── legacy_sync.py           # Daily sync: Artists, Labels, PressOrga, Releases, 3x Literature
│   ├── migrate_literature.py    # One-time: Format + PressOrga + 11.370 Lit-Items + Bilder
│   ├── discogs_batch.py         # Initial Discogs match (8-12h, resumable)
│   ├── discogs_weekly_sync.py   # Weekly Discogs price update (4-5h, resumable)
│   ├── backfill_discogs_prices.py # Two-pass Discogs backfill
│   ├── extract_legacy_data.py   # MySQL → JSON
│   ├── load_json_to_supabase.py # JSON → Supabase (psycopg2, Batch 500)
│   ├── fix_reimport_images.py   # Re-import ALL typ=10 release images (GROUP BY fix)
│   ├── fix_literature_image_assignments.py  # Fix cross-category lit image misassignment
│   ├── fix_bandlit_images_and_covers.py     # Fix band_lit missing images + release cover sorting
│   ├── fix_description_parser.py            # Parse tracklist/credits from classic HTML
│   ├── fix_reparse_descriptions.py          # Improved parser for content_ETGfR format
│   ├── compare_vod_vs_legacy.py             # 50-article comparison: VOD vs legacy DB
│   ├── top_images.py            # Show top articles by image count
│   ├── requirements.txt         # Python deps
│   └── data/                    # Extrahierte JSON-Daten (git-ignored)
├── supabase/migrations/         # SQL Migrations (RSE-72)
├── data/                        # Lokale Daten (git-ignored)
└── docs/                        # Architektur, Legal, Marketing
```

### Medusa.js Backend

**Port:** 9000
**Admin Dashboard:** http://localhost:9000/app
**Admin User:** admin@vod.de / admin123
**Publishable API Key:** `pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d`

**Starten:**
```bash
cd VOD_Auctions/backend
npx medusa develop    # Backend + Admin UI (hot reload)
```

**Wichtig:**
- SSL-Config in `medusa-config.ts` nötig für Supabase-Verbindung (`rejectUnauthorized: false`)
- Medusa erstellt eigene Tabellen (`auction_block`, `block_item` — Singular) neben den RSE-72 Tabellen (`auction_blocks`, `block_items` — Plural)
- Legacy-Daten (Release, Artist, Label) werden via Knex raw SQL abgefragt, nicht über Medusa ORM
- Store-API braucht `x-publishable-api-key` Header
- Admin Produkt-Browser: Filter (Format-Pills, Land, Jahr-Range, Label, Sortierung) + Grid/Tabellen-Ansicht
- `/admin/releases` unterstützt: q, format, country, label, year_from, year_to, sort, auction_status, category (tapes/vinyl/band_literature/label_literature/press_literature)
- `/admin/releases/filters` liefert verfügbare Filter-Optionen mit Counts (inkl. 5 categories via CASE SQL)
- Block-Update Route strippt `items` aus Body (Items nur über `/items` Endpoint verwaltet)
- `current_block_id` in Release-Tabelle ist UUID-Typ → Medusa ULIDs nicht kompatibel (nur auction_status wird aktualisiert)
- **Admin Custom Routes:** `defineRouteConfig({ label })` NUR auf Top-Level-Seiten (`page.tsx`), NICHT auf `[id]/page.tsx` Detail-Seiten (verursacht Routing-Konflikte)
- **Knex Gotcha — Decimal-Spalten:** Knex gibt DECIMAL-Spalten als Strings zurück, nicht als Numbers. In Admin-UI immer `Number(value)` vor `.toFixed()` verwenden.
- **Knex Gotcha — Subqueries:** `.where("col", pgConnection.raw('(SELECT ...)'))` funktioniert NICHT korrekt. Stattdessen: Wert zuerst abfragen, dann direkt verwenden: `.where("col", fetchedValue)`
- **Admin Build:** `medusa build` legt Admin-Assets in `.medusa/server/public/admin/`, muss nach `public/admin/` kopiert werden (siehe VPS Deploy)
- `/admin/media` unterstützt: q, format, country, label, year_from, year_to, sort (field:dir Format), has_discogs, auction_status, category (5 Kategorien via Format.kat)
- `/admin/media/stats` liefert: total, with_discogs, with_price, categories (5 Kategorien via CASE SQL mit Format JOIN)
- Admin-UI komplett auf Englisch (Media Management, Release Detail, Sync Dashboard)

### Storefront

**Port:** 3000 (lokal), 3006 (VPS/Produktion)
**URL:** https://vod-auctions.com (VPS, PM2, Port 3006, nginx reverse proxy)
**Sprache:** Englisch (alle UI-Texte, Locale en-US/en-GB)
**Starten:**
```bash
cd VOD_Auctions/storefront
npm run dev                  # Local development (port 3000)
```

**Wichtig:**
- `next.config.ts` muss externe Bild-Domains whitelisten (`tape-mag.com` für Legacy-Bilder)
- Bilder-URLs: `https://tape-mag.com/bilder/gross/{filename}` (Legacy-System)
- Storefront Katalog (`/catalog`): Zeigt alle ~41.500 Releases mit Suche, 5 Kategorie-Pills, Format-Filter (14 Werte), erweiterte Filter (Country, Year Range, Label, Condition), Sortierung (A-Z, Artist, Year, Price)
- Katalog-Detail (`/catalog/[id]`): Release-Info + Images + format_name Badge + PressOrga-Name + Related Releases by Artist/Label
- Auktions-Detail (`/auctions/[slug]/[itemId]`): Item-Info + Bidding + Related Section mit Block Items
- Credits-Text: Wird beim Rendern bereinigt (literal Escape-Sequenzen, CRLF, HTML-Tags → echte Newlines) via `.replace()` in Catalog + Auction Pages
- Artikelnummer: Wird als erstes Feld in Details-Sektion angezeigt (Catalog + Auction)
- Discogs-Preise: Low/Median/High + "View on Discogs" Link auf Detailseiten
- **Related Sections:** `RelatedSection.tsx` (Auktionen, Tabs: by Artist/Label/Block Artists/Labels/All Lots) und `CatalogRelatedSection.tsx` (Katalog, Tabs: by Artist/Label) — beide als kompakte Tabellen

### Clickdummy

**Purpose:** Interaktiver Prototyp der kompletten Customer Journey (18 Screens, 10-Step FlowGuide)
**Port:** 3005
**URL:** https://vodauction.thehotshit.de
**Deployment:** PM2 (`vodauction-clickdummy`) on VPS (72.62.148.205), nginx reverse proxy + Certbot SSL

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Framer Motion, localStorage-State

**Starten:**
```bash
cd VOD_Auctions/clickdummy
npm run dev -- -p 3005    # Local development
npm run build             # Production build
```

**Screens:** Homepage, Auktionsübersicht, Block-Detail (50 Items), Item-Detail (Bidding-Flow mit 10 States), Account (Dashboard, Gebote, Gewonnen, Checkout, Erfolg, Einstellungen), 6 E-Mail-Vorschauen (Phone-Frame Mockup)

**FlowGuide:** Floating bottom bar navigiert durch: Besucher → Registriert → Gebot → Überboten → Erneut geboten → Auktion endet → Gewonnen → Bezahlt → Versendet → Zugestellt

**Key Files:**
- `src/context/FlowContext.tsx` — State-Management (localStorage-backed, 10 steps)
- `src/data/items.ts` — 50 Dark Ambient/Drone Auction Items
- `src/data/blocks.ts` — 3 Auction Blocks
- `src/components/FlowGuide.tsx` — Demo-Navigation
- `src/components/BidSection.tsx` — Bidding mit allen States
- `ecosystem.config.js` — PM2 Config
- `nginx-vodauction.conf` — Nginx Template

## Linear Tracking

**Project:** [VOD Auctions](https://linear.app/rseckler/project/vod-auctions-37f35d4e90be)

### Phase 0 (Setup) — Done
- ~~**RSE-83:** Medusa.js Projekt-Setup & Konfiguration~~ ✅

### Phase 1 (Prototyp)

**Done:**
- ~~**RSE-72:** P1.1 Datenbank vorbereiten~~ ✅
- ~~**RSE-73:** P1.2 Admin-Panel~~ ✅
- ~~**RSE-74:** P1.3 Public Frontend~~ ✅
- ~~**RSE-75:** P1.4 Bidding-Engine~~ ✅
- ~~**RSE-84:** P1.4b UX Polish & Auktions-Workflow~~ ✅
- ~~**RSE-85:** P1.x Storefront UX Redesign~~ ✅
- ~~**RSE-87:** English Translation~~ ✅
- ~~**RSE-88:** Article Numbers (VOD-XXXXX)~~ ✅
- ~~**RSE-89:** Discogs Prices (Low/Median/High)~~ ✅
- ~~**RSE-90:** Credits Cleanup (cleanCredits utility)~~ ✅
- ~~**RSE-91:** Admin Detail Fix (field names + formatPrice)~~ ✅
- ~~**RSE-92:** Related Releases Fix (Knex subquery bug)~~ ✅
- ~~**RSE-93:** Backfill Script (Discogs price suggestions)~~ ✅
- ~~**RSE-94:** VPS Deployment (Backend + Storefront)~~ ✅
- ~~**RSE-95:** Re-run Discogs price backfill~~ ✅
- ~~**RSE-96:** VPS Cronjobs (Legacy + Discogs Sync)~~ ✅

- ~~**RSE-76:** Payment & Stripe Integration~~ ✅
- ~~**RSE-109:** Literature Migration + 5-Category Filter System~~ ✅
- ~~**RSE-111:** Direktkauf / Warenkorb-System (Direct Purchase + Cart + Combined Checkout)~~ ✅

**Next (Backlog/Todo):**
- **RSE-77:** Testlauf (1 Block, 10-20 Produkte) ← NÄCHSTER SCHRITT
- ~~**RSE-101:** Order Progress Tracking (Paid/Shipped/Delivered UI)~~ ✅
- ~~**RSE-102:** Transactional Email Templates (6 Emails)~~ ✅
- ~~**RSE-103:** Shipping Configuration (Weight-based, Admin-konfigurierbar)~~ ✅
- ~~**RSE-104:** Bid Confirmation Modal~~ ✅
- ~~**RSE-105:** Legal Pages (Impressum, AGB, Datenschutz, Widerrufsbelehrung, Cookie Policy)~~ ✅

**Independent (can start now):**
- ~~**RSE-97:** SEO & Meta Tags~~ ✅
- ~~**RSE-98:** Storefront Performance (Image optimization)~~ ✅
- ~~**RSE-99:** Admin Media Bulk Actions~~ ✅
- ~~**RSE-106:** Google Analytics — Setup + Integration~~ ✅

### CRM/Newsletter (Phase 2) — RSE-125–144
- ~~**RSE-125:** Brevo Setup & API Client~~ ✅
- ~~**RSE-126:** CRM Event-Sync (Medusa → Brevo)~~ ✅
- ~~**RSE-127:** Initialer CRM-Import (3 Plattformen → Brevo)~~ ✅
- ~~**RSE-128:** Newsletter Opt-in & Double Opt-in Flow~~ ✅
- ~~**RSE-129:** Newsletter Admin API + UI~~ ✅
- ~~**RSE-130:** Brevo Email Templates (4 Templates uploaded)~~ ✅
- ~~**RSE-131:** Brevo Webhook Handler (Unsubscribe/Bounce)~~ ✅
- **RSE-132:** Buffer Setup & Social Media (manuell, wartend)
- ~~**RSE-133:** Datenschutz-Erweiterung (Brevo, GA4, Marketing-Cookies)~~ ✅
- **RSE-134–137:** Marketing-Automationen, Newsletter-Cronjob, Social Media AI (Phase 3)
- ~~**RSE-138:** CRM Dashboard im Admin~~ ✅
- **RSE-139–144:** Google Ads, FB Pixel, Segmentierung, Marketing Vollausbau (Phase 3-4)

### SEO Entity Pages — RSE-147–152 (Done)
- ~~**RSE-147:** Entity Content Database + Migration~~ ✅
- ~~**RSE-148:** Backend Entity Content APIs (Admin + Store)~~ ✅
- ~~**RSE-149:** Storefront Entity Pages (/band, /label, /press)~~ ✅
- ~~**RSE-150:** Internal Linking + Sitemap + Schema.org~~ ✅
- ~~**RSE-151:** Admin Entity Content Editor~~ ✅
- ~~**RSE-152:** AI Content Generation Script (Claude Haiku)~~ ✅

### Phase 2 (Launch) — Backlog
- **RSE-78:** P2.1 Launch-Vorbereitung — ~~Stripe Live~~ ✅ ~~Cookie Consent~~ ✅ ~~Sentry~~ ✅ ~~Analytics~~ ✅ ~~Legal Pages~~ ✅ ~~Domain~~ ✅ | Offen: E-Commerce-Anwalt AGB-Prüfung
- **RSE-79:** P2.2 Erste öffentliche Themen-Auktionen
- **RSE-80:** P2.3 Marketing (tape-mag.com Kundenbasis)

### Phase 3-4 — Backlog
- **RSE-81:** P3 Skalierung (5.000+ Items)
- **RSE-82:** P4 Evaluierung & Datenanalyse

### Duplicate/Obsolete
- RSE-31, RSE-32, RSE-33 — Duplicate (alte eBay-Test Phase, ersetzt durch eigene Plattform)

## Data Sync & Enrichment Scripts

**Location:** `scripts/`

```bash
cd VOD_Auctions/scripts

# Shared utilities (imported by all scripts)
# scripts/shared.py — DB connections, format mapping (LEGACY_FORMAT_ID_MAP), Discogs config, RateLimiter

# Legacy MySQL → Supabase Sync (daily)
python3 legacy_sync.py           # Incremental sync: Artists, Labels, PressOrga, Releases (+format_id), 3x Literature

# One-time Literature Migration
python3 migrate_literature.py    # Format-Tabelle + PressOrga + 11.370 Literature + Bilder (already run)

# Discogs Price Enrichment
python3 discogs_batch.py          # Initial batch: match releases (8-12h, resumable, skips literature)
python3 discogs_daily_sync.py     # Daily price update (Mon-Fri chunks, ~3300/day, exponential backoff on 429)
python3 discogs_daily_sync.py --chunk 2 --rate 25  # Run specific chunk with custom rate limit
python3 backfill_discogs_prices.py # Two-pass backfill: 1) /releases for basic data, 2) /price_suggestions for median/highest
python3 discogs_price_test.py     # Feasibility test (100 random releases)

# Article Numbers
psql $SUPABASE_DB_URL -f generate_article_numbers.sql  # Generate VOD-XXXXX numbers

# CRM Import (Brevo, RSE-127)
python3 crm_import.py                  # All phases (1+2)
python3 crm_import.py --phase 1        # Only vod-auctions customers
python3 crm_import.py --phase 2        # Only tape-mag (3,577 contacts)
python3 crm_import.py --dry-run        # Preview without sending

# AI Entity Content Generation (RSE-152)
python3 generate_entity_content.py --type artist --priority P1    # Top artists (>10 releases)
python3 generate_entity_content.py --type label --priority P1     # Top labels
python3 generate_entity_content.py --type press_orga --priority P1 # Top press orgs
python3 generate_entity_content.py --dry-run --limit 5            # Preview without writing

# Label Enrichment from Catalog Numbers
python3 enrich_labels_from_catno.py                  # Both phases (Discogs + Parse) — direct DB write
python3 enrich_labels_from_catno.py --phase 1        # Discogs API only (~4.5k releases)
python3 enrich_labels_from_catno.py --phase 2        # Parse from catalogNumber only
python3 enrich_labels_from_catno.py --dry-run        # Preview without writing
python3 enrich_labels_from_catno.py --limit 100      # Limit per phase

# Label Validation (3-Phase Pipeline — preferred over enrich_labels_from_catno.py)
python3 validate_labels.py                           # All 3 phases → review CSV
python3 validate_labels.py --phase 1                 # Phase 1: Discogs Release API (~4.5k with discogs_id)
python3 validate_labels.py --phase 2                 # Phase 2: Discogs Label Search (~2.7k without discogs_id)
python3 validate_labels.py --phase 3                 # Phase 3: AI Cleanup (Claude Haiku, UNMATCHED only)
python3 validate_labels.py --limit 100               # Limit per phase
python3 validate_labels.py --commit data/label_validation_review.csv  # Apply reviewed CSV to DB
```

**Cronjobs (VPS — verifiziert 2026-03-03, alle Dependencies installiert):**
```bash
# Legacy MySQL → Supabase (daily 04:00 UTC)
0 4 * * * cd ~/VOD_Auctions/scripts && ~/VOD_Auctions/scripts/venv/bin/python3 legacy_sync.py >> legacy_sync.log 2>&1
# Discogs Daily Price Update (Mon-Fri 02:00 UTC, 5 chunks rotating)
0 2 * * 1-5 cd ~/VOD_Auctions/scripts && ~/VOD_Auctions/scripts/venv/bin/python3 discogs_daily_sync.py >> discogs_daily.log 2>&1
```

**VPS Python Dependencies (venv at `scripts/venv/`):**
psycopg2-binary, python-dotenv, requests, mysql-connector-python

**New DB columns:** discogs_id, discogs_lowest_price, discogs_median_price, discogs_highest_price, discogs_num_for_sale, discogs_have, discogs_want, discogs_last_synced, legacy_last_synced, article_number, product_category, format_id, pressOrgaId, label_enriched
**New DB tables:** sync_log, Format (39 entries), PressOrga (1.983 entries)

## Admin Panel Extensions

**Media Management:** `/admin/media` — Browse/search/filter alle ~41.500 Releases mit Discogs-Daten
- Spalten: Cover, Artist, Title, Format (format_name), Year, Country, Label, Art. No., CatNo, Discogs Price, Discogs ID, Status, Last Sync
- Filter: Search (debounced), **5 Kategorie-Pills** (All/Tapes/Vinyl/Artists-Bands Lit/Labels Lit/Press-Org Lit), Format-Pills (14 Werte), Country, Year (von-bis Range), Label (debounced), Has Discogs, Auction Status
- Sortierung: Alle Spalten sortierbar (field:dir Format)
- API: GET /admin/media (?category), GET /admin/media/:id (Format+PressOrga JOINs), POST /admin/media/:id, GET /admin/media/stats (5 categories via CASE SQL)

**Sync-Dashboard:** `/admin/sync` — Legacy + Discogs Sync-Status und Reports
- API: GET /admin/sync, GET /admin/sync/legacy, GET /admin/sync/discogs
- API: GET /admin/sync/discogs-health (live health status + action buttons)
- API: POST /admin/sync/discogs-health (execute actions: reduce_rate, reset_and_run, run_chunk, run_conservative)
- API: GET /admin/sync/batch-progress (batch matching progress)

**Transaction Management:** `/admin/transactions` — Zahlungen & Versand (RSE-76)
- API: GET /admin/transactions (filter: status, shipping_status)
- API: GET /admin/transactions/:id, POST /admin/transactions/:id (shipping_status update)

## Checkout Redesign — Shopify-Style One-Page Checkout (Phase A+B LIVE, Phase C offen)

**Ziel:** Migration von Stripe Hosted Checkout (Redirect) zu Shopify-ähnlichem One-Page Checkout mit Stripe Elements (eingebettet). Login bleibt Pflicht (kein Guest-Checkout).

**Entscheidung:** 2026-03-15 — Shopify-Checkout ist De-facto-Standard, komfortabler für User (alles auf einer Seite, kein Redirect).

### Architektur-Änderung
- **Aktuell:** Frontend → Backend erstellt Checkout Session → Redirect zu Stripe → Webhook `checkout.session.completed`
- **Neu:** Frontend sammelt Adresse + zeigt Stripe Payment Element inline → Backend erstellt PaymentIntent → Frontend bestätigt Payment via `stripe.confirmPayment()` → Webhook `payment_intent.succeeded`

### Checkout-Layout (One-Page, Two-Column)

```
LEFT COLUMN (60%)                RIGHT COLUMN (40%, sticky)
┌─────────────────────────┐      ┌──────────────────────┐
│ EXPRESS CHECKOUT         │      │ ORDER SUMMARY        │
│ [Apple Pay] [Google Pay] │      │ 🖼 Item 1    €12.00 │
│ [PayPal Express]         │      │ 🖼 Item 2     €8.50 │
│ ─── or ──────────        │      │                      │
│                          │      │ Subtotal    €20.50   │
│ SHIPPING ADDRESS         │      │ Shipping     €4.99   │
│ Name, Address, City,     │      │ ────────────────     │
│ ZIP, Country             │      │ TOTAL       €25.49   │
│                          │      └──────────────────────┘
│ SHIPPING METHOD          │
│ ○ Standard  €4.99        │
│ ○ Express   €9.99        │
│                          │
│ PAYMENT                  │
│ [Stripe PaymentElement]  │
│ (Card/PayPal/Klarna/...) │
│                          │
│ [═══ PAY NOW ═══]        │
└─────────────────────────┘
```

### Implementierungsplan — 3 Phasen

**Phase A: Backend (deploy zuerst, zero User-Impact)**
1. Neuer Endpoint `POST /store/account/create-payment-intent` — erstellt Stripe PaymentIntent statt Checkout Session, gibt `client_secret` zurück
2. Neuer Endpoint `POST /store/account/update-payment-intent` — aktualisiert Betrag bei Shipping-Änderung
3. Webhook erweitern: `payment_intent.succeeded` + `payment_intent.payment_failed` Handler (neben bestehendem `checkout.session.completed`)
4. Stripe Dashboard: Neue Events zum Webhook hinzufügen
5. Adresse wird auf unserer Seite gesammelt → direkt auf Transaction gespeichert (nicht mehr via Stripe Webhook)

**Phase B: Frontend (deploy nach Phase A Verifizierung)**
1. `npm install @stripe/stripe-js @stripe/react-stripe-js` im Storefront
2. Neues `storefront/src/lib/stripe.ts` — `loadStripe(publishableKey)`
3. Checkout-Page komplett umschreiben:
   - Shipping-Adresse-Formular (pre-filled aus Customer-Profil)
   - Shipping-Method-Auswahl (bestehende Logik verschieben)
   - `<PaymentElement />` — Stripe-Komponente, zeigt alle Zahlungsmethoden inline
   - "Pay Now" Button → `stripe.confirmPayment()` (kein Redirect für Cards, Redirect für PayPal/Klarna)
   - Order Summary als sticky Sidebar (Desktop) / collapsible (Mobile)
4. Success-Handling für redirect-basierte Methoden (`?redirect_status=succeeded`)
5. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` als neue Env-Variable

**Phase C: Optional / Follow-up**
1. Express Checkout (Apple Pay / Google Pay Buttons oben)
2. Google Places Autocomplete für Adresseingabe
3. Letzte Lieferadresse speichern + pre-fill für Wiederkäufer
4. Alten Checkout-Session-Code entfernen

### Technische Details

**PaymentIntent statt Checkout Session:**
```typescript
stripe.paymentIntents.create({
  amount: Math.round(grandTotal * 100),
  currency: "eur",
  metadata: { order_group_id, user_id, customer_name, customer_email },
  payment_method_types: ["card", "paypal", "klarna", "bancontact", "eps", "link"],
  shipping: { name, address: { line1, city, postal_code, country } },
  receipt_email: customer_email,
})
// Returns client_secret → Frontend initialisiert PaymentElement
```

**PaymentElement Theme (VOD Dark):**
```typescript
appearance: {
  theme: "night",
  variables: {
    colorPrimary: "#d4a54a",
    colorBackground: "#1c1915",
    fontFamily: "DM Sans, sans-serif",
  }
}
```

### Bekannte Risiken & Gotchas
- **Amazon Pay:** Nicht kompatibel mit Payment Element — fällt weg (oder Hybrid-Ansatz nötig)
- **PayPal via Payment Element:** Erfordert PayPal Connect-Onboarding in Stripe — prüfen ob aktiv
- **Redirect-Methoden (PayPal/Klarna/EPS/Bancontact):** User wird redirected, `return_url` muss HTTPS sein, Success-Page muss `redirect_status` URL-Parameter handlen
- **PCI Compliance:** Bleibt SAQ-A — Stripe Elements rendert Kartenfelder in Iframes
- **Race Condition:** Pay-Button disablen während Shipping-Estimation läuft
- **Idempotency:** `idempotency_key` bei PaymentIntent-Erstellung verwenden (z.B. `order_group_id`)
- **Webhook Deduplizierung:** `stripe_payment_intent_id` wird schon bei Erstellung auf Transaction gesetzt — Webhook muss prüfen ob schon `paid`

### Dateien für Implementation
- **Fork-Basis:** `backend/src/api/store/account/checkout/route.ts` (Validierung + Shipping-Logik übernehmen)
- **Webhook:** `backend/src/api/webhooks/stripe/route.ts` (neue Event-Handler hinzufügen)
- **Frontend:** `storefront/src/app/account/checkout/page.tsx` (komplett umschreiben)
- **Stripe Client:** `backend/src/lib/stripe.ts` (ggf. Helpers erweitern)
- **Transaction Model:** `backend/src/modules/auction/models/transaction.ts` (keine Schema-Änderungen nötig)

### Rollback-Plan
Alter Checkout-Endpoint + `checkout.session.completed` Webhook bleiben bestehen. Bei Problemen: Storefront auf alte Checkout-Page zurückrollen, Backend braucht keine Änderung.

---

## Stripe Payment Integration (RSE-76)

**Stripe Account:** VOD Records (`acct_1T7WaYEyxqyK4DXF`)
**Dashboard:** https://dashboard.stripe.com (frank@vod-records.com)
**Mode:** Live (sk_live_... / whsec_...)
**Webhook URL:** https://api.vod-auctions.com/webhooks/stripe
**Events:** checkout.session.completed, checkout.session.expired
**Aktivierte Zahlungsmethoden:** Card, PayPal, Klarna, Bancontact (BE), EPS (AT), Link (Stripe One-Click), Amazon Pay

### Stripe API-Zugriff (via VPS)
```bash
# Auf VPS: Stripe-Key aus .env lesen und API abfragen
ssh root@72.62.148.205
STRIPE_KEY=$(grep STRIPE_SECRET_KEY ~/VOD_Auctions/backend/.env | head -1 | cut -d= -f2-)

# Letzte Zahlungen
curl -s https://api.stripe.com/v1/charges?limit=5 -u $STRIPE_KEY:

# Checkout Sessions
curl -s https://api.stripe.com/v1/checkout/sessions?limit=5 -u $STRIPE_KEY:

# Balance
curl -s https://api.stripe.com/v1/balance -u $STRIPE_KEY:

# Refunds
curl -s https://api.stripe.com/v1/refunds?limit=5 -u $STRIPE_KEY:

# Payment Intents
curl -s https://api.stripe.com/v1/payment_intents?limit=5 -u $STRIPE_KEY:

# Disputes/Chargebacks
curl -s https://api.stripe.com/v1/disputes?limit=5 -u $STRIPE_KEY:

# Payouts (Auszahlungen)
curl -s https://api.stripe.com/v1/payouts?limit=5 -u $STRIPE_KEY:

# Refund erstellen
curl -s https://api.stripe.com/v1/refunds -u $STRIPE_KEY: -d payment_intent=pi_xxx

# Tipp: | python3 -m json.tool  für lesbare Ausgabe
```

### Payment Flow (Combined Checkout — RSE-111)
1. Auktion endet → `auction-lifecycle.ts` markiert Items als `sold`
2. Gewinner kann:
   a) Einzeln bezahlen: `/account/wins` → Shipping-Zone → "Pay Now" (Legacy-Format)
   b) Direkt kaufen: Katalog → "Add to Cart" → `/account/cart` → `/account/checkout`
   c) Kombiniert bezahlen: `/account/checkout` → alle unbezahlten Gewinne + Cart-Items in einer Zahlung
3. POST `/store/account/checkout` erstellt:
   - `order_group_id` (ULID) → gruppiert alle Items
   - 1 Transaction pro Item (auction_win oder direct_purchase)
   - 1 Stripe Checkout Session mit N Line-Items + 1 Shipping Line
4. Redirect zu Stripe Hosted Checkout
5. Nach Zahlung: Stripe Webhook → alle Transactions mit order_group_id → `paid`, Direktkauf-Releases → `sold_direct`, Cart-Items gelöscht
6. Admin: Shipping-Status updaten via POST `/admin/transactions/:id`

### Shipping (RSE-103 — Weight-based, Admin-configurable)
- **Calculation:** Item weight (from format_group auto-mapping) + packaging weight → rate tier lookup
- **Oversized:** Vinyl LPs/10"/Reels (>25cm) → DHL Paket pricing; CDs/Cassettes → Deutsche Post pricing
- **Zones:** Germany (DE), EU (26 countries), Worldwide
- **Free Shipping:** Configurable threshold (admin setting)
- **Margin:** Configurable percentage added to calculated cost
- **Admin:** `/admin/shipping` — 5-tab config page (Settings, Item Types, Zones & Rates, Methods, Calculator)
- **Methods:** Per-zone carrier management with tracking URL patterns, 7 carrier templates (Deutsche Post, DHL, DPD, Hermes, GLS, Royal Mail, USPS)
- **Checkout:** Country dropdown → zone resolution → method selection (radio buttons if multiple) → shipping cost estimate
- **Tracking:** Clickable tracking links on orders/wins pages using `tracking_url_pattern.replace("{tracking}", tracking_number)`
- **Fallback:** Flat rates (DE €4.99, EU €9.99, World €14.99) if shipping tables not configured
- **DB Tables:** `shipping_item_type`, `shipping_zone`, `shipping_rate`, `shipping_config`, `shipping_method`
- **Order History:** `/account/orders` — grouped by order_group_id, cover thumbnails, expandable detail, progress bar

### Transaction Status
- `status`: pending → paid → refunded (oder failed)
- `shipping_status`: pending → shipped → delivered

### Key Files
- `backend/src/lib/shipping.ts` — Weight-based shipping calculator (RSE-103)
- `backend/src/lib/stripe.ts` — Stripe Client + Legacy Shipping-Rates Config
- `backend/src/lib/brevo.ts` — Brevo CRM REST API client (RSE-125)
- `backend/src/lib/crm-sync.ts` — Fire-and-forget CRM event sync (RSE-126)
- `backend/src/lib/auction-helpers.ts` — isAvailableForDirectPurchase()
- `backend/src/modules/auction/models/transaction.ts` — Transaction Model (block_item_id nullable, +release_id, +item_type, +order_group_id)
- `backend/src/modules/auction/models/cart-item.ts` — CartItem Model (user_id, release_id, price)
- `backend/src/api/store/account/cart/route.ts` — Cart CRUD (GET + POST)
- `backend/src/api/store/account/cart/[id]/route.ts` — Cart DELETE
- `backend/src/api/store/account/status/route.ts` — Account Status (cart_count)
- `backend/src/api/store/account/checkout/route.ts` — Combined Checkout (multi-item Stripe, customer name to Stripe/PayPal)
- `backend/src/api/webhooks/stripe/route.ts` — Webhook Handler (rawBody middleware, order_group_id, customer_name fallback)
- `backend/src/api/middlewares.ts` — Auth middleware + rawBodyMiddleware für Stripe Webhook
- `backend/src/api/store/account/transactions/route.ts` — Meine Transactions (LEFT JOIN)
- `backend/src/api/admin/transactions/` — Admin Transaction Management
- `storefront/src/components/DirectPurchaseButton.tsx` — "Add to Cart" Button
- `storefront/src/app/account/cart/page.tsx` — Warenkorb-Seite
- `storefront/src/app/account/checkout/page.tsx` — Combined Checkout-Seite
- `storefront/src/app/account/wins/page.tsx` — Pay-Button + Combined Checkout Banner

### Testing

**Test-Accounts:**
- `bidder1@test.de` / `test1234` (Customer: `cus_01KJPXG37THC2MRPPA3JQSABJ1`)
- `bidder2@test.de` / `test1234` (Customer: `cus_01KJPXRK22VAAK3ZPHHXRYMYQT`) — hat winning bid (Lot #1)
- `testuser@vod-auctions.com` / `TestPass123!` (Customer: `cus_01KJZ9AKFPNQ82QCNB3Q6ZX92T`) — hat winning bid (Lot #2), für Direktkauf-Tests

**Vorhandene Testdaten (DB):**
- Block: "Industrial Classics 1980-1985" (`01KJPSH37MYWW9MSJZDG58FT1G`, status: ended)
- Item Lot #1: Cabaret Voltaire — "1974 - 1976", €25.00 (`01KJPSJ04Z7CW37FY4E8KZ1SVJ`, sold, bidder2)
- Item Lot #2: release-4104, €15.00 (`01KJPSJ0BP5K9JH4EKARB6T3S3`, sold, testuser)
- Publishable Key: `pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d` (VOD Storefront)

**Payment-Test:** Login als `bidder2@test.de` → `/account/wins` → Shipping-Zone wählen → "Pay Now" → Stripe Checkout → Test-Karte

**Direktkauf-Test:** Login als `testuser@vod-auctions.com` → Katalog → Release mit sale_mode=direct_purchase/both → "Add to Cart" → `/account/cart` → `/account/checkout`
- Voraussetzung: Mindestens 1 Release mit sale_mode ≠ auction_only + direct_price > 0 (über Admin-Panel setzen)

```bash
# Lokal: Stripe CLI für Webhook-Forwarding
stripe listen --forward-to localhost:9000/webhooks/stripe

# Test-Karte
4242 4242 4242 4242 (beliebiges Datum/CVC)
```

### Bekannte Gotchas (RSE-76)
- **CamelCase Spalten:** Legacy-Tabellen (`Release`, `Artist`, `ReleaseArtist`) verwenden camelCase (`artistId`, `releaseId`, `createdAt`). Medusa/Auction-Tabellen verwenden snake_case (`block_item_id`, `user_id`, `created_at`).
- **ID-Generierung:** Medusa verwendet ULIDs als Text-IDs (kein auto-increment). Bei direktem Knex-Insert muss `id: generateEntityId()` mitgegeben werden.
- **Transaction Insert:** `generateEntityId()` aus `@medusajs/framework/utils` importieren — ohne ID schlägt der Insert mit `NOT NULL violation` fehl.
- **Webhook Raw Body:** Stripe-Signaturverifikation braucht den Raw Body. `bodyParser: false` allein reicht bei Medusa.js 2.x NICHT — Custom `rawBodyMiddleware` in `middlewares.ts` liest den Stream und speichert als `req.rawBody`. Webhook-Handler in `route.ts` liest `req.rawBody` mit Fallback-Kette. **NICHT ändern** — ohne diese Middleware scheitern ALLE Webhooks mit "No webhook payload was provided".
- **Checkout Customer Name:** `checkout/route.ts` holt `first_name` + `last_name` aus customer-Tabelle und übergibt an Stripe via `metadata.customer_name` + `payment_intent_data.description`. Ohne das zeigt PayPal kryptische ULIDs statt Kundennamen.

## Direct Purchase / Cart System (RSE-111)

**Konzept:** Alle eingeloggten Kunden können Artikel aus dem Katalog direkt kaufen. Alles wird in einem Combined Checkout bezahlt (Auktions-Gewinne + Warenkorb = eine Stripe-Zahlung, ein Versand).

### Verfügbarkeits-Logik
Ein Artikel ist direkt kaufbar wenn ALLE Bedingungen erfüllt:
- `sale_mode` = 'direct_purchase' ODER 'both'
- `direct_price` IS NOT NULL und > 0
- `auction_status` = 'available' (nicht reserviert/in Auktion)
- Nicht in einem aktiven/geplanten Auktions-Block
- Kunde ist eingeloggt (Authentifizierung)

### sale_mode Werte
- `auction_only` (default) — nur über Auktion verkaufbar
- `direct_purchase` — nur direkt kaufbar (kein Auktions-Listing)
- `both` — sowohl Auktion als auch Direktkauf möglich

### Combined Checkout Request
```json
{
  "items": [
    { "type": "auction_win", "block_item_id": "..." },
    { "type": "cart", "cart_item_id": "..." }
  ],
  "shipping_zone": "de|eu|world"
}
```
Backward-compat: Altes Format `{ block_item_id, shipping_zone }` wird intern konvertiert.

### Transaction-Erweiterung
- `block_item_id` — jetzt NULLABLE (Direktkäufe haben keins)
- `release_id` — NEU, für Direktkäufe
- `item_type` — 'auction' (default) | 'direct_purchase'
- `order_group_id` — gruppiert Items aus einem Checkout

### Bekannte Gotchas (RSE-111)
- **LEFT JOIN:** Transaction APIs verwenden LEFT JOIN statt INNER JOIN auf block_item/auction_block (Direktkäufe haben kein block_item_id)
- **COALESCE:** `COALESCE(block_item.release_id, transaction.release_id)` in Transaction-Queries
- **Versandkosten-Verteilung:** Bei Combined Checkout wird Versand proportional auf Items verteilt (letztes Item bekommt Rest wegen Rundung)
- **ID-Generierung:** `generateEntityId()` für cart_item und transaction (Medusa ULID-Pattern)

## Related Projects

- **[tape-mag-mvp](../VOD/tape-mag-mvp/)** — Shared Supabase DB, Release-Tabelle
- **[tape-mag-migration](../VOD/tape-mag-migration/)** — Legacy → Supabase Migration
- **[VOD_discogs](../VOD_discogs/)** — Discogs-Daten für Preisschätzungen
- **[Blackfire_service](../Blackfire_service/)** — Gleicher Tech-Stack (Next.js + Supabase)

## Credentials (Required)

Store in `.env` (git-ignored), manage via `Passwords/` directory:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase Anon Key
- `SUPABASE_PROJECT_ID` — Supabase Project ID (bofblwqieuvmqybzxapx)
- `SUPABASE_DB_URL` — Direct PostgreSQL Connection (für Migration-Scripts)
- `LEGACY_DB_*` — Legacy MySQL Credentials (nur für Migration)
- `STRIPE_SECRET_KEY` — Stripe API Key
- `STRIPE_WEBHOOK_SECRET` — Stripe Webhook Secret
- `UPSTASH_REDIS_REST_URL` — Redis URL
- `UPSTASH_REDIS_REST_TOKEN` — Redis Token
- `RESEND_API_KEY` — Resend Email API Key (Account: frank@vod-records.com)
- `BREVO_API_KEY` — Brevo CRM/Newsletter API Key (Account: VOD Records, free plan)
- `BREVO_LIST_VOD_AUCTIONS` — Brevo list ID for VOD Auctions customers (4)
- `BREVO_LIST_TAPE_MAG` — Brevo list ID for TAPE-MAG customers (5)
- `NEXT_PUBLIC_BREVO_CLIENT_KEY` — Brevo Tracker Client Key (Storefront, Automation > Settings)

## VPS Deployment

**Server:** 72.62.148.205 (Hostinger Ubuntu)
**SSH:** `ssh root@72.62.148.205`

**URLs:**
- Backend API: https://api.vod-auctions.com (Port 9000, nginx reverse proxy)
- Admin Dashboard: https://admin.vod-auctions.com (Port 9000, nginx reverse proxy, redirects / → /app)
- Storefront: https://vod-auctions.com (Port 3006, nginx reverse proxy)
- Clickdummy: https://vodauction.thehotshit.de (Port 3005, nginx reverse proxy)

**PM2 Prozesse:**
- `vodauction-backend` — Medusa.js Backend + Admin Dashboard
- `vodauction-storefront` — Next.js Storefront

**Deploy-Workflow (Backend + Admin):**
```bash
# Lokal: commit & push
cd VOD_Auctions && git add . && git commit -m "..." && git push

# Auf VPS:
ssh root@72.62.148.205
cd /root/VOD_Auctions && git pull
cd backend
npx medusa build                              # Backend + Admin UI kompilieren
rm -rf public/admin                           # Alten Cache löschen (WICHTIG! Sonst alte JS-Bundles)
cp -r .medusa/server/public/admin public/admin  # Admin-Assets kopieren
pm2 restart vodauction-backend
```

**Deploy-Workflow (Storefront):**
```bash
ssh root@72.62.148.205
cd /root/VOD_Auctions && git pull
cd storefront
npm run build
pm2 restart vodauction-storefront
```

**WICHTIG — Admin Build Gotcha:**
- `medusa build` legt Admin-Assets in `.medusa/server/public/admin/`
- `medusa start` erwartet sie in `public/admin/`
- Ohne `cp -r .medusa/server/public/admin public/admin` → 502 Bad Gateway!
- Vor einem Rebuild: `rm -rf public/admin` um alten Cache zu löschen

## Development

```bash
# Backend (Medusa.js 2.x)
cd VOD_Auctions/backend
npx medusa develop           # Start backend + admin dashboard (port 9000)
npx medusa user -e X -p Y    # Create admin user
npx medusa db:generate auction  # Generate migration for auction module
npx medusa db:migrate          # Run migrations

# Storefront (Next.js 16)
cd VOD_Auctions/storefront
npm run dev                  # Start storefront (port 3000)
npm run build                # Build for production

# Clickdummy (Next.js 16, standalone)
cd VOD_Auctions/clickdummy
npm run dev -- -p 3005       # Start clickdummy (port 3005)
npm run build                # Build for production

# API testen
curl http://localhost:9000/health
curl http://localhost:9000/store/auction-blocks -H "x-publishable-api-key: pk_..."
curl http://localhost:9000/admin/auction-blocks -H "Authorization: Bearer $TOKEN"
```

---

**Author:** Robin Seckler (rseckler@gmail.com)
