"use client"

import Link from "next/link"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

type RelatedRelease = {
  id: string
  title: string
  slug: string
  format: string | null
  year: number | null
  country: string | null
  coverImage: string | null
  legacy_price: number | null
  legacy_condition: string | null
  artist_name: string | null
  artist_slug: string | null
  label_name: string | null
}

type CatalogRelatedSectionProps = {
  artistName: string | null
  labelName: string | null
  relatedByArtist: RelatedRelease[]
  relatedByLabel: RelatedRelease[]
}

const FORMAT_COLORS: Record<string, string> = {
  LP: "text-format-vinyl",
  CD: "text-format-cd",
  CASSETTE: "text-format-cassette",
  "7\"": "text-format-vinyl",
  "10\"": "text-format-vinyl",
  "12\"": "text-format-vinyl",
}

export function CatalogRelatedSection({
  artistName,
  labelName,
  relatedByArtist,
  relatedByLabel,
}: CatalogRelatedSectionProps) {
  if (relatedByArtist.length === 0 && relatedByLabel.length === 0) return null

  const defaultTab =
    relatedByArtist.length > 0 ? "artist" : "label"

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Related Information</h2>
      <Tabs defaultValue={defaultTab}>
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto border-b border-[rgba(232,224,212,0.08)] pb-0 mb-6"
        >
          {relatedByArtist.length > 0 && (
            <TabsTrigger value="artist" className="text-sm px-4">
              Releases by {artistName}
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({relatedByArtist.length})
              </span>
            </TabsTrigger>
          )}
          {relatedByLabel.length > 0 && (
            <TabsTrigger value="label" className="text-sm px-4">
              Releases on {labelName}
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({relatedByLabel.length})
              </span>
            </TabsTrigger>
          )}
        </TabsList>

        {relatedByArtist.length > 0 && (
          <TabsContent value="artist">
            <ReleaseTable releases={relatedByArtist} />
          </TabsContent>
        )}

        {relatedByLabel.length > 0 && (
          <TabsContent value="label">
            <ReleaseTable releases={relatedByLabel} />
          </TabsContent>
        )}
      </Tabs>
    </section>
  )
}

function ReleaseTable({ releases }: { releases: RelatedRelease[] }) {
  return (
    <div className="border border-[rgba(232,224,212,0.08)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[2fr_1fr_4.5rem_4rem_5rem] sm:grid-cols-[2fr_1fr_4.5rem_4rem_5rem] gap-x-3 px-3 py-2 bg-[rgba(232,224,212,0.04)] border-b border-[rgba(232,224,212,0.08)] text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">
        <span>Title</span>
        <span className="hidden sm:block">Label</span>
        <span>Format</span>
        <span>Year</span>
        <span className="text-right">Price</span>
      </div>
      {/* Rows */}
      <div className="divide-y divide-[rgba(232,224,212,0.05)]">
        {releases.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[2fr_1fr_4.5rem_4rem_5rem] sm:grid-cols-[2fr_1fr_4.5rem_4rem_5rem] gap-x-3 px-3 py-2.5 hover:bg-[rgba(212,165,74,0.06)] transition-colors group items-center"
          >
            {/* Artist — Title */}
            <div className="min-w-0">
              <span className="text-sm truncate block">
                {r.artist_slug ? (
                  <Link href={`/band/${r.artist_slug}`} className="text-muted-foreground hover:text-primary transition-colors">
                    {r.artist_name || "Unknown"}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">
                    {r.artist_name || "Unknown"}
                  </span>
                )}
                {" — "}
                <Link href={`/catalog/${r.id}`} className="font-medium group-hover:text-primary transition-colors">
                  {r.title}
                </Link>
              </span>
            </div>
            {/* Label */}
            <span className="text-xs text-muted-foreground/60 truncate hidden sm:block">
              {r.label_name || "—"}
            </span>
            {/* Format */}
            <span
              className={`text-[11px] uppercase tracking-wide font-medium ${FORMAT_COLORS[r.format || ""] || "text-muted-foreground/60"}`}
            >
              {r.format || "—"}
            </span>
            {/* Year */}
            <span className="text-xs text-muted-foreground/60 font-mono">
              {r.year || "—"}
            </span>
            {/* Price */}
            <Link href={`/catalog/${r.id}`} className="text-sm font-serif font-bold text-primary text-right">
              {r.legacy_price
                ? <>&euro;{Number(r.legacy_price).toFixed(0)}</>
                : "—"}
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
