# VOD Community — Rebuild Plan

**Status:** Verbindlich · 2026-05-16
**Owner:** Robin Seckler
**Ersetzt:** [`COMMUNITY_PLATFORM_BUILD_PLAN.md`](./COMMUNITY_PLATFORM_BUILD_PLAN.md) (dessen „Increment 1–4 = vollständig" war eine Fehleinschätzung — siehe §1)
**Bezug:** [`Community Design Brief.md`](./Community%20Design%20Brief.md) · [`Community Concept.md`](./Community%20Concept.md) · [`COMMUNITY_SYSTEM_STATE.md`](./COMMUNITY_SYSTEM_STATE.md)
**Design-Referenz (verbindlich):** [`VOD Community Mockups.html`](./VOD%20Community%20Mockups.html) + Quell-Komponenten in [`community/`](./community/) (`screens.jsx`, `components.jsx`, `community.css`, `data.jsx`)

---

## 1. Ausgangslage — ehrliche Bewertung

Increment 1–4 (rc55–rc57) hat ein **solides Backend** geliefert (8 `community_*`-Tabellen, 14 Store-Routes, Admin-Routes, Rating-/Tier-Trigger, Sanitizer, Replikation, Flag-Gating) — das bleibt und wird wiederverwendet.

Die **Storefront ist jedoch eine Skizze, kein Produkt**:
- Der Hub ist eine einspaltige schmale Liste statt des zweispaltigen Hub-Layouts mit Editorial-Hero + Discovery-Sidebar aus dem Mockup.
- Die Vinyl-Culture-`community.css` wurde portiert, aber die Screens nutzen das zugehörige Layout-System nicht — sie rendern flache Cards.
- Members-Directory, Explore, Lists, Search, Acquired-Feed, Onboarding, Mentions, Post-Sidebar, FAB, Sub-Navigation: **nicht gebaut**.
- Die Plattform ist **leer** (Build-Plan-Entscheid „D4 — kein Seed-Content" → nichts ist erlebbar/testbar).

Der Build-Plan hat Increment 1–4 als „✅ vollständig" markiert. Gegen Design Brief + Mockup ist das nicht haltbar. **Dieser Plan setzt den Stand korrekt: Backend ~70 % fertig, Storefront ~20 %, Produkt ~15 %.**

### 1.1 Gap-Inventar (Soll vs. Ist)

| Bereich | Fehlt / unzureichend |
|---|---|
| **Hub** | 2/3-Spalten-Layout, Sidebar (Active in Auctions / Trending / Suggested Members / From the Catalog), Sub-Nav, FAB |
| **Post-Detail** | Editorial-Eyebrow (№/Part), Deck, Lesezeit, Hero-Caption, Sidebar (Related Releases / More from Frank / Tags) |
| **Profil** | Tabs (Posts/Lists/Reviews/Acquired/Wantlist/Comments), „My Top 4", Link-Icons, 6-Stat-Bar |
| **Members-Directory** | Existiert gar nicht (`/community/members` fehlt — nur `[handle]`) |
| **Explore** | Tag-Browser, Trending, Discovery — fehlt komplett |
| **Lists** | Concept S1 (höchster Engagement-Multiplier) — fehlt komplett |
| **Search** | Concept M14 — fehlt komplett |
| **Acquired-Feed** | Concept S3 — fehlt komplett |
| **Reactions** | 7-Emoji-Bar nur auf Detail; Feed-Cards zeigen nur 🔥; kein Long-Press-Picker |
| **Mentions** | `@user` / `@release:1234` inline — fehlt |
| **Onboarding** | Profil-Setup nach erstem Login — fehlt |
| **Bookmarks** | Saved Posts — fehlt |
| **Email** | Notification-Mails + Weekly-Digest (Concept M11/S7) — fehlt |
| **Catalog-Anchored** | Stats-Strip, Owned-Pill, Review-Sort, „own/want"-Member-Drawer — rudimentär |
| **Seed** | Keine Demo-Inhalte → leere Plattform |

---

## 2. Markt-Standard — Pflicht-Set für eine moderne Community

Synthese aus Concept-Benchmark (Letterboxd, Discogs, RA, BGG, Bandcamp, Are.na, Circle) + aktuellem Marktstandard:

**Must-have (Standard, jede ernstzunehmende Community hat das):**
- Personalisierter Activity-Feed *mit* Discovery-Sidebar — nicht nur eine Liste
- Member-Directory + Volltext-Suche
- Onboarding (Profil-Setup, erster-Post-Nudge)
- Rich-Reactions überall sichtbar, Mentions, Notification-Center **mit** Email-Digest
- Empty-States, die zur ersten Aktion führen (nicht „is quiet")
- Image-Lightbox, schnelle Lese-Performance (server-rendered HTML — vorhanden)
- Mobile-First inkl. Bottom-Tab + Long-Press-Reactions

**Von Sammler-Communities speziell erwartet:**
- Lists / kuratierte Sets · Reviews mit Rating-Histogramm · Owned/Wantlist-Verzahnung
- Verifiziertes Eigentum (Verified-Owned-Badge) · Member-of-the-Month / Spotlight
- Profil als Sammlungs-Statement (Top-4 Featured Releases, Galerie)

**Bewusst weglassen (Concept-Disziplin — bleibt so):**
- Karma-Score, Downvotes, Streaks, Daily-Login-Rewards, Dauer-Chat, Algorithmus als Default

Alles aus „Must-have" + „erwartet" ist in den Phasen unten enthalten.

---

## 3. Scope & Leitplanken

**Scope-Deckel:** volles Konzept — inkl. Lists, Acquired-Feed, Onboarding, Mentions, Bookmarks, Email-Digest, Search, Explore.

**Vorgehen:** Storefront-Community-UI wird **sauber neu aus der Mockup-Quelle** aufgebaut (`screens.jsx`/`components.jsx`/`community.css` sind verbindliche Referenz). Backend-Routes/Schema bleiben und werden ergänzt.

| # | Leitplanke |
|---|---|
| L1 | Storefront- + Admin-UI **ausschließlich Englisch**. |
| L2 | Mockup ist die verbindliche Design-Referenz. Abweichung nur bei Style-Guide-Konflikt (Style-Guide gewinnt). |
| L3 | Backend-Schema/Routes aus Inc 1–4 bleiben. Neue Tabellen additiv, via Supabase MCP `apply_migration`, einzeln zur Freigabe. |
| L4 | Jede neue `community_*`-DDL parallel auf `vod_auctions_replica` + `REFRESH PUBLICATION`. |
| L5 | Flag bleibt `COMMUNITY`. Demo-Seed hinter separatem Flag `COMMUNITY_DEMO`. |
| L6 | Jede Phase endet typecheck-sauber, deployed hinter Flag, mit Smoke-Test + CHANGELOG-Entry + GitHub-Release. |
| L7 | Kein Fake-Content auf Prod **außer** dem klar markierten, jederzeit entfernbaren Demo-Seed (R0). Launch-Content kommt über die FB-Migration. |
| L8 | CLAUDE.md-Gotchas strikt (Route-Prefix `community`, kein `test` in Verzeichnisnamen, Vite-Cache-Clear bei neuen Admin-Routes, Knex-Patterns, Meili-Trigger-Whitelist, `sanitizeBodyHtml` als einzige HTML-Bereinigung). |

---

## 4. Phasen

Reihenfolge nach Abhängigkeit: erst Inhalte sichtbar machen (R0), dann das Gerüst (R1), dann die Screens, dann die Engagement-Mechanik, dann Discovery/Safety.

### R0 — Demo-Seed + Foundation-Cleanup · ~1,5 T

**Ziel:** Plattform ist ab sofort mit realistischem Inhalt erlebbar — Voraussetzung für jede visuelle QA.

- Flag `COMMUNITY_DEMO` (`feature-flags.ts` + `site_config.features`), Default OFF auf Prod, ON in Dev/QA.
- Seed-Skript `scripts/community_seed.py` (idempotent, `--load` / `--purge`):
  - ~12 fiktive Sammler-Profile aus dem Mockup-Content-Pool (`DiscoveredZkoIn1989`, `TapeUndergroundDe`, `NoiseAndArchive`, `IndustrialPragueOG`, `MaurizioForever` u. a.) + Frank-Curator-Profil — alle mit `is_demo=true`-Markierung (neue Spalte oder Handle-Prefix-Konvention).
  - ~6 Frank-Editorials (Mockup-Texte: „From the Vault № 40–43"), ~25 Member-Posts, ~50 Comments, ~30 Reviews mit Rating, Reactions, Follow-Graph, Tags.
  - Posts an echte Katalog-`release_id` geankert (Z'EV — Elemental Music etc., per Such-Lookup auf existierende Releases).
- `--purge` entfernt alles `is_demo=true` rückstandsfrei.
- Avatare/Cover: vorhandene R2-Bilder bzw. Monogramm-Fallback (kein Bild-Upload nötig).

**Deliverable:** Hub, Profile, Discussion-Tabs zeigen echten Inhalt. Frank kann durchklicken.
**Akzeptanz:** `--load` → Hub zeigt ≥ 25 Posts; `--purge` → 0 Demo-Rows; Prod unberührt (Flag OFF).

### R1 — Storefront-Shell + Hub (Mockup-Parität) · ~4 T

**Ziel:** Das tragende Gerüst + der Hub auf voller Mockup-Qualität.

- `community.css` final aus Mockup-Quelle übernehmen; Komponenten-Bibliothek `CommunityUI.tsx` gegen `components.jsx` abgleichen (Avatar, TierLabel, Tag, Reactions, PostCard, EditorialCard, ReleaseInline, Widgets).
- `community/layout.tsx`: **Sub-Navigation** `Feed · Explore · Lists · Dispatch · Members`, **FAB „Compose"**, Header-Notification-Dot. Mobile: Bottom-Tab-Slot „Community".
- **Hub** (`/community`) neu: Editorial-Hero (voll, „From the Vault"-Treatment) → `cm-hub-grid` 2-spaltig: Feed (Following/Latest) + **Sidebar** mit `ActiveBlocks`, `TrendingTags`, `SuggestedMembers`, `FromCatalog`.
- Empty-States, die zur Aktion führen (erste-Post-CTA statt „is quiet").
- Backend: `GET /store/community/hub-sidebar` (Active Blocks aus `auction_block`, Suggested Members, kontextuelle Releases) — eine aggregierte Route.

**Deliverable:** Hub Desktop + Mobile mockup-konform.
**Akzeptanz:** Side-by-side gegen Mockup-Screen 01 (Desktop+Mobile); Sub-Nav routet; FAB öffnet Compose.

### R2 — Post-Detail + Editorial-Treatment + Compose · ~3 T

**Ziel:** Lese- und Schreib-Erlebnis best-in-class.

- **Post-Detail** (`/community/post/[slug]`): Eyebrow (`Dispatch · From the Vault № 43 · Part 1 of 2`), Deck, Author-Strip mit Lesezeit + Follow-Button, Hero mit Caption, `cm-prose`-Render, **Sidebar** (Related Releases, More from Frank, Tags).
- **Reactions:** 7-Emoji-Bar (🔥❤️🤘👀💯🙏⚡) auf Detail + Feed-Cards; Long-Press/Right-Click-Picker (Mobile + Desktop).
- **Compose** (`/community/compose`): Tiptap voll — Bild-Upload (R2, vorhanden), Embeds (YT/Vimeo/Bandcamp/SoundCloud/Spotify, vorhanden), Cover, Tag-Picker, Release-Anker, **Mentions** `@user` / `@release:1234` mit Auto-Complete.
- Backend: Mention-Parsing → `community_notification` (`kind='mention'`), `@release`-Render als `ReleaseCardInline`.

**Deliverable:** Mockup-Screen 02 + Compose-Modal voll funktional.
**Akzeptanz:** Editorial liest sich wie der Mockup; Reactions togglen optimistisch; Mention erzeugt Notification + Release-Card.

### R3 — Member-Profil + Directory + Onboarding · ~4 T

**Ziel:** Identität-als-Sammler + Auffindbarkeit.

- **Profil** (`/community/members/[handle]`): Banner, Profile-Card, Link-Icons, **6-Stat-Bar** (Posts/Comments/Following/Followers/Owned/Wantlist), **Tabs** `Posts · Lists · Reviews · Acquired · Wantlist · Comments`, **„My Top 4"** Featured-Releases. Curator-Variante (Frank) ohne Tier, mit Editorials-Tab.
- **Members-Directory** (`/community/members`, NEU): Tier-Filter-Toolbar, Sort (Activity/Joined/Tier), Member-Cards, Suche. Mockup-Screen 05.
- **Onboarding-Flow**: nach erstem Login Modal/Seite — Display-Name, Avatar, Tier-Sichtbarkeit, optional Bio/Location → dann „erster Post"-Nudge.
- **Settings** (`/community/settings`): vollständige Profil-Edit inkl. Privacy-Toggles (Tier/Acquired/Wantlist sichtbar), Top-4-Auswahl, Block-Liste.
- Backend: `GET /store/community/members` (Liste/Filter/Sort), Owned/Wantlist-Counts aus `transaction` + Discogs-Brücke, `featured_releases`-Feld auf `community_profile`.

**Deliverable:** Mockup-Screen 03 + 05; Onboarding live.
**Akzeptanz:** Profil-Tabs laden; Directory filtert nach Tier; neuer User durchläuft Onboarding.

### R4 — Catalog-Anchored Discussion + Reviews · ~2 T

**Ziel:** die Verzahnung mit dem Katalog — der USP.

- **Release-Discussion-Tab** zu Mockup-Screen 04: Stats-Strip (Reviews/Avg-Rating/Own/Want/Discussions), Composer, Latest-Review-Block, Discussion-Liste mit **Verified-Owned-Pill**, Sort (Recent/Top/Verified-First).
- **Rating-Histogramm** pro Release (RYM-Pattern).
- „X own / Y want" klickbar → Member-Liste-Drawer.
- **Band/Label/Press** bekommen analog einen „Wall"-Tab (`artist_id`/`label_id`/`press_id`-Anker — Felder existieren).

**Deliverable:** Release-Seite mockup-konform; Band/Label/Press-Walls.
**Akzeptanz:** Discussion-Tab zeigt geankerte Posts + Reviews; Owned-Pill korrekt aus `transaction`.

### R5 — Lists · ~3 T

**Ziel:** der höchste Engagement-Multiplier (Letterboxd/BGG-Pattern).

- Neue Tabellen `community_list` + `community_list_item` (Concept §5.4 — additiv, Replica-Spiegelung).
- List-CRUD, List-Detail-Seite, List-Cards, `/community/lists` (Public Lists, sortierbar), Profil-Lists-Tab.
- Release-Picker (Meili-Such-Anbindung), List-Cover, Public/Private, Item-Notes + Rang.

**Deliverable:** Lists end-to-end.
**Akzeptanz:** Member legt Liste an, fügt Releases zu, Liste erscheint öffentlich + im Profil.

### R6 — Acquired-Feed + Notifications + Email · ~3 T

**Ziel:** Retention-Loop schließen.

- **Acquired-Feed** (opt-in): Hook auf Auction-Win / Direct-Buy → Auto-`community_post` (`kind='acquired'`), nachträglich um Note ergänzbar; erscheint im Following-Feed + Profil-Tab.
- **Notification-Center** polieren: Gruppierung, Read-State, Filter; Notification-Dot im Header live.
- **Email**: Resend-Templates (Reply, Mention, Frank-Editorial-Broadcast) + Brevo Weekly „Community Digest" — alle in `/app/emails` registriert.
- **Bookmarks**: `community_saved`-Tabelle, Save-Button, „Bookmarks" im Hub-Rail.

**Deliverable:** voller sozialer Loop inkl. Email.
**Akzeptanz:** Auction-Win erzeugt Acquired-Post; Digest-Mail rendert; Bookmark persistiert.

### R7 — Search + Explore · ~3 T

**Ziel:** Discovery auf Markt-Standard.

- Meili-Index `community_posts` (Concept §5 — Felder title/excerpt/tags/author, Filter kind/has_release/tier). Trigger `search_indexed_at` + Sync-Skript nach `meilisearch_sync.py`-Pattern.
- **Explore-Seite** (`/community/explore`): Tag-Browser, Trending, Discovery-Sektionen.
- Such-Bar (Posts/Members/Lists) in Sub-Nav.

**Deliverable:** Suche + Explore live.
**Akzeptanz:** Volltext-Suche < 100 ms p95; Explore zeigt Trending-Tags + Discovery.

### R8 — Admin-Politur + Moderation + Trust · ~2 T

**Ziel:** betreibbar + sicher für echte User.

- Admin `/app/community` ausbauen: Mod-Queue mit Bulk-Actions, Member-Drawer, Report-Detail, Editorial-Schedule, Curated-Tags-Pflege.
- Trust-Level-Auto-Promotion-Job (TL0–TL3, Concept §8.2), Rate-Limits verifizieren.
- CRM-Customer-Drawer: „Community"-Tab (Posts/Comments/Reports/Trust/Last-Active).
- Optional: Claude-Haiku-Auto-Mod für lange Posts.

**Deliverable:** Plattform moderierbar, bereit für Beta-Öffnung.

---

## 5. Parallelstrang — Facebook-Migration (separat)

Unverändert geparkt, läuft ab R1 parallel möglich: P6-Import der 5.819 Frank-FB-Posts + Legacy-Reviews aus `3wadmin_tapes_comment` (Annex, §17.5/§17.7). **Das ist der echte Launch-Content** — der Demo-Seed (R0) wird vor dem öffentlichen Launch durch `--purge` ersetzt. Vorab offen: `typ`-Decode.

---

## 6. Reihenfolge, Aufwand, Abhängigkeiten

```
R0 Seed ─┬─ R1 Shell+Hub ─ R2 Post+Compose ─ R3 Profil+Directory ─ R4 Catalog ─┐
         │                                                                      ├─ R8 Admin+Trust
         └─ FB-Migration (parallel ab R1) ────────────────────────────────────  │
                                          R5 Lists ─ R6 Acquired+Email ─ R7 Search+Explore
```

| Phase | Aufwand | Blockiert von |
|---|---|---|
| R0 Demo-Seed | 1,5 T | — |
| R1 Shell + Hub | 4 T | R0 (für QA) |
| R2 Post + Compose | 3 T | R1 |
| R3 Profil + Directory + Onboarding | 4 T | R1 |
| R4 Catalog-Anchored | 2 T | R2 |
| R5 Lists | 3 T | R3 |
| R6 Acquired + Notifications + Email | 3 T | R3 |
| R7 Search + Explore | 3 T | R2 |
| R8 Admin + Moderation + Trust | 2 T | R4 |
| **Σ** | **~25,5 T** | |

Launch-Voraussetzung bleibt RSE-78 (AGB-Anwalt) — kein Code-Blocker, aber Öffnungs-Blocker.

---

## 7. Status-Tracking

| Phase | Status |
|---|---|
| R0 — Demo-Seed | ✅ rc58.0 (2026-05-16) |
| R1 — Shell + Hub | ✅ rc59.0 (2026-05-16) |
| R2 — Post + Compose | ✅ rc60.0 + rc60.1 (2026-05-16) — Post-Detail, Reactions, Composer, Mentions |
| R3 — Profil + Directory + Onboarding | ✅ rc61.0 (2026-05-16) — Directory, Profil-Tabs, Onboarding. Offen: Top-4-Featured + Privacy-Toggles (schema-pflichtig) |
| R4 — Catalog-Anchored | ✅ rc62.0 (2026-05-16) — Release-Discussion + Reviews + Histogramm. Offen: Band/Label/Press-Walls (schema-pflichtig) |
| R5 — Lists | ✅ rc63.0 (2026-05-16) — Lists-CRUD + Directory + Detail + Profil-Tab; gebündelter Schema-Slice (Featured/Privacy/Entity-Spalten) main + Replica |
| R6 — Acquired + Notifications + Email | ⬜ offen |
| R7 — Search + Explore | ⬜ offen |
| R8 — Admin + Moderation + Trust | ⬜ offen |
| FB-Migration | ⬜ geparkt |

Nach jeder Phase: CHANGELOG-Entry + GitHub-Release, dieser Plan + `COMMUNITY_SYSTEM_STATE.md` aktualisiert.

---

## 8. Offene Punkte

- `typ`-Decode der Legacy-Kommentar-Tabelle (FB-Migration-Voraussetzung).
- Demo-Markierung: dedizierte Spalte `is_demo` auf `community_profile`/`community_post` vs. Handle-Prefix-Konvention — Entscheidung bei R0-Start (Empfehlung: Spalte, sauberer `--purge`).
- AGB-/Verhaltenscodex-Erweiterung (RSE-78) parallel beim Anwalt.
