# Deployment Methodology — Deploy Early, Activate When Ready

**Status:** Binding for all non-trivial feature work on VOD Auctions.
**Last Updated:** 2026-04-05
**Related:** `docs/optimizing/ERP_WARENWIRTSCHAFT_KONZEPT.md` §8–9 (origin of this methodology)

---

## 1. Core Principle

**Deployment ≠ Activation.**

A feature is considered *deployed* when its code lives on production — tables exist, API endpoints respond, admin UI is reachable. A feature is considered *activated* when it is allowed to affect live business processes. These two events are deliberately decoupled and can be days, weeks, or months apart.

This matters because the live platform must never be destabilized by new feature work, and because non-trivial features (invoicing, inventory, tax handling, marketplace) require external validation (accountants, lawyers, payment providers) before they are safe to switch on.

**A deployed-but-inactive feature must be a no-op for live business processes.** No exceptions.

---

## 2. Feature Flags as the Activation Mechanism

All non-trivial new capabilities are shipped behind a feature flag defined in `backend/src/lib/feature-flags.ts`. Flag state lives in `site_config.features` (JSONB, single row). Flags default to `false`.

**Authoring rules:**
- New flag = add an entry to `FEATURES` in `feature-flags.ts`. No DB migration required — all flags live in the one JSONB column.
- Read flags via `getFeatureFlag(pg, "MY_FLAG")`. Do not read `site_config.features` directly elsewhere.
- Write flags via the admin UI (`/app/config` → Feature Flags tab) or the `POST /admin/platform-flags` endpoint. Do not UPDATE the column directly. (Note: the HTTP path is `platform-flags`, not `feature-flags`, because Medusa ships a native unauthenticated `/admin/feature-flags` route that would otherwise shadow ours.)
- Every flag toggle writes an audit entry to `config_audit_log` with `config_key = "feature_flag:<KEY>"`. These entries appear in the existing `/app/config` → Change History tab alongside other config changes. Update + audit run in a single DB transaction, so a partial write is not possible.
- Flag names are `SCREAMING_SNAKE_CASE` and prefixed by domain: `ERP_*`, `PLATFORM_*`, `EXPERIMENTAL_*`.

**Usage rules inside feature code:**
- Every code path that *could* affect live business processes must check its flag first.
- When `flag === false`: fall through to existing behavior, return empty result, or 404. Never silently partial-apply a feature.
- When `flag === true`: run the new path.
- **Never hybrid.** For a given process (e.g. shipping a single order), either the old path runs or the new path runs — never both, never partial. Mixed states at the record level are permitted (old orders unaware, new orders aware) but never within one transaction.

**Activation lifecycle (per flag):**

| Stage | Meaning | Who |
|-------|---------|-----|
| 1. Deployed | Code on production, flag `false`. Proven harmless. | Developer |
| 2. Staging-tested | Flag `true` on staging only. Internal inspection, QA, external validation. | Developer + domain expert |
| 3. Production-active | Flag `true` on production. Monitored rollout. | Robin (+ domain approval where required) |
| 4. Stabilized | Fallback code removed, flag retired from the codebase. | Developer (≥ 3 months after stage 3, only when fallback is no longer useful) |

**Retiring a flag** is a deliberate code-cleanup step, not an accident. Until the fallback path is deleted and the flag registry entry removed, the feature is *not* considered "done."

---

## 3. Migration Discipline

All schema changes against live tables must be **additive and backward-compatible.**

