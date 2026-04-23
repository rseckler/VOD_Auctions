# System Health Observability Plan (P4)

**Status:** v2 — überarbeitet nach Review · Freigabe pending
**Autor:** Robin Seckler + Claude Opus 4.7
**Erstellt:** 2026-04-23 · **Letzte Revision:** 2026-04-23 (v2)
**Scope:** `/app/system-health` um Alert-History, Sentry-Embeds, eingeschränkten Log-Zugriff und low-impact-Actions erweitern. Baut direkt auf P1+P2+P3 (rc41-rc43) auf.
**Verwandte Docs:** [`SYSTEM_HEALTH_EVOLUTION_PLAN.md`](SYSTEM_HEALTH_EVOLUTION_PLAN.md) · [`DEPLOYMENT_METHODOLOGY.md`](../architecture/DEPLOYMENT_METHODOLOGY.md)

---

## 0. Versionshistorie

### v2 — 2026-04-23 (nach Review-Feedback: "observability-first, action-lite")

Breaking changes gegenüber v1:

1. **Phasen-Reihenfolge invertiert** nach Risiko/Value-Score. Alert-History zuerst (§4 P4-A), Sentry-Embed zweitens (P4-B), Logs conservative-scoped (P4-C), Low-Impact-Actions (P4-D). **`pm2_restart` vollständig aus P4 entfernt** — bleibt als eigener Mini-Plan `P4-E` (optional, strict-auth) oder gar nicht.
2. **Regex-Scrubbing als Zusatzschutz, nicht Primärschutz.** Primärschutz: (a) Quellen-Whitelist (nur 2 PM2-Prozesse + 4 File-Logs, nicht "alle 5 Typen"), (b) Datenminimierung (100-Zeilen-Cap, keine volle History), (c) Rollen-Allowlist für Actions.
3. **`silence_service` persistent** statt in-memory. Neue Tabelle `service_silence`, TTL-checked server-side. Kein Zustand-Verlust bei Deploy.
4. **Re-Auth für destructive Actions.** Admin muss bei Actions der Klasse `destructive` das Passwort erneut eingeben — Medusa-Auth-Session ist zu breit für Prozess-Eingriffe.
5. **`manual_sync` aus P4-v1 rausgenommen**, wartet auf echten Bedarf + separate Absicherung. Sync-Trigger bleibt Cron-basiert.
6. **DB-Log-Browser aus P4-v1 rausgenommen.** `health_check_log` ist schon via Uptime-Balken sichtbar. `sync_log` + `meilisearch_drift_log` — wenn gewünscht, als eigenständige Admin-Page später, nicht als Log-Viewer-Tab.
7. **Audit-Log-Schema präzisiert:** `request_id`, `risk_class`, `pre_state`, `post_state` explizit.
8. **Log-Viewer-UX vereinfacht:** Initial 100 Zeilen + optional Follow + clientseitige Such-Filter. Keine Timestamp-Pagination, keine Scrollback-History.

### v1 — 2026-04-23 (initialer Wurf)

Vollständig ersetzt durch v2. Abrufbar in git history: commit `5990182`.

---

## 1. Kontext

Nach P1-P3 (rc41-rc43) ist das Dashboard ein vollständiges Ops-Monitoring-Tool: 25 Checks, Historie, Alerts, Runbooks. Aber:

- **Alert-Nachverfolgung fehlt:** Wer hat wann welchen Alert bekommen? Gibt es offene Incidents? → nicht sichtbar.
- **Sentry ist extern:** Errors sind auf sentry.io, Context-Switch für jede Diagnose.
- **Logs nur via SSH:** Bei Incidents heißt es `pm2 logs` oder `tail`. 2-3 Minuten pro Diagnose verloren.
- **Keine Interactions:** "Force-Refresh Sampler" → SSH oder Browser-Tab-Wechsel.

**Industry-Best-Practice** (siehe User-Diskussion):
- Statuspage-Dashboards (public): **keine** Logs/CTAs — Security.
- Ops-Dashboards (Datadog/Better Stack): **Logs verlinkt**, CTAs mit Audit + Runbook-Integration.
- **Review-Feedback 2026-04-23:** Für interne Admin-UI ist es OK, aber "observability-first, action-lite" ist der richtige Einstieg — nicht ein Remote-Control-Cockpit.

