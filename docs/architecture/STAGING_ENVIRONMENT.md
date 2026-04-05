# Staging Environment — Setup Plan & Blockers

**Status:** Planning document. No infrastructure has been provisioned yet.
**Last Updated:** 2026-04-05
**Related:** `docs/architecture/DEPLOYMENT_METHODOLOGY.md` §6

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

## 6. Blockers (Must Be Resolved Before Staging Is Usable)

| Blocker | Owner | Notes |
|---------|-------|-------|
| **Database decision (A / B / C)** | Robin | See §3. Cost vs. ops trade-off. |
| **DNS: create staging subdomains** | Robin | Three A-records pointing to `72.62.148.205`. |
| **nginx: staging configs + basic auth** | Robin + Claude | Straightforward once DNS resolves. |
| **SSL certificates for staging subdomains** | Robin | Let's Encrypt via certbot, same as existing domains. |
| **Sandbox credentials for external services** | Robin | sevDesk/easybill sandbox, Sendcloud test mode, Stripe is already dual-mode. Only collect when a feature that needs them enters staging. |
| **Seed data strategy** | Robin + Claude | Anonymized production snapshot (one-time SQL dump + redaction) vs. synthetic fixtures. Decision can wait until first staging use. |
| **Monitoring / alerts for staging** | Deferred | Staging failures do not page. Staging logs should still be tail-able via `pm2 logs vodauction-*-staging`. |

---

## 7. What Not to Do

- **Do not provision staging "on spec"** — building it costs ops time every week for maintenance, even when unused. Build it when the first feature that actually needs it is underway. That feature will likely be the first ERP component (sevDesk/easybill or Sendcloud).
- **Do not share production credentials with staging.** Every external service must have its own sandbox account or test mode. Mixing them risks sending real emails, creating real shipping labels, or billing real customers during tests.
- **Do not point staging at the production database under any circumstances.** The whole point of staging is isolation.
- **Do not expose staging publicly.** Basic auth at the nginx layer is mandatory. Search engines must not index it.

---

## 8. Next Actions

1. **Robin:** pick database option (A / B / C).
2. **Robin:** confirm whether staging should be built now (pre-ERP) or deferred until first ERP feature begins.
3. If "build now": create DNS records and collect sandbox credentials. Then Claude provisions nginx + PM2 + env files.
4. If "defer": this document sits untouched until the first ERP feature is ready to leave local dev. No code or infra action required.

The feature-flag infrastructure (Phase 1 of this prep milestone) is fully functional *without* staging. Staging is only needed when a flag reaches stage 2 of its activation lifecycle (see `DEPLOYMENT_METHODOLOGY.md` §2).
