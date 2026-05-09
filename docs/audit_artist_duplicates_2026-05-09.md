# Artist-Duplikate-Audit — 2026-05-09

**Anlass:** „Bowie / David Bowie"-Bug (Robin → Claude, 2026-05-09). Bei der Behebung kam raus, dass das **kein Einzelfall** ist — es gibt ~2.000 Cases im selben Pattern. Dieses Dokument ist die Worklist für Frank, damit jeder Künstler genau eine Row in der DB bekommt.

**Status:** Bowie ist gefixt (rc53.16, siehe „Referenzfall" unten). Alles andere wartet auf Franks Sichtung.

---

## 1. Was ist das Problem?

Die Artist-Stammdaten haben sich aus zwei Quellen gespeist:

| Quelle | Prefix | Stand |
|---|---|---|
| Frank's MO-ERP / tape-mag MySQL | `legacy-artist-<ID>` | Initial-Import 2026-03-01 |
| Discogs API | `discogs-artist-<ID>` | Discogs-Daily-Sync ab 2026-03-10, plus Discogs-Import-Tool |
| Manueller Import (rare) | `import-artist-<slug>` | Selten, Edge-Cases |

Beide Pipelines benutzen **`ON CONFLICT (id) DO NOTHING`** — d. h. wenn die Artist-Row mit einer ID schon existiert, wird sie nie überschrieben. Was sie aber **nicht** macht: prüfen ob es schon eine Row mit derselben Person unter einer anderen ID gibt. Resultat: Kraftwerk hat zwei Artist-Rows (`discogs-artist-4654` + `legacy-artist-492`), Depeche Mode auch, Bowie auch — und 2.060 weitere.

Die Storefront-Auswirkung ist hässlich:
- **Catalog-Liste** zeigt denselben Künstler mal als „Bowie", mal als „David Bowie" — abhängig davon, an welcher der beiden Rows der jeweilige Release hängt.
- **Search „david bowie"** findet die „Bowie"-Rows nicht (Meili-Token-Match), die User sehen nur einen Bruchteil des Katalogs.
- **Artist-Detail-Pages** sind aufgesplittet: 35 Beatles-Releases auf einer Seite, 35 weitere auf einer „The Beatles"-Seite — beide unvollständig.
- **Bulk-Listings / Newsletter-Selects** über Artist-Slug bringen ebenfalls nur eine Hälfte.

## 2. Referenzfall: Bowie → David Bowie (gefixt 2026-05-09)

**Vorher:**
- `discogs-artist-10263` Name=„Bowie", 72 ReleaseArtist-Links, 60 primary Releases
- `legacy-artist-10478` Name=„David Bowie", 16 ReleaseArtist-Links, 39 primary Releases
- Ein paar `Release.artist_display_name`-Overrides („David Bowie" auf 3 Releases, „David Bowie Music By Giorgio Moroder" auf Cat People)
- Storefront zeigte Mix von „Bowie", „David Bowie", „David Bowie Music By Giorgio Moroder"

**Nachher (atomic SQL-Block, eine Transaction):**
- `discogs-artist-10263` umbenannt: Name=„David Bowie", Slug=„david-bowie"
- 39 primary `Release.artistId`-Pointer von `legacy-artist-10478` → `discogs-artist-10263` umgeroutet
- 16 ReleaseArtist-Rows umgeroutet (6 dual-linked: Rollen gemerged, doppelte Row gedroppt; 10 exklusive: einfach umgepointert)
- `legacy-artist-10478` gelöscht
- `search_text` für 99 Releases neu gebaut (jetzt mit „david bowie")
- `search_indexed_at = NULL` für 99 Releases → Meilisearch-Cron hat sie 90 Sekunden später nachindiziert
- `Release.artist_display_name` auf den 3 Override-Releases auf NULL gesetzt (Cat People bleibt mit „David Bowie Music By Giorgio Moroder")

**Verify-Counts post-commit:** `canonical_name=David Bowie`, `legacy_artist_remaining=0`, `releases_now_correct=99`, `releases_orphaned=0`, `ra_orphaned=0`.

**Live-Test (api.vod-auctions.com):**
- Search „bowie" (For-Sale) → 128 Hits, alle als „David Bowie" gelabelt
- Search „david bowie" (For-Sale) → 496 Hits, Bowie-Items oben gerankt (David Murray etc. via Meili-Token-Drop hinten)

**Lehre für die Sync-Pipelines:** beide aktiven Sync-Jobs (`legacy_sync_v2.py` Hourly + `discogs_daily_sync.py` 02:00 + Discogs-Import-Tool) machen `ON CONFLICT (id) DO NOTHING` auf Artist-Inserts → **kein Risiko, dass der Fix zurückgeschrieben wird**. Aber: keiner der Pipelines deduppliziert proaktiv per Slug oder Discogs-ID, deswegen wachsen die Doppel kontinuierlich weiter.

## 3. Die drei Klassen von Duplikaten

### Klasse A — Exakt gleicher Name auf zwei Artist-Rows

**Scope:** 2.063 Künstlernamen tauchen ≥ 2× in der `Artist`-Tabelle auf, das sind **4.131 Artist-Rows mit 16.585 betroffenen Releases** (~40 % des Katalogs).

**Why it happens:** Discogs- und Legacy-Pipeline kennen einander nicht. Wenn Frank Kraftwerk in MO als „Kraftwerk" geführt hat → `legacy-artist-492`. Beim Discogs-Sync wird derselbe Künstler unter Discogs-ID 4654 als `discogs-artist-4654` mit Name „Kraftwerk" angelegt. Niemand merkt's, weil beide IDs eindeutig sind.

**Top-30 nach Release-Impact:**

| Name | Rows | Releases gesamt |
|---|---:|---:|
| Various | 2 | 5066 |
| Depeche Mode | 2 | 140 |
| John Cage | 2 | 105 |
| Laibach | 2 | 94 |
| Joy Division | 2 | 89 |
| Kraftwerk | 2 | 89 |
| Current 93 | 2 | 86 |
| Whitehouse | 2 | 84 |
| Coil | 2 | 80 |
| Big City Orchestra | 2 | 74 |
| Die Tödliche Doris | 2 | 73 |
| New Order | 2 | 65 |
| Severed Heads | 2 | 64 |
| Sleep Chamber | 2 | 60 |
| Karlheinz Stockhausen | 2 | 55 |
| Pink Floyd | 2 | 55 |
| John Coltrane | 2 | 54 |
| The Cure | 2 | 52 |
| Swans | 2 | 49 |
| Bourbonese Qualk | 2 | 47 |
| Sprung Aus Den Wolken | 2 | 47 |
| Tuxedomoon | 2 | 46 |
| De Fabriek | 2 | 45 |
| Rod Summers | 2 | 44 |
| Front 242 | 2 | 42 |
| Bauhaus | 2 | 41 |
| Non Toxique Lost | 2 | 40 |
| Skinny Puppy | 2 | 40 |
| Deutsch Amerikanische Freundschaft | 2 | 38 |
| S.Y.P.H. | 2 | 37 |

**Sonderfall „Various":** beide Rows (`discogs-artist-194` + `legacy-artist-3569`) sind „Various"-Container für Compilations. Merge ist trivial, aber muss **vorsichtig** sein, weil beide ggf. von ReleaseArtist-Credits referenziert werden, die nicht „Various" als primary haben sollten.

**Empfohlener Workflow pro Case (gleich wie Bowie):**
1. Canonical wählen — Default: die `discogs-artist-X`-Row, weil Discogs als Stammdaten-Quelle robuster ist.
2. Falls die Discogs-Row einen ungewöhnlichen Namen hat (z. B. nur „Bowie" statt „David Bowie"), Discogs-Page checken: `https://www.discogs.com/artist/<X>`. Wenn dort der Canonical-Name anders ist → Discogs-Row UMBENENNEN.
3. SQL-Block analog Bowie: rename → re-point primary `Release.artistId` → re-point + dedup `ReleaseArtist` → delete losing row → search_text-Rebuild → Meili-Reindex.

### Klasse B — „X" vs „The X"

**Scope:** ~50 high-confidence Cases. Beispiele:

| Short-Name | Releases | Long-Name | Releases | Wahrscheinlich same? |
|---|---:|---|---:|---|
| Sisters of Mercy | 82 | The Sisters Of Mercy | 22 | Ja |
| Legendary Pink Dots | 84 | The Legendary Pink Dots | 11 | Ja |
| Beatles | 35 | The Beatles | 35 | Ja |
| Hafler Trio | 35 | The Hafler Trio | 2 | Ja |
| Velvet Underground | 12 | The Velvet Underground | 9 | Ja |
| Mekons | 8 | The Mekons | 10 | Ja |
| Damned | 5 | The Damned | 13 | Ja |
| Birthday Party | 12 | The Birthday Party | 4 | Ja |
| Klinik | 14 | The Klinik | 2 | Ja |
| Cramps | 8 | The Cramps | 13 | Ja |
| Rolling Stones | 6 | The Rolling Stones | 9 | Ja |
| Doors | 7 | the Doors | 8 | Ja (Mini-„the") |
| Clash | 12 | the Clash | 14 | Ja |
| Cassandra Complex | 12 | The Cassandra Complex | 2 | Ja |
| Wirtschaftswunder | 8 | The Wirtschaftswunder | 5 | Ja |
| Kinks | 7 | The Kinks | 5 | Ja |
| B-52's | 3 | The B-52's | 9 | Ja |
| Vibrators | 3 | The Vibrators | 6 | Ja |
| Pogues | 4 | The Pogues | 2 | Ja |
| Haters | 39 | The Haters | 3 | Ja |
| Grief | 1 | The Grief | 9 | wahrscheinlich, prüfen |
| Coil | 67 | This Mortal Coil | 5 | **NEIN — verschiedene Bands!** |

**Wichtig:** „Coil" und „This Mortal Coil" sind zwei separate Bands und dürfen NICHT gemergt werden. Das Pattern „Substring-Match" findet auch echte Falsch-Positives (z. B. Solo-Künstler vs Trio-Variante). Frank muss Class B **manuell sichten**.

### Klasse C — „Bowie"-style: gleicher Künstler unter unterschiedlichen Namen

**Scope:** Schwer zu zählen. Bowie war hier der Nullte Treffer. Andere Cases die per Heuristik (≥ 3 gemeinsame Releases via ReleaseArtist) auftauchen, sind meistens **Bandkollegen oder Produzenten** (Florian Schneider + Ralf Hütter = Kraftwerk-Mitglieder, McCoy Tyner + John Coltrane = Quartett-Mitglieder, Roger Waters + David Gilmour = Pink Floyd) und **keine** Duplikate. Auch Producer-Cluster (Bob Thiele, Rudy Van Gelder, Reid Miles) tauchen prominent auf — die haben tatsächlich an 30+ Releases zusammen gearbeitet.

**Echte Bowie-style-Cases müssen Frank/Robin manuell sichten** — automatische Erkennung würde zu viele Falsch-Positives produzieren. Hinweis-Patterns:
- Künstler in MO-ERP nur unter Nachname geführt („Bowie" statt „David Bowie", „Reed" statt „Lou Reed") — wahrscheinlich Frank's interne Kurzform
- Discogs-Per-Credit-Variation: dieselbe Discogs-ID kann auf einem Release als „Bowie" gelistet sein, auf einem anderen als „David Bowie", je nachdem wie's auf dem Cover stand

**Auffällige Fragmente aus dem Heuristik-Run** (vermutlich `band_name`-Splitting-Bug, siehe RSE-321):
- `legacy-artist-11105` „FROM", `legacy-artist-6505` „Tape", `legacy-artist-8268` „NO", `legacy-artist-5820` „Sound", `legacy-artist-6093` „Peter", `legacy-artist-11264` „Love", `legacy-artist-1089` „Das", `legacy-artist-2648` „Ich"
- Sieht nach zerstückelten Multi-Artist-`band_name`-Strings aus (z. B. `"FROM TAPE NO SOUND"` oder `"DAS ICH"` wurden auf Whitespace gesplittet beim Import)
- → Diese Rows sollten gelöscht werden, sobald RSE-321 angegangen wird

## 4. Empfohlener Process für Frank

### Phase 1: Klasse A High-Impact (Top 30, ~1-2h)
Pro Künstler:
1. Beide Artist-Rows ansehen: Hat die `discogs-artist-X`-Row die Discogs-ID, die zum echten Discogs-Profil passt? (URL: `https://www.discogs.com/artist/<discogs-id>`)
2. Canonical-Namen prüfen — ist „Depeche Mode" auf Discogs auch „Depeche Mode"? Falls ja: Discogs-Row gewinnt.
3. Mir/Robin Bescheid geben pro Batch von 5-10 Künstlern. Wir feuern den SQL-Block ab analog zu Bowie.

### Phase 2: Klasse A Long Tail (Rest der 2.063, ~10h)
Selbe Workflow, aber Frank kann 50 auf einmal machen. Wir können auch ein semi-automatisches Skript schreiben, das die `discogs-artist-X`-Row als Default-Winner nimmt und nur die Fälle hervorhebt wo:
- Beide Rows haben unterschiedlichen Namen (Bowie-Style — Klasse C-Markierung)
- Die Discogs-Row ist die mit weniger Releases (ungewöhnlich → manuell prüfen)
- Beide Rows sind `legacy-artist-` (kein Discogs-Anker — manuell wählen)

### Phase 3: Klasse B (~50 Cases, 1-2h)
Substring-Liste durchgehen, „Coil/This Mortal Coil"-Falsch-Positives rausfischen. Default: lange Form (mit „The") gewinnt — das ist die Discogs-Norm.

### Phase 4: Klasse C (Tag-Aufgabe)
Per Hand. Robin und ich machen Vorschläge basierend auf Discogs-Lookup für Künstler mit ungewöhnlichen Kurzformen.

### Phase 5: Sync-Pipeline-Härtung (Backlog)
Die Pipelines verhindern aktuell nicht das Wachstum neuer Duplikate. Drei Fixes als RSE-Tickets denkbar:
- `legacy_sync_v2.py` checkt vor dem INSERT auf `slug`-Kollision (UNIQUE-Constraint existiert) und linkt MySQL-`band_id` an die existierende Discogs-Row
- `discogs-import/commit/route.ts` prüft sowohl `slug` als auch existierende `legacy-artist-X`-Rows mit gleichem Namen
- Nightly-Audit-Cron `audit_artist_duplicates.py`, der genau dieses Doc neu generiert und an Frank schickt wenn neue Duplikate auftauchen

## 5. SQL-Helfer für Frank

### Vollständige Klasse-A-Liste als CSV exportieren

Im Supabase Studio (SQL Editor) ausführen, dann „Download" oben rechts:

```sql
WITH name_dup AS (
  SELECT name FROM "Artist"
  WHERE name IS NOT NULL AND TRIM(name) <> ''
  GROUP BY name HAVING COUNT(*) > 1
)
SELECT
  a.name AS artist_name,
  a.id AS artist_id,
  CASE WHEN a.id LIKE 'discogs-artist-%' THEN 'discogs'
       WHEN a.id LIKE 'legacy-artist-%' THEN 'legacy'
       WHEN a.id LIKE 'import-artist-%' THEN 'import'
       ELSE 'other' END AS source,
  a.slug,
  (SELECT COUNT(*) FROM "Release" WHERE "artistId" = a.id) AS releases_primary,
  (SELECT COUNT(*) FROM "ReleaseArtist" WHERE "artistId" = a.id) AS releaseartist_links,
  CASE WHEN a.id LIKE 'discogs-artist-%'
       THEN 'https://www.discogs.com/artist/' || REPLACE(a.id, 'discogs-artist-', '')
       ELSE NULL END AS discogs_url
FROM "Artist" a
WHERE a.name IN (SELECT name FROM name_dup)
ORDER BY a.name, a.id;
```

### Detail-Check pro Künstler

Beim Bearbeiten eines konkreten Falls einfach den Namen einsetzen:

```sql
SELECT
  a.id, a.name, a.slug,
  CASE WHEN a.id LIKE 'discogs-artist-%' THEN 'discogs' ELSE 'legacy' END AS source,
  (SELECT COUNT(*) FROM "Release" WHERE "artistId" = a.id) AS releases_primary,
  (SELECT COUNT(*) FROM "ReleaseArtist" WHERE "artistId" = a.id) AS ra_links,
  CASE WHEN a.id LIKE 'discogs-artist-%'
       THEN 'https://www.discogs.com/artist/' || REPLACE(a.id, 'discogs-artist-', '')
       ELSE NULL END AS discogs_url
FROM "Artist" a
WHERE a.name = 'Depeche Mode'   -- ← Name hier eintragen
ORDER BY releases_primary DESC;
```

### Merge-SQL-Template (analog zum Bowie-Fix)

**Vorsicht:** Vor jedem Run die Counts in der Verify-Section prüfen. Ein User-Confirm pro Künstler.

```sql
BEGIN;

-- Variablen: WINNER_ID, LOSER_ID, optional CANONICAL_NAME, CANONICAL_SLUG
-- z. B.: WINNER_ID = 'discogs-artist-2725', LOSER_ID = 'legacy-artist-7928'

-- 1) Optional: Winner umbenennen falls Discogs-Canonical-Name korrekter ist
-- UPDATE "Artist"
-- SET name = '<CANONICAL_NAME>', slug = '<CANONICAL_SLUG>', "updatedAt" = NOW()
-- WHERE id = '<WINNER_ID>';

-- 2) Primary-Pointer umrouten
UPDATE "Release"
SET "artistId" = '<WINNER_ID>'
WHERE "artistId" = '<LOSER_ID>';

-- 3) ReleaseArtist Dedup für dual-linked Rows: Rollen mergen, Loser-Row droppen
UPDATE "ReleaseArtist" ra_keep
SET role = TRIM(BOTH ', ' FROM
  CONCAT_WS(', ',
    NULLIF(ra_keep.role, ''),
    (SELECT NULLIF(ra_drop.role, '')
     FROM "ReleaseArtist" ra_drop
     WHERE ra_drop."releaseId" = ra_keep."releaseId"
       AND ra_drop."artistId" = '<LOSER_ID>')
  ))
WHERE ra_keep."artistId" = '<WINNER_ID>'
  AND EXISTS (
    SELECT 1 FROM "ReleaseArtist" ra_drop
    WHERE ra_drop."releaseId" = ra_keep."releaseId"
      AND ra_drop."artistId" = '<LOSER_ID>'
  );

DELETE FROM "ReleaseArtist"
WHERE "artistId" = '<LOSER_ID>'
  AND "releaseId" IN (
    SELECT "releaseId" FROM "ReleaseArtist" WHERE "artistId" = '<WINNER_ID>'
  );

-- 4) Restliche ReleaseArtist-Rows umrouten
UPDATE "ReleaseArtist"
SET "artistId" = '<WINNER_ID>'
WHERE "artistId" = '<LOSER_ID>';

-- 5) Loser-Artist löschen
DELETE FROM "Artist" WHERE id = '<LOSER_ID>';

-- 6) Search-Text-Rebuild + Meili-Reindex
UPDATE "Release"
SET "artistId" = "artistId",   -- no-op fires update_release_search_text
    search_indexed_at = NULL   -- explicit: trigger_release_indexed_at_self skipts no-op
WHERE "artistId" = '<WINNER_ID>';

-- Verify
SELECT
  (SELECT COUNT(*) FROM "Artist" WHERE id = '<LOSER_ID>') AS loser_remaining,
  (SELECT COUNT(*) FROM "Release" WHERE "artistId" = '<LOSER_ID>') AS releases_orphaned,
  (SELECT COUNT(*) FROM "ReleaseArtist" WHERE "artistId" = '<LOSER_ID>') AS ra_orphaned,
  (SELECT name FROM "Artist" WHERE id = '<WINNER_ID>') AS winner_name,
  (SELECT COUNT(*) FROM "Release" WHERE "artistId" = '<WINNER_ID>') AS winner_releases;

COMMIT;
```

## 6. Kontakt

- **Bowie-Fix:** Robin + Claude, 2026-05-09 (rc53.16)
- **Audit-Doc:** Claude (auf Robin's Auftrag)
- **Frank's Sichtung:** über E-Mail an `support@vod-auctions.com` mit Subject „[Artist-Audit] <Künstler> — winner=<id>" pro Batch, oder direkt via SQL-Run im Supabase-Studio nach kurzer Abstimmung mit Robin.

---

**Letztes Update:** 2026-05-09 nach Bowie-Fix
