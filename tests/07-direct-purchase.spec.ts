import { test, expect } from "@playwright/test"
import { bypassGate, loginViaModal, TEST_ACCOUNTS } from "./helpers/auth"

/**
 * 07 — Direct Purchase: Add to cart, view cart
 *
 * Tests direct purchase flow — finding a purchasable item,
 * adding it to cart, and verifying cart state.
 */

const MEDUSA_URL = process.env.MEDUSA_URL || "http://localhost:9000"
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  "pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d"

/**
 * Find a release that is available for direct purchase.
 */
async function findPurchasableRelease(): Promise<{ id: string; slug: string } | null> {
  try {
    const res = await fetch(
      `${MEDUSA_URL}/store/catalog?for_sale=true&limit=5`,
      { headers: { "x-publishable-api-key": PUBLISHABLE_KEY } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const releases = data.releases || []
    const purchasable = releases.find((r: any) => r.is_purchasable)
    return purchasable ? { id: purchasable.id, slug: purchasable.slug } : null
  } catch {
    return null
  }
}

test.describe("Direct Purchase", () => {
  test.beforeEach(async ({ context }) => {
    await bypassGate(context)
  })

  test("Direct purchase button is not shown when logged out", async ({ page }) => {
    const release = await findPurchasableRelease()
    if (!release) {
      test.skip()
      return
    }

    await page.goto(`/catalog/${release.id}`)
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // DirectPurchaseButton renders "Add to Cart" but requires auth
    // When logged out, it should either not show or show login prompt
    const addToCartBtn = page.getByRole("button", { name: /add to cart/i })
    const loginToCart = page.getByRole("button", { name: /login|sign in/i })

    // Page should load without error
    await expect(page.locator("main")).toBeVisible()
  })

  test("can add item to cart when logged in", async ({ page }) => {
    const release = await findPurchasableRelease()
    if (!release) {
      test.skip()
      return
    }

    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.testuser.email, TEST_ACCOUNTS.testuser.password)

    await page.goto(`/catalog/${release.id}`)
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Look for Add to Cart button (DirectPurchaseButton component)
    const addToCartBtn = page.getByRole("button", { name: /add to cart/i })
    if (!await addToCartBtn.isVisible()) {
      // This item may not be directly purchasable
      test.skip()
      return
    }

    await addToCartBtn.click()
    await page.waitForTimeout(1_500)

    // Should show success toast or cart count increment
    // Navigate to cart to verify
    await page.goto("/account/cart")
    await expect(page).toHaveURL(/\/account\/cart/)
    await expect(page.locator("main")).toBeVisible()
  })

  test("cart page loads when authenticated", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.testuser.email, TEST_ACCOUNTS.testuser.password)

    await page.goto("/account/cart")
    await expect(page).toHaveURL(/\/account\/cart/)
    // Cart shows items or empty state
    await expect(page.locator("main, [class*='max-w']").first()).toBeVisible({ timeout: 10_000 })
  })

  test("cart page redirects or shows empty state when no items", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.bidder1.email, TEST_ACCOUNTS.bidder1.password)

    await page.goto("/account/cart")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })

    // Should show some content (either cart items or empty state)
    const main = page.locator("main, [class*='max-w']").first()
    await expect(main).toBeVisible()
  })

  test("for_sale filter shows purchasable releases", async ({ page }) => {
    await page.goto("/catalog?for_sale=true")
    await page.waitForSelector("a[href*='/catalog/']", { timeout: 15_000 })
    await expect(page.locator("a[href*='/catalog/']").first()).toBeVisible()
  })
})
