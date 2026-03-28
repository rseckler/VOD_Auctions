"use client"

import Link from "next/link"
import Image from "next/image"
import { Clock, Calendar, Disc3 } from "lucide-react"
import { motion } from "framer-motion"
import { staggerItem } from "@/lib/motion"
import type { AuctionBlock } from "@/types"

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  active: { label: "Live", className: "text-status-active" },
  scheduled: { label: "Scheduled", className: "text-muted-foreground" },
  preview: { label: "Preview", className: "text-status-preview" },
  ended: { label: "Ended", className: "text-muted-foreground/60" },
}

const TYPE_LABELS: Record<string, string> = {
  theme: "Theme Block",
  highlight: "Highlight",
  clearance: "Clearance",
  flash: "Flash",
}

function formatDate(dateStr: string, includeTime = false) {
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }
  if (includeTime) {
    opts.hour = "2-digit"
    opts.minute = "2-digit"
  }
  const formatted = new Date(dateStr).toLocaleString("en-GB", opts)
  return includeTime ? `${formatted} CET` : formatted
}

function timeRemaining(endStr: string): string {
  const diff = new Date(endStr).getTime() - Date.now()
  if (diff <= 0) return "Ended"
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `${days}d ${hours}h left`
  return `${hours}h left`
}

export function BlockCardVertical({ block }: { block: AuctionBlock }) {
  const status = STATUS_CONFIG[block.status]

  return (
    <motion.div variants={staggerItem}>
      <Link href={`/auctions/${block.slug}`}>
        <div className="group overflow-hidden rounded-2xl bg-[rgba(232,224,212,0.04)] border border-[rgba(232,224,212,0.08)] hover:border-[rgba(212,165,74,0.4)] transition-all duration-300 hover:-translate-y-1">
          {/* Image */}
          <div className="relative aspect-[16/10] overflow-hidden bg-[#2a2520]">
            {block.header_image ? (
              <Image
                src={block.header_image}
                alt={block.title}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#2a2520] to-[#3a3028] flex items-center justify-center">
                <Disc3 className="h-12 w-12 text-muted-foreground/10" />
              </div>
            )}
            {/* Status overlay */}
            {status && (
              <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1 rounded-md bg-[rgba(28,25,21,0.85)] backdrop-blur-sm text-xs font-semibold ${status.className}`}>
                {block.status === "active" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-status-active" />
                )}
                {status.label}
              </div>
            )}
            {/* Lots count overlay */}
            <div className="absolute top-3 right-3 px-3 py-1 rounded-md bg-[rgba(28,25,21,0.85)] backdrop-blur-sm text-xs text-muted-foreground">
              {block.items_count} Lots
            </div>
          </div>

          {/* Info */}
          <div className="p-5">
            <div className="text-[11px] uppercase tracking-[2px] text-primary font-semibold mb-2">
              {TYPE_LABELS[block.block_type] || block.block_type}
            </div>
            <h3 className="font-serif text-xl group-hover:text-primary transition-colors">
              {block.title}
            </h3>
            {block.subtitle && (
              <p className="text-muted-foreground text-sm mt-1">{block.subtitle}</p>
            )}
            {block.short_description && (
              <p className="text-muted-foreground/60 text-sm mt-2 line-clamp-2">
                {block.short_description}
              </p>
            )}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-[rgba(232,224,212,0.06)] text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(block.start_time, block.status === "scheduled")}
              </span>
              {block.status !== "ended" && (
                <span className="text-primary font-medium">
                  From &euro;{block.min_price?.toFixed(0) || "—"}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export function BlockCardHorizontal({ block }: { block: AuctionBlock }) {
  const status = STATUS_CONFIG[block.status]

  return (
    <motion.div variants={staggerItem}>
      <Link href={`/auctions/${block.slug}`}>
        <div className="group flex flex-col sm:flex-row gap-0 overflow-hidden rounded-2xl bg-[rgba(232,224,212,0.04)] border border-[rgba(232,224,212,0.08)] hover:border-[rgba(212,165,74,0.4)] transition-all duration-300">
          {block.header_image && (
            <div className="relative sm:w-52 sm:h-36 flex-shrink-0 overflow-hidden aspect-[16/10] sm:aspect-auto">
              <Image
                src={block.header_image}
                alt={block.title}
                fill
                sizes="(max-width: 640px) 100vw, 208px"
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
          )}
          <div className="flex-1 min-w-0 p-5">
            <div className="flex items-center gap-2 mb-1.5">
              {status && (
                <span className={`flex items-center gap-1.5 text-xs font-semibold ${status.className}`}>
                  {block.status === "active" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-status-active" />
                  )}
                  {status.label}
                </span>
              )}
              <span className="text-[10px] uppercase tracking-[2px] text-primary font-semibold">
                {TYPE_LABELS[block.block_type] || block.block_type}
              </span>
            </div>
            <h3 className="font-serif text-lg truncate group-hover:text-primary transition-colors">
              {block.title}
            </h3>
            {block.subtitle && (
              <p className="text-muted-foreground text-sm">{block.subtitle}</p>
            )}
            {block.short_description && (
              <p className="text-muted-foreground/60 text-sm mt-1 line-clamp-2">
                {block.short_description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span>{block.items_count} Lots</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(block.start_time, block.status === "scheduled")} – {formatDate(block.end_time, block.status === "scheduled")}
              </span>
              {block.status === "active" && (
                <span className="flex items-center gap-1 text-status-active">
                  <Clock className="h-3 w-3" />
                  {timeRemaining(block.end_time)}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
