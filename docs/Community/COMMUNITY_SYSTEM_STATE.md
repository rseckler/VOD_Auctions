# VOD Community — System State (As-Built)

**Status:** Rebuild R0–R9 + Erweiterung 01 live · Stand 2026-05-16
**Releases:** `v1.0.0-rc58.0` … `rc68.0` (Rebuild). Davor `rc55.0`–`rc57.0` (Increments 1–4 — Foundation, von der Rebuild überbaut).
**Bezug:** [`COMMUNITY_REBUILD_PLAN.md`](./COMMUNITY_REBUILD_PLAN.md) (verbindlicher Bauplan) · [`Community Concept.md`](./Community%20Concept.md) · [`Community Design Brief.md`](./Community%20Design%20Brief.md) · [`Erweiterungen.md`](./Erweiterungen.md) · [`CHANGELOG.md`](../architecture/CHANGELOG.md)
**Zweck:** Verbindliche As-Built-Referenz des Community-Systems — Tabellen, Routes, Jobs, Seiten, Komponenten. Single Source of Truth für die laufende Arbeit.

---

## 1. Überblick

Community-Bereich auf vod-auctions.com — ein sozialer Layer (Profile, Posts, Comments, Reactions, Reviews, Lists, Following, Tags, Notifications, Bookmarks, Acquired-Feed, Suche, Moderation) verzahnt mit dem Katalog. Nativ auf dem bestehenden Stack (Medusa-Backend + Next.js-Storefront + Supabase + Tiptap + R2 + Resend), kein externes Forum.

Increments 1–4 (rc55–rc57) waren die Foundation; der **Rebuild R0–R9** (rc58–rc67) hat Storefront + Funktionsumfang auf Mockup-/Konzept-Niveau gebracht, **Erweiterung 01** (rc68) ergänzt Post-Bearbeitung. Der alte [`COMMUNITY_PLATFORM_BUILD_PLAN.md`](./COMMUNITY_PLATFORM_BUILD_PLAN.md) ist überholt.

**Plattform-Mode:** `beta_test` — alles hinter dem Passwort-Gate.

---

## 2. Feature-Flags

`backend/src/lib/feature-flags.ts`, gespeichert in `site_config.features` JSONB.

| Flag | Default | Wirkung |
|---|---|---|
| `COMMUNITY` | OFF (prod **ON**) | Master-Gate. OFF → gesamte `/community`-Surface + `/admin/community` + Discussion/Review-Tabs + Entity-Walls antworten 404. In `CLIENT_SAFE_FLAGS`. |
| `COMMUNITY_DEMO` | OFF (prod **ON** für QA) | Sichtbarkeit des Demo-Datensatzes. OFF → alle Read-Routen filtern Demo-Zeilen (Autor-ID-Präfix `cmpro_demo_`) heraus. `requires: COMMUNITY`. |

---

## 3. Datenbank — `community_*`-Tabellen (11)

Alle in `public` (Supabase `bofblwqieuvmqybzxapx`), snake_case, additive Migrationen via Supabase MCP. **Alle 11 auf die Tier-2-Replica (`pg17-replica`-Container, DB `vod_auctions_replica`) gespiegelt und über `vod_auctions_pub` repliziert.**

| Tabelle | Cols | Zweck |
|---|---|---|
| `community_profile` | 24 | Member-Profil (1:1 weich an Medusa-`customer` via `customer_id`). Felder u. a. `handle`, `display_name`, `bio`, `tier`, `is_curator`, `is_banned`, `trust_level`, `links` jsonb, `featured_releases` jsonb (Top-4), `show_tier`/`show_acquired_feed`/`show_wantlist`/`email_notifications` (Privacy/Notif-Toggles), `legacy_extranet_user_id`/`claimed` (Shadow-Profile). |
| `community_post` | 21 | Posts — `kind` discussion\|editorial\|acquired, `body_json/html`, `excerpt`, `cover_image_url`, `tags text[]`, Anker `release_id`/`artist_id`/`label_id`/`press_id`, `status`, `is_pinned`, denorm. Counter. CHECK `kind` ∈ {discussion,editorial,acquired}. |
| `community_comment` | 10 | Comments, eine Threading-Ebene (`parent_id`). |
| `community_reaction` | 6 | Reactions (7-Emoji-Set), `UNIQUE(profile,target_kind,target_id,emoji)`. |
| `community_review` | 14 | Reviews — `rating` smallint 1–5, `release_id`, `is_verified_acquired`, `UNIQUE(release_id,author_id)`, `imported_from`/`legacy_comment_id`. |
| `community_follow` | 3 | Follow-Graph — PK(`follower_id`,`followed_id`). |
| `community_notification` | 10 | In-App-Notifications — `kind` comment\|reply\|follow\|mention\|editorial, `is_read`, `is_emailed`. |
| `community_report` | 10 | Moderation-Reports — `reason`, `status` open\|reviewed\|actioned\|dismissed. |
| `community_list` | 10 | Kuratierte Listen — `title`, `slug`, `description`, `cover_image_url`, `is_public`, `item_count`. |
| `community_list_item` | 5 | Listen-Einträge — PK(`list_id`,`release_id`), `rank`, `note`; FK `list_id` ON DELETE CASCADE. |
| `community_saved` | 3 | Bookmarks — PK(`profile_id`,`post_id`). |

