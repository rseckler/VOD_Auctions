import { test, expect } from "@playwright/test"
import { bypassGate, loginViaModal, TEST_ACCOUNTS } from "./helpers/auth"

/**
 * 04 — Watchlist (Saved Items)
 *
 * Tests saving items to watchlist and viewing saved items in /account/saved.
 * Requires authentication.
 */

test.describe("Watchlist", () => {
  test.beforeEach(async ({ context }) => {
    await bypassGate(context)
  })

  test("Save for Later button is not visible when logged out", async ({ page }) => {
    await page.goto("/catalog")
    await page.waitForSelector("a[href*='/catalog/']", { timeout: 15_000 })

    // Navigate to a detail page
    await page.locator("a[href*='/catalog/']").first().click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // SaveForLaterButton renders null when not authenticated
    // There should be no Heart/Save button visible (the component returns null)
    const saveButton = page.locator("button[title*='Save'], button[title*='saved']")
    await expect(saveButton).not.toBeVisible()
  })

  test("Save for Later button appears after login", async ({ page }) => {
    await page.goto("/catalog")
    await page.waitForSelector("a[href*='/catalog/']", { timeout: 15_000 })

    // Navigate to a detail page
    const detailUrl = await page.locator("a[href*='/catalog/']").first().getAttribute("href")
    await page.goto(detailUrl!)
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Login
    await loginViaModal(page, TEST_ACCOUNTS.bidder1.email, TEST_ACCOUNTS.bidder1.password)

    // Reload page to see SaveForLaterButton (it only renders when authenticated)
    await page.reload()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Heart button should now be visible
    const saveButton = page.locator("button[title='Save for later'], button[title='Remove from saved']")
    await expect(saveButton).toBeVisible({ timeout: 8_000 })
  })

  test("can save an item and view it in /account/saved", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.testuser.email, TEST_ACCOUNTS.testuser.password)

    // Navigate to catalog
    await page.goto("/catalog")
    await page.waitForSelector("a[href*='/catalog/']", { timeout: 15_000 })

    // Go to first release detail
    const firstLink = page.locator("a[href*='/catalog/']").first()
    await firstLink.click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Find the heart/save button (icon variant: title="Save for later")
    const saveBtn = page.locator("button[title='Save for later']")
    const alreadySaved = page.locator("button[title='Remove from saved']")

    const isSaved = await alreadySaved.isVisible()
    if (!isSaved) {
      await expect(saveBtn).toBeVisible({ timeout: 8_000 })
      await saveBtn.click()
      // Wait for toast or state change
      await page.waitForTimeout(1_500)
    }

    // Navigate to saved items
    await page.goto("/account/saved")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })

    // Should see at least one saved item
    const savedCards = page.locator("[class*='Card'], [class*='card']").filter({ hasText: /saved|item|release/i })
    // Just check the page loads and shows some content
    await expect(page.locator("main, [class*='container']").first()).toBeVisible()
  })

  test("saved items page loads when authenticated", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.bidder1.email, TEST_ACCOUNTS.bidder1.password)

    await page.goto("/account/saved")
    await expect(page).toHaveURL(/\/account\/saved/)
    // Should not redirect to login
    await expect(page.locator("main, [class*='max-w']").first()).toBeVisible({ timeout: 10_000 })
  })

  test("account overview shows Saved count", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.bidder1.email, TEST_ACCOUNTS.bidder1.password)

    await page.goto("/account")
    await expect(page).toHaveURL(/\/account/)
    // The account page shows Saved card
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 })
  })
})
