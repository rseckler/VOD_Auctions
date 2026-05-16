# Session 2026-05-16 — Disk-IO-Fix + `database_io`-Health-Probe + Member-Profil-Crash-Hotfix

**Auslöser:** Supabase-E-Mail — „Your project is depleting its Disk IO Budget" (vod-auctions, `bofblwqieuvmqybzxapx`).
**Status:** ✅ rc60.2 Disk-IO-Fix · ✅ rc62.1 Health-Probe · ✅ rc63.1 Sentry-Hotfix — alle deployed + verifiziert.
**Releases:** [rc60.2](https://github.com/rseckler/VOD_Auctions/releases/tag/v1.0.0-rc60.2) · [rc62.1](https://github.com/rseckler/VOD_Auctions/releases/tag/v1.0.0-rc62.1) · [rc63.1](https://github.com/rseckler/VOD_Auctions/releases/tag/v1.0.0-rc63.1)

---

## Teil 1 — Disk-IO-Diagnose & Fix (rc60.2)

`pg_stat_statements` (63-Tage-Fenster) ausgewertet. Die zwei größten Disk-IO-Verbraucher kamen beide aus dem neuen CRM-Mail-Import-Subsystem (RSE-322), das nach der letzten IO-Sweep (rc52.6.5) dazukam.

### Root Cause — invalider Index

`idx_crm_imap_message_msgid_unique` stand auf `indisvalid=false` / `indisready=false` / 0 Bytes — ein fehlgeschlagener `CREATE INDEX CONCURRENTLY` hatte eine tote Index-Hülle hinterlassen. Der Planner ignoriert sowas **lautlos**.

Folge: der Dedup-Check des Mail-Imports (`import_legacy_mails_v3.py` — `SELECT message_id_header FROM crm_imap_message WHERE message_id_header = ANY(%s)`) lief bei jedem Batch als **Parallel Seq Scan über 407k Rows**. EXPLAIN: 45.493 Blocks / 1894 ms pro Aufruf, über 8.372 Aufrufe = 93 Mio. Disk-Blocks, Cache-Hit nur 56 %. Der Script-Kommentar „ON CONFLICT … schlägt fehl" war genau dieses Symptom.

**Fix:** invaliden Index gedroppt, per `CREATE UNIQUE INDEX CONCURRENTLY` sauber neu gebaut (0 Duplikate vorab verifiziert, keine Write-Locks).
EXPLAIN nachher: **Index Only Scan, 3 Blocks, 0,1 ms** pro Aufruf. Eindeutigkeits-Constraint wieder DB-seitig aktiv.

### Zweitgrößter — ungecachtes Dashboard

`/admin/mail-import/status` rechnete zwei Full-Table-Aggregate über ~407k `crm_imap_message`-Rows bei **jedem** 10s-Dashboard-Poll neu (76 Mio. Blocks). Fix: `totals` + `accounts` 60s in-memory gecacht; Dashboard-Poll 10s → 30s.

**Files:** `backend/src/api/admin/mail-import/status/route.ts`, `backend/src/admin/routes/mail-import/page.tsx`. **Commit:** `c0cbca5`.

---

## Teil 2 — `database_io`-Health-Probe (rc62.1)

Auf Robins Frage „warum nicht automatisch überwachen": **kein neuer Cron** — neuer Eintrag in der bestehenden System-Health-`CHECKS`-Registry (`backend/src/lib/health-checks.ts`), läuft im vorhandenen Sampler mit, nutzt Alerting + Admin-UI (`/app/system-health`).

**Probe `database_io`** (Kategorie `infrastructure`, `check_class: background`):
- **Invalide Indizes** — `pg_index.indisvalid` → `error` mit Index-Namen in `metadata`. Fängt genau die rc60.2-Fehlerklasse ab.
- **Cache-Hit-Ratio** — `pg_stat_database` (kumulativ seit `stats_reset`, daher träge) → `ok ≥95%`, `warning 90–95%`, `error <90%`.
- Combined-Status = schlechterer der beiden.

Neuer Runbook [`docs/runbooks/database-io.md`](../runbooks/database-io.md) — Diagnose + Fix für beide Fälle.
Verifiziert nach Deploy: `invalid_indexes: 0`, `cache_hit_pct: 98.38%` → `ok`. **Commit:** `8c1eba9`.

---

## Teil 3 — Sentry-Hotfix: Member-Profil-Crash (rc63.1)

Sentry-Issue **#120272182** — `TypeError: undefined is not an object (evaluating 'e.display_name')`, Safari, 1×.

**Diagnose:** Der Sentry-`transaction`-Tag zeigte irreführend `/community/explore` (Next-Routing-Instrumentierung stale). Der echte Ort kam aus `metadata.filename` (`CommunityUI.tsx::Byline`) + `tags.url` (`/community/members/cassetteculturejp`). Breadcrumb: Klick auf eine Member-Card → Profilseite.

**Root Cause:** `GET /store/community/profiles/:handle` lieferte die `posts` **ohne `author`-Objekt** (SELECT enthielt keine Author-Felder). Die Member-Profil-Seite reicht diese Posts in die geteilten Feed-Cards `PostCard`/`EditorialCard` → `Byline`, die `author.display_name` unbedingt lesen → die ganze Profilseite white-screente.

**Fix:** Jeder Post einer Profilseite stammt von genau diesem Profil → `serializeProfile(profile)` als `author` an jeden Post gehängt (dieselbe Shape wie die Post-Create-Route).
Verifiziert: `/store/community/profiles/cassetteculturejp` liefert beide Posts mit `author.display_name`.

**File:** `backend/src/api/store/community/profiles/[handle]/route.ts`. **Commit:** `d26e3a3`.

---

## Lessons

- Ein fehlgeschlagener `CREATE INDEX CONCURRENTLY` hinterlässt eine `indisvalid=false`-Hülle, die der Planner stillschweigend ignoriert → unbemerkte Seq Scans. Nach einem `CONCURRENTLY`-Build immer `indisvalid` prüfen. (Im Runbook `database-io.md` festgehalten; die `database_io`-Probe prüft es jetzt dauerhaft.)
- Sentrys `transaction`-Tag / `culprit` kann bei SPA-Navigation (Next App Router, Safari) stale sein. Für den echten Fehlerort `metadata.filename` + `tags.url` + Breadcrumbs heranziehen, nicht den `culprit`.

## Offene Follow-ups

- **Defense-in-depth (optional, niedrige Prio):** `Byline` / `EditorialCard` in `CommunityUI.tsx` gegen ein fehlendes `author`-Objekt härten (graceful „Unknown member" statt White-Screen). Aktuell kippt ein einziger Post ohne Autor die ganze Seite. Der rc63.1-Backend-Fix beseitigt die konkrete Ursache vollständig — dies wäre reine Robustheit.
- **Sentry-Issue #120272182** von Hand auf „resolved" setzen (Auto-Mode blockte den External-Write). 1×-Fehler, Ursache behoben — kommt ohne Regression nicht wieder.
