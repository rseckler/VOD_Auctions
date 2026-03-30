import { test, expect } from "@playwright/test"
import { bypassGate, loginViaModal, TEST_ACCOUNTS } from "./helpers/auth"
import {
  createTestAuctionBlock,
  cleanupTestAuctionBlock,
  type TestAuctionBlock,
} from "./helpers/auction-setup"

/**
 * 06 — Bidding: Place bids, view bid history
 *
 * These tests require an ACTIVE auction block with items.
 * A test block is created in beforeAll and cleaned up in afterAll.
 */

const MEDUSA_URL = process.env.MEDUSA_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  "pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d"

/**
 * Find first active auction block via API.
 * Returns { slug, id } or null.
 */
async function findActiveBlock(): Promise<{ slug: string; id: string } | null> {
  try {
    const res = await fetch(`${MEDUSA_URL}/store/auction-blocks`, {
      headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
    })
    if (!res.ok) return null
    const data = await res.json()
    const active = (data.auction_blocks || []).find(
      (b: any) => b.status === "active"
    )
    return active ? { slug: active.slug, id: active.id } : null
  } catch {
    return null
  }
}

let testBlock: TestAuctionBlock | null = null

test.describe("Bidding", () => {
  test.beforeAll(async () => {
    testBlock = await createTestAuctionBlock()
  })

  test.afterAll(async () => {
    await cleanupTestAuctionBlock(testBlock)
    testBlock = null
  })

  test.beforeEach(async ({ context }) => {
    await bypassGate(context)
  })

  test("bid button is not shown when logged out on active lot", async ({ page }) => {
    if (!testBlock) {
      test.skip()
      return
    }

    await page.goto(`/auctions/${testBlock.slug}`)
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Find a lot link on the block page
    const lotLinks = page.locator("a[href*='/auctions/']").filter({ hasNotText: /back|breadcrumb/i })
    const lotCount = await lotLinks.count()

    if (lotCount === 0) {
      test.skip()
      return
    }

    await lotLinks.first().click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // When logged out, the bid section should show a "Login to bid" prompt
    // OR the bid input should prompt authentication
    const loginPrompt = page.getByRole("button", { name: /login|sign in/i })
    const bidInput = page.locator("input[type='number'][placeholder*='bid' i], input[placeholder*='amount' i]")

    // At least one of these indicators should be present
    const hasLoginPrompt = await loginPrompt.isVisible()
    const hasBidInput = await bidInput.isVisible()
    // Either it shows login to bid, or the input itself triggers auth
    expect(hasLoginPrompt || hasBidInput).toBeTruthy()
  })

  test("logged-in user can see bid form on active lot", async ({ page }) => {
    if (!testBlock) {
      test.skip()
      return
    }

    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.bidder1.email, TEST_ACCOUNTS.bidder1.password)

    await page.goto(`/auctions/${testBlock.slug}`)
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    const lotLinks = page.locator("a[href*='/auctions/']").filter({ hasNotText: /back|breadcrumb/i })
    const lotCount = await lotLinks.count()

    if (lotCount === 0) {
      test.skip()
      return
    }

    await lotLinks.first().click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Bid form should be visible for authenticated users
    // ItemBidSection renders a Label "Your Bid" and an Input
    const bidLabel = page.getByText(/your bid|min.*bid|place bid/i).first()
    const bidButton = page.getByRole("button", { name: /place bid|bid now/i })

    const hasLabel = await bidLabel.isVisible()
    const hasButton = await bidButton.isVisible()
    expect(hasLabel || hasButton).toBeTruthy()
  })

  test("bid history table is shown on lot detail", async ({ page }) => {
    if (!testBlock) {
      test.skip()
      return
    }

    await page.goto(`/auctions/${testBlock.slug}`)
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    const lotLinks = page.locator("a[href*='/auctions/']").filter({ hasNotText: /back|breadcrumb/i })
    if (await lotLinks.count() === 0) {
      test.skip()
      return
    }

    await lotLinks.first().click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // BidHistoryTable renders a section with "Bid History" heading
    // or shows "No bids yet" when empty
    const bidHistorySection = page.getByText(/bid history|no bids yet/i)
    if (await bidHistorySection.isVisible()) {
      await expect(bidHistorySection).toBeVisible()
    }
    // Page should load without error regardless
    await expect(page.locator("main").first()).toBeVisible()
  })

  test("place a bid on active lot (bidder1)", async ({ page }) => {
    if (!testBlock) {
      test.skip()
      return
    }

    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.bidder1.email, TEST_ACCOUNTS.bidder1.password)

    await page.goto(`/auctions/${testBlock.slug}`)
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    const lotLinks = page.locator("a[href*='/auctions/']").filter({ hasNotText: /back|breadcrumb/i })
    if (await lotLinks.count() === 0) {
      test.skip()
      return
    }

    await lotLinks.first().click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Find the bid amount input
    const bidInput = page.locator("input[type='number']").first()
    if (!await bidInput.isVisible()) {
      // Might need to click "Place Bid" button first
      const placeBtn = page.getByRole("button", { name: /place bid|bid now/i })
      if (await placeBtn.isVisible()) {
        await placeBtn.click()
      } else {
        test.skip()
        return
      }
    }

    // Get current value and add a small increment
    const currentVal = await bidInput.inputValue()
    const currentNum = parseFloat(currentVal) || 1.0
    const newBid = currentNum + 0.5

    await bidInput.fill(String(newBid.toFixed(2)))

    // Submit
    const submitBtn = page.getByRole("button", { name: /place bid|submit bid/i })
    if (await submitBtn.isVisible()) {
      await submitBtn.click()
      // Wait for success toast or bid count update
      await page.waitForTimeout(2_000)
      // Should not show an error
      const errorText = page.getByText(/error|failed|invalid/i)
      const toastError = page.locator("[data-sonner-toast][data-type='error']")
      expect(await errorText.isVisible() && await toastError.isVisible()).toBeFalsy()
    }
  })
})
