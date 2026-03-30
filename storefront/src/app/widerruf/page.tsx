import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Right of Withdrawal",
  description: "Right of withdrawal and cancellation policy for VOD Auctions.",
}

export default function WiderrufPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <nav className="text-sm text-muted-foreground mb-4">
        <Link href="/" className="hover:text-primary">Home</Link>
        <span className="mx-2">/</span>
        <span>Right of Withdrawal</span>
      </nav>
      <h1 className="font-serif text-4xl mb-8">Right of Withdrawal</h1>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-lg font-medium text-foreground">
            Withdrawal Policy for Consumers
          </h2>
          <p>
            You have the right to withdraw from this contract within
            fourteen days without giving any reason. The withdrawal
            period is fourteen days from the day on which you, or a
            third party other than the carrier designated by you, have
            taken possession of the goods.
          </p>
          <p>
            To exercise your right of withdrawal, you must inform us by
            means of a clear statement (e.g. a letter sent by post or
            email) of your decision to withdraw from this contract:
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
            Email:{" "}
            <a
              href="mailto:frank@vinyl-on-demand.com"
              className="text-primary hover:underline"
            >
              frank@vinyl-on-demand.com
            </a>
          </p>
          <p>
            To meet the withdrawal deadline, it is sufficient for you to
            send your communication concerning the exercise of the right
            of withdrawal before the withdrawal period has expired.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Effects of Withdrawal
          </h2>
          <p>
            If you withdraw from this contract, we shall reimburse all
            payments received from you, including the costs of delivery
            (with the exception of additional costs resulting from your
            choice of a type of delivery other than the least expensive
            standard delivery offered by us), without undue delay and in
            any event not later than fourteen days from the day on which
            we are informed of your decision to withdraw from this
            contract.
          </p>
          <p>
            We will make the reimbursement using the same means of
            payment as you used for the initial transaction, unless you
            have expressly agreed otherwise; in any event, you will not
            incur any fees as a result of such reimbursement.
          </p>
          <p>
            We may withhold reimbursement until we have received the
            goods back or you have supplied evidence of having sent back
            the goods, whichever is the earliest.
          </p>
          <p>
            You shall send back the goods without undue delay and in any
            event not later than fourteen days from the day on which you
            communicate your withdrawal from this contract to us. The
            deadline is met if you send back the goods before the period
            of fourteen days has expired.
          </p>
          <p>
            You will bear the direct cost of returning the goods.
          </p>
          <p>
            You are only liable for any diminished value of the goods
            resulting from handling other than what is necessary to
            establish the nature, characteristics, and functioning of
            the goods.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Exceptions to the Right of Withdrawal
          </h2>
          <div className="rounded-lg border border-[rgba(232,224,212,0.12)] bg-[rgba(232,224,212,0.03)] p-4">
            <p className="text-foreground font-medium mb-2">
              Important notice for auction purchases:
            </p>
            <p>
              Pursuant to § 312g (2) No. 10 of the German Civil Code
              (BGB), the right of withdrawal{" "}
              <strong className="text-foreground">does not apply</strong>{" "}
              to contracts concluded at a publicly accessible auction
              (§ 156 BGB). Our online auctions may fall under this
              exception insofar as they are structured as publicly
              accessible auctions within the meaning of the law.
            </p>
          </div>
          <p className="mt-3">
            The right of withdrawal also expires for contracts for the
            delivery of sealed goods which are not suitable for return
            due to health protection or hygiene reasons, if their seal
            has been removed after delivery.
          </p>
          <p>
            For direct purchases (outside of auctions), the right of
            withdrawal applies without restriction.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium text-foreground">
            Model Withdrawal Form
          </h2>
          <p>
            (If you wish to withdraw from the contract, please complete
            and return this form.)
          </p>
          <div className="rounded-lg border border-[rgba(232,224,212,0.12)] bg-[rgba(232,224,212,0.03)] p-4 space-y-2">
            <p>
              To: Frank Bull, VOD-Records, Alpenstrasse 25/1, 88045
              Friedrichshafen, Germany, Email: frank@vinyl-on-demand.com
            </p>
            <p>
              I/We (*) hereby give notice that I/We (*) withdraw from
              my/our (*) contract of sale of the following goods (*):
            </p>
            <p>Ordered on (*) / received on (*):</p>
            <p>Name of consumer(s):</p>
            <p>Address of consumer(s):</p>
            <p>Signature of consumer(s) (only for paper notification):</p>
            <p>Date:</p>
            <p className="text-xs text-muted-foreground/60">
              (*) Delete as appropriate
            </p>
          </div>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4">
          Last updated: March 2026
        </p>
      </div>
    </main>
  )
}
