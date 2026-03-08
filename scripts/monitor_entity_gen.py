#!/usr/bin/env python3
"""Monitor entity content generation and send status emails via Brevo every 15 min."""

import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

BREVO_API_KEY = os.getenv("BREVO_API_KEY")
TO_EMAIL = "rseckler@gmail.com"
LOG_FILE = Path(__file__).parent / "entity_content_p1.log"
INTERVAL = 900  # 15 minutes


def is_process_running():
    result = subprocess.run(
        ["pgrep", "-f", "generate_entity_content.py"],
        capture_output=True, text=True
    )
    return result.returncode == 0


def get_log_stats():
    if not LOG_FILE.exists():
        return {"generated": 0, "errors": 0, "last_lines": "", "current": "", "done": ""}

    content = LOG_FILE.read_text()
    lines = content.strip().split("\n")

    generated = len(re.findall(r"Generated \d+/\d+", content))
    errors = content.lower().count("error")

    last_lines = "\n".join(lines[-15:]) if lines else ""

    processing = [l for l in lines if "Processing:" in l]
    current = processing[-1].strip() if processing else ""

    done = [l.strip() for l in lines if "Done:" in l]
    done_text = "\n".join(done)

    total_lines = [l.strip() for l in lines if "TOTAL:" in l]
    total_text = "\n".join(total_lines)

    return {
        "generated": generated,
        "errors": errors,
        "last_lines": last_lines,
        "current": current,
        "done": done_text,
        "total": total_text,
    }


def send_email(subject, html_body):
    resp = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
        json={
            "sender": {"name": "VOD Auctions", "email": "admin@vod-auctions.com"},
            "to": [{"email": TO_EMAIL, "name": "Robin Seckler"}],
            "subject": subject,
            "htmlContent": html_body,
        },
    )
    return resp.status_code


def build_email(running, stats, timestamp):
    status = "Running" if running else "Finished"
    subject = f"[VOD] Entity Content: {stats['generated']} generated ({status.lower()})"

    escaped_log = (
        stats["last_lines"]
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br>")
    )
    escaped_done = stats["done"].replace("\n", "<br>")
    escaped_total = stats.get("total", "").replace("\n", "<br>")

    html = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 600px;">
        <h2 style="color: #c8a848;">Entity Content Generation</h2>
        <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 6px; font-weight: bold;">Status</td>
                <td style="padding: 6px;">{"🟢 " + status if running else "✅ " + status}</td></tr>
            <tr><td style="padding: 6px; font-weight: bold;">Time</td>
                <td style="padding: 6px;">{timestamp}</td></tr>
            <tr><td style="padding: 6px; font-weight: bold;">Generated</td>
                <td style="padding: 6px;">{stats['generated']}</td></tr>
            <tr><td style="padding: 6px; font-weight: bold;">Errors</td>
                <td style="padding: 6px;">{stats['errors']}</td></tr>
        </table>
        <hr style="border-color: #333;">
        <p><strong>Current:</strong> {stats['current']}</p>
        <p><strong>Completed:</strong><br>{escaped_done}</p>
        {"<p><strong>Total:</strong><br>" + escaped_total + "</p>" if escaped_total else ""}
        <hr style="border-color: #333;">
        <p><strong>Last 15 log lines:</strong></p>
        <pre style="background: #1a1a1a; color: #e0e0e0; padding: 12px;
                    border-radius: 6px; font-size: 12px; line-height: 1.5;
                    overflow-x: auto;">{escaped_log}</pre>
    </div>
    """
    return subject, html


def main():
    if not BREVO_API_KEY:
        print("ERROR: BREVO_API_KEY not found")
        return

    print(f"Monitor started. Sending to {TO_EMAIL} every {INTERVAL // 60} min.")

    while True:
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        running = is_process_running()
        stats = get_log_stats()

        subject, html = build_email(running, stats, timestamp)
        status_code = send_email(subject, html)
        print(f"[{timestamp}] Sent email (HTTP {status_code}, generated: {stats['generated']}, running: {running})")

        if not running:
            print(f"[{timestamp}] Process finished. Sending final email and stopping.")
            break

        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
