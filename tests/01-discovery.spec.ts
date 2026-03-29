import { test, expect } from "@playwright/test"

/**
 * 01 — Discovery: Password Gate + Homepage
 *
 * Tests the pre-launch password gate and basic homepage content.
 * This spec tests the gate WITH and WITHOUT bypass.
 */

const GATE_PASSWORD = "vod2026"

test.describe("Password Gate", () => {
  test("redirects to /gate when no access cookie is set", async ({ page }) => {
    // Go to homepage WITHOUT the gate cookie
    const response = await page.goto("/")
    // After redirect, should be on /gate
    await expect(page).toHaveURL(/\/gate/)
    await expect(page.getByText("Coming Soon")).toBeVisible()
    await expect(page.getByPlaceholder("Enter password")).toBeVisible()
  })

  test("shows error for wrong password", async ({ page }) => {
    await page.goto("/gate")
    await page.getByPlaceholder("Enter password").fill("wrongpassword")
    await page.getByRole("button", { name: "Enter" }).click()
    await expect(page.getByText("Incorrect password")).toBeVisible()
  })

  test("grants access with correct password and redirects to homepage", async ({ page }) => {
    await page.goto("/gate")
    await page.getByPlaceholder("Enter password").fill(GATE_PASSWORD)
    await page.getByRole("button", { name: "Enter" }).click()

    // Should redirect to homepage
    await expect(page).toHaveURL("/", { timeout: 10_000 })
    await expect(page.getByRole("main")).toBeVisible()
  })
})

test.describe("Homepage", () => {
  test.beforeEach(async ({ context }) => {
    // Bypass gate with cookie — domain derived from BASE_URL
    const baseUrl = process.env.BASE_URL || "http://localhost:3000"
    const domain = new URL(baseUrl).hostname
    await context.addCookies([
      {
        name: "vod_access",
        value: "granted",
        domain,
        path: "/",
        secure: domain !== "localhost",
      },
    ])
  })

  test("loads homepage with hero section", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/VOD Auctions/)
    // Hero heading visible (either "Rare Records." or custom CMS content)
    await expect(page.locator("h1").first()).toBeVisible()
  })

  test("homepage has navigation links", async ({ page }) => {
    await page.goto("/")
    // Navigation should have Auctions + Catalog links
    const nav = page.locator("header, nav").first()
    await expect(nav).toBeVisible()
    // Look for catalog and auctions links somewhere on the page
    const catalogLink = page.getByRole("link", { name: /catalog/i }).first()
    await expect(catalogLink).toBeVisible()
  })

  test("homepage has Login button in header when not authenticated", async ({ page }) => {
    await page.goto("/")
    const loginButton = page.getByRole("button", { name: "Login" })
    await expect(loginButton).toBeVisible()
  })

  test("Browse Catalog button navigates to /catalog", async ({ page }) => {
    await page.goto("/")
    const catalogButton = page.getByRole("link", { name: /Browse Catalog/i }).first()
    await expect(catalogButton).toBeVisible()
    await catalogButton.click()
    await expect(page).toHaveURL(/\/catalog/)
  })
})
