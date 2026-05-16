# VOD Community — System State (As-Built)

**Status:** Increments 1–4 live · Stand 2026-05-16
**Releases:** `v1.0.0-rc55.0` (Inc 1) · `rc56.0` (Inc 2) · `rc57.0` (Inc 3+4)
**Bezug:** [`Community Concept.md`](./Community%20Concept.md) · [`COMMUNITY_PLATFORM_BUILD_PLAN.md`](./COMMUNITY_PLATFORM_BUILD_PLAN.md) · [`CHANGELOG.md`](../architecture/CHANGELOG.md)
**Zweck:** Verbindliche As-Built-Referenz des gebauten Community-Systems — Tabellen, Routes, Seiten, Komponenten, Dateien. Single Source of Truth für die laufende Arbeit am Community-Bereich.

---

## 1. Überblick

Community-Bereich auf vod-auctions.com — eigener sozialer Layer (Profile, Posts, Comments, Reactions, Reviews, Following, Tags, Notifications, Moderation) verzahnt mit dem Katalog. Nativ auf dem bestehenden Stack gebaut (Medusa-Backend + Next.js-Storefront + Supabase + Tiptap + R2), kein externes Forum.

**Feature-Flag:** `COMMUNITY` (`backend/src/lib/feature-flags.ts`, in `site_config.features`, **aktuell ON**, in `CLIENT_SAFE_FLAGS`). Flag OFF → gesamte `/community`-Surface + `/admin/community` + Discussion/Review-Tabs antworten 404.

**Plattform-Mode:** `beta_test` — alles hinter dem Passwort-Gate.

---

## 2. Datenbank — `community_*`-Tabellen

Alle in `public` (Supabase `bofblwqieuvmqybzxapx`), snake_case, additive Migrationen, auf die Tier-2-Replica gespiegelt + repliziert (`vod_auctions_pub`).

| Tabelle | Zweck | Increment |
|---|---|---|
| `community_profile` | Member-Profil (1:1 weich an Medusa-`customer` via `customer_id`; `legacy_extranet_user_id`/`claimed` für Shadow-Profile; `tier`, `is_curator`, `is_banned`, `trust_level`) | 1 / 4C |
| `community_post` | Posts — `kind` discussion\|editorial, `body_json/html`, `cover_image_url`, `tags text[]`, `release_id` (weicher Catalog-Anker), `status`, denorm. Counter | 1 |
| `community_comment` | Comments, eine Threading-Ebene (`parent_id`) | 1 |
| `community_reaction` | Reactions (7-Emoji-Set), `UNIQUE(profile,target_kind,target_id,emoji)` | 1 |
| `community_review` | Reviews — `rating` smallint 1–5, `release_id`, `UNIQUE(release_id,author_id)`, `imported_from`/`legacy_comment_id` für Legacy-Import | 1 |
| `community_follow` | Follow-Graph — PK(`follower_id`,`followed_id`) | 3A |
| `community_notification` | In-App-Notifications — `kind` comment\|reply\|follow\|mention\|editorial | 3E |
| `community_report` | Moderation-Reports — `reason`, `status` open\|reviewed\|actioned\|dismissed | 4B |

**Funktionen / Trigger:**
- `community_recompute_release_rating()` + Trigger `trg_community_review_rating` auf `community_review` → rollt `avg(rating)`/`count` in `Release.averageRating`/`ratingCount`.
- `community_sync_tier_from_crm()` + Trigger `trg_community_tier_from_crm` auf `crm_master_contact` (`AFTER UPDATE OF tier`, `WHEN tier changed`) → synchronisiert `community_profile.tier` aus dem CRM, Curators ausgenommen.

**Tier-Quelle:** `community_profile.tier` erbt aus `crm_master_contact.tier` (platinum/gold/silver/bronze/standard) — nicht manuell. `is_curator`-Profile behalten `tier='curator'`.

---

## 3. Backend-API-Routes

**Store** (`backend/src/api/store/community/`, Flag-gated, Middleware `allowUnauthenticated` — Auth-Context wenn eingeloggt, public Reads offen):

| Route | Methoden |
|---|---|
| `/posts` | GET (Feed: `release_id`/`kind`/`author`/`tag`/`feed=following`/`q`) · POST (Trust-Level-Rate-Limit) |
| `/posts/:id` | GET (id oder slug) · PATCH · DELETE (eigener Post) |
| `/posts/:id/comments` | GET · POST (erzeugt Notifications) |
| `/comments/:id` | DELETE |
| `/reactions` | POST (Toggle) |
| `/reviews` | GET (`?release_id=`) · POST (Create/Update, 1–5) |
| `/profile` | GET · PUT (eigenes Profil) |
| `/profiles/:handle` | GET (öffentlich + Stats + `is_following`) |
| `/upload` | POST (Bild → R2, base64, 20 MB Limit via middlewares.ts) |
| `/embed` | POST (URL → iframe-src; YouTube/Vimeo/Spotify/SoundCloud/Bandcamp) |
| `/follow` | POST (Toggle, erzeugt Notification) |
| `/tags` | GET (Trending, aggregiert `tags[]`) |
| `/notifications` | GET (Liste + unread) · POST (read markieren) |
| `/reports` | POST (Post/Comment melden) |

**Admin** (`backend/src/api/admin/community/`, Medusa-Admin-Auth + Flag-gated):

| Route | Methoden |
|---|---|
| `/dashboard` | GET (Counts + Recent) |
| `/posts` · `/posts/:id` | GET (Moderation-Liste) · PATCH (hide/pin/remove) |
| `/profiles` · `/profiles/:id` | GET (Member-Liste) · PATCH (tier/curator/ban) |
| `/reports` · `/reports/:id` | GET (Mod-Queue) · PATCH (resolve) |

