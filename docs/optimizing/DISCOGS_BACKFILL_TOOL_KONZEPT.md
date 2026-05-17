# Discogs-Metadaten-Backfill — Review-Tool

**Status:** ✅ Live (rc70.0, 2026-05-16). Codex-Review-Nachbesserung **rc71.3**: F2 —
`job_running` spiegelt jetzt den echten Worker-State (`prepareRunning`-Flag in
`lib/discogs-backfill.ts`) statt `fetch_pending > 0`; nach einem Backend-Restart
zeigt die UI „Resume fetch" statt endlos zu pollen. Offen: Frank baut die
Kandidatenliste auf und reviewt.
**Auslöser:** Gap-Analyse [`VERIFIED_RELEASES_DISCOGS_GAP_ANALYSIS_2026-05-16.md`](VERIFIED_RELEASES_DISCOGS_GAP_ANALYSIS_2026-05-16.md)
— 1.246 verifizierte, mit Discogs verlinkte Releases fehlen Genres/Styles/Credits/Tracklist.

## Ziel

Ein Admin-Tool, das alle Backfill-Kandidaten in einer Review-Tabelle zeigt
(current → proposed je Feld). Frank akzeptiert pro Zeile oder im Bulk —
**nichts passiert automatisch**. Erst „Accept" schreibt.

Robins Entscheidung (2026-05-16): **Voll-Vorschau** — Discogs-Daten werden vorab
gezogen und gespeichert, die Tabelle zeigt die konkreten neuen Werte.

## Scope

- Kandidaten = verifiziert (`erp_inventory_item.last_stocktake_at` gesetzt)
  **+** `discogs_id` gesetzt **+** mindestens eines fehlt: Genres, Styles, Credits, Tracklist.
- **Marktpreise sind NICHT Teil dieses Tools** — die deckt der `discogs_daily_sync.py`-Cron
  ab (Analyse Option B). Spart ~2 zusätzliche API-Calls pro Release.
- Schreiben ist **rein additiv**: nur leere Felder werden gefüllt, niemals etwas
  überschrieben. Re-Check der Leerheit beim Apply (nicht beim Scan) — falls Frank
  zwischendurch im Katalog editiert hat.

## Architektur

### Staging-Tabelle `discogs_backfill_candidate`

Transiente Operations-Tabelle (Daten aus Discogs jederzeit rekonstruierbar).

> **Korrektur (rc71.1, 2026-05-16):** Die ursprüngliche Annahme „bewusst nicht in
> `vod_auctions_pub`" war falsch. `vod_auctions_pub` ist eine **schema-weite**
> Publication (`FOR TABLES IN SCHEMA public`) — die Tabelle wurde automatisch
> publiziert. Da sie beim Anlegen nicht zugleich auf der `pg17-replica` erstellt
> wurde, ist der Apply-Worker von `vod_auctions_sub` beim ersten Write
> crash-geloopt und die Replikation stand ~7 min. Fix: Tabelle auf der Replica
> nachgezogen + `REFRESH PUBLICATION WITH (copy_data=false)`. Die Tabelle **wird**
> jetzt repliziert (harmlos, klein). Lehre in CLAUDE.md DB-Gotcha „Logical
> Replication" verankert.

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | text PK | `dbc_<release_id>` |
| `release_id` | text UNIQUE | FK `Release.id` |
| `discogs_id` | int | |
| `status` | text | `fetch_pending` → `pending` → `applied` / `rejected` / `error` |
| `gaps` | text[] | beim Scan ermittelt: `genres`/`styles`/`credits`/`tracklist` |
| `proposed` | jsonb | `{ genres, styles, credits, tracklist }` — beim Fetch befüllt |
| `error` | text | Discogs-Fetch-Fehler |
| `fetched_at` / `applied_at` | timestamptz | |
| `applied_by` | text | actor |
| `created_at` / `updated_at` | timestamptz | |

### Backend-Routen `/admin/discogs-backfill/`

- **`GET /`** — Liste (JOIN `Release` für current-Werte + Cover + Artist/Title),
  Status-Counts, Job-Fortschritt (`fetch_pending`-Count). Filter `?status=`.
