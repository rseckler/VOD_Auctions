# B2C Registrierungs-Funnel — Verifikations-Doku

**Stand:** 2026-05-09
**Platform Mode:** `beta_test` (Gate-Passwort: `vod2026`)
**`invite_mode_active`:** `true` · **`apply_page_visible`:** `true` · **`catalog_visibility`:** `all`
**Production:** https://vod-auctions.com · **API:** https://api.vod-auctions.com

Diese Doku ist die **Single Source of Truth** für alle B2C-Touchpoints im Registrierungs-Funnel. Mit den unten verlinkten URLs kannst Du jeden Flow von Hand durchklicken und mit den Erwartungs-Checklisten abgleichen.

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
7. Backend verifiziert HMAC, ruft Brevo `upsertContact` (List 4), markiert `customer_stats.tags += 'newsletter_subscriber'` falls Medusa-Customer existiert
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

## Flow C — Invite-Token Redemption

### Pages

| URL | Zweck | Public? |
|---|---|---|
| https://vod-auctions.com/invite/[token] | Token-Validation + Account-Creation-Form | ✅ Whitelisted (`/invite/*`) |

### Flow

1. User klickt **"Account anlegen"**-Button in Bulk-Invite-Mail (Phase B) ODER `invite-welcome`-Mail (Waitlist-Approve)
2. Email-Link: `https://vod-auctions.com/invite/<32-char-raw-token>`
3. Storefront-Page ruft `GET /store/invite/:token` zur Verifikation
4. **Valid:** Form mit pre-filled Email (read-only), firstName/lastName/password/confirmPassword
5. User füllt aus, klickt **Submit**
6. Form ruft `POST /store/invite/:token` mit Daten → Backend macht:
   - Auth-Identity bei Medusa via `/auth/customer/emailpass/register`
   - Customer-Row in `customer`-Tabelle
   - Token markiert als `redeemed`
   - Falls `master_id` am Token: `crm_master_contact.medusa_customer_id` updaten + `lifecycle_stage='active'`
7. Frontend setzt `medusa_auth_token` in localStorage + `vod_invite_session`-Cookie (1 Jahr)
8. Auto-Redirect `/`
9. **User ist jetzt eingeloggt** — Header zeigt Account-Menu, Catalog-Browse möglich

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

### Flow Register (⚠️ siehe Known Gap unten)

1. User klickt im AuthModal **"Sign up"-Tab**
2. Email + Password + firstName + lastName + Newsletter-Optin + AGB-Accept → Submit
3. ruft `POST /auth/customer/emailpass/register` direkt → Account wird erstellt
4. Auto-Login danach via `POST /auth/customer/emailpass`

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
- [ ] AGB-Accept-Checkbox blockiert Register-Submit wenn nicht angekreuzt
- [ ] Newsletter-Optin-Checkbox optional (default off)
- [ ] `/reset-password?token=valid` zeigt new-password-Form
- [ ] `/reset-password?token=invalid` zeigt error
- [ ] `/verify?token=valid` zeigt success
- [ ] Header zeigt nach Login Account-Menu mit korrektem Namen

### ⚠️ Known Gap: Self-Sign-up bypasst `invite_mode_active`

**Problem:** `site_config.invite_mode_active=true` soll bedeuten "Registrierung nur per Invite". Die middleware liest das Flag, aber **NICHT der Register-Tab im AuthModal**. `lib/auth.ts::register()` ruft `/auth/customer/emailpass/register` direkt — Medusa-nativ, ohne unseren Site-Mode-Check. Konsequenz: jeder, der das Gate-Passwort kennt, kann sich frei registrieren.

**Spuren:**
- `storefront/src/lib/auth.ts:6-62` — register-Funktion ohne Mode-Check
- `storefront/src/components/AuthModal.tsx:46` — `mode` State erlaubt `register` ohne Bedingung
- `storefront/src/components/AuthProvider.tsx:223` — register wird unconditioanl exposed

**Empfehlung (3 Optionen):**
1. **Quick:** AuthModal "Sign up"-Tab wird verstecket wenn `invite_mode_active=true`. Stattdessen Hinweis "Want to join? Apply for early access at /apply". ~30 Min Code (Site-Mode in AuthProvider lesen, in Modal prüfen).
2. **Medium:** Backend-Middleware vor `/auth/customer/emailpass/register` — wenn `invite_mode_active=true`, reject 403. Closes the door auch bei direkten API-Calls.
3. **Long-term:** Custom `/store/customer/register`-Endpoint, der die existierende `apply`-Logik replizieren würde — overkill für Phase B.

**Vorschlag:** Quick (Option 1) reicht für jetzt — UI-only, niemand wird das umgehen ohne developer-tools. Vor `live`-Mode dann Option 2 als Belt-and-Suspenders.

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

Erwartete Ausgabe (Stand 2026-05-09):

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

---

## Was noch fehlt / offen ist

| Item | Severity | Tracking |
|---|---|---|
| Self-Sign-up via AuthModal-Register umgeht `invite_mode_active=true` | ⚠️ Medium — UI-only fix möglich (~30 Min) | siehe "Known Gap" oben |
| Rate-Limit auf `/store/newsletter` und `/store/waitlist` | ⚠️ Low — niedriges Risiko in beta_test | Workstream §4 (Redis) — TODO-Kommentar in route.ts |
| Job-Monitor-Page `/app/operations/bulk-invite` (Progress + Errors) | 💡 Nice-to-have nach erstem echten Bulk-Send | Phase B.5 in TODO |
| Re-Opt-In-Mode für `/newsletter` (`?prefill=&via=re-opt-in`) | 💡 Nice-to-have für künftige Re-Activation-Kampagnen | Phase B.5 |
| Anwalts-Check für §7(3) UWG Disclaimer-Wording in Bulk-Invite-Mails | ⚠️ Empfohlen vor öffentlichem Launch | RSE-78 koppeln |
| AuthModal Register: `email_subscribed`-Flag nicht in lokaler `crm_master_communication_pref` gespiegelt | 💡 Low — Fix wenn rc53.4 Webhook-Mirror auch self-Register-Events processed | Phase B.5 |
| `/email-preferences/unsubscribe` (Medusa-Customer-Variante) hat keine eigene Storefront-Page — Email-Link führt ins Leere | ⚠️ Latent (heute keine Auswirkung weil 0 Medusa-Customers) | wenn echte Customers da sind |

---

## Doku-Pflege

Diese Doku **bei jedem Phase-B-Folge-Deploy aktualisieren** — wenn neue Pages dazukommen, Flows ändern oder DSGVO-Texte angepasst werden.

**Letzte Aktualisierung:** 2026-05-09 nach rc53.15.2 + Funnel-Audit
**Author:** Claude (Phase B Verification, 2026-05-09)
**Reviewer:** Robin
