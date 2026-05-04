# CRM P0 + P1 — Implementation Plan (Standard-CRM-Niveau, B2C/E-Commerce)

**Erstellt:** 2026-05-04
**Anlass:** Robin: "wir pausieren die ad-hoc-arbieten und gehen gleich p0 an. so wie von dir vorgeschlagen. aber natürlich mit allen editier-funktionen. … wir haben es nicht eilig. lieber alles sauber bauen. mache p1 gleich mit dazu."
**Stand:** Plan zur Review. Code beginnt erst nach Robin's Sign-off.
**Referenzen für UI/UX:** Klaviyo (E-Commerce-CRM), Shopify Customers, Attio (modern), Folk (lightweight), HubSpot (Standard-Anker)

---

## 0. Was bereits steht (Sprint S1 + S6 + Follow-Ups)

✅ Multi-Source-Aggregation (`crm_master_*`) · 14.450 Master-Contacts
✅ Email/Address/Phone als 1:N
✅ Tier-System (Bronze/Silver/Gold/Platinum)
✅ Notes + Audit-Log
✅ Activity-Timeline mit expandable Line-Items
✅ Master-Edit + Email/Address/Phone CRUD-Modals
✅ Country-Picker (Dropdown)
✅ Schema-Erweiterung `first_name/last_name/company` (Migration applied, UI noch pending)

---

## 1. Sprint-Aufteilung (~6-8 Tage gesamt, sauber gebaut)

### S6.5 — Strukturierte Namen + Lifecycle + RFM (P0 Foundation)

**Ziel:** Solide Daten-Foundation für alle weiteren P0-Features.

**Schema-Migrations:**
- `crm_master_contact.first_name/last_name/company` (Migration done 2026-05-04)
- `crm_master_contact.salutation, title` (für formelle Anrede)
- `crm_master_contact.lifecycle_stage` (enum, default 'active')
- `crm_master_contact.lifecycle_changed_at`
- `crm_master_contact.rfm_recency_score, rfm_frequency_score, rfm_monetary_score` (1-5 each)
- `crm_master_contact.rfm_segment` (enum: champions/loyal_customers/potential_loyalists/new_customers/promising/needs_attention/at_risk/cant_lose/hibernating/lost)
- `crm_master_contact.rfm_calculated_at`
- `crm_master_contact.acquisition_channel` (text: 'mo_pdf'|'webshop_db1'|'webshop_db2013'|'tape_mag'|'newsletter'|'discogs_referral'|'invite'|'manual')
- `crm_master_contact.acquisition_date` (date)
- `crm_master_contact.preferred_language` (text, 'de'|'en'|...)
- `crm_master_contact.avatar_url` (text)
- `crm_master_contact.birthday` (date, nullable)
- `crm_master_contact.notable_dates jsonb` (für mehrere Daten — Anniversary, etc.)
- `crm_master_contact.health_score` (numeric, 0-100, computed)

**Lifecycle-Stage-Enum** (aus Klaviyo + B2C-Best-Practice):
```
'lead'       → noch nicht gekauft, aber registriert/Newsletter
'active'     → letzter Kauf < 90 Tage
'engaged'    → mehrere Käufe in 12 Monaten, hohe Frequency
'at_risk'    → letzter Kauf 90-180 Tage, vorher aktiv
'dormant'    → letzter Kauf 180-365 Tage
'churned'    → letzter Kauf > 365 Tage
'lost'       → manuell markiert, opted-out, blocked
```

**RFM-Segmentierung-Algo** (Standard E-Commerce):
- **R-Score (1-5):** days_since_last_purchase, Quantile-basiert
- **F-Score (1-5):** total_transactions, Quantile-basiert
- **M-Score (1-5):** lifetime_revenue, Quantile-basiert
- **Segment** ergibt sich aus R+F+M-Combinations (10 Standard-Buckets)

**Backfill:**
- lifecycle_stage aus last_seen_at + total_transactions ableiten
- RFM-Scores aus existing Daten berechnen
- acquisition_channel aus erstem source_link ableiten

**Backend:**
- `PATCH /admin/crm/contacts/:id` erweitern um alle neuen Felder
- Neuer Cron `scripts/crm_lifecycle_recalc.py` (täglich 04:00 UTC) — recalculates lifecycle + RFM für alle Master
- Audit-Log-Actions: `lifecycle_stage_changed`, `rfm_recalculated`, `acquisition_channel_set`

