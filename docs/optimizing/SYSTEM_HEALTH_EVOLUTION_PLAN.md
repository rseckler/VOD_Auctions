# System Health Evolution Plan

**Status:** Draft · ausstehende Freigabe Robin
**Autor:** Robin Seckler + Claude Opus 4.7
**Erstellt:** 2026-04-23
**Scope:** `/app/system-health` von Reachability-Dashboard zu Ops-Dashboard ausbauen (P1), semantische Checks + Public-Page ergänzen (P2), Severity-Routing + Runbooks (P3).
**Verwandte Docs:** [`DEPLOYMENT_METHODOLOGY.md`](../architecture/DEPLOYMENT_METHODOLOGY.md) · [`SYNC_ROBUSTNESS_PLAN.md`](../architecture/SYNC_ROBUSTNESS_PLAN.md) · [`SEARCH_MEILISEARCH_PLAN.md`](SEARCH_MEILISEARCH_PLAN.md)

---

## 1. Kontext

Die aktuelle System-Health-Seite (rc40, 16 Service-Checks) ist ein solider Statuspage.io-artiger Baseline-Monitor, aber:

- **Sync-Pipelines sind komplett blind** — 6 Cronjobs + Meili-Drift + sync_log werden nicht abgefragt.
- **Infrastruktur-Checks fehlen** — Disk, SSL, PM2-Restarts.
- **Keine Zeitachse** — nur "jetzt gerade", keine 24h-Uptime, keine Trend-Daten.
- **Reachability ≠ Funktionsfähigkeit** — "Stripe API antwortet" sagt nichts über "letzter Webhook erfolgreich empfangen".
- **Admin-only** — Frank oder externe Stakeholder können sich nicht selbst vergewissern ob die Plattform läuft.
- **Keine Alert-Kette** — ein kritischer Fehler steht stumm auf dem Dashboard bis jemand nachsieht.

**Bereits getan (rc40.2, 2026-04-23):**
- Meilisearch-Check ergänzt (`MEILI_URL`/stats + Feature-Flag-Status).
- Kategorien umstrukturiert: "Cache & AI" aufgeteilt in "Data Plane" (upstash/meilisearch/r2-images) + "AI" (anthropic).
- Meili `rankingRules` gefixt (rc40-Regression).

**Dieser Plan adressiert P1 + P2 + P3** (P0 bereits umgesetzt = Meili-Check + Kategorie-Fix).

---

## 2. Zielbild

Nach P3 ist die Seite ein Tier-1-Operations-Dashboard mit:

1. **Layered Status** — 8 Kategorien (Infrastruktur · Data Plane · Sync Pipelines · Payments · Communication · Analytics · AI · Edge/Hardware).
2. **Zeitachse** — 24h/7d-Uptime-Balken pro Service aus persisted `health_check_log`.
3. **Semantische Checks** — "letzter erfolgreicher Stripe-Webhook vor 12 min", "letzte Order vor 3h 21min", "Meili drift 0.0 %, Sync-Lag 0 rows".
4. **Deploy-Info** — Git-SHA + Uptime + aktive Feature-Flags als permanentes Header-Panel.
5. **Public Status Page** (`vod-auctions.com/status`, auth-frei) — nur grün/gelb/rot pro Kategorie, keine internen Details. Für Frank + Stakeholder.
6. **Severity-Routing** — critical-Level-Ausfälle feuern automatisch Sentry + Brevo-Mail.
7. **Runbook-Links** — jeder Check linkt zu `docs/runbooks/<service>.md` mit Diagnose + Fix-Rezept.

---

## 3. Transversale Design-Entscheidungen

Entscheidungen, die durch P1–P3 durchziehen. Werden in P1 fixiert — spätere Phasen bauen darauf auf.

### 3.1 Severity-Model (erweitert auf 5 Level)

Aktuell: `ok` / `degraded` / `error` / `unconfigured`. Erweitern auf:

| Status | Bedeutung | Beispiel | UI-Farbe |
|---|---|---|---|
| `ok` | Alles normal | 200 in < 1s | grün |
| `degraded` | Funktioniert, aber mit Einschränkung | Latency > 2s, Drift 0.5-2%, Fallback aktiv | gelb |
| `warning` | Beobachten, nicht blockierend | Cron 10-30 min alt, SSL < 14 Tage | orange |
| `error` | Kaputt, aber isoliert | Einzelner Service down, Rest läuft | rot |
| `critical` | Launch-Blocker / User-Impact | Checkout tot, DB down, Realtime weg | rot + Pulse |

