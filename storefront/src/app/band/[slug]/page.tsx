import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { medusaFetch } from "@/lib/api"

type BandRelease = {
  id: string
  title: string
  coverImage: string | null
  format_name: string | null
  year: number | null
  legacy_price: number | null
  label_name: string | null
  label_slug: string | null
}

type BandLiterature = {
  id: string
  title: string
  coverImage: string | null
  format_name: string | null
  year: number | null
  legacy_price: number | null
}

type BandLabel = {
  slug: string
  name: string
  release_count: number
}

type BandMember = {
  id: string
  name: string
  slug: string
  real_name: string | null
  country: string | null
  photo_url: string | null
  role: string
  active_from: number | null
  active_to: number | null
  is_founder: boolean
  other_projects: { project_name: string; role: string | null; years: string | null }[]
}

type BandData = {
  artist: {
    id: string
    slug: string
    name: string
    country: string | null
    year: string | null
  }
  content: {
    short_description: string | null
    description: string | null
    genre_tags: string[] | null
    external_links: { discogs?: string; wikipedia?: string; bandcamp?: string } | null
  } | null
  releases: BandRelease[]
  literature: BandLiterature[]
  labels: BandLabel[]
  members: BandMember[]
  release_count: number
}

async function getBand(slug: string): Promise<BandData | null> {
  return medusaFetch<BandData>(
    `/store/band/${slug}`,
    { revalidate: 300 }
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await getBand(slug)
  if (!data) return { title: "Band Not Found" }

  const b = data.artist
  const metaDesc =
    data.content?.short_description ||
    `Explore the discography of ${b.name}${b.country ? ` (${b.country})` : ""}. ${data.releases.length} releases available on VOD Auctions.`

  const ogImage = data.releases.find((r) => r.coverImage)?.coverImage

  return {
    title: `${b.name} — Discography & Releases`,
    description: metaDesc,
    openGraph: {
      title: `${b.name} — Discography & Releases — VOD Auctions`,
      description: metaDesc,
      ...(ogImage ? { images: [{ url: ogImage, alt: b.name }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: `${b.name} — Discography & Releases — VOD Auctions`,
      description: metaDesc,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    alternates: {
      canonical: `/band/${slug}`,
    },
  }
}

function ReleaseTable({ releases }: { releases: BandRelease[] }) {
  if (!releases.length) return null
  const sorted = [...releases].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground uppercase tracking-wider">
            <th className="text-left py-2 w-12" />
            <th className="text-left py-2">Title</th>
            <th className="text-left py-2 hidden sm:table-cell">Format</th>
            <th className="text-left py-2 hidden sm:table-cell">Year</th>
            <th className="text-left py-2 hidden md:table-cell">Label</th>
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
              <td className="py-2 hidden md:table-cell">
                {r.label_slug ? (
                  <Link
                    href={`/label/${r.label_slug}`}
                    className="text-muted-foreground hover:text-primary transition-colors text-xs"
                  >
                    {r.label_name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {r.label_name || "---"}
                  </span>
                )}
              </td>
              <td className="py-2 text-right font-mono text-xs">
                {r.legacy_price
                  ? `\u20AC${Number(r.legacy_price).toFixed(2)}`
                  : "---"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LiteratureTable({ items }: { items: BandLiterature[] }) {
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
                {item.legacy_price
                  ? `\u20AC${Number(item.legacy_price).toFixed(2)}`
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

export default async function BandPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getBand(slug)
  if (!data) notFound()

  const band = data.artist
  const content = data.content
  const description = content?.description || null
  const genres = content?.genre_tags || []
  const external_links = content?.external_links || null

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: band.name,
    ...(band.country && { location: { "@type": "Country", name: band.country } }),
    ...(band.year && { foundingDate: band.year }),
    ...(genres.length && { genre: genres }),
    ...(description && { description: description.replace(/<[^>]*>/g, "").slice(0, 300) }),
    ...(data.members?.length > 0 && {
      member: data.members.map((m) => ({
        "@type": "Person",
        name: m.name,
        ...(m.role && { roleName: m.role }),
        ...(m.active_from && { startDate: String(m.active_from) }),
        ...(m.active_to && { endDate: String(m.active_to) }),
      })),
    }),
    url: `https://vod-auctions.com/band/${band.slug}`,
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-8 flex items-center gap-1 flex-wrap">
        <Link href="/" className="hover:text-foreground transition-colors">
          Home
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <Link href="/catalog?category=band_literature" className="hover:text-foreground transition-colors">
          Bands
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="text-foreground truncate">{band.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight">
          {band.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {band.country && (
            <Badge variant="secondary">{band.country}</Badge>
          )}
          {band.year && (
            <Badge variant="secondary">Est. {band.year}</Badge>
          )}
          {genres.map((genre) => (
            <Badge
              key={genre}
              variant="outline"
              className="bg-primary/10 text-primary border-primary/20"
            >
              {genre}
            </Badge>
          ))}
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

      {/* Members */}
      {data.members && data.members.length > 0 && (
        <div className="relative pl-4 mb-10">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <h2 className="font-serif text-[15px] text-primary mb-3">
            Members{" "}
            <span className="font-sans text-[11px] text-muted-foreground font-normal ml-1.5">
              {data.members.length}
            </span>
          </h2>
          <div className="space-y-2">
            {data.members.map((member) => (
              <div
                key={`${member.id}-${member.role}`}
                className="flex items-baseline gap-2 text-sm"
              >
                <span className="font-medium text-foreground">
                  {member.name}
                </span>
                {member.is_founder && (
                  <span className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider">
                    founder
                  </span>
                )}
                <span className="text-muted-foreground">
                  — {member.role}
                </span>
                {(member.active_from || member.active_to) && (
                  <span className="text-xs text-muted-foreground/70">
                    ({member.active_from || "?"}–{member.active_to || "present"})
                  </span>
                )}
                {member.other_projects.length > 0 && (
                  <span className="text-xs text-muted-foreground/60">
                    also: {member.other_projects.map((p) => p.project_name).join(", ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discography */}
      {data.releases.length > 0 && (
        <div className="relative pl-4 mb-10">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <h2 className="font-serif text-[15px] text-primary mb-3">
            Discography{" "}
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

      {/* Labels */}
      {data.labels.length > 0 && (
        <div className="relative pl-4 mb-10">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <h2 className="font-serif text-[15px] text-primary mb-3">Labels</h2>
          <div className="flex flex-wrap gap-2">
            {data.labels.map((label) => (
              <Link
                key={label.slug}
                href={`/label/${label.slug}`}
                className="relative text-xs py-1.5 pl-3.5 pr-3 rounded border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-primary/[0.03] hover:from-primary/[0.14] hover:to-primary/[0.06] transition-colors"
              >
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] bg-primary/60 rounded-r-sm" />
                {label.name}
                <span className="ml-1.5 text-muted-foreground">
                  ({label.release_count})
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
            {external_links.bandcamp && (
              <a
                href={external_links.bandcamp}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Bandcamp &rarr;
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
