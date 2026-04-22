# Meilisearch Phase 1 — Deployment Steps

**Purpose:** Konkrete Befehls-Checkliste fuer den Live-Rollout. Das Konzept
(`SEARCH_MEILISEARCH_PLAN.md`) beschreibt Architektur + Rationale — dieses
Dokument ist das Runbook.

**Geplant nach:** Pre-Launch-Phase abgeschlossen, Plattform im `live` mode.
**Status (2026-04-22):** Phase 0 (Code-Artefakte) komplett deployed, aber
alle VPS-seitigen Schritte unten sind noch offen. Flag
`SEARCH_MEILI_CATALOG` ist default `false`, also kein Effekt in Prod.

**Rollback-Weg:** Flag via `/app/config` OFF schalten — Postgres-FTS
uebernimmt sofort. Kein Deploy noetig.

---

## Was Phase 0 schon geliefert hat (in diesem Commit)

- `backend/scripts/migrations/2026-04-22_meilisearch_sync_tables.sql`
  — `search_indexed_at` Spalte, 3 Trigger, `meilisearch_index_state`,
  `meilisearch_drift_log`
- `docker-compose.meili.yml` + `.env.meili.example`
- `scripts/meilisearch_settings.json`
- `scripts/meilisearch_sync.py` — Full-rebuild, Delta, Cleanup, Apply-Settings
- `scripts/meilisearch_drift_check.py`
- `scripts/data/country_iso.py`
- `scripts/legacy_sync_v2.py` + `scripts/discogs_daily_sync.py` — bumps fuer
  `search_indexed_at = NULL` nach jedem Release-Write
- `backend/src/lib/meilisearch.ts` — Client + Health-Probe + Effective-Flag
- `backend/src/lib/release-search-meili.ts` — Filter-Builder, Search-Wrapper
- `backend/src/lib/feature-flags.ts` — neue Flag `SEARCH_MEILI_CATALOG`
- `backend/src/api/store/catalog/route.ts` — 3-Gate-Logik mit Fallback
- `backend/src/api/store/catalog/suggest/route.ts` — analog
- `backend/src/api/store/labels/suggest/route.ts` — neuer Endpoint
- `backend/package.json` — `meilisearch@^0.57.0` als Dep

---

## Phase 1 Rollout — Schritt fuer Schritt

### 1. Master-Key generieren + speichern

Auf Robins Mac:
```bash
openssl rand -hex 32
```
→ In 1Password anlegen: "VOD Meilisearch Master Key".

### 2. VPS vorbereiten

SSH zum VPS, Compose-File + Env bereitstellen:
```bash
ssh root@72.62.148.205
mkdir -p /root/meilisearch/{data,dumps}

# Master-Key uebertragen (aus 1Password)
cd /root/VOD_Auctions
cp .env.meili.example .env.meili
nano .env.meili   # MEILI_MASTER_KEY ersetzen

# Compose-File pruefen
cat docker-compose.meili.yml
```

### 3. Meili starten

```bash
cd /root/VOD_Auctions
docker compose -f docker-compose.meili.yml --env-file .env.meili up -d

# Sanity-Check
curl -s http://127.0.0.1:7700/health
# → {"status":"available"}

docker stats --no-stream vod-meilisearch
# RSS sollte unter 200 MB idle sein
```

### 4. Admin-API-Key generieren

Der Master-Key sollte nie vom Sync-Script verwendet werden. Separaten
Admin-Key erzeugen:

```bash
MASTER=$(grep MEILI_MASTER_KEY /root/VOD_Auctions/.env.meili | cut -d= -f2)
curl -X POST "http://127.0.0.1:7700/keys" \
  -H "Authorization: Bearer $MASTER" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "VOD Meilisearch Admin Key — sync script + backend",
    "actions": ["*"],
    "indexes": ["releases-*"],
    "expiresAt": null
  }'
```
→ Antwort enthaelt `key`. In 1Password speichern, in `scripts/.env` als
`MEILI_ADMIN_API_KEY` eintragen und in `backend/.env` ebenso.

### 5. DB-Migration auf Production

**Vorab-Check auf Staging** (empfohlen):
```bash
cd /root/VOD_Auctions
psql "$STAGING_SUPABASE_URL" -f backend/scripts/migrations/2026-04-22_meilisearch_sync_tables.sql
# Trigger + Tabellen pruefen
psql "$STAGING_SUPABASE_URL" -c "\d \"Release\"" | grep search_indexed_at
psql "$STAGING_SUPABASE_URL" -c "\dt meilisearch_*"
```

**Dann Production:**
```bash
psql "$SUPABASE_DB_URL" -f backend/scripts/migrations/2026-04-22_meilisearch_sync_tables.sql
```

Effekt: ALLE ~52k Releases werden als "needs reindex" markiert (Step 2 des
SQL-Files: `UPDATE "Release" SET search_indexed_at = NULL`). Das ist
gewollt — der Initial-Backfill pusht sie alle in Meili.

### 6. Backend deployen mit neuem Code

Standard-Deploy-Sequenz gemaess CLAUDE.md § "VPS Deploy":
```bash
# Auf Mac zuerst
git push origin main

# Dann VPS
ssh root@72.62.148.205
cd /root/VOD_Auctions && git pull && cd backend
npm install                                              # meilisearch SDK!
rm -rf node_modules/.vite .medusa
npx medusa build
rm -rf public/admin && cp -r .medusa/server/public/admin public/admin
ln -sf /root/VOD_Auctions/backend/.env /root/VOD_Auctions/backend/.medusa/server/.env
pm2 restart vodauction-backend
```

Mit Flag OFF (default) laeuft alles exakt wie zuvor — Postgres-FTS.

