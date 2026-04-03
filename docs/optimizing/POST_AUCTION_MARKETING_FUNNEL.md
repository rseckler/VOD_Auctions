# Post-Auction Marketing Funnel — Konzept

**Ziel:** Nach einem Auktions-Gewinn den User dazu bewegen, weitere Artikel aus dem Direktkauf-Katalog zum Warenkorb hinzuzufügen, bevor er bezahlt — damit sich die (insbesondere internationalen) Portokosten besser rechnen.

**Kernaussage an den User:** *"Du zahlst bereits Versand — füge mehr hinzu, ohne dass die Versandkosten wesentlich steigen."*

**Technische Basis (bereits vorhanden):**
- Combined Checkout: Auction Wins + Cart Items in einem `order_group_id`
- Shipping auf Gesamtgewicht berechnet (nicht pro Artikel)
- 5 Tage Zahlungsfrist nach Auktions-Gewinn
- Stripe Checkout Session unterstützt Mixed Items

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        POST-AUCTION FUNNEL                         │
│                                                                     │
│  ① WIN                                                              │
│  User gewinnt Auktion                                              │
│       │                                                             │
│       ▼                                                             │
│  ② BID-WON EMAIL (mit Cross-Sell-Sektion)                          │
│  "Glückwunsch! Bevor du zahlst — schau dir diese passenden         │
│   Artikel an. Versand wird kombiniert!"                            │
│       │                                                             │
│       ▼                                                             │
│  ③ WINS PAGE (mit Shipping-Savings-Bar + Empfehlungen)             │
│  "Du zahlst €14.99 Versand nach US. Füge 3 Artikel hinzu          │
│   → Versand bleibt bei €14.99!"                                   │
│       │                                                             │
│       ▼                                                             │
│  ④ CATALOG BROWSING (mit Sticky "Your Wins"-Banner)               │
│  User stöbert im Katalog, sieht permanent seinen Win-Status       │
│       │                                                             │
│       ▼                                                             │
│  ⑤ COMBINED CHECKOUT (Shipping-Savings visuell hervorgehoben)      │
│  "3 Auction Wins + 2 Direct Purchases = 1 Versand"                │
│       │                                                             │
│       ▼                                                             │
│  ⑥ POST-PAYMENT (Bestätigung + nächste Auktion teaser)             │
│  "Deine Bestellung ist unterwegs. Nächste Auktion in 3 Tagen!"    │
│       │                                                             │
│       ▼                                                             │
│  ⑦ FOLLOW-UP EMAIL (48h nach Payment)                              │
│  "Während wir dein Paket packen — hier sind neue Artikel           │
│   die zu deiner Sammlung passen"                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Touchpoint 1: Bid-Won Email — Cross-Sell Sektion

**Aktuell:** Email zeigt nur den gewonnenen Artikel + "Complete Payment" CTA.

**Neu:** Unterhalb des CTA eine Sektion mit 3-4 empfohlenen Artikeln:

```
────────────────────────────────────────────
🎉 Congratulations! You won Lot #07

[Cover Image]  Cabaret Voltaire — Red Mecca
               Final Price: €45.00

       [ Complete Payment → ]

────────────────────────────────────────────
📦 COMBINE & SAVE ON SHIPPING

You're shipping to: United States (€14.99)
Add more items — shipping stays combined!

[Cover]  Throbbing Gristle — 20 Jazz...   €12.00
[Cover]  SPK — Leichenschrei               €18.00  
[Cover]  Einstürzende Neubauten — Koll...  €15.00

       [ Browse More Items → ]

────────────────────────────────────────────
⏰ Payment deadline: April 8, 2026
────────────────────────────────────────────
```

**Empfehlungs-Logik:**
1. Gleicher Artist (andere Releases)
2. Gleiches Label
3. Gleiches Format + ähnliches Jahr (±5 Jahre)
4. Releases die andere Gewinner des gleichen Blocks auch gekauft haben
5. Fallback: Meistgespeicherte Releases (saved_items)

**Wichtig:** Nur Releases mit `legacy_available = true AND legacy_price > 0` (kaufbar).

---

## Touchpoint 2: Wins Page — Shipping-Savings-Bar

**Aktuell:** Liste der Wins + "Pay Now" Buttons + Combined Checkout Banner.

**Neu:** Prominente **Shipping Savings Bar** oberhalb der Wins-Liste:

```
┌──────────────────────────────────────────────────────────┐
│  📦 SHIPPING TO: United States                    [Edit] │
│                                                          │
│  ██████████████████████░░░░░░  €14.99 Shipping           │
│                                                          │
│  Your wins: 2 items (680g)                               │
│  Shipping stays at €14.99 up to 2.000g                   │
│  → You can add 4-5 more vinyl records for FREE shipping! │
│                                                          │
│  [ Add Items from Catalog → ]    [ Pay Now → ]           │
└──────────────────────────────────────────────────────────┘
```

