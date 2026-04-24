# Frontend & Indirect-Paths Pricing Cleanup — Implementation Plan

**Status:** Vorschlag — wartet auf Freigabe
**Datum:** 2026-04-24
**Scope:** rc47.2/rc47.3-Konformität in Storefront + 3 indirekten Pfaden, die noch `legacy_price` leaken
**Referenz:** [`docs/architecture/PRICING_MODEL.md`](../architecture/PRICING_MODEL.md)

---

## 0. Regel (aus PRICING_MODEL.md)

```
Storefront anzeigen/verkaufen:
    effective_price = shop_price
                      (NIE Fallback auf legacy_price)

Shop-Visibility-Gate:
    is_purchasable = shop_price > 0 AND verified inventory AND legacy_available

Label-Druck (Backend-only):
    COALESCE(exemplar_price, shop_price, legacy_price)

Auction-Start-Preis (rc47.3, Admin-only):
    shop_price > 0 ? shop_price : estimated_value > 0 ? estimated_value : legacy_price > 0 ? legacy_price : 400
```

**Prinzip:** `legacy_price` darf nirgends mehr im Customer-Facing UI als Preis gerendert werden. Auch nicht "informational / labeled historical". Einzige Ausnahme: Admin-Detail-Seite (Info-Feld neben Verify-Formular).

---

## 1. Ist-Zustand — Was ist kaputt

### 1a. Storefront-Pages (direkter Customer-Impact)

| Datei | Zeile | Problem |
|---|---|---|
| `storefront/src/app/account/saved/page.tsx` | 185 | `item.shop_price \|\| item.legacy_price` — Fallback verboten |
| `storefront/src/app/account/wins/page.tsx` | 563 | Rendert `rec.legacy_price` (Recommendations-Section) |
| `storefront/src/app/auctions/[slug]/[itemId]/page.tsx` | 392 | Zeigt `legacy_price` mit Label "Catalog Price" im Bid-Flow |

### 1b. Backend-Endpoints, die falsche Felder liefern

| Datei | Zeile | Problem |
|---|---|---|
| `backend/src/api/store/account/saved/route.ts` | 30-32 | Liefert `shop_price` + `legacy_price`, aber kein `effective_price` / `is_purchasable` — kein `enrichWithShopPrice()` |
| `backend/src/api/store/account/recommendations/route.ts` | 39, 56, 74, 89, 110, 131 | Filtert `WHERE legacy_price > 0`, liefert `legacy_price` als Preisfeld |

### 1c. Admin-Side (rc47.3-Kette noch aktiv)

| Datei | Zeile | Problem |
|---|---|---|
| `backend/src/api/admin/auction-blocks/[id]/items/bulk-price/route.ts` | 150-175 | `shop_price_percentage`-Rule hat `legacy_price`-Fallback per Doc — siehe §5 |
| `backend/src/lib/validation.ts` | 25-27 | Dokumentiert dieselbe Fallback-Kette |
| `backend/src/api/admin/auction-blocks/[id]/items/route.ts` | POST-Handler | Server-Default nutzt dieselbe Kette |

### 1d. Pfade die **sauber** sind (nur zur Bestätigung, kein Fix nötig)

- Payment-Flow (Stripe + PayPal): `cart_item.price` (aus `shop_price`) + `block_item.current_price` → `transaction.amount`
- Invoice-PDF: liest `transaction.amount` / `transaction.total_amount`
- Webhook-Handler (Stripe + PayPal): keine Preis-Neuberechnung
- Email-Templates (Payment-Confirmation etc.): interpolieren vorberechnete `transaction.amount`
- GDPR-Export: `transaction.amount`
- Shipping: gewichtsbasiert, kein Preis-Input
- Brevo-Newsletter: liest nur `block_item.start_price` als Metadaten-Kontext
- Storefront-Catalog (Meili + Postgres), Band/Label/Press-Pages, Cart-Endpoint, JSON-LD Schema.org, CatalogClient, CatalogRelatedSection — **alle korrekt**

---

## 2. Entscheidungen (aus Deinem letzten Feedback)

