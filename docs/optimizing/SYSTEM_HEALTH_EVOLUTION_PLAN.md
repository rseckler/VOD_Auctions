# System Health Evolution Plan

**Status:** v2 — überarbeitet nach Review · Freigabe pending
**Autor:** Robin Seckler + Claude Opus 4.7
**Erstellt:** 2026-04-23 · **Letzte Revision:** 2026-04-23 (v2)
**Scope:** `/app/system-health` von Reachability-Dashboard zu production-safe Ops-Dashboard ausbauen (P1), Historie + semantische Checks + Public-Page ergänzen (P2), Severity-Routing + Runbooks (P3).
**Verwandte Docs:** [`DEPLOYMENT_METHODOLOGY.md`](../architecture/DEPLOYMENT_METHODOLOGY.md) · [`SYNC_ROBUSTNESS_PLAN.md`](../architecture/SYNC_ROBUSTNESS_PLAN.md) · [`SEARCH_MEILISEARCH_PLAN.md`](SEARCH_MEILISEARCH_PLAN.md)

---

## 0. Versionshistorie

### v2 — 2026-04-23 (nach Review-Feedback)

Breaking changes gegenüber v1:

1. **Persistenz entkoppelt vom Admin-GET.** Neuer Sampler-Cron liest Checks in festem Intervall und schreibt in `health_check_log`. Admin-UI liest nur noch aus der Tabelle. Samples sind nicht mehr vom Seitenzugriff abhängig.
2. **Check-Klassen eingeführt** — `fast` / `background` / `synthetic` mit unterschiedlichen Timeouts, Intervallen und Retry-Semantik.
3. **Severity-Policy formalisiert** — Entscheidungstabelle mit harten Kriterien pro Stufe. Neue Severity `insufficient_signal` für Business-Checks bei legitim geringer Aktivität.
4. **Public-Mapping-Tabelle** — explizite Abbildung interner Kategorien → externer Kategorien, Severity-Mapping, Redaction-Regeln.
5. **Alert-Transport fixiert** — Resend (transaktional, bereits im Stack). Brevo explizit ausgeschlossen, weil CRM-Newsletter-Kontext Alerts verwässert.
6. **`health_check_log` Schema erweitert** — severity als dedizierte Spalte, category, metadata JSONB, source, environment.
7. **Acceptance-Kriterien präzisiert** — p95-Latenzen, Timeout-Verhalten pro Klasse, Partial-Failure-Handling, Max-Staleness.
8. **Runbook-Priorisierung nach Impact** — 4-Stufen-Priorität statt pauschaler "16+ Runbooks".
9. **LLM-Modell-Zuordnung kompakter** — Kategorien statt per-Task, weniger Pflegeaufwand.
10. **Drei offene Fragen endgültig entschieden** (§3.8).

### v1 — 2026-04-23 (initialer Wurf)

Vollständig ersetzt durch v2. Abrufbar in git history: commit `ec46557`.

---

## 1. Kontext

Die aktuelle System-Health-Seite (rc40.2, 16 Service-Checks) ist ein solider Statuspage.io-artiger Snapshot-Monitor, aber:

- **Sync-Pipelines sind blind** — 6 Cronjobs + Meili-Drift + sync_log werden nicht abgefragt.
- **Infrastruktur-Checks fehlen** — Disk, SSL, PM2-Restart-Counter.
- **Keine Zeitachse** — nur "jetzt gerade", keine 24h-Uptime.
- **Reachability ≠ Funktionsfähigkeit** — "Stripe API antwortet" sagt nichts über "letzter Webhook erfolgreich empfangen".
- **Admin-only** — externe Stakeholder haben keinen Einblick.
- **Keine Alert-Kette** — kritische Fehler stehen stumm auf dem Dashboard.
- **Messung hängt am UI-Zugriff** (v2-Fix) — würde in v1 bedeuten: keine Seitenaufrufe = keine Historie.

**Bereits live (rc40.2):**
- Meilisearch-Check ergänzt (`MEILI_URL`/stats + Feature-Flag-Status).
- Kategorien: "Cache & AI" aufgeteilt in "Data Plane" (upstash/meilisearch/r2-images) + "AI" (anthropic).
- Meili `rankingRules` gefixt.

---

## 2. Zielbild

Nach P3 ist die Seite ein Tier-1-Ops-Dashboard mit:

