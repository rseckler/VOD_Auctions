import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Component, useEffect, useState, useCallback, useRef } from "react"
import { useAdminNav } from "../../components/admin-nav"

class ErrorBoundary extends Component<{children: React.ReactNode},{error:string|null}> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message || String(e) } }
  render() {
    if (this.state.error) return <div style={{padding:"32px",color:"#ef4444",fontFamily:"monospace",fontSize:"13px"}}><b>Render Error:</b> {this.state.error}</div>
    return this.props.children
  }
}

export const config = defineRouteConfig({
  label: "Customers",
})

// ── Types ─────────────────────────────────────────────────────────────────────

type CRMData = {
  configured: boolean
  overview?: {
    total_contacts: number
    vod_auctions: number
    tape_mag: number
    newsletter_optins: number
    medusa_customers: number
  }
  segments?: Record<string, number>
  top_customers?: TopCustomer[]
  recent_contacts?: RecentContact[]
  recent_medusa_customers?: MedusaCustomer[]
  campaigns?: Campaign[]
  total_campaigns?: number
}

type TopCustomer = {
  email: string
  name: string
  platform: string
  segment: string
  total_spent: number
  total_purchases: number
  total_bids: number
  total_wins: number
}

type RecentContact = {
  email: string
  name: string
  platform: string
  segment: string
  newsletter: boolean
}

type MedusaCustomer = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  created_at: string
}

type Campaign = {
  id: number
  name: string
  subject: string
  sentDate: string
  stats: {
    sent: number
    opens: number
    clicks: number
    openRate: string
    clickRate: string
  } | null
}

type CustomerListItem = {
  id: string
  email: string
  name: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  created_at: string
  total_spent: number
  total_purchases: number
  total_bids: number
  total_wins: number
  last_purchase_at: string | null
  first_purchase_at: string | null
  last_bid_at: string | null
  tags: string[]
  is_vip: boolean
  is_dormant: boolean
  stats_updated_at: string | null
}

type CustomerDetail = CustomerListItem & {
  deleted_at?: string | null
}

type CustomerDetailData = {
  customer: CustomerDetail
  orders: Array<{
    id: string
    order_number: string | null
    amount: number
    status: string
    fulfillment_status: string
    item_type: string
    payment_provider: string
    created_at: string
    updated_at: string
    shipping_name: string | null
    shipping_country: string | null
    lot_number: number | null
    auction_title: string | null
    release_id: string | null
  }>
  bids: Array<{
    id: string
    amount: number
    is_winning: boolean
    is_outbid: boolean
    created_at: string
    lot_number: number | null
    auction_title: string | null
    auction_block_id: string | null
  }>
  addresses: Array<{
    shipping_name: string | null
    shipping_address_line1: string | null
    shipping_address_line2: string | null
    shipping_city: string | null
    shipping_postal_code: string | null
    shipping_country: string | null
    created_at: string
  }>
}

type CustomerNote = {
  id: string
  customer_id: string
  body: string
  author_email: string
  created_at: string
}

type TimelineEvent = {
  type: string
  title: string
  description: string
  timestamp: string
}

type SavedAddress = {
  id: string
  customer_id: string
  first_name: string | null
  last_name: string | null
  address_1: string
  address_2: string | null
  city: string
  postal_code: string
  country_code: string
  phone: string | null
  created_at: string
  updated_at: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  bg: "#1c1915",
  card: "#2a2520",
  text: "#f5f0eb",
  muted: "#a09080",
  gold: "#d4a54a",
  border: "#3a3530",
  hover: "#353025",
  success: "#22c55e",
  error: "#ef4444",
  blue: "#60a5fa",
  purple: "#c084fc",
  orange: "#fb923c",
}

const SEGMENT_COLORS: Record<string, string> = {
  registered: COLORS.blue,
  bidder: COLORS.orange,
  buyer: COLORS.success,
  vip: COLORS.gold,
  imported: COLORS.muted,
  unknown: COLORS.muted,
}

const PRESET_TAGS = [
  "vip", "trusted_bidder", "problematic", "collector",
  "wholesale", "press", "high_value", "new_customer", "repeat_customer",
]

