# VOD Auctions — Project Status

**Stand:** 2026-04-24
**Release-Level:** `v1.0.0-rc51.3`
**Platform Mode:** `beta_test`
**Author:** Robin Seckler

---

## Executive Summary

VOD Auctions ist technisch launch-fähig. Die Catalog-Pipeline (rc40-rc51.3), Payment-Integration, System-Health-Observability (rc41-rc47.1) und Inventur-Workflow v2 sind auf Prod live. Der kritische Pfad zum öffentlichen Launch (`platform_mode: live`) hängt an **drei externen Abhängigkeiten**: AGB-Anwalt, Rate-Limiting-Implementierung (DSGVO) und Impressum/Datenschutz-Finalisierung.

Alle anderen offenen Punkte sind entweder **parallelisierbar**, **Post-Launch-Polish** oder **bewusst geparkt** (Budget-/Steuerberater-/Feature-Entscheidungen).

---

## Critical Path to Launch

Die folgende Sequenz ist der kürzeste Pfad von `beta_test` zu `live`:

| Nr. | Item | Typ | Effort | Abhängigkeit |
|----:|------|-----|-------:|--------------|
| 1 | AGB-Anwalt beauftragen | Extern | 2-4 Wochen | Keine — sofort startbar |
| 2 | Rate-Limiting + Redis-Integration | Code | 1-2 Tage | Keine — parallel zu #1 |
| 3 | Impressum + Datenschutz finalisieren | Content | 0.5 Tage | #1 fertig |
| 4 | Erste öffentliche Auktionen aufsetzen (RSE-294) | Content | 1 Tag | #1 fertig |
| 5 | Platform Mode `beta_test` → `pre_launch` → `live` | Config | 5 Min | #1-#4 fertig |

**Realistische Launch-Timeline:** 4-6 Wochen, getrieben von der Anwalts-Durchlaufzeit.

---

## 1. Launch-Blocker (🔴 kritisch)

### 1.1 AGB-Anwalt (RSE-78)

**Status:** offen · **Owner:** Robin · **Blocker:** Extern (Anwaltssuche)

E-Commerce-spezifische AGB-Prüfung für Auktionsplattform. Eingehender Scope: Widerruf, Zahlung, Versand, Auktionsrecht (D/EU), Gewährleistung, Datenschutz-Querverweise.

**Nächste Aktion:** Anwalt kontaktieren, Briefing-Pack vorbereiten.

### 1.2 Rate-Limiting + Redis (DSGVO)

**Status:** Infrastruktur ready · **Owner:** Robin · **Blocker:** Code-Implementierung

Upstash-Projekt `vod-auctions` muss angelegt + `backend/src/lib/redis.ts` + `rate-limit.ts` gebaut werden. Fail-open-Pattern (bei Redis-Outage blockieren wir keine Requests).

**Scope:**
- Upstash-Projekt anlegen (Free-Plan, `eu-central-1`)
- Credentials in 1Password + `backend/.env`
- Deps: `@upstash/redis`, `@upstash/ratelimit`
- Typisierter Client mit `getRedis()` (returns null wenn nicht konfiguriert)
- Helper `checkRateLimit(identifier, config)` → `{ success, remaining, reset }`

**Rate-Limits (final bei Tests justieren):**
| Endpoint | Limit | Fail-Behavior |
|----------|-------|---------------|
| `/auth/customer/emailpass` | 5 Versuche / 15 Min / IP | fail-open |
| `/api/gate` (Storefront) | 10 Versuche / h / IP | fail-open |
| `/store/waitlist/apply` | 3 Submissions / h / IP | fail-open |
| `/store/account/bids` | 30 Gebote / Min / User | fail-open |
| Admin-Endpoints | TBD separater Limit | fail-closed (TBD) |

**Response-Format:** 429 mit `Retry-After` + `X-RateLimit-*` Headers

**Test-Kriterien:**
- Brute-Force-Test gegen Login (10 Versuche in 1 Min) → 429
- Apply-Form-Spam (4 Submissions) → 429 bei Nr. 4
- Bid-Stress-Test (31 Gebote/Min) → 429 bei Nr. 31
- Redis-Down-Test → Endpoints funktionieren weiter, keine 500er

