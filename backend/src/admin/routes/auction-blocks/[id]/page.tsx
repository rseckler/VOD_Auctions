import { defineRouteConfig } from "@medusajs/admin-sdk"
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
import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"

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

const STATUS_COLORS: Record<string, "green" | "orange" | "blue" | "grey" | "red" | "purple"> = {
  draft: "grey",
  scheduled: "blue",
  preview: "orange",
  active: "green",
  ended: "red",
  archived: "purple",
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  scheduled: "Geplant",
  preview: "Vorschau",
  active: "Aktiv",
  ended: "Beendet",
  archived: "Archiviert",
}

const BLOCK_TYPES = [
  { value: "theme", label: "Themen-Block" },
  { value: "highlight", label: "Highlight-Block" },
  { value: "clearance", label: "Clearance-Block" },
  { value: "flash", label: "Flash-Block" },
]

const FORMAT_OPTIONS = [
  { value: "", label: "Alle Formate" },
  { value: "LP", label: "LP / Vinyl" },
  { value: "CD", label: "CD" },
  { value: "CASSETTE", label: "Kassette" },
  { value: "7\"", label: "7\"" },
  { value: "10\"", label: "10\"" },
  { value: "12\"", label: "12\"" },
  { value: "BOXSET", label: "Box Set" },
  { value: "DVD", label: "DVD" },
  { value: "BOOK", label: "Buch" },
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

  // Release search
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Release[]>([])
  const [searchCount, setSearchCount] = useState(0)
  const [searchOffset, setSearchOffset] = useState(0)
  const [searching, setSearching] = useState(false)
  const [formatFilter, setFormatFilter] = useState("")
  const [onlyAvailable, setOnlyAvailable] = useState(true)

  // Fetch block data
  useEffect(() => {
    if (!isNew) {
      fetch(`/admin/auction-blocks/${id}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setBlock(data.auction_block))
        .catch(console.error)
    }
  }, [id, isNew])

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
      showMessage("Titel ist erforderlich", "error")
      return
    }
    if (block.start_time && block.end_time && new Date(block.start_time) >= new Date(block.end_time)) {
      showMessage("Startzeit muss vor Endzeit liegen", "error")
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
        showMessage("Gespeichert!")
        if (isNew && data.auction_block?.id) {
          window.location.href = `/app/auction-blocks/${data.auction_block.id}`
        }
      } else {
        showMessage(data.message || "Unbekannter Fehler", "error")
      }
    } catch (err) {
      showMessage(`Fehler: ${err}`, "error")
    } finally {
      setSaving(false)
    }
  }

  // Status change
  const handleStatusChange = async (newStatus: string) => {
    const labels: Record<string, string> = {
      scheduled: "Block planen? Er wird zur Startzeit automatisch aktiviert.",
      active: "Block jetzt aktivieren? Gebote werden sofort möglich.",
      preview: "Block in Vorschau setzen? Kunden können Items sehen aber noch nicht bieten.",
      archived: "Block archivieren?",
    }
    if (!window.confirm(labels[newStatus] || `Status auf "${newStatus}" ändern?`)) return

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
        showMessage(`Status geändert: ${STATUS_LABELS[newStatus] || newStatus}`)
      } else {
        showMessage(data.message || "Statuswechsel fehlgeschlagen", "error")
      }
    } catch (err) {
      showMessage(`Fehler: ${err}`, "error")
    }
  }

  // Search releases
  const handleSearch = async (append = false) => {
    setSearching(true)
    const offset = append ? searchOffset : 0
    try {
      let url = `/admin/releases?limit=20&offset=${offset}`
      if (searchQuery.trim()) url += `&q=${encodeURIComponent(searchQuery)}`
      if (formatFilter) url += `&format=${encodeURIComponent(formatFilter)}`
      if (onlyAvailable) url += `&auction_status=available`

      const res = await fetch(url, { credentials: "include" })
      const data = await res.json()

      if (append) {
        setSearchResults((prev) => [...prev, ...(data.releases || [])])
      } else {
        setSearchResults(data.releases || [])
      }
      setSearchCount(data.count || 0)
      setSearchOffset(offset + 20)
    } catch (err) {
      console.error(err)
    } finally {
      setSearching(false)
    }
  }

  // Add release to block
  const handleAddItem = async (release: Release) => {
    if (isNew) {
      showMessage("Block zuerst speichern bevor Items hinzugefügt werden können.", "error")
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
        showMessage("Produkt hinzugefügt!")
      } else {
        const data = await res.json()
        showMessage(data.message || "Fehler beim Hinzufügen", "error")
      }
    } catch (err) {
      showMessage(`Fehler: ${err}`, "error")
    }
  }

  // Remove item from block
  const handleRemoveItem = async (itemId: string) => {
    if (!window.confirm("Produkt aus Block entfernen?")) return
    try {
      await fetch(`/admin/auction-blocks/${id}/items/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      })
      setBlock((b) => ({
        ...b,
        items: b.items?.filter((i) => i.id !== itemId),
      }))
      showMessage("Produkt entfernt")
    } catch (err) {
      console.error(err)
    }
  }

  // Update item field (generic)
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

  return (
    <Container>
      {/* Header with title, status badge, and action buttons */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <Heading level="h1">
              {isNew ? "Neuen Block erstellen" : block.title}
            </Heading>
            {!isNew && block.status && (
              <Badge color={STATUS_COLORS[block.status] || "grey"}>
                {STATUS_LABELS[block.status] || block.status}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {/* Status action buttons */}
          {!isNew && block.status === "draft" && (
            <Button
              variant="primary"
              onClick={() => handleStatusChange("scheduled")}
            >
              Planen
            </Button>
          )}
          {!isNew && block.status === "scheduled" && (
            <>
              <Button onClick={() => handleStatusChange("active")}>
                Jetzt aktivieren
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleStatusChange("preview")}
              >
                Vorschau
              </Button>
            </>
          )}
          {!isNew && block.status === "preview" && (
            <Button onClick={() => handleStatusChange("active")}>
              Jetzt aktivieren
            </Button>
          )}
          {!isNew && block.status === "ended" && (
            <Button
              variant="secondary"
              onClick={() => handleStatusChange("archived")}
            >
              Archivieren
            </Button>
          )}

          {/* Preview on storefront */}
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
            <Button variant="secondary">Zurück</Button>
          </a>
          <Button onClick={handleSave} isLoading={saving}>
            Speichern
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
          <Heading level="h2" className="mb-4">Ergebnis</Heading>
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 bg-ui-bg-subtle rounded">
              <Text className="text-ui-fg-subtle">Umsatz</Text>
              <p className="text-xl font-bold">€{(block.total_revenue || 0).toFixed(2)}</p>
            </div>
            <div className="p-4 bg-ui-bg-subtle rounded">
              <Text className="text-ui-fg-subtle">Verkauft</Text>
              <p className="text-xl font-bold">{block.sold_items || 0} / {block.items?.length || 0}</p>
            </div>
            <div className="p-4 bg-ui-bg-subtle rounded">
              <Text className="text-ui-fg-subtle">Gebote</Text>
              <p className="text-xl font-bold">{block.total_bids || 0}</p>
            </div>
          </div>
        </Container>
      )}

      {/* Block Details Form */}
      <Container className="mb-6">
        <Heading level="h2" className="mb-4">
          Block-Details
        </Heading>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Titel *</Label>
            <Input
              value={block.title || ""}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="z.B. Industrial Classics 1980-1985"
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
            <Label>Untertitel</Label>
            <Input
              value={block.subtitle || ""}
              onChange={(e) =>
                setBlock((b) => ({ ...b, subtitle: e.target.value }))
              }
              placeholder="Optionaler Untertitel"
            />
          </div>
          <div>
            <Label>Block-Typ</Label>
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
            <Label>Ende *</Label>
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
          <Label>Kurzbeschreibung</Label>
          <Textarea
            value={block.short_description || ""}
            onChange={(e) =>
              setBlock((b) => ({ ...b, short_description: e.target.value }))
            }
            placeholder="Max 300 Zeichen"
            rows={2}
          />
        </div>
        <div className="mt-4">
          <Label>Langbeschreibung (Markdown)</Label>
          <Textarea
            value={block.long_description || ""}
            onChange={(e) =>
              setBlock((b) => ({ ...b, long_description: e.target.value }))
            }
            placeholder="Redaktioneller Content zum Block..."
            rows={6}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div>
            <Label>Header-Bild URL</Label>
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
          Einstellungen
        </Heading>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <Label>Startpreis-% vom Schätzwert</Label>
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
            <Label>Staffelungs-Intervall (Sek.)</Label>
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

      {/* Product Selection — only for existing blocks */}
      {!isNew && (
        <>
          <Container className="mb-6">
            <Heading level="h2" className="mb-4">
              Produkte hinzufügen
            </Heading>

            {/* Search bar + filters */}
            <div className="flex gap-2 mb-3">
              <Input
                className="flex-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Release suchen (Titel, Artist, Katalognummer)..."
              />
              <Button onClick={() => handleSearch()} isLoading={searching}>
                Suchen
              </Button>
            </div>

            {/* Filters row */}
            <div className="flex gap-4 mb-4 items-center">
              <Select
                value={formatFilter}
                onValueChange={(val) => setFormatFilter(val)}
              >
                <Select.Trigger className="w-40">
                  <Select.Value placeholder="Alle Formate" />
                </Select.Trigger>
                <Select.Content>
                  {FORMAT_OPTIONS.map((f) => (
                    <Select.Item key={f.value} value={f.value}>
                      {f.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyAvailable}
                  onChange={(e) => setOnlyAvailable(e.target.checked)}
                  className="rounded"
                />
                Nur verfügbare
              </label>

              {searchCount > 0 && (
                <Text className="text-ui-fg-subtle text-sm">
                  {searchCount} Ergebnisse
                </Text>
              )}
            </div>

            {searchResults.length > 0 && (
              <>
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Cover</Table.HeaderCell>
                      <Table.HeaderCell>Artist</Table.HeaderCell>
                      <Table.HeaderCell>Titel</Table.HeaderCell>
                      <Table.HeaderCell>Format</Table.HeaderCell>
                      <Table.HeaderCell>Jahr</Table.HeaderCell>
                      <Table.HeaderCell>Schätzwert</Table.HeaderCell>
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
                              <Badge color="green">Im Block</Badge>
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
                      Mehr laden ({searchResults.length} / {searchCount})
                    </Button>
                  </div>
                )}
              </>
            )}
          </Container>

          {/* Block Items */}
          <Container>
            <Heading level="h2" className="mb-4">
              Block-Items ({block.items?.length || 0})
            </Heading>
            {block.items && block.items.length > 0 ? (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Lot</Table.HeaderCell>
                    <Table.HeaderCell>Cover</Table.HeaderCell>
                    <Table.HeaderCell>Artist / Titel</Table.HeaderCell>
                    <Table.HeaderCell>Format</Table.HeaderCell>
                    <Table.HeaderCell>Schätzwert</Table.HeaderCell>
                    <Table.HeaderCell>Startpreis</Table.HeaderCell>
                    <Table.HeaderCell>Mindestpreis</Table.HeaderCell>
                    <Table.HeaderCell>Sofortkauf</Table.HeaderCell>
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
                Noch keine Produkte zugeordnet. Nutze die Suche oben.
              </Text>
            )}
          </Container>
        </>
      )}
    </Container>
  )
}

export default BlockDetailPage