1. **Entkoppelter Sampler** läuft im Hintergrund, Admin-UI liest nur Snapshots — Messung ist vom Zugriff unabhängig.
2. **9 Kategorien** (Infrastruktur · Data Plane · Sync Pipelines · Payments · Communication · Analytics · AI · Business Flows · Edge/Hardware).
3. **Check-Klassen**: fast/background/synthetic mit eigenen Intervallen und Timeouts.
4. **24h/7d-Uptime-Balken** aus `health_check_log`.
5. **Semantische Business-Checks** mit Kontextualisierung ("Sonntag 03:00 — insufficient signal").
6. **Deploy-Info** (Git-SHA, Uptime, Node-Version) + **Feature-Flags-Snapshot** im Header.
7. **Public Status Page** (`vod-auctions.com/status`, auth-frei, cached 60s).
8. **Severity-Routing** via Resend + Sentry + optional Slack.
9. **Runbook-Links** gestaffelt nach Impact-Priorität.

---

## 3. Transversale Design-Entscheidungen

Alle Entscheidungen werden in P1 fixiert. P2 und P3 bauen darauf auf.

### 3.1 Severity-Policy

Stufen mit harten Kriterien und Ownership-Regel (wer darf welche Severity vergeben):

| Severity | Definition | Kriterium | Ownership | UI |
|---|---|---|---|---|
| `ok` | Funktioniert normal | Check grün, Schwellen eingehalten | default | grün |
| `degraded` | Funktioniert mit Einschränkung, System-induziert | Latency > 2× p50, Fallback aktiv, Drift 0.5-2% | automatisch aus metrics | gelb |
| `warning` | Beobachten, menschliche Aufmerksamkeit binnen 24h | Cron 10-30min alt, SSL < 14 Tage, Disk > 80% | muss durch Check-Definition begründet sein | orange |
| `error` | Kaputt, isoliert, menschliche Aktion nötig | Service down, aber Rest funktioniert | automatisch bei Reachability-Fail | rot |
| `critical` | User-Impact oder Revenue-Impact jetzt | Checkout down, DB down, Realtime weg im Live-Auction-Mode | **nur Tasks explizit als critical markiert** — keine Inflation | rot + Pulse |
| `insufficient_signal` | Nicht messbar weil keine Aktivität erwartet | Webhook-Freshness Sonntag 03:00, Last-Order-Check in Betaphase | Business-Checks only | grau |
| `unconfigured` | Env-Var fehlt | ENV-Check failed | config | grau |

**Governance:** Jede Check-Definition dokumentiert in einem Kommentar:
```ts
// Severity-Mapping:
//   ok:       Latency < 500ms
//   degraded: Latency 500-2000ms  
//   error:    HTTP non-2xx oder Timeout
// Rationale: <Begründung>
```

`critical` darf nur für explizit genannte Checks verwendet werden (initial: postgres, stripe-webhook-receive, checkout-e2e, storefront_public, vps). Neue `critical`-Labels brauchen Plan-Update.

### 3.2 Check-Klassen

| Klasse | Intervall | Timeout | Sichtbarkeit im UI | Typische Checks |
|---|---|---|---|---|
| `fast` | 60 s (oder on-demand via Force-Refresh) | 500 ms | Immer | Postgres-Ping, Feature-Flags-Read, Upstash-Ping, In-Memory-State |
| `background` | 300 s | 5 s | Immer, mit Staleness-Indicator wenn > 15 min | Reachability (Stripe, PayPal, R2, Brevo, Resend), Threshold-Queries (Drift, Backlog), Disk/SSL/PM2 |
| `synthetic` | 900 s (15 min) | 30 s | Eigene Kategorie "Business Flows" | Checkout-E2E, Realtime-Broadcast-Roundtrip, Last-Order-Check |

Separate Sampler-Instanzen, unterschiedliche Cron-Einträge. Synthetic-Scheduler trägt das separat loggbar als `source='synthetic_cron'`.

### 3.3 Sampler-Architektur (kritisch)

```
                         ┌─────────────────────┐
                         │  VPS Cron           │
                         │  * * * * *          │ fast-sampler (60s)
                         │  */5 * * * *        │ background-sampler (5min)
                         │  */15 * * * *       │ synthetic-sampler (15min)
                         └──────────┬──────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │  scripts/health-sampler.py    │
                    │  (oder TS-Script via tsx)     │
                    │                                │
                    │  liest checks-registry.ts     │
                    │  führt Checks der Klasse aus  │
                    │  schreibt in health_check_log │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │ health_check_log│
                           └────────┬────────┘
                                    │
                                    ▼
                 ┌──────────────────────────────────┐
                 │  GET /admin/system-health         │
                 │  → SELECT DISTINCT ON (service)   │
                 │    ORDER BY checked_at DESC       │
                 │  → SELECT buckets für 24h-Balken │
                 └──────────────────────────────────┘
```

**Admin-UI tut keine Checks mehr.** Es rendert nur den letzten Snapshot pro Service + historische Buckets. Ein "Force Refresh"-Button triggert (optional) einen On-Demand-Sampler-Run via `POST /admin/system-health/sample?class=fast`, schreibt die Ergebnisse als `source='manual'`, UI pollt bis 10s nach dem Trigger.

