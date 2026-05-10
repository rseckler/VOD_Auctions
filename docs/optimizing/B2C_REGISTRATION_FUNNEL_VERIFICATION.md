# B2C Registrierungs-Funnel — Verifikations-Doku

**Stand:** 2026-05-10 (rc53.17.2 — alle 5 Codex-Findings live in Production validiert)
**Platform Mode:** `beta_test` (Gate-Passwort: `vod2026`)
**`invite_mode_active`:** `true` · **`apply_page_visible`:** `true` · **`catalog_visibility`:** `all`
**Production:** https://vod-auctions.com · **API:** https://api.vod-auctions.com

Diese Doku ist die **Single Source of Truth** für alle B2C-Touchpoints im Registrierungs-Funnel. Mit den unten verlinkten URLs kannst Du jeden Flow von Hand durchklicken und mit den Erwartungs-Checklisten abgleichen.

> **🚀 Update 2026-05-10 (rc53.17 + rc53.17.1 + rc53.17.2):** Der **Custom `/store/customer/register`-Endpoint** ist live, die in der vorigen Version noch dokumentierte „Known Gap" (Self-Sign-up bypasst `invite_mode_active`) ist **geschlossen**. Alle 5 Codex-Findings (3× P1 critical + 2× P2 important) sind in Production unter realer Concurrency-Last validiert. Siehe [CHANGELOG rc53.17/.1/.2](../architecture/CHANGELOG.md), [Plan + Codex-Review](CUSTOM_REGISTER_ENDPOINT_PLAN.md), [GitHub Releases](https://github.com/rseckler/VOD_Auctions/releases).

---

## Übersicht der Flows

| Flow | Wer? | Endzustand |
|---|---|---|
| **A** Newsletter Sign-up | Anyone — kein Account | Email-Adresse in Brevo + `crm_master_communication_pref.opted_in=true` |
| **B** Waitlist Application | Anyone — Early-Access-Bewerbung | Eintrag in `waitlist_applications` (status=pending), Frank approved manuell |
| **C** Invite-Token Redemption | Bulk-Invite-Empfänger ODER approved Waitlist | Medusa-`customer`-Account + `vod_invite_session`-Cookie + auto-Login |
| **D** Login / Forgot / Verify (AuthModal) | Existing User | Session-Token in localStorage |
| **E** Email-Preferences / Unsubscribe | Empfänger jeder Marketing-Mail | `opted_in=false` in `crm_master_communication_pref` + `newsletter_subscribers.status='unsubscribed'` |

---

## Flow A — Newsletter Sign-up (rc53.14, Phase A)

### Pages

| URL | Zweck | Public? |
|---|---|---|
| https://vod-auctions.com/newsletter | Public Sign-up-Form | ✅ Whitelisted |
| https://vod-auctions.com/newsletter/confirm?token=&email= | DOI-Click-Handler (Server-Component proxy → Backend → Brevo upsert) | ✅ Whitelisted |
| https://vod-auctions.com/newsletter/confirmed | Success-Page mit "What to expect"-Liste | ✅ Whitelisted |

### Flow

1. User landet auf `/newsletter` (z.B. via Footer-Link, Marketing, organisch)
2. Trägt Email ein, hakt **DSGVO-Consent-Checkbox** an, klickt **Subscribe**
3. Form ruft `POST /store/newsletter` (existing seit rc53.4) — generiert HMAC-Token (24h gültig), sendet Resend-Mail
4. UI wechselt zu Success-State **"Check your inbox"** mit "try a different email"-Reset
5. User bekommt Email mit **"Confirm Subscription"**-Button → Link zu `/newsletter/confirm?token=XXX&email=...`
6. Storefront-Server-Component proxiet zu Backend `GET /store/newsletter/confirm` (mit `x-publishable-api-key`)
7. Backend verifiziert HMAC, dann **(rc53.17.2 erweitert)** synchron auf vier Stores:
   - Brevo `upsertContact` (List 4) — `NEWSLETTER_OPTIN=true`, `NEWSLETTER_CONFIRMED=true`
   - `crm_master_contact` find-or-create (lifecycle=`lead`, tags=`[newsletter_only]`) — auto-Master für jeden DOI-Click
   - `crm_master_communication_pref` UPSERT mit `opted_in=true`, `source='storefront_signup'`, channel=`email_marketing`
   - `newsletter_subscribers` UPSERT mit `status='active'` (vorher rc53.4 schrieb `'subscribed'` was die CHECK-Constraint verletzte — fixed in rc53.17.2 Commit `7e7ba17`)
   - `crm_master_audit_log` neuer Eintrag `action='newsletter_optin_confirmed'`, `source='self_service'`
   - `customer_stats.tags += 'newsletter_subscriber'` falls Medusa-Customer existiert