Migration: bestehende `degraded` bleibt, `warning` und `critical` werden neu eingeführt. Summary-Panel zeigt alle 5.

### 3.2 Check-Typen (formalisiert)

```ts
type CheckType =
  | "reachability"   // HTTP 2xx + Latency (aktuell dominant)
  | "freshness"      // Timestamp der letzten Aktion vs Schwelle
  | "threshold"      // Numerischer Wert vs Schwelle (Drift%, Backlog)
  | "semantic"       // End-to-End-Flow-Simulation
  | "config"         // Nur ENV-Check (aktuell z.B. sentry)
  | "static"         // Frontend-Aggregation (z.B. PM2, Disk)
```

Check-Funktionen deklarieren ihren Typ. UI zeigt `type` als kleines Icon/Tooltip.

### 3.3 `health_check_log` Tabelle (Basis für Zeitachse)

```sql
CREATE TABLE health_check_log (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_name TEXT NOT NULL,
  status TEXT NOT NULL,          -- ok|degraded|warning|error|critical|unconfigured
  latency_ms INT,
  message TEXT,
  check_type TEXT
);
CREATE INDEX idx_hcl_service_time ON health_check_log (service_name, checked_at DESC);
-- Retention: 30 Tage
CREATE INDEX idx_hcl_cleanup ON health_check_log (checked_at) WHERE checked_at < NOW() - INTERVAL '30 days';
```

Write-Path: Nach jedem `/admin/system-health` GET ein INSERT pro Service (16+ Rows alle 30s = 46k/Tag → 1.4M/Monat, mit Cleanup auf 30 Tage handhabbar).

Read-Path: Neuer Endpoint `/admin/system-health/history?service=X&window=24h` liefert Buckets für Uptime-Balken.

### 3.4 Storage-Strategy

`health_check_log` lebt in **Prod-Supabase** (`bofblwqieuvmqybzxapx`). Additive Migration, rollback = `DROP TABLE`. Kein separater DB-Cluster — Volume ist unkritisch (< 1% der Prod-DB-Size).

### 3.5 Runbook-Struktur

`docs/runbooks/<service>.md` pro Service. Template:

```markdown
# Runbook: <Service>

## Symptome
## Diagnose (Copy-Paste-Commands)
## Bekannte Fixes
## Eskalation (wer, wann)
## Verwandte Incidents
```

Jeder `ServiceCheck` bekommt Feld `runbook?: string` → Link.

### 3.6 Severity-Routing (P3)

```
warning  → Admin-UI + Brevo Digest-Mail (täglich 08:00 an rseckler@)
error    → + Sentry Issue + Brevo Immediate-Mail
critical → + Brevo SMS-relay (Twilio) + Slack-Webhook (falls vorhanden)
```

Cooldown pro Service 30 min, sonst Flood bei flapping Check.

---

## 4. Roadmap

### P1 — Ops Foundation (1-2 Tage)

**Ziel:** Sync-Pipelines + Infrastruktur-Fundament sichtbar. Keine Zeitachse noch.