**Effekt:** Historie ist vollständig, unabhängig vom Seitenzugriff. UI-Response < 500ms (nur DB-Read).

### 3.4 `health_check_log` Schema

```sql
CREATE TABLE health_check_log (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_name TEXT NOT NULL,
  category TEXT NOT NULL,                    -- infrastructure | data_plane | sync_pipelines | ...
  check_class TEXT NOT NULL,                 -- fast | background | synthetic
  severity TEXT NOT NULL,                    -- see §3.1
  latency_ms INT,
  message TEXT,
  metadata JSONB,                            -- freies struct je Check (threshold, actual, extras)
  source TEXT NOT NULL DEFAULT 'sampler',    -- sampler | manual | synthetic_cron
  environment TEXT NOT NULL DEFAULT 'prod'
);
CREATE INDEX idx_hcl_service_time ON health_check_log (service_name, checked_at DESC);
CREATE INDEX idx_hcl_category_time ON health_check_log (category, checked_at DESC);
CREATE INDEX idx_hcl_severity_time ON health_check_log (severity, checked_at DESC) WHERE severity IN ('error', 'critical');
-- Retention: 30 Tage für fast/background, 90 Tage für synthetic
```

Cleanup-Cron (täglich 03:30 UTC):
```sql
DELETE FROM health_check_log 
 WHERE check_class IN ('fast', 'background') AND checked_at < NOW() - INTERVAL '30 days';
DELETE FROM health_check_log 
 WHERE check_class = 'synthetic' AND checked_at < NOW() - INTERVAL '90 days';
```

Volumen-Schätzung: 16 Services × 60s Fast + 25 Services × 5min Background + 5 Synthetic × 15min = ~28k Rows/Tag × 30 Tage = 840k Rows. Unkritisch.

### 3.5 Public-Status-Mapping

Externe Sichtbarkeit ist sehr restriktiv. Interne Namen, Latenzen, Messages werden niemals veröffentlicht.

| Interne Kategorie | Public-Kategorie | Veröffentlicht | Rationale |
|---|---|---|---|
| Infrastructure | "Platform" | Ja (aggregated) | User braucht zu wissen ob Plattform läuft |
| Data Plane | "Platform" | Ja (gemeinsam mit Infrastructure) | Nicht sinnvoll getrennt extern |
| Sync Pipelines | — | Nein | Internal-only, betrifft Daten-Aktualität, nicht Verfügbarkeit |
| Payments | "Checkout" | Ja (aggregated) | User braucht zu wissen ob Bezahlen geht |
| Communication | "Notifications" | Ja — aber nur bei echtem Ausfall | Nur wenn transaktionale Mails nicht rausgehen |
| Analytics | — | Nein | User nicht relevant |
| AI | — | Nein | Admin-Feature only |
| Business Flows | "Shopping Experience" | Ja (aggregated) | Kauf-E2E |
| Edge/Hardware | — | Nein | Internal Tooling |

**Severity-Mapping intern → extern:**

| Intern | Public | Sichtbar? |
|---|---|---|
| `ok`, `unconfigured`, `insufficient_signal` | `operational` | Ja |
| `degraded`, `warning` | `degraded_performance` | Ja |
| `error`, `critical` | `outage` | Ja |
| `stale` (Sampler-Gap) | `unknown` | Ja, wenn > 15min |

**Aggregations-Regel pro Public-Kategorie:** Worst-Severity aller zugehörigen internen Services gewinnt. Ein `error` im Stripe-Webhook-Check → "Checkout: outage" in Public, auch wenn PayPal grün ist.

**Response-Body** (`GET /store/status`):
```json
{
  "categories": [
    { "name": "Platform", "status": "operational" },
    { "name": "Checkout", "status": "operational" },
    { "name": "Shopping Experience", "status": "degraded_performance" },
    { "name": "Notifications", "status": "operational" }
  ],
  "overall": "degraded_performance",
  "last_updated": "2026-04-23T08:15:00Z"
}
```

Keine Service-Namen, keine Latencies, keine Messages. Kategorien fix — keine dynamische Leaks von internen Labels.

### 3.6 Alert-Transport (final)

**Entscheidung: Resend als Mail-Transport für Alerts.**

Rationale:
- Resend ist bereits transaktional im Stack (Welcome-Mails, Bid-Placed, Payment, Shipping usw.) — keine neue Abhängigkeit.
- Hohe Deliverability-SLA, kein Template-Freigabe-Zwang (im Gegensatz zu Brevo).
- Brevo ist bewusst CRM-Newsletter-only — wenn Alerts dort landen, verwässert das die Deliverability für Newsletter-Campaigns und macht das Abmelde-Management kompliziert.
- Absender: bereits existierende Domain `noreply@vod-auctions.com`, neuer Alias `alerts@vod-auctions.com` nötig (all-inkl Config).

