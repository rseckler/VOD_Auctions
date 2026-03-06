import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms and conditions for using VOD Auctions.",
}

export default function AGBPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl mb-8">
        Terms &amp; Conditions
      </h1>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-lg font-medium text-foreground">§ 1 Scope</h2>
          <p>
            (1) These Terms &amp; Conditions apply to all business
            relationships between Frank Bull, VOD-Records,
            Alpenstrasse 25/1, 88045 Friedrichshafen, Germany
            (hereinafter &quot;Seller&quot;) and the customer via the
            VOD Auctions platform (hereinafter &quot;Platform&quot;).
          </p>
          <p>
            (2) The version of these Terms &amp; Conditions valid at the
            time of contract conclusion shall apply.
          </p>
          <p>
            (3) Deviating terms of the customer shall not be recognised
            unless the Seller expressly agrees to their validity in
            writing.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 2 Contracting Party &amp; Contract Formation
          </h2>
          <p>
            (1) The purchase contract is concluded with Frank Bull,
            VOD-Records, Alpenstrasse 25/1, 88045 Friedrichshafen,
            Germany.
          </p>
          <p>
            (2) The presentation of products on the Platform does not
            constitute a legally binding offer, but rather an invitation
            to submit a bid or order.
          </p>
          <p>
            (3) For auctions: The contract is concluded when the highest
            bid is awarded at the end of the auction. The award is
            confirmed by email.
          </p>
          <p>
            (4) For direct purchases: The contract is concluded upon
            order confirmation by email.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 3 Auction Terms
          </h2>
          <p>
            (1) Auctions are conducted in thematically curated blocks.
            Each block has a defined duration.
          </p>
          <p>
            (2) Bids are binding. A bid cannot be retracted once placed.
          </p>
          <p>
            (3) The minimum bid is set by the Seller. Each subsequent
            bid must exceed the current highest bid.
          </p>
          <p>
            (4) Proxy bidding: Customers may set a maximum bid. The
            system automatically bids the lowest amount necessary to
            hold the highest bid until the maximum is reached.
          </p>
          <p>
            (5) In the case of identical bids, the earlier bid takes
            precedence.
          </p>
          <p>
            (6) The Seller reserves the right to cancel or end auctions
            early without stating reasons. In such cases, all submitted
            bids become void.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 4 Prices &amp; Payment
          </h2>
          <p>
            (1) All stated prices are final prices including statutory
            VAT where applicable. Shipping costs are shown separately.
          </p>
          <p>
            (2) For auctions: The final price equals the highest bid at
            auction end plus shipping costs.
          </p>
          <p>
            (3) Payment is processed via the payment service provider
            Stripe. Accepted payment methods: credit card (Visa,
            Mastercard, American Express), SEPA direct debit, and other
            methods supported by Stripe.
          </p>
          <p>
            (4) Payment is due within 7 days of the award or order
            confirmation.
          </p>
          <p>
            (5) Customers outside the EU may purchase without German VAT
            (19%), provided the requirements for a tax-exempt export
            delivery are met.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">§ 5 Shipping &amp; Delivery</h2>
          <p>
            (1) Shipping is handled via DHL or a comparable parcel
            service.
          </p>
          <p>
            (2) Shipping costs:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Germany: €4.99</li>
            <li>Europe: €9.99</li>
            <li>Worldwide: €14.99</li>
          </ul>
          <p>
            (3) For multiple items from the same auction or order,
            shipping is charged only once.
          </p>
          <p>
            (4) Estimated delivery times: 3–7 business days (Germany),
            5–14 business days (EU), 7–21 business days (worldwide)
            after receipt of payment.
          </p>
          <p>
            (5) Transport damage must be reported immediately to the
            Seller and the carrier.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 6 Retention of Title
          </h2>
          <p>
            The goods remain the property of the Seller until full
            payment has been received.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 7 Warranty &amp; Condition Grading
          </h2>
          <p>
            (1) The items offered are predominantly used sound carriers
            and printed materials. Condition is described according to
            industry-standard grading (Mint, Near Mint, Very Good Plus,
            Very Good, Good Plus, Good, Fair, Poor).
          </p>
          <p>
            (2) Statutory warranty rights remain unaffected. For used
            goods, the warranty period is 12 months from delivery.
          </p>
          <p>
            (3) Defects must be reported in writing or by email within
            14 days of receiving the goods.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">§ 8 Liability</h2>
          <p>
            (1) The Seller is fully liable for intent and gross
            negligence.
          </p>
          <p>
            (2) For slight negligence, the Seller is only liable for
            breach of essential contractual obligations (cardinal
            obligations), limited to foreseeable, contract-typical
            damage.
          </p>
          <p>
            (3) The above limitations of liability do not apply to
            injury to life, body, or health.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 9 Data Protection
          </h2>
          <p>
            Information on the processing of personal data can be found
            in our{" "}
            <a href="/datenschutz" className="text-primary hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            § 10 Final Provisions
          </h2>
          <p>
            (1) The law of the Federal Republic of Germany applies,
            excluding the UN Convention on Contracts for the
            International Sale of Goods (CISG).
          </p>
          <p>
            (2) If the customer is a merchant, a legal entity under
            public law, or a special fund under public law, the place
            of jurisdiction for all disputes is the Seller&apos;s place
            of business.
          </p>
          <p>
            (3) Should individual provisions of these Terms &amp;
            Conditions be or become invalid, the validity of the
            remaining provisions shall not be affected.
          </p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4">
          Last updated: March 2026
        </p>
      </div>
    </main>
  )
}
