# CRM System — Stand 2026-05-04

**Single Source of Truth** für Schema, APIs, Frontend, Cron, Daten-Pipelines.
Wird bei jeder größeren CRM-Änderung aktualisiert.

**Vorgänger-Doks:**
- [`CRM_DATA_ARCHITECTURE_DECISIONS.md`](CRM_DATA_ARCHITECTURE_DECISIONS.md) — 6 abgezeichnete Decisions (1B/2C/3A/4B/5A/6B)
- [`CRM_FEATURE_GAP_ANALYSIS.md`](CRM_FEATURE_GAP_ANALYSIS.md) — Marktstandard-Vergleich
- [`CRM_P0_P1_IMPLEMENTATION_PLAN.md`](CRM_P0_P1_IMPLEMENTATION_PLAN.md) — Sprint-Roadmap
- [`CRM_DATA_GAPS_DIAGNOSIS_2026-05-04.md`](CRM_DATA_GAPS_DIAGNOSIS_2026-05-04.md) — db2013 + IMAP-Coverage
- [`CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md`](../optimizing/CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md) — Legacy-Pull-Konzept

**Session-Log:** [`docs/sessions/2026-05-04_crm_master_v1_buildout.md`](../sessions/2026-05-04_crm_master_v1_buildout.md)

---

## 1. Schema-Übersicht (`crm_*`-Domäne)

### 1.1 Master-Layer (kanonisch)

```
crm_master_contact          (14.450 Rows, 35+ Spalten)
├── id (uuid PK)
├── display_name, first_name, last_name, company, salutation, title
├── contact_type (person|business)
├── primary_email, primary_email_lower, primary_phone
├── primary_country_code, primary_postal_code, primary_city
├── lifetime_revenue, lifetime_revenue_decayed, total_transactions
├── tier (platinum|gold|silver|bronze|standard|dormant), tier_calculated_at
├── lifecycle_stage (lead|active|engaged|at_risk|dormant|churned|lost), lifecycle_changed_at
├── rfm_recency_score, rfm_frequency_score, rfm_monetary_score (1-5 each)
├── rfm_segment (10 Klaviyo-Buckets), rfm_calculated_at
├── health_score (0-100), health_calculated_at
├── acquisition_channel, acquisition_campaign, acquisition_date
├── preferred_language, avatar_url, birthday, notable_dates jsonb
├── tags TEXT[]
├── is_test, is_blocked, blocked_reason
├── medusa_customer_id (FK → customer)
├── manually_merged, manual_review_status
├── first_seen_at, last_seen_at
├── created_at, updated_at, deleted_at

crm_master_email/_address/_phone (1:N)
crm_master_source_link (1:N — Audit über Origins)
crm_master_note (User-Notes pro Master)
crm_master_audit_log (alle Aktionen am Master)
crm_master_task (Tasks/Reminders, multi-user-ready)
crm_master_communication_pref (per-channel opt-in/out)
crm_master_relationship (person↔company)
crm_master_merge_review (Confidence-Banding-Queue, Stage 3-4)

crm_email_candidate (Manual-Review-Queue für ambiguous IMAP-Matches)
crm_saved_filter (Smart-Lists / Saved Filters mit System-Defaults)
```

### 1.2 Staging-Layer (Roh-Daten aus 5 Quellen)

```
crm_staging_contact (22.341 Rows aus 5 Sources)
crm_staging_email/_address/_phone (1:N)
crm_staging_transaction (21.866) + crm_staging_transaction_item (66.460)
crm_imap_message (153.652 — 111.872 mit body_excerpt)

crm_pull_run (Pipeline-Run-Audit)
crm_master_resolver_run (Resolver-Run-Audit)
crm_layout_review_queue (mo_pdf-Layout-Drift-Cases)
crm_source_status (View über pull_runs)
crm_master_contact_360 (View — Master + counts)
```

### 1.3 Sources (5 aktive Quellen)

