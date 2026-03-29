import { DocumentText } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import {
  Container,
  Heading,
  Button,
  Text,
  Input,
  Label,
  Textarea,
  Badge,
  Tabs,
  Switch,
} from "@medusajs/ui"
import { useEffect, useState, useCallback } from "react"
import RichTextEditor from "../../components/rich-text-editor"

// ─── Types ───────────────────────────────────────────────────────────────────

type ContentBlock = {
  id: string
  page: string
  section: string
  content: Record<string, unknown>
  sort_order: number
  is_published: boolean
  updated_at: string
}

type SectionConfig = {
  section: string
  label: string
  fields: FieldConfig[]
}

type FieldConfig = {
  key: string
  label: string
  type: "text" | "textarea" | "richtext" | "list" | "object-list" | "url"
  objectFields?: { key: string; label: string }[]
  placeholder?: string
}

// ─── Section Definitions ─────────────────────────────────────────────────────

const PAGE_SECTIONS: Record<string, SectionConfig[]> = {
  home: [
    {
      section: "hero",
      label: "Hero Section",
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "subtitle", label: "Subtitle", type: "textarea" },
        { key: "cta_text", label: "CTA Button Text", type: "text" },
        { key: "cta_link", label: "CTA Button Link", type: "url" },
        { key: "cta2_text", label: "Secondary CTA Text", type: "text" },
        { key: "cta2_link", label: "Secondary CTA Link", type: "url" },
      ],
    },
    {
      section: "catalog_teaser",
      label: "Catalog Teaser",
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "body", label: "Description", type: "textarea" },
        { key: "cta_text", label: "CTA Button Text", type: "text" },
        { key: "cta_link", label: "CTA Button Link", type: "url" },
      ],
    },
  ],
  about: [
    {
      section: "hero",
      label: "Hero Section",
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "motto", label: "Motto", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
      ],
    },
    {
      section: "founder",
      label: "The Founder",
      fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "subtitle", label: "Subtitle (e.g. born name)", type: "text" },
        { key: "body", label: "Biography", type: "richtext" },
        { key: "quote", label: "Quote", type: "text" },
        {
          key: "badges",
          label: "Stat Badges (one per line)",
          type: "list",
        },
      ],
    },
    {
      section: "mission",
      label: "Mission",
      fields: [{ key: "body", label: "Mission Text", type: "richtext" }],
    },
    {
      section: "genres",
      label: "Genres",
      fields: [
        { key: "items", label: "Genres (one per line)", type: "list" },
      ],
    },
    {
      section: "artists",
      label: "Notable Artists",
      fields: [
        { key: "description", label: "Intro Text", type: "textarea" },
        { key: "items", label: "Artists (one per line)", type: "list" },
      ],
    },
    {
      section: "sublabels",
      label: "Sub-Labels",
      fields: [
        {
          key: "items",
          label: "Sub-Labels",
          type: "object-list",
          objectFields: [
            { key: "name", label: "Name" },
            { key: "description", label: "Description" },
          ],
        },
      ],
    },
    {
      section: "tapemag",
      label: "TAPE-MAG",
      fields: [
        { key: "body", label: "Description", type: "richtext" },
        { key: "link", label: "Website URL", type: "url" },
      ],
    },
    {
      section: "vodfest",
      label: "VOD Fest",
      fields: [
        { key: "body", label: "Description", type: "richtext" },
        { key: "date", label: "Date", type: "text", placeholder: "July 17-19, 2026" },
        { key: "location", label: "Location", type: "text" },
        { key: "ticket_link", label: "Ticket / Info URL", type: "url" },
      ],
    },
    {
      section: "links",
      label: "External Links",
      fields: [
        {
          key: "items",
          label: "Links",
          type: "object-list",
          objectFields: [
            { key: "title", label: "Title" },
            { key: "url", label: "URL" },
            { key: "description", label: "Description" },
          ],
        },
      ],
    },
  ],
  auctions: [
    {
      section: "header",
      label: "Page Header",
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
      ],
    },
  ],
}

