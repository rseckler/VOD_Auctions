import type { MetadataRoute } from "next"
import { medusaFetch } from "@/lib/api"
import type { AuctionBlock } from "@/types"

const SITE_URL = "https://vod-auctions.com"

type CatalogResponse = {
  releases: { id: string }[]
  total: number
  pages: number
}

type EntityEntry = {
  entity_type: string
  slug: string
  updated_at: string
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/catalog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/auctions`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    // Gallery pages
    {
      url: `${SITE_URL}/gallery`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    // Legal pages
    ...(["impressum", "datenschutz", "agb", "widerruf", "cookies"] as const).map(
      (page) => ({
        url: `${SITE_URL}/${page}`,
        lastModified: new Date(),
        changeFrequency: "monthly" as const,
        priority: 0.3,
      })
    ),
  ]

  // Auction blocks
  try {
    const blocksData = await medusaFetch<{ auction_blocks: AuctionBlock[] }>(
      "/store/auction-blocks?status=all"
    )
    const blocks = blocksData?.auction_blocks || []
    for (const block of blocks) {
      entries.push({
        url: `${SITE_URL}/auctions/${block.slug}`,
        lastModified: new Date(block.end_time),
        changeFrequency: block.status === "active" ? "hourly" : "weekly",
        priority: block.status === "active" ? 0.8 : 0.5,
      })
    }
  } catch {
    // Backend unavailable — skip dynamic auction entries
  }

  // Catalog releases (first pages only to keep sitemap manageable)
  try {
    const catalogData = await medusaFetch<CatalogResponse>(
      "/store/catalog?limit=1000&page=1"
    )
    const releases = catalogData?.releases || []
    for (const release of releases) {
      entries.push({
        url: `${SITE_URL}/catalog/${release.id}`,
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }
  } catch {
    // Backend unavailable — skip catalog entries
  }

  // Entity pages (bands, labels, press orgs with published content)
  try {
    const entityData = await medusaFetch<{ entities: EntityEntry[] }>(
      "/store/entities"
    )
    const entities = entityData?.entities || []

    const routeMap: Record<string, { path: string; priority: number }> = {
      artist: { path: "band", priority: 0.6 },
      label: { path: "label", priority: 0.6 },
      press_orga: { path: "press", priority: 0.5 },
    }

    for (const entity of entities) {
      const route = routeMap[entity.entity_type]
      if (!route) continue
      entries.push({
        url: `${SITE_URL}/${route.path}/${entity.slug}`,
        lastModified: new Date(entity.updated_at),
        changeFrequency: "weekly",
        priority: route.priority,
      })
    }
  } catch {
    // Backend unavailable — skip entity entries
  }

  return entries
}
