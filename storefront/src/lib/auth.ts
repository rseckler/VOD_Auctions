const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export type RegisterOptions = {
  email: string
  password: string
  firstName: string
  lastName: string
  agbAccepted: true
  newsletterOptin?: boolean
}

export type RegisterResult = {
  token: string
  customerId: string
  masterId: string
  newsletterPendingConfirmation: boolean
}

/**
 * Register a new customer via the custom /store/customer/register endpoint
 * (rc53.17). This single call enforces the site-mode invite gate, atomically
 * creates the auth-identity + customer + CRM master link, and triggers the
 * welcome + newsletter DOI mails. Replaces the legacy 3-step dance
 * (auth/register → store/customers → auth/login).
 */
export async function register(opts: RegisterOptions): Promise<RegisterResult> {
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
      newsletter_optin: opts.newsletterOptin === true,
      source: "self_signup",
    }),
  })

  let data: Record<string, unknown> = {}
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    // ignore — fall through to !res.ok branch with empty body
  }

  if (!res.ok || !data.success) {
    const code = typeof data.error === "string" ? data.error : ""
    if (code === "registration_not_possible") {
      throw new Error(
        (data.message as string) ||
          "Registration is currently invite-only. Apply for early access at /apply."
      )
    }
    if (code === "email_in_use") {
      throw new Error("An account with this email already exists.")
    }
    if (code === "agb_not_accepted") {
      throw new Error("Please accept the Terms & Conditions.")
    }
    if (code === "validation_failed") {
      const field = (data.field as string) || ""
      if (field === "email") throw new Error("Please enter a valid email address.")
      if (field === "password")
        throw new Error("Password must be at least 8 characters.")
      if (field === "first_name") throw new Error("Please enter your first name.")
      throw new Error("Please check the form fields and try again.")
    }
    throw new Error((data.message as string) || "Registration failed")
  }

  return {
    token: (data.token as string) || "",
    customerId: (data.customer_id as string) || "",
    masterId: (data.master_id as string) || "",
    newsletterPendingConfirmation: data.newsletter_pending_confirmation === true,
  }
}

export async function login(
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${MEDUSA_URL}/auth/customer/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || "Login failed")
  }

  const { token } = await res.json()
  return token
}

export async function getCustomer(token: string) {
  const res = await fetch(`${MEDUSA_URL}/store/customers/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.customer
}

export async function requestPasswordReset(email: string): Promise<void> {
  const res = await fetch(
    `${MEDUSA_URL}/auth/customer/emailpass/reset-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: email }),
    }
  )
  // Medusa always returns 201 to avoid leaking whether email exists
  if (!res.ok) {
    throw new Error("Request failed")
  }
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(
    `${MEDUSA_URL}/auth/customer/emailpass/update`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password: newPassword }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || "Password reset failed")
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("medusa_token") || sessionStorage.getItem("medusa_token")
}

export function setToken(token: string, persistent: boolean = true) {
  if (persistent) {
    sessionStorage.removeItem("medusa_token")
    localStorage.setItem("medusa_token", token)
  } else {
    localStorage.removeItem("medusa_token")
    sessionStorage.setItem("medusa_token", token)
  }
}

export function clearToken() {
  localStorage.removeItem("medusa_token")
  sessionStorage.removeItem("medusa_token")
}