| # | Task | Typ | Effort | Modell | Dep |
|---|---|---|---|---|---|
| P1.1 | Severity-Enum auf 5 Level erweitern (Backend + UI) | Refactor | 30 min | **Sonnet 4.6** | — |
| P1.2 | Check-Typ-Feld in `ServiceCheck` + UI-Icon/Tooltip | Refactor | 20 min | **Haiku 4.5** | P1.1 |
| P1.3 | `checkCronFreshness()` — Mtime von `legacy_sync.log`, `discogs_daily.log`, `meilisearch_sync.log`, `meilisearch_drift.log` via SSH-exec ODER via neuem VPS-Helper-Endpoint ODER via `sync_log` Query | Freshness | 90 min | **Opus 4.7** | — |
| P1.4 | `checkMeiliDrift()` — liest letzten `meilisearch_drift_log` Eintrag, Status nach severity-Spalte | Threshold | 30 min | **Sonnet 4.6** | P1.1 |
| P1.5 | `checkMeiliBacklog()` — `COUNT(*) FROM "Release" WHERE search_indexed_at IS NULL` | Threshold | 20 min | **Haiku 4.5** | P1.1 |
| P1.6 | `checkSyncLogFreshness()` — letzter `sync_log` entry mit `validation_status='ok'` | Freshness | 45 min | **Sonnet 4.6** | — |
| P1.7 | Neue Kategorie "Sync Pipelines" in `CATEGORIES`: `[cron_freshness, meili_drift, meili_backlog, sync_log]` | UI | 15 min | **Haiku 4.5** | P1.3-6 |
| P1.8 | `checkDiskSpace()` — liest `/` via `df` über VPS-Helper-Endpoint auf Backend-Process (`statfs` in Node) | Threshold | 45 min | **Sonnet 4.6** | — |
| P1.9 | `checkSSLExpiry()` — TLS Cert lesen für api./admin./vod-auctions.com, Tage bis Expiry | Threshold | 60 min | **Sonnet 4.6** | — |
| P1.10 | `checkPM2Restarts()` — PM2 JSON-Status via `pm2 jlist` im Backend-Process lesen (selbes Server-Image) | Threshold | 45 min | **Sonnet 4.6** | — |
| P1.11 | "Infrastructure"-Kategorie um disk/ssl/pm2 erweitern | UI | 10 min | **Haiku 4.5** | P1.8-10 |
| P1.12 | Deploy-Info-Panel: Build-Time Git-SHA + `process.uptime()` + Node-Version im Page-Header | UI | 30 min | **Sonnet 4.6** | — |
| P1.13 | Git-SHA beim VPS-Build als ENV-Var injizieren (`VOD_BUILD_SHA`, in `scripts/vps-deploy.sh` vor `medusa build`) | Build | 20 min | **Sonnet 4.6** | — |
| P1.14 | Feature-Flags-Snapshot-Panel: alle `FEATURES` + ihre effective-values als Read-only-Pills | UI | 30 min | **Sonnet 4.6** | — |
| P1.15 | `checkDiscogsAPI()` — HEAD auf `api.discogs.com/database/search?q=test` mit gemessenem Rate-Limit-Remaining aus Response-Header | Reachability | 45 min | **Sonnet 4.6** | — |
| P1.16 | `checkSupabaseRealtime()` — WebSocket-Connect auf `wss://bofblwqieuvmqybzxapx.supabase.co/realtime/v1` + Ping | Reachability | 60 min | **Opus 4.7** | — |
| P1.17 | Acceptance-Test: alle neuen Checks liefern in < 5s, Response unter 50KB | QA | 30 min | **Haiku 4.5** | alle |
| P1.18 | Rollout: deploy, in Admin prüfen, screenshot in CHANGELOG rc41 | Deploy | 30 min | **Sonnet 4.6** | alle |

**P1-Deliverables:** Sync Pipelines als volle Kategorie sichtbar, Infrastructure um Disk/SSL/PM2 erweitert, Deploy-Info + Flags-Snapshot permanent im Header. Erwartete neue Checks: ~10. Page lädt weiterhin < 5s (parallele `Promise.all`).

---

### P2 — Zeitachse + Semantik + Public Page (3-5 Tage)

**Ziel:** Historische Daten, Business-Impact-Checks, externe Sichtbarkeit.

