"use client"

import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { Clock, Calendar, ArrowRight } from "lucide-react"
import { staggerContainer } from "@/lib/motion"
import { BlockCardVertical } from "./BlockCard"
import type { AuctionBlock } from "@/types"

function formatStartTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }) + " CET"
}

function FeaturedBlock({ block }: { block: AuctionBlock }) {
  const isActive = block.status === "active"
  const coverImages = block.cover_images || []

  return (
    <Link href={`/auctions/${block.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card-hover transition-all duration-300 group-hover:border-primary/35 group-hover:shadow-[0_0_40px_rgba(212,165,74,0.08)]">
        {/* Image strip */}
        <div className="relative h-36 md:h-48 w-full overflow-hidden">
          {coverImages.length > 0 ? (
            <div className="flex h-full gap-0.5">
              {coverImages.slice(0, 3).map((url: string, i: number) => (
                <div key={i} className="relative flex-1 overflow-hidden">
                  <Image
                    src={url}
                    alt=""
                    aria-hidden="true"
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 33vw, 400px"
                  />
                </div>
              ))}
              {coverImages.length === 0 && (
                <div className="w-full h-full bg-secondary/40" />
              )}
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-secondary/60 to-secondary/20" />
          )}
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-card-hover via-[#1a1612]/20 to-transparent" />

          {/* Status badge */}
          <div className="absolute top-4 left-4">
            {isActive ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-status-active/20 text-status-active border border-status-active/30 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-status-active animate-pulse" />
                Live Now
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/25 backdrop-blur-sm">
                <Calendar className="h-3 w-3" />
                {block.start_time ? formatStartTime(block.start_time) : "Coming Soon"}
              </span>
            )}
          </div>

          {/* Lots badge */}
          <div className="absolute top-4 right-4">
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-black/50 text-foreground/80 backdrop-blur-sm border border-white/10">
              {block.items_count ?? 0} Lots
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <div className="text-[10px] uppercase tracking-[2.5px] text-primary font-semibold mb-2">
            Theme Block
          </div>
          <h3 className="font-serif text-2xl md:text-3xl mb-2 group-hover:text-primary transition-colors">
            {block.title}
          </h3>
          {block.subtitle && (
            <p className="text-muted-foreground text-base mb-3">{block.subtitle}</p>
          )}
          {block.short_description && (
            <p className="text-muted-foreground/60 text-sm line-clamp-2 mb-5">
              {block.short_description}
            </p>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-primary/10">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {isActive && block.end_time && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  Ends {new Date(block.end_time).toLocaleString("en-GB", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    timeZone: "Europe/Berlin"
                  })} CET
                </span>
              )}
              {!isActive && block.end_time && (
                <span className="flex items-center gap-1.5 text-xs">
                  <Clock className="h-3.5 w-3.5" />
                  Until {new Date(block.end_time).toLocaleString("en-GB", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    timeZone: "Europe/Berlin"
                  })} CET
                </span>
              )}
              {block.min_price != null && (
                <span className="text-primary font-semibold">
                  From €{Number(block.min_price).toFixed(0)}
                </span>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm text-primary font-medium group-hover:gap-2.5 transition-all">
              {isActive ? "Place a Bid" : "Preview Lots"}
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export function HomeContent({ blocks }: { blocks: AuctionBlock[] }) {
  const active = blocks.filter((b) => b.status === "active")
  const upcoming = blocks.filter((b) =>
    ["scheduled", "preview"].includes(b.status)
  )

  if (active.length === 0 && upcoming.length === 0) return null

  // Show featured layout for first block, grid for overflow
  const featuredActive = active[0]
  const featuredUpcoming = upcoming[0]
  const extraActive = active.slice(1)
  const extraUpcoming = upcoming.slice(1)

  return (
    <>
      {featuredActive && (
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-2xl md:text-3xl flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-status-active animate-pulse" />
              Active Auctions
            </h2>
            <Link href="/auctions" className="text-sm text-primary hover:text-primary/80 transition-colors">
              View all →
            </Link>
          </div>
          <FeaturedBlock block={featuredActive} />
          {extraActive.length > 0 && (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6"
            >
              {extraActive.map((block) => (
                <BlockCardVertical key={block.id} block={block} />
              ))}
            </motion.div>
          )}
        </section>
      )}

      {featuredUpcoming && (
        <section className="mx-auto max-w-6xl px-6 py-16 border-t border-primary/10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-2xl md:text-3xl">Coming Soon</h2>
            <Link href="/auctions" className="text-sm text-primary hover:text-primary/80 transition-colors">
              View all →
            </Link>
          </div>
          <FeaturedBlock block={featuredUpcoming} />
          {extraUpcoming.length > 0 && (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6"
            >
              {extraUpcoming.map((block) => (
                <BlockCardVertical key={block.id} block={block} />
              ))}
            </motion.div>
          )}
        </section>
      )}
    </>
  )
}
