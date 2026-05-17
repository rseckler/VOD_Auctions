# Session 2026-05-16/17 — VOD Community Erweiterung 02 (Density Revision)

**Releases:** `v1.0.0-rc71.0` · `rc71.2` · `rc71.4` (Storefront-only)
**Scope:** Visuelle Verdichtung des Community-Bereichs — Erweiterung 02 aus [`docs/Community/Erweiterungen.md`](../Community/Erweiterungen.md) §02.

---

## Ablauf

1. **Konzept** — Robins Befund „Feed zu großzügig" in messbare Ziele übersetzt: [`ERWEITERUNG_02_KONZEPT.md`](../Community/ERWEITERUNG_02_KONZEPT.md) (Vorher→Nachher-Werte pro Komponente, Token-/Spacing-Skala).
2. **Design-Handoff** — [`ERWEITERUNG_02_DESIGN_HANDOFF.md`](../Community/ERWEITERUNG_02_DESIGN_HANDOFF.md): paste-fertiger Brief, mit dem Robin **Claude Design** (claude.ai/design) ein visuelles Mockup bauen ließ.
3. **Bundle** — Robin lieferte das Claude-Design-Handoff-Bundle (`api.anthropic.com/v1/design/h/7xW0G8VG…`, gzip-Tarball). Enthielt README + Chat-Transkript + `project/`-HTML-Prototyp mit **4 Screens als Before/After-Artboard-Paare**.
4. **rc71.0** — die „After"-Artboard (dichte randlose **Hairline-Liste**) in den Next.js-Code übersetzt: `community.css` + `CommunityUI.tsx` + neue `CommunityBottomNav.tsx`. Editorial-Hub-Hero entfernt.
5. **Robin-Review** — vier Befunde: (a) Cover fehlen auf Editorials, (b) Release-Detail-Sektion zu groß, (c) „Frank Maier" → muss „Frank Bull" sein, (d) Feed zu stark verändert (Robin verglich gegen die **Before**-Artboard).
6. **rc71.2** — Korrekturrunde nach Klärung (AskUserQuestion: kartenbasiert vs Hairline → **kompakte Karten**): Feed zurück auf Karten mit dichtem Innenraum, Editorial-Hero wiederhergestellt, Cover-Platzhalter, Release-Detail-Sektion verdichtet, Frank Bull (DB + Seed).
7. **rc71.4** — Robin-Befund: Post-Detailseite ohne Cover. Dekorativer Cover-Band-Platzhalter ergänzt; „Frank Maier"-Rest war stale ISR-Cache (DB war korrekt) → Deploy mit `.next/cache`-Clear.

## Endstand (rc71.4)

- **Feed:** kompakte Karten (`var(--card)`, Rahmen, 10px Radius), dichter Innenraum — 14px Padding, 36px Avatar, 14px/1.45-Body mit 4-Zeilen-Clamp, `.cm-feed` gap 10px.
- **Cover:** Thumbnail an jedem Post mit Release/Bild; fehlt das echte Bild → dekorativer `.cm-cover-art`-Platzhalter. Editorials immer mit Cover (Feed-Karte + Hero + Post-Detail-Band).
- **Release-Verknüpfung:** kompaktes Referenz-Pill (Mini-Cover + Titel + Artist + →).
- **Editorial:** Hub-Hero (groß) + dichte Editorial-Karten im Feed (Gold-Topline).
- **Mobile:** fixe 5-Slot-Bottom-Tab-Bar (`CommunityBottomNav`), ≤900px; Compose-FAB auf Mobile aus.
- **Profil:** kompakter Header (96px Avatar, 28px Name), Inline-Stats, Featured-Releases als 52px-Cover-Reihe.
- **Release-Detail-Community-Sektion:** Stats-Strip / Rating-Overview / Histogramm / Composer verdichtet.
- **Post-Detail-Leseansicht** bewusst unverändert großzügig (Kontrast: dicht im Feed, luftig im Lesen).

## Lessons

- **Claude-Design-Bundles enthalten Before/After-Artboard-Paare.** rc71.0 hat die „After" (radikale Hairline-Liste) unkommentiert umgesetzt; Robin verglich gegen die „Before" (Karten) → „warum so stark verändert". Lehre: bei strukturellem Redesign die strukturelle Entscheidung explizit machen/bestätigen, bevor gebaut wird — nicht die aggressivste Interpretation annehmen. Memory `feedback_design_handoff_before_after.md`.
- **Stale ISR-Cache ist kein Datenfehler.** `community-api.ts` cached Fetches mit `revalidate: N`; nach einem DB-Update zeigt die Seite bis zur nächsten Revalidierung alte Daten. Bei sichtbaren Daten-Diskrepanzen nach DB-Write: DB gegenprüfen, dann `.next/cache` beim Deploy leeren statt am Code zu suchen.

## Dateien

`storefront/src/app/community/community.css`, `components/community/CommunityUI.tsx`, neue `CommunityBottomNav.tsx`, `app/community/{layout,page}.tsx`, `members/[handle]/page.tsx`, `post/[slug]/page.tsx`, `scripts/community_seed.py`. Docs: `ERWEITERUNG_02_KONZEPT.md`, `ERWEITERUNG_02_DESIGN_HANDOFF.md`.

**Commits:** `71d4dfc`+`0f89a5e` (rc71.0) · `4cbc39e`+`c600cf5` (rc71.2) · `da70e1f`+`b56e30c` (rc71.4).