**Frontend (Drawer Overview-Tab):**
- **Stat-Cards-Erweiterung:** zusätzlich zu LTR/Txns/First/Last/Sources jetzt
  - **RFM-Segment-Badge** (Champions/Loyal/At-Risk farbig)
  - **Lifecycle-Stage-Badge** (Active/Engaged/At-Risk/Dormant/Churned)
  - **Health-Score** (0-100, Farbgradient grün→rot)
  - **AOV** (lifetime_revenue / total_transactions)
- **Strukturierte-Daten-Card:**
  - First Name | Last Name | Company (3 inline-edit-Felder, Click-to-Edit)
  - Salutation + Title
  - Birthday (Date-Picker)
  - Acquisition Channel (Dropdown)
  - Preferred Language (Dropdown)
- **Header-Avatar:** wenn `avatar_url` gesetzt, sonst initialen-Circle (z.B. "SK" für Stefan Knappe), klickbar für Upload

### S6.6 — Tasks + Reminders (P0)

**Ziel:** Frank kann zu jedem Customer ein To-Do anlegen.

**Schema:**
```sql
CREATE TABLE crm_master_task (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id       uuid NOT NULL REFERENCES crm_master_contact(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  due_at          timestamptz,
  status          text NOT NULL DEFAULT 'open',  -- 'open'|'done'|'cancelled'
  priority        text DEFAULT 'normal',         -- 'low'|'normal'|'high'|'urgent'
  reminder_at     timestamptz,
  reminder_sent_at timestamptz,
  assigned_to     text,                          -- email of admin
  completed_at    timestamptz,
  completed_by    text,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  deleted_at      timestamptz
);
```

**Backend:**
- `GET /admin/crm/contacts/:id/tasks` — alle Tasks
- `POST /admin/crm/contacts/:id/tasks` — Task anlegen
- `PATCH /admin/crm/contacts/:id/tasks/:taskId` — Status/Title/Date ändern
- `DELETE /admin/crm/contacts/:id/tasks/:taskId`
- `GET /admin/crm/tasks?due_within=7d&assigned_to=me` — Cross-Customer Task-View für "My Tasks"
- Reminder-Cron `scripts/crm_task_reminders.py` (alle 5 Min) — sendet Resend-Email bei due `reminder_at`

**Frontend:**
- **Neuer Drawer-Tab "Tasks"** (5 Tabs werden 7 Tabs)
- **List-View:** open tasks oben (sortiert by priority + due_at), done unten
- **Quick-Add:** Single-Line-Input mit "/T" Keyboard-Shortcut (Linear-Style) — Task + due_at parsen aus Text
- **Task-Item:**
  - Checkbox (toggle done)
  - Title (inline-edit)
  - Due-Date (relative, rot wenn overdue)
  - Priority-Badge
  - Description (expand on click)
- **Cross-Customer Task-View:** neue Top-Level-Page `/app/crm/tasks` — "My Tasks This Week"
  - Today / This Week / Overdue / Completed-Today
  - Click → Customer-Drawer mit Tasks-Tab geöffnet

### S6.7 — Bulk-Actions + Smart-Lists (P0)

**Ziel:** Frank kann 100 Customers gleichzeitig editieren (Tag, Tier, Block).

**Schema:**
```sql
CREATE TABLE crm_saved_filter (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  query_json      jsonb NOT NULL,    -- { filters: [...], sort: {...} }
  shared          boolean DEFAULT false,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);
```

**Backend:**
- `POST /admin/crm/contacts/bulk` — bulk-update {ids: [...], action: 'tag_add'|'tag_remove'|'tier_set'|'block'|'lifecycle_set', value: ...}
- `GET /admin/crm/contacts/bulk-export` — CSV-Export (post-Filter)
- `GET /admin/crm/saved-filters` + `POST` + `PATCH` + `DELETE`
- Master-Audit-Log per affected Master (1 Eintrag mit `bulk_action` action + bulk-id)

**Frontend (Contacts-Tab):**
- **Multi-Select:** Checkbox-Column links (Shopify/Klaviyo-Style)
- **Floating-Action-Bar** wenn ≥1 Selection:
  - "X selected" + "Select all" + "Clear"
  - Action-Buttons: "+ Tag" "Set tier" "Mark test" "Block" "Export CSV"
