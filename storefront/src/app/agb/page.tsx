import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "AGB — VOD Auctions",
}

export default function AGBPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl mb-8">
        Allgemeine Geschäftsbedingungen (AGB)
      </h1>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-lg font-medium text-foreground">§ 1 Geltungsbereich</h2>
          <p>
            (1) Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für
            alle Geschäftsbeziehungen zwischen Frank Bull, VOD-Records,
            Alpenstrasse 25/1, 88045 Friedrichshafen (nachfolgend
            &quot;Anbieter&quot;) und dem Kunden über die Plattform
            VOD Auctions (nachfolgend &quot;Plattform&quot;).
          </p>
          <p>
            (2) Maßgeblich ist die jeweils zum Zeitpunkt des
            Vertragsschlusses gültige Fassung dieser AGB.
          </p>
          <p>
            (3) Abweichende Bedingungen des Kunden werden nicht
            anerkannt, es sei denn, der Anbieter stimmt ihrer Geltung
            ausdrücklich schriftlich zu.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 2 Vertragspartner und Vertragsschluss
          </h2>
          <p>
            (1) Der Kaufvertrag kommt zustande mit Frank Bull,
            VOD-Records, Alpenstrasse 25/1, 88045 Friedrichshafen.
          </p>
          <p>
            (2) Die Darstellung der Produkte auf der Plattform stellt
            kein rechtlich bindendes Angebot, sondern eine Aufforderung
            zur Gebotsabgabe bzw. Bestellung dar.
          </p>
          <p>
            (3) Bei Auktionen: Der Vertrag kommt durch Zuschlag zum
            Höchstgebot bei Auktionsende zustande. Der Zuschlag wird per
            E-Mail bestätigt.
          </p>
          <p>
            (4) Bei Direktkauf: Der Vertrag kommt durch die
            Bestellbestätigung per E-Mail zustande.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 3 Auktionsbedingungen
          </h2>
          <p>
            (1) Auktionen werden in thematisch kuratierten Blöcken
            durchgeführt. Jeder Block hat eine festgelegte Laufzeit.
          </p>
          <p>
            (2) Gebote sind verbindlich. Ein Gebot kann nach Abgabe
            nicht zurückgenommen werden.
          </p>
          <p>
            (3) Das Mindestgebot wird vom Anbieter festgelegt. Jedes
            folgende Gebot muss höher sein als das aktuelle Höchstgebot.
          </p>
          <p>
            (4) Proxy-Bidding: Kunden können ein Maximalgebot angeben.
            Das System bietet automatisch den niedrigstmöglichen Betrag,
            der zum Höchstgebot führt, bis das Maximum erreicht ist.
          </p>
          <p>
            (5) Bei identischen Geboten erhält das zeitlich frühere
            Gebot den Zuschlag.
          </p>
          <p>
            (6) Der Anbieter behält sich das Recht vor, Auktionen ohne
            Angabe von Gründen zu stornieren oder vorzeitig zu beenden.
            Bereits abgegebene Gebote werden in diesem Fall ungültig.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 4 Preise und Zahlung
          </h2>
          <p>
            (1) Alle angegebenen Preise sind Endpreise inkl. der
            gesetzlichen Mehrwertsteuer (sofern anwendbar). Versandkosten
            werden gesondert ausgewiesen.
          </p>
          <p>
            (2) Bei Auktionen: Der Endpreis entspricht dem Höchstgebot
            bei Auktionsende zuzüglich Versandkosten.
          </p>
          <p>
            (3) Die Zahlung erfolgt über den Zahlungsdienstleister
            Stripe. Akzeptierte Zahlungsmittel: Kreditkarte (Visa,
            Mastercard, American Express), SEPA-Lastschrift, und weitere
            von Stripe unterstützte Zahlungsmethoden.
          </p>
          <p>
            (4) Die Zahlung ist innerhalb von 7 Tagen nach Zuschlag
            bzw. Bestellbestätigung fällig.
          </p>
          <p>
            (5) Kunden außerhalb der EU können ohne deutsche
            Mehrwertsteuer (19%) kaufen, sofern die Voraussetzungen für
            eine steuerfreie Ausfuhrlieferung erfüllt sind.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">§ 5 Versand und Lieferung</h2>
          <p>
            (1) Der Versand erfolgt per DHL oder vergleichbarem
            Paketdienst.
          </p>
          <p>
            (2) Versandkosten:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Deutschland: 4,99 €</li>
            <li>EU: 9,99 €</li>
            <li>Weltweit: 14,99 €</li>
          </ul>
          <p>
            (3) Bei mehreren Artikeln aus einer Auktion bzw. Bestellung
            werden die Versandkosten nur einmal berechnet.
          </p>
          <p>
            (4) Die Lieferzeit beträgt in der Regel 3–7 Werktage
            (Deutschland), 5–14 Werktage (EU) bzw. 7–21 Werktage
            (Weltweit) nach Zahlungseingang.
          </p>
          <p>
            (5) Transportschäden sind unverzüglich dem Anbieter und dem
            Transportunternehmen zu melden.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 6 Eigentumsvorbehalt
          </h2>
          <p>
            Die Ware bleibt bis zur vollständigen Bezahlung Eigentum des
            Anbieters.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 7 Gewährleistung und Zustandsbeschreibung
          </h2>
          <p>
            (1) Es handelt sich bei den angebotenen Artikeln
            überwiegend um gebrauchte Tonträger und Druckerzeugnisse. Der
            Zustand wird nach branchenüblichen Standards beschrieben
            (Mint, Near Mint, Very Good Plus, Very Good, Good Plus, Good,
            Fair, Poor).
          </p>
          <p>
            (2) Die gesetzlichen Gewährleistungsrechte bleiben
            unberührt. Bei gebrauchten Waren beträgt die
            Gewährleistungsfrist 12 Monate ab Lieferung.
          </p>
          <p>
            (3) Mängel sind innerhalb von 14 Tagen nach Erhalt der
            Ware schriftlich oder per E-Mail anzuzeigen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">§ 8 Haftung</h2>
          <p>
            (1) Der Anbieter haftet unbeschränkt für Vorsatz und grobe
            Fahrlässigkeit.
          </p>
          <p>
            (2) Bei leichter Fahrlässigkeit haftet der Anbieter nur bei
            Verletzung wesentlicher Vertragspflichten
            (Kardinalpflichten), begrenzt auf den vorhersehbaren,
            vertragstypischen Schaden.
          </p>
          <p>
            (3) Die vorstehenden Haftungsbeschränkungen gelten nicht bei
            Verletzung von Leben, Körper oder Gesundheit.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 9 Datenschutz
          </h2>
          <p>
            Informationen zur Verarbeitung personenbezogener Daten
            finden Sie in unserer{" "}
            <a href="/datenschutz" className="text-primary hover:underline">
              Datenschutzerklärung
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 10 Schlussbestimmungen
          </h2>
          <p>
            (1) Es gilt das Recht der Bundesrepublik Deutschland unter
            Ausschluss des UN-Kaufrechts (CISG).
          </p>
          <p>
            (2) Sofern der Kunde Kaufmann, juristische Person des
            öffentlichen Rechts oder öffentlich-rechtliches
            Sondervermögen ist, ist Gerichtsstand für alle
            Streitigkeiten der Sitz des Anbieters.
          </p>
          <p>
            (3) Sollten einzelne Bestimmungen dieser AGB unwirksam sein
            oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen
            unberührt.
          </p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4">
          Stand: März 2026
        </p>
      </div>
    </main>
  )
}
