"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Search, X, Disc3 } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { displayFormat } from "@/lib/format-display"

const MEDUSA_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

type SuggestResult = {
  releases: { id: string; title: string; coverImage: string | null; artist_name: string | null; format: string | null; format_v2?: string | null; year: number | null }[]
  artists: { name: string; slug: string }[]
  labels: { name: string; slug: string }[]
}

export function SearchAutocomplete({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SuggestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery("")
      setResults(null)
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(
        `${MEDUSA_URL}/store/catalog/suggest?q=${encodeURIComponent(q)}&limit=8`,
        { headers: { "x-publishable-api-key": PUBLISHABLE_KEY } }
      )
      if (res.ok) {
        const data: SuggestResult = await res.json()
        setResults(data)
        setSelectedIndex(0)
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [])

  const handleInputChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.length < 2) { setResults(null); return }
    setLoading(true)
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  // Build flat list of navigable items for keyboard
  const allItems = [
    ...(results?.releases.map(r => ({ type: "release" as const, id: r.id, label: r.title, sub: r.artist_name, href: `/catalog/${r.id}` })) || []),
    ...(results?.artists.map(a => ({ type: "artist" as const, id: a.slug, label: a.name, sub: null, href: `/band/${a.slug}` })) || []),
    ...(results?.labels.map(l => ({ type: "label" as const, id: l.slug, label: l.name, sub: null, href: `/label/${l.slug}` })) || []),
  ]

  const navigate = (href: string) => {
    onClose()
    router.push(href)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (allItems[selectedIndex]) {
        navigate(allItems[selectedIndex].href)
      } else if (query.length >= 2) {
        navigate(`/catalog?search=${encodeURIComponent(query)}`)
      }
    }
  }

  const totalResults = (results?.releases.length || 0) + (results?.artists.length || 0) + (results?.labels.length || 0)
  let flatIndex = 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden bg-background border-primary/20">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search releases, artists, labels..."
            className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults(null) }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex h-5 px-1.5 items-center rounded border border-border text-[10px] text-muted-foreground font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        {results && totalResults > 0 && (
          <div className="max-h-[60vh] overflow-y-auto py-2">
            {/* Releases */}
            {results.releases.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Releases</p>
                {results.releases.map((release) => {
                  const idx = flatIndex++
                  return (
                    <button
                      key={release.id}
                      onClick={() => navigate(`/catalog/${release.id}`)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-secondary/50 transition-colors ${idx === selectedIndex ? "bg-secondary/50" : ""}`}
                    >
                      <div className="h-10 w-10 rounded bg-secondary overflow-hidden flex-shrink-0">
                        {release.coverImage ? (
                          <Image src={release.coverImage} alt={release.title} width={40} height={40} className="object-cover h-full w-full" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center"><Disc3 className="h-4 w-4 text-muted-foreground/30" /></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{release.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {release.artist_name}{release.year ? ` · ${release.year}` : ""}{release.format_v2 ? ` · ${displayFormat(release.format_v2)}` : (release.format ? ` · ${release.format}` : "")}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Artists */}
            {results.artists.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-1">Artists</p>
                {results.artists.map((artist) => {
                  const idx = flatIndex++
                  return (
                    <button
                      key={artist.slug}
                      onClick={() => navigate(`/band/${artist.slug}`)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-secondary/50 transition-colors ${idx === selectedIndex ? "bg-secondary/50" : ""}`}
                    >
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-serif text-primary">{artist.name.charAt(0)}</span>
                      </div>
                      <p className="text-sm font-medium truncate">{artist.name}</p>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Labels */}
            {results.labels.length > 0 && (
              <div>
                <p className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-1">Labels</p>
                {results.labels.map((lbl) => {
                  const idx = flatIndex++
                  return (
                    <button
                      key={lbl.slug}
                      onClick={() => navigate(`/label/${lbl.slug}`)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-secondary/50 transition-colors ${idx === selectedIndex ? "bg-secondary/50" : ""}`}
                    >
                      <div className="h-10 w-10 rounded bg-secondary flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-serif text-primary">{lbl.name.charAt(0)}</span>
                      </div>
                      <p className="text-sm font-medium truncate">{lbl.name}</p>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Full search link */}
            <div className="border-t border-border mt-2 pt-2 px-4 pb-2">
              <button
                onClick={() => navigate(`/catalog?search=${encodeURIComponent(query)}`)}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Search all for &quot;{query}&quot; →
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && !results && query.length >= 2 && (
          <div className="py-8 text-center">
            <svg className="animate-spin h-5 w-5 mx-auto text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {/* No results */}
        {results && totalResults === 0 && query.length >= 2 && (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No results for &quot;{query}&quot;</p>
            <button
              onClick={() => navigate(`/catalog?search=${encodeURIComponent(query)}`)}
              className="text-xs text-primary hover:text-primary/80 mt-2 transition-colors"
            >
              Try full catalog search →
            </button>
          </div>
        )}

        {/* Empty state */}
        {!results && !loading && (
          <div className="py-6 text-center">
            <p className="text-xs text-muted-foreground">Type to search 41,000+ releases</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
