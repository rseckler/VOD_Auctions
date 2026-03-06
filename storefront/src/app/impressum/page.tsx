import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Impressum — VOD Auctions",
}

export default function ImpressumPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl mb-8">Impressum</h1>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-lg font-medium text-foreground">Angaben gem. § 5 TMG</h2>
          <p>
            Frank Bull
            <br />
            VOD-Records
            <br />
            Alpenstrasse 25/1
            <br />
            88045 Friedrichshafen
            <br />
            Deutschland
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">Kontakt</h2>
          <p>
            Telefon: +49 7541 34412
            <br />
            E-Mail:{" "}
            <a href="mailto:frank@vinyl-on-demand.com" className="text-primary hover:underline">
              frank@vinyl-on-demand.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">Umsatzsteuer-ID</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer gem. § 27a UStG:
            <br />
            DE232493058
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV
          </h2>
          <p>
            Frank Bull
            <br />
            Alpenstrasse 25/1
            <br />
            88045 Friedrichshafen
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            EU-Streitschlichtung
          </h2>
          <p>
            Die Europäische Kommission stellt eine Plattform zur
            Online-Streitbeilegung (OS) bereit:{" "}
            <a
              href="https://ec.europa.eu/consumers/odr/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://ec.europa.eu/consumers/odr/
            </a>
          </p>
          <p>
            Wir sind nicht bereit oder verpflichtet, an
            Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">Haftung für Inhalte</h2>
          <p>
            Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene
            Inhalte auf diesen Seiten nach den allgemeinen Gesetzen
            verantwortlich. Nach §§ 8 bis 10 TMG sind wir als
            Diensteanbieter jedoch nicht verpflichtet, übermittelte oder
            gespeicherte fremde Informationen zu überwachen oder nach
            Umständen zu forschen, die auf eine rechtswidrige Tätigkeit
            hinweisen.
          </p>
          <p>
            Verpflichtungen zur Entfernung oder Sperrung der Nutzung von
            Informationen nach den allgemeinen Gesetzen bleiben hiervon
            unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem
            Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung
            möglich. Bei Bekanntwerden von entsprechenden
            Rechtsverletzungen werden wir diese Inhalte umgehend
            entfernen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">Haftung für Links</h2>
          <p>
            Unser Angebot enthält Links zu externen Websites Dritter, auf
            deren Inhalte wir keinen Einfluss haben. Deshalb können wir
            für diese fremden Inhalte auch keine Gewähr übernehmen. Für
            die Inhalte der verlinkten Seiten ist stets der jeweilige
            Anbieter oder Betreiber der Seiten verantwortlich. Die
            verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf
            mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte
            waren zum Zeitpunkt der Verlinkung nicht erkennbar.
          </p>
          <p>
            Eine permanente inhaltliche Kontrolle der verlinkten Seiten
            ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung
            nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen
            werden wir derartige Links umgehend entfernen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">Urheberrecht</h2>
          <p>
            Die durch die Seitenbetreiber erstellten Inhalte und Werke
            auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die
            Vervielfältigung, Bearbeitung, Verbreitung und jede Art der
            Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen
            der schriftlichen Zustimmung des jeweiligen Autors bzw.
            Erstellers. Downloads und Kopien dieser Seite sind nur für
            den privaten, nicht kommerziellen Gebrauch gestattet.
          </p>
          <p>
            Soweit die Inhalte auf dieser Seite nicht vom Betreiber
            erstellt wurden, werden die Urheberrechte Dritter beachtet.
            Insbesondere werden Inhalte Dritter als solche
            gekennzeichnet. Sollten Sie trotzdem auf eine
            Urheberrechtsverletzung aufmerksam werden, bitten wir um
            einen entsprechenden Hinweis. Bei Bekanntwerden von
            Rechtsverletzungen werden wir derartige Inhalte umgehend
            entfernen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">Weitere Plattformen</h2>
          <p>
            Dieses Impressum gilt auch für folgende Webauftritte:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <a href="https://www.vod-records.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                www.vod-records.com
              </a>{" "}
              — VOD Records Online-Shop
            </li>
            <li>
              <a href="https://www.tape-mag.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                www.tape-mag.com
              </a>{" "}
              — Tape-Mag Archiv &amp; Datenbank
            </li>
            <li>
              <a href="https://vod-records.com/vod-fest" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                vod-records.com/vod-fest
              </a>{" "}
              — VOD Fest Festival
            </li>
          </ul>
        </section>
      </div>
    </main>
  )
}
