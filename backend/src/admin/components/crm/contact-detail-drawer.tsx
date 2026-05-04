import { useEffect, useState, useCallback, useMemo } from "react"
import { C, S, T, fmtMoney, fmtNum, relativeTime } from "../admin-tokens"
import { Badge, Btn, EmptyState, inputStyle, selectStyle, Modal } from "../admin-ui"
import { ISO_COUNTRIES, flagFor, findCountry } from "../../data/country-iso"

// ── Types ──────────────────────────────────────────────────────────────────

type Master = {
  id: string
  display_name: string
  // Naming (S6.5)
  first_name: string | null
  last_name: string | null
  company: string | null
  salutation: string | null
  title: string | null
  // Classification
  contact_type: string | null
  primary_email: string | null
  primary_email_lower: string | null
  primary_phone: string | null
  primary_country_code: string | null
  primary_postal_code: string | null
  primary_city: string | null
  lifetime_revenue: number
  lifetime_revenue_decayed: number | null
  total_transactions: number
  first_seen_at: string | null
  last_seen_at: string | null
  medusa_customer_id: string | null
  tier: string | null
  tier_calculated_at: string | null
  // Lifecycle (S6.5)
  lifecycle_stage: string | null
  lifecycle_changed_at: string | null
  // RFM (S6.5)
  rfm_recency_score: number | null
  rfm_frequency_score: number | null
  rfm_monetary_score: number | null
  rfm_segment: string | null
  rfm_calculated_at: string | null
  // Health (S6.5)
  health_score: number | null
  health_calculated_at: string | null
  // Acquisition (S6.5)
  acquisition_channel: string | null
  acquisition_campaign: string | null
  acquisition_date: string | null
  // Profile (S6.5)
  preferred_language: string | null
  avatar_url: string | null
  birthday: string | null
  notable_dates: unknown
  // Status
  tags: string[]
  is_test: boolean
  is_blocked: boolean
  blocked_reason: string | null
  manually_merged: boolean
  manual_review_status: string | null
  created_at: string
  updated_at: string
}

type EmailRow = {
  id: string
  email: string
  email_lower: string
  is_primary: boolean
  is_verified: boolean
  source_count: number
  source_list: string[]
  opted_out_at: string | null
  bounced_at: string | null
  created_at: string
}

type AddressRow = {
  id: string
  type: string | null
  salutation: string | null
  company: string | null
  first_name: string | null
  last_name: string | null
  street: string | null
  street_2: string | null
  postal_code: string | null
  city: string | null
  region: string | null
  country: string | null
  country_code: string | null
  is_primary: boolean
  source_count: number
  source_list: string[]
}

type PhoneRow = {
  id: string
  phone_raw: string
  phone_normalized: string | null
  phone_type: string | null
  is_primary: boolean
  source_list: string[]
}

type SourceLink = {
  id: string
  source: string
  source_record_id: string
  match_method: string
  match_confidence: number
  match_evidence: Record<string, unknown> | null
  matched_at: string
}

type NoteRow = {
  id: string
  body: string
  pinned: boolean
  author_email: string
  created_at: string
  updated_at: string
}

type AuditRow = {
  id: string
  action: string
  details: Record<string, unknown> | null
  source: string | null
  admin_email: string | null
  created_at: string
}

type TaskRow = {
  id: string
  master_id: string
  title: string
  description: string | null
  due_at: string | null
  status: "open" | "done" | "cancelled"
  priority: "low" | "normal" | "high" | "urgent"
  reminder_at: string | null
  reminder_sent_at: string | null
  reminder_channel: string | null
  assigned_to: string | null
  completed_at: string | null
  completed_by: string | null
  created_by: string
  created_at: string
}

type TransactionItem = {
  position: number
  article_no: string | null
  article_name: string
  quantity: number | string
  unit: string | null
  unit_price: number | string | null
  line_total_gross: number | string | null
  line_total_net: number | string | null
  vat_rate: number | string | null
  is_shipping: boolean
  is_discount: boolean
}

type TransactionRow = {
  id: string
  source: string
  source_record_id: string
  doc_type: string
  doc_number: string | null
  doc_date: string
  delivery_date: string | null
  total_gross: number | string | null
  total_net: number | string | null
  total_tax: number | string | null
  shipping_cost: number | string | null
  currency: string | null
  status: string | null
  payment_method: string | null
  item_count: number | string
  items: TransactionItem[]
  billing_address_raw: string | null
  shipping_address_raw: string | null
}

type BidRow = {
  id: string
  amount: number
  is_winning: boolean
  is_outbid: boolean
  created_at: string
  lot_number: number | null
  auction_title: string | null
}

type OrderRow = {
  id: string
  order_number: string | null
  amount: number
  status: string
  fulfillment_status: string
  created_at: string
  lot_number: number | null
  auction_title: string | null
}

type ImapRow = {
  id: string
  account: string
  folder: string
  date_header: string
  from_email: string | null
  from_name: string | null
  to_emails: string[]
  subject: string | null
  body_excerpt: string | null
}

type CommPrefRow = {
  id: string
  channel: string
  opted_in: boolean
  opted_in_at: string | null
  opted_out_at: string | null
  source: string | null
  notes: string | null
}

type RelationshipRow = {
  id: string
  person_master_id: string
  company_master_id: string
  role: string | null
  is_primary: boolean
  started_at: string | null
  ended_at: string | null
  other_name: string | null
  other_type: string | null
}

type SavedItemRow = {
  id: string
  created_at: string
  release_id: string | null
  auction_block_id: string | null
  release_title: string | null
  release_cat: string | null
  block_title: string | null
  block_slug: string | null
}

type DetailData = {
  master: Master
  emails: EmailRow[]
  addresses: AddressRow[]
  phones: PhoneRow[]
  sources: SourceLink[]
  notes: NoteRow[]
  audit_log: AuditRow[]
  tasks: TaskRow[]
  transactions: TransactionRow[]
  bids: BidRow[]
  orders: OrderRow[]
  imap_messages: ImapRow[]
  communication_prefs?: CommPrefRow[]
  relationships_as_person?: RelationshipRow[]
  relationships_as_company?: RelationshipRow[]
  saved_items?: SavedItemRow[]
}

type DrawerTab =
  | "overview"
  | "activity"
  | "tasks"
  | "notes"
  | "contact"
  | "wishlist"
  | "communication"
  | "relationships"
  | "sources"
  | "audit"

// ── Display helpers ────────────────────────────────────────────────────────

const SOURCE_ABBR: Record<string, string> = {
  mo_pdf: "Monkey Office",
  vod_records_db1: "vod-records (db1)",
  vod_records_db2013: "vod-records (db2013)",
  vod_records_db2013_alt: "vod-records (alt)",
  vodtapes_members: "tape-mag.com",
  imap_vod_records: "IMAP vod-records",
  imap_vinyl_on_demand: "IMAP vinyl-on-demand",
  imap_match: "IMAP (matched)",
  manual: "Manual",
}

function tierBadge(tier: string | null) {
  if (!tier) return null
  const variantMap: Record<string, "purple" | "warning" | "neutral"> = {
    platinum: "purple",
    gold: "warning",
    silver: "neutral",
    bronze: "neutral",
    standard: "neutral",
    dormant: "neutral",
  }
  return <Badge label={tier} variant={variantMap[tier] || "neutral"} />
}

// Lifecycle-Badges nach Klaviyo
const LIFECYCLE_LABELS: Record<string, { label: string; variant: "success" | "info" | "warning" | "error" | "purple" | "neutral" }> = {
  lead:     { label: "lead",     variant: "info" },
  active:   { label: "active",   variant: "success" },
  engaged:  { label: "engaged",  variant: "purple" },
  at_risk:  { label: "at risk",  variant: "warning" },
  dormant:  { label: "dormant",  variant: "neutral" },
  churned:  { label: "churned",  variant: "neutral" },
  lost:     { label: "lost",     variant: "error" },
}

function lifecycleBadge(stage: string | null) {
  if (!stage) return null
  const cfg = LIFECYCLE_LABELS[stage]
  if (!cfg) return <Badge label={stage} variant="neutral" />
  return <Badge label={cfg.label} variant={cfg.variant} />
}

// RFM-Segment-Badges nach Klaviyo (Icon + Label + Color)
const RFM_LABELS: Record<string, { label: string; icon: string; variant: "success" | "info" | "warning" | "error" | "purple" | "neutral" }> = {
  champions:           { label: "Champions",            icon: "💎", variant: "purple" },
  loyal_customers:     { label: "Loyal",                icon: "💜", variant: "purple" },
  potential_loyalists: { label: "Potential Loyalist",   icon: "🌱", variant: "success" },
  new_customers:       { label: "New",                  icon: "🆕", variant: "info" },
  promising:           { label: "Promising",            icon: "⭐", variant: "info" },
  needs_attention:     { label: "Needs Attention",      icon: "👀", variant: "warning" },
  at_risk:             { label: "At Risk",              icon: "⚠️", variant: "warning" },
  cant_lose:           { label: "Can't Lose Them",      icon: "🚨", variant: "error" },
  hibernating:         { label: "Hibernating",          icon: "😴", variant: "neutral" },
  lost:                { label: "Lost",                 icon: "💤", variant: "neutral" },
}

function rfmBadge(seg: string | null) {
  if (!seg) return null
  const cfg = RFM_LABELS[seg]
  if (!cfg) return <Badge label={seg} variant="neutral" />
  return <Badge label={`${cfg.icon} ${cfg.label}`} variant={cfg.variant} />
}

