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
