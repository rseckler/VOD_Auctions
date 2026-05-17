# Session 2026-05-16 — Discogs-Toolchain (rc69.0–rc71.3)

**Themen:** Inventory-Discogs-Fetch-Bugfix · Discogs-Backfill-Review-Tool ·
Tier-2-Replikations-Hotfix · Codex-Review-Nachbesserung.

---

## Ausgangspunkt

Frank meldete: im Inventory-Process (`/app/erp/inventory`, Erfassungs-Tab) zeigte
eine frisch über den Katalog verlinkte Discogs-Platte **keine** Markt-/Suggestion-
Daten, eine alt-verlinkte schon. Zweite Beobachtung: der Fetch ziehe „nur Bilder",
keine Credits/Tracklist. Wunsch zusätzlich: Discogs-Fetch direkt im Inventory-
Prozess auslösbar machen.

## rc69.0 — Inventory Discogs Fetch

**Root Cause:** Der Katalog-Discogs-Flow läuft seit rc51.9.2 über den
`DiscogsReviewModal` → `discogs-preview` → Apply (`POST /admin/media/:id`). Dieser
Pfad schrieb Genres/Styles/Credits/Cover/Galerie, aber **nie** die vier
`discogs_*_price`-Felder (2026-05-07 „M3" hatte den Marketplace-Fetch entfernt).
Die Preise kamen nur vom nächtlichen `discogs_daily_sync.py`-Cron — bei frisch
verlinkten Releases also Tage später. Der Inventory-Block ist auf `discogs_lowest
|| discogs_median` gegated → bei NULL ausgeblendet. Credits waren kein Gap
(kommen aus `extraartists`); Tracklist war ein echter Gap (nie gefetcht).

**Fixes:**
- **Fix 1:** `discogs-preview` fetcht `/marketplace/stats` + `/price_suggestions`
  wieder, liefert ein nicht-reviewbares `market`-Objekt; Apply-Pfad akzeptiert die
  4 Preis-Spalten + stempelt `discogs_last_synced`.
- **Fix 2:** `tracklist` als reviewbares Diff-Feld (gegen die `Track`-Tabelle),
  Apply ersetzt die `Track`-Rows wenn angehakt.
- **Erweiterung b:** der Erfassungs-Tab hat eine immer sichtbare „DISCOGS"-Sektion
  im Release-Panel — ID-Feld (auch ohne Link) + Fetch/Refetch, öffnet denselben
  `DiscogsReviewModal` wie der Katalog.

Konzept: [`INVENTORY_DISCOGS_FETCH_KONZEPT.md`](../optimizing/INVENTORY_DISCOGS_FETCH_KONZEPT.md).
Commits `a17dea7` (Fix 1+2) + Erweiterung b. Release rc69.0.

## rc70.0 — Discogs-Backfill-Review-Tool

**Gap-Analyse** der 5.211 verifizierten Releases
([`VERIFIED_RELEASES_DISCOGS_GAP_ANALYSIS_2026-05-16.md`](../optimizing/VERIFIED_RELEASES_DISCOGS_GAP_ANALYSIS_2026-05-16.md)):
3.734 vollständig, **1.246 verlinkt mit Lücken** (Genres/Styles/Credits/Tracklist),
166 ganz ohne Discogs-Link. Marktpreise sind separat (Cron-Sache).

**Tool** (`/app/discogs-backfill`, Sidebar-Shortcut „Discogs Backfill"): zeigt die
1.246 Kandidaten in einer Review-Tabelle `current → proposed` je Feld. Frank
akzeptiert pro Zeile oder im Bulk — **nichts automatisch**.
- Staging-Tabelle `discogs_backfill_candidate` (Migration via Supabase MCP).
- `POST /prepare`: Scan + rate-limitierter Discogs-Hintergrund-Fetch (~23 min,
  HTTP-entkoppelt, resume-fähig).
- `POST /apply`: rein additiv (nur leere Felder), je Release eigene Transaktion.
- `POST /reject`: Listen-Hygiene.

Konzept: [`DISCOGS_BACKFILL_TOOL_KONZEPT.md`](../optimizing/DISCOGS_BACKFILL_TOOL_KONZEPT.md).
Commit `c15a711`. Release rc70.0.

## rc71.1 — Hotfix: Tier-2-Replikation stand ~7 min

Email-Alert: `vod_auctions_sub` enabled, `pg_stat_subscription.latest_end_time`
NULL. **Root Cause:** `vod_auctions_pub` ist eine **schema-weite** Publication
(`FOR TABLES IN SCHEMA public`) — die rc70-Tabelle `discogs_backfill_candidate`
wurde automatisch publiziert, aber nicht zugleich auf der `pg17-replica` angelegt.
Beim ersten Write (Frank startete „Build candidate list") choke der Apply-Worker
auf der fehlenden Tabelle → Crash-Loop → gesamte Replikation gestoppt. Backups
liefen korrekt über den Supabase-Direct-Fallback (rc53.13 Lag-Guard). Der Slot
war gesund (`reserved`, kein `wal_removed`) → kein Re-Sync nötig.

**Fix:** Tabelle auf der Replica nachgezogen + `REFRESH PUBLICATION
WITH (copy_data=false)`. Verifiziert: `latest_end_time` füllt, Slot-WAL
171 MB → 16 MB, `pg_subscription_rel` 285/285 `r`.

**Lehre:** CLAUDE.md DB-Gotcha „Logical Replication" ergänzt — jede neue
`public`-Tabelle MUSS vor dem ersten Write auch auf der Replica angelegt werden;
es gibt kein „nicht replizieren" bei schema-weiter Publication. Release rc71.1
(kein Deploy — reine DB-Ops + Doku).

## rc71.3 — Codex-Review-Fixes

Codex-Review (`codex review --commit <SHA>`, direkter CLI-Call — Memory
`feedback_codex_review_direct_cli`) der beiden Code-Commits `a17dea7` + `c15a711`.
3 Findings, alle gefixt:

- **F1 [P1] Tracklist-Wipe:** Lieferte Discogs keine verwertbare Tracklist, war
  `proposed.tracklist=[]` — für ein Release mit lokalen Tracks ein default-
  angehakter `[N] → []`-Diff, dessen Apply die Tracklist löschte. Fix:
  `discogs-preview` schlägt leere Tracklist nicht als Diff vor; Apply ersetzt
  Track-Rows nur bei `length > 0`.
- **F2 [P2] `job_running` hing nach Backend-Restart:** GET meldete `job_running`
  anhand `fetch_pending > 0`. Fix: `prepareRunning`-Flag in
  `lib/discogs-backfill.ts`, GET meldet echten Worker-State + `stalled`-Flag,
  UI zeigt „Resume fetch".
- **F3 [P2] Markt-only-Apply blockiert:** Apply-Button bei 0 ausgewählten Feldern
  immer disabled. Fix: aktiv lassen, wenn Marktpreise vorliegen.

Commit `b42a444`. Release rc71.3.

## Offene Aktionen

1. **Frank:** im Tool `/app/discogs-backfill` „Build candidate list" klicken
   (1×, ~23 min Discogs-Fetch), dann die 1.246 Releases reviewen + akzeptieren.
2. Marktpreis-Lücke (181 Releases) — erledigt der `discogs_daily_sync.py`-Cron.
3. 166 verifizierte Releases **ohne** Discogs-Link — Handarbeit; optional
   Fuzzy-Match-Vorschlagsliste.

## rc71.5 — Compilation-Künstler, Notes, Tracklist-Reihenfolge (2026-05-17)

Frank-Befund: bei Samplern verschwanden nach einem Fetch die Per-Track-Künstler.
**Root Cause:** rc69 Fix 2 zog beim Tracklist-Fetch nur position/title/duration —
nicht das Per-Track-`artists`-Array von Discogs. Ein Refetch überschrieb
`"Algebra Suicide – Somewhat Bleecker Street"` mit nacktem `"Somewhat Bleecker
Street"`. **Fix:** Shared-Helper `lib/discogs-tracklist.ts` komponiert den
Künstler; Tracklist-Reihenfolge natürlich sortiert (statt lexikalisch
A1,A10,A11,A2); neue „Notes"-Sektion in der Storefront (`Release.description`).
**Remediation:** `refetch_compilation_tracklists.py` — 35 regressed Compilations
repariert. Commit `0b816ef`.

## rc71.6 — Per-Track-Künstler strukturiert: suchbar + klickbar (2026-05-17)

Folge-Befund (Robin): rc71.5 machte den Künstler sichtbar, aber als String in
`Track.title` gebacken → **nicht suchbar** („David Jackman" fand den Sampler
nicht) und **nicht klickbar**. Auslöser auch für die Arbeitsregel „umfassend
arbeiten" (Memory `feedback_work_comprehensively`, CLAUDE.md).

**Lösung** (vorab als Konzept durchgeplant — [`TRACK_ARTIST_STRUKTURIERT_KONZEPT.md`](../optimizing/TRACK_ARTIST_STRUKTURIERT_KONZEPT.md)):
neue Spalte `Track.artist_name` (Replica zuerst), `buildTracklist` strukturiert,
alle Writer + Track-CRUD + Modal + TrackManagement, Store-Route mit read-time
Slug-Auflösung (`LATERAL` auf `Artist.name`), Storefront-Tracklist-Link, Meili
`track_artists` + `search_text`-Trigger. **Un-Bake-Migration:** 6.071 gebackene
Track-Titel in 420 Compilations auseinandergezogen. **Meili Full-Rebuild**
(52.788 Docs). Nebenbei: `wait_for_task`-404-Toleranz gefixt (crashte den
Rebuild im Post-Swap-Schritt). Verifiziert: „david jackman" findet Flowmotion.
Commits `d2df839` + `f522550`.

## Releases

| Release | Commit | Inhalt |
|---|---|---|
| rc69.0 | `a17dea7` | Inventory Discogs Fetch (Preise + Tracklist + DISCOGS-Sektion) |
| rc70.0 | `c15a711` | Discogs-Backfill-Review-Tool |
| rc71.1 | `c9bbd1d` | Replikations-Hotfix + CLAUDE.md-Gotcha |
| rc71.3 | `b42a444` | Codex-Review-Fixes (3 Findings) |
| rc71.5 | `0b816ef` | Compilation-Künstler + Notes + Tracklist-Reihenfolge |
| rc71.6 | `d2df839` | Per-Track-Künstler strukturiert (suchbar + klickbar) |
