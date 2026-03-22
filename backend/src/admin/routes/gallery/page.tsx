import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Component, useEffect, useState, useCallback } from "react"
import type { ErrorInfo, ReactNode } from "react"

// ─── Error Boundary ─────────────────────────────────────────────────────────

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("GalleryPage error:", error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#ef4444" }}>
          <h2>Error in Gallery Management:</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

type GalleryMedia = {
  id: string
  url: string
  alt_text: string | null
  section: string
  position: number
  title: string | null
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

type ContentBlock = {
  id: string
  page: string
  section: string
  content: Record<string, unknown>
  sort_order: number
  is_published: boolean
  updated_at: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STOREFRONT_URL = "https://vod-auctions.com"

const COLORS = {
  bg: "#1c1915",
  card: "#2a2520",
  text: "#f5f0eb",
  muted: "#a09080",
  gold: "#d4a54a",
  border: "#3a3530",
  hover: "#353025",
  danger: "#ef4444",
  success: "#22c55e",
}

const SECTIONS = [
  { value: "hero", label: "Hero" },
  { value: "visual_gallery", label: "Visual Gallery" },
  { value: "collection_sound_carriers", label: "Collection: Sound Carriers" },
  { value: "collection_printed_matter", label: "Collection: Printed Matter" },
  { value: "collection_artwork", label: "Collection: Artwork" },
  { value: "collection_documents", label: "Collection: Documents" },
  { value: "collection_rare", label: "Collection: Rare" },
  { value: "featured", label: "Featured" },
  { value: "listening_room", label: "Listening Room" },
]

const SECTION_LABELS: Record<string, string> = {}
for (const s of SECTIONS) SECTION_LABELS[s.value] = s.label

const SECTION_COLORS: Record<string, string> = {
  hero: "#d4a54a",
  visual_gallery: "#3b82f6",
  collection_sound_carriers: "#22c55e",
  collection_printed_matter: "#a855f7",
  collection_artwork: "#ec4899",
  collection_documents: "#f97316",
  collection_rare: "#ef4444",
  featured: "#eab308",
  listening_room: "#06b6d4",
}

type ContentSectionConfig = {
  section: string
  label: string
  fields: { key: string; label: string; type: "text" | "textarea" }[]
}

const CONTENT_SECTIONS: ContentSectionConfig[] = [
  {
    section: "hero",
    label: "Hero",
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "subtitle", label: "Subtitle", type: "text" },
      { key: "cta_text", label: "CTA Button Text", type: "text" },
      { key: "cta_link", label: "CTA Button Link", type: "text" },
    ],
  },
  {
    section: "introduction",
    label: "Introduction",
    fields: [{ key: "body", label: "Body Text", type: "textarea" }],
  },
  {
    section: "listening_room",
    label: "Listening Room",
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "body", label: "Body Text", type: "textarea" },
    ],
  },
  {
    section: "coffee",
    label: "Coffee",
    fields: [{ key: "quote", label: "Quote", type: "textarea" }],
  },
  {
    section: "visit",
    label: "Visit",
    fields: [
      { key: "hours", label: "Opening Hours", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "address", label: "Address", type: "text" },
      { key: "region", label: "Region", type: "text" },
    ],
  },
  {
    section: "closing",
    label: "Closing",
    fields: [{ key: "quote", label: "Quote", type: "textarea" }],
  },
]

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  page: {
    padding: 24,
    color: COLORS.text,
    minHeight: "100vh",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  } as React.CSSProperties,
  heading: {
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.text,
    margin: 0,
  } as React.CSSProperties,
  subtitle: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 4,
  } as React.CSSProperties,
  tabBar: {
    display: "flex",
    gap: 0,
    borderBottom: `1px solid ${COLORS.border}`,
    marginBottom: 24,
  } as React.CSSProperties,
  tab: (active: boolean) =>
    ({
      padding: "10px 20px",
      cursor: "pointer",
      fontSize: 14,
      fontWeight: active ? 600 : 400,
      color: active ? COLORS.gold : COLORS.muted,
      borderBottom: active ? `2px solid ${COLORS.gold}` : "2px solid transparent",
      background: "transparent",
      border: "none",
      borderBottomWidth: 2,
      borderBottomStyle: "solid",
      borderBottomColor: active ? COLORS.gold : "transparent",
      transition: "all 0.15s",
    }) as React.CSSProperties,
  pillBar: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
    marginBottom: 20,
  } as React.CSSProperties,
  pill: (active: boolean) =>
    ({
      padding: "6px 14px",
      borderRadius: 20,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      border: "none",
      background: active ? COLORS.gold : COLORS.card,
      color: active ? "#1c1915" : COLORS.muted,
      transition: "all 0.15s",
    }) as React.CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 16,
  } as React.CSSProperties,
  card: {
    background: COLORS.card,
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    overflow: "hidden",
    transition: "border-color 0.15s",
  } as React.CSSProperties,
  cardImage: {
    width: "100%",
    height: 180,
    objectFit: "cover" as const,
    display: "block",
    background: COLORS.bg,
  } as React.CSSProperties,
  cardImagePlaceholder: {
    width: "100%",
    height: 180,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: COLORS.bg,
    color: COLORS.muted,
    fontSize: 12,
    padding: 12,
    textAlign: "center" as const,
    wordBreak: "break-all" as const,
  } as React.CSSProperties,
  cardBody: {
    padding: 12,
  } as React.CSSProperties,
  cardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.text,
    marginBottom: 6,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  cardMeta: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 4,
  } as React.CSSProperties,
  badge: (color: string) =>
    ({
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 600,
      background: `${color}22`,
      color: color,
      marginRight: 6,
    }) as React.CSSProperties,
  cardActions: {
    display: "flex",
    gap: 8,
    marginTop: 10,
    alignItems: "center",
  } as React.CSSProperties,
  btnPrimary: {
    padding: "8px 16px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    background: COLORS.gold,
    color: "#1c1915",
    transition: "opacity 0.15s",
  } as React.CSSProperties,
  btnSecondary: {
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: `1px solid ${COLORS.border}`,
    cursor: "pointer",
    background: "transparent",
    color: COLORS.text,
    transition: "all 0.15s",
  } as React.CSSProperties,
  btnDanger: {
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: `1px solid ${COLORS.danger}44`,
    cursor: "pointer",
    background: "transparent",
    color: COLORS.danger,
    transition: "all 0.15s",
  } as React.CSSProperties,
  btnSmall: {
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
  } as React.CSSProperties,
  overlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.7)",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as React.CSSProperties,
  modal: {
    background: COLORS.card,
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    padding: 24,
    width: "100%",
    maxWidth: 520,
    maxHeight: "90vh",
    overflowY: "auto" as const,
    color: COLORS.text,
  } as React.CSSProperties,
  formGroup: {
    marginBottom: 16,
  } as React.CSSProperties,
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: COLORS.muted,
    marginBottom: 6,
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.bg,
    color: COLORS.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  select: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.bg,
    color: COLORS.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  textarea: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.bg,
    color: COLORS.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
    resize: "vertical" as const,
    minHeight: 80,
  } as React.CSSProperties,
  toggle: (active: boolean) =>
    ({
      width: 40,
      height: 22,
      borderRadius: 11,
      background: active ? COLORS.success : COLORS.border,
      position: "relative" as const,
      cursor: "pointer",
      border: "none",
      transition: "background 0.2s",
      flexShrink: 0,
    }) as React.CSSProperties,
  toggleKnob: (active: boolean) =>
    ({
      position: "absolute" as const,
      top: 2,
      left: active ? 20 : 2,
      width: 18,
      height: 18,
      borderRadius: "50%",
      background: "#fff",
      transition: "left 0.2s",
    }) as React.CSSProperties,
  contentSection: {
    background: COLORS.card,
    borderRadius: 10,
    border: `1px solid ${COLORS.border}`,
    marginBottom: 16,
    overflow: "hidden",
  } as React.CSSProperties,
  contentSectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    cursor: "pointer",
    userSelect: "none" as const,
  } as React.CSSProperties,
  contentSectionBody: {
    padding: "0 16px 16px",
  } as React.CSSProperties,
  emptyState: {
    textAlign: "center" as const,
    padding: 48,
    color: COLORS.muted,
    fontSize: 14,
  } as React.CSSProperties,
  loading: {
    textAlign: "center" as const,
    padding: 48,
    color: COLORS.muted,
    fontSize: 14,
  } as React.CSSProperties,
}

