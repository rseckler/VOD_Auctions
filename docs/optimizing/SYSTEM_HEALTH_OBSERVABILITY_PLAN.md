# System Health Observability Plan (P4)

**Status:** Draft · Freigabe pending
**Autor:** Robin Seckler + Claude Opus 4.7
**Erstellt:** 2026-04-23
**Scope:** `/app/system-health` um Log-Zugriff, Sentry-Embeds und Admin-Actions erweitern. Baut direkt auf P1+P2+P3 (rc41-rc43) auf.
**Verwandte Docs:** [`SYSTEM_HEALTH_EVOLUTION_PLAN.md`](SYSTEM_HEALTH_EVOLUTION_PLAN.md) · [`DEPLOYMENT_METHODOLOGY.md`](../architecture/DEPLOYMENT_METHODOLOGY.md)

---

## 1. Kontext

Nach P1-P3 (rc41-rc43) ist das Dashboard ein vollständiges Ops-Monitoring-Tool: 25 Checks, Historie, Alerts, Runbooks. Aber:

- **Log-Zugriff fehlt komplett.** Bei Incidents heißt es aktuell: SSH auf VPS, `pm2 logs`, `tail` auf Log-Dateien. Frank/Robin verlieren 2-3 Minuten pro Diagnose.
- **Keine Interactions.** Selbst einfache Aktionen wie "Force-Refresh Sampler" oder "Manual Sync starten" brauchen SSH oder Admin-UI-Tab-Wechsel.
- **Sentry ist integriert, aber extern.** Errors sind auf sentry.io, kein Context-Switch-frei sichtbar.
- **Alert-History fehlt.** Wer hat wann einen Alert bekommen? Wurde er bearbeitet? Gibt es noch offene Incidents?

**Best-Practice-Recap** (siehe User-Diskussion 2026-04-23):
- Statuspage-Dashboards (extern, public): **keine** Logs/CTAs — Security.
- Ops-Dashboards (intern, Datadog/Better Stack): **Logs verlinkt** (nicht inline), **CTAs mit Audit** und Runbook-Integration.
- Grafana + Loki: Logs inline mit Metrics — aber als Extra-Panels, nicht in Status-Übersicht.

**Unser Scope:** Internes Admin-Dashboard — Logs + CTAs sind angemessen, müssen aber sauber auth-gated und auditiert sein.

---

## 2. Zielbild

Nach P4 ist das Dashboard ein **self-service Admin-Cockpit**:

1. **Log-Drawer** (right-side slide-in) pro Service: Live-Tail via SSE, Scroll-Back in History, Filter nach Severity.
2. **Sentry-Issues-Panel** pro Service: letzte 10 Issues mit Click-Through zu sentry.io.
3. **Action-Buttons** auf ServiceCard: Force-Refresh, Manual-Sync, Silence-Service. Destructive Actions (PM2 Restart) mit Confirmation + Audit.
4. **Alert-History-Panel**: Letzte 50 Alerts mit Status (fired/acknowledged/resolved), Acknowledge-Button.
5. **Audit-Log-Viewer**: Wer hat welche Action wann ausgeführt. DSGVO-konform (kein Over-Logging).

---

## 3. Transversale Design-Entscheidungen

### 3.1 Log-Stream-Pattern: SSE

Server-Sent Events statt WebSocket:
- Einseitig (Server → Client) reicht — Client schreibt keine Logs.
- Automatisches Reconnect built-in.
- HTTP/1.1 + HTTP/2 unterstützt.
- Keine ws-Dep (Node 20 Thema aus rc43 Memory).

Endpoint-Pattern: `GET /admin/system-health/logs/:source` mit `Accept: text/event-stream`. Events als `data: {"line": "...", "ts": "...", "severity": "..."}`.

### 3.2 Log-Quellen (5 Typen)

| Typ | Beispiel | Access-Mechanismus |
|---|---|---|
| PM2 Process | `vodauction-backend`, `vodauction-storefront` | `pm2 logs --raw --lines N` via child_process + `tail -F` auf `/root/.pm2/logs/<name>-<out|error>.log` |
| File-based | `scripts/health_sampler.log`, `scripts/legacy_sync.log` | `tail -F` auf Datei |
| DB Table | `sync_log`, `meilisearch_drift_log`, `health_check_log` | SQL-Query mit Filter + Pagination |
| Sentry | Sentry Issues API | `GET /api/0/projects/<org>/<proj>/issues/?query=service:X` |
| Alert-History | Derived aus `health_alert_dispatch_log` (neu) | SQL |