**Funktionen / Trigger:**
- `community_recompute_release_rating()` + Trigger `trg_community_review_rating` → rollt `avg(rating)`/`count` in `Release.averageRating`/`ratingCount`.
- `community_sync_tier_from_crm()` + Trigger `trg_community_tier_from_crm` auf `crm_master_contact` → synchronisiert `community_profile.tier` aus dem CRM; `is_curator`-Profile ausgenommen.

---

## 4. Backend — Store-Routes (`backend/src/api/store/community/`)

Flag-gated via `requireCommunityEnabled()`; Middleware `allowUnauthenticated` (public Reads offen, Auth-Context wenn eingeloggt). Demo-Gate via `communityDemoEnabled()` + Autor-ID-Präfix-Filter.

| Route | Methoden / Zweck |
|---|---|
| `/posts` | GET (Feed: `release_id`/`artist_id`/`label_id`/`press_id`/`kind`/`author`/`tag`/`feed=following`/`q`) · POST |
| `/posts/:id` | GET (id\|slug) · PATCH (eigener Post, inkl. Anker editierbar) · DELETE |
| `/posts/:id/comments` | GET · POST (Notifications + Mention-Parsing) |
| `/comments/:id` | DELETE |
| `/reactions` | POST (Toggle, 7-Emoji) |
| `/reviews` | GET (`?release_id=&sort=recent\|top\|verified`, liefert Histogramm) · POST |
| `/profile` | GET (eigenes Profil + `featured`) · PUT |
| `/profiles/:handle` | GET (öffentlich + Stats + Posts/Comments/Reviews + `featured`) |
| `/members` | GET (Directory: Tier-Filter, Sort, Suche, Tier-Tally) |
| `/lists` | GET (öffentliche Lists) · POST |
| `/lists/:id` | GET (Detail + Items) · PATCH · DELETE |
| `/lists/:id/items` | POST (Release hinzufügen) · DELETE |
| `/saved` | GET (Bookmarks) · POST (Toggle) |
| `/follow` | POST (Toggle) |
| `/tags` | GET (Trending) |
| `/notifications` | GET (Liste + unread) · POST (read markieren) |
| `/reports` | POST (melden) |
| `/search` | GET (`?q=` — Postgres-ILIKE über Posts/Members/Lists) |
| `/mention-search` | GET (`?q=` — Member + Releases für `@`-Mentions) |
| `/hub-sidebar` | GET (Active Blocks + Suggested Members + Catalog-Picks) |
| `/upload` | POST (Bild → R2, base64) |
| `/embed` | POST (URL → iframe-src) |

**Shared Lib `backend/src/lib/community.ts`:** `requireCommunityEnabled`, `communityDemoEnabled`/`DEMO_ID_PREFIX`/`isDemoId`, `getOrCreateProfile`, `getProfileByCustomerId`, `sanitizeBodyHtml` (sanitize-html — **einzige** HTML-Bereinigung, Mention-/Embed-Allowlist), `excerptFromHtml`, `uniquePostSlug`/`uniqueListSlug`/`uniqueHandle`, `recomputeReactionCount/CommentCount`, `fetchReactionBreakdown`, `extractMentions`/`notifyMentions`, `fetchReleaseCards`, `createNotification`, `refreshTrustLevel`/`dailyPostLimit`, `serializeProfile`.

---

## 5. Backend — Admin-Routes + Admin-UI

**Routes** (`backend/src/api/admin/community/`, Medusa-Admin-Auth): `/dashboard` (Counts + Trust-Verteilung + Recent), `/posts` + `/posts/:id`, `/profiles` + `/profiles/:id`, `/reports` + `/reports/:id`.