| Source | Pipeline | Rows | Last Pull |
|---|---|---:|---|
| `mo_pdf` | d1_mo_pdf | 10.575 | 2026-05-03 |
| `vod_records_db1` | e1_legacy_db | 6.176 | 2026-05-03 |
| `vod_records_db2013` | e1_legacy_db | 16.774 | 2026-05-03 |
| `vodtapes_members` | e1_legacy_db | 3.632 | 2026-05-03 |
| `imap_vod_records` | f1_imap | 126.331 | 2026-05-03 |
| `imap_vinyl_on_demand` | f1_imap | 27.038 | 2026-05-03 |

---

## 2. Daten-Snapshot (Stand 2026-05-04)

### 2.1 Tier-Verteilung (lifetime_revenue-basiert)

| Tier | Schwelle | Anzahl |
|---|---|---:|
| 💎 Platinum | ≥ €10.000 | 27 |
| ⭐ Gold | ≥ €2.000 | 419 |
| 🥈 Silver | ≥ €500 | 1.683 |
| 🥉 Bronze | ≥ €100 | 4.327 |
| Standard | > €0 | 3.167 |
| (kein Tier) | €0 / nie gekauft | 4.826 |

### 2.2 Lifecycle-Stages (Klaviyo-Standard)

| Stage | Anzahl |
|---|---:|
| churned (>365d) | 8.907 |
| lead (nie gekauft, registriert) | 4.570 |
| dormant (180-365d) | 644 |
| engaged (≥3 Käufe in 90d) | 136 |
| active (1-2 Käufe in 90d) | 127 |
| at_risk (90-180d) | 63 |
| lost (blocked / is_test) | 3 |

### 2.3 RFM-Segmente

| Segment | Anzahl | Rolle |
|---|---:|---|
| 💎 Champions | 1.847 | R+F+M alle hoch |
| ⚠️ At-Risk | 1.944 | hoch F+M, niedrig R |
| 👀 Needs Attention | 2.355 | mittlere R+F+M |
| 🌱 Potential Loyalists | 959 | hoch R, niedrig F, mittel M |
| 😴 Hibernating | 772 | alles niedrig |
| 💜 Loyal | 536 | hoch F, mittel-hoch M |
| 🆕 New | 415 | hoch R, F=1 |
| ⭐ Promising | 401 | mittel-hoch R |
| 🚨 Can't Lose | 395 | vorher Champions, jetzt sehr niedrig R |

### 2.4 Health-Score-Verteilung (40R + 30E + 20M + 10I)

| Bucket | Anzahl |
|---|---:|
| 80-100 (excellent) | 72 |
| 60-79 (good) | 343 |
| 40-59 (fair) | 1.585 |
| 20-39 (poor) | 7.648 |
| 0-19 (critical) | 4.802 |

### 2.5 Lifetime Revenue

**€5.27M** auf 21.733 mapped Transactions. Median €83, P95 €1.313, Top: Nube Srl €338k.

### 2.6 Email-Coverage

11.085 / 14.450 = **76.7%** Master mit primary_email.
- 244 enriched via Stage-4 header-only (initial run)
- 976 in Manual-Review-Queue (Stage-4 Body-Match)

### 2.7 IMAP-Coverage

153.652 mails indexiert · **111.872 mit body_excerpt** (73%) · 27% sind Mails ohne TEXT-Part (DSN, Auto-Replies, Calendar-Invites).

---

## 3. Backend-API-Inventar

Alle Endpoints unter `/admin/crm/`. Auth via Medusa-Admin-Session.

### 3.1 Contacts (Liste + Detail + Bulk)

| Method | Path | Zweck |
|---|---|---|
| GET | `/contacts` | Liste mit Filter/Search/Sort/Pagination, ?ids_only=true für Select-All |
| GET | `/contacts/:id` | Vollständige Detail-Page (12+ Sub-Resources) |
| PATCH | `/contacts/:id` | Master-Felder editieren (15+ Felder, Audit-Log) |
| POST | `/contacts/bulk` | 7 Bulk-Actions (tag_add/tag_remove/tier_set/lifecycle_set/is_test_set/block/unblock) |
| GET | `/contacts/export?format=csv` | CSV-Export mit BOM, max 50k rows |
| GET | `/contacts/:id/gdpr-export` | DSGVO Art. 15 — vollständiger PII-JSON-Export |
| POST | `/contacts/:id/anonymize` | DSGVO Art. 17 — confirm:'ANONYMIZE' Pflicht |

