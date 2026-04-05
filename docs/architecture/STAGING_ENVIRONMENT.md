# Staging Environment — Setup Plan & Status

**Status:** 🟢 **Database provisioned and schema-synced with production** (2026-04-05). No HTTP layer yet — that comes when the first feature needs it.
**Last Updated:** 2026-04-05
**Related:** `docs/architecture/DEPLOYMENT_METHODOLOGY.md` §6

## Current State

| | |
|---|---|
| **Project name** | `vod-auctions-staging` |
| **Project ref** | `aebcwjjcextzvflrjgei` |
| **Organization** | `backfire` (ref `raindgavnjxbqomuoyfo`) — separate Supabase account, not the Seckler org |
| **Region** | eu-west-1 (Ireland) — note: differs from production (eu-central-1 Frankfurt), acceptable for non-latency-critical staging |
| **Instance** | t4g.nano (Free plan default) |
| **Schema** | 1:1 copy of production — 227 tables, 531 indexes, all custom DDL (Medusa ORM + legacy + auction + CRM + CMS) |
| **Data** | Empty — schema-only, zero rows copied |
| **Login account** | Separate Supabase account (not `robin@seckler.de`). Credentials in 1Password as **`Supabase 2. Account`** |
| **DB password** | In the `Database password` field of the `Supabase 2. Account` 1Password entry |
| **Dashboard URL** | https://supabase.com/dashboard/project/aebcwjjcextzvflrjgei |
| **REST URL** | https://aebcwjjcextzvflrjgei.supabase.co |

## Connection

**Session pooler (for `pg_dump` / `psql` admin ops — required on Free plan):**
```
postgresql://postgres.aebcwjjcextzvflrjgei:<DB_PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

**Transaction pooler (for application code, if ever needed):**
```
postgresql://postgres.aebcwjjcextzvflrjgei:<DB_PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
```

Fetch the password non-interactively via 1Password CLI:
```bash
op item get "Supabase 2. Account" --fields "Database password" --reveal
```

## Decision Log

- **2026-04-05:** Option B1 chosen — separate Free Supabase project in the `backfire` organization. Rationale: backfire org had 0 projects, so the Free-tier 2-active-projects limit did not apply. The Seckler org was at the limit (`vod-auctions` + `blackfire-service` active) and touching/pausing any Seckler-org project was explicitly forbidden. Pro upgrade was rejected in favour of zero-cost. Initial plan was to reuse CLAUDE.md's reference to the `backfire` org inside Seckler — this was wrong; `backfire` turned out to be a separate Supabase account altogether, accessed via `Supabase 2. Account` in 1Password.
- **2026-04-05 (same session):** Schema copied from production via `docker run --rm --network=host postgres:17 pg_dump --schema-only --no-owner --no-acl --schema=public` (see §5b for the full runbook). Production DB was read-only for this operation — no rows touched, no schema modified. Staging table count (227) matches production exactly.

---

## 1. Purpose

Staging is the environment where a feature flag can be `true` while production keeps it `false`. It is required for:

- Larger features that touch multiple tables
- Features that depend on external services needing sandbox/test mode (Sendcloud, sevDesk/easybill, Stripe Connect, DATEV)
- Features that require sign-off from external reviewers (accountant, lawyer, payment provider)
- Migration rehearsals for non-trivial data moves

It is **not** required for:

- Single-file bug fixes
- Small additive changes that can be validated against production test accounts
- Admin UI tweaks with no business-process impact

Staging is a tool for de-risking, not a universal gate.

---

## 2. Target Shape

```
┌────────────┐    ┌────────────────┐    ┌────────────┐
│ Local Dev  │ →  │ Staging        │ →  │ Production │
│ localhost  │    │ VPS :3007/9001 │    │ VPS :3006  │
│ :3000/9000 │    │ Separate DB    │    │ Live DB    │
└────────────┘    └────────────────┘    └────────────┘
```

**Staging characteristics:**
- Separate database (no shared rows with production)
- Separate subdomain (e.g. `staging.vod-auctions.com`, `api-staging.vod-auctions.com`)
- Separate PM2 processes (`vodauction-backend-staging`, `vodauction-storefront-staging`)
- Sandbox credentials for all external services (Stripe test mode, Sendcloud test mode, sevDesk/easybill sandbox, PayPal sandbox)
- Own `.env` file with `STOREFRONT_URL=https://staging.vod-auctions.com`
- Seed data: anonymized production snapshot OR synthetic fixtures (decision below)
- Password-gated at the nginx level — never publicly accessible, not even behind invite tokens