**Allowed on live tables:**
- `CREATE TABLE IF NOT EXISTS …`
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS … NULL` (or with a safe default)
- `CREATE INDEX CONCURRENTLY IF NOT EXISTS …`
- Adding new rows / seed data via idempotent scripts

**Forbidden on live tables (without an explicit, documented migration plan and downtime window):**
- `DROP COLUMN`
- `RENAME COLUMN` / `RENAME TABLE`
- `ALTER COLUMN … TYPE …` (type changes)
- `ALTER COLUMN … SET NOT NULL` on a previously-nullable column with existing NULL rows
- Any `DELETE` / `UPDATE` that touches more than a handful of rows inline in the migration

If one of the forbidden operations is genuinely required, it is a separate project with its own plan, staging rehearsal, and rollback script — never a side-effect of a feature migration.

**Migration location:**
- Medusa ORM entities (auction module, resend module) → Medusa migration files under `backend/src/modules/*/migrations/`, run via `npx medusa db:migrate`.
- Non-ORM tables (`site_config`, `config_audit_log`, `customer_stats`, CRM tables, CMS tables) → raw SQL under `backend/scripts/migrations/YYYY-MM-DD_<description>.sql`, run manually via Supabase SQL Editor or `psql`. File must be idempotent.
- Data migrations (Release → inventory_item, CRM imports, etc.) → separate Python or TS script under `scripts/` or `backend/scripts/`, **never** bundled into a schema migration. Idempotent, re-runnable, with a `--dry-run` flag.

**Rollback plan:** every migration must include a comment at the top describing exactly how to roll it back. If rollback is not possible (e.g. data loss), say so explicitly.

---

## 4. Separation of Infrastructure Prep vs. Domain Implementation

A critical sub-rule of "deploy early": **build the activation infrastructure before you build the domain logic.** Do not speculatively pre-build domain tables, APIs, or UI for a feature that has not been designed end-to-end.

| Category | Example | When to build |
|----------|---------|---------------|
| **Infrastructure** | Feature-flag system, staging environment, migration policy, audit log, methodology docs | As soon as the *next* multi-week feature is on the horizon |
| **Domain** | `inventory_item` schema, `tax_margin_record` logic, Sendcloud client, DATEV export | Only when the domain design is finalized and validated with stakeholders |

Building infrastructure early is cheap and keeps future work low-risk. Building domain logic early is expensive because designs change. This document and the `FEATURES` registry exist so that when ERP domain work starts, the activation plumbing is already battle-tested.

---

## 5. API Namespacing for Future ERP

New backend capabilities that belong to a clearly-scoped domain live under their own URL prefix. Existing endpoints are never broken to accommodate new domains.

**Reserved prefixes:**
- `/admin/erp/*` — future ERP routes (invoicing, inventory, commission, tax, DATEV export). **Do not use until an actual ERP domain feature is being implemented.** This section exists so that nothing else accidentally occupies the namespace.
- `/admin/*` (existing) — auction, CRM, media, site config, etc. Stays stable.
- `/store/*` (existing) — public storefront API. Stays stable.

If a new ERP feature needs to extend an existing endpoint (e.g. `/admin/transactions` returning invoice IDs), do it via an opt-in query parameter (`?include=erp_data`) guarded by the feature flag. Do not change the default response shape.

---

## 6. Staging Before Production (For Larger Feature Work)

Single-file bug fixes and small additive changes continue to deploy directly from `main` to production. For larger features — defined here as anything that:
- touches multiple tables, or
- depends on external services (Sendcloud, sevDesk, Stripe Connect, DATEV), or
- requires sign-off from an accountant / lawyer / external stakeholder, or
- cannot be fully validated with the existing test accounts —

a staging environment is required before the flag can be flipped on production. Staging details: see `docs/architecture/STAGING_ENVIRONMENT.md` (setup + blockers).

**Staging ≠ production clone.** Staging is the environment where a flag can be `true` while production keeps it `false`. It exists so that external reviewers can inspect a working implementation without affecting customers.

---

## 7. Governance Checklist

Before merging a feature branch that introduces new behavior:

- [ ] Does the change affect live business processes? If yes → feature flag required.
- [ ] Is the flag registered in `FEATURES` and defaulting to `false`?
- [ ] Does every new code path check its flag?
- [ ] Does the fallback path still work when the flag is `false`?
- [ ] Are all migrations additive? (No DROP/RENAME/TYPE changes on live tables)
- [ ] Do migrations include an idempotency guard (`IF NOT EXISTS`)?
- [ ] Is there a rollback comment at the top of each migration?
- [ ] Does the feature need external validation (accountant, lawyer, payment provider)? If yes → staging required, flag stays off on production until sign-off.
- [ ] Is the flag listed in the activation matrix (if it's part of a larger rollout like ERP)?

---

## 8. Why This Exists

VOD Auctions is operated by a single developer running live commerce. Downtime, data corruption, and "oops" migrations are not recoverable in any sensible timeframe. The methodology above deliberately sacrifices some short-term velocity (extra flags, extra routing discipline, extra doc work) in exchange for:

- **No-drama deployments:** new code lands in production regularly, but its effect is zero until deliberately switched on.
- **External validation without blocked shipping:** an accountant can inspect a deployed invoicing feature before it goes live, without needing a special branch.
- **Safe rollback:** flipping a flag back to `false` is a 30-second rollback that never touches data.
- **Parallel work streams:** multiple features can be mid-development on `main` without stepping on each other, because each one is gated independently.

Non-adherence to this document on anything labeled a "larger feature" is treated as a bug, not a shortcut.

---

## 9. Release Tagging

**Git tags are the release record.** Every meaningful production snapshot gets a tag. Tags are the single source of truth for "what was live when."

### Format

```
v{MAJOR}.{MINOR}.{PATCH}[-rc.N]
```

- **Pre-production:** `-rc.N` suffix (Release Candidate). Informal — no formal QA gate required.
- **Minor release** `v1.x.0`: a cohesive group of features activated together (flag flips + infrastructure).
- **Patch release** `v1.0.x`: critical bugfixes between planned minor releases.
- **Major release** `v2.0.0`: architecture change, platform shift, or breaking change.

### When to tag

Tag **after** deploy + smoke-test on production — never before. A tag certifies the system as observed on production, not the intention.

Not every commit gets a tag. A tag is warranted when:
- A significant batch of work has landed (multiple related features, end of a development session)
- A flag was flipped on production (activation = state change worth recording)
- A hotfix resolved a production incident
- A platform mode transition occurred (`beta_test` → `pre_launch` → `live`)

### Workflow

```bash
# 1. Ensure HEAD is on main and pushed
git push origin main

# 2. Create annotated tag (NOT lightweight — annotated includes date + author)
git tag -a v1.2.0 -m "Release v1.2.0: ERP Invoicing + Sendcloud"

# 3. Push tag to GitHub
git push origin v1.2.0

# 4. Update the Release Index in docs/architecture/CHANGELOG.md
#    — add a row to the table (version, date, platform mode, active flags, milestone)
#    — update the Flag Activation Roadmap table if any flags were flipped
```

### What to record in the Release Index

Each tag row in `CHANGELOG.md` → Release Index must capture:
- The platform mode at time of tag (`beta_test` / `pre_launch` / `live`)
- Which feature flags are **active on production** (flag=true) — not which ones are deployed
- A one-line milestone description linking to Linear issues where relevant

The Release Index is the bridge between the flat commit history and the feature flag state. It answers the question "what was the system capable of at release vX.Y.Z" — which git log alone cannot answer.

### Relationship to feature flags

A "release" in this project is not primarily defined by a code snapshot — it is defined by **which flags are active**. The same code can represent two different releases if the flags differ. This is intentional: it means hotfixes and experimental work can land on `main` without constituting a "release" until flags are deliberately flipped.

The tagging workflow therefore runs in two modes:
- **Infrastructure release:** tag when a batch of features lands behind flags. Flags remain off. Example: `v1.0.0-rc6`.
- **Activation release:** tag when one or more flags are flipped on production. This is the "release" from a user-visible perspective. Example: `v1.1.0` with `ERP_INVOICING=true`.