**Admin-UI** `/app/community` (9. Sidebar-Eintrag, `backend/src/admin/routes/community/page.tsx`) — Tabs **Dashboard** (Counts, Trust-Level-Verteilung, Recent), **Posts** (Moderation, Multi-Select-Bulk-Hide/Remove), **Members** (Tier/Curator/Ban, Trust-Badge), **Reports** (Mod-Queue, Link auf den gemeldeten Post).

---

## 6. Scheduled Jobs (`backend/src/jobs/`, Medusa-Cron, auto-registriert)

| Job | Schedule | Zweck |
|---|---|---|
| `community-acquired` | `15,45 * * * *` | Scannt bezahlte Transaktionen → erzeugt `kind='acquired'`-Posts für opt-in-Member (`show_acquired_feed`). Entkoppelt vom Payment-Webhook. |
| `community-notification-emails` | `20 */2 * * *` | Pro-Empfänger-Digest un-ge-mailter Notifications (Resend), Opt-out `email_notifications`, setzt `is_emailed`. |
| `community-weekly-digest` | `10 9 * * 0` | Wöchentlicher „Community Dispatch" — Top-Posts der Woche (Resend). |
| `community-trust-levels` | `30 3 * * *` | Bulk-Recompute `trust_level` (TL0–TL3) aus Account-Alter + Aktivität. |

---

## 7. Email

`backend/src/emails/community-notifications.ts` + `community-digest.ts` (HTML-Templates via `emailLayout`), versendet über `lib/email.ts::sendEmailWithLog` (Resend). Beide in der `/app/emails`-Registry (`api/admin/email-templates/route.ts`) registriert mit Preview-Renderer.

---

## 8. Storefront (`storefront/src/app/community/`)

`community/layout.tsx` — flag-gated, rendert Sub-Navigation (`Feed · Explore · Lists · Dispatch · Members`) + Compose-FAB.

| Route | Inhalt |
|---|---|
| `/community` | Hub — Editorial-Hero + 2-Spalten-Grid (Feed + Discovery-Sidebar), Onboarding-Nudge |
| `/community/post/[slug]` | Post-Detail — 2-spaltig, Reactions, Comments, Save/Edit/Report, Sidebar |
| `/community/compose` | Post-Editor (Tiptap) — Create **und** Edit-Modus (`?edit=`), Anker-Picker, Mentions, Cover, Tags |
| `/community/members` | Member-Directory (Tier-Filter, Sort, Suche) |
| `/community/members/[handle]` | Member-Profil — Banner, Featured-Releases, Stats, Tabs (Posts/Comments/Reviews/Acquired/Lists) |
| `/community/settings` | Profil-Edit + Privacy-Toggles + Featured-Releases-Picker |
| `/community/onboarding` | First-Run-Profil-Setup |
| `/community/lists` · `/lists/new` · `/lists/[id]` | Lists-Directory, Anlegen, Detail (Owner-`ListManager`) |
| `/community/explore` | Suche (Posts/Members/Lists) + Discovery |
| `/community/dispatch` | Editorial-Spur |
| `/community/notifications` | Notification-Center |
| `/community/saved` | Bookmarks |
| `/community/tag/[slug]` | Posts nach Tag |

**Komponenten** (`storefront/src/components/community/`): `CommunityUI` (Avatar, TierLabel, Tag, PostCard, EditorialCard, ReleaseCardInline, ReactionSummary, timeAgo, readingTime), `CommunitySubNav`, `CommunityWidgets` (Hub-Sidebar), `HubFeed`, `CommunityNavDot`, `OnboardingNudge`, `PostEditor` + `mention` + `tiptap-embed`, `ReactionsBar`, `CommentSection`, `ReportButton`, `SaveButton`, `EditPostLink`, `FollowButton`, `ReleasePicker`, `TagInput`, `MembersBrowser`, `ProfileTabs`, `RatingStars`/`RatingHistogram`, `ReviewComposer`, `ReleaseCommunitySection` + `ReleaseReviews`, `ListCard`/`ListManager`, `ExploreBrowser`, `ComingSoon`. CSS: `app/community/community.css` (Vinyl-Culture; `.cm-root { overflow-x: clip }`).

**Katalog-Verzahnung:** Release-Detailseite → `ReleaseCommunitySection` (Discussion + Reviews + Histogramm). Band-/Label-/Press-Seiten → `EntityWall` (community-anchored Posts). Beide flag-gated.

**Lib:** `community-api.ts` (Server-Reads + Typen), `community-mutations.ts` (authentifizierte Client-Mutations).

