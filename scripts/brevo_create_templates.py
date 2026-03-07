#!/usr/bin/env python3
"""
Create newsletter templates in Brevo via API.

Uploads 4 HTML email templates with VOD Auctions branding:
1. Auction Block Announcement
2. Weekly Highlights
3. Auction Results
4. Monthly Digest

Usage:
    python3 brevo_create_templates.py           # Create all templates
    python3 brevo_create_templates.py --dry-run  # Preview without creating

Requires: BREVO_API_KEY in VOD_Auctions/backend/.env
"""

import argparse
import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

# Load backend .env for Brevo key
load_dotenv(Path(__file__).parent.parent / "backend" / ".env", override=True)

BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_BASE_URL = "https://api.brevo.com/v3"
TEMPLATE_DIR = Path(__file__).parent / "email-templates"

TEMPLATES = [
    {
        "file": "block_announcement.html",
        "name": "VOD Auctions — Block Announcement",
        "subject": "New Auction: {{ params.BLOCK_TITLE }}",
    },
    {
        "file": "weekly_highlights.html",
        "name": "VOD Auctions — Weekly Highlights",
        "subject": "This Week's Highlights — VOD Auctions",
    },
    {
        "file": "auction_results.html",
        "name": "VOD Auctions — Auction Results",
        "subject": "Auction Results: {{ params.BLOCK_TITLE }}",
    },
    {
        "file": "monthly_digest.html",
        "name": "VOD Auctions — Monthly Digest",
        "subject": "Monthly Digest — VOD Auctions",
    },
]


def create_template(name: str, subject: str, html_content: str, dry_run: bool = False) -> int | None:
    """Create a template in Brevo. Returns template ID."""
    if dry_run:
        print(f"  [DRY] Would create: {name}")
        print(f"        Subject: {subject}")
        print(f"        HTML: {len(html_content)} chars")
        return None

    resp = requests.post(
        f"{BREVO_BASE_URL}/smtp/templates",
        headers={
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
        },
        json={
            "templateName": name,
            "subject": subject,
            "htmlContent": html_content,
            "sender": {
                "name": "VOD Auctions",
                "email": "admin@vod-auctions.com",
            },
            "isActive": True,
        },
        timeout=15,
    )

    if resp.status_code in (200, 201):
        data = resp.json()
        template_id = data.get("id")
        print(f"  Created: {name} (ID: {template_id})")
        return template_id
    else:
        print(f"  ERROR {resp.status_code}: {resp.text[:300]}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Create Brevo newsletter templates")
    parser.add_argument("--dry-run", action="store_true", help="Preview without creating")
    args = parser.parse_args()

    if not BREVO_API_KEY and not args.dry_run:
        print("ERROR: BREVO_API_KEY not set. Check backend/.env")
        sys.exit(1)

    print(f"Brevo Template Creator — {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"Templates dir: {TEMPLATE_DIR}\n")

    results = {}

    for tmpl in TEMPLATES:
        html_path = TEMPLATE_DIR / tmpl["file"]
        if not html_path.exists():
            print(f"  SKIP: {tmpl['file']} not found")
            continue

        html_content = html_path.read_text(encoding="utf-8")
        template_id = create_template(
            name=tmpl["name"],
            subject=tmpl["subject"],
            html_content=html_content,
            dry_run=args.dry_run,
        )
        results[tmpl["name"]] = template_id

    print(f"\n=== Summary ===")
    for name, tid in results.items():
        status = f"ID: {tid}" if tid else ("dry-run" if args.dry_run else "failed")
        print(f"  {name}: {status}")

    if not args.dry_run and any(v for v in results.values()):
        print("\nTemplate IDs can be used with POST /admin/newsletter/send")
        print("Templates are editable in Brevo Dashboard → Templates")


if __name__ == "__main__":
    main()