### 3.3 Log-Sanitization (Security)

**Regex-basiertes Scrubbing** auf Output-Stream bevor zum Client:
```ts
const SCRUB_PATTERNS = [
  /sk_live_[a-zA-Z0-9]+/g,              // Stripe keys
  /Bearer [a-zA-Z0-9._-]+/gi,           // JWT/Auth tokens
  /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,  // JWTs
  /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9]{2,}/g,  // Emails → mask local part
  // ... erweiterbar
]
```
Konservativer Default: bei unbekanntem Format → mask. Testen mit Test-Suite (§6 Acceptance).

### 3.4 Audit-Log (neue Tabelle)

```sql
CREATE TABLE admin_action_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,                        -- 'pm2_restart', 'manual_sync', 'acknowledge_alert', 'silence_service', ...
  target TEXT,                                  -- 'vodauction-backend', 'meilisearch', 'alert:123', ...
  actor_user_id TEXT,                           -- Medusa admin user id
  actor_email TEXT,
  payload JSONB,                                -- Action-specific context (pre-restart state, acknowledge reason, silence-duration)
  result TEXT NOT NULL,                         -- 'success', 'failure', 'partial'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_aal_time ON admin_action_log (created_at DESC);
CREATE INDEX idx_aal_action_target ON admin_action_log (action, target, created_at DESC);
-- Retention: 1 Jahr (DSGVO-angemessen für Admin-Actions)
```

### 3.5 Action-Security-Model

Action-Klassen nach Risiko:

| Klasse | Beispiele | Protection |
|---|---|---|
| `read-only` | Force-Refresh Sampler, View-Logs | Admin-session (implicit) |
| `low-impact` | Manual-Sync trigger, Acknowledge-Alert | Admin-session + Audit-Log |
| `destructive` | PM2 Restart, Silence-Service | Admin-session + Audit-Log + Confirmation-Dialog + Cooldown |

**Rate-Limiting** auf destructive Actions via In-Memory-Counter (PM2-Restart max 3/hour, Manual-Sync max 10/hour). Reset on process restart ist OK — fail-open bei Deploy.

### 3.6 Alert-History-Tabelle (neu)

`health-alerting.ts` dispatched bisher nur — schreibt nicht. Neu: jedes Dispatch schreibt in `health_alert_dispatch_log`:

```sql
CREATE TABLE health_alert_dispatch_log (
  id BIGSERIAL PRIMARY KEY,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_name TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT,
  metadata JSONB,
  channels_attempted JSONB,                     -- {"resend": {"ok":true}, "sentry": {"ok":true}}
  status TEXT NOT NULL DEFAULT 'fired',         -- 'fired', 'acknowledged', 'resolved'
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  acknowledge_reason TEXT,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_hadl_time ON health_alert_dispatch_log (dispatched_at DESC);
CREATE INDEX idx_hadl_status ON health_alert_dispatch_log (status, dispatched_at DESC) WHERE status = 'fired';
-- Retention: 180 Tage
```

### 3.7 UI-Pattern: Drawer statt Modal

Right-side Slide-in-Drawer (Tailwind/shadcn-style):
- Dashboard bleibt sichtbar im Hintergrund.
- Mehrere Drawer stackable nicht (nur eins offen zur Zeit).
- Width ~600px auf Desktop, Full-Screen auf Mobile.
- Close via ESC, Click außerhalb, oder X-Button.

Inhalt per Service: Tabs — `Logs (tail)` · `Sentry Issues` · `Recent Alerts` · `Actions`.

---

## 4. Roadmap

3 separate Rollouts. Feature-Flags: `SYSTEM_HEALTH_LOG_VIEWER` (P4-A), `SYSTEM_HEALTH_ACTIONS` (P4-B), `SYSTEM_HEALTH_AUDIT_TRAIL` (P4-C).

### P4-A — Log-Access Layer (2-3 Tage, rc44)

**Ziel:** Logs aller 5 Typen inline via Drawer einsehbar.

