import { redirect } from "next/navigation"

const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export default async function NewsletterConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>
}) {
  const { token, email } = await searchParams

  if (!token || !email) {
    redirect("/newsletter/confirmed?error=invalid")
  }

  try {
    const url = `${MEDUSA_URL}/store/newsletter/confirm?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
    const res = await fetch(url, {
      headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
      cache: "no-store",
    })

    if (!res.ok) {
      redirect("/newsletter/confirmed?error=invalid")
    }
  } catch {
    redirect("/newsletter/confirmed?error=invalid")
  }

  redirect("/newsletter/confirmed")
}
