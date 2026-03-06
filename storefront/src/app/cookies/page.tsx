import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Cookie policy for VOD Auctions.",
}

export default function CookiesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl mb-8">Cookie Policy</h1>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-lg font-medium text-foreground">
            What Are Cookies?
          </h2>
          <p>
            Cookies are small text files stored on your device when you
            visit a website. They are used to make the website
            functional and to improve the user experience.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Which Cookies Do We Use?
          </h2>

          <h3 className="text-base font-medium text-foreground mt-4">
            Essential Cookies (always active)
          </h3>
          <p>
            These cookies are required for the website to function and cannot
            be disabled.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm border border-[rgba(232,224,212,0.12)]">
              <thead>
                <tr className="border-b border-[rgba(232,224,212,0.12)] bg-[rgba(232,224,212,0.03)]">
                  <th className="text-left p-3 text-foreground font-medium">Cookie</th>
                  <th className="text-left p-3 text-foreground font-medium">Purpose</th>
                  <th className="text-left p-3 text-foreground font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[rgba(232,224,212,0.06)]">
                  <td className="p-3 font-mono text-xs">sb-*-auth-token</td>
                  <td className="p-3">Supabase authentication — maintains your login session</td>
                  <td className="p-3">Session / 1 week</td>
                </tr>
                <tr className="border-b border-[rgba(232,224,212,0.06)]">
                  <td className="p-3 font-mono text-xs">sb-*-auth-token-code-verifier</td>
                  <td className="p-3">PKCE security token for secure authentication</td>
                  <td className="p-3">Session</td>
                </tr>
                <tr className="border-b border-[rgba(232,224,212,0.06)]">
                  <td className="p-3 font-mono text-xs">vod-cookie-consent</td>
                  <td className="p-3">Stores your cookie consent preference</td>
                  <td className="p-3">Permanent</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-medium text-foreground mt-6">
            Analytics Cookies (optional)
          </h3>
          <p>
            These cookies are only set if you accept analytics in our cookie
            consent banner. They help us understand how visitors use the site.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm border border-[rgba(232,224,212,0.12)]">
              <thead>
                <tr className="border-b border-[rgba(232,224,212,0.12)] bg-[rgba(232,224,212,0.03)]">
                  <th className="text-left p-3 text-foreground font-medium">Cookie</th>
                  <th className="text-left p-3 text-foreground font-medium">Purpose</th>
                  <th className="text-left p-3 text-foreground font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[rgba(232,224,212,0.06)]">
                  <td className="p-3 font-mono text-xs">_ga</td>
                  <td className="p-3">Google Analytics — distinguishes unique visitors</td>
                  <td className="p-3">2 years</td>
                </tr>
                <tr className="border-b border-[rgba(232,224,212,0.06)]">
                  <td className="p-3 font-mono text-xs">_ga_*</td>
                  <td className="p-3">Google Analytics 4 — maintains session state</td>
                  <td className="p-3">2 years</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Managing Your Preferences
          </h2>
          <p>
            When you first visit VOD Auctions, a cookie consent banner
            allows you to accept or reject analytics cookies. Essential
            cookies cannot be disabled as they are necessary for the
            website to function.
          </p>
          <p>
            To change your preference, clear your browser cookies for
            vod-auctions.com and reload the page — the consent banner
            will appear again.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Further Information
          </h2>
          <p>
            For detailed information on data protection, please refer to
            our{" "}
            <a href="/datenschutz" className="text-primary hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4">
          Last updated: March 2026
        </p>
      </div>
    </main>
  )
}