**Logik der Bar:**
- Zeigt aktuelles Gewicht der Wins vs. nächste Gewichtsstufe
- Berechnet wie viele typische Items (LP ~350g, CD ~120g) noch "reinpassen" bevor die nächste Stufe greift
- Progress-Bar visualisiert "Platz im Paket"
- Dynamisch basierend auf gewähltem Shipping-Land

**Darunter:** "Recommended for You" Grid (4-8 Artikel):

```
┌────────────────────────────────────────────────────────────┐
│  RECOMMENDED FOR YOU                                       │
│  Based on your wins and browsing history                   │
│                                                            │
│  [Card]  [Card]  [Card]  [Card]                           │
│  +Cart   +Cart   +Cart   +Cart                            │
│                                                            │
│  [ See All Recommendations → ]                             │
└────────────────────────────────────────────────────────────┘
```

**"+Cart" Button:** Fügt direkt zum Warenkorb hinzu, Wins-Seite aktualisiert die Shipping Bar sofort (Gewicht steigt, aber Versandkosten bleiben gleich → visuelles "Geschenk"-Gefühl).

---

## Touchpoint 3: Sticky "Unpaid Wins" Banner beim Catalog-Browsing

**Wenn User unbezahlte Wins hat** und im Katalog stöbert, zeigt sich ein dezenter Sticky Banner am unteren Bildschirmrand:

```
┌──────────────────────────────────────────────────────────┐
│  🏆 2 Auction Wins waiting · €63.00 + €14.99 shipping   │
│  Add to your shipment!                    [ View Wins → ]│
└──────────────────────────────────────────────────────────┘
```

- Nur sichtbar wenn `wins_count > 0` (unpaid wins)
- Verschwindet nach Payment
- Nicht aufdringlich: Am unteren Rand, kann weggeklickt werden
- "Add to Cart"-Buttons im Katalog zeigen kleinen Tooltip: "Will ship with your auction wins!"

---

## Touchpoint 4: Combined Checkout — Savings Highlight

**Aktuell:** Checkout zeigt alle Items + Gesamtpreis.

**Neu:** Explizite "You're Saving" Visualisierung:

```
┌──────────────────────────────────────────────────────────┐
│  ORDER SUMMARY                                            │
│                                                           │
│  🏆 Auction Wins (2)                                     │
│     Cabaret Voltaire — Red Mecca              €45.00     │
│     SPK — Leichenschrei                       €18.00     │
│                                                           │
│  🛒 Direct Purchases (2)                                 │
│     Throbbing Gristle — 20 Jazz Funk Greats   €12.00     │
│     Einstürzende Neubauten — Kollaps          €15.00     │
│                                                           │
│  ─────────────────────────────────────────────────────    │
│  Subtotal                                     €90.00     │
│  Shipping to US (1 package, 1.420g)           €14.99     │
│                                                           │
│  💰 You saved €29.97 on shipping!                        │
│     (vs. €14.99 × 3 if ordered separately)               │
│                                                           │
│  Total                                       €104.99     │
│                                                           │
│  [ Pay €104.99 → ]                                       │
└──────────────────────────────────────────────────────────┘
```

**Shipping-Savings-Berechnung:**
- `saved = (anzahl_items - 1) × basis_versandkosten` (vereinfacht)
- Oder exakt: Summe der Einzelversandkosten vs. kombinierte Versandkosten
- Nur anzeigen wenn Savings > 0

---

## Touchpoint 5: Post-Payment Confirmation

**Aktuell:** "Payment successful" + Order Details.

**Neu:** Zusätzlicher Block "Next Auction Preview":

```
┌──────────────────────────────────────────────────────────┐
│  ✅ Payment Successful!                                   │
│  Order VOD-ORD-000142 confirmed                          │
│                                                           │
│  We'll ship your 4 items together to United States.      │
│  Tracking number will be emailed within 2-3 business days│
│                                                           │
│  ─────────────────────────────────────────────────────    │
│                                                           │
│  🔥 COMING UP: Next Auction                              │
│                                                           │
│  "Belgian Cold Wave 1979-1986"                           │
│  Starting April 10 · 15 Lots · Preview available         │
│                                                           │
│  [ Preview Auction → ]   [ Save to Calendar → ]          │
│                                                           │
│  📬 Get notified when this auction starts                │
│  [ Enable Notifications → ]                               │
└──────────────────────────────────────────────────────────┘
```

---

## Touchpoint 6: Follow-Up Email (48h nach Payment)

**Trigger:** 48h nach `paid_at`, nur wenn User nicht bereits erneut bestellt hat.

```
Subject: "While we pack your order — new arrivals you might love"

────────────────────────────────────────────
Hi [Name],

Your order VOD-ORD-000142 is being prepared.

While you wait, check out these new additions 
to our catalog — matching your taste:

[4 Recommendations based on purchased items]

────────────────────────────────────────────
Next Auction: "Belgian Cold Wave 1979-1986"
Starts: April 10, 2026

[ Preview & Set Reminders → ]
────────────────────────────────────────────
```

---

## Empfehlungs-Engine

### Algorithmus (Prioritäts-Reihenfolge)

