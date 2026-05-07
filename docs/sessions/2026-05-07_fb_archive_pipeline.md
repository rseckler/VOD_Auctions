# 2026-05-07 — FB-Archive Pipeline + Operations Tracker (rc53.11)

## Kontext

Frank hat 2026-05-07 seinen **vollständigen Facebook-Datenexport** für das Profil „Vinyl On Demand Records" heruntergeladen (~4 GB, JSON+HTML). Wunsch: Posts in einem eigenen Forum auf vod-auctions.com rekonstruieren, Bilder semantisch umbenennen (`Throbbing Gristle - Heathen Earth FB.jpg`), neue Member können kommentieren.

Diese Session liefert:

1. **Annex** zu `docs/Community/Community Concept.md` mit Daten-Inventar + Realisierbarkeits-Check
2. **Operations-Tracker-Foundation** (universell, nicht FB-spezifisch) — `background_job`-Tabelle, Python-Helper, Stale-Cron
3. **Pipeline-Phasen P1–P3 implementiert + ausgeführt**, P4 bereit, P5+P6 als nächste Sessions
4. **Status-Page** `/app/fb-archive` mit Health-Banner für Supabase-Last

## 1. Annex zum Community-Konzept

**File:** `docs/Community/Community Concept — Facebook Migration Annex.md` (519 Zeilen)

Inventar des Exports:

| Asset | Wert |
|---|---|
| Posts | 5.819 (2017-04 → 2026-05) |
| Posts mit eigenem Text | 5.330 |
| Single-Photo + substantieller Text (goldener Pfad fürs 1:1-Rename) | **3.294** |
| Multi-Photo-Posts (1.245) | bis zu 52 Fotos in einem Post |
| Media-Files | **6.369** |
| FB-Followers | **11.926** |
| Frank-Comments (Replies) | 2.654 / 2.717 — andere Comments NICHT im Export (DSGVO) |

**Decisions** (alle 6 von Frank am 2026-05-07 abgezeichnet):

1. GPS/EXIF strippen vor R2-Upload
2. Ein Profil „Frank — VOD-Auctions", klar markiert
3. Frank postet nicht mehr auf FB → einmaliger Snapshot, keine Sync-Pipeline
4. Manual-Review im Frank-Tempo
5. „Live Discussion"-Toggle für Imported-Posts ja
6. 358 Shared-Posts skippen → effektive Import-Menge **5.461 Posts**

## 2. Operations-Tracker-Foundation

Robin's Anforderung: „bei langlaufenden Prozessen im Back-End unter Operations eine Übersicht über den Status haben."

**DB-Schema** (Migration `background_job_tracker_2026_05_07` via Supabase MCP):

```sql
CREATE TABLE background_job (
  id text PRIMARY KEY,
  kind text NOT NULL,                 -- 'fb_import_p2_image_preprocess', etc.
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued|running|paused|succeeded|failed|cancelled
  progress_done bigint NOT NULL DEFAULT 0,
  progress_total bigint NULL,
  started_at, finished_at, last_heartbeat timestamptz,
  pid integer, hostname text,
  payload jsonb, result_summary jsonb,
  log_tail text, log_file_path text,
  triggered_by text,
  cancel_requested boolean DEFAULT false,
  CONSTRAINT chk_background_job_status CHECK (...)
);
-- 4 indexes (active partial, recent, kind, stale-scan partial)
-- updated_at auto-trigger
```

**Python-Helper:** `scripts/community_fb_archive/lib/job_tracker.py`

```python
with JobTracker.start(
    kind='fb_import_p2_image_preprocess',
    display_name='...',
    progress_total=N,
    payload={...},
    heartbeat_interval=30,  # default 15s; P3/P4 nutzen 30s sparsam
) as job:
    for i, item in enumerate(items):
        process(item)
        job.heartbeat(progress_done=i+1)
        # raises JobCancelledError if admin clicked Cancel
    job.succeed(result_summary={...})
```

Features: Heartbeat-Rate-Limiting, Cancel-Polling, In-Memory-Log-Buffer (5kb tail), Auto-Succeed bei normaler Beendigung, Auto-Fail mit Traceback bei Exception, Hostname+PID für UI.

**Stale-Cron:** `scripts/mark_stale_jobs.py` läuft alle 2 Min, markiert `running`-Jobs ohne Heartbeat seit >5 Min als `failed` mit Begründung. Lehre aus Postmortem 2026-05-01 (Sampler 5,6 Tage tot ohne Alarm).

Crontab installiert atomic via tmp-file (Memory `feedback_crontab_atomic_update`).