---

## 3. Database Decision (BLOCKER — requires Robin's input)

Three viable options. Each has cost / complexity trade-offs.

### Option A — Supabase Branching (Pro plan)
- Supabase Pro ($25/month) includes database branching
- `vod-auctions` project is currently on **Free plan** — Pro upgrade required
- Branches snapshot production schema automatically, with isolated data
- Cleanest workflow: schema changes on a branch get tested, then merged to the main branch
- Branches can be created/destroyed via Supabase CLI
- **Cost:** $25/month ongoing
- **Pros:** Zero manual schema sync, native rollback, minimal ops
- **Cons:** Monthly cost for a solo operator, ties us more deeply to Supabase tooling

### Option B — Second Supabase Free Project
- Create a new Free-plan project (e.g. `vod-auctions-staging`) in the same Seckler org
- Manually sync schema by re-running the DDL from `backend/src/modules/*/migrations/` + the raw SQL files in `backend/scripts/migrations/`
- No shared data; staging starts empty or is seeded from a snapshot
- **Cost:** $0
- **Pros:** Free, already-familiar tooling, full isolation
- **Cons:** Schema drift risk — every new migration must be applied twice. Higher chance of staging diverging silently from production.

### Option C — Local Postgres on the VPS
- Install Postgres directly on the Hostinger VPS
- Run staging backend/storefront against `localhost:5432`
- **Cost:** $0 (VPS already paid)
- **Pros:** Zero external dependency, fastest queries (same box)
- **Cons:** More ops surface on the VPS (backups, upgrades, failures). Conflicts with the "Supabase is our DB" architectural choice. Risk of VPS disk/memory pressure affecting production.

### Recommendation

**Option B (second Supabase Free project)** is the best fit unless Robin wants to pay for Pro. The schema-drift risk is manageable because:
1. The methodology already requires raw-SQL migration files under `backend/scripts/migrations/` — applying them to both projects is scriptable.
2. Medusa ORM migrations (`npx medusa db:migrate`) can be pointed at staging via a different `DATABASE_URL` env var.
3. A small helper script can be added later (`backend/scripts/apply-migrations-staging.sh`) that runs every pending SQL file against staging. Not required for the first staging setup.

**Decision required from Robin:** pick A, B, or C before any infra work starts.

---

## 4. VPS Shape (After DB Decision)

Assuming Option B:

```
VPS 72.62.148.205
├── PM2 processes
│   ├── vodauction-backend            (port 9000, production, existing)
│   ├── vodauction-storefront         (port 3006, production, existing)
│   ├── vodauction-backend-staging    (port 9001, staging, NEW)
│   └── vodauction-storefront-staging (port 3007, staging, NEW)
├── nginx
│   ├── vodauction-api.conf                (existing)
│   ├── vodauction-store.conf              (existing)
│   ├── vodauction-admin.conf              (existing)
│   ├── vodauction-api-staging.conf        (NEW, basic-auth protected)
│   └── vodauction-store-staging.conf      (NEW, basic-auth protected)
└── /root/VOD_Auctions-staging            (NEW, separate git checkout)
    ├── backend/.env                        (staging DATABASE_URL, test-mode credentials)
    └── storefront/.env.local               (staging URLs, test keys)
```

**Key constraint:** staging uses a **separate working directory** on the VPS, not the same `/root/VOD_Auctions` checkout. This lets `git pull` on the staging branch not interfere with production, and avoids build-artifact collisions.

**nginx subdomains (DNS changes required):**
- `staging.vod-auctions.com` → storefront staging (port 3007)
- `api-staging.vod-auctions.com` → backend staging (port 9001)
- `admin-staging.vod-auctions.com` → backend admin (same port 9001, different route)

All staging subdomains sit behind HTTP basic auth at the nginx layer — the platform-mode gate is not enough, because staging should be hidden from external scanners entirely.

---

## 5. Safe Preparatory Work (Can Be Done Now, Zero Risk)

These items do not create any running infrastructure and can land immediately:

