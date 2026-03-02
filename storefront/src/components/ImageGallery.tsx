"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Disc3, ZoomIn } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"

export function ImageGallery({
  images,
  title,
}: {
  images: string[]
  title: string
}) {
  const [selected, setSelected] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

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
            <motion.img
              key={images[selected]}
              src={images[selected]}
              alt={title}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full object-cover"
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>

        {/* Thumbnails */}
        {images.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {images.slice(0, 8).map((url, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                  i === selected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-[rgba(232,224,212,0.08)] hover:border-[rgba(232,224,212,0.2)]"
                }`}
              >
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-2 bg-[rgba(28,25,21,0.95)] backdrop-blur-xl border-[rgba(232,224,212,0.1)]">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <img
            src={images[selected]}
            alt={title}
            className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
          />
          {images.length > 1 && (
            <div className="flex justify-center gap-2 mt-2">
              {images.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                    i === selected
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-[rgba(232,224,212,0.08)] hover:border-[rgba(232,224,212,0.2)]"
                  }`}
                >
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