- **Smart-Lists:**
  - Sidebar links (zwischen Filter-Pills und Search): "Saved filters"-Section
  - Default-Filters mit User-Lieblinge: "Champions" "At-Risk" "New This Month" "VIP"
  - "Save current filter as…" Dropdown im Filter-Pills-Bar
- **Filter-Builder** (Attio-Style) — separater Modal wenn pills nicht ausreichen:
  - Field + Operator + Value
  - AND/OR-Groups
  - Save-as-Smart-List

### S6.8 — CSV-Export + GDPR (P0)

**Ziel:** Compliance-Pflicht.

**Backend:**
- `GET /admin/crm/contacts/bulk-export.csv?<query>` — streamt CSV, max 50k rows
- `GET /admin/crm/contacts/:id/gdpr-export.json` — vollständiger Master mit allen Sub-Entitäten
- `POST /admin/crm/contacts/:id/anonymize` — soft-delete + PII-Strip (display_name → "[anonymized]", emails/addresses/phones removed, Notes redacted, audit_log mit action='gdpr_anonymize')

**Frontend:**
- "Export CSV"-Button als Bulk-Action + im Filter-Bar
- GDPR-Buttons im Master-Edit-Modal "Danger Zone"-Section: "Export data" + "Anonymize"
- Confirm-Modal für Anonymize (irreversibel)

### S7 — P1 Features

**S7.1 — Wishlist + Bid-Profile + Acquisition-Tracking**
- Wishlist im Drawer: query `saved_item` für medusa_customer_id, render als Tab "Wishlist"
- Bid-Profile-Card im Overview-Tab: Win-Rate, Avg-Bid, Top-Categories, Active-Bids
- Acquisition-Tracking: bei vod-auctions-Register utm_source/utm_campaign capturen, in master_contact.acquisition_channel + .acquisition_campaign

**S7.2 — Communication-Preferences pro Channel**
- Schema: `crm_master_communication_pref (master_id, channel, opted_in, opted_in_at, opted_out_at, source)`
- Channels: email_marketing / email_transactional / sms / phone / postal
- Brevo-Sync: opted_out → tag in Brevo "unsubscribed"
- UI: separater Tab "Communication" mit Toggle pro Channel + History

**S7.3 — Person ↔ Company-Beziehung**
- Schema: `crm_master_relationship (id, person_master_id, company_master_id, role, started_at, ended_at)`
- Beispiel: "Sven (Person) ist Buyer @ Boomkat (Business)"
- UI: im Drawer "Relationships"-Section in Overview, Person-Master sieht Company-Master verlinkt

**S7.4 — Inline-Edit (Attio-Style)**
- Click-to-Edit ALLE Header-Felder im Drawer (statt MasterEditModal)
- Tab/Enter-Navigation zwischen Feldern
- Visual-Feedback: hover zeigt Edit-Icon, Click zeigt Input
- Optimistic-Update + rollback bei Error
- Bestehender Modal bleibt für Bulk-Operations + komplexe Felder (Adresse mit ISO-Picker)

**S7.5 — Bid-Aggregate für Auctions-Specifics**
- Health-Score erweitern: für Customers mit Bid-Aktivität → mehr Gewicht
- Custom-Field "Top Genres" via M2-Backfill aus Bid-/Order-History
- Tier-Engine v2 mit Bid-Aktivität als Faktor

---

## 2. UI/UX Best-Practices (übernommen aus Marktführern)

### 2.1 Header-Pattern (Attio + Klaviyo)

```
┌──────────────────────────────────────────────────────────────────┐
│ [Avatar SK]  Stefan Knappe                              [✎ Edit] │
│              Drone Rec. · person · DE                            │
│              ⭐ Platinum  💎 Champions  🟢 Active  🏷 vip, dj      │
│              € 97.4k LTV · 21 orders · since Mar 2019            │
└──────────────────────────────────────────────────────────────────┘
```

- **Avatar** (Initials wenn keine URL)
- **Display-Name** + **company subtitle** + **language**
- **Lifecycle-Status-Badge** (mit Farben aus Klaviyo: Champions=Gold, Loyal=Purple, At-Risk=Orange, Lost=Gray)
- **Quick-Stats-Row** (LTV/Order-Count/Tenure)

### 2.2 Tabs (HubSpot-Pattern, max 7 visible)