### 3.2 Multi-Source 1:N CRUD

| Resource | Endpoints |
|---|---|
| Emails | POST/PATCH/DELETE `/contacts/:id/emails[/:emailId]` (Set-Primary auto-syncs master_contact.primary_email) |
| Addresses | POST/PATCH/DELETE `/contacts/:id/addresses[/:addressId]` (Country-ISO-2-Picker im UI) |
| Phones | POST/PATCH/DELETE `/contacts/:id/phones[/:phoneId]` |
| Notes | POST/PATCH/DELETE `/contacts/:id/notes[/:noteId]` (pinned, soft-delete) |
| Tasks | GET/POST/PATCH/DELETE `/contacts/:id/tasks[/:taskId]` |
| CommPrefs | GET/POST `/contacts/:id/communication-prefs` (idempotent upsert) |
| Relationships | GET/POST/DELETE `/contacts/:id/relationships[/:relId]` |

### 3.3 Cross-Customer

| Method | Path | Zweck |
|---|---|---|
| GET | `/tasks` | "My Tasks" mit buckets overdue/today/week/month + counters |
| GET/POST | `/saved-filters` | Liste eigene + shared + System |
| PATCH/DELETE | `/saved-filters/:id` | System-Filter unveränderlich |
| GET | `/email-candidates` | Manual-Review-Queue (Stage 4 ambiguous matches) |
| PATCH | `/email-candidates/:id` | accept (mit set_primary-Toggle) / reject |
| GET | `/sources` | Pipeline-Health über alle 5 Quellen |

---

## 4. Frontend-Inventar

### 4.1 Routing

`/app/crm` (Medusa-Admin-Top-Level-Route) mit 4 Sub-Tabs:
- Overview — Brevo-Aggregate (alt, vorhanden vor v1)
- **Contacts** — Master-View (Hauptarbeitsbereich)
- Customers — Medusa-Auth-Verwaltung (alt)
- Sources — Pipeline-Health (Sprint S1)

### 4.2 Contacts-Tab UI-Flow

```
┌──────────────────────────────────────────────────────────┐
│ [📋 Saved Filter ▾] [Search…………] [Sort by ▾]            │
│ ▶ More filters (Year/Revenue/Country/Type) [3]            │
│ Pills: [All] [With email] [Webshop] [MO-PDF] [Test] ...   │
├──────────────────────────────────────────────────────────┤
│ 14.450 contacts · showing 1-50         [⭐ Save] [⬇ CSV] │
├──────────────────────────────────────────────────────────┤
│ ☐ NAME        EMAIL  LOC  REV  TX  RFM  LAST  SOURCES   │
│ ☐ Nube Srl…  PLATINUM  Milano …                          │
│ ...                                                       │
├──────────────────────────────────────────────────────────┤
│ ← Prev  Page 1 / 289  Next →                             │
└──────────────────────────────────────────────────────────┘
+ Floating Action-Bar bei ≥1 Selection (Shopify-Style)
+ Modal-Stack (Save Filter / Bulk Action / Detail Drawer)
```

### 4.3 ContactDetailDrawer (10 Tabs)

| Tab | Inhalt |
|---|---|
| Overview | Avatar + 8 Stat-Cards + RFM-Card + Profile-Card + Status |
| **Activity (default)** | Timeline mit Transactions/Bids/Orders/IMAP-Mails, expandable Line-Items |
| Tasks | Open + Done-Section mit Click-Checkbox |
| Notes | CRUD + Pin + Edit + Soft-Delete |
| Contact Info | Emails / Addresses / Phones mit Action-Buttons (⭐ ✎ ×) |
| Wishlist | (conditional: medusa_customer_id) saved_items aus auctions |
| Communication | 6 Channels mit Toggle-Pills + opted-in/out-Timestamps |
| Relationships | Person→Company + Company→People |
| Sources | Source-Links + raw evidence |
| Audit | Audit-Log letzte 100 Actions |

Plus: MasterEditModal mit 5 Sub-Sections (Name/Classification/Profile/Acquisition/Status & Tags) + DangerZone (GDPR Export + Anonymize).

### 4.4 UI/UX-Patterns übernommen