8. Redirect zu `/newsletter/confirmed` (success) ODER `/newsletter/confirmed?error=invalid` (token expired/invalid)

### Erwartungs-Checkliste

- [ ] `/newsletter` zeigt Hero "Stay in the Loop" + "What you'll get"-Liste mit 4 Bullets
- [ ] DSGVO-Consent-Checkbox blockiert Submit wenn nicht angekreuzt
- [ ] Privacy-Link öffnet `/datenschutz` in neuem Tab
- [ ] Submit zeigt Loading-State, dann Success-State
- [ ] Success-State zeigt **eingegebene Email** (Mono-Font, Gold)
- [ ] "Try a different email"-Link kehrt zur Form zurück
- [ ] Confirmation-Mail kommt in Inbox an (nicht Spam) mit Subject "Confirm your VOD Auctions newsletter subscription"
- [ ] Klick auf Confirm-Button im Mail landet auf `/newsletter/confirmed` mit grünem Checkmark + "What to expect"-Liste
- [ ] Bei `?error=invalid` (Token expired) zeigt rote XCircle + "Link expired or invalid"
- [ ] Browser-Refresh auf `/newsletter` während `beta_test` öffnet die Form **ohne Gate-Redirect** (whitelisted)
- [x] **Validation (rc53.17.2, 2026-05-10):** E2E-DOI mit valid HMAC → alle 4 CRM-Stores synchron geflippt: master created (lead/newsletter_only), comm_pref opted_in=true source=storefront_signup, newsletter_subscribers status=active, audit-row newsletter_optin_confirmed

### Test-Kommando (manuell)

```bash
# 1. Sign-up
curl -X POST 'https://api.vod-auctions.com/store/newsletter' \
  -H 'content-type: application/json' \
  -H 'x-publishable-api-key: pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d' \
  -d '{"email":"test+nl@example.com"}'

# 2. Inbox checken, Confirm-Button klicken — landet auf /newsletter/confirmed
```

---

## Flow B — Waitlist Application

### Pages

| URL | Zweck | Public? |
|---|---|---|
| https://vod-auctions.com/apply | Bewerbungs-Form (Name + Email + Country + Genres + Channels + Referrer + DSGVO) | ✅ Whitelisted |
| https://vod-auctions.com/apply/confirm | "Application received" Confirmation-Page | ✅ Whitelisted |

### Flow

1. User landet auf `/apply` (z.B. via Gate-Page Link, Marketing, "Already have invite?")
2. Trägt Daten ein, hakt **DSGVO-Consent-Checkbox** an (rc53.14), klickt **"Apply now →"**
3. Form ruft `POST /store/waitlist` — INSERT in `waitlist_applications` (status=pending), schickt `waitlist-confirm`-Mail
4. Redirect zu `/apply/confirm` mit "We review applications in waves. You'll hear from us within 1-2 weeks"
5. **Frank-Workflow:** Im Admin-UI `/app/waitlist` reviewed Frank pending-Applications, approved sie (oder rejected), klickt "Invite" → Token-Generation + `invite-welcome`-Mail
6. Approved User bekommt Email mit Token-Link → siehe Flow C