**Bug-Fix:** Heartbeat-Throttling konnte `progress_done` lagging lassen bei sehr schnellen Jobs — `_finish('succeeded')` snappt jetzt auf `progress_total`, behält actual count bei `failed`/`cancelled` (für Forensik).

## 3. Pipeline P1–P3 ausgeführt, P4 bereit

### P1 — rsync FB-Export auf VPS

JSON-Variante (2.4 GB, 6.369 Files) + HTML-Variante (1.4 GB, 1.860 Files) nach `/root/VOD_Auctions/data/fb_archive_2026-05-07/`. Beide Varianten brauchen wir, weil Posts URIs referenzieren die jeweils nur in einer Variante physisch liegen — das war ein versteckter Bug, der erst beim P2-Dry-Run sichtbar wurde.

`p2_image_preprocess.py` hat Dual-Path-Resolver: `<base>/this_profile's_activity_across_facebook/...` (JSON) → falls nicht → `<base>/this_profile_html/...` (HTML).

### P2 — Image Preprocess (live durch)

`scripts/community_fb_archive/p2_image_preprocess.py`:
- Walk `profile_posts_1.json`, sammelt unique fb_id-URIs (skip 452 Shared-Posts ohne eigenen Text)
- Strip EXIF (PIL default beim WEBP-save → no `exif=` arg)
- Resize max 1200px, WebP Q80
- R2-Upload nach `tape-mag/community-fb/<fb-id>.webp`
- Manifest `manifest_images.jsonl` (append-only, resume-fähig via `status='uploaded'`)

**Result:**
- 7.358 unique fb_ids referenziert in Posts → 7.310 erfolgreich uploaded, 48 skipped (Videos), 0 errors, 0 missing
- 91 Files hatten EXIF (alle gestripped)
- **Bytes in 3.15 GB → bytes out 880 MB → 72 % Compression**
- Dauer 65 Min 18 sec, ~113 Bilder/Min

### P3 — Tier-1 Auto-Match (running zum Zeitpunkt der Doku)

`scripts/community_fb_archive/p3_tier1_match.py`:
- Verbindet ausschließlich zur **VPS-Read-Replica** `vod_auctions_replica@127.0.0.1:5433` (postgres17 Container, logical replication aus Supabase, sub-sekunden RPO). 0 Last auf Frank's Prod-DB
- 2 batch-SELECTs: 64.161 Artists + 52.526 Releases (mit `Release.artistId` direct, kein ReleaseArtist-Join wegen fehlender `rang`-Spalte)
- Pre-compile pro Item: `re.compile(rf"\b{escape(norm)}\b")`
- Inverted-Index pro Token: `token → list[items]`. Pro Post nur ~100-500 Kandidaten statt 64k+52k iterieren
- 3-stage match:
  1. Stage 1: Stop-Word-Filter (en+de), substring-min-len ≥4, single-token ≥5 chars
  2. Cross-Validation: `reorder_releases_by_artist()` bevorzugt Releases deren `main_artist_name` mit Top-Artist matcht
  3. Stage 2 (only if no Stage-1-hit): rapidfuzz `process.extract` mit token_set_ratio
- Sort-key `(-score, -token_count, -length)` — multi-token wins über single-token, längere über kürzere
- Pro Post 3 Tier-Decision:
  - Tier 1: single-photo + strong artist + strong release + cross-validated → auto-rename
  - Tier 2: multi-photo OR borderline → P4 AI-Vision
  - Tier 3: keine matches

**Match-Quality nach Iteration:**

Iteration 1 (vor Stop-Word-Filter): 50 Posts → 38 Tier-1 (76 %), aber alle False-Positives („AS - Try To..", „IS - Is", etc.).

Iteration 2 (Stop-Word-Filter + Cross-Validation): 200 Posts → 2 Tier-1 (0,5 %). Cross-Validation zu hart, hat „Severed Heads"-Test versemmelt.

Iteration 3 (multi-token-priority + length DESC): 200 Posts → 25 Tier-1 (6,5 %), 362 Tier-2, 0 Tier-3. Beispiele jetzt vertrauenswürdig:
- `Esoteric - Floatdemonium FB.jpg`
- `Nocturnal Emissions - Songs Of Love And Revolution FB.jpg`
- `Light Asylum - Light Asylum FB.jpg`
- `Hunting Lodge - Tribal Warning Shot FB.jpg`

**Performance-Optimierung** (rc53.11): inverted-index + pre-compile → 9× speedup. Vorher 1,8 sec/Post → jetzt 0,2 sec/Post. Full-Run-ETA ~11 Min statt 4-5h.

### P4 — AI Vision (Script committed, ungetestet)

