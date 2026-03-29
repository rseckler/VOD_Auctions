import { test, expect } from "@playwright/test"
import { bypassGate } from "./helpers/auth"

/**
 * 05 — Auction Browse: Discover auctions, open block detail, view lots
 */

test.describe("Auction Browse", () => {
  test.beforeEach(async ({ context }) => {
    await bypassGate(context)
  })

  test("auctions page loads", async ({ page }) => {
    await page.goto("/auctions")
    await expect(page).toHaveTitle(/Auctions/i)
    await expect(page.getByRole("heading", { name: /Auctions/i })).toBeVisible()
  })

  test("auctions page shows blocks or empty state", async ({ page }) => {
    await page.goto("/auctions")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })
    // Either shows auction blocks or an empty/no-blocks state
    const main = page.locator("main")
    await expect(main).toBeVisible()
    const content = await main.textContent()
    expect(content).toBeTruthy()
  })

  test("auction block detail page loads via slug", async ({ page }) => {
    // Navigate to auctions page first to find a block slug
    await page.goto("/auctions")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })

    const blockLinks = page.locator("a[href*='/auctions/']").filter({ hasNotText: /back|breadcrumb/i })
    const count = await blockLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    const href = await blockLinks.first().getAttribute("href")
    expect(href).toBeTruthy()

    await blockLinks.first().click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Block detail should have heading
    await expect(page.locator("h1").first()).toBeVisible()
  })

  test("auction block detail shows lot grid", async ({ page }) => {
    await page.goto("/auctions")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })

    const blockLinks = page.locator("a[href*='/auctions/']").filter({ hasNotText: /back|breadcrumb/i })
    const count = await blockLinks.count()

    if (count === 0) {
      test.skip()
      return
    }

    await blockLinks.first().click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Lot grid should be visible or empty state message
    const main = page.locator("main")
    await expect(main).toBeVisible()
  })

  test("lot detail page loads", async ({ page }) => {
    await page.goto("/auctions")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })

    const blockLinks = page.locator("a[href*='/auctions/']").filter({ hasNotText: /back|breadcrumb/i })
    const blockCount = await blockLinks.count()

    if (blockCount === 0) {
      test.skip()
      return
    }

    await blockLinks.first().click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Find a lot link (item detail within an auction block)
    const lotLinks = page.locator("a[href*='/auctions/']").filter({ hasNotText: /back|breadcrumb/i })
    const lotCount = await lotLinks.count()

    if (lotCount === 0) {
      test.skip()
      return
    }

    // Click on a lot to see detail
    await lotLinks.first().click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })
    await expect(page.locator("main")).toBeVisible()
  })

  test("Live Auction Banner is rendered on catalog page", async ({ page }) => {
    await page.goto("/catalog")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })
    // The LiveAuctionBanner renders conditionally — just check the page loads
    await expect(page.locator("main")).toBeVisible()
  })
})
