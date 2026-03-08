"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Disc3, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { medusaFetch } from "@/lib/api"
import { staggerContainer, staggerItem } from "@/lib/motion"

type CatalogRelease = {
  id: string
  title: string
  slug: string
  format: string
  format_name: string | null
  format_group: string | null
  product_category: string
  year: number | null
  country: string | null
  coverImage: string | null
  catalogNumber: string | null
  article_number: string | null
  legacy_condition: string | null
  legacy_price: number | null
  legacy_format_detail: string | null
  artist_name: string | null
  label_name: string | null
}

type CatalogResponse = {
  releases: CatalogRelease[]
  total: number
  page: number
  limit: number
  pages: number
}

const FORMAT_COLORS: Record<string, string> = {
  LP: "bg-format-vinyl/15 text-format-vinyl border-format-vinyl/30",
  CD: "bg-format-cd/15 text-format-cd border-format-cd/30",
  CASSETTE: "bg-format-cassette/15 text-format-cassette border-format-cassette/30",
}

const CATEGORIES = [
  { value: "tapes", label: "Tapes" },
  { value: "vinyl", label: "Vinyl" },
  { value: "band_literature", label: "Artists/Bands Lit" },
  { value: "label_literature", label: "Labels Lit" },
  { value: "press_literature", label: "Press/Org Lit" },
]

const FORMATS = ["LP", "CD", "CASSETTE", "DVD", "MAGAZINE", "POSTER", "PHOTO", "POSTCARD"]