**Kanal-Matrix:**

| Severity | Kanal | Cooldown | Empfänger |
|---|---|---|---|
| `warning` | Resend Digest-Mail (täglich 08:00 UTC) | pro Check 24h Dedup | rseckler@gmail.com |
| `error` | Resend Immediate-Mail | pro Check 30min | rseckler@gmail.com |
| `error` | Sentry Issue (`Sentry.captureMessage` mit fingerprint = service_name) | keiner (Sentry dedupliziert selbst) | — |
| `critical` | Resend Immediate-Mail + Sentry Issue + Slack-Webhook (falls `SLACK_WEBHOOK_URL` gesetzt) | pro Check 15min | rseckler + Slack-Kanal |

**Flapping-Guard:** Alert wird nur ausgelöst wenn **3 aufeinanderfolgende Samples** dieselbe Severity haben (mindestens 3× 60s = 3min für fast, 3× 300s = 15min für background). Verhindert "flap spam" bei instabilen Netzwerk-Bedingungen.

**Fallback bei Resend-Ausfall:** Kein sekundärer Transport Day-1 — wenn Resend down ist, kann man den Ausfall nicht via Mail melden (klassisches Henne-Ei). Stattdessen Sentry als sekundärer Kanal (unabhängige Infrastruktur, pullt nicht Resend-abhängig). Wer Resend-Health checkt: eigener Check im Dashboard. `critical` bei Resend-Ausfall → Slack (wenn konfiguriert) oder erkennbar am Dashboard beim nächsten Login.

### 3.7 Runbook-Priorisierung nach Impact

Statt "16+ Runbooks" gestaffelt nach realer Eskalation:

| Priorität | Service | Runbook-Tiefe | Impact |
|---|---|---|---|
| **P-1 (Launch-Blocker)** | postgresql, stripe, storefront_public, vps/nginx, checkout-e2e | Vollständig (Symptome × Diagnose × Fix × Eskalation × Incidents) | Kompletter Ausfall = User kann nicht kaufen |
| **P-2 (Customer-Impact)** | meilisearch, upstash, sync_pipelines, resend | Standard (Symptome × Diagnose × Fix) | Degradation spürbar für User oder führt zu Datenalter |
| **P-3 (Operational)** | r2-images, paypal, brevo, meili-drift | Kompakt (Symptome × Top-3-Fixes) | Beeinträchtigt aber nicht-blockierend |
| **P-4 (Meta/Static)** | sentry, clarity, ga4, rudderstack, anthropic, disk/ssl/pm2 | Quick-Reference (1-Seiten-FAQ) | Monitoring/Reporting-Services, selten akut |

P3 in der Roadmap schreibt zuerst die P-1-Runbooks, dann P-2. P-3 und P-4 werden im Launch-Zeitraum ergänzt falls nötig, initial nur Links auf die Service-Dashboards.

### 3.8 Endgültig entschiedene Fragen (v1 §9)

1. **VPS-Helper-Endpoint für Disk/PM2:** Backend-Prozess selbst nutzt `fs.statfs('/')` und `pm2 jlist` via Child-Process. Läuft ohnehin auf VPS, hat Lese-Rechte. Kein separater Helper.
2. **Public Status Page Domain:** `vod-auctions.com/status` als Pfad (kein DNS-Change).
3. **Mail-Transport für Alerts:** Resend (siehe §3.6).
4. **Realtime-Check-Tiefe:** P1 nur Ping, P2.11 erweitert um Broadcast-Roundtrip als Teil des Checkout-E2E-Pakets.

---

## 4. Roadmap

Jede Phase ist ein separater Rollout (rc41 / rc42 / rc43). Feature-Flags: `SYSTEM_HEALTH_PUBLIC_PAGE` (P2), `SYSTEM_HEALTH_ALERTING` (P3).

### P1 — Ops Foundation (2-3 Tage)

**Ziel:** Sampler-Architektur live, Sync-Pipelines + Infrastruktur sichtbar, Severity + Check-Klassen als Framework etabliert.

