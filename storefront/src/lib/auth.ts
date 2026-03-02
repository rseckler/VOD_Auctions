const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export async function register(
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<string> {
  // 1. Register auth identity
  const authRes = await fetch(
    `${MEDUSA_URL}/auth/customer/emailpass/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }
  )

  if (!authRes.ok) {
    const err = await authRes.json().catch(() => ({}))
    throw new Error(err.message || "Registrierung fehlgeschlagen")
  }

  const { token } = await authRes.json()

  // 2. Create customer record
  const custRes = await fetch(`${MEDUSA_URL}/store/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-publishable-api-key": PUBLISHABLE_KEY,
    },
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      email,
    }),
  })

  if (!custRes.ok) {
    const err = await custRes.json().catch(() => ({}))
    throw new Error(err.message || "Kundenkonto konnte nicht erstellt werden")
  }

  return token
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
    throw new Error(err.message || "Anmeldung fehlgeschlagen")
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

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("medusa_token")
}

export function setToken(token: string) {
  localStorage.setItem("medusa_token", token)
}

export function clearToken() {
  localStorage.removeItem("medusa_token")
}