---

## 2. Zielbild

Nach P4 ist das Dashboard ein **Admin-Diagnose-Tool** mit engem Action-Scope:

1. **Alert-History-Panel** — letzte 50 Alerts mit Status (fired/acknowledged/resolved), Acknowledge-Button, Auto-Resolve nach 3 ok-Samples.
2. **Sentry-Issues-Tab** pro Service: letzte 10 Issues mit Click-Through.
3. **Log-Drawer** (sehr engem Scope): nur whitelisted PM2-Prozesse (2) + File-Logs (4). Max 100 Zeilen Initial, optional Live-Follow. Keine DB-Log-Browser-Gimmicks.
4. **Actions** (restriktiv): Force-Refresh, Acknowledge-Alert, Silence-Service mit Persistence. Keine destructive Actions in v1.
5. **Audit-Log** für alle Actions, persistent + mit pre/post-state.

**Explizit NICHT in P4-v1:**
- PM2-Restart aus UI
- Manual-Sync-Trigger aus UI
- DB-Log-Browser als eigener Tab
- "Search in Log-History" über Stunden
- Deploy-Button (nie)

---

## 3. Transversale Design-Entscheidungen

### 3.1 Security-Schichten (in Reihenfolge der Wichtigkeit)

v1 hatte Regex-Scrubbing als primären Schutz — v2 behandelt das als Zusatzschutz. Hierarchie:

1. **Quellen-Whitelist** (Primärschutz) — hart-kodierte, kurze Liste was überhaupt gestreamt wird.
2. **Datenminimierung** (Primärschutz) — Caps auf Zeilen, keine Log-History-Archäologie.
3. **Rolle / Admin-User-Allowlist** (Primärschutz) — nicht jede Medusa-Admin-Session kann alles.
4. **Re-Authentication für destructive Actions** (Primärschutz) — Passwort erneut eingeben.
5. **Rate-Limiting + Cooldown** (Sekundärschutz).
6. **Regex-Scrubbing von known-secrets** (Zusatzschutz) — fängt verbleibende Stripe-Keys/JWTs.
7. **Audit-Log** (Forensik) — kein Schutz, aber Nachweisbarkeit.

### 3.2 Log-Quellen (v2 — drastisch reduziert)

| Typ | v1-Scope | **v2-Scope (eng)** | Begründung |
|---|---|---|---|
| PM2 Processes | alle | `vodauction-backend`, `vodauction-storefront` (2) | andere PM2-Apps sind nicht Teil von VOD-Auctions |
| File-Logs | alle in `scripts/*` | Fixe 4: `health_sampler.log`, `legacy_sync.log`, `discogs_daily.log`, `meilisearch_sync.log` | nur relevante Ops-Logs, nicht Entity-Overhaul etc. |
| DB-Log-Browser | `sync_log`, `meilisearch_drift_log`, `health_check_log` | **rausgenommen** | `health_check_log` schon via Uptime-Balken sichtbar. Wenn `sync_log`-Details gebraucht werden: Runbook-Link führt zu Supabase-Dashboard |
| Sentry | Issues API | Issues API | Low-risk, High-value |
| Alert-History | derived | **dedizierte Tabelle** (§3.4) | Operative Nachvollziehbarkeit |

### 3.3 SSE für Live-Tail (v2 — vereinfacht)

Server-Sent Events für Live-Follow. Aber Feature-Scope v1:
- Initial load: 100 Zeilen (kein "Load older").
- Optional Live-Follow (Toggle im UI).
- **Clientseitige** Search + Severity-Filter (nur über die geladenen 100+follow).
- Keine Timestamp-Pagination. Kein Scrollback auf > 1 Stunde alt.
- Rate-Limit: max 3 concurrent SSE-Streams pro Admin-User.
- Idle-Close nach 10min ohne Client-Activity.

**Wenn ein User echte Log-Archäologie braucht** → Runbook sagt "ssh vps" (ist OK, selten).

### 3.4 Neue DB-Tabellen

#### `health_alert_dispatch_log` (Alert-History, P4-A)

