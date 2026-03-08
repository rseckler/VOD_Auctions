import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { medusaFetch } from "@/lib/api"

type PressPublication = {
  id: string
  title: string
  coverImage: string | null
  format_name: string | null
  year: number | null
  legacy_price: number | null
}

type PressOrgaDetail = {
  id: string
  slug: string
  name: string
  country: string | null
  year: string | null
  short_description: string | null
  description: string | null
  press_literature: PressPublication[]
  external_links: { discogs?: string; wikipedia?: string }
}

async function getPressOrga(
  slug: string
): Promise<{ press: PressOrgaDetail } | null> {
  return medusaFetch<{ press: PressOrgaDetail }>(
    `/store/press/${slug}`,
    { revalidate: 300 }
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await getPressOrga(slug)
  if (!data) return { title: "Press Organization Not Found" }

  const p = data.press
  const description =
    p.short_description ||
    `Explore publications by ${p.name}${p.country ? ` (${p.country})` : ""}. ${p.press_literature.length} items available on VOD Auctions.`

  return {
    title: `${p.name} — Publications`,
    description,
    openGraph: {
      title: `${p.name} — Publications — VOD Auctions`,
      description,
    },
  }
}

function PublicationTable({ items }: { items: PressPublication[] }) {
  if (!items.length) return null
  const sorted = [...items].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))

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
          {sorted.map((item, i) => (
            <tr
              key={item.id}
              className={
                i > 0 ? "border-t border-dotted border-white/[0.06]" : ""
              }
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

export default async function PressPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getPressOrga(slug)
  if (!data) notFound()

  const press = data.press

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: press.name,
    ...(press.country && {
      address: { "@type": "PostalAddress", addressCountry: press.country },
    }),
    ...(press.year && { foundingDate: press.year }),
    ...(press.description && {
      description: press.description.replace(/<[^>]*>/g, "").slice(0, 300),
    }),
    url: `https://vod-auctions.com/press/${press.slug}`,
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
        <Link
          href="/catalog?category=press_literature"
          className="hover:text-foreground transition-colors"
        >
          Press
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="text-foreground truncate">{press.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight">
          {press.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {press.country && (
            <Badge variant="secondary">{press.country}</Badge>
          )}
          {press.year && (
            <Badge variant="secondary">Est. {press.year}</Badge>
          )}
        </div>
      </div>

      {/* Description */}
      {press.description && (
        <div className="relative pl-4 mb-10">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <h2 className="font-serif text-[15px] text-primary mb-3">About</h2>
          {isHtml(press.description) ? (
            <div
              className="prose prose-invert prose-sm max-w-none text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: press.description }}
            />
          ) : (
            <div className="space-y-2 text-sm text-muted-foreground">
              {press.description
                .split("\n")
                .filter(Boolean)
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Publications */}
      {press.press_literature.length > 0 && (
        <div className="relative pl-4 mb-10">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
          <h2 className="font-serif text-[15px] text-primary mb-3">
            Publications{" "}
            <span className="font-sans text-[11px] text-muted-foreground font-normal ml-1.5">
              {press.press_literature.length} items
            </span>
          </h2>
          <PublicationTable items={press.press_literature} />
        </div>
      )}

      {/* External Links */}
      {press.external_links &&
        Object.keys(press.external_links).length > 0 && (
          <div className="relative pl-4 mb-10">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-transparent" />
            <h2 className="font-serif text-[15px] text-primary mb-3">
              External Links
            </h2>
            <div className="flex flex-wrap gap-3">
              {press.external_links.discogs && (
                <a
                  href={press.external_links.discogs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Discogs &rarr;
                </a>
              )}
              {press.external_links.wikipedia && (
                <a
                  href={press.external_links.wikipedia}
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
