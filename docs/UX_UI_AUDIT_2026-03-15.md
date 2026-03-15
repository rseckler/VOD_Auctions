# VOD Auctions — UX/UI Audit Report

**Datum:** 2026-03-15
**Methode:** 4 parallele Analyse-Agents, jeweils spezialisiert auf einen Bereich
**Benchmark:** Shopify, Amazon, Zalando, Discogs, eBay
**Scope:** Gesamte Storefront (vod-auctions.com)

---

## Zusammenfassung

| Severity | Anzahl | Beschreibung |
|----------|--------|-------------|
| **CRITICAL** | 9 | Rechtliche Pflichten + Conversion-Blocker |
| **HIGH** | 28 | Trust-Verlust, fehlende Standard-Features |
| **MEDIUM** | 35 | Nice-to-have, UX-Verbesserungen |
| **LOW** | 31 | Polish, Feinschliff |

---

## 1. CHECKOUT & CART

### CRITICAL

| # | Problem | Detail | Standard-Referenz |
|---|---------|--------|-------------------|
| 1 | **Keine AGB/Widerrufs-Checkbox** | Deutsches Recht (BGB 305) verlangt explizite Zustimmung vor Kauf. AGB-Seite existiert, aber keine Consent-Mechanik im Checkout. | Shopify DE: Pflicht-Checkbox |
| 2 | **Keine Inline-Formvalidierung** | Adressfelder ohne `required`-Markierung, keine Inline-Fehlermeldungen, keine Pflichtfeld-Sterne. User weiß nicht was fehlt. | Shopify: Echtzeit-Validierung on blur |
| 3 | **Kein Order Review Step** | "Continue to Payment" erstellt sofort PaymentIntent. Kein Schritt "Bestellung prüfen" wo User Items, Adresse und Total bestätigt. | Amazon/Shopify: Dedizierter Review-Schritt |
| 4 | **Keine Billing-Adresse-Option** | Nur Shipping-Adresse. Kein "Rechnungsadresse = Lieferadresse" Toggle. B2B-Kunden und Geschenkkäufe blockiert. | Shopify: Toggle standardmäßig an |
| 5 | **Kein Versandkosten-Preview im Warenkorb** | Cart zeigt nur "Shipping calculated at checkout". Kein Country-Selector. Sticker-Shock bei Checkout. | Amazon: Estimated shipping im Cart |

### HIGH

| # | Problem | Detail |
|---|---------|--------|
| 6 | Kein Promo-/Rabattcode-Feld | Kein Gutschein- oder Geschenkkarten-Eingabefeld im Checkout |
| 7 | Success-Seite ohne Details | Kein Bestellnummer, kein Lieferdatum, keine Artikel-Zusammenfassung, keine "Nächste Schritte" |
| 8 | DirectPurchaseButton für Nicht-Eingeloggte unsichtbar | Button rendert `null` — kein "Login to buy" Prompt, kein Preis sichtbar |
| 9 | Kein Mini-Cart/Drawer nach Add-to-Cart | Toast ohne "View Cart" Link. Kein Slide-out Cart. |
| 10 | Cart: Raw `<img>` statt Next.js `<Image>` | Performance-Regression, keine WebP/AVIF |
| 11 | Cart: Silent Error bei Fetch-Fehler | Netzwerkfehler zeigt "Your cart is empty" statt Error-State |
| 12 | Cart: Kein "Continue Shopping" Link | Nur "Proceed to Checkout", kein Weg zurück |
| 13 | Cart: Kein Remove-Undo | Trash-Button löscht sofort ohne Undo-Option |
| 14 | Wins: Duale Zahlungswege verwirrend | Per-Item "Pay Now" (Redirect) vs Combined Checkout (Embedded) — zwei verschiedene Architekturen |
| 15 | Wins: Kein Zahlungs-Deadline | Keine "Zahlung innerhalb 7 Tagen" Anzeige |
| 16 | Orders: Keine Rechnungs-/Invoice-Download | Kein PDF-Download, kein "Rechnung herunterladen" |
| 17 | Orders: Bestellnummer ist ULID-Fragment | `#A1B2C3` statt lesbarer `VOD-ORD-00001` |