**DSGVO-Konsequenzen:**
- Datenschutz-Seite (`storefront/src/app/datenschutz/page.tsx`) Zeilen 129/210/214 präzisieren: "zur Rate-Limiting-Verarbeitung", nicht "Caching von Katalogdaten"
- AVV mit Upstash prüfen (Art. 28 DSGVO) — falls keiner besteht, abschließen
- System-Health Redis-Check sinnvoll darstellen (connected + latency)

### 1.3 Impressum + Datenschutz finalisieren

**Status:** Entwurf vorhanden · **Owner:** Robin · **Blocker:** AGB-Anwalt-Freigabe

Querverweise zwischen AGB/Impressum/Datenschutz müssen konsistent sein. Finalisierung nach AGB-Freigabe.

### 1.4 Platform Mode Flip

**Status:** Infrastruktur ready · **Owner:** Robin · **Blocker:** 1.1-1.3 abgeschlossen

`/admin/config` → Access/Launch Section. Reihenfolge:
1. `beta_test` → `pre_launch` (Invite-System aktiv, Waitlist annehmen)
2. `pre_launch` → `live` (Gate entfernt, öffentlich)

Middleware-Cache 5min — nach Flip max. 5min bis Storefront offen.

---

## 2. Aktive Workstreams (🟡 in Progress)

### 2.1 Inventur Workflow v2 — Frank arbeitet aktiv

**Status:** Produktiv, Frank dokumentiert weiter · **Owner:** Frank · **Feature Flag:** `ERP_INVENTORY` ON

**Offene Punkte:**
- MacBook Air als Zweit-Gerät ausrollen (`bash frank-macbook-setup/install.sh`)
- onScan.js HID-Scanner-Integration im Session-Screen (Phase B6)
- Discogs-Mapping Manual Review (`docs/audit_discogs_flagged_2026-04-21.csv` — 10 Low-Score + 138 Mittlere Cases, Frank-Selbstbedienung)

### 2.2 POS Walk-in Sale — P0 Dry-Run live

**Status:** P0 (Scan→Cart→Checkout) live mit `TSE='DRY_RUN'` · **Owner:** Frank testet · **Feature Flag:** `POS_WALK_IN` ON

**Wartet auf Steuerberater-Entscheidungen (alle parallelisierbar):**
| Entscheidung | Impact |
|--------------|--------|
| Kleinunternehmer-Status §19 UStG | USt-Logik an/aus |
| TSE-Anbieter (fiskaly/efsta/andere) | Integration-Code |
| Bon-Hardware (Brother QL 62mm vs. POS-Thermo) | Label-Pipeline |
| Tax-Free Export (Variante A: direkt steuerfrei / B: erst USt dann erstatten) | Checkout-Flow |
| Brutto vs. Netto in `legacy_price` | Gesamte Preis-Logik |
| Retoure-Workflow (TSE-Storno) | Refund-Code |
| SumUp-Integration-Level (extern vs. REST API) | Payment-Flow |
| Storefront-Conflict bei Live-Auktionen (hard-block vs. soft-warning) | UX-Entscheidung |

**Phase-Roadmap nach Freigabe:**
| Phase | Scope | Effort |
|-------|-------|-------:|
| P1 | Tax-Logik aktivieren + Bon-Druck auf Brother | ~1.5 Tage |
| P2 | TSE-Integration fiskaly | ~2 Tage |
| P3 | Tax-Free Documents + Tracking | ~1.5 Tage |
| P4 | SumUp REST API (optional) | ~2-3 Tage |

**Parallele Vorbereitung:**
- fiskaly-Account anlegen (oder Alternative wählen)
- DK-22205 62mm Rolle bestellen (falls Brother gewählt)
- BMF-Musterformular für Ausfuhr-/Abnehmerbescheinigung anfragen

---

## 3. Post-rc51.3 Follow-ups (🟢 Polish)

Non-blocking, können jederzeit erledigt werden.

### 3.1 Frank-Briefing (F.2)