`Overview · Contact Info · Activity · Tasks · Notes · Sources · Audit`

(Wishlist + Communication + Relationships nur wenn Daten da → conditional rendering)

### 2.3 Inline-Edit (Attio-Pattern)

- Hover zeigt Edit-Pencil
- Click expandiert Feld zu Input
- Tab/Enter speichert
- Esc bricht ab
- Subtle visual-feedback: input-Border animiert beim Focus

### 2.4 Quick-Add (Linear/Attio-Pattern)

- "/" öffnet Universal-Search/Action-Bar
- "/T" = neue Task
- "/N" = neue Note
- "/E" = neue Email
- Smart-Parse: "Call Stefan tomorrow 3pm" → Task mit Due-Date

### 2.5 Bulk-Actions (Shopify-Pattern)

- Checkbox-Column als erste Spalte
- "Select all" indicator klar
- Floating-Action-Bar bei Selection
- Action-Buttons mit Confirm-Modal für Destruktive

### 2.6 Smart-Lists (Klaviyo-Pattern)

- Sidebar-Section "Saved filters"
- Default-Lists für jeden Tier + Lifecycle:
  - "Champions" (RFM-Segment)
  - "Recently Active" (last_seen 7d)
  - "At Risk" (lifecycle = at_risk)
  - "New This Month" (created_at last 30d)
  - "VIP" (Tier=Platinum)
  - "Newsletter Subscribers" (Brevo-Sync-State)
- Save-As-Filter Dropdown in Filter-Bar

### 2.7 Activity-Timeline (HubSpot/Klaviyo)

- Vertical-Line + farbige Dots ✓ haben wir
- Filter pro Event-Type (Tasks/Notes/Emails/Orders/Bids) — fehlt
- Compact / Detailed Toggle — fehlt
- Inline-Reply für Emails wenn Two-Way-Sync aktiv (P2)

### 2.8 RFM-Segment-Visualisierung (Klaviyo)

10 Standard-Segments mit Farben:
- 💎 **Champions** (5,5,5) — Top-Customers
- 💜 **Loyal Customers** (4-5, 4-5, 3-5) — Wiederkäufer
- 🌱 **Potential Loyalists** (3-5, 1-3, 3-5) — vielversprechend
- 🆕 **New Customers** (4-5, 1, 1-5) — frisch
- ⭐ **Promising** (3-4, 1, 1-5)
- 👀 **Needs Attention** (2-3, 2-3, 2-3)
- ⚠️ **At Risk** (1-2, 4-5, 4-5) — verlierbar
- 💔 **Can't Lose Them** (1-2, 4-5, 5) — vorher Champions, jetzt inaktiv
- 😴 **Hibernating** (1-2, 1-2, 1-3)
- 💤 **Lost** (1, 1, 1) — verloren

### 2.9 Health-Score (Salesforce-Pattern)

0-100 mit Farbgradient grün→gelb→rot. Berechnet aus:
- 40% Recency (days since last)
- 30% Engagement (Newsletter-Opens, Login-Frequency, Bid-Activity)
- 20% Monetary (LTV-Percentile)
- 10% Issues (Refunds, Complaints, Bounces) — negative Faktor

### 2.10 Keyboard-Shortcuts (Linear/Attio)

- `j`/`k` — Navigate Liste
- `/` — Search
- `⌘K` — Command Palette
- `e` — Edit selected
- `t` — Add Task
- `n` — Add Note
- `Esc` — Close Drawer/Modal

---

## 3. Datenmodell-Übersicht (P0+P1 final)

```
crm_master_contact
├── id
├── display_name (auto-composed: "first last (company)" oder company)
├── first_name, last_name, company         ← P0
├── salutation, title                       ← P0
├── contact_type (person|business)
├── primary_email, primary_email_lower
├── primary_phone, primary_country_code, primary_postal_code, primary_city
├── lifetime_revenue, total_transactions
├── lifecycle_stage                         ← P0 (lead|active|engaged|at_risk|dormant|churned|lost)
├── lifecycle_changed_at                    ← P0
├── rfm_recency_score, _frequency_score, _monetary_score (1-5)  ← P0
├── rfm_segment                             ← P0
├── rfm_calculated_at                       ← P0
├── tier (Bronze/Silver/Gold/Platinum)
├── tier_calculated_at
├── health_score (0-100)                    ← P0
├── acquisition_channel                     ← P0
├── acquisition_date                        ← P0
├── preferred_language                      ← P0
├── avatar_url                              ← P0
├── birthday                                ← P0
├── notable_dates jsonb                     ← P0
├── tags TEXT[]
├── is_test, is_blocked, blocked_reason
├── manually_merged, manual_review_status
├── medusa_customer_id (FK → customer)
├── first_seen_at, last_seen_at
├── created_at, updated_at, deleted_at

crm_master_email/_address/_phone (1:N)      ← haben wir

crm_master_source_link (1:N, audit über Origins)  ← haben wir

crm_master_note                              ← haben wir
crm_master_audit_log                         ← haben wir

crm_master_task                              ← P0 NEU
crm_master_communication_pref                ← P1 NEU
crm_master_relationship                      ← P1 NEU
crm_saved_filter                             ← P0 NEU
```

