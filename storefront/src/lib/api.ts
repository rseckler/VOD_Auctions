const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export async function medusaFetch<T>(
  path: string,
  options?: { revalidate?: number }
): Promise<T | null> {
  try {
    const res = await fetch(`${MEDUSA_URL}${path}`, {
      next: { revalidate: options?.revalidate ?? 60 },
      headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function medusaAuthFetch<T>(
  path: string,
  token: string,
  options?: RequestInit
): Promise<T | null> {
  try {
    const res = await fetch(`${MEDUSA_URL}${path}`, {
      ...options,
      headers: {
        "x-publishable-api-key": PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export { MEDUSA_URL, PUBLISHABLE_KEY }