1. **`/store/account/saved`** → Option (a): nur `effective_price`. Kein `legacy_price`-Fallback. Items ohne `effective_price` bleiben in der Liste (User hat sie gemerkt), aber ohne Preis-Tag und ohne Add-to-Cart-Button.
2. **`/store/account/recommendations`** → Option (b): Filter auf `is_purchasable = true`. Empfehlung zeigt nur kaufbare Items, Preis-Display via `effective_price`.
3. **Auction-Detail-Seite** → kein `legacy_price`, kein Discogs. Nur der aktuelle Bid-Preis + der aus Admin berechnete `start_price` (= 50 % × shop_price wie rc47.3 definiert). Nur verifizierte Items.
4. **Indirekte Pfade** → Payment/Invoice/Email/GDPR geprüft, alle sauber. Einziger Rest: Admin-Side-Auction-Startpreis-Fallback-Kette — siehe §5.

---

## 3. Konkrete Änderungen

### 3a. Backend

#### 3a.1. `backend/src/api/store/account/saved/route.ts`
- Entferne `"Release.legacy_price"` aus SELECT
- Füge `"Release.sale_mode"`, `"Release.legacy_available"` hinzu (für `enrichWithShopPrice`)
- Nach der Query: `rows = await enrichWithShopPrice(pg, rows)`
- Response shipt nun `effective_price`, `is_purchasable`, `is_verified`

**Semantik:** Saved-Liste enthält weiterhin ALLE gemerkten Items (auch solche ohne Shop-Preis) — nur die Preis-/Cart-Anzeige hängt am `is_purchasable`-Flag.

#### 3a.2. `backend/src/api/store/account/recommendations/route.ts`
- Entferne `.where("Release.legacy_price", ">", 0)`
- Füge Filter hinzu: über `enrichWithShopPrice()` + post-filter `rows.filter(r => r.is_purchasable)` **oder** SQL-Level `WHERE shop_price > 0 AND EXISTS(verified erp_inventory_item)` + `legacy_available = true` (identisch zum Meili-Filter)
- Type `Recommendation`: `legacy_price: number` → `effective_price: number; is_purchasable: boolean`
- Alle vier Queries (lines 89, 110, 131) mit Helper-Call
- **Edge-Case:** Wenn Filter auf `is_purchasable` zu wenige Ergebnisse liefert (z.B. User hat Category bespielt wo nur 2 verified-Items sind), was ist Fallback?
  - **Vorschlag:** strikter Filter, weniger Empfehlungen besser als falsche. Wenn Liste <3 Items, UI zeigt "Nothing to recommend yet" statt Auffüllen.

#### 3a.3. `backend/src/api/admin/auction-blocks/[id]/items/bulk-price/route.ts` (Frage — siehe §5)

### 3b. Storefront

#### 3b.1. `storefront/src/app/account/saved/page.tsx:185`
- `const price = item.shop_price || item.legacy_price` →
- `const price = item.effective_price`
- Add-to-Cart-Button nur wenn `item.is_purchasable` true
- Price-Tag nur wenn `price !== null`
- Type-Update (lokaler SavedItem-Type): `shop_price`/`legacy_price` raus, `effective_price`/`is_purchasable`/`is_verified` rein

#### 3b.2. `storefront/src/app/account/wins/page.tsx:563`
- `{rec.legacy_price}` → `{rec.effective_price}` (nur wenn nicht NULL)
- Type `Recommendation`-Interface (L45) entsprechend angepasst
- Empfehlungs-Card bekommt dieselbe Struktur wie Catalog-Grid-Card (mit `is_purchasable`-Gate für CTA)

#### 3b.3. `storefront/src/app/auctions/[slug]/[itemId]/page.tsx:392`
- Kompletter Entfernung der "Catalog Price"-Row
- Ersatz: keine Info über `legacy_price`/`discogs_*`. Die UI zeigt nur die Auction-Werte (current bid, start_price, min-increment, bid history).
- **Optional** (separate Entscheidung): Anzeige "Shop-Price" (= `effective_price` aus Release-Daten) mit Label "Auch direkt kaufbar für €X" wenn das Release `is_purchasable=true` ist und `sale_mode in ('direct_purchase', 'both')`. Das wäre ein NEUES Feature — nicht Teil dieses Plans, nur als potenzielles Follow-up.
- Parent Release-Query sollte `effective_price`/`is_purchasable` mitbringen (nicht nur `legacy_price`)

