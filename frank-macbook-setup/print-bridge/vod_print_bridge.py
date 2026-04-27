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
import ssl
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, urlparse

VERSION = "2.1.0"
HOST = "127.0.0.1"
PORT = int(os.environ.get("VOD_PRINT_BRIDGE_PORT", "17891"))
DEFAULT_PRINTER = os.environ.get("VOD_PRINT_BRIDGE_PRINTER", "Brother_QL_820NWB")
PAGE_SIZE = os.environ.get("VOD_PRINT_BRIDGE_PAGESIZE", "Custom.29x90mm")
DRY_RUN = os.environ.get("VOD_PRINT_BRIDGE_DRY_RUN", "").lower() in ("1", "true", "yes")
CERT_PATH = os.environ.get("VOD_PRINT_BRIDGE_CERT", "")
KEY_PATH = os.environ.get("VOD_PRINT_BRIDGE_KEY", "")
# Backend-Wahl:
#   "brother_ql" (default) — nutzt die brother_ql Python-Library, sendet
#     direkt via TCP an den Drucker. Umgeht CUPS komplett. Robust, gleich
#     auf allen Macs, keine Drucker-Einrichtung in Systemeinstellungen nötig.
#   "cups" — nutzt `lp` via lokale CUPS-Queue (legacy). Braucht korrekt
#     eingerichteten Brother-Treiber + socket://-Queue. Anfällig für
#     AirPrint-Auto-Discovery-Probleme. Als Fallback erhalten.
BACKEND = os.environ.get("VOD_PRINT_BRIDGE_BACKEND", "brother_ql").lower()
# Drucker-IP für brother_ql Backend (TCP-Direct-Send) — Single-Printer-Setup.
# Bei Multi-Printer (PRINTERS_JSON gesetzt) ist das der Fallback wenn
# /print ohne ?location= aufgerufen wird und kein DEFAULT_LOCATION matched.
PRINTER_IP = os.environ.get("VOD_PRINT_BRIDGE_PRINTER_IP", "")
# Brother-Modell für brother_ql (bestimmt Raster-Format + Label-Specs)
PRINTER_MODEL = os.environ.get("VOD_PRINT_BRIDGE_MODEL", "QL-820NWB")
# Label-Spec: "29" = DK-22210 continuous 29mm, "29x90" = DK-11201 die-cut
LABEL_TYPE = os.environ.get("VOD_PRINT_BRIDGE_LABEL", "29")
# Multi-Printer-Routing (rc52, 2026-04-27): Map warehouse_location.code → IP.
# JSON-Format: {"ALPENSTRASSE":"10.1.1.136","EUGENSTRASSE":"192.168.1.140"}
# Wenn gesetzt UND /print kommt mit ?location=<CODE>, wählt Bridge die
# passende IP. Sonst Fallback auf PRINTER_IP. Codes case-insensitiv.
def _parse_printers_json(raw: str) -> dict[str, str]:
    if not raw or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return {}
        # uppercase keys (warehouse_location.code is uppercase per insert)
        return {str(k).strip().upper(): str(v).strip() for k, v in parsed.items() if v}
    except (json.JSONDecodeError, ValueError, TypeError):
        return {}
PRINTERS = _parse_printers_json(os.environ.get("VOD_PRINT_BRIDGE_PRINTERS_JSON", ""))
# Wenn /print kein ?location= kriegt und auch keinen Default-PRINTER_IP hat,
# nutzt die Bridge dieses Default. Sollte üblicherweise dem Standort-Code
# entsprechen wo der Mac physisch steht.
DEFAULT_LOCATION = os.environ.get("VOD_PRINT_BRIDGE_DEFAULT_LOCATION", "").strip().upper()
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


def _check_brother_ql_deps() -> tuple[bool, str]:
    """Prüft ob pypdfium2 + Pillow + brother_ql importierbar sind.
    Returns (ok, error_message). Für Health-Endpoint."""
    missing = []
    try:
        import pypdfium2  # noqa: F401
    except ImportError:
        missing.append("pypdfium2")
    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        missing.append("Pillow")
    try:
        from brother_ql.raster import BrotherQLRaster  # noqa: F401
    except ImportError:
        missing.append("brother_ql")
    if missing:
        return False, f"pip install fehlt: {', '.join(missing)}"
    return True, ""


