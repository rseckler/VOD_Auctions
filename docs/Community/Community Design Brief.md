# VOD Community — Design Brief für Claude Design

**Auftrag:** Erste Mockups für den neuen Community-Bereich auf vod-auctions.com.
**Status:** Quick first impression — wir wollen Tonality, Information-Hierarchie und Komponenten-Sprache sehen, nicht jeden Edge-Case durchdesignen.
**Style-Guide:** Wird separat mitgegeben (Vinyl-Culture-Tonality, DM Serif Display + DM Sans, Gold #d4a54a, Dark #1c1915). Falls Konflikt zwischen diesem Brief und Style-Guide: **Style-Guide gewinnt.**
**Vollständiges Konzept:** [`Community Concept.md`](./Community%20Concept.md) (1200 Zeilen — nur als Referenz, nicht durcharbeiten).

---

## 1. Was wir bauen — in einem Absatz

VOD Auctions ist ein Sammler-Auktionshaus für Industrial / Power-Electronics / Noise / Tape-Underground-Vinyl (~41.500 Releases im Catalog). Die Stamm-Sammler sitzen aktuell in einer Facebook-Gruppe „Vinyl on Demand", die Meta zunehmend drosselt. Wir holen die Community auf eine eigene Plattform, eingebettet in den existierenden Online-Shop. Frank Maier (Inhaber, Curator, „die Stimme") soll editorialer Anker sein — ähnlich wie Resident Advisor mit Editorial + Discussion. Die Member-Profile erben Status aus dem CRM (Platinum/Gold/Silver/Bronze).

**Tonality:** Sammler-Stolz. Analog-Materialität. Kein Tech-Look, kein Discord-Vibe, kein Reddit. Näher an **Letterboxd** + **Resident Advisor** + **Are.na** als an Twitter / Threads / Discord.

---

## 2. Was wir in dieser ersten Runde designt haben wollen

**Vier Key-Screens** in Desktop + Mobile, in dieser Priorität:

1. **Community Hub Landing** (eingeloggter Member, Default-View)
2. **Single Post Page** (Frank-Editorial mit Comments)
3. **Member Profile Page**
4. **Catalog-Anchored Discussion** — bestehende Release-Page mit neuem Tab „Discussion"

**Bewusst NICHT in dieser Runde:**
- Notification Center, Mod-Tools, Admin-Routes, Onboarding-Flow
- Reviews, Lists, Polls, Voting-Widgets (Phase 2)
- Email-Templates
- Post-Composer / Editor (kommt nach Konzept-Sign-off)

---

## 3. Tonality / Mood

| Wirkt wie… | Wirkt nicht wie… |
|---|---|
| Letterboxd (Identity-as-Collector, Editorial-Anker, Lists) | Discord (24/7-Chat-Server, Bot-Vibes) |
| Resident Advisor (kuratiertes Editorial + Diskussion) | Reddit (Karma-Race, Anonymität) |
| Are.na (Slow Social, Sammlung als Statement, niedrige Toxicity) | Twitter/X (Hot-Take-Maschine, Algorithmus-Soup) |
| Bandcamp Fan-Profile (Sammlungs-Identität) | Facebook (Reglementierung, Werbung) |
| Discogs (vertraut, da Genre-Nachbar, aber besser) | phpBB-Style-Forum (Sub-Forum-Sprawl, 2009-Look) |

**Drei Tonality-Anker:**
- **Materialität.** Vinyl, Tape, Druckspur. Subtle Texturen, papierne Linien, niemals Glasmorphismus oder Neon-Gradients.
- **Editorial-Hand.** Frank's Stimme ist sichtbar prominent — eigene visuelle Behandlung („VOD Curator"-Badge, Goldlinie über dem Header).
- **Sammler-Status.** Tier-Badges (Platinum/Gold/Silver) sind diskret aber präsent — wie ein gutes Hotel-Loyalty-Programm, nicht wie ein Spiel-Achievement.

---

## 4. Information Architecture

### 4.1 Top-Nav (Desktop) / Bottom-Tab (Mobile)

```
Auctions  |  Community★  |  Catalog  |  Bands  |  Labels  |  About
```

`Community★` ist neuer Top-Level-Eintrag zwischen Auctions und Catalog. Subtle Notification-Dot wenn Unread.

