import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Widerrufsbelehrung — VOD Auctions",
}

export default function WiderrufPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl mb-8">Widerrufsbelehrung</h1>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-lg font-medium text-foreground">
            Widerrufsrecht für Verbraucher
          </h2>
          <p>
            Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von
            Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist
            beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von
            Ihnen benannter Dritter, der nicht der Beförderer ist, die
            Waren in Besitz genommen haben bzw. hat.
          </p>
          <p>
            Um Ihr Widerrufsrecht auszuüben, müssen Sie uns mittels
            einer eindeutigen Erklärung (z. B. ein mit der Post
            versandter Brief oder E-Mail) über Ihren Entschluss, diesen
            Vertrag zu widerrufen, informieren:
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
            E-Mail:{" "}
            <a
              href="mailto:frank@vinyl-on-demand.com"
              className="text-primary hover:underline"
            >
              frank@vinyl-on-demand.com
            </a>
          </p>
          <p>
            Zur Wahrung der Widerrufsfrist genügt es, dass Sie die
            Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf
            der Widerrufsfrist absenden.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Folgen des Widerrufs
          </h2>
          <p>
            Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle
            Zahlungen, die wir von Ihnen erhalten haben, einschließlich
            der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die
            sich daraus ergeben, dass Sie eine andere Art der Lieferung
            als die von uns angebotene, günstigste Standardlieferung
            gewählt haben), unverzüglich und spätestens binnen vierzehn
            Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über
            Ihren Widerruf dieses Vertrags bei uns eingegangen ist.
          </p>
          <p>
            Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel,
            das Sie bei der ursprünglichen Transaktion eingesetzt haben,
            es sei denn, mit Ihnen wurde ausdrücklich etwas anderes
            vereinbart; in keinem Fall werden Ihnen wegen dieser
            Rückzahlung Entgelte berechnet.
          </p>
          <p>
            Wir können die Rückzahlung verweigern, bis wir die Waren
            wieder zurückerhalten haben oder bis Sie den Nachweis
            erbracht haben, dass Sie die Waren zurückgesandt haben, je
            nachdem, welches der frühere Zeitpunkt ist.
          </p>
          <p>
            Sie haben die Waren unverzüglich und in jedem Fall
            spätestens binnen vierzehn Tagen ab dem Tag, an dem Sie uns
            über den Widerruf dieses Vertrags unterrichten, an uns
            zurückzusenden oder zu übergeben. Die Frist ist gewahrt,
            wenn Sie die Waren vor Ablauf der Frist von vierzehn Tagen
            absenden.
          </p>
          <p>
            Sie tragen die unmittelbaren Kosten der Rücksendung der
            Waren.
          </p>
          <p>
            Sie müssen für einen etwaigen Wertverlust der Waren nur
            aufkommen, wenn dieser Wertverlust auf einen zur Prüfung der
            Beschaffenheit, Eigenschaften und Funktionsweise der Waren
            nicht notwendigen Umgang mit ihnen zurückzuführen ist.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Ausnahmen vom Widerrufsrecht
          </h2>
          <div className="rounded-lg border border-[rgba(232,224,212,0.12)] bg-[rgba(232,224,212,0.03)] p-4">
            <p className="text-foreground font-medium mb-2">
              Wichtiger Hinweis für Auktionskäufe:
            </p>
            <p>
              Das Widerrufsrecht besteht gemäß § 312g Abs. 2 Nr. 10 BGB
              <strong className="text-foreground"> nicht</strong> bei
              Verträgen, die im Rahmen einer öffentlich zugänglichen
              Versteigerung (§ 156 BGB) geschlossen werden. Unsere
              Online-Auktionen können unter diese Ausnahme fallen, soweit
              sie als öffentlich zugängliche Versteigerungen im Sinne des
              Gesetzes ausgestaltet sind.
            </p>
          </div>
          <p className="mt-3">
            Das Widerrufsrecht erlischt ferner bei Verträgen zur
            Lieferung versiegelter Waren, die aus Gründen des
            Gesundheitsschutzes oder der Hygiene nicht zur Rückgabe
            geeignet sind, wenn ihre Versiegelung nach der Lieferung
            entfernt wurde.
          </p>
          <p>
            Bei Direktkäufen (außerhalb von Auktionen) gilt das
            Widerrufsrecht uneingeschränkt.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Muster-Widerrufsformular
          </h2>
          <p>
            (Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie
            bitte dieses Formular aus und senden Sie es zurück.)
          </p>
          <div className="rounded-lg border border-[rgba(232,224,212,0.12)] bg-[rgba(232,224,212,0.03)] p-4 space-y-2">
            <p>
              An: Frank Bull, VOD-Records, Alpenstrasse 25/1, 88045
              Friedrichshafen, E-Mail: frank@vinyl-on-demand.com
            </p>
            <p>
              Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*)
              abgeschlossenen Vertrag über den Kauf der folgenden Waren
              (*):
            </p>
            <p>Bestellt am (*) / erhalten am (*):</p>
            <p>Name des/der Verbraucher(s):</p>
            <p>Anschrift des/der Verbraucher(s):</p>
            <p>Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier):</p>
            <p>Datum:</p>
            <p className="text-xs text-muted-foreground/60">
              (*) Unzutreffendes streichen
            </p>
          </div>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4">
          Stand: März 2026
        </p>
      </div>
    </main>
  )
}
