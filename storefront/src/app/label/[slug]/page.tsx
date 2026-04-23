import type { Metadata } from "next"
import Link from "next/link"
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd"
import Image from "next/image"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { medusaFetch } from "@/lib/api"

type LabelRelease = {
  id: string
  title: string
  coverImage: string | null
  format_name: string | null
  year: number | null
  legacy_price: number | null
  effective_price?: number | null
  is_purchasable?: boolean
  artist_name: string | null
  artist_slug: string | null
}

type LabelLiterature = {
  id: string
  title: string
  coverImage: string | null
  format_name: string | null
  year: number | null
  legacy_price: number | null
  effective_price?: number | null
  is_purchasable?: boolean
}

type LabelArtist = {
  slug: string
  name: string
  release_count: number
}

type LabelPerson = {
  name: string
}

type LabelData = {
  label: {
    id: string
    slug: string
    name: string
    country: string | null
    year: string | null
  }
  content: {
    short_description: string | null
    description: string | null
    external_links: { discogs?: string; wikipedia?: string } | null
  } | null
  releases: LabelRelease[]
  literature: LabelLiterature[]
  artists: LabelArtist[]
  persons: LabelPerson[]
  release_count: number
}

async function getLabel(slug: string): Promise<LabelData | null> {
  return medusaFetch<LabelData>(
    `/store/label/${slug}`,
    { revalidate: 300 }
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await getLabel(slug)
  if (!data) return { title: "Label Not Found" }

  const l = data.label
  const description =
    data.content?.short_description ||
    `Explore the catalog of ${l.name}${l.country ? ` (${l.country})` : ""}. ${data.releases.length} releases available on VOD Auctions.`

  const ogImage = data.releases.find((r: any) => r.coverImage)?.coverImage

  return {
    title: `${l.name} — Catalog & Releases`,
    description,
    openGraph: {
      title: `${l.name} — Catalog & Releases — VOD Auctions`,
      description,
      ...(ogImage ? { images: [{ url: ogImage, alt: l.name }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: `${l.name} — Catalog & Releases — VOD Auctions`,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    alternates: {
      canonical: `/label/${slug}`,
    },
  }
}

function ReleaseTable({ releases }: { releases: LabelRelease[] }) {
  if (!releases.length) return null
  const sorted = [...releases].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground uppercase tracking-wider">
            <th className="text-left py-2 w-12" />
            <th className="text-left py-2">Artist</th>
            <th className="text-left py-2">Title</th>
            <th className="text-left py-2 hidden sm:table-cell">Format</th>
            <th className="text-left py-2 hidden sm:table-cell">Year</th>
            <th className="text-right py-2">Price</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={r.id}
              className={i > 0 ? "border-t border-dotted border-white/[0.06]" : ""}
            >
              <td className="py-2 pr-2">
                {r.coverImage ? (
                  <Image
                    src={r.coverImage}
                    alt={r.title}
                    width={48}
                    height={48}
                    className="rounded object-cover"
                    sizes="48px"
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-secondary flex items-center justify-center text-muted-foreground text-xs">
                    --
                  </div>
                )}
              </td>
              <td className="py-2">
                {r.artist_slug ? (
                  <Link
                    href={`/band/${r.artist_slug}`}
                    className="text-muted-foreground hover:text-primary transition-colors text-xs"
                  >
                    {r.artist_name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {r.artist_name || ""}
                  </span>
                )}
              </td>
              <td className="py-2">
                <Link
                  href={`/catalog/${r.id}`}
                  className="text-foreground hover:text-primary transition-colors font-medium"
                >
                  {r.title}
                </Link>
              </td>
              <td className="py-2 text-muted-foreground text-xs hidden sm:table-cell">
                {r.format_name || "---"}
              </td>
              <td className="py-2 text-muted-foreground font-mono text-xs hidden sm:table-cell">
                {r.year || "---"}
              </td>
              <td className="py-2 text-right font-mono text-xs">
                {r.effective_price
                  ? `\u20AC${Number(r.effective_price).toFixed(2)}`
                  : "---"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LiteratureTable({ items }: { items: LabelLiterature[] }) {
  if (!items.length) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground uppercase tracking-wider">
            <th className="text-left py-2 w-12" />
            <th className="text-left py-2">Title</th>
            <th className="text-left py-2 hidden sm:table-cell">Format</th>
            <th className="text-left py-2 hidden sm:table-cell">Year</th>
            <th className="text-right py-2">Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr
              key={item.id}
              className={i > 0 ? "border-t border-dotted border-white/[0.06]" : ""}
            >
              <td className="py-2 pr-2">
                {item.coverImage ? (
                  <Image
                    src={item.coverImage}
                    alt={item.title}
                    width={48}
                    height={48}
                    className="rounded object-cover"
                    sizes="48px"
                  />
                ) : (
                  <div className="w-12 h-12 rounded bg-secondary flex items-center justify-center text-muted-foreground text-xs">
                    --
                  </div>
                )}
              </td>
              <td className="py-2">
                <Link
                  href={`/catalog/${item.id}`}
                  className="text-foreground hover:text-primary transition-colors font-medium"
                >
                  {item.title}
                </Link>
              </td>
              <td className="py-2 text-muted-foreground text-xs hidden sm:table-cell">
                {item.format_name || "---"}
              </td>
              <td className="py-2 text-muted-foreground font-mono text-xs hidden sm:table-cell">
                {item.year || "---"}
              </td>
              <td className="py-2 text-right font-mono text-xs">
                {item.effective_price
                  ? `\u20AC${Number(item.effective_price).toFixed(2)}`
                  : "---"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function isHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text)
}

export default async function LabelPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getLabel(slug)
  if (!data) notFound()

  const label = data.label
  const content = data.content
  const description = content?.description || null
  const external_links = content?.external_links || null

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: label.name,
    ...(label.country && { address: { "@type": "PostalAddress", addressCountry: label.country } }),
    ...(label.year && { foundingDate: label.year }),
    ...(description && { description: description.replace(/<[^>]*>/g, "").slice(0, 300) }),
    url: `https://vod-auctions.com/label/${label.slug}`,
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <BreadcrumbJsonLd items={[{ name: "Home", url: "/" }, { name: "Labels", url: "/catalog?category=label_literature" }, { name: label.name, url: `/label/${label.slug}` }]} />
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-8 flex items-center gap-1 flex-wrap">
        <Link href="/" className="hover:text-foreground transition-colors">
          Home
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <Link href="/catalog?category=label_literature" className="hover:text-foreground transition-colors">
          Labels
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="text-foreground truncate">{label.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight">
          {label.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {label.country && (
            <Badge variant="secondary">{label.country}</Badge>
          )}
          {label.year && (
            <Badge variant="secondary">Est. {label.year}</Badge>
          )}
        </div>
      </div>

      {/* Description */}
      {description && (
        <div className="relative pl-4 mb-10">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <h2 className="font-serif text-[15px] text-primary mb-3">About</h2>
          {isHtml(description) ? (
            <div
              className="prose prose-invert prose-sm max-w-none text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: description }}
            />
          ) : (
            <div className="space-y-2 text-sm text-muted-foreground">
              {description.split("\n").filter(Boolean).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Catalog Releases */}
      {data.releases.length > 0 && (
        <div className="relative pl-4 mb-10">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <h2 className="font-serif text-[15px] text-primary mb-3">
            Catalog{" "}
            <span className="font-sans text-[11px] text-muted-foreground font-normal ml-1.5">
              {data.releases.length} releases
            </span>
          </h2>
          <ReleaseTable releases={data.releases} />
        </div>
      )}

      {/* Literature */}
      {data.literature.length > 0 && (
        <div className="relative pl-4 mb-10">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <h2 className="font-serif text-[15px] text-primary mb-3">
            Literature{" "}
            <span className="font-sans text-[11px] text-muted-foreground font-normal ml-1.5">
              {data.literature.length} items
            </span>
          </h2>
          <LiteratureTable items={data.literature} />
        </div>
      )}

      {/* Persons */}
      {data.persons.length > 0 && (
        <div className="relative pl-4 mb-10">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <h2 className="font-serif text-[15px] text-primary mb-3">People</h2>
          <div className="flex flex-wrap gap-2">
            {data.persons.map((person, i) => (
              <span
                key={i}
                className="relative text-xs py-1.5 pl-3.5 pr-3 rounded border border-white/10 bg-secondary/50"
              >
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] bg-primary/60 rounded-r-sm" />
                {person.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Artists on this label */}
      {data.artists.length > 0 && (
        <div className="relative pl-4 mb-10">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <h2 className="font-serif text-[15px] text-primary mb-3">
            Artists on this Label
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.artists.map((artist) => (
              <Link
                key={artist.slug}
                href={`/band/${artist.slug}`}
                className="relative text-xs py-1.5 pl-3.5 pr-3 rounded border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-primary/[0.03] hover:from-primary/[0.14] hover:to-primary/[0.06] transition-colors"
              >
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] bg-primary/60 rounded-r-sm" />
                {artist.name}
                <span className="ml-1.5 text-muted-foreground">
                  ({artist.release_count})
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* External Links */}
      {external_links && Object.keys(external_links).length > 0 && (
        <div className="relative pl-4 mb-10">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <h2 className="font-serif text-[15px] text-primary mb-3">
            External Links
          </h2>
          <div className="flex flex-wrap gap-3">
            {/* HIDDEN: Discogs link temporarily disabled
            {external_links.discogs && (
              <a
                href={external_links.discogs}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Discogs &rarr;
              </a>
            )}
            */}
            {external_links.wikipedia && (
              <a
                href={external_links.wikipedia}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Wikipedia &rarr;
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