- [x] **Methodology doc** (`docs/architecture/DEPLOYMENT_METHODOLOGY.md`) — done
- [x] **This staging plan** (`docs/architecture/STAGING_ENVIRONMENT.md`) — done
- [x] **Feature-flag infrastructure** so staging can actually *do something* when it exists — done (Phase 1)
- [ ] **Migration inventory script** — a small shell script that lists every raw SQL file under `backend/scripts/migrations/` and every Medusa migration under `backend/src/modules/*/migrations/`, sorted by date. Useful for Option B to track what needs applying to staging. **Not yet built** — deferred until the DB decision is made.
- [ ] **`.env.staging.example`** templates for `backend/` and `storefront/` showing which variables differ from production. **Not yet built** — deferred until credentials exist.

---

## 5b. Runbook — What Was Actually Done (2026-04-05)

This section is the **as-built** reference. Use it as the template for any future re-provisioning (disaster recovery, second staging environment, etc.).

### Gotchas discovered during the first run

Five issues surfaced in sequence. All five are now documented in `CLAUDE.md`:

1. **Supabase Free disables direct-connection port 5432** for new projects (IPv4 refused, IPv6 hit a connection limit). All admin ops must go through the Session pooler at `aws-0-<region>.pooler.supabase.com:5432`.
2. **Pooler username format is `postgres.<project-ref>`**, not bare `postgres`. The pooler uses the prefix to route to the correct tenant.
3. **Pooler hostname is region-specific.** Production is `aws-0-eu-central-1.pooler.supabase.com`, staging is `aws-0-eu-west-1.pooler.supabase.com`. Using the wrong region returns `Tenant or user not found`.
4. **VPS `pg_dump` is version 16**, but Supabase runs PG17. `pg_dump` refuses to dump from a newer server. Workaround: run `pg_dump` inside `docker run --rm postgres:17` — no system package change needed.
5. **Docker default bridge network has no IPv6.** Supabase direct-connection hostnames may resolve to IPv6 only, causing `Network is unreachable` inside the container. Use `--network=host` so the container inherits the VPS IPv6 stack.

### Step 1 — Create the project (MANUAL, one-time, ~1 min)

**Note:** the backfire Supabase organization is a **separate Supabase account**, not the Seckler org under `robin@seckler.de`. Login credentials (email + dashboard password) are in 1Password entry `Supabase 2. Account`.

1. Log into Supabase dashboard with the backfire account (1Password `Supabase 2. Account`)
2. Click **New project**
3. Name: `vod-auctions-staging`
4. Region: `eu-west-1` (West EU / Ireland) — chosen during first provision
5. DB password: generate via Supabase's password generator (ALPHANUMERIC only, no `*`/`#`/`$` — shell-escaping issues). Store immediately in 1Password under `Supabase 2. Account` → field `Database password`.
6. Wait ~1-2 min for provisioning
7. Verify project ref is `aebcwjjcextzvflrjgei`

### Step 2 — Schema copy from production (AUTOMATED, ~30 s on VPS)

Connect via SSH once (ControlMaster socket). Fetch DB password from 1Password to avoid any paste in shell history:

```bash
# On your Mac — pre-fetch the staging password from 1Password
STAGING_PW=$(op item get "Supabase 2. Account" --fields "Database password" --reveal)

# Pass it to the VPS via SSH env var (SendEnv, or inline)
ssh vps "bash -s" <<REMOTE
set -e

# Production URL from existing backend/.env (untouched, read-only)
PROD_URL=\$(grep "^DATABASE_URL=" /root/VOD_Auctions/backend/.env | cut -d'=' -f2- | tr -d '"')

# Staging env vars (no URL-escape headaches, use env-vars form)
export PGHOST='aws-0-eu-west-1.pooler.supabase.com'
export PGPORT='5432'
export PGUSER='postgres.aebcwjjcextzvflrjgei'
export PGPASSWORD='${STAGING_PW}'
export PGDATABASE='postgres'

# Sanity: staging reachable and empty
psql -c "SELECT count(*) AS existing FROM pg_tables WHERE schemaname='public';"

# Dump production schema via Docker postgres:17 (VPS pg_dump is v16, too old for PG17 server)
# --network=host so the container inherits the VPS IPv6 stack (Supabase direct host is IPv6)
docker run --rm --network=host postgres:17 \\
  pg_dump --schema-only --no-owner --no-acl --schema=public \\
  "\$PROD_URL" > /tmp/vod-staging-schema.sql

# Apply to staging
psql -v ON_ERROR_STOP=0 < /tmp/vod-staging-schema.sql

# Verify count matches production (was 227 on 2026-04-05)
psql -c "SELECT count(*) AS total FROM pg_tables WHERE schemaname='public';"

# Cleanup
rm -f /tmp/vod-staging-schema.sql
REMOTE
```

