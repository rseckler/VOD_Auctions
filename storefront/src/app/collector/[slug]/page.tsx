import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd"
import { medusaFetch } from "@/lib/api"

type CollectorProfile = {
  slug: string
  display_name: string
  bio: string | null
  genre_tags: string[]
  member_since: string
  total_bids: number
  total_wins: number
}

type CollectorResponse = {
  profile: CollectorProfile
}

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await medusaFetch<CollectorResponse>(
    `/store/collector/${slug}`,
    { revalidate: 300 }
  )

  if (!data?.profile) {
    return { title: "Collector Not Found | VOD Auctions" }
  }

  return {
    title: `${data.profile.display_name} | Collector Profile | VOD Auctions`,
    description: data.profile.bio
      ? data.profile.bio.substring(0, 160)
      : `Collector profile for ${data.profile.display_name} on VOD Auctions.`,
  }
}

export default async function CollectorProfilePage({ params }: PageProps) {
  const { slug } = await params
  const data = await medusaFetch<CollectorResponse>(
    `/store/collector/${slug}`,
    { revalidate: 300 }
  )

  if (!data?.profile) {
    notFound()
  }

  const profile = data.profile
  const memberSince = new Date(profile.member_since).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  })

  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.display_name,
    url: `https://vod-auctions.com/collector/${profile.slug}`,
    description: profile.bio || undefined,
    memberOf: {
      "@type": "Organization",
      name: "VOD Auctions",
      url: "https://vod-auctions.com",
    },
  }

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "/" },
          { name: "Collectors", url: "/collector" },
          { name: profile.display_name, url: `/collector/${profile.slug}` },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-8">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>Collectors</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{profile.display_name}</span>
        </nav>

        {/* Profile Header */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-16 w-16 rounded-full bg-[#d4a54a]/20 border border-[#d4a54a]/40 flex items-center justify-center">
              <span className="text-2xl font-bold text-[#d4a54a] font-[family-name:var(--font-dm-serif)]">
                {profile.display_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-3xl font-bold font-[family-name:var(--font-dm-serif)] text-foreground">
                {profile.display_name}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Member since {memberSince}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 mb-10">
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground mb-1">Total Bids</p>
            <p className="text-2xl font-bold text-[#d4a54a] font-[family-name:var(--font-dm-serif)]">
              {profile.total_bids}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground mb-1">Auctions Won</p>
            <p className="text-2xl font-bold text-[#d4a54a] font-[family-name:var(--font-dm-serif)]">
              {profile.total_wins}
            </p>
          </div>
        </div>

        {/* Genre Tags */}
        {profile.genre_tags.length > 0 && (
          <div className="mb-10">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Genres of Interest
            </h2>
            <div className="flex flex-wrap gap-2">
              {profile.genre_tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="bg-[#d4a54a]/10 text-[#d4a54a] border-[#d4a54a]/30"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Bio */}
        {profile.bio && (
          <div className="mb-10">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              About
            </h2>
            <div className="rounded-lg border bg-card p-5">
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {profile.bio}
              </p>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
