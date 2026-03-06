import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cookie Policy — VOD Auctions",
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
          <p>
            VOD Auctions uses{" "}
            <strong className="text-foreground">
              only technically necessary cookies
            </strong>
            . We do not use any tracking, analytics, or marketing
            cookies.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm border border-[rgba(232,224,212,0.12)]">
              <thead>
                <tr className="border-b border-[rgba(232,224,212,0.12)] bg-[rgba(232,224,212,0.03)]">
                  <th className="text-left p-3 text-foreground font-medium">Cookie</th>
                  <th className="text-left p-3 text-foreground font-medium">Purpose</th>
                  <th className="text-left p-3 text-foreground font-medium">Duration</th>
                  <th className="text-left p-3 text-foreground font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[rgba(232,224,212,0.06)]">
                  <td className="p-3 font-mono text-xs">sb-*-auth-token</td>
                  <td className="p-3">Supabase authentication — maintains your login session</td>
                  <td className="p-3">Session / 1 week</td>
                  <td className="p-3">Essential</td>
                </tr>
                <tr className="border-b border-[rgba(232,224,212,0.06)]">
                  <td className="p-3 font-mono text-xs">sb-*-auth-token-code-verifier</td>
                  <td className="p-3">PKCE security token for secure authentication</td>
                  <td className="p-3">Session</td>
                  <td className="p-3">Essential</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            No Tracking Cookies
          </h2>
          <div className="rounded-lg border border-[rgba(232,224,212,0.12)] bg-[rgba(232,224,212,0.03)] p-4">
            <p>
              We do <strong className="text-foreground">not</strong> use
              Google Analytics, Facebook Pixel, advertising trackers, or
              any other analytics or marketing tools that set cookies.
              Your use of our website is not analysed for advertising
              purposes or profiling.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Managing Cookie Settings
          </h2>
          <p>
            Since we only use technically necessary cookies, no cookie
            consent banner is required (§ 25 (2) TDDDG). These cookies
            are essential for the operation of the website and cannot be
            disabled without limiting functionality.
          </p>
          <p>
            You can manage or delete cookies at any time through your
            browser settings. Please note that disabling essential
            cookies may result in certain features (e.g. login, shopping
            cart) no longer being available.
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