`scripts/community_fb_archive/p4_ai_vision.py`:
- Liest manifest_matches.jsonl, gruppiert by post_timestamp
- Pro Post mit Tier-2-Rows: 1 Anthropic-Call (Haiku 4.5 + tool-use)
- Lädt Photos von R2 → 512px JPEG-Thumbs (kosteneffizienter Token-Footprint)
- Tool `identify_photo_releases`: pro Photo `{artist_id, release_id, confidence, reason, unrelated}` aus den vorgefilterten P3-Kandidaten
- Output: `manifest_matches_v2.jsonl` mit `tier_after_ai` (1 high-conf rename / 2 manual review / 3 unrelated)
- Cap MAX_PHOTOS_PER_CALL=6 (Token-Cost-Sicherheit), Resume via post_timestamp-Set
- Cost-Estimate: ~$17 für ~3.500 Tier-2-Posts, Dauer ~3-5h sequential

## 4. /app/fb-archive Status-Page

Robin hat heute parallel `/app/mail-import` als Vorbild gebaut — ich übernehme das Pattern für FB-Archive.

**Backend:** `backend/src/api/admin/fb-archive/status/route.ts`
- Reads: `background_job` rows mit `kind LIKE 'fb_import_%'`, manifest_images.jsonl (Stats), manifest_matches.jsonl (Tier-Verteilung), p2_run.log + p3_tier1_match.log Tails
- DB-Load via 5 Catalog-Reads (alle pg_stat_*-Memory-Views, <5ms total): pg_database_size, pg_stat_database aggregates, pg_stat_activity breakdown, slow-queries-Liste
- **Persistent Snapshot** in `/tmp/fb_archive_db_load_snapshot.json` für Delta-Rate-Berechnung zwischen API-Calls (TX/sec, Disk-Reads/sec, Cache-Hits/sec, Deadlocks-Delta, Temp-Bytes-Delta)
- **Composite Health-Score:**
  - 🟢 ok = Cache≥95 %, Connections<65 %, keine slow >30s, keine neuen Deadlocks, Disk-Reads <200/s
  - 🟡 warn = Cache 90-95 %, Connections 65-85 %, ≥5 slow parallel, oder >100 MB Temp-Spill in Window
  - 🔴 critical = Cache<90 %, Connections>85 %, Queries >2 min, neue Deadlocks, **Disk-Reads >1500/s** (~12 MB/s — Free-Tier Burst-Budget!)

**UI:** `backend/src/admin/routes/fb-archive/page.tsx`
- DB Health-Banner ganz oben (color-coded green/yellow/red, icon, große Live-Stats: TX/s · Disk-Read/s · Cache%, Begründungs-Zeile)
- 3 Phase-Cards (P2/P3/P4) mit Progress-Bar, Heartbeat-Age, PID, Hostname
- 2 Manifest-Cards (Image-Stats + Match-Tier-Verteilung mit reasons)
- DB-Load-Detail-Card mit Live-Rates-Zeile + Connection-Breakdown + Slow-Queries (color-graded: ≥3s gelb, ≥10s orange, ≥30s rot)
- Run-Historie (last 20)
- Log-Tail-Panels P2 + P3
- Auto-Refresh alle 10s, Elapsed-Timer tickt sekundlich

**Sidebar-Shortcut** „FB Archive" im hardcoded SHORTCUTS-Array von `admin-nav.tsx`.

## 5. Bug-Diagnose-Marathon: R2 AccessDenied

P2 Live-Run wurde 5 Sekunden nach Start mit AccessDenied gekillt. **30-Min-Diagnose-Loop**:

1. scripts/.env hatte einen Read-only-R2-Token (legacy-Setup)
2. Robin erstellt neuen Token in Cloudflare mit `Object Read & Write` + Bucket=vod-images + IP-Filter `72.62.148.205/32` + speichert in 1Password Vault Work
3. Item zwischen Vaults verschoben (Service-Account-Scope-Issue)
4. Token via `op item get` gelesen + in scripts/.env appended (`R2_WRITE_*`-Aliase)
5. Test: PUT, LIST, LIST_BUCKETS — **alle denied** trotz korrekter Permissions

**Root Cause:** Hostinger VPS routet outbound default über IPv6 (`2a02:4780:41:2dca::1`), nicht IPv4. Der IP-Filter `72.62.148.205/32` blockiert dadurch alle Requests. `curl -s ifconfig.io` ohne `-4`/`-6`-Flag zeigt die IPv6.

**Fix:** Robin hat den IP-Filter aus dem Token entfernt (Bucket-Scope reicht als Sicherheit). PUT/HEAD/DELETE-Smoke-Test grün, Live-Run gestartet.