| # | Task | Typ | Effort | Modell | Dep |
|---|---|---|---|---|---|
| P2.1 | Migration `health_check_log` Tabelle (§3.3) + Cleanup-Job | DB | 30 min | **Opus 4.7** | — |
| P2.2 | Write-Path: jeder GET `/admin/system-health` INSERTs rows (Bulk-Insert, fire-and-forget Promise) | Backend | 45 min | **Sonnet 4.6** | P2.1 |
| P2.3 | Cleanup-Cron: täglich 03:30 UTC `DELETE FROM health_check_log WHERE checked_at < NOW() - '30 days'` | Cron | 15 min | **Haiku 4.5** | P2.1 |
| P2.4 | `GET /admin/system-health/history` — Buckets 1min/5min/15min/1h je nach window, für einzelnen oder alle Services | Backend | 2h | **Opus 4.7** | P2.1 |
| P2.5 | Uptime-Balken-Komponente (SVG sparkline, 1px/bucket, 288 buckets für 24h = 5min-window) | UI | 2h | **Opus 4.7** | P2.4 |
| P2.6 | 24h-Uptime-Prozent pro Service ("99.2%") + Trend-Pfeil (vs prev 24h) | UI | 1h | **Sonnet 4.6** | P2.4 |
| P2.7 | `checkStripeWebhookFreshness()` — `MAX(created_at) FROM stripe_webhook_log` (neue Tabelle ODER auslesbar aus Stripe Events API) | Semantic | 90 min | **Opus 4.7** | — |
| P2.8 | `checkPayPalWebhookFreshness()` — analog zu Stripe | Semantic | 45 min | **Sonnet 4.6** | P2.7 |
| P2.9 | `checkLastOrder()` — "letzte `transaction` vor X min" → ok wenn < 24h, warning < 48h, error ≥ 72h | Semantic | 30 min | **Sonnet 4.6** | — |
| P2.10 | `checkActiveAuctions()` — Anzahl `auction_block.status='live'` — warning wenn 0 im `live`-Mode | Semantic | 30 min | **Sonnet 4.6** | — |
| P2.11 | `checkCheckoutE2E()` — End-to-End-Probe: Storefront lädt → Catalog-API → Stripe PaymentIntent kann erstellt werden (ohne confirm) | Semantic | 2h | **Opus 4.7** | — |
| P2.12 | Neue Kategorie "Business Flows": `[stripe_webhook, paypal_webhook, last_order, active_auctions, checkout_e2e]` | UI | 20 min | **Haiku 4.5** | P2.7-11 |
| P2.13 | Client-Side Print-Bridge-Check (Fetch `https://127.0.0.1:17891/health` aus Admin-Browser, Status in eigenem Panel "Edge Devices") | Hybrid | 90 min | **Sonnet 4.6** | — |
| P2.14 | Public Status Page Backend: `GET /store/status` (auth-frei, PK-key NICHT nötig), returnt nur Kategorie-Aggregates (ok/degraded/down pro Gruppe, keine internen Details) | Backend | 2h | **Opus 4.7** | P1.1 |
| P2.15 | Public Status Page Frontend: `storefront/src/app/status/page.tsx` — minimale Design-Sprache (nur Kategorie-Pills grün/gelb/rot, "Last Updated"-Timestamp), 60s Auto-Refresh | UI | 2h | **Sonnet 4.6** | P2.14 |
| P2.16 | Public-Page Caching: Response in Upstash Redis 60s TTL, damit /status-DDoS nicht das Backend belastet | Backend | 45 min | **Sonnet 4.6** | P2.14 |
| P2.17 | Acceptance: /status antwortet in < 100ms (cached), zeigt mit Prod-Data korrekte Farben, leakt keine internen Details | QA | 45 min | **Opus 4.7** | P2.15 |
| P2.18 | Rollout: deploy, Public-Page-Link in Footer vom Storefront aufnehmen (klein, "Status" neben Impressum), CHANGELOG rc42 | Deploy | 45 min | **Sonnet 4.6** | alle |

**P2-Deliverables:** 24h-Uptime-Balken pro Service, 5 Business-Impact-Checks, öffentliche Status-Seite unter `vod-auctions.com/status`, Print-Bridge-Check aus Browser.

---

### P3 — Alerting + Runbooks (2-3 Tage)

**Ziel:** Fehler werden proaktiv gemeldet, jeder Check hat eine Handlungsanleitung.