```sql
CREATE TABLE health_alert_dispatch_log (
  id BIGSERIAL PRIMARY KEY,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_name TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT,
  metadata JSONB,
  channels_attempted JSONB,                     -- {"resend":{"ok":true},"sentry":{"ok":true}}
  status TEXT NOT NULL DEFAULT 'fired',         -- 'fired'|'acknowledged'|'resolved'|'auto_resolved'
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  acknowledge_reason TEXT,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_hadl_time ON health_alert_dispatch_log (dispatched_at DESC);
CREATE INDEX idx_hadl_open ON health_alert_dispatch_log (status, dispatched_at DESC) WHERE status = 'fired';
-- Retention: 180 Tage
```

#### `service_silence` (persistent Silence, P4-D)

```sql
CREATE TABLE service_silence (
  id BIGSERIAL PRIMARY KEY,
  service_name TEXT NOT NULL,
  silenced_until TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by TEXT
);
CREATE UNIQUE INDEX idx_ss_active ON service_silence (service_name) WHERE silenced_until > NOW() AND cancelled_at IS NULL;
-- Max 24h TTL enforced in handler (§3.7)
```

`maybeDispatchAlert()` liest vor Channel-Routing: `SELECT 1 FROM service_silence WHERE service_name=? AND silenced_until > NOW() AND cancelled_at IS NULL` — wenn hit, wird dispatch suppressed + Log-Entry `suppressed_by_silence`.

#### `admin_action_log` (Audit, P4-D — v2-Schema)

```sql
CREATE TABLE admin_action_log (
  id BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL,                     -- NEW v2: correlation across pre/post entries
  action TEXT NOT NULL,                         -- 'refresh_sampler', 'acknowledge_alert', 'silence_service'
  risk_class TEXT NOT NULL,                     -- NEW v2: 'read_only', 'low_impact', 'destructive'
  target TEXT,                                  -- Service name or alert id
  actor_user_id TEXT NOT NULL,
  actor_email TEXT,
  actor_source TEXT NOT NULL DEFAULT 'admin_ui', -- NEW v2: 'admin_ui', 'cron', 'cli'
  stage TEXT NOT NULL,                          -- NEW v2: 'pre' oder 'post'
  pre_state JSONB,                              -- NEW v2: state before action (where relevant)
  post_state JSONB,                             -- NEW v2: state after action
  payload JSONB,                                -- Action-specific input (reason, duration, etc.)
  result TEXT,                                  -- 'success'|'failure'|'partial' (only in post-entry)
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_aal_time ON admin_action_log (created_at DESC);
CREATE INDEX idx_aal_request ON admin_action_log (request_id);
CREATE INDEX idx_aal_action_target ON admin_action_log (action, target, created_at DESC);
-- Retention: 365 Tage
```

**pre/post-Pattern:** Jede Action schreibt zwei Einträge mit derselben `request_id` — einen vor Execution (`stage='pre'`, `pre_state`), einen nach Execution (`stage='post'`, `post_state`, `result`, `error_message`). Macht Crashes nachvollziehbar (pre ohne post = aborted).

### 3.5 Re-Authentication für Destructive Actions

Medusa-Admin-Session ist breit. Für `destructive`-Klasse: User muss Passwort erneut eingeben.

Pattern: `POST /admin/system-health/reauth` mit `{password}` → gibt kurzlebigen Token (TTL 5 min, in-memory). Action-Endpoint erwartet `X-Reauth-Token` Header.

**v1 implementiert kein destructive Scope** — die Reauth-Infrastruktur ist nur Vorbereitung für späteres P4-E, falls überhaupt.

### 3.6 Action-Klassen (v2 — enger Scope für v1)

| Klasse | Actions in v1 | Protection |
|---|---|---|
| `read_only` | `refresh_sampler` | Admin-session |
| `low_impact` | `acknowledge_alert`, `silence_service` | Admin-session + Audit-Log + Rate-Limit |
| `destructive` | **keine v1** — `manual_sync` und `pm2_restart` explizit ausgeschlossen | (Reauth-Framework vorbereitet für P4-E) |

Registry in `backend/src/lib/admin-actions.ts`:
```ts
export const ACTIONS = {
  refresh_sampler: { risk_class: "read_only", handler: ..., rateLimit: null },
  acknowledge_alert: { risk_class: "low_impact", handler: ..., rateLimit: "20/h" },
  silence_service: { risk_class: "low_impact", handler: ..., rateLimit: "10/h", maxDurationMin: 1440 },
}
```