### Erwartungs-Checkliste

- [ ] `/apply` zeigt Hero "Early Access for Collectors" + Live-Counter "X collectors on the waitlist"
- [ ] Form-Felder Name + Email Pflicht, alle anderen optional
- [ ] Checkbox-Grids für Genres + Buy-Channels funktionieren (Multi-Select)
- [ ] DSGVO-Consent-Checkbox blockiert Submit wenn nicht angekreuzt (rc53.14 hot-fix)
- [ ] Privacy-Link öffnet `/datenschutz` in neuem Tab
- [ ] Submit zeigt Loading-State, redirect zu `/apply/confirm`
- [ ] `/apply/confirm` zeigt Gold-Checkmark + "Application received" + Instagram-Link
- [ ] Confirmation-Mail kommt in Inbox an
- [ ] Footer-Link "Already have an invite? Redeem it here" öffnet Prompt für URL/Token → leitet zu `/invite/<token>`

### Test-Kommando

```bash
# Pending-Applications listen (admin auth required)
curl 'https://api.vod-auctions.com/admin/waitlist' --cookie connect.sid=...
```

---

## Flow C — Invite-Token Redemption (rc53.17 refactored)

### Pages

| URL | Zweck | Public? |
|---|---|---|
| https://vod-auctions.com/invite/[token] | Token-Validation + Account-Creation-Form | ✅ Whitelisted (`/invite/*`) |

### Flow