### MEDIUM

| # | Problem |
|---|---------|
| 18 | Kein Telefonnummer-Feld (Carrier brauchen oft Telefon) |
| 19 | Kein E-Mail-Feld im Checkout (immer Account-E-Mail) |
| 20 | Kein Print/E-Mail-Receipt auf Success-Seite |
| 21 | Order Summary Sidebar nicht collapsible auf Mobile |
| 22 | Kein Estimated Delivery Date |
| 23 | Cart: Kein MwSt/VAT-Hinweis |
| 24 | Cart: Kein "Save for Later" bei Cart-Items |
| 25 | Cart: Keine Condition-Info bei Artikeln |
| 26 | Stale Cart Detection fehlt (Item zwischenzeitlich verkauft) |
| 27 | Session-Expiry Handling fehlt im Checkout |

---

## 2. REGISTRATION & ACCOUNT

### CRITICAL

| # | Problem | Detail |
|---|---------|--------|
| 28 | **Keine AGB/Datenschutz-Checkbox bei Registrierung** | DSGVO-Pflicht: Explizite Zustimmung zu Datenschutz + AGB vor Kontoerstellung |
| 29 | **Keine Adressverwaltung** | Kein Address Book: Adressen hinzufügen, bearbeiten, löschen, Standard setzen |
| 30 | **Kein Account löschen** | DSGVO Art. 17 "Recht auf Löschung" — kein Button, keine Request-Option |

### HIGH

| # | Problem | Detail |
|---|---------|--------|
| 31 | Kein Passwort-Stärke-Indikator | Nur `minLength=6`, keine visuelle Rückmeldung |
| 32 | Kein Passwort-Bestätigungsfeld bei Registrierung | Tippfehler sperrt User aus |
| 33 | Keine E-Mail-Verifizierung | Fake/Tippfehler-E-Mails können sich registrieren |
| 34 | Profil nicht editierbar | Name, E-Mail als Read-Only. Kein "Bearbeiten" Button |
| 35 | Passwort ändern nicht implementiert | Placeholder "This feature will be available soon" |
| 36 | E-Mail ändern nicht möglich | Keine UI dafür |
| 37 | Token-Expiry-Handling fehlt | Abgelaufener Token → stille API-Fehler, User bleibt visuell eingeloggt |
| 38 | Auto-Logout bei Token-Expiry fehlt | Actions (Bid, Cart) schlagen still fehl |
| 39 | Kein "In Warenkorb" auf Saved Items | User muss zur Detailseite navigieren |

### MEDIUM

| # | Problem |
|---|---------|
| 40 | Login-Fehler könnten User-Existenz leaken |
| 41 | Kein Rate-Limiting Feedback bei Login |
| 42 | Kein Auto-Login nach Passwort-Reset |
| 43 | Keine Notification-Preferences (außer Newsletter) |
| 44 | Keine Cross-Tab Session-Synchronisation |
| 45 | Mobile Nav ohne Account-Unterseiten (nur "My Account") |
| 46 | Cart/Saved Icons fehlen im Mobile Hamburger |
| 47 | Kein Redirect zur beabsichtigten Aktion nach Login |
| 48 | Saved Items: Keine Preisänderungs-Benachrichtigung |

---

## 3. KATALOG & PRODUKTSEITEN

### HIGH