| # | Task | Klasse | Acceptance |
|---|---|---|---|
| P1.1 | Severity-Enum (7 Level) + check-class Typen in `ServiceCheck` TS-Type | — | Build ohne TS-Errors, UI-Badges für alle 7 Stufen |
| P1.2 | Migration `2026-XX-XX_health_check_log.sql` (§3.4) via Supabase MCP | — | Tabelle + 3 Indexes angelegt, idempotent |
| P1.3 | `scripts/health-sampler.py` (oder `tsx scripts/health-sampler.ts`) — liest Registry, führt Checks der angegebenen Klasse aus, schreibt in `health_check_log`. Struktur modular mit `registry/<category>/<check>.ts` | — | `python3 health-sampler.py --class fast --dry-run` zeigt Check-Liste; `--class fast` schreibt Rows |
| P1.4 | Check-Registry migrieren: bestehende 16 Checks aus `api/admin/system-health/route.ts` in `backend/src/lib/health-checks/` extrahieren, pro Datei ein Check, mit expliziter `class`/`category`/`severityMapping` | — | Alle 16 Checks migriert, bestehende Funktionalität 1:1 |
| P1.5 | `GET /admin/system-health` umbauen: nur noch DB-Read `DISTINCT ON (service_name)` + `check_class`-Filter optional | fast | p95 Response < 200ms, keine Check-Logik mehr im Request-Path |
| P1.6 | `POST /admin/system-health/sample?class=fast` — On-Demand-Trigger für Sampler (manueller Refresh-Button) | — | Invocation schreibt source='manual' Rows, Rückgabe mit Task-Status |
| P1.7 | 3 Cron-Einträge auf VPS: fast (60s), background (5min), synthetic-placeholder (15min, leer für P1) | — | `crontab -l` zeigt drei Einträge, Logs schreiben in `~/VOD_Auctions/scripts/health_sampler.log` |
| P1.8 | Neue Checks Sync Pipelines: cron-freshness (mtime + sync_log), meili-drift (aus meilisearch_drift_log letzte Row), meili-backlog (`COUNT WHERE search_indexed_at IS NULL`) | background | 3 Rows pro 5-min-Zyklus, Severity nach Schwellenwerten |
| P1.9 | Neue Checks Infrastructure: disk-space (`fs.statfs('/')`), ssl-expiry (tls-cert für 3 Domains), pm2-restarts (`pm2 jlist`) | background | 3 neue Rows pro Zyklus |
| P1.10 | Neue Checks External: discogs-api (HEAD + X-Discogs-Ratelimit-Remaining-Header), supabase-realtime (WebSocket-Connect + Ping) | background | 2 neue Rows, Rate-Limit in metadata JSONB |
| P1.11 | Kategorien-Update in UI: "Sync Pipelines" neu, Infrastructure um disk/ssl/pm2 erweitert, Data Plane stays | — | UI zeigt 7 Kategorien korrekt |
| P1.12 | Deploy-Info-Panel: Git-SHA (`VOD_BUILD_SHA` ENV-Var beim Build injiziert) + Uptime + Node-Version oberhalb der Kategorien | — | Panel rendert, SHA klickbar zu GitHub |
| P1.13 | Feature-Flags-Snapshot-Panel: alle `FEATURES` + effective-values als pills | — | Panel rendert, Flags live |
| P1.14 | `scripts/vps-deploy.sh` aktualisieren: `VOD_BUILD_SHA=$(git rev-parse HEAD)` vor `npx medusa build` exportieren | — | Nach Deploy zeigt Dashboard den aktuellen Commit |
| P1.15 | Staleness-Indicator: wenn letzter Sample > 2× Intervall-Alter → Badge "stale Xmin" auf Service-Karte | — | Test mit artifiziell altem sample row → Badge erscheint |
| P1.16 | Acceptance-Suite P1 (§6) durchziehen | — | Alle Kriterien grün |
| P1.17 | Rollout + CHANGELOG rc41 + git tag | — | Tag + Release veröffentlicht |

**P1-Nicht-Ziele:** Keine Historie-Balken, keine Public-Page, kein Alerting. Nur Sampler-Foundation + neue Checks.

---

### P2 — Zeitachse + Semantik + Public Page (3-5 Tage)

**Ziel:** 24h-Uptime-Balken, Business-Impact-Checks mit Kontextualisierung, Public-Page.

