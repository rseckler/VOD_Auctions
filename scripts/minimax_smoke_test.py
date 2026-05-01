#!/usr/bin/env python3
"""
MiniMax M2 Smoke Test — run once after setup to verify the integration.

Checks:
  1. MINIMAX_API_KEY loaded from env
  2. Endpoint reachable (api.minimax.io)
  3. M2 responds with non-empty content
  4. Reasoning-Trap demo: max_tokens=50 → empty content (expected), max_tokens=300 → ok

Usage:
    cd VOD_Auctions/scripts
    source venv/bin/activate
    python3 minimax_smoke_test.py
"""

import sys
from minimax_client import MINIMAX_API_KEY, MINIMAX_API_HOST, m2_chat, m2_ping, M2Error

PASS = "✓"
FAIL = "✗"
WARN = "⚠"


def check(label: str, ok: bool, detail: str = "") -> bool:
    symbol = PASS if ok else FAIL
    print(f"  {symbol}  {label}" + (f"  →  {detail}" if detail else ""))
    return ok


def main() -> int:
    print("\n── MiniMax M2 Smoke Test ─────────────────────────────────────────\n")
    errors = 0

    # 1. Key configured
    key_set = bool(MINIMAX_API_KEY)
    if not check("MINIMAX_API_KEY set", key_set, f"...{MINIMAX_API_KEY[-6:]}" if key_set else "NOT SET"):
        errors += 1
    print(f"     API host: {MINIMAX_API_HOST}")

    # 2. Basic ping
    print("\n  Pinging MiniMax-M2 (max_tokens=300)…")
    ping = m2_ping()
    if not check("M2 ping", ping["ok"], f"{ping.get('latency_ms', 0)}ms"):
        errors += 1
        print(f"     Error: {ping.get('error', 'unknown')}")
        print("\n  Cannot continue without connectivity — aborting.\n")
        return 1

    # 3. Real reply with content check
    print("\n  Testing reply quality (max_tokens=500)…")
    try:
        result = m2_chat(
            messages=[
                {"role": "system", "content": "You are a terse assistant. Reply in one word only."},
                {"role": "user", "content": "What is 2+2?"},
            ],
            max_tokens=500,
            log_reasoning=True,
        )
        content_ok = "4" in result["content"] or len(result["content"].strip()) > 0
        check("content non-empty", content_ok, repr(result["content"][:80]))
        check("reasoning_tokens present", result["reasoning_tokens"] > 0, f"{result['reasoning_tokens']} reasoning + {result['completion_tokens']} completion = {result['total_tokens']} total")
        if not content_ok:
            errors += 1
    except M2Error as e:
        check("content non-empty", False, str(e))
        errors += 1

    # 4. Reasoning-Trap demo (max_tokens=50 SHOULD produce empty or truncated output)
    print("\n  Reasoning-Trap demo (max_tokens=50 — content will likely be empty)…")
    try:
        trap = m2_chat(
            messages=[{"role": "user", "content": "What is the capital of Germany?"}],
            max_tokens=50,
        )
        # Empty content is EXPECTED here — it's a warning, not a failure
        if not trap["content"].strip():
            print(f"  {WARN}  content empty at max_tokens=50 — this is expected (reasoning trap confirmed)")
        else:
            print(f"  {PASS}  content non-empty even at max_tokens=50 (model used {trap['reasoning_tokens']} reasoning tokens)")
    except M2Error as e:
        print(f"  {WARN}  exception at max_tokens=50: {e}")

    # 5. Summary
    print("\n──────────────────────────────────────────────────────────────────")
    if errors == 0:
        print(f"  {PASS}  All checks passed. MiniMax M2 is ready.\n")
    else:
        print(f"  {FAIL}  {errors} check(s) failed. Review output above.\n")

    return errors


if __name__ == "__main__":
    sys.exit(main())