---

## 4. Reihenfolge der Implementierung

| Sprint | Was | Aufwand | Sichtbares Resultat |
|---|---|---|---|
| **S6.5** | Strukturierte Namen + Lifecycle + RFM + Health-Score + neue Felder | 2 Tage | Header zeigt Avatar+Lifecycle+RFM+Health, Stats-Cards erweitert, alle Felder editierbar |
| **S6.6** | Tasks + Reminders | 1.5 Tage | Tab "Tasks", Cross-Customer "My Tasks" Page, Reminder-Cron |
| **S6.7** | Bulk-Actions + Smart-Lists | 1.5 Tage | Multi-Select in Liste, Floating-Action-Bar, Saved-Filters-Sidebar |
| **S6.8** | CSV-Export + GDPR | 0.5 Tag | Export-Button, GDPR-Pfade |
| **S7.1** | Wishlist + Bid-Profile + Acquisition | 1 Tag | Conditional Tabs im Drawer |
| **S7.2** | Communication-Preferences | 0.5 Tag | Communication-Tab |
| **S7.3** | Person-Company-Relationships | 0.5 Tag | Relationships-Section |
| **S7.4** | Inline-Edit (Attio-Style) | 1 Tag | Click-to-Edit ohne Modal-Open |
| **S7.5** | Bid-Aggregate + Tier v2 | 0.5 Tag | Bid-Profile-Card |

**Gesamt:** ~9 Tage saubere Implementation. Plus Bug-Fixes parallel (siehe `CRM_DATA_GAPS_DIAGNOSIS_2026-05-04.md`).

---

## 5. Klarstellungen (Robin 2026-05-04, abgezeichnet)