| # | Task | Acceptance |
|---|---|---|
| A1 | Migration `2026-xx-xx_admin_action_log + health_alert_dispatch_log` via Supabase MCP | Idempotent, 2 Tabellen + 4 Indexes |
| A2 | `backend/src/lib/log-streaming.ts`: SSE-Stream-Helper, line-by-line Emitter, Scrubbing via `SCRUB_PATTERNS` | Unit-Test mit Stripe-Key + JWT im Sample-Log |
| A3 | `GET /admin/system-health/logs/pm2/:process?tail=N&follow=true` — SSE, `pm2 logs --raw --lines N` als initial + `tail -F` für live | 100 Zeilen Initial, dann live-append |
| A4 | `GET /admin/system-health/logs/file/:filename?tail=N&follow=true` — whitelist auf `/root/VOD_Auctions/scripts/*.log` | Nie paths außerhalb whitelist |
| A5 | `GET /admin/system-health/logs/db/:table?service=X&severity=Y&since=Z&limit=N` — Query auf `sync_log`, `meilisearch_drift_log`, `health_check_log` | 3 Whitelisted Tables, pagination |
| A6 | `GET /admin/system-health/logs/sentry/:service` — Sentry-Issues API mit `SENTRY_AUTH_TOKEN` (neu in .env), 60s-Cache | Ohne Token graceful → Empty state |
| A7 | Drawer-Komponente mit 4 Tabs: PM2 Logs · File Logs · DB Logs · Sentry. Auto-select passende Tab pro Service. | Keyboard: Esc close, tab-key switch |
| A8 | ServiceCard "📋 View Logs"-Button öffnet Drawer | Pro Service passende Log-Quelle als default-tab |
| A9 | Log-Viewer-Features: Search in view, scroll-lock toggle, timestamp-filter, severity-color-coding | Live-test mit 1000-Zeile-Log |
| A10 | Acceptance-Suite A + Rollout rc44 | p95 SSE-first-event < 500ms · Scrubbing green · CHANGELOG + tag |

**Nicht-Ziele P4-A:** keine Actions, keine Audit, keine Alert-History.

---

### P4-B — Action Layer (2-3 Tage, rc45)

**Ziel:** CTAs pro ServiceCard für die häufigsten Recovery-Actions.

| # | Task | Class | Acceptance |
|---|---|---|---|
| B1 | `backend/src/lib/admin-actions.ts`: Action-Registry mit `{id, label, risk, handler, runnable(service)}` | read-only / low-impact / destructive | — |
| B2 | `POST /admin/system-health/actions/:actionId` mit body `{target, payload}`, Audit-Write in `admin_action_log` | Liest actor aus Medusa-Auth-Session | p95 < 500ms (excl. actual work) |
| B3 | Action: `refresh_sampler` — POST intern zu `/health-sample?source=manual&class=X`. Read-only. | — | Low-risk |
| B4 | Action: `manual_sync` — Fires off legacy_sync_v2.py via `child_process.exec` mit nohup + detach. Rate-Limit 10/h. | low-impact | Returns pid + stream-URL |
| B5 | Action: `acknowledge_alert` — UPDATE `health_alert_dispatch_log SET status='acknowledged'`. | low-impact | Requires reason (free-text, min 3 chars) |
| B6 | Action: `silence_service` — In-memory Map `{service, until}`, Sampler überspringt Alert-Dispatch während silence. Dauer: 15m/1h/24h. | low-impact | Silence expires auto |
| B7 | Action: `pm2_restart` — `pm2 restart --update-env <process>`. Rate-Limit 3/h. | destructive | Confirmation-Dialog nötig |
| B8 | Confirmation-Dialog-Komponente: Input für reason, Checkbox "Ich habe Runbook gelesen", visible risk-level | Kann nicht default-Yes | — |
| B9 | ServiceCard "Actions"-Button öffnet Drawer-Tab mit runnable actions für diesen Service | Keine destructive ohne Confirmation | — |
| B10 | `GET /admin/system-health/actions/history` + Action-History-Panel im Drawer | Pagination, filter by actor + action-type | — |
| B11 | Acceptance + Rollout rc45 | Jede Action testet + Audit-Log-Write verifiziert | — |

**Nicht-Ziele P4-B:** "Deploy"-Button, "Rollback"-Button, "DB-Query runner" — zu mächtig für Admin-UI.