**Shared Lib:** `backend/src/lib/community.ts` — `requireCommunityEnabled`, `getOrCreateProfile` (CRM-Tier-Inheritance), `getProfileByCustomerId`, `sanitizeBodyHtml` (sanitize-html, iframe-Embed-Allowlist), `excerptFromHtml`, `uniquePostSlug`/`uniqueHandle`, `recomputeReactionCount/CommentCount`, `fetchReleaseCards`, `createNotification`, `refreshTrustLevel`/`dailyPostLimit`, `serializeProfile`.

---

## 4. Storefront

**Seiten** (`storefront/src/app/community/`):

| Route | Inhalt |
|---|---|
| `/community` | Hub — Editorial-Hero + `HubFeed` (Following/Latest-Tabs) + Trending-Tags |
| `/community/post/[slug]` | Single-Post — Body, Reactions, Comments, Report |
| `/community/compose` | Post-Editor (Tiptap: Text, Bild, Embeds, Cover; `?release_id=` Anker) |
| `/community/members/[handle]` | Öffentliches Member-Profil + Follow-Button + Stats |
| `/community/settings` | Eigenes Profil bearbeiten |
| `/community/tag/[slug]` | Posts nach Tag + Popular Tags |
| `/community/notifications` | Notification-Center |
| `/community/dispatch` | Editorial-Spur (kind=editorial) |

`community/layout.tsx` flag-gated (`isCommunityEnabled` → `notFound()`). Release-Detailseite (`catalog/[id]`) bekommt die `ReleaseCommunitySection` (Discussion + Reviews), flag-gated.

**Komponenten** (`storefront/src/components/community/`): `CommunityUI.tsx` (MemberAvatar, TierLabel, Tag/TagLink, PostCard, EditorialCard, ReleaseCardInline, timeAgo), `PostEditor.tsx` (Tiptap), `tiptap-embed.ts` (Embed-Node), `ReactionsBar.tsx`, `CommentSection.tsx`, `RatingStars.tsx`, `ReviewComposer.tsx`, `ReleaseCommunitySection.tsx`, `FollowButton.tsx`, `HubFeed.tsx`, `ReportButton.tsx`. CSS: `app/community/community.css` (Vinyl-Culture, aus dem Mockup portiert).

**Lib:** `community-api.ts` (Server-Reads + Typen), `community-mutations.ts` (authentifizierte Client-Mutations + `CommunityError`).

**Nav:** `Header.tsx` + `MobileNav.tsx` — flag-gated „Community"-Eintrag.

---

## 5. Admin-UI

`/app/community` (9. Sidebar-Eintrag, `backend/src/admin/routes/community/page.tsx`) — Tabs **Dashboard** (Counts + Recent), **Posts** (Moderation), **Members** (Tier/Curator/Ban, Trust-Level-Badge), **Reports** (Mod-Queue).

---

## 6. Increment-Historie

| Increment | Inhalt | Release |
|---|---|---|
| 1 — Foundation | Profile, Posts, Comments, Reactions, Reviews, Hub, Catalog-Anchored | rc55.0 |
| 2 — Medien + Admin | Bild-Upload, Embeds, Post-Cover, Community-Admin | rc56.0 |
| 3 — Sozialer Loop | Following, Activity-Feed, Tags, CRM-Tier-Vererbung, Notifications | rc57.0 |
| 4 — Kuration + Safety | Dispatch, Moderation/Reports, Trust-Levels | rc57.0 |

**Neue Deps:** Backend `sanitize-html`. Storefront `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-image`.

---

## 7. Gotchas (Community-spezifisch)

- **Flag-Gate überall:** Jede Route via `requireCommunityEnabled()`; Storefront-Layout via `isCommunityEnabled()`. Flag OFF = 404.
- **Sanitizer:** `sanitizeBodyHtml` ist die einzige Stelle, an der Post-/Comment-HTML bereinigt wird. Bei neuen erlaubten Tags/Embed-Hosts dort ergänzen (`allowedTags`, `allowedIframeHostnames`, `allowedClasses`).
- **`tags`** ist eine `text[]`-Spalte auf `community_post` (keine Tag-Tabelle). Trending = `unnest`-Aggregat.
- **Tier ≠ manuell:** `community_profile.tier` wird vom CRM-Trigger überschrieben. Manuelles Setzen im Admin hält nur bei `is_curator=true`.
- **Nested Anchors:** `Tag` ist ein `<span>` (safe in Link-Cards), `TagLink` ein `<Link>` (nur außerhalb Link-gewrappter Kontexte).
- **Replica:** Jede neue `community_*`-DDL parallel auf `vod_auctions_replica` anwenden + `ALTER SUBSCRIPTION vod_auctions_sub REFRESH PUBLICATION`. `community_profile`-Spaltenänderungen sind replikationskritisch.
- **Storefront-UI ausschließlich Englisch.**

---

## 8. Offen — Schritt 2: Facebook-Migration

Nicht Teil von Increment 1–4. Separater Strang (vom Owner geparkt für eine größere Überarbeitung): P6-Import der 5.819 Frank-FB-Posts + Legacy-Review-Migration aus `vodtapes.3wadmin_tapes_comment` (500 Zeilen). Pipeline P1–P5 fertig (siehe Facebook Migration Annex). Vorab offen: `typ`-Decode der Legacy-Kommentar-Tabelle (Concept §17.5).

**Datenmodell ist vorbereitet:** `community_post.imported_from`/`historic_timestamp`-Felder bzw. `community_review.imported_from`/`legacy_comment_id`, `community_profile.legacy_extranet_user_id`/`claimed` (Shadow-Profile). Legacy-Reviewer-Mapping deterministisch über `crm_master_source_link` (Concept §17.7).
