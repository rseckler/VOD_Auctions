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
  current_price: number | null
  bid_count: number
  lot_number: number | null
  status: string
  // Joined release data
  release_title?: string
  release_artist?: string
  release_format?: string
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

const STATUS_COLORS: Record<string, "green" | "orange" | "blue" | "grey" | "red"> = {
  draft: "grey",
  scheduled: "blue",
  preview: "orange",
  active: "green",
  ended: "red",
}

const BLOCK_TYPES = [
  { value: "theme", label: "Themen-Block" },
  { value: "highlight", label: "Highlight-Block" },
  { value: "clearance", label: "Clearance-Block" },
  { value: "flash", label: "Flash-Block" },
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

  // Release search
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Release[]>([])
  const [searching, setSearching] = useState(false)

  // Fetch block data
  useEffect(() => {
    if (!isNew) {
      fetch(`/admin/auction-blocks/${id}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => setBlock(data.auction_block))
        .catch(console.error)
    }
  }, [id, isNew])

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
        setMessage("Gespeichert!")
        if (isNew && data.auction_block?.id) {
          window.location.href = `/app/auction-blocks/${data.auction_block.id}`
        }
      } else {
        setMessage(`Fehler: ${data.message || "Unbekannter Fehler"}`)
      }
    } catch (err) {
      setMessage(`Fehler: ${err}`)
    } finally {
      setSaving(false)
    }
  }

  // Search releases
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(
        `/admin/releases?q=${encodeURIComponent(searchQuery)}&limit=20`,
        { credentials: "include" }
      )
      const data = await res.json()
      setSearchResults(data.releases || [])
    } catch (err) {
      console.error(err)
    } finally {
      setSearching(false)
    }
  }

  // Add release to block
  const handleAddItem = async (release: Release) => {
    if (isNew) {
      setMessage("Block zuerst speichern bevor Items hinzugefügt werden können.")
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
        // Refresh block data
        const blockRes = await fetch(`/admin/auction-blocks/${id}`, { credentials: "include" })
        const data = await blockRes.json()
        setBlock(data.auction_block)
        setSearchResults((prev) => prev.filter((r) => r.id !== release.id))
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Remove item from block
  const handleRemoveItem = async (itemId: string) => {
    try {
      await fetch(`/admin/auction-blocks/${id}/items/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      })
      setBlock((b) => ({
        ...b,
        items: b.items?.filter((i) => i.id !== itemId),
      }))
    } catch (err) {
      console.error(err)
    }
  }

  // Update item price
  const handlePriceChange = async (itemId: string, startPrice: number) => {
    try {
      await fetch(`/admin/auction-blocks/${id}/items/${itemId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_price: startPrice }),
      })
      setBlock((b) => ({
        ...b,
        items: b.items?.map((i) =>
          i.id === itemId ? { ...i, start_price: startPrice } : i
        ),
      }))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <Container>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1">
            {isNew ? "Neuen Block erstellen" : block.title}
          </Heading>
          {!isNew && (
            <Badge color={STATUS_COLORS[block.status || "draft"]}>
              {block.status}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <a href="/app/auction-blocks">
            <Button variant="secondary">Zurück</Button>
          </a>
          <Button onClick={handleSave} isLoading={saving}>
            Speichern
          </Button>
        </div>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-ui-bg-subtle rounded">
          <Text>{message}</Text>
        </div>
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
            <div className="flex gap-2 mb-4">
              <Input
                className="flex-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Release suchen (Titel, Artist, Katalognummer)..."
              />
              <Button onClick={handleSearch} isLoading={searching}>
                Suchen
              </Button>
            </div>

            {searchResults.length > 0 && (
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
                  {searchResults.map((r) => (
                    <Table.Row key={r.id}>
                      <Table.Cell>
                        {r.coverImage && (
                          <img
                            src={r.coverImage}
                            alt={r.title}
                            className="w-10 h-10 object-cover rounded"
                          />
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
                        <IconButton onClick={() => handleAddItem(r)}>
                          <Plus />
                        </IconButton>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
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
                    <Table.HeaderCell>Release ID</Table.HeaderCell>
                    <Table.HeaderCell>Schätzwert</Table.HeaderCell>
                    <Table.HeaderCell>Startpreis</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell></Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {block.items.map((item) => (
                    <Table.Row key={item.id}>
                      <Table.Cell>{item.lot_number || "—"}</Table.Cell>
                      <Table.Cell className="font-mono text-sm">
                        {item.release_id}
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
                            handlePriceChange(item.id, parseFloat(e.target.value))
                          }
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Badge>{item.status}</Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <IconButton
                          variant="transparent"
                          onClick={() => handleRemoveItem(item.id)}
                        >
                          <Trash />
                        </IconButton>
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