| # | Task | Typ | Effort | Modell | Dep |
|---|---|---|---|---|---|
| P3.1 | Severity-Routing-Engine: Helper `dispatchAlert(service, status, message)` mit Cooldown-Tracking in Redis | Backend | 2h | **Opus 4.7** | P1.1 |
| P3.2 | Sentry-Integration für `error` + `critical` (manuell capturen via `Sentry.captureMessage` + fingerprint) | Backend | 45 min | **Sonnet 4.6** | P3.1 |
| P3.3 | Brevo-Digest-Mail: täglich 08:00 UTC Cron, sammelt alle `warning`-Checks der letzten 24h, schickt Mail an rseckler@ | Cron | 90 min | **Sonnet 4.6** | P3.1 |
| P3.4 | Brevo-Immediate-Mail: bei `error` direkt, Template mit Check-Name + Message + Runbook-Link | Backend | 60 min | **Sonnet 4.6** | P3.1 |
| P3.5 | Slack-Webhook optional: falls `SLACK_WEBHOOK_URL` gesetzt, `critical` dorthin (Feature ohne Webhook = no-op) | Backend | 30 min | **Haiku 4.5** | P3.1 |
| P3.6 | `runbook?: string` Feld in `ServiceCheck` + UI-Link "Runbook ↗" pro Karte | Refactor | 20 min | **Haiku 4.5** | — |
| P3.7 | Runbook-Template `docs/runbooks/_template.md` schreiben | Docs | 30 min | **Sonnet 4.6** | — |
| P3.8 | Runbooks schreiben für: postgresql, stripe, meilisearch, sync_pipelines, storefront, vps | Docs | 2h | **Opus 4.7** | P3.7 |
| P3.9 | Runbooks für restliche 10 Services (lightweight: Symptom + Fix) | Docs | 2h | **Sonnet 4.6** | P3.7 |
| P3.10 | Severity-Routing für alle P1+P2-Checks konfigurieren (welcher Check feuert welche Severity?) | Config | 60 min | **Opus 4.7** | P3.1-5 |
| P3.11 | Flapping-Guard: nur alert wenn Status ≥ 3 consecutive Checks in derselben Severity | Backend | 45 min | **Opus 4.7** | P3.1 |
| P3.12 | Alert-History-Panel: letzte 20 ausgelöste Alerts als Timeline unterhalb der Kategorie-Sektionen | UI | 90 min | **Sonnet 4.6** | P3.1 |
| P3.13 | Test-Alert-Button im UI: "Send Test Alert" für jeden Kanal (Sentry/Mail/Slack) um Pipeline zu verifizieren | Backend + UI | 45 min | **Sonnet 4.6** | P3.1-5 |
| P3.14 | Acceptance: synthetischer Fehler in postgresql-Check feuert erwartete Sentry + Mail + Slack (falls konfiguriert), Cooldown wirkt | QA | 60 min | **Opus 4.7** | alle |
| P3.15 | Rollout: deploy, CHANGELOG rc43, README-Absatz in CLAUDE.md Key-Gotchas ("System Health Alerting", damit Runbook-Struktur auffindbar) | Deploy | 45 min | **Sonnet 4.6** | alle |

**P3-Deliverables:** Automatische Mail/Sentry/Slack-Benachrichtigung bei relevanten Fehlern, 16+ Runbooks verlinkt im Dashboard, Flapping-Schutz, Alert-History.

---

## 5. Claude-Model-Empfehlung (Gesamtbild)

### Wann welches Modell?

**Opus 4.7 (komplexes Reasoning, Architektur-Entscheidungen):**
- Alles mit DB-Schema-Auswirkungen (P2.1, P2.4)
- Sicherheitsrelevante Endpoints (P2.14 Public-Page)
- Severity-Model-Design (P3.1, P3.10, P3.11)
- Semantische E2E-Checks (P2.11 Checkout-E2E)
- Realtime/WebSocket-Checks (P1.16)
- Sync-Freshness-Logik mit mehreren Signalquellen (P1.3)
- Primäre Runbooks der Core-Services (P3.8)
- Final-Acceptance-Tests (P2.17, P3.14)

**Sonnet 4.6 (solide Implementation nach klarer Spec):**
- Neue Service-Checks nach existierendem Pattern (P1.4, P1.5 mit Vorsicht, P1.8, P1.9, P1.10, P1.15)
- UI-Komponenten mit bekannten Design-Tokens (P2.6, P2.15)
- Cron-Scripts nach existierender Struktur (P2.3, P3.3)
- Runbook-Schreiben für Standard-Services (P3.9)
- Rollout-Routinen (P1.18, P2.18, P3.15)
- Refactor-Deliverables (P1.1, P3.2)

**Haiku 4.5 (schnelle mechanische Tasks):**
- Copy-Text-Tasks (P1.14 Flag-Pills, P1.2 Icon-Tooltip)
- Kategorien-Konstanten-Updates (P1.7, P1.11, P2.12)
- Trivial-UI-Wiring (P3.5 mit bestehendem Webhook-Pattern, P3.6 Link-Rendering)
- Einfache Schwellen-Checks (P1.5)

### Kostenschätzung (grob, Pay-as-you-go)

| Phase | Opus-Tasks | Sonnet-Tasks | Haiku-Tasks | Token-Schätzung |
|---|---|---|---|---|
| P1 | 3 | 10 | 5 | ~15 MT Input, 500k MT Output = ~$3-5 |
| P2 | 6 | 9 | 3 | ~25 MT Input, 1.2M MT Output = ~$8-12 |
| P3 | 5 | 7 | 3 | ~20 MT Input, 1M MT Output = ~$7-10 |

Gesamt ~$20-30 LLM-Kosten. Menschliche Review-Zeit kommt oben drauf.

### Empfohlene Session-Struktur