---

### P4-C — Alert-History + Observability-Polish (1-2 Tage, rc46)

**Ziel:** Alerts sind nachverfolgbar. Dashboard-Header zeigt offene Alerts prominent.

| # | Task | Acceptance |
|---|---|---|
| C1 | `backend/src/lib/health-alerting.ts` erweitern: jedes dispatchAlert schreibt in `health_alert_dispatch_log` | Alle Channels + Results serialized |
| C2 | `GET /admin/system-health/alerts/dispatch-history?limit=50&status=fired` | — |
| C3 | Alert-History-Panel oberhalb der Kategorien: letzte 10 offene Alerts als kompakte Liste | Click → Drawer mit Details + Acknowledge-Button |
| C4 | Header-Badge "N unresolved alerts" neben Auto-Refresh-Toggle | Click scrollt zu Alert-History-Panel |
| C5 | "Resolved"-Status: wenn Service zurück auf ok → auto-resolve alle fired Alerts für den Service | — |
| C6 | Audit-Log-Viewer als eigene Sub-Page `/app/system-health/audit` | 30-Tage-View, Filter Actor + Action |
| C7 | Daily Audit-Digest-Mail (optional Flag `SYSTEM_HEALTH_AUDIT_DIGEST`) | destructive-actions-only |
| C8 | Cleanup-Cron erweitern: `admin_action_log` > 365d purge, `health_alert_dispatch_log` > 180d purge | Monthly, off-peak |
| C9 | Acceptance + Rollout rc46 | End-to-End: Alert fires → History-Panel visible → Acknowledge → History shows acknowledged |

---

## 5. Claude-Modell-Strategie

| Kategorie | Modell | Task-Typen |
|---|---|---|
| **High-Risk / Architektur** | Opus 4.7 | DB-Migrations (A1), Scrubbing-Engine (A2), PM2-Restart-Handler (B7), Action-Security-Model (B1+B2), Auto-Resolve-Logic (C5) |
| **Routine-Implementation** | Sonnet 4.6 | Log-Endpoints (A3-A6), Drawer-Komponente (A7+A9), Action-Registry (B3-B6), Alert-History-Panel (C2+C3), Audit-Log-Viewer (C6) |
| **Mechanische Edits** | Haiku 4.5 | ServiceCard-Buttons (A8), Badge-Styling (C4), Filter-Copy-Text, Cleanup-Cron-SQL (C8) |

Kosten-Schätzung: ~$15-25 über alle drei Phasen.

---

## 6. Acceptance-Kriterien (pro Phase)

### P4-A Acceptance

- SSE-Stream: p95 first-event-latency < 500ms, sustained emission bei bis zu 10 events/s ohne Packet-Loss.
- Scrubbing: Test-Log mit 10 Secret-Formaten → 0 im Stream-Output (Unit-Test + E2E).
- Whitelist: Call mit `../etc/passwd` als filename → 400 Bad Request.
- Drawer-UX: Open < 200ms, initial 100 Zeilen sichtbar innerhalb 1s.
- Sentry-Panel: bei fehlendem Token → Graceful-Empty-State, kein Crash.

### P4-B Acceptance

- Jede Action ruft `admin_action_log` Insert mit success/failure + full payload.
- Rate-Limit: 4. Manual-Sync innerhalb einer Stunde → 429 + Cooldown-Remaining in Response.
- Confirmation-Dialog: ohne reason (empty) + ohne Runbook-Checkbox → disabled submit.
- PM2-Restart: Audit-Log-Entry PRE und POST (so dass man sieht wann es gestartet + wann abgeschlossen war).
- Silence-Service: Alert fires während silence-Window → kein Resend/Sentry/Slack, wohl aber Log "suppressed_by_silence".

### P4-C Acceptance

- Alert-History zeigt letzten 10 fired Alerts binnen < 300ms.
- Acknowledge setzt `status='acknowledged'` + `acknowledged_by/_at` in derselben Transaktion wie Audit-Log.
- Auto-Resolve: 3 consecutive ok samples für einen Service → alle fired Alerts dieses Services werden resolved.
- Audit-Digest-Mail zeigt NUR destructive-actions (PM2-Restart), nicht low-impact oder read-only.

---

## 7. Rollout

Jede Phase separat live-schaltbar über Flags. Keine Big-Bang-Releases.