1. ✅ **Lifecycle-Stages:** Klaviyo-Standard `lead/active/engaged/at_risk/dormant/churned/lost`
2. ✅ **RFM-Segments:** 10 Klaviyo-Buckets (Champions/Loyal/Potential Loyalists/New/Promising/Needs Attention/At Risk/Can't Lose Them/Hibernating/Lost)
3. ✅ **Tab-Reihenfolge:** an Marktführer angepasst (siehe §5.1)
4. ✅ **Tasks:** **multi-user-ready** — `assigned_to` mit Admin-User-Lookup, nicht single-admin-fallback
5. ✅ **Health-Score:** 40% Recency + 30% Engagement + 20% Monetary + 10% Issues
6. ✅ **Reminder-Channel:** Email zuerst (Resend), **Push als P2-Erweiterung** vorbereiten (Web-Push-Subscription-Schema schon im Notification-Service-Layer einplanen)
7. ✅ **Inline-Edit:** **Hybrid** mit extensiblem Component-Framework. Reusable `<InlineEditable>`-Component für simple Felder (Text/Date/Select), Modal für komplexe Forms (Address mit Country-Picker, Communication-Preferences). Pattern designed für spätere Custom-Fields / Erweiterungen.
8. ✅ **IMAP-Body-Re-Run** parallel mit Bug-Fix
9. ✅ **Newsletter + Login-History** als zusätzliche Sources migrieren

### 5.1 Tab-Reihenfolge — angelehnt an HubSpot/Salesforce/Klaviyo

**Vergleich Marktführer:**

| CRM | Default-Tab | Tab-Order |
|---|---|---|
| HubSpot | Overview | Overview · Activities · Notes · Emails · Calls · Tasks · Meetings · Files |
| Salesforce | Details | Details · Related · Activity · Chatter · News |
| Klaviyo | Activity Feed | Overview · Activity Feed · Profile Properties · Segments · Predictive |
| Attio | Overview | Overview · Lists · Records · Activity · Comments |
| Pipedrive | Details | Details · Activities · Deals · Notes · Files · Emails |

**Beobachtung:**
- **Overview/Details ist überall an Position 1** ✓ (zentrale Daten zuerst)
- **Activity-Timeline ist primär** (meist Position 2, Klaviyo macht's sogar zur Default-Tab)
- **Tasks separat & prominent** — gehört vor Notes
- **Sources / Audit-Log** ist NIE in Top-Tabs bei Standard-CRMs. Multi-Source ist unser Spezial — als sekundäre Sicht.
- **Files** ist überall present — wir haben's noch nicht, P2

**Unsere neue Tab-Hierarchie:**

```
Primary tabs (always visible, immer in dieser Reihenfolge):
1. Overview          (Header + Stats + Profile-Card)
2. Activity          (Timeline mit Type-Filter — DEFAULT-TAB)
3. Tasks             (mit Counter-Badge)
4. Notes             (mit Counter-Badge)
5. Contact Info      (Emails/Addresses/Phones — CRUD)

Conditional tabs (sichtbar wenn relevant):
6. Communications    (P1, wenn Communication-Prefs gesetzt)
7. Wishlist          (P1, wenn medusa_customer_id verlinkt + saved_items > 0)
8. Relationships     (P1, wenn ≥1 relationship)

Hidden im "..." More-Menu (admin/audit, nicht primär):
- Sources            (Source-Links + Match-Confidence)
- Audit              (Audit-Log)
```

**Default-Tab-Logik:** Activity (was hat der Customer zuletzt getan), nicht Overview. HubSpot zeigt Overview default, aber für B2C-Auctions ist Customer-Activity die wichtigere Information.

### 5.2 Multi-User-Pattern für Tasks + Audit

- **Tasks:** `assigned_to` referenziert Medusa-User-ID. Default beim Anlegen = current admin via `req.scope.resolve("authentication")`. UI: "Assigned to" Dropdown mit Admin-Liste (List-Endpoint `/admin/crm/admins`).
- **Notes:** `author_email` schon vorhanden, multi-author OK. UI zeigt Avatar + Name pro Note.
- **Audit-Log:** `admin_email` schon vorhanden. UI zeigt "by Robin" / "by Frank".
- **Wenn ein Admin Tasks anlegen kann für einen anderen** (z.B. Robin assigned Frank): Resend-Reminder an `assigned_to`-Email statt creator-Email.

### 5.3 Hybrid Inline-Edit Pattern (extensibel)

**Reusable Component-Framework:**

```tsx
<InlineEditable
  value={contact.first_name}
  type="text"                            // text | textarea | date | select | tags
  options={...}                          // for select
  onSave={async (v) => patch({ first_name: v })}
  validate={(v) => v.trim().length > 0}
  placeholder="Add first name"
/>
```

- **Hover** zeigt subtle edit-pencil-icon
- **Click** öffnet Input in-place (kein Modal)
- **Tab/Enter** speichert mit optimistic-update
- **Esc** bricht ab
- **Visual-feedback:** loading-spinner während save, success-tick, error-toast

**Wann Modal statt Inline:**
- Komplexe Forms (Address: 13 Felder + Country-Picker)
- Bulk-Operations
- Destruktive Actions (Anonymize, Delete)
- Multi-Step-Workflows (geplant für später: Merge-Confirm, GDPR-Export)

**Extensibilität für Custom-Fields (P2):**
- `InlineEditable` nimmt `field_definition`-Object aus eigener Tabelle (geplant `crm_custom_field`)
- Renderer-Map: text → text-Input, number → number-Input, date → date-picker, etc.
- Heute schon designed: jeder neue Feld-Typ ist 1 Renderer-Function in `inline-editable.tsx`

---

## 6. Was nicht in P0+P1 ist (P2/Later)

- Two-way Email-Sync (Send aus CRM)
- Email-Conversation-Threading
- Custom Fields (User-defined)
- Workflow-Automation (if-then-builder)
- Cohort-Analysis-Dashboard
- Multi-User mit Permission-Roles
- Mobile-App
- Webhooks aus CRM
- Real-time Collaboration

Diese kommen später, wenn Multi-Admin oder externe Integrationen relevant werden.
