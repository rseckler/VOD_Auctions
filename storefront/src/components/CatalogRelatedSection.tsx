"use client"

import Image from "next/image"
import Link from "next/link"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { pickFormatLabel } from "@/lib/format-display"

type RelatedRelease = {
  id: string
  title: string
  slug: string
  format: string | null
  format_v2?: string | null
  year: number | null
  country: string | null
  coverImage: string | null
  legacy_price: number | null
  effective_price?: number | null
  is_purchasable?: boolean
  legacy_condition: string | null
  product_category?: string | null
  artist_name: string | null
  artist_slug: string | null
  label_name: string | null
  press_orga_name?: string | null
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
      <div className="grid grid-cols-[2rem_1fr_4.5rem_3rem_3.5rem] sm:grid-cols-[2.5rem_2fr_1fr_4.5rem_4rem_5rem] gap-x-2 sm:gap-x-3 px-3 py-2 bg-[rgba(232,224,212,0.04)] border-b border-[rgba(232,224,212,0.08)] text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">
        <span></span>
        <span>Title</span>
        <span className="hidden sm:block">Label</span>
        <span>Format</span>
        <span>Year</span>
        <span className="text-right">Price</span>
      </div>
      {/* Rows */}
      <div className="divide-y divide-[rgba(232,224,212,0.05)]">
        {releases.map((r) => (
          <Link
            key={r.id}
            href={`/catalog/${r.id}`}
            className="grid grid-cols-[2rem_1fr_4.5rem_3rem_3.5rem] sm:grid-cols-[2.5rem_2fr_1fr_4.5rem_4rem_5rem] gap-x-2 sm:gap-x-3 px-3 py-2.5 hover:bg-[rgba(212,165,74,0.06)] transition-colors group items-center"
          >
            {/* Cover */}
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded overflow-hidden bg-[rgba(232,224,212,0.06)] flex-shrink-0">
              {r.coverImage ? (
                <Image
                  src={r.coverImage}
                  alt=""
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 text-[10px]">♪</div>
              )}
            </div>
            {/* Context — Title */}
            <div className="min-w-0">
              <span className="text-sm truncate block group-hover:text-primary transition-colors">
                {(() => {
                  const ctx = r.product_category === "press_literature"
                    ? r.press_orga_name
                    : r.product_category === "label_literature"
                      ? r.label_name
                      : r.artist_name
                  return ctx ? (
                    <>
                      <span className="text-muted-foreground">{ctx}</span>
                      {" — "}
                      <span className="font-medium">{r.title}</span>
                    </>
                  ) : (
                    <span className="font-medium">{r.title}</span>
                  )
                })()}
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
              {pickFormatLabel(r as any) || "—"}
            </span>
            {/* Year */}
            <span className="text-xs text-muted-foreground/60 font-mono">
              {r.year || "—"}
            </span>
            {/* Price */}
            <span className="text-sm font-serif font-bold text-primary text-right">
              {r.effective_price
                ? <>&euro;{Number(r.effective_price).toFixed(0)}</>
                : "—"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