- **P4-A → rc44** (Logs): Flag `SYSTEM_HEALTH_LOG_VIEWER`. OFF → "View Logs"-Button hidden, Endpoints 404.
- **P4-B → rc45** (Actions): Flag `SYSTEM_HEALTH_ACTIONS`. OFF → Actions-Tab hidden, Endpoints 404.
- **P4-C → rc46** (Polish): Flag `SYSTEM_HEALTH_AUDIT_TRAIL`. OFF → History-Panel + Audit-Page hidden.

Rollback:
- P4-A: Flag OFF → Frontend-Buttons hidden, Backend-Endpoints 404. DB-Tabellen bleiben (additiv).
- P4-B: Flag OFF → Buttons hidden. Bereits geloggte Actions bleiben in `admin_action_log`.
- P4-C: Flag OFF → UI-Panels hidden. Alert-Dispatch-Log wird trotzdem geschrieben (kleiner Overhead).

---

## 8. Risiken + Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Log-Endpoint leakt Secrets | Whitelist auf Source-Pfade + Regex-Scrubbing + Unit-Tests mit realistischen Secret-Samples |
| PM2-Restart accidental getriggert | Confirmation-Dialog + Reason-Required + 3/h Rate-Limit + Audit-Log + Cooldown |
| DOS auf SSE-Log-Endpoint | Max 3 concurrent streams pro Admin-Session, heartbeat-5s, auto-close nach 10min idle |
| `admin_action_log` wächst unbegrenzt | Cleanup-Cron 365d-Retention (menschlich interpretiert: eines Jahres Audit ist angemessen) |
| Silence-Service vergessen | Max 24h duration, auto-expire mit visible countdown im UI |
| Sentry-API-Rate-Limit (100/min) | 60s-Cache auf Response, keine per-card-auto-refresh |
| Auto-Resolve false-positives (Alert resolved obwohl Problem besteht) | Nur resolve nach 3 consecutive ok — nicht nur 1 ok-Sample |
| Audit-Digest-Mail wird Flood | Flag default OFF, warnings-level separate (nicht in Digest) |

---

## 9. Offene Fragen für Robin

1. **Log-Retention im UI:** Default-Tail 100 Zeilen mit scrollback zu 1000? Oder aggressiver Initial-Load (1000)?
   **Empfehlung:** 100 Zeilen initial, "Load older" button für +500 auf Click. Spart Bandwidth.

2. **`SENTRY_AUTH_TOKEN`:** Brauche ich für Issue-API-Calls (DSN reicht nicht). Du musst einen Personal-Access-Token mit `project:read` Scope in sentry.io/settings erstellen und in `backend/.env` setzen. Alternativ: P4-A ohne Sentry-Tab deployen, Sentry nachrüsten.
   **Empfehlung:** Token erstellen — Sentry-Embed ist hoher Value pro geringem Effort.

3. **Rate-Limit Manual-Sync:** Wie oft pro Stunde akzeptabel? Ich schlage 10 vor (legacy_sync dauert ~80s, 10 wäre theoretisch 13 Minuten).
   **Empfehlung:** 10/Stunde scheint safe.

4. **Audit-Digest-Mail:** Täglicher Digest mit allen destructive Actions (PM2-Restart) an `rseckler@`? Oder nur auf-Abruf-Report?
   **Empfehlung:** Täglich für destructive — ist genau zwei Zeilen pro Tag maximal, aber sichert dass niemand unbemerkt restartet. Flag-gated damit man's abschalten kann.

5. **"Deploy"-Button: NIE implementieren?** Wäre technisch machbar (GitHub-API + webhook trigger VPS-pull). Aber hohes Risk.
   **Empfehlung:** NIE. Deploys bleiben git-basiert. Wenn sehr gewünscht: separater CI/CD-Plan, nicht in diesem Scope.

---

## 10. Freigabe-Checklist

Vor P4-A-Start:

- [ ] Robin-Freigabe dieses Plans
- [ ] Entscheidung zu §9 offenen Fragen (insb. Sentry-Token)
- [ ] `SENTRY_AUTH_TOKEN` in backend/.env (falls §9.2 = ja)

Bei Freigabe: P4-A startet mit A1 (Migration) + A2 (Log-Streaming-Helper) als Foundation.