function healthColor(score: number | null): string {
  if (score === null) return C.muted
  if (score >= 80) return C.success
  if (score >= 60) return C.gold
  if (score >= 40) return C.warning
  return C.error
}

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function fmtRev(v: number | string | null): string {
  if (v === null || v === undefined) return "—"
  const n = typeof v === "string" ? parseFloat(v) : v
  if (Number.isNaN(n)) return "—"
  return fmtMoney(n)
}

// ── Stat-Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: S.radius.md,
        padding: "12px 14px",
      }}
    >
      <div style={T.micro}>{label}</div>
      <div
        style={{
          ...T.body,
          fontWeight: 700,
          fontSize: 16,
          color: accent || C.text,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ── Drawer ─────────────────────────────────────────────────────────────────

export function ContactDetailDrawer({
  contactId,
  onClose,
}: {
  contactId: string | null
  onClose: () => void
}) {
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DrawerTab>("activity")  // Klaviyo-Pattern: Activity-Feed als Default
  const [editMaster, setEditMaster] = useState(false)

  const load = useCallback(() => {
    if (!contactId) return
    setLoading(true)
    fetch(`/admin/crm/contacts/${contactId}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [contactId])

  useEffect(() => {
    if (contactId) {
      setData(null)
      setError(null)
      setTab("activity")
      load()
    }
  }, [contactId, load])

  if (!contactId) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 100,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(960px, 92vw)",
          background: C.card,
          borderLeft: `1px solid ${C.border}`,
          zIndex: 101,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0, flex: 1, display: "flex", gap: 14, alignItems: "flex-start" }}>
            {/* Avatar (Initials oder URL) */}
            {data && (
              <Avatar master={data.master} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...T.micro, marginBottom: 4 }}>Master Contact</div>
              <div
                style={{
                  ...T.pageTitle,
                  fontSize: 20,
                  wordBreak: "break-word",
                  marginBottom: 4,
                }}
              >
                {data?.master.display_name || "Loading…"}
              </div>
              {data && (data.master.company || data.master.preferred_language) && (
                <div style={{ ...T.small, marginBottom: 8 }}>
                  {data.master.company && data.master.company !== data.master.display_name && (
                    <span>{data.master.company}</span>
                  )}
                  {data.master.contact_type && (
                    <span style={{ color: C.muted }}>
                      {data.master.company ? " · " : ""}{data.master.contact_type}
                    </span>
                  )}
                  {data.master.preferred_language && (
                    <span style={{ color: C.muted }}> · {data.master.preferred_language.toUpperCase()}</span>
                  )}
                </div>
              )}
              {data && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {tierBadge(data.master.tier)}
                  {rfmBadge(data.master.rfm_segment)}
                  {lifecycleBadge(data.master.lifecycle_stage)}
                  {data.master.is_test && <Badge label="test" variant="warning" />}
                  {data.master.is_blocked && <Badge label="blocked" variant="error" />}
                  {data.master.tags
                    .filter((t) => t !== "internal_owner")
                    .map((t) => (
                      <Badge key={t} label={t} variant="neutral" />
                    ))}
                  {data.master.tags.includes("internal_owner") && (
                    <Badge label="internal" variant="purple" />
                  )}
                  {data.master.medusa_customer_id && (
                    <Badge label="vod-auctions linked" variant="success" />
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {data && (
              <button
                onClick={() => setEditMaster(true)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  borderRadius: S.radius.md,
                  height: 32,
                  padding: "0 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  color: C.text,
                }}
              >
                ✎ Edit
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: `1px solid ${C.border}`,
                borderRadius: S.radius.md,
                width: 32,
                height: 32,
                cursor: "pointer",
                fontSize: 18,
                color: C.muted,
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Edit-Master Modal */}
        {data && editMaster && (
          <MasterEditModal
            master={data.master}
            onClose={() => setEditMaster(false)}
            onSaved={() => {
              setEditMaster(false)
              load()
            }}
          />
        )}

        {/* Tabs */}
        <div
          style={{
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            paddingLeft: 16,
            overflowX: "auto",
          }}
        >
          {(
            // Tab-Reihenfolge nach Marktstandard
            [
              { key: "overview" as DrawerTab, label: "Overview" },
              { key: "activity" as DrawerTab, label: "Activity" },
              { key: "tasks" as DrawerTab, label: "Tasks" },
              { key: "notes" as DrawerTab, label: "Notes" },
              { key: "contact" as DrawerTab, label: "Contact Info" },
              { key: "wishlist" as DrawerTab, label: "Wishlist" },
              { key: "communication" as DrawerTab, label: "Communication" },
              { key: "relationships" as DrawerTab, label: "Relationships" },
              { key: "sources" as DrawerTab, label: "Sources" },
              { key: "audit" as DrawerTab, label: "Audit" },
            ] as const
          ).map((t) => {
            // Counter for some tabs
            let counter: number | null = null
            if (data) {
              if (t.key === "activity") {
                counter = data.transactions.length + data.bids.length + data.orders.length + data.imap_messages.length
              } else if (t.key === "tasks") {
                counter = (data.tasks || []).filter((x) => x.status === "open").length
              } else if (t.key === "notes") {
                counter = (data.notes || []).length
              }
            }
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: tab === t.key ? 600 : 400,
                  color: tab === t.key ? C.gold : C.muted,
                  borderBottom: `2px solid ${tab === t.key ? C.gold : "transparent"}`,
                  background: "none",
                  border: "none",
                  borderBottomColor: tab === t.key ? C.gold : "transparent",
                  borderBottomWidth: 2,
                  borderBottomStyle: "solid",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
                {counter !== null && counter > 0 && (
                  <span style={{ marginLeft: 6, color: C.muted, fontSize: 11 }}>
                    ({fmtNum(counter)})
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {loading && !data && (
            <div style={{ color: C.muted, padding: 16 }}>Loading…</div>
          )}
          {error && (
            <div style={{ color: C.error, padding: 16 }}>
              <b>Error:</b> {error}
            </div>
          )}
          {data && tab === "overview" && <OverviewTab data={data} />}
          {data && tab === "activity" && <ActivityTab data={data} />}
          {data && tab === "tasks" && <TasksTab data={data} onChange={load} />}
          {data && tab === "notes" && (
            <NotesTab data={data} onChange={load} />
          )}
          {data && tab === "contact" && <ContactInfoTab data={data} onChange={load} />}
          {data && tab === "wishlist" && <WishlistTab data={data} />}
          {data && tab === "communication" && <CommunicationTab data={data} onChange={load} />}
          {data && tab === "relationships" && <RelationshipsTab data={data} onChange={load} />}
          {data && tab === "sources" && <SourcesTabContent data={data} />}
          {data && tab === "audit" && <AuditTab data={data} />}
        </div>
      </div>
    </>
  )
}

// ── Tab: Overview ──────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: DetailData }) {
  const m = data.master
  const aov = m.total_transactions > 0
    ? m.lifetime_revenue / m.total_transactions
    : 0
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        <StatCard
          label="Lifetime Revenue"
          value={fmtRev(m.lifetime_revenue)}
          accent={m.lifetime_revenue > 0 ? C.gold : C.muted}
        />
        <StatCard label="Transactions" value={fmtNum(m.total_transactions)} />
        <StatCard
          label="Avg order value"
          value={aov > 0 ? fmtRev(aov) : "—"}
        />
        <StatCard
          label="Health score"
          value={m.health_score !== null ? `${m.health_score}/100` : "—"}
          accent={healthColor(m.health_score)}
        />
        <StatCard
          label="First seen"
          value={m.first_seen_at ? new Date(m.first_seen_at).toLocaleDateString("en-GB", { year: "numeric", month: "short" }) : "—"}
        />
        <StatCard
          label="Last seen"
          value={m.last_seen_at ? relativeTime(m.last_seen_at) : "—"}
        />
        <StatCard label="Sources" value={String(data.sources.length)} />
        <StatCard label="Activity events" value={fmtNum(
          data.transactions.length + data.bids.length + data.orders.length + data.imap_messages.length
        )} />
      </div>

      {/* RFM-Scores Mini-Visual */}
      {m.rfm_segment && (
        <RfmCard master={m} />
      )}

      {/* Profile (S6.5: structured names + acquisition + birthday + language) */}
      <div>
        <div style={T.sectionHead}>Profile</div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: S.radius.md,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontSize: 13,
          }}
        >
          <KV label="Salutation" value={[m.salutation, m.title].filter(Boolean).join(" ") || "—"} />
          <KV label="First name" value={m.first_name || "—"} />
          <KV label="Last name" value={m.last_name || "—"} />
          <KV label="Company" value={m.company || "—"} />
          <KV label="Language" value={m.preferred_language || "—"} />
          <KV
            label="Birthday"
            value={m.birthday ? new Date(m.birthday).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—"}
          />
          <KV
            label="Acquired"
            value={m.acquisition_channel
              ? `${m.acquisition_channel}${m.acquisition_date ? ` · ${new Date(m.acquisition_date).toLocaleDateString("en-GB", { year: "numeric", month: "short" })}` : ""}`
              : "—"}
          />
        </div>
      </div>

      {/* Primary Contact */}
      <div>
        <div style={T.sectionHead}>Primary Contact</div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: S.radius.md,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontSize: 13,
          }}
        >
          <KV label="Email" value={m.primary_email || "—"} />
          <KV label="Phone" value={m.primary_phone || "—"} />
          <KV
            label="City"
            value={
              [m.primary_postal_code, m.primary_city, m.primary_country_code]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
          {m.medusa_customer_id && (
            <KV label="vod-auctions ID" value={m.medusa_customer_id} mono />
          )}
        </div>
      </div>

      {/* Tags */}
      {m.tags.length > 0 && (
        <div>
          <div style={T.sectionHead}>Tags</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {m.tags.map((t) => (
              <Badge key={t} label={t} variant="neutral" />
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      {(m.is_blocked || m.manual_review_status) && (
        <div>
          <div style={T.sectionHead}>Status</div>
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: S.radius.md,
              padding: 14,
              fontSize: 13,
            }}
          >
            {m.is_blocked && (
              <div style={{ color: C.error, marginBottom: 4 }}>
                <b>Blocked:</b> {m.blocked_reason || "(no reason given)"}
              </div>
            )}
            {m.manual_review_status && (
              <div>
                <b>Manual review status:</b> {m.manual_review_status}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
      <div style={{ ...T.small, fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: mono ? "monospace" : undefined, color: value === "—" ? C.muted : C.text }}>
        {value}
      </div>
    </div>
  )
}

// ── Tab: Contact Info ──────────────────────────────────────────────────────

function ContactInfoTab({ data, onChange }: { data: DetailData; onChange: () => void }) {
  const masterId = data.master.id
  const [emailAdd, setEmailAdd] = useState(false)
  const [addressAdd, setAddressAdd] = useState(false)
  const [addressEdit, setAddressEdit] = useState<AddressRow | null>(null)
  const [phoneAdd, setPhoneAdd] = useState(false)

  const setEmailPrimary = async (emailId: string) => {
    await fetch(`/admin/crm/contacts/${masterId}/emails/${emailId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_primary: true }),
    })
    onChange()
  }
  const deleteEmail = async (emailId: string) => {
    if (!confirm("Delete this email?")) return
    await fetch(`/admin/crm/contacts/${masterId}/emails/${emailId}`, {
      method: "DELETE", credentials: "include",
    })
    onChange()
  }
  const setAddressPrimary = async (addressId: string) => {
    await fetch(`/admin/crm/contacts/${masterId}/addresses/${addressId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_primary: true }),
    })
    onChange()
  }
  const deleteAddress = async (addressId: string) => {
    if (!confirm("Delete this address?")) return
    await fetch(`/admin/crm/contacts/${masterId}/addresses/${addressId}`, {
      method: "DELETE", credentials: "include",
    })
    onChange()
  }
  const setPhonePrimary = async (phoneId: string) => {
    await fetch(`/admin/crm/contacts/${masterId}/phones/${phoneId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_primary: true }),
    })
    onChange()
  }
  const deletePhone = async (phoneId: string) => {
    if (!confirm("Delete this phone?")) return
    await fetch(`/admin/crm/contacts/${masterId}/phones/${phoneId}`, {
      method: "DELETE", credentials: "include",
    })
    onChange()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Emails */}
      <SectionWithAdd
        title={`Emails (${data.emails.length})`}
        onAdd={() => setEmailAdd(true)}
      >
        {data.emails.length === 0 ? (
          <EmptyState title="No emails on file" />
        ) : (
          data.emails.map((e) => (
            <Card key={e.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 500, wordBreak: "break-all" }}>{e.email}</div>
                  <div style={{ ...T.small, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(e.source_list || []).map((s) => (
                      <span key={s} style={pillStyle()}>
                        {SOURCE_ABBR[s] || s}
                      </span>
                    ))}
                    {e.opted_out_at && <Badge label="opted out" variant="warning" />}
                    {e.bounced_at && <Badge label="bounced" variant="error" />}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {e.is_primary ? (
                    <Badge label="primary" variant="success" />
                  ) : (
                    <button onClick={() => setEmailPrimary(e.id)} style={iconBtnStyle()} title="Set primary">⭐</button>
                  )}
                  {e.is_verified && <Badge label="verified" variant="info" />}
                  <button onClick={() => deleteEmail(e.id)} style={iconBtnStyle()} title="Delete">×</button>
                </div>
              </div>
            </Card>
          ))
        )}
      </SectionWithAdd>

      {/* Addresses */}
      <SectionWithAdd
        title={`Addresses (${data.addresses.length})`}
        onAdd={() => setAddressAdd(true)}
      >
        {data.addresses.length === 0 ? (
          <EmptyState title="No addresses on file" />
        ) : (
          data.addresses.map((a) => (
            <Card key={a.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                <div style={{ ...T.micro }}>{(a.type || "address").toUpperCase()}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {a.is_primary ? (
                    <Badge label="primary" variant="success" />
                  ) : (
                    <button onClick={() => setAddressPrimary(a.id)} style={iconBtnStyle()} title="Set primary">⭐</button>
                  )}
                  <button onClick={() => setAddressEdit(a)} style={iconBtnStyle()} title="Edit">✎</button>
                  <button onClick={() => deleteAddress(a.id)} style={iconBtnStyle()} title="Delete">×</button>
                </div>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                {a.salutation && <div>{a.salutation}</div>}
                {(a.first_name || a.last_name) && (
                  <div>{[a.first_name, a.last_name].filter(Boolean).join(" ")}</div>
                )}
                {a.company && <div style={{ fontWeight: 500 }}>{a.company}</div>}
                {a.street && <div>{a.street}</div>}
                {a.street_2 && <div>{a.street_2}</div>}
                {(a.postal_code || a.city) && (
                  <div>{[a.postal_code, a.city].filter(Boolean).join(" ")}</div>
                )}
                {(a.region || a.country || a.country_code) && (
                  <div style={{ color: C.muted }}>
                    {[a.region, a.country || a.country_code].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
              <div style={{ ...T.small, marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(a.source_list || []).map((s) => (
                  <span key={s} style={pillStyle()}>
                    {SOURCE_ABBR[s] || s}
                  </span>
                ))}
              </div>
            </Card>
          ))
        )}
      </SectionWithAdd>

      {/* Phones */}
      <SectionWithAdd
        title={`Phones (${data.phones.length})`}
        onAdd={() => setPhoneAdd(true)}
      >
        {data.phones.length === 0 ? (
          <EmptyState title="No phones on file" />
        ) : (
          data.phones.map((p) => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.phone_normalized || p.phone_raw}</div>
                  {p.phone_type && <div style={T.small}>{p.phone_type}</div>}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {p.is_primary ? (
                    <Badge label="primary" variant="success" />
                  ) : (
                    <button onClick={() => setPhonePrimary(p.id)} style={iconBtnStyle()} title="Set primary">⭐</button>
                  )}
                  <button onClick={() => deletePhone(p.id)} style={iconBtnStyle()} title="Delete">×</button>
                </div>
              </div>
              <div style={{ ...T.small, marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(p.source_list || []).map((s) => (
                  <span key={s} style={pillStyle()}>
                    {SOURCE_ABBR[s] || s}
                  </span>
                ))}
              </div>
            </Card>
          ))
        )}
      </SectionWithAdd>

      {/* Modals */}
      {emailAdd && (
        <EmailAddModal
          masterId={masterId}
          onClose={() => setEmailAdd(false)}
          onSaved={() => { setEmailAdd(false); onChange() }}
        />
      )}
      {addressAdd && (
        <AddressEditModal
          masterId={masterId}
          address={null}
          onClose={() => setAddressAdd(false)}
          onSaved={() => { setAddressAdd(false); onChange() }}
        />
      )}
      {addressEdit && (
        <AddressEditModal
          masterId={masterId}
          address={addressEdit}
          onClose={() => setAddressEdit(null)}
          onSaved={() => { setAddressEdit(null); onChange() }}
        />
      )}
      {phoneAdd && (
        <PhoneAddModal
          masterId={masterId}
          onClose={() => setPhoneAdd(false)}
          onSaved={() => { setPhoneAdd(false); onChange() }}
        />
      )}
    </div>
  )
}

function SectionWithAdd({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={T.sectionHead}>{title}</div>
        <button onClick={onAdd} style={{
          background: "transparent",
          border: `1px solid ${C.border}`,
          borderRadius: S.radius.md,
          padding: "4px 12px",
          fontSize: 12,
          color: C.text,
          cursor: "pointer",
        }}>+ Add</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  )
}

// ── Tab: Activity (Timeline) ───────────────────────────────────────────────

type TimelineEvent =
  | { kind: "transaction"; date: string; data: TransactionRow }
  | { kind: "bid"; date: string; data: BidRow }
  | { kind: "order"; date: string; data: OrderRow }
  | { kind: "imap"; date: string; data: ImapRow }

function buildTimeline(d: DetailData): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const t of d.transactions) {
    events.push({ kind: "transaction", date: t.doc_date, data: t })
  }
  for (const b of d.bids) {
    events.push({ kind: "bid", date: b.created_at, data: b })
  }
  for (const o of d.orders) {
    events.push({ kind: "order", date: o.created_at, data: o })
  }
  for (const m of d.imap_messages) {
    events.push({ kind: "imap", date: m.date_header, data: m })
  }
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return events
}

