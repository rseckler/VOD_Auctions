"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Disc3, ChevronLeft, ChevronRight, SlidersHorizontal, MoreHorizontal, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { medusaFetch } from "@/lib/api"
import { staggerContainer, staggerItem } from "@/lib/motion"
import { rudderTrack } from "@/lib/rudderstack"

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
  product_category?: string | null
  artist_name: string | null
  artist_slug?: string | null
  label_name: string | null
  label_slug?: string | null
  press_orga_name?: string | null
  press_orga_slug?: string | null
  is_purchasable: boolean
}

type CatalogResponse = {
  releases: CatalogRelease[]
  total: number
  page: number
  limit: number
  pages: number
}

export type CatalogInitialParams = {
  page: number
  search: string
  category: string
  format: string
  sort: string
  limit: number
  for_sale: string
  country: string
  label: string
  year_from: string
  year_to: string
  condition: string
}

export type CatalogClientProps = {
  initialReleases: CatalogRelease[]
  initialTotal: number
  initialPages: number
  initialParams: CatalogInitialParams
}

const FORMAT_COLORS: Record<string, string> = {
  LP: "bg-format-vinyl/15 text-format-vinyl border-format-vinyl/30",
  CD: "bg-format-cd/15 text-format-cd border-format-cd/30",
  CASSETTE: "bg-format-cassette/15 text-format-cassette border-format-cassette/30",
}

const CATEGORIES = [
  { value: "tapes", label: "Tapes" },
  { value: "vinyl", label: "Vinyl" },
  { value: "cd", label: "CD" },
  { value: "vhs", label: "VHS" },
  { value: "band_literature", label: "Artists/Bands Lit" },
  { value: "label_literature", label: "Labels Lit" },
  { value: "press_literature", label: "Press/Org Lit" },
]

const LITERATURE_CATEGORIES = ["band_literature", "label_literature", "press_literature"]
const LITERATURE_FORMATS = ["MAGAZINE", "POSTER", "PHOTO", "POSTCARD"]

const SORT_OPTIONS = [
  { value: "artist:asc", label: "Artist A-Z" },
  { value: "artist:desc", label: "Artist Z-A" },
  { value: "legacy_price:asc", label: "Price: Low to High" },
  { value: "legacy_price:desc", label: "Price: High to Low" },
  { value: "year:desc", label: "Year: Newest" },
  { value: "year:asc", label: "Year: Oldest" },
]

