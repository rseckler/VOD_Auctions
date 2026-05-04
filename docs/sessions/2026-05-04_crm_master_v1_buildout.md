# Session 2026-05-04 — CRM Master v1 Full Build-out

**Dauer:** Eine Session (~10h, Auto-Mode aktiv)
**Owner:** Robin Seckler + Claude Code (Opus 4.7)
**Vorgänger-Session:** [`2026-05-03_crm_phase1_data_foundation.md`](2026-05-03_crm_phase1_data_foundation.md)
**Ergebnis:** Standard-CRM-Niveau live für 14.450 Master-Contacts.

---

## 1. Outcome

Aus der Daten-Foundation von 2026-05-03 (14.449 Master, kein UI) wurde ein vollwertiges **B2C-CRM** mit 10-Tab-Drawer, Bulk-Actions, Smart-Lists, Tasks, GDPR und Email-Candidate-Review. **24 Tasks abgehakt.**

Alle Sprints S1 + S6.5 + S6.6 + S6.7 + S6.8 + S7.1 + S7.2 + S7.3 inkl. Edit-Funktionen + UX-Anpassungen (Sidebar→Dropdown, Spalten-Optimierung, sortable Headers, sticky thead, fixed-height Container).

---

## 2. Was wurde gebaut

### 2.1 Architektur-Decisions abgezeichnet

6 Decisions in [`CRM_DATA_ARCHITECTURE_DECISIONS.md`](../architecture/CRM_DATA_ARCHITECTURE_DECISIONS.md):
- **1B** eigenes `crm_*`-Schema neben Medusa
- **2C** Self-Build im Medusa-Admin + Brevo bleibt
- **3A** Tab-Reihenfolge angelehnt an HubSpot/Salesforce/Klaviyo
- **4B** UI parallel ab Tag 1
- **5A** Notes/Audit/Tags ab S1 (Abweichung von Empfehlung 5B)
- **6B** Confidence-Banding mit Manual-Queue

### 2.2 Sprint S1 Foundation

**Schema:** `crm_master_note`, `crm_master_audit_log`. Lifetime-Revenue für 9.876 Master aggregiert (€5.27M auf 21.733 Txns). 3 Test-Accounts (`is_test=true`), Frank's Owner-Account mit `internal_owner`-Tag.

### 2.3 Sprint S6.5 P0 Foundation (Lifecycle + RFM + Health-Score + strukturierte Namen)

**Schema-Erweiterung `crm_master_contact`:** first_name, last_name, company, salutation, title, lifecycle_stage (Klaviyo-Enum), lifecycle_changed_at, rfm_recency_score/_frequency_score/_monetary_score (1-5 each), rfm_segment (10 Klaviyo-Buckets), rfm_calculated_at, health_score (0-100), health_calculated_at, acquisition_channel, acquisition_campaign, acquisition_date, preferred_language, avatar_url, birthday, notable_dates jsonb.

**Backfill-Verteilung:**
- Lifecycle: 8.907 churned · 4.570 lead · 644 dormant · 136 engaged · 127 active · 63 at_risk · 3 lost
- RFM-Segmente: 1.847 Champions 💎 · 1.944 At-Risk ⚠️ · 2.355 Needs Attention 👀 · 959 Potential Loyalists 🌱 · 772 Hibernating · 536 Loyal · 415 New · 401 Promising · 395 Can't Lose 🚨
- Health-Score: 72 excellent · 343 good · 1.585 fair · 7.648 poor · 4.802 critical
- Acquisition_channel aus erstem source_link für alle Master

**Backend `PATCH /admin/crm/contacts/:id`** erweitert um 11 neue Felder mit per-Field-Diff im Audit-Log (semantic actions: master_updated/tier_set/lifecycle_stage_changed/block/unblock/is_test_(un)set/tag_added/tag_removed).

