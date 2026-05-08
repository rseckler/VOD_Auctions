// Bulk-Invite-Mail an CRM-Bestandskontakte für VOD Auctions Early-Access.
// §7(3) UWG Bestandskundenwerbung — KEIN klassischer Newsletter, sondern
// einmalige Service-Information mit Early-Access-Token.
//
// Drei Intro-Varianten:
//   - "newsletter_subscriber" (Tier 1, opted-in) — herzlich, ohne Disclaimer
//   - "webshop_customer"      (Tier 2, vod-records-Bestandskunde) — mit Bestandskunden-Disclaimer
//   - "tape_mag_member"       (Tier 3, vodtapes-Legacy)              — mit Bestandskunden-Disclaimer
//
// Framing (Robin-Decision 2026-05-08): VOD ist Dachmarke, VOD Auctions ist
// das DRITTE Angebot neben VOD Records + tape-mag.com — nicht "Rebrand",
// sondern "etwas Neues von VOD".

import { emailLayout, emailButton } from "./layout"

export type BulkInviteIntro =
  | "newsletter_subscriber"
  | "webshop_customer"
  | "tape_mag_member"

export interface BulkInviteOpts {
  displayName: string          // Anrede, fallback "there"
  tokenDisplay: string         // VOD-XXXXX-XXXXX
  inviteUrl: string            // https://vod-auctions.com/invite/<token>
  expiresAt: Date
  intro: BulkInviteIntro
  customNote?: string | null   // optionaler Frank-Handschrift-Satz, plain-text
  unsubscribeUrl: string       // master-id-basierter Unsub-Link
}

const STOREFRONT_URL = process.env.STOREFRONT_URL || "https://vod-auctions.com"

const INTRO_TEXT: Record<BulkInviteIntro, { line: string; basis: string | null }> = {
  newsletter_subscriber: {
    line: `Du bist VOD-Newsletter-Subscriber &mdash; deshalb bekommst Du diese Nachricht direkt zum Start.`,
    basis: null, // kein Bestandskunden-Disclaimer, weil opted-in
  },
  webshop_customer: {
    line: `Du hast schon mal bei <strong style="color:#e8e0d4;">VOD Records</strong> bestellt &mdash; deshalb bekommst Du diese einmalige Info zum Start unseres neuen Auktionsangebots.`,
    basis: `Sie erhalten diese E-Mail, weil Sie Bestandskunde bei VOD Records sind und wir Ihnen eine einmalige Information zu unserem ähnlichen neuen Angebot zukommen lassen (§ 7 Abs. 3 UWG). Sie können dem jederzeit widersprechen.`,
  },
  tape_mag_member: {
    line: `Du kennst uns von <strong style="color:#e8e0d4;">tape-mag.com</strong> &mdash; deshalb diese einmalige Info zum Start unseres neuen Auktionsangebots.`,
    basis: `Sie erhalten diese E-Mail, weil Sie auf tape-mag.com (VOD) registriert sind und wir Ihnen eine einmalige Information zu unserem ähnlichen neuen Angebot zukommen lassen (§ 7 Abs. 3 UWG). Sie können dem jederzeit widersprechen.`,
  },
}

export function bulkInviteEmail(opts: BulkInviteOpts): { subject: string; html: string } {
  const expiryStr = opts.expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const intro = INTRO_TEXT[opts.intro]
  const introLine = intro.line
  const legalBasis = intro.basis

  const customNoteBlock = opts.customNote
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#252016;border-left:3px solid #d4a54a;border-radius:4px;margin:0 0 24px;border-collapse:collapse;">
         <tr><td style="padding:14px 18px;">
           <p style="margin:0;font-size:14px;color:#c4bdb5;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;font-style:italic;">${escapeHtml(opts.customNote)}</p>
           <p style="margin:8px 0 0;font-size:11px;color:#6b6560;font-family:'DM Sans',-apple-system,sans-serif;">— Frank, VOD</p>
         </td></tr>
       </table>`
    : ""

  const legalBasisBlock = legalBasis
    ? `<p style="margin:24px 0 0;font-size:11px;color:#6b6560;line-height:1.6;text-align:left;font-family:'DM Sans',-apple-system,sans-serif;border-top:1px solid #2a2520;padding-top:16px;">${legalBasis}</p>`
    : ""

  const subject =
    opts.intro === "newsletter_subscriber"
      ? `Dein Early-Access für VOD Auctions ist da, ${opts.displayName}`
      : `${opts.displayName}, VOD startet etwas Neues — Dein Early-Access`

  return {
    subject,
    html: emailLayout(
      `
      <p style="margin:0 0 18px;font-size:20px;font-weight:700;color:#e8e0d4;line-height:1.4;font-family:'DM Serif Display','DM Sans',-apple-system,sans-serif;">
        Hallo ${escapeHtml(opts.displayName)},
      </p>

      <p style="margin:0 0 16px;font-size:15px;color:#c4bdb5;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        Wir starten <strong style="color:#e8e0d4;">VOD Auctions</strong> &mdash; unsere neue Auktionsplattform für seltene Industrial-, EBM-, Post-Punk- und elektronische Musik.
      </p>

      <p style="margin:0 0 16px;font-size:15px;color:#c4bdb5;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        VOD Auctions ist neben <strong style="color:#e8e0d4;">VOD Records</strong> und <strong style="color:#e8e0d4;">tape-mag.com</strong> unser drittes Angebot. ${introLine}
      </p>

      <p style="margin:0 0 24px;font-size:15px;color:#c4bdb5;line-height:1.7;font-family:'DM Sans',-apple-system,sans-serif;">
        41.500 sorgfältig kuratierte Releases warten. Keine eBay-Gebühren, keine Discogs-Provisionen.
      </p>

      ${customNoteBlock}

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111009;border-radius:8px;border:1px solid #2a2520;margin:0 0 24px;border-collapse:collapse;">
        <tr><td style="padding:20px;text-align:center;">
          <p style="margin:0 0 6px;font-size:11px;color:#6b6560;text-transform:uppercase;letter-spacing:0.1em;font-family:'DM Sans',-apple-system,sans-serif;">Dein persönlicher Early-Access-Code</p>
          <p style="margin:0;font-size:22px;font-weight:700;color:#d4a54a;letter-spacing:0.08em;font-family:'DM Sans',-apple-system,monospace;">${opts.tokenDisplay}</p>
        </td></tr>
      </table>

      ${emailButton("Account anlegen", opts.inviteUrl)}

      <p style="margin:20px 0 0;font-size:12px;color:#4a4540;text-align:center;line-height:1.6;font-family:'DM Sans',-apple-system,sans-serif;">
        Dieser Link ist persönlich und kann nur einmal verwendet werden.<br>
        Gültig bis ${expiryStr}.
      </p>

      ${legalBasisBlock}
    `,
      {
        preheader: `Dein Early-Access-Code für VOD Auctions — ${opts.tokenDisplay}`,
        unsubscribeUrl: opts.unsubscribeUrl,
      }
    ),
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
