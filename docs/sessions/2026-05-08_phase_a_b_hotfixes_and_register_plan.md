# Session Log — 2026-05-08 / 2026-05-09

**Thema:** Workstream §14 — Registrierung-Opening + Fortschritts-Newsletter (Phase A + B + Hotfixes + Custom-Register-Endpoint-Plan)
**Author:** Robin + Claude
**Releases:** v1.0.0-rc53.14, rc53.15, rc53.15.1, rc53.15.2 (deployed) + Plan für rc53.17 (Custom Register Endpoint)
**Doku-Output:** 4 neue Marker-Docs in `docs/optimizing/` + diese Session-Log

---

## 1. Ausgangslage

Frank hat seit Mai-Anfang ein produktionsreifes CRM (rc53.0, 14.450 Master-Contacts) plus den CRM↔Newsletter-Hybrid (rc53.4: Brevo-Webhook-Mirror, Drawer-Toggle, 3 System-Smart-Lists). Robin's Frage zu Session-Start: Wir wollen jetzt eine Registrierung für die bisher bekannten User von Frank und VOD Records öffnen, damit wir ihnen Newsletter über den Fortschritt von VOD Auctions schicken können — was haben wir bereits vorbereitet?

**Audit-Ergebnis:** Backend (Pre-Launch-Invite + CRM-Hybrid + Brevo) ist produktionsreif, aber Storefront-Sign-up-Form und DSGVO-Texte fehlen. Workstream §14 mit Phasen A→D in TODO.md angelegt.

## 2. Phase A — Public Newsletter-Sign-up + DSGVO-Checkboxes (rc53.14)

**Commit:** `2b267d3` — deployed gegen 07:00 UTC.

### Storefront-Neu

- `app/newsletter/page.tsx` — Public Sign-up-Form (Email + DSGVO-Consent-Checkbox + DOI-Hinweis) wired auf bestehenden `POST /store/newsletter` Double-Opt-In-Flow (HMAC-Token, 24h gültig). Success-State "Check your inbox" mit "try a different email"-Reset.
- `app/newsletter/layout.tsx` — Page-Metadata.

### Storefront-Geändert

- `middleware.ts` — `/newsletter*` als public path (sonst blockt `beta_test`-Gate die Sign-up-Page).
- `app/apply/page.tsx` — Explizite DSGVO-Consent-Checkbox vor Submit, Validation blockt unchecked Submit.
- `app/datenschutz/page.tsx` — Section 12 (Newsletter & CRM — Brevo) erweitert: DOI-Mechanik mit 24h-Token, Zwei-Listen-Klarstellung (VOD aktiv + Tape-mag-Legacy), Retention-Specifics (Suppression-Record nach Unsub für GDPR Art. 21), `privacy@`-Kontakt.

### Backend-Geändert

- `api/store/newsletter/route.ts` — TODO-Kommentar für Rate-Limit-Deferral an Workstream §4 (Redis), Begründung: niedriges Risiko in `beta_test` aber Resend-Quota + Auto-Master-Pollution bei Flood.

### Audit ohne Code-Change

- 4 Block-Templates (`block-teaser/tomorrow/live/ending`) nutzen alle `newsletter-layout.ts` mit `{{ unsubscribe }}` Brevo-Placeholder im Footer → Brevo ersetzt per Recipient automatisch.
- `newsletter-confirm.ts` Template ist production-ready (24h-Hinweis matcht HMAC-Token-Validity).

## 3. Phase B — Bulk-Invite Endpoint + UI für VOD Auctions Early-Access (rc53.15)

**Commit:** `f625c2c` — deployed gegen 07:42 UTC.

### Production-Audit (vor Implementation)

Via Supabase MCP `execute_sql` gegen `bofblwqieuvmqybzxapx`:

