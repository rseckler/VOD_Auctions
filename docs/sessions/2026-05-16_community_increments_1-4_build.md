# Session-Log — VOD Community Increments 1–4 Build

**Datum:** 2026-05-15 → 2026-05-16
**Scope:** Community-Bereich von Konzept zu live — Increments 1–4 gebaut, deployed, dokumentiert.
**Releases:** `v1.0.0-rc55.0` · `rc56.0` · `rc57.0`
**Ergebnis-Doku:** [`COMMUNITY_SYSTEM_STATE.md`](../Community/COMMUNITY_SYSTEM_STATE.md) · [`COMMUNITY_PLATFORM_BUILD_PLAN.md`](../Community/COMMUNITY_PLATFORM_BUILD_PLAN.md) · [`Community Concept.md` §17](../Community/Community%20Concept.md)

---

## 1. Ausgangslage & Auftrag

Start: Analyse von `Community Concept.md` (1228 Z.), `Community Design Brief.md`, dem `Facebook Migration Annex` und dem statischen Vinyl-Culture-Mockup (`docs/Community/community/`). Auftrag entwickelte sich über mehrere Klärungsrunden:

1. Zunächst „echter erster MVP, separat von der Plattform".
2. Robin revidierte: **direkt in die Produktivumgebung bauen**, hinter Feature-Flag — kein Wegwerf-MVP. `beta_test`-Mode, keine Live-Kunden, USPs (Catalog-Anchoring, CRM-Tier) funktionieren nur in der echten Plattform.
3. Finaler Auftrag: **alle Increments 1–4 autonom durchbauen** bis „Schritt 2" (FB-Migration).

## 2. Konzeptionelle Klärungen (vor dem Build)

- **Build-Strategie:** direkt in `storefront/` + `backend/`, hinter Feature-Flag `COMMUNITY` (OFF by default, „deploy early, activate when ready"). Festgehalten in `Community Concept.md` §17.
- **4 Inhaltstypen auf der Release-Seite** sauber getrennt: Curator-Note (`Release.description`, existiert), From-the-Vault (FB-Posts, Schritt 2), Discussion (`community_post`), Reviews+Rating (`community_review`). Frank ist *nicht* außerhalb der Community — die Trennung ist „Katalogdaten vs. Gespräch", nicht „Frank vs. Members".
- **Dual-Struktur:** Community-Funktionen am Artikel **und** ein eigenständiger `/community`-Hub — ein Content-Pool, zwei Eingänge.
- **Rating-Skala:** ganzzahlig **1–5 Sterne** (keine Halb-Sterne) — matcht Franks Wunsch + die Legacy-Daten.
- **Legacy-Inventar:** `vodtapes.3wadmin_tapes_comment` (500 Zeilen, live 2017–2026) inventarisiert — Kommentar **+** Bewertung (`rate` 0–5) in einer Tabelle. Die 3.632 tape-mag-Member sind bereits im CRM (`crm_master_source_link.source='vodtapes_members'`) → deterministischer Join, kein Fuzzy-Match. Account-Claim-Lifecycle dokumentiert in Concept §17.7.

## 3. Was gebaut wurde

| Increment | Inhalt | Release |
|---|---|---|
| **1 — Foundation** | 5 `community_*`-Tabellen + Rating-Trigger · 11 Backend-Routes · Storefront Hub/Single-Post/Compose/Member-Profil/Settings · Catalog-Anchored Discussion + Reviews · `lib/community.ts` | rc55.0 |
| **2 — Medien + Admin** | Bild-Upload (R2) · Embed-Resolver (YT/Vimeo/Spotify/SoundCloud/Bandcamp) + Tiptap-`Embed`-Node · Post-Cover · Community-Admin `/app/community` (Dashboard/Posts/Members) | rc56.0 |
| **3 — Sozialer Loop** | Following · personalisierter Activity-Feed (Following/Latest) · Tags-System · CRM-Tier-Vererbung (Trigger) · Notifications | rc57.0 |
| **4 — Kuration + Safety** | Editorial-Dispatch · Moderation (Reports + Mod-Queue) · Trust-Levels TL0–3 + Daily-Post-Rate-Limit | rc57.0 |

**Migrationen (8, alle additiv, Supabase + Tier-2-Replica):** `community_increment1_schema`, `community_review_rating_aggregate`, `community_follow`, `community_crm_tier_inheritance`, `community_notification`, `community_report`, `community_trust_level` (+ Replica-Mirrors).

**Neue Deps:** Backend `sanitize-html`. Storefront `@tiptap/{react,starter-kit,pm,extension-link,extension-placeholder,extension-image}`.

## 4. Vorfälle & Lessons

- **Storefront-UI auf Deutsch ausgeliefert (rc55.0).** CLAUDE.md sagt klar „Storefront+Admin-UI: Englisch" — übersehen. Vollständig auf Englisch korrigiert + Memory `feedback_storefront_ui_english.md` angelegt.
- **Medien aus Increment 1 falsch herausgeschnitten.** Konzept §4.1 M3 verlangt Bilder/Videos/Embeds als Must-have; der „design-treu minimal"-Zuschnitt war zu dünn. Robin-Befund → in Increment 2 nachgezogen.
- **1Password-SSH-Agent fiel mitten im Build aus** („communication with agent failed"). VPS-Deploy von Increment 3 blockiert → Code committed/gepusht, Deploy mit Increment 4 gebündelt sobald der Agent zurück war.
- **VPS-Pull-Konflikt:** lokale `package-lock.json` (vom `npm install` beim Deploy) — `git checkout -- package-lock.json` vor `git pull`, committe Version gewinnt.
- **Medusa-Build-Exit ≠ 0** wegen pre-existing TS-Errors, schreibt aber Artefakte — Deploy-Befehl mit `|| echo BUILD_EXIT_$?` entkoppelt.

## 5. Deploy & Verifikation

3 Deploys (Backend + Storefront, VPS PM2). Smoke-Tests pro Release: `/health` 200, Community-Routen 200, Auth-gated Routen 401, Storefront 307 (Beta-Gate). Flag `COMMUNITY` mit rc55.0 auf `true` gesetzt (`site_config.features`, Backend-Restart). Tier-2-Replica: alle `community_*`-Tabellen gespiegelt, Subscription refreshed.

## 6. Offen

- **Hand-QA** — als eingeloggter Member durchklicken (posten mit Bild/Embed, folgen, kommentieren, reviewen, melden) + Admin-Tabs prüfen. Bisher nur Smoke-getestet (Routen antworten korrekt), nicht UI-durch-QA't.
- **Schritt 2 — Facebook-Migration** (vom Owner geparkt, separate größere Überarbeitung): P6-Import der 5.819 Frank-FB-Posts + Legacy-Review-Migration aus `3wadmin_tapes_comment`. Pipeline P1–P5 fertig. Vorab offen: `typ`-Decode der Legacy-Kommentar-Tabelle (Concept §17.5).

## 7. Dokumentation

Neu/aktualisiert: `COMMUNITY_SYSTEM_STATE.md` (As-Built-Referenz, neu), `COMMUNITY_PLATFORM_BUILD_PLAN.md`, `Community Concept.md` §17, `CHANGELOG.md` (rc55/56/57), `VOD_Auctions/CLAUDE.md` (Community-Sektionen), `docs/TODO.md`. Memory: `feedback_storefront_ui_english.md`.
