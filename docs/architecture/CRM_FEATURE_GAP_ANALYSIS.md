# CRM Feature-Gap-Analyse — was Marktführer 2026 können vs. unser Stand

**Erstellt:** 2026-05-04
**Anlass:** Robin: "ich habe den Eindruck, du hast das crm frei entwickelt und keine state of the art oder best practices aus marktführeren bei crm systemen gezogen. richtig?"
**Antwort:** Berechtigt. Diese Analyse holt das Versäumnis nach.

---

## 0. Referenz-CRMs als Orientierung

| CRM | Stärke | Relevanz für VOD |
|---|---|---|
| **HubSpot** | Marktführer, B2B+B2C, Free-Tier sehr funktional | Activity-Timeline, Deal-Pipeline, Smart-Lists, Custom Fields, Workflows |
| **Salesforce** | Enterprise-Standard, alles-konfigurierbar | Bulk-Operations, Reporting/Dashboards, Permission-Roles |
| **Pipedrive** | Visuelle Pipeline, Sales-Forecast | Wir haben keine Sales-Pipeline (Auctions ≠ Deals) |
| **Attio** | Modernes B2B-CRM, "people-first", custom objects | UI-Pattern: Inline-Edit, Quick-Add, Keyboard-Shortcuts |
| **Folk** | Lightweight, Email-zentrisch | Two-way Email-Sync, Conversation-View |
| **Klaviyo** | E-Commerce/B2C-CRM (genau unser Fall) | RFM-Segmentation, Lifetime-Value-Predictions, Email-Sequences, Smart-Lists für E-Commerce |
| **Shopify Customers** | E-Commerce-Customer-Mgmt-Standard | Lifetime-Value, Order-History, Tags, Notes, Marketing-Consent |
| **WooCommerce + CRM-Plugin** | Auctions-ähnlich (Wholesale) | Customer-Tier, Bulk-Edit, Export |

**Für uns relevant ist B2C/E-Commerce (Klaviyo + Shopify), nicht B2B-Sales-CRM (HubSpot Sales Hub).** Wir verwalten Auktions-Käufer, keine Sales-Leads mit Pipeline-Stages.

---

## 1. Feature-Inventar — Was 2026 zum Standard gehört

### 1.1 Contact-Modell

| Feature | Standard | Unser Stand | Lücke? |
|---|---|---|---|
| Strukturierte Namen (first/last/company) | ✓ überall | nur `display_name` (string), structured nur in `crm_master_address` | **JA** — gerade in Arbeit, Migration done |
| Salutation / Title | ✓ HubSpot, Salesforce | nur in addresses | klein |
| Avatar/Photo URL | ✓ alle | — | klein |
| Birthday / Notable Dates | ✓ HubSpot, Folk | — | mittel |
| Preferred Language | ✓ Klaviyo, Shopify | — | mittel — DE/EN bei uns wichtig |
| Pronouns | ✓ HubSpot, Attio | — | klein |
| Multi-Email/Phone/Address (1:N) | ✓ Salesforce, Folk | ✓ haben wir | — |
| Custom Fields (User-defined) | ✓ alle | — | mittel — z.B. "Discogs-Username", "Lieblings-Genre" |
| Person ↔ Company-Beziehung | ✓ alle | — | mittel — Frank: Customer X arbeitet bei Boomkat |
| Hierarchie (Parent-Company) | ✓ HubSpot, Salesforce | — | klein |

### 1.2 Lifecycle / Segmentation

| Feature | Standard | Unser Stand | Lücke? |
|---|---|---|---|
| Lifecycle-Stage (Lead/MQL/Customer/Champion/Churned) | ✓ alle | — | **JA** — wichtig für B2C |
| Tier (Bronze/Silver/Gold/Platinum) | ✓ Klaviyo, Shopify | ✓ haben wir | — |
| RFM-Score (Recency × Frequency × Monetary) | ✓ Klaviyo, Shopify | nur Lifetime-Revenue | **JA** — wichtig für E-Commerce |
| Days since last purchase | ✓ alle | nur `last_seen_at` | klein — Berechnung aus last_seen |
| At-Risk-Flag (z.B. 90 Tage keine Order) | ✓ Klaviyo | — | **JA** — Re-Engagement-Trigger |
| NPS / CSAT-Score | ✓ HubSpot, Salesforce | — | später |
| Customer-Health-Score (rule-based) | ✓ Klaviyo, Salesforce | — | später |
| Tags (taxonomic + free-form) | ✓ alle | ✓ `tags TEXT[]` | — |
| Smart-Lists / Saved Filters | ✓ alle | ❌ aktuell nur ad-hoc-Filter | **JA** — z.B. "Platinum + 90d inactive" |

### 1.3 Activity / Communication

