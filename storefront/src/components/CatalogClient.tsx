"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Disc3, ChevronLeft, ChevronRight, SlidersHorizontal, MoreHorizontal, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { staggerContainer, staggerItem } from "@/lib/motion"
import { rudderTrack } from "@/lib/rudderstack"

type CatalogRelease = {
  id: string
  title: string
  slug: string
  format: string
  format_name: string | null
  format_group: string | null
  product_category: string | null
  year: number | null
  country: string | null
  coverImage: string | null
  catalogNumber: string | null
  article_number: string | null
  legacy_condition: string | null
  legacy_price: number | null
  effective_price?: number | null
  is_purchasable?: boolean
  legacy_format_detail: string | null
  artist_name: string | null
  artist_slug?: string | null
  label_name: string | null
  label_slug?: string | null
  press_orga_name?: string | null
  press_orga_slug?: string | null
  is_purchasable: boolean
  auction_status?: string | null
}

export type CatalogClientProps = {
  releases: CatalogRelease[]
  total: number
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
  { value: "price:asc", label: "Price: Low to High" },
  { value: "price:desc", label: "Price: High to Low" },
  { value: "year:desc", label: "Year: Newest" },
  { value: "year:asc", label: "Year: Oldest" },
]

export default function CatalogClient({ releases, total, pages }: CatalogClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Read all filter state from URL searchParams (source of truth)
  const page = Number(searchParams.get("page")) || 1
  const search = searchParams.get("search") || ""
  const category = searchParams.get("category") || ""
  const format = searchParams.get("format") || ""
  const country = searchParams.get("country") || ""
  const label = searchParams.get("label") || ""
  const yearFrom = searchParams.get("year_from") || ""
  const genre = searchParams.get("genre") || ""
  const decade = searchParams.get("decade") || ""
  const sort = searchParams.get("sort") || "artist:asc"
  const forSale = searchParams.get("for_sale") === "true"
  const limit = (() => { const l = Number(searchParams.get("limit")); return [24, 48, 96].includes(l) ? l : 24 })()

  // Local UI state (not in URL)
  const [searchInput, setSearchInput] = useState(search)
  const [showFilters, setShowFilters] = useState(!!(country || label || yearFrom))

  // URL update helper: push for pagination (creates history entry), replace for filters
  const updateParams = useCallback((updates: Record<string, string>, push = false) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v)
      else params.delete(k)
    })
    // Remove default values from URL to keep it clean
    if (params.get("page") === "1") params.delete("page")
    if (params.get("sort") === "artist:asc") params.delete("sort")
    if (params.get("limit") === "24") params.delete("limit")
    if (params.get("for_sale") === "false") params.delete("for_sale")

    const qs = params.toString()
    const url = qs ? `${pathname}?${qs}` : pathname
    if (push) {
      router.push(url, { scroll: false })
    } else {
      router.replace(url, { scroll: false })
    }
    try { sessionStorage.setItem("catalog_url", url) } catch {}
  }, [searchParams, pathname, router])

  // Filter change handlers (all use replace — no history entry)
  const handleCategoryChange = useCallback((value: string) => {
    updateParams({ category: value, format: "", page: "" })
  }, [updateParams])

  const clearAllFilters = useCallback(() => {
    updateParams({
      search: "", category: "", format: "", country: "", label: "",
      year_from: "", genre: "", decade: "", sort: "", for_sale: "", page: "", limit: "",
    })
    setSearchInput("")
  }, [updateParams])

  // Debounced live search (500ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchInputChange = useCallback((value: string) => {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateParams({ search: value, page: "" })
      if (value.trim().length >= 2) {
        rudderTrack("Search Performed", { query: value.trim() })
      }
    }, 500)
  }, [updateParams])

  // Pagination helpers
  const paginationPages = useMemo(() => {
    if (pages <= 1) return []
    const items: (number | "ellipsis")[] = []
    const range = 2
    items.push(1)
    const start = Math.max(2, page - range)
    const end = Math.min(pages - 1, page + range)
    if (start > 2) items.push("ellipsis")
    for (let i = start; i <= end; i++) items.push(i)
    if (end < pages - 1) items.push("ellipsis")
    if (pages > 1) items.push(pages)
    return items
  }, [page, pages])

  const hasActiveFilters = category || format || country || label || yearFrom || genre || decade || forSale

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <h1 className="heading-1">
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
                updateParams({ search: "", page: "" })
                if (debounceRef.current) clearTimeout(debounceRef.current)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* For Sale toggle — own row on mobile, inline on sm+ */}
      <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 mb-2 w-fit sm:hidden">
        <Button
          variant={!forSale ? "default" : "ghost"}
          size="xs"
          onClick={() => updateParams({ for_sale: "", page: "" })}
        >
          All Items
        </Button>
        <Button
          variant={forSale ? "default" : "ghost"}
          size="xs"
          onClick={() => updateParams({ for_sale: "true", page: "" })}
        >
          For Sale
        </Button>
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
        <div className="hidden sm:flex items-center gap-1 rounded-lg border border-[rgba(232,224,212,0.12)] p-0.5 ml-auto sm:ml-0">
          <Button
            variant={!forSale ? "default" : "ghost"}
            size="xs"
            onClick={() => updateParams({ for_sale: "", page: "" })}
          >
            All Items
          </Button>
          <Button
            variant={forSale ? "default" : "ghost"}
            size="xs"
            onClick={() => updateParams({ for_sale: "true", page: "" })}
          >
            For Sale
          </Button>
        </div>
      </div>

      {/* Literature subfilter pills — only shown for literature categories */}
      {LITERATURE_CATEGORIES.includes(category) && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          <Button
            size="sm"
            variant={format === "" ? "default" : "outline"}
            onClick={() => updateParams({ format: "", page: "" })}
            className="text-xs"
          >
            All Formats
          </Button>
          {LITERATURE_FORMATS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={format === f ? "default" : "outline"}
              onClick={() => updateParams({ format: f, page: "" })}
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
            onChange={(e) => updateParams({ sort: e.target.value, page: "" })}
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
            <select
              value={country}
              onChange={(e) => updateParams({ country: e.target.value, page: "" })}
              className="h-8 w-full rounded-md border border-primary/25 bg-input px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Countries</option>
              <option value="DE">Germany</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="FR">France</option>
              <option value="IT">Italy</option>
              <option value="NL">Netherlands</option>
              <option value="BE">Belgium</option>
              <option value="AT">Austria</option>
              <option value="CH">Switzerland</option>
              <option value="JP">Japan</option>
              <option value="CA">Canada</option>
              <option value="AU">Australia</option>
              <option value="SE">Sweden</option>
              <option value="NO">Norway</option>
              <option value="DK">Denmark</option>
              <option value="PL">Poland</option>
              <option value="CZ">Czech Republic</option>
              <option value="ES">Spain</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Label</label>
            <Input
              value={label}
              onChange={(e) => updateParams({ label: e.target.value, page: "" })}
              placeholder="Search label..."
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Year</label>
            <Input
              type="number"
              value={yearFrom}
              onChange={(e) => updateParams({ year_from: e.target.value, page: "" })}
              placeholder="e.g. 1985"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Decade</label>
            <select
              value={decade}
              onChange={(e) => updateParams({ decade: e.target.value, page: "" })}
              className="w-full h-8 rounded-md border border-primary/25 bg-input px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All decades</option>
              <option value="1960">1960s</option>
              <option value="1970">1970s</option>
              <option value="1980">1980s</option>
              <option value="1990">1990s</option>
              <option value="2000">2000s</option>
              <option value="2010">2010s</option>
              <option value="2020">2020s</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Genre</label>
            <Input
              value={genre}
              onChange={(e) => updateParams({ genre: e.target.value, page: "" })}
              placeholder="e.g. Industrial"
              className="h-8 text-xs"
            />
          </div>
        </div>
      )}

      {/* Active Filter Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {category && (
            <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => updateParams({ category: "", format: "", page: "" })}>
              {category} <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {genre && (
            <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => updateParams({ genre: "", page: "" })}>
              Genre: {genre} <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {decade && (
            <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => updateParams({ decade: "", page: "" })}>
              {decade}s <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {country && (
            <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => updateParams({ country: "", page: "" })}>
              {country} <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {label && (
            <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => updateParams({ label: "", page: "" })}>
              Label: {label} <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {yearFrom && (
            <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => updateParams({ year_from: "", page: "" })}>
              Year: {yearFrom} <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {forSale && (
            <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => updateParams({ for_sale: "", page: "" })}>
              For Sale <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
        </div>
      )}

      {/* Results */}
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
                  {release.legacy_condition && (
                    <span className="absolute bottom-1.5 left-1.5 text-[10px] font-mono bg-black/60 text-foreground/80 px-1.5 py-0.5 rounded backdrop-blur-sm uppercase">
                      {release.legacy_condition}
                    </span>
                  )}
                </div>

                {(release.format_name || release.format) && (
                  <span className={`inline-block text-[9px] uppercase tracking-[1px] font-medium mb-0.5 ${FORMAT_COLORS[release.format] ? FORMAT_COLORS[release.format].split(" ").find(c => c.startsWith("text-")) : "text-muted-foreground"}`}>
                    {release.format_name || release.format}
                  </span>
                )}
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
                  {release.auction_status === "reserved" ? (
                    <span className="text-[10px] font-semibold text-amber-400 italic">In Auction</span>
                  ) : release.is_purchasable ? (
                    <span className="text-xs font-mono text-primary">
                      &euro;{Number(release.effective_price).toFixed(2)}
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

      {/* Empty state — with suggestions */}
      {releases.length === 0 && (
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
            onChange={(e) => updateParams({ limit: e.target.value, page: "" })}
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
            onClick={() => updateParams({ page: String(Math.max(1, page - 1)) }, true)}
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
                onClick={() => updateParams({ page: String(p) }, true)}
              >
                {p}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => updateParams({ page: String(Math.min(pages, page + 1)) }, true)}
            disabled={page >= pages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </main>
  )
}
