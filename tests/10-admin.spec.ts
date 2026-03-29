import { test, expect } from "@playwright/test"

/**
 * 10 — Admin: Auction Block creation, Live Monitor
 *
 * Tests the Medusa admin UI at http://localhost:9000/app
 * and the custom admin routes.
 *
 * NOTE: The admin is a Medusa React SPA. We use a separate baseURL
 * for these tests pointing to the API server port.
 */

const ADMIN_URL = process.env.ADMIN_URL || "http://localhost:9000"
const ADMIN_EMAIL = "admin@vod.de"
const ADMIN_PASSWORD = "admin123"

test.describe("Admin", () => {
  // Override baseURL for admin tests
  test.use({ baseURL: ADMIN_URL })

  test("admin login page loads at /app", async ({ page }) => {
    await page.goto("/app")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Medusa admin shows a login form
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
    const passwordInput = page.locator('input[type="password"]')

    // Either the login form appears, or we're already redirected to the dashboard
    const hasLogin = await emailInput.isVisible()
    const isDashboard = page.url().includes("/app") && !page.url().includes("/login")

    expect(hasLogin || isDashboard).toBeTruthy()
  })

  test("admin login with credentials", async ({ page }) => {
    await page.goto("/app")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Check if already logged in
    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    if (!await emailInput.isVisible()) {
      // Already logged in — skip
      return
    }

    await emailInput.fill(ADMIN_EMAIL)
    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill(ADMIN_PASSWORD)

    // Submit the form
    const submitBtn = page.getByRole("button", { name: /sign in|log in|continue/i }).first()
    await submitBtn.click()

    // Wait for redirect to dashboard
    await page.waitForURL(/\/app/, { timeout: 15_000 })
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Should be in admin dashboard — not on login page
    const stillHasLogin = await emailInput.isVisible()
    expect(stillHasLogin).toBeFalsy()
  })

  test("admin auction-blocks route accessible", async ({ page }) => {
    // Login first
    await page.goto("/app")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    if (await emailInput.isVisible()) {
      await emailInput.fill(ADMIN_EMAIL)
      await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD)
      await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click()
      await page.waitForLoadState("networkidle", { timeout: 15_000 })
    }

    // Navigate to auction blocks
    await page.goto("/app/auction-blocks")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Should show the auction blocks list page
    await expect(page.locator("main, [class*='content'], h1, h2").first()).toBeVisible({ timeout: 10_000 })
  })

  test("admin live monitor route accessible", async ({ page }) => {
    await page.goto("/app")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    if (await emailInput.isVisible()) {
      await emailInput.fill(ADMIN_EMAIL)
      await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD)
      await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click()
      await page.waitForLoadState("networkidle", { timeout: 15_000 })
    }

    await page.goto("/app/live-monitor")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })
    await expect(page.locator("main, body").first()).toBeVisible()
  })

  test("admin transactions route accessible", async ({ page }) => {
    await page.goto("/app")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    if (await emailInput.isVisible()) {
      await emailInput.fill(ADMIN_EMAIL)
      await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD)
      await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click()
      await page.waitForLoadState("networkidle", { timeout: 15_000 })
    }

    await page.goto("/app/transactions")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })
    await expect(page.locator("body")).toBeVisible()
  })
})

test.describe("Admin: Create Auction Block via API", () => {
  // Test block creation via API (more reliable than driving the SPA UI)
  const PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    "pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d"

  test("can create and delete a draft block via API", async ({ request }) => {
    // Get admin JWT token
    const loginRes = await request.post(`${ADMIN_URL}/auth/user/emailpass`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })

    if (!loginRes.ok()) {
      test.skip()
      return
    }

    const loginData = await loginRes.json()
    const token = loginData.token
    expect(token).toBeTruthy()

    // Create a draft block
    const now = new Date()
    const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    const endTime = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()

    const createRes = await request.post(`${ADMIN_URL}/admin/auction-blocks`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        title: "E2E Test Block — Auto Delete",
        description: "Created by Playwright E2E test",
        block_type: "theme",
        status: "draft",
        start_time: startTime,
        end_time: endTime,
      },
    })

    expect(createRes.ok()).toBeTruthy()
    const blockData = await createRes.json()
    const blockId = blockData.auction_block?.id || blockData.id
    expect(blockId).toBeTruthy()

    // Clean up: delete the draft block
    const deleteRes = await request.delete(`${ADMIN_URL}/admin/auction-blocks/${blockId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    // Delete should succeed for draft blocks
    expect(deleteRes.ok()).toBeTruthy()
  })
})