- **20.826 Master-Contacts** gesamt (gewachsen von 14.450 in CLAUDE.md durch Mail-Imports + Backfills)
- **12.995 mit Primary-Email** (~62%, lower than the 76,7% in CLAUDE.md)
- **3.634 opted-in** für `email_marketing` (rc53.4-Backfill exact)
- **0 opted-out** (Webhook bislang ohne Events)
- **3.567** in `newsletter_subscribers` (alle source='vod-records', status='active')
- **1.954** mit Tag `newsletter_only`
- **0 Master-Contacts** mit `medusa_customer_id` → noch keine echten User

### Drei DSGVO-Tiers identifiziert

| Tier | Count | Profil | Rechtsbasis |
|---|---|---|---|
| T1 | 3.634 | Newsletter opted-in | Art. 6(1)(a) DSGVO |
| T2 | 6.455 | vod-records-Bestandskunde, ohne Newsletter | §7(3) UWG |
| T3 | 2.737 | tape-mag.com Legacy-Member, ohne Newsletter | §7(3) UWG |

**Robin-Decision 2026-05-08:** Aggressiver Pfad — alle drei Tiers via §7(3) UWG. Framing: VOD ist Dachmarke, VOD Auctions ist drittes Angebot neben VOD Records + tape-mag.com (kein Rebrand). Disclaimer in Erst-Mail + prominenter Unsubscribe-Link.

### Schema-Migration `phase_b_bulk_invite_tracking` (additive)

- `invite_tokens.master_id` (uuid FK auf `crm_master_contact`, ON DELETE SET NULL) + Partial-Index
- `crm_master_contact.bulk_invite_sent_at` (timestamptz) + Partial-Index

### Backend-Code

- **`lib/job-tracker.ts`** — TS-Pendant zum Python `JobTracker` aus rc53.11. `tick()`, `setTotal()`, `isCancelled()` mit DB-Read-Throttle, `finish(status, summary)`, `appendLog()` mit Right-Truncate.
- **`emails/bulk-invite-vod-auctions.ts`** — Drei Intro-Varianten je Tier mit §7(3)-UWG-Disclaimer für T2/T3, optionaler Frank-Custom-Note (italic blockquote, max 500 chars).
- **`POST /admin/crm/contacts/bulk-invite`** — max 1.000 ids, returns 202 + `job_id`, async send 15ms-Throttle (66 mails/sec, well under Resend 100/sec). Pre-Validation klassifiziert skipped: no_email/blocked/already_sent/not_found.
- **`GET /store/email-preferences/unsubscribe-master`** — HMAC verifizieren, UPSERT in `crm_master_communication_pref` (`opted_in=false`), Mirror in `newsletter_subscribers` (`status='unsubscribed'`), audit-log.
- **`emails/layout.ts`** — `emailLayout`-opts erweitert um `unsubscribeUrl` (für master-id-basierten Unsub).

### Storefront

- `app/email-preferences/unsubscribe-master/page.tsx` — Server-Component proxy mit `x-publishable-api-key` (mirror `/newsletter/confirm`-Pattern).
- middleware.ts: `/email-preferences*` als public path.

### CRM-UI (`/app/crm` Contacts-Tab)

- Neuer "✉ Send Invite"-Button im `BulkActionBar` (Gold-Border).
- `BulkActionModal`-Case `invite` mit Auto-Tone-Hinweis je Kontakt-Typ, Custom-Note-Textarea (max 500 chars), "Skip already sent"-Checkbox, Job-ID-Toast.

### Doku während Phase B

- **`docs/optimizing/PHASE_B_REGISTRATION_OPENING_PLAN.md`** — Plan + Audit-Daten + DSGVO-Decision-Tree + Code-Plan.

## 4. Hotfixes nach Robin's ersten Klicks im UI

### rc53.15.1 — Smart-List-Filter-Pills sichtbar (Commit `00501b1`)

Robin: "wo finde ich das genau?" → Screenshot zeigte Overview-Tab.