| # | Task | Klasse | Acceptance |
|---|---|---|---|
| P2.1 | `GET /admin/system-health/history?service=X&window=24h&bucket=5min` — liefert Buckets mit `{start, severity_max, count}` | — | Response < 300ms für 24h@5min (288 buckets) |
| P2.2 | Uptime-Balken-Komponente (SVG sparkline, 288 buckets, Farbe = severity-max des Buckets) | — | Rendert korrekt bei 0-Gap-Daten, Hover-Tooltip mit Timestamp + Severity |
| P2.3 | 24h-Uptime-Prozent pro Service ("99.2%") + Trend-Pfeil vs prev 24h | — | Prozent = Buckets mit `severity IN ('ok','insufficient_signal','unconfigured')` / total |
| P2.4 | Cleanup-Cron 03:30 UTC (§3.4 SQL) | — | Daily cron, Log in `~/VOD_Auctions/scripts/health_cleanup.log` |
| P2.5 | Business-Check `last-order` mit Kontext: metadata enthält `expected_activity`, Severity: ok wenn `now - last < expected_max`, insufficient_signal wenn Aktivität legitim niedrig (Beta-Phase, Sonntag-Nacht), warning/error nur wenn echt anomal | synthetic | `expected_activity` aus site_config lesbar, Severity-Regeln dokumentiert |
| P2.6 | Business-Check `active-auctions`: Severity ok wenn in passender Anzahl zum Platform-Mode (`beta_test` = 0 erwartet, `live` = > 0 erwartet), sonst warning | synthetic | Platform-Mode-aware |
| P2.7 | Business-Check `stripe-webhook-freshness`: liest `MAX(created_at)` aus neuer Tabelle `stripe_webhook_log` (aus rc?? falls existiert, sonst aus order_event oder Stripe Events API `/v1/events?limit=1`) mit expected_activity-Gate | synthetic | Severity = insufficient_signal wenn expected < 1/h |
| P2.8 | Business-Check `paypal-webhook-freshness` analog | synthetic | — |
| P2.9 | Business-Check `checkout-e2e`: Storefront /api/health + Catalog-API + Stripe createPaymentIntent (ohne confirm, mit cancel danach) | synthetic | Läuft 15min-Cron, dauert < 15s, räumt PaymentIntent auf |
| P2.10 | Kategorie "Business Flows" in CATEGORIES | — | UI zeigt Kategorie mit 5 Checks |
| P2.11 | Supabase-Realtime Broadcast-Roundtrip (P1.10 erweitern): subscribe + publish + wait for echo + unsubscribe, Timeout 5s | synthetic | metadata.roundtrip_ms gemessen |
| P2.12 | Client-Side Print-Bridge-Check: Admin-Browser fetcht `https://127.0.0.1:17891/health` beim Seitenladen, rendert in eigenem Panel "Edge Devices". Ergebnis client-only, nicht in `health_check_log` (kein Server-Sichtkontakt) | — | Panel rendert mit 3 möglichen Stati (online/offline/unknown) |
| P2.13 | Migration `2026-XX-XX_public_status_cache.sql` + Feature-Flag `SYSTEM_HEALTH_PUBLIC_PAGE` registrieren | — | Flag in Registry, default false |
| P2.14 | `GET /store/status` — keine Auth, Response-Shape aus §3.5, Upstash-Cache 60s TTL, Strict-CORS für storefront-origin | — | p95 < 100ms (cached), Leak-Test: keine internen Namen im Body |
| P2.15 | Public Status Page Frontend: `storefront/src/app/status/page.tsx` — minimales Design, nur Kategorie-Pills + Overall + Last-Updated, 60s Auto-Refresh | — | Rendert mit 4 Kategorien + overall-status |
| P2.16 | Footer-Link im Storefront: "Status" neben Impressum, nur wenn Flag `SYSTEM_HEALTH_PUBLIC_PAGE` ON | — | Flag OFF → Footer ohne Link, Flag ON → Link sichtbar |
| P2.17 | Acceptance-Suite P2 (§6) durchziehen | — | Alle Kriterien grün |
| P2.18 | Flag `SYSTEM_HEALTH_PUBLIC_PAGE` ON in Prod, Rollout + CHANGELOG rc42 + git tag | — | Live |

**P2-Nicht-Ziele:** Kein Alerting. Alert-Transport-Code nicht drin.

---

### P3 — Alerting + Runbooks (2-3 Tage)

**Ziel:** Automatische Benachrichtigung bei relevanten Fehlern, Runbook-Infrastruktur.

