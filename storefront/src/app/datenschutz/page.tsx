import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Datenschutzerklärung — VOD Auctions",
}

export default function DatenschutzPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl mb-8">Datenschutzerklärung</h1>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
        {/* 1. Verantwortlicher */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            1. Verantwortlicher
          </h2>
          <p>
            Verantwortlich im Sinne der Datenschutz-Grundverordnung
            (DSGVO) und anderer nationaler Datenschutzgesetze sowie
            sonstiger datenschutzrechtlicher Bestimmungen ist:
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
            Deutschland
            <br />
            Telefon: +49 7541 34412
            <br />
            E-Mail:{" "}
            <a
              href="mailto:frank@vinyl-on-demand.com"
              className="text-primary hover:underline"
            >
              frank@vinyl-on-demand.com
            </a>
          </p>
        </section>

        {/* 2. Allgemeines */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            2. Allgemeines zur Datenverarbeitung
          </h2>
          <p>
            Wir verarbeiten personenbezogene Daten unserer Nutzer
            grundsätzlich nur, soweit dies zur Bereitstellung einer
            funktionsfähigen Website sowie unserer Inhalte und Leistungen
            erforderlich ist. Die Rechtsgrundlagen sind Art. 6 Abs. 1
            lit. a (Einwilligung), lit. b (Vertragserfüllung), lit. c
            (rechtliche Verpflichtung) und lit. f (berechtigtes
            Interesse) DSGVO.
          </p>
        </section>

        {/* 3. Hosting */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            3. Hosting
          </h2>
          <p>
            Diese Website wird auf einem Server der Hostinger
            International Ltd. gehostet. Beim Besuch unserer Website
            werden automatisch Informationen in Server-Logdateien
            gespeichert:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Browsertyp und -version</li>
            <li>Verwendetes Betriebssystem</li>
            <li>Referrer-URL</li>
            <li>Hostname des zugreifenden Rechners</li>
            <li>IP-Adresse</li>
            <li>Uhrzeit der Serveranfrage</li>
          </ul>
          <p>
            Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
            Interesse an einem sicheren und effizienten Betrieb).
          </p>
        </section>

        {/* 4. Benutzerkonto */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            4. Benutzerkonto und Registrierung
          </h2>
          <p>
            Zur Teilnahme an Auktionen und zum Direktkauf ist eine
            Registrierung erforderlich. Folgende Daten werden erhoben:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>E-Mail-Adresse</li>
            <li>Passwort (verschlüsselt gespeichert)</li>
            <li>Name und Lieferadresse (bei Bestellung)</li>
          </ul>
          <p>
            Die Authentifizierung erfolgt über Supabase Auth (Supabase
            Inc., EU-Region Frankfurt). Die Daten werden für die Dauer
            der Geschäftsbeziehung und darüber hinaus gemäß gesetzlicher
            Aufbewahrungsfristen gespeichert.
          </p>
          <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>
        </section>

        {/* 5. Auktionen & Gebote */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            5. Auktionen und Gebote
          </h2>
          <p>
            Bei der Gebotsabgabe werden folgende Daten verarbeitet:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Gebotsbetrag und Zeitpunkt</li>
            <li>Benutzer-ID (pseudonymisiert gegenüber anderen Nutzern)</li>
            <li>Proxy-Bid-Maximum (nur intern gespeichert)</li>
          </ul>
          <p>
            Zur Gewährleistung der Echtzeit-Gebotsfunktion werden
            Gebotsdaten temporär in einem Cache-System (Upstash Redis,
            Upstash Inc., EU-Region) zwischengespeichert. Echtzeit-
            Updates werden über Supabase Realtime (WebSocket) übertragen.
          </p>
          <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>
        </section>

        {/* 6. Zahlungsabwicklung */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            6. Zahlungsabwicklung — Stripe
          </h2>
          <p>
            Für die Zahlungsabwicklung nutzen wir den Dienst Stripe
            (Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower,
            Grand Canal Dock, Dublin, D02 H210, Irland).
          </p>
          <p>Bei einer Zahlung werden folgende Daten an Stripe übermittelt:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Zahlungsbetrag und Währung</li>
            <li>Zahlungsmethode (Kreditkartendaten, SEPA etc.)</li>
            <li>Name und E-Mail-Adresse</li>
            <li>Rechnungs- und Lieferadresse</li>
          </ul>
          <p>
            Die Verarbeitung der Zahlungsdaten erfolgt ausschließlich
            durch Stripe. Wir speichern keine Kreditkartendaten auf
            unseren Servern. Stripe ist PCI DSS Level 1 zertifiziert.
          </p>
          <p>
            Datenschutzerklärung von Stripe:{" "}
            <a
              href="https://stripe.com/de/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://stripe.com/de/privacy
            </a>
          </p>
          <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>
        </section>

        {/* 7. Datenbank */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            7. Datenbank und Speicherung — Supabase
          </h2>
          <p>
            Für die Speicherung aller Anwendungsdaten (Benutzerkonten,
            Gebote, Bestellungen, Produktdaten, Bilder) nutzen wir
            Supabase (Supabase Inc.), gehostet in der EU-Region Frankfurt
            (eu-central-1). Supabase bietet:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>PostgreSQL-Datenbank mit Row Level Security (RLS)</li>
            <li>Authentifizierung (Supabase Auth)</li>
            <li>Realtime-Verbindungen für Live-Gebote (WebSocket)</li>
            <li>Datei-Speicher für Produktbilder (Supabase Storage)</li>
          </ul>
          <p>
            Alle Daten werden verschlüsselt übertragen (TLS) und at-rest
            verschlüsselt gespeichert.
          </p>
          <p>
            Datenschutzerklärung von Supabase:{" "}
            <a
              href="https://supabase.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://supabase.com/privacy
            </a>
          </p>
          <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO.</p>
        </section>

        {/* 8. Caching */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            8. Caching — Upstash Redis
          </h2>
          <p>
            Zur Performance-Optimierung und Echtzeit-Gebotsverwaltung
            nutzen wir Upstash Redis (Upstash Inc., EU-Region). Dort
            werden temporäre, nicht-personenbezogene Daten (Gebotsstände,
            Session-Informationen) zwischengespeichert. Die Daten werden
            automatisch nach kurzer Zeit gelöscht.
          </p>
          <p>
            Datenschutzerklärung von Upstash:{" "}
            <a
              href="https://upstash.com/trust/privacy.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://upstash.com/trust/privacy.pdf
            </a>
          </p>
          <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.</p>
        </section>

        {/* 9. Google Fonts */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            9. Google Fonts
          </h2>
          <p>
            Diese Seite nutzt zur Darstellung die Schriftarten
            &quot;DM Sans&quot; und &quot;DM Serif Display&quot; von
            Google Fonts. Die Schriften werden beim Seitenaufruf über die
            Google-Server geladen. Dabei kann Ihre IP-Adresse an Google
            übermittelt werden.
          </p>
          <p>
            Anbieter: Google Ireland Limited, Gordon House, Barrow
            Street, Dublin 4, Irland.
          </p>
          <p>
            Datenschutzerklärung von Google:{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://policies.google.com/privacy
            </a>
          </p>
          <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.</p>
        </section>

        {/* 10. Discogs API */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            10. Discogs API — Produktdaten
          </h2>
          <p>
            Zur Anreicherung unserer Produktdaten (Marktpreise,
            Tracklisten, Credits) nutzen wir die Discogs API (Zink Media
            Inc., Portland, USA). Dabei werden keine personenbezogenen
            Daten der Nutzer an Discogs übermittelt. Es werden
            ausschließlich Produktinformationen abgerufen.
          </p>
          <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.</p>
        </section>

        {/* 11. E-Mails */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            11. Transaktions-E-Mails
          </h2>
          <p>
            Wir versenden transaktionale E-Mails (Registrierung,
            Gebotsbestätigung, Zuschlag, Zahlungsbestätigung,
            Versandbenachrichtigung) über den E-Mail-Dienst Resend
            (Resend Inc., USA). Dabei werden Ihre E-Mail-Adresse und die
            relevanten Bestell-/Gebotsinformationen an Resend übermittelt.
          </p>
          <p>
            Datenschutzerklärung von Resend:{" "}
            <a
              href="https://resend.com/legal/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              https://resend.com/legal/privacy-policy
            </a>
          </p>
          <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>
        </section>

        {/* 12. Externe Bilder */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            12. Externe Bildinhalte
          </h2>
          <p>
            Einige Produktbilder werden von unseren Partnerseiten
            geladen (tape-mag.com, vod-records.com). Beim Laden dieser
            Bilder kann Ihre IP-Adresse an die jeweiligen Server
            übermittelt werden. Diese Server werden ebenfalls von
            VOD-Records betrieben.
          </p>
          <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.</p>
        </section>

        {/* 13. Cookies */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            13. Cookies
          </h2>
          <p>
            Unsere Website verwendet folgende Arten von Cookies:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-foreground">
                Technisch notwendige Cookies:
              </strong>{" "}
              Session-Cookies für die Authentifizierung und
              Warenkorb-Funktion. Diese sind für den Betrieb der Website
              zwingend erforderlich.
            </li>
            <li>
              <strong className="text-foreground">
                Supabase Auth Cookies:
              </strong>{" "}
              Zur Aufrechterhaltung Ihrer Anmeldung (Token-basiert).
            </li>
          </ul>
          <p>
            Wir verwenden <strong className="text-foreground">keine</strong>{" "}
            Tracking-, Analyse- oder Marketing-Cookies. Es findet
            kein Tracking durch Google Analytics oder vergleichbare
            Dienste statt.
          </p>
          <p>
            Sie können Ihren Browser so einstellen, dass er Sie über das
            Setzen von Cookies informiert, Cookies nur im Einzelfall
            erlaubt, die Annahme von Cookies für bestimmte Fälle oder
            generell ausschließt oder das automatische Löschen der
            Cookies beim Schließen des Browsers aktiviert.
          </p>
          <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO, § 25 TDDDG.</p>
        </section>

        {/* 14. Betroffenenrechte */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            14. Ihre Rechte
          </h2>
          <p>
            Sie haben gegenüber uns folgende Rechte hinsichtlich Ihrer
            personenbezogenen Daten:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Recht auf Auskunft (Art. 15 DSGVO)</li>
            <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
            <li>Recht auf Löschung (Art. 17 DSGVO)</li>
            <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
            <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
            <li>Recht auf Widerspruch (Art. 21 DSGVO)</li>
          </ul>
          <p>
            Zur Ausübung Ihrer Rechte wenden Sie sich bitte an:{" "}
            <a
              href="mailto:frank@vinyl-on-demand.com"
              className="text-primary hover:underline"
            >
              frank@vinyl-on-demand.com
            </a>
          </p>
          <p>
            Sie haben zudem das Recht, sich bei einer
            Datenschutz-Aufsichtsbehörde über die Verarbeitung Ihrer
            personenbezogenen Daten zu beschweren. Zuständige
            Aufsichtsbehörde:
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

        {/* 15. Datenweitergabe */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            15. Weitergabe von Daten an Dritte
          </h2>
          <p>
            Eine Weitergabe personenbezogener Daten an Dritte erfolgt
            nur, soweit dies zur Vertragserfüllung erforderlich ist:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-foreground">Stripe</strong> — zur
              Zahlungsabwicklung
            </li>
            <li>
              <strong className="text-foreground">DHL / Paketdienst</strong>{" "}
              — zur Lieferung (Name, Adresse)
            </li>
            <li>
              <strong className="text-foreground">Resend</strong> — zum
              E-Mail-Versand
            </li>
          </ul>
          <p>
            Darüber hinaus findet keine Weitergabe an Dritte statt. Wir
            verkaufen oder vermieten keine personenbezogenen Daten.
          </p>
        </section>

        {/* 16. Datensicherheit */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            16. Datensicherheit
          </h2>
          <p>
            Wir verwenden innerhalb des Website-Besuchs das verbreitete
            TLS-Verfahren (Transport Layer Security) in Verbindung mit
            der jeweils höchsten Verschlüsselungsstufe, die von Ihrem
            Browser unterstützt wird. Alle übertragenen Daten zwischen
            Ihrem Browser und unserem Server sind verschlüsselt.
          </p>
        </section>

        {/* 17. Aufbewahrung */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            17. Speicherdauer
          </h2>
          <p>
            Personenbezogene Daten werden gelöscht oder gesperrt, sobald
            der Zweck der Speicherung entfällt. Eine Speicherung über
            diesen Zeitraum hinaus erfolgt nur, wenn dies durch
            gesetzliche Aufbewahrungsfristen vorgesehen ist
            (Handelsrecht: 6 Jahre, Steuerrecht: 10 Jahre).
          </p>
        </section>

        {/* 18. Plattformübergreifend */}
        <section>
          <h2 className="text-lg font-medium text-foreground">
            18. Hinweis zu weiteren Plattformen
          </h2>
          <p>
            Der Verantwortliche betreibt auch folgende Webauftritte mit
            eigenen Datenschutzhinweisen:
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
              — Online-Shop (PayPal, Google Web Fonts, Cookies)
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
              — Archiv &amp; Datenbank (Google Analytics, Google Tag
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
              — Festival-Seite
            </li>
          </ul>
          <p>
            Bitte beachten Sie die jeweiligen Datenschutzerklärungen
            dieser Plattformen.
          </p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4">
          Stand: März 2026
        </p>
      </div>
    </main>
  )
}