| # | Problem | Detail |
|---|---------|--------|
| 49 | **Keine Sortier-Optionen auf Katalog-Seite** | 41k Artikel ohne Sort nach Preis, Jahr, Neu. Nur hardcoded `sort=artist` |
| 50 | **Katalog komplett client-gerendert (SEO)** | `"use client"` — Google indexiert leere Seite. 41k Artikel nicht auffindbar |
| 51 | **Kein Product JSON-LD** | Detailseiten ohne Schema.org Product/Offer. Keine Google Rich Results |
| 52 | **Keine Swipe-Gesten in Bildergalerie (Mobile)** | Nur Thumbnails, kein Wischen. Core Mobile-UX fehlt |
| 53 | **Kein Sticky Add-to-Cart/Bid auf Mobile** | User scrollt an Preis vorbei, muss zurückscrollen |
| 54 | **Keine Proxy-Bid-Erklärung** | Maximum Bid Feature ohne Erklärung was es tut |
| 55 | **Kein Outbid-Notification Opt-in** | Keine UI zum Aktivieren von Outbid-Benachrichtigungen |
| 56 | **Kein MwSt/Versand-Hinweis auf Preisen** | PAngV-Pflicht: "inkl. MwSt., zzgl. Versand" |

### MEDIUM

| # | Problem |
|---|---------|
| 57 | Keine Such-Autocomplete/Suggestions |
| 58 | Kein Grid/List View Toggle |
| 59 | Pagination ohne Seitenzahlen (nur Vor/Zurück bei 1700+ Seiten) |
| 60 | Kein Image-Zoom on Hover |
| 61 | Breadcrumb verliert Filter-State |
| 62 | Kein Stock/Availability Indicator |
| 63 | Countdown auf Block-Detail nicht prominent genug |
| 64 | Kein User-Bid-Status-Indikator ("Du bist Höchstbietender") |
| 65 | Auktions-Item-Cards ohne Countdown |
| 66 | Filter-Pills sollten horizontal scrollen auf Mobile |
| 67 | "No results" ohne alternative Vorschläge |
| 68 | Suche erfordert expliziten Submit (inkonsistent mit Auto-Filtern) |

---

## 4. HEADER, FOOTER & NAVIGATION

### CRITICAL

| # | Problem | Detail |
|---|---------|--------|
| 69 | **Keine Suchleiste im Header** | 41.500 Produkte, User muss erst zu `/catalog` navigieren. Jeder große Shop hat Header-Suche. |

### HIGH

| # | Problem | Detail |
|---|---------|--------|
| 70 | Cart/Saved Icons für anonyme User unsichtbar | Kein Hinweis auf Warenkorb-/Merken-Funktion für Besucher |
| 71 | Mobile Nav ohne Cart/Saved Links | Hamburger-Menü zeigt nicht Cart/Saved/Orders |
| 72 | Keine Zahlungsmethoden-Icons im Footer | Visa/MC/PayPal/Klarna Badges fehlen — wichtigstes Trust-Signal |
| 73 | Kein Newsletter-Signup im Footer | Brevo-Integration existiert, aber kein Footer-Formular |
| 74 | Keine Social Media Links | Keine Icons/Links zu Instagram, Facebook, Discogs |
| 75 | Cookie-Consent: Kein Widerruf möglich (DSGVO Art. 7(3)) | Nur "Clear your cookies" Anweisung, kein Re-Open Button |
| 76 | Keine Custom 404-Seite | Default Next.js 404 ohne Branding/Navigation |
| 77 | Keine Loading-Skeletons für Katalog-Seiten | Blank screen während Navigation bei 41k Artikeln |
| 78 | Kein Skip-to-Content Link (Accessibility WCAG 2.1 AA) | Keyboard/Screenreader-User müssen durch Header tabben |

### MEDIUM

| # | Problem |
|---|---------|
| 79 | Keine aktive Nav-Link-Markierung |
| 80 | Kein Back-to-Top Button |
| 81 | Keine Kontaktinfo im Footer (nur in Impressum) |
| 82 | AGB-Versandkosten veraltet (Flat-Rate statt gewichtsbasiert) |
| 83 | Datenschutz: Google Fonts Sektion inakkurat (next/font = self-hosted) |
| 84 | Global Error Page ungestylt |
| 85 | Keine Per-Route Error Boundaries |
| 86 | Fehlende ARIA Landmarks + Focus Indicators |
| 87 | Kein "Secure Checkout" Badge/Messaging |
| 88 | Rückgaberecht nicht prominent auf Produktseiten |

