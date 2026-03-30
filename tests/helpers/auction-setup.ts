/**
 * Test helper: create and tear down a live E2E auction block.
 * Used in beforeAll/afterAll to enable auction browse + bidding tests.
 */

const ADMIN_URL = process.env.ADMIN_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  "pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d"
const ADMIN_EMAIL = "admin@vod.de"
const ADMIN_PASSWORD = "admin123"

export interface TestAuctionBlock {
  id: string
  slug: string
  items: Array<{ id: string; release_id: string }>
}

async function getAdminToken(): Promise<string | null> {
  try {
    const res = await fetch(`${ADMIN_URL}/auth/user/emailpass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.token || null
  } catch {
    return null
  }
}

// Hardcoded fallback IDs — low-numbered legacy releases that are always present
const FALLBACK_RELEASE_IDS = [
  "legacy-release-100",
  "legacy-release-200",
  "legacy-release-300",
]

/** Fetch release IDs from catalog; falls back to hardcoded IDs on error */
async function findAvailableReleaseIds(count: number = 3): Promise<string[]> {
  try {
    const res = await fetch(
      `${ADMIN_URL}/store/catalog?limit=${count}&offset=200`,
      { headers: { "x-publishable-api-key": PUBLISHABLE_KEY } }
    )
    if (res.ok) {
      const data = await res.json()
      const ids = (data.releases || []).map((r: any) => r.id).slice(0, count)
      if (ids.length > 0) return ids
    }
  } catch {
    // fall through to hardcoded IDs
  }
  return FALLBACK_RELEASE_IDS.slice(0, count)
}

/**
 * Create a fully-active auction block with items for E2E testing.
 * Flow: draft → scheduled → active, then each item status → active.
 *
 * Returns the block info, or null if setup failed (tests should skip gracefully).
 */
export async function createTestAuctionBlock(): Promise<TestAuctionBlock | null> {
  const token = await getAdminToken()
  if (!token) {
    console.log("[auction-setup] getAdminToken failed — admin API unreachable?")
    return null
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }

  const now = new Date()
  const slug = `e2e-auction-${Date.now()}`
  // start_time in past (simulates block that should have started),
  // end_time 2 hours out (keeps it active for the test run)
  const startTime = new Date(now.getTime() - 60_000).toISOString()
  const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()

  // ── 1. Create draft block ──────────────────────────────────────────────────
  const createRes = await fetch(`${ADMIN_URL}/admin/auction-blocks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "E2E Test Auction",
      slug,
      description: "Playwright E2E test block — auto cleanup",
      block_type: "theme",
      status: "draft",
      start_time: startTime,
      end_time: endTime,
    }),
  })
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => "")
    console.log(`[auction-setup] create block failed ${createRes.status}: ${body.slice(0, 200)}`)
    return null
  }

  const blockData = await createRes.json()
  const blockId: string = blockData.auction_block?.id
  if (!blockId) {
    console.log("[auction-setup] block created but no id in response:", JSON.stringify(blockData).slice(0, 200))
    return null
  }

  // ── 2. Find release IDs for lots ───────────────────────────────────────────
  const releaseIds = await findAvailableReleaseIds(3)
  if (releaseIds.length === 0) {
    await fetch(`${ADMIN_URL}/admin/auction-blocks/${blockId}`, {
      method: "DELETE",
      headers,
    })
    return null
  }

  // ── 3. Add items ───────────────────────────────────────────────────────────
  const items: Array<{ id: string; release_id: string }> = []
  for (let i = 0; i < releaseIds.length; i++) {
    const res = await fetch(`${ADMIN_URL}/admin/auction-blocks/${blockId}/items`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        release_id: releaseIds[i],
        start_price: 1.0,
        lot_number: i + 1,
      }),
    })
    if (res.ok) {
      const d = await res.json()
      const itemId: string = d.block_item?.id
      if (itemId) items.push({ id: itemId, release_id: releaseIds[i] })
    }
  }

  if (items.length === 0) {
    await fetch(`${ADMIN_URL}/admin/auction-blocks/${blockId}`, {
      method: "DELETE",
      headers,
    })
    return null
  }

  // ── 4. draft → scheduled ──────────────────────────────────────────────────
  const schedRes = await fetch(`${ADMIN_URL}/admin/auction-blocks/${blockId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ status: "scheduled" }),
  })
  if (!schedRes.ok) {
    const body = await schedRes.text().catch(() => "")
    console.log(`[auction-setup] scheduled transition failed ${schedRes.status}: ${body.slice(0, 200)}`)
    await fetch(`${ADMIN_URL}/admin/auction-blocks/${blockId}`, { method: "DELETE", headers })
    return null
  }

  // ── 5. scheduled → active ─────────────────────────────────────────────────
  const activeRes = await fetch(`${ADMIN_URL}/admin/auction-blocks/${blockId}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ status: "active" }),
  })
  if (!activeRes.ok) {
    const body = await activeRes.text().catch(() => "")
    console.log(`[auction-setup] active transition failed ${activeRes.status}: ${body.slice(0, 200)}`)
    return null // can't delete active — leave for lifecycle
  }

  // ── 6. Activate each item ─────────────────────────────────────────────────
  // The status transition only changes the block, not the items.
  // Items need status="active" for bidding to work.
  // lot_end_time left null — bid route only checks it when non-null.
  for (const item of items) {
    await fetch(`${ADMIN_URL}/admin/auction-blocks/${blockId}/items/${item.id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ status: "active" }),
    }).catch(() => {})
  }

  console.log(`[auction-setup] Test block ready: ${slug} (${items.length} items)`)
  return { id: blockId, slug, items }
}

/**
 * Fully delete the test auction block: force status to ended, then hard-delete.
 */
export async function cleanupTestAuctionBlock(
  block: TestAuctionBlock | null
): Promise<void> {
  if (!block) return
  const token = await getAdminToken()
  if (!token) return

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }

  // Force block to ended (skips lifecycle scheduler)
  await fetch(`${ADMIN_URL}/admin/auction-blocks/${block.id}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ status: "ended" }),
  }).catch(() => {})

  // Hard-delete (only allowed for draft/ended/archived)
  await fetch(`${ADMIN_URL}/admin/auction-blocks/${block.id}`, {
    method: "DELETE",
    headers,
  }).catch(() => {})
}

/**
 * Delete all stale E2E test auction blocks (title = "E2E Test Auction").
 * Call in beforeAll to prevent accumulation from aborted test runs.
 */
export async function cleanupStaleTestAuctionBlocks(): Promise<void> {
  const token = await getAdminToken()
  if (!token) return

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }

  try {
    const res = await fetch(`${ADMIN_URL}/admin/auction-blocks?limit=100`, { headers })
    if (!res.ok) return
    const data = await res.json()
    const blocks: Array<{ id: string; title: string; status: string }> =
      data.auction_blocks || []

    const stale = blocks.filter((b) => b.title === "E2E Test Auction")
    for (const b of stale) {
      // Force to ended if still active/scheduled/preview
      if (!["draft", "ended", "archived"].includes(b.status)) {
        await fetch(`${ADMIN_URL}/admin/auction-blocks/${b.id}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ status: "ended" }),
        }).catch(() => {})
      }
      await fetch(`${ADMIN_URL}/admin/auction-blocks/${b.id}`, {
        method: "DELETE",
        headers,
      }).catch(() => {})
    }
    if (stale.length > 0) {
      console.log(`[auction-setup] Cleaned up ${stale.length} stale E2E test block(s)`)
    }
  } catch {
    // ignore — cleanup is best-effort
  }
}