**Frontend Drawer-Header:**
- Avatar-Component (Initials-Circle mit deterministic Color, oder URL)
- Lifecycle-Badge (farbig nach Klaviyo)
- RFM-Segment-Badge (Icon + Label, 10 Buckets)
- Stats-Grid: AOV (avg order value) + Health-Score (mit Farbgradient)
- Profile-Card im Overview-Tab
- RfmCard mit visualisierten R/F/M-Bars
- MasterEditModal mit 5 Sub-Sections (Name/Classification/Profile/Acquisition/Status & Tags)

### 2.4 Sprint S6.6 Tasks + Reminders

**Schema `crm_master_task`:** title, description, due_at, status (open/done/cancelled), priority (low/normal/high/urgent), reminder_at, reminder_sent_at, reminder_channel (email/push/none — Push als P2-Stub), assigned_to (multi-user-ready), created_by, completed_at/_by.

**Backend:** GET/POST/PATCH/DELETE `/admin/crm/contacts/:id/tasks[/:taskId]` + Cross-Customer `/admin/crm/tasks` (Buckets: overdue/today/week/month, counters).

**Reminder-Cron:** `scripts/crm_task_reminders.py` (alle 5 Min via crontab, sendet Resend-Email mit Deeplink).

**Frontend:** Tasks-Tab im Drawer mit Open-List + collapsible Done-Section. TaskCard mit Click-Checkbox, Priority-Icons, Overdue-Highlight. TaskEditModal.

### 2.5 Sprint S6.7 Bulk-Actions + Smart-Lists / Saved Filters

**Schema `crm_saved_filter`:** name, query_json, icon, shared, is_pinned, created_by. **10 System-Filter seeded:** 💎 Champions / 🚨 Can't Lose Them / ⚠️ At Risk / 🆕 New This Month / 🌱 Potential Loyalists / 💜 Loyal / Platinum tier / Webshop only / MO-PDF only / Test accounts.

**Backend:**
- POST `/admin/crm/contacts/bulk` — 7 Actions: tag_add/tag_remove/tier_set/lifecycle_set/is_test_set/block/unblock. Audit-Log pro affected Master.
- GET/POST/PATCH/DELETE `/admin/crm/saved-filters[/:id]`
- GET `/admin/crm/contacts?ids_only=true` für "Select all matching" bis 10k

**Frontend:**
- Multi-Select-Checkbox-Column als erste Spalte
- Floating-Action-Bar bei ≥1 Selection mit 7 Action-Buttons
- BulkActionModal mit Action-spezifischen Inputs + Confirm-Modal für Block
- Saved-Filter-Dropdown (HubSpot/Shopify-Pattern, Sidebar war zu breit)
- "+ Save current as filter" CTA

### 2.6 Sprint S6.8 CSV-Export + GDPR Right-to-Access + Anonymize

**Backend:**
- GET `/admin/crm/contacts/export?<filter>&format=csv` — CSV-Stream mit BOM für Excel, max 50k rows, alle Filter werden berücksichtigt
- GET `/admin/crm/contacts/:id/gdpr-export` — vollständiger PII-Datenexport als JSON
- POST `/admin/crm/contacts/:id/anonymize` — DSGVO Art. 17, PII-Strip + soft-delete + audit_log

**Frontend:**
- "⬇ Export CSV"-Button im Filter-Bar
- DangerZone-Section im MasterEditModal mit Export-JSON + Anonymize (Confirm-Type "ANONYMIZE")

### 2.7 Sprint S7.1 Wishlist + Bid-Profile + Acquisition

**Backend:** Detail-Endpoint `/admin/crm/contacts/:id` returnt `saved_items` via `medusa_customer_id` (saved_item-JOIN auf Release/auction_block).

**Frontend:** Wishlist-Tab im Drawer (conditional bei medusa_customer_id linked).

### 2.8 Sprint S7.2 Communication-Preferences

**Schema `crm_master_communication_pref`:** master_id, channel, opted_in, opted_in_at, opted_out_at, source. 6 Channels: email_marketing / email_transactional / sms / phone / postal / push.