#### 3b.4. Auction-Listen-Seiten prüfen
Vor Merge: grep nach `legacy_price` / `discogs_lowest_price` im gesamten `storefront/src/app/auctions/` — stelle sicher dass kein anderer Auction-Pfad ähnliche Legacy-Anzeige hat.

#### 3b.5. Meta-Code: `storefront/src/types/index.ts`
- Kommentar über dem Preis-Block ergänzen: Verweis auf `docs/architecture/PRICING_MODEL.md`
- Optional: `legacy_price` & `discogs_*_price` als `@deprecated` markieren (bleibt in Type für Backend-Response-Backwards-Compat, aber Warnung bei Nutzung im Storefront-Code)

### 3c. Backend-Doku
- `docs/architecture/PRICING_MODEL.md` ergänzen:
  - §Shop-Visibility-Gate: Bullet hinzufügen für `/store/account/saved` und `/store/account/recommendations`, damit in Zukunft jeder Wartungs-Dev weiß, dass diese beiden Endpoints auch via `enrichWithShopPrice()` gehen müssen.
  - §Historische Anmerkungen: kurzer Eintrag "rc49.6 (2026-04-24): saved + recommendations + auction-detail-page cleaned up"

---

## 4. Risiken & Edge Cases

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| Saved-Liste zeigt plötzlich kein Preis mehr für Items die vor rc47.2 gemerkt wurden | Mittel — manche alte Items haben `shop_price=NULL` | By Design: kein Preis-Tag + kein Cart-Button. User sieht "Added to list" Marker, kann Detail öffnen |
| Recommendations-Endpoint liefert 0-3 Empfehlungen statt 6-10 | Mittel | UI-Fallback: "No recommendations yet" statt leere Row; falls nötig Filter-Lockerung in Follow-up |
| Auction-Page wirkt "leerer" ohne Catalog-Price | Niedrig | Option 3b.3 Optional für Future-Follow-up |
| Cart-Snapshot-Preise (schon gespeichert) | Keine | `cart_item.price` ist Snapshot aus Add-Zeit, bleibt korrekt |
| Alte Orders in `/account/orders` zeigen alte Preise | Keine | liest `transaction.amount`, Snapshot-basiert, nicht betroffen |
| Newsletter mit Preis-Interpolation | Keine | nutzt bereits `transaction.amount`/`block_item.start_price`, nicht `legacy_price` |

---

## 5. Offene Fragen (vor Implementierung zu klären)

**F1. Admin-Auction-Start-Preis-Kette (rc47.3-Doku):**

Die `PRICING_MODEL.md` §Phase 2 dokumentiert explizit:
> `base = shop_price > 0 ? shop_price : estimated_value > 0 ? estimated_value : legacy_price > 0 ? legacy_price : 400 Fehler`

Im Admin-Bulk-Price-Handler (`backend/src/api/admin/auction-blocks/[id]/items/bulk-price/route.ts`) ist das heute genau so implementiert. Dein Feedback "auch hier nur noch verifeyd Preise" könnte bedeuten:

- **Option 1** (strikter): `legacy_price`-Fallback entfernen. Items ohne `shop_price` > 0 UND ohne `estimated_value` > 0 → `skipped` mit Grund "no verified price". Doku-Update nötig.
- **Option 2** (Status Quo): Fallback-Kette bleibt wie dokumentiert (rc47.3), weil "Auction-Start-Preis ist Admin-seitig, nicht Customer-Facing — und es geht um initialen Start-Preis, nicht Verkaufspreis". Storefront-Customer sieht ja nur den aktuellen Bid und den `start_price` (der dann rechnerisch ggf. aus legacy kommt, aber kein UI-Label "legacy" trägt).

Welche Option? Meine Empfehlung: **Option 2** — die Admin-Kette bleibt wie dokumentiert, weil (a) rc47.3 genau so ausgerollt wurde, (b) Admin-Usage ist ein separater Vertrauenspfad, (c) der Storefront-Customer sieht sowieso nur den Bid-Preis, nicht den Ursprung des `start_price`.

**F2. Scope der Recommendations-Logik:**

Wir ändern Filter von `legacy_price > 0` auf `is_purchasable = true`. Die Recommendations waren bisher "zeige Items mit bekanntem Preis aus ähnlichen Categories". Mit dem strikteren Filter wird Recommendations zu "zeige Items die der User SOFORT kaufen könnte". Ist das die gewünschte Semantik? Oder sollen Empfehlungen auch in-Auction-only-Items enthalten (dann Filter eher `shop_price > 0 OR auction_status = 'in_auction'`)?