### 3.7 UI-Pattern: Drawer mit 3 Tabs (v2 — reduziert)

v1 hatte 4 Tabs. v2: **3 Tabs** — `Alerts`, `Sentry`, `Logs`. Kein separater "Actions"-Tab — Actions sind inline in jedem Tab wo sie hingehören (z.B. Acknowledge im Alerts-Tab, Silence im Header der Drawer).

---

## 4. Roadmap (v2 — neu priorisiert)

Reihenfolge nach **Value/Risk-Ratio** statt Feature-Gruppen. Jede Phase separat live-schaltbar.

### P4-A — Alert-History + Acknowledge (2 Tage, rc44)

**Ziel:** Operative Nachvollziehbarkeit — sicherer, hoch-wertvoller Einstieg.

| # | Task | Acceptance |
|---|---|---|
| A1 | Migration `health_alert_dispatch_log` (§3.4) via Supabase MCP | Idempotent, 2 Indexes |
| A2 | `backend/src/lib/health-alerting.ts` erweitern: jedes dispatchAlert schreibt Row (status='fired', alle Channel-Results serialized) | Unit-Test |
| A3 | Auto-Resolve: Sampler-Hook — wenn 3 consecutive ok-Samples für einen Service → alle `fired` Rows für den Service → `auto_resolved` | Unit-Test mit fake samples |
| A4 | `GET /admin/system-health/alerts/history?status=fired&limit=50` mit Filter | p95 < 300ms |
| A5 | `POST /admin/system-health/alerts/:id/acknowledge` mit `{reason}` (min 3 chars) | Reason required, Audit-Log-Write |
| A6 | Alert-History-Panel oberhalb Kategorien: "N unresolved" Badge, letzte 10 offene mit Service + Severity + Alter + Ack-Button | Live-Refresh 30s analog Auto-Refresh |
| A7 | Header-Badge "N unresolved alerts" mit Pulse wenn > 0 + Click scrollt zu Panel | — |
| A8 | Acceptance + Rollout rc44 mit Feature-Flag `SYSTEM_HEALTH_ALERT_HISTORY` | End-to-End: Alert fires → Panel sichtbar → Ack → History-Status |

**Scope:** Nur Lesen + Acknowledge. Keine Logs, kein Sentry, keine Actions.

---

### P4-B — Sentry-Issues-Embed (1 Tag, rc45)

**Ziel:** Low-risk, High-value. Schneller Kontext zu Errors ohne Tab-Switch.

| # | Task | Acceptance |
|---|---|---|
| B1 | `SENTRY_AUTH_TOKEN` in `backend/.env` (Personal-Access-Token aus sentry.io, `project:read` Scope) — **User-Action nötig vor Start** | Token in 1Password "VOD Sentry Admin Token" archiviert |
| B2 | `GET /admin/system-health/sentry/issues?service=X&limit=10` — Sentry-API-Call mit 60s-Cache (Upstash falls verfügbar, sonst in-memory) | Graceful-Empty bei fehlendem Token |
| B3 | Drawer-Komponente (2 Tabs: "Alerts" - wird in P4-A ergänzt - und "Sentry"). Öffnet über Click auf ServiceCard-Name | Click-Outside + ESC close |
| B4 | Sentry-Tab: Issues mit Level + Count + Last-Seen + Click-Through-URL nach sentry.io | Empty-State wenn 0 Issues |
| B5 | Acceptance + Rollout rc45 mit Flag `SYSTEM_HEALTH_SENTRY_EMBED` | Stress-Test: fehlender Token ≠ Crash |

**Scope:** Nur Anzeige. Keine Sentry-Actions (Resolve o.ä.).

---

### P4-C — Log-Drawer (eingeschränkt) (2 Tage, rc46)

**Ziel:** Inline-Log-Zugriff für den kleinsten sinnvollen Scope.

