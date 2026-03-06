import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cookie-Richtlinie — VOD Auctions",
}

export default function CookiesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl mb-8">Cookie-Richtlinie</h1>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-lg font-medium text-foreground">
            Was sind Cookies?
          </h2>
          <p>
            Cookies sind kleine Textdateien, die auf Ihrem Endgerät
            gespeichert werden, wenn Sie eine Website besuchen. Sie
            dienen dazu, die Website funktionsfähig zu machen und das
            Nutzererlebnis zu verbessern.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Welche Cookies verwenden wir?
          </h2>
          <p>
            VOD Auctions verwendet{" "}
            <strong className="text-foreground">
              ausschließlich technisch notwendige Cookies
            </strong>
            . Wir setzen keine Tracking-, Analyse- oder Marketing-Cookies
            ein.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm border border-[rgba(232,224,212,0.12)]">
              <thead>
                <tr className="border-b border-[rgba(232,224,212,0.12)] bg-[rgba(232,224,212,0.03)]">
                  <th className="text-left p-3 text-foreground font-medium">Cookie</th>
                  <th className="text-left p-3 text-foreground font-medium">Zweck</th>
                  <th className="text-left p-3 text-foreground font-medium">Dauer</th>
                  <th className="text-left p-3 text-foreground font-medium">Typ</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[rgba(232,224,212,0.06)]">
                  <td className="p-3 font-mono text-xs">sb-*-auth-token</td>
                  <td className="p-3">Supabase-Authentifizierung — hält Ihre Anmeldung aufrecht</td>
                  <td className="p-3">Session / 1 Woche</td>
                  <td className="p-3">Notwendig</td>
                </tr>
                <tr className="border-b border-[rgba(232,224,212,0.06)]">
                  <td className="p-3 font-mono text-xs">sb-*-auth-token-code-verifier</td>
                  <td className="p-3">PKCE-Sicherheitstoken für sichere Authentifizierung</td>
                  <td className="p-3">Session</td>
                  <td className="p-3">Notwendig</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Keine Tracking-Cookies
          </h2>
          <div className="rounded-lg border border-[rgba(232,224,212,0.12)] bg-[rgba(232,224,212,0.03)] p-4">
            <p>
              Wir verwenden{" "}
              <strong className="text-foreground">kein</strong> Google
              Analytics, kein Facebook Pixel, keine Werbe-Tracker und
              keine sonstigen Analyse- oder Marketing-Tools, die Cookies
              setzen. Ihre Nutzung unserer Website wird nicht für
              Werbezwecke oder Profilbildung ausgewertet.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Cookie-Einstellungen verwalten
          </h2>
          <p>
            Da wir ausschließlich technisch notwendige Cookies verwenden,
            ist kein Cookie-Consent-Banner erforderlich (§ 25 Abs. 2
            TDDDG). Diese Cookies sind für den Betrieb der Website
            unerlässlich und können nicht deaktiviert werden, ohne die
            Funktionalität einzuschränken.
          </p>
          <p>
            Sie können Cookies jederzeit über die Einstellungen Ihres
            Browsers verwalten oder löschen. Bitte beachten Sie, dass
            die Deaktivierung notwendiger Cookies dazu führen kann, dass
            bestimmte Funktionen (z.B. Anmeldung, Warenkorb) nicht mehr
            verfügbar sind.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Weitere Informationen
          </h2>
          <p>
            Ausführliche Informationen zum Datenschutz finden Sie in
            unserer{" "}
            <a href="/datenschutz" className="text-primary hover:underline">
              Datenschutzerklärung
            </a>
            .
          </p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4">
          Stand: März 2026
        </p>
      </div>
    </main>
  )
}