const TIMELINE_ICONS: Record<string, string> = {
  payment_completed: "\uD83D\uDCB0",
  bid_placed: "\uD83D\uDD28",
  auction_won: "\uD83C\uDFC6",
  order_shipped: "\uD83D\uDCE6",
  note_added: "\uD83D\uDCDD",
  account_created: "\uD83D\uDC64",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (d: string | null) => {
  if (!d) return "\u2014"
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

const formatDateTime = (d: string | null) => {
  if (!d) return "\u2014"
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const formatPrice = (p: number | null | undefined) => {
  if (p === null || p === undefined || p === 0) return "\u2014"
  return `\u20AC${p.toFixed(2)}`
}

const SegmentBadge = ({ segment }: { segment: string }) => (
  <span
    style={{
      padding: "2px 8px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: 600,
      background: (SEGMENT_COLORS[segment] || COLORS.muted) + "20",
      color: SEGMENT_COLORS[segment] || COLORS.muted,
      textTransform: "capitalize" as const,
    }}
  >
    {segment}
  </span>
)

const PlatformBadge = ({ platform }: { platform: string }) => (
  <span
    style={{
      padding: "2px 8px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: 600,
      background:
        platform === "vod-auctions"
          ? COLORS.gold + "20"
          : platform === "tape-mag"
            ? COLORS.purple + "20"
            : COLORS.muted + "20",
      color:
        platform === "vod-auctions"
          ? COLORS.gold
          : platform === "tape-mag"
            ? COLORS.purple
            : COLORS.muted,
    }}
  >
    {platform}
  </span>
)

// ── Customer Detail Drawer ───────────────────────────────────────────────────

function CustomerDetailDrawer({
  customerId,
  onClose,
  onCustomerChanged,
}: {
  customerId: string | null
  onClose: () => void
  onCustomerChanged?: () => void
}) {
  const [data, setData] = useState<CustomerDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [drawerTab, setDrawerTab] = useState<"overview" | "orders" | "bids" | "notes" | "timeline">("overview")

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone: "" })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Tags state
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [customTagInput, setCustomTagInput] = useState("")
  const [tagSaving, setTagSaving] = useState(false)

  // Password reset state
  const [resetStatus, setResetStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [resetMessage, setResetMessage] = useState("")

  // Notes state
  const [notes, setNotes] = useState<CustomerNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteBody, setNoteBody] = useState("")
  const [noteSubmitting, setNoteSubmitting] = useState(false)

  // Timeline state
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  // Block state
  const [blockLoading, setBlockLoading] = useState(false)

  // Brevo sync state
  const [brevoStatus, setBrevoStatus] = useState<"idle" | "loading" | "synced" | "error">("idle")

  // Anonymize state
  const [anonymizeLoading, setAnonymizeLoading] = useState(false)

  // Delete state
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Saved addresses state
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [savedAddressesLoading, setSavedAddressesLoading] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)
  const [addressForm, setAddressForm] = useState({ first_name: "", last_name: "", address_1: "", address_2: "", city: "", postal_code: "", country_code: "", phone: "" })
  const [addressSaving, setAddressSaving] = useState(false)
  const [showAddAddressForm, setShowAddAddressForm] = useState(false)

  useEffect(() => {
    if (!customerId) {
      setData(null)
      return
    }
    setLoading(true)
    setDrawerTab("overview")
    setIsEditing(false)
    setResetStatus("idle")
    setBrevoStatus("idle")
    setNotes([])
    setTimeline([])
    setSavedAddresses([])
    setEditingAddressId(null)
    setShowAddAddressForm(false)
    fetch(`/admin/customers/${customerId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Fetch saved addresses
    fetchSavedAddresses(customerId)
  }, [customerId])

  // Load notes when notes tab is selected
  useEffect(() => {
    if (drawerTab === "notes" && customerId) {
      fetchNotes()
    }
  }, [drawerTab, customerId])

  // Load timeline when timeline tab is selected
  useEffect(() => {
    if (drawerTab === "timeline" && customerId) {
      fetchTimeline()
    }
  }, [drawerTab, customerId])

  const isOpen = !!customerId
  const c = data?.customer
  const isBlocked = !!(c?.deleted_at)

  // ── API helpers ──

  function patchCustomer(body: Record<string, unknown>) {
    return fetch(`/admin/customers/${customerId}`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => {
      if (!r.ok) throw new Error("Update failed")
      return r.json()
    })
  }

  function startEditing() {
    if (!c) return
    setEditForm({
      first_name: c.first_name || "",
      last_name: c.last_name || "",
      email: c.email || "",
      phone: c.phone || "",
    })
    setEditError(null)
    setIsEditing(true)
  }

  function saveEdit() {
    setEditSaving(true)
    setEditError(null)
    patchCustomer({
      first_name: editForm.first_name,
      last_name: editForm.last_name,
      email: editForm.email,
      phone: editForm.phone,
    })
      .then((d) => {
        if (data) {
          setData({ ...data, customer: { ...data.customer, ...d.customer } })
        }
        setIsEditing(false)
        setEditSaving(false)
      })
      .catch((e) => {
        setEditError(e.message || "Save failed")
        setEditSaving(false)
      })
  }

  function addTag(tag: string) {
    if (!c) return
    const currentTags = c.tags || []
    if (currentTags.includes(tag)) return
    const newTags = [...currentTags, tag]
    setTagSaving(true)
    patchCustomer({ tags: newTags })
      .then((d) => {
        if (data) setData({ ...data, customer: { ...data.customer, ...d.customer } })
        setTagSaving(false)
        setShowTagDropdown(false)
        setCustomTagInput("")
      })
      .catch(() => setTagSaving(false))
  }

  function removeTag(tag: string) {
    if (!c) return
    const newTags = (c.tags || []).filter((t) => t !== tag)
    setTagSaving(true)
    patchCustomer({ tags: newTags })
      .then((d) => {
        if (data) setData({ ...data, customer: { ...data.customer, ...d.customer } })
        setTagSaving(false)
      })
      .catch(() => setTagSaving(false))
  }

  function toggleVip() {
    if (!c) return
    patchCustomer({ is_vip: !c.is_vip })
      .then((d) => {
        if (data) setData({ ...data, customer: { ...data.customer, ...d.customer } })
      })
      .catch(() => {})
  }

  function toggleDormant() {
    if (!c) return
    patchCustomer({ is_dormant: !c.is_dormant })
      .then((d) => {
        if (data) setData({ ...data, customer: { ...data.customer, ...d.customer } })
      })
      .catch(() => {})
  }

  function sendPasswordReset() {
    setResetStatus("loading")
    fetch(`/admin/customers/${customerId}/password-reset`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setResetStatus("success")
          setResetMessage("Password reset email sent.")
        } else {
          setResetStatus("error")
          setResetMessage(d.message || "Failed to send reset email.")
        }
      })
      .catch(() => {
        setResetStatus("error")
        setResetMessage("Request failed.")
      })
  }

  function fetchNotes() {
    setNotesLoading(true)
    fetch(`/admin/customers/${customerId}/notes`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setNotes(d.notes || [])
        setNotesLoading(false)
      })
      .catch(() => setNotesLoading(false))
  }

  function submitNote() {
    if (!noteBody.trim()) return
    setNoteSubmitting(true)
    fetch(`/admin/customers/${customerId}/notes`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: noteBody.trim() }),
    })
      .then((r) => r.json())
      .then(() => {
        setNoteBody("")
        setNoteSubmitting(false)
        fetchNotes()
      })
      .catch(() => setNoteSubmitting(false))
  }

  function deleteNote(noteId: string) {
    if (!window.confirm("Delete this note?")) return
    fetch(`/admin/customers/${customerId}/notes/${noteId}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    })
      .then(() => fetchNotes())
      .catch(() => {})
  }

  function fetchTimeline() {
    setTimelineLoading(true)
    fetch(`/admin/customers/${customerId}/timeline`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setTimeline(d.events || [])
        setTimelineLoading(false)
      })
      .catch(() => setTimelineLoading(false))
  }

  function handleBlock() {
    const action = isBlocked ? "unblock" : "block"
    if (!window.confirm(`Are you sure you want to ${action} this customer?`)) return
    setBlockLoading(true)
    fetch(`/admin/customers/${customerId}/${action}`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && data) {
          setData({
            ...data,
            customer: {
              ...data.customer,
              deleted_at: d.blocked ? new Date().toISOString() : null,
            },
          })
        }
        setBlockLoading(false)
      })
      .catch(() => setBlockLoading(false))
  }

  function syncBrevo() {
    setBrevoStatus("loading")
    fetch(`/admin/customers/${customerId}/brevo-sync`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        setBrevoStatus(d.success ? "synced" : "error")
      })
      .catch(() => setBrevoStatus("error"))
  }

  function handleAnonymize() {
    if (!c) return
    const input = window.prompt("Type customer email to confirm anonymization:")
    if (input !== c.email) return
    setAnonymizeLoading(true)
    fetch(`/admin/customers/${customerId}/anonymize`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        setAnonymizeLoading(false)
        if (d.success) {
          onClose()
          onCustomerChanged?.()
        }
      })
      .catch(() => setAnonymizeLoading(false))
  }

  function handleDelete() {
    if (!c) return
    const input = window.prompt("Zur Best\u00E4tigung E-Mail des Kunden eingeben:")
    if (input !== c.email) return
    setDeleteLoading(true)
    fetch(`/admin/customers/${customerId}/delete`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        setDeleteLoading(false)
        if (d.success) {
          onClose()
          onCustomerChanged?.()
        }
      })
      .catch(() => setDeleteLoading(false))
  }

  // ── Saved Addresses helpers ──

  function fetchSavedAddresses(cId: string) {
    setSavedAddressesLoading(true)
    fetch(`/admin/customers/${cId}/addresses`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setSavedAddresses(d.addresses || [])
        setSavedAddressesLoading(false)
      })
      .catch(() => setSavedAddressesLoading(false))
  }

  function startEditAddress(addr: SavedAddress) {
    setEditingAddressId(addr.id)
    setAddressForm({
      first_name: addr.first_name || "",
      last_name: addr.last_name || "",
      address_1: addr.address_1 || "",
      address_2: addr.address_2 || "",
      city: addr.city || "",
      postal_code: addr.postal_code || "",
      country_code: addr.country_code || "",
      phone: addr.phone || "",
    })
  }

  function cancelEditAddress() {
    setEditingAddressId(null)
    setAddressForm({ first_name: "", last_name: "", address_1: "", address_2: "", city: "", postal_code: "", country_code: "", phone: "" })
  }

  function saveEditAddress() {
    if (!editingAddressId) return
    setAddressSaving(true)
    fetch(`/admin/customer-addresses/${editingAddressId}`, {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addressForm),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.address) {
          setSavedAddresses((prev) => prev.map((a) => a.id === editingAddressId ? d.address : a))
        }
        setEditingAddressId(null)
        setAddressSaving(false)
      })
      .catch(() => setAddressSaving(false))
  }

  function deleteSavedAddress(addressId: string) {
    if (!window.confirm("Delete this address?")) return
    fetch(`/admin/customer-addresses/${addressId}`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setSavedAddresses((prev) => prev.filter((a) => a.id !== addressId))
        }
      })
      .catch(() => {})
  }

  function startAddAddress() {
    setShowAddAddressForm(true)
    setAddressForm({ first_name: "", last_name: "", address_1: "", address_2: "", city: "", postal_code: "", country_code: "", phone: "" })
  }

  function cancelAddAddress() {
    setShowAddAddressForm(false)
    setAddressForm({ first_name: "", last_name: "", address_1: "", address_2: "", city: "", postal_code: "", country_code: "", phone: "" })
  }

  function saveNewAddress() {
    if (!customerId || !addressForm.address_1 || !addressForm.city || !addressForm.postal_code || !addressForm.country_code) return
    setAddressSaving(true)
    fetch(`/admin/customers/${customerId}/addresses`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addressForm),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.address) {
          setSavedAddresses((prev) => [d.address, ...prev])
        }
        setShowAddAddressForm(false)
        setAddressSaving(false)
      })
      .catch(() => setAddressSaving(false))
  }

  // ── Styles ──

  const drawerStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "min(540px, 100vw)",
    background: COLORS.card,
    borderLeft: `1px solid ${COLORS.border}`,
    zIndex: 1000,
    transform: isOpen ? "translateX(0)" : "translateX(100%)",
    transition: "transform 0.25s ease",
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  }

  const drawerTabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 12px",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    color: active ? COLORS.gold : COLORS.muted,
    cursor: "pointer",
    background: "none",
    border: "none",
    borderBottomColor: active ? COLORS.gold : "transparent",
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
  })

  const smallBtnStyle: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    border: `1px solid ${COLORS.border}`,
    background: COLORS.bg,
    color: COLORS.text,
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    borderRadius: "5px",
    border: `1px solid ${COLORS.border}`,
    background: COLORS.bg,
    color: COLORS.text,
    fontSize: "13px",
    outline: "none",
  }

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "8px",
  }

  const addressFormFields = (form: typeof addressForm, setForm: (f: typeof addressForm) => void) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <div>
          <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "3px" }}>First Name</label>
          <input style={inputStyle} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "3px" }}>Last Name</label>
          <input style={inputStyle} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
        </div>
      </div>
      <div>
        <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "3px" }}>Address Line 1 *</label>
        <input style={inputStyle} value={form.address_1} onChange={(e) => setForm({ ...form, address_1: e.target.value })} />
      </div>
      <div>
        <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "3px" }}>Address Line 2</label>
        <input style={inputStyle} value={form.address_2} onChange={(e) => setForm({ ...form, address_2: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <div>
          <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "3px" }}>City *</label>
          <input style={inputStyle} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "3px" }}>Postal Code *</label>
          <input style={inputStyle} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <div>
          <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "3px" }}>Country Code *</label>
          <input style={inputStyle} value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value })} placeholder="DE" />
        </div>
        <div>
          <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "3px" }}>Phone</label>
          <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </div>
    </div>
  )

  return (
    <>
      {isOpen && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999 }} onClick={onClose} />}
      <div style={drawerStyle}>
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: `1px solid ${COLORS.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1 }}>
            {loading ? (
              <div style={{ color: COLORS.muted, fontSize: "14px" }}>Loading...</div>
            ) : c ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: "18px", fontWeight: 700, color: COLORS.text, margin: 0 }}>
                    {c.name}
                  </h2>
                  {c.is_vip && (
                    <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: COLORS.gold + "20", color: COLORS.gold }}>
                      VIP
                    </span>
                  )}
                  {c.is_dormant && (
                    <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: COLORS.muted + "20", color: COLORS.muted }}>
                      Dormant
                    </span>
                  )}
                  {isBlocked && (
                    <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: COLORS.error + "20", color: COLORS.error }}>
                      Blocked
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "13px", color: COLORS.muted, fontFamily: "monospace" }}>
                  {c.email}
                </div>
                <div style={{ fontSize: "12px", color: COLORS.muted, marginTop: "4px" }}>
                  Customer since {formatDate(c.created_at)}
                </div>
                {/* Action buttons row */}
                <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                  <button onClick={startEditing} style={smallBtnStyle}>Edit</button>
                  <button
                    onClick={handleBlock}
                    disabled={blockLoading}
                    style={{
                      ...smallBtnStyle,
                      background: isBlocked ? COLORS.error + "20" : COLORS.bg,
                      borderColor: isBlocked ? COLORS.error : COLORS.border,
                      color: isBlocked ? COLORS.error : COLORS.muted,
                    }}
                  >
                    {blockLoading ? "..." : isBlocked ? "Unblock" : "Block"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: COLORS.muted,
              cursor: "pointer",
              fontSize: "20px",
              lineHeight: 1,
              padding: "4px",
            }}
          >
            {"\u2715"}
          </button>
        </div>

        {/* KPI Row */}
        {c && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "1px",
              background: COLORS.border,
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            {[
              { label: "Spent", value: formatPrice(c.total_spent) },
              { label: "Purchases", value: data ? data.orders.length : c.total_purchases },
              { label: "Bids", value: data ? data.bids.length : c.total_bids },
              { label: "Wins", value: data ? data.bids.filter((b: { is_winning: boolean }) => b.is_winning).length : c.total_wins },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: COLORS.card,
                  padding: "12px 16px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "18px", fontWeight: 700, color: COLORS.gold }}>
                  {kpi.value}
                </div>
                <div style={{ fontSize: "11px", color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {kpi.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Drawer Tabs */}
        {c && (
          <div style={{ borderBottom: `1px solid ${COLORS.border}`, display: "flex", gap: "0", overflowX: "auto" }}>
            <button style={drawerTabStyle(drawerTab === "overview")} onClick={() => setDrawerTab("overview")}>Overview</button>
            <button style={drawerTabStyle(drawerTab === "orders")} onClick={() => setDrawerTab("orders")}>
              Orders ({data?.orders.length || 0})
            </button>
            <button style={drawerTabStyle(drawerTab === "bids")} onClick={() => setDrawerTab("bids")}>
              Bids ({data?.bids.length || 0})
            </button>
            <button style={drawerTabStyle(drawerTab === "notes")} onClick={() => setDrawerTab("notes")}>Notes</button>
            <button style={drawerTabStyle(drawerTab === "timeline")} onClick={() => setDrawerTab("timeline")}>Timeline</button>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>
          {loading && <div style={{ color: COLORS.muted }}>Loading customer data...</div>}

          {/* Overview Tab */}
          {!loading && c && drawerTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* Edit Form (inline) */}
              {isEditing && (
                <div style={{ padding: "16px", background: COLORS.bg, borderRadius: "6px", border: `1px solid ${COLORS.border}` }}>
                  <div style={sectionLabelStyle}>Edit Customer</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                    <div>
                      <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "4px" }}>First Name</label>
                      <input style={inputStyle} value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "4px" }}>Last Name</label>
                      <input style={inputStyle} value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ marginBottom: "10px" }}>
                    <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "4px" }}>Email</label>
                    <input style={inputStyle} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                  </div>
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ fontSize: "11px", color: COLORS.muted, display: "block", marginBottom: "4px" }}>Phone</label>
                    <input style={inputStyle} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                  </div>
                  {editError && <div style={{ fontSize: "12px", color: COLORS.error, marginBottom: "8px" }}>{editError}</div>}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={saveEdit}
                      disabled={editSaving}
                      style={{ ...smallBtnStyle, background: COLORS.gold, color: COLORS.bg, borderColor: COLORS.gold, fontWeight: 600 }}
                    >
                      {editSaving ? "Saving..." : "Save"}
                    </button>
                    <button onClick={() => setIsEditing(false)} style={smallBtnStyle}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Tags Section */}
              <div>
                <div style={sectionLabelStyle}>Tags</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                  {(c.tags || []).map((tag: string) => (
                    <span
                      key={tag}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        border: `1px solid ${COLORS.gold}40`,
                        background: COLORS.gold + "15",
                        color: COLORS.gold,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {tag}
                      <span
                        onClick={() => removeTag(tag)}
                        style={{ cursor: "pointer", opacity: 0.7, fontSize: "14px", lineHeight: 1 }}
                      >
                        {"\u00D7"}
                      </span>
                    </span>
                  ))}
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setShowTagDropdown(!showTagDropdown)}
                      disabled={tagSaving}
                      style={{ ...smallBtnStyle, fontSize: "11px", padding: "3px 8px" }}
                    >
                      {tagSaving ? "..." : "+ Tag"}
                    </button>
                    {showTagDropdown && (
                      <div style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        marginTop: "4px",
                        background: COLORS.card,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: "6px",
                        padding: "6px",
                        zIndex: 10,
                        minWidth: "180px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                      }}>
                        {PRESET_TAGS.filter((t) => !(c.tags || []).includes(t)).map((tag) => (
                          <div
                            key={tag}
                            onClick={() => addTag(tag)}
                            style={{
                              padding: "5px 8px",
                              fontSize: "12px",
                              cursor: "pointer",
                              borderRadius: "4px",
                              color: COLORS.text,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            {tag}
                          </div>
                        ))}
                        <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: "4px", paddingTop: "6px", display: "flex", gap: "4px" }}>
                          <input
                            style={{ ...inputStyle, flex: 1, fontSize: "12px", padding: "4px 8px" }}
                            placeholder="Custom tag..."
                            value={customTagInput}
                            onChange={(e) => setCustomTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && customTagInput.trim()) {
                                addTag(customTagInput.trim().toLowerCase())
                              }
                            }}
                          />
                          <button
                            onClick={() => {
                              if (customTagInput.trim()) addTag(customTagInput.trim().toLowerCase())
                            }}
                            style={{ ...smallBtnStyle, fontSize: "11px", padding: "4px 8px" }}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* VIP / Dormant toggles */}
                <div style={{ display: "flex", gap: "16px", marginTop: "10px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: COLORS.muted, cursor: "pointer" }}>
                    <input type="checkbox" checked={c.is_vip} onChange={toggleVip} style={{ accentColor: COLORS.gold }} />
                    VIP
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: COLORS.muted, cursor: "pointer" }}>
                    <input type="checkbox" checked={c.is_dormant} onChange={toggleDormant} style={{ accentColor: COLORS.muted }} />
                    Dormant
                  </label>
                </div>
              </div>

              {/* Timeline (date fields) */}
              <div>
                <div style={sectionLabelStyle}>Timeline</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[
                    { label: "Registered", value: formatDateTime(c.created_at) },
                    { label: "First Purchase", value: formatDateTime(c.first_purchase_at) },
                    { label: "Last Purchase", value: formatDateTime(c.last_purchase_at) },
                    { label: "Last Bid", value: formatDateTime(c.last_bid_at) },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                      <span style={{ color: COLORS.muted }}>{row.label}</span>
                      <span style={{ color: COLORS.text }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Saved Addresses (CRUD) */}
              <div>
                <div style={{ ...sectionLabelStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Saved Addresses</span>
                  {!showAddAddressForm && (
                    <button
                      onClick={startAddAddress}
                      style={{ ...smallBtnStyle, fontSize: "11px", padding: "2px 8px" }}
                    >
                      + Add Address
                    </button>
                  )}
                </div>

                {/* Add Address Form */}
                {showAddAddressForm && (
                  <div style={{ padding: "12px", background: COLORS.bg, borderRadius: "6px", border: `1px solid ${COLORS.gold}40`, marginBottom: "8px" }}>
                    {addressFormFields(addressForm, setAddressForm)}
                    <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                      <button
                        onClick={saveNewAddress}
                        disabled={addressSaving || !addressForm.address_1 || !addressForm.city || !addressForm.postal_code || !addressForm.country_code}
                        style={{ ...smallBtnStyle, background: COLORS.gold, color: COLORS.bg, borderColor: COLORS.gold, fontWeight: 600 }}
                      >
                        {addressSaving ? "Saving..." : "Save"}
                      </button>
                      <button onClick={cancelAddAddress} style={smallBtnStyle}>Cancel</button>
                    </div>
                  </div>
                )}

                {savedAddressesLoading ? (
                  <div style={{ color: COLORS.muted, fontSize: "12px" }}>Loading...</div>
                ) : savedAddresses.length === 0 && !showAddAddressForm ? (
                  <div style={{ color: COLORS.muted, fontSize: "12px" }}>No saved addresses.</div>
                ) : (
                  savedAddresses.map((addr) => (
                    <div
                      key={addr.id}
                      style={{
                        padding: "10px 12px",
                        background: COLORS.bg,
                        borderRadius: "6px",
                        marginBottom: "8px",
                        fontSize: "12px",
                        lineHeight: "1.6",
                      }}
                    >
                      {editingAddressId === addr.id ? (
                        <div>
                          {addressFormFields(addressForm, setAddressForm)}
                          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                            <button
                              onClick={saveEditAddress}
                              disabled={addressSaving}
                              style={{ ...smallBtnStyle, background: COLORS.gold, color: COLORS.bg, borderColor: COLORS.gold, fontWeight: 600 }}
                            >
                              {addressSaving ? "Saving..." : "Save"}
                            </button>
                            <button onClick={cancelEditAddress} style={smallBtnStyle}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 500 }}>
                            {[addr.first_name, addr.last_name].filter(Boolean).join(" ") || "\u2014"}
                          </div>
                          <div style={{ color: COLORS.muted }}>
                            {[addr.address_1, addr.address_2].filter(Boolean).join(", ")}
                          </div>
                          <div style={{ color: COLORS.muted }}>
                            {[addr.postal_code, addr.city, addr.country_code].filter(Boolean).join(" ")}
                          </div>
                          {addr.phone && <div style={{ color: COLORS.muted }}>{addr.phone}</div>}
                          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                            <button onClick={() => startEditAddress(addr)} style={{ ...smallBtnStyle, fontSize: "11px", padding: "2px 8px" }}>Edit</button>
                            <button
                              onClick={() => deleteSavedAddress(addr.id)}
                              style={{ ...smallBtnStyle, fontSize: "11px", padding: "2px 8px", color: COLORS.error, borderColor: COLORS.error + "60" }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Known Addresses (from transactions) */}
              {data?.addresses && data.addresses.length > 0 && (
                <div>
                  <div style={sectionLabelStyle}>Known Addresses (from orders)</div>
                  {data.addresses.slice(0, 3).map((addr, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "10px 12px",
                        background: COLORS.bg,
                        borderRadius: "6px",
                        marginBottom: "8px",
                        fontSize: "12px",
                        lineHeight: "1.6",
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{addr.shipping_name}</div>
                      <div style={{ color: COLORS.muted }}>
                        {[addr.shipping_address_line1, addr.shipping_address_line2].filter(Boolean).join(", ")}
                      </div>
                      <div style={{ color: COLORS.muted }}>
                        {[addr.shipping_postal_code, addr.shipping_city, addr.shipping_country].filter(Boolean).join(" ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Phone */}
              {c.phone && (
                <div>
                  <div style={sectionLabelStyle}>Phone</div>
                  <div style={{ fontSize: "13px" }}>{c.phone}</div>
                </div>
              )}

              {/* Brevo Sync */}
              <div>
                <div style={sectionLabelStyle}>Brevo CRM</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={syncBrevo}
                    disabled={brevoStatus === "loading"}
                    style={smallBtnStyle}
                  >
                    {brevoStatus === "loading" ? "Syncing..." : brevoStatus === "synced" ? "Synced \u2713" : "Sync to Brevo"}
                  </button>
                  {brevoStatus === "error" && <span style={{ fontSize: "12px", color: COLORS.error }}>Sync failed</span>}
                </div>
              </div>

              {/* Actions row */}
              <div>
                <div style={sectionLabelStyle}>Actions</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={sendPasswordReset}
                    disabled={resetStatus === "loading"}
                    style={smallBtnStyle}
                  >
                    {resetStatus === "loading" ? "Sending..." : "Send Password Reset"}
                  </button>
                  {resetStatus === "success" && <span style={{ fontSize: "12px", color: COLORS.success }}>{resetMessage}</span>}
                  {resetStatus === "error" && <span style={{ fontSize: "12px", color: COLORS.error }}>{resetMessage}</span>}
                </div>
              </div>

              {/* Stats freshness */}
              {c.stats_updated_at && (
                <div style={{ fontSize: "11px", color: COLORS.muted, marginTop: "8px" }}>
                  Stats last updated: {formatDateTime(c.stats_updated_at)}
                </div>
              )}

              {/* Danger Zone */}
              <div style={{
                marginTop: "8px",
                padding: "16px",
                border: `1px solid ${COLORS.error}40`,
                borderRadius: "6px",
                background: COLORS.error + "08",
              }}>
                <div style={{ ...sectionLabelStyle, color: COLORS.error }}>Danger Zone</div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={handleAnonymize}
                    disabled={anonymizeLoading}
                    style={{
                      ...smallBtnStyle,
                      borderColor: COLORS.error,
                      color: COLORS.error,
                      background: COLORS.error + "10",
                    }}
                  >
                    {anonymizeLoading ? "Processing..." : "Anonymize Customer (GDPR)"}
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleteLoading}
                    style={{
                      ...smallBtnStyle,
                      borderColor: COLORS.error,
                      color: "#fff",
                      background: COLORS.error,
                      fontWeight: 600,
                    }}
                  >
                    {deleteLoading ? "Deleting..." : "Delete Contact"}
                  </button>
                  <button
                    onClick={() => window.open(`/admin/customers/${customerId}/gdpr-export`, "_blank")}
                    style={smallBtnStyle}
                  >
                    Admin GDPR Export
                  </button>
                </div>
                <div style={{ fontSize: "11px", color: COLORS.muted, marginTop: "8px" }}>
                  Anonymize: replaces PII with hashes, keeps transactions for accounting. Delete: permanently removes customer and all related data.
                </div>
              </div>
            </div>
          )}

          {/* Orders Tab */}
          {!loading && c && drawerTab === "orders" && (
            <div>
              {data?.orders.length === 0 ? (
                <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No orders yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {data?.orders.map((order) => (
                    <div
                      key={order.id}
                      style={{
                        padding: "12px",
                        background: COLORS.bg,
                        borderRadius: "6px",
                        fontSize: "13px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: COLORS.gold }}>
                          {order.order_number || order.id.slice(-8)}
                        </span>
                        <span style={{ color: COLORS.gold, fontWeight: 600 }}>
                          {formatPrice(order.amount)}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            background: order.status === "paid" ? COLORS.success + "20" : COLORS.muted + "20",
                            color: order.status === "paid" ? COLORS.success : COLORS.muted,
                          }}
                        >
                          {order.status}
                        </span>
                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            background: COLORS.blue + "20",
                            color: COLORS.blue,
                          }}
                        >
                          {order.fulfillment_status}
                        </span>
                        <span style={{ fontSize: "11px", color: COLORS.muted }}>{order.payment_provider}</span>
                      </div>
                      {order.auction_title && (
                        <div style={{ fontSize: "11px", color: COLORS.muted, marginTop: "4px" }}>
                          {order.auction_title}{order.lot_number ? ` \u00B7 Lot #${order.lot_number}` : ""}
                        </div>
                      )}
                      <div style={{ fontSize: "11px", color: COLORS.muted, marginTop: "4px" }}>
                        {formatDate(order.created_at)}
                        {order.shipping_country ? ` \u00B7 ${order.shipping_country}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bids Tab */}
          {!loading && c && drawerTab === "bids" && (
            <div>
              {data?.bids.length === 0 ? (
                <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No bids yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {data?.bids.map((bid) => (
                    <div
                      key={bid.id}
                      style={{
                        padding: "10px 12px",
                        background: COLORS.bg,
                        borderRadius: "6px",
                        fontSize: "13px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "12px", color: COLORS.muted }}>
                          {bid.auction_title}{bid.lot_number ? ` \u00B7 Lot #${bid.lot_number}` : ""}
                        </div>
                        <div style={{ fontSize: "11px", color: COLORS.muted }}>{formatDate(bid.created_at)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 600, color: bid.is_winning ? COLORS.success : COLORS.text }}>
                          {formatPrice(bid.amount)}
                        </div>
                        <div style={{ fontSize: "11px", color: bid.is_winning ? COLORS.success : bid.is_outbid ? COLORS.error : COLORS.muted }}>
                          {bid.is_winning ? "Winning" : bid.is_outbid ? "Outbid" : "Active"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes Tab */}
          {!loading && c && drawerTab === "notes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Add note form */}
              <div>
                <textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Add an internal note..."
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    minHeight: "60px",
                    fontFamily: "inherit",
                    marginBottom: "8px",
                  }}
                />
                <button
                  onClick={submitNote}
                  disabled={noteSubmitting || !noteBody.trim()}
                  style={{
                    ...smallBtnStyle,
                    background: noteBody.trim() ? COLORS.gold : COLORS.bg,
                    color: noteBody.trim() ? COLORS.bg : COLORS.muted,
                    borderColor: noteBody.trim() ? COLORS.gold : COLORS.border,
                    fontWeight: 600,
                  }}
                >
                  {noteSubmitting ? "Saving..." : "Add Note"}
                </button>
              </div>

              {/* Notes list */}
              {notesLoading ? (
                <div style={{ color: COLORS.muted }}>Loading...</div>
              ) : notes.length === 0 ? (
                <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No internal notes yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      style={{
                        padding: "12px",
                        background: COLORS.bg,
                        borderRadius: "6px",
                        fontSize: "13px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <div>
                          <span style={{ fontWeight: 500, color: COLORS.text, fontSize: "12px" }}>{note.author_email}</span>
                          <span style={{ color: COLORS.muted, fontSize: "11px", marginLeft: "8px" }}>{formatDateTime(note.created_at)}</span>
                        </div>
                        <span
                          onClick={() => deleteNote(note.id)}
                          style={{ color: COLORS.muted, cursor: "pointer", fontSize: "11px" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.error)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.muted)}
                        >
                          Delete
                        </span>
                      </div>
                      <div style={{ color: COLORS.text, lineHeight: "1.5", whiteSpace: "pre-wrap" }}>{note.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Timeline Tab */}
          {!loading && c && drawerTab === "timeline" && (
            <div>
              {timelineLoading ? (
                <div style={{ color: COLORS.muted }}>Loading...</div>
              ) : timeline.length === 0 ? (
                <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No activity yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {timeline.map((event, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "10px 12px",
                        display: "flex",
                        gap: "10px",
                        alignItems: "flex-start",
                        borderLeft: `2px solid ${COLORS.border}`,
                        marginLeft: "8px",
                      }}
                    >
                      <span style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }}>
                        {TIMELINE_ICONS[event.type] || "\u2022"}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 500, color: COLORS.text }}>{event.title}</div>
                        {event.description && (
                          <div style={{ fontSize: "12px", color: COLORS.muted, marginTop: "2px" }}>{event.description}</div>
                        )}
                        <div style={{ fontSize: "11px", color: COLORS.muted, marginTop: "4px" }}>
                          {formatDateTime(event.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Customers List Tab ───────────────────────────────────────────────────────

function CustomersListTab({
  onSelectCustomer,
}: {
  onSelectCustomer: (id: string) => void
}) {
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [offset, setOffset] = useState(0)
  const [sort, setSort] = useState("created_at")
  const [order, setOrder] = useState("desc")
  const [recalcLoading, setRecalcLoading] = useState(false)
  const limit = 50
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRecalcStats = async () => {
    setRecalcLoading(true)
    try {
      const res = await fetch("/admin/customers/recalc-stats", { method: "POST", credentials: "include" })
      const data = await res.json()
      if (res.ok) {
        fetchCustomers(q, offset, sort, order)
      } else {
        alert("Recalc failed: " + (data.message || "Unknown error"))
      }
    } catch {
      alert("Recalc failed")
    } finally {
      setRecalcLoading(false)
    }
  }

  const fetchCustomers = useCallback((query: string, offsetVal: number, sortVal: string, orderVal: string) => {
    setLoading(true)
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      offset: String(offsetVal),
      sort: sortVal,
      order: orderVal,
    })
    fetch(`/admin/customers/list?${params}`, { credentials: "include", cache: "no-store" })
      .then((r) => {
        if (!r.ok) { setLoading(false); return }
        return r.json()
      })
      .then((d) => {
        if (!d) return
        setCustomers(d.customers || [])
        setTotal(d.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchCustomers(q, offset, sort, order)
  }, [fetchCustomers, offset, sort, order])

  // Silent background recalc on mount — keeps list stats fresh without requiring manual click
  useEffect(() => {
    fetch("/admin/customers/recalc-stats", { method: "POST", credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.ok) fetchCustomers(q, offset, sort, order)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch(value: string) {
    setQ(value)
    setOffset(0)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      fetchCustomers(value, 0, sort, order)
    }, 300)
  }

  function handleSort(col: string) {
    if (sort === col) {
      setOrder(order === "desc" ? "asc" : "desc")
    } else {
      setSort(col)
      setOrder("desc")
    }
    setOffset(0)
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${COLORS.border}`,
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  }

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "13px",
    color: COLORS.text,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: "middle",
  }

  const sortIndicator = (col: string) => sort === col ? (order === "desc" ? " \u2193" : " \u2191") : ""

  return (
    <div>
      {/* Search + Summary + Export */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px" }}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
          style={{
            flex: 1,
            maxWidth: "360px",
            padding: "8px 12px",
            borderRadius: "6px",
            border: `1px solid ${COLORS.border}`,
            background: COLORS.card,
            color: COLORS.text,
            fontSize: "14px",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "13px", color: COLORS.muted }}>
            {loading ? "Loading..." : `${total.toLocaleString("en-US")} customers`}
          </div>
          <button
            onClick={handleRecalcStats}
            disabled={recalcLoading}
            title="Recalculate bid/order counts from live data"
            style={{
              padding: "6px 12px",
              borderRadius: "5px",
              border: `1px solid ${COLORS.border}`,
              background: COLORS.card,
              color: recalcLoading ? COLORS.muted : COLORS.text,
              fontSize: "12px",
              fontWeight: 500,
              cursor: recalcLoading ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {recalcLoading ? "Recalculating…" : "↻ Recalc Stats"}
          </button>
          <button
            onClick={() => window.open("/admin/customers/export", "_blank")}
            style={{
              padding: "6px 12px",
              borderRadius: "5px",
              border: `1px solid ${COLORS.border}`,
              background: COLORS.card,
              color: COLORS.text,
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle} onClick={() => handleSort("created_at")}>
                Customer{sortIndicator("created_at")}
              </th>
              <th style={thStyle} onClick={() => handleSort("total_spent")}>
                Spent{sortIndicator("total_spent")}
              </th>
              <th style={thStyle} onClick={() => handleSort("total_purchases")}>
                Orders{sortIndicator("total_purchases")}
              </th>
              <th style={thStyle}>Bids</th>
              <th style={thStyle} onClick={() => handleSort("last_purchase_at")}>
                Last Order{sortIndicator("last_purchase_at")}
              </th>
              <th style={thStyle}>Tags</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: COLORS.muted, padding: "32px" }}>
                  Loading...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: COLORS.muted, padding: "32px" }}>
                  {q ? "No customers match your search." : "No customers yet."}
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onSelectCustomer(c.id)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}>
                          {c.name}
                          {c.is_vip && (
                            <span style={{ padding: "1px 5px", borderRadius: "3px", fontSize: "10px", fontWeight: 700, background: COLORS.gold + "20", color: COLORS.gold }}>
                              VIP
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: COLORS.muted, fontFamily: "monospace" }}>{c.email}</div>
                        <div style={{ fontSize: "11px", color: COLORS.muted }}>{formatDate(c.created_at)}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: COLORS.gold, fontWeight: 600 }}>
                    {formatPrice(c.total_spent)}
                  </td>
                  <td style={tdStyle}>{c.total_purchases}</td>
                  <td style={tdStyle}>
                    <span style={{ color: COLORS.text }}>{c.total_bids}</span>
                    {c.total_wins > 0 && (
                      <span style={{ color: COLORS.success, fontSize: "11px", marginLeft: "4px" }}>
                        ({c.total_wins}W)
                      </span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: "12px", color: COLORS.muted }}>
                    {formatDate(c.last_purchase_at)}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {c.is_dormant && (
                        <span style={{ padding: "1px 6px", borderRadius: "4px", fontSize: "10px", background: COLORS.muted + "20", color: COLORS.muted }}>
                          dormant
                        </span>
                      )}
                      {c.tags?.slice(0, 2).map((tag: string) => (
                        <span key={tag} style={{ padding: "1px 6px", borderRadius: "4px", fontSize: "10px", background: COLORS.blue + "20", color: COLORS.blue }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "16px" }}>
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            style={{
              padding: "6px 14px",
              borderRadius: "5px",
              border: `1px solid ${COLORS.border}`,
              background: COLORS.card,
              color: offset === 0 ? COLORS.muted : COLORS.text,
              cursor: offset === 0 ? "default" : "pointer",
              fontSize: "13px",
            }}
          >
            {"\u2190"} Previous
          </button>
          <span style={{ fontSize: "13px", color: COLORS.muted, padding: "6px 8px" }}>
            {offset + 1}{"\u2013"}{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            style={{
              padding: "6px 14px",
              borderRadius: "5px",
              border: `1px solid ${COLORS.border}`,
              background: COLORS.card,
              color: offset + limit >= total ? COLORS.muted : COLORS.text,
              cursor: offset + limit >= total ? "default" : "pointer",
              fontSize: "13px",
            }}
          >
            Next {"\u2192"}
          </button>
        </div>
      )}
    </div>
  )
}

// ── CRM Dashboard Tab ────────────────────────────────────────────────────────

function CRMDashboardTab() {
  const [data, setData] = useState<CRMData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/admin/customers", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const cardStyle: React.CSSProperties = {
    background: COLORS.card,
    borderRadius: "8px",
    padding: "20px",
    border: `1px solid ${COLORS.border}`,
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: "12px",
    fontWeight: 600,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: `1px solid ${COLORS.border}`,
    whiteSpace: "nowrap",
  }

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: "13px",
    color: COLORS.text,
    borderBottom: `1px solid ${COLORS.border}`,
    verticalAlign: "top",
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "4px",
  }

  const bigValueStyle: React.CSSProperties = {
    fontSize: "28px",
    fontWeight: 700,
    color: COLORS.gold,
  }

  if (loading) {
    return <div style={{ color: COLORS.muted }}>Loading CRM data...</div>
  }

  if (!data?.configured) {
    return (
      <div style={cardStyle}>
        <p style={{ color: COLORS.muted }}>
          Brevo is not configured. Set <code style={{ color: COLORS.gold }}>BREVO_API_KEY</code> in your environment to enable CRM features.
        </p>
      </div>
    )
  }

  const overview = data.overview!
  const segments = data.segments || {}
  const segmentEntries = Object.entries(segments).sort(([, a], [, b]) => b - a)
  const totalSegmented = segmentEntries.reduce((sum, [, count]) => sum + count, 0)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Overview Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px" }}>
        {[
          { label: "Total Contacts", value: overview.total_contacts.toLocaleString("en-US") },
          { label: "VOD Auctions", value: overview.vod_auctions.toLocaleString("en-US") },
          { label: "TAPE-MAG", value: overview.tape_mag.toLocaleString("en-US") },
          {
            label: "Newsletter Opt-ins",
            value: overview.newsletter_optins.toLocaleString("en-US"),
            color: COLORS.success,
          },
          { label: "Medusa Customers", value: overview.medusa_customers.toLocaleString("en-US") },
        ].map((card) => (
          <div key={card.label} style={cardStyle}>
            <div style={labelStyle}>{card.label}</div>
            <div style={{ ...bigValueStyle, color: card.color || COLORS.gold }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Segments + Recent */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "20px" }}>
        {/* Segment Distribution */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
            Customer Segments
          </h2>
          {segmentEntries.length === 0 ? (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No segment data yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {segmentEntries.map(([segment, count]) => {
                const pct = totalSegmented > 0 ? Math.round((count / totalSegmented) * 100) : 0
                const color = SEGMENT_COLORS[segment] || COLORS.muted
                return (
                  <div key={segment}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "13px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, display: "inline-block" }} />
                        <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{segment}</span>
                      </span>
                      <span style={{ color: COLORS.muted }}>{count} ({pct}%)</span>
                    </div>
                    <div style={{ height: "6px", borderRadius: "3px", background: COLORS.border, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "3px", transition: "width 0.3s" }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Contacts */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
            Recent CRM Contacts
          </h2>
          {!data.recent_contacts?.length ? (
            <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No contacts yet.</div>
          ) : (
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Platform</th>
                    <th style={thStyle}>Segment</th>
                    <th style={thStyle}>Newsletter</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_contacts.map((c) => (
                    <tr key={c.email} onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                      <td style={{ ...tdStyle, fontSize: "12px", fontFamily: "monospace" }}>{c.email}</td>
                      <td style={tdStyle}><PlatformBadge platform={c.platform} /></td>
                      <td style={tdStyle}><SegmentBadge segment={c.segment} /></td>
                      <td style={tdStyle}>
                        <span style={{ color: c.newsletter ? COLORS.success : COLORS.muted }}>
                          {c.newsletter ? "\u2713" : "\u2717"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Top Customers */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
          Top Customers by Spend
        </h2>
        {!data.top_customers?.length ? (
          <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No purchase data yet.</div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: "40px" }}>#</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Platform</th>
                  <th style={thStyle}>Segment</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Spent</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Purchases</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Bids</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Wins</th>
                </tr>
              </thead>
              <tbody>
                {data.top_customers.map((c, idx) => (
                  <tr key={c.email} onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ ...tdStyle, color: COLORS.muted, fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{c.name}</td>
                    <td style={{ ...tdStyle, fontSize: "12px", fontFamily: "monospace" }}>{c.email}</td>
                    <td style={tdStyle}><PlatformBadge platform={c.platform} /></td>
                    <td style={tdStyle}><SegmentBadge segment={c.segment} /></td>
                    <td style={{ ...tdStyle, textAlign: "right", color: COLORS.gold, fontWeight: 600 }}>{formatPrice(c.total_spent)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.total_purchases}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.total_bids}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.total_wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Campaign Performance */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px", color: COLORS.gold }}>
          Campaign Performance
          {data.total_campaigns ? (
            <span style={{ fontSize: "13px", fontWeight: 400, color: COLORS.muted, marginLeft: "8px" }}>
              ({data.total_campaigns} total)
            </span>
          ) : null}
        </h2>
        {!data.campaigns?.length ? (
          <div style={{ color: COLORS.muted, textAlign: "center", padding: "20px 0" }}>No campaigns sent yet.</div>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Campaign</th>
                  <th style={thStyle}>Date</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Sent</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Opens</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Open Rate</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Clicks</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Click Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr key={c.id} onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDateTime(c.sentDate)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.stats?.sent?.toLocaleString("en-US") || "\u2014"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.stats?.opens?.toLocaleString("en-US") || "\u2014"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: COLORS.gold }}>{c.stats?.openRate ? `${c.stats.openRate}%` : "\u2014"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{c.stats?.clicks?.toLocaleString("en-US") || "\u2014"}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: COLORS.gold }}>{c.stats?.clickRate ? `${c.stats.clickRate}%` : "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

const CustomersPage = () => {
  useAdminNav()
  const [activeTab, setActiveTab] = useState<"crm" | "customers">("customers")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    fontSize: "14px",
    fontWeight: active ? 600 : 400,
    color: active ? COLORS.gold : COLORS.muted,
    borderBottom: `2px solid ${active ? COLORS.gold : "transparent"}`,
    cursor: "pointer",
    background: "none",
    border: "none",
    borderBottomColor: active ? COLORS.gold : "transparent",
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
  })

  return (
    <div style={{ padding: "24px", background: COLORS.bg, minHeight: "100vh", color: COLORS.text }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700 }}>Customers</h1>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: `1px solid ${COLORS.border}`, marginBottom: "24px", display: "flex" }}>
        <button style={tabStyle(activeTab === "customers")} onClick={() => setActiveTab("customers")}>
          Customers
        </button>
        <button style={tabStyle(activeTab === "crm")} onClick={() => setActiveTab("crm")}>
          CRM Dashboard
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "customers" && (
        <CustomersListTab key={refreshKey} onSelectCustomer={setSelectedCustomerId} />
      )}
      {activeTab === "crm" && <CRMDashboardTab />}

      {/* Customer Detail Drawer */}
      <CustomerDetailDrawer
        customerId={selectedCustomerId}
        onClose={() => setSelectedCustomerId(null)}
        onCustomerChanged={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  )
}

function CustomersPageWithBoundary() {
  return <ErrorBoundary><CustomersPage /></ErrorBoundary>
}

export default CustomersPageWithBoundary
