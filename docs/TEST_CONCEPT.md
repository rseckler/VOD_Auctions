# VOD Auctions — Test Concept

**Version:** 1.0
**Stand:** 2026-03-29
**Autor:** VOD Auctions Team

---

## 1. Scope & Ziele

Das Testkonzept definiert die Teststrategie für die VOD Auctions Plattform — eine Auktionsplattform für ~41.500 Industrial Music Tonträger.

**Testziele:**
- Sicherstellung der Kernfunktionalität vor jedem Release/Deployment
- Frühzeitige Erkennung von Regressionen
- Vertrauen in die Plattform vor dem Public Launch (RSE-77)
- Dokumentierter Nachweis der Qualität

---

## 2. Testarten

### 2.1 End-to-End Tests (E2E) — Playwright
**Tool:** Playwright 1.x (Chromium, headless)
**Scope:** Vollständige User Journeys aus Nutzerperspektive
**Ausführung:** Manuell + vor jedem VPS-Deployment
**Anzahl:** 64 Tests in 10 Spec-Dateien

### 2.2 Smoke Tests
**Scope:** Kritischste Happy-Path-Pfade (Catalog laden, Login, Bid abgeben)
**Ausführung:** Nach jedem Deployment (5-7 Tests, < 2 Minuten)
**Subset:** `--grep @smoke` Tag auf kritischen Tests

### 2.3 Manuelle Tests
**Scope:** UX, Design, Edge Cases, Payment-Flows mit echten Karten
**Zeitpunkt:** Vor jedem Release, nach größeren Features
**Protokoll:** TEST_RESULTS.md manuell ergänzen

---

## 3. User Journeys (15 Szenarien)

| # | Journey | Kritikalität | Status |
|---|---------|-------------|--------|
| J1 | Homepage + Password Gate | Critical | ✅ Implementiert |
| J2 | Catalog Browse + Filter | High | ✅ Implementiert |
| J3 | Registration (neuer User) | Critical | ✅ Implementiert |
| J4 | Login / Logout | Critical | ✅ Implementiert |
| J5 | Watchlist (Save/Unsave) | Medium | ✅ Implementiert |
| J6 | Auktion Discovery + Lot-Detail | High | ✅ Implementiert |
| J7 | Gebot abgeben | Critical | ✅ Implementiert |
| J8 | Überboten werden (Outbid) | High | ✅ Implementiert |
| J9 | Direktkauf → Warenkorb | High | ✅ Implementiert |
| J10 | Checkout → Shipping-Adresse | Critical | ✅ Implementiert |
| J11 | Stripe Payment (Test-Karte) | Critical | ✅ Implementiert |
| J12 | Order Confirmation | High | ✅ Implementiert |
| J13 | Invoice Download (PDF) | Medium | ✅ Implementiert |
| J14 | Admin: Block anlegen | High | ✅ Implementiert |
| J15 | Admin: Live Monitor | Medium | ✅ Implementiert |

---

## 4. Test-Infrastruktur

### 4.1 Verzeichnisstruktur
```
VOD_Auctions/
├── storefront/playwright.config.ts    # Playwright-Konfiguration
├── tests/
│   ├── helpers/
│   │   ├── auth.ts                    # Login/Register Hilfsfunktionen
│   │   └── stripe.ts                  # Stripe-Testcard-Helper
│   ├── 01-discovery.spec.ts
│   ├── 02-catalog.spec.ts
│   ├── 03-auth.spec.ts
│   ├── 04-watchlist.spec.ts
│   ├── 05-auction-browse.spec.ts
│   ├── 06-bidding.spec.ts
│   ├── 07-direct-purchase.spec.ts
│   ├── 08-payment.spec.ts
│   ├── 09-orders.spec.ts
│   ├── 10-admin.spec.ts
│   ├── TEST_RESULTS.md               # Ergebnisprotokoll
│   └── run-tests.sh                  # Ausführ-Script
└── package.json                       # Root-Scripts
```

### 4.2 Ausführung
```bash
# Alle Tests lokal (Storefront muss laufen)
cd VOD_Auctions
npm run test:e2e

# Nur Smoke Tests
cd storefront && npx playwright test --grep @smoke

# Gegen Production
BASE_URL=https://vod-auctions.com npm run test:e2e

# Mit UI (Debug-Modus)
npm run test:e2e:ui

# Report öffnen
npm run test:e2e:report
```

### 4.3 Ergebnis-Dashboard
Admin-UI unter `/app/test-runner` zeigt:
- Aktuellste Testergebnisse (JSON Report)
- Pass/Fail pro Spec-Datei
- Screenshot-Viewer für fehlgeschlagene Tests
- Manueller Testlauf-Trigger

---

## 5. Test-Accounts

| Account | Passwort | Zweck |
|---------|---------|-------|
| bidder1@test.de | test1234 | Bieter 1 |
| bidder2@test.de | test1234 | Bieter 2 (höheres Gebot) |
| testuser@vod-auctions.com | TestPass123! | Direktkauf-Tests |
| admin@vod.de | admin123 | Admin-Tests |

**Stripe Test-Karte:** `4242 4242 4242 4242` (beliebige Zukunft, beliebiger CVC)
**Password Gate:** `vod2026`

---

## 6. Environments

| Environment | URL | Zweck |
|-------------|-----|-------|
| Local | http://localhost:3000 | Entwicklung |
| Production | https://vod-auctions.com | Pre-Launch Tests |

---

## 7. Regression-Protokoll

Bei jedem Deployment:
1. `npm run test:e2e` lokal ausführen
2. Ergebnisse in TEST_RESULTS.md protokollieren
3. Bei Fehlern: Hotfix vor Deployment
4. Nach Deployment: Smoke Tests auf Production

---

## 8. Bekannte Einschränkungen

- **PayPal:** Kein automatischer E2E-Test (Sandbox nicht verfügbar ohne separate Credentials)
- **Email-Delivery:** Nicht automatisch testbar (externe Resend/Brevo APIs)
- **Realtime-Bidding:** Schwer automatisierbar; manuell testen mit zwei Browser-Tabs
- **PDF-Rechnungen:** Nur Download-Test, kein Inhalt-Parsing
