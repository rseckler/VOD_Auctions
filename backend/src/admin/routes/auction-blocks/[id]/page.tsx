import {
  Container,
  Heading,
  Text,
  Button,
  Input,
  Label,
  Textarea,
  Select,
  Badge,
  Table,
  IconButton,
} from "@medusajs/ui"
import { Trash, Plus } from "@medusajs/icons"
import { useEffect, useState, useRef, useCallback } from "react"
import { useParams } from "react-router-dom"
import RichTextEditor from "../../../components/rich-text-editor"

type BlockItem = {
  id: string
  release_id: string
  start_price: number
  estimated_value: number | null
  reserve_price: number | null
  buy_now_price: number | null
  current_price: number | null
  bid_count: number
  lot_number: number | null
  status: string
  release_title?: string | null
  release_artist?: string | null
  release_format?: string | null
  release_cover?: string | null
}

type AuctionBlock = {
  id: string
  title: string
  subtitle: string | null
  slug: string
  status: string
  block_type: string
  start_time: string
  end_time: string
  preview_from: string | null
  short_description: string | null
  long_description: string | null
  header_image: string | null
  video_url: string | null
  audio_url: string | null
  staggered_ending: boolean
  stagger_interval_seconds: number
  default_start_price_percent: number
  auto_extend: boolean
  extension_minutes: number
  total_revenue: number | null
  sold_items: number | null
  total_bids: number | null
  items: BlockItem[]
}

type Release = {
  id: string
  title: string
  artist_name: string | null
  label_name: string | null
  format: string
  year: number | null
  coverImage: string | null
  auction_status: string | null
  estimated_value: number | null
}

type FilterOption = { value: string | number; count: number }

type FiltersData = {
  formats: FilterOption[]
  countries: FilterOption[]
  years: FilterOption[]
  total: number
}

const STATUS_COLORS: Record<string, "green" | "orange" | "blue" | "grey" | "red" | "purple"> = {
  draft: "grey",
  scheduled: "blue",
  preview: "orange",
  active: "green",
  ended: "red",
  archived: "purple",
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  preview: "Preview",
  active: "Active",
  ended: "Ended",
  archived: "Archived",
}

const BLOCK_TYPES = [
  { value: "theme", label: "Theme Block" },
  { value: "highlight", label: "Highlight Block" },
  { value: "clearance", label: "Clearance Block" },
  { value: "flash", label: "Flash Block" },
]

const SORT_OPTIONS = [
  { value: "title_asc", label: "Title A→Z" },
  { value: "title_desc", label: "Title Z→A" },
  { value: "artist_asc", label: "Artist A→Z" },
  { value: "artist_desc", label: "Artist Z→A" },
  { value: "year_desc", label: "Year ↓" },
  { value: "year_asc", label: "Year ↑" },
]