---

## 5. ACCESSIBILITY (übergreifend)

| # | Severity | Problem |
|---|----------|---------|
| 89 | **HIGH** | Kein Skip-to-Content Link |
| 90 | **HIGH** | Leere `alt=""` auf allen Produkt-Bildern (sollte Artist + Titel enthalten) |
| 91 | **MEDIUM** | Keine Focus-Indicators auf Links/Buttons (außer Avatar) |
| 92 | **MEDIUM** | Keine `aria-expanded`/`aria-controls` auf Expand/Collapse Buttons |
| 93 | **MEDIUM** | Toast-Notifications unklar ob `role="alert"` gesetzt |
| 94 | **LOW** | Cart/Saved Badge-Counts nicht screen-reader-announced |
| 95 | **LOW** | Lightbox Touch-Targets unter 44px |

---

## Top 10 Empfehlungen (Business-Impact priorisiert)

| Prio | Änderung | Aufwand | Impact |
|------|----------|---------|--------|
| **1** | AGB-Checkbox + Widerrufs-Referenz im Checkout + bei Registrierung | Klein | **Rechtspflicht** — ohne das kein gültiger Kaufvertrag |
| **2** | MwSt/Versand-Hinweis auf allen Preisen ("inkl. MwSt., zzgl. Versand") | Klein | **PAngV-Pflicht** — Abmahngefahr |
| **3** | Checkout Formvalidierung + Order Review Step | Mittel | Conversion-Killer |
| **4** | Suchleiste im Header (Overlay/Dropdown) | Mittel | Discovery für 41k Produkte |
| **5** | Zahlungsmethoden-Icons im Footer + "Secure Checkout" | Klein | Trust-Signal #1 |
| **6** | Account löschen (DSGVO) + Profil editierbar + Passwort ändern | Mittel | Rechtspflicht + Basic Account |
| **7** | Mobile: Swipe-Gallery + Sticky Add-to-Cart/Bid | Mittel | 60%+ Traffic ist Mobile |
| **8** | Product JSON-LD + Catalog SSR für SEO | Groß | Google Rich Results + Indexierung |
| **9** | Custom 404 + Loading Skeletons + Cookie Consent Widerruf | Klein | Professioneller Eindruck + DSGVO |
| **10** | Newsletter-Signup im Footer + Social Links | Klein | Kundenbindung |

---

## Bereits erledigt (heute, 2026-03-15)

- [x] Checkout: Shopify-Style One-Page mit Stripe Payment Element (Phase A+B)
- [x] Checkout: Step-Indicators (Step 1/2/3 of 3)
- [x] Checkout: First Name / Last Name statt Full Name
- [x] Checkout: Alle Zahlungsmethoden sichtbar (Link deaktiviert)
- [x] Checkout: PayPal → Tracked Shipping erzwungen
- [x] Checkout: Shipping als eigene prominente Card
- [x] Checkout: Success State mit "View Orders" Link
- [x] Checkout: Kundenname an Stripe/PayPal übergeben
- [x] Checkout: Optimistisches Cart-Clearing nach Zahlung
- [x] Checkout: Adresse auf Customer gespeichert + Pre-fill
- [x] Checkout: Adresse an Brevo CRM gesynct
- [x] Stripe Webhook Raw Body Fix (Root Cause für 5 Issues)
- [x] Admin: Kundenname + E-Mail in Transaktionen
- [x] Password Reset ("Forgot Password?" Flow)

---

## Nächste Schritte

Die Empfehlungen 1-3 (Rechtliche Pflichten + Checkout-Validierung) sollten **vor dem Launch** umgesetzt werden. Die übrigen können iterativ nach Launch angegangen werden.