**Backend:** GET + POST (idempotent upsert) `/admin/crm/contacts/:id/communication-prefs`. Audit-Log: `comm_pref_opt_in/out`.

**Frontend:** Communication-Tab mit Toggle-Pills pro Channel + opted-in/out-Timestamps. Defaults: email_marketing/transactional + postal opt-in, sms/phone/push opt-out.

### 2.9 Sprint S7.3 Person ↔ Company-Relationships

**Schema `crm_master_relationship`:** person_master_id, company_master_id, role, is_primary, started_at, ended_at, notes.

**Backend:** GET (as_person + as_company) + POST + DELETE `/admin/crm/contacts/:id/relationships[/:relId]`.

**Frontend:** Relationships-Tab mit "Works at / Linked to" + "People at this company" Sections.

### 2.10 Erweiterte Filter (Year/Revenue/Country/Type)

**Backend `/admin/crm/contacts`** + Export-Endpoint erweitert um:
- `acquired_year` (number) — `EXTRACT(YEAR FROM acquisition_date)` mit Fallback first_seen_at
- `revenue_min` / `revenue_max` (numeric)
- `country_code` (ISO-2)
- `contact_type` (person/business)

**Frontend:** AdvancedFilters-Component als expandable "+ More filters" mit 5 Inputs + Counter-Badge.

### 2.11 Volltext-Suche erweitert

Statt nur name+email jetzt 11+ Felder: display_name, first_name, last_name, company, primary_email, primary_phone, primary_city, primary_postal_code, primary_country_code, ALLE multi-source crm_master_email + crm_master_phone + crm_master_address.city/company/postal_code, tags-Array.

Placeholder: "Search name, email, phone, company, city, tag…"

### 2.12 UI/UX-Optimierungen (Robin-Feedback iterativ)

- **Sidebar weg → Dropdown-Button** (HubSpot/Shopify "Views"-Pattern)
- **PageShell maxWidth** 960 → 1440 für CRM-Page (gegen pageMaxWidth-clipping)
- **Sortable Headers** auf 7 Spalten (Name/Email/Location/Revenue/Txns/RFM/LastSeen)
- **Tabellen-Höhe** `max-height: calc(100vh - 380px)` damit Pagination immer sichtbar, sticky thead, vertikales Scrolling im Container
- **Spalten-Verschlankung:** Tags-Spalte raus (Status-Dots im Name-Cell), Compact-Date, Location ohne PLZ, Email mit ellipsis
- **PageShell maxWidth=1440** für CRM-Page

### 2.13 IMAP-Body-Backfill

**Bug:** Original-Indexer parste BODY[TEXT]-Tuple nicht in `parts["body"]` → 0% body_excerpt-Coverage bei 153k Mails.

**Fix:** Separater FETCH nur für TEXT (eindeutiger Pattern), 32kb-Window, MIME-Decode mit Mock-Multipart-Header voranstellen, walk parts, decode quoted-printable + base64, fallback HTML→strip-tags.

**Result:** 111.872 von 153.652 Mails mit body_excerpt = **73% Coverage**. Restliche 27% sind Mails ohne TEXT-Part oder leere DSN.

### 2.14 Stage-4 Body-Match Re-Anreicherung

Mit den jetzt vorhandenen Bodies: Token-Set-Index optimiert (4.372 master-tokens × 394k IMAP-token-hits → 2.539 match-pairs aggregiert).

**Apply (konservativ):** Alle 976 Candidates in `crm_email_candidate` für Manual-Review:
- 37 high (≥3 hits, ≥66% conf, 1:1)
- 656 mid (≥2 hits, ≥50% conf, 1:1)
- 283 shared (Email beansprucht von 2+ Master)

Kein Direct-Apply — Robin reviewt via API `/admin/crm/email-candidates`.

### 2.15 IMAP-PDF-Attachment-Parser → DOWNGRADE

**Inventory** zeigte: IMAP-PDFs sind primär CD-Artwork (Sent), Tickets/DHL-Versandlabels/Lieferanten-Rechnungen (INBOX). Nur ~0.3% Customer-Rechnungen. **Implementation lohnt sich nicht.**

