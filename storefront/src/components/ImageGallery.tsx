"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Disc3, ZoomIn, Grid3X3, X, ChevronLeft, ChevronRight } from "lucide-react"

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

  // Touch swipe support for lightbox
  const touchStartX = useRef(0)
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) goTo(diff > 0 ? "next" : "prev")
  }

  // Touch swipe support for main image (mobile only)
  const mainTouchStartX = useRef(0)
  const mainTouchStartY = useRef(0)
  const mainSwiped = useRef(false)
  function handleMainTouchStart(e: React.TouchEvent) {
    mainTouchStartX.current = e.touches[0].clientX
    mainTouchStartY.current = e.touches[0].clientY
    mainSwiped.current = false
  }
  function handleMainTouchEnd(e: React.TouchEvent) {
    if (isDesktop || images.length <= 1) return
    const dx = mainTouchStartX.current - e.changedTouches[0].clientX
    const dy = mainTouchStartY.current - e.changedTouches[0].clientY
    // Only trigger swipe if horizontal movement dominates and exceeds threshold
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      mainSwiped.current = true
      e.preventDefault()
      goTo(dx > 0 ? "next" : "prev")
    }
  }
  function handleMainClick() {
    if (mainSwiped.current) {
      mainSwiped.current = false
      return
    }
    setLightboxOpen(true)
  }

  // Desktop zoom state for main image
  const [zoomActive, setZoomActive] = useState(false)
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 })
  const mainImageRef = useRef<HTMLButtonElement>(null)

  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setZoomOrigin({ x, y })
  }

  // Only enable zoom on desktop (1024px+)
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)")
    setIsDesktop(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  // Keyboard navigation + ESC close in lightbox
  useEffect(() => {
    if (!lightboxOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goTo("prev")
      else if (e.key === "ArrowRight") goTo("next")
      else if (e.key === "Escape") setLightboxOpen(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [lightboxOpen, goTo])

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (lightboxOpen) {
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = "" }
    }
  }, [lightboxOpen])

  if (images.length === 0) {
    return (
      <div className="aspect-square rounded-xl bg-secondary border border-border flex items-center justify-center">
        <Disc3 className="h-16 w-16 text-muted-foreground/10" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {/* Main Image */}
        <button
          ref={mainImageRef}
          onClick={handleMainClick}
          onMouseEnter={() => isDesktop && setZoomActive(true)}
          onMouseLeave={() => { setZoomActive(false) }}
          onMouseMove={isDesktop ? handleMouseMove : undefined}
          onTouchStart={!isDesktop && images.length > 1 ? handleMainTouchStart : undefined}
          onTouchEnd={!isDesktop && images.length > 1 ? handleMainTouchEnd : undefined}
          className="relative group w-full aspect-square rounded-xl overflow-hidden bg-secondary border border-border cursor-zoom-in"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={images[selected]}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full"
              style={
                zoomActive && isDesktop
                  ? {
                      transform: "scale(2)",
                      transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                      transition: "transform-origin 0.1s ease",
                    }
                  : { transform: "scale(1)", transition: "transform 0.2s ease" }
              }
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
          <div className={`absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center ${zoomActive ? "!bg-transparent" : ""}`}>
            <ZoomIn className={`h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity ${zoomActive ? "!opacity-0" : ""}`} />
          </div>
          {/* Mobile swipe chevrons */}
          {images.length > 1 && !isDesktop && (
            <>
              <div className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white/70 pointer-events-none lg:hidden">
                <ChevronLeft className="h-4 w-4" />
              </div>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white/70 pointer-events-none lg:hidden">
                <ChevronRight className="h-4 w-4" />
              </div>
            </>
          )}
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
                    : "border-border hover:border-[rgba(232,224,212,0.2)]"
                }`}
              >
                <Image
                  src={url}
                  alt={`${title} — image ${i + 1}`}
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
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Grid3X3 className="h-4 w-4" />
            Show all {images.length} images
          </button>
        )}
      </div>

      {/* Fullscreen Lightbox */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            {/* Backdrop — click to close */}
            <div
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
              onClick={() => setLightboxOpen(false)}
            />

            {/* Close button */}
            <button
              onClick={() => setLightboxOpen(false)}
              aria-label="Close lightbox"
              className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Main image area */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-[1400px] px-4 sm:px-8">
              <div
                className="relative w-full"
                style={{ height: "min(75vh, 1200px)" }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={images[selected]}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                    className="w-full h-full"
                  >
                    <Image
                      src={images[selected]}
                      alt={title}
                      fill
                      sizes="(max-width: 1024px) 95vw, 1400px"
                      className="object-contain"
                      priority
                    />
                  </motion.div>
                </AnimatePresence>

                {/* Prev / Next buttons */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => goTo("prev")}
                      aria-label="Previous image"
                      className="absolute left-0 sm:-left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      onClick={() => goTo("next")}
                      aria-label="Next image"
                      className="absolute right-0 sm:-right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  </>
                )}
              </div>

              {/* Counter + Thumbnail strip */}
              {images.length > 1 && (
                <div className="relative z-10 mt-4 flex flex-col items-center gap-3">
                  <p className="text-sm text-white/60 font-mono">
                    {selected + 1} / {images.length}
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin max-w-[90vw]">
                    {images.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setSelected(i)}
                        className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                          i === selected
                            ? "border-primary ring-1 ring-primary/30"
                            : "border-white/10 hover:border-white/30"
                        }`}
                      >
                        <Image
                          src={url}
                          alt={`${title} — image ${i + 1}`}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[rgba(10,8,6,0.8)] backdrop-blur-md border-b border-border">
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
                        : "border-border hover:border-[rgba(232,224,212,0.2)]"
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