| Pattern | Quelle | Wo |
|---|---|---|
| RFM-Buckets mit Icons | Klaviyo | RFM-Badge in Liste + Drawer |
| Avatar-Initials-Color | Attio | Drawer-Header |
| Floating-Action-Bar bei Multi-Select | Shopify | Contacts-Tab |
| Saved-Filter-Dropdown ("Views ▾") | HubSpot | Contacts-Tab |
| Sortable Headers mit ↕ | alle | Tabellen-Headers |
| Sticky thead + fixed-height-Container | alle | Pagination immer sichtbar |
| Activity-Feed als Default-Tab | Klaviyo | Drawer |
| Lifecycle-Stage-Enum | Klaviyo | crm_master_contact.lifecycle_stage |
| 7-Stage-Lifecycle | Klaviyo | lead/active/engaged/at_risk/dormant/churned/lost |

---

## 5. Cron-Jobs

| Cron | Path | Cadence | Zweck |
|---|---|---|---|
| crm_task_reminders | `scripts/crm_task_reminders.py` | `*/5 * * * *` | Email-Reminder für fällige Tasks via Resend |

**Geplant aber noch nicht installiert:**
- crm_lifecycle_recalc — täglich 04:00 UTC, lifecycle + RFM + health_score recompute
- crm_brevo_sync — bi-direktional opted_out + tier-changes
- crm_anonymize_imap — IMAP-Body nach 90d anonymisieren (DSGVO)

---

## 6. Daten-Pipelines (separate Skripte)

| Skript | Zweck | Cadence |
|---|---|---|
| `legacy_db_pull.py` | vodtapes_members + db1 + db2013 → staging | manuell, daily geplant |
| `mo_pdf_pipeline.py` | 10.575+ MO-PDFs → staging_transaction | manuell |
| `imap_indexer.py` | IMAP-Headers + Body-Excerpt → crm_imap_message | manuell |
| `imap_body_backfill.py` | Body-Backfill für existing rows (Bug-Fix) | one-shot, ~30 Min |
| `master_resolver.py` | Phase 2 Stages 1-2 (email + adress-hash match) | done, ad-hoc |
| `imap_pdf_inventory.py` | Diagnose-Tool für PDF-Anhänge | ad-hoc |
| `_db_inventory.py` + `_db_schema.py` | Legacy-MySQL-Inventur | ad-hoc Diagnose |

---

## 7. Open Items / Backlog

### 7.1 Kurzfristig (nächste Session)