def resolve_target_ip(location: str | None) -> tuple[str, str]:
    """Pick the printer IP for this print job.

    Resolution order:
      1. ?location=<CODE> in the request → PRINTERS map lookup (uppercased)
      2. DEFAULT_LOCATION env → PRINTERS map lookup
      3. PRINTER_IP env (single-printer fallback / pre-multi-printer setups)

    Returns (ip, source) where source describes the resolution path for
    logging/diagnostics. ip == "" means nothing matched.
    """
    if location:
        code = location.strip().upper()
        if code in PRINTERS:
            return PRINTERS[code], f"location={code}"
    if DEFAULT_LOCATION and DEFAULT_LOCATION in PRINTERS:
        return PRINTERS[DEFAULT_LOCATION], f"default_location={DEFAULT_LOCATION}"
    if PRINTER_IP:
        return PRINTER_IP, "single_printer_fallback"
    return "", "no_printer_configured"


def send_to_brother_ql(pdf_bytes: bytes, copies: int, location: str | None = None) -> dict:
    """Brother QL backend — PDF → PNG → Raster → TCP direct.

    Nutzt pypdfium2 für PDF-Rendering (pure Python, MIT-lizenziert) und
    brother_ql für Raster-Protokoll + TCP-Send. Keine CUPS-Abhängigkeit,
    keine Drucker-Einrichtung in macOS Systemeinstellungen nötig.

    Routet via resolve_target_ip(location) zum passenden Drucker — entweder
    aus PRINTERS-Map (Multi-Printer) oder PRINTER_IP (Single-Printer).
    """
    target_ip, target_source = resolve_target_ip(location)
    if not target_ip and not DRY_RUN:
        return {
            "ok": False,
            "error": (
                f"Kein Drucker konfiguriert (location={location!r}). "
                f"Setze VOD_PRINT_BRIDGE_PRINTERS_JSON oder VOD_PRINT_BRIDGE_PRINTER_IP."
            ),
            "available_locations": sorted(PRINTERS.keys()),
        }

    # Deferred imports: nur laden wenn dieses Backend aktiv ist, damit die
    # stdlib-Bridge (cups-backend-only) keine pip-deps braucht.
    try:
        import pypdfium2 as pdfium
        from PIL import Image
        from brother_ql.conversion import convert as brother_convert
        from brother_ql.backends.helpers import send as brother_send
        from brother_ql.raster import BrotherQLRaster
    except ImportError as e:
        return {"ok": False, "error": f"brother_ql-Backend benötigt pip install brother_ql Pillow pypdfium2: {e}"}

    # 1) PDF → PIL Image. Scale wählen damit die Bildhöhe ungefähr der
    #    Drucker-Auflösung entspricht. Brother QL-820NWB druckt 300 dpi
    #    (11.8 dots/mm). Für 29×90mm Portrait-PDF wollen wir ca.
    #    342×1063 px. Scale-Faktor relativ zum PDF (72dpi): 300/72 ≈ 4.17.
    try:
        pdf = pdfium.PdfDocument(pdf_bytes)
        if len(pdf) == 0:
            return {"ok": False, "error": "PDF has no pages"}
        page = pdf[0]
        pil_image = page.render(scale=4.17).to_pil()
        pdf.close()
    except Exception as e:
        return {"ok": False, "error": f"PDF-Render fehlgeschlagen: {e}"}

    # 2) brother_ql erwartet für label '29' (continuous 29mm) ein Bild mit
    #    exakt 306 px Breite. Wir haben Portrait-PDF (29mm breit × 90mm hoch)
    #    → Bild ist ~342×1063. Resize auf 306px breit, Höhe proportional.
    target_width = 306
    w, h = pil_image.size
    if w != target_width:
        new_h = int(h * target_width / w)
        pil_image = pil_image.resize((target_width, new_h), Image.LANCZOS)

    if DRY_RUN:
        tmp = tempfile.NamedTemporaryFile(prefix="vod-label-", suffix=".png", delete=False)
        pil_image.save(tmp.name)
        log.info("DRY_RUN (brother_ql): would have sent %d×%d PNG to %s:%s (resolved-from=%s, saved=%s)",
                 pil_image.size[0], pil_image.size[1], PRINTER_MODEL, target_ip or "?", target_source, tmp.name)
        return {
            "ok": True, "job_id": "dry-run", "backend": "brother_ql",
            "printer": f"{PRINTER_MODEL}@{target_ip}", "bytes": len(pdf_bytes),
            "location": location, "resolved_from": target_source,
            "dry_run": True, "saved_to": tmp.name,
        }

    # 3) brother_ql Raster-Instructions generieren
    try:
        qlr = BrotherQLRaster(PRINTER_MODEL)
        qlr.exception_on_warning = True
        instructions = brother_convert(
            qlr=qlr,
            images=[pil_image] * copies,
            label=LABEL_TYPE,
            rotate="auto",
            threshold=70.0,
            dither=False,
            compress=False,
            red=False,
            dpi_600=False,
            hq=True,
            cut=True,
        )
    except Exception as e:
        return {"ok": False, "error": f"brother_ql convert fehlgeschlagen: {e}"}

    # 4) TCP-Send an Drucker
    target = f"tcp://{target_ip}"
    log.info("brother_ql: sending %d raster bytes to %s (model=%s label=%s resolved-from=%s)",
             len(instructions), target, PRINTER_MODEL, LABEL_TYPE, target_source)
    try:
        status = brother_send(
            instructions=instructions,
            printer_identifier=target,
            backend_identifier="network",
            blocking=True,
        )
    except Exception as e:
        return {"ok": False, "error": f"brother_ql send fehlgeschlagen ({target}): {e}"}

    # status ist ein dict mit 'outcome' ('sent' | 'error') etc.
    # WICHTIG: brother_ql liest nach dem Send eine Status-Response vom Drucker
    # zurück. Dabei timeoutet es manchmal (auch bei erfolgreichem Druck), und
    # setzt dann 'did_print=false' obwohl das Label physisch rauskommt. Der
    # AUTHORITATIVE Success-Indikator ist 'outcome=="sent"' — das bedeutet
    # der Raster-Stream wurde sauber an den Drucker übergeben. 'did_print'
    # und 'ready_for_next_job' sind zusätzliche Status-Reads und können
    # false-negatives liefern.
    outcome = status.get("outcome") if isinstance(status, dict) else None
    if outcome and outcome != "sent":
        return {"ok": False, "error": f"brother_ql outcome: {outcome}", "status": status}

    return {
        "ok": True,
        "backend": "brother_ql",
        "printer": f"{PRINTER_MODEL}@{target_ip}",
        "location": location,
        "resolved_from": target_source,
        "bytes": len(pdf_bytes),
        "raster_bytes": len(instructions),
        "copies": copies,
        "outcome": outcome,   # "sent" = success (authoritative)
        "note": "outcome=sent ist der authoritative Erfolgs-Check. did_print/ready_for_next_job können false-negatives liefern (brother_ql status-read timing).",
    }


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
    # LC_ALL=C erzwingt US-Englisch für lp-Output, damit unsere Regex greift.
    # Auf DE-Locale gibt lp "Anfrage-ID ist ..." aus — das matched keine
    # englische "request id is"-Regex und würde unseren job_id-Extract kaputtmachen.
    cmd = ["lp", "-d", printer, "-o", f"PageSize={PAGE_SIZE}", "-n", str(copies)]
    env = {**os.environ, "LC_ALL": "C", "LANG": "C"}
    log.info("printing %d bytes → %s", len(pdf_bytes), " ".join(cmd))
    try:
        proc = subprocess.run(
            cmd,
            input=pdf_bytes,
            capture_output=True, timeout=15,
            env=env,
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
            if BACKEND == "brother_ql":
                # brother_ql nutzt Direct-TCP zum Drucker. Wir checken ob mindestens
                # ein Drucker konfiguriert ist (PRINTERS-Map ODER PRINTER_IP) + ob
                # brother_ql überhaupt importierbar ist (pip deps).
                deps_ok, dep_error = _check_brother_ql_deps()
                has_printer = bool(PRINTERS) or bool(PRINTER_IP)
                # Resolve default IP für die Toolbar-Anzeige (welcher Drucker wird
                # bei einem Print ohne ?location= angesteuert?)
                default_ip, default_source = resolve_target_ip(None)
                return self._send_json(200, {
                    "ok": True,
                    "version": VERSION,
                    "backend": "brother_ql",
                    "printer": f"{PRINTER_MODEL}@{default_ip}" if default_ip else PRINTER_MODEL,
                    "printer_found": has_printer and deps_ok,
                    "printer_ip": default_ip,
                    "printer_model": PRINTER_MODEL,
                    "label_type": LABEL_TYPE,
                    "default_location": DEFAULT_LOCATION or None,
                    "default_resolved_from": default_source,
                    "locations": [
                        {"code": code, "ip": ip, "is_default": code == DEFAULT_LOCATION}
                        for code, ip in sorted(PRINTERS.items())
                    ],
                    "single_printer_ip": PRINTER_IP or None,  # Backwards-compat (rc < 52)
                    "dry_run": DRY_RUN,
                    "deps_ok": deps_ok,
                    "dep_error": dep_error,
                })
            # Default: cups-Backend
            printer = resolve_printer(DEFAULT_PRINTER)
            return self._send_json(200, {
                "ok": True,
                "version": VERSION,
                "backend": "cups",
                "printer": printer or DEFAULT_PRINTER,
                "printer_found": printer is not None,
                "dry_run": DRY_RUN,
                "cups_available": shutil.which("lp") is not None,
            })

        if path == "/printers":
            if BACKEND == "brother_ql":
                # brother_ql kennt keine CUPS-Queues. Wir returnen alle aus der
                # PRINTERS-Map plus den Single-Printer-Fallback (falls keine Map).
                entries = []
                for code, ip in sorted(PRINTERS.items()):
                    entries.append({
                        "name": f"{PRINTER_MODEL}@{ip}",
                        "status": "configured",
                        "location": code,
                        "ip": ip,
                        "is_default": code == DEFAULT_LOCATION,
                    })
                if not PRINTERS and PRINTER_IP:
                    entries.append({
                        "name": f"{PRINTER_MODEL}@{PRINTER_IP}",
                        "status": "configured",
                        "location": None,
                        "ip": PRINTER_IP,
                        "is_default": True,
                    })
                return self._send_json(200, {"printers": entries})
            return self._send_json(200, {"printers": list_cups_printers()})

        return self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path != "/print":
            return self._send_json(404, {"ok": False, "error": "not found"})

        # Query params: copies, printer, location (rc52)
        qs = parse_qs(parsed.query)
        location_qs: str | None = (qs.get("location") or [None])[0]

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
        location_body: str | None = None

        if "application/pdf" in content_type:
            pdf_bytes = body
            # copies via query string
            try:
                copies = max(1, min(50, int((qs.get("copies") or ["1"])[0])))
            except (ValueError, TypeError):
                copies = 1
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
            loc_raw = payload.get("location")
            if loc_raw and isinstance(loc_raw, str):
                location_body = loc_raw
        else:
            return self._send_json(400, {"ok": False, "error": f"unsupported content-type: {content_type}"})

        if not pdf_bytes or pdf_bytes[:4] != b"%PDF":
            return self._send_json(400, {"ok": False, "error": "payload is not a PDF"})

        # Location-Resolution-Order: ?location=<X> > body.location > None (Bridge default)
        location = location_qs or location_body

        # Backend-Auswahl: brother_ql (direct-TCP) vs cups (lp-Queue)
        if BACKEND == "brother_ql":
            result = send_to_brother_ql(pdf_bytes, copies, location=location)
        else:
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
    tls_enabled = bool(
        CERT_PATH and KEY_PATH
        and os.path.isfile(CERT_PATH) and os.path.isfile(KEY_PATH)
    )
    scheme = "https" if tls_enabled else "http"
    log.info("VOD Print Bridge %s starting on %s://%s:%d (backend=%s, tls=%s, dry_run=%s)",
             VERSION, scheme, HOST, PORT, BACKEND, tls_enabled, DRY_RUN)
    if not tls_enabled:
        log.warning("TLS is OFF — Safari will block fetch() from https://admin.vod-auctions.com. "
                    "Install cert+key and set VOD_PRINT_BRIDGE_CERT / _KEY env vars. "
                    "Run frank-macbook-setup/print-bridge/install-bridge.sh to provision mkcert certs.")

    if BACKEND == "brother_ql":
        deps_ok, dep_err = _check_brother_ql_deps()
        if deps_ok:
            if PRINTERS:
                log.info("brother_ql backend: model=%s label=%s — multi-printer mode (%d locations)",
                         PRINTER_MODEL, LABEL_TYPE, len(PRINTERS))
                for code, ip in sorted(PRINTERS.items()):
                    is_def = " [default]" if code == DEFAULT_LOCATION else ""
                    log.info("  • %s → %s%s", code, ip, is_def)
                if not DEFAULT_LOCATION:
                    log.warning("Keine DEFAULT_LOCATION gesetzt — /print ohne ?location= "
                                "fällt auf PRINTER_IP=%s zurück", PRINTER_IP or "<NOT SET>")
            else:
                log.info("brother_ql backend: model=%s ip=%s label=%s — single-printer mode",
                         PRINTER_MODEL, PRINTER_IP or "<NOT SET>", LABEL_TYPE)
        else:
            log.warning("brother_ql backend enabled but deps fehlen: %s", dep_err)
        if not PRINTERS and not PRINTER_IP and not DRY_RUN:
            log.warning("Weder PRINTERS_JSON noch PRINTER_IP gesetzt — Druckjobs schlagen fehl")
    else:
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

    if tls_enabled:
        try:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certfile=CERT_PATH, keyfile=KEY_PATH)
            server.socket = context.wrap_socket(server.socket, server_side=True)
            log.info("TLS aktiviert (cert=%s)", CERT_PATH)
        except (ssl.SSLError, OSError, ValueError) as e:
            log.error("TLS-Setup fehlgeschlagen: %s — falle auf HTTP zurück", e)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