const PAGES = [
  { key: "home", label: "Home" },
  { key: "about", label: "About" },
  { key: "auctions", label: "Auctions" },
]

// ─── Component ───────────────────────────────────────────────────────────────

const ContentPage = () => {
  useAdminNav()
  const [blocks, setBlocks] = useState<ContentBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [editState, setEditState] = useState<
    Record<string, Record<string, unknown>>
  >({})
  const [activeTab, setActiveTab] = useState("home")

  const fetchContent = useCallback(async () => {
    try {
      const resp = await fetch("/admin/content", {
        credentials: "include",
      })
      const data = await resp.json()
      setBlocks(data.content_blocks || [])

      // Initialize edit state from existing blocks
      const state: Record<string, Record<string, unknown>> = {}
      for (const block of data.content_blocks || []) {
        state[`${block.page}.${block.section}`] =
          typeof block.content === "string"
            ? JSON.parse(block.content)
            : block.content
      }
      setEditState(state)
    } catch (e) {
      console.error("Failed to fetch content:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContent()
  }, [fetchContent])

  const getFieldValue = (page: string, section: string, key: string) => {
    const stateKey = `${page}.${section}`
    const content = editState[stateKey] || {}
    return content[key] ?? ""
  }

  const setFieldValue = (
    page: string,
    section: string,
    key: string,
    value: unknown
  ) => {
    const stateKey = `${page}.${section}`
    setEditState((prev) => ({
      ...prev,
      [stateKey]: {
        ...(prev[stateKey] || {}),
        [key]: value,
      },
    }))
  }

  const saveSection = async (page: string, section: string) => {
    const stateKey = `${page}.${section}`
    setSaving(stateKey)
    try {
      const content = editState[stateKey] || {}
      await fetch(`/admin/content/${page}/${section}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      await fetchContent()
    } catch (e) {
      console.error("Failed to save:", e)
    } finally {
      setSaving(null)
    }
  }

  const isModified = (page: string, section: string) => {
    const stateKey = `${page}.${section}`
    const block = blocks.find(
      (b) => b.page === page && b.section === section
    )
    if (!block) return Object.keys(editState[stateKey] || {}).length > 0
    const current = editState[stateKey] || {}
    const saved =
      typeof block.content === "string"
        ? JSON.parse(block.content)
        : block.content
    return JSON.stringify(current) !== JSON.stringify(saved)
  }

  const renderField = (
    page: string,
    section: string,
    field: FieldConfig
  ) => {
    const value = getFieldValue(page, section, field.key)

    switch (field.type) {
      case "text":
      case "url":
        return (
          <div key={field.key}>
            <Label htmlFor={`${page}-${section}-${field.key}`} className="text-ui-fg-subtle text-xs mb-1">
              {field.label}
            </Label>
            <Input
              id={`${page}-${section}-${field.key}`}
              value={(value as string) || ""}
              onChange={(e) =>
                setFieldValue(page, section, field.key, e.target.value)
              }
              placeholder={field.placeholder}
              type={field.type === "url" ? "url" : "text"}
            />
          </div>
        )

      case "textarea":
        return (
          <div key={field.key}>
            <Label className="text-ui-fg-subtle text-xs mb-1">
              {field.label}
            </Label>
            <Textarea
              value={(value as string) || ""}
              onChange={(e) =>
                setFieldValue(page, section, field.key, e.target.value)
              }
              rows={4}
            />
          </div>
        )

      case "richtext":
        return (
          <div key={field.key}>
            <Label className="text-ui-fg-subtle text-xs mb-1">
              {field.label}
            </Label>
            <RichTextEditor
              content={(value as string) || ""}
              onChange={(html) =>
                setFieldValue(page, section, field.key, html)
              }
              placeholder={`Enter ${field.label.toLowerCase()}...`}
            />
          </div>
        )

      case "list": {
        const items = Array.isArray(value)
          ? value
          : typeof value === "string" && value
            ? (value as string).split("\n")
            : []
        return (
          <div key={field.key}>
            <Label className="text-ui-fg-subtle text-xs mb-1">
              {field.label}
            </Label>
            <Textarea
              value={items.join("\n")}
              onChange={(e) =>
                setFieldValue(
                  page,
                  section,
                  field.key,
                  e.target.value.split("\n").filter((s) => s.trim())
                )
              }
              rows={6}
              placeholder="One item per line"
            />
            <Text size="xsmall" className="text-ui-fg-muted mt-1">
              {items.length} items
            </Text>
          </div>
        )
      }

      case "object-list": {
        const items = Array.isArray(value) ? (value as Record<string, string>[]) : []
        const objFields = field.objectFields || []
        return (
          <div key={field.key}>
            <Label className="text-ui-fg-subtle text-xs mb-2">
              {field.label}
            </Label>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="border border-ui-border-base rounded-lg p-3 space-y-2"
                >
                  {objFields.map((of) => (
                    <div key={of.key}>
                      <Label className="text-ui-fg-muted text-xs">
                        {of.label}
                      </Label>
                      <Input
                        value={item[of.key] || ""}
                        onChange={(e) => {
                          const newItems = [...items]
                          newItems[idx] = {
                            ...newItems[idx],
                            [of.key]: e.target.value,
                          }
                          setFieldValue(page, section, field.key, newItems)
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    variant="danger"
                    size="small"
                    onClick={() => {
                      const newItems = items.filter((_, i) => i !== idx)
                      setFieldValue(page, section, field.key, newItems)
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="small"
                onClick={() => {
                  const newItem: Record<string, string> = {}
                  for (const of2 of objFields) newItem[of2.key] = ""
                  setFieldValue(page, section, field.key, [...items, newItem])
                }}
              >
                + Add Item
              </Button>
            </div>
          </div>
        )
      }

      default:
        return null
    }
  }

  if (loading) {
    return (
      <Container>
        <Text>Loading content...</Text>
      </Container>
    )
  }

  return (
    <Container>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1">Content Management</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            Edit page content for Home, About and Auctions pages.
          </Text>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List>
          {PAGES.map((p) => (
            <Tabs.Trigger key={p.key} value={p.key}>
              {p.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {PAGES.map((p) => (
          <Tabs.Content key={p.key} value={p.key}>
            <div className="space-y-6 mt-4">
              {(PAGE_SECTIONS[p.key] || []).map((sectionConfig) => {
                const stateKey = `${p.key}.${sectionConfig.section}`
                const block = blocks.find(
                  (b) =>
                    b.page === p.key &&
                    b.section === sectionConfig.section
                )
                const modified = isModified(p.key, sectionConfig.section)

                return (
                  <div
                    key={sectionConfig.section}
                    className="border border-ui-border-base rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Heading level="h2" className="text-base">
                          {sectionConfig.label}
                        </Heading>
                        {block && (
                          <Badge color="green" size="xsmall">
                            Saved
                          </Badge>
                        )}
                        {!block && (
                          <Badge color="grey" size="xsmall">
                            New
                          </Badge>
                        )}
                        {modified && (
                          <Badge color="orange" size="xsmall">
                            Modified
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        size="small"
                        onClick={() =>
                          saveSection(p.key, sectionConfig.section)
                        }
                        isLoading={saving === stateKey}
                        disabled={!modified && !!block}
                      >
                        Save
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {sectionConfig.fields.map((field) =>
                        renderField(
                          p.key,
                          sectionConfig.section,
                          field
                        )
                      )}
                    </div>

                    {block && (
                      <Text
                        size="xsmall"
                        className="text-ui-fg-muted mt-3"
                      >
                        Last updated:{" "}
                        {new Date(block.updated_at).toLocaleString()}
                      </Text>
                    )}
                  </div>
                )
              })}
            </div>
          </Tabs.Content>
        ))}
      </Tabs>
    </Container>
  )
}

export default ContentPage
