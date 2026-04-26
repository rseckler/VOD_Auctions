# VOD_Auctions — CLAUDE.md

**Purpose:** Auktionsplattform für ~41.500 Produkte (Industrial Music Tonträger + Literatur/Merch) — eigene Plattform statt 8-13% eBay/Discogs-Gebühren
**Status:** Beta Test (`platform_mode: beta_test`) · Storefront+Admin-UI: Englisch
**Last Updated:** 2026-04-26 (rc51.9.1 + rc51.9.2 + rc51.9.3 — **Discogs-Preview-Modal mit Per-Field-Review + JSONB-Binding-Fix + Storefront on-demand-Revalidate.** (rc51.9.3) Frank-Report: „ich drücke OK aber er ändert es nicht im Shop. Kann es sein das die neue Inventur einfach dauert?" — Storefront-Catalog-Detail (`/catalog/[id]`) hat Next.js-ISR mit `revalidate: 60`, ohne expliziten Bust war ein Edit bis zu 60s nicht auf der Public-Page sichtbar (DB-Werte direkt nach Apply waren via Supabase-MCP korrekt verifiziert). Plus Frank verwechselte die `Condition: Limited Edition, Numbered, Pearl`-Zeile auf der Storefront mit Apply-Output — das ist `Release.legacy_condition` aus tape-mag-MySQL, hat kein Discogs-Pendant, ist nicht im Apply-Modal. Fix: neuer Helper `backend/src/lib/storefront-revalidate.ts::revalidateReleaseCatalogPage(id)` ruft den schon existierenden Storefront-`/api/revalidate`-Hook (Pattern aus content-blocks-Route, `REVALIDATE_SECRET`-protected) per `POST` mit `path: /catalog/${id}`. `POST /admin/media/:id` triggered ihn fire-and-forget am Ende, parallel zu `pushReleaseNow` für Meili. 3s-Timeout, Fail-silent — schlägt der Call fehl, läuft die übliche 60s-ISR als Safety-Net. (rc51.9.2) Bisheriger Flow überschrieb beim „Fetch from Discogs" Stammdaten ungesehen, „Save Linking" mit neuer ID schrieb nur die ID ohne Daten zu refreshen. Frank: „bei der Änderung des discogs Links/Nummer, holt fetcht/läd er nicht die geänderten discogs Daten und schreibt diese direkt beim Artikel rein. das müsste er aber tun. am besten sollte er kurz ein review als pop up zeigen und um Bestätigung bitten, bevor er sie fix rein schreibt." Neue Route `POST /admin/media/:id/discogs-preview` holt discogs.com-`releases`/`marketplace/stats`/`price_suggestions`-Daten und liefert `{current, proposed, diff, has_changes}` ohne DB-Write. Mappt `formats[]` via `classifyDiscogsFormat()` → `format_v2` + `format_descriptors`. Country-Name (z.B. „France") via neuem `findCountryByName()` (`country-iso.ts`, inkl. UK/USA/Russia/Czech-Republic/Burma/Macedonia-Aliases) → ISO-2. `identifiers[].Barcode` → digits-only mit GTIN-Längen-Check. `notes` → description, `extraartists[]` → credits („Role: Name1, ..."-Format). Marketplace-Preise + num_for_sale. `DiscogsReviewModal.tsx` (NEU) zeigt Per-Field-Diff mit Checkboxen — locked-Felder default OFF mit 🔒-Badge, „Select all/none". Apply schreibt durch denselben `POST /admin/media/:id`-Pfad → Audit-Log + Auto-Lock + Meili-Push laufen normal. „Save Linking"-Button-Label flippt zu „Fetch & Review" sobald discogs_id im Input vom gespeicherten abweicht. „Refetch from Discogs" routet ebenfalls durch das Preview — kein silent overwrite mehr. `Modal` aus `admin-ui.tsx` bekam optionalen `maxWidth`-Prop für die breitere Diff-Tabelle. Out-of-scope: Artist/Label/Cover-Image bleiben den dedizierten Pickern überlassen — Re-Assignment via discogs_id würde DB-Inserts triggern und ist v2-Material. (rc51.9.1) `format_descriptors` (JSONB) wurde von rc51.8 zu `allowedReleaseFields` ergänzt, aber `releaseUpdates.format_descriptors = arr` (JS-Array) wurde direkt an `knex.update()` übergeben — node-postgres serialisiert das als PG-`text[]`-Literal `{a,b,c}`, und PG hat keinen impliziten Cast `text[] → jsonb` → Exception → Medusa-Default-Handler liefert `"An unknown error occurred."` Andere JSONB-Writer im Repo (`discogs-import/commit`) nutzen `?::jsonb`-Cast in raw SQL. Refetch-Route betroffen war nicht (schreibt nur Skalare + PG-`text[]`). Fix: kurz vor `trx("Release").update(...)` JSONB-Array-Felder mit `JSON.stringify` in JSON-Literal überführen — dann greift der PG-`text → jsonb`-Assignment-Cast. `releaseUpdates.format_descriptors` bleibt für Audit-Logging als JS-Array. Andere JSONB-Spalten in `allowedReleaseFields` gibt's nicht (Schema-Check via Supabase-MCP).) Vorher 2026-04-25 (rc51.8 + rc51.9 — **Edit-Stammdaten-Card komplett: Format + Descriptors + Genres + Styles als Pflicht-Picker.** (rc51.8) `FormatPickerModal` mit 71-Wert-Whitelist gruppiert in 12 Sections (Vinyl LP / Vinyl 7" / Vinyl 10" / Vinyl 12" Maxi / Sonderformate / Cassette / Reel / CD / Video / Digital / Literatur / Catch-all) + `DescriptorPickerModal` mit 32 Tags (Picture Disc, Reissue, Limited Edition, Stereo, Mono, …). `format_v2` zu `SYNC_PROTECTED_FIELDS` — Auto-Lock-on-Edit, `legacy_sync_v2.py` respektiert Lock in beiden UPSERT-Blöcken (Release + Literature). User-explicit `format_v2` gewinnt über `format_id`-Derivation. (rc51.9) `GenrePickerModal` mit 15-Wert-Whitelist (Discogs Top-Level, matched DB DISTINCT exakt) + `StylesPickerModal` mit DB-suggested Values via neuer Route `GET /admin/media/style-suggestions` (DISTINCT unnest, 10-min cache, ~388 Werte) **plus Custom-Add** für neue Werte (Enter im Search-Input). Server-Side Validation strict für Genres (400 bei invalid), Styles bleibt offen. Genres+Styles sind Zone-2 (kein Sync schreibt sie) → keine Lock-Mechanik nötig. **Edit-Card Final-Set:** Title · Artist · Label · Year · Country · Catalog No. · Barcode · Description · Format · Descriptors · Genres · Styles. Doku: `STAMMDATEN_GAPS_FOLLOWUP.md` (alle 3 Gaps geschlossen).) Vorher 2026-04-25 (rc51.7 — **Format-V2: 71-Wert-Whitelist + Backfill 52.788/52.788 Items + UI durchgängig.** Robin: „wir haben einen Fehler gemacht bei der Übernahme der Formatdefinitionen von tape-mag.com — wir haben deutlich zu wenig Unterscheidungen". Alter `ReleaseFormat`-Enum (16 Werte) hat zwei orthogonale Dimensionen verschmolzen: Format-Typ (LP/7"/10"/12"/MC/CD/...) × Anzahl Tonträger (Single-Disc vs. Box mit 2-32 Stück). Tape-mag-`-N`-Suffixe in `Vinyl-Lp-5`/`Tape-7`/`Vinyl-7"-3` bedeuteten „LP-Box mit 5 Platten" / „Box mit 7 Cassetten" / „Box mit 3 7"-Singles" — alles ging auf `LP`/`CASSETTE`. Discogs-`formats[0].qty` war im Cache, aber nie auf Release. **Lösung:** neue Spalten `format_v2 varchar(40)` + `format_descriptors jsonb` mit CHECK-Constraint gegen 71-Wert-Whitelist (`Vinyl-LP`, `Vinyl-LP-2`...`Vinyl-LP-12`, `Vinyl-7-Inch`, `Vinyl-7-Inch-2/3/4/5/10`, `Vinyl-10-Inch[-2/3/4]`, `Vinyl-12-Inch[-2/3/4/12]`, `Tape[-2/3/4/5/6/7/8/10/12/26/32]`, `CD[-2/3/4/5/8/10/16]`, `Reel[-2]`, `Flexi`, `Lathe-Cut[-2]`, `Acetate`, `Shellac`, `CDr[-2]`, `CDV`, `VHS`, `DVD`, `DVDr`, `Blu-ray`, `File`, `Memory-Stick`, `Magazin`, `Photo`, `Postcard`, `Poster`, `Book`, `T-Shirt`, `Other`). **Backfill 100%:** Phase B (tape-mag deterministisch via `format_id` → 41.538), Phase A (Discogs heuristisch via `api_data.formats` mit Container-Skip + Vinyl-Sub-Format-Detection → 11.231), Phase C Orphans (19 → `Other`). Album-Bug (`12" + Album` als `Vinyl-12-Inch-2` statt `Vinyl-LP-2`) gefixt, 66 Items umverteilt. Single-Source `backend/src/lib/format-mapping.ts` (TS) + `scripts/format_mapping.py` (Python-Spiegel) + `storefront/src/lib/format-display.ts`. Display-Helper: `displayFormat()` für UI (`5× Vinyl LP`) + `displayFormatCompact()` für Print-Labels (`LP×5`). Meili-Index erweitert (filterable + displayed), Full-Rebuild via Atomic-Swap. UI durchgängig: Admin-Edit-Card + Listen + Auction-Blocks + Inventory/Stocktake + POS, Storefront Catalog/Auctions Detail + Listen + Related + Search + Account, Print-Labels (Compact), Email. Bewusst zurückgehalten: Cutover (`format` → `format_v2` rename) erst nach 2-3 Wochen Live-Beobachtung. **6 Commits 707778c→0d08636.** Doku: `docs/architecture/FORMAT_MAPPING_ANALYSIS.md`.) Vorher 2026-04-25 (rc51.6 — **`Release.article_number` Auto-Assign via `BEFORE INSERT`-Trigger + Backfill 22.630 NULL-Rows (Discogs + Legacy/Literatur).** Sequence `release_article_number_seq` startet nach existierendem MAX (30.158), Trigger greift in alle Insert-Pfade (legacy_sync, discogs-import, future manual-add) ohne Code-Touch. Backfill deterministisch nach `createdAt` von `VOD-30159` bis `VOD-52788`. Zone-0-Anforderung "auto-vergeben bei Insert, danach immutable" erfüllt. Doku: `STAMMDATEN_GAPS_FOLLOWUP.md` Gap 3.) Vorher 2026-04-24 (rc50.0 → rc51.3 — **Catalog Stammdaten vollständig editierbar für ALLE Releases (Legacy + Discogs) mit per-Field Sync-Protection + Country-Picker + Barcode-GTIN-Validation.** (rc50.0-rc50.4) Phase 1-4: 4-Zonen-Modell, `release_audit_log`-Tabelle + 8 Routes, Edit-Card + AuditHistory + RevertConfirmModal + TrackManagement + Bulk-Edit mit Legacy-Skip. (rc51.0 Sync-Lock-Modell) `Release.locked_fields jsonb` + CASE-WHEN-UPSERT in `legacy_sync_v2.py` — Legacy-Releases jetzt editierbar, gelockte Felder werden beim Sync übersprungen. Neue Route `POST /admin/media/:id/unlock-field` + Per-Field 🔒-Icon + Unlock-Confirm-Modal. rc49.4-Performance (47s für 41k Rows) bleibt erhalten. (rc51.0.1) Opus-Review: AuditAction-Type-Drift für `field_unlocked` gefixt. (rc51.3 Big Bundle Post-Opus-Review) 3 Bugs + 5 Recommendations: B1 ai-create-auction + F.1 payment-deadline updatedAt-camelCase (beide hätten at-runtime gecrashed), B2 upload-image + B3 discogs-import lockFields-Integration, R1 HARD_STAMMDATEN_FIELDS konsolidiert zu `SYNC_PROTECTED_FIELDS` (Drift-Prevention), R2 Auto-Lock nur auf tatsächlich geänderte Felder via `looseEqual()`, R3 unlock-field TOCTOU-Fix (Check inside Transaction mit FOR UPDATE), R4 Country-Picker mit 249 ISO-3166-1 Ländern + Flag-Emoji + EN/DE-Search, R5 Barcode-Validation UPC-A/EAN-13/EAN-8 + GTIN-Checksum.)
**GitHub:** https://github.com/rseckler/VOD_Auctions
**Publishable API Key:** `pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d`

## Tech Stack

| Component | Technology |
|-----------|------------|
| Commerce | Medusa.js 2.x (Port 9000) |
| Frontend | Next.js 16.2, React 19, TS 5, Tailwind 4, shadcn/ui, Framer Motion |
| Design | "Vinyl Culture" — DM Serif Display + DM Sans, Gold #d4a54a, dark #1c1915 |
| DB | Supabase PostgreSQL (`bofblwqieuvmqybzxapx`, eu-central-1) |
| Realtime/Cache | Supabase Realtime (Live-Bidding) + Upstash Redis |
| Payments | Stripe + PayPal Direct |
| Hosting | VPS 72.62.148.205 (PM2 + nginx) |
| State | Zustand + React Query |

## Dev & Deploy

```bash
# Dev
cd backend && npx medusa develop            # Port 9000 (Admin: /app, admin@vod.de / admin123)
cd storefront && npm run dev                # Port 3000 local / 3006 VPS
cd clickdummy && npm run dev -- -p 3005
cd backend && npx medusa db:generate auction && npx medusa db:migrate

# Prod URLs: vod-auctions.com (3006) | api.vod-auctions.com (9000) | admin.vod-auctions.com
# PM2: vodauction-backend | vodauction-storefront
```

**VPS Deploy** — IMMER zuerst `git push` auf Mac, dann pull auf VPS. Sonst sagt VPS "Already up to date".

```bash
ssh root@72.62.148.205
cd /root/VOD_Auctions && git pull && cd backend
rm -rf node_modules/.vite .medusa                                              # Vite-Cache (PFLICHT für neue Admin-Routes)
npx medusa build
rm -rf public/admin && cp -r .medusa/server/public/admin public/admin          # sonst 502 auf admin.vod-auctions.com
ln -sf /root/VOD_Auctions/backend/.env /root/VOD_Auctions/backend/.medusa/server/.env  # PM2 cwd=.medusa/server/, medusa build löscht Symlink
pm2 restart vodauction-backend

cd /root/VOD_Auctions/storefront && npm run build && pm2 restart vodauction-storefront
```

**SSH Rate-Limiting:** Hostinger sperrt IP nach 2-3 schnellen Connects (~10-15 Min). ControlMaster/ControlPersist 30m in `~/.ssh/config`. Nie parallele SSH-Calls.

## Key Gotchas

**Medusa/Knex:**
- Knex DECIMAL kommt als String → immer `Number(v).toFixed()`
- Knex Subquery in `.where()` — Wert vorher abfragen, nicht inline
- Knex-Insert: immer `id: generateEntityId()` aus `@medusajs/framework/utils`
- `rawBodyMiddleware` in `middlewares.ts` NICHT entfernen (Stripe/PayPal Webhooks)
- `defineRouteConfig()` NUR auf Top-Level `page.tsx`, nicht auf `[id]/page.tsx`
- Native Medusa-Route-Pfade (`customers`, `orders`, `products`, `settings`, `feature-flags`) nie selber verwenden — native gewinnt. Eigene Prefixes: `crm`, `auction-blocks`, `catalog`, `platform-flags`, `erp/`
- Medusa-native Tabellennamen nie verwenden (`inventory_item`, `stock_location`). ERP-Tabellen mit `erp_` Prefix
- Medusa API-Route-Scanner filtert Verzeichnisse mit "test" im Namen — nie `print-test/`, `test-runner/` für Backend-Routes
- JSX-IIFE `(() => {...})()` in Ternary → silent build failure. Separate Komponenten nutzen
- Admin-UI `Btn` aus `admin-ui.tsx` nimmt `label` prop (nicht children), Variants: `primary`/`gold`/`danger`/`ghost` (kein `secondary`)

**Build/Deploy:**
- Neue Admin-Route → VPS Vite-Cache clearen (`rm -rf node_modules/.vite .medusa`) sonst 404 / silent crash
- Neue Native-Dep (pdfkit, sharp, bcrypt) → `npm install` auf VPS. Nie `--omit=optional` (strippt `@swc/core-linux-x64-gnu`)
- PM2 + pnpm: Shell-Wrapper in `.bin/` crasht Fork mit SyntaxError → in `ecosystem.config.js` direkten JS-Entry nutzen (`node_modules/<pkg>/dist/bin/<pkg>`)

**DB:**
- CamelCase (`Release`, `Artist`) vs snake_case (Auction-Tabellen)
- `rejectUnauthorized: false` in medusa-config SSL
- Supabase Admin-Ops nur via Session Pooler (`aws-0-<REGION>.pooler.supabase.com:5432`, User `postgres.<ref>`). Transaction Pooler Port 6543 kann kein `pg_dump`. **Schema-Migrations bevorzugt über Supabase MCP** (`apply_migration`) — wrappt Transaction, idempotent, kein psql/libpq nötig
- **Staging-DB ist nicht mehr verfügbar:** Die in alten Commits erwähnte Staging-DB `aebcwjjcextzvflrjgei` (eu-west-1) existiert nicht mehr (DNS löst nicht mehr auf). Für Dry-Runs aktuell kein Staging — Option A: temporärer Supabase-Branch (~$0.01/h via MCP `create_branch`), Option B: lokales `docker run postgres:17` mit Dump-Restore, Option C: idempotente Migrations direkt auf Prod wenn additiv + rollback-script parat (Bevorzugt für additive Changes wie Meili-Sync-Tables rc40)
- `pg_dump` Version Mismatch: VPS hat v16, Supabase PG17 → `docker run --rm --network=host postgres:17 pg_dump ...`
- Supabase DB-Passwörter alphanumerisch halten — Sonderzeichen killen Shell-Paste

**Query-Patterns:**
- **Search auf Release/Artist/Label (rc39):** IMMER `buildReleaseSearchSubquery()` aus `backend/src/lib/release-search.ts` — nutzt GIN-FTS auf `Release.search_text` (~20-30ms auf 52k Rows). Niemals Multi-Column-OR-ILIKE schreiben → Seq Scan 6s+. Referenz: `/admin/erp/inventory/search`, `/admin/media`, `/store/catalog`, `/store/catalog/suggest`
- Transaction-Queries: LEFT JOIN (nicht INNER) — Direktkäufe haben kein `block_item_id`. `COALESCE(block_item.release_id, transaction.release_id)`
- Release.current_block_id (uuid) ↔ auction_block.id (text) brauchen Type-Cast beim JOIN

**Runtime:**
- Timeouts = Idle-Detection, nicht Job-Dauer. Für lang laufende Ops SSE-Heartbeat alle 5s (`SSEStream.startHeartbeat(5000)`), nicht `proxy_read_timeout` hochdrehen
- Long-running Loops müssen von `res.write()` entkoppelt sein. HTTP-Teardown killt tightly-coupled Handler STILL. Pattern: `void (async () => {...})().catch(...)`, Route returnt 200, Events in DB, UI polled. Siehe `discogs-import/{fetch,analyze,commit}/route.ts`
- Stale Import-Sessions (>6h in non-terminal status) auto-filtered aus `active_sessions`. Manuell: `UPDATE import_session SET status='abandoned' WHERE status NOT IN ('done','abandoned','error') AND created_at < NOW() - INTERVAL '6 hours'`

**Preise (rc47.2):**
- `Release.shop_price` ist der **einzige** Shop-Preis (gesetzt vom Inventory-Process). `legacy_price` = tape-mag-Historie (nur Info), `discogs_lowest_price` = Markt-Referenz (nur Info). Nie `legacy_price` als Shop-Preis rendern/validieren. Storefront nutzt `effective_price` aus API, Admin nutzt `shop_price` direkt
- Verify/Add-Copy schreiben Copy #1: `Release.shop_price = new_price` (kanonisch) + `Release.legacy_price = new_price` (defensiver Mirror für Legacy-Leser) + `erp_inventory_item.exemplar_price = new_price`. Multi-Copy (Copy #2+) schreibt nur `exemplar_price` auf Item-Level
- Defaults die Verify setzt wenn bisher nicht gesetzt: `sale_mode='both'` (wenn NULL/auction_only), `warehouse_location_id` = `is_default=true` Warehouse (ALPENSTRASSE). Nie überschreiben wenn schon was drin steht — explizite User-Wahl (`direct_purchase`) respektiert
- Shop-Visibility-Gate via `site_config.catalog_visibility` (Admin-Toggle): `'visible'` = nur `shop_price>0 AND EXISTS(verified erp_inventory_item)`, `'all'` = zusätzlich ohne Preis + ohne Add-to-Cart
- Helper `backend/src/lib/shop-price.ts::enrichWithShopPrice(pg, rows)` enricht Release-Rows mit `effective_price/is_purchasable/is_verified` — verwenden in band/label/press-Routes und überall wo ein Release-Array an Storefront geht
- Meili-Trigger `trigger_release_indexed_at_self` hat 22-Feld-Whitelist — bei neuen preis-/sale-relevanten Spalten die Spalte dort ERGÄNZEN, sonst kein Delta-Reindex bei Änderung
- Full-Referenz: [`docs/architecture/PRICING_MODEL.md`](docs/architecture/PRICING_MODEL.md) inkl. Verify-Checkliste für Code-Änderungen

**UI:**
- Bid-Inputs: `type="text" inputMode="decimal"` + `parseAmount()` (Komma→Punkt). Nie `parseFloat()` direkt — EU tippt Komma
- `BID_CONFIG.whole_euros_only: true` erzwingt ganzzahlige Gebote (auch Proxy-Max)
- Hidden Storefront-Sections: `{/* HIDDEN: ... */}` Marker (aktuell Discogs-Preise, 5 Dateien) — wiederherstellen nicht löschen
- UI/UX Governance: `docs/UI_UX/` — Shared Components (`Button`, `Input`, `Label`, `Card`) sind Pflicht
- **Admin Dark-Mode (rc40):** Keine hardcoded `background: "#fff"` oder `"white"` in neuen Admin-Komponenten. Immer `C.card` aus `admin-tokens.ts` nutzen. Neutral-Tokens (`C.card/text/muted/border/hover/subtle`) sind CSS-Variables die auf Medusa's `.dark` Root-Class flippen. Accent-Colors (`C.gold/success/error/blue/purple/warning`) sind konstant (in beiden Modes lesbar). Einzige erlaubte Ausnahme: Toggle-Knob auf farbigem Slider (Kontrast-Requirement) und Email-Preview-iframe. Badge-Opacity-Concat (`color + "12"`) funktioniert nur mit Accent-Hex, nicht mit CSS-Var-Tokens — `BADGE_VARIANTS.neutral` nutzt explizite Werte

**Meilisearch (rc40+):**
- Single Source of Truth für Docs: `meilisearch_sync.py` pusht ALLE `Release`-Rows (auch ohne coverImage). Visibility wird zur Query-Zeit via Meili-Filter `has_cover: true` gesteuert, nicht beim Indexing. `meilisearch_drift_check.py` muss entsprechend `COUNT(*)` zählen, nicht `WHERE coverImage IS NOT NULL`
- Settings-API: `primaryKey` gehört zu `POST /indexes`, nicht zu `PATCH /indexes/:uid/settings` — 400 bad_request. `apply_settings()` strippt `primaryKey` defensiv
- Tasks-API-Race: `taskUid` ist synchron in der POST-Response, aber `/tasks/:uid` kann bis zu 5 Sek 404 returnen (swap-indexes nach heavy batch-push). `wait_for_task()` retried 404 in den ersten 5s
- Long-running Loops wie `--full-rebuild` dürfen mitten im Build crashen ohne Prod-Impact: Staging-Indexes werden über atomic swap erst aktiv, Prod-Index bleibt intakt. Orphan-Staging-Indexes manuell cleanen via DELETE `/indexes/:staging`
- ENV-Loading auf VPS über `scripts/meili-cron-env.sh` Wrapper (sourced beide .env-Files + aliased `DATABASE_URL` → `SUPABASE_DB_URL` für das Sync-Script)
- Meili SDK `meilisearch@^0.45.0` (CJS-kompatibel). `0.57+` ist ESM-only und funktioniert NICHT im Medusa 2.x CJS-Runtime — `TS1479: CommonJS module whose imports will produce 'require' calls`
- Flag-Kill-Switch: `/app/config` OFF → Postgres-FTS sofort live, kein Deploy nötig. Auch via SQL-UPDATE auf `site_config.features`

**Cwd-independente Pfade:** Backend nutzt NIE `process.cwd()`/relative `__dirname`. Immer `getProjectRoot()` etc. aus `backend/src/lib/paths.ts`. PM2 cwd ist `.medusa/server/`, nicht Source-Tree.

**Hardware:** Brother QL-820NWB + Print Bridge — Details in [`docs/hardware/BROTHER_QL_820NWB_SETUP.md`](docs/hardware/BROTHER_QL_820NWB_SETUP.md). Print Bridge (Python stdlib LaunchAgent auf `127.0.0.1:17891` HTTPS via mkcert, brother_ql-Backend) ersetzt QZ Tray komplett seit rc34. Rollout: `frank-macbook-setup/install.sh`. Robins Mac ohne Brother → DRY_RUN.

## Database Schema

**Legacy (camelCase, Knex-Only):**
- `Release` (~52.8k total, ~44k mit coverImage) — `product_category`: release/band_literature/label_literature/press_literature. Visibility: `coverImage IS NOT NULL`. Kaufbar: `legacy_price > 0 AND legacy_available = true`. **`search_text`** denormalisiert (title + catalogNumber + article_number + Artist.name + Label.name) mit GIN-tsvector `idx_release_search_fts` + Trigger für Auto-Pflege. **`search_indexed_at`** (rc40): `TIMESTAMPTZ NULL`, NULL = "needs Meili-reindex", gesetzt via 3 Trigger (Release self mit 22-Feld-Whitelist, entity_content, erp_inventory_item) + explicit bumps in legacy_sync_v2.py + discogs_daily_sync.py. Partial Index `idx_release_search_indexed_at_null`. `sale_mode`: `auction_only`|`direct_purchase`|`both`
- `Artist` (12.451), `Label` (3.077), `PressOrga` (1.983), `Format` (39), `Image` (+`rang`), `Track`, `ReleaseArtist`
- `sync_change_log` (14-Field Diff, v2 seit 2026-04-05) + `sync_log` (Run-Summary mit run_id/phase/rows_*/validation_status)
- `entity_content` (CMS Band/Label/Press), `gallery_media` (9 Sektionen), `content_block`, `shipping_*` (5 Tabellen)
- `site_config`, `musician`/`musician_role`/`musician_project` (897 Musiker, 189 Bands), `promo_code`, `order_event`, `LabelPerson`/`LabelPersonLink` (458)
- **legacy_available:** MySQL `frei`-Feld — `frei=1`→true, `frei=0`→false, `frei>1` (Unix-TS) → false (auf tape-mag verkauft)

**Auction/CRM/Import (snake_case, Medusa ORM+Knex):**
- Auction: `auction_block`, `block_item`, `bid`, `transaction`, `cart_item`, `saved_item`
- CRM: `customer_stats` (stündlicher Recalc), `customer_note`, `customer_audit_log`
- Discogs Import (v6.0, rc26): `import_session`, `import_event`, `discogs_api_cache`, `import_log`, `session_locks` (Lock-Heartbeat 30s, Stale 150s). Siehe `docs/architecture/DISCOGS_IMPORT_SESSION_LOCK_PLAN.md`
- ERP: `erp_inventory_item` (mit `copy_number`, `condition_media/sleeve`, `exemplar_price`, UNIQUE(release_id, copy_number)), `erp_inventory_movement`, `bulk_price_adjustment_log`
- Meilisearch Sync (rc40): `meilisearch_index_state` (release_id PK, indexed_at, doc_hash — defense-in-depth für Delta-Sync), `meilisearch_drift_log` (30-min cron, severity ok/warning/critical)

**bilder_typ Mapping (Regression-Schutz):** 10=releases, 13=band_literature, 14=labels_literature, 12=pressorga_literature

**Migrierte Daten:** 12.451 Artists · 3.077 Labels · ~41.529 Releases (30.159 release + 3.915 band_lit + 1.129 label_lit + 6.326 press_lit) · ~75.124 Images · CoverImage-Coverage 93-97%. IDs: `legacy-{entity}-{id}`

## API Quickref

**Store (x-publishable-api-key):** `/store/auction-blocks[/:slug]`, `/store/catalog[/:id]`, `/store/catalog/suggest` (rc40: Meili discovery-profile, highlight), `/store/labels/suggest` (rc40: Postgres trgm, Label-Picker), `/store/band|label|press/:slug`, `/store/gallery`, `/store/account/{bids,cart,orders,saved,status,gdpr-export}`, Payment: `/create-payment-intent`, `/create-paypal-order`, `/capture-paypal-order`, Invoice: `/orders/:groupId/invoice`

**Admin:** Groups:
- Auction: `/auction-blocks` (CRUD, delete, live-bids, bids-log)
- Transactions: `/transactions` (list/ship/refund/note/cancel/export/bulk-ship/shipping-label)
- Catalog: `/media` (41k Releases mit 15+ Filtern inkl. rc23 Inventur-Filter), `/media/filter-options`
- Customers: `/customers/{list,:id,recalc-stats,export,:id/{notes,timeline,block,anonymize,gdpr-export,delete}}`
- Discogs Import: `/discogs-import/{upload,fetch,analyze,commit,history[/:runId[/export]],session/:id/{status,cancel,pause,resume}}`
- ERP: `/erp/locations` (CRUD, default-setzen), `/erp/inventory/{search,upload-image,...}`
- POS: `/pos/{sessions[/:id/{items,checkout}],customer-search,customers,stats,transactions[/:id/receipt]}`
- AI: `/ai-chat` (SSE, Haiku, 5 read-only Tools), `/ai-create-auction` (SSE, Sonnet, 3 write Tools)
- Print: `/print-bridge/sample-label` (Test-Label — Ordner `print-bridge` weil `*test*` gefiltert wird)
- Entity/Sync: `/entity-content/overhaul-status`, `/sync/discogs-health`, `/sync/change-log`

## Payment

- **Stripe** (`acct_1T7WaYEyxqyK4DXF`, frank@vod-records.com, Live). Webhook: `api.vod-auctions.com/webhooks/stripe`. Events: `checkout.session.{completed,expired}`, `payment_intent.{succeeded,payment_failed}`. Methoden: Card/Klarna/Bancontact/EPS/Link
- **PayPal** (Live, Webhook ID `95847304EJ582074L`). Events: `PAYMENT.CAPTURE.{COMPLETED,DENIED,REFUNDED}`. Client-side Order via JS SDK (Sandbox-Bug mit EUR/DE)
- **Transaction Status:** `status`: pending→paid→refunded/partially_refunded/cancelled/failed · `fulfillment_status`: unfulfilled→packing→shipped→delivered/returned · `order_number`: VOD-ORD-XXXXXX
- **Checkout:** One-Page Two-Column (Address → Method → Stripe PaymentElement inline → `stripe.confirmPayment()`). Phase C offen: Apple/Google Pay, Google Places, gespeicherte Adressen

## Shipping

Gewichtsbasiert · 3 Zonen (DE/EU/World) · 13 Artikeltypen · 15 Gewichtsstufen · Fallback DE €4.99 / EU €9.99 / World €14.99 · Admin: `/admin/shipping` (5 Tabs)

## Email

- **Resend** (`noreply@vod-auctions.com`) — Transaktional (welcome, bid-placed/won, outbid, payment, shipping, feedback, payment-reminder, waitlist, invite, password-reset)
- **Brevo** (`newsletter@vod-auctions.com`) — 4 Newsletter-Templates + CRM (3.580 tape-mag-Kontakte, List ID 5)
- **Mailboxes (all-inkl):** `support@` (zentral, alle Reply-To), `privacy@` (DSGVO). Aliase → support@: `info@`, `billing@`, `orders@`, `abuse@`, `postmaster@`. Aliase → Frank: `frank@`, `press@`
- **Single Source of Truth:** `backend/src/lib/email.ts` exportiert `SUPPORT_EMAIL`, `PRIVACY_EMAIL`

## Image Storage (Cloudflare R2)

Bucket `vod-images` · Public: `https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev`

Prefixes: `tape-mag/standard/` (83.150 Legacy), `tape-mag/discogs/` (43.025 WebP, seit 2026-04-12), `tape-mag/uploads/` (iPhone-Fotos Stocktake)

Shared Lib: `backend/src/lib/image-upload.ts` — `optimizeImage()`, `uploadToR2()`, `downloadOptimizeUpload()`, `isR2Configured()`. Upload-Endpoint: `POST /admin/erp/inventory/upload-image` (base64). Deps: backend `sharp` + `@aws-sdk/client-s3`, scripts `Pillow` + `boto3`

## Credentials (ENV)

```
# backend/.env
DATABASE_URL, MEDUSA_ADMIN_ONBOARDING_TYPE
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE=live, PAYPAL_WEBHOOK_ID
RESEND_API_KEY, BREVO_API_KEY, BREVO_LIST_VOD_AUCTIONS=4, BREVO_LIST_TAPE_MAG=5
SUPABASE_SERVICE_ROLE_KEY    # Anti-Sniping Realtime Broadcast
REVALIDATE_SECRET, STOREFRONT_URL=https://vod-auctions.com
RUDDERSTACK_WRITE_KEY, RUDDERSTACK_DATA_PLANE_URL
ANTHROPIC_API_KEY            # AI Assistant
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
SUPPORT_EMAIL, PRIVACY_EMAIL, EMAIL_FROM
MEILI_URL=http://127.0.0.1:7700        # rc40: localhost Meili (Docker)
MEILI_ADMIN_API_KEY                    # rc40: 1Password "VOD Meilisearch Master Key" (Work)

# storefront/.env.local
NEXT_PUBLIC_{STRIPE_PUBLISHABLE_KEY,PAYPAL_CLIENT_ID,SUPABASE_URL,SUPABASE_ANON_KEY,BREVO_CLIENT_KEY,GA_MEASUREMENT_ID}
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
GATE_PASSWORD=vod2026, REVALIDATE_SECRET, RUDDERSTACK_*

# scripts/.env
OPENAI_API_KEY, LASTFM_API_KEY, YOUTUBE_API_KEY, BRAVE_API_KEY, SUPABASE_DB_URL, LEGACY_DB_*, R2_*
```

## Test Accounts

- `bidder1@test.de` / `test1234` (`cus_01KJPXG37THC2MRPPA3JQSABJ1`)
- `bidder2@test.de` / `test1234` (`cus_01KJPXRK22VAAK3ZPHHXRYMYQT`) — winning Lot #1
- `testuser@vod-auctions.com` / `TestPass123!` (`cus_01KJZ9AKFPNQ82QCNB3Q6ZX92T`) — Direktkauf
- Test Block "Industrial Classics 1980-1985" (`01KJPSH37MYWW9MSJZDG58FT1G`, ended)
- Stripe Test-Karte: `4242 4242 4242 4242`. Webhook lokal: `stripe listen --forward-to localhost:9000/webhooks/stripe`

## Cronjobs (VPS) & Scripts

```bash
# Crontab (VPS)
0 * * * * cd ~/VOD_Auctions/scripts && venv/bin/python3 legacy_sync_v2.py >> legacy_sync.log 2>&1
0 2 * * 1-5 cd ~/VOD_Auctions/scripts && venv/bin/python3 discogs_daily_sync.py >> discogs_daily.log 2>&1

# Meili cron (rc40, via meili-cron-env.sh Wrapper)
*/5 * * * *  . ~/VOD_Auctions/scripts/meili-cron-env.sh && cd ~/VOD_Auctions/scripts && venv/bin/python3 meilisearch_sync.py >> meilisearch_sync.log 2>&1
0 3 * * *    . ~/VOD_Auctions/scripts/meili-cron-env.sh && cd ~/VOD_Auctions/scripts && venv/bin/python3 meilisearch_sync.py --cleanup >> meilisearch_sync.log 2>&1
*/30 * * * * . ~/VOD_Auctions/scripts/meili-cron-env.sh && cd ~/VOD_Auctions/scripts && venv/bin/python3 meilisearch_drift_check.py >> meilisearch_drift.log 2>&1
0 4 * * *    . ~/VOD_Auctions/scripts/meili-cron-env.sh && curl -fsS -X POST -H "Authorization: Bearer $MEILI_MASTER_KEY" http://127.0.0.1:7700/dumps >> ~/VOD_Auctions/scripts/meili_dumps.log 2>&1 && find /root/meilisearch/dumps -mtime +7 -delete

# Format-V2 Cutover-Reminder (rc51.7, 2026-04-25 → triggers 2026-05-19)
0 9 * * *    cd ~/VOD_Auctions/scripts && venv/bin/python3 cutover_reminder.py >> cutover_reminder.log 2>&1

# Scripts (scripts/venv aktivieren)
python3 legacy_sync_v2.py [--dry-run] [--pg-url "$STAGING_URL"]
python3 discogs_daily_sync.py [--chunk 2 --rate 25]
python3 meilisearch_sync.py [--apply-settings|--full-rebuild|--cleanup|--dry-run]
python3 meilisearch_drift_check.py
python3 cutover_reminder.py [--dry-run|--force]
python3 entity_overhaul/orchestrator.py --type artist --phase P2
python3 validate_labels.py [--commit data/label_validation_review.csv]
python3 crm_import.py --phase 2
```

## Core Concepts

- **Themen-Block-Modell:** Alle Auktionen in kuratierten Blöcken (1-500 Items). Block-Typen: Themen/Highlight/Clearance/Flash. Reservierung: available → reserved → in_auction → sold/unsold
- **Platform Modes:** `beta_test` (Passwort-Gate) → `pre_launch` (Invite-System) → `preview` → `live` (Gate entfernt) → `maintenance`. Admin: `/admin/config` → Access/Launch. Middleware Cache 5min
- **Pre-Launch:** `/apply` → Admin approves → Token `VOD-XXXXX-XXXXX` → `/invite/[token]`. Tabellen: `waitlist_applications`, `invite_tokens`, `invite_token_attempts`
- **Admin Design System:** `admin/components/` — `admin-tokens.ts`, `admin-layout.tsx` (PageHeader/Tabs/StatsGrid), `admin-ui.tsx` (Badge/Toggle/Toast/Modal). Verbindlicher Guide: `docs/DESIGN_GUIDE_BACKEND.md` v2.0
- **Admin Navigation:** 8 Sidebar-Items (Dashboard, Auction Blocks, Orders, Catalog, Marketing, Operations, ERP, AI Assistant). Sub-Pages nur über Hub-Karten
- **Deployment Methodology:** "Deploy early, activate when ready" — Feature Flags in `backend/src/lib/feature-flags.ts` + `site_config.features` JSONB. Additive-only Migrationen. Siehe [`docs/architecture/DEPLOYMENT_METHODOLOGY.md`](docs/architecture/DEPLOYMENT_METHODOLOGY.md)
- **Sync-Architektur:** `legacy_sync_v2.py` stündlich, 14-Field Diff + V1-V4 Post-Run-Validation. A5/A6 (Dead-Man-Switch + Alerting) pending. Plus seit rc40: explicit bumps `search_indexed_at=NULL` nach jedem Release-Write (defense-in-depth für Meili-Delta-Sync, weil Trigger A nur auf UPDATE feuert, nicht INSERT-Branch des UPSERT). Siehe `docs/architecture/SYNC_ROBUSTNESS_PLAN.md`
- **Preis-Modell (rc47.2):** `Release.shop_price` ist **einziger** Shop-Preis (gesetzt vom Inventory-Process im Verify/Add-Copy). `legacy_price` = nur tape-mag-Historie, `discogs_lowest_price` = nur Markt-Referenz. Wahrheits-Hierarchie: Storefront `effective_price = shop_price` (kein Fallback); Label-Pipeline `COALESCE(exemplar_price, shop_price, legacy_price)`. Verify setzt Defaults `sale_mode='both'` (wenn NULL/auction_only) + `warehouse_location_id=ALPENSTRASSE` (wenn NULL). Vollständige Doku: [`docs/architecture/PRICING_MODEL.md`](docs/architecture/PRICING_MODEL.md)
- **Catalog Visibility (rc47.2):** `site_config.catalog_visibility='visible'` (Default) zeigt nur Items mit `shop_price > 0 AND EXISTS(verified erp_inventory_item)` → Preis + Add-to-Cart. `catalog_visibility='all'` zeigt zusätzlich Items ohne Preis — ohne Preis-Tag, ohne Add-to-Cart (Auction-Bid bleibt aktiv). URL-Param `for_sale=true` forciert immer `'visible'`-Semantik. Implementierung: Meili-Filter `is_purchasable=true` (via `has_shop_price AND has_verified_inventory AND legacy_available` in `meilisearch_sync.py::transform_to_doc`), Postgres-Fallback mit identischer WHERE-Klausel, Helper `backend/src/lib/shop-price.ts::enrichWithShopPrice()` für Category-Pages.
- **Search-Architektur (rc40):** Gesplittet zwischen Storefront (Meili) und Admin (Postgres-FTS):
  - **Storefront** — `/store/catalog` + `/store/catalog/suggest` gehen über Meilisearch 1.20 (self-hosted, VPS `127.0.0.1:7700`, two-profile `releases-commerce`/`releases-discovery`). Flag `SEARCH_MEILI_CATALOG`, 3-Gate-Fallback: Flag OFF → Postgres · Health-Probe tripped → Postgres · try-catch → Postgres. Runtime-Code: `backend/src/lib/meilisearch.ts` + `release-search-meili.ts`. Typo-Tolerance + Facets + Synonyme. Latenz p95 48-58ms.
  - **Admin** — `/admin/erp/inventory/search`, `/admin/media` nutzen weiterhin Postgres-FTS via `Release.search_text` + Shared Helper `backend/src/lib/release-search.ts`. Latenz ~20-30ms, keine Typo-Tolerance, keine Facetten. Phase-2-Backlog.
  - **Label-Suche neu:** `/store/labels/suggest` (Postgres trgm `idx_label_name_trgm`, 3k Rows) ersetzt nicht-praktikable Label-Facette bei 3k distinct values
  - Siehe `docs/optimizing/SEARCH_MEILISEARCH_PLAN.md` + `MEILI_PHASE1_DEPLOYMENT_STEPS.md`

## ERP Module Status

| Modul | Status |
|---|---|
| `ERP_INVENTORY` | **Flag ON, Frank arbeitet aktiv.** Bulk +15% ausgeführt (13.107 Items, `price_locked=true`, Gesamt €465k). Inventur v2: Exemplar-Modell (1 Row/Stück), Goldmine-Grading, iPhone-Foto-Upload. Admin: `/app/erp/inventory[/session]`. Konzepte: `docs/optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md` |
| `POS_WALK_IN` | **Flag ON (Dry-Run).** P0: Scan→Cart→Checkout real, TSE='DRY_RUN'. Admin: `/app/pos[/reports]`. P1 wartet auf Steuerberater |
| `ERP_INVOICING` | nicht impl. (wartet easybill + StB) |
| `ERP_SENDCLOUD` | nicht impl. (Account da, DHL-GK-Nr vorhanden) |
| `ERP_COMMISSION`, `ERP_TAX_25A`, `ERP_MARKETPLACE` | nicht impl. (wartet §14-Freigaben) |

## Entity Content Overhaul (RSE-227)

**P2 PAUSED** — 576/3.650 Entities (Budget $96/$120 verbraucht). Pipeline `scripts/entity_overhaul/` (10 Module, GPT-4o + GPT-4o-mini). Restliche ~15.574 Entities ≈ $553. Budget-Plan Apr $100/Mai $100/... (~6 Monate). P1 Done: 1.013 accepted, Score Ø 82.3. Admin: `/admin/entity-content` + `/admin/musicians`

## Project Structure

```
backend/src/
├── modules/auction/models/  # auction-block, block-item, bid, transaction, cart-item, saved-item
├── api/{admin,store,webhooks}/
├── api/middlewares.ts       # Auth + rawBodyMiddleware (DON'T REMOVE!)
├── lib/                     # stripe/paypal/shipping/brevo/crm-sync/site-config/invite/feature-flags/paths/release-search/release-search-meili/meilisearch/image-upload/email/shop-price.ts
├── scripts/migrations/      # Raw SQL (idempotent, manuell angewendet)
└── admin/{components,routes}/

storefront/src/{app,components,middleware.ts}

scripts/
├── legacy_sync_v2.py        # Cron target (14-Field Diff, RETURNING-verified images, V1-V4 Validation, search_indexed_at bumps)
├── discogs_daily_sync.py    # 5 Chunks, exponential backoff, search_indexed_at bump
├── meilisearch_sync.py      # rc40: delta/full-rebuild/apply-settings/cleanup, two-profile atomic swap
├── meilisearch_drift_check.py  # rc40: 30-min drift cron (ok/warning/critical)
├── meilisearch_settings.json   # rc40: searchable/filterable/sortable/stopwords/synonyms/typoTolerance
├── meili-cron-env.sh        # rc40: env-loader für Cron (sources .env + .env.meili, aliased SUPABASE_DB_URL)
├── data/country_iso.py      # rc40: country-name → ISO-2 für Meili country_code
└── entity_overhaul/         # 10-Module Pipeline

docs/
├── architecture/{CHANGELOG,DEPLOYMENT_METHODOLOGY,SYNC_ROBUSTNESS_PLAN,STAGING_ENVIRONMENT,DISCOGS_IMPORT_SESSION_LOCK_PLAN,PRICING_MODEL}.md
├── optimizing/{SEARCH_MEILISEARCH_PLAN,INVENTUR_WORKFLOW_V2_KONZEPT,POS_WALK_IN_KONZEPT,CATALOG_SEARCH_FIXES_2026-04-22}.md
├── hardware/BROTHER_QL_820NWB_SETUP.md
├── UI_UX/                   # Style Guide, Gap Analysis, Plan, Report, PR Checklist
├── DESIGN_GUIDE_BACKEND.md  # Admin v2.0 (verbindlich)
└── TODO.md                  # Operative Arbeitsliste (Now/Next/Later + Workstreams)
```

## Current Focus

→ Operative Liste: [`docs/TODO.md`](docs/TODO.md)

1. **Discogs-Preview-Modal + JSONB-Fix + Storefront-Revalidate (rc51.9.1 + rc51.9.2 + rc51.9.3, 2026-04-26).** **(rc51.9.2)** „Save Linking" mit geänderter `discogs_id` ruft jetzt `POST /admin/media/:id/discogs-preview`, das `releases`/`marketplace/stats`/`price_suggestions` von discogs.com holt und einen Diff `{current, proposed, has_changes}` ohne DB-Write zurückgibt. `DiscogsReviewModal` zeigt Per-Field-Diff mit Checkboxen — locked-Felder default OFF mit 🔒-Badge, „Select all/none". Apply schreibt durch denselben `POST /admin/media/:id`-Pfad → Audit-Log + Auto-Lock + Meili-Push + Storefront-Revalidate laufen normal. „Refetch from Discogs" routet ebenfalls durch das Preview — kein silent overwrite mehr. Discogs-Country (Name) via neuem `findCountryByName()` auf ISO-2 normalisiert. Out-of-scope: Artist/Label/Cover-Image (dedizierte Picker, würden DB-Inserts triggern). **(rc51.9.1)** Kritischer JSONB-Array-Binding-Fix: node-postgres serialisierte `format_descriptors`-JS-Array als PG-`text[]`, PG hat keinen `text[] → jsonb`-Cast → Save lieferte „An unknown error occurred." Fix via `JSON.stringify` vor `trx.update()`. **(rc51.9.3)** Storefront-Catalog-Detail (`/catalog/[id]`) hatte Next.js-ISR `revalidate: 60` ohne Bust → Stammdaten-Edits bis zu 60s nicht im Shop sichtbar. Neuer Helper `revalidateReleaseCatalogPage(id)` ruft den schon existierenden `/api/revalidate`-Hook (`REVALIDATE_SECRET`, `STOREFRONT_URL`) — fire-and-forget, 3s-Timeout, Fail-silent. ISR-60s-Safety-Net bleibt.
2. **Format-V2 komplett live (rc51.7, 2026-04-25).** 71-Wert-Whitelist (`Vinyl-LP-5`, `Tape-26`, `CD-16`, `Vinyl-7-Inch-3`, …) ersetzt das grobe 16-Wert-Enum, das Format-Typ × Anzahl-Tonträger ungewollt verschmolzen hatte. Backfill 52.788/52.788 Items (100%), 9.794 mit `format_descriptors` (Album, Stereo, Picture Disc …). Neue Spalten `Release.format_v2 varchar(40)` + `format_descriptors jsonb` mit CHECK-Constraint, alte `format`-Spalte parallel (Cutover bewusst zurückgehalten). Single-Source-of-Truth `backend/src/lib/format-mapping.ts` + Python-Spiegel + Storefront-Lib. UI durchgängig auf format_v2: Admin (Edit-Card, Listen, Auction-Blocks, Inventory/Stocktake, POS), Storefront (Catalog/Auctions Detail+Listen+Related+Search+Account), Print-Labels (`displayFormatCompact()` für 29mm-Brother-QL: `LP×5`, `Tape×26`), Email. 6 Commits `707778c` → `0d08636`. Doku: [`docs/architecture/FORMAT_MAPPING_ANALYSIS.md`](docs/architecture/FORMAT_MAPPING_ANALYSIS.md).
3. **Catalog Stammdaten komplett live für ALLE Releases (rc50.0 → rc51.3, 2026-04-24).** 3-Zonen-Modell (rc51.0): Zone 0 (System-IDs, immer locked), Zone 1 (Hard-Stammdaten title/year/country/artistId/labelId/catalogNumber/barcode/description/coverImage — editierbar für ALLE Releases mit Auto-Lock), Zone 2 (genres/styles/credits — always open), Zone 3 (Commerce). **Sync-Lock-Modell (rc51.0):** `Release.locked_fields jsonb` + CASE-WHEN-UPSERT in `legacy_sync_v2.py` — gelockte Felder werden beim stündlichen Sync übersprungen, rc49.4-Performance (47s) bleibt. Per-Field 🔒-Icon + Unlock-Modal + neue Route `POST /admin/media/:id/unlock-field`. **rc51.3 Post-Opus-Review (Big Bundle):** 3 Bugs + 5 Recommendations — updatedAt-camelCase in ai-create-auction + payment-deadline (beide Writer hätten at-runtime gecrashed), upload-image + discogs-import nutzen jetzt `lockFields()`, `HARD_STAMMDATEN_FIELDS` = Re-Export von `SYNC_PROTECTED_FIELDS` (Drift-Prevention), Auto-Lock via `looseEqual()` nur auf tatsächlich geänderte Felder, unlock-field TOCTOU-Fix (FOR UPDATE), **Country-Picker mit 249 ISO-3166-1 Ländern** + Flag-Emoji + EN/DE-Search in `backend/src/admin/data/country-iso.ts`, **Barcode-GTIN-Validation** UPC-A/EAN-13/EAN-8 + Checksum in `release-validation.ts`. Dokumente: [`docs/architecture/SYNC_LOCK_MODEL.md`](docs/architecture/SYNC_LOCK_MODEL.md), [`docs/optimizing/RC51_1_FOLLOWUP_PLAN.md`](docs/optimizing/RC51_1_FOLLOWUP_PLAN.md).
4. **Storefront Pricing Cleanup komplett (rc49.6 + rc49.7, 2026-04-24).** `effective_price = shop_price` end-to-end, `legacy_price` raus aus Storefront. `/store/account/saved` + `/store/account/recommendations` via `enrichWithShopPrice()`. Auction-Detail-Seite: "Catalog Price"-Row entfernt. **rc49.7 kritischer Fix:** `legacy_available` aus `is_purchasable`-Gate raus — 36 Releases mit verifiziertem Bestand wieder kaufbar. Franks `price_locked=true` ist alleinige Shop-Visibility-Authority. Meili Full-Rebuild 52.783 × 2.
5. **Legacy-Sync WHERE-gated UPSERT (rc49.4, 2026-04-24).** **Root-Cause-Fix für stündliche 41k-Meili-Cascade.** `ON CONFLICT DO UPDATE SET ... WHERE <semantic-diff>`. Live-Messung: rows_written=41547, nur 13 echte UPDATEs, Legacy-Sync 180s → 47s (4×), Meili-Traffic −99.97%. Plus rc49.2/rc49.3 Meili-Sync chunked fetch + statement_timeout=5min + stale-cleanup + Backlog-Alert.
6. **Alle Admin+Storefront-Listen auf Meilisearch (rc49.1, 2026-04-23).** Vier Endpoints live: `/store/catalog`, `/admin/media`, `/admin/erp/inventory/browse` + `/search`. Scanner-Pattern bleiben Postgres. Tag-3-Frontend-Polish folgt separat.
7. **Preis-Modell konsolidiert (rc47.2 + rc47.3).** `Release.shop_price` einziger kanonischer Shop-Preis. Verify/Add-Copy schreiben shop_price + Defaults `sale_mode='both'` + `warehouse_location_id=ALPENSTRASSE`.
8. **System Health Observability komplett (rc41-rc47.1).** 25 Checks, Sampler, 7-stufiges Severity, Alert-History, Sentry-Embed, Log-Drawer, Public Status Page, 7 Runbooks. P4-E destructive Actions offen — nach 4 Wochen re-evaluieren.
9. **Frank briefen auf rc50.0 → rc51.9.3 UI-Neuerungen:** Edit-Stammdaten für ALLE Releases (auch Legacy), per-Field 🔒-Icons + Unlock-Modal, Country-Picker mit Flag + EN/DE-Search, Barcode strict-Validation, neuer Discogs-ID-Change-Review-Modal, Storefront-Updates jetzt ~1s statt bis-zu-60s nach Edit. MacBook-Air-Rollout ausstehend. **Wichtig für Frank zum Verstehen:** `Release.legacy_condition` ist tape-mag-MySQL-eigen (z.B. „Limited Edition, Numbered, Pearl") — wird nie vom Discogs-Apply überschrieben (kein Discogs-Pendant), erscheint deshalb nicht im Apply-Modal. Wenn Frank das ändern will: separat über Edit-Stammdaten-Card.
10. **POS P0 Dry-Run live** — Frank testet Scan→Cart→Checkout.
11. **L1:** AGB-Anwalt beauftragen (Launch-Blocker, RSE-78).
12. **`supabase_realtime: degraded`** (non-blocker): Realtime-Service aktivieren sobald Live-Bidding live geht.

**Arbeitsregeln:**
- Keine Task-Listen hier pflegen — `docs/TODO.md` nutzen
- Bei Meilensteinen Current Focus aktualisieren
- Epics + externe Blocker in Linear
- **Nach jedem Deploy mit Tag-würdiger Änderung:** `docs/architecture/CHANGELOG.md` UND `gh release create vX.X.X-rcXX` pflegen. Release-Notes kompakter als CHANGELOG, aber Key-Messungen + Breaking Changes drin

## Linear

Project: https://linear.app/rseckler/project/vod-auctions-37f35d4e90be

| Issue | Thema | Status | Blocker |
|---|---|---|---|
| RSE-78 | Launch vorbereiten | backlog, **High** | AGB-Anwalt |
| RSE-227 | Entity Content Overhaul | in progress (paused) | Budget |
| RSE-288 | Discogs Preisvergleich-UI | backlog | Echte Sale-Daten |
| RSE-294 | Erste öffentliche Auktionen | backlog | RSE-78 |
| RSE-295 | Marketing-Strategie | backlog | RSE-294 |
| RSE-289 | PWA + Push-Notifications | backlog | Later |
| RSE-291 | Multi-Seller Marketplace | backlog | v2.0.0 |

→ Vollständiger Changelog: [`docs/architecture/CHANGELOG.md`](docs/architecture/CHANGELOG.md)

---
**Author:** Robin Seckler (rseckler@gmail.com)