**Memory:** [`feedback_hostinger_vps_ipv6_default.md`](../../.claude/projects/.../memory/feedback_hostinger_vps_ipv6_default.md) — bei AccessDenied trotz korrekter Credentials IMMER zuerst IP-Filter prüfen, mit `curl -s -4 ifconfig.io` und `curl -s -6 ifconfig.io` die echte Outbound-IP feststellen. Pre-Live-Smoke-Test mit single PUT hätte das in 5s gezeigt — Lehre konsistent mit `feedback_scratch_test_before_bulk`.

## 6. Files

### Code

```
backend/scripts/migrations/2026-05-07_background_job_tracker.sql

backend/src/admin/routes/fb-archive/page.tsx                      (637 Z)
backend/src/api/admin/fb-archive/status/route.ts                  (310 Z+)
backend/src/admin/components/admin-nav.tsx                        (3 Z, Shortcut)

scripts/community_fb_archive/__init__.py
scripts/community_fb_archive/lib/__init__.py
scripts/community_fb_archive/lib/job_tracker.py                   (267 Z)
scripts/community_fb_archive/p2_image_preprocess.py               (407 Z)
scripts/community_fb_archive/p3_tier1_match.py                    (656 Z)
scripts/community_fb_archive/p4_ai_vision.py                      (622 Z)
scripts/mark_stale_jobs.py                                        (73 Z)
```

### Doku

```
docs/Community/Community Concept — Facebook Migration Annex.md    (519 Z)
docs/sessions/2026-05-07_fb_archive_pipeline.md                   (diese Datei)
```

### Memory

```
~/.claude/.../memory/feedback_hostinger_vps_ipv6_default.md
```

### Manifeste auf VPS

```
/root/VOD_Auctions/data/fb_archive_2026-05-07/
├── this_profile's_activity_across_facebook/    (JSON-Variante, 2.4 GB)
├── this_profile_html/                          (HTML-Variante, 1.4 GB)
├── manifest_images.jsonl                       (P2 Output, 7.408 Zeilen)
├── manifest_matches.jsonl                      (P3 Output, läuft gerade)
├── p2_run.log                                  (P2 Stdout)
├── p2_image_preprocess.log                     (JobTracker P2)
├── p3_run.log                                  (P3 Stdout)
└── p3_tier1_match.log                          (JobTracker P3)
```

## 7. Open für nächste Session

1. **P3 Full-Run abwarten** (~11 Min ETA) und Tier-Verteilung über alle 4.481 Posts checken — bei 6,5 % Tier-1-Quote der 200-Probe wären das ~290 sicher autorenamebare Posts
2. **P4 Smoke-Test** (`--dry-run --limit-posts 5`) → wenn Pipeline OK → `--limit-posts 10` LIVE (~$0.05) → wenn sauber → Full-Run nohup
3. **P5 Manual-Review-Export** schreiben — generiert CSV mit `low_confidence` + `tier_after_ai=2` Rows zur Frank-Review
4. **P6 Final-DB-Import** — wartet auf Community-MVP M3+M4+M7 (Phase 1, ~8-12 Wochen)
5. **`/app/fb-archive` Status-Page** verifizieren live (Build deployed, kann Robin browsen)
6. **mail-import** Status-Page bekommt parallel das gleiche `db_load`-Feld + Health-Banner — bei Bedarf in eine zweite Iteration ziehen oder direkt aus dem fb-archive-Pattern kopieren

## 8. Memories die in dieser Session entstanden / gefestigt sind

- **Neu:** `feedback_hostinger_vps_ipv6_default.md` (IPv4-Filter blockiert IPv6-Outbound)
- **Bestätigt:** `feedback_scratch_test_before_bulk` — pre-live single-PUT-Test hätte 30 Min Diagnose-Loop gespart
- **Bestätigt:** `feedback_no_direct_vps_deploy` — alle Code-Edits über git push/pull, niemals direkt scp/ssh
- **Bestätigt:** `feedback_crontab_atomic_update` — `cron -l > tmp; echo NEW >> tmp; crontab tmp`
- **Bestätigt:** `feedback_canonical_column_for_concept` — `Release.artistId` ist canonical (NICHT ReleaseArtist mit nicht-existenter `rang`)

---

**Status zum Ende der Doku-Erstellung:**
- P3-Full-Run aktiv, ~19% (850/4481), DB-Last unauffällig
- P4-Script gepusht, ungetestet
- Status-Page deployed, erreichbar unter https://admin.vod-auctions.com/app/fb-archive
- Health-Banner sollte 🟢 zeigen (Disk-Reads aus dem Replica nicht aus Supabase)