### 4.2 Sub-Navigation innerhalb /community

```
Feed  |  Explore  |  Lists  |  Dispatch (Frank)  |  Members
```

- **Feed** — Default Landing (Activity Feed der Followed-Members)
- **Explore** — Tag-Browser, Trending, Discovery
- **Lists** — Public curated Sammlungen (Phase 2, in Mockup als „Coming soon"-Card OK)
- **Dispatch** — Frank's Editorial-Spur, eigene visuelle Behandlung
- **Members** — Member-Directory

### 4.3 Catalog-Anchored Tabs (auf bestehender Release-Page)

Existing Tabs: `Details | Tracklist | Inventory`
Neuer Tab: `Discussion` (mit Counter-Badge wenn Activity)

---

## 5. Screen-Briefs

### Screen 1 — Community Hub Landing

**Use-Case:** Member loggt ein, klickt „Community" in der Top-Nav. Sieht den Activity Feed der Member, denen er folgt + Frank's neuesten Editorial-Post + Trending-Tags + Suggested-Members.

**Hauptzonen (Desktop):**
- **Hero-Strip oben:** Frank's neuestes Editorial als Featured-Card (full-width oder 2/3-width). Goldlinie oben drüber, „From the Vault — Frank Maier" Header.
- **Center-Column (2/3):** Activity Feed, Posts in Reverse-Chrono. Mix aus:
  - Member-Posts (Standard-Card)
  - Frank-Editorial-Posts (Sondertreatment, alle paar Karten eingestreut)
  - Catalog-Anchored-Posts („Member X kommentiert Release Y") mit Inline-Release-Card
- **Right Sidebar (1/3):**
  - „Active in Auctions" — laufende Blocks (Cross-Promotion, max 2)
  - „Trending Tags" (5-7 Tags)
  - „Suggested Members" (3 Avatare)
  - „From the Catalog" — 2 Release-Cards, kontextuell

**Mobile:**
- Hero-Strip stays
- Activity Feed full-width
- Sidebar wird zur „Discover"-Section unter dem Feed

**Floating-Action-Button (FAB) unten rechts:** „Compose" — Goldfarbig, persistent.

**Beispiel-Inhalt für die Mockups (kein Lorem):**

> **Frank Maier** — VOD Curator
> *From the Vault #43*
> **Die ZKO-Tape-Ära 1984–1986: Was uns die zweite Kassette über Frank Tovey verriet**
> Aus dem Archiv kommt ein zweiteiliger Bericht über Z'EV's Begegnungen mit Frank Tovey in West-Berlin, 1984. Inklusive zwei Aufnahmen, die nie offiziell veröffentlicht wurden…
> 🔥 87 · 💬 24 · vor 2 Tagen

> **DiscoveredZkoIn1989** ★ Gold Member · Berlin
> Endlich nach 12 Jahren Suche: meine erste Kopie von **Vortex Campaign — Aufstand der Praxis (Tape, 1985)**. Habe ich heute aus Block #41 gewonnen. Der Sound ist roher als ich dachte…
> [Release-Card: Vortex Campaign — Aufstand der Praxis]
> 🔥 14 · 💬 3 · vor 4 Stunden

> **TapeUndergroundDe** ★ Silver Member · Köln
> Hat jemand das letzte ZKO-Re-Issue von 2024 noch im Sleeve? Ich vergleiche grade Pressungen…
> 💬 7 · vor 1 Tag

**Trending Tags:** `#power-electronics 23`, `#tape-culture 18`, `#zko 12`, `#vinyl-on-demand 9`, `#archive-find 7`

---

### Screen 2 — Single Post Page (Frank-Editorial)

**Use-Case:** Member klickt auf Frank's Hero-Editorial. Lange-Form-Lese-View mit Comments unten.

**Aufbau:**
- **Hero-Bild** (optional, full-width, Album-Cover oder Press-Foto). Goldlinie-Overlay-Trennelement.
- **Title** in DM Serif Display, groß
- **Author-Strip:** [Avatar Frank, größer] · *Frank Maier — VOD Curator* · *Donnerstag, 5. Mai 2026* · *7 min Lesezeit*
- **Body:** Long-Form-Text mit eingebetteten Bildern, Bandcamp-Embed, YouTube-Embed, Inline-Release-Cards (`@release:1234` rendert als Release-Mini-Card)
- **Reactions-Bar** (sticky bottom-anchor): 7 Emoji-Reactions (🔥 ❤️ 🤘 👀 💯 🙏 ⚡), aktuelle Reaktions-Counts klickbar
- **„Discuss" Section** unter dem Body:
  - Comment-Composer (Tiptap-Light, „Share your thoughts…")
  - Comments in Reverse-Chrono, eine Threading-Ebene
  - Jeder Comment: Avatar + Display-Name + Tier-Badge + Body + Reactions + Reply-Button
- **Right Sidebar (Desktop only):**
  - „Related Releases" — 3-4 Cards der im Editorial referenzierten Releases
  - „More from Frank" — 3 Editorial-Karten
  - Tags

**Beispiel-Comments:**

> **DiscoveredZkoIn1989** ★ Gold · vor 1 Tag
> Frank, die zweite Aufnahme — ist das die mit dem Walther-Mikrofon, die Z'EV mal im Interview erwähnt hat? Falls ja: das ist eine kleine Sensation.
> 🔥 4 · ↪ Reply

> **Frank Maier** 🎙 VOD Curator · vor 23 Stunden
> @DiscoveredZkoIn1989 — exakt das. Ich hab die Provenienz mit Cosey im Februar abgeglichen. Mehr dazu in Teil 2 nächste Woche.
> 🔥 12 · ↪ Reply

---

### Screen 3 — Member Profile Page

**Use-Case:** Mitglied klickt auf Display-Name eines anderen Members. Sieht Profil, Aktivität, Sammlung-Highlights.

**Aufbau:**
- **Header-Banner** (full-width, ~250-300px hoch) — User-uploaded Bild (Plattenladen, Sammlungs-Foto, Live-Shot). Bei Frank: kuratiertes Vault-Foto.
- **Profile-Card** (überlappt Banner unten, links-bündig oder zentriert):
  - Avatar (große, runde Variante, ~120px)
  - Display-Name in DM Serif
  - Tier-Badge prominent (z.B. „★ Gold Member" mit Goldlinie darunter)
  - Handle (`@DiscoveredZkoIn1989`)
  - Location · Sammler-seit-Year („Berlin · Sammler seit 2009")
  - Bio (Tiptap-Render, kompakt, 2-4 Zeilen)
  - Links als Icons (Bandcamp, Discogs, SoundCloud, Website)
  - Action-Buttons: `[Follow]` (gold-primary) `[Message]` (ghost, Phase 3 disabled)
- **Stats-Bar:** `127 Posts · 432 Comments · 94 Following · 218 Followers · 2.341 Owned · 87 Wantlist`
  - Klickbar auf Following / Followers / Owned / Wantlist
- **Tab-Navigation:** `Posts | Lists | Reviews | Acquired | Wantlist | Comments`
- **Tab-Inhalt** (Default = Posts):
  - Reverse-Chrono Liste der eigenen Posts (kompakte Variante des Hub-Cards)

**Beispiel-Member für Mockup:**

> **DiscoveredZkoIn1989** — `@DiscoveredZkoIn1989`
> ★ Gold Member · Berlin · Sammler seit 2009
> Bio: *„Industrial & Tape-Underground seit den 90ern. Schwerpunkt Z'EV, Maurizio Bianchi, frühe ZKO. Tausche nicht, kaufe nur."*
> Links: [Bandcamp] [Discogs] [Website]
> Stats: 127 Posts · 432 Comments · 94 Following · 218 Followers · 2.341 Owned · 87 Wantlist

**Frank's Profile-Variante (Curator):**
- Kein Tier-Badge — stattdessen `🎙 VOD Curator` mit Goldlinie
- Bio kürzer, formaler: *„Inhaber Vinyl on Demand. Seit 2003 im Aufbau des Archivs."*
- Stats betont: `217 Editorials · 1.847 Comments · — Following · 4.213 Followers`
- Header-Banner: Plattenladen-Foto oder kuratiertes Vault-Bild

---

### Screen 4 — Catalog-Anchored Discussion (Release-Page-Tab)

**Use-Case:** Bestehende Release-Detail-Page bekommt neuen Tab „Discussion". Mitglied klickt drauf, sieht Posts + Reviews zu diesem Release.

**Aufbau (Tab-Inhalt; Release-Header bleibt unverändert):**
- **Discussion-Composer** oben: „Share your thoughts on this release…" — kompakter Tiptap-Trigger, expanded zu Modal beim Klick
- **Stats-Strip:** `4 reviews · ★ 4.2 avg · 23 own this · 47 want this · 12 discussions`
  - „own this" + „want this" sind klickbar → öffnen Member-Liste-Drawer
- **Reviews-Section** (Phase 2, in Mockup als kleinere Sub-Section):
  - „Latest Review by @username · ★★★★½ · vor 3 Tagen" — Card mit Auszug, Link zur Vollansicht
  - `[Show all 4 reviews]` Button
- **Discussion-Posts** (chronologisch, neueste zuerst):
  - Standard-Post-Cards wie im Hub-Feed
  - Verifiziertes-Acquired-Badge bei Mitgliedern, die das Release nachweislich gekauft haben (kleines „✓ Owned"-Tag am Avatar)

**Beispiel-Inhalt:**

Release: **Z'EV — Elemental Music (LP, ZKO 005, 1985 / VOD 2019 Re-Issue)**

> **TapeUndergroundDe** ★ Silver · ✓ Owned · vor 6 Tagen
> Habe heute meine VOD-Re-Issue mit der Original-1985er verglichen. Side B Track 3 hat im Original ein Tape-Saturation-Artefakt, das die Re-Issue sauberer presst — bewusste Entscheidung oder anderer Master?
> 💬 4 · 🔥 8

> **DiscoveredZkoIn1989** ★ Gold · ✓ Owned · vor 5 Tagen
> @TapeUndergroundDe — die Re-Issue läuft auf Cosey's neuem Master. Frank hatte das im Newsletter erwähnt. Original ist halt Original, aber die Re-Issue ist *cleaner-by-design*, nicht versehentlich.
> 💬 0 · 🔥 11

---

## 6. Komponenten-Inventar (für Style-Guide-Anwendung)

| Komponente | Zweck | Anmerkungen |
|---|---|---|
| `<MemberAvatar>` | Avatar mit Tier-Pin overlay | Sizes: 32 / 48 / 64 / 96 / 120. Tier-Pin nur bei Gold+ |
| `<TierBadge>` | Status-Marker | Platinum 💎 (Goldring) · Gold ★ · Silver ★ · Bronze (kein Pin) · Curator 🎙 |
| `<PostCard>` | Standard-Post | Compact (Feed) · Full (Detail) · Inline (Catalog-Anchored) |
| `<EditorialCard>` | Frank-Posts | Sondertreatment: Goldlinie oben, „From the Vault" Header, größere Typo |
| `<ReleaseCard>` (existing) | Inline in Posts | Mini-Variante für `@release:1234`-Mentions |
| `<ReactionsBar>` | 7 Emoji-Reactions | 🔥 ❤️ 🤘 👀 💯 🙏 ⚡ — Long-Press auf Mobile öffnet Picker |
| `<CommentTree>` | One-Level Threading | Nicht Reddit-deep; Reply-Indent nur 1× |
| `<FollowButton>` | Follow/Unfollow | Gold-Primary „Follow" → Outline „Following" |
| `<TagBadge>` | Tag-Display | `#tag` mit Hover-Count |
| `<ProfileHeader>` | Member-Profile-Header | Banner + Profile-Card overlap |
| `<StatsBar>` | Member-Stats-Zeile | Klickbare Counter-Pills |

---

## 7. Visual-Sprache — Was wir GERN sehen / NICHT sehen

**✅ Gern:**
- Subtle Vinyl-Texture als Hintergrund-Pattern (low opacity, max 5%)
- Goldlinien als Trennelemente (1px, #d4a54a)
- Serifen-Headlines (DM Serif Display) für Editorial-Behandlung
- Scharfe Kanten, klare Hierarchie
- Schwarz-Weiß-Fotografie als Hero-Default (passt zum Industrial-Genre)
- Großzügiger Whitespace im Editorial, dichter im Feed

**❌ Nicht:**
- Glasmorphismus, Frosted-Glass, Backdrop-Blur als zentrales Stilmittel
- Neon-Gradients, Sunset-Pastel, Y2K-Revival
- Discord-Lila / Twitch-Lila (#5865F2 / #9146FF)
- Reddit-Orange (#FF4500)
- Verspielte Illustrationen / Mascots
- Animationen die wie „App-of-the-Year"-Showreel wirken
- Karma-Score, Streak-Indicator, Daily-Login-Reward-Badges

**Stil-Anchor zur Orientierung:** Wenn man sich fragt „was würde Resident Advisor / Letterboxd machen", liegt man richtig. Wenn man sich fragt „was würde TikTok / Discord / Bumble machen", liegt man falsch.

---

## 8. Interaktions-Patterns (kurz)

- **Reactions:** Click = first-Reaction (🔥), Long-Press / Right-Click = Emoji-Picker für die 7 Optionen
- **Follow:** Single-Click toggle, optimistic UI
- **Compose:** FAB öffnet Modal mit Tiptap-Editor (Editor selbst nicht in dieser Mockup-Runde nötig — nur Trigger-State)
- **Tier-Badge:** Hover/Tap zeigt Tooltip „Gold Member — top 3% of collectors"
- **Tab-Navigation:** Sticky bei Scroll
- **Mobile-Bottom-Tab:** 5 Slots — Home / Auctions / Community★ / Cart / Account

---

## 9. Was wir als Output erwarten

Ein **Figma-File** (oder vergleichbar) mit:
- Die 4 Screens in **Desktop (1440px)** und **Mobile (375px)**
- Komponenten-Inventar als shared Components, falls möglich
- Eine Beispiel-Variante mit eingeloggtem Member, eine ohne (wo relevant)
- 1-2 Hover-/Active-States bei den wichtigsten Interaktions-Elementen (Reactions-Bar, Follow-Button)

**Nicht erwartet:** Auto-Layout-Pixel-Perfekt, Light-Mode, Internationalisierungs-Varianten, Edge-Cases (Empty-States, Error-States, Loading-States) — das kommt in Runde 2, falls die Tonality stimmt.

---

## 10. Inhalts-Pool für authentische Mockups

Bitte folgende Beispiel-Inhalte verwenden statt Lorem-Ipsum oder generischen Placeholder-Namen:

**Beispiel-Member:**
- `DiscoveredZkoIn1989` — ★ Gold · Berlin · Sammler seit 2009
- `TapeUndergroundDe` — ★ Silver · Köln · Sammler seit 2014
- `NoiseAndArchive` — ★ Silver · Wien · Sammler seit 2011
- `IndustrialPragueOG` — ★ Bronze · Prag · Sammler seit 2018
- `Frank Maier` — 🎙 VOD Curator · Pratteln · seit 2003

**Beispiel-Tags:**
`#power-electronics` · `#tape-culture` · `#zko` · `#vinyl-on-demand` · `#archive-find` · `#noise` · `#industrial` · `#cassette-only` · `#re-issue` · `#first-pressing`

**Beispiel-Releases (für Cards):**
- *Z'EV — Elemental Music* (LP, ZKO 005, 1985)
- *Vortex Campaign — Aufstand der Praxis* (Tape, ZKO 012, 1985)
- *Maurizio Bianchi — Symphony for a Genocide* (LP, Re-Issue 2022)
- *NON — Pagan Muzak* (LP, 1978 / VOD Re-Issue 2019)

**Beispiel-Editorial-Titel (Frank-Style):**
- „From the Vault #43: Die ZKO-Tape-Ära 1984–1986"
- „Re-Discovered: Eine vergessene Maurizio-Bianchi-Aufnahme"
- „Why Industrial Was Never Dance Music — Eine Rückbetrachtung"
- „Inside the Archive: Was zwei Wochen Sortieren über Vortex Campaign verraten haben"

---

**Ende des Briefs.**
Falls Rückfragen zur Tonalität, Hierarchie oder einzelnen Screens auftauchen — gerne direkt zurückfragen statt raten. Wir wollen lieber 1-2 Iterationen, als ein durchpoliertes Design in falscher Richtung.