### 7. Settings pushen + Initial-Backfill

```bash
cd /root/VOD_Auctions/scripts
source venv/bin/activate

# Python-Deps sicherstellen (idempotent)
pip install requests psycopg2-binary

# ENV laden
export $(grep -v '^#' .env | xargs)
export MEILI_URL="http://127.0.0.1:7700"
export MEILI_ADMIN_API_KEY="<aus Schritt 4>"

# 1) Settings pushen (idempotent, ok auf frischem Index)
python3 meilisearch_sync.py --apply-settings

# 2) Dry-run des Full-Rebuild — zeigt nur Counts, schreibt nicht
python3 meilisearch_sync.py --full-rebuild --dry-run

# 3) Wenn das OK aussieht: echter Backfill (~3-6 Min fuer 52k Docs × 2 Profiles)
python3 meilisearch_sync.py --full-rebuild

# 4) Verify
curl -s "http://127.0.0.1:7700/indexes/releases-commerce/stats" \
  -H "Authorization: Bearer $MEILI_ADMIN_API_KEY" | jq '.numberOfDocuments'
# Sollte ~52000 sein (alle Release-Rows mit coverImage IS NOT NULL sind ~41500 —
# der Full-Rebuild pusht ALLE, FTS filtert bei der Query)

curl -s "http://127.0.0.1:7700/indexes/releases-commerce/search" \
  -H "Authorization: Bearer $MEILI_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"q": "cabaret voltaire", "limit": 3}' | jq '.hits[].title'
```

### 8. Cron-Jobs aktivieren

```bash
crontab -e
```
Neue Zeilen:
```cron
# Meilisearch delta-sync (alle 5 Min)
*/5 * * * * cd /root/VOD_Auctions/scripts && venv/bin/python3 meilisearch_sync.py >> meilisearch_sync.log 2>&1

# Cleanup (verwaiste Docs, taeglich 03:00 UTC)
0 3 * * * cd /root/VOD_Auctions/scripts && venv/bin/python3 meilisearch_sync.py --cleanup >> meilisearch_sync.log 2>&1

# Drift-Check (alle 30 Min)
*/30 * * * * cd /root/VOD_Auctions/scripts && venv/bin/python3 meilisearch_drift_check.py >> meilisearch_drift.log 2>&1

# Backup (taeglich 04:00 UTC, 7 Tage Retention)
0 4 * * * curl -fsS -X POST -H "Authorization: Bearer $MEILI_MASTER_KEY" http://127.0.0.1:7700/dumps && find /root/meilisearch/dumps -mtime +7 -delete
```

### 9. Operational Acceptance Tests (PFLICHT vor Flag ON)

Alle 4 aus `SEARCH_MEILISEARCH_PLAN.md §11` durchspielen, Ergebnisse in
`docs/optimizing/MEILI_PHASE1_ACCEPTANCE.md` dokumentieren. Kurzform:

- **§11(a) Timeout-Test:** `iptables -A OUTPUT -p tcp --dport 7700 -j DROP` fuer 30s,
  `/store/catalog?q=test` muss weiter antworten, Logs enthalten
  `event=meili_runtime_fallback`.
- **§11(b) Stale-Index-Test:** Trigger temporaer disablen, `UPDATE "Release" SET
  title='ZZZ_TEST', search_indexed_at=NULL WHERE id='legacy-release-12345'`,
  6 Min warten, Meili muss die geanderten Docs enthalten.
- **§11(c) Rebuild-under-load:** k6 50 VUs × 10 Min auf `/store/catalog` +
  parallel `--full-rebuild` auf VPS. p95 < 500ms, 0 5xx, 0 Runtime-Fallbacks.
- **§11(d) Drift-Check:** Ersten Cron-Lauf beobachten, `severity=ok` erwartet.

### 10. Flag ON

Live, mit Robin am Monitor:
```bash
# via Admin-UI oeffnen: https://admin.vod-auctions.com/app/config
# Feature Flags Tab → SEARCH_MEILI_CATALOG toggle ON
```

Alternativ via DB (nur fuer Emergency-Forced-Enable):
```sql
UPDATE site_config
   SET features = COALESCE(features, '{}'::jsonb) || '{"SEARCH_MEILI_CATALOG": true}'::jsonb,
       updated_at = NOW()
 WHERE id = 'default';
```

### 11. Akzeptanz-Test mit Flag ON

- [ ] `/store/catalog?search=cabaret+voltaire` liefert sinnvolle Top-3
- [ ] `/store/catalog?search=cabarte+voltarie` (Typo) findet Cabaret Voltaire
  (mit Postgres war das leer)
- [ ] `/store/catalog?for_sale=true&category=vinyl&decade=1980` < 100 ms
- [ ] Response enthaelt `facets` key mit `format_group`, `decade`, etc. Counts
- [ ] `/store/catalog/suggest?q=industrial` rendert weiterhin `{ releases,
  artists, labels }`

### 12. Rollback (falls noetig)

```sql
UPDATE site_config SET features = features - 'SEARCH_MEILI_CATALOG' WHERE id='default';
```
→ Alle Requests laufen sofort wieder auf Postgres.

Oder Admin-UI Toggle OFF.

---

## Bewusst NICHT in Phase 1

- Admin-Endpoints (`/admin/erp/inventory/search`, `/admin/media`) — bleiben Postgres
- UI-Komponenten (Live-Counts, Did-you-mean, Highlight) — rein Storefront-Arbeit,
  kommt in separate PR
- Direct-Browser Tenant-Token
- Vector-Search
- Suchlog-Capture-Pipeline

Siehe `SEARCH_MEILISEARCH_PLAN.md` §10 fuer die vollstaendige "NICHT"-Liste.