`scripts/imap_pdf_inventory.py` bleibt als Diagnose-Tool. **Empfehlung:** Pre-2019-MO-PDFs aus Robin's Backup-Archiv ins `Monkey Office/Rechnungen/<Jahr>/` kopieren — saubere Datenquelle, automatisch via existing `mo_pdf_pipeline.py` importiert.

### 2.16 Bug-Fixes diverse

- **tasks/transactions destructuring** vertauscht in Promise.all → Render-Error gefixt
- **defensive `(data.tasks || []).filter()`** überall
- **Country-Picker-Dropdown** statt Freitext (mit Search + Flag, 249 ISO-3166-1)
- **display_name="Herr"-Bug** für 86 Master gefixt (raw_customer_block Line-2-Extraktion)
- **41 unmapped Transactions** auf "(Anonymous Legacy Customer)"-Bucket gemerged
- **Edit-Funktionen im Drawer** (Master + Email/Address/Phone CRUD-Modals)
- **Tab-Reihenfolge nach Marktstandard** (Activity = Default, nicht Overview)

---

## 3. Daten-Snapshot (Stand Session-Ende)

| Tabelle | Rows | Anmerkung |
|---|---:|---|
| crm_master_contact | 14.450 | aktiv (1 Anonymous-Bucket) |
| crm_master_email | 11.085 | 76.7% Coverage |
| crm_master_address | 15.585 | aus 5 Quellen |
| crm_master_phone | 6.923 | normalisiert wo parsbar |
| crm_master_source_link | 22.346 | inkl. 5 Anonymous-Bucket |
| crm_master_note | 0 | Frank füllt im Betrieb |
| crm_master_audit_log | ~14.500+ | wird mit jeder Aktion ergänzt |
| crm_master_task | 0 | Frank legt im Betrieb an |
| crm_master_communication_pref | 0 | wird per Toggle gefüllt |
| crm_master_relationship | 0 | wird via Drawer angelegt |
| crm_email_candidate | 976 | Manual-Review-Queue (37 high / 656 mid / 283 shared) |
| crm_saved_filter | 10 | System-Filter seeded |
| crm_imap_message | 153.652 | 111.872 mit body_excerpt |
| crm_master_resolver_run | 8 | Phase-1 + Phase-2 Stages |

**Tier-Verteilung:** 27 Platinum / 419 Gold / 1.683 Silver / 4.327 Bronze / 3.167 Standard / 4.826 ohne Tier

**Lifecycle-Verteilung:** 8.907 churned · 4.570 lead · 644 dormant · 136 engaged · 127 active · 63 at_risk · 3 lost

**Lifetime Revenue:** €5.27M auf 21.733 mapped Transactions

---

## 4. Schmerzpunkte / Lessons Learned

- **Bottom-up vs. Top-down:** Initiale Build-Phase war pragmatisch bottom-up (vom existierenden Schema), erst nach Robin's Hinweis "frei entwickelt ohne Marktstandards" wurde systematische Analyse + Plan nachgeholt. Resultat: `CRM_FEATURE_GAP_ANALYSIS.md` + `CRM_P0_P1_IMPLEMENTATION_PLAN.md`. **Lesson:** Bei größeren Features Top-down-Plan vor Code.
- **UI-Dimensions iterativ:** Sidebar 220→180→Dropdown, Min-Width 1180→880, PageShell 960→1440. Jeder Wechsel hatte Robin-Feedback dazwischen. **Lesson:** Anchored-Container + flexible Inhalte besser als fixed widths.
- **Tab-Reihenfolge:** Initial bottom-up (Overview/Contact/Activity/...), erst nach "an Marktführer anpassen" → Klaviyo-Pattern (Activity = Default). **Lesson:** Default-Tab ist die User-Annahme von "was ist wichtig".
- **IMAP-Body-Bug** war 1 Jahr im imap_indexer.py unentdeckt — **0% body_excerpt-Coverage** für 153k Mails. Lesson: Smoke-Test nach jedem Indexer-Run zumindest Sample-Row anschauen.
- **IMAP-PDF-Attachment-Hoffnung:** Robin's intuitive Annahme war Customer-Rechnungen-Mining via IMAP. Inventory zeigte: 0.3% Customer-Rechnungen, 95%+ Artwork/Tickets/Lieferanten. **Lesson:** Vor Implementation immer 100-Sample-Inventory.
- **Promise.all-Destructuring-Vertauscher** war eine 30-Min-Suche. Render-Error sagte `n.tasks||[].filter is not function` — heißt n.tasks ist truthy non-Array. Bug: Reihenfolge im Destructure passt nicht zur Promise.all-Reihenfolge. **Lesson:** Bei Promise.all mit mehr als 5 Promises: explizites Array `[a, b, c] = await Promise.all([promiseA, promiseB, promiseC])` mit identischer Reihenfolge **doppelt prüfen**.