export default function CatalogPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isInitialMount = useRef(true)

  // Initialize state from URL search params
  const [releases, setReleases] = useState<CatalogRelease[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(() => Number(searchParams.get("page")) || 1)
  const [search, setSearch] = useState(() => searchParams.get("search") || "")
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") || "")
  const [category, setCategory] = useState(() => searchParams.get("category") || "")
  const [format, setFormat] = useState(() => searchParams.get("format") || "")
  const [country, setCountry] = useState(() => searchParams.get("country") || "")
  const [label, setLabel] = useState(() => searchParams.get("label") || "")
  const [condition, setCondition] = useState(() => searchParams.get("condition") || "")
  const [showFilters, setShowFilters] = useState(() => !!(searchParams.get("country") || searchParams.get("label") || searchParams.get("condition")))
  const [sort, setSort] = useState(() => searchParams.get("sort") || "artist")
  const [loading, setLoading] = useState(true)

  // Sync state to URL (replaceState so back button works per-navigation)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    const params = new URLSearchParams()
    if (page > 1) params.set("page", String(page))
    if (search) params.set("search", search)
    if (category) params.set("category", category)
    if (format) params.set("format", format)
    if (country) params.set("country", country)
    if (label) params.set("label", label)
    if (condition) params.set("condition", condition)
    if (sort && sort !== "title") params.set("sort", sort)
    const qs = params.toString()
    const newUrl = qs ? `/catalog?${qs}` : "/catalog"
    window.history.replaceState(null, "", newUrl)
  }, [page, search, category, format, country, label, condition, sort])

  // Restore state when navigating back (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search)
      setPage(Number(sp.get("page")) || 1)
      setSearch(sp.get("search") || "")
      setSearchInput(sp.get("search") || "")
      setCategory(sp.get("category") || "")
      setFormat(sp.get("format") || "")
      setCountry(sp.get("country") || "")
      setLabel(sp.get("label") || "")
      setCondition(sp.get("condition") || "")
      setSort(sp.get("sort") || "title")
      if (sp.get("country") || sp.get("label") || sp.get("condition")) setShowFilters(true)
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const fetchReleases = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("limit", "24")
    if (search) params.set("search", search)
    if (category) params.set("category", category)
    if (format) params.set("format", format)
    if (country) params.set("country", country)
    if (label) params.set("label", label)
    if (condition) params.set("condition", condition)
    params.set("sort", sort)

    const data = await medusaFetch<CatalogResponse>(
      `/store/catalog?${params.toString()}`
    )
    if (data) {
      setReleases(data.releases)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }, [page, search, category, format, country, label, condition, sort])

  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const clearAllFilters = () => {
    setSearch("")
    setSearchInput("")
    setCategory("")
    setFormat("")
    setCountry("")
    setLabel("")
    setCondition("")
    setPage(1)
  }

  const hasActiveFilters = category || format || country || label || condition

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-dm-serif)]">
          Catalog
        </h1>
        <p className="text-muted-foreground mt-2">
          {total.toLocaleString("en-US")} releases from the archive
        </p>
      </div>

      {/* Search & Sort */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by title, artist, label, catalog number..."
              className="pl-10"
            />
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>

        {/* Sort */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: "artist", label: "Artist" },
            { key: "title", label: "A-Z" },
          ].map(({ key, label: lbl }) => (
            <Button
              key={key}
              size="sm"
              variant={sort === key ? "default" : "outline"}
              onClick={() => { setSort(key); setPage(1) }}
              className="text-xs"
            >
              {lbl}
            </Button>
          ))}
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        <Button
          size="sm"
          variant={category === "" ? "default" : "outline"}
          onClick={() => { setCategory(""); setPage(1) }}
          className="text-xs"
        >
          All
        </Button>
        {CATEGORIES.map((c) => (
          <Button
            key={c.value}
            size="sm"
            variant={category === c.value ? "default" : "outline"}
            onClick={() => { setCategory(c.value); setPage(1) }}
            className="text-xs"
          >
            {c.label}
          </Button>
        ))}
      </div>

      {/* Format filter pills */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        <Button
          size="sm"
          variant={format === "" ? "default" : "outline"}
          onClick={() => { setFormat(""); setPage(1) }}
          className="text-xs"
        >
          All Formats
        </Button>
        {FORMATS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={format === f ? "default" : "outline"}
            onClick={() => { setFormat(f); setPage(1) }}
            className="text-xs"
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Advanced Filters Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowFilters(!showFilters)}
          className="text-xs text-muted-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
          {showFilters ? "Hide Filters" : "More Filters"}
        </Button>
        {hasActiveFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={clearAllFilters}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Clear All
          </Button>
        )}
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-sm">
          <Disc3 className="h-3.5 w-3.5 text-primary/70" />
          <span className="tabular-nums font-semibold text-primary">{total.toLocaleString("en-US")}</span>
          <span className="text-muted-foreground text-xs">{total === 1 ? "result" : "results"}</span>
        </span>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 p-4 rounded-lg border border-border/50 bg-secondary/30">
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Country</label>
            <Input
              value={country}
              onChange={(e) => { setCountry(e.target.value); setPage(1) }}
              placeholder="e.g. Germany"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Label</label>
            <Input
              value={label}
              onChange={(e) => { setLabel(e.target.value); setPage(1) }}
              placeholder="Search label..."
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Condition</label>
            <Input
              value={condition}
              onChange={(e) => { setCondition(e.target.value); setPage(1) }}
              placeholder="e.g. VG+"
              className="h-8 text-xs"
            />
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-secondary rounded-lg mb-2" />
              <div className="h-3 bg-secondary rounded w-3/4 mb-1" />
              <div className="h-4 bg-secondary rounded w-full" />
            </div>
          ))}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${page}-${search}-${category}-${format}-${sort}-${country}-${label}-${condition}`}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
          >
            {releases.map((release) => (
              <motion.div key={release.id} variants={staggerItem}>
                <Link
                  href={`/catalog/${release.id}`}
                  className="group block"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-secondary mb-2 border border-border/50 group-hover:border-primary/40 transition-colors">
                    {release.coverImage ? (
                      <Image
                        src={release.coverImage}
                        alt={release.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width:640px) 50vw, (max-width:768px) 33vw, (max-width:1024px) 25vw, 16vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Disc3 className="h-12 w-12 text-muted-foreground/30" />
                      </div>
                    )}
                    {(release.format_name || release.format) && (
                      <Badge
                        variant="outline"
                        className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0 backdrop-blur-sm ${FORMAT_COLORS[release.format] || "bg-secondary/80 text-muted-foreground"}`}
                      >
                        {release.format_name || release.format}
                      </Badge>
                    )}
                    {release.legacy_condition && (
                      <span className="absolute bottom-1.5 left-1.5 text-[10px] font-mono bg-black/60 text-foreground/80 px-1.5 py-0.5 rounded backdrop-blur-sm uppercase">
                        {release.legacy_condition}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground truncate">
                    {release.artist_name || "Unknown"}
                  </p>
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {release.title}
                  </p>
                  <div className="flex items-center justify-between mt-0.5">
                    {release.legacy_price ? (
                      <span className="text-xs font-mono text-primary">
                        &euro;{Number(release.legacy_price).toFixed(2)}
                      </span>
                    ) : (
                      <span />
                    )}
                    {release.year && (
                      <span className="text-[10px] text-muted-foreground">
                        {release.year}
                      </span>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Empty state */}
      {!loading && releases.length === 0 && (
        <div className="text-center py-16">
          <Disc3 className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">
            No releases found.
          </p>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(pages, page + 1))}
            disabled={page >= pages}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </main>
  )
}