| Feature | Standard | Unser Stand | Lücke? |
|---|---|---|---|
| Activity-Timeline (alle Touchpoints) | ✓ alle | ✓ Transactions+Bids+Orders+IMAP | — |
| Email-Conversation-Threading | ✓ HubSpot, Folk | ❌ Einzelmails | mittel |
| Two-way Email-Sync (Send aus CRM) | ✓ HubSpot, Folk, Klaviyo | ❌ read-only IMAP | später |
| Call-Logging (manuell oder via Twilio) | ✓ HubSpot, Salesforce | — | später |
| Meeting/Calendar (Google/Outlook Sync) | ✓ HubSpot, Salesforce | — | nicht nötig (B2C) |
| Notes mit @-Mentions | ✓ alle | ✓ basic Notes (kein @-Mention) | klein |
| File/Attachment-Upload pro Contact | ✓ alle | — | mittel |
| Audit-Log / Activity-Feed | ✓ alle | ✓ haben wir (`crm_master_audit_log`) | — |

### 1.4 Tasks / Productivity

| Feature | Standard | Unser Stand | Lücke? |
|---|---|---|---|
| Tasks mit Due-Date + Reminder | ✓ alle | ❌ | **JA** — "Customer X anrufen Mo 9 Uhr" |
| Task-Assignment (welcher Admin?) | ✓ alle | ❌ (single-admin Setup) | später |
| Bulk-Actions (Multi-Select) | ✓ alle | ❌ | **JA** — "alle gold-Tier taggen" |
| Quick-Add (universal + Button) | ✓ alle | ❌ | mittel |
| Saved Views per User | ✓ alle | ❌ | mittel |
| Keyboard Shortcuts | ✓ Attio, Linear-Style | ❌ | nice |
| Inline-Edit (Click-to-Edit, kein Modal) | ✓ Attio, Folk | ❌ alles in Modalen | mittel |
| Real-time Collaboration | ✓ HubSpot, Salesforce | ❌ | später |

### 1.5 E-Commerce-Spezifika (B2C-CRM)

| Feature | Standard | Unser Stand | Lücke? |
|---|---|---|---|
| Order/Transaction-History | ✓ Shopify, Klaviyo | ✓ haben wir | — |
| Lifetime Value (LTV) | ✓ alle E-Commerce | ✓ haben wir (lifetime_revenue) | — |
| Average Order Value (AOV) | ✓ alle | ❌ einfach Berechnung aus LTV/txn-count | klein |
| Repeat-Purchase-Rate | ✓ Klaviyo, Shopify | ❌ | klein |
| Predicted LTV (ML) | ✓ Klaviyo, Shopify Plus | ❌ | später |
| Wishlist / Watchlist | ✓ Shopify | wir haben `saved_item` | mittel — im CRM-Detail anzeigen |
| Acquisition Channel (Source/UTM) | ✓ Klaviyo, Shopify | ❌ | mittel |
| Bid-History (Auction-spezifisch) | unique zu uns | ✓ haben wir | — |
| Win-Rate / Bid-Profile | unique zu uns | ❌ noch nicht aggregiert | klein — neu |
| Cohort-Analysis (Customers nach Erstkauf-Monat) | ✓ Klaviyo, Shopify | ❌ | später |
| Marketing-Consent / GDPR-Status | ✓ alle | teilweise (Brevo-Sync) | mittel — pro Channel |
| Communication Preferences (Email/SMS/etc.) | ✓ alle | ❌ | mittel |

### 1.6 Reporting / Analytics

| Feature | Standard | Unser Stand | Lücke? |
|---|---|---|---|
| Tier-Verteilung-Chart | ✓ alle | nur Stat in Sources-Tab | klein |
| Funnel-Reports | ✓ HubSpot, Klaviyo | ❌ | später |
| Cohort-Analysis | ✓ Klaviyo, Shopify | ❌ | später |
| Custom Dashboards | ✓ alle | ❌ | später |
| Export to CSV/Excel | ✓ alle | ❌ | **JA** — Frank will Listen exportieren |
| Saved Reports | ✓ alle | ❌ | später |
| Marketing Attribution | ✓ Klaviyo, HubSpot | ❌ | später |

### 1.7 Automation

| Feature | Standard | Unser Stand | Lücke? |
|---|---|---|---|
| Workflow-Builder (if X then Y) | ✓ alle | ❌ | später |
| Email-Sequences (Drip-Campaigns) | ✓ Klaviyo, HubSpot | Brevo macht's extern | OK |
| Auto-Tag bei Trigger | ✓ alle | ❌ | mittel |
| Lead-Scoring | ✓ alle | wir haben Tier (rule-based ähnlich) | — |
| Auto-Enrichment (Clearbit, LinkedIn) | ✓ HubSpot, Salesforce | ❌ | nicht nötig (Customer-Data, nicht Leads) |
| Webhooks (CRM → external) | ✓ alle | ❌ | später |

### 1.8 Compliance / Data

| Feature | Standard | Unser Stand | Lücke? |
|---|---|---|---|
| GDPR Right-to-Access (Export) | Pflicht | teilweise (vorhanden für medusa-customer, fehlt für master) | **JA** — Compliance-Risiko |
| GDPR Right-to-Deletion (Anonymize) | Pflicht | teilweise | **JA** |
| Audit-Log mit Source-Attribution | ✓ alle | ✓ haben wir | — |
| Duplicate-Detection (Auto-Merge-Suggestions) | ✓ HubSpot, Salesforce | wir haben crm_master_merge_review (UI fehlt) | mittel |
| Data-Quality-Score pro Contact | ✓ HubSpot, Attio | ❌ | nice-to-have |
| Source-Confidence-Tracking | ✓ Salesforce | ✓ haben wir (`source_link.confidence`) | — |
| Multi-User mit Permissions | ✓ alle | ❌ | später (single-admin OK für jetzt) |

