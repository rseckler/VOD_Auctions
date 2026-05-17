# Per-Track-Künstler strukturiert — Konzept

**Status:** ✅ Live (rc71.6, 2026-05-17) — deployed + verifiziert: Suche
„david jackman" findet Flowmotion (Meili + `search_text`), Storefront-Tracklist
liefert klickbare `artist_slug`. Un-Bake: 6.071 Tracks / 420 Compilations.
**Auslöser:** rc71.5 hat den Per-Track-Künstler bei Compilations als String in
`Track.title` gebacken (`"Algebra Suicide – Somewhat Bleecker Street"`). Folge:
der Künstler ist **nicht suchbar** (Suche „David Jackman" findet den Sampler
nicht) und **nicht klickbar** (kein Link zur Künstler-Seite).

## Ziel

Der Per-Track-Künstler wird ein **strukturiertes Feld** — daraus fallen Anzeige,
Suche und Klickbarkeit zusammen ab.

## Lifecycle-Trace (Ist-Zustand)

| Rolle | Stelle |
|---|---|
| **Writer Track** | `discogs-import/commit`, `media/[id]` (discogs-preview-Apply + tracks-Replace), `discogs-backfill/apply`, `media/[id]/tracks[/:trackId]` (manuelle CRUD) |
| **Reader Track** | `store/catalog/[id]` (Storefront-Tracklist), `media/[id]/tracks` (Admin TrackManagement), `discogs-preview` (current-Diff) |
| **Tracklist-Builder** | `lib/discogs-tracklist.ts::buildTracklist` (rc71.4, shared) |
| **Storefront-Render** | `catalog/[id]/page.tsx` — rendert `track.title` als Plain-Text |
| **Suche Storefront** | Meilisearch — `meilisearch_sync.py` hat KEINEN Track-Join |
| **Suche Admin** | Postgres-FTS `Release.search_text` — Trigger ohne Track |

## Designentscheidung

- **Eine neue Spalte `Track.artist_name TEXT`** — der Per-Track-Künstler.
  `Track.title` wird wieder der **reine Songtitel**.
- **KEINE `artist_id`-FK-Spalte.** Slug-Auflösung passiert **read-time** in der
  Store-Route (`LEFT JOIN LATERAL` auf `Artist` per `lower(name)`). Vorteil:
  immer aktuell (Künstler später angelegt → Link erscheint), kein FK-Backfill,
  eine Spalte weniger. Nachteil: Namens-Match kann bei Artist-Duplikaten
  unscharf sein → `LIMIT 1`, Best-Effort-Link, akzeptabel.
- `buildTracklist` bleibt pure function → liefert `artist_name` strukturiert,
  löst aber keine Slugs auf.

## Schema

`ALTER TABLE "Track" ADD COLUMN IF NOT EXISTS artist_name text;`
**Replica zuerst, dann Supabase** (`Track` ist im `public`-Schema → schema-weite
Publication → DDL muss auf der `pg17-replica` existieren, rc71.1-Lehre).

## Änderungen

1. **`lib/discogs-tracklist.ts`** — `BuiltTrack` += `artist_name: string | null`;
   `title` = reiner Songtitel (kein `"Artist – "`-Prefix mehr).
2. **Writer** — `discogs-import/commit`, `media/[id]`-Apply (Track-Replace),
   `discogs-backfill/apply`: `artist_name` mit-inserten. `discogs-preview`
   ProposedFields-`tracklist` trägt `artist_name`; Diff + `DiscogsReviewModal`-
   `TracklistCell` zeigen „Artist – Titel".
3. **`store/catalog/[id]`** — `tracks`-Query: `artist_name` selektieren +
   `LEFT JOIN LATERAL (SELECT slug FROM "Artist" WHERE lower(name)=lower(t.artist_name) LIMIT 1)`
   → `artist_slug` pro Track.
4. **`catalog/[id]/page.tsx`** — Tracklist: `artist_slug` → `<Link>` auf
   `/band/[slug]`, sonst `artist_name` Plain, dann ` – ` + `title`.
5. **Meili** — `meilisearch_sync.py`: pro Release `array_agg(DISTINCT artist_name)`
   aus `Track` → neues Doc-Feld `track_artists`; in `searchableAttributes`
   (`meilisearch_settings.json`); Full-Reindex.
6. **`search_text`** — Trigger-Funktion `update_release_search_text` um
   Track-Artists erweitern + neuer `Track`-AFTER-Trigger, der die Parent-Release-
   `search_text` neu kompiliert (Migration).
7. **Remediation** — `refetch_compilation_tracklists.py` erweitern: schreibt
   `artist_name` strukturiert + `title` clean. Deckt die rc71.5-gebackenen
   (35) UND die Legacy-371 mit `discogs_id` ab. Idempotent.

## Trade-offs (offengelegt)

- Klick-Link ist **Best-Effort**: nur wo der Track-Künstler als `Artist`-Row
  existiert. Track-Künstler ohne eigenen Katalog-Eintrag → Plain-Text. Bewusst
  kein find-or-create (würde den Artist-Bestand mit Karteileichen fluten).
- Namens-Match kann bei Artist-Duplikaten den „falschen" Slug treffen — für
  einen Link tolerabel; der Duplikat-Cleanup (Audit 2026-05-09) räumt das auf.
- Legacy-Compilations OHNE `discogs_id` bleiben mit gebackenem Titel (kein
  struktureller Künstler) — Rest-Posten, klein.

## Reihenfolge

Migration (Replica→Supabase) → buildTracklist → Writer/Modal → Store/Storefront
→ Meili+search_text → Remediation → Deploy rc71.6 + Reindex.