export default function CatalogClient({ initialReleases, initialTotal, initialPages, initialParams }: CatalogClientProps) {
  const isInitialMount = useRef(true)
  // Track whether we should skip the first client-side fetch (server already provided data)
  const skipInitialFetch = useRef(initialReleases.length > 0)

  // Initialize state from initialParams (server-provided) instead of reading searchParams
  const [releases, setReleases] = useState<CatalogRelease[]>(initialReleases)
  const [total, setTotal] = useState(initialTotal)
  const [pages, setPages] = useState(initialPages)
  const [page, setPage] = useState(initialParams.page)
  const [search, setSearch] = useState(initialParams.search)
  const [searchInput, setSearchInput] = useState(initialParams.search)
  const [category, setCategory] = useState(initialParams.category)
  const [format, setFormat] = useState(initialParams.format)
  const [country, setCountry] = useState(initialParams.country)
  const [label, setLabel] = useState(initialParams.label)
  const [yearFrom, setYearFrom] = useState(initialParams.year_from)
  const [sort, setSort] = useState(initialParams.sort || "artist:asc")
  const [forSale, setForSale] = useState(initialParams.for_sale === "true")
  const [limit, setLimit] = useState(() => {
    const l = initialParams.limit
    return [24, 48, 96].includes(l) ? l : 24
  })
  const [showFilters, setShowFilters] = useState(() => !!(initialParams.country || initialParams.label || initialParams.year_from))
  // If server provided data, start as not-loading
  const [loading, setLoading] = useState(initialReleases.length === 0)

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
    if (yearFrom) params.set("year_from", yearFrom)
    if (sort && sort !== "artist:asc") params.set("sort", sort)
    if (forSale) params.set("for_sale", "true")
    if (limit !== 24) params.set("limit", String(limit))
    const qs = params.toString()
    const newUrl = qs ? `/catalog?${qs}` : "/catalog"
    window.history.replaceState(null, "", newUrl)
    // Store catalog URL for breadcrumb back-links on detail pages
    try { sessionStorage.setItem("catalog_url", newUrl) } catch {}
  }, [page, search, category, format, country, label, yearFrom, sort, forSale, limit])

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
      setYearFrom(sp.get("year_from") || "")
      setSort(sp.get("sort") || "artist:asc")
      setForSale(sp.get("for_sale") === "true")
      const l = Number(sp.get("limit"))
      setLimit([24, 48, 96].includes(l) ? l : 24)
      if (sp.get("country") || sp.get("label") || sp.get("year_from")) setShowFilters(true)
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const fetchReleases = useCallback(async () => {
    // Skip the very first fetch if server already provided data
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false
      return
    }

    setLoading(true)
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("limit", String(limit))
    if (search) params.set("search", search)
    if (category) params.set("category", category)
    if (format) params.set("format", format)
    if (country) params.set("country", country)
    if (label) params.set("label", label)
    if (yearFrom) params.set("year_from", yearFrom)
    if (forSale) params.set("for_sale", "true")
    const [sf, so] = sort.split(":"); params.set("sort", sf === "legacy_price" ? "price" : sf); if (so) params.set("order", so)

    const data = await medusaFetch<CatalogResponse>(
      `/store/catalog?${params.toString()}`
    )
    if (data) {
      setReleases(data.releases)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }, [page, search, category, format, country, label, yearFrom, sort, forSale, limit])

  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  const handleCategoryChange = (value: string) => {
    setCategory(value)
    setFormat("")
    setPage(1)
  }

  const clearAllFilters = () => {
    setSearch("")
    setSearchInput("")
    setCategory("")
    setFormat("")
    setCountry("")
    setLabel("")
    setYearFrom("")
    setSort("artist:asc")
    setForSale(false)
    setPage(1)
  }

  // Debounced live search (500ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchInputChange = useCallback((value: string) => {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(value)
      setPage(1)
      if (value.trim().length >= 2) {
        rudderTrack("Search Performed", { query: value.trim() })
      }
    }, 500)
  }, [])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Pagination helpers
  const paginationPages = useMemo(() => {
    if (pages <= 1) return []
    const items: (number | "ellipsis")[] = []
    const range = 2 // show current +/- 2

    // Always show first page
    items.push(1)

    const start = Math.max(2, page - range)
    const end = Math.min(pages - 1, page + range)

    if (start > 2) items.push("ellipsis")
    for (let i = start; i <= end; i++) items.push(i)
    if (end < pages - 1) items.push("ellipsis")

    // Always show last page
    if (pages > 1) items.push(pages)

    return items
  }, [page, pages])

  const hasActiveFilters = category || format || country || label || yearFrom || forSale

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

      {/* Search — live debounced (500ms) */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => handleSearchInputChange(e.target.value)}
            placeholder="Search by title, artist, label, catalog number..."
            className="pl-10 pr-9"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput("")
                setSearch("")
                setPage(1)
                if (debounceRef.current) clearTimeout(debounceRef.current)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category filter pills + For Sale toggle */}
      <div className="flex flex-nowrap overflow-x-auto scrollbar-hide lg:flex-wrap items-center gap-1.5 mb-3 pb-1">
        <Button
          size="sm"
          variant={category === "" ? "default" : "outline"}
          onClick={() => handleCategoryChange("")}
          className="text-xs"
        >
          All
        </Button>
        {CATEGORIES.map((c) => (
          <Button
            key={c.value}
            size="sm"
            variant={category === c.value ? "default" : "outline"}
            onClick={() => handleCategoryChange(c.value)}
            className="text-xs"
          >
            {c.label}
          </Button>
        ))}
        <span className="hidden sm:block w-px h-5 bg-border/50 mx-1" />
        <div className="flex items-center gap-1 rounded-lg border border-[rgba(232,224,212,0.12)] p-0.5 ml-auto sm:ml-0">
          <button
            onClick={() => { setForSale(false); setPage(1) }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              !forSale
                ? "bg-gradient-to-r from-primary to-[#b8860b] text-[#1c1915]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Items
          </button>
          <button
            onClick={() => { setForSale(true); setPage(1) }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              forSale
                ? "bg-gradient-to-r from-primary to-[#b8860b] text-[#1c1915]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            For Sale
          </button>
        </div>
      </div>

      {/* Literature subfilter pills — only shown for literature categories */}
      {LITERATURE_CATEGORIES.includes(category) && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          <Button
            size="sm"
            variant={format === "" ? "default" : "outline"}
            onClick={() => { setFormat(""); setPage(1) }}
            className="text-xs"
          >
            All Formats
          </Button>
          {LITERATURE_FORMATS.map((f) => (
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
      )}

      {/* Advanced Filters Toggle + Sort */}
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
        <div className="ml-auto flex items-center gap-3">
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1) }}
            className="h-8 rounded-md border border-primary/25 bg-input px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-sm">
            <Disc3 className="h-3.5 w-3.5 text-primary/70" />
            <span className="tabular-nums font-semibold text-primary">{total.toLocaleString("en-US")}</span>
            <span className="text-muted-foreground text-xs">{total === 1 ? "result" : "results"}</span>
          </span>
        </div>
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
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Year</label>
            <Input
              type="number"
              value={yearFrom}
              onChange={(e) => { setYearFrom(e.target.value); setPage(1) }}
              placeholder="e.g. 1985"
              className="h-8 text-xs"
            />
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: limit }).map((_, i) => (
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
            key={`${page}-${search}-${category}-${format}-${country}-${label}-${yearFrom}-${sort}-${forSale}`}
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
                    {release.product_category === "press_literature"
                      ? (release.press_orga_name || "")
                      : release.product_category === "label_literature"
                        ? (release.label_name || "")
                        : (release.artist_name || "")}
                  </p>
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {release.title}
                  </p>
                  <div className="flex items-center justify-between mt-0.5">
                    {release.is_purchasable ? (
                      <span className="text-xs font-mono text-primary">
                        &euro;{Number(release.legacy_price).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/70 italic">
                        Not for sale
                      </span>
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

      {/* Empty state — with suggestions */}
      {!loading && releases.length === 0 && (
        <div className="text-center py-16">
          <Disc3 className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-lg text-muted-foreground mb-2">
            No releases found.
          </p>
          <p className="text-sm text-muted-foreground/70 mb-6">
            {search ? "Try a different search term or adjust your filters." : "Try adjusting your filters."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {(search || hasActiveFilters) && (
              <Button size="sm" variant="outline" onClick={clearAllFilters}>
                Browse All Releases
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => handleCategoryChange("tapes")}>
              Tapes
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleCategoryChange("vinyl")}>
              Vinyl
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleCategoryChange("cd")}>
              CD
            </Button>
          </div>
        </div>
      )}

      {/* Pagination with page numbers + items per page */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-8">
          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1) }}
            className="h-8 rounded-md border border-primary/25 bg-input px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary mr-2"
          >
            {[24, 48, 96].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {paginationPages.map((p, i) =>
            p === "ellipsis" ? (
              <span key={`e-${i}`} className="flex items-center justify-center h-8 w-8 text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="icon"
                className="h-8 w-8 text-xs"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPage(Math.min(pages, page + 1))}
            disabled={page >= pages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </main>
  )
}