---

## 5. Architektur-Stand

### Backend-Endpoints (35+)

**Contacts:**
- GET /admin/crm/contacts (mit Filter/Search/Sort/Pagination/idsOnly)
- GET /admin/crm/contacts/:id (vollständige Detail-Page)
- PATCH /admin/crm/contacts/:id (alle Master-Felder)
- POST /admin/crm/contacts/bulk (7 Actions, max 5000 IDs)
- GET /admin/crm/contacts/export (CSV)

**Multi-Source CRUD:**
- GET/POST/PATCH/DELETE /admin/crm/contacts/:id/emails[/:emailId]
- GET/POST/PATCH/DELETE /admin/crm/contacts/:id/addresses[/:addressId]
- GET/POST/PATCH/DELETE /admin/crm/contacts/:id/phones[/:phoneId]
- POST/PATCH/DELETE /admin/crm/contacts/:id/notes[/:noteId]
- POST/PATCH/DELETE /admin/crm/contacts/:id/tasks[/:taskId]
- POST /admin/crm/contacts/:id/communication-prefs (idempotent upsert)
- GET/POST/DELETE /admin/crm/contacts/:id/relationships[/:relId]

**Cross-Customer:**
- GET /admin/crm/tasks (My Tasks, buckets)
- GET/POST/PATCH/DELETE /admin/crm/saved-filters[/:id]
- GET /admin/crm/email-candidates (Manual-Review-Queue)
- PATCH /admin/crm/email-candidates/:id (accept/reject)

**GDPR:**
- GET /admin/crm/contacts/:id/gdpr-export
- POST /admin/crm/contacts/:id/anonymize (confirm:'ANONYMIZE')

**Sources:**
- GET /admin/crm/sources (Pipeline-Health)

### Frontend-Routes

`/app/crm` mit 4 Top-Level-Tabs (Decision 3A):
1. Overview (Brevo-Aggregate, alt)
2. Contacts (Master-View — DAS ist die Hauptarbeit)
3. Customers (Medusa-Auth-Verwaltung, alt)
4. Sources (Pipeline-Health)

**Contacts-Tab:**
- Saved-Filter-Dropdown + Search + Sort-Dropdown
- 7 Filter-Pills (All/With email/Webshop/MO-PDF/Test/Internal/Blocked)
- AdvancedFilters expandable (Year/Revenue-Range/Country/Type)
- Multi-Select-Tabelle mit sortable Headers, sticky thead, fixed-height
- Floating-Action-Bar bei Selection mit 7 Bulk-Actions
- "Save as filter" + "Export CSV" buttons

**ContactDetailDrawer (10 Tabs):**
1. Overview (Stats + RFM-Card + Profile-Card)
2. Activity (Timeline mit expandable Line-Items + IMAP-Body-Preview)
3. Tasks
4. Notes
5. Contact Info (Email/Address/Phone CRUD)
6. Wishlist (conditional, medusa_customer_id)
7. Communication
8. Relationships
9. Sources
10. Audit