1. User klickt **"Account anlegen"**-Button in Bulk-Invite-Mail (Phase B) ODER `invite-welcome`-Mail (Waitlist-Approve)
2. Email-Link: `https://vod-auctions.com/invite/<10-char-raw-token>`
3. Storefront-Page ruft `GET /store/invite/:token` zur Verifikation
4. **Valid:** Form mit pre-filled Email (read-only), firstName/lastName/password/confirmPassword
5. User füllt aus, klickt **Submit**
6. Form ruft `POST /store/invite/:token` → der Endpoint delegiert ab rc53.17 an den **shared `registerCustomer()`-Helper** (`backend/src/lib/customer-register.ts`), der dasselbe Codepfad wie `/store/customer/register` nutzt:
   - **Atomic Token-Claim** (CODEX P1#3): `UPDATE invite_tokens SET status='used' WHERE token=? AND status='active' AND expires_at > NOW() RETURNING *` — race-condition-safe, exakt ein concurrent submit gewinnt
   - **Email-Match-Check:** Email aus `invite_tokens.email` (NICHT aus Body) — verhindert dass Redeemer eine fremde Email registriert
   - **Auth-Identity** via `authService.register("emailpass", { body: { email, password } })` (Medusa 2.13.1 Service-API, kein HTTP-Loopback mehr)
   - **Customer + auth-link** atomic via `createCustomerAccountWorkflow` (Medusa-Workflow mit Built-in Step-Compensation)
   - **CRM-Master find-or-create** mit `medusa_customer_id`-Link, lifecycle=`active`, source-link `self_signup_via_invite` mit `match_method='self_signup'` (CHECK-Constraint extended in rc53.17.1 via Migration `crm_master_source_link_allow_self_signup_match_methods`)
   - **DSGVO-Audit** in `crm_master_audit_log`: `action='invite_redemption'`, `details={agb_accepted_at, ip, user_agent, invite_token_id, …}` — AGB implizit durch Token-Click + Form-Submit
   - **Compensation-Pattern** (CODEX P1#2): Bei Crash zwischen den Steps werden Customer + Auth-Identity gelöscht UND Token wieder auf `status='active'` gesetzt (validiert mit echtem Crash in rc53.17.1 Race-Test)
   - `waitlist_applications.status='registered'` + `registered_at=NOW()` falls `application_id` am Token
7. Backend liefert Session-JWT direkt zurück (kein nachträgliches Login mehr nötig)
8. Frontend setzt `medusa_auth_token` in localStorage + `vod_invite_session`-Cookie (1 Jahr)
9. Auto-Redirect `/`
10. **User ist jetzt eingeloggt** — Header zeigt Account-Menu, Catalog-Browse möglich

**Invalid-State** (Token abgelaufen, schon redeemed, fake):
- Page zeigt rote XCircle + "Link expired or invalid" + "Apply for early access"-Link zu `/apply`

### Erwartungs-Checkliste

- [ ] Mit echtem Token: Form zeigt **Email pre-filled** (read-only, grau)
- [ ] firstName + lastName Pflicht
- [ ] Password ≥ 8 Zeichen, confirmPassword muss matchen
- [ ] Submit setzt `medusa_auth_token` in localStorage + `vod_invite_session`-Cookie
- [ ] Auto-Redirect `/` — Homepage zeigt eingeloggten Header
- [ ] Mit Fake-Token (z.B. `/invite/test-token-not-real`): Invalid-State mit "Apply for early access"-Link
- [ ] Mit re-used Token: Invalid-State mit "already used" reason
- [x] **P1#3 Atomic-Claim validiert (rc53.17.1, 2026-05-10):** 10× concurrent POST → 1× 200 success mit JWT, 9× 422 invite_invalid, 0× 5xx; DB-Verify: token=used, customer linked, audit-row, source-link
- [x] **P1#2 Compensation validiert unter realem Crash (rc53.17.1, 2026-05-10):** Race-Test Run 1 hatte einen unbeabsichtigten 500-Crash beim CRM-Insert — Compensate() räumte sauber auf (0 customer, 0 master, 0 auth_identity, Token wieder `active`)

### Test-Kommando

```bash
# Token validieren (ohne Redemption)
curl 'https://api.vod-auctions.com/store/invite/<RAW-TOKEN-HERE>' \
  -H 'x-publishable-api-key: pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d'
```

---

## Flow D — Login / Forgot / Verify (AuthModal)

**Wichtig:** Es gibt KEINE eigenen Pages `/login`, `/register`, `/sign-up`. Stattdessen ein **AuthModal** (`storefront/src/components/AuthModal.tsx`) mit 4 Modes (`login`, `register`, `forgot`, `verify-email`). Modal wird über den Header-Button "Login" geöffnet (`HeaderAuth.tsx`, MobileNav).

### Pages

| URL | Zweck | Public? |
|---|---|---|
| (Modal triggered from header on any page) | Login / Register / Forgot / Verify-Email | n/a (overlay) |
| https://vod-auctions.com/reset-password?token= | Reset-Password-Token-Click aus Email | ✅ Whitelisted |
| https://vod-auctions.com/verify?token= | Email-Verify-Token-Click aus Welcome-Mail | ✅ Whitelisted |

### Flow Login

1. User klickt **"Login"** im Header → AuthModal öffnet sich im `mode="login"`
2. Email + Password → Submit ruft `POST /auth/customer/emailpass`
3. Bei Erfolg: `medusa_token` in localStorage (oder sessionStorage wenn "Remember me" off), Modal schließt
4. Header wechselt zu Account-Menu

**Rate-Limit:** Nach 5 fehlgeschlagenen Versuchen → 30s Cooldown (Frontend-only, sollte mit Backend-Rate-Limit ergänzt werden — Workstream §4)

### Flow Register (rc53.17 — Custom Endpoint, Site-Mode-Gated)

1. User klickt im AuthModal **"Sign up"-Tab**
2. Email + Password + firstName + lastName + Newsletter-Optin + AGB-Accept → Submit
3. ruft **`POST /store/customer/register`** (NEU rc53.17, single source-of-truth Endpoint) — **NICHT mehr** Medusa-native `/auth/customer/emailpass/register`
4. Backend (`registerCustomer()`-Helper) prüft in dieser Reihenfolge:
   - **Site-Mode-Gate** (CODEX P1#1): Wenn `invite_mode_active=true` → Email muss in `crm_master_contact` mit `source_link.source IN ('vodtapes_members', 'vod_records_db1', 'vod_records_db2013', 'vod_records_db2013_alt')` existieren (echte Bestandskunden, ~10.500 Master). Newsletter-only-Leads, mo_pdf-Imports, imap_*-Auto-Extracts werden **explizit ausgeschlossen** und müssen `/apply` durchlaufen.
   - **Existing-Customer-Check** mit Email-Enumeration-Schutz (CODEX P2#5): in `invite_mode_active=true` returnen sowohl 409 `email_in_use` als auch 422 `invite_required` BEIDE uniformes 422 `registration_not_possible` mit `constantTimePad(150)` (random 50-250ms Delay) — Body + Latenz sind nicht distinguishable
   - **Auth + Customer atomic** via `authService.register()` + `createCustomerAccountWorkflow` (CODEX P1#2 mit Compensation-Pattern bei Crash)
   - **CRM-Master find-or-create** + `medusa_customer_id`-Link + Source-Link `self_signup` (`match_method='self_signup'`)
   - **AGB-Audit:** `crm_master_audit_log.details.agb_accepted_at` + IP + User-Agent persistiert (DSGVO-Beweislast)
   - **Welcome-Mail** server-side getriggert (kein storefront-side fire-and-forget mehr)
   - **Newsletter-DOI-Mail** falls `newsletter_optin=true` — User landet im `pending`-State bis er die DOI-Mail bestätigt (Flow A Schritt 5-8)
5. Bei Erfolg liefert der Endpoint Session-JWT direkt mit zurück (kein nachträgliches Login)
6. Storefront setzt Token + ruft `getCustomer()` + dispatched `vod:registration-complete`-Event für Onboarding-Modal

### Flow Forgot

1. User klickt **"Forgot password?"** im Login-Mode
2. Email → Submit ruft `POST /auth/customer/emailpass/reset-password` (Medusa-native)
3. Modal zeigt "Reset email sent" Confirmation
4. User bekommt Mail mit Link → `/reset-password?token=...`
5. `/reset-password` zeigt new-password-Form, ruft `POST /auth/customer/emailpass/update`

### Flow Verify

1. Bei Registration → Welcome-Mail mit Verify-Link → `/verify?token=...`
2. `/verify`-Page validiert Token, markiert Email als verified

### Erwartungs-Checkliste

- [ ] Header-"Login"-Button öffnet AuthModal
- [ ] Modal-Tabs Login ↔ Sign up ↔ Forgot wechselbar
- [ ] Password-Strength-Meter zeigt weak/medium/strong (Register-Mode)
- [ ] Rate-Limit nach 5 Failed-Logins: Submit disabled mit Countdown-Anzeige
- [ ] AGB-Accept-Checkbox blockiert Register-Submit wenn nicht angekreuzt (storefront-side) UND backend antwortet 422 `agb_not_accepted` wenn manuell umgangen
- [ ] Newsletter-Optin-Checkbox optional (default off) — bei `true` kommt zusätzlich DOI-Mail
- [ ] `/reset-password?token=valid` zeigt new-password-Form
- [ ] `/reset-password?token=invalid` zeigt error
- [ ] `/verify?token=valid` zeigt success
- [ ] Header zeigt nach Login Account-Menu mit korrektem Namen
- [x] **Site-Mode-Gate für Register validiert (rc53.17, 2026-05-10):** im `invite_mode_active=true` returnt unbekannte Email 422 `registration_not_possible` mit `apply_url: "/apply"`
- [x] **Email-Enumeration-Schutz validiert (rc53.17.2, 2026-05-10, P2#5):** 5× unknown vs 5× known existing-customer (`bidder1@test.de`) → 1 distinct body hash über alle 10 Probes, Latency-Bänder vollständig überlappend (119-269ms vs 119-275ms)

### ✅ Closed: Self-Sign-up Site-Mode-Gate (rc53.17, 2026-05-09)

**Vorher (rc53.16 und früher):** `site_config.invite_mode_active=true` wurde nur von der Middleware für `/apply`-Sichtbarkeit gelesen, NICHT vom Register-Pfad. `lib/auth.ts::register()` rief Medusa-native `/auth/customer/emailpass/register` direkt — jeder mit Gate-Passwort konnte sich frei einen Account anlegen.

**Fix (rc53.17, Codex-reviewed):** Custom `POST /store/customer/register`-Endpoint mit Helper `lib/customer-register.ts` als Single-Source-of-Truth. Closes the gate **at the API layer** (nicht UI-only) — auch DevTools-Bypass + direkte API-Calls werden abgewiesen. Storefront-side `register()` ruft den neuen Endpoint, AuthModal + AuthProvider sind auf die neue Signatur (`agbAccepted: true` als Pflichtparam) angepasst. Der Helper wird auch von `/store/invite/[token]` POST aufgerufen (DRY) — beide Pfade laufen über dieselbe Atomic-Claim + Compensation + CRM-Link-Logik.

**Codex-Findings (alle 5 in Production validiert):**

| Finding | Mechanismus | Validation |
|---|---|---|
| P1#1 Pre-Approval-Filter | `crm_master_source_link.source IN (vodtapes_members, vod_records_db1, vod_records_db2013, vod_records_db2013_alt)` — Set ~10.500 Master | DB-Query gegen Production-Daten |
| P1#2 Atomic-Compensation | `authService.deleteAuthIdentities` + `customerService.deleteCustomers` + Token-Release bei Crash zwischen Steps | Run-1 Race-Test crashed unfreiwillig → Compensate() räumte 100% sauber auf |
| P1#3 Atomic-Token-Claim | `UPDATE invite_tokens SET status='used' WHERE status='active' AND expires_at > NOW() RETURNING *` | 10× concurrent → 1× 200, 9× 422, 0 zombies |
| P2#4 DOI-Click flippt CRM-Stores | `findOrCreateMasterByEmail` + `applyLocalCommPrefChange` + `newsletter_subscribers` + `crm_master_audit_log` synchron in `/store/newsletter/confirm` | E2E mit valid HMAC: alle 4 Stores synchron geflippt |
| P2#5 Email-Enumeration uniform | `constantTimePad(150)` + identical body in invite-mode für 409- und 422-Pfade | 5×5 Probes: 1 distinct body hash, Latency-Bänder fully overlapping |

**Files:** `backend/src/lib/customer-register.ts` (NEU), `backend/src/lib/newsletter-doi.ts` (NEU), `backend/src/api/store/customer/register/route.ts` (NEU), `backend/src/api/store/invite/[token]/route.ts` (refactored auf Helper), `backend/src/api/store/newsletter/confirm/route.ts` (P2#4-Erweiterung), `storefront/src/lib/auth.ts` (named `RegisterOptions` statt positional), `AuthProvider.tsx` + `AuthModal.tsx` (Signatur-Update mit Pflicht-`agbAccepted`).

---

## Flow E — Email-Preferences / Unsubscribe (rc53.15, Phase B)

### Pages

| URL | Zweck | Public? |
|---|---|---|
| https://vod-auctions.com/email-preferences/unsubscribe-master?token=&id= | Master-ID-basierter Unsub aus CRM Bulk-Invite (rc53.15) | ✅ Whitelisted |
| https://vod-auctions.com/email-preferences/unsubscribe?token=&id= | Medusa-Customer-basierter Unsub (legacy, weniger genutzt) | ✅ Whitelisted |
| https://vod-auctions.com/email-preferences/unsubscribed | Confirmation-Page (success/error states) | ✅ Whitelisted |

### Flow (Master-ID)

1. User klickt **"Unsubscribe"**-Link im Footer einer Bulk-Invite-Mail
2. Link: `https://vod-auctions.com/email-preferences/unsubscribe-master?token=<HMAC>&id=<master_uuid>`
3. Storefront-Server-Component proxiet zu Backend `GET /store/email-preferences/unsubscribe-master`
4. Backend verifiziert HMAC, UPSERT in `crm_master_communication_pref` (`opted_in=false`, `source='unsubscribe_master_link'`)
5. Mirror in `newsletter_subscribers` (`status='unsubscribed'`, `unsubscribed_at=NOW()`)
6. Audit-Log-Eintrag `crm_master_audit_log` mit `action='unsubscribe_email_marketing'`, `source='self_service'`
7. Redirect zu `/email-preferences/unsubscribed` (success ohne error-param)

### Erwartungs-Checkliste

- [ ] Klick auf Unsub-Link in Bulk-Invite-Mail landet auf `/email-preferences/unsubscribed` (success)
- [ ] In DB: `crm_master_communication_pref.opted_in=false` für den Master
- [ ] In DB: `newsletter_subscribers.status='unsubscribed'` falls Email matchen
- [ ] In DB: `crm_master_audit_log` neuer Eintrag mit `action='unsubscribe_email_marketing'`
- [ ] Bei Fake-Token: Redirect zu `/email-preferences/unsubscribed?error=invalid` mit XCircle
- [ ] Im CRM `/app/crm` Smart-List "🔕 Unsubscribed" enthält den Master nach Klick

### Test-Kommando

```bash
# Generate master-unsub-URL für einen Test-Master (admin auth required)
# Backend-Side via SQL:
SELECT 'https://vod-auctions.com/email-preferences/unsubscribe-master?token=' ||
       encode(hmac(id::text || ':master_unsubscribe', current_setting('revalidate_secret'), 'sha256'), 'hex')
       || '&id=' || id
FROM crm_master_contact
WHERE primary_email_lower = 'test+nl@example.com';
```

---

## Flow F — Legal-Pages (Footer + Inline-Links)

| URL | Status | Wo verlinkt |
|---|---|---|
| https://vod-auctions.com/datenschutz | ✅ rc53.14: §12 Newsletter erweitert | DSGVO-Checkboxen, alle Form-Footers |
| https://vod-auctions.com/agb | ✅ | AuthModal Register-AGB-Accept-Checkbox, Footer |
| https://vod-auctions.com/impressum | ✅ | Footer |
| https://vod-auctions.com/widerruf | ✅ | Footer |
| https://vod-auctions.com/cookies | ✅ | Cookie-Banner, Datenschutz §15 |

---

## Erweitertes Smoke-Test-Skript

Falls Du alles in einem Rutsch checken willst (200-Status-Verifikation):

```bash
for url in \
  /newsletter \
  /newsletter/confirmed \
  /apply \
  /apply/confirm \
  /invite/test-token-not-real \
  /reset-password \
  /verify \
  /gate \
  /email-preferences/unsubscribed \
  /datenschutz \
  /agb \
  /impressum \
  /widerruf \
  /cookies \
  /; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -L "https://vod-auctions.com${url}")
  printf "%-50s → %s\n" "$url" "$code"
done
```

Erwartete Ausgabe (Stand 2026-05-10):

```
/newsletter                                        → 200
/newsletter/confirmed                              → 200
/apply                                             → 200
/apply/confirm                                     → 200
/invite/test-token-not-real                        → 200
/reset-password                                    → 200
/verify                                            → 200
/gate                                              → 200
/email-preferences/unsubscribed                    → 200
/datenschutz                                       → 200
/agb                                               → 200
/impressum                                         → 200
/widerruf                                          → 200
/cookies                                           → 200
/                                                  → 200
```

### API-Smoke-Tests (rc53.17 Custom Register Endpoint)

```bash
PUBLISHABLE_KEY="pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d"

# 1. Validation 400 — fehlende Pflichtfelder
curl -s -X POST https://api.vod-auctions.com/store/customer/register \
  -H "content-type: application/json" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  -d '{"email":"smoke@example.com"}' \
  -w "\nHTTP %{http_code}\n"
# Expected: {"error":"validation_failed","field":"password"} HTTP 400

# 2. AGB-Gate 422
curl -s -X POST https://api.vod-auctions.com/store/customer/register \
  -H "content-type: application/json" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  -d '{"email":"smoke@example.com","password":"TestPw1234","first_name":"Test","agb_accepted":false}' \
  -w "\nHTTP %{http_code}\n"
# Expected: {"error":"agb_not_accepted"} HTTP 422

# 3. Site-Mode-Gate 422 (unbekannte Email in invite_mode_active=true)
curl -s -X POST https://api.vod-auctions.com/store/customer/register \
  -H "content-type: application/json" \
  -H "x-publishable-api-key: $PUBLISHABLE_KEY" \
  -d "{\"email\":\"smoke-$(date +%s)@example.com\",\"password\":\"TestPw1234\",\"first_name\":\"Test\",\"agb_accepted\":true}" \
  -w "\nHTTP %{http_code}\n"
# Expected: {"error":"registration_not_possible","message":"Registration is currently invite-only. Apply for early access at /apply.","apply_url":"/apply"} HTTP 422
```

Race-condition + Compensation-Drill: `scripts/test_register_race.sh` (Robin-approved für Production, sonst gegen Staging).

---

## Was noch fehlt / offen ist

| Item | Severity | Tracking |
|---|---|---|
| ~~Self-Sign-up via AuthModal-Register umgeht `invite_mode_active=true`~~ | ✅ **Closed in rc53.17** (Custom Endpoint mit Site-Mode-Gate, Codex-reviewed, alle 5 Findings live validiert) | — |
| Rate-Limit auf `/store/newsletter`, `/store/waitlist` und `/store/customer/register` | ⚠️ Low — niedriges Risiko in beta_test, vor `live`-Mode hochziehen | Workstream §4 (Redis) — TODO-Kommentare in route.ts |
| Compensation-Drill als Automated-Test (forced crash zwischen Auth + Customer + CRM-Steps) | 💡 Low — wurde in rc53.17.1 unfreiwillig real validiert (Run-1 CHECK-Constraint-Crash); automated Test wäre nice-to-have | Backlog |
| Job-Monitor-Page `/app/operations/bulk-invite` (Progress + Errors) | 💡 Nice-to-have nach erstem echten Bulk-Send | Phase B.5 in TODO |
| Re-Opt-In-Mode für `/newsletter` (`?prefill=&via=re-opt-in`) | 💡 Nice-to-have für künftige Re-Activation-Kampagnen | Phase B.5 |
| Anwalts-Check für §7(3) UWG Disclaimer-Wording in Bulk-Invite-Mails | ⚠️ Empfohlen vor öffentlichem Launch | RSE-78 koppeln |
| Brevo-Cleanup für Test-Emails der `@vod-auctions.example`-Domain (entstehen bei DOI-Validation-Tests) | 💡 Low — bouncen automatisch, kein Funktions-Impact | manuell wenn Liste 4 zu voll wird |
| `/email-preferences/unsubscribe` (Medusa-Customer-Variante) hat keine eigene Storefront-Page — Email-Link führt ins Leere | ⚠️ Latent (heute geringe Auswirkung weil ~1 Medusa-Customer) | wenn echte Customers da sind |

---

## Doku-Pflege

Diese Doku **bei jedem Phase-B-Folge-Deploy aktualisieren** — wenn neue Pages dazukommen, Flows ändern oder DSGVO-Texte angepasst werden.

**Letzte Aktualisierung:** 2026-05-10 nach rc53.17 / rc53.17.1 / rc53.17.2 — Custom Register Endpoint live, alle 5 Codex-Findings in Production validiert, Known Gap closed
**Vorherige Versionen:** 2026-05-09 (rc53.15.2 + initial Funnel-Audit)
**Author:** Claude (rc53.17 Implementation + Validation)
**Reviewer:** Robin
