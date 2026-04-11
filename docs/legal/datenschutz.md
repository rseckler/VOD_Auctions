# Privacy Policy

## 1. Data Controller

The controller within the meaning of the General Data Protection Regulation (GDPR) and other applicable data protection legislation is:

Frank Bull  
VOD-Records  
Alpenstrasse 25/1  
88045 Friedrichshafen  
Germany  
Phone: +49 7541 34412  
Email: frank@vinyl-on-demand.com

## 2. General Information on Data Processing

We process personal data of our users only to the extent necessary to provide a functional website and our content and services. The legal bases are Art. 6 (1)(a) (consent), (b) (contract performance), (c) (legal obligation), and (f) (legitimate interest) GDPR.

## 3. Hosting

This website is hosted on a server provided by Hostinger International Ltd. When you visit our website, the following information is automatically stored in server log files:

- Browser type and version
- Operating system
- Referrer URL
- Hostname of the accessing device
- IP address
- Time of the server request

Legal basis: Art. 6 (1)(f) GDPR (legitimate interest in secure and efficient operation).

## 4. User Account & Registration

Registration is required to participate in auctions and make direct purchases. The following data is collected:

- Email address
- Password (stored encrypted)
- Name and shipping address (upon order)

Authentication is handled via Supabase Auth (Supabase Inc., EU region Frankfurt). Data is stored for the duration of the business relationship and beyond in accordance with statutory retention periods.

Legal basis: Art. 6 (1)(b) GDPR.

## 5. Auctions & Bids

When placing bids, the following data is processed:

- Bid amount and timestamp
- User ID (pseudonymised for other users)
- Proxy bid maximum (stored internally only)

To ensure real-time bidding functionality, bid data is temporarily cached in Upstash Redis (Upstash Inc., EU region). Real-time updates are delivered via Supabase Realtime (WebSocket).

Legal basis: Art. 6 (1)(b) GDPR.

## 6. Payment Processing — Stripe

We use Stripe for payment processing (Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Ireland).

The following data is transmitted to Stripe during payment:

- Payment amount and currency
- Payment method (credit card details, SEPA, etc.)
- Name and email address
- Billing and shipping address

Payment data is processed exclusively by Stripe. We do not store any credit card data on our servers. Stripe is PCI DSS Level 1 certified.

Stripe Privacy Policy: https://stripe.com/privacy

Legal basis: Art. 6 (1)(b) GDPR.

## 7. Database & Storage — Supabase

For storing all application data (user accounts, bids, orders, product data, images), we use Supabase (Supabase Inc.), hosted in the EU region Frankfurt (eu-central-1). Supabase provides:

- PostgreSQL database with Row Level Security (RLS)
- Authentication (Supabase Auth)
- Real-time connections for live bidding (WebSocket)
- File storage for product images (Supabase Storage)

All data is encrypted in transit (TLS) and encrypted at rest.

Supabase Privacy Policy: https://supabase.com/privacy

Legal basis: Art. 6 (1)(b) and (f) GDPR.

## 8. Caching — Upstash Redis

For performance optimisation and real-time bid management, we use Upstash Redis (Upstash Inc., EU region). Temporary, non-personal data (bid states, session information) is cached there. This data is automatically deleted after a short period.

Upstash Privacy Policy: https://upstash.com/trust/privacy.pdf

Legal basis: Art. 6 (1)(f) GDPR.

## 9. Google Fonts (Self-Hosted)

This website uses the fonts "DM Sans" and "DM Serif Display" from Google Fonts. The fonts are self-hosted via next/font and served directly from our own server. No data is transmitted to Google servers when you visit our website.

## 10. Discogs API — Product Data

To enrich our product data (market prices, tracklists, credits), we use the Discogs API (Zink Media Inc., Portland, USA). No personal user data is transmitted to Discogs. Only product information is retrieved.

Legal basis: Art. 6 (1)(f) GDPR.

## 11. Transactional Emails

We send transactional emails (registration, bid confirmation, auction award, payment confirmation, shipping notification) via the email service Resend (Resend Inc., USA). Your email address and the relevant order/bid information are transmitted to Resend for this purpose.

Resend Privacy Policy: https://resend.com/legal/privacy-policy

Legal basis: Art. 6 (1)(b) GDPR.

## 12. Newsletter & CRM — Brevo

