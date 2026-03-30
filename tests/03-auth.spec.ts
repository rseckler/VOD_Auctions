import { test, expect } from "@playwright/test"
import { bypassGate, loginViaModal, TEST_ACCOUNTS } from "./helpers/auth"

/**
 * 03 — Authentication: Register, Login, Logout
 */

test.describe("Login", () => {
  test.beforeEach(async ({ context }) => {
    await bypassGate(context)
  })

  test("Login button opens auth modal", async ({ page }) => {
    await page.goto("/")
    const loginBtn = page.getByRole("button", { name: "Login" })
    await expect(loginBtn).toBeVisible()
    await loginBtn.click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("Login").first()).toBeVisible()
    await expect(dialog.locator("#email")).toBeVisible()
    await expect(dialog.locator("#password")).toBeVisible()
  })

  test("modal shows error for wrong credentials", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Login" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.waitFor({ state: "visible" })

    await dialog.locator("#email").fill("notexist@example.com")
    await dialog.locator("#password").fill("wrongpassword")
    await dialog.getByRole("button", { name: "Login" }).click()

    await expect(dialog.getByText("Invalid email or password")).toBeVisible({ timeout: 8_000 })
  })

  test("successful login with bidder1 account", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.bidder1.email, TEST_ACCOUNTS.bidder1.password)

    // After login, the modal should be gone and we should see the user avatar/name
    await expect(page.getByRole("dialog")).not.toBeVisible()
    // Header should show user avatar (Avatar component) or the user's name
    // The Login button should no longer be visible
    await expect(page.getByRole("button", { name: "Login" })).not.toBeVisible()
  })

  test("successful login with testuser account", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.testuser.email, TEST_ACCOUNTS.testuser.password)
    await expect(page.getByRole("button", { name: "Login" })).not.toBeVisible()
  })

  test("modal switches to Register mode", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Login" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.waitFor({ state: "visible" })

    // Click the "Register" link inside the modal
    await dialog.getByRole("button", { name: "Register" }).click()

    // Register fields should appear
    await expect(dialog.locator("#firstName")).toBeVisible()
    await expect(dialog.locator("#lastName")).toBeVisible()
    await expect(dialog.locator("#confirmPassword")).toBeVisible()
    await expect(dialog.getByText("Create Account")).toBeVisible()
  })

  test("modal switches to Forgot Password mode", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Login" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.waitFor({ state: "visible" })

    // Click "Forgot password?" button
    await dialog.getByText("Forgot password?").click()
    await expect(dialog.getByText("Reset Password")).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Send Reset Link" })).toBeVisible()
  })
})

test.describe("Register", () => {
  test.beforeEach(async ({ context }) => {
    await bypassGate(context)
  })

  test("register new account with random email", async ({ page }) => {
    const randomEmail = `test-${Date.now()}@e2e-vod.test`
    const password = "TestPass2026!"

    await page.goto("/")
    await page.getByRole("button", { name: "Login" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.waitFor({ state: "visible" })

    // Switch to register
    await dialog.getByRole("button", { name: "Register" }).click()
    await dialog.locator("#firstName").waitFor({ state: "visible" })

    // Fill form
    await dialog.locator("#firstName").fill("E2E")
    await dialog.locator("#lastName").fill("Tester")
    await dialog.locator("#email").fill(randomEmail)
    await dialog.locator("#password").fill(password)
    await dialog.locator("#confirmPassword").fill(password)

    // Accept T&C (first checkbox)
    await dialog.locator('input[type="checkbox"]').first().check()

    // Submit
    await dialog.getByRole("button", { name: "Create Account" }).click()

    // Should close modal on success
    await expect(dialog).not.toBeVisible({ timeout: 12_000 })
    // Login button should no longer appear
    await expect(page.getByRole("button", { name: "Login" })).not.toBeVisible({ timeout: 5_000 })
  })

  test("register shows validation error for mismatched passwords", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Login" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.waitFor({ state: "visible" })
    await dialog.getByRole("button", { name: "Register" }).click()
    await dialog.locator("#firstName").waitFor({ state: "visible" })

    await dialog.locator("#firstName").fill("Test")
    await dialog.locator("#lastName").fill("User")
    await dialog.locator("#email").fill(`mismatched-${Date.now()}@test.com`)
    await dialog.locator("#password").fill("Password123!")
    await dialog.locator("#confirmPassword").fill("DifferentPassword!")
    await dialog.locator('input[type="checkbox"]').first().check()
    await dialog.getByRole("button", { name: "Create Account" }).click()

    await expect(dialog.getByText("Passwords do not match")).toBeVisible()
  })

  test("register shows error when T&C not accepted", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Login" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.waitFor({ state: "visible" })
    await dialog.getByRole("button", { name: "Register" }).click()
    await dialog.locator("#firstName").waitFor({ state: "visible" })

    await dialog.locator("#firstName").fill("Test")
    await dialog.locator("#lastName").fill("User")
    await dialog.locator("#email").fill(`noagb-${Date.now()}@test.com`)
    await dialog.locator("#password").fill("Password123!")
    await dialog.locator("#confirmPassword").fill("Password123!")
    // Do NOT check T&C checkbox

    await dialog.getByRole("button", { name: "Create Account" }).click()
    await expect(dialog.getByText("Terms & Conditions").first()).toBeVisible()
  })
})

test.describe("Logout", () => {
  test.beforeEach(async ({ context }) => {
    await bypassGate(context)
  })

  test("user can logout via header dropdown", async ({ page }) => {
    await page.goto("/")
    await loginViaModal(page, TEST_ACCOUNTS.bidder1.email, TEST_ACCOUNTS.bidder1.password)

    // User is logged in — header shows Avatar dropdown
    await page.locator("header button[class*='rounded-full']").waitFor({ state: "visible", timeout: 5_000 })
    await page.locator("header button[class*='rounded-full']").click()

    const dropdown = page.getByRole("menu")
    await dropdown.waitFor({ state: "visible", timeout: 5_000 })

    // Handle window.confirm before clicking Logout
    page.once("dialog", (dialog) => dialog.accept())
    await dropdown.getByText("Logout").click()

    // After logout, Login button should reappear
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible({ timeout: 8_000 })
  })
})
