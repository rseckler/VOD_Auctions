"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ChevronLeft, ChevronRight } from "lucide-react"

const images = [
  "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=800&h=800&fit=crop",
  "https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=800&h=800&fit=crop",
]

export function ImageGallery() {
  const [selected, setSelected] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  return (
    <div>
      <div
        className="relative aspect-square overflow-hidden rounded-xl border border-border bg-secondary cursor-pointer"
        onClick={() => setLightbox(true)}
      >
        <img src={images[selected]} alt="Product" className="h-full w-full object-cover" />
      </div>
      <div className="mt-3 flex gap-2">
        {images.map((img, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
              i === selected ? "border-primary" : "border-border hover:border-primary/30"
            }`}
          >
            <img src={img} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
            onClick={() => setLightbox(false)}
          >
            <button className="absolute top-4 right-4 p-2 text-white/70 hover:text-white">
              <X className="h-6 w-6" />
            </button>
            <button
              className="absolute left-4 p-2 text-white/70 hover:text-white"
              onClick={(e) => { e.stopPropagation(); setSelected((s) => (s - 1 + images.length) % images.length) }}
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
            <motion.img
              key={selected}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              src={images[selected]}
              alt=""
              className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute right-4 p-2 text-white/70 hover:text-white"
              onClick={(e) => { e.stopPropagation(); setSelected((s) => (s + 1) % images.length) }}
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