### 1.9 Integration

| Feature | Standard | Unser Stand | Lücke? |
|---|---|---|---|
| Stripe/PayPal Payment-View pro Customer | ✓ alle | wir zeigen Orders, nicht Payment-Details | klein |
| Newsletter (Mailchimp/Brevo) | ✓ alle | ✓ Brevo | — |
| Webhooks aus CRM | ✓ alle | ❌ | später |
| API (REST/GraphQL) | ✓ alle | ✓ Medusa-Admin-API | — |
| Slack/Teams Notifications | ✓ HubSpot | ❌ | später |
| Zapier/Make | ✓ alle | ❌ | später |

---

## 2. Roadmap — Prio P0/P1/P2

**P0 — Standard-CRM-Niveau, sollte im Sprint S6/S7 noch rein:**

1. **Strukturierte Namen** (first_name + last_name + company) auf `crm_master_contact` — Migration done, UI in Arbeit
2. **Display-Name Auto-Compose** aus first+last+company
3. **Lifecycle-Stage** (active / engaged / at_risk / dormant / churned / lost) als enum
4. **RFM-Score** (R=days since last, F=txn-count, M=lifetime_revenue) — täglich computed
5. **Tasks** mit Due-Date + Reminder (1 neue Tabelle `crm_master_task`)
6. **Bulk-Actions** in Contacts-Liste (Multi-Select → Tag/Tier/Block)
7. **Smart-Lists** (Saved-Filter mit Name + Sharing) — 1 neue Tabelle `crm_saved_filter`
8. **CSV-Export** (Contacts, Activity, Notes) — 1 Endpoint
9. **GDPR Right-to-Access** für `crm_master_*` (analog `/store/account/gdpr-export`) — 1 Endpoint
10. **GDPR Anonymize** — soft-delete + PII-Strip im Audit-Log

**P1 — Differenzierung E-Commerce/Auctions:**

1. **Wishlist/Watching** im Drawer — wir haben `saved_item`, nur anzeigen
2. **Bid-Profile** (Win-Rate, Avg-Bid-Amount, Top-Categories)
3. **Acquisition-Channel** (Newsletter / Direct / Discogs-Referral / Invite)
4. **Communication-Preferences** pro Channel (Email/SMS/Phone/Post — opt-in/out)
5. **Person ↔ Company-Beziehung** (z.B. "Sven arbeitet bei Boomkat") — neue Tabelle `crm_master_relationship`
6. **AOV / Repeat-Rate** als Stats in Detail-Drawer Overview
7. **Inline-Edit** im Drawer (Click-to-Edit statt Modal)
8. **Birthday / Notable Dates**
9. **Preferred Language** (DE/EN für Email-Versand)
10. **Avatar/Photo URL**

**P2 — Later:**

1. Two-way Email-Sync (Send aus CRM via SMTP/Resend)
2. Email-Conversation-Threading
3. Custom Fields (User-defined per Type)
4. Workflow-Automation
5. Cohort-Analysis-Dashboard
6. Multi-User mit Permission-Roles
7. Mobile-App
8. Webhooks
9. Real-time Collaboration

---

## 3. Empfehlung — Strategie

**Was wir nicht neu erfinden müssen:**
- Lifecycle-Stage-Enum aus Klaviyo übernehmen: `lead | active | engaged | at_risk | dormant | churned | lost` (7 Stages, well-established)
- RFM-Banding-Standard aus E-Commerce: R-Score 1-5, F-Score 1-5, M-Score 1-5 → 125 Combinations, Champions/Loyal/At-Risk-Buckets
- GDPR-Anonymize-Pattern aus Shopify: PII durch `[anonymized]` ersetzen, Order-History bleibt für Buchhaltung
- Smart-List-Filter-Builder UI: Attio-Style (Field + Operator + Value, AND/OR-Groups)
- Bulk-Actions UI: Shopify-Style (Checkbox-Column → Floating-Action-Bar)
- Tasks-UI: Linear-Style (Due-Date, Status: Open/Done, Quick-Add via "T")

**Mein Vorschlag:**

1. **Heute noch fertig**: Strukturierte Namen + Auto-Compose (P0 Item 1+2) — bereits angefangen
2. **Nächste Session — Sprint S6.5:** P0 Items 3-10 (Lifecycle + RFM + Tasks + Bulk + Smart-Lists + Export + GDPR)
3. **Sprint S7+:** P1 Items
4. **Backlog:** P2

**Was ich von dir brauche:**
- Bestätigung dass die Klaviyo-Lifecycle-Stage-Liste ok ist (oder eigene Enum)
- Bestätigung dass RFM als Standard-Methodik passt
- Pri-Anpassungen wenn etwas wichtiger ist (z.B. CSV-Export sofort weil Frank ihn diese Woche braucht)
