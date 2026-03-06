"use client"

import { useState, useCallback, useEffect } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Disc3, ZoomIn, Grid3X3, X, ChevronLeft, ChevronRight } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"

const THUMBNAIL_LIMIT = 8

export function ImageGallery({
  images,
  title,
}: {
  images: string[]
  title: string
}) {
  const [selected, setSelected] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [extendedOpen, setExtendedOpen] = useState(false)

  const hasMore = images.length > THUMBNAIL_LIMIT

  const goTo = useCallback(
    (dir: "prev" | "next") => {
      setSelected((s) =>
        dir === "prev"
          ? (s - 1 + images.length) % images.length
          : (s + 1) % images.length
      )
    },
    [images.length]
  )

  // Keyboard navigation in lightbox
  useEffect(() => {
    if (!lightboxOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goTo("prev")
      else if (e.key === "ArrowRight") goTo("next")
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [lightboxOpen, goTo])

  if (images.length === 0) {
    return (
      <div className="aspect-square rounded-xl bg-[#2a2520] border border-[rgba(232,224,212,0.08)] flex items-center justify-center">
        <Disc3 className="h-16 w-16 text-muted-foreground/10" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {/* Main Image */}
        <button
          onClick={() => setLightboxOpen(true)}
          className="relative group w-full aspect-square rounded-xl overflow-hidden bg-[#2a2520] border border-[rgba(232,224,212,0.08)] cursor-zoom-in"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={images[selected]}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full"
            >
              <Image
                src={images[selected]}
                alt={title}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            </motion.div>
          </AnimatePresence>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {/* Image counter badge */}
          {images.length > 1 && (
            <span className="absolute bottom-2 right-2 text-[11px] font-mono bg-black/60 text-white/90 px-2 py-0.5 rounded-full backdrop-blur-sm">
              {selected + 1} / {images.length}
            </span>
          )}
        </button>

        {/* Thumbnails */}
        {images.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {images.slice(0, THUMBNAIL_LIMIT).map((url, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                  i === selected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-[rgba(232,224,212,0.08)] hover:border-[rgba(232,224,212,0.2)]"
                }`}
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  sizes="25vw"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* "Show all images" button */}
        {hasMore && (
          <button
            onClick={() => setExtendedOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[rgba(232,224,212,0.12)] bg-[#2a2520]/50 hover:bg-[#2a2520] text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Grid3X3 className="h-4 w-4" />
            Show all {images.length} images
          </button>
        )}
      </div>

      {/* Lightbox with navigation */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-2 bg-[rgba(28,25,21,0.95)] backdrop-blur-xl border-[rgba(232,224,212,0.1)]">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div className="relative w-full max-h-[85vh] aspect-square">
            <Image
              src={images[selected]}
              alt={title}
              fill
              sizes="(max-width: 1024px) 100vw, 896px"
              className="object-contain rounded-lg"
              priority
            />
            {/* Prev / Next buttons */}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => goTo("prev")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => goTo("next")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
          {/* Counter */}
          {images.length > 1 && (
            <p className="text-center text-xs text-muted-foreground mt-1">
              {selected + 1} / {images.length}
            </p>
          )}
          {/* Scrollable thumbnail strip */}
          {images.length > 1 && (
            <div className="flex gap-2 mt-1 overflow-x-auto pb-1 scrollbar-thin">
              {images.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                    i === selected
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-[rgba(232,224,212,0.08)] hover:border-[rgba(232,224,212,0.2)]"
                  }`}
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Extended Gallery overlay */}
      <AnimatePresence>
        {extendedOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[rgba(10,8,6,0.95)] backdrop-blur-sm overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[rgba(10,8,6,0.8)] backdrop-blur-md border-b border-[rgba(232,224,212,0.08)]">
              <h2 className="text-lg font-semibold">
                All Images ({images.length})
              </h2>
              <button
                onClick={() => setExtendedOpen(false)}
                className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Grid */}
            <div className="max-w-6xl mx-auto px-6 py-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {images.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSelected(i)
                      setExtendedOpen(false)
                      setLightboxOpen(true)
                    }}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all group cursor-zoom-in ${
                      i === selected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-[rgba(232,224,212,0.08)] hover:border-[rgba(232,224,212,0.2)]"
                    }`}
                  >
                    <Image
                      src={url}
                      alt={`${title} — Image ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono bg-black/60 text-white/80 px-1.5 py-0.5 rounded backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      {i + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
