import { Suspense } from "react"
import CatalogClient from "@/components/CatalogClient"
import type { CatalogInitialParams } from "@/components/CatalogClient"

const MEDUSA_URL =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ searchParams }: Props) {
  const params = await searchParams
  const category = (params.category as string) || ""
  const search = (params.search as string) || ""

  const CATEGORY_LABELS: Record<string, string> = {
    tapes: "Tapes",
    vinyl: "Vinyl",
    cd: "CD",
    vhs: "VHS",
    band_literature: "Artists/Bands Literature",
    label_literature: "Labels Literature",
    press_literature: "Press/Org Literature",
  }

  let title = "Catalog"
  if (category && CATEGORY_LABELS[category]) {
    title = `${CATEGORY_LABELS[category]} — Catalog`
  }
  if (search) {
    title = `Search: "${search}" — Catalog`
  }

  return {
    title,
    description:
      "Browse over 41,000 rare Industrial, Experimental & Electronic music releases at VOD Auctions.",
  }
}

export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams

  // Extract all params with defaults
  const page = parseInt(params.page as string) || 1
  const search = (params.search as string) || ""
  const category = (params.category as string) || ""
  const format = (params.format as string) || ""
  const sort = (params.sort as string) || "artist:asc"
  const rawLimit = parseInt(params.limit as string)
  const limit = [24, 48, 96].includes(rawLimit) ? rawLimit : 24
  const for_sale = (params.for_sale as string) || ""
  const country = (params.country as string) || ""
  const labelParam = (params.label as string) || ""
  const year_from = (params.year_from as string) || ""
  const year_to = (params.year_to as string) || ""
  const condition = (params.condition as string) || ""

  // Split combined sort (e.g. "artist:asc") into separate sort + order for backend API
  const [sortField, sortOrder] = sort.split(":")
  const apiSort = sortField === "legacy_price" ? "price" : sortField

  // Build query string for server-side fetch
  const queryParts = [
    `limit=${limit}`,
    `page=${page}`,
    `sort=${apiSort}`,
    ...(sortOrder ? [`order=${sortOrder}`] : []),
  ]
  if (search) queryParts.push(`search=${encodeURIComponent(search)}`)
  if (category) queryParts.push(`category=${category}`)
  if (format) queryParts.push(`format=${format}`)
  if (for_sale) queryParts.push(`for_sale=${for_sale}`)
  if (country) queryParts.push(`country=${encodeURIComponent(country)}`)
  if (labelParam) queryParts.push(`label=${encodeURIComponent(labelParam)}`)
  if (year_from) queryParts.push(`year_from=${year_from}`)
  if (year_to) queryParts.push(`year_to=${year_to}`)
  if (condition) queryParts.push(`condition=${encodeURIComponent(condition)}`)

  // Server-side fetch — provides HTML with real product data for SEO
  let initialReleases: any[] = []
  let initialTotal = 0
  let initialPages = 0

  try {
    const res = await fetch(
      `${MEDUSA_URL}/store/catalog?${queryParts.join("&")}`,
      {
        headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
        next: { revalidate: 60 },
      }
    )
    if (res.ok) {
      const data = await res.json()
      initialReleases = data.releases || []
      initialTotal = data.total || 0
      initialPages = data.pages || 0
    }
  } catch {
    // Fallback: CatalogClient will fetch on the client side
  }

  const initialParams: CatalogInitialParams = {
    page,
    search,
    category,
    format,
    sort,
    limit,
    for_sale,
    country,
    label: labelParam,
    year_from,
    year_to,
    condition,
  }

  return (
    <Suspense>
      <CatalogClient
        initialReleases={initialReleases}
        initialTotal={initialTotal}
        initialPages={initialPages}
        initialParams={initialParams}
      />
    </Suspense>
  )
}