| # | Task | Klasse | Acceptance |
|---|---|---|---|
| P3.1 | Feature-Flag `SYSTEM_HEALTH_ALERTING` registrieren (default false) | — | Flag in Registry |
| P3.2 | `backend/src/lib/health-alerting.ts`: `dispatchAlert(service, severity, message, metadata)` mit Cooldown-Tracking in Upstash Redis (`health_alert_cooldown:<service>:<severity>` TTL passend zur Severity) | — | Unit-Test mit fake Redis zeigt Cooldown-Behavior |
| P3.3 | Flapping-Guard: dispatchAlert wird nur gefeuert, wenn die letzten 3 Samples in `health_check_log` dieselbe Severity haben | — | Unit-Test mit 3 Test-Rows |
| P3.4 | Sentry-Integration (`@sentry/node` im Backend, bereits integriert?): bei `error`/`critical` `Sentry.captureMessage` mit fingerprint = service_name | — | Test-Alert erscheint in Sentry-Issues |
| P3.5 | Resend-Templates (2): `alert-immediate.html` (error/critical, single Service) + `alert-digest.html` (warning, täglich Summary) — Template in `backend/src/lib/emails/templates/` | — | Preview in `/app/emails` |
| P3.6 | Digest-Cron täglich 08:00 UTC: `SELECT ... severity='warning' AND checked_at > NOW() - '24h'` gruppiert nach service, Mail via Resend | — | Cron schickt eine Mail/Tag |
| P3.7 | Immediate-Mail-Trigger: im Sampler nach INSERT, Flapping-Guard durchlaufen, dispatchAlert rufen | — | synthetic-Check mit 3 error-Rows triggert Mail + Sentry |
| P3.8 | Optional Slack-Webhook: `SLACK_WEBHOOK_URL` lesen, bei `critical` POST mit gleichem Content wie Mail. No-op wenn ENV leer | — | Keine Fehler wenn Flag leer, Message bei Flag gesetzt |
| P3.9 | `runbook?: string` Feld in Check-Definition + UI-Link "Runbook ↗" pro Karte | — | Link rendert nur wenn runbook gesetzt |
| P3.10 | Runbook-Template `docs/runbooks/_template.md` (§3.7 Struktur) | — | Template existiert, Format ist Markdown |
| P3.11 | P-1-Runbooks schreiben (5 Docs): postgresql, stripe, storefront_public, vps, checkout-e2e | — | Alle mit vollständigen Sektionen |
| P3.12 | P-2-Runbooks schreiben (4 Docs): meilisearch, upstash, sync_pipelines, resend | — | Standard-Tiefe |
| P3.13 | P-3-Runbooks (kompakt, 4 Docs): r2-images, paypal, brevo, meili-drift | — | 1 Seite je |
| P3.14 | Alert-History-Panel im Admin-UI: letzte 20 dispatchAlert-Aufrufe als Timeline | — | Panel rendert, klickbar zu Check-Detail |
| P3.15 | "Send Test Alert"-Button pro Kanal (Sentry/Resend/Slack) für Operator-Pipeline-Validation | — | Button sendet Test-Payload, zeigt Success/Error |
| P3.16 | Acceptance-Suite P3 (§6) durchziehen | — | Alle Kriterien grün |
| P3.17 | Flag `SYSTEM_HEALTH_ALERTING` ON, Rollout + CHANGELOG rc43 + git tag | — | Live |

**P3-Nicht-Ziele:** Keine PagerDuty, keine On-Call-Rotation, keine SMS. Nur Mail + Sentry + optional Slack.

---

## 5. Claude-Modell-Strategie

Statt per-Task-Zuordnung (v1) drei Kategorien. Task-Lead entscheidet im Session-Kontext, wenn ein Task vom Standard abweicht.

| Kategorie | Modell | Task-Typen |
|---|---|---|
| **High-Risk / Architektur** | Opus 4.7 | DB-Migrations, Severity-Engine, Flapping-Guard, Public-Page-Security, E2E-Checks, Acceptance-Suite, Core-Runbooks (P-1) |
| **Routine-Implementation** | Sonnet 4.6 | Neue Service-Checks nach Registry-Pattern, UI-Komponenten mit Design-Tokens, Cron-Scripts, P-2/P-3-Runbooks, Rollout-Routinen |
| **Mechanische Edits** | Haiku 4.5 | Kategorien-Konstanten, Copy-Text, Flag-Pills, Wiring-Trivia, P-4-Quick-References |

Abweichungen werden im Commit-Body begründet (z.B. "Haiku für P1.15 nachgezogen, Task war nicht trivial wie geplant").

**Kosten-Schätzung (pay-as-you-go, grober Daumen):** ~$20-30 über alle drei Phasen. Menschliche Review-Zeit kommt oben drauf.

---

## 6. Acceptance-Kriterien (pro Phase verbindlich)

### P1 Acceptance

- `GET /admin/system-health` p95 < 200ms auf Prod (reine DB-Read-Query).
- Sampler fast-class: p95 Gesamtlaufzeit < 5s, p99 < 10s.
- Sampler background-class: p95 Gesamtlaufzeit < 20s, p99 < 45s.
- Partial Failure: wenn 1 Check timeout → Row wird trotzdem geschrieben mit `severity='error'`, `message='timeout after Xs'`.
- Staleness-Detection: wenn letzter Sample > 2× expected Intervall → UI-Badge "stale", nach 5× → `unknown` statt letzter Severity.
- Keine Checks in Request-Path von `/admin/system-health` (gemessen über fehlende Outbound-Calls in Request-Logs).

### P2 Acceptance