**Priorität:** Mittel · **Effort:** 30 Min

Frank auf rc50.0 → rc51.3 UI-Neuerungen briefen:
- Edit-Stammdaten für ALLE Releases (auch Legacy tape-mag)
- Per-Field 🔒-Icons + Unlock-Confirm-Modal
- Country-Picker mit Flag-Emoji + EN/DE-Search
- Barcode strict-Validation (UPC-A/EAN-13/EAN-8 + Checksum)
- SourceBadge mit "N fields locked from sync"-Tooltip
- AuditHistory-Tab + RevertConfirmModal (4 Views)

### 3.2 `refetch-discogs/route.ts` Gap (F.3)

**Priorität:** Niedrig · **Effort:** 15 Min

Route aktualisiert `genres`/`styles`/`discogs_*` direkt ohne `pushReleaseNow` und ohne Audit-Log. Trigger `release_indexed_at_self` fängt es zeitverzögert via `search_indexed_at`-Bump — aber on-demand-Reindex wäre schneller + Audit-Trail konsistenter.

**Nächste Aktion:** Add `pushReleaseNow(pg, id).catch(log)` + `logEdit()` falls sinnvoll.

### 3.3 Bulk-Edit Zone-2-Soft-Stammdaten (F.4)

**Priorität:** Niedrig · **Effort:** 1 Stunde

Individual Route audited Zone-2-Felder (`barcode`, `credits`, `genres`, `styles`). Bulk-Route noch nicht. Scope-Choice wenn Frank es anfragt.

---

## 4. Infrastruktur-Next (🟡 geplant)

### 4.1 Sendcloud-Integration (`ERP_SENDCLOUD`)

**Status:** Voraussetzungen vorhanden (Account + DHL-GK-Nr. `5115313430`), Code pending
**Effort:** ~2-3 Tage
**Dependencies:** Staging-HTTP-Layer BEVOR Live-Code deployed wird

**Scope:**
- Sendcloud Client-Wrapper + DHL-Konfiguration
- Admin-UI Shipping-Label-Generierung in Orders-Detail
- Feature Flag `ERP_SENDCLOUD` aktivieren nach Tests

### 4.2 Sync Monitoring P3

**Status:** Weitgehend durch System Health abgedeckt (rc41-rc47.1), Lücken bleiben
**Effort:** ~1 Tag

**Offen:**
- Dead-Man's-Switch für `legacy_sync_v2` Script-Crash (Case: Script läuft gar nicht → keine `sync_log`-Row → kein Alert via `sync_log_freshness`)
- E-Mail-Alerting via Resend bei failed Runs (A6)
- V3 `orphan_labels` bereinigen (216 Releases, kosmetisch)
- Grafana Dashboards (60m + 24h Aggregates)

---

## 5. Backlog (🔵 Later)

Bewusst geparkt, wird nach Launch re-priorisiert.

| Thema | Parken-Grund |
|-------|--------------|
| Entity Content Overhaul (RSE-227) | Budget-Freigabe nötig (P2 paused bei 576/3650, ~$553 Rest-Budget) |
| CRM Rudderstack-Integration | Post-Launch, Infrastruktur-Invest |
| Admin UI Hub-Refactoring | Kosmetisch, kein User-Impact |
| ERP Invoicing (easybill) | Steuerberater-Freigabe pending |
| Preis-Modell Phase 2 (Auction-Start = shop_price × 0.5) | Kein konkreter Trigger |
| Meilisearch Phase 2 (Vector-Search + LLM-Re-Rank) | Konzept pending |
| Checkout Phase C (Apple Pay, Google Pay, Places) | Post-Launch-Feature |
| Discogs Prices in Storefront einblenden | Wartet auf echte Sale-Daten |
| `import_event` Cleanup-Job (>30d) | Housekeeping |
| `legacy_sync.py` v1 entfernen | v2 seit 7+ Tagen stabil, kann raus |
| Staging-DB Entscheidung (Branching Pro vs. Free vs. Local) | Architektur-Entscheidung |
| `ERP_COMMISSION` (Konsignationsverträge) | Fachliche Freigabe §14 |
| `ERP_TAX_25A` (Differenzbesteuerung) | Steuerberater-Prüfung |
| `ERP_MARKETPLACE` (Multi-Seller + Stripe Connect) | v2.0.0 Scope |
| `supabase_realtime: degraded` | Non-blocker, aktivieren sobald Live-Bidding live |
| P4-E destructive Health-Actions (pm2_restart, manual_sync) | Nach 4 Wochen re-evaluieren |