Meine Empfehlung: **`is_purchasable = true`** (kaufbar + verifiziert, wie in der Doc definiert). Empfehlungen ohne Kauf-CTA sind tote Clicks.

**F3. Auction-Detail-Seite: Shop-Price-Hinweis?**

Teil 3b.3 Optional: Soll die Auction-Page zeigen "Auch direkt kaufbar für €X" wenn `is_purchasable=true` und `sale_mode='both'`? Das wäre ein zusätzlicher CTA-Pfad (Customer kann statt bieten auch direkt kaufen). Nicht Scope dieses Plans — aber falls gewünscht, markiere ich als Follow-up-Task.

---

## 6. Reihenfolge & Umsetzungs-Schritte

1. **Phase 1 — Backend (30 min)**
   - Edit `saved/route.ts`: enrichment + SELECT-Erweiterung
   - Edit `recommendations/route.ts`: Filter + Helper + Type
   - Lokaler Smoke-Test (via curl mit Test-Account-Cookie)

2. **Phase 2 — Frontend (30 min)**
   - Edit `saved/page.tsx`: Price-Logik + Add-to-Cart-Gate
   - Edit `wins/page.tsx`: Recommendation-Rendering
   - Edit `auctions/[slug]/[itemId]/page.tsx`: Catalog-Price-Row entfernen
   - Edit `storefront/src/types/index.ts`: Kommentar + optional @deprecated-Markers

3. **Phase 3 — Grep-Pass (10 min)**
   - `grep -rn "legacy_price\|discogs_lowest_price" storefront/src/` → sollte 0 Customer-Facing-Matches zeigen (nur Type-Definitionen + informational-Fallback-Dead-Code)

4. **Phase 4 — Deploy (10 min)**
   - Backend: `rm -rf node_modules/.vite .medusa && npx medusa build && pm2 restart vodauction-backend`
   - Storefront: `npm run build && pm2 restart vodauction-storefront`
   - Manuelle UI-Smoke-Tests:
     - Saved-Liste: Item mit Preis + Item ohne Preis
     - Wins/Recommendations: Zeigt nur kaufbare Items
     - Auction-Detail: keine "Catalog Price"-Row mehr

5. **Phase 5 — Docs (10 min)**
   - `PRICING_MODEL.md`: Ergänzung zu saved/recommendations
   - `CHANGELOG.md`: Eintrag rc49.6
   - `gh release create` optional

6. **Phase 6 — Verifikation (5 min)**
   - Nach 30-60 min: `/admin/media`-Detail und `/admin/system-health` quer-prüfen — nichts sollte mehr `legacy_price` in Customer-Facing-Responses zurückgeben

**Gesamt:** ~90-100 min inkl. Deploy + Smoke-Tests.

---

## 7. Nicht-Ziele

- Keine Änderung an Cart/Checkout/Payment/Webhook (alles bereits korrekt per Explore-Audit)
- Keine Änderung an Invoice-PDF-Generator
- Keine Änderung an Email-Templates
- Keine Änderung an Meilisearch-Index-Schema (schon richtig)
- Keine Löschung der `legacy_price`-Spalte aus DB oder Types (wird backend-intern noch gebraucht: defensiver Mirror, Label-Pipeline-Fallback, historische Anmerkung)
- Keine Admin-UI-Anpassung (Admin-Detail-Seite zeigt `legacy_price` weiter als Info-Feld — laut Doc gewollt)

---

## 8. Freigabe-Bedürftig

Bitte bestätige:

1. **F1 (Admin-Auction-Kette):** Option 1 (legacy raus aus Fallback) oder Option 2 (Status Quo per Doc)?
2. **F2 (Recommendations-Filter):** `is_purchasable = true` als Hauptfilter — OK?
3. **F3 (Shop-Price auf Auction-Page):** Ignorieren für jetzt (nicht im Plan) oder als Follow-up-Ticket aufnehmen?
4. **Scope-OK:** Die 5 Code-Stellen (2 Backend, 3 Frontend) + Doku — komplett oder fehlt was?

Nach Freigabe setze ich Phase 1-6 direkt um.
