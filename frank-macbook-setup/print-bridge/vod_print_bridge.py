#!/usr/bin/env python3
"""
VOD Print Bridge — lokaler HTTP-Agent für Silent-Label-Druck auf macOS.

Ersetzt QZ Tray komplett. Läuft als LaunchAgent im User-Kontext,
hört auf 127.0.0.1:17891, empfängt PDF-Label-Jobs aus dem Admin-UI
(https://admin.vod-auctions.com) und sendet sie per `lp` an CUPS.

Endpoints:
    GET  /health       → { ok, version, printer, printer_found, dry_run }
    GET  /printers     → { printers: [ {name, status}, ... ] }
    POST /print        → { pdf_base64, copies?, printer? } oder raw PDF-Body
                         → { ok, job_id, printer, bytes }
    OPTIONS /*         → CORS preflight (inkl. PNA)

Security:
    - Bind nur auf 127.0.0.1 (loopback-only)
    - Keine Auth — Annahme: wer 127.0.0.1 Access hat, darf drucken
    - CORS strict: nur ADMIN_ORIGINS

Dependencies: Pure Python stdlib (läuft mit /usr/bin/python3 auf macOS 12+).
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import urlparse

VERSION = "1.0.0"
HOST = "127.0.0.1"
PORT = int(os.environ.get("VOD_PRINT_BRIDGE_PORT", "17891"))
DEFAULT_PRINTER = os.environ.get("VOD_PRINT_BRIDGE_PRINTER", "Brother_QL_820NWB")
PAGE_SIZE = os.environ.get("VOD_PRINT_BRIDGE_PAGESIZE", "Custom.29x90mm")
DRY_RUN = os.environ.get("VOD_PRINT_BRIDGE_DRY_RUN", "").lower() in ("1", "true", "yes")
MAX_BODY_BYTES = 10 * 1024 * 1024  # 10 MB hard cap pro Job

ADMIN_ORIGINS = {
    "https://admin.vod-auctions.com",
    "https://vod-auctions.com",
    "http://localhost:9000",
    "http://localhost:7001",
    "http://127.0.0.1:9000",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("vod-print-bridge")


def list_cups_printers() -> list[dict]:
    """Liste aller CUPS-Queues mit optionalem Status.

    Verwendet `lpstat -e` (nur Queue-Namen, locale-independent) als primäre
    Quelle, weil `lpstat -p` auf macOS lokalisierte Strings ausgibt ("Drucker
    "Name" ist inaktiv...") die schwer zu parsen sind. LC_ALL=C hilft nicht
    weil CUPS seine Locale aus CFPreferences liest.

    Status-Info via `lpstat -a`, best-effort: erstes Wort = Queue-Name, Rest
    ignorieren. Wenn eine Queue nur in -a aber nicht in -e auftaucht (oder
    umgekehrt), die wir aus -e nehmen und status='unknown' setzen.
    """
    if not shutil.which("lpstat"):
        return []

    env = {**os.environ, "LC_ALL": "C", "LANG": "C"}

    try:
        names_out = subprocess.run(
            ["lpstat", "-e"],
            capture_output=True, text=True, timeout=5, env=env,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        log.warning("lpstat -e failed: %s", e)
        return []

    names = [ln.strip() for ln in names_out.stdout.splitlines() if ln.strip()]

    # Status pro Queue (first token per line = queue name). Best-effort — wenn
    # Parsing scheitert, bleibt status='unknown'.
    status_map: dict[str, str] = {}
    try:
        accept_out = subprocess.run(
            ["lpstat", "-a"],
            capture_output=True, text=True, timeout=5, env=env,
        )
        for line in accept_out.stdout.splitlines():
            first = line.split()[0] if line.split() else ""
            if first and first in names:
                status_map[first] = "accepting"
    except (subprocess.TimeoutExpired, OSError):
        pass

    return [{"name": n, "status": status_map.get(n, "unknown")} for n in names]


def resolve_printer(preferred: str | None) -> str | None:
    """Find the best matching CUPS printer queue. Returns None if no match."""
    printers = list_cups_printers()
    names = [p["name"] for p in printers]

    # 1) exact preferred match
    if preferred and preferred in names:
        return preferred

    # 2) fuzzy: brother + ql
    for name in names:
        if re.search(r"brother.*ql", name, re.I) or re.search(r"ql[_-]?82", name, re.I):
            return name

    # 3) any printer with "brother" in the name
    for name in names:
        if "brother" in name.lower():
            return name

    return None


def send_to_cups(pdf_bytes: bytes, printer: str, copies: int) -> dict:
    """Write PDF to temp file, run `lp` with correct options. Returns {ok, job_id, ...}."""
    if DRY_RUN:
        tmp = tempfile.NamedTemporaryFile(prefix="vod-label-", suffix=".pdf", delete=False)
        tmp.write(pdf_bytes)
        tmp.close()
        log.info("DRY_RUN: would have printed %d bytes to '%s' (saved: %s)",
                 len(pdf_bytes), printer, tmp.name)
        return {"ok": True, "job_id": "dry-run", "printer": printer, "bytes": len(pdf_bytes), "dry_run": True, "saved_to": tmp.name}

    if not shutil.which("lp"):
        return {"ok": False, "error": "lp command not found — CUPS not installed?"}

    # Use stdin to avoid disk I/O in the hot path.
    cmd = ["lp", "-d", printer, "-o", f"PageSize={PAGE_SIZE}", "-n", str(copies)]
    log.info("printing %d bytes → %s", len(pdf_bytes), " ".join(cmd))
    try:
        proc = subprocess.run(
            cmd,
            input=pdf_bytes,
            capture_output=True, timeout=15,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "lp timed out after 15s"}
    except OSError as e:
        return {"ok": False, "error": f"lp exec failed: {e}"}

    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace").strip()
        stdout = proc.stdout.decode("utf-8", errors="replace").strip()
        return {"ok": False, "error": f"lp exit {proc.returncode}: {stderr or stdout}"}

    # lp stdout: "request id is Brother_QL_820NWB-42 (1 file(s))"
    stdout = proc.stdout.decode("utf-8", errors="replace").strip()
    m = re.search(r"request id is (\S+)", stdout)
    job_id = m.group(1) if m else stdout
    return {"ok": True, "job_id": job_id, "printer": printer, "bytes": len(pdf_bytes)}


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = f"VODPrintBridge/{VERSION}"

    # ─── CORS helpers ────────────────────────────────────────────────────────

    def _cors_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        allow = origin if origin in ADMIN_ORIGINS else ""
        if allow:
            self.send_header("Access-Control-Allow-Origin", allow)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")
        # Private Network Access (Chrome 123+): browsers on public HTTPS need
        # this to be allowed to talk to 127.0.0.1 / RFC1918.
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # ─── Verbs ───────────────────────────────────────────────────────────────

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/health":
            printer = resolve_printer(DEFAULT_PRINTER)
            return self._send_json(200, {
                "ok": True,
                "version": VERSION,
                "printer": printer or DEFAULT_PRINTER,
                "printer_found": printer is not None,
                "dry_run": DRY_RUN,
                "cups_available": shutil.which("lp") is not None,
            })

        if path == "/printers":
            return self._send_json(200, {"printers": list_cups_printers()})

        return self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/print":
            return self._send_json(404, {"ok": False, "error": "not found"})

        # Read body (bounded)
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            return self._send_json(413, {"ok": False, "error": f"body size invalid ({length})"})
        body = self.rfile.read(length)

        # Detect content shape
        content_type = (self.headers.get("Content-Type") or "").lower()
        pdf_bytes: bytes | None = None
        copies = 1
        printer_pref = DEFAULT_PRINTER

        if "application/pdf" in content_type:
            pdf_bytes = body
        elif "application/json" in content_type or body.lstrip()[:1] in (b"{", b"["):
            try:
                payload = json.loads(body.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                return self._send_json(400, {"ok": False, "error": f"invalid json: {e}"})
            pdf_b64 = payload.get("pdf_base64")
            if not pdf_b64 or not isinstance(pdf_b64, str):
                return self._send_json(400, {"ok": False, "error": "missing pdf_base64"})
            try:
                pdf_bytes = base64.b64decode(pdf_b64, validate=False)
            except (ValueError, TypeError) as e:
                return self._send_json(400, {"ok": False, "error": f"invalid base64: {e}"})
            copies = max(1, min(50, int(payload.get("copies") or 1)))
            printer_pref = str(payload.get("printer") or DEFAULT_PRINTER)
        else:
            return self._send_json(400, {"ok": False, "error": f"unsupported content-type: {content_type}"})

        if not pdf_bytes or pdf_bytes[:4] != b"%PDF":
            return self._send_json(400, {"ok": False, "error": "payload is not a PDF"})

        printer = resolve_printer(printer_pref)
        if not printer and not DRY_RUN:
            return self._send_json(503, {
                "ok": False,
                "error": f"no matching CUPS printer (wanted '{printer_pref}')",
                "available": [p["name"] for p in list_cups_printers()],
            })

        result = send_to_cups(pdf_bytes, printer or printer_pref, copies)
        return self._send_json(200 if result.get("ok") else 500, result)

    # Keep default log to stderr so LaunchAgent captures it.
    def log_message(self, fmt: str, *args) -> None:
        log.info("%s - %s", self.address_string(), fmt % args)


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> None:
    log.info("VOD Print Bridge %s starting on %s:%d (dry_run=%s, default_printer=%s)",
             VERSION, HOST, PORT, DRY_RUN, DEFAULT_PRINTER)
    printer = resolve_printer(DEFAULT_PRINTER)
    if printer:
        log.info("CUPS printer resolved: %s", printer)
    else:
        log.warning("No matching CUPS printer found — set up Brother QL or run with DRY_RUN=1")

    try:
        server = ThreadingHTTPServer((HOST, PORT), BridgeHandler)
    except OSError as e:
        log.error("bind %s:%d failed: %s", HOST, PORT, e)
        sys.exit(1)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