| # | Task | Acceptance |
|---|---|---|
| C1 | `backend/src/lib/log-sources.ts`: **Hart-kodierte Allowlist** — 2 PM2-Prozesse (`vodauction-backend`, `vodauction-storefront`) + 4 File-Logs (`health_sampler.log`, `legacy_sync.log`, `discogs_daily.log`, `meilisearch_sync.log`). Kein User-Input für Pfade. | Request mit `../` → 400 |
| C2 | `backend/src/lib/log-streaming.ts`: SSE-Helper mit **Quellen-Whitelist-Check** (primary), **Regex-Scrubbing** (secondary, für Stripe/JWT/Bearer). Idle-Close 10min, Max 3 concurrent pro User | Unit-Test mit 10 Secret-Formaten |
| C3 | `GET /admin/system-health/logs/pm2/:process?tail=100&follow=true` — SSE | Cap auf 100 Zeilen hart |
| C4 | `GET /admin/system-health/logs/file/:filename?tail=100&follow=true` — SSE, filename muss in Allowlist | Request mit Non-Whitelist-Name → 404 |
| C5 | Drawer-3.Tab: "Logs" mit Source-Selector (Dropdown mit 6 Einträgen — kein Freitext), Follow-Toggle, clientseitige Search-Box + Severity-Color-Coding | 100 Zeilen laden in < 1s |
| C6 | Rate-Limit: Max 3 concurrent streams pro Admin-Session, zählt in memory | 4. Stream → 429 |
| C7 | Acceptance + Rollout rc46 mit Flag `SYSTEM_HEALTH_LOG_VIEWER` | Security-Test: Scrubbing + Whitelist |

**Scope:** Nur Lesen. Kein Download. Kein "historical query". Kein DB-Log-Browser.

---

### P4-D — Low-Impact Actions (1-2 Tage, rc47)

**Ziel:** Zwei nicht-destruktive Quick-Actions direkt aus dem Dashboard.

| # | Task | Acceptance |
|---|---|---|
| D1 | Migration `admin_action_log` + `service_silence` (§3.4) | Idempotent |
| D2 | `backend/src/lib/admin-actions.ts`: Registry nur mit 3 Actions — `refresh_sampler`, `acknowledge_alert`, `silence_service`. Jede mit `risk_class`, `handler(payload, ctx)`, `rateLimit` config | Unit-Test jede Action |
| D3 | `POST /admin/system-health/actions/:actionId` — schreibt pre-Row in `admin_action_log`, ruft handler, schreibt post-Row. Beide mit derselben `request_id`. | 2 rows in DB pro invocation |
| D4 | `silence_service`-Handler: INSERT `service_silence` mit TTL. Max 24h geprüft handler-side. | `duration_min=2000` → 400 |
| D5 | `health-alerting.ts`: Silence-Check vor dispatch — SELECT aus `service_silence`. Wenn hit: `suppressed_by_silence` im Log, kein Channel-Fire. | Unit-Test |
| D6 | `GET /admin/system-health/silences` — aktive Silence-Entries mit Countdown | Auto-refresh 60s |
| D7 | UI-Buttons: "Force Refresh" (neben Refresh in Page-Header), "Acknowledge" (in Alert-History-Panel — P4-A-Follow-up), "Silence Service X" (in Drawer-Header) | Keine Confirmation-Dialog nötig (low_impact) |
| D8 | `GET /admin/system-health/audit?action=&actor=&days=` + Audit-Log-Viewer als Sub-Page `/app/system-health/audit` | 30-Tage-Default-View, Filter, Pagination |
| D9 | Cleanup-Cron erweitern: `admin_action_log` > 365d + `service_silence` cancelled > 90d + `health_alert_dispatch_log` > 180d purge | Daily, integriert in bestehendem cleanup-cron |
| D10 | Acceptance + Rollout rc47 mit Flag `SYSTEM_HEALTH_ACTIONS` | End-to-End: Silence X für 1h → Alert fires → suppressed_by_silence in alert-log |

**Scope:** NUR 3 Actions. Keine destructive. Kein pm2_restart. Kein manual_sync.

---

### P4-E — Destructive Actions (OFFEN, nicht in v1)

**Status:** Nicht in dieser Roadmap freigegeben. Separater Plan falls Bedarf nach P4-D entsteht.

Kandidaten bei Bedarf:
- `manual_sync` — Trigger `legacy_sync_v2.py` aus UI
- `pm2_restart` — Host-Prozess neustart

**Voraussetzungen für P4-E** (falls freigegeben):
- Re-Auth-Mechanismus (§3.5) voll ausgebaut + audited
- Zwei-Schritt-Freigabe (zweiter Admin muss bestätigen) für `pm2_restart`
- Separate Permission "system:destructive" — nicht jeder Admin darf
- Dedizierter Risiko-Dialog mit Runbook-Referenz + Cooldown ≥ 1h
- Audit-Digest-Mail wird Pflicht, nicht Optional