1. **Plan-Freigabe-Session (Opus 4.7):** Dieser Plan wird reviewed, Korrekturen eingepflegt.
2. **P1-Kickoff (Opus 4.7, 30 min):** Severity-Refactor (P1.1) + Check-Typ-Feld (P1.2) als Foundation. Danach Aufteilung.
3. **P1-Bulk (Sonnet 4.6 + Haiku 4.5 parallel):** alle Reachability/Threshold/Freshness-Checks als Sub-Agent-Tasks.
4. **P1-Final (Opus 4.7):** schwierige Tasks (P1.3 cron-freshness, P1.16 realtime) + Acceptance.
5. **P2 analog:** Opus für Foundation (Migration, History-Endpoint, Public-Page-Backend), Sonnet/Haiku für UI-Bulk.
6. **P3 analog:** Opus für Routing-Engine + Flapping-Guard, Sonnet/Haiku für Mail-Templates + Runbook-Bulk.

---

## 6. Rollout-Strategie

Jede Phase ist separat live-schaltbar. Keine Big-Bang-Releases.

- **P1 → rc41** (ein Commit-Bundle, ein Deploy, ein CHANGELOG-Entry).
- **P2 → rc42** (kann in 2 Teilen rausgehen: zuerst history + Uptime-Balken, dann Public-Page).
- **P3 → rc43** (Routing + Runbooks).

Feature-Flag `SYSTEM_HEALTH_PUBLIC_PAGE` (default false) für P2.14 — damit ist die Public-Seite deploybar vor der User-facing Verlinkung.

Feature-Flag `SYSTEM_HEALTH_ALERTING` (default false) für P3 — damit Alerts stumm geschaltet werden können bei Incidents die die Routing-Engine selbst verursachen würden.

---

## 7. Risiken + Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| `health_check_log` wächst zu schnell | Cleanup-Cron + Monitoring der Tabellen-Size als eigener Check |
| Public-Page wird DDoS-Ziel | Redis-Cache 60s TTL, Cloudflare-WAF falls nötig |
| Severity-Routing floodet Postfach | Cooldown 30min + Flapping-Guard (3 consecutive checks) |
| Semantic-Checks lösen Sideeffects aus | Alle semantic checks sind read-only, keine State-Changes |
| Neue Checks slowen Dashboard | Timeout pro Check 5s, `Promise.allSettled` statt `Promise.all` für Resilienz |
| Ecken-Edge-Cases in Status-Balken-Buckets | Ausreichend Unit-Tests in P2.4 mit künstlichen Daten |

---

## 8. Nachverfolgung

- Workstream-Eintrag in [`docs/TODO.md`](../TODO.md) (Section "Next", nach AGB/Sendcloud).
- Plan-Doc bleibt hier, wird nach jeder Phase mit "done 2026-xx-xx" pro Zeile gekennzeichnet.
- CHANGELOG-Entry pro Phase.
- Kein Linear-Epic nötig (Zeitrahmen < 2 Wochen bei konzentrierter Arbeit).

---

## 9. Offene Fragen für Robin

1. **VPS-Helper-Endpoint für Disk/PM2?** P1.8 + P1.10 brauchen Ops-Info vom VPS. Option A: Backend läuft auf VPS, kann `fs.statfs('/')` + `pm2 jlist` direkt. Option B: separater Node-Helper auf anderem Port. **Empfehlung:** A, wenn der Backend-Prozess PM2-Read-Rechte hat. Falls nicht: kurzer CLI-Wrapper der die Info periodisch in eine Tabelle schreibt.
2. **Public Status Page Domain?** `vod-auctions.com/status` oder Subdomain `status.vod-auctions.com`? **Empfehlung:** `/status` (Pfad), kein weiterer DNS-Eintrag nötig.
3. **Brevo vs separater Transaktions-Pfad für Alerts?** Brevo ist aktuell für CRM-Newsletter gedacht. Alerts könnten über Resend (transaktional) laufen. **Empfehlung:** Resend nutzen, weil höhere Deliverability-SLA und kein Template-Freigabe-Zwang.
4. **Realtime-Check (P1.16) via WebSocket oder Broadcast-Test?** Pure Reachability (Ping) vs echtes Broadcast-Pattern. **Empfehlung:** Phase P1 nur Ping, Phase P2.11 erweitern um Broadcast-Round-Trip falls Checkout-E2E ohnehin kompletter Flow wird.

---

**Freigabe erforderlich vor Umsetzungsstart.** Bei Freigabe: P1 starten mit Severity-Refactor als erstem Commit.
