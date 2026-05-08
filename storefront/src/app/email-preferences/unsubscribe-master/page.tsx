import { redirect } from "next/navigation"

const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

/**
 * Master-ID-based unsubscribe landing for CRM bulk-invite mails.
 * Proxies to backend with x-publishable-api-key, then redirects.
 *
 * Mirrors the /newsletter/confirm/page.tsx pattern — Storefront acts as the
 * trusted-key proxy so the link in the email can use the storefront origin.
 */
export default async function UnsubscribeMasterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; id?: string }>
}) {
  const { token, id } = await searchParams

  if (!token || !id) {
    redirect("/email-preferences/unsubscribed?error=invalid")
  }

  try {
    const url = `${MEDUSA_URL}/store/email-preferences/unsubscribe-master?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`
    const res = await fetch(url, {
      headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
      cache: "no-store",
      redirect: "manual",
    })

    // Backend redirects on success — accept any 2xx or 3xx as OK.
    if (res.status >= 400) {
      redirect("/email-preferences/unsubscribed?error=invalid")
    }
  } catch {
    redirect("/email-preferences/unsubscribed?error=invalid")
  }

  redirect("/email-preferences/unsubscribed")
}