**Expected outcomes:**
- Production DB is only READ from (`pg_dump`) — never written.
- Staging DB gets 227 tables, 531 indexes, same count as production on 2026-04-05.
- Only non-fatal "ERROR" line is `schema "public" already exists` — harmless, every new Postgres DB has the `public` schema pre-created.
- Staging tables are empty (`--schema-only` excludes data).

### Step 3 — Env templates

Created in this session:
- `backend/.env.staging.example` — documents which variables differ from production
- `storefront/.env.staging.example` — ditto for the storefront

Never commit actual secrets. Fetch live values via `op item get "Supabase 2. Account" --fields "<field>" --reveal` at runtime.

### Step 4 — HTTP layer deferred

No PM2 entries, no nginx configs, no DNS records yet. The DB alone is sufficient for:
- Migration rehearsals (apply new SQL files to staging first, verify, then apply to production)
- Schema diff testing
- Seeded-data experiments via psql
- ORM model validation

The full HTTP layer (backend on port 9001, storefront on port 3007, nginx subdomains) only gets built when the first feature actually needs to serve HTTP traffic from staging — typically the first ERP feature that depends on external sandbox services (Sendcloud, sevDesk, Stripe Connect).

---

## 6. Outstanding Items (Deferred Until First HTTP-Layer Need)

| Item | Owner | Notes |
|---------|-------|-------|
| **DNS: staging subdomains** | Robin | Deferred. Three A-records pointing to `72.62.148.205` — only needed when the first feature wants HTTP staging. |
| **nginx: staging configs + basic auth** | Robin + Claude | Deferred. Straightforward once DNS resolves. |
| **SSL certificates for staging subdomains** | Robin | Deferred. Let's Encrypt via certbot, same as existing domains. |
| **Sandbox credentials for external services** | Robin | Deferred. sevDesk/easybill sandbox, Sendcloud test mode, Stripe already dual-mode. Only collect when a feature that needs them enters staging. |
| **Seed data strategy** | Robin + Claude | Deferred. Anonymized production snapshot (one-time SQL dump + redaction) vs. synthetic fixtures. Decision can wait until first real use. |
| **Monitoring / alerts for staging** | Deferred | Staging failures do not page. Logs via `pm2 logs vodauction-*-staging` when the HTTP layer exists. |

None of the above blocks current usage — the DB alone is fully functional for migration rehearsals and schema-diff testing via `psql` from a developer machine or the VPS.

---

## 7. What Not to Do

- **Do not build HTTP layer on spec.** The DB is enough for 80% of use cases (migration rehearsals, schema diffs, seed experiments). Add PM2/nginx/DNS only when the first feature actually serves HTTP from staging.
- **Do not share production credentials with staging.** Every external service must have its own sandbox account or test mode. Mixing them risks sending real emails, creating real shipping labels, or billing real customers during tests.
- **Do not point staging at the production database under any circumstances.** The whole point of staging is isolation.
- **Do not expose staging publicly** once the HTTP layer exists. Basic auth at the nginx layer is mandatory. Search engines must not index it.
- **Do not commit secrets.** Always fetch from 1Password at runtime. The `backend/.env.staging.example` template documents which variables exist but never their values.

---

## 8. Next Actions

Staging is **ready for DB-level use right now**. The next action is driven by actual feature need, not by a schedule:

1. **Next time a migration candidate is non-trivial** (multi-table, involves data backfill, or depends on external services): apply the SQL to staging first via `psql` with the pooler connection, verify, then apply to production.
2. **When the first ERP feature** (likely Sendcloud or sevDesk/easybill) enters code-complete state: build the HTTP layer (PM2 + nginx + DNS).
3. **When schema drift becomes a concern**: build a small helper script (`backend/scripts/sync-staging-schema.sh`) that re-runs the production → staging dump. Not yet needed.

The feature-flag infrastructure is fully functional *without* staging (production-only toggles are fine for experimental flags). Staging becomes mandatory only when a flag reaches stage 2 of its activation lifecycle (see `DEPLOYMENT_METHODOLOGY.md` §2) and involves external sandbox services.
