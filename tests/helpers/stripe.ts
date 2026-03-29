import { Page } from "@playwright/test"

/**
 * Fill in Stripe test card details inside the Stripe PaymentElement iframe.
 * The PaymentElement renders inside an iframe with a name matching __privateStripeFrame.
 *
 * Test card: 4242 4242 4242 4242
 * Expiry:    12/29
 * CVC:       123
 */
export async function fillStripeCard(
  page: Page,
  options: {
    cardNumber?: string
    expiry?: string
    cvc?: string
    zip?: string
  } = {}
) {
  const {
    cardNumber = "4242424242424242",
    expiry = "1229",
    cvc = "123",
    zip = "10115",
  } = options

  // Locate the Stripe iframe — Stripe v3 renders the card field inside
  // an iframe whose name starts with "__privateStripeFrame"
  const stripeFrame = page
    .frameLocator('iframe[name^="__privateStripeFrame"]')
    .or(page.frameLocator('iframe[title*="Secure card number"]'))
    .or(page.frameLocator('iframe[src*="js.stripe.com"]').first())

  // For PaymentElement (unified), try the card number field
  const cardInput = stripeFrame.locator('[placeholder*="1234"], [name="number"], input').first()

  try {
    await cardInput.waitFor({ state: "visible", timeout: 10_000 })
    await cardInput.fill(cardNumber)

    // Tab to expiry field
    await cardInput.press("Tab")
    await page.keyboard.type(expiry)

    // Tab to CVC
    await page.keyboard.press("Tab")
    await page.keyboard.type(cvc)

    // Tab to ZIP if needed
    await page.keyboard.press("Tab")
    await page.keyboard.type(zip)
  } catch {
    // Stripe frame structure may vary — log and continue
    console.warn("Stripe card fill: could not locate card input in iframe")
  }
}

/**
 * Fill Stripe PaymentElement (new unified element).
 * This version iterates over the iframes that Stripe renders for
 * cardNumber, cardExpiry, and cardCvc separately in some configurations.
 */
export async function fillStripePaymentElement(
  page: Page,
  options: {
    cardNumber?: string
    expiry?: string
    cvc?: string
  } = {}
) {
  const {
    cardNumber = "4242424242424242",
    expiry = "1229",
    cvc = "123",
  } = options

  // Wait for Stripe iframes to be present
  await page.waitForSelector('iframe[name^="__privateStripeFrame"]', {
    timeout: 15_000,
  })

  const frames = page.frames()
  let cardFilled = false

  for (const frame of frames) {
    // Try to fill card number
    const cardNumberInput = frame.locator('[data-elements-stable-field-name="cardNumber"], [name="cardnumber"], input[placeholder*="card number" i], input[placeholder*="1234"]')
    const count = await cardNumberInput.count()
    if (count > 0 && !cardFilled) {
      await cardNumberInput.first().fill(cardNumber)
      cardFilled = true
    }

    // Try to fill expiry
    const expiryInput = frame.locator('[data-elements-stable-field-name="cardExpiry"], [name="exp-date"], input[placeholder*="MM"], input[placeholder*="expir" i]')
    if (await expiryInput.count() > 0) {
      await expiryInput.first().fill(expiry)
    }

    // Try to fill CVC
    const cvcInput = frame.locator('[data-elements-stable-field-name="cardCvc"], [name="cvc"], input[placeholder*="CVC"], input[placeholder*="CVV"]')
    if (await cvcInput.count() > 0) {
      await cvcInput.first().fill(cvc)
    }
  }
}
