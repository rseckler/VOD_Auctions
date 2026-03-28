# VOD Auctions — E-Mail Content & Testing Plan

**Created:** 2026-03-09
**Status:** Reference Document

---

## Table of Contents

1. [Email Architecture Overview](#1-email-architecture-overview)
2. [Sender Addresses](#2-sender-addresses)
3. [Transactional Emails (Resend)](#3-transactional-emails-resend)
4. [Newsletter Campaigns (Brevo)](#4-newsletter-campaigns-brevo)
5. [Complete Customer Journey](#5-complete-customer-journey)
6. [Testing Plan](#6-testing-plan)

---

## 1. Email Architecture Overview

### Two Email Systems

| System | Provider | Purpose | Sender |
|--------|----------|---------|--------|
| **Transactional** | Resend | Triggered by user actions | `VOD Auctions <noreply@vod-auctions.com>` |
| **Newsletter/CRM** | Brevo | Campaigns & marketing | `VOD Auctions <newsletter@vod-auctions.com>` |

### Email Count Summary

- **6 Transactional Emails** (automated, event-driven)
- **4 Newsletter Templates** (admin-triggered campaigns)
- **Total: 10 distinct email types**

---

## 2. Sender Addresses

| Type | Address | Use Case |
|------|---------|----------|
| `noreply@vod-auctions.com` | Transactional emails (welcome, outbid, bid won, payment, shipping, feedback) |
| `newsletter@vod-auctions.com` | Newsletter campaigns (block announcement, weekly highlights, auction results, monthly digest) |

**Why this split:**
- `noreply@` — Industry standard for automated/transactional emails. Users should not reply to these.
- `newsletter@` — Professional sender for marketing. Can be configured with Reply-To for customer engagement.
- `admin@` — Reserved for internal/admin use, not customer-facing.

---

## 3. Transactional Emails (Resend)

All transactional emails use the shared layout with:
- Dark header (#1c1915) with gold "V" logo (#d4a54a)
- White content area with clean typography
- Gold CTA button
- Footer with Unsubscribe + Settings links

---

### 3.1 Welcome Email

**Trigger:** User completes registration
**Subject:** `Welcome to VOD Auctions!`
**From:** `VOD Auctions <noreply@vod-auctions.com>`

**Content:**

```
Welcome, {firstName}!

Great to have you on board. VOD Auctions is your platform for curated
auctions of rare records from the world of Industrial, Experimental
& Electronic Music.

Over 40,000 records are waiting in thematically curated auction blocks
for new owners.

┌─────────────────────────────────────┐
│ Your next step:                     │
│ Browse our current auctions and     │
│ place your first bid!               │
└─────────────────────────────────────┘

        [ Browse Auctions → ]
```

**CTA:** Browse Auctions → `{APP_URL}/auctions`
**File:** `backend/src/emails/welcome.ts`
**Trigger Route:** `POST /store/account/send-welcome`

---

### 3.2 Outbid Notification

**Trigger:** Another bidder places a higher bid on an item the user has bid on
**Subject:** `You've been outbid — Lot #XX` (or without lot number)
**From:** `VOD Auctions <noreply@vod-auctions.com>`

**Content:**

```
┌─────────────────────────────────────┐
│ ⚠ You've been outbid!              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ [Cover] Lot #01 — Block Title      │
│         Artist — Title              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Your bid              €15.00 (x̶)   │
│ Current highest bid   €18.00       │
└─────────────────────────────────────┘

Another bidder has taken the lead. The auction is still
running — bid again now!

        [ Bid Again → ]
```

**CTA:** Bid Again → `{APP_URL}/auctions/{blockSlug}/{itemId}`
**File:** `backend/src/emails/outbid.ts`
**Trigger:** Real-time bid system (when a new bid beats existing highest)

---

### 3.3 Bid Won / Auction Won

**Trigger:** Auction block ends, user had the winning bid
**Subject:** `Congratulations! You won Lot #XX`
**From:** `VOD Auctions <noreply@vod-auctions.com>`

**Content:**

```
              🎉
    Congratulations, {firstName}!
      You won the auction.

┌─────────────────────────────────────┐
│ [Cover] Lot #01 — Block Title      │
│         Artist — Title              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Final price              €25.00    │  (green background)
└─────────────────────────────────────┘

Please complete your payment within 7 days so we can
ship your record as soon as possible.

        [ Pay Now → ]
```

**CTA:** Pay Now → `{APP_URL}/account/wins`
**File:** `backend/src/emails/bid-won.ts`
**Trigger:** `auction-lifecycle.ts` cron job (runs every minute, detects ended blocks)

---

### 3.4 Payment Confirmation

**Trigger:** Stripe webhook confirms successful payment
**Subject:** `Payment Confirmed — Order #XXXXXXXXX`
**From:** `VOD Auctions <noreply@vod-auctions.com>`

**Content:**

```
┌─────────────────────────────────────┐
│ ✓ Payment successfully received    │  (green background)
└─────────────────────────────────────┘

Hi {firstName}, we have received your payment. Your order
is now being prepared for shipping.

┌─────────────────────────────────────┐
│ Order number    #01KJPSH37MYW...   │
│ Paid on         09/03/2026         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Artist — Title 1          €12.00   │
│ Artist — Title 2          €18.00   │
│ Shipping                   €4.99   │
│ ─────────────────────────────────  │
│ Total                     €34.99   │
└─────────────────────────────────────┘

We'll notify you when your order ships.

        [ View Order → ]
```

**CTA:** View Order → `{APP_URL}/account/wins`
**File:** `backend/src/emails/payment-confirmation.ts`
**Trigger:** `POST /webhooks/stripe` (checkout.session.completed event)

---

### 3.5 Shipping Notification

**Trigger:** Admin updates shipping status with tracking info
**Subject:** `Your order has shipped!`
**From:** `VOD Auctions <noreply@vod-auctions.com>`

**Content:**

```
Your order has shipped!

Hi {firstName}, your order has been shipped and is on
its way to you.

┌─────────────────────────────────────┐
│ Carrier          Deutsche Post     │  (blue background)
│ Tracking number  RR123456789DE     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ [Cover] Order #01KJPSH37MYW...    │
│         Artist — Title             │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Delivery address                   │
│ Max Mustermann                     │
│ Musterstraße 1                     │
│ 12345 Berlin                       │
│ Germany                            │
└─────────────────────────────────────┘

        [ Track Shipment → ]
```

**CTA:** Track Shipment → Carrier tracking URL with tracking number
**File:** `backend/src/emails/shipping.ts`
**Trigger:** `POST /admin/transactions/:id` (when admin sets shipping_status = shipped)

---

### 3.6 Feedback Request

**Trigger:** Cron job, 5 days after shipping status set
**Subject:** `How was your experience at VOD Auctions?`
**From:** `VOD Auctions <noreply@vod-auctions.com>`

**Content:**

```
How was your purchase?

Hi {firstName}, your order should have arrived by now.
We hope you're happy with it!

┌─────────────────────────────────────┐
│ [Cover] Artist — Title             │
└─────────────────────────────────────┘

Your feedback helps us make VOD Auctions even better.
How do you rate your purchase?

    😟  😐  🙂  😊  🤩
     1   2   3   4   5

        [ Leave Feedback → ]

┌─────────────────────────────────────┐
│ New auctions are waiting!          │  (amber background)
│ Check out our upcoming auction     │
│ blocks.                            │
│ Browse auctions →                  │
└─────────────────────────────────────┘
```

**CTA:** Leave Feedback → `{APP_URL}/account/feedback?order={orderRef}`
**Secondary CTA:** Browse Auctions → `{APP_URL}/auctions`
**File:** `backend/src/emails/feedback-request.ts`
**Trigger:** `backend/src/jobs/feedback-email.ts` (daily at 10:00 UTC, 5 days after shipped)

---

## 4. Newsletter Campaigns (Brevo)

All newsletters are sent via Brevo using pre-created templates. Admin triggers via `/admin/newsletter`.

---

### 4.1 Block Announcement

**Trigger:** Admin sends when new auction block is created
**Subject:** `New Auction: {BLOCK_TITLE}`
**From:** `VOD Auctions <newsletter@vod-auctions.com>`
**Brevo Template ID:** 2

**Content Purpose:**
- Announce a new thematic auction block
- Preview of featured items with cover images
- Start date and duration
- CTA to browse the block

**Variables:**
- `{{ params.BLOCK_TITLE }}` — Block title
- `{{ params.BLOCK_DESCRIPTION }}` — Short description
- `{{ params.BLOCK_URL }}` — Link to the block
- `{{ params.ITEM_COUNT }}` — Number of items
- `{{ params.START_DATE }}` — Auction start date

---

### 4.2 Weekly Highlights

**Trigger:** Admin sends weekly (or as needed)
**Subject:** `This Week's Highlights — VOD Auctions`
**From:** `VOD Auctions <newsletter@vod-auctions.com>`
**Brevo Template ID:** 3

**Content Purpose:**
- Curated selection of notable items from active auctions
- Featured lots with images and current bids
- New arrivals in the catalog
- CTA to browse auctions and catalog

---

### 4.3 Auction Results

**Trigger:** Admin sends after an auction block ends
**Subject:** `Auction Results: {BLOCK_TITLE}`
**From:** `VOD Auctions <newsletter@vod-auctions.com>`
**Brevo Template ID:** 4

**Content Purpose:**
- Summary of completed auction block
- Top lots with final prices
- Statistics (total bids, participants, items sold)
- Teaser for upcoming blocks
- CTA to browse next auctions

**Variables:**
- `{{ params.BLOCK_TITLE }}` — Block title
- `{{ params.TOTAL_LOTS }}` — Total items
- `{{ params.SOLD_LOTS }}` — Items sold
- `{{ params.TOTAL_BIDS }}` — Total bids placed
- `{{ params.NEXT_BLOCK_URL }}` — Link to next block

---

### 4.4 Monthly Digest

**Trigger:** Admin sends monthly
**Subject:** `Monthly Digest — VOD Auctions`
**From:** `VOD Auctions <newsletter@vod-auctions.com>`
**Brevo Template ID:** 5

**Content Purpose:**
- Monthly recap of all auction activity
- Highlights and top sellers
- New additions to the catalog
- Upcoming auction blocks preview
- Platform news and updates
- CTA to browse catalog and upcoming auctions

---

## 5. Complete Customer Journey

### Timeline of Emails a User May Receive

```
Day 0:  User registers
        → [1] Welcome Email (immediately)

Day 1:  Block Announcement newsletter (if subscribed)
        → [N1] Block Announcement

Day 3:  User places bid
        (no email — bid confirmed in UI)

Day 3:  User gets outbid
        → [2] Outbid Notification (immediately)

Day 3:  User bids again
        (no email — bid confirmed in UI)

Day 7:  Auction ends, user wins
        → [3] Bid Won Email (immediately)

Day 7:  User pays via Stripe
        → [4] Payment Confirmation (immediately, via webhook)

Day 8:  Admin ships order
        → [5] Shipping Notification (immediately)

Day 13: 5 days after shipping
        → [6] Feedback Request (via daily cron at 10:00 UTC)

Weekly: If subscribed to newsletter
        → [N2] Weekly Highlights

Monthly: If subscribed to newsletter
        → [N4] Monthly Digest

After block ends: If subscribed
        → [N3] Auction Results
```

### Email Frequency Per User

| Type | Max Frequency | Opt-out |
|------|---------------|---------|
| Welcome | Once (registration) | No (transactional) |
| Outbid | Per bid event | No (transactional) |
| Bid Won | Per won auction | No (transactional) |
| Payment Confirmation | Per payment | No (transactional) |
| Shipping | Per shipment | No (transactional) |
| Feedback Request | Per order, once | No (transactional) |
| Block Announcement | Per new block | Yes (newsletter opt-in) |
| Weekly Highlights | Weekly | Yes (newsletter opt-in) |
| Auction Results | Per ended block | Yes (newsletter opt-in) |
| Monthly Digest | Monthly | Yes (newsletter opt-in) |

---

## 6. Testing Plan

### Prerequisites

1. **Test accounts** (already exist):
   - `bidder1@test.de` / `test1234`
   - `bidder2@test.de` / `test1234` (has winning bid)
   - `testuser@vod-auctions.com` / `TestPass123!` (has winning bid)

2. **Stripe CLI** installed for webhook forwarding:
   ```bash
   stripe listen --forward-to localhost:9000/webhooks/stripe
   ```

3. **Resend** configured with valid API key in `backend/.env`

4. **Brevo** configured with valid API key in `backend/.env`

5. **Use a real email address** for receiving tests (e.g., your own email)

---

### Test 1: Welcome Email

**Steps:**
1. Go to `https://vod-auctions.com/` (or localhost)
2. Click "Sign In" → "Create Account"
3. Register with a **real email address** you can check
4. Submit registration

**Expected Result:**
- [ ] Email arrives within 30 seconds
- [ ] From: `VOD Auctions <noreply@vod-auctions.com>`
- [ ] Subject: "Welcome to VOD Auctions!"
- [ ] First name personalized correctly
- [ ] "Browse Auctions" button links to `/auctions`
- [ ] Layout renders correctly (header, footer, gold button)
- [ ] Not in spam folder

**Verify in logs:**
```bash
# VPS
pm2 logs vodauction-backend --lines 20 | grep "\[email\]"
```

---

### Test 2: Outbid Email

**Prerequisites:** Active auction block with at least 1 item, 2 test accounts

**Steps:**
1. Login as `bidder1@test.de` (change email to a real one first if needed)
2. Place a bid on an active auction item (e.g., €10)
3. Logout, login as `bidder2@test.de`
4. Place a higher bid on the same item (e.g., €12)

**Expected Result:**
- [ ] `bidder1` receives outbid email within 30 seconds
- [ ] Subject contains lot number (if applicable)
- [ ] Shows correct "Your bid" (€10.00, strikethrough)
- [ ] Shows correct "Current highest bid" (€12.00)
- [ ] Cover image displays correctly
- [ ] "Bid Again" button links to the correct item page

**Alternative (API test):**
```bash
# Direct API call to trigger outbid
curl -X POST https://api.vod-auctions.com/store/auction-blocks/{blockSlug}/items/{itemId}/bids \
  -H "x-publishable-api-key: pk_..." \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"amount": 15}'
```

---

### Test 3: Bid Won Email

**Prerequisites:** An auction block that can be ended

**Steps:**
1. Create a test auction block in admin with 1-2 items, short duration
2. Place bids from test accounts
3. Wait for auction to end (or manually end via admin)

**Expected Result:**
- [ ] Winner receives "Congratulations" email
- [ ] 🎉 emoji displays correctly
- [ ] Final price shown in green
- [ ] "Pay Now" button links to `/account/wins`
- [ ] Lot number and block title shown correctly

**Manual trigger (admin):**
Set auction block `ends_at` to a past time → lifecycle cron picks it up within 1 minute.

---

### Test 4: Payment Confirmation Email

**Prerequisites:** A won auction item or cart item ready for checkout

**Steps:**
1. Login as winning bidder
2. Go to `/account/wins` or `/account/checkout`
3. Select shipping zone
4. Click "Pay Now" → Stripe Checkout
5. Use test card: `4242 4242 4242 4242` (any date/CVC)
6. Complete payment

**Expected Result:**
- [ ] Payment confirmation email arrives within 1 minute
- [ ] Subject: "Payment Confirmed — Order #XXXXXXXXX"
- [ ] Green checkmark banner
- [ ] All items listed with correct prices
- [ ] Shipping cost correct
- [ ] Total amount correct
- [ ] "View Order" button works

**Verify Stripe webhook:**
```bash
# If using Stripe CLI locally
stripe listen --forward-to localhost:9000/webhooks/stripe

# Check VPS logs
pm2 logs vodauction-backend --lines 30 | grep "stripe\|webhook\|email"
```

---

### Test 5: Shipping Notification Email

**Prerequisites:** A paid transaction

**Steps:**
1. Go to Admin → Transactions (`/admin/transactions`)
2. Find a transaction with status "paid"
3. Click "Ship" button
4. Enter carrier (e.g., "DHL") and tracking number (e.g., "12345678")
5. Confirm

**Expected Result:**
- [ ] Customer receives shipping email within 30 seconds
- [ ] Subject: "Your order has shipped!"
- [ ] Carrier and tracking number shown in blue box
- [ ] Item(s) listed with cover images
- [ ] Shipping address shown correctly
- [ ] "Track Shipment" button links to correct carrier tracking URL
- [ ] If no tracking URL pattern → button not shown

---

### Test 6: Feedback Request Email

**Prerequisites:** A transaction with `shipping_status = shipped` and `shipped_at` > 5 days ago

**Steps:**
1. In database, set a transaction's `shipped_at` to 6 days ago:
   ```sql
   UPDATE transaction
   SET shipped_at = NOW() - INTERVAL '6 days',
       shipping_status = 'shipped',
       feedback_email_sent = false
   WHERE id = '{transaction_id}';
   ```
2. Wait for daily cron (10:00 UTC) or trigger manually:
   ```bash
   # On VPS, run the job manually
   cd /root/VOD_Auctions/backend
   node -e "require('./src/jobs/feedback-email').run()"
   ```

**Expected Result:**
- [ ] Feedback request email arrives
- [ ] Subject: "How was your experience at VOD Auctions?"
- [ ] 5 emoji rating buttons (1-5) work correctly
- [ ] Each rating button appends `&rating=X` to feedback URL
- [ ] "Leave Feedback" button links to `/account/feedback?order=...`
- [ ] Cross-sell section shows "Browse auctions" link
- [ ] `feedback_email_sent` set to `true` in DB (no re-sends)

---

### Test 7: Newsletter — Block Announcement (Brevo)

**Steps:**
1. Go to Admin → Newsletter (`/admin/newsletter`)
2. Select "Block Announcement" template
3. Enter block details (or select an existing block)
4. Send to a test list (or your own email)

**Expected Result:**
- [ ] Email arrives from `VOD Auctions <newsletter@vod-auctions.com>`
- [ ] Subject contains block title
- [ ] Template renders correctly in email client
- [ ] Unsubscribe link works (Brevo managed)
- [ ] Open/click tracking registered in Brevo dashboard

---

### Test 8: Brevo Webhook (Unsubscribe/Bounce)

**Steps:**
1. Send a test newsletter to yourself
2. Click "Unsubscribe" in the email footer
3. Check Brevo Dashboard → Contacts

**Expected Result:**
- [ ] Brevo webhook fires to `/webhooks/brevo`
- [ ] Contact's `NEWSLETTER_OPTIN` set to `false`
- [ ] No more newsletters sent to this contact
- [ ] Backend logs show webhook event

---

### End-to-End Full Flow Test

**The ultimate test — run through the complete customer journey:**

1. [ ] Register new account with real email → Welcome Email
2. [ ] Opt-in to newsletter → Brevo contact created
3. [ ] Browse catalog, add item to cart
4. [ ] Browse active auction, place bid
5. [ ] Get outbid (use second account) → Outbid Email
6. [ ] Bid again, win auction → Bid Won Email
7. [ ] Checkout (cart + auction wins combined) → Payment Confirmation
8. [ ] Admin ships order → Shipping Email
9. [ ] Wait 5 days (or simulate) → Feedback Email
10. [ ] Submit feedback rating
11. [ ] Receive newsletter → Block Announcement
12. [ ] Unsubscribe from newsletter → Webhook processed

**Estimated time:** 30-45 minutes (excluding the 5-day feedback wait)

---

### Email Client Compatibility Checklist

Test each email in:
- [ ] Gmail (web)
- [ ] Gmail (mobile app)
- [ ] Apple Mail (macOS)
- [ ] Apple Mail (iOS)
- [ ] Outlook (web)
- [ ] Outlook (desktop) — optional, inline CSS should handle it

**Check for:**
- [ ] Images load correctly (tape-mag.com domain)
- [ ] Gold button (#d4a54a) renders correctly
- [ ] Dark header (#1c1915) renders correctly
- [ ] Responsive layout on mobile
- [ ] Links are clickable and correct
- [ ] No broken HTML / missing closing tags
- [ ] Not flagged as spam

---

### Monitoring After Go-Live

```bash
# Check Resend delivery status
# Dashboard: https://resend.com/emails (account: frank@vod-records.com)

# Check Brevo campaign stats
# Dashboard: https://app.brevo.com

# Backend email logs
pm2 logs vodauction-backend | grep "\[email\]"

# Failed emails
pm2 logs vodauction-backend | grep "\[email\] Failed"

# Brevo webhook events
pm2 logs vodauction-backend | grep "\[brevo-webhook\]"
```