// ─── Helper: resolve image URL for display ──────────────────────────────────

function resolveImageUrl(url: string): string {
  if (!url) return ""
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return `${STOREFRONT_URL}${url.startsWith("/") ? "" : "/"}${url}`
}

// ─── Media Tab Component ────────────────────────────────────────────────────

const MediaTab = () => {
  const [media, setMedia] = useState<GalleryMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [sectionFilter, setSectionFilter] = useState("all")
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<GalleryMedia | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formUrl, setFormUrl] = useState("")
  const [formAlt, setFormAlt] = useState("")
  const [formSection, setFormSection] = useState("visual_gallery")
  const [formPosition, setFormPosition] = useState(0)
  const [formTitle, setFormTitle] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formActive, setFormActive] = useState(true)
  const [uploading, setUploading] = useState(false)

  const fetchMedia = useCallback(async () => {
    try {
      const resp = await fetch("/admin/gallery", { credentials: "include" })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setMedia(data.gallery_media || [])
    } catch (e: unknown) {
      console.error("Failed to fetch gallery media:", e)
      setError(e instanceof Error ? e.message : "Failed to load gallery media")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMedia()
  }, [fetchMedia])

  const resetForm = () => {
    setFormUrl("")
    setFormAlt("")
    setFormSection("visual_gallery")
    setFormPosition(0)
    setFormTitle("")
    setFormDescription("")
    setFormActive(true)
    setEditingItem(null)
    setShowForm(false)
    setError(null)
  }

  const openAddForm = () => {
    resetForm()
    // Auto-set position to next available
    const maxPos = media
      .filter((m) => m.section === "visual_gallery")
      .reduce((max, m) => Math.max(max, m.position), 0)
    setFormPosition(maxPos + 1)
    setShowForm(true)
  }

  const openEditForm = (item: GalleryMedia) => {
    setEditingItem(item)
    setFormUrl(item.url)
    setFormAlt(item.alt_text || "")
    setFormSection(item.section)
    setFormPosition(item.position)
    setFormTitle(item.title || "")
    setFormDescription(item.description || "")
    setFormActive(item.is_active)
    setShowForm(true)
    setError(null)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const resp = await fetch("/admin/gallery/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      })
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        throw new Error(errData.message || `Upload failed (${resp.status})`)
      }
      const data = await resp.json()
      if (data.url) {
        setFormUrl(data.url)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!formUrl.trim()) {
      setError("Image URL is required")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const body = {
        url: formUrl.trim(),
        alt_text: formAlt.trim() || null,
        section: formSection,
        position: formPosition,
        title: formTitle.trim() || null,
        description: formDescription.trim() || null,
        is_active: formActive,
      }

      const url = editingItem
        ? `/admin/gallery/${editingItem.id}`
        : "/admin/gallery"
      const resp = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        throw new Error(errData.message || `Save failed (${resp.status})`)
      }

      await fetchMedia()
      resetForm()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const resp = await fetch(`/admin/gallery/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!resp.ok) throw new Error(`Delete failed (${resp.status})`)
      await fetchMedia()
      setDeleteConfirm(null)
    } catch (err: unknown) {
      console.error("Delete failed:", err)
      setError(err instanceof Error ? err.message : "Delete failed")
      setDeleteConfirm(null)
    }
  }

  const handleToggleActive = async (item: GalleryMedia) => {
    try {
      await fetch(`/admin/gallery/${item.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !item.is_active }),
      })
      await fetchMedia()
    } catch (err: unknown) {
      console.error("Toggle failed:", err)
    }
  }

  const filtered = sectionFilter === "all"
    ? media
    : media.filter((m) => m.section === sectionFilter)

  const sectionCounts = media.reduce<Record<string, number>>((acc, m) => {
    acc[m.section] = (acc[m.section] || 0) + 1
    return acc
  }, {})

  if (loading) {
    return <div style={styles.loading}>Loading gallery media...</div>
  }

  return (
    <div>
      {/* Filter Pills */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={styles.pillBar}>
          <button
            style={styles.pill(sectionFilter === "all")}
            onClick={() => setSectionFilter("all")}
          >
            All ({media.length})
          </button>
          {SECTIONS.map((s) => (
            <button
              key={s.value}
              style={styles.pill(sectionFilter === s.value)}
              onClick={() => setSectionFilter(s.value)}
            >
              {s.label} ({sectionCounts[s.value] || 0})
            </button>
          ))}
        </div>
        <button style={styles.btnPrimary} onClick={openAddForm}>
          + Add Image
        </button>
      </div>

      {/* Error */}
      {error && !showForm && (
        <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: `${COLORS.danger}22`, color: COLORS.danger, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={styles.emptyState}>
          {sectionFilter === "all"
            ? "No gallery images yet. Click \"+ Add Image\" to get started."
            : `No images in "${SECTION_LABELS[sectionFilter] || sectionFilter}" section.`}
        </div>
      ) : (
        <div style={styles.grid}>
          {filtered
            .sort((a, b) => a.position - b.position)
            .map((item) => (
              <div key={item.id} style={styles.card}>
                {/* Image */}
                <ImageThumb url={item.url} alt={item.alt_text || item.title || ""} />

                {/* Card Body */}
                <div style={styles.cardBody}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={styles.badge(SECTION_COLORS[item.section] || COLORS.muted)}>
                      {SECTION_LABELS[item.section] || item.section}
                    </span>
                    <span style={{ fontSize: 11, color: COLORS.muted }}>
                      #{item.position}
                    </span>
                    {!item.is_active && (
                      <span style={styles.badge(COLORS.danger)}>Inactive</span>
                    )}
                  </div>

                  {item.title && (
                    <div style={styles.cardTitle}>{item.title}</div>
                  )}

                  <div style={styles.cardMeta} title={item.url}>
                    {item.url.length > 40
                      ? `...${item.url.slice(-37)}`
                      : item.url}
                  </div>

                  {/* Actions */}
                  <div style={styles.cardActions}>
                    <button
                      style={styles.toggle(item.is_active)}
                      onClick={() => handleToggleActive(item)}
                      title={item.is_active ? "Active" : "Inactive"}
                    >
                      <div style={styles.toggleKnob(item.is_active)} />
                    </button>
                    <div style={{ flex: 1 }} />
                    <button
                      style={styles.btnSecondary}
                      onClick={() => openEditForm(item)}
                    >
                      Edit
                    </button>
                    <button
                      style={styles.btnDanger}
                      onClick={() => setDeleteConfirm(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) resetForm() }}>
          <div style={styles.modal}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20, color: COLORS.text }}>
              {editingItem ? "Edit Image" : "Add Image"}
            </h3>

            {error && (
              <div style={{ padding: 10, marginBottom: 16, borderRadius: 6, background: `${COLORS.danger}22`, color: COLORS.danger, fontSize: 13 }}>
                {error}
              </div>
            )}

            {/* URL */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Image URL</label>
              <input
                style={styles.input}
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="/gallery/gallery-01.jpg"
              />
            </div>

            {/* File Upload */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Or upload a file</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ fontSize: 13, color: COLORS.muted }}
                  disabled={uploading}
                />
                {uploading && (
                  <span style={{ fontSize: 12, color: COLORS.gold }}>Uploading...</span>
                )}
              </div>
            </div>

            {/* Preview */}
            {formUrl && (
              <div style={{ marginBottom: 16, borderRadius: 8, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
                <ImageThumb url={formUrl} alt="Preview" height={160} />
              </div>
            )}

            {/* Alt Text */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Alt Text</label>
              <input
                style={styles.input}
                value={formAlt}
                onChange={(e) => setFormAlt(e.target.value)}
                placeholder="Descriptive alt text for accessibility"
              />
            </div>

            {/* Section */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Section</label>
              <select
                style={styles.select}
                value={formSection}
                onChange={(e) => setFormSection(e.target.value)}
              >
                {SECTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Position */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Position</label>
              <input
                style={styles.input}
                type="number"
                min={0}
                value={formPosition}
                onChange={(e) => setFormPosition(parseInt(e.target.value) || 0)}
              />
            </div>

            {/* Title */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Title (optional)</label>
              <input
                style={styles.input}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Image title"
              />
            </div>

            {/* Description */}
            <div style={styles.formGroup}>
              <label style={styles.label}>Description (optional)</label>
              <textarea
                style={styles.textarea}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Image description"
                rows={3}
              />
            </div>

            {/* Active */}
            <div style={{ ...styles.formGroup, display: "flex", alignItems: "center", gap: 10 }}>
              <button
                style={styles.toggle(formActive)}
                onClick={() => setFormActive(!formActive)}
                type="button"
              >
                <div style={styles.toggleKnob(formActive)} />
              </button>
              <span style={{ fontSize: 13, color: COLORS.text }}>
                {formActive ? "Active" : "Inactive"}
              </span>
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button style={styles.btnSecondary} onClick={resetForm}>
                Cancel
              </button>
              <button
                style={{ ...styles.btnPrimary, opacity: saving ? 0.6 : 1 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : editingItem ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}>
          <div style={{ ...styles.modal, maxWidth: 400 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: COLORS.text }}>
              Delete Image?
            </h3>
            <p style={{ fontSize: 14, color: COLORS.muted, marginBottom: 20 }}>
              This action cannot be undone. The image entry will be permanently removed.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={styles.btnSecondary} onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button
                style={{ ...styles.btnPrimary, background: COLORS.danger, color: "#fff" }}
                onClick={() => handleDelete(deleteConfirm)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Image Thumbnail ────────────────────────────────────────────────────────

const ImageThumb = ({ url, alt, height = 180 }: { url: string; alt: string; height?: number }) => {
  const [imgError, setImgError] = useState(false)
  const resolvedUrl = resolveImageUrl(url)

  if (imgError || !url) {
    return (
      <div style={{ ...styles.cardImagePlaceholder, height }}>
        {url || "No image"}
      </div>
    )
  }

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      style={{ ...styles.cardImage, height }}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  )
}

// ─── Content Tab Component ──────────────────────────────────────────────────

const ContentTab = () => {
  const [blocks, setBlocks] = useState<ContentBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [editState, setEditState] = useState<Record<string, Record<string, unknown>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const fetchContent = useCallback(async () => {
    try {
      const resp = await fetch("/admin/content", { credentials: "include" })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const galleryBlocks = (data.content_blocks || []).filter(
        (b: ContentBlock) => b.page === "gallery"
      )
      setBlocks(galleryBlocks)

      // Init edit state from existing blocks
      const state: Record<string, Record<string, unknown>> = {}
      for (const block of galleryBlocks) {
        state[block.section] =
          typeof block.content === "string"
            ? JSON.parse(block.content)
            : block.content
      }
      setEditState(state)
    } catch (e: unknown) {
      console.error("Failed to fetch content:", e)
      setError(e instanceof Error ? e.message : "Failed to load content")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContent()
  }, [fetchContent])

  const getFieldValue = (section: string, key: string): string => {
    const content = editState[section] || {}
    return (content[key] as string) ?? ""
  }

  const setFieldValue = (section: string, key: string, value: string) => {
    setEditState((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        [key]: value,
      },
    }))
  }

  const saveSection = async (section: string) => {
    setSaving(section)
    setError(null)
    try {
      const content = editState[section] || {}
      const resp = await fetch(`/admin/content/gallery/${section}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        throw new Error(errData.message || `Save failed (${resp.status})`)
      }
      await fetchContent()
    } catch (e: unknown) {
      console.error("Failed to save:", e)
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(null)
    }
  }

  const isModified = (section: string) => {
    const block = blocks.find((b) => b.section === section)
    if (!block) return Object.keys(editState[section] || {}).length > 0
    const current = editState[section] || {}
    const saved =
      typeof block.content === "string"
        ? JSON.parse(block.content)
        : block.content
    return JSON.stringify(current) !== JSON.stringify(saved)
  }

  const toggleExpanded = (section: string) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  if (loading) {
    return <div style={styles.loading}>Loading content...</div>
  }

  return (
    <div>
      {error && (
        <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: `${COLORS.danger}22`, color: COLORS.danger, fontSize: 13 }}>
          {error}
        </div>
      )}

      {CONTENT_SECTIONS.map((sc) => {
        const block = blocks.find((b) => b.section === sc.section)
        const isOpen = expanded[sc.section] ?? false
        const modified = isModified(sc.section)

        return (
          <div key={sc.section} style={styles.contentSection}>
            {/* Header */}
            <div
              style={styles.contentSectionHeader}
              onClick={() => toggleExpanded(sc.section)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: COLORS.muted, transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>
                  &#9654;
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>
                  {sc.label}
                </span>
                {block && (
                  <span style={styles.badge(COLORS.success)}>Saved</span>
                )}
                {!block && (
                  <span style={styles.badge(COLORS.muted)}>New</span>
                )}
                {modified && (
                  <span style={styles.badge(COLORS.gold)}>Modified</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {block && (
                  <span style={{ fontSize: 11, color: COLORS.muted }}>
                    Updated {new Date(block.updated_at).toLocaleDateString("en-GB")}
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            {isOpen && (
              <div style={styles.contentSectionBody}>
                {sc.fields.map((field) => (
                  <div key={field.key} style={styles.formGroup}>
                    <label style={styles.label}>{field.label}</label>
                    {field.type === "textarea" ? (
                      <textarea
                        style={styles.textarea}
                        value={getFieldValue(sc.section, field.key)}
                        onChange={(e) =>
                          setFieldValue(sc.section, field.key, e.target.value)
                        }
                        rows={4}
                      />
                    ) : (
                      <input
                        style={styles.input}
                        value={getFieldValue(sc.section, field.key)}
                        onChange={(e) =>
                          setFieldValue(sc.section, field.key, e.target.value)
                        }
                      />
                    )}
                  </div>
                ))}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    style={{ ...styles.btnPrimary, opacity: saving === sc.section ? 0.6 : 1 }}
                    onClick={() => saveSection(sc.section)}
                    disabled={saving === sc.section || (!modified && !!block)}
                  >
                    {saving === sc.section ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page Component ────────────────────────────────────────────────────

const GalleryPage = () => {
  const [activeTab, setActiveTab] = useState<"media" | "content">("media")

  return (
    <ErrorBoundary>
      <div style={styles.page}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.heading}>Gallery Management</h1>
            <p style={styles.subtitle}>
              Manage gallery images and content for the VOD Gallery page.
            </p>
          </div>
        </div>

        {/* Tab Bar */}
        <div style={styles.tabBar}>
          <button
            style={styles.tab(activeTab === "media")}
            onClick={() => setActiveTab("media")}
          >
            Media
          </button>
          <button
            style={styles.tab(activeTab === "content")}
            onClick={() => setActiveTab("content")}
          >
            Content
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "media" && <MediaTab />}
        {activeTab === "content" && <ContentTab />}
      </div>
    </ErrorBoundary>
  )
}

export const config = defineRouteConfig({
  label: "Gallery",
})

export default GalleryPage