**Befund:** Backend `/admin/crm/contacts` unterstützte seit rc53.4 die Filter-Werte `newsletter_subscribers` / `newsletter_unsubscribed` / `newsletter_only_leads`, aber das UI hat sie nie als Pills exposed. `FILTERS`-Array in `contacts-tab.tsx` war auf 7 Pre-rc53.4-Filter beschränkt. Konsequenz: Frank konnte die Phase-B-Bulk-Invite nicht ans richtige Segment zielen.

**Fix:** Drei Pills (📨 / 🔕 / 🌱) zwischen "MO-PDF only" und "Test accounts" platziert. `FilterKey`-Type um drei Werte erweitert.

### rc53.15.2 — Overview-Cards auf lokale CRM-DB statt Brevo-only (Commit `33a47fa`)

Robin's Beobachtung: "warum zeigt er hier nur 3601 Kontakte an?"

**Befund:** Overview-Cards zogen Daten aus Brevo-only-API statt aus der lokalen CRM-DB:
- `total_contacts` zog aus Brevo-Listen-Sum (vodCount + tapeMagCount = 21 + 3.580 = 3.601), nicht aus 20.826 Master-Contacts.
- `newsletter_optins` wurde durch Iteration über die ersten 50 Brevo-Contacts pro Liste mit Attribut-Check `NEWSLETTER_OPTIN === true` ermittelt — Attribut nicht durchgängig gesetzt, deshalb 0.
- `vod_auctions` (21) und `tape_mag` (3.580) waren korrekt, aber Label "VOD Auctions" suggerierte Auktions-Aktivität statt Brevo-Sendelisten-Reichweite.

**Fix:**
- Backend `/admin/customers/route.ts` — zwei zusätzliche parallel-Knex-Queries auf `crm_master_contact` und `crm_master_communication_pref`.
- Frontend Cards-Reordering (Total → Opt-ins → VOD-Brevo → Tape-mag-Brevo → Medusa, Funnel-Logik) + Subtitle-Hints.

**Erwartete Werte nach Deploy:** Total 20.826, Opt-ins 3.634, VOD-Brevo 21, Tape-mag-Brevo 3.580, Medusa 12.

### Pre-existing TS-Errors

Robin: "immer noch Fehler vorhanden?" — Verifikation zeigte 52 TS-Errors total, **0 davon aus Phase-A/B/Hotfix-Files**. Alle aus älteren Releases (Auction-Blocks, Discogs-Import, ERP, Health-Alerting, etc.). Backend-Build schreibt Artefakte trotz exit≠0, Backend läuft korrekt.

## 5. VPS-Working-Tree-Sync (post-rc53.15.2)

Robin: "ist alles committed, gepushed und deployed?"

**Befund:** Code lebt synchron auf Local + Origin + VPS. ABER: VPS-Working-Tree war 2 Commits hinter origin/main:
- `3ce4ff5` — pure-docs (CHANGELOG/TODO/CLAUDE.md für Hotfixes), kein Build-Bedarf
- `6cfadf6` — Robin's eigener `data+docs(rc53.16)` Bowie→David Bowie Artist-Merge (SQL via MCP, Audit-Doc, Meili-Reindex)

**Action:** `ssh vps && git pull --ff-only` — VPS-Working-Tree jetzt auf `6cfadf6`. Kein Build, kein Restart (rein hygienisch).

## 6. B2C Registrierungs-Funnel Audit + Verification-Doku

Robin: "sind alle b2c UI/UX Front-Ends für den registrierungsprozess gebaut und erreichbar?"

**Audit:** 16 Registration-Flow-Pages durchgeklickt, alle 200. 6 Flows identifiziert:
- A: Newsletter Sign-up (rc53.14)
- B: Waitlist Application
- C: Invite-Token Redemption
- D: Login/Forgot/Verify (AuthModal — kein dedizierter Page)
- E: Email-Preferences/Unsubscribe (rc53.15)
- F: Legal-Pages (Datenschutz/AGB/Impressum/Widerruf/Cookies)

