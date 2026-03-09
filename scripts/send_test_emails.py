#!/usr/bin/env python3
"""
Send all 6 transactional + 4 newsletter test emails to a test address.

Usage: python3 send_test_emails.py rseckler@gmail.com
"""

import os
import sys
import time
import json
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / "backend" / ".env", override=True)

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
FROM_EMAIL = "VOD Auctions <noreply@vod-auctions.com>"
APP_URL = "https://vod-auctions.com"
SAMPLE_COVER = "https://tape-mag.com/bilder/gross/32107_1.jpg"

# --- Shared layout components (Python port of layout.ts) ---

def email_header():
    return """<tr>
  <td style="background-color:#1c1915;padding:24px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="width:22px;height:22px;background-color:#d4a54a;border-radius:50%;text-align:center;vertical-align:middle;font-size:11px;font-weight:bold;color:#1c1915;line-height:22px;">V</td>
        <td style="padding-left:8px;color:#d4a54a;font-weight:600;font-size:14px;">VOD Auctions</td>
      </tr>
    </table>
  </td>
</tr>"""

def email_footer():
    return """<tr>
  <td style="border-top:1px solid #e4e4e7;padding:16px 24px;text-align:center;font-size:11px;color:#a1a1aa;">
    <p style="margin:0;">VOD Auctions &mdash; Curated Music Auctions</p>
    <p style="margin:4px 0 0;">
      <a href="#" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe</a> &middot;
      <a href="#" style="color:#a1a1aa;text-decoration:underline;">Settings</a>
    </p>
  </td>
</tr>"""

def email_layout(content):
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>VOD Auctions</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
        {email_header()}
        <tr><td style="padding:24px;">{content}</td></tr>
        {email_footer()}
      </table>
    </td></tr>
  </table>
</body></html>"""

def btn(text, url):
    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="{url}" style="display:inline-block;width:100%;max-width:400px;padding:12px 24px;background-color:#d4a54a;color:#1c1915;font-size:14px;font-weight:600;text-align:center;text-decoration:none;border-radius:8px;box-sizing:border-box;">{text}</a>
    </td></tr></table>"""