function ActivityTab({ data }: { data: DetailData }) {
  const events = buildTimeline(data)
  const [expandedTxns, setExpandedTxns] = useState<Set<string>>(new Set())
  const [expandedMails, setExpandedMails] = useState<Set<string>>(new Set())

  const toggleTxn = (id: string) => {
    setExpandedTxns((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleMail = (id: string) => {
    setExpandedMails((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (events.length === 0) {
    return <EmptyState title="No activity yet" description="No transactions, bids, orders, or matched emails." />
  }

  return (
    <div style={{ position: "relative", paddingLeft: 24 }}>
      {/* Vertical line */}
      <div
        style={{
          position: "absolute",
          left: 7,
          top: 8,
          bottom: 8,
          width: 1,
          background: C.border,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {events.map((e, i) => (
          <TimelineRow
            key={i}
            event={e}
            expanded={
              e.kind === "transaction" ? expandedTxns.has((e.data as TransactionRow).id)
              : e.kind === "imap" ? expandedMails.has((e.data as ImapRow).id)
              : false
            }
            onToggle={
              e.kind === "transaction" ? () => toggleTxn((e.data as TransactionRow).id)
              : e.kind === "imap" ? () => toggleMail((e.data as ImapRow).id)
              : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}

function TimelineRow({
  event,
  expanded,
  onToggle,
}: {
  event: TimelineEvent
  expanded: boolean
  onToggle?: () => void
}) {
  const dotColor =
    event.kind === "transaction" ? C.gold
    : event.kind === "bid" ? C.blue
    : event.kind === "order" ? C.success
    : C.muted

  const isExpandable = onToggle !== undefined

  return (
    <div style={{ position: "relative" }}>
      {/* Dot */}
      <div
        style={{
          position: "absolute",
          left: -24,
          top: 6,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: C.card,
          border: `2px solid ${dotColor}`,
        }}
      />
      <div
        onClick={isExpandable ? onToggle : undefined}
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: S.radius.md,
          padding: "10px 14px",
          cursor: isExpandable ? "pointer" : "default",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {isExpandable && (
              <span style={{ fontSize: 10, color: C.muted, width: 10 }}>{expanded ? "▼" : "▶"}</span>
            )}
            {event.kind === "transaction" && (
              <Badge label={`${(event.data as TransactionRow).doc_type}`} variant="warning" />
            )}
            {event.kind === "bid" && <Badge label="bid" variant="info" />}
            {event.kind === "order" && <Badge label="order" variant="success" />}
            {event.kind === "imap" && <Badge label="email" variant="neutral" />}
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {renderEventTitle(event)}
            </span>
          </div>
          <div style={T.small}>{relativeTime(event.date)}</div>
        </div>
        <div style={{ ...T.small, fontSize: 12 }}>{renderEventSubtitle(event)}</div>

        {/* Expanded content */}
        {expanded && event.kind === "transaction" && (
          <TransactionItems transaction={event.data as TransactionRow} />
        )}
        {expanded && event.kind === "imap" && (
          <ImapBody mail={event.data as ImapRow} />
        )}
      </div>
    </div>
  )
}

function TransactionItems({ transaction }: { transaction: TransactionRow }) {
  const items = transaction.items || []
  const productItems = items.filter((i) => !i.is_shipping && !i.is_discount)
  const otherItems = items.filter((i) => i.is_shipping || i.is_discount)

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: `1px solid ${C.border}`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Totals row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: 8,
          marginBottom: 10,
          fontSize: 12,
        }}
      >
        <TotalCell label="Net" value={fmtRev(transaction.total_net)} />
        <TotalCell label="Tax" value={fmtRev(transaction.total_tax)} />
        <TotalCell label="Shipping" value={fmtRev(transaction.shipping_cost)} />
        <TotalCell label="Gross" value={fmtRev(transaction.total_gross)} accent={C.gold} />
        {transaction.payment_method && (
          <TotalCell label="Payment" value={transaction.payment_method} />
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ ...T.small, fontStyle: "italic" }}>No line items recorded.</div>
      ) : (
        <>
          {productItems.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.subtle }}>
                  <th style={itemThStyle}>#</th>
                  <th style={itemThStyle}>Article</th>
                  <th style={{ ...itemThStyle, textAlign: "right" }}>Qty</th>
                  <th style={{ ...itemThStyle, textAlign: "right" }}>Unit</th>
                  <th style={{ ...itemThStyle, textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {productItems.map((it) => (
                  <tr key={it.position} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ ...itemTdStyle, color: C.muted, width: 28 }}>{it.position}</td>
                    <td style={itemTdStyle}>
                      <div>{it.article_name}</div>
                      {it.article_no && (
                        <div style={{ ...T.small, fontSize: 10, fontFamily: "monospace" }}>
                          {it.article_no}
                        </div>
                      )}
                    </td>
                    <td style={{ ...itemTdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmtQty(it.quantity)}
                      {it.unit && <span style={{ color: C.muted }}> {it.unit}</span>}
                    </td>
                    <td style={{ ...itemTdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {fmtRev(it.unit_price)}
                    </td>
                    <td style={{ ...itemTdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                      {fmtRev(it.line_total_gross)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {otherItems.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {otherItems.map((it) => (
                <div
                  key={it.position}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 0",
                    borderTop: `1px solid ${C.border}`,
                    color: C.muted,
                  }}
                >
                  <span>
                    {it.is_shipping ? "📦" : it.is_discount ? "🎫" : "•"} {it.article_name}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtRev(it.line_total_gross)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {transaction.billing_address_raw && (
        <details style={{ marginTop: 10, fontSize: 11 }}>
          <summary style={{ cursor: "pointer", color: C.muted }}>Billing address</summary>
          <pre
            style={{
              marginTop: 4,
              fontFamily: "monospace",
              fontSize: 11,
              whiteSpace: "pre-wrap",
              background: C.subtle,
              padding: 6,
              borderRadius: S.radius.sm,
            }}
          >
            {transaction.billing_address_raw}
          </pre>
        </details>
      )}
    </div>
  )
}

function ImapBody({ mail }: { mail: ImapRow }) {
  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: `1px solid ${C.border}`,
        fontSize: 12,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 6, marginBottom: 6 }}>
        <span style={{ ...T.small, fontWeight: 500 }}>From</span>
        <span>{mail.from_name ? `${mail.from_name} <${mail.from_email}>` : mail.from_email}</span>
        <span style={{ ...T.small, fontWeight: 500 }}>To</span>
        <span>{(mail.to_emails || []).join(", ")}</span>
        <span style={{ ...T.small, fontWeight: 500 }}>Folder</span>
        <span>{mail.folder}</span>
      </div>
      {mail.body_excerpt && (
        <pre
          style={{
            fontFamily: "inherit",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            background: C.subtle,
            padding: 8,
            borderRadius: S.radius.sm,
            marginTop: 6,
            marginBottom: 0,
            maxHeight: 240,
            overflow: "auto",
          }}
        >
          {mail.body_excerpt}
        </pre>
      )}
    </div>
  )
}

function TotalCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={T.micro}>{label}</div>
      <div style={{ fontWeight: 600, color: accent || C.text, marginTop: 1 }}>{value}</div>
    </div>
  )
}

function fmtQty(v: number | string): string {
  const n = typeof v === "string" ? parseFloat(v) : v
  if (Number.isNaN(n)) return String(v)
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

const itemThStyle: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: C.muted,
}

const itemTdStyle: React.CSSProperties = {
  padding: "6px 8px",
  verticalAlign: "top",
}

function renderEventTitle(e: TimelineEvent): string {
  if (e.kind === "transaction") {
    const t = e.data as TransactionRow
    const amount = fmtRev(t.total_gross)
    return `${t.doc_number || t.source_record_id} · ${amount}`
  }
  if (e.kind === "bid") {
    const b = e.data as BidRow
    return `${fmtMoney(Number(b.amount))} on ${b.auction_title || `block ${b.lot_number || "—"}`}`
  }
  if (e.kind === "order") {
    const o = e.data as OrderRow
    return `${o.order_number || "(unnumbered)"} · ${fmtMoney(Number(o.amount))}`
  }
  const m = e.data as ImapRow
  return m.subject || "(no subject)"
}

function renderEventSubtitle(e: TimelineEvent): string {
  if (e.kind === "transaction") {
    const t = e.data as TransactionRow
    return `${SOURCE_ABBR[t.source] || t.source} · ${t.item_count} items · ${t.status || "—"}`
  }
  if (e.kind === "bid") {
    const b = e.data as BidRow
    return `${b.is_winning ? "Winning" : b.is_outbid ? "Outbid" : "Active"} · lot ${b.lot_number || "—"}`
  }
  if (e.kind === "order") {
    const o = e.data as OrderRow
    return `${o.status} · ${o.fulfillment_status} · lot ${o.lot_number || "—"}`
  }
  const m = e.data as ImapRow
  return `${m.from_name || m.from_email || "(no from)"} · ${m.account} · ${m.folder}`
}

// ── Tab: Tasks ─────────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<string, { icon: string; color: string }> = {
  urgent: { icon: "🚨", color: C.error },
  high:   { icon: "🔴", color: C.warning },
  normal: { icon: "•",  color: C.muted },
  low:    { icon: "·",  color: C.muted },
}

function TasksTab({ data, onChange }: { data: DetailData; onChange: () => void }) {
  const masterId = data.master.id
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<TaskRow | null>(null)
  const [showDone, setShowDone] = useState(false)

  const tasks = data.tasks || []
  const open = tasks.filter((t) => t.status === "open")
  const done = tasks.filter((t) => t.status !== "open")

  const toggleDone = async (task: TaskRow) => {
    try {
      const r = await fetch(`/admin/crm/contacts/${masterId}/tasks/${task.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: task.status === "done" ? "open" : "done" }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onChange()
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const remove = async (task: TaskRow) => {
    if (!confirm(`Delete task "${task.title}"?`)) return
    await fetch(`/admin/crm/contacts/${masterId}/tasks/${task.id}`, {
      method: "DELETE", credentials: "include",
    })
    onChange()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header with Add button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={T.sectionHead}>
          {open.length} open · {done.length} done
        </div>
        <Btn label="+ Add task" variant="gold" onClick={() => setShowAdd(true)} />
      </div>

      {/* Open tasks */}
      {open.length === 0 ? (
        <EmptyState title="No open tasks" description="All caught up!" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {open.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onToggle={() => toggleDone(t)}
              onEdit={() => setEditing(t)}
              onDelete={() => remove(t)}
            />
          ))}
        </div>
      )}

      {/* Done section (collapsible) */}
      {done.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowDone(!showDone)}
            style={{
              background: "transparent",
              border: "none",
              color: C.muted,
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              cursor: "pointer",
              padding: "4px 0",
            }}
          >
            {showDone ? "▼" : "▶"} Done & Cancelled ({done.length})
          </button>
          {showDone && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {done.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onToggle={() => toggleDone(t)}
                  onEdit={() => setEditing(t)}
                  onDelete={() => remove(t)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <TaskEditModal
          masterId={masterId}
          task={null}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onChange() }}
        />
      )}
      {editing && (
        <TaskEditModal
          masterId={masterId}
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChange() }}
        />
      )}
    </div>
  )
}

function TaskCard({ task, onToggle, onEdit, onDelete }: {
  task: TaskRow
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isDone = task.status === "done"
  const isCancelled = task.status === "cancelled"
  const overdue = !isDone && !isCancelled && task.due_at && new Date(task.due_at) < new Date()
  const prio = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.normal

  return (
    <Card>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <button
          onClick={onToggle}
          style={{
            width: 20, height: 20, marginTop: 2,
            border: `1.5px solid ${isDone ? C.success : C.border}`,
            background: isDone ? C.success : "transparent",
            borderRadius: 4,
            cursor: "pointer",
            color: "#fff",
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          title={isDone ? "Re-open" : "Mark done"}
        >
          {isDone ? "✓" : ""}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start"
          }}>
            <div style={{
              fontWeight: 500, fontSize: 13,
              textDecoration: isDone || isCancelled ? "line-through" : "none",
              color: isDone || isCancelled ? C.muted : C.text,
              flex: 1,
              minWidth: 0,
              wordBreak: "break-word",
            }}>
              {task.priority !== "normal" && task.priority !== "low" && (
                <span style={{ marginRight: 6, color: prio.color }}>{prio.icon}</span>
              )}
              {task.title}
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button onClick={onEdit} style={iconBtnStyle()} title="Edit">✎</button>
              <button onClick={onDelete} style={iconBtnStyle()} title="Delete">×</button>
            </div>
          </div>
          {task.description && (
            <div style={{ ...T.small, marginTop: 4, whiteSpace: "pre-wrap" }}>{task.description}</div>
          )}
          <div style={{
            ...T.small, marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center"
          }}>
            {task.due_at && (
              <span style={{ color: overdue ? C.error : C.muted, fontWeight: overdue ? 500 : 400 }}>
                📅 {overdue ? "Overdue · " : ""}{new Date(task.due_at).toLocaleString("en-GB", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            )}
            {task.assigned_to && (
              <span style={{ color: C.muted }}>👤 {task.assigned_to}</span>
            )}
            {task.reminder_at && !task.reminder_sent_at && (
              <span style={{ color: C.muted }}>
                ⏰ {new Date(task.reminder_at).toLocaleString("en-GB", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            )}
            {task.reminder_sent_at && (
              <span style={{ color: C.muted, fontStyle: "italic" }}>reminder sent</span>
            )}
            {isCancelled && <Badge label="cancelled" variant="neutral" />}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── Task Edit/Add Modal ────────────────────────────────────────────────────

const PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"] as const

function TaskEditModal({
  masterId,
  task,
  onClose,
  onSaved,
}: {
  masterId: string
  task: TaskRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = task !== null
  const [title, setTitle] = useState(task?.title || "")
  const [description, setDescription] = useState(task?.description || "")
  const [dueAt, setDueAt] = useState(task?.due_at ? task.due_at.slice(0, 16) : "")
  const [priority, setPriority] = useState(task?.priority || "normal")
  const [reminderAt, setReminderAt] = useState(task?.reminder_at ? task.reminder_at.slice(0, 16) : "")
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to || "")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!title.trim()) {
      setErr("Title required")
      return
    }
    setSaving(true)
    setErr(null)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        priority,
        reminder_at: reminderAt ? new Date(reminderAt).toISOString() : null,
        assigned_to: assignedTo.trim() || null,
      }
      const url = isEdit
        ? `/admin/crm/contacts/${masterId}/tasks/${task!.id}`
        : `/admin/crm/contacts/${masterId}/tasks`
      const r = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? "Edit task" : "Add task"}
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          <Btn label="Cancel" variant="ghost" onClick={onClose} />
          <Btn label={saving ? "Saving…" : "Save"} variant="gold" onClick={save} disabled={saving || !title.trim()} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {err && <div style={{ color: C.error, fontSize: 12 }}><b>Error:</b> {err}</div>}
        <div style={inputRow}>
          <label style={inputLabel}>Title</label>
          <input style={fullInput} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div style={inputRow}>
          <label style={inputLabel}>Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...fullInput, minHeight: 64, padding: 10, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
          <div style={inputRow}>
            <label style={inputLabel}>Due date</label>
            <input style={fullInput} type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div style={inputRow}>
            <label style={inputLabel}>Priority</label>
            <select style={selectStyle} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={inputRow}>
          <label style={inputLabel}>Reminder (optional)</label>
          <input style={fullInput} type="datetime-local" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} />
        </div>
        <div style={inputRow}>
          <label style={inputLabel}>Assigned to (email)</label>
          <input style={fullInput} type="email" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="default: current admin" />
        </div>
      </div>
    </Modal>
  )
}

// ── Tab: Notes ─────────────────────────────────────────────────────────────

function NotesTab({ data, onChange }: { data: DetailData; onChange: () => void }) {
  const [newBody, setNewBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState("")

  const submit = async () => {
    if (!newBody.trim()) return
    setSubmitting(true)
    try {
      const r = await fetch(`/admin/crm/contacts/${data.master.id}/notes`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: newBody }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setNewBody("")
      onChange()
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const togglePinned = async (note: NoteRow) => {
    try {
      const r = await fetch(
        `/admin/crm/contacts/${data.master.id}/notes/${note.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pinned: !note.pinned }),
        }
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onChange()
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const saveEdit = async (note: NoteRow) => {
    if (!editingBody.trim()) return
    try {
      const r = await fetch(
        `/admin/crm/contacts/${data.master.id}/notes/${note.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: editingBody }),
        }
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setEditingId(null)
      setEditingBody("")
      onChange()
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const remove = async (note: NoteRow) => {
    if (!confirm("Delete this note?")) return
    try {
      const r = await fetch(
        `/admin/crm/contacts/${data.master.id}/notes/${note.id}`,
        { method: "DELETE", credentials: "include" }
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onChange()
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Add new */}
      <Card>
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Add a note (visible to admins only)…"
          style={{
            ...inputStyle,
            width: "100%",
            minHeight: 80,
            padding: 10,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <Btn label={submitting ? "Saving…" : "Add note"} variant="gold" onClick={submit} disabled={submitting || !newBody.trim()} />
        </div>
      </Card>

      {/* Existing notes */}
      {data.notes.length === 0 ? (
        <EmptyState title="No notes yet" description="Notes are visible only to admins." />
      ) : (
        data.notes.map((n) => (
          <Card key={n.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
              <div style={T.small}>
                {n.author_email} · {relativeTime(n.created_at)}
                {n.pinned && (
                  <span style={{ marginLeft: 8 }}>
                    <Badge label="📌 pinned" variant="warning" />
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => togglePinned(n)}
                  style={iconBtnStyle()}
                  title={n.pinned ? "Unpin" : "Pin"}
                >
                  📌
                </button>
                <button
                  onClick={() => {
                    setEditingId(n.id)
                    setEditingBody(n.body)
                  }}
                  style={iconBtnStyle()}
                  title="Edit"
                >
                  ✎
                </button>
                <button onClick={() => remove(n)} style={iconBtnStyle()} title="Delete">
                  ×
                </button>
              </div>
            </div>
            {editingId === n.id ? (
              <>
                <textarea
                  value={editingBody}
                  onChange={(e) => setEditingBody(e.target.value)}
                  style={{
                    ...inputStyle,
                    width: "100%",
                    minHeight: 80,
                    padding: 10,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
                <div style={{ marginTop: 6, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <Btn label="Cancel" variant="ghost" onClick={() => setEditingId(null)} />
                  <Btn label="Save" variant="gold" onClick={() => saveEdit(n)} />
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{n.body}</div>
            )}
          </Card>
        ))
      )}
    </div>
  )
}

// ── Tab: Sources ───────────────────────────────────────────────────────────

function SourcesTabContent({ data }: { data: DetailData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={T.sectionHead}>Source Links ({data.sources.length})</div>
      {data.sources.length === 0 ? (
        <EmptyState title="No source links" />
      ) : (
        data.sources.map((s) => (
          <Card key={s.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
              <div style={{ fontWeight: 500 }}>
                {SOURCE_ABBR[s.source] || s.source}
                <span style={{ ...T.small, marginLeft: 8 }}>{s.source_record_id}</span>
              </div>
              <div style={T.small}>
                conf {(Number(s.match_confidence) * 100).toFixed(0)}% · {s.match_method}
              </div>
            </div>
            {s.match_evidence && (
              <pre
                style={{
                  ...T.small,
                  fontSize: 11,
                  background: C.subtle,
                  borderRadius: S.radius.sm,
                  padding: 8,
                  marginTop: 6,
                  marginBottom: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "monospace",
                }}
              >
                {JSON.stringify(s.match_evidence, null, 2)}
              </pre>
            )}
            <div style={{ ...T.small, marginTop: 6, fontSize: 11 }}>
              matched {relativeTime(s.matched_at)}
            </div>
          </Card>
        ))
      )}
    </div>
  )
}

// ── Tab: Wishlist (S7.1) ───────────────────────────────────────────────────

function WishlistTab({ data }: { data: DetailData }) {
  const items = data.saved_items || []

  if (!data.master.medusa_customer_id) {
    return <EmptyState title="Not linked to vod-auctions" description="Wishlist requires a linked Medusa customer." />
  }
  if (items.length === 0) {
    return <EmptyState title="No wishlist items" description="Customer hasn't saved any items yet." />
  }

  return (
    <div>
      <div style={T.sectionHead}>Saved items ({items.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it) => (
          <Card key={it.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>
                  {it.release_title || it.block_title || "(unknown)"}
                </div>
                {(it.release_cat || it.block_slug) && (
                  <div style={T.small}>
                    {it.release_cat && <span>{it.release_cat}</span>}
                    {it.block_slug && <span>auction: {it.block_slug}</span>}
                  </div>
                )}
              </div>
              <div style={T.small}>{relativeTime(it.created_at)}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Tab: Communication-Preferences (S7.2) ──────────────────────────────────

const COMM_CHANNELS = [
  { key: "email_marketing", label: "Email — Marketing", icon: "📧", default: true },
  { key: "email_transactional", label: "Email — Transactional", icon: "📨", default: true },
  { key: "sms", label: "SMS", icon: "📱", default: false },
  { key: "phone", label: "Phone", icon: "☎️", default: false },
  { key: "postal", label: "Postal mail", icon: "✉️", default: true },
  { key: "push", label: "Push notifications", icon: "🔔", default: false },
] as const

function CommunicationTab({ data, onChange }: { data: DetailData; onChange: () => void }) {
  const masterId = data.master.id
  const prefs = data.communication_prefs || []
  const prefByChannel: Record<string, CommPrefRow> = {}
  for (const p of prefs) prefByChannel[p.channel] = p

  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (channel: string, optedIn: boolean) => {
    setBusy(channel)
    try {
      const r = await fetch(`/admin/crm/contacts/${masterId}/communication-prefs`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, opted_in: optedIn, source: "admin_ui" }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onChange()
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div style={T.sectionHead}>Communication preferences</div>
      <div style={{ ...T.small, marginBottom: 12 }}>
        Controls which channels this customer wants to be contacted on. GDPR consent is tracked per channel.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {COMM_CHANNELS.map((c) => {
          const pref = prefByChannel[c.key]
          const optedIn = pref ? pref.opted_in : c.default
          const isBusy = busy === c.key
          return (
            <Card key={c.key}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 18 }}>{c.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{c.label}</div>
                    {pref?.opted_out_at && (
                      <div style={T.small}>opted out {relativeTime(pref.opted_out_at)}</div>
                    )}
                    {pref?.opted_in_at && optedIn && (
                      <div style={T.small}>opted in {relativeTime(pref.opted_in_at)}</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toggle(c.key, !optedIn)}
                  disabled={isBusy}
                  style={{
                    padding: "5px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: optedIn ? C.success : "transparent",
                    color: optedIn ? "#fff" : C.muted,
                    border: `1px solid ${optedIn ? C.success : C.border}`,
                    borderRadius: 16,
                    cursor: isBusy ? "wait" : "pointer",
                    minWidth: 80,
                  }}
                >
                  {isBusy ? "…" : optedIn ? "Opted in" : "Opted out"}
                </button>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab: Relationships (S7.3) ──────────────────────────────────────────────

function RelationshipsTab({ data, onChange }: { data: DetailData; onChange: () => void }) {
  const masterId = data.master.id
  const asPerson = data.relationships_as_person || []
  const asCompany = data.relationships_as_company || []

  const remove = async (relId: string) => {
    if (!confirm("Remove this relationship?")) return
    try {
      const r = await fetch(`/admin/crm/contacts/${masterId}/relationships/${relId}`, {
        method: "DELETE", credentials: "include",
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onChange()
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (asPerson.length === 0 && asCompany.length === 0) {
    return <EmptyState title="No relationships yet" description="Link this contact to a company or person they work with." />
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {asPerson.length > 0 && (
        <div>
          <div style={T.sectionHead}>Works at / Linked to companies</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {asPerson.map((r) => (
              <Card key={r.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{r.other_name || "(unknown)"}</div>
                    <div style={T.small}>
                      {r.role ? <span>as {r.role}</span> : <span>linked</span>}
                      {r.is_primary && <Badge label="primary" variant="success" />}
                      {r.started_at && <span> · since {new Date(r.started_at).toLocaleDateString("en-GB", { year: "numeric", month: "short" })}</span>}
                      {r.ended_at && <span> · ended {new Date(r.ended_at).toLocaleDateString("en-GB", { year: "numeric", month: "short" })}</span>}
                    </div>
                  </div>
                  <button onClick={() => remove(r.id)} style={iconBtnStyle()} title="Remove">×</button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
      {asCompany.length > 0 && (
        <div>
          <div style={T.sectionHead}>People at this company</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {asCompany.map((r) => (
              <Card key={r.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{r.other_name || "(unknown)"}</div>
                    <div style={T.small}>
                      {r.role ? <span>{r.role}</span> : <span>contact</span>}
                      {r.is_primary && <Badge label="primary" variant="success" />}
                    </div>
                  </div>
                  <button onClick={() => remove(r.id)} style={iconBtnStyle()} title="Remove">×</button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab: Audit Log ─────────────────────────────────────────────────────────

function AuditTab({ data }: { data: DetailData }) {
  if (data.audit_log.length === 0) {
    return <EmptyState title="No audit entries" />
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={T.sectionHead}>Audit Log (last 100 actions)</div>
      {data.audit_log.map((a) => (
        <Card key={a.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
            <div>
              <Badge label={a.action} variant="neutral" />
              {a.admin_email && (
                <span style={{ ...T.small, marginLeft: 8 }}>by {a.admin_email}</span>
              )}
            </div>
            <div style={T.small}>{relativeTime(a.created_at)}</div>
          </div>
          {a.source && <div style={T.small}>source: {a.source}</div>}
          {a.details && Object.keys(a.details).length > 0 && (
            <pre
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                background: C.subtle,
                borderRadius: S.radius.sm,
                padding: 6,
                marginTop: 6,
                marginBottom: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {JSON.stringify(a.details, null, 2)}
            </pre>
          )}
        </Card>
      ))}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={T.sectionHead}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: S.radius.md,
        padding: "12px 14px",
      }}
    >
      {children}
    </div>
  )
}

function pillStyle(): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: S.radius.sm,
    border: `1px solid ${C.border}`,
    background: C.subtle,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  }
}

function iconBtnStyle(): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${C.border}`,
    borderRadius: S.radius.sm,
    width: 28,
    height: 28,
    cursor: "pointer",
    fontSize: 13,
    color: C.muted,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  }
}

const inputRow: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 }
const inputLabel: React.CSSProperties = { ...T.micro, color: C.muted }
const fullInput: React.CSSProperties = { ...inputStyle, width: "100%" }

// ── RfmCard — visualisiert R/F/M-Scores als Mini-Bars + Segment-Badge ──────

function RfmCard({ master }: { master: Master }) {
  const r = master.rfm_recency_score
  const f = master.rfm_frequency_score
  const m = master.rfm_monetary_score
  const seg = master.rfm_segment
  const cfg = seg ? RFM_LABELS[seg] : null

  return (
    <div>
      <div style={T.sectionHead}>RFM Segmentation</div>
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: S.radius.md,
          padding: "14px 16px",
        }}
      >
        {cfg && (
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>{cfg.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{cfg.label}</div>
              <div style={T.small}>R{r ?? "?"}·F{f ?? "?"}·M{m ?? "?"}</div>
            </div>
          </div>
        )}
        <RfmBar label="Recency"   score={r} hint="how recently they purchased" />
        <RfmBar label="Frequency" score={f} hint="how often they purchase" />
        <RfmBar label="Monetary"  score={m} hint="how much they spend" />
      </div>
    </div>
  )
}

function RfmBar({ label, score, hint }: { label: string; score: number | null; hint: string }) {
  const pct = score !== null ? (score / 5) * 100 : 0
  const color = score === null ? C.muted
              : score >= 4 ? C.success
              : score >= 3 ? C.gold
              : score >= 2 ? C.warning
              : C.error
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
      <div style={{ width: 80, fontSize: 12, fontWeight: 500 }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: C.subtle, borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          transition: "width 200ms ease",
        }} />
      </div>
      <div style={{ width: 40, textAlign: "right", fontSize: 12, color: C.muted }}>
        {score !== null ? `${score}/5` : "—"}
      </div>
    </div>
  )
}

// ── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({ master }: { master: Master }) {
  const size = 56
  if (master.avatar_url) {
    return (
      <img
        src={master.avatar_url}
        alt={master.display_name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          background: C.subtle,
          border: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      />
    )
  }
  // Initials-Circle
  const ini = initials(master.display_name)
  // Hash from id for deterministic color
  let h = 0
  for (let i = 0; i < master.id.length; i++) h = (h * 31 + master.id.charCodeAt(i)) | 0
  const palette = [C.gold, C.blue, C.purple, C.success, C.warning]
  const bg = palette[Math.abs(h) % palette.length]
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
        fontWeight: 700,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {ini}
    </div>
  )
}

// ── Country Picker ─────────────────────────────────────────────────────────

function CountryPicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const selected = findCountry(value)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ISO_COUNTRIES
    return ISO_COUNTRIES.filter((c) =>
      c.nameEn.toLowerCase().includes(q) ||
      c.nameDe.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q)
    )
  }, [search])

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          ...fullInput,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {selected ? (
          <>
            <span style={{ fontSize: 16 }}>{flagFor(selected.code)}</span>
            <span>{selected.nameEn}</span>
            <span style={{ color: C.muted, marginLeft: "auto" }}>{selected.code}</span>
          </>
        ) : (
          <span style={{ color: C.muted }}>— Select country —</span>
        )}
        <span style={{ color: C.muted, marginLeft: selected ? 8 : "auto" }}>▾</span>
      </button>

      {open && (
        <>
          {/* Click-outside backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 200 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: S.radius.md,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              zIndex: 201,
              maxHeight: 320,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <input
              autoFocus
              type="search"
              placeholder="Search country (EN/DE/ISO)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                ...inputStyle,
                borderRadius: 0,
                border: "none",
                borderBottom: `1px solid ${C.border}`,
                width: "100%",
              }}
            />
            <div style={{ overflowY: "auto", flex: 1 }}>
              {selected && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("")
                    setOpen(false)
                    setSearch("")
                  }}
                  style={{
                    ...countryRowStyle(false),
                    color: C.muted,
                    fontStyle: "italic",
                  }}
                >
                  ✕ Clear selection
                </button>
              )}
              {filtered.length === 0 ? (
                <div style={{ padding: 16, fontSize: 13, color: C.muted, textAlign: "center" }}>
                  No matches
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      onChange(c.code)
                      setOpen(false)
                      setSearch("")
                    }}
                    style={countryRowStyle(c.code === value)}
                  >
                    <span style={{ fontSize: 16 }}>{flagFor(c.code)}</span>
                    <span>{c.nameEn}</span>
                    {c.nameEn !== c.nameDe && (
                      <span style={{ color: C.muted, fontSize: 11 }}>· {c.nameDe}</span>
                    )}
                    <span style={{ color: C.muted, marginLeft: "auto", fontSize: 12, fontFamily: "monospace" }}>
                      {c.code}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function countryRowStyle(active: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 12px",
    background: active ? C.subtle : "transparent",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: C.text,
    textAlign: "left",
    borderBottom: `1px solid ${C.border}20`,
  }
}

// ── Master Edit Modal ──────────────────────────────────────────────────────

const TIER_OPTIONS = ["", "platinum", "gold", "silver", "bronze", "standard", "dormant"] as const

const LIFECYCLE_OPTIONS = ["", "lead", "active", "engaged", "at_risk", "dormant", "churned", "lost"] as const
const ACQUISITION_OPTIONS = [
  "", "mo_pdf", "webshop_db1", "webshop_db2013", "tape_mag",
  "newsletter", "discogs_referral", "invite", "imap_match", "manual",
] as const
const LANGUAGE_OPTIONS = [
  { code: "", label: "— unknown —" },
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "ja", label: "日本語" },
] as const

function MasterEditModal({
  master,
  onClose,
  onSaved,
}: {
  master: Master
  onClose: () => void
  onSaved: () => void
}) {
  // Naming
  const [displayName, setDisplayName] = useState(master.display_name)
  const [firstName, setFirstName] = useState(master.first_name || "")
  const [lastName, setLastName] = useState(master.last_name || "")
  const [company, setCompany] = useState(master.company || "")
  const [salutation, setSalutation] = useState(master.salutation || "")
  const [title, setTitle] = useState(master.title || "")
  // Classification
  const [contactType, setContactType] = useState(master.contact_type || "")
  const [tier, setTier] = useState(master.tier || "")
  const [lifecycle, setLifecycle] = useState(master.lifecycle_stage || "")
  // Profile
  const [preferredLanguage, setPreferredLanguage] = useState(master.preferred_language || "")
  const [avatarUrl, setAvatarUrl] = useState(master.avatar_url || "")
  const [birthday, setBirthday] = useState(master.birthday ? master.birthday.slice(0, 10) : "")
  // Acquisition
  const [acquisitionChannel, setAcquisitionChannel] = useState(master.acquisition_channel || "")
  const [acquisitionDate, setAcquisitionDate] = useState(master.acquisition_date ? master.acquisition_date.slice(0, 10) : "")
  // Status
  const [isTest, setIsTest] = useState(master.is_test)
  const [isBlocked, setIsBlocked] = useState(master.is_blocked)
  const [blockedReason, setBlockedReason] = useState(master.blocked_reason || "")
  const [tagsInput, setTagsInput] = useState((master.tags || []).join(", "))

  const [autoCompose, setAutoCompose] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Auto-compose display_name aus Name+Company wenn aktiviert
  const composeName = () => {
    if (contactType === "business") {
      return company.trim() || displayName
    }
    const personPart = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")
    if (!personPart && !company.trim()) return displayName
    if (!company.trim()) return personPart
    if (!personPart) return company.trim()
    return `${personPart} (${company.trim()})`
  }

  // Auto-compose triggern wenn Toggle aktiv und einer der Compose-Felder ändert
  useEffect(() => {
    if (autoCompose) {
      setDisplayName(composeName())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCompose, firstName, lastName, company, contactType])

  const save = async () => {
    setSaving(true)
    setErr(null)
    try {
      const body: Record<string, unknown> = {
        display_name: displayName.trim(),
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        company: company.trim() || null,
        salutation: salutation.trim() || null,
        title: title.trim() || null,
        contact_type: contactType || null,
        tier: tier || null,
        lifecycle_stage: lifecycle || null,
        preferred_language: preferredLanguage || null,
        avatar_url: avatarUrl.trim() || null,
        birthday: birthday || null,
        acquisition_channel: acquisitionChannel || null,
        acquisition_date: acquisitionDate || null,
        is_test: isTest,
        is_blocked: isBlocked,
        blocked_reason: isBlocked ? blockedReason.trim() || null : null,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      }
      const r = await fetch(`/admin/crm/contacts/${master.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${r.status}`)
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Edit master contact"
      subtitle={master.display_name}
      onClose={onClose}
      maxWidth={680}
      footer={
        <>
          <Btn label="Cancel" variant="ghost" onClick={onClose} />
          <Btn label={saving ? "Saving…" : "Save"} variant="gold" onClick={save} disabled={saving} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div style={{ color: C.error, fontSize: 12 }}><b>Error:</b> {err}</div>}

        {/* Section: Name */}
        <Subsection title="Name">
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 12 }}>
            <div style={inputRow}>
              <label style={inputLabel}>Salutation</label>
              <input style={fullInput} value={salutation} onChange={(e) => setSalutation(e.target.value)} placeholder="Herr / Frau / Mr" />
            </div>
            <div style={inputRow}>
              <label style={inputLabel}>First name</label>
              <input style={fullInput} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div style={inputRow}>
              <label style={inputLabel}>Last name</label>
              <input style={fullInput} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={inputRow}>
              <label style={inputLabel}>Title</label>
              <input style={fullInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dr. / Prof. / CEO" />
            </div>
            <div style={inputRow}>
              <label style={inputLabel}>Company</label>
              <input style={fullInput} value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          </div>
          <div style={inputRow}>
            <label style={inputLabel}>Display name (shown in lists)</label>
            <input style={fullInput} value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={autoCompose} />
            <label style={{ ...T.small, display: "flex", gap: 6, alignItems: "center", marginTop: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={autoCompose} onChange={(e) => setAutoCompose(e.target.checked)} />
              Auto-compose from name + company
            </label>
          </div>
        </Subsection>

        {/* Section: Classification */}
        <Subsection title="Classification">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div style={inputRow}>
              <label style={inputLabel}>Contact type</label>
              <select style={selectStyle} value={contactType} onChange={(e) => setContactType(e.target.value)}>
                <option value="">— unknown —</option>
                <option value="person">Person</option>
                <option value="business">Business</option>
              </select>
            </div>
            <div style={inputRow}>
              <label style={inputLabel}>Tier</label>
              <select style={selectStyle} value={tier} onChange={(e) => setTier(e.target.value)}>
                {TIER_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t || "— none —"}</option>
                ))}
              </select>
            </div>
            <div style={inputRow}>
              <label style={inputLabel}>Lifecycle stage</label>
              <select style={selectStyle} value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>
                {LIFECYCLE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s || "— none —"}</option>
                ))}
              </select>
            </div>
          </div>
        </Subsection>

        {/* Section: Profile */}
        <Subsection title="Profile">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={inputRow}>
              <label style={inputLabel}>Language</label>
              <select style={selectStyle} value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)}>
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
            <div style={inputRow}>
              <label style={inputLabel}>Birthday</label>
              <input style={fullInput} type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </div>
          </div>
          <div style={inputRow}>
            <label style={inputLabel}>Avatar URL</label>
            <input style={fullInput} value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
          </div>
        </Subsection>

        {/* Section: Acquisition */}
        <Subsection title="Acquisition">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={inputRow}>
              <label style={inputLabel}>Channel</label>
              <select style={selectStyle} value={acquisitionChannel} onChange={(e) => setAcquisitionChannel(e.target.value)}>
                {ACQUISITION_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c || "— unknown —"}</option>
                ))}
              </select>
            </div>
            <div style={inputRow}>
              <label style={inputLabel}>Acquired date</label>
              <input style={fullInput} type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} />
            </div>
          </div>
        </Subsection>

        {/* Section: Status */}
        <Subsection title="Status & Tags">
          <div style={inputRow}>
            <label style={inputLabel}>Tags (comma separated)</label>
            <input style={fullInput} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="vip, newsletter, internal_owner" />
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} />
              Test account
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={isBlocked} onChange={(e) => setIsBlocked(e.target.checked)} />
              Blocked
            </label>
          </div>
          {isBlocked && (
            <div style={inputRow}>
              <label style={inputLabel}>Block reason</label>
              <input style={fullInput} value={blockedReason} onChange={(e) => setBlockedReason(e.target.value)} placeholder="Why is this contact blocked?" />
            </div>
          )}
        </Subsection>

        {/* GDPR Section: Export + Anonymize */}
        <DangerZone master={master} onAnonymized={onSaved} />
      </div>
    </Modal>
  )
}