**Doku-Output:** `docs/optimizing/B2C_REGISTRATION_FUNNEL_VERIFICATION.md` (Commit `ae73493`) — Production-URLs, User-Journey pro Flow, DSGVO-Touchpoints, Erwartungs-Checklisten, Smoke-Test-Skript, bekannte Gaps.

### Gefundener Gap: AuthModal-Register-Tab umgeht `invite_mode_active=true`

`storefront/src/lib/auth.ts::register()` ruft Medusa-native `/auth/customer/emailpass/register` direkt — KEIN Site-Mode-Check. Konsequenz: jeder mit Gate-Passwort `vod2026` kann sich frei registrieren, auch wenn nie eingeladen.

**Drei Optionen:** Quick (UI-Tab-Hide), Medium (Backend-Block), Long-term (Custom-Endpoint).

## 7. Custom Register-Endpoint Plan + Codex Review

Robin's Decision: "mir ist das Thema sehr wichtig. Vor Franks Test, möchte ich es eigenlich schon sauber haben." → Long-term (Option 3) als nächstes Release.

### Plan-Doc geschrieben

**`docs/optimizing/CUSTOM_REGISTER_ENDPOINT_PLAN.md`** (Commit `05003e8`) — Goal, Why-Now, Current-State mit file:line Refs, Target-Architecture mit Pseudocode, Storefront-Refactor + `/invite/[token]`-Refactor, Migration + Rollback, DSGVO/Audit, 10 Open Questions für Codex-Review.

### Codex Review (extern durchgeführt)

5 Findings (3× P1 critical, 2× P2 important):

| # | Severity | Finding | Resolution |
|---|---|---|---|
| **P1#1** | Critical | Pre-Approval-Filter zu breit (`is_blocked=false` lässt auch newsletter_only-Leads + abgelehnte Waitlist + mo_pdf-only durch) | EXISTS-Subquery auf `crm_master_source_link.source IN ('vodtapes_members', 'vod_records_*')`. Set ~14.500 → ~10.500 |
| **P1#2** | Critical | Auth+Customer leben in separater Schema-Domain, pg.transaction kann nicht zurückrollen | Compensation-Helper mit explicit cleanup; bevorzugt Medusa-Workflow `createCustomerAccountWorkflow` |
| **P1#3** | Critical | Token-Race bei concurrent submits — beide validieren, beide createn | Atomic `UPDATE … WHERE status='active' RETURNING *` upfront, Token-Release im Compensate |
| **P2#4** | Medium | DOI-Confirm updated Brevo + customer_stats, NICHT crm_master_communication_pref | `/store/newsletter/confirm` erweitern um `findOrCreateMasterByEmail` + `applyLocalCommPrefChange` |
| **P2#5** | Medium | 409 vs 422 leakt existing emails in invite-mode | Uniform 422 + `constantTimePad(120)` in invite-mode, ehrliches 409 nur in live-mode |

