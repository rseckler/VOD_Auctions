import type { MetadataRoute } from "next"

const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

export default async function robots(): Promise<MetadataRoute.Robots> {
  try {
    const res = await fetch(`${MEDUSA_URL}/store/site-mode`, {
      next: { revalidate: 300 },
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.platform_mode !== "live") {
        return {
          rules: [
            {
              userAgent: "*",
              disallow: ["/"],
            },
          ],
        }
      }
    }
  } catch {
    // Backend unreachable — default to permissive to not break indexing
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/account/", "/api/"],
      },
    ],
    sitemap: "https://vod-auctions.com/sitemap.xml",
  }
}
