#!/usr/bin/env python3
"""
Verify a new sender email address in Brevo.

1. Lists current verified senders
2. Creates newsletter@vod-auctions.com as new sender (if not exists)

Usage:
    python3 brevo_verify_sender.py              # List senders + create new
    python3 brevo_verify_sender.py --list-only   # Only list existing senders

Requires: BREVO_API_KEY in VOD_Auctions/backend/.env
"""

import argparse
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / "backend" / ".env", override=True)

BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_BASE_URL = "https://api.brevo.com/v3"
HEADERS = {
    "api-key": BREVO_API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
}

NEW_SENDER_EMAIL = "newsletter@vod-auctions.com"
NEW_SENDER_NAME = "VOD Auctions"


def list_senders():
    """List all verified senders in the Brevo account."""
    resp = requests.get(f"{BREVO_BASE_URL}/senders", headers=HEADERS, timeout=10)
    if resp.status_code != 200:
        print(f"ERROR listing senders: {resp.status_code} — {resp.text[:300]}")
        return []

    senders = resp.json().get("senders", [])
    print(f"\n=== Current Brevo Senders ({len(senders)}) ===")
    for s in senders:
        status = "active" if s.get("active") else "pending"
        print(f"  ID {s['id']}: {s['name']} <{s['email']}> [{status}]")
    print()
    return senders


def create_sender():
    """Create newsletter@vod-auctions.com as a new sender."""
    print(f"Creating sender: {NEW_SENDER_NAME} <{NEW_SENDER_EMAIL}>...")

    resp = requests.post(
        f"{BREVO_BASE_URL}/senders",
        headers=HEADERS,
        json={
            "name": NEW_SENDER_NAME,
            "email": NEW_SENDER_EMAIL,
        },
        timeout=10,
    )

    if resp.status_code in (200, 201):
        data = resp.json()
        print(f"  Created sender ID: {data.get('id')}")
        print(f"  Status: Verification email may be sent to {NEW_SENDER_EMAIL}")
        print()
        print("  NEXT STEPS:")
        print(f"  1. Check inbox of {NEW_SENDER_EMAIL} for Brevo verification email")
        print("  2. Click the verification link")
        print("  3. OR: If domain (vod-auctions.com) is already verified in Brevo,")
        print("     the sender may be auto-verified")
        return True
    elif resp.status_code == 400 and "already exists" in resp.text.lower():
        print(f"  Sender {NEW_SENDER_EMAIL} already exists!")
        return True
    else:
        print(f"  ERROR {resp.status_code}: {resp.text[:300]}")
        return False


def update_existing_templates():
    """Update all 4 existing newsletter templates to use the new sender."""
    template_ids = [2, 3, 4, 5]
    print(f"Updating {len(template_ids)} templates to use {NEW_SENDER_EMAIL}...")

    for tid in template_ids:
        resp = requests.put(
            f"{BREVO_BASE_URL}/smtp/templates/{tid}",
            headers=HEADERS,
            json={
                "sender": {
                    "name": NEW_SENDER_NAME,
                    "email": NEW_SENDER_EMAIL,
                },
            },
            timeout=10,
        )
        if resp.status_code in (200, 204):
            print(f"  Template {tid}: updated sender")
        else:
            print(f"  Template {tid}: ERROR {resp.status_code} — {resp.text[:200]}")


def main():
    parser = argparse.ArgumentParser(description="Verify Brevo sender")
    parser.add_argument("--list-only", action="store_true", help="Only list senders")
    args = parser.parse_args()

    if not BREVO_API_KEY:
        print("ERROR: BREVO_API_KEY not set. Check backend/.env")
        sys.exit(1)

    senders = list_senders()

    if args.list_only:
        return

    # Check if sender already exists
    existing = [s for s in senders if s["email"] == NEW_SENDER_EMAIL]
    if existing:
        s = existing[0]
        if s.get("active"):
            print(f"{NEW_SENDER_EMAIL} is already verified and active!")
            print("\nUpdating templates to use this sender...")
            update_existing_templates()
        else:
            print(f"{NEW_SENDER_EMAIL} exists but is NOT yet verified.")
            print("Check your inbox for the Brevo verification email.")
    else:
        success = create_sender()
        if success:
            print("\nAfter verification, run this script again to update templates.")
            print("Or run with --list-only to check status.")


if __name__ == "__main__":
    main()
