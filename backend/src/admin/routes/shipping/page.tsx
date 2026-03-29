import { BuildingStorefront } from "@medusajs/icons"
import { useAdminNav } from "../../components/admin-nav"
import {
  Container,
  Heading,
  Table,
  Badge,
  Button,
  Text,
  Input,
  Label,
  Select,
  Checkbox,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

// Types
type ShippingConfig = {
  packaging_weight_grams: number
  packaging_weight_small_grams: number
  free_shipping_threshold: string | null
  default_carrier: string
  margin_percent: number
}

type ItemType = {
  id: string
  name: string
  slug: string
  default_weight_grams: number
  is_oversized: boolean
  format_group: string | null
  sort_order: number
}

type ShippingZone = {
  id: string
  name: string
  slug: string
  countries: string[] | null
  sort_order: number
  rates: ShippingRate[]
}

type ShippingRate = {
  id: string
  zone_id: string
  weight_from_grams: number
  weight_to_grams: number
  price_standard: number
  price_oversized: number
  carrier_standard: string
  carrier_oversized: string
  sort_order: number
}

type ShippingMethod = {
  id: string
  zone_id: string
  carrier_name: string
  method_name: string
  delivery_days_min: number | null
  delivery_days_max: number | null
  has_tracking: boolean
  tracking_url_pattern: string | null
  is_default: boolean
  is_active: boolean
  sort_order: number
}

type EstimateResult = {
  items_weight_grams: number
  packaging_weight_grams: number
  shipping_weight_grams: number
  has_oversized: boolean
  zone: string
  carrier: string
  base_price: number
  margin_percent: number
  final_price: number
  weight_tier: string
  breakdown: Array<{
    item_type: string
    quantity: number
    weight_per_item: number
    weight_total: number
    is_oversized: boolean
  }>
}

const CARRIER_TEMPLATES: Record<string, { tracking_url: string; methods: string[] }> = {
  "Deutsche Post": {
    tracking_url: "https://www.deutschepost.de/de/s/sendungsverfolgung.html?piececode={tracking}",
    methods: ["Brief", "Großbrief", "Maxibrief", "Warenpost"],
  },
  "DHL Paket": {
    tracking_url: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode={tracking}",
    methods: ["Standard", "Express"],
  },
  "DPD": {
    tracking_url: "https://tracking.dpd.de/status/de_DE/parcel/{tracking}",
    methods: ["Classic", "Express"],
  },
  "Hermes": {
    tracking_url: "https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#{tracking}",
    methods: ["Standard", "Express"],
  },
  "GLS": {
    tracking_url: "https://gls-group.eu/DE/de/paketverfolgung?match={tracking}",
    methods: ["Standard", "Express"],
  },
  "Royal Mail": {
    tracking_url: "https://www.royalmail.com/track-your-item#/tracking-results/{tracking}",
    methods: ["International Standard", "International Tracked"],
  },
  "USPS": {
    tracking_url: "https://tools.usps.com/go/TrackConfirmAction?tLabels={tracking}",
    methods: ["Priority Mail International", "First Class International"],
  },
}

const TABS = ["Settings", "Item Types", "Zones & Rates", "Methods", "Calculator"] as const
type Tab = (typeof TABS)[number]

const ShippingPage = () => {
  useAdminNav()
  const [activeTab, setActiveTab] = useState<Tab>("Settings")
  const [config, setConfig] = useState<ShippingConfig | null>(null)
  const [itemTypes, setItemTypes] = useState<ItemType[]>([])
  const [zones, setZones] = useState<ShippingZone[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Calculator state
  const [calcItems, setCalcItems] = useState<Array<{ slug: string; qty: number }>>([
    { slug: "vinyl-lp", qty: 1 },
  ])
  const [calcZone, setCalcZone] = useState("de")
  const [calcResult, setCalcResult] = useState<EstimateResult | null>(null)

  // Edit state for item types
  const [editingType, setEditingType] = useState<ItemType | null>(null)

  // Edit state for rates
  const [editingRate, setEditingRate] = useState<ShippingRate | null>(null)

  // Edit state for zone countries
  const [editingZoneCountries, setEditingZoneCountries] = useState<string | null>(null)
  const [zoneCountryDraft, setZoneCountryDraft] = useState<string[]>([])
  const [countryFilter, setCountryFilter] = useState("")

  // Methods state
  const [methods, setMethods] = useState<ShippingMethod[]>([])
  const [editingMethod, setEditingMethod] = useState<ShippingMethod | null>(null)
  const [selectedCarrierTemplate, setSelectedCarrierTemplate] = useState("")

  // All available country codes for the picker
  const ALL_COUNTRIES: Record<string, string> = {
    DE: "Germany", AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia",
    CY: "Cyprus", CZ: "Czech Republic", DK: "Denmark", EE: "Estonia", FI: "Finland",
    FR: "France", GR: "Greece", HU: "Hungary", IE: "Ireland", IT: "Italy",
    LV: "Latvia", LT: "Lithuania", LU: "Luxembourg", MT: "Malta", NL: "Netherlands",
    PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia", SI: "Slovenia",
    ES: "Spain", SE: "Sweden",
    GB: "United Kingdom", CH: "Switzerland", NO: "Norway", IS: "Iceland",
    LI: "Liechtenstein", AD: "Andorra", MC: "Monaco", SM: "San Marino",
    VA: "Vatican City", AL: "Albania", BA: "Bosnia and Herzegovina",
    ME: "Montenegro", MK: "North Macedonia", RS: "Serbia", MD: "Moldova",
    UA: "Ukraine", BY: "Belarus", TR: "Turkey", GE: "Georgia",
    US: "United States", CA: "Canada", MX: "Mexico", BR: "Brazil", AR: "Argentina",
    CL: "Chile", CO: "Colombia",
    JP: "Japan", CN: "China", KR: "South Korea", AU: "Australia", NZ: "New Zealand",
    IN: "India", SG: "Singapore", HK: "Hong Kong", TW: "Taiwan", TH: "Thailand",
    ZA: "South Africa", IL: "Israel", AE: "United Arab Emirates",
    SA: "Saudi Arabia", EG: "Egypt",
  }

  // Countries already assigned to other zones
  const getAssignedCountries = (excludeZoneId?: string) => {
    const assigned = new Set<string>()
    for (const z of zones) {
      if (z.id === excludeZoneId) continue
      for (const c of z.countries || []) {
        assigned.add(c)
      }
    }
    return assigned
  }

  // Save zone countries
  const saveZoneCountries = async (zoneId: string, countries: string[]) => {
    setSaving(true)
    try {
      const zone = zones.find((z) => z.id === zoneId)
      if (!zone) return
      await fetch("/admin/shipping/zones", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: zone.id,
          name: zone.name,
          slug: zone.slug,
          countries,
          sort_order: zone.sort_order,
        }),
      })
      setEditingZoneCountries(null)
      setCountryFilter("")
      await fetchAll()
    } catch (err) {
      console.error("Failed to save zone countries:", err)
    } finally {
      setSaving(false)
    }
  }

  const fetchAll = async () => {
    try {
      const res = await fetch("/admin/shipping", { credentials: "include" })
      const data = await res.json()
      setConfig(data.config)
      setItemTypes(data.item_types || [])
      setZones(data.zones || [])
      setMethods(data.methods || [])
    } catch (err) {
      console.error("Failed to load shipping config:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  // Save config
  const saveConfig = async () => {
    if (!config) return
    setSaving(true)
    try {
      await fetch("/admin/shipping/config", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      await fetchAll()
    } catch (err) {
      console.error("Failed to save config:", err)
    } finally {
      setSaving(false)
    }
  }

  // Save item type
  const saveItemType = async (type: Partial<ItemType>) => {
    setSaving(true)
    try {
      await fetch("/admin/shipping/item-types", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(type),
      })
      setEditingType(null)
      await fetchAll()
    } catch (err) {
      console.error("Failed to save item type:", err)
    } finally {
      setSaving(false)
    }
  }

  // Delete item type
  const deleteItemType = async (id: string) => {
    if (!confirm("Delete this item type?")) return
    try {
      await fetch(`/admin/shipping/item-types?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      await fetchAll()
    } catch (err) {
      console.error("Failed to delete:", err)
    }
  }

  // Save rate
  const saveRate = async (rate: Partial<ShippingRate>) => {
    setSaving(true)
    try {
      await fetch("/admin/shipping/rates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rate),
      })
      setEditingRate(null)
      await fetchAll()
    } catch (err) {
      console.error("Failed to save rate:", err)
    } finally {
      setSaving(false)
    }
  }

  // Delete rate
  const deleteRate = async (id: string) => {
    if (!confirm("Delete this rate?")) return
    try {
      await fetch(`/admin/shipping/rates?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      await fetchAll()
    } catch (err) {
      console.error("Failed to delete rate:", err)
    }
  }

  // Save shipping method
  const saveMethod = async (method: Partial<ShippingMethod>) => {
    setSaving(true)
    try {
      await fetch("/admin/shipping/methods", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method),
      })
      setEditingMethod(null)
      setSelectedCarrierTemplate("")
      await fetchAll()
    } catch (err) {
      console.error("Failed to save method:", err)
    } finally {
      setSaving(false)
    }
  }

  // Delete shipping method
  const deleteMethod = async (id: string) => {
    if (!confirm("Delete this shipping method?")) return
    try {
      await fetch(`/admin/shipping/methods?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      await fetchAll()
    } catch (err) {
      console.error("Failed to delete method:", err)
    }
  }

  // Apply carrier template
  const applyCarrierTemplate = (carrierName: string) => {
    setSelectedCarrierTemplate(carrierName)
    const template = CARRIER_TEMPLATES[carrierName]
    if (template && editingMethod) {
      setEditingMethod({
        ...editingMethod,
        carrier_name: carrierName,
        tracking_url_pattern: template.tracking_url,
        has_tracking: true,
        method_name: template.methods[0] || "Standard",
      })
    }
  }

  // Run calculator
  const runCalculator = async () => {
    try {
      const res = await fetch("/admin/shipping/estimate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: calcItems.map((i) => ({
            item_type_slug: i.slug,
            quantity: i.qty,
          })),
          zone_slug: calcZone,
        }),
      })
      const data = await res.json()
      setCalcResult(data.estimate)
    } catch (err) {
      console.error("Calculator error:", err)
    }
  }

  if (loading) return <Container><Text>Loading...</Text></Container>

  return (
    <Container>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level="h1">Shipping Configuration</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            Manage shipping zones, rates, and item type weights
          </Text>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b border-ui-border-base pb-2">
        {TABS.map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "primary" : "secondary"}
            size="small"
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </Button>
        ))}
      </div>

      {/* Tab 1: Global Settings */}
      {activeTab === "Settings" && config && (
        <div className="space-y-4 max-w-lg">
          <div>
            <Label>Packaging Weight — Large (Vinyl, g)</Label>
            <Input
              type="number"
              value={config.packaging_weight_grams}
              onChange={(e) =>
                setConfig({ ...config, packaging_weight_grams: parseInt(e.target.value) || 0 })
              }
            />
            <Text className="text-ui-fg-subtle text-xs mt-1">
              Added to orders containing oversized items (vinyl records)
            </Text>
          </div>
          <div>
            <Label>Packaging Weight — Small (CDs/Cassettes, g)</Label>
            <Input
              type="number"
              value={config.packaging_weight_small_grams}
              onChange={(e) =>
                setConfig({ ...config, packaging_weight_small_grams: parseInt(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <Label>Margin (%)</Label>
            <Input
              type="number"
              value={config.margin_percent}
              onChange={(e) =>
                setConfig({ ...config, margin_percent: parseInt(e.target.value) || 0 })
              }
            />
            <Text className="text-ui-fg-subtle text-xs mt-1">
              Percentage added on top of base shipping price as buffer
            </Text>
          </div>
          <div>
            <Label>Free Shipping Threshold (EUR)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="Leave empty to disable"
              value={config.free_shipping_threshold || ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  free_shipping_threshold: e.target.value || null,
                })
              }
            />
          </div>
          <div>
            <Label>Default Carrier</Label>
            <Input
              value={config.default_carrier}
              onChange={(e) =>
                setConfig({ ...config, default_carrier: e.target.value })
              }
            />
          </div>
          <Button onClick={saveConfig} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      )}

      {/* Tab 2: Item Types */}
      {activeTab === "Item Types" && (
        <div>
          <div className="flex justify-between mb-4">
            <Text className="text-ui-fg-subtle">
              Define default weights per article type. These are used to calculate shipping costs.
            </Text>
            <Button
              size="small"
              onClick={() =>
                setEditingType({
                  id: "",
                  name: "",
                  slug: "",
                  default_weight_grams: 150,
                  is_oversized: false,
                  format_group: null,
                  sort_order: 99,
                })
              }
            >
              + Add Type
            </Button>
          </div>

          {editingType && (
            <div className="bg-ui-bg-subtle p-4 rounded mb-4 space-y-3 max-w-lg border border-ui-border-base">
              <Heading level="h3">
                {editingType.id ? "Edit Item Type" : "New Item Type"}
              </Heading>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label size="xsmall">Name</Label>
                  <Input
                    size="small"
                    value={editingType.name}
                    onChange={(e) => setEditingType({ ...editingType, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label size="xsmall">Slug</Label>
                  <Input
                    size="small"
                    value={editingType.slug}
                    onChange={(e) => setEditingType({ ...editingType, slug: e.target.value })}
                  />
                </div>
                <div>
                  <Label size="xsmall">Weight (g)</Label>
                  <Input
                    size="small"
                    type="number"
                    value={editingType.default_weight_grams}
                    onChange={(e) =>
                      setEditingType({
                        ...editingType,
                        default_weight_grams: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <Label size="xsmall">Format Group</Label>
                  <Input
                    size="small"
                    value={editingType.format_group || ""}
                    onChange={(e) =>
                      setEditingType({ ...editingType, format_group: e.target.value || null })
                    }
                    placeholder="e.g. LP, CASSETTE..."
                  />
                </div>
                <div>
                  <Label size="xsmall">Sort Order</Label>
                  <Input
                    size="small"
                    type="number"
                    value={editingType.sort_order}
                    onChange={(e) =>
                      setEditingType({ ...editingType, sort_order: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Checkbox
                    id="oversized"
                    checked={editingType.is_oversized}
                    onCheckedChange={(checked) =>
                      setEditingType({ ...editingType, is_oversized: !!checked })
                    }
                  />
                  <Label htmlFor="oversized" size="xsmall">
                    Oversized (requires parcel)
                  </Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="small" onClick={() => saveItemType(editingType)} disabled={saving}>
                  Save
                </Button>
                <Button size="small" variant="secondary" onClick={() => setEditingType(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>#</Table.HeaderCell>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Slug</Table.HeaderCell>
                <Table.HeaderCell>Weight (g)</Table.HeaderCell>
                <Table.HeaderCell>Oversized</Table.HeaderCell>
                <Table.HeaderCell>Format Group</Table.HeaderCell>
                <Table.HeaderCell></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {itemTypes.map((t) => (
                <Table.Row key={t.id}>
                  <Table.Cell>
                    <Text className="text-xs text-ui-fg-subtle">{t.sort_order}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text className="font-medium text-sm">{t.name}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text className="text-xs font-mono">{t.slug}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text className="font-mono">{t.default_weight_grams}g</Text>
                  </Table.Cell>
                  <Table.Cell>
                    {t.is_oversized ? (
                      <Badge color="orange">Yes</Badge>
                    ) : (
                      <Text className="text-ui-fg-subtle text-xs">No</Text>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Text className="text-xs text-ui-fg-subtle">{t.format_group || "—"}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-1">
                      <Button size="small" variant="secondary" onClick={() => setEditingType(t)}>
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => deleteItemType(t.id)}
                      >
                        Del
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}

      {/* Tab 3: Zones & Rates */}
      {activeTab === "Zones & Rates" && (
        <div className="space-y-8">
          {zones.map((zone) => (
            <div key={zone.id}>
              <div className="flex items-center gap-3 mb-3">
                <Heading level="h3">{zone.name}</Heading>
                <Badge color="grey">{zone.slug}</Badge>
                {zone.countries && zone.countries.length > 0 ? (
                  <Text className="text-ui-fg-subtle text-xs">
                    {zone.countries.length} countries
                  </Text>
                ) : (
                  <Badge color="blue">Catch-all (all other countries)</Badge>
                )}
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => {
                    setEditingZoneCountries(zone.id)
                    setZoneCountryDraft(zone.countries || [])
                    setCountryFilter("")
                  }}
                >
                  Edit Countries
                </Button>
              </div>

              {/* Country tags */}
              {zone.countries && zone.countries.length > 0 && editingZoneCountries !== zone.id && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {zone.countries.sort().map((code: string) => (
                    <Badge key={code} color="grey" className="text-xs">
                      {code} — {ALL_COUNTRIES[code] || code}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Country picker (editing mode) */}
              {editingZoneCountries === zone.id && (
                <div className="bg-ui-bg-subtle border border-ui-border-base rounded p-4 mb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Heading level="h3">Edit Countries — {zone.name}</Heading>
                    <div className="flex gap-2">
                      <Button
                        size="small"
                        onClick={() => saveZoneCountries(zone.id, zoneCountryDraft)}
                        disabled={saving}
                      >
                        {saving ? "Saving..." : "Save Countries"}
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => {
                          setEditingZoneCountries(null)
                          setCountryFilter("")
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>

                  {/* Selected countries */}
                  <div>
                    <Label size="xsmall">
                      Selected ({zoneCountryDraft.length})
                    </Label>
                    <div className="flex flex-wrap gap-1 mt-1 min-h-[32px]">
                      {zoneCountryDraft.length === 0 ? (
                        <Text className="text-ui-fg-subtle text-xs italic">
                          No countries — this zone will be a catch-all for unlisted countries
                        </Text>
                      ) : (
                        zoneCountryDraft.sort().map((code) => (
                          <button
                            key={code}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-ui-bg-base border border-ui-border-base hover:border-ui-border-strong"
                            onClick={() =>
                              setZoneCountryDraft(zoneCountryDraft.filter((c) => c !== code))
                            }
                          >
                            {code} — {ALL_COUNTRIES[code] || code}
                            <span className="text-ui-fg-subtle">×</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Search + add */}
                  <div>
                    <Input
                      size="small"
                      placeholder="Search countries..."
                      value={countryFilter}
                      onChange={(e) => setCountryFilter(e.target.value)}
                    />
                  </div>
                  <div className="max-h-[200px] overflow-y-auto border border-ui-border-base rounded p-2 space-y-0.5">
                    {Object.entries(ALL_COUNTRIES)
                      .filter(([code, name]) => {
                        const q = countryFilter.toLowerCase()
                        if (!q) return true
                        return code.toLowerCase().includes(q) || name.toLowerCase().includes(q)
                      })
                      .filter(([code]) => {
                        // Hide already assigned to other zones
                        const assigned = getAssignedCountries(zone.id)
                        return !assigned.has(code)
                      })
                      .sort(([, a], [, b]) => a.localeCompare(b))
                      .map(([code, name]) => {
                        const selected = zoneCountryDraft.includes(code)
                        return (
                          <button
                            key={code}
                            className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 ${
                              selected
                                ? "bg-ui-bg-base-pressed font-medium"
                                : "hover:bg-ui-bg-base-hover"
                            }`}
                            onClick={() => {
                              if (selected) {
                                setZoneCountryDraft(zoneCountryDraft.filter((c) => c !== code))
                              } else {
                                setZoneCountryDraft([...zoneCountryDraft, code])
                              }
                            }}
                          >
                            <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                              selected ? "bg-ui-button-inverted text-ui-fg-on-inverted border-ui-button-inverted" : "border-ui-border-base"
                            }`}>
                              {selected && "✓"}
                            </span>
                            {code} — {name}
                          </button>
                        )
                      })}
                  </div>
                </div>
              )}

              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Weight Range</Table.HeaderCell>
                    <Table.HeaderCell>Standard Price</Table.HeaderCell>
                    <Table.HeaderCell>Oversized Price</Table.HeaderCell>
                    <Table.HeaderCell>Carrier (Std)</Table.HeaderCell>
                    <Table.HeaderCell>Carrier (Over)</Table.HeaderCell>
                    <Table.HeaderCell></Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {zone.rates.map((rate) => (
                    <Table.Row key={rate.id}>
                      <Table.Cell>
                        <Text className="font-mono text-sm">
                          {rate.weight_from_grams} – {rate.weight_to_grams}g
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        {editingRate?.id === rate.id ? (
                          <Input
                            size="small"
                            type="number"
                            step="0.01"
                            className="w-24"
                            value={editingRate.price_standard}
                            onChange={(e) =>
                              setEditingRate({
                                ...editingRate,
                                price_standard: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        ) : (
                          <Text className="font-mono font-medium">
                            EUR {rate.price_standard.toFixed(2)}
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {editingRate?.id === rate.id ? (
                          <Input
                            size="small"
                            type="number"
                            step="0.01"
                            className="w-24"
                            value={editingRate.price_oversized}
                            onChange={(e) =>
                              setEditingRate({
                                ...editingRate,
                                price_oversized: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        ) : (
                          <Text className="font-mono font-medium">
                            EUR {rate.price_oversized.toFixed(2)}
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Text className="text-xs">{rate.carrier_standard}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text className="text-xs">{rate.carrier_oversized}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex gap-1">
                          {editingRate?.id === rate.id ? (
                            <>
                              <Button
                                size="small"
                                onClick={() => saveRate(editingRate)}
                                disabled={saving}
                              >
                                Save
                              </Button>
                              <Button
                                size="small"
                                variant="secondary"
                                onClick={() => setEditingRate(null)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="small"
                                variant="secondary"
                                onClick={() => setEditingRate({ ...rate })}
                              >
                                Edit
                              </Button>
                              <Button
                                size="small"
                                variant="secondary"
                                onClick={() => deleteRate(rate.id)}
                              >
                                Del
                              </Button>
                            </>
                          )}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>

              <Button
                size="small"
                variant="secondary"
                className="mt-2"
                onClick={() => {
                  const lastRate = zone.rates[zone.rates.length - 1]
                  setEditingRate({
                    id: "",
                    zone_id: zone.id,
                    weight_from_grams: lastRate ? lastRate.weight_to_grams + 1 : 0,
                    weight_to_grams: lastRate ? lastRate.weight_to_grams + 5000 : 1000,
                    price_standard: 0,
                    price_oversized: 0,
                    carrier_standard: "Deutsche Post",
                    carrier_oversized: "DHL Paket",
                    sort_order: (lastRate?.sort_order || 0) + 1,
                  })
                }}
              >
                + Add Weight Tier
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: Methods */}
      {activeTab === "Methods" && (
        <div className="space-y-8">
          <div className="flex justify-between items-start">
            <Text className="text-ui-fg-subtle">
              Configure shipping methods per zone. Each zone can have multiple carriers with different delivery times and tracking options.
            </Text>
          </div>

          {zones.map((zone) => {
            const zoneMethods = methods.filter((m) => m.zone_id === zone.id)
            return (
              <div key={zone.id}>
                <div className="flex items-center gap-3 mb-3">
                  <Heading level="h3">{zone.name}</Heading>
                  <Badge color="grey">{zone.slug}</Badge>
                  <Text className="text-ui-fg-subtle text-xs">
                    {zoneMethods.length} method{zoneMethods.length !== 1 ? "s" : ""}
                  </Text>
                </div>

                {/* Method editor */}
                {editingMethod && editingMethod.zone_id === zone.id && (
                  <div className="bg-ui-bg-subtle p-4 rounded mb-4 space-y-3 border border-ui-border-base">
                    <Heading level="h3">
                      {editingMethod.id ? "Edit Method" : "New Method"}
                    </Heading>

                    {/* Carrier template selector */}
                    {!editingMethod.id && (
                      <div>
                        <Label size="xsmall">Carrier Template</Label>
                        <Select
                          value={selectedCarrierTemplate}
                          onValueChange={applyCarrierTemplate}
                        >
                          <Select.Trigger>
                            <Select.Value placeholder="Select a carrier template..." />
                          </Select.Trigger>
                          <Select.Content>
                            {Object.keys(CARRIER_TEMPLATES).map((name) => (
                              <Select.Item key={name} value={name}>
                                {name}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select>
                        <Text className="text-ui-fg-subtle text-xs mt-1">
                          Pre-fills carrier name, tracking URL, and method suggestions
                        </Text>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label size="xsmall">Carrier Name</Label>
                        <Input
                          size="small"
                          value={editingMethod.carrier_name}
                          onChange={(e) =>
                            setEditingMethod({ ...editingMethod, carrier_name: e.target.value })
                          }
                          placeholder="e.g. Deutsche Post"
                        />
                      </div>
                      <div>
                        <Label size="xsmall">Method Name</Label>
                        {selectedCarrierTemplate && CARRIER_TEMPLATES[selectedCarrierTemplate] ? (
                          <Select
                            value={editingMethod.method_name}
                            onValueChange={(v) =>
                              setEditingMethod({ ...editingMethod, method_name: v })
                            }
                          >
                            <Select.Trigger>
                              <Select.Value />
                            </Select.Trigger>
                            <Select.Content>
                              {CARRIER_TEMPLATES[selectedCarrierTemplate].methods.map((m) => (
                                <Select.Item key={m} value={m}>
                                  {m}
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select>
                        ) : (
                          <Input
                            size="small"
                            value={editingMethod.method_name}
                            onChange={(e) =>
                              setEditingMethod({ ...editingMethod, method_name: e.target.value })
                            }
                            placeholder="e.g. Standard, Express"
                          />
                        )}
                      </div>
                      <div>
                        <Label size="xsmall">Delivery Days (min)</Label>
                        <Input
                          size="small"
                          type="number"
                          value={editingMethod.delivery_days_min ?? ""}
                          onChange={(e) =>
                            setEditingMethod({
                              ...editingMethod,
                              delivery_days_min: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label size="xsmall">Delivery Days (max)</Label>
                        <Input
                          size="small"
                          type="number"
                          value={editingMethod.delivery_days_max ?? ""}
                          onChange={(e) =>
                            setEditingMethod({
                              ...editingMethod,
                              delivery_days_max: e.target.value ? parseInt(e.target.value) : null,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label size="xsmall">Sort Order</Label>
                        <Input
                          size="small"
                          type="number"
                          value={editingMethod.sort_order}
                          onChange={(e) =>
                            setEditingMethod({
                              ...editingMethod,
                              sort_order: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="flex items-end gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="has-tracking"
                            checked={editingMethod.has_tracking}
                            onCheckedChange={(checked) =>
                              setEditingMethod({ ...editingMethod, has_tracking: !!checked })
                            }
                          />
                          <Label htmlFor="has-tracking" size="xsmall">
                            Tracking
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="is-default"
                            checked={editingMethod.is_default}
                            onCheckedChange={(checked) =>
                              setEditingMethod({ ...editingMethod, is_default: !!checked })
                            }
                          />
                          <Label htmlFor="is-default" size="xsmall">
                            Default
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="is-active"
                            checked={editingMethod.is_active}
                            onCheckedChange={(checked) =>
                              setEditingMethod({ ...editingMethod, is_active: !!checked })
                            }
                          />
                          <Label htmlFor="is-active" size="xsmall">
                            Active
                          </Label>
                        </div>
                      </div>
                    </div>

                    {editingMethod.has_tracking && (
                      <div>
                        <Label size="xsmall">Tracking URL Pattern</Label>
                        <Input
                          size="small"
                          value={editingMethod.tracking_url_pattern || ""}
                          onChange={(e) =>
                            setEditingMethod({
                              ...editingMethod,
                              tracking_url_pattern: e.target.value || null,
                            })
                          }
                          placeholder="https://...{tracking}..."
                        />
                        <Text className="text-ui-fg-subtle text-xs mt-1">
                          Use {"{tracking}"} as placeholder for the tracking number
                        </Text>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="small"
                        onClick={() => saveMethod(editingMethod)}
                        disabled={saving || !editingMethod.carrier_name || !editingMethod.method_name}
                      >
                        {saving ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => {
                          setEditingMethod(null)
                          setSelectedCarrierTemplate("")
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Methods table */}
                {zoneMethods.length > 0 && (
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>#</Table.HeaderCell>
                        <Table.HeaderCell>Carrier</Table.HeaderCell>
                        <Table.HeaderCell>Method</Table.HeaderCell>
                        <Table.HeaderCell>Delivery</Table.HeaderCell>
                        <Table.HeaderCell>Tracking</Table.HeaderCell>
                        <Table.HeaderCell>Status</Table.HeaderCell>
                        <Table.HeaderCell></Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {zoneMethods.map((m) => (
                        <Table.Row key={m.id}>
                          <Table.Cell>
                            <Text className="text-xs text-ui-fg-subtle">{m.sort_order}</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Text className="font-medium text-sm">{m.carrier_name}</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <div className="flex items-center gap-1.5">
                              <Text className="text-sm">{m.method_name}</Text>
                              {m.is_default && <Badge color="green">Default</Badge>}
                            </div>
                          </Table.Cell>
                          <Table.Cell>
                            <Text className="text-xs text-ui-fg-subtle">
                              {m.delivery_days_min && m.delivery_days_max
                                ? `${m.delivery_days_min}–${m.delivery_days_max} days`
                                : m.delivery_days_min
                                  ? `${m.delivery_days_min}+ days`
                                  : "—"}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>
                            {m.has_tracking ? (
                              <Badge color="blue">Yes</Badge>
                            ) : (
                              <Text className="text-ui-fg-subtle text-xs">No</Text>
                            )}
                          </Table.Cell>
                          <Table.Cell>
                            {m.is_active ? (
                              <Badge color="green">Active</Badge>
                            ) : (
                              <Badge color="grey">Inactive</Badge>
                            )}
                          </Table.Cell>
                          <Table.Cell>
                            <div className="flex gap-1">
                              <Button
                                size="small"
                                variant="secondary"
                                onClick={() => setEditingMethod({ ...m })}
                              >
                                Edit
                              </Button>
                              <Button
                                size="small"
                                variant="secondary"
                                onClick={() => deleteMethod(m.id)}
                              >
                                Del
                              </Button>
                            </div>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                )}

                <Button
                  size="small"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => {
                    setEditingMethod({
                      id: "",
                      zone_id: zone.id,
                      carrier_name: "",
                      method_name: "",
                      delivery_days_min: null,
                      delivery_days_max: null,
                      has_tracking: false,
                      tracking_url_pattern: null,
                      is_default: zoneMethods.length === 0,
                      is_active: true,
                      sort_order: (zoneMethods[zoneMethods.length - 1]?.sort_order || 0) + 1,
                    })
                    setSelectedCarrierTemplate("")
                  }}
                >
                  + Add Method
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {/* Tab 5: Calculator */}
      {activeTab === "Calculator" && (
        <div className="max-w-lg space-y-4">
          <Text className="text-ui-fg-subtle">
            Test shipping cost calculation with sample items.
          </Text>

          {calcItems.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-end">
              <div className="flex-1">
                <Label size="xsmall">Item Type</Label>
                <Select
                  value={item.slug}
                  onValueChange={(v) => {
                    const next = [...calcItems]
                    next[idx].slug = v
                    setCalcItems(next)
                  }}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {itemTypes.map((t) => (
                      <Select.Item key={t.slug} value={t.slug}>
                        {t.name} ({t.default_weight_grams}g)
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <div className="w-20">
                <Label size="xsmall">Qty</Label>
                <Input
                  size="small"
                  type="number"
                  min={1}
                  value={item.qty}
                  onChange={(e) => {
                    const next = [...calcItems]
                    next[idx].qty = parseInt(e.target.value) || 1
                    setCalcItems(next)
                  }}
                />
              </div>
              {calcItems.length > 1 && (
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => setCalcItems(calcItems.filter((_, i) => i !== idx))}
                >
                  X
                </Button>
              )}
            </div>
          ))}

          <Button
            size="small"
            variant="secondary"
            onClick={() => setCalcItems([...calcItems, { slug: "vinyl-lp", qty: 1 }])}
          >
            + Add Item
          </Button>

          <div>
            <Label size="xsmall">Destination Zone</Label>
            <Select value={calcZone} onValueChange={setCalcZone}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {zones.map((z) => (
                  <Select.Item key={z.slug} value={z.slug}>
                    {z.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>

          <Button onClick={runCalculator}>Calculate Shipping</Button>

          {calcResult && (
            <div className="bg-ui-bg-subtle border border-ui-border-base rounded p-4 space-y-2">
              <Heading level="h3">Result</Heading>

              <div className="space-y-1 text-sm">
                {calcResult.breakdown.map((b, i) => (
                  <div key={i} className="flex justify-between">
                    <Text>
                      {b.quantity}x {b.item_type}
                      {b.is_oversized && " (oversized)"}
                    </Text>
                    <Text className="font-mono">{b.weight_total}g</Text>
                  </div>
                ))}
                <div className="flex justify-between text-ui-fg-subtle">
                  <Text>+ Packaging</Text>
                  <Text className="font-mono">{calcResult.packaging_weight_grams}g</Text>
                </div>
                <div className="flex justify-between border-t pt-1 font-medium">
                  <Text>Total Weight</Text>
                  <Text className="font-mono">{calcResult.shipping_weight_grams}g</Text>
                </div>
                <div className="flex justify-between text-ui-fg-subtle">
                  <Text>Weight Tier</Text>
                  <Text className="font-mono">{calcResult.weight_tier}</Text>
                </div>
                <div className="flex justify-between text-ui-fg-subtle">
                  <Text>Zone</Text>
                  <Text>{calcResult.zone}</Text>
                </div>
                <div className="flex justify-between text-ui-fg-subtle">
                  <Text>Carrier</Text>
                  <Text>{calcResult.carrier}</Text>
                </div>
                {calcResult.has_oversized && (
                  <Badge color="orange">Oversized — parcel required</Badge>
                )}
                {calcResult.margin_percent > 0 && (
                  <div className="flex justify-between text-ui-fg-subtle">
                    <Text>Margin ({calcResult.margin_percent}%)</Text>
                    <Text className="font-mono">
                      EUR {calcResult.base_price.toFixed(2)} + {calcResult.margin_percent}%
                    </Text>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 mt-2">
                  <Text className="font-bold text-lg">Shipping Cost</Text>
                  <Text className="font-bold text-lg font-mono">
                    EUR {calcResult.final_price.toFixed(2)}
                  </Text>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Container>
  )
}

export default ShippingPage