const BlockDetailPage = () => {
  const { id } = useParams()
  const isNew = id === "create"

  const [block, setBlock] = useState<Partial<AuctionBlock>>({
    title: "",
    subtitle: "",
    slug: "",
    status: "draft",
    block_type: "theme",
    start_time: "",
    end_time: "",
    short_description: "",
    long_description: "",
    header_image: "",
    staggered_ending: false,
    stagger_interval_seconds: 120,
    default_start_price_percent: 50,
    auto_extend: true,
    extension_minutes: 5,
    items: [],
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState<"success" | "error">("success")

  // Release search & browser
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Release[]>([])
  const [searchCount, setSearchCount] = useState(0)
  const [searchOffset, setSearchOffset] = useState(0)
  const [searching, setSearching] = useState(false)
  const [onlyAvailable, setOnlyAvailable] = useState(true)
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  // Browser filters
  const [filtersData, setFiltersData] = useState<FiltersData | null>(null)
  const [selectedFormats, setSelectedFormats] = useState<string[]>([])
  const [selectedCountry, setSelectedCountry] = useState("")
  const [yearFrom, setYearFrom] = useState("")
  const [yearTo, setYearTo] = useState("")
  const [labelSearch, setLabelSearch] = useState("")
  const [sortBy, setSortBy] = useState("title_asc")
  const [browseMode, setBrowseMode] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch block data
  useEffect(() => {
    if (!isNew) {
      fetch(`/admin/auction-blocks/${id}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setBlock(data.auction_block))
        .catch(console.error)
    }
  }, [id, isNew])

  // Fetch filter options
  useEffect(() => {
    if (!isNew) {
      fetch(`/admin/releases/filters`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setFiltersData(data))
        .catch(console.error)
    }
  }, [isNew])

  const showMessage = (text: string, type: "success" | "error" = "success") => {
    setMessage(text)
    setMessageType(type)
    if (type === "success") setTimeout(() => setMessage(""), 3000)
  }

  // Auto-generate slug from title
  const handleTitleChange = (title: string) => {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s]+/g, "-")
      .slice(0, 200)
    setBlock((b) => ({ ...b, title, slug }))
  }

  // Save block
  const handleSave = async () => {
    if (!block.title?.trim()) {
      showMessage("Title is required", "error")
      return
    }
    if (block.start_time && block.end_time && new Date(block.start_time) >= new Date(block.end_time)) {
      showMessage("Start time must be before end time", "error")
      return
    }

    setSaving(true)
    setMessage("")
    try {
      const url = isNew
        ? "/admin/auction-blocks"
        : `/admin/auction-blocks/${id}`
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(block),
      })
      const data = await res.json()
      if (res.ok) {
        showMessage("Saved!")
        if (isNew && data.auction_block?.id) {
          window.location.href = `/app/auction-blocks/${data.auction_block.id}`
        }
      } else {
        showMessage(data.message || "Unknown error", "error")
      }
    } catch (err) {
      showMessage(`Error: ${err}`, "error")
    } finally {
      setSaving(false)
    }
  }

  // Status change
  const handleStatusChange = async (newStatus: string) => {
    const labels: Record<string, string> = {
      scheduled: "Schedule block? It will be activated automatically at start time.",
      active: "Activate block now? Bidding will be possible immediately.",
      preview: "Set block to preview? Customers can see items but cannot bid yet.",
      archived: "Archive block?",
    }
    if (!window.confirm(labels[newStatus] || `Change status to "${newStatus}"?`)) return

    try {
      const res = await fetch(`/admin/auction-blocks/${id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (res.ok) {
        setBlock(data.auction_block)
        showMessage(`Status changed: ${STATUS_LABELS[newStatus] || newStatus}`)
      } else {
        showMessage(data.message || "Status change failed", "error")
      }
    } catch (err) {
      showMessage(`Error: ${err}`, "error")
    }
  }

  // Build search URL from all filters
  const buildSearchUrl = useCallback((offset: number) => {
    let url = `/admin/releases?limit=20&offset=${offset}`
    if (searchQuery.trim()) url += `&q=${encodeURIComponent(searchQuery)}`
    if (selectedFormats.length === 1) {
      url += `&format=${encodeURIComponent(selectedFormats[0])}`
    } else if (selectedFormats.length > 1) {
      // API supports single format — use first selected for now
      url += `&format=${encodeURIComponent(selectedFormats[0])}`
    }
    if (selectedCountry) url += `&country=${encodeURIComponent(selectedCountry)}`
    if (yearFrom) url += `&year_from=${yearFrom}`
    if (yearTo) url += `&year_to=${yearTo}`
    if (labelSearch.trim()) url += `&label=${encodeURIComponent(labelSearch)}`
    if (onlyAvailable) url += `&auction_status=available`
    if (sortBy) url += `&sort=${sortBy}`
    return url
  }, [searchQuery, selectedFormats, selectedCountry, yearFrom, yearTo, labelSearch, onlyAvailable, sortBy])

  // Search releases
  const handleSearch = useCallback(async (append = false) => {
    setSearching(true)
    const offset = append ? searchOffset : 0
    try {
      const url = buildSearchUrl(offset)
      const res = await fetch(url, { credentials: "include" })
      const data = await res.json()

      if (append) {
        setSearchResults((prev) => [...prev, ...(data.releases || [])])
      } else {
        setSearchResults(data.releases || [])
      }
      setSearchCount(data.count || 0)
      setSearchOffset(offset + 20)
      setBrowseMode(true)
    } catch (err) {
      console.error(err)
    } finally {
      setSearching(false)
    }
  }, [buildSearchUrl, searchOffset])

  // Auto-search when filters change (debounced)
  const triggerFilterSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      handleSearch(false)
    }, 300)
  }, [handleSearch])

  // Watch filter changes for auto-search (only when browse mode is active)
  useEffect(() => {
    if (browseMode) {
      triggerFilterSearch()
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [selectedFormats, selectedCountry, yearFrom, yearTo, onlyAvailable, sortBy])

  // Toggle format in multi-select
  const toggleFormat = (fmt: string) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    )
  }

  // Add release to block
  const handleAddItem = async (release: Release) => {
    if (isNew) {
      showMessage("Save block first before adding items.", "error")
      return
    }
    try {
      const res = await fetch(`/admin/auction-blocks/${id}/items`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          release_id: release.id,
          start_price: release.estimated_value
            ? release.estimated_value * (block.default_start_price_percent || 50) / 100
            : 1,
          estimated_value: release.estimated_value,
          lot_number: (block.items?.length || 0) + 1,
        }),
      })
      if (res.ok) {
        const blockRes = await fetch(`/admin/auction-blocks/${id}`, { credentials: "include" })
        const data = await blockRes.json()
        setBlock(data.auction_block)
        setSearchResults((prev) => prev.filter((r) => r.id !== release.id))
        showMessage("Product added!")
      } else {
        const data = await res.json()
        showMessage(data.message || "Error adding product", "error")
      }
    } catch (err) {
      showMessage(`Error: ${err}`, "error")
    }
  }

  // Remove item from block
  const handleRemoveItem = async (itemId: string) => {
    if (!window.confirm("Remove product from block?")) return
    try {
      await fetch(`/admin/auction-blocks/${id}/items/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      })
      setBlock((b) => ({
        ...b,
        items: b.items?.filter((i) => i.id !== itemId),
      }))
      showMessage("Product removed")
    } catch (err) {
      console.error(err)
    }
  }

  // Update item field
  const handleItemFieldChange = async (
    itemId: string,
    field: string,
    value: number | null
  ) => {
    try {
      await fetch(`/admin/auction-blocks/${id}/items/${itemId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      setBlock((b) => ({
        ...b,
        items: b.items?.map((i) =>
          i.id === itemId ? { ...i, [field]: value } : i
        ),
      }))
    } catch (err) {
      console.error(err)
    }
  }

  // Check if release is already in this block
  const isInBlock = (releaseId: string) =>
    block.items?.some((i) => i.release_id === releaseId) || false

  // Unique years from filtersData for dropdowns
  const yearOptions = filtersData?.years?.map((y) => Number(y.value)) || []

  return (
    <Container>
      {/* Header with title, status badge, and action buttons */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <Heading level="h1">
              {isNew ? "Create New Block" : block.title}
            </Heading>
            {!isNew && block.status && (
              <Badge color={STATUS_COLORS[block.status] || "grey"}>
                {STATUS_LABELS[block.status] || block.status}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {!isNew && block.status === "draft" && (
            <Button
              variant="primary"
              onClick={() => handleStatusChange("scheduled")}
            >
              Schedule
            </Button>
          )}
          {!isNew && block.status === "scheduled" && (
            <>
              <Button onClick={() => handleStatusChange("active")}>
                Activate Now
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleStatusChange("preview")}
              >
                Preview
              </Button>
            </>
          )}
          {!isNew && block.status === "preview" && (
            <Button onClick={() => handleStatusChange("active")}>
              Activate Now
            </Button>
          )}
          {!isNew && block.status === "ended" && (
            <Button
              variant="secondary"
              onClick={() => handleStatusChange("archived")}
            >
              Archive
            </Button>
          )}

          {!isNew && block.slug && (
            <a
              href={`http://localhost:3000/auctions/${block.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary">Storefront</Button>
            </a>
          )}

          <a href="/app/auction-blocks">
            <Button variant="secondary">Back</Button>
          </a>
          <Button onClick={handleSave} isLoading={saving}>
            Save
          </Button>
        </div>
      </div>

      {/* Message banner */}
      {message && (
        <div
          className={`mb-4 p-3 rounded ${
            messageType === "error"
              ? "bg-red-950 border border-red-800 text-red-300"
              : "bg-green-950 border border-green-800 text-green-300"
          }`}
        >
          <Text>{message}</Text>
        </div>
      )}

      {/* Ended block summary */}
      {!isNew && block.status === "ended" && (
        <Container className="mb-6">
          <Heading level="h2" className="mb-4">Results</Heading>
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-ui-bg-subtle rounded">
              <Text className="text-ui-fg-subtle">Revenue</Text>
              <p className="text-xl font-bold">€{(block.total_revenue || 0).toFixed(2)}</p>
            </div>
            <div className="p-4 bg-ui-bg-subtle rounded">
              <Text className="text-ui-fg-subtle">Sold</Text>
              <p className="text-xl font-bold">{block.sold_items || 0} / {block.items?.length || 0}</p>
            </div>
            <div className="p-4 bg-ui-bg-subtle rounded">
              <Text className="text-ui-fg-subtle">Bids</Text>
              <p className="text-xl font-bold">{block.total_bids || 0}</p>
            </div>
          </div>
        </Container>
      )}

      {/* Block Details Form */}
      <Container className="mb-6">
        <Heading level="h2" className="mb-4">
          Block Details
        </Heading>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Title *</Label>
            <Input
              value={block.title || ""}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Industrial Classics 1980-1985"
            />
          </div>
          <div>
            <Label>Slug</Label>
            <Input
              value={block.slug || ""}
              onChange={(e) => setBlock((b) => ({ ...b, slug: e.target.value }))}
            />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Input
              value={block.subtitle || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, subtitle: e.target.value }))
              }
              placeholder="Optional subtitle"
            />
          </div>
          <div>
            <Label>Block Type</Label>
            <Select
              value={block.block_type || "theme"}
              onValueChange={(val) =>
                setBlock((b) => ({ ...b, block_type: val }))
              }
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {BLOCK_TYPES.map((t) => (
                  <Select.Item key={t.value} value={t.value}>
                    {t.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div>
            <Label>Start *</Label>
            <Input
              type="datetime-local"
              value={block.start_time?.slice(0, 16) || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, start_time: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>End *</Label>
            <Input
              type="datetime-local"
              value={block.end_time?.slice(0, 16) || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, end_time: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="mt-4">
          <Label>Short Description</Label>
          <Textarea
            value={block.short_description || ""}
            onChange={(e) =>
              setBlock((b) => ({ ...b, short_description: e.target.value }))
            }
            placeholder="Max 300 characters"
            rows={2}
          />
        </div>
        <div className="mt-4">
          <Label>Long Description</Label>
          <RichTextEditor
            content={block.long_description || ""}
            onChange={(html) =>
              setBlock((b) => ({ ...b, long_description: html }))
            }
            placeholder="Editorial content for the block..."
          />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <Label>Header Image URL</Label>
            <Input
              value={block.header_image || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, header_image: e.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          <div>
            <Label>Video URL</Label>
            <Input
              value={block.video_url || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, video_url: e.target.value }))
              }
              placeholder="YouTube/Vimeo URL"
            />
          </div>
          <div>
            <Label>Audio URL</Label>
            <Input
              value={block.audio_url || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, audio_url: e.target.value }))
              }
            />
          </div>
        </div>
      </Container>

      {/* Settings */}
      <Container className="mb-6">
        <Heading level="h2" className="mb-4">
          Settings
        </Heading>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <Label>Start Price % of Estimated Value</Label>
            <Input
              type="number"
              value={block.default_start_price_percent || 50}
              onChange={(e) =>
                setBlock((b) => ({
                  ...b,
                  default_start_price_percent: parseInt(e.target.value),
                }))
              }
            />
          </div>
          <div>
            <Label>Auto-Extension (Min.)</Label>
            <Input
              type="number"
              value={block.extension_minutes || 5}
              onChange={(e) =>
                setBlock((b) => ({
                  ...b,
                  extension_minutes: parseInt(e.target.value),
                }))
              }
            />
          </div>
          <div>
            <Label>Stagger Interval (sec.)</Label>
            <Input
              type="number"
              value={block.stagger_interval_seconds || 120}
              onChange={(e) =>
                setBlock((b) => ({
                  ...b,
                  stagger_interval_seconds: parseInt(e.target.value),
                }))
              }
            />
          </div>
        </div>
      </Container>

      {/* Product Browser — only for existing blocks */}
      {!isNew && (
        <>
          <Container className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <Heading level="h2">
                Product Browser
              </Heading>
              {filtersData && (
                <Text className="text-ui-fg-subtle text-sm">
                  {filtersData.total.toLocaleString("en-US")} releases in catalog
                </Text>
              )}
            </div>

            {/* Search bar */}
            <div className="flex gap-2 mb-3">
              <Input
                className="flex-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search releases (title, artist, catalog number)..."
              />
              <Button onClick={() => handleSearch()} isLoading={searching}>
                Search
              </Button>
              {!browseMode && (
                <Button
                  variant="secondary"
                  onClick={() => handleSearch()}
                >
                  Browse All
                </Button>
              )}
            </div>

            {/* Filter bar */}
            <div className="border border-ui-border-base rounded-lg p-3 mb-4 bg-ui-bg-subtle">
              {/* Row 1: Format pills */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="text-xs text-ui-fg-subtle self-center mr-1 font-medium">Format:</span>
                {filtersData?.formats?.map((f) => {
                  const isActive = selectedFormats.includes(String(f.value))
                  return (
                    <button
                      key={String(f.value)}
                      onClick={() => toggleFormat(String(f.value))}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-ui-fg-base text-ui-bg-base"
                          : "bg-ui-bg-base text-ui-fg-subtle border border-ui-border-base hover:border-ui-fg-muted"
                      }`}
                    >
                      {String(f.value)} ({Number(f.count).toLocaleString("en-US")})
                    </button>
                  )
                })}
                {selectedFormats.length > 0 && (
                  <button
                    onClick={() => setSelectedFormats([])}
                    className="px-2 py-1 text-xs text-ui-fg-subtle hover:text-ui-fg-base"
                  >
                    ✕ Reset
                  </button>
                )}
              </div>

              {/* Row 2: Country, Year, Label, Sort, Available */}
              <div className="flex flex-wrap gap-3 items-end">
                {/* Country */}
                <div className="w-44">
                  <label className="text-xs text-ui-fg-subtle font-medium mb-1 block">Country</label>
                  <select
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="w-full h-8 px-2 text-sm rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base"
                  >
                    <option value="">All Countries</option>
                    {filtersData?.countries?.map((c) => (
                      <option key={String(c.value)} value={String(c.value)}>
                        {String(c.value)} ({Number(c.count).toLocaleString("en-US")})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Year from */}
                <div className="w-28">
                  <label className="text-xs text-ui-fg-subtle font-medium mb-1 block">Year From</label>
                  <select
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                    className="w-full h-8 px-2 text-sm rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base"
                  >
                    <option value="">—</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {/* Year to */}
                <div className="w-28">
                  <label className="text-xs text-ui-fg-subtle font-medium mb-1 block">Year To</label>
                  <select
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                    className="w-full h-8 px-2 text-sm rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base"
                  >
                    <option value="">—</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {/* Label search */}
                <div className="w-44">
                  <label className="text-xs text-ui-fg-subtle font-medium mb-1 block">Label</label>
                  <input
                    type="text"
                    value={labelSearch}
                    onChange={(e) => setLabelSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Search label..."
                    className="w-full h-8 px-2 text-sm rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base placeholder:text-ui-fg-muted"
                  />
                </div>

                {/* Sort */}
                <div className="w-36">
                  <label className="text-xs text-ui-fg-subtle font-medium mb-1 block">Sort</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full h-8 px-2 text-sm rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base"
                  >
                    {SORT_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Only available */}
                <label className="flex items-center gap-1.5 text-xs cursor-pointer self-end pb-1">
                  <input
                    type="checkbox"
                    checked={onlyAvailable}
                    onChange={(e) => setOnlyAvailable(e.target.checked)}
                    className="rounded"
                  />
                  Available only
                </label>

                {/* Reset all filters */}
                {(selectedFormats.length > 0 || selectedCountry || yearFrom || yearTo || labelSearch) && (
                  <button
                    onClick={() => {
                      setSelectedFormats([])
                      setSelectedCountry("")
                      setYearFrom("")
                      setYearTo("")
                      setLabelSearch("")
                    }}
                    className="text-xs text-ui-fg-subtle hover:text-ui-fg-base self-end pb-1 underline"
                  >
                    Reset all filters
                  </button>
                )}
              </div>
            </div>

            {/* Results header */}
            {browseMode && (
              <div className="flex items-center justify-between mb-3">
                <Text className="text-sm font-medium">
                  {searchCount.toLocaleString("en-US")} releases found
                </Text>
                <div className="flex gap-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      viewMode === "grid"
                        ? "bg-ui-fg-base text-ui-bg-base"
                        : "bg-ui-bg-base text-ui-fg-subtle border border-ui-border-base"
                    }`}
                  >
                    ▦ Grid
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      viewMode === "table"
                        ? "bg-ui-fg-base text-ui-bg-base"
                        : "bg-ui-bg-base text-ui-fg-subtle border border-ui-border-base"
                    }`}
                  >
                    ☰ Table
                  </button>
                </div>
              </div>
            )}

            {/* Grid View */}
            {searchResults.length > 0 && viewMode === "grid" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {searchResults.map((r) => {
                    const alreadyInBlock = isInBlock(r.id)
                    return (
                      <div
                        key={r.id}
                        className={`group relative rounded-lg border overflow-hidden transition-all ${
                          alreadyInBlock
                            ? "border-green-600 bg-green-950/20"
                            : "border-ui-border-base bg-ui-bg-base hover:border-ui-fg-muted hover:shadow-md"
                        }`}
                      >
                        {/* Cover image */}
                        <div className="aspect-square bg-ui-bg-subtle relative overflow-hidden">
                          {r.coverImage ? (
                            <img
                              src={r.coverImage}
                              alt={r.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-ui-fg-muted">
                              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <path d="M21 15l-5-5L5 21" />
                              </svg>
                            </div>
                          )}

                          {/* Format badge overlay */}
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 text-white text-[10px] font-medium rounded">
                            {r.format}
                          </span>

                          {/* Year badge */}
                          {r.year && (
                            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 text-white text-[10px] font-medium rounded">
                              {r.year}
                            </span>
                          )}

                          {/* Add button overlay */}
                          {!alreadyInBlock && (
                            <button
                              onClick={() => handleAddItem(r)}
                              className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <span className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center text-xl font-bold shadow-lg">
                                +
                              </span>
                            </button>
                          )}

                          {/* Already in block indicator */}
                          {alreadyInBlock && (
                            <div className="absolute inset-0 bg-green-900/30 flex items-center justify-center">
                              <span className="px-2 py-1 bg-green-700 text-white text-xs font-medium rounded">
                                In Block
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-2">
                          <p className="text-xs font-medium truncate" title={r.artist_name || undefined}>
                            {r.artist_name || "Unknown"}
                          </p>
                          <p className="text-xs text-ui-fg-subtle truncate" title={r.title}>
                            {r.title}
                          </p>
                          {r.label_name && (
                            <p className="text-[10px] text-ui-fg-muted truncate mt-0.5">
                              {r.label_name}
                            </p>
                          )}
                          {r.estimated_value && (
                            <p className="text-xs font-medium mt-1">
                              ~€{r.estimated_value.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Load more */}
                {searchResults.length < searchCount && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="secondary"
                      onClick={() => handleSearch(true)}
                      isLoading={searching}
                    >
                      Load More ({searchResults.length} / {searchCount.toLocaleString("en-US")})
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Table View */}
            {searchResults.length > 0 && viewMode === "table" && (
              <>
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Cover</Table.HeaderCell>
                      <Table.HeaderCell>Artist</Table.HeaderCell>
                      <Table.HeaderCell>Title</Table.HeaderCell>
                      <Table.HeaderCell>Label</Table.HeaderCell>
                      <Table.HeaderCell>Format</Table.HeaderCell>
                      <Table.HeaderCell>Year</Table.HeaderCell>
                      <Table.HeaderCell>Est. Value</Table.HeaderCell>
                      <Table.HeaderCell></Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {searchResults.map((r) => {
                      const alreadyInBlock = isInBlock(r.id)
                      return (
                        <Table.Row key={r.id}>
                          <Table.Cell>
                            {r.coverImage ? (
                              <img
                                src={r.coverImage}
                                alt={r.title}
                                className="w-10 h-10 object-cover rounded"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-ui-bg-subtle rounded" />
                            )}
                          </Table.Cell>
                          <Table.Cell>{r.artist_name || "—"}</Table.Cell>
                          <Table.Cell>{r.title}</Table.Cell>
                          <Table.Cell>
                            <span className="text-xs text-ui-fg-subtle">{r.label_name || "—"}</span>
                          </Table.Cell>
                          <Table.Cell>
                            <Badge>{r.format}</Badge>
                          </Table.Cell>
                          <Table.Cell>{r.year || "—"}</Table.Cell>
                          <Table.Cell>
                            {r.estimated_value
                              ? `€${r.estimated_value.toFixed(2)}`
                              : "—"}
                          </Table.Cell>
                          <Table.Cell>
                            {alreadyInBlock ? (
                              <Badge color="green">In Block</Badge>
                            ) : (
                              <IconButton onClick={() => handleAddItem(r)}>
                                <Plus />
                              </IconButton>
                            )}
                          </Table.Cell>
                        </Table.Row>
                      )
                    })}
                  </Table.Body>
                </Table>

                {/* Load more */}
                {searchResults.length < searchCount && (
                  <div className="mt-3 text-center">
                    <Button
                      variant="secondary"
                      onClick={() => handleSearch(true)}
                      isLoading={searching}
                    >
                      Load More ({searchResults.length} / {searchCount.toLocaleString("en-US")})
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Empty state */}
            {browseMode && searchResults.length === 0 && !searching && (
              <div className="text-center py-8">
                <Text className="text-ui-fg-subtle">
                  No releases found. Try different filters.
                </Text>
              </div>
            )}
          </Container>

          {/* Block Items */}
          <Container>
            <Heading level="h2" className="mb-4">
              Block Items ({block.items?.length || 0})
            </Heading>
            {block.items && block.items.length > 0 ? (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Lot</Table.HeaderCell>
                    <Table.HeaderCell>Cover</Table.HeaderCell>
                    <Table.HeaderCell>Artist / Title</Table.HeaderCell>
                    <Table.HeaderCell>Format</Table.HeaderCell>
                    <Table.HeaderCell>Est. Value</Table.HeaderCell>
                    <Table.HeaderCell>Start Price</Table.HeaderCell>
                    <Table.HeaderCell>Reserve Price</Table.HeaderCell>
                    <Table.HeaderCell>Buy Now</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell></Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {block.items.map((item) => (
                    <Table.Row key={item.id}>
                      <Table.Cell>{item.lot_number || "—"}</Table.Cell>
                      <Table.Cell>
                        {item.release_cover ? (
                          <img
                            src={item.release_cover}
                            alt=""
                            className="w-8 h-8 object-cover rounded"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-ui-bg-subtle rounded" />
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="max-w-48">
                          <p className="text-sm font-medium truncate">
                            {item.release_artist || "—"}
                          </p>
                          <p className="text-xs text-ui-fg-subtle truncate">
                            {item.release_title || item.release_id}
                          </p>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        {item.release_format && (
                          <Badge>{item.release_format}</Badge>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {item.estimated_value
                          ? `€${item.estimated_value.toFixed(2)}`
                          : "—"}
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-24"
                          value={item.start_price}
                          onChange={(e) =>
                            handleItemFieldChange(
                              item.id,
                              "start_price",
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-24"
                          value={item.reserve_price ?? ""}
                          placeholder="—"
                          onChange={(e) =>
                            handleItemFieldChange(
                              item.id,
                              "reserve_price",
                              e.target.value ? parseFloat(e.target.value) : null
                            )
                          }
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-24"
                          value={item.buy_now_price ?? ""}
                          placeholder="—"
                          onChange={(e) =>
                            handleItemFieldChange(
                              item.id,
                              "buy_now_price",
                              e.target.value ? parseFloat(e.target.value) : null
                            )
                          }
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={STATUS_COLORS[item.status] || "grey"}>
                          {item.status}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        {item.status === "reserved" && (
                          <IconButton
                            variant="transparent"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <Trash />
                          </IconButton>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            ) : (
              <Text className="text-ui-fg-subtle">
                No products assigned yet. Use the browser above.
              </Text>
            )}
          </Container>
        </>
      )}
    </Container>
  )
}

export default BlockDetailPage
