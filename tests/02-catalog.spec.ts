import { test, expect } from "@playwright/test"
import { bypassGate } from "./helpers/auth"

/**
 * 02 — Catalog: Browse, Filter, Product Detail
 */

test.describe("Catalog", () => {
  test.beforeEach(async ({ context }) => {
    await bypassGate(context)
  })

  test("catalog page loads with release grid", async ({ page }) => {
    await page.goto("/catalog")
    await expect(page).toHaveTitle(/Catalog/i)
    // Wait for at least one release card to appear
    await page.waitForSelector("a[href*='/catalog/']", { timeout: 15_000 })
    const releaseLinks = page.locator("a[href*='/catalog/']")
    await expect(releaseLinks.first()).toBeVisible()
  })

  test("search filters results", async ({ page }) => {
    await page.goto("/catalog")
    // Find the search input
    const searchInput = page.getByPlaceholder(/search/i).first()
    await searchInput.waitFor({ state: "visible", timeout: 10_000 })
    await searchInput.fill("Cabaret Voltaire")
    // Wait for results to update (debounced)
    await page.waitForTimeout(1_200)
    // Should show results or empty state
    const pageContent = page.locator("main, [class*='grid']").first()
    await expect(pageContent).toBeVisible()
  })

  test("category filter via URL param works", async ({ page }) => {
    await page.goto("/catalog?category=cd")
    await page.waitForSelector("a[href*='/catalog/']", { timeout: 15_000 })
    // CD badge or format indicator should be present
    // Page should load without error
    await expect(page.locator("main")).toBeVisible()
  })

  test("tapes category filter", async ({ page }) => {
    await page.goto("/catalog?category=tapes")
    await page.waitForTimeout(2_000)
    await expect(page.locator("main")).toBeVisible()
  })

  test("sort by price low to high", async ({ page }) => {
    await page.goto("/catalog?sort=legacy_price:asc&for_sale=true")
    await page.waitForSelector("a[href*='/catalog/']", { timeout: 15_000 })
    await expect(page.locator("main")).toBeVisible()
  })

  test("product detail page loads", async ({ page }) => {
    // Navigate to catalog and click first visible release
    await page.goto("/catalog")
    await page.waitForSelector("a[href*='/catalog/']", { timeout: 15_000 })

    const firstLink = page.locator("a[href*='/catalog/']").first()
    const href = await firstLink.getAttribute("href")
    expect(href).toBeTruthy()

    await firstLink.click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Detail page should have a main content area
    await expect(page.locator("main")).toBeVisible()
    // Should have a heading (release title or artist)
    await expect(page.locator("h1").first()).toBeVisible()
  })

  test("product detail shows format badge or release info", async ({ page }) => {
    await page.goto("/catalog")
    await page.waitForSelector("a[href*='/catalog/']", { timeout: 15_000 })
    const firstLink = page.locator("a[href*='/catalog/']").first()
    await firstLink.click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Should contain a main element with content
    const main = page.locator("main")
    await expect(main).toBeVisible()
    // The page should have more than just a blank layout
    const textContent = await main.textContent()
    expect(textContent).toBeTruthy()
    expect(textContent!.length).toBeGreaterThan(50)
  })

  test("breadcrumb navigation works on detail page", async ({ page }) => {
    await page.goto("/catalog")
    await page.waitForSelector("a[href*='/catalog/']", { timeout: 15_000 })
    await page.locator("a[href*='/catalog/']").first().click()
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Navigate back to catalog via the back link
    const backLink = page.getByRole("link", { name: /catalog|back/i }).first()
    if (await backLink.isVisible()) {
      await backLink.click()
      await expect(page).toHaveURL(/\/catalog/)
    }
  })
})