**Empfehlung:** `P4-E` erst nach 4+ Wochen Laufzeit von P4-A-D — wenn dann ein konkreter Ops-Pain-Point bleibt, nicht spekulativ.

---

## 5. Claude-Modell-Strategie

| Kategorie | Modell | Task-Typen |
|---|---|---|
| **High-Risk / Architektur** | Opus 4.7 | Migrations (A1, D1), Auto-Resolve-Logic (A3), SSE-Streaming mit Scrubbing (C2), Action-Registry-Security (D2, D3), Silence-Check-Integration (D5) |
| **Routine-Implementation** | Sonnet 4.6 | API-Endpoints (A4, A5, B2, C3, C4, D3, D6, D8), Drawer-Komponente (B3, C5), UI-Buttons (D7), Audit-Log-Viewer (D8) |
| **Mechanische Edits** | Haiku 4.5 | Header-Badge (A7), Icon-Mapping, Cleanup-Cron-SQL (D9), Env-Doc-Update |

Kosten-Schätzung: ~$10-20 gesamt (weniger als v1 weil Scope enger).

---

## 6. Acceptance-Kriterien (pro Phase)

### P4-A Acceptance

- Acknowledge mit leerem `reason` → 400, Button im UI disabled.
- Auto-Resolve: 3 fake ok-Samples via `POST /health-sample?source=manual` → alle fired Rows des Services werden `auto_resolved` innerhalb des nächsten Polls.
- Alert-History zeigt 50 Rows in < 300ms (gemessen bei 10k Rows in Tabelle).
- Header-Badge reagiert innerhalb 30s auf Status-Änderung (nächster Auto-Refresh-Tick).

### P4-B Acceptance

- Fehlender `SENTRY_AUTH_TOKEN` → Tab rendert Empty-State, kein Crash.
- Sentry-Rate-Limit (100/min): Cache hält 60s, max 1/min pro Service.
- Click-Through-URL enthält org+project+issue-id, keine Token-Leaks in Request-URLs.

### P4-C Acceptance

- **Allowlist-Enforcement:** Call mit `process=eicar` → 404. Call mit `filename=../../../etc/passwd` → 404. (Getestet mit 10 Attack-Pattern.)
- **Scrubbing-Suite:** Test-Log mit jeweils einem von: Stripe live-key, Stripe test-key, Bearer-Token, JWT (header.payload.signature), Password-in-URL, Email, API-Key — 0 Leaks im Client-Stream (alle Patterns als `***MASKED***`).
- Max 3 concurrent Streams: 4. Stream → 429 "Too many log streams open".
- Idle-Close: 10min keine Client-Activity → Server closed connection + UI zeigt "Stream beendet, Reconnect".
- **Kein DB-Log-Browser** — der Route-Bereich `/admin/system-health/logs/db/*` gibt 404 (wurde aus v1 gestrichen).

### P4-D Acceptance

- Jede Action schreibt 2 Rows in `admin_action_log` mit derselben `request_id`.
- `refresh_sampler` ohne Audit-Payload (da read_only) — aber trotzdem 2 Rows (Nachweisbarkeit).
- Rate-Limit: 21. `acknowledge_alert` in einer Stunde → 429.
- Silence persistent: Backend-Restart während aktivem Silence → Silence greift weiter (Test: create silence, pm2 restart, post sample → suppressed_by_silence).
- `silence_service` mit `duration_min=2000` → 400 "max 1440min".
- Audit-Page lädt 500 Rows mit Filter in < 400ms.

---

## 7. Rollout

Jede Phase separat live via Flag. Reihenfolge macht rc43 → rc44 → rc45 → rc46 → rc47.

- **P4-A → rc44:** `SYSTEM_HEALTH_ALERT_HISTORY` ON
- **P4-B → rc45:** `SYSTEM_HEALTH_SENTRY_EMBED` ON (nach Token-Setup)
- **P4-C → rc46:** `SYSTEM_HEALTH_LOG_VIEWER` OFF → Freigabe nach Security-Review + Scrubbing-Suite-Test, dann ON
- **P4-D → rc47:** `SYSTEM_HEALTH_ACTIONS` OFF → Freigabe nach P4-A-C stable, dann ON

