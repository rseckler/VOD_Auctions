import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy and data protection information for VOD Auctions.",
}

export default function DatenschutzPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl mb-8">Privacy Policy</h1>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
        {/* 1. Controller */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            1. Data Controller
          </h2>
          <p>
            The controller within the meaning of the General Data
            Protection Regulation (GDPR) and other applicable data
            protection legislation is:
          </p>
          <p>
            Frank Bull
            <br />
            VOD-Records
            <br />
            Alpenstrasse 25/1
            <br />
            88045 Friedrichshafen
            <br />
            Germany
            <br />
            Phone: +49 7541 34412
            <br />
            Email:{" "}
            <a
              href="mailto:frank@vinyl-on-demand.com"
              className="text-primary hover:underline"
            >
              frank@vinyl-on-demand.com
            </a>
          </p>
        </section>

        {/* 2. General */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            2. General Information on Data Processing
          </h2>
          <p>
            We process personal data of our users only to the extent
            necessary to provide a functional website and our content
            and services. The legal bases are Art. 6 (1)(a) (consent),
            (b) (contract performance), (c) (legal obligation), and (f)
            (legitimate interest) GDPR.
          </p>
        </section>

        {/* 3. Hosting */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            3. Hosting
          </h2>
          <p>
            This website is hosted on a server provided by Hostinger
            International Ltd. When you visit our website, the following
            information is automatically stored in server log files:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Browser type and version</li>
            <li>Operating system</li>
            <li>Referrer URL</li>
            <li>Hostname of the accessing device</li>
            <li>IP address</li>
            <li>Time of the server request</li>
          </ul>
          <p>
            Legal basis: Art. 6 (1)(f) GDPR (legitimate interest in
            secure and efficient operation).
          </p>
        </section>

        {/* 4. User Account */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            4. User Account &amp; Registration
          </h2>
          <p>
            Registration is required to participate in auctions and make
            direct purchases. The following data is collected:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Email address</li>
            <li>Password (stored encrypted)</li>
            <li>Name and shipping address (upon order)</li>
          </ul>
          <p>
            Authentication is handled via Supabase Auth (Supabase Inc.,
            EU region Frankfurt). Data is stored for the duration of the
            business relationship and beyond in accordance with
            statutory retention periods.
          </p>
          <p>Legal basis: Art. 6 (1)(b) GDPR.</p>
        </section>

        {/* 5. Auctions & Bids */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            5. Auctions &amp; Bids
          </h2>
          <p>
            When placing bids, the following data is processed:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Bid amount and timestamp</li>
            <li>User ID (pseudonymised for other users)</li>
            <li>Proxy bid maximum (stored internally only)</li>
          </ul>
          <p>
            To ensure real-time bidding functionality, bid data is
            temporarily cached in Upstash Redis (Upstash Inc., EU
            region). Real-time updates are delivered via Supabase
            Realtime (WebSocket).
          </p>
          <p>Legal basis: Art. 6 (1)(b) GDPR.</p>
        </section>

        {/* 6. Payment */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            6. Payment Processing — Stripe
          </h2>
          <p>
            We use Stripe for payment processing (Stripe Payments
            Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock,
            Dublin, D02 H210, Ireland).
          </p>
          <p>The following data is transmitted to Stripe during payment:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Payment amount and currency</li>
            <li>Payment method (credit card details, SEPA, etc.)</li>
            <li>Name and email address</li>
            <li>Billing and shipping address</li>
          </ul>
          <p>
            Payment data is processed exclusively by Stripe. We do not
            store any credit card data on our servers. Stripe is PCI DSS
            Level 1 certified.
          </p>
          <p>
            Stripe Privacy Policy:{" "}
            <a
              href="https://stripe.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://stripe.com/privacy
            </a>
          </p>
          <p>Legal basis: Art. 6 (1)(b) GDPR.</p>
        </section>

        {/* 7. Database */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            7. Database &amp; Storage — Supabase
          </h2>
          <p>
            For storing all application data (user accounts, bids,
            orders, product data, images), we use Supabase (Supabase
            Inc.), hosted in the EU region Frankfurt (eu-central-1).
            Supabase provides:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>PostgreSQL database with Row Level Security (RLS)</li>
            <li>Authentication (Supabase Auth)</li>
            <li>Real-time connections for live bidding (WebSocket)</li>
            <li>File storage for product images (Supabase Storage)</li>
          </ul>
          <p>
            All data is encrypted in transit (TLS) and encrypted at
            rest.
          </p>
          <p>
            Supabase Privacy Policy:{" "}
            <a
              href="https://supabase.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://supabase.com/privacy
            </a>
          </p>
          <p>Legal basis: Art. 6 (1)(b) and (f) GDPR.</p>
        </section>

        {/* 8. Caching */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            8. Caching — Upstash Redis
          </h2>
          <p>
            For performance optimisation and real-time bid management,
            we use Upstash Redis (Upstash Inc., EU region). Temporary,
            non-personal data (bid states, session information) is
            cached there. This data is automatically deleted after a
            short period.
          </p>
          <p>
            Upstash Privacy Policy:{" "}
            <a
              href="https://upstash.com/trust/privacy.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://upstash.com/trust/privacy.pdf
            </a>
          </p>
          <p>Legal basis: Art. 6 (1)(f) GDPR.</p>
        </section>

        {/* 9. Google Fonts */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            9. Google Fonts
          </h2>
          <p>
            This website uses the fonts &quot;DM Sans&quot; and &quot;DM
            Serif Display&quot; from Google Fonts for display purposes.
            When loading a page, the fonts are fetched from Google
            servers. Your IP address may be transmitted to Google in the
            process.
          </p>
          <p>
            Provider: Google Ireland Limited, Gordon House, Barrow
            Street, Dublin 4, Ireland.
          </p>
          <p>
            Google Privacy Policy:{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://policies.google.com/privacy
            </a>
          </p>
          <p>Legal basis: Art. 6 (1)(f) GDPR.</p>
        </section>

        {/* 10. Discogs API */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            10. Discogs API — Product Data
          </h2>
          <p>
            To enrich our product data (market prices, tracklists,
            credits), we use the Discogs API (Zink Media Inc., Portland,
            USA). No personal user data is transmitted to Discogs. Only
            product information is retrieved.
          </p>
          <p>Legal basis: Art. 6 (1)(f) GDPR.</p>
        </section>

        {/* 11. Emails */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            11. Transactional Emails
          </h2>
          <p>
            We send transactional emails (registration, bid
            confirmation, auction award, payment confirmation, shipping
            notification) via the email service Resend (Resend Inc.,
            USA). Your email address and the relevant order/bid
            information are transmitted to Resend for this purpose.
          </p>
          <p>
            Resend Privacy Policy:{" "}
            <a
              href="https://resend.com/legal/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://resend.com/legal/privacy-policy
            </a>
          </p>
          <p>Legal basis: Art. 6 (1)(b) GDPR.</p>
        </section>

        {/* 12. Newsletter & CRM — Brevo */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            12. Newsletter &amp; CRM — Brevo
          </h2>
          <p>
            We use Brevo (formerly Sendinblue) for newsletter delivery
            and customer relationship management (Sendinblue SAS, 106
            boulevard Haussmann, 75008 Paris, France). Data is
            processed on EU servers.
          </p>
          <p>The following data may be transmitted to Brevo:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Email address and name</li>
            <li>Newsletter subscription status</li>
            <li>
              Aggregated purchase and bidding activity (e.g. total
              purchases, total bids placed)
            </li>
          </ul>
          <p>
            Newsletter emails are only sent if you have explicitly
            opted in (double opt-in). You can unsubscribe at any time
            via the link in each newsletter email.
          </p>
          <p>
            Brevo Privacy Policy:{" "}
            <a
              href="https://www.brevo.com/legal/privacypolicy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://www.brevo.com/legal/privacypolicy/
            </a>
          </p>
          <p>Legal basis: Art. 6 (1)(a) GDPR (consent for newsletter), Art. 6 (1)(f) GDPR (CRM).</p>
        </section>

        {/* 13. External Images */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            13. External Image Content
          </h2>
          <p>
            Some product images are loaded from our partner websites
            (tape-mag.com, vod-records.com). When loading these images,
            your IP address may be transmitted to the respective
            servers. These servers are also operated by VOD-Records.
          </p>
          <p>Legal basis: Art. 6 (1)(f) GDPR.</p>
        </section>

        {/* 14. Google Analytics */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            14. Google Analytics
          </h2>
          <p>
            This website uses Google Analytics 4 (GA4) for web
            analytics. Google Analytics is only loaded if you
            explicitly consent to analytics cookies via our cookie
            consent banner.
          </p>
          <p>
            Provider: Google Ireland Limited, Gordon House, Barrow
            Street, Dublin 4, Ireland.
          </p>
          <p>When activated, Google Analytics collects:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Pages visited and time spent</li>
            <li>Device and browser information</li>
            <li>Approximate geographic location (IP anonymisation enabled)</li>
            <li>Referral source</li>
          </ul>
          <p>
            IP anonymisation is active. No personal data (name, email)
            is transmitted to Google.
          </p>
          <p>
            Google Privacy Policy:{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://policies.google.com/privacy
            </a>
          </p>
          <p>
            Opt-out: You can reject analytics cookies via our cookie
            consent banner or use the{" "}
            <a
              href="https://tools.google.com/dlpage/gaoptout"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Google Analytics Opt-out Browser Add-on
            </a>
            .
          </p>
          <p>Legal basis: Art. 6 (1)(a) GDPR (consent).</p>
        </section>

        {/* 15. Cookies */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            15. Cookies
          </h2>
          <p>
            Our website uses the following types of cookies:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-foreground">
                Technically necessary cookies:
              </strong>{" "}
              Session cookies for authentication and shopping cart
              functionality. These are essential for the operation of
              the website.
            </li>
            <li>
              <strong className="text-foreground">
                Supabase Auth cookies:
              </strong>{" "}
              To maintain your login session (token-based).
            </li>
            <li>
              <strong className="text-foreground">
                Analytics cookies (opt-in):
              </strong>{" "}
              Google Analytics cookies (_ga, _ga_*) are only set if you
              accept analytics in our cookie consent banner.
            </li>
            <li>
              <strong className="text-foreground">
                Marketing cookies (opt-in):
              </strong>{" "}
              Marketing cookies (e.g. Facebook Pixel, Google Ads) may
              be used in the future and will only be set with your
              explicit consent.
            </li>
          </ul>
          <p>
            You can manage your cookie preferences via our cookie
            consent banner, which appears on your first visit. To
            change your preference later, clear your browser cookies
            for vod-auctions.com and reload the page.
          </p>
          <p>
            For more details, see our{" "}
            <a href="/cookies" className="text-primary hover:underline">
              Cookie Policy
            </a>
            .
          </p>
          <p>Legal basis: Art. 6 (1)(a) GDPR (consent), § 25 TDDDG.</p>
        </section>

        {/* 16. Your Rights */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            16. Your Rights
          </h2>
          <p>
            You have the following rights regarding your personal data:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Right of access (Art. 15 GDPR)</li>
            <li>Right to rectification (Art. 16 GDPR)</li>
            <li>Right to erasure (Art. 17 GDPR)</li>
            <li>Right to restriction of processing (Art. 18 GDPR)</li>
            <li>Right to data portability (Art. 20 GDPR)</li>
            <li>Right to object (Art. 21 GDPR)</li>
          </ul>
          <p>
            To exercise your rights, please contact:{" "}
            <a
              href="mailto:frank@vinyl-on-demand.com"
              className="text-primary hover:underline"
            >
              frank@vinyl-on-demand.com
            </a>
          </p>
          <p>
            You also have the right to lodge a complaint with a data
            protection supervisory authority. The competent authority is:
          </p>
          <p>
            Der Landesbeauftragte für den Datenschutz und die
            Informationsfreiheit Baden-Württemberg
            <br />
            Lautenschlagerstraße 20
            <br />
            70173 Stuttgart
            <br />
            <a
              href="https://www.baden-wuerttemberg.datenschutz.de"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              www.baden-wuerttemberg.datenschutz.de
            </a>
          </p>
        </section>

        {/* 17. Data Sharing */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            17. Sharing Data with Third Parties
          </h2>
          <p>
            Personal data is only shared with third parties to the
            extent necessary for contract fulfilment:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-foreground">Stripe</strong> — for
              payment processing
            </li>
            <li>
              <strong className="text-foreground">DHL / Parcel service</strong>{" "}
              — for delivery (name, address)
            </li>
            <li>
              <strong className="text-foreground">Resend</strong> — for
              sending transactional emails
            </li>
            <li>
              <strong className="text-foreground">Brevo</strong> — for
              newsletter delivery and CRM (EU servers)
            </li>
          </ul>
          <p>
            Beyond this, no data is shared with third parties. We do not
            sell or rent personal data.
          </p>
        </section>

        {/* 18. Data Security */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            18. Data Security
          </h2>
          <p>
            We use TLS (Transport Layer Security) encryption with the
            highest level supported by your browser for all data
            transmitted between your browser and our server.
          </p>
        </section>

        {/* 19. Retention */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            19. Data Retention
          </h2>
          <p>
            Personal data is deleted or blocked as soon as the purpose
            for its storage ceases to apply. Data may be stored beyond
            this period only if required by statutory retention periods
            (commercial law: 6 years, tax law: 10 years).
          </p>
        </section>

        {/* 20. Other Platforms */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            20. Notice Regarding Other Platforms
          </h2>
          <p>
            The data controller also operates the following websites
            with their own privacy notices:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <a
                href="https://www.vod-records.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                www.vod-records.com
              </a>{" "}
              — Online Shop (PayPal, Google Web Fonts, Cookies)
            </li>
            <li>
              <a
                href="https://www.tape-mag.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                www.tape-mag.com
              </a>{" "}
              — Archive &amp; Database (Google Analytics, Google Tag
              Manager, Google Web Fonts, Cookies)
            </li>
            <li>
              <a
                href="https://vod-records.com/vod-fest"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                vod-records.com/vod-fest
              </a>{" "}
              — Festival Website
            </li>
          </ul>
          <p>
            Please refer to the respective privacy policies of these
            platforms.
          </p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4">
          Last updated: March 2026
        </p>
      </div>
    </main>
  )
}
