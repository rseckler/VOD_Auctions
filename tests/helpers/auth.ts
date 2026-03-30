import { Page, BrowserContext } from "@playwright/test"

/**
 * Bypass the password gate by setting the cookie directly.
 * Call this in beforeEach for every test except the gate test itself.
 */
export async function bypassGate(context: BrowserContext) {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000"
  const domain = new URL(baseUrl).hostname
  await context.addCookies([
    {
      name: "vod_access",
      value: "granted",
      domain,
      path: "/",
      httpOnly: false,
      secure: domain !== "localhost",
    },
  ])
}

/**
 * Login via the header Login button → AuthModal dialog.
 * The modal uses shadcn Dialog with input IDs #email and #password.
 */
export async function loginViaModal(
  page: Page,
  email: string,
  password: string
) {
  // Open the login modal from the header
  await page.getByRole("button", { name: "Login" }).click()

  // Wait for the dialog to appear
  const dialog = page.getByRole("dialog")
  await dialog.waitFor({ state: "visible" })

  // Fill credentials
  await dialog.locator("#email").fill(email)
  await dialog.locator("#password").fill(password)

  // Submit
  await dialog.getByRole("button", { name: "Login" }).click()

  // Wait for dialog to close (login success)
  await dialog.waitFor({ state: "hidden", timeout: 10_000 })
}

/**
 * Register a new account via the AuthModal.
 * Switches to register mode first.
 */
export async function registerViaModal(
  page: Page,
  email: string,
  password: string,
  firstName: string = "Test",
  lastName: string = "User"
) {
  // Open the login modal
  await page.getByRole("button", { name: "Login" }).click()

  const dialog = page.getByRole("dialog")
  await dialog.waitFor({ state: "visible" })

  // Switch to Register mode
  await dialog.getByRole("button", { name: "Register" }).click()

  // Wait for register form fields
  await dialog.locator("#firstName").waitFor({ state: "visible" })

  // Fill registration fields
  await dialog.locator("#firstName").fill(firstName)
  await dialog.locator("#lastName").fill(lastName)
  await dialog.locator("#email").fill(email)
  await dialog.locator("#password").fill(password)
  await dialog.locator("#confirmPassword").fill(password)

  // Accept Terms & Conditions (required)
  const agbCheckbox = dialog.locator('input[type="checkbox"]').first()
  await agbCheckbox.check()

  // Submit
  await dialog.getByRole("button", { name: "Create Account" }).click()

  // Wait for dialog to close (registration success)
  await dialog.waitFor({ state: "hidden", timeout: 10_000 })
}

/**
 * Logout via the user dropdown menu in the header.
 */
export async function logoutViaHeader(page: Page) {
  // Click the Avatar dropdown trigger (rounded-full button in header)
  const avatarBtn = page.locator("header button[class*='rounded-full']")
  await avatarBtn.waitFor({ state: "visible", timeout: 5_000 })
  await avatarBtn.click()

  // Wait for dropdown
  const dropdown = page.getByRole("menu")
  await dropdown.waitFor({ state: "visible", timeout: 5_000 })

  // Handle window.confirm before clicking Logout
  page.once("dialog", (dialog) => dialog.accept())

  // Click Logout
  await dropdown.getByText("Logout").click()
  await page.waitForTimeout(500)
}

/**
 * Test accounts available in the system.
 */
export const TEST_ACCOUNTS = {
  bidder1: { email: "bidder1@test.de", password: "test1234" },
  bidder2: { email: "bidder2@test.de", password: "test1234" },
  testuser: { email: "testuser@vod-auctions.com", password: "TestPass123!" },
  admin: { email: "admin@vod.de", password: "admin123" },
}
