# Plan: Sharing-Funktionen für VOD Auctions

## Ziel

Artikel (Catalog Detail) und Auction Items sollen einfach geteilt werden können — per Social Media, Messenger, E-Mail oder Link-Kopie.

---

## Ist-Zustand

- **OG-Tags vorhanden:** Beide Detail-Seiten (`catalog/[id]`, `auctions/[slug]/[itemId]`) haben bereits `generateMetadata` mit `openGraph` (title, description, image) und `twitter:card` — Link-Previews funktionieren also bereits
- **Keine Sharing-Funktionen:** Kein Share-Button, kein Copy-Link, keine Social-Share-Links
- **UI-Kontext:** Neben dem Titel gibt es bereits einen `SaveForLaterButton` (Heart-Icon, 44×44px). Der Share-Button passt daneben

---

## Empfohlener Ansatz: Hybrid (Web Share API + Fallback)

### Warum?

| Ansatz | Pro | Contra |
|--------|-----|--------|
| **Web Share API** (`navigator.share`) | Native OS-Sharing (alle installierten Apps), sauber auf Mobile | Kein Firefox Desktop, kein älteres Safari Desktop |
| **Social-Share-Links** (WhatsApp, X, Facebook, etc.) | Funktioniert überall, gezielt steuerbar | Manuell pro Plattform, Dropdown nötig |
| **Hybrid (empfohlen)** | Mobile → native Share Sheet, Desktop → Dropdown mit Optionen | Minimal mehr Code |

**Referenz-Plattformen:**
- **eBay:** Share-Icon rechts oben → Dropdown (Copy Link, Facebook, X, Pinterest, Email)
- **Discogs:** Share-Button → Dropdown (Facebook, Twitter, Email, Copy Link)
- **Catawiki:** Share-Icon neben Watchlist → Native Share (Mobile) / Dropdown (Desktop)

→ VOD Auctions folgt dem **Catawiki/eBay-Pattern**: Icon-Button neben Save-Heart, Mobile = native, Desktop = Dropdown.

---

## Komponenten-Design

### `ShareButton` Komponente

**Verhalten:**
1. **Mobile (navigator.share verfügbar):** Klick öffnet natives OS-Share-Sheet
2. **Desktop (Fallback):** Klick öffnet Dropdown-Menü mit Optionen

**Share-Optionen (Desktop Dropdown):**
1. **Copy Link** — `navigator.clipboard.writeText(url)` → Toast "Link copied!"
2. **WhatsApp** — `https://wa.me/?text={title}%20{url}`
3. **X (Twitter)** — `https://twitter.com/intent/tweet?url={url}&text={title}`
4. **Facebook** — `https://www.facebook.com/sharer/sharer.php?u={url}`
5. **Telegram** — `https://t.me/share/url?url={url}&text={title}`
6. **E-Mail** — `mailto:?subject={title}&body={url}`

**Design:**
- Icon: `Share2` (Lucide) — 44×44px rounded Button, gleicher Stil wie SaveForLaterButton
- Platzierung: Rechts neben dem Heart-Icon, neben dem Titel
- Dropdown: Dark-themed, passt zum VOD Auctions Design (bg-card, border-border)

---

## Implementierungs-Plan

### Schritt 1: `ShareButton` Client-Komponente erstellen

**Datei:** `storefront/src/components/ShareButton.tsx`

- Props: `url: string`, `title: string`, `text?: string`
- Verwendet `navigator.share` wenn verfügbar (Mobile)
- Fallback: Dropdown mit 6 Optionen (Copy, WhatsApp, X, Facebook, Telegram, Email)
- Dropdown schließt bei Klick außerhalb (useEffect + ref)
- Toast-Feedback bei "Copy Link"
- Social-Links öffnen in neuem Tab (`window.open`)

### Schritt 2: Integration in Catalog Detail Page

**Datei:** `storefront/src/app/catalog/[id]/page.tsx`

- ShareButton neben SaveForLaterButton (im `flex items-start gap-3` Container)
- URL: `https://vod-auctions.com/catalog/{id}`
- Title: `{artist} — {title}` oder nur `{title}`

### Schritt 3: Integration in Auction Item Detail Page

**Datei:** `storefront/src/app/auctions/[slug]/[itemId]/page.tsx`

- Gleiche Platzierung wie Catalog
- URL: `https://vod-auctions.com/auctions/{slug}/{itemId}`
- Title: `{artist} — {title}`

### Schritt 4 (optional): Entity Pages

- Band, Label, Press-Seiten könnten ebenfalls einen Share-Button bekommen
- Niedrigere Priorität — erstmal Catalog + Auctions

---

## UI Layout (Detail-Seite)

```
┌─────────────────────────────────────────────────┐
│  Artist Name                                     │
│  ┌──────────────────────────────┐  ┌───┐ ┌───┐  │
│  │ Release Title               │  │ ♥ │ │ ⤴ │  │
│  └──────────────────────────────┘  └───┘ └───┘  │
│  [Tape] [1992] [Germany]            ↑       ↑    │
│                                   Save    Share  │
│  ┌──────────────────────────────────────────┐    │
│  │ Catalog Price              €12.00        │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘

Desktop Dropdown (nach Klick auf Share):
┌─────────────────────┐
│ 🔗  Copy Link       │
│ ─────────────────── │
│     WhatsApp        │
│ 𝕏   X (Twitter)     │
│ f   Facebook        │
│ ✈   Telegram        │
│ ✉   Email           │
└─────────────────────┘
```

---

## Technische Details

### Abhängigkeiten
- **Keine neuen Packages nötig** — Lucide Icons (bereits installiert), native APIs
- Icons: `Share2`, `Copy`, `Check`, `Mail` aus Lucide + inline SVGs für Social Brands

### Browser-Kompatibilität
- **Web Share API:** Chrome/Edge 89+, Safari 14+, Firefox Android 79+ — **kein Firefox Desktop!**
- **Clipboard API:** Alle modernen Browser (97%+)
- **Social Share Links:** 100% — simple URL-Redirects

### Aufwand
- **1 neue Datei:** `ShareButton.tsx` (~80-100 Zeilen)
- **2 geänderte Dateien:** `catalog/[id]/page.tsx`, `auctions/[slug]/[itemId]/page.tsx` (je 2 Zeilen)
- **Geschätzter Aufwand:** ~30 Minuten

---

## OG-Tag Status (bereits vorhanden ✅)

Die Link-Previews funktionieren bereits korrekt:

```typescript
// catalog/[id]/page.tsx — bereits implementiert
openGraph: {
  title: `${title} — VOD Auctions`,
  description: description || `${title} — available on VOD Auctions`,
  ...(r.coverImage ? { images: [{ url: r.coverImage, alt: title }] } : {}),
}
```

Wenn jemand einen Link teilt, zeigt WhatsApp/Facebook/X bereits:
- **Titel:** "Artist — Release Title — VOD Auctions"
- **Beschreibung:** Format, Jahr, Land
- **Bild:** Cover-Image (wenn vorhanden)

---

## Nicht im Scope

- **Pinterest:** Nicht relevant für Industrial Music Nische
- **LinkedIn:** Nicht relevant für B2C Auktionsplattform
- **Embed-Codes:** Overengineered für diesen Use Case
- **Share-Counter/Analytics:** Kann später ergänzt werden (Brevo Events)
