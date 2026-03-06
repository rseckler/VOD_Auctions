import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Legal Notice",
  description: "Legal notice and imprint for VOD Auctions (Impressum).",
}

export default function ImpressumPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl mb-8">Legal Notice (Impressum)</h1>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-lg font-medium text-foreground">
            Information pursuant to § 5 TMG (German Telemedia Act)
          </h2>
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
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">Contact</h2>
          <p>
            Phone: +49 7541 34412
            <br />
            Email:{" "}
            <a href="mailto:frank@vinyl-on-demand.com" className="text-primary hover:underline">
              frank@vinyl-on-demand.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">VAT ID</h2>
          <p>
            VAT Identification Number pursuant to § 27a of the German
            VAT Act (UStG):
            <br />
            DE232493058
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Responsible for content pursuant to § 55 (2) RStV
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
            EU Dispute Resolution
          </h2>
          <p>
            The European Commission provides a platform for online
            dispute resolution (ODR):{" "}
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
            We are neither willing nor obliged to participate in dispute
            resolution proceedings before a consumer arbitration board.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">Liability for Content</h2>
          <p>
            As a service provider, we are responsible for our own content
            on these pages in accordance with § 7 (1) TMG (German
            Telemedia Act). However, pursuant to §§ 8 to 10 TMG, we are
            not obligated to monitor transmitted or stored third-party
            information, or to investigate circumstances that indicate
            illegal activity.
          </p>
          <p>
            Obligations to remove or block the use of information under
            general law remain unaffected. However, liability in this
            regard is only possible from the point in time at which
            knowledge of a specific infringement is obtained. Upon
            becoming aware of any such violations, we will remove the
            content immediately.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">Liability for Links</h2>
          <p>
            Our website contains links to external third-party websites
            over whose content we have no influence. Therefore, we
            cannot accept any liability for such external content. The
            respective provider or operator of the linked pages is
            always responsible for their content. The linked pages were
            checked for possible legal violations at the time of linking.
            Illegal content was not apparent at the time of linking.
          </p>
          <p>
            However, permanent monitoring of the content of linked pages
            is unreasonable without concrete evidence of a violation. If
            we become aware of any legal violations, we will remove such
            links immediately.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">Copyright</h2>
          <p>
            The content and works on these pages created by the site
            operators are subject to German copyright law. Reproduction,
            editing, distribution, and any kind of exploitation outside
            the limits of copyright law require the written consent of
            the respective author or creator. Downloads and copies of
            this site are only permitted for private, non-commercial use.
          </p>
          <p>
            Insofar as the content on this site was not created by the
            operator, the copyrights of third parties are respected. In
            particular, third-party content is marked as such. Should
            you nevertheless become aware of a copyright infringement,
            please notify us accordingly. Upon becoming aware of any
            violations, we will remove such content immediately.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">Other Platforms</h2>
          <p>
            This legal notice also applies to the following websites:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <a href="https://www.vod-records.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                www.vod-records.com
              </a>{" "}
              — VOD Records Online Shop
            </li>
            <li>
              <a href="https://www.tape-mag.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                www.tape-mag.com
              </a>{" "}
              — Tape-Mag Archive &amp; Database
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
