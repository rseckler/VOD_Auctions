#!/usr/bin/env python3
"""
MiniMax LLM client — Python mirror of backend/src/lib/minimax.ts.
Uses MiniMax-M2 via OpenAI-compatible endpoint.

⚠️  Reasoning-Trap: M2 deducts reasoning tokens from max_tokens BEFORE
    generating visible output. content=="" means ALL tokens went to reasoning.
    min safe: 300 (classification), 800 (summary), 2000 (bulk).

DSGVO: M2 server is Shanghai. Never pass customer PII.
       Only public data and internal product metadata (Discogs, Releases).

Usage:
    from minimax_client import m2_chat, M2Error

    result = m2_chat(
        messages=[{"role": "user", "content": "Classify genre: ..."}],
        max_tokens=500,
    )
    print(result["content"])
"""

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import TypedDict

# Load .env from scripts/ dir, fall back to backend/.env
_SCRIPT_DIR = Path(__file__).parent
for _env_path in [_SCRIPT_DIR / ".env", _SCRIPT_DIR.parent / "backend" / ".env"]:
    if _env_path.exists():
        with open(_env_path) as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _key, _, _val = _line.partition("=")
                    os.environ.setdefault(_key.strip(), _val.strip())

MINIMAX_API_HOST = os.environ.get("MINIMAX_API_HOST", "https://api.minimax.io")
MINIMAX_API_KEY  = os.environ.get("MINIMAX_API_KEY", "")
REASONING_MIN_TOKENS = 300


class M2Error(Exception):
    def __init__(self, message: str, code: int | None = None):
        super().__init__(message)
        self.code = code

class M2BalanceEmptyError(M2Error):
    def __init__(self):
        super().__init__("MiniMax balance empty (error 1008). Top up at https://platform.minimax.io → Billing.", 1008)

class M2ModelNotInPlanError(M2Error):
    def __init__(self, model: str):
        super().__init__(f'Model "{model}" not in current plan (error 2061). Token Plan supports MiniMax-M2 only.', 2061)


class M2Result(TypedDict):
    content: str
    prompt_tokens: int
    completion_tokens: int
    reasoning_tokens: int
    total_tokens: int
    model: str
    latency_ms: int


def m2_chat(
    messages: list[dict],
    *,
    max_tokens: int = 500,
    temperature: float | None = None,
    log_reasoning: bool = False,
    timeout: int = 60,
) -> M2Result:
    """Send a chat completion request to MiniMax-M2."""
    if not MINIMAX_API_KEY:
        raise M2Error("MINIMAX_API_KEY not configured in environment.")

    effective_max = max(max_tokens, REASONING_MIN_TOKENS)
    if max_tokens < REASONING_MIN_TOKENS:
        import sys
        print(f"[minimax] WARNING: max_tokens {max_tokens} < {REASONING_MIN_TOKENS} — bumped to {effective_max} (reasoning trap)", file=sys.stderr)

    body: dict = {
        "model": "MiniMax-M2",
        "messages": messages,
        "max_tokens": effective_max,
    }
    if temperature is not None:
        body["temperature"] = temperature

    start = time.monotonic()

    req = urllib.request.Request(
        f"{MINIMAX_API_HOST}/v1/chat/completions",
        data=json.dumps(body, separators=(",", ":")).encode(),
        headers={
            "Authorization": f"Bearer {MINIMAX_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        if e.code == 429:
            raise M2BalanceEmptyError()
        raise M2Error(f"HTTP {e.code}", e.code)

    latency_ms = int((time.monotonic() - start) * 1000)
    data = json.loads(raw)

    base_resp = data.get("base_resp", {})
    status_code = base_resp.get("status_code", 0)
    if status_code == 1008:
        raise M2BalanceEmptyError()
    if status_code == 2061:
        raise M2ModelNotInPlanError("MiniMax-M2")
    if status_code != 0:
        raise M2Error(f"MiniMax error {status_code}: {base_resp.get('status_msg', 'unknown')}", status_code)

    choice = (data.get("choices") or [{}])[0]
    content: str = (choice.get("message") or {}).get("content") or ""

    usage = data.get("usage") or {}
    details = usage.get("completion_tokens_details") or {}
    reasoning_tokens: int = details.get("reasoning_tokens", 0)

    if not content:
        import sys
        print(f"[minimax] WARNING: content is empty — all {effective_max} tokens may have gone to reasoning. Increase max_tokens.", file=sys.stderr)

    if log_reasoning and reasoning_tokens > 0:
        print(f"[minimax] reasoning_tokens={reasoning_tokens} completion_tokens={usage.get('completion_tokens', 0)} total={usage.get('total_tokens', 0)}")

    return M2Result(
        content=content,
        prompt_tokens=usage.get("prompt_tokens", 0),
        completion_tokens=usage.get("completion_tokens", 0),
        reasoning_tokens=reasoning_tokens,
        total_tokens=usage.get("total_tokens", 0),
        model=data.get("model", "MiniMax-M2"),
        latency_ms=latency_ms,
    )


def strip_thinking(content: str) -> str:
    """Strip <think>...</think> reasoning blocks from M2 response content.
    MiniMax-M2 includes visible reasoning in <think> tags within the content field.
    Always call this before using content as structured output or display text.
    """
    import re
    return re.sub(r"<think>[\s\S]*?</think>", "", content).strip()


def m2_ping() -> dict:
    """Quick connectivity check. Returns dict with ok, latency_ms, error."""
    try:
        result = m2_chat(
            messages=[{"role": "user", "content": "Reply with exactly: OK"}],
            max_tokens=300,
        )
        return {"ok": bool(result["content"].strip()), "latency_ms": result["latency_ms"]}
    except Exception as e:
        return {"ok": False, "latency_ms": 0, "error": str(e)}
