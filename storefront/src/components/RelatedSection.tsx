"use client"

import Image from "next/image"
import Link from "next/link"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { BlockItem } from "@/types"

type RelatedSectionProps = {
  blockSlug: string
  currentItemId: string
  blockItems: BlockItem[]
  artistName: string | null
  labelName: string | null
  variousArtists?: { artist_name: string | null; role: string }[]
}

const FORMAT_COLORS: Record<string, string> = {
  LP: "text-format-vinyl",
  CD: "text-format-cd",
  CASSETTE: "text-format-cassette",
  "7\"": "text-format-vinyl",
  "10\"": "text-format-vinyl",
  "12\"": "text-format-vinyl",
}

export function RelatedSection({
  blockSlug,
  currentItemId,
  blockItems,
  artistName,
  labelName,
  variousArtists,
}: RelatedSectionProps) {
  const otherItems = blockItems.filter((i) => i.id !== currentItemId)

  const sameArtistItems = artistName
    ? otherItems.filter(
        (i) =>
          i.release?.artist_name?.toLowerCase() === artistName.toLowerCase()
      )
    : []

  const sameLabelItems = labelName
    ? otherItems.filter(
        (i) =>
          i.release?.label_name?.toLowerCase() === labelName.toLowerCase()
      )
    : []

  const blockArtists = Array.from(
    new Set(
      otherItems
        .map((i) => i.release?.artist_name)
        .filter((name): name is string => !!name)
    )
  ).sort()

  const blockLabels = Array.from(
    new Set(
      otherItems
        .map((i) => i.release?.label_name)
        .filter((name): name is string => !!name)
    )
  ).sort()

  if (otherItems.length === 0) return null

  const defaultTab =
    sameArtistItems.length > 0
      ? "artist-releases"
      : sameLabelItems.length > 0
        ? "label-releases"
        : "all-releases"

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Related Information</h2>
      <Tabs defaultValue={defaultTab}>
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto border-b border-[rgba(232,224,212,0.08)] pb-0 mb-6"
        >
          {sameArtistItems.length > 0 && (
            <TabsTrigger value="artist-releases" className="text-sm px-4">
              Releases by {artistName}
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({sameArtistItems.length})
              </span>
            </TabsTrigger>
          )}
          {sameLabelItems.length > 0 && (
            <TabsTrigger value="label-releases" className="text-sm px-4">
              Releases on {labelName}
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({sameLabelItems.length})
              </span>
            </TabsTrigger>
          )}
          {blockArtists.length > 0 && (
            <TabsTrigger value="artists" className="text-sm px-4">
              Artists in Block
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({blockArtists.length})
              </span>
            </TabsTrigger>
          )}
          {blockLabels.length > 0 && (
            <TabsTrigger value="labels" className="text-sm px-4">
              Labels in Block
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({blockLabels.length})
              </span>
            </TabsTrigger>
          )}
          <TabsTrigger value="all-releases" className="text-sm px-4">
            All Lots
            <span className="ml-1.5 text-xs text-muted-foreground">
              ({otherItems.length})
            </span>
          </TabsTrigger>
        </TabsList>

        {sameArtistItems.length > 0 && (
          <TabsContent value="artist-releases">
            <ItemTable items={sameArtistItems} blockSlug={blockSlug} />
          </TabsContent>
        )}

        {sameLabelItems.length > 0 && (
          <TabsContent value="label-releases">
            <ItemTable items={sameLabelItems} blockSlug={blockSlug} />
          </TabsContent>
        )}

        {blockArtists.length > 0 && (
          <TabsContent value="artists">
            <NameTable
              entries={blockArtists.map((name) => ({
                name,
                count: otherItems.filter(
                  (i) => i.release?.artist_name === name
                ).length,
              }))}
            />
          </TabsContent>
        )}

        {blockLabels.length > 0 && (
          <TabsContent value="labels">
            <NameTable
              entries={blockLabels.map((name) => ({
                name,
                count: otherItems.filter(
                  (i) => i.release?.label_name === name
                ).length,
              }))}
            />
          </TabsContent>
        )}

        <TabsContent value="all-releases">
          <ItemTable items={otherItems} blockSlug={blockSlug} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

function ItemTable({
  items,
  blockSlug,
}: {
  items: BlockItem[]
  blockSlug: string
}) {
  return (
    <div className="border border-[rgba(232,224,212,0.08)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[2rem_2rem_1fr_4.5rem_3rem_3.5rem] sm:grid-cols-[2.5rem_3rem_2fr_1fr_4.5rem_4rem_5rem] gap-x-2 sm:gap-x-3 px-3 py-2 bg-[rgba(232,224,212,0.04)] border-b border-[rgba(232,224,212,0.08)] text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">
        <span></span>
        <span>Lot</span>
        <span>Title</span>
        <span className="hidden sm:block">Label</span>
        <span>Format</span>
        <span>Year</span>
        <span className="text-right">Price</span>
      </div>
      {/* Rows */}
      <div className="divide-y divide-[rgba(232,224,212,0.05)]">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/auctions/${blockSlug}/${item.id}`}
            className="grid grid-cols-[2rem_2rem_1fr_4.5rem_3rem_3.5rem] sm:grid-cols-[2.5rem_3rem_2fr_1fr_4.5rem_4rem_5rem] gap-x-2 sm:gap-x-3 px-3 py-2.5 hover:bg-[rgba(212,165,74,0.06)] transition-colors group items-center"
          >
            {/* Cover */}
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded overflow-hidden bg-[rgba(232,224,212,0.06)] flex-shrink-0">
              {item.release?.coverImage ? (
                <Image
                  src={item.release.coverImage}
                  alt=""
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 text-[10px]">♪</div>
              )}
            </div>
            {/* Lot */}
            <span className="text-xs font-mono text-muted-foreground/60">
              {item.lot_number
                ? `#${String(item.lot_number).padStart(2, "0")}`
                : "—"}
            </span>
            {/* Artist — Title */}
            <div className="min-w-0">
              <span className="text-sm truncate block group-hover:text-primary transition-colors">
                <span className="text-muted-foreground">
                  {item.release?.artist_name || "Unknown"}
                </span>
                {" — "}
                <span className="font-medium">
                  {item.release?.title || item.release_id}
                </span>
              </span>
            </div>
            {/* Label */}
            <span className="text-xs text-muted-foreground/60 truncate hidden sm:block">
              {item.release?.label_name || "—"}
            </span>
            {/* Format */}
            <span
              className={`text-[11px] uppercase tracking-wide font-medium ${FORMAT_COLORS[item.release?.format || ""] || "text-muted-foreground/60"}`}
            >
              {item.release?.format || "—"}
            </span>
            {/* Year */}
            <span className="text-xs text-muted-foreground/60 font-mono">
              {item.release?.year || "—"}
            </span>
            {/* Price */}
            <span className="text-sm font-serif font-bold text-primary text-right">
              &euro;{(item.current_price || item.start_price).toFixed(0)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function NameTable({
  entries,
}: {
  entries: { name: string; count: number }[]
}) {
  return (
    <div className="border border-[rgba(232,224,212,0.08)] rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_6rem] gap-x-3 px-3 py-2 bg-[rgba(232,224,212,0.04)] border-b border-[rgba(232,224,212,0.08)] text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">
        <span>Name</span>
        <span className="text-right">Releases</span>
      </div>
      <div className="divide-y divide-[rgba(232,224,212,0.05)]">
        {entries.map(({ name, count }) => (
          <div
            key={name}
            className="grid grid-cols-[1fr_6rem] gap-x-3 px-3 py-2.5 items-center"
          >
            <span className="text-sm truncate">{name}</span>
            <span className="text-xs text-muted-foreground/60 text-right font-mono">
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