// ── DangerZone — GDPR Right-to-Access + Right-to-Anonymize ─────────────────

function DangerZone({ master, onAnonymized }: { master: Master; onAnonymized: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [reason, setReason] = useState("")
  const [working, setWorking] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const exportData = () => {
    window.open(`/admin/crm/contacts/${master.id}/gdpr-export`, "_blank")
  }

  const anonymize = async () => {
    if (confirmText !== "ANONYMIZE") {
      setErr("Type ANONYMIZE to confirm")
      return
    }
    setWorking(true)
    setErr(null)
    try {
      const r = await fetch(`/admin/crm/contacts/${master.id}/anonymize`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "ANONYMIZE", reason: reason.trim() || undefined }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      onAnonymized()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div style={{ borderTop: `2px solid ${C.error}30`, paddingTop: 12, marginTop: 8 }}>
      <div style={{ ...T.micro, color: C.error, marginBottom: 8 }}>⚠ Danger Zone — GDPR</div>
      <div style={{
        background: C.error + "10",
        border: `1px solid ${C.error}30`,
        borderRadius: S.radius.md,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Export data (Art. 15)</div>
            <div style={T.small}>Download all data we have on this contact as JSON.</div>
          </div>
          <Btn label="Export JSON" variant="ghost" onClick={exportData} />
        </div>
        <div style={{ borderTop: `1px solid ${C.error}30` }} />
        {!confirming ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Anonymize (Art. 17)</div>
              <div style={T.small}>
                Removes all PII (name/email/phone/address/notes). Lifetime-revenue and
                transactions remain anonymized for accounting. Irreversible.
              </div>
            </div>
            <Btn label="Anonymize…" variant="danger" onClick={() => setConfirming(true)} />
          </div>
        ) : (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: C.error }}>
              Confirm anonymization
            </div>
            <div style={{ ...T.small, marginBottom: 10 }}>
              This action cannot be undone. Type <b>ANONYMIZE</b> below to confirm.
            </div>
            {err && <div style={{ color: C.error, fontSize: 12, marginBottom: 8 }}>{err}</div>}
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="ANONYMIZE"
              style={{ ...fullInput, marginBottom: 8 }}
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional, for audit log)"
              style={{ ...fullInput, marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <Btn label="Cancel" variant="ghost" onClick={() => { setConfirming(false); setConfirmText(""); setErr(null) }} />
              <Btn
                label={working ? "Anonymizing…" : "Confirm anonymize"}
                variant="danger"
                onClick={anonymize}
                disabled={working || confirmText !== "ANONYMIZE"}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
      <div style={{ ...T.micro, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  )
}

// ── Email Add Modal ────────────────────────────────────────────────────────

function EmailAddModal({ masterId, onClose, onSaved }: { masterId: string; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("")
  const [setPrimary, setSetPrimary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setErr(null)
    try {
      const r = await fetch(`/admin/crm/contacts/${masterId}/emails`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), is_primary: setPrimary }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Add email"
      onClose={onClose}
      maxWidth={420}
      footer={
        <>
          <Btn label="Cancel" variant="ghost" onClick={onClose} />
          <Btn label={saving ? "Saving…" : "Add"} variant="gold" onClick={save} disabled={saving || !email.trim()} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {err && <div style={{ color: C.error, fontSize: 12 }}><b>Error:</b> {err}</div>}
        <div style={inputRow}>
          <label style={inputLabel}>Email address</label>
          <input style={fullInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" autoFocus />
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={setPrimary} onChange={(e) => setSetPrimary(e.target.checked)} />
          Set as primary email
        </label>
      </div>
    </Modal>
  )
}

// ── Address Edit/Add Modal ─────────────────────────────────────────────────

function AddressEditModal({
  masterId,
  address,
  onClose,
  onSaved,
}: {
  masterId: string
  address: AddressRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = address !== null
  const [type, setType] = useState(address?.type || "shipping")
  const [salutation, setSalutation] = useState(address?.salutation || "")
  const [company, setCompany] = useState(address?.company || "")
  const [firstName, setFirstName] = useState(address?.first_name || "")
  const [lastName, setLastName] = useState(address?.last_name || "")
  const [street, setStreet] = useState(address?.street || "")
  const [street2, setStreet2] = useState(address?.street_2 || "")
  const [postalCode, setPostalCode] = useState(address?.postal_code || "")
  const [city, setCity] = useState(address?.city || "")
  const [region, setRegion] = useState(address?.region || "")
  const initialCode = (address?.country_code || "").toUpperCase()
    || findCountry(address?.country)?.code
    || ""
  const [countryCode, setCountryCode] = useState(initialCode)
  const [setPrimary, setSetPrimary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setErr(null)
    try {
      const selected = findCountry(countryCode)
      const body: Record<string, unknown> = {
        type, salutation, company,
        first_name: firstName, last_name: lastName,
        street, street_2: street2,
        postal_code: postalCode, city, region,
        country: selected ? selected.nameEn : null,
        country_code: selected ? selected.code : null,
      }
      if (setPrimary || !isEdit) body.is_primary = true
      const url = isEdit
        ? `/admin/crm/contacts/${masterId}/addresses/${address!.id}`
        : `/admin/crm/contacts/${masterId}/addresses`
      const r = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? "Edit address" : "Add address"}
      onClose={onClose}
      maxWidth={620}
      footer={
        <>
          <Btn label="Cancel" variant="ghost" onClick={onClose} />
          <Btn label={saving ? "Saving…" : "Save"} variant="gold" onClick={save} disabled={saving} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {err && <div style={{ color: C.error, fontSize: 12 }}><b>Error:</b> {err}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={inputRow}>
            <label style={inputLabel}>Type</label>
            <select style={selectStyle} value={type || ""} onChange={(e) => setType(e.target.value)}>
              <option value="shipping">Shipping</option>
              <option value="billing">Billing</option>
              <option value="home">Home</option>
              <option value="business">Business</option>
            </select>
          </div>
          <div style={inputRow}>
            <label style={inputLabel}>Salutation</label>
            <input style={fullInput} value={salutation} onChange={(e) => setSalutation(e.target.value)} placeholder="Herr / Frau / Mr / Mrs" />
          </div>
        </div>
        <div style={inputRow}>
          <label style={inputLabel}>Company</label>
          <input style={fullInput} value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={inputRow}>
            <label style={inputLabel}>First name</label>
            <input style={fullInput} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div style={inputRow}>
            <label style={inputLabel}>Last name</label>
            <input style={fullInput} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div style={inputRow}>
          <label style={inputLabel}>Street</label>
          <input style={fullInput} value={street} onChange={(e) => setStreet(e.target.value)} />
        </div>
        <div style={inputRow}>
          <label style={inputLabel}>Street 2</label>
          <input style={fullInput} value={street2} onChange={(e) => setStreet2(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 12 }}>
          <div style={inputRow}>
            <label style={inputLabel}>Postal code</label>
            <input style={fullInput} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </div>
          <div style={inputRow}>
            <label style={inputLabel}>City</label>
            <input style={fullInput} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div style={inputRow}>
            <label style={inputLabel}>Region</label>
            <input style={fullInput} value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
        </div>
        <div style={inputRow}>
          <label style={inputLabel}>Country</label>
          <CountryPicker value={countryCode} onChange={setCountryCode} />
        </div>
        {isEdit && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={setPrimary} onChange={(e) => setSetPrimary(e.target.checked)} />
            Set as primary address
          </label>
        )}
      </div>
    </Modal>
  )
}

// ── Phone Add Modal ────────────────────────────────────────────────────────

function PhoneAddModal({ masterId, onClose, onSaved }: { masterId: string; onClose: () => void; onSaved: () => void }) {
  const [phoneRaw, setPhoneRaw] = useState("")
  const [phoneType, setPhoneType] = useState("mobile")
  const [setPrimary, setSetPrimary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setErr(null)
    try {
      const r = await fetch(`/admin/crm/contacts/${masterId}/phones`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone_raw: phoneRaw.trim(), phone_type: phoneType, is_primary: setPrimary }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Add phone"
      onClose={onClose}
      maxWidth={420}
      footer={
        <>
          <Btn label="Cancel" variant="ghost" onClick={onClose} />
          <Btn label={saving ? "Saving…" : "Add"} variant="gold" onClick={save} disabled={saving || !phoneRaw.trim()} />
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {err && <div style={{ color: C.error, fontSize: 12 }}><b>Error:</b> {err}</div>}
        <div style={inputRow}>
          <label style={inputLabel}>Phone number</label>
          <input style={fullInput} value={phoneRaw} onChange={(e) => setPhoneRaw(e.target.value)} placeholder="+49 30 12345678" autoFocus />
        </div>
        <div style={inputRow}>
          <label style={inputLabel}>Type</label>
          <select style={selectStyle} value={phoneType} onChange={(e) => setPhoneType(e.target.value)}>
            <option value="mobile">Mobile</option>
            <option value="work">Work</option>
            <option value="home">Home</option>
            <option value="fax">Fax</option>
            <option value="other">Other</option>
          </select>
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={setPrimary} onChange={(e) => setSetPrimary(e.target.checked)} />
          Set as primary phone
        </label>
      </div>
    </Modal>
  )
}
