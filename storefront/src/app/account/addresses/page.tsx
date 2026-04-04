"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/AuthProvider"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { getToken } from "@/lib/auth"
import { toast } from "sonner"
import { Pencil, Check, X, Loader2, MapPin, Plus, Trash2 } from "lucide-react"

type Address = {
  id?: string
  first_name: string
  last_name: string
  address_1: string
  address_2: string
  city: string
  postal_code: string
  country_code: string
  is_default_shipping?: boolean
}

const EMPTY_ADDRESS: Address = {
  first_name: "",
  last_name: "",
  address_1: "",
  address_2: "",
  city: "",
  postal_code: "",
  country_code: "",
}

const COUNTRIES = [
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "BE", name: "Belgium" },
  { code: "DK", name: "Denmark" },
  { code: "ES", name: "Spain" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LU", name: "Luxembourg" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "SE", name: "Sweden" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" },
]

function getCountryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name || code
}

export default function AddressesPage() {
  const { customer } = useAuth()
  const [address, setAddress] = useState<Address | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState<Address>(EMPTY_ADDRESS)
  const [saving, setSaving] = useState(false)

  const fetchAddress = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/addresses`, {
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        // Use the first address (sorted by is_default_shipping desc)
        if (data.addresses && data.addresses.length > 0) {
          setAddress(data.addresses[0])
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAddress()
  }, [fetchAddress])

  function startEdit() {
    if (address) {
      setFormData({ ...address })
    }
    setIsEditing(true)
    setIsAdding(false)
  }

  function startAdd() {
    setFormData({
      ...EMPTY_ADDRESS,
      first_name: customer?.first_name || "",
      last_name: customer?.last_name || "",
    })
    setIsAdding(true)
    setIsEditing(false)
  }

  function handleCancel() {
    setIsEditing(false)
    setIsAdding(false)
  }

  function updateField(field: keyof Address, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (
      !formData.first_name.trim() ||
      !formData.last_name.trim() ||
      !formData.address_1.trim() ||
      !formData.city.trim() ||
      !formData.postal_code.trim() ||
      !formData.country_code
    ) {
      toast.error("Please fill in all required fields")
      return
    }

    const token = getToken()
    if (!token) {
      toast.error("Authentication required")
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        address_1: formData.address_1,
        address_2: formData.address_2,
        city: formData.city,
        postal_code: formData.postal_code,
        country_code: formData.country_code,
        is_default_shipping: true,
      }
      // If editing an existing address, pass its id
      if (isEditing && address?.id) {
        body.id = address.id
      }

      const res = await fetch(`${MEDUSA_URL}/store/account/addresses`, {
        method: "POST",
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || "Failed to save address")
      }

      const data = await res.json()
      toast.success("Address saved")
      setAddress(data.address)
      setIsEditing(false)
      setIsAdding(false)
    } catch (err: any) {
      toast.error(err.message || "Failed to save address")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!address?.id) return
    const token = getToken()
    if (!token) return

    try {
      const res = await fetch(
        `${MEDUSA_URL}/store/account/addresses/${address.id}`,
        {
          method: "DELETE",
          headers: {
            "x-publishable-api-key": PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
          },
        }
      )
      if (res.ok) {
        toast.success("Address deleted")
        setAddress(null)
      } else {
        toast.error("Failed to delete address")
      }
    } catch {
      toast.error("Failed to delete address")
    }
  }

  const showForm = isEditing || isAdding

  return (
    <div>
      <h2 className="heading-2 mb-6">Addresses</h2>

      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Default Shipping Address
            </h3>
            {address && !showForm && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startEdit}
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  className="gap-1.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              <div className="h-4 w-48 bg-muted rounded animate-pulse" />
              <div className="h-4 w-64 bg-muted rounded animate-pulse" />
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            </div>
          ) : showForm ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="addr-firstName">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="addr-firstName"
                    value={formData.first_name}
                    onChange={(e) => updateField("first_name", e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addr-lastName">
                    Last Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="addr-lastName"
                    value={formData.last_name}
                    onChange={(e) => updateField("last_name", e.target.value)}
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="addr-address1">
                  Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="addr-address1"
                  value={formData.address_1}
                  onChange={(e) => updateField("address_1", e.target.value)}
                  placeholder="Street and house number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="addr-address2">
                  Address Line 2
                </Label>
                <Input
                  id="addr-address2"
                  value={formData.address_2}
                  onChange={(e) => updateField("address_2", e.target.value)}
                  placeholder="Apartment, suite, etc. (optional)"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="addr-postal">
                    Postal Code <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="addr-postal"
                    value={formData.postal_code}
                    onChange={(e) => updateField("postal_code", e.target.value)}
                    placeholder="12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addr-city">
                    City <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="addr-city"
                    value={formData.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    placeholder="City"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="addr-country">
                    Country <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="addr-country"
                    value={formData.country_code}
                    onChange={(e) =>
                      updateField("country_code", e.target.value)
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Select country</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Save Address
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={saving}
                  className="gap-1.5"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : address ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {address.first_name} {address.last_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {address.address_1}
              </p>
              {address.address_2 && (
                <p className="text-sm text-muted-foreground">
                  {address.address_2}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {address.postal_code} {address.city}
              </p>
              <p className="text-sm text-muted-foreground">
                {getCountryName(address.country_code)}
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <MapPin className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                No saved addresses
              </p>
              <Button size="sm" onClick={startAdd} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add Address
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