**Nav:** globaler `Header.tsx` — flag-gated „Community"-Eintrag mit Live-Unread-Dot (`CommunityNavDot`); `MobileNav.tsx` flag-gated Eintrag.

---

## 9. Demo-Seed

`scripts/community_seed.py` (`--load` / `--purge` / `--dry-run` / `--pg-url`) — idempotenter Demo-Datensatz: 12 Profile, 6 Editorials, 20 Discussion-Posts, 9 Acquired-Posts, ~88 Comments, 30 Reviews, ~190 Reactions, ~61 Follows, 6 Lists. Demo-Zeilen tragen den Autor-ID-Präfix `cmpro_demo_` → von den Read-Routen ausgeblendet, wenn `COMMUNITY_DEMO` OFF. Vor dem Public-Launch via `--purge` durch echten FB-Migrations-Content zu ersetzen.

---

## 10. Gotchas (Community-spezifisch)

- **Flag-Gate überall:** jede Route via `requireCommunityEnabled()`; Storefront-Layout via `isCommunityEnabled()`.
- **Demo-Gate:** Read-Routen filtern `author_id LIKE 'cmpro_demo_%'` wenn `COMMUNITY_DEMO` OFF. Neue Read-Routen müssen das mitziehen.
- **Sanitizer:** `sanitizeBodyHtml` ist die einzige HTML-Bereinigung — neue erlaubte Tags/Embed-Hosts/Mention-Attribute nur dort.
- **Replica:** jede neue `community_*`-DDL parallel auf `vod_auctions_replica`; neue Tabelle → `ALTER PUBLICATION vod_auctions_pub ADD TABLE …` + `ALTER SUBSCRIPTION … REFRESH PUBLICATION`; **Replica zuerst** bei Spalten-Adds. CHECK-Constraint-Änderungen ebenfalls auf die Replica (sonst Replikations-Apply-Error).
- **Suche:** bewusst Postgres-ILIKE, kein Meili-Index (Community-Scale).
- **Acquired-Feed:** Job scannt Transaktionen, hooked **nicht** den Payment-Webhook.
- **Storefront-UI ausschließlich Englisch.**

---

## 11. Rebuild-Historie

| Phase | Inhalt | Release |
|---|---|---|
| R0 | Demo-Seed + Flag `COMMUNITY_DEMO` + Read-Route-Gating | rc58.0 |
| R1 | Storefront-Shell (Sub-Nav, FAB) + Hub (2-Spalten + Sidebar) | rc59.0 |
| R2 | Post-Detail, Per-Emoji-Reactions, Composer, `@`-Mentions | rc60.0 / rc60.1 |
| R3 | Member-Directory, Profil-Tabs, Onboarding | rc61.0 |
| R4 | Catalog-Anchored Discussion + Reviews + Histogramm | rc62.0 |
| R5 | Lists (+ gebündelter Schema-Slice: Featured/Privacy/Entity-Spalten) | rc63.0 |
| R6 | Acquired-Feed, Bookmarks, Notification-Dot, Email | rc64.0 |
| R7 | Suche + Explore | rc65.0 |
| R8 | Trust-Level-Job + Moderations-Admin-Politur | rc66.0 |
| R9 | Featured-Releases, Privacy-Toggles, Entity-Walls | rc67.0 |
| Erw. 01 | Post-Bearbeitung + Composer-Hinweis (+ Erw.-02-Scroll-Fix) | rc68.0 |

---

## 12. Offen

- **Erweiterung 02 (Kern)** — visuelle Optimierung / Density- + Mobile-Umbau. Wartet auf Robins Konzept; Input: [`SOCIAL_UX_REFERENCE.md`](./SOCIAL_UX_REFERENCE.md). Erster Fix (Horizontal-Scroll) ist in rc68.0 erledigt.
- **Schritt 2 — Facebook-Migration** (geparkt): P6-Import der 5.819 Frank-FB-Posts + Legacy-Reviews aus `3wadmin_tapes_comment`. Datenmodell vorbereitet (`imported_from`/`legacy_comment_id`/`legacy_extranet_user_id`/`claimed`). Offen: `typ`-Decode. Ersetzt den Demo-Seed als Launch-Content.
- **R8-Reste** (Feature-Slices, nicht launch-blockierend): Editorial-Scheduling, Curated-Tags-Tabelle, CRM-Customer-„Community"-Tab, Claude-Haiku-Auto-Mod.
- **Wantlist-Tab** auf dem Profil — wartet auf die Discogs-Wantlist-Brücke (`show_wantlist`-Toggle ist schon da).