We use Brevo (formerly Sendinblue) for newsletter delivery and customer relationship management (Sendinblue SAS, 106 boulevard Haussmann, 75008 Paris, France). Data is processed on EU servers.

The following data may be transmitted to Brevo:

- Email address and name
- Newsletter subscription status
- Aggregated purchase and bidding activity (e.g. total purchases, total bids placed)
- Website behavior data (page views, product views, cart activity, checkout events) — only with your explicit marketing cookie consent

Newsletter emails are only sent if you have explicitly opted in (double opt-in). You can unsubscribe at any time via the link in each newsletter email.

Brevo Privacy Policy: https://www.brevo.com/legal/privacypolicy/

Legal basis: Art. 6 (1)(a) GDPR (consent for newsletter), Art. 6 (1)(f) GDPR (CRM).

## 13. External Image Content

Some product images are loaded from our partner websites (tape-mag.com, vod-records.com). When loading these images, your IP address may be transmitted to the respective servers. These servers are also operated by VOD-Records.

Legal basis: Art. 6 (1)(f) GDPR.

## 14. Google Analytics

This website uses Google Analytics 4 (GA4) for web analytics. Google Analytics is only loaded if you explicitly consent to analytics cookies via our cookie consent banner.

Provider: Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland.

When activated, Google Analytics collects:

- Pages visited and time spent
- Device and browser information
- Approximate geographic location (IP anonymisation enabled)
- Referral source

IP anonymisation is active. No personal data (name, email) is transmitted to Google.

Google Privacy Policy: https://policies.google.com/privacy

Opt-out: You can reject analytics cookies via our cookie consent banner or use the Google Analytics Opt-out Browser Add-on: https://tools.google.com/dlpage/gaoptout

Legal basis: Art. 6 (1)(a) GDPR (consent).

## 15. Cookies

Our website uses the following types of cookies:

- **Technically necessary cookies:** Session cookies for authentication and shopping cart functionality. These are essential for the operation of the website.
- **Supabase Auth cookies:** To maintain your login session (token-based).
- **Analytics cookies (opt-in):** Google Analytics cookies (_ga, _ga_*) are only set if you accept analytics in our cookie consent banner.
- **Marketing cookies (opt-in):** Marketing cookies (e.g. Facebook Pixel, Google Ads) may be used in the future and will only be set with your explicit consent.

You can manage your cookie preferences via our cookie consent banner, which appears on your first visit. To change your preference later, clear your browser cookies for vod-auctions.com and reload the page.

For more details, see our [Cookie Policy](/cookies).

Legal basis: Art. 6 (1)(a) GDPR (consent), § 25 TDDDG.

## 16. Your Rights

You have the following rights regarding your personal data:

- Right of access (Art. 15 GDPR)
- Right to rectification (Art. 16 GDPR)
- Right to erasure (Art. 17 GDPR)
- Right to restriction of processing (Art. 18 GDPR)
- Right to data portability (Art. 20 GDPR)
- Right to object (Art. 21 GDPR)

To exercise your rights, please contact: frank@vinyl-on-demand.com

You also have the right to lodge a complaint with a data protection supervisory authority. The competent authority is:

Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg  
Lautenschlagerstraße 20  
70173 Stuttgart  
www.baden-wuerttemberg.datenschutz.de

## 17. Sharing Data with Third Parties

Personal data is only shared with third parties to the extent necessary for contract fulfilment:

- **Stripe** — for payment processing
- **DHL / Parcel service** — for delivery (name, address)
- **Resend** — for sending transactional emails
- **Brevo** — for newsletter delivery and CRM (EU servers)

Beyond this, no data is shared with third parties. We do not sell or rent personal data.

## 18. Data Security

We use TLS (Transport Layer Security) encryption with the highest level supported by your browser for all data transmitted between your browser and our server.

## 19. Data Retention

Personal data is deleted or blocked as soon as the purpose for its storage ceases to apply. Data may be stored beyond this period only if required by statutory retention periods (commercial law: 6 years, tax law: 10 years).

## 20. Notice Regarding Other Platforms

The data controller also operates the following websites with their own privacy notices:

- www.vod-records.com — Online Shop (PayPal, Google Web Fonts, Cookies)
- www.tape-mag.com — Archive & Database (Google Analytics, Google Tag Manager, Google Web Fonts, Cookies)
- vod-records.com/vod-fest — Festival Website

Please refer to the respective privacy policies of these platforms.

---

*Last updated: March 2026*
