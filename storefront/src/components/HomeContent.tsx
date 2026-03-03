"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { staggerContainer } from "@/lib/motion"
import { BlockCardVertical } from "./BlockCard"
import type { AuctionBlock } from "@/types"

export function HomeContent({ blocks }: { blocks: AuctionBlock[] }) {
  const active = blocks.filter((b) => b.status === "active")
  const upcoming = blocks.filter((b) =>
    ["scheduled", "preview"].includes(b.status)
  )

  return (
    <>
      {active.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-serif text-2xl md:text-3xl flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-status-active animate-pulse" />
              Active Auctions
            </h2>
            <Link
              href="/auctions"
              className="text-sm text-primary hover:text-primary/80 transition-colors"
            >
              View all →
            </Link>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {active.map((block) => (
              <BlockCardVertical key={block.id} block={block} />
            ))}
          </motion.div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-serif text-2xl md:text-3xl">Coming Soon</h2>
            <Link
              href="/auctions"
              className="text-sm text-primary hover:text-primary/80 transition-colors"
            >
              View all →
            </Link>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {upcoming.map((block) => (
              <BlockCardVertical key={block.id} block={block} />
            ))}
          </motion.div>
        </section>
      )}
    </>
  )
}