- **`POST /prepare`** — (1) Scan: Kandidaten ermitteln + als `fetch_pending` inserten
  (idempotent, `ON CONFLICT DO NOTHING`). (2) Hintergrund-Job: jede `fetch_pending`-Zeile
  von Discogs `releases/:id` ziehen, `proposed` füllen, `status='pending'`.
  Rate-limit ~1,1 s/Call (~57/min, sicher unter Discogs' 60/min) → ~1.246 Calls ≈ 23 min.
  HTTP-entkoppelt (`void (async()=>…)()`, Route returnt 200, UI pollt). Resume-fähig:
  erneuter Aufruf verarbeitet übrige `fetch_pending`.
- **`POST /apply`** — `{ release_ids[] }` — pro Release: Release frisch lesen, nur noch
  leere Felder mit `proposed` füllen (Genres/Styles/Credits direkt, Tracklist als
  `Track`-Insert wenn 0 Rows), `discogs_last_synced` + `search_indexed_at=NULL` bumpen,
  `status='applied'`. Audit-Log-Eintrag.
- **`POST /reject`** — `{ release_ids[] }` — `status='rejected'` (aus der Pending-Sicht raus).

### Admin-Page `/app/discogs-backfill`

`backend/src/admin/routes/discogs-backfill/page.tsx` — kein Sidebar-Eintrag
(`defineRouteConfig` weggelassen), erreichbar per URL + Sidebar-Shortcut.

- Leerzustand → Button „Build candidate list" → `POST /prepare`, Progress-Bar pollt.
- Tabelle: Cover · Artist – Title · CatNo · Discogs-Link · je Feld `current → proposed`
  · Checkbox. Status-Tabs (Pending / Applied / Rejected / Error).
- Aktionen: „Accept selected" / „Reject selected" + Select-all. Pro-Zeile-Accept.
- Additiv-Hinweis sichtbar: „Only fills empty fields — never overwrites."

## Reihenfolge

1. Migration `discogs_backfill_candidate`.
2. Backend-Routen (GET / prepare / apply / reject) + Shared-Lib.
3. Admin-Page.
4. Deploy + CHANGELOG + Release-Tag.

Keine Storefront-Änderung. `discogs-backfill` enthält kein „test" → Scanner-safe.

---

## Erweiterung — Discogs-Notes (`Release.description`) als 5. Backfill-Feld

**Status:** ✅ Implementiert (2026-05-17, Deploy ausstehend). `description`/Notes ist
das 5. Backfill-Feld: Gap-Erkennung + Re-Open bestehender Kandidaten + Fetch + Apply
(mit `locked_fields`-Merge) + Storefront-Revalidation + Admin-„Notes"-Spalte.
**Auslöser:** Frage 2026-05-17 — fehlt im Backfill-Tool das Thema „Notes von Discogs"?

### Datenlage (DB-Stand 2026-05-17, vor dem Deploy)

5.209 verifizierte + Discogs-verlinkte Releases. `description`-Verteilung:

| Zustand | Anzahl | Vom additiven Backfill erreichbar? |
|---|---|---|
| `description` leer (NULL/`''`) | **197** | ✅ ja — das ist die Zielmenge |
| `description` = HTML-Scrape-Müll (`<…>`-Tags) | **2.019** | ❌ nein — nicht leer, additiv tabu |
| `description` = sauberer Text | 2.993 | — (kein Gap) |

Das Backfill-Tool war bei dieser Prüfung bereits **voll durchgelaufen**: 1.226
Kandidaten `applied`, 20 `error`, 0 offen. Davon haben **63 `applied`-Zeilen
weiterhin leere `description`** — sie wurden vor der description-Erweiterung
abgeschlossen und kennen den Gap nicht. Der Scan (Schritt 1b) öffnet sie wieder.

> **Wichtig — Reichweite:** Der additive Backfill erreicht **197 Releases**. Die
> **2.019 HTML-Müll-Releases sind die eigentliche Masse** und bleiben unberührt
> (siehe Trade-off 1). Ihr Cleanup ist eine separate *Overwrite*-Operation
> (`/media/:id`-Modal oder Remediation-Script) und **nicht** Teil dieser
> Erweiterung — bewusste Entscheidung, kein Versehen.

### Befund

Discogs liefert pro Release ein `notes`-Freitextfeld. Es wird im **Katalog-Flow
`/media/:id`** (discogs-preview → `DiscogsReviewModal`) bereits als reviewbares
Diff-Feld gefetcht und auf `Release.description` gemappt:

```
backend/src/api/admin/media/[id]/discogs-preview/route.ts:265
  description: apiData.notes?.trim() || null
```

rc71.5 (Bug a) hat dafür die Storefront-„Notes"-Sektion auf `/catalog/[id]`
ergänzt. Das **Backfill-Tool** deckt `notes` an drei Stellen NICHT ab:

| Stelle | Datei | Status |
|---|---|---|
| Gap-Erkennung | `discogs-backfill/prepare/route.ts` | prüft nur `genres`/`styles`/`credits`/`tracklist` |
| Fetch | `lib/discogs-backfill.ts` (`BackfillProposed`) | zieht `notes` nicht |
| Apply | `discogs-backfill/apply/route.ts` | schreibt `description` nicht |

Der ursprüngliche rc70-Scope (Genres/Styles/Credits/Tracklist) war eine bewusste
Grenze — `description` war nie drin. Inhaltlich inkonsistent: der per-Release-Flow
kann notes, das Bulk-Tool nicht.

### ⚠️ Lifecycle-Trace — `Release.description` hat einen permanenten Sync-Writer

`description` ist **das einzige Backfill-Kandidatenfeld mit Cron-Overwrite-Hazard.**
Geprüft gegen alle permanenten Syncs (Stand 2026-05-17, nach den gestrigen
rc69–rc71.3-Änderungen):

| Sync (Cron) | Schreibt `description`? | Schreibt genres/styles/credits/tracklist? |
|---|---|---|
| `legacy_sync_v2.py` (stündlich) | **JA** — aus MySQL `moreinfo`/`text` | nein (gar nicht) |
| `discogs_daily_sync.py` (Mo–Fr 02:00) | nein (nur `discogs_*_price`) | nein |
| `meilisearch_sync.py` (*/5) | nein (read-only auf `Release`) | nein |

`legacy_sync_v2.py` schreibt `description` in **beiden** UPSERT-Pfaden
(Music-Release Z. 749–750, Literatur Z. 1130–1131), gated **nur** durch:

```sql
description = CASE WHEN "Release".locked_fields @> '"description"'::jsonb
                   THEN "Release".description ELSE EXCLUDED.description END
```

**Konsequenz:** Schreibt das Backfill-Tool saubere Discogs-Notes in `description`,
**ohne `"description"` in `locked_fields` einzutragen, überschreibt der nächste
stündliche Sync sie wieder mit dem Legacy-Wert** (oft HTML-Scrape-Müll). Der
Backfill wäre innerhalb einer Stunde verloren.

- Der `/media/:id`-Flow ist safe — die Catalog-Edit-Route trägt geänderte
  Body-Felder automatisch in `locked_fields` ein (rc51.0 Sync-Lock-Modell).
- Die Backfill-`apply`-Route schreibt via rohem `trx("Release").update()` und
  fasst `locked_fields` **nie** an. Für genres/styles/credits/tracklist ist das
  zufällig safe (kein Sync-Writer) — für `description` **nicht**.

### Trade-offs (explizit)

1. **Additiv erreicht die rc71.5-Fälle NICHT.** Backfill-Apply ist „rein additiv —
   nur leere Felder". HTML-Müll-`description` ist **nicht leer** → wird nie als Gap
   erkannt, nie überschrieben. Die rc71.5-„Selbstheilung" ist explizit ein
   *Overwrite* (Müll → sauber) und bleibt Sache des `/media/:id`-Modals bzw. eines
   Remediation-Scripts. Das Backfill-Tool fasst nur **echt-leere** `description`-
   Releases an. Bewusste Scope-Grenze, keine Lösung für die HTML-Müll-Releases.

2. **Discogs-`notes` enthält BBCode-Markup** (`[a=Artist]`, `[url=…]`, `[l=Label]`).
   Die Storefront-Notes-Sektion (rc71.5) überspringt nur HTML-Tags (`<…>`), nicht
   BBCode → BBCode würde sichtbar gerendert. Das ist ein **bestehendes** Verhalten
   des `/media/:id`-Flows (schreibt ebenfalls rohes `apiData.notes`); die Erweiterung
   verschlechtert nichts, erbt es aber. Optional: BBCode-Strip im Shared-Helper.

3. **Storefront-Revalidation.** Die rc70-`apply`-Route rief kein
   `revalidateReleaseCatalogPage` — die neue Notes-Sektion (und schon Tracklist/
   Genres) erschien erst nach ISR-Cache-Ablauf (60s). ✅ Mit dieser Erweiterung
   behoben: Apply revalidiert jetzt nach jedem geschriebenen Release — für alle
   Backfill-Felder, nicht nur `description`.

### Umsetzung (implementiert 2026-05-17)

1. **Gap-Erkennung** (`prepare/route.ts`, Scan-Schritt 1): `'description'` in
   CASE + WHERE ergänzt, Bedingung `r.description IS NULL OR r.description = ''`
   — bewusst nur echt-leere. Erfasst neue Kandidaten.
1b. **Re-Open** (`prepare/route.ts`, neuer Schritt 1b): `applied`/`error`-Zeilen,
   deren `gaps`-Array `'description'` NICHT enthält (= vor der Erweiterung
   abgeschlossen) und deren `description` heute leer ist, werden auf
   `fetch_pending` zurückgesetzt (`proposed=NULL` erzwingt frischen Fetch). Der
   Guard `NOT ('description' = ANY(gaps))` verhindert Dauer-Churn — nach dem
   Re-Fetch enthält `gaps` `'description'`, also nie wieder. Fängt die 63
   `applied`-Zeilen mit leerer `description`.
2. **Fetch** (`lib/discogs-backfill.ts`): `notes` in `DiscogsRelease` +
   `description` in `BackfillProposed`; `fetchDiscogsRelease` liefert
   `description = data.notes?.trim() || null` (roh, kein BBCode-Strip —
   konsistent mit dem `/media/:id`-Flow).
3. **Apply** (`apply/route.ts`): `description` additiv schreiben **UND**
   `"description"` per `CASE … locked_fields || '"description"'::jsonb` in
   `locked_fields` mergen (idempotent) — sonst Cron-Overwrite. Re-Check
   `description IS NULL OR ''` beim Apply.
4. **Storefront-Revalidation**: `revalidateReleaseCatalogPage(releaseId)` nach
   jedem Apply mit `fieldsWritten.length > 0` — gilt für ALLE Backfill-Felder
   (Genres/Tracklist/Notes sind auf `/catalog/[id]` sichtbar), nicht nur
   `description`. Schließt die latente ISR-Cache-Lücke des rc70-Tools mit.
5. **Admin-UI** (`page.tsx` + GET `route.ts`): „Notes"-Spalte zwischen Credits
   und Tracklist, `current.description` aus dem GET, `DiffCell` analog Credits.
6. Migration: keine — `proposed` ist `jsonb`, `gaps` ist `text[]`, beide nehmen
   den neuen Wert ohne Schema-Change. Kein Replica-DDL nötig.
7. Offen: Deploy (Backend + Admin-UI, VPS Vite-Cache-Clear) + CHANGELOG +
   Release-Tag. Frank muss danach 1× „Re-scan candidates" klicken — der Scan
   öffnet die 63 + nimmt die ~134 neuen auf, dann Fetch (~3–4 min) + Review.

### Bestätigung — gegen die gestrigen Änderungen geprüft

Geprüft gegen rc69.0–rc71.3 (2026-05-16) + rc71.5/rc71.6 (2026-05-17):

- **rc69.0** — `discogs-preview` fetcht Marktpreise + Tracklist; berührt
  `description` nicht. Kein Konflikt.
- **rc70.0** — Backfill-Tool selbst; diese Erweiterung baut additiv darauf auf.
- **rc71.3 F1 (Tracklist-Wipe)** — betrifft nur den Track-Replace-Pfad; ein
  `description`-Diff hat keinen Lösch-Pfad (Skalar-Feld, additiv).
- **rc71.5 Bug a (Notes)** — hat den `/media/:id`-Notes-Flow + Storefront-Sektion
  gebaut. Diese Erweiterung ist das Bulk-Pendant; die „self-healing"-Overwrite-
  Semantik aus rc71.5 wird bewusst NICHT übernommen (siehe Trade-off 1).
- **rc71.6 (Track.artist_name)** — betrifft nur Tracklist, nicht `description`.
- **Permanente Syncs:** `legacy_sync_v2.py` ist der einzige `description`-Writer
  und respektiert `locked_fields` → Schritt 3 (locked_fields-Merge) macht den
  Backfill kollisionsfrei. `discogs_daily_sync.py` und `meilisearch_sync.py`
  schreiben `description` nicht. Nach der Erweiterung läuft kein Sync gegen den
  Backfill-Write.
