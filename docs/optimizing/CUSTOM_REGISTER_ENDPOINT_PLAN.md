# Custom `/store/customer/register` Endpoint — Implementation Plan

**Stand:** 2026-05-09
**Author:** Claude (Phase B Follow-up)
**Status:** Draft, awaiting Codex review before implementation
**Target Release:** rc53.17 oder rc53.18 (vor Frank's Bulk-Invite-Test-Welle)
**Tech-Stack:** Medusa 2.13.1, PostgreSQL (Supabase), Knex, Resend, Brevo

---

## 1. Goal

Ein einzelner Storefront-API-Endpoint `POST /store/customer/register` ersetzt den aktuellen 3-Step-Dance aus drei separaten Medusa-native HTTP-Calls. Der neue Endpoint kapselt:

- Site-Mode-Check (`invite_mode_active`) als echtes Backend-Gate
- Atomic Auth-Identity-+-Customer-Create in einer DB-Transaktion
- Auto-Verknüpfung zu `crm_master_contact` (find-or-create + `medusa_customer_id` setzen)
- Newsletter-Optin-Mirror in `crm_master_communication_pref`
- AGB-Accept-Audit mit Timestamp
- Welcome-Mail-Trigger
- Source-Tracking (`self_signup` vs. `invite_redemption`)
- Pre-approved-Bestandskontakt-Logik (vodtapes-/vod-records-Bestand → Pass ohne Invite)

Zusätzlich: das existierende `/store/invite/[token]` POST-Endpoint wird auf den neuen Endpoint umgelenkt (DRY), behält aber sein eigenes Token-Validation/Mark-Used-Verhalten.

## 2. Warum jetzt (vor Frank's Test-Welle)

Aktuell ist `invite_mode_active=true` ein **Halb-implementiertes Flag**: Storefront-Middleware liest es nur für `/apply`-Sichtbarkeit, aber die Register-Funktion in `lib/auth.ts` und der AuthModal-Register-Tab bypassen es komplett. Ergebnis: jeder, der das Gate-Passwort `vod2026` kennt, kann sich frei einen Account anlegen — auch wenn er nie eingeladen wurde.

Wir haben drei Optionen erwogen (siehe `B2C_REGISTRATION_FUNNEL_VERIFICATION.md` § "Known Gap"):
- **Option 1 (UI-Tab-Hide):** Cosmetic, mit DevTools umgehbar
- **Option 2 (Backend-Block):** Closes door, aber kein Mehrwert
- **Option 3 (Custom Endpoint):** Ist *der richtige Shape* für `live`-Mode + zentralisiert die Logik

Robin hat Option 3 priorisiert, weil die Bulk-Invite-Test-Welle (Phase B) demnächst läuft und wir nicht zwei Pfade (Invite + Self-Signup) parallel undefiniert lassen wollen.

## 3. Current State (file:line Pointer)

### 3.1 Storefront

**`storefront/src/lib/auth.ts:6-62`** — `register()`-Funktion:
```ts
// 3-step dance:
// 1. POST /auth/customer/emailpass/register  → Medusa-native
// 2. POST /store/customers                    → Medusa-native, with auth bearer
// 3. POST /auth/customer/emailpass            → re-login for session token
```

**`storefront/src/components/AuthModal.tsx:46`** — `mode` State erlaubt `register` ohne Bedingung
**`storefront/src/components/AuthProvider.tsx:223`** — exposes `register` via context unconditionally

### 3.2 Backend (heute kein Custom-Endpoint)

**`backend/src/api/store/invite/[token]/route.ts:72-201`** — POST-Handler ist bereits eine Variation:
- Validiert Token in `invite_tokens`
- Macht **dieselben 3 HTTP-Calls** via fetch-Loopback zum eigenen Backend (Lines 129, 152, 186)
- Markiert Token als `used`, aktualisiert `waitlist_applications`
- Logged in `invite_token_attempts`

**Dies ist der best-existing-reference** — das neue `/store/customer/register` ersetzt im Wesentlichen die 3 fetch-Calls durch direkte Medusa-Container-Service-Calls und fügt die Site-Mode-/CRM-/Newsletter-Logik hinzu.

### 3.3 DB-Schema (relevante Tabellen)

| Tabelle | Zweck | Wichtige Spalten |
|---|---|---|
| `customer` (Medusa) | Customer-Profile | `id`, `email`, `first_name`, `last_name`, `metadata`, `deleted_at` |
| `auth_identity` (Medusa) | Auth-Credentials | (wird intern von `@medusajs/auth` verwaltet) |
| `provider_identity` (Medusa) | Auth-Identity ↔ Customer Linkage | `auth_identity_id`, `entity_id` (=customer.id), `provider='emailpass'` |
| `crm_master_contact` | Master-CRM (rc53.0+) | `id` (uuid), `primary_email_lower`, `medusa_customer_id`, `lifecycle_stage`, `tags`, `is_blocked` |
| `crm_master_communication_pref` | Newsletter-Opt-in (rc53.4) | `master_id`, `channel`, `opted_in`, `source`, `opted_in_at`, `opted_out_at` |
| `crm_master_audit_log` | Audit-Trail | `master_id`, `action`, `details` (jsonb), `source`, `admin_email` |
| `newsletter_subscribers` | Brevo-Mirror (rc53.4) | `email`, `source`, `status`, `subscribed_at` |
| `site_config` | Platform-Mode-Flags | `platform_mode`, `invite_mode_active`, `apply_page_visible`, `gate_password` |
| `invite_tokens` | Invite-Tokens | `token` (raw), `email`, `master_id` (rc53.15), `status`, `expires_at` |
| `waitlist_applications` | Waitlist-Bewerbungen | `email`, `status` (pending/approved/rejected/registered) |

### 3.4 Existing Helper

**`backend/src/lib/email-helpers.ts`:**
- `sendBulkInviteEmailToMaster` (rc53.15) — sendet Bulk-Invite-Mail mit Token-Display
- `sendInviteWelcomeEmail` — sendet Welcome nach Waitlist-Approve
- `welcomeEmail` Template existiert (`emails/welcome.ts`) — wir nutzen das im neuen Endpoint

**`backend/src/lib/crm-newsletter-sync.ts` (rc53.4):**
- `applyLocalCommPrefChange(pg, masterId, channel, optedIn, source)` — der Helper, den wir ohnehin schon für UI-Toggle nutzen
- `findOrCreateMasterByEmail(pg, email, attrs)` — find-or-create auf `crm_master_contact`

## 4. Target Architecture

### 4.1 Endpoint-Definition

**Datei:** `backend/src/api/store/customer/register/route.ts`
**Method:** `POST`
**Public:** ja (`/store/*` requires `x-publishable-api-key`)
**Authenticated:** nein (sonst chicken-and-egg)

### 4.2 Request Body

```ts
type RegisterBody = {
  email: string                  // required, lowercase normalized
  password: string               // required, ≥8 chars
  first_name: string             // required
  last_name?: string             // optional
  agb_accepted: true             // required, must be exactly true
  newsletter_optin?: boolean     // optional, default false
  source?: "self_signup" | "invite_redemption"  // default "self_signup"
  invite_token?: string          // optional, when source='invite_redemption' (raw or VOD-XXX-XXX)
}
```

### 4.3 Response

**Success (201):**
```ts
{
  success: true
  customer_id: string            // Medusa customer.id
  master_id: string              // crm_master_contact.id (uuid)
  token: string                  // session token for storefront
  newsletter_pending_confirmation?: boolean  // true if newsletter_optin=true (DOI mail sent)
}
```

**Error variants:**
| HTTP | `error` | Trigger |
|---|---|---|
| 400 | `validation_failed` | Missing fields, weak password, bad email format |
| 409 | `email_in_use` | Customer with that email already exists |
| 422 | `invite_required` | `invite_mode_active=true` AND no invite + email not in known masters |
| 422 | `invite_invalid` | Token nicht valid/expired/used (only when source='invite_redemption') |
| 422 | `agb_not_accepted` | `agb_accepted !== true` |
| 500 | `server_error` | Auth-Identity- oder Customer-Create-Fehler |

### 4.4 Internal Flow (Pseudocode)

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { Knex } from "knex"

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const body = req.body as RegisterBody
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  // ⚠️ OPEN QUESTION FÜR CODEX: ist das die korrekte Resolve-Methode für Auth in 2.13.1?
  const authService = req.scope.resolve(Modules.AUTH)
  const customerService = req.scope.resolve(Modules.CUSTOMER)

  // ── 1. Validation ────────────────────────────────────────────────────
  const email = (body.email || "").trim().toLowerCase()
  if (!isValidEmail(email)) return res.status(400).json({ error: "validation_failed", field: "email" })
  if (!body.password || body.password.length < 8)
    return res.status(400).json({ error: "validation_failed", field: "password" })
  if (!body.first_name?.trim())
    return res.status(400).json({ error: "validation_failed", field: "first_name" })
  if (body.agb_accepted !== true)
    return res.status(422).json({ error: "agb_not_accepted" })

  const source = body.source || "self_signup"

  // ── 2. Site-Mode + Invite-Gate ───────────────────────────────────────
  const siteConfig = await pg("site_config").first()
  const inviteMode = siteConfig.invite_mode_active === true

  let inviteRow: any = null
  if (source === "invite_redemption") {
    // Validate token
    if (!body.invite_token)
      return res.status(422).json({ error: "invite_invalid", reason: "missing" })
    const rawToken = normalizeToken(body.invite_token)
    inviteRow = await pg("invite_tokens")
      .where(function () { this.where("token", rawToken).orWhere("token", body.invite_token) })
      .first()
    if (!inviteRow || inviteRow.status !== "active")
      return res.status(422).json({ error: "invite_invalid", reason: "token_not_active" })
    if (inviteRow.expires_at && new Date(inviteRow.expires_at) < new Date())
      return res.status(422).json({ error: "invite_invalid", reason: "expired" })
    // Optional: enforce email match
    if (inviteRow.email && inviteRow.email.toLowerCase() !== email)
      return res.status(422).json({ error: "invite_invalid", reason: "email_mismatch" })
  } else if (inviteMode) {
    // Self-signup in invite-only mode → check pre-approved Bestand
    const existingMaster = await pg("crm_master_contact")
      .where("primary_email_lower", email)
      .whereNull("deleted_at")
      .where("is_blocked", false)
      .first()
    if (!existingMaster) {
      return res.status(422).json({
        error: "invite_required",
        message: "Registration is invite-only. Apply for early access at /apply.",
        apply_url: "/apply",
      })
    }
    // Bekannter Bestandskontakt → wir lassen ihn rein OHNE Invite
    // (er bekommt aber kein invite_token-Eintrag, das ist Self-Signup)
  }

  // ── 3. Existing-Customer-Check ──────────────────────────────────────
  const existingCustomer = await pg("customer")
    .where("email", email).whereNull("deleted_at").first()
  if (existingCustomer) {
    return res.status(409).json({ error: "email_in_use" })
  }

  // ── 4. Atomic Create ─────────────────────────────────────────────────
  let customerId: string
  let authToken: string
  let masterId: string

  try {
    // 4a. Auth-Identity
    // ⚠️ OPEN QUESTION FÜR CODEX: korrekte Methode in 2.13.1?
    // Vermutung basierend auf Medusa-Docs: authService.register({ provider, providerData })
    // ABER: das aktuelle /store/invite/[token] macht es via HTTP-Loopback —
    // möglicherweise weil die direkte Service-API in 2.x gewechselt hat.
    // Codex bitte prüfen ob authService.register() existiert ODER
    // ob wir zwingend HTTP-Loopback brauchen (dann passt das nicht in eine pg.transaction).
    const { authIdentity, token: tempToken } = await authService.register("emailpass", {
      body: { email, password: body.password },
    })

    // 4b. Customer-Row + Provider-Identity-Link
    // ⚠️ OPEN QUESTION: ist das die richtige Methode?
    // customerService.createCustomers({ email, first_name, last_name }) wahrscheinlich,
    // aber auth-identity-link muss auch passieren — möglicherweise via
    // workflow `createCustomerAccountWorkflow` oder ähnlich.
    const customer = await customerService.createCustomers({
      email,
      first_name: body.first_name.trim(),
      last_name: (body.last_name || "").trim(),
    })

    // Manuell Provider-Identity linken — Codex bitte korrekten Mechanismus prüfen
    await authService.updateAuthIdentities({
      id: authIdentity.id,
      app_metadata: { customer_id: customer.id },
    })

    customerId = customer.id

    // 4c. CRM-Master find-or-create + Linkage (eigene pg.transaction)
    masterId = await pg.transaction(async (trx) => {
      // Try to find existing master by email
      const existing = await trx("crm_master_contact")
        .where("primary_email_lower", email).whereNull("deleted_at").first()

      let mid: string
      if (existing) {
        mid = existing.id
        await trx("crm_master_contact").where("id", mid).update({
          medusa_customer_id: customerId,
          lifecycle_stage: existing.lifecycle_stage === "lead" ? "active" : existing.lifecycle_stage,
          first_name: body.first_name.trim(),
          last_name: (body.last_name || "").trim() || existing.last_name,
          updated_at: new Date(),
        })
      } else {
        // Neuer Master
        mid = generateUuid()
        await trx("crm_master_contact").insert({
          id: mid,
          display_name: `${body.first_name} ${body.last_name || ""}`.trim(),
          first_name: body.first_name.trim(),
          last_name: (body.last_name || "").trim(),
          primary_email_lower: email,
          medusa_customer_id: customerId,
          lifecycle_stage: "active",
          tier: "standard",
          contact_type: "person",
          first_seen_at: new Date(),
          last_seen_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        // Source-Link
        await trx("crm_master_source_link").insert({
          id: generateEntityId(),
          master_id: mid,
          source: "self_signup",
          source_record_id: customerId,
          created_at: new Date(),
        })
      }

      // 4d. Newsletter-Optin (NICHT auto-DOI-bestätigt — User muss DOI-Mail bestätigen)
      if (body.newsletter_optin) {
        // Wir setzen NICHT direkt opted_in=true. Stattdessen senden wir die
        // existing /store/newsletter DOI-Flow. Erst nach Click landet er
        // in opted_in=true. Audit-Eintrag dokumentiert die Intent.
        await trx("crm_master_audit_log").insert({
          master_id: mid,
          action: "newsletter_optin_pending",
          details: { source: "self_signup_register", confirmed: false },
          source: "storefront",
        })
      }

      // 4e. Audit-Log: self_signup
      await trx("crm_master_audit_log").insert({
        master_id: mid,
        action: source === "invite_redemption" ? "invite_redemption" : "self_signup",
        details: {
          source,
          newsletter_optin: !!body.newsletter_optin,
          agb_accepted_at: new Date().toISOString(),
          ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress,
          user_agent: req.headers["user-agent"],
          invite_token_id: inviteRow?.id || null,
        },
        source: "storefront",
      })

      return mid
    })

    // 4f. Mark invite as used (außerhalb crm-tx weil eigene Tabelle)
    if (inviteRow) {
      await pg("invite_tokens").where("id", inviteRow.id).update({
        status: "used",
        used_at: new Date(),
      })
      if (inviteRow.application_id) {
        await pg("waitlist_applications").where("id", inviteRow.application_id)
          .update({ status: "registered", registered_at: new Date() })
      }
    }
  } catch (err: any) {
    console.error("[register] atomic-create failed:", err)
    // ⚠️ OPEN QUESTION: wenn 4a (auth-identity) bereits durch ist und 4b crasht,
    // haben wir Geister-Auth-Identity. Codex bitte prüfen ob authService.delete()
    // sauber rollback macht ODER ob wir manuell cleanen müssen.
    return res.status(500).json({ error: "server_error", message: err.message })
  }

  // ── 5. Welcome-Mail (außerhalb tx, fail-tolerant) ──────────────────
  try {
    await sendWelcomeEmail(pg, { customer_id: customerId, first_name: body.first_name })
  } catch (e) {
    console.warn("[register] welcome-mail failed (non-blocking):", e)
  }

  // ── 6. Newsletter-DOI-Mail (wenn opted in) ──────────────────────────
  if (body.newsletter_optin) {
    try {
      // Nutze den existing /store/newsletter Flow zum DOI senden
      await triggerNewsletterDoi(pg, email)  // helper to extract from existing route.ts
    } catch (e) {
      console.warn("[register] newsletter-doi failed (non-blocking):", e)
    }
  }

  // ── 7. Login → Session-Token ────────────────────────────────────────
  // ⚠️ OPEN QUESTION: gibt's eine Service-Methode oder müssen wir hier
  // tatsächlich einen separaten Login machen? authService.authenticate()?
  const session = await authService.authenticate("emailpass", {
    body: { email, password: body.password },
  })

  res.status(201).json({
    success: true,
    customer_id: customerId,
    master_id: masterId,
    token: session.token,
    newsletter_pending_confirmation: !!body.newsletter_optin,
  })
}
```

### 4.5 Storefront-Refactor

**`storefront/src/lib/auth.ts`:**
```ts
export async function register(opts: {
  email: string
  password: string
  firstName: string
  lastName: string
  newsletterOptin?: boolean
  agbAccepted: true
}): Promise<{ token: string; customer_id: string; master_id: string }> {
  const res = await fetch(`${MEDUSA_URL}/store/customer/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    body: JSON.stringify({
      email: opts.email,
      password: opts.password,
      first_name: opts.firstName,
      last_name: opts.lastName,
      agb_accepted: opts.agbAccepted,
      newsletter_optin: opts.newsletterOptin || false,
      source: "self_signup",
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.success) {
    // Map error.error codes to user-friendly messages
    if (data.error === "invite_required") {
      throw new Error("Registration is invite-only. Apply for early access at /apply.")
    }
    if (data.error === "email_in_use") {
      throw new Error("An account with this email already exists.")
    }
    throw new Error(data.message || "Registration failed")
  }
  return data
}
```

**`storefront/src/components/AuthModal.tsx`:**
- Pass `agbAccepted` + `newsletterOptin` to register()
- Map error codes (`invite_required` → modal text "Registration is invite-only.")

**`storefront/src/components/AuthProvider.tsx:223`:**
- Update register signature

### 4.6 `/store/invite/[token]` POST refactor

Der existing Invite-Redemption-Endpoint wird auf den neuen Endpoint umgelenkt:
```ts
// Alte 3 fetch-Calls in /store/invite/[token]/route.ts:129-190 ersetzen durch:
const registerResult = await callOurOwnRegister(req, {
  email: invite.email,
  password,
  first_name,
  last_name,
  agb_accepted: true,  // implizit durch Token-Click
  source: "invite_redemption",
  invite_token: token,
})
```

Möglicherweise extrahieren wir die Register-Logik in `lib/customer-register.ts` damit beide Endpoints dieselbe Funktion aufrufen statt HTTP-Loopback zu machen.

## 5. Migration Path

| Schritt | Was | Wer |
|---|---|---|
| 1 | Schema-Check: `crm_master_contact.medusa_customer_id` existiert? | SQL-Query (verify only) |
| 2 | Neuer Endpoint `backend/src/api/store/customer/register/route.ts` | Code |
| 3 | Helper `backend/src/lib/customer-register.ts` mit reusabler `registerCustomer()` Funktion | Code |
| 4 | Refactor `/store/invite/[token]` POST → ruft Helper aus 3 | Code |
| 5 | Storefront `lib/auth.ts::register()` ruft neuen Endpoint | Code |
| 6 | AuthModal + AuthProvider Signatur-Update | Code |
| 7 | Alle Tests (siehe §7) | Code |
| 8 | Deploy, Smoke-Test | Operations |
| 9 | Rollback wenn Probleme: `lib/auth.ts` zurück auf 3-Step-Dance, neuer Endpoint bleibt deaktiviert | Operations |

**Backwards-Compat:** Der alte 3-Step-Dance funktioniert weiter (Medusa-native Endpoints sind nicht entfernt). Nur unser Storefront-Code ruft die alte Variante nicht mehr.

## 6. DSGVO / Audit

- **AGB-Accept-Timestamp** wird in `crm_master_audit_log.details.agb_accepted_at` gespeichert (jsonb)
- **IP + User-Agent** ebenso (für rechtliche Beweislast)
- **Newsletter-Optin** wird NICHT auto-confirmed — DOI-Mail muss geclickt werden (rechtlich sauber)
- **Existing Pre-Approved-Bestand** (z.B. vodtapes-Member) bekommt einen `crm_master_audit_log`-Eintrag `action='self_signup'` mit `pre_approved_via='existing_master'` — transparent dokumentiert
- **Email-Enumeration-Schutz** beim 409-Error: gleicher Response-Body-Shape wie 422, gleiche Latenz (~constant-time)

## 7. Testing Checklist

### 7.1 Manuell

- [ ] `beta_test` + `invite_mode_active=true`: Self-Signup mit unbekannter Email → 422 `invite_required`
- [ ] `beta_test` + `invite_mode_active=true`: Self-Signup mit Email aus `crm_master_contact` (z.B. Tape-mag-Bestand) → 201 success
- [ ] `beta_test` + `invite_mode_active=true`: Invite-Redemption mit valid token → 201 success, token marked used
- [ ] `beta_test` + `invite_mode_active=true`: Invite-Redemption mit expired token → 422 `invite_invalid`
- [ ] `live` + `invite_mode_active=false`: Self-Signup mit beliebiger Email → 201 success
- [ ] `agb_accepted` weglassen → 422
- [ ] `password` < 8 Zeichen → 400
- [ ] Doppel-Submit (gleiche Email) → 409 `email_in_use`
- [ ] Newsletter-Optin=true → DOI-Mail kommt an, vor Click ist `opted_in=false`, nach Click `opted_in=true`
- [ ] Welcome-Mail kommt an
- [ ] DB-Check: `crm_master_contact.medusa_customer_id` ist gesetzt
- [ ] DB-Check: `crm_master_audit_log` hat `action='self_signup'` Eintrag mit IP + AGB-Timestamp

### 7.2 Automated (jest/vitest)

- [ ] `validateRegisterBody()` Unit-Tests
- [ ] Mock-Service-Test: register flow mit allen Error-Pfaden
- [ ] Integration-Test gegen Test-DB: full happy-path

### 7.3 Smoke-Tests post-deploy

```bash
# 1. Health-Check
curl -X POST https://api.vod-auctions.com/store/customer/register \
  -H 'content-type: application/json' \
  -H 'x-publishable-api-key: <KEY>' \
  -d '{"email":"smoketest@example.com"}'
# → 400 validation_failed (no password)

# 2. Invite-Required-Path
curl -X POST https://api.vod-auctions.com/store/customer/register \
  -H 'content-type: application/json' \
  -H 'x-publishable-api-key: <KEY>' \
  -d '{"email":"unknown-stranger@example.com","password":"Test1234!","first_name":"Test","agb_accepted":true}'
# → 422 invite_required (in beta_test mode)
```

## 8. Rollback

Falls etwas nach Deploy schief geht:

1. **Storefront-Side:** `lib/auth.ts::register()` zurück auf 3-Step-Dance committen + redeploy. Backend-Endpoint bleibt deaktiviert (niemand ruft ihn).
2. **Backend-Side:** Endpoint bleibt im Repo, wird nicht beschädigt.
3. **DB-Side:** Keine Schema-Migration nötig — alle relevanten Tabellen existieren bereits.

Maximaler Schaden falls Endpoint kaputt: User können sich nicht registrieren. Existierende User können weiterhin einloggen (Login-Pfad ist unverändert).

## 9. ⚠️ Open Questions für Codex Review

Diese Punkte müssen geklärt werden, bevor Code geschrieben wird:

1. **Medusa 2.13.1 Auth-Service-API:** Existiert `authService.register("emailpass", { body })` in 2.13.1, oder muss man HTTP-Loopback machen wie das aktuelle `/store/invite/[token]`? Suche nach `IAuthModuleService` oder `AuthModuleService` Type-Defs.

2. **Customer-Service-API:** Korrekte Methode für `customerService.createCustomers()` mit Auth-Identity-Linkage? Oder gibt's einen Workflow `createCustomerAccountWorkflow`/ähnliches der das atomic macht?

3. **Provider-Identity-Linkage:** Wie wird in 2.13.1 die Verknüpfung zwischen `auth_identity` und `customer` korrekt hergestellt? Ist `app_metadata.customer_id` die richtige Stelle, oder brauchen wir einen separaten `provider_identity`-Insert?

4. **Atomic Rollback bei Auth-Identity-Create:** Wenn 4a succeed und 4b crasht — gibt es eine offizielle Cleanup-API (`authService.deleteAuthIdentities()`)? Oder läuft Medusa's auth-identity über eigene DB und wir können sie aus `pg.transaction` heraus nicht rollen?

5. **Authenticate für Session-Token:** `authService.authenticate("emailpass", { body })` — gibt's das? Oder müssen wir wirklich den HTTP-Loopback `POST /auth/customer/emailpass` aufrufen?

6. **Race-Condition zwischen Existing-Customer-Check und Insert:** Müssen wir hier eine `pg.transaction` mit `SELECT ... FOR UPDATE` machen oder reicht der DB-Unique-Constraint auf `customer.email`?

7. **Pre-Approved-Master-Logik:** Macht es Sinn, in `beta_test` Mode existing CRM-Master automatisch durchzulassen? Oder sollte auch Bestand einen Invite brauchen? (DSGVO-Punkt: Wenn jemand vor 5 Jahren bei tape-mag.com gekauft hat und uns mit gleicher Email einen Account anlegen will — ist das OK ohne Invite?)

8. **Email-Verification:** Soll der neue Endpoint nach Register auch eine Email-Verify-Flow triggern? Aktuell macht das `/invite/[token]` nicht (Token-Click ist implizit Verify), aber Self-Signup ohne Verify ist Spam-Vector.

9. **Performance: site_config-Read pro Register-Call:** Soll das gecached werden (5-min wie Middleware), oder ist 1 Query pro Register (selten) OK?

10. **Helper-Extraction in `lib/customer-register.ts`:** Lohnt sich das vs. Endpoint-only? Oder gibt's andere Aufrufer (z.B. Admin-API "create-customer-on-behalf-of")?

## 10. Estimate

| Phase | Aufwand |
|---|---|
| Codex-Review-Iteration + Klärung Open Questions | 1-2h (heute) |
| Backend-Endpoint + Helper | 4-5h |
| Storefront-Refactor (lib/auth + AuthModal + AuthProvider) | 1-2h |
| `/invite/[token]` Refactor auf Helper | 1h |
| Tests (manual + smoke) | 2h |
| Deploy + Verify | 1h |
| **Total** | **~10-13h** (= 1-2 Tage) |

## 11. Acceptance Criteria

- [ ] Codex-Review der Open Questions §9 abgeschlossen, alle Punkte geklärt
- [ ] Endpoint live auf Production
- [ ] Storefront ruft neuen Endpoint
- [ ] `/invite/[token]` ruft Helper aus `lib/customer-register.ts`
- [ ] Smoke-Tests aus §7.3 grün
- [ ] DSGVO-Audit-Log enthält bei Register IP + AGB-Timestamp
- [ ] Rollback-Pfad dokumentiert + 1× geprobt (Test-Branch revert)
- [ ] CHANGELOG-Entry rc53.X
- [ ] GitHub Release-Tag

---

## Anhang A — Bestehende Code-Referenzen

```
backend/src/api/store/invite/[token]/route.ts            # Reference für 3-step dance
backend/src/lib/email-helpers.ts                          # sendBulkInviteEmailToMaster, sendInviteWelcomeEmail
backend/src/lib/crm-newsletter-sync.ts                    # applyLocalCommPrefChange, findOrCreateMasterByEmail
backend/src/api/store/newsletter/route.ts                 # DOI-flow für Newsletter-Optin
backend/src/api/store/site-mode/route.ts                  # site_config reader
storefront/src/lib/auth.ts                                # current register flow (to be refactored)
storefront/src/components/AuthModal.tsx                   # UI consumer
storefront/src/components/AuthProvider.tsx                # context exposing register
```

## Anhang B — Schema-Verify-Query

```sql
-- Pre-implementation sanity check
SELECT
  (SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='crm_master_contact' AND column_name='medusa_customer_id')) AS has_master_customer_link,
  (SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='crm_master_audit_log')) AS has_audit_log,
  (SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='crm_master_communication_pref')) AS has_comm_pref,
  (SELECT COUNT(*) FROM site_config) AS site_config_rows;
```

---

**Reviewer:** Codex (via codex:codex-rescue)
**Review-Focus:** Medusa 2.13.1 API correctness (§9 Open Questions), atomicity guarantees, security (timing/enumeration), better patterns we missed.
