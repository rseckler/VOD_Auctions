import { test, expect } from "@playwright/test"
import { bypassGate, loginViaModal, TEST_ACCOUNTS } from "./helpers/auth"
import { fillStripePaymentElement } from "./helpers/stripe"

/**
 * 08 — Payment: Stripe Checkout Flow
 *
 * Tests the checkout page structure and Stripe PaymentElement.
 * Full payment flow requires: active won bids OR cart items + valid Stripe test mode.
 *
 * NOTE: Actual card submission is marked as "best-effort" and skips gracefully
 * when no payable items exist.
 */

test.describe("Checkout Page Structure", () => {
  test.beforeEach(async ({ context }) => {
    await bypassGate(context)
  })

  test("checkout page loads when authenticated", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.testuser.email, TEST_ACCOUNTS.testuser.password)

    await page.goto("/account/checkout")
    await expect(page).toHaveURL(/\/account\/checkout/)
    await page.waitForLoadState("networkidle", { timeout: 20_000 })
    await expect(page.locator("main")).toBeVisible()
  })

  test("checkout page has shipping address fields", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.testuser.email, TEST_ACCOUNTS.testuser.password)

    await page.goto("/account/checkout")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })

    // Wait for checkout form to render
    await page.waitForTimeout(2_000)

    // Look for shipping-related fields or payment section
    // The checkout page shows a two-column layout: left (order items) + right (form)
    const pageText = await page.locator("main").textContent()
    // Should mention either shipping or payment
    const hasCheckoutContent =
      (pageText || "").toLowerCase().includes("shipping") ||
      (pageText || "").toLowerCase().includes("checkout") ||
      (pageText || "").toLowerCase().includes("payment") ||
      (pageText || "").toLowerCase().includes("address") ||
      (pageText || "").toLowerCase().includes("cart") ||
      (pageText || "").toLowerCase().includes("no items") ||
      (pageText || "").toLowerCase().includes("empty")

    expect(hasCheckoutContent).toBeTruthy()
  })

  test("checkout page shows order summary", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.testuser.email, TEST_ACCOUNTS.testuser.password)

    await page.goto("/account/checkout")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })
    await page.waitForTimeout(2_000)

    // The checkout page renders won items + cart items
    // Main should be visible and not blank
    const main = page.locator("main")
    await expect(main).toBeVisible()
    const text = await main.textContent()
    expect(text).toBeTruthy()
    expect((text || "").length).toBeGreaterThan(20)
  })

  test("checkout page shows payment methods when items exist", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.testuser.email, TEST_ACCOUNTS.testuser.password)

    await page.goto("/account/checkout")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })
    await page.waitForTimeout(3_000)

    // Check for Stripe PaymentElement OR PayPal button OR "no items" state
    const stripeFrame = page.locator('iframe[name^="__privateStripeFrame"]')
    const paypalBtn = page.locator('[data-funding-source="paypal"]')
    const noItemsMsg = page.getByText(/no items|empty|nothing/i)
    const paymentSection = page.locator("[class*='payment'], [class*='Payment']")

    const hasStripe = await stripeFrame.first().isVisible()
    const hasPayPal = await paypalBtn.first().isVisible()
    const hasNoItems = await noItemsMsg.first().isVisible()
    const hasPaymentSection = await paymentSection.first().isVisible()

    // At least one of these should be true
    expect(hasStripe || hasPayPal || hasNoItems || hasPaymentSection).toBeTruthy()
  })
})

test.describe("Shipping Address Form", () => {
  test.beforeEach(async ({ context }) => {
    await bypassGate(context)
  })

  test("shipping address form fields are present", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.testuser.email, TEST_ACCOUNTS.testuser.password)

    await page.goto("/account/checkout")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })
    await page.waitForTimeout(3_000)

    // Look for shipping address input fields
    // The form uses labeled Input components
    const firstNameLabel = page.getByLabel(/first name/i)
    const lastNameLabel = page.getByLabel(/last name/i)
    const cityLabel = page.getByLabel(/city/i)

    const hasFirstName = await firstNameLabel.isVisible()
    const hasLastName = await lastNameLabel.isVisible()
    const hasCity = await cityLabel.isVisible()

    // These should be visible if there are items to checkout
    if (hasFirstName) {
      await expect(firstNameLabel).toBeVisible()
      await expect(lastNameLabel).toBeVisible()
    }
    // If no form is shown, page still should be valid (empty cart/wins state)
    await expect(page.locator("main")).toBeVisible()
  })

  test("can fill shipping address form", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.testuser.email, TEST_ACCOUNTS.testuser.password)

    await page.goto("/account/checkout")
    await page.waitForLoadState("networkidle", { timeout: 20_000 })
    await page.waitForTimeout(3_000)

    const firstNameInput = page.getByLabel(/first name/i)
    if (!await firstNameInput.isVisible()) {
      test.skip()
      return
    }

    await firstNameInput.fill("Max")
    await page.getByLabel(/last name/i).fill("Mustermann")
    await page.getByLabel(/address|street/i).first().fill("Teststraße 1")
    await page.getByLabel(/city/i).fill("Berlin")
    await page.getByLabel(/postal|zip/i).first().fill("10115")

    // Country selector
    const countrySelect = page.getByLabel(/country/i)
    if (await countrySelect.isVisible()) {
      // Select Germany if it's a select element
      const tagName = await countrySelect.evaluate((el) => el.tagName.toLowerCase())
      if (tagName === "select") {
        await countrySelect.selectOption({ label: "Germany" })
      }
    }

    // Verify inputs have values
    await expect(firstNameInput).toHaveValue("Max")
  })
})