- `GET /admin/system-health/history?window=24h` p95 < 300ms.
- `GET /store/status` p95 < 100ms (cached) / < 500ms (cache-miss).
- Public-Response enthält keine internen Service-Namen, keine Latenzen, keine Messages. Validiert durch Regex-Grep auf Response.
- Business-Checks mit `expected_activity=null` melden `insufficient_signal` statt `error` — nie falsche Positives in Beta-Phase.
- Uptime-Balken rendern mit mind. 1 Gap im Data-Set (simulated Sampler-Ausfall) und zeigen Gap als "unknown" (grau), nicht als ok/error.

### P3 Acceptance

- Alert feuert frühestens nach 3 aufeinanderfolgenden Samples derselben Severity.
- Cooldown wirkt — zweiter Alert für denselben Service innerhalb der Cooldown-Zeit wird unterdrückt (verifiziert via Log).
- Test-Alert über jeden Kanal funktioniert (Sentry, Resend, Slack) in < 10s.
- P-1-Runbooks enthalten je mindestens: 3 Symptome, 2 Diagnose-Commands, 2 Fix-Szenarien, Eskalationspfad.
- Digest-Mail enthält alle `warning`-Events der letzten 24h gruppiert, nicht mehr als 1 Mail/Tag.

---

## 7. Rollout

Jede Phase ist separat live-schaltbar. Keine Big-Bang-Releases.

- **P1 → rc41** (Sampler + Foundation, keine User-facing Changes außer Deploy-Info-Panel)
- **P2 → rc42** (Flag `SYSTEM_HEALTH_PUBLIC_PAGE` kann ON gehen, sobald Acceptance grün)
- **P3 → rc43** (Flag `SYSTEM_HEALTH_ALERTING` ON nach 24h Trockenlauf ohne False Positives)

Rollback-Pfade:
- P1: Sampler-Cron auskommentieren → kein Write, alte Route wieder aktivieren (Feature-Branch-Revert)
- P2: Flag `SYSTEM_HEALTH_PUBLIC_PAGE` OFF → Public-Page 404, interner Umbau bleibt
- P3: Flag `SYSTEM_HEALTH_ALERTING` OFF → keine Alerts mehr, UI bleibt

---

## 8. Risiken + Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| `health_check_log` wächst zu schnell | Cleanup-Cron + eigener Check für Tabellen-Size (warning > 5M rows) |
| Sampler-Cron hängt → keine neuen Samples | Staleness-Indicator im UI, plus separater "sampler-liveness"-Check (der letzte `source='sampler'` Row nicht älter als 5× Intervall) |
| Public-Page wird DDoS-Ziel | Upstash-Cache 60s + Storefront-Rate-Limit via Redis |
| Alert-Flood | Flapping-Guard + Cooldown + Digest für Warnings |
| Semantic-Checks mit Sideeffects | Alle synthetic checks dokumentiert als read-only, Stripe-PaymentIntent mit `capture_method=manual` + explicit cancel |
| Business-Checks in Beta-Phase führen zu Rauschen | `insufficient_signal`-Severity + Platform-Mode-Awareness |
| Sentry-Rate-Limit | Fingerprint pro service_name — Sentry dedupliziert, kein Issue-Spam |
| Resend-Bounce-Rate | Absender-Domain DKIM/SPF validated, List-Unsubscribe-Header trotz transaktional drin |

---

## 9. Nachverfolgung

- Workstream-Eintrag in [`docs/TODO.md`](../TODO.md) existiert seit v1, wird pro Phasen-Rollout um `[x]` ergänzt.
- Dieses Plan-Dokument wird nach jeder Phase mit `**done 2026-xx-xx (rcXX)**` pro Task-Zeile markiert.
- Ein CHANGELOG-Entry pro Phase.
- Kein Linear-Epic (< 2 Wochen konzentrierte Arbeit).

---

## 10. Freigabe-Checklist

Vor P1-Start muss geklärt sein:

- [x] Alert-Transport (Resend fixiert, §3.6)
- [x] Public-Page-Domain (`/status` als Pfad, §3.8)
- [x] VPS-Helper-Entscheidung (Backend direkt mit fs.statfs, §3.8)
- [x] Severity-Governance (7 Level + Ownership-Regel, §3.1)
- [x] Check-Klassen (fast/background/synthetic, §3.2)
- [x] Sampler-Architektur (entkoppelt vom UI-GET, §3.3)
- [x] Schema-Details (severity, category, metadata JSONB, §3.4)
- [x] Public-Mapping-Tabelle (§3.5)
- [x] Runbook-Priorisierung (P-1 bis P-4, §3.7)
- [ ] Robin-Freigabe dieses v2

Bei Freigabe: P1 startet mit P1.1 (Severity-Enum) + P1.2 (DB-Migration) als Foundation-Commits.
