import { useEffect, useState, useCallback } from "react"
import { C, S, T, fmtMoney, fmtNum, relativeTime } from "../admin-tokens"
import { Badge, Btn, EmptyState, inputStyle } from "../admin-ui"

// ── Types ──────────────────────────────────────────────────────────────────

type Master = {
  id: string
  display_name: string
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

type DetailData = {
  master: Master
  emails: EmailRow[]
  addresses: AddressRow[]
  phones: PhoneRow[]
  sources: SourceLink[]
  notes: NoteRow[]
  audit_log: AuditRow[]
  transactions: TransactionRow[]
  bids: BidRow[]
  orders: OrderRow[]
  imap_messages: ImapRow[]
}

type DrawerTab =
  | "overview"
  | "contact"
  | "activity"
  | "notes"
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
  const [tab, setTab] = useState<DrawerTab>("overview")

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
      setTab("overview")
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
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...T.micro, marginBottom: 4 }}>Master Contact</div>
            <div
              style={{
                ...T.pageTitle,
                fontSize: 20,
                wordBreak: "break-word",
                marginBottom: 8,
              }}
            >
              {data?.master.display_name || "Loading…"}
            </div>
            {data && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {tierBadge(data.master.tier)}
                {data.master.is_test && <Badge label="test" variant="warning" />}
                {data.master.is_blocked && <Badge label="blocked" variant="error" />}
                {data.master.tags.includes("internal_owner") && (
                  <Badge label="internal" variant="purple" />
                )}
                {data.master.medusa_customer_id && (
                  <Badge label="vod-auctions linked" variant="success" />
                )}
                {data.master.contact_type && (
                  <Badge
                    label={data.master.contact_type}
                    variant="neutral"
                  />
                )}
              </div>
            )}
          </div>
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
            [
              { key: "overview" as DrawerTab, label: "Overview" },
              { key: "contact" as DrawerTab, label: "Contact Info" },
              { key: "activity" as DrawerTab, label: "Activity" },
              { key: "notes" as DrawerTab, label: "Notes" },
              { key: "sources" as DrawerTab, label: "Sources" },
              { key: "audit" as DrawerTab, label: "Audit" },
            ] as const
          ).map((t) => (
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
              {t.key === "notes" && data && data.notes.length > 0 && (
                <span style={{ marginLeft: 6, color: C.muted, fontSize: 11 }}>
                  ({data.notes.length})
                </span>
              )}
              {t.key === "activity" && data && (
                <span style={{ marginLeft: 6, color: C.muted, fontSize: 11 }}>
                  ({fmtNum(
                    data.transactions.length +
                      data.bids.length +
                      data.orders.length +
                      data.imap_messages.length
                  )})
                </span>
              )}
            </button>
          ))}
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
          {data && tab === "contact" && <ContactInfoTab data={data} />}
          {data && tab === "activity" && <ActivityTab data={data} />}
          {data && tab === "notes" && (
            <NotesTab data={data} onChange={load} />
          )}
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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

function ContactInfoTab({ data }: { data: DetailData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Emails */}
      <Section title={`Emails (${data.emails.length})`}>
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
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {e.is_primary && <Badge label="primary" variant="success" />}
                  {e.is_verified && <Badge label="verified" variant="info" />}
                </div>
              </div>
            </Card>
          ))
        )}
      </Section>

      {/* Addresses */}
      <Section title={`Addresses (${data.addresses.length})`}>
        {data.addresses.length === 0 ? (
          <EmptyState title="No addresses on file" />
        ) : (
          data.addresses.map((a) => (
            <Card key={a.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                <div style={{ ...T.micro }}>{(a.type || "address").toUpperCase()}</div>
                {a.is_primary && <Badge label="primary" variant="success" />}
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
      </Section>

      {/* Phones */}
      <Section title={`Phones (${data.phones.length})`}>
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
                {p.is_primary && <Badge label="primary" variant="success" />}
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
      </Section>
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