**Codex-Verdict:** **GO mit den 5 Korrekturen.** Workflow-Variante (P1#2 Option A) bevorzugt — Medusa's eingebaute Compensation strenger getestet.

### Plan-Doc Update mit Findings

Commit `ce81b09` — alle 5 Findings im Pseudocode mit `CODEX-FIX P{1|2}#N` markiert. Neue §12 Codex Review Findings, neue §13 Scope rc53.17, Estimate 10-13h → 14-16h, Status auf "Reviewed by Codex, ready for implementation".

## 8. Tags + GitHub Releases

Vier Releases live auf GitHub (alle 2026-05-08):

- **v1.0.0-rc53.14** — Public Newsletter-Sign-up + DSGVO-Checkboxes (Phase A)
- **v1.0.0-rc53.15** — Bulk-Invite Endpoint + UI für VOD Auctions Early-Access (Phase B)
- **v1.0.0-rc53.15.1** — CRM Smart-List-Filter-Pills sichtbar
- **v1.0.0-rc53.15.2** — CRM Overview-Cards auf lokale DB statt Brevo-only

## 9. Doku-Output dieser Session

Vier neue + drei updated Doku-Files:

| Datei | Status | Zweck |
|---|---|---|
| `docs/optimizing/PHASE_B_REGISTRATION_OPENING_PLAN.md` | NEU | Plan + Audit-Daten + DSGVO-Decision-Tree für Phase B |
| `docs/optimizing/B2C_REGISTRATION_FUNNEL_VERIFICATION.md` | NEU | Single-Source-of-Truth für alle 6 Funnel-Flows mit Test-Checkboxen |
| `docs/optimizing/CUSTOM_REGISTER_ENDPOINT_PLAN.md` | NEU | Long-term Plan mit Codex-reviewed Pseudocode |
| `docs/sessions/2026-05-08_phase_a_b_hotfixes_and_register_plan.md` | NEU (this) | Session-Log |
| `docs/architecture/CHANGELOG.md` | UPDATED | rc53.14, rc53.15, rc53.15.1, rc53.15.2 Sections |
| `docs/TODO.md` | UPDATED | Workstream §14 Status |
| `CLAUDE.md` | UPDATED | Last-Updated mit allen rc53.14→15.2 |

## 10. Frank-Workflow ist live

Frank kann in `/app/crm` jetzt:
1. Contacts-Tab öffnen → Filter "📨 Newsletter Subscribers" wählen → Liste zeigt 3.634 opted-in Master
2. Optional weiter eingrenzen (Tier, RFM-Segment, Country, Search)
3. Checkboxen für 10-20 Test-Personen setzen
4. Floating BulkActionBar → "✉ Send Invite" → Modal mit optionaler Custom-Note
5. Apply → JobTracker-Job-ID-Toast, Mails gehen mit ~66/sec raus
6. Empfänger klicken Token-Link in Mail → `/invite/<token>` → Account-Setup-Form → Auto-Login auf Homepage

## 11. Open Items für nächste Session (rc53.17)

Robin will Implementation in neuer Session starten (1M-Context-Reset).

### Hauptaufgabe: Custom Register-Endpoint (rc53.17, ~14-16h)

Plan: `docs/optimizing/CUSTOM_REGISTER_ENDPOINT_PLAN.md` — bereits Codex-reviewed.

**Implementation-Reihenfolge:**

1. `/store/newsletter/confirm` Erweiterung (P2#4) — kleiner Patch, schließt auch alte Lücke
2. Helper `lib/customer-register.ts` mit Compensation-Pattern (P1#2)
3. `POST /store/customer/register` Endpoint mit allen Fixes
4. `/invite/[token]` Refactor auf Helper
5. Storefront-Refactor (`lib/auth.ts` + AuthModal + AuthProvider)
6. Race-Test (10× concurrent submit auf gleiches Token)
7. Compensation-Drill (gezielter Crash zwischen Steps)
8. Smoke-Test
9. CHANGELOG + Tag rc53.17

**Verbleibende Open Questions** (während Implementation lokal/durch Test klären):

- §9.2 — exakte Medusa-2.13.1 `customerService.createCustomers()`-Signatur
- §9.4 — ob `createCustomerAccountWorkflow` in 2.13.1 existiert mit eingebauter Compensation, oder ob manuelle Cleanup-API der einzige Weg ist

### Phase B.5 (Backlog, nice-to-have)

- `/app/operations/bulk-invite` Job-Monitor-Page (Progress-Bars + Errors-Liste) — nach erstem echten Send sinnvoll
- Re-Opt-In-Mode für `/newsletter` (`?prefill=&via=re-opt-in`) — für künftige Re-Activation-Kampagnen

### Vor `live`-Mode-Switch

- Anwalts-Check für §7(3)-UWG-Disclaimer-Wording in Bulk-Invite-Mails — mit RSE-78 koppeln
- Rate-Limit auf `/store/newsletter` + `/store/waitlist` — Workstream §4 (Redis)

## 12. Commits-Liste

```
2b267d3 feat(newsletter): Public Sign-up-Page + DSGVO-Checkbox auf /apply (Phase A)
f625c2c feat(crm): Bulk-Invite Endpoint + UI für VOD Auctions Early-Access (Phase B)
d26d48c docs(rc53.14+rc53.15): CHANGELOG + TODO + CLAUDE.md für Phase A+B
00501b1 fix(crm): Smart-List-Filter-Pills für Newsletter Subscribers/Unsubscribed/Newsletter-Only sichtbar (rc53.15.1)
33a47fa fix(crm): Overview-Cards auf lokale CRM-DB statt Brevo-only (rc53.15.2)
3ce4ff5 docs(rc53.15.1+rc53.15.2): CHANGELOG + TODO + CLAUDE.md für Hotfixes
6cfadf6 data+docs(rc53.16): Bowie→David Bowie Artist-Merge + Audit-Doc für 2.063 weitere Duplikate  [Robin's parallel work]
ae73493 docs: B2C Registrierungs-Funnel Verifikations-Doku
05003e8 docs: Custom /store/customer/register Endpoint Implementation-Plan
ce81b09 docs(register-plan): Codex Review findings eingearbeitet
```

## 13. Lessons Learned

### Pattern: Codex-Review für komplexe Cross-Domain-Endpoints

Codex hat innerhalb einer Review 5 substantielle Findings produziert, die sonst während der Implementation entdeckt worden wären (oder in Production gelandet wären):
- Pre-Approval-Scope (semantischer Bug, würde DSGVO-Risiko bedeuten)
- Atomic-Cross-Domain-Compensation (Medusa-Architektur-Wissen)
- Token-Race-Condition (Concurrency-Pattern)
- DOI-Wire-Up-Lücke (existing-Code-Knowledge)
- Email-Enumeration (Security-Pattern)

→ Memory-Pattern für künftige Cross-Domain-Endpoint-Pläne mit Modul-Boundaries.

### Pattern: Audit-Queries via Supabase MCP vor Implementation

Vor Phase B haben wir mit drei MCP-Queries konkrete Tier-Counts gemessen:
- Tier 1: 3.634 (Newsletter opted-in)
- Tier 2: 6.455 (Webshop ohne Newsletter)
- Tier 3: 2.737 (Tape-mag Legacy)

Diese Zahlen haben die DSGVO-Decision-Tree gefüttert — Robin konnte fundiert entscheiden statt zu schätzen. Dauerte 5 Min, hätte sonst die Plan-Quality-Halbiert.

### Pattern: Layer-Konsistenz-Check vor Session-Ende

Das systematische "Local + Origin + VPS Working-Tree + Production-Code + Production-DB"-Reconcile-Diagramm hat Robin's "ist alles committed, gepushed, deployed?"-Frage strukturiert beantwortbar gemacht. Pattern für künftige Multi-Layer-Stacks.

### Lesson: UI-Filter-Pills müssen mit Backend-Filter-Werten synchron bleiben

rc53.4 (2026-05-04) hat Backend-Smart-List-Filter erweitert, aber UI-Array `FILTERS` blieb auf alter Liste. → Bei jedem Backend-Filter-Add IMMER die UI-Quelle mit-touchen oder defensiv aus Backend laden. (Das ist verwandt mit `feedback_grep_all_callers.md`.)

### Lesson: Overview-Card-Datenquellen müssen mit Tab-Datenquellen konsistent sein

Robin's Screenshot-Verwirrung "3.601 vs 20.826" kam daher dass Overview-Cards aus Brevo-API-direkt zogen, während Contacts-Tab aus lokaler CRM-DB. Das gleiche Daten-Konzept sollte aus der gleichen Quelle kommen — sonst entstehen widersprüchliche UI-Ansichten.

---

**Author:** Claude Opus 4.7
**Reviewer:** Robin (parallel rc53.16-Bowie-Merge in eigener Session)
