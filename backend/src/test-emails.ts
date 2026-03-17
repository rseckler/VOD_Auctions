/**
 * Test script: Send all 6 transactional email templates to a test address.
 *
 * Usage: npx tsx src/test-emails.ts rseckler@gmail.com
 *
 * Requires: RESEND_API_KEY in .env
 */

import { config } from "dotenv"
config()

import { Resend } from "resend"
import { welcomeEmail } from "./emails/welcome"
import { outbidEmail } from "./emails/outbid"
import { bidWonEmail } from "./emails/bid-won"
import { paymentConfirmationEmail } from "./emails/payment-confirmation"
import { shippingEmail } from "./emails/shipping"
import { feedbackRequestEmail } from "./emails/feedback-request"

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM = process.env.EMAIL_FROM || "VOD Auctions <noreply@vod-auctions.com>"
const APP_URL = "https://vod-auctions.com"

if (!RESEND_API_KEY) {
  console.error("ERROR: RESEND_API_KEY not set in .env")
  process.exit(1)
}

const to = process.argv[2]
if (!to) {
  console.error("Usage: npx tsx src/test-emails.ts <email>")
  process.exit(1)
}

const resend = new Resend(RESEND_API_KEY)

const SAMPLE_COVER = "https://tape-mag.com/bilder/gross/32107_1.jpg"

const emails = [
  {
    name: "1/6 Welcome",
    ...welcomeEmail({
      firstName: "Robin",
      auctionsUrl: `${APP_URL}/auctions`,
    }),
  },
  {
    name: "2/6 Outbid",
    ...outbidEmail({
      firstName: "Robin",
      itemTitle: "Red Mecca",
      artistName: "Cabaret Voltaire",
      coverImage: SAMPLE_COVER,
      lotNumber: 3,
      blockTitle: "Industrial Classics 1980-1985",
      yourBid: 15,
      currentBid: 18,
      bidUrl: `${APP_URL}/auctions/industrial-classics/item-123`,
    }),
  },
  {
    name: "3/6 Bid Won",
    ...bidWonEmail({
      firstName: "Robin",
      itemTitle: "Red Mecca",
      artistName: "Cabaret Voltaire",
      coverImage: SAMPLE_COVER,
      lotNumber: 3,
      blockTitle: "Industrial Classics 1980-1985",
      finalPrice: 25,
      paymentUrl: `${APP_URL}/account/wins`,
    }),
  },
  {
    name: "4/6 Payment Confirmation",
    ...paymentConfirmationEmail({
      firstName: "Robin",
      orderGroupId: "01KJPSH37MYWW9MSJZDG58FT1G",
      items: [
        { title: "Red Mecca", artistName: "Cabaret Voltaire", price: 25 },
        { title: "Cleanse Fold and Manipulate", artistName: "Skinny Puppy", price: 18 },
      ],
      totalAmount: 47.99,
      shippingCost: 4.99,
      paidAt: new Date(),
      accountUrl: `${APP_URL}/account/orders`,
    }),
  },
  {
    name: "5/6 Shipping",
    ...shippingEmail({
      firstName: "Robin",
      orderGroupId: "01KJPSH37MYWW9MSJZDG58FT1G",
      items: [
        { title: "Red Mecca", artistName: "Cabaret Voltaire", coverImage: SAMPLE_COVER },
        { title: "Cleanse Fold and Manipulate", artistName: "Skinny Puppy" },
      ],
      carrier: "Deutsche Post",
      trackingNumber: "RR123456789DE",
      trackingUrl: "https://www.deutschepost.de/sendung/simpleQueryResult.html?form.sendungsnummer=RR123456789DE",
      shippingAddress: {
        name: "Robin Seckler",
        line1: "Musterstraße 1",
        city: "München",
        postalCode: "80331",
        country: "Germany",
      },
    }),
  },
  {
    name: "6/6 Feedback Request",
    ...feedbackRequestEmail({
      firstName: "Robin",
      items: [
        { title: "Red Mecca", artistName: "Cabaret Voltaire", coverImage: SAMPLE_COVER },
      ],
      feedbackUrl: `${APP_URL}/account/feedback?order=01KJPSH37MYWW9MSJZDG58FT1G`,
      auctionsUrl: `${APP_URL}/auctions`,
    }),
  },
]

async function main() {
  console.log(`Sending 6 test emails to ${to}...\n`)

  for (const email of emails) {
    try {
      const result = await resend.emails.send({
        from: FROM,
        to,
        subject: `[TEST] ${email.subject}`,
        html: email.html,
      })
      console.log(`  ✓ ${email.name}: ${email.subject}`)
    } catch (err: any) {
      console.error(`  ✗ ${email.name}: ${err.message}`)
    }
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500))
  }

  console.log("\nDone! Check your inbox.")
}

main()