1. **Same Artist:** Andere Releases des gleichen Künstlers (höchste Relevanz)
2. **Same Label:** Releases vom gleichen Label
3. **Same Block:** Andere Lots aus dem gleichen Auktionsblock (nur bei Direktkauf verfügbar)
4. **Genre Match:** Releases mit überlappenden `genre_tags` aus `entity_content`
5. **Format Match:** Gleiches Format (LP → andere LPs) + ähnliches Jahr
6. **Collaborative:** "Andere Käufer aus dieser Auktion kauften auch..."
7. **Popular:** Meistgespeicherte/meistgebotene Releases (saved_items count)

### Backend API

```
GET /store/account/recommendations
  ?context=post_auction
  &release_ids=legacy-release-1234,legacy-release-5678
  &limit=8
  &exclude_owned=true

Response:
{
  "recommendations": [...releases with reason],
  "shipping_info": {
    "current_weight_g": 680,
    "current_cost": 14.99,
    "next_tier_weight_g": 2000,
    "items_until_next_tier": 4,
    "zone": "world"
  }
}
```

### Shipping-Savings API

```
GET /store/account/shipping-savings
  ?country=US
  
Response:
{
  "unpaid_wins": 2,
  "unpaid_wins_weight_g": 680,
  "cart_items": 0,
  "cart_weight_g": 0,
  "total_weight_g": 680,
  "shipping_cost": 14.99,
  "next_tier_at_g": 2000,
  "remaining_capacity_g": 1320,
  "estimated_items_capacity": 4,
  "savings_vs_individual": 14.99,
  "zone_slug": "world"
}
```

---

## Visuelle Gestaltung

### Design Principles
- **Gold-Akzent** für Savings-Elemente (€-Beträge, Progress-Bar)
- **Kein aggressives Upselling** — die Empfehlungen fühlen sich wie ein Service an ("Wir helfen dir, Versand zu sparen")
- **Shipping-Bar** nutzt das bestehende Progress-Bar-Pattern (wie Auction Countdown)
- **Recommendation Cards** im gleichen Stil wie Catalog-Cards (Cover + Artist + Titel + Preis + "Add to Cart")

### Farben
- Savings-Badge: Gold (#d4a54a) auf dunklem Hintergrund
- Progress-Bar: Gold-Gradient für "genutzt", muted für "verfügbar"
- "Add to Cart" Buttons: Primary Gold (wie Bid-Button)
- Sticky Banner: Semi-transparent dark (#1c1915/90%)

### Mobile
- Shipping-Bar wird kompakter (einzeilig mit expandable Detail)
- Recommendations: Horizontal Scroll (Swipeable Cards)
- Sticky Banner: Full-width am unteren Rand, 44px Touch-Target
- Checkout Savings: Collapsible Accordion

---

## Implementierungs-Phasen

### Phase A: Wins Page + Checkout (Kern-Funnel)
1. Shipping-Savings-Bar auf `/account/wins`
2. Recommendations Grid auf `/account/wins`
3. Savings-Highlight im Checkout
4. Backend: `/store/account/recommendations` + `/store/account/shipping-savings` API

### Phase B: Email + Sticky Banner
5. Bid-Won Email: Cross-Sell Sektion
6. Sticky "Unpaid Wins" Banner im Katalog
7. "Add to Cart" Tooltip im Katalog

### Phase C: Post-Payment + Follow-Up
8. Post-Payment: Next Auction Preview
9. Follow-Up Email (48h nach Payment)
10. Personalisierte Empfehlungen basierend auf Kaufhistorie

---

## Metriken & Tracking

| Event | Properties |
|---|---|
| `shipping_savings_bar_viewed` | zone, current_weight, capacity |
| `recommendation_viewed` | context (wins/email/checkout), position |
| `recommendation_clicked` | release_id, context, position |
| `recommendation_added_to_cart` | release_id, context |
| `shipping_savings_displayed` | saved_amount, items_count |
| `cross_sell_email_opened` | email_type (bid_won/follow_up) |
| `cross_sell_email_clicked` | release_id, email_type |
| `unpaid_wins_banner_clicked` | page (catalog/auction) |
| `unpaid_wins_banner_dismissed` | page |

**KPIs:**
- **Cross-Sell Rate:** % der Auction-Gewinner die auch Direktkäufe tätigen
- **Average Order Value:** Durchschnittlicher Bestellwert (Auction + Direct)
- **Items per Order:** Durchschnittliche Artikel pro order_group_id
- **Shipping Efficiency:** Versandkosten als % des Bestellwerts

---

## Backend Admin

### Dashboard-Sektion "Cross-Sell Performance"
- Cross-Sell Rate (letzte 30 Tage)
- Average Order Value mit/ohne Cross-Sell
- Top empfohlene Artikel (Klicks, Conversions)
- Shipping Savings total (was User gespart haben)

### Konfiguration in `/admin/config`
- Recommendations: Anzahl pro Touchpoint (Email: 4, Wins: 8, Checkout: 4)
- Shipping-Bar: Aktiviert ja/nein
- Sticky Banner: Aktiviert ja/nein
- Follow-Up Email: Delay in Stunden (default: 48)
- Follow-Up Email: Aktiviert ja/nein