Rollback pro Phase:
- P4-A: Flag OFF → Panel hidden, `dispatched_log`-Tabelle bleibt (additiv)
- P4-B: Flag OFF → Tab hidden. Token kann in .env bleiben.
- P4-C: Flag OFF → Endpoints 404, Drawer-Tab hidden
- P4-D: Flag OFF → Action-Endpoints 404, UI-Buttons hidden, aktive Silences bleiben persistent (expire natürlich)

---

## 8. Risiken + Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Log-Endpoint leakt Secrets | Primärschutz = Whitelist + Datenminimierung. Zusatzschutz = Scrubbing. **Kein User-Input für Log-Quellen**, nur Select aus hart-kodierter Liste. |
| Alert-History-Tabelle wächst | 180d Retention + Cleanup-Cron + `WHERE status = 'fired'` Partial Index für Hot-Path-Query |
| Silence wird vergessen | UI zeigt Countdown, max 24h TTL hart im Handler, Daily-Cleanup für gecancellte Einträge > 90d |
| Audit-Log wird zu groß | 365d Retention. `pre_state/post_state` auf die wirklich nötigen Felder begrenzt (nicht whole-row-snapshots). |
| Accidental Silence aller Services | Silence-Handler prüft: `service_name` muss in Checks-Registry sein. Keine Wildcards. |
| Sentry-Token leakt via UI | Token ist server-only (backend/.env). UI bekommt NUR das gefilterte Issues-Array, nie den Token. |
| DB-Log-Queries werden teuer | v2 hat DB-Log-Browser gestrichen. Wenn später gewünscht: Extra-Plan mit Query-Timeout + Row-Cap. |
| Auto-Resolve übersieht echtes Problem | Auto-Resolve nur bei 3 consecutive ok — nicht 1. Manuelles Ack bleibt Primär-Workflow. |

---

## 9. Offene Fragen für Robin

1. **`SENTRY_AUTH_TOKEN`:** Brauche ich für P4-B. Personal-Access-Token aus sentry.io (org `vod-records`, project `vod-auctions-storefront`) mit Scope `project:read`. Muss vor P4-B-Start in `backend/.env` + 1Password.
   **Empfehlung:** Token erstellen — P4-B ist der günstigste Value-Punkt des ganzen Plans.

2. **P4-E (destructive Actions) — grundsätzlich je?** Willst du in Zukunft `pm2_restart` aus der UI? Oder sollen wir das Framework gar nicht erst vorbereiten?
   **Empfehlung:** Zustimmung zu "P4-E bleibt OFFEN, entscheiden nach 4 Wochen Laufzeit von P4-D". Reauth-Framework trotzdem im Security-Design mitdenken — nur nicht implementieren jetzt.

3. **Alert-Acknowledge-Mandatory:** Muss bei `Acknowledge` eine Mindestmeldung kommen (z.B. "noted", "resolved upstream")?
   **Empfehlung:** Ja, min 3 Zeichen — sonst wird's zum Null-Klick-Ritual ohne Information.

4. **Log-Viewer-Zugriffskontrolle:** Aktueller Medusa hat nur eine Admin-Rolle (alle können alles). Soll ich **jetzt schon** eine zweite Admin-User-Whitelist einziehen (z.B. `LOG_VIEWER_ALLOWED_EMAILS=rseckler@...`)? Oder sind alle Admins = alle dürfen alles?
   **Empfehlung:** Start mit "alle Admins dürfen" — derzeit sind nur Robin + Frank admins. Bei 3+ Admins später restriktiver.

5. **Audit-Digest-Mail:** Täglich per Resend wenn destructive Actions (P4-E) passieren? Oder wir warten bis P4-E existiert?
   **Empfehlung:** Warten. Keine destructive in v1 → keine Digest-Mail nötig.

---

## 10. Freigabe-Checklist

Vor P4-A-Start:

- [ ] Robin-Freigabe dieses v2-Plans
- [ ] Entscheidung zu §9 offenen Fragen
- [ ] Sentry-Token in 1Password gespeichert (für P4-B)
- [ ] Bestätigung: P4-E (destructive Actions) ist bewusst OPEN, nicht zugesagt

Bei Freigabe: P4-A (Alert-History) startet mit Migration A1 als Foundation.