def item_preview(title, subtitle="", img=None):
    img_td = f'<td style="width:56px;vertical-align:top;"><img src="{img}" alt="" width="56" height="56" style="border-radius:8px;object-fit:cover;display:block;" /></td>' if img else ""
    pl = "12px" if img else "0"
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;padding:12px;margin-bottom:16px;">
  <tr>{img_td}<td style="padding-left:{pl};vertical-align:top;">
    {f'<p style="margin:0;font-size:12px;color:#71717a;">{subtitle}</p>' if subtitle else ""}
    <p style="margin:2px 0 0;font-size:14px;font-weight:500;color:#18181b;">{title}</p>
  </td></tr></table>"""

def fp(amount):
    return f"€{amount:.2f}"

# --- 6 Transactional Email Templates ---

def welcome_html():
    return email_layout(f"""
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#18181b;">Welcome, Robin!</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;line-height:1.6;">
        Great to have you on board. VOD Auctions is your platform for curated auctions of rare records
        from the world of Industrial, Experimental &amp; Electronic Music.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;line-height:1.6;">
        Over 40,000 records are waiting in thematically curated auction blocks for new owners.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr><td style="padding:12px;">
          <p style="margin:0;font-size:12px;color:#71717a;">Your next step:</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:500;color:#18181b;">Browse our current auctions and place your first bid!</p>
        </td></tr>
      </table>
      {btn("Browse Auctions", f"{APP_URL}/auctions")}
    """)

def outbid_html():
    return email_layout(f"""
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:16px;">
        <tr><td style="padding:12px;"><p style="margin:0;font-size:14px;font-weight:600;color:#c2410c;">You've been outbid!</p></td></tr>
      </table>
      {item_preview("Cabaret Voltaire — Red Mecca", "Lot #03 — Industrial Classics 1980-1985", SAMPLE_COVER)}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr><td style="padding:12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:13px;color:#71717a;padding:2px 0;">Your bid</td>
              <td style="font-size:13px;color:#18181b;text-align:right;text-decoration:line-through;padding:2px 0;">{fp(15)}</td></tr>
          <tr><td style="font-size:13px;color:#71717a;padding:2px 0;">Current highest bid</td>
              <td style="font-size:13px;color:#c2410c;font-weight:600;text-align:right;padding:2px 0;">{fp(18)}</td></tr>
        </table></td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">Another bidder has taken the lead. The auction is still running — bid again now!</p>
      {btn("Bid Again", f"{APP_URL}/auctions/industrial-classics/item-123")}
    """)

def bid_won_html():
    return email_layout(f"""
      <div style="text-align:center;margin-bottom:16px;">
        <p style="font-size:32px;margin:0;">&#127881;</p>
        <h2 style="margin:4px 0;font-size:18px;font-weight:bold;color:#18181b;">Congratulations, Robin!</h2>
        <p style="margin:0;font-size:14px;color:#71717a;">You won the auction.</p>
      </div>
      {item_preview("Cabaret Voltaire — Red Mecca", "Lot #03 — Industrial Classics 1980-1985", SAMPLE_COVER)}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:16px;">
        <tr><td style="padding:12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:13px;color:#52525b;padding:2px 0;">Final price</td>
              <td style="font-size:13px;color:#15803d;font-weight:bold;text-align:right;padding:2px 0;">{fp(25)}</td></tr>
        </table></td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">Please complete your payment within 7 days so we can ship your record as soon as possible.</p>
      {btn("Pay Now", f"{APP_URL}/account/wins")}
    """)

def payment_html():
    return email_layout(f"""
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:16px;">
        <tr><td style="padding:12px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:16px;color:#15803d;padding-right:8px;">&#10003;</td>
          <td style="font-size:14px;font-weight:600;color:#15803d;">Payment successfully received</td>
        </tr></table></td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">Hi Robin, we have received your payment. Your order is now being prepared for shipping.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr><td style="padding:12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:13px;color:#71717a;padding:2px 0;">Order number</td>
              <td style="font-size:13px;color:#18181b;font-family:monospace;text-align:right;padding:2px 0;">#01KJPSH37MYWW</td></tr>
          <tr><td style="font-size:13px;color:#71717a;padding:2px 0;">Paid on</td>
              <td style="font-size:13px;color:#18181b;text-align:right;padding:2px 0;">09/03/2026</td></tr>
        </table></td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr><td style="padding:12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:13px;color:#18181b;padding:4px 0;">Cabaret Voltaire — Red Mecca</td>
              <td style="font-size:13px;color:#18181b;text-align:right;padding:4px 0;">{fp(25)}</td></tr>
          <tr><td style="font-size:13px;color:#18181b;padding:4px 0;">Skinny Puppy — Cleanse Fold and Manipulate</td>
              <td style="font-size:13px;color:#18181b;text-align:right;padding:4px 0;">{fp(18)}</td></tr>
          <tr><td style="font-size:13px;color:#71717a;padding:4px 0;">Shipping</td>
              <td style="font-size:13px;color:#18181b;text-align:right;padding:4px 0;">{fp(4.99)}</td></tr>
          <tr><td colspan="2" style="border-top:1px solid #e4e4e7;padding-top:8px;margin-top:4px;"></td></tr>
          <tr><td style="font-size:14px;font-weight:600;color:#18181b;padding:2px 0;">Total</td>
              <td style="font-size:14px;font-weight:bold;color:#18181b;text-align:right;padding:2px 0;">{fp(47.99)}</td></tr>
        </table></td></tr>
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#71717a;">We'll notify you when your order ships.</p>
      {btn("View Order", f"{APP_URL}/account/orders")}
    """)

def shipping_html():
    return email_layout(f"""
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#18181b;">Your order has shipped!</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">Hi Robin, your order has been shipped and is on its way to you.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:16px;">
        <tr><td style="padding:12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:13px;color:#71717a;padding:2px 0;">Carrier</td>
              <td style="font-size:13px;color:#18181b;text-align:right;padding:2px 0;">Deutsche Post</td></tr>
          <tr><td style="font-size:13px;color:#71717a;padding:2px 0;">Tracking number</td>
              <td style="font-size:13px;color:#18181b;font-family:monospace;text-align:right;padding:2px 0;">RR123456789DE</td></tr>
        </table></td></tr>
      </table>
      {item_preview("Cabaret Voltaire — Red Mecca", "Order #01KJPSH37MYWW", SAMPLE_COVER)}
      {item_preview("Skinny Puppy — Cleanse Fold and Manipulate", "Order #01KJPSH37MYWW")}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fafafa;border-radius:8px;margin-bottom:16px;">
        <tr><td style="padding:12px;">
          <p style="margin:0 0 4px;font-size:12px;color:#71717a;">Delivery address</p>
          <p style="margin:0;font-size:14px;color:#18181b;">Robin Seckler<br/>Musterstraße 1<br/>80331 München<br/>Germany</p>
        </td></tr>
      </table>
      {btn("Track Shipment", "https://www.deutschepost.de/sendung/simpleQueryResult.html?form.sendungsnummer=RR123456789DE")}
    """)

def feedback_html():
    rating_buttons = ""
    emojis = [("&#128543;", "1"), ("&#128528;", "2"), ("&#128578;", "3"), ("&#128522;", "4"), ("&#129321;", "5")]
    for emoji, label in emojis:
        rating_buttons += f'<td style="text-align:center;"><a href="{APP_URL}/account/feedback?order=01KJPSH37MYWW&rating={label}" style="display:inline-block;width:40px;height:40px;line-height:40px;background-color:#f4f4f5;border-radius:50%;font-size:20px;text-decoration:none;">{emoji}</a></td>'

    return email_layout(f"""
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#18181b;">How was your purchase?</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">Hi Robin, your order should have arrived by now. We hope you're happy with it!</p>
      {item_preview("Cabaret Voltaire — Red Mecca", img=SAMPLE_COVER)}
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;">Your feedback helps us make VOD Auctions even better. How do you rate your purchase?</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;"><tr>{rating_buttons}</tr></table>
      {btn("Leave Feedback", f"{APP_URL}/account/feedback?order=01KJPSH37MYWW")}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background-color:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-top:16px;">
        <tr><td style="padding:12px;">
          <p style="margin:0;font-size:14px;font-weight:500;color:#92400e;">New auctions are waiting!</p>
          <p style="margin:4px 0 0;font-size:12px;color:#b45309;">Check out our upcoming auction blocks.</p>
          <p style="margin:8px 0 0;"><a href="{APP_URL}/auctions" style="font-size:12px;color:#d4a54a;text-decoration:underline;">Browse auctions</a></p>
        </td></tr>
      </table>
    """)


# --- Send functions ---

def send_resend(to, subject, html):
    resp = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
        json={"from": FROM_EMAIL, "to": [to], "subject": subject, "html": html},
        timeout=10,
    )
    return resp.status_code in (200, 201), resp.text[:150]

def send_brevo_test(to, template_id, params=None):
    resp = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
        json={
            "templateId": template_id,
            "to": [{"email": to}],
            "params": params or {},
        },
        timeout=10,
    )
    return resp.status_code in (200, 201), resp.text[:150]


def main():
    to = sys.argv[1] if len(sys.argv) > 1 else None
    if not to:
        print("Usage: python3 send_test_emails.py <email>")
        sys.exit(1)

    if not RESEND_API_KEY:
        print("ERROR: RESEND_API_KEY not set")
        sys.exit(1)

    print(f"Sending test emails to {to}...\n")

    # --- 6 Transactional Emails (Resend) ---
    print("=== Transactional Emails (via Resend) ===")
    transactional = [
        ("1/6 Welcome", "Welcome to VOD Auctions!", welcome_html()),
        ("2/6 Outbid", "You've been outbid — Lot #03", outbid_html()),
        ("3/6 Bid Won", "Congratulations! You won Lot #03", bid_won_html()),
        ("4/6 Payment", "Payment Confirmed — Order #01KJPSH37MYWW", payment_html()),
        ("5/6 Shipping", "Your order has shipped!", shipping_html()),
        ("6/6 Feedback", "How was your experience at VOD Auctions?", feedback_html()),
    ]

    for name, subject, html in transactional:
        ok, detail = send_resend(to, f"[TEST] {subject}", html)
        status = "sent" if ok else f"FAILED: {detail}"
        print(f"  {'✓' if ok else '✗'} {name}: {status}")
        time.sleep(0.5)

    # --- 4 Newsletter Templates (Brevo) ---
    print("\n=== Newsletter Templates (via Brevo) ===")
    newsletters = [
        ("7/10 Block Announcement", 2, {"BLOCK_TITLE": "Industrial Classics 1980-1985", "BLOCK_URL": f"{APP_URL}/auctions/industrial-classics", "ITEM_COUNT": "25"}),
        ("8/10 Weekly Highlights", 3, {}),
        ("9/10 Auction Results", 4, {"BLOCK_TITLE": "Industrial Classics 1980-1985", "TOTAL_LOTS": "25", "SOLD_LOTS": "22", "TOTAL_BIDS": "147"}),
        ("10/10 Monthly Digest", 5, {}),
    ]

    for name, template_id, params in newsletters:
        ok, detail = send_brevo_test(to, template_id, params)
        status = "sent" if ok else f"FAILED: {detail}"
        print(f"  {'✓' if ok else '✗'} {name}: {status}")
        time.sleep(0.5)

    print(f"\nDone! Check inbox of {to}")


if __name__ == "__main__":
    main()