- **Manual-Review-Page für 976 Email-Candidates** — Backend ready, UI fehlt
- **Pre-2019-MO-PDFs** ins `Monkey Office/Rechnungen/<Jahr>/` (Robin's Backup-Archiv)
- **Frank-Einarbeitung** auf das CRM-System

### 7.2 Mittelfristig (P1+)

- Tier-Engine v2 mit Decay-Faktor
- crm_lifecycle_recalc-Cron (täglich)
- Newsletter-Engagement-Pull aus db2013
- Login-History-Pull aus db2013
- Frontend Custom-Fields (User-defined)
- Two-way Email-Sync (Send aus CRM)
- Email-Conversation-Threading
- Cohort-Analysis-Dashboard

### 7.3 Langfristig (P2+)

- Workflow-Automation (if-then-Builder)
- Multi-User mit Permission-Roles
- Mobile-App
- Webhooks aus CRM
- Real-time Collaboration

### 7.4 Bewusst nicht gebaut

- **IMAP-PDF-Attachment-Parser** (Inventur zeigte: kaum Customer-Mehrwert)
- **SaaS-CRM-Integration** (Decision 2C: Self-Build, kein HubSpot/Salesforce)
- **Workflow-Trigger** in P0+P1 (kommt bei Bedarf in P2)

---

## 8. Dateipfade

### 8.1 Backend

```
backend/src/api/admin/crm/
├── contacts/
│   ├── route.ts                          (GET Liste mit Filter/Search/Sort)
│   ├── bulk/route.ts                     (POST Bulk-Actions)
│   ├── export/route.ts                   (GET CSV)
│   └── [id]/
│       ├── route.ts                      (GET Detail + PATCH Master)
│       ├── emails/{route.ts,[emailId]/route.ts}
│       ├── addresses/{route.ts,[addressId]/route.ts}
│       ├── phones/{route.ts,[phoneId]/route.ts}
│       ├── notes/{route.ts,[noteId]/route.ts}
│       ├── tasks/{route.ts,[taskId]/route.ts}
│       ├── communication-prefs/route.ts
│       ├── relationships/{route.ts,[relId]/route.ts}
│       ├── gdpr-export/route.ts
│       └── anonymize/route.ts
├── tasks/route.ts                        (Cross-Customer)
├── saved-filters/{route.ts,[id]/route.ts}
├── email-candidates/{route.ts,[id]/route.ts}
└── sources/route.ts

backend/src/lib/
└── crm-master-edit.ts                    (sync/clearPrimary helpers)
```

### 8.2 Frontend

```
backend/src/admin/
├── routes/crm/page.tsx                   (4-Tab-Layout, PageShell maxWidth=1440)
└── components/crm/
    ├── contacts-tab.tsx                  (Liste + Filter + Bulk + SavedFilter-Dropdown)
    ├── contact-detail-drawer.tsx         (10-Tab-Drawer, ~2000 LoC)
    └── sources-tab.tsx                   (Pipeline-Health)
```

### 8.3 Scripts

```
scripts/
├── legacy_db_pull.py                     (Pipeline E1)
├── mo_pdf_pipeline.py + mo_pdf_lib/      (Pipeline D1)
├── imap_indexer.py                       (Pipeline F1)
├── imap_body_backfill.py                 (Bug-Fix, MIME-decode)
├── imap_pdf_inventory.py                 (Diagnose-Tool)
├── crm_staging_lib.py                    (Pull-Run-Lifecycle)
├── crm_task_reminders.py                 (Cron alle 5 Min)
├── master_resolver.py                    (Phase 2 Backup)
└── _db_inventory.py + _db_schema.py      (Diagnose)
```

### 8.4 Schema-Migrations

```
backend/scripts/migrations/
├── 2026-05-03_crm_staging_schema.sql              (+ rollback)
├── 2026-05-04_crm_master_note_audit_log.sql       (+ rollback)
└── (4 weitere via Supabase MCP inline applied):
    ├── crm_master_p0_foundation_2026_05_04
    ├── crm_master_task_2026_05_04
    ├── crm_saved_filter_2026_05_04
    └── crm_master_communication_relationships_2026_05_04
```

---

## 9. Performance + Indexes

Alle kritischen Indexes sind angelegt:

- `idx_crm_master_lifecycle` (WHERE deleted_at IS NULL)
- `idx_crm_master_rfm_segment` (WHERE deleted_at IS NULL)
- `idx_crm_master_health` (DESC, WHERE health_score IS NOT NULL)
- `idx_crm_master_acq_channel` (WHERE acquisition_channel IS NOT NULL)
- `idx_crm_master_task_master` (master_id, status, due_at, WHERE deleted_at IS NULL)
- `idx_crm_master_task_assigned` (assigned_to, status, due_at, WHERE status='open')
- `idx_crm_master_task_reminder` (reminder_at, partial-index für cron)
- `idx_crm_saved_filter_creator` + `idx_crm_saved_filter_shared`
- `idx_crm_email_candidate_status` (status, confidence DESC)
- `idx_crm_email_candidate_master`
- `idx_crm_relationship_person` + `idx_crm_relationship_company`
- `idx_crm_comm_pref_master`

GIN-Index auf `crm_master_contact.tags` (text[]).

---

## 10. Doku-Referenzen für nächste Session

**Bei jeder größeren CRM-Änderung diese Doku aktualisieren:**
1. Schema-Tabelle in §1 wenn neue Spalten/Tabellen
2. Daten-Snapshot §2 wenn Backfill / Re-Run
3. API-Inventar §3 bei neuen Endpoints
4. Frontend-Inventar §4 bei neuen Tabs/UI-Patterns
5. Cron-Jobs §5 bei neuen Crons
6. Open Items §7 verschieben

**Plus:** CHANGELOG-Entry + Memory `project_crm_master_v1.md` aktualisieren.