Plus: MasterEditModal mit 5 Sub-Sections + DangerZone, Avatar mit Initials-Color, Lifecycle/RFM/Health-Badges.

### Cron-Jobs

- `crm_task_reminders.py` — alle 5 Min, Email via Resend (S6.6)

---

## 6. Was als nächste Session offen ist

1. **#42 Manual-Review-Page** für die 976 Email-Candidates — UI fehlt noch, Backend-Endpoints sind ready. Möglich als Section im Sources-Tab oder eigene Top-Level-Page.
2. **Pre-2019-MO-PDFs** ins `Monkey Office/Rechnungen/<Jahr>/`-Folder kopieren (Robin's Backup-Archiv) — automatischer Re-Run von `mo_pdf_pipeline.py`.
3. **Optional: Tier-Engine v2** mit Decay-Faktor (lifetime_revenue_decayed-Spalte ist da, aber bisher unbenutzt).
4. **Optional: Newsletter-Engagement + Login-History** aus db2013 ergänzen (Diagnose-Doku noch im Backlog).
5. **Optional: Custom-Fields** (User-defined per Type, P2 in Plan).

---

## 7. Files erstellt/verändert

**Schema-Migrations (5):**
- `2026-05-04_crm_master_note_audit_log.sql` (+ rollback) — repository
- 4 inline via Supabase MCP: p0_foundation_2026_05_04, master_task_2026_05_04, saved_filter_2026_05_04, master_communication_relationships_2026_05_04

**Backend-Endpoints (16+ neue Files):**
- `backend/src/api/admin/crm/contacts/[id]/{tasks,emails,addresses,phones,communication-prefs,relationships,gdpr-export,anonymize}/{route.ts,[*Id]/route.ts}`
- `backend/src/api/admin/crm/{tasks,bulk,saved-filters,email-candidates}/route.ts` + sub-routes
- `backend/src/api/admin/crm/contacts/{export,bulk}/route.ts`
- `backend/src/lib/crm-master-edit.ts` (sync/clearPrimary helpers)

**Frontend (3 Hauptfiles):**
- `backend/src/admin/components/crm/contact-detail-drawer.tsx` (~2000 LoC, 10 Tabs + 4 Modale)
- `backend/src/admin/components/crm/contacts-tab.tsx` (~1300 LoC, Liste + Filter + Bulk + Saved-Filters)
- `backend/src/admin/routes/crm/page.tsx` (Tab-Wire-Up, PageShell maxWidth)

**Scripts (4):**
- `scripts/imap_body_backfill.py` (MIME-decode + ENV-fallback)
- `scripts/crm_task_reminders.py` (Resend-Cron)
- `scripts/imap_pdf_inventory.py` (Diagnose-Tool)
- `scripts/_db_inventory.py` + `_db_schema.py` (DB-Diagnose)

**Doks:**
- `docs/architecture/CRM_DATA_ARCHITECTURE_DECISIONS.md` (abgezeichnet)
- `docs/architecture/CRM_FEATURE_GAP_ANALYSIS.md` (Marktstandards)
- `docs/architecture/CRM_DATA_GAPS_DIAGNOSIS_2026-05-04.md` (db2013 + IMAP-Coverage)
- `docs/architecture/CRM_P0_P1_IMPLEMENTATION_PLAN.md` (Sprint-Plan)
- `docs/architecture/CRM_SYSTEM_STATE_2026-05-04.md` (NEU, dieser Stand)
- `docs/sessions/2026-05-04_crm_master_v1_buildout.md` (DIESES Log)

**Commits (chronologisch):**
6d0fdf1 → 1a769c9 → 9583be9 → 24cea44 → 8eed97e → 888d130 → c236c16 → 16c05ff → 8e2708b → 3448a23 → 64e1251 → 7fbf9f7 → d5b43d6 → b02f4d0 → 1f948e3 → 35510c4 → bff367c → 359e5be → 784a77d → b19d6e3 → 2657c14 → 9dd3e42

22 Commits, ~10.000 Zeilen geänderter Code.