---

## 6. Linear-Themen (Management-Ebene)

Epics und externe Blocker — Pflege passiert in Linear, hier nur Referenz.

Project: https://linear.app/rseckler/project/vod-auctions-37f35d4e90be

| Issue | Thema | Status | Priorität | Blocker |
|-------|-------|--------|-----------|---------|
| **RSE-78** | Launch vorbereiten | backlog | **High** | AGB-Anwalt |
| RSE-227 | Entity Content Overhaul | in progress (paused) | Medium | Budget |
| RSE-288 | Discogs Preisvergleich-UI | backlog | Low | Echte Sale-Daten |
| RSE-294 | Erste öffentliche Auktionen | backlog | Medium | RSE-78 |
| RSE-295 | Marketing-Strategie | backlog | Medium | RSE-294 |
| RSE-289 | PWA + Push-Notifications | backlog | Low | Later |
| RSE-291 | Multi-Seller Marketplace | backlog | Low | v2.0.0 |

---

## 7. Arbeitsregeln

- **Launch-Blocker-Fokus:** Bis `live`-Flip keine Non-kritischen Features aufnehmen.
- **Operative Liste:** [`docs/TODO.md`](../TODO.md) enthält alle Items mit Workstream-Struktur.
- **Release-Kommunikation:** Pflicht nach jedem Deploy: `docs/architecture/CHANGELOG.md`-Entry + `gh release create`.
- **3-Ebenen-System:** CLAUDE.md (Focus) + docs/TODO.md (Operativ) + Linear (Epics).

---

## 8. Referenzen

### Architektur-Dokumente
- [`docs/architecture/SYNC_LOCK_MODEL.md`](../architecture/SYNC_LOCK_MODEL.md) — Sync-Lock-Modell (rc51.0)
- [`docs/architecture/PRICING_MODEL.md`](../architecture/PRICING_MODEL.md) — Preis-Modell shop_price/legacy_price
- [`docs/architecture/DEPLOYMENT_METHODOLOGY.md`](../architecture/DEPLOYMENT_METHODOLOGY.md) — Deploy-Strategie
- [`docs/architecture/CHANGELOG.md`](../architecture/CHANGELOG.md) — Vollständiger Release-Historie

### Optimizing-Dokumente
- [`docs/optimizing/CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md`](../optimizing/CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md) — Zone-Modell (rc50.0)
- [`docs/optimizing/RC51_1_FOLLOWUP_PLAN.md`](../optimizing/RC51_1_FOLLOWUP_PLAN.md) — Post-Opus-Review Plan (rc51.3)
- [`docs/optimizing/SEARCH_MEILISEARCH_PLAN.md`](../optimizing/SEARCH_MEILISEARCH_PLAN.md) — Meili Phase 1
- [`docs/optimizing/SYSTEM_HEALTH_OBSERVABILITY_PLAN.md`](../optimizing/SYSTEM_HEALTH_OBSERVABILITY_PLAN.md) — System-Health P4
- [`docs/optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md`](../optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md) — Inventur v2
- [`docs/optimizing/POS_WALK_IN_KONZEPT.md`](../optimizing/POS_WALK_IN_KONZEPT.md) — POS-Konzept

### GitHub
- **Repository:** https://github.com/rseckler/VOD_Auctions
- **Releases:** https://github.com/rseckler/VOD_Auctions/releases
- **Latest:** `v1.0.0-rc51.3` (Big Bundle Post-Opus-Review)

---

*Dieses Dokument ist ein Point-in-Time-Snapshot. Für die aktuell-geführte operative Liste siehe [`docs/TODO.md`](../TODO.md).*
