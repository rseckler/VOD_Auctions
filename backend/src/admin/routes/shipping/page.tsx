import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BuildingStorefront } from "@medusajs/icons"
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

const TABS = ["Settings", "Item Types", "Zones & Rates", "Calculator"] as const
type Tab = (typeof TABS)[number]

const ShippingPage = () => {
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

  const fetchAll = async () => {
    try {
      const res = await fetch("/admin/shipping", { credentials: "include" })
      const data = await res.json()
      setConfig(data.config)
      setItemTypes(data.item_types || [])
      setZones(data.zones || [])
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
                {zone.countries && (
                  <Text className="text-ui-fg-subtle text-xs">
                    {zone.countries.length} countries
                  </Text>
                )}
              </div>

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

      {/* Tab 4: Calculator */}
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

export const config = defineRouteConfig({
  label: "Shipping",
  icon: BuildingStorefront,
})

export default ShippingPage
