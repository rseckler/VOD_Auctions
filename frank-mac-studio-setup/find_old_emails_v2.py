#!/usr/bin/env python3
"""find_old_emails_v2 — Tiefen-Scanner für Mail-Archive auf macOS.

Gegenüber v1:
  - Auto-Discovery ALLER gemounteten Volumes (kein User-Prompt für eines)
  - Wide-Scan auf der lokalen SSD (gesamter Home-Folder, nicht nur ~/Library/Mail)
  - Erkennt zusätzlich: .olm, .pst, .ost, .mbx, Outlook.sqlite (Warnings, kein Parse)
  - Magic-Byte-Detection für mbox-Files OHNE .mbox-Extension
  - Time-Machine-Aware: skip per Default, opt-in via --include-time-machine,
    inode-Dedup verhindert 200x-Duplikate über Snapshots
  - Live TTY-UI: Counter (files / mails / VOD-relevant), aktuelles Verzeichnis,
    Elapsed-Time, Color-Codes (auto-disabled für non-TTY)
  - Aggressive Skip-Liste: Caches, Photos-Library, Browser-Daten, node_modules etc.
  - Permission-Errors silent skipped + gezählt (nie Crash)
  - JSONL-Schema: 100% kompatibel zu v1 (gleiche Felder für VPS-Importer)

Pure stdlib, keine Dependencies.
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import shutil
import sys
import time
from email import message_from_bytes
from email.parser import HeaderParser
from email.utils import parsedate_to_datetime
from pathlib import Path

# ─── Konstanten ──────────────────────────────────────────────────────────────

VOD_DOMAINS = ("vinyl-on-demand.com", "vod-records.com", "vodrecords")

# Payment/Order/Versand-Provider — Mails von hier enthalten typisch
# Customer-Email + Versand-Adresse + Item-Liste, auch ohne VOD-Domain.
# Wenn From in dieser Liste → Mail bekommt VOD-relevant=YES (Tier 2)
PAYMENT_ORDER_DOMAINS = (
    # Payments
    "paypal.com", "paypal.de", "e.paypal.com", "e.paypal.de",
    "stripe.com", "notify.stripe.com",
    "klarna.com", "klarna.de",
    "sofortueberweisung.de", "sofort.com",
    # Marketplaces (Bestell-Notifications)
    "discogs.com",
    "bandcamp.com",
    "ebay.com", "ebay.de", "ebay-kleinanzeigen.de",
    "amazon.com", "amazon.de",
    # Versand-Provider
    "sendcloud.com", "sendcloud.de", "sendcloud.sc",
    "dhl.de", "dhl.com",
    "deutschepost.de",
    "fedex.com", "ups.com",
    "hermes-europe.de", "myhermes.de",
    "dpd.com", "dpd.de",
    # Frank's ERP / Buchhaltung
    "monkey-office.de", "monkeyoffice.de",
    "easybill.de",
)

PARSEABLE_EXT = {".emlx", ".eml", ".mbox"}

# Archive-Formate die wir erkennen aber nicht inline parsen — User wird gewarnt
ARCHIVE_EXT_HINT = {
    ".olm": "Outlook for Mac (ZIP+XML, manuelle Extraktion nötig)",
    ".pst": "Outlook Windows (libpst/readpst kann extrahieren)",
    ".ost": "Outlook offline storage (libpst oder Exchange-Resync)",
    ".mbx": "Eudora/Pegasus mbox (in .mbox umbenennen, dann re-scan)",
    ".tbb": "Thunderbird folder summary (nur Metadaten — Sibling-File checken)",
    ".nbu": "Nokia/Eudora-Backup",
}

# Pfad-Fragmente die einen Verzeichnis-Walk komplett blockieren.
# Reihenfolge: längere/spezifischere zuerst.
SKIP_PATH_FRAGMENTS = (
    # System / OS-internal
    "/.Spotlight-V100/", "/.fseventsd/", "/.DocumentRevisions-V100/",
    "/.TemporaryItems/", "/.Trashes/", "/.PKInstallSandboxManager/",
    "/.MobileBackups/", "/private/var/folders/", "/private/var/db/",
    "/private/var/log/", "/private/var/vm/",
    "/System/", "/usr/", "/sbin/", "/bin/",
    # Library noise — Caches, Logs, App-State, Browser data
    "/Library/Caches/", "/Library/Logs/", "/Library/WebKit/",
    "/Library/Saved Application State/", "/Library/Cookies/",
    "/Library/Safari/", "/Library/QuickLook/",
    "/Library/Application Support/CrashReporter/",
    "/Library/Application Support/Google/Chrome/",
    "/Library/Application Support/Firefox/",
    "/Library/Application Support/Slack/",
    "/Library/Application Support/discord/",
    "/Library/Application Support/Spotify/",
    "/Library/Application Support/MobileSync/",
    "/Library/Group Containers/group.com.apple.notes/",
    "/Library/Containers/com.apple.Safari/",
    "/Library/Containers/com.apple.Music/",
    "/Library/Containers/com.apple.Photos/",
    "/Library/CloudStorage/iCloud Drive (Archive)/",
    # Big media
    ".photoslibrary/", ".photolibrary/", "/iPhoto Library/",
    "/Aperture Library.aplibrary/",
    "/Music/iTunes/", "/Music/Music/Media/",
    # VMs
    "/Parallels/", "/VMware/", "/VirtualBox VMs/", "/CrossOver/", "/Steam/",
    # Build / dev caches
    "/node_modules/", "/__pycache__/", "/.git/", "/__MACOSX/",
    "/.tox/", "/.venv/", "/venv/", "/.next/", "/.turbo/",
    "/.cache/", "/.npm/", "/.cargo/", "/.gradle/", "/.m2/", "/.rustup/",
    "/.android/", "/.docker/",
    # Time Machine — opt-in via flag
    "/.backupdb/", "/Backups.backupdb/",
)

# Verzeichnisse die wir explizit NICHT skippen, auch wenn sie unter Library liegen
ALLOW_PATH_FRAGMENTS = (
    "/Library/Mail/",
    "/Library/Mobile Documents/com~apple~mail/",
    "/Library/Containers/com.apple.mail/",
    "/Library/Containers/com.microsoft.Outlook/",
    "/Library/Application Support/Microsoft/Outlook/",
    "/Library/Group Containers/UBF8T346G9.Office/",
    "/Library/Group Containers/UBF8T346G9.OfficeOsfWebHost/",
)

# Mail-Archive an Filename-Pattern erkennen (Files OHNE Extension)
SUGGESTIVE_NAME = re.compile(
    r"^(inbox|sent|drafts|trash|archive|outbox|spool|mail|mbox|deleted)$",
    re.IGNORECASE,
)

MIN_SIZE = 100
MAX_SIZE = 50 * 1024 * 1024  # max single message

# Magic-Bytes für Format-Detection ohne Extension
MAGIC_MBOX = b"From "
MAGIC_PST = b"!BDN"
MAGIC_OLM = b"PK\x03\x04"  # ZIP

# Live-UI rendering rate
RENDER_INTERVAL = 0.25  # seconds


# ─── Colors / TTY ────────────────────────────────────────────────────────────

class Col:
    enabled = (
        sys.stdout.isatty()
        and os.environ.get("NO_COLOR") is None
        and os.environ.get("TERM", "") not in ("", "dumb")
    )
    BOLD = "\x1b[1m" if enabled else ""
    DIM = "\x1b[2m" if enabled else ""
    RED = "\x1b[31m" if enabled else ""
    GREEN = "\x1b[32m" if enabled else ""
    YELLOW = "\x1b[33m" if enabled else ""
    BLUE = "\x1b[34m" if enabled else ""
    MAGENTA = "\x1b[35m" if enabled else ""
    CYAN = "\x1b[36m" if enabled else ""
    GRAY = "\x1b[90m" if enabled else ""
    RESET = "\x1b[0m" if enabled else ""


def b(s): return f"{Col.BOLD}{s}{Col.RESET}"
def g(s): return f"{Col.GREEN}{s}{Col.RESET}"
def y(s): return f"{Col.YELLOW}{s}{Col.RESET}"
def r(s): return f"{Col.RED}{s}{Col.RESET}"
def cy(s): return f"{Col.CYAN}{s}{Col.RESET}"
def d(s): return f"{Col.GRAY}{s}{Col.RESET}"


# ─── Live-Status-UI ──────────────────────────────────────────────────────────

class LiveStatus:
    """Updating single-line status mit \\r-Carriage-Return. Auto-disable für non-TTY."""

    def __init__(self):
        self.enabled = Col.enabled and sys.stdout.isatty()
        self.last_render = 0.0
        self.start_time = time.time()
        self.cur_root = ""
        self.cur_dir = ""
        self.files_seen = 0
        self.dirs_seen = 0
        self.mails_found = 0
        self.vod_relevant = 0
        self.bytes_read = 0
        self.perm_denied = 0
        self.archives_found = 0

    def tick(self, **kwargs):
        for k, v in kwargs.items():
            if hasattr(self, k):
                setattr(self, k, v)
        now = time.time()
        if now - self.last_render < RENDER_INTERVAL:
            return
        self.last_render = now
        self._render()

    def force_render(self):
        self.last_render = 0.0
        self._render()

    def _render(self):
        if not self.enabled:
            return
        elapsed = int(time.time() - self.start_time)
        cols = shutil.get_terminal_size((100, 24)).columns
        cur_dir = self.cur_dir
        # Truncate cur_dir from the LEFT so we see the deepest part
        max_dir = max(20, cols - 80)
        if len(cur_dir) > max_dir:
            cur_dir = "…" + cur_dir[-(max_dir - 1):]
        line = (
            f"  {b(self.cur_root[:30]):30s}  "
            f"files={self.files_seen:>7}  "
            f"mails={cy(f'{self.mails_found:>5}')}  "
            f"VOD={g(f'{self.vod_relevant:>5}')}  "
            f"arc={y(f'{self.archives_found:>2}')}  "
            f"{d(cur_dir)}  "
            f"[{elapsed//60:>2}m{elapsed%60:02d}s]"
        )
        # Ensure we don't exceed terminal width
        # Stripping ANSI for length-check is annoying; just guard with cols
        sys.stdout.write(f"\r\x1b[K{line[:cols + 50]}")
        sys.stdout.flush()

    def line(self, msg: str):
        """Print a permanent line above the status line, then re-render status."""
        if self.enabled:
            sys.stdout.write(f"\r\x1b[K{msg}\n")
            self._render()
        else:
            print(msg, flush=True)


# ─── Pfad-Filter ─────────────────────────────────────────────────────────────

def is_path_skipped(path_str: str, include_tm: bool, include_photos: bool) -> bool:
    """True wenn dieser Pfad NICHT gewalkt werden soll."""
    # Allowlist gewinnt vor Skiplist
    for allow in ALLOW_PATH_FRAGMENTS:
        if allow in path_str:
            # Erlaube nur, wenn nicht in einem Cache-Sub-Pfad innerhalb des Allow
            for noise in ("/Caches/", "/Logs/", "/CrashReporter/"):
                if noise in path_str.split(allow, 1)[1]:
                    return True
            return False
    for frag in SKIP_PATH_FRAGMENTS:
        if frag in path_str:
            if not include_tm and frag in ("/.backupdb/", "/Backups.backupdb/"):
                return True
            if include_tm and frag in ("/.backupdb/", "/Backups.backupdb/"):
                continue
            if include_photos and frag in (".photoslibrary/", ".photolibrary/"):
                continue
            return True
    return False


# ─── Format-Detection ────────────────────────────────────────────────────────

def detect_format(path: Path, suffix: str, fname: str) -> tuple[str, str] | None:
    """Returns (kind, parseable) wobei kind ∈ {emlx,eml,mbox,olm,pst,ost,mbx,tbb,nbu,mbox-naked}
    und parseable ∈ {parse,warn} — parse = wir extrahieren Body, warn = nur loggen."""
    if suffix in PARSEABLE_EXT:
        return (suffix.lstrip("."), "parse")
    if suffix in ARCHIVE_EXT_HINT:
        return (suffix.lstrip("."), "warn")
    # Special-cases: filename matches without extension
    if SUGGESTIVE_NAME.match(fname):
        try:
            with path.open("rb") as f:
                head = f.read(8)
            if head.startswith(MAGIC_MBOX):
                return ("mbox-naked", "parse")
        except OSError:
            return None
    # Outlook.sqlite or Outlook 15 Profiles file — warn
    if fname.lower() in ("outlook.sqlite", "outlook.sqlite-wal", "outlook.sqlite-shm"):
        return ("outlook-sqlite", "warn")
    return None


# ─── Mail-Header-Parsing (kompatibel zu v1) ──────────────────────────────────

def _strip_emlx_header(data: bytes) -> bytes:
    nl = data.find(b"\n")
    if 0 < nl < 16:
        try:
            int(data[:nl].strip())
            return data[nl + 1:]
        except ValueError:
            pass
    return data


def parse_eml_emlx(path: Path, suffix: str) -> tuple[dict, bytes] | None:
    """Lese ersten 64 KB, extrahiere Date/From/To/Subject + raw-bytes für Body-VOD-Check.

    Returnt (headers_dict, raw_lower_bytes) oder None bei Fehler.
    raw_lower_bytes wird für den erweiterten VOD-Match gebraucht — siehe
    is_vod_relevant_ext(): wenn nur der Body 'vinyl-on-demand.com' enthält
    (z.B. forwarded message mit Bestellung), würde der Header-Filter sie
    sonst durchlassen.
    """
    try:
        with path.open("rb") as f:
            data = f.read(64 * 1024)
    except OSError:
        return None

    if suffix == ".emlx":
        data = _strip_emlx_header(data)

    try:
        text = data.decode("utf-8", errors="replace")
    except Exception:
        return None
    try:
        headers = HeaderParser().parsestr(text)
    except Exception:
        return None
    h = {
        "date": (headers.get("Date") or "").strip(),
        "from": (headers.get("From") or "").strip(),
        "to": (headers.get("To") or "").strip(),
        "cc": (headers.get("Cc") or "").strip(),
        "subject": (headers.get("Subject") or "").strip(),
    }
    return (h, data.lower())


def extract_full_message(path: Path, suffix: str) -> dict | None:
    """Lese ganze Datei, extrahiere Headers + plain-text body. Body cap = 200 KB."""
    try:
        size = path.stat().st_size
    except OSError:
        return None
    if size > MAX_SIZE:
        return None
    try:
        with path.open("rb") as f:
            data = f.read()
    except OSError:
        return None

    if suffix == ".emlx":
        data = _strip_emlx_header(data)
    try:
        msg = message_from_bytes(data)
    except Exception:
        return None

    body_parts: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    cs = part.get_content_charset() or "utf-8"
                    try:
                        body_parts.append(payload.decode(cs, errors="replace"))
                    except (LookupError, UnicodeDecodeError):
                        body_parts.append(payload.decode("utf-8", errors="replace"))
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            cs = msg.get_content_charset() or "utf-8"
            try:
                body_parts.append(payload.decode(cs, errors="replace"))
            except (LookupError, UnicodeDecodeError):
                body_parts.append(payload.decode("utf-8", errors="replace"))

    body = "\n\n".join(body_parts).strip()
    if len(body) > 200 * 1024:
        body = body[:200 * 1024] + "\n\n[...truncated]"

    def _h(name: str) -> str:
        v = msg.get(name)
        if v is None:
            return ""
        try:
            from email.header import decode_header, make_header
            return str(make_header(decode_header(str(v)))).strip()
        except Exception:
            return str(v).strip()

    return {
        "date": _h("Date"),
        "message_id": _h("Message-ID") or _h("Message-Id"),
        "from": _h("From"),
        "to": _h("To"),
        "cc": _h("Cc"),
        "reply_to": _h("Reply-To"),
        "subject": _h("Subject"),
        "body": body,
    }


def classify_relevance(headers: dict | None, raw_lower: bytes | None) -> str | None:
    """Returnt 'tier1' (VOD-Domain Header oder Body), 'tier2' (Payment/Order/Versand-Sender),
    oder None (nicht relevant). Beide Tiers werden in JSONL exportiert.

    tier1 — vinyl-on-demand.com / vod-records.com im From/To/Cc ODER irgendwo im Body
            (z.B. forwarded Bestellung)
    tier2 — From-Adresse von PayPal/Stripe/Klarna/Discogs/Bandcamp/eBay/DHL/Sendcloud/...
            → enthält i.d.R. Customer-Email, Versand-Adresse und Item-Liste
    """
    if not headers:
        return None

    # Tier 1a: VOD-Domain im Header
    for fld in ("from", "to", "cc"):
        v = (headers.get(fld) or "").lower()
        for dom in VOD_DOMAINS:
            if dom in v:
                return "tier1"

    # Tier 1b: VOD-Domain im Body/Raw (forwarded Mail, Quote, Invoice-Footer etc.)
    if raw_lower:
        for dom in VOD_DOMAINS:
            if dom.encode("ascii") in raw_lower:
                return "tier1"

    # Tier 2: Sender ist Payment/Order/Versand-Provider → Customer-Daten erwartet
    from_ = (headers.get("from") or "").lower()
    for dom in PAYMENT_ORDER_DOMAINS:
        # Match auf @domain oder .domain (subdomain) — strikt am Domain-Ende
        if "@" + dom in from_ or "." + dom + ">" in from_ or from_.endswith(dom):
            return "tier2"

    return None


def is_vod_relevant(headers: dict | None, raw_lower: bytes | None = None) -> bool:
    """Convenience-Wrapper für Backwards-Compatibility."""
    return classify_relevance(headers, raw_lower) is not None


def year_from(headers: dict | None) -> int | None:
    if not headers or not headers.get("date"):
        return None
    try:
        d_ = parsedate_to_datetime(headers["date"])
        return d_.year if d_ else None
    except Exception:
        return None


def safe_str(s: str, maxlen: int = 100) -> str:
    return s.replace("\t", " ").replace("\n", " ").replace("\r", " ")[:maxlen]


# ─── Volume-Discovery ────────────────────────────────────────────────────────

def format_size(num_bytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if num_bytes < 1024:
            return f"{num_bytes:.1f} {unit}" if unit != "B" else f"{int(num_bytes)} B"
        num_bytes /= 1024
    return f"{num_bytes:.1f} PB"


class Root:
    __slots__ = ("path", "label", "kind", "size_used")

    def __init__(self, path: Path, label: str, kind: str, size_used: int = 0):
        self.path = path
        self.label = label
        self.kind = kind  # "ssd" | "volume" | "user"
        self.size_used = size_used


def discover_roots() -> list[Root]:
    """Find home-SSD + alle gemounteten Volumes (außer System-Volumes)."""
    roots: list[Root] = []

    home = Path.home()
    if home.exists():
        size = _disk_used(home)
        roots.append(Root(home, f"Home ({home.name})", "ssd", size))

    volumes = Path("/Volumes")
    if volumes.exists():
        for v in sorted(volumes.iterdir(), key=lambda p: p.name.lower()):
            try:
                if v.name.startswith(("."  ,)):
                    continue
                if not v.is_dir() or v.is_symlink():
                    continue
                # macOS mountet die Boot-Volume oft als /Volumes/Macintosh HD
                # (Symlink auf /). Skip wenn realpath == "/" ist.
                try:
                    if v.resolve() == Path("/"):
                        continue
                except OSError:
                    pass
                # Skip Apple-System-Volumes
                if v.name.lower() in ("recovery", "preboot", "vm", "update"):
                    continue
                size = _disk_used(v)
                roots.append(Root(v, v.name, "volume", size))
            except (OSError, PermissionError):
                pass

    return roots


def _disk_used(path: Path) -> int:
    try:
        st = os.statvfs(str(path))
        return (st.f_blocks - st.f_bavail) * st.f_frsize
    except OSError:
        return 0


# ─── Scanner ─────────────────────────────────────────────────────────────────

class Scanner:
    def __init__(self, status: LiveStatus, args: argparse.Namespace,
                 tsv_file, jsonl_file, warn_file):
        self.status = status
        self.args = args
        self.tsv = tsv_file
        self.jsonl = jsonl_file
        self.warn = warn_file
        # Inode-Dedup über alle Roots (wichtig für Time-Machine-Hardlinks)
        self.seen_inodes: set[tuple[int, int]] = set()
        # Per-Root Counters für End-Report
        self.per_root_counts: dict[str, dict] = {}
        # Globale Counts
        self.counts = {
            "emlx": 0, "eml": 0, "mbox": 0, "mbox-naked": 0,
            "tier1": 0, "tier2": 0,
            "with_date": 0, "jsonl_exported": 0,
            "perm_denied": 0, "archives_warn": 0, "duplicates_skipped": 0,
            "extract_errors": 0,
        }

    def scan(self, root: Root) -> None:
        self.status.cur_root = root.label
        self.status.cur_dir = str(root.path)
        self.status.force_render()
        prc = {
            "emlx": 0, "eml": 0, "mbox": 0, "mbox-naked": 0,
            "tier1": 0, "tier2": 0, "archives_warn": 0,
        }
        self.per_root_counts[root.label] = prc

        for dirpath, dirnames, filenames in os.walk(
            str(root.path), followlinks=False, onerror=self._onerror
        ):
            # Path-Filter applied to directories
            kept = []
            for d_name in dirnames:
                full = os.path.join(dirpath, d_name) + "/"
                if is_path_skipped(full, self.args.include_time_machine,
                                   self.args.include_photos):
                    continue
                kept.append(d_name)
            dirnames[:] = kept

            self.status.dirs_seen += 1
            self.status.cur_dir = dirpath
            self.status.tick()

            for fn in filenames:
                self.status.files_seen += 1
                if fn.startswith("."):
                    continue
                full = Path(dirpath) / fn
                suffix = full.suffix.lower()

                fmt_kind = detect_format(full, suffix, fn)
                if fmt_kind is None:
                    self.status.tick()
                    continue
                kind, parseable = fmt_kind

                # Größen-Check für parseable mails
                try:
                    st = full.stat()
                except OSError:
                    self.counts["perm_denied"] += 1
                    self.status.perm_denied = self.counts["perm_denied"]
                    continue

                if parseable == "warn":
                    # Archive (.olm, .pst, .ost, etc) — nur warning
                    self._warn_archive(full, kind, st.st_size)
                    self.counts["archives_warn"] += 1
                    self.status.archives_found = self.counts["archives_warn"]
                    prc["archives_warn"] = prc.get("archives_warn", 0) + 1
                    self.status.tick()
                    continue

                if st.st_size < MIN_SIZE or st.st_size > MAX_SIZE:
                    continue

                # Inode-Dedup (Time-Machine-Hardlinks)
                inode_key = (st.st_dev, st.st_ino)
                if inode_key in self.seen_inodes:
                    self.counts["duplicates_skipped"] += 1
                    continue
                self.seen_inodes.add(inode_key)

                # Header-Parse — returnt (headers, raw_lower) für Body-Match
                parsed = parse_eml_emlx(full, suffix)
                if parsed:
                    headers, raw_lower = parsed
                else:
                    headers, raw_lower = None, None
                yr = year_from(headers)
                tier = classify_relevance(headers, raw_lower)

                self.counts[kind] = self.counts.get(kind, 0) + 1
                prc[kind] = prc.get(kind, 0) + 1
                if yr:
                    self.counts["with_date"] += 1
                if tier == "tier1":
                    self.counts["tier1"] += 1
                    prc["tier1"] = prc.get("tier1", 0) + 1
                elif tier == "tier2":
                    self.counts["tier2"] += 1
                    prc["tier2"] = prc.get("tier2", 0) + 1

                self.status.mails_found = (
                    self.counts["emlx"] + self.counts["eml"]
                    + self.counts["mbox"] + self.counts["mbox-naked"]
                )
                self.status.vod_relevant = self.counts["tier1"] + self.counts["tier2"]

                # TSV-Row — vod_relevant Spalte = "tier1" / "tier2" / "no"
                self.tsv.write("\t".join([
                    str(full),
                    kind,
                    str(yr) if yr else "",
                    safe_str(headers.get("from", "") if headers else "", 100),
                    safe_str(headers.get("to", "") if headers else "", 100),
                    safe_str(headers.get("subject", "") if headers else "", 120),
                    tier or "no",
                ]) + "\n")

                # JSONL für tier1 + tier2 (beide bekommen Body-Export)
                if tier and self.jsonl is not None:
                    try:
                        full_msg = extract_full_message(full, suffix)
                    except Exception as e:
                        self.counts["extract_errors"] += 1
                        self.status.line(d(f"  [extract-err] {full.name}: {e}"))
                        full_msg = None
                    if full_msg:
                        record = {
                            "path": str(full),
                            "format": kind,
                            "year": yr,
                            "size_bytes": st.st_size,
                            "tier": tier,
                            **full_msg,
                        }
                        try:
                            self.jsonl.write(
                                (json.dumps(record, ensure_ascii=False) + "\n").encode("utf-8")
                            )
                            self.counts["jsonl_exported"] += 1
                        except Exception as e:
                            self.status.line(r(f"  [jsonl-err] {full.name}: {e}"))

                self.status.tick()

    def _onerror(self, exc: OSError) -> None:
        # PermissionError, FileNotFoundError → silent skip + count
        self.counts["perm_denied"] += 1
        self.status.perm_denied = self.counts["perm_denied"]
        # Verbose-Log: erste 3 Errors zeigen, dann nur silent
        if self.counts["perm_denied"] <= 3:
            self.status.line(d(f"  [skip] {exc.strerror}: {exc.filename}"))

    def _warn_archive(self, path: Path, kind: str, size: int) -> None:
        if self.warn is None:
            return
        hint = ARCHIVE_EXT_HINT.get(f".{kind}", "Manuelle Extraktion nötig")
        self.warn.write("\t".join([
            str(path), kind, format_size(size), hint
        ]) + "\n")
        self.status.line(
            y(f"  [archive] {kind.upper()} gefunden ({format_size(size)}): {path}")
        )


# ─── Banner / Preview / Confirm ──────────────────────────────────────────────

def print_banner() -> None:
    print()
    print(b("╔════════════════════════════════════════════════════════════════╗"))
    print(b("║  VOD-Mail-Archiv-Scanner v2 — Tiefen-Scan                      ║"))
    print(b("║                                                                ║"))
    print(b("║  Sucht alle Drives nach Mail-Archiven (alle bekannten Formate) ║"))
    print(b("║  Live-Progress sichtbar — Strg-C bricht ab (TSV bleibt erhalten)║"))
    print(b("╚════════════════════════════════════════════════════════════════╝"))
    print()


def preview_and_confirm(roots: list[Root], args: argparse.Namespace) -> list[Root]:
    if not roots:
        print(r("Keine scannbaren Locations gefunden!"))
        sys.exit(1)

    print(b("Folgende Locations werden gescannt:"))
    print()
    for i, ro in enumerate(roots, 1):
        marker = cy("[SSD]") if ro.kind == "ssd" else g("[Volume]")
        size = format_size(ro.size_used) if ro.size_used else d("?")
        print(f"  {b(f'{i:>2}.')} {marker} {ro.path}  {d(f'({size})')}")
    print()
    if not args.include_time_machine:
        print(d("  ℹ Time-Machine-Backups übersprungen (--include-time-machine"
                " zum Aktivieren)"))
    if not args.include_photos:
        print(d("  ℹ Photos-Library übersprungen (--include-photos zum Aktivieren)"))
    print()

    if args.yes:
        print(b("→ Alle Locations werden gescannt (--yes)"))
        return roots

    print("Drücke "
          + b("ENTER")
          + " für alle, oder Nummern (z.B. "
          + b("\"1 3\"")
          + ") für Auswahl, oder "
          + b("Strg-C")
          + " zum Abbrechen.")
    try:
        sel = input("→ Auswahl: ").strip()
    except EOFError:
        sel = ""

    if not sel:
        return roots
    try:
        idx = [int(x) for x in sel.split()]
        chosen = [roots[i - 1] for i in idx if 1 <= i <= len(roots)]
        if not chosen:
            print(r("Keine gültigen Nummern — Abbruch."))
            sys.exit(1)
        return chosen
    except (ValueError, IndexError):
        print(r("Ungültige Eingabe — Abbruch."))
        sys.exit(1)


# ─── Final-Report ────────────────────────────────────────────────────────────

def print_summary(scanner: Scanner, output: Path, jsonl_path: Path | None,
                  warn_path: Path | None, elapsed: float) -> None:
    print()
    print()
    print(b("═" * 64))
    print(b("  SCAN ABGESCHLOSSEN"))
    print(b("═" * 64))
    print()

    arc_count = scanner.counts["archives_warn"]
    tier1 = scanner.counts["tier1"]
    tier2 = scanner.counts["tier2"]
    relevant_total = tier1 + tier2

    print(b("  Output-Dateien:"))
    print(f"    Catalog (TSV):     {output}")
    if jsonl_path and jsonl_path.exists():
        size = format_size(jsonl_path.stat().st_size)
        print(f"    Body-Export:       {jsonl_path}  {d(f'({size})')}")
    if warn_path and warn_path.exists() and arc_count > 0:
        print(f"    Archive-Warnings:  {warn_path}  {y(f'({arc_count} Treffer)')}")
    print()

    print(b("  Mails gefunden:"))
    total_mails = (scanner.counts["emlx"] + scanner.counts["eml"]
                   + scanner.counts["mbox"] + scanner.counts["mbox-naked"])
    print(f"    .emlx:                 {scanner.counts['emlx']:>8}")
    print(f"    .eml:                  {scanner.counts['eml']:>8}")
    print(f"    .mbox:                 {scanner.counts['mbox']:>8}")
    if scanner.counts["mbox-naked"] > 0:
        print(f"    mbox (Magic-Byte):     {scanner.counts['mbox-naked']:>8}")
    print(f"    Gesamt:                {b(f'{total_mails:>8}')}")
    print()
    print(f"    Mit Datum:             {scanner.counts['with_date']:>8}")
    print(f"    {g('VOD-relevant gesamt')}:   {g(f'{relevant_total:>8}')}")
    print(f"      └ Tier 1 (VOD-Domain)     {tier1:>8}  "
          + d("(im Header oder Body)"))
    print(f"      └ Tier 2 (Payment/Order)  {tier2:>8}  "
          + d("(PayPal/Stripe/Klarna/Discogs/Bandcamp/DHL/Sendcloud)"))
    print(f"    Body-exportiert:       {scanner.counts['jsonl_exported']:>8}")
    if scanner.counts["duplicates_skipped"] > 0:
        print(f"    Hardlink-Duplicates:   {scanner.counts['duplicates_skipped']:>8}  "
              f"{d('(Time-Machine-Snapshots, übersprungen)')}")
    print()

    if len(scanner.per_root_counts) > 1:
        print(b("  Pro Volume:"))
        for label, prc in scanner.per_root_counts.items():
            sub_total = prc.get("emlx", 0) + prc.get("eml", 0) + prc.get("mbox", 0) + prc.get("mbox-naked", 0)
            t1 = prc.get("tier1", 0)
            t2 = prc.get("tier2", 0)
            arc = prc.get("archives_warn", 0)
            print(f"    {label:30s}  mails={sub_total:>7}  T1={t1:>5}  T2={t2:>4}  arc={arc}")
        print()

    if scanner.counts["archives_warn"] > 0:
        print(y("  ⚠ Archive ohne automatische Extraktion gefunden:"))
        print(d("     Diese müssen manuell konvertiert werden vor Import."))
        print(d("     Details siehe " + str(warn_path)))
        print()

    if scanner.counts["perm_denied"] > 0:
        print(y(f"  ⚠ {scanner.counts['perm_denied']} Verzeichnisse waren nicht lesbar"))
        print(d("     Meist OS-System-Pfade — egal. Falls VIELE: Full Disk Access prüfen."))
        print()

    if scanner.counts["extract_errors"] > 0:
        print(y(f"  ⚠ {scanner.counts['extract_errors']} Body-Extraction-Errors"))
        print(d("     (Mail im TSV vorhanden, aber Body nicht im JSONL)"))
        print()

    print(b("  Laufzeit:               ") + f"{int(elapsed//60)}m {int(elapsed%60)}s")
    print()

    if relevant_total > 0 and jsonl_path and jsonl_path.exists():
        print(b("  Nächster Schritt:"))
        print(f"    Schick {b(jsonl_path.name)} an Robin")
        print(d("    (iCloud-Drive / WeTransfer / Dropbox / AirDrop)"))
        print()


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Tiefen-Scan für Mail-Archive auf macOS",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--root", action="append", default=[],
                    help="Root-Verzeichnis (override Auto-Discovery, repeatable)")
    ap.add_argument("--output", default=None,
                    help="TSV-Output-Pfad (default: ~/Documents/VOD Mails Suche/_scan-results.tsv)")
    ap.add_argument("--jsonl", default=None,
                    help="JSONL.gz-Pfad für VOD-relevante Mails mit Body")
    ap.add_argument("--warnings", default=None,
                    help="TSV-Pfad für Archive-Warnings (.olm/.pst/.ost)")
    ap.add_argument("--include-time-machine", action="store_true",
                    help="Time-Machine-Snapshots mit-scannen (inode-dedup verhindert Duplikate)")
    ap.add_argument("--include-photos", action="store_true",
                    help="Photos-Library mit-scannen (sehr selten Mails da)")
    ap.add_argument("--yes", "-y", action="store_true",
                    help="Keine Confirm-Frage, alle discovered Roots scannen")
    ap.add_argument("--no-color", action="store_true",
                    help="ANSI-Farben deaktivieren")
    args = ap.parse_args()

    if args.no_color:
        Col.enabled = False
        # Refresh dependent constants
        for attr in ("BOLD", "DIM", "RED", "GREEN", "YELLOW", "BLUE", "MAGENTA", "CYAN", "GRAY", "RESET"):
            setattr(Col, attr, "")

    print_banner()

    # Output-Pfade
    target_dir = Path.home() / "Documents" / "VOD Mails Suche"
    target_dir.mkdir(parents=True, exist_ok=True)
    output_tsv = Path(args.output) if args.output else target_dir / "_scan-results.tsv"
    jsonl_path = Path(args.jsonl) if args.jsonl else target_dir / "vod-mails-export.jsonl.gz"
    warn_path = Path(args.warnings) if args.warnings else target_dir / "_archive-warnings.tsv"
    output_tsv.parent.mkdir(parents=True, exist_ok=True)

    # Roots — entweder vom User oder Auto-Discovery
    if args.root:
        roots = []
        for r_path in args.root:
            p = Path(r_path).expanduser()
            if not p.exists():
                print(r(f"  skip (existiert nicht): {p}"))
                continue
            roots.append(Root(p, p.name or str(p), "user", _disk_used(p)))
    else:
        print(b("→ Discovering Volumes..."))
        roots = discover_roots()

    chosen = preview_and_confirm(roots, args)

    # Output-Streams öffnen
    tsv_f = output_tsv.open("w", encoding="utf-8")
    tsv_f.write("path\tformat\tyear\tfrom\tto\tsubject\tvod_relevant\n")
    jsonl_f = gzip.open(str(jsonl_path), "wb")
    warn_f = warn_path.open("w", encoding="utf-8")
    warn_f.write("path\tkind\tsize\thint\n")

    status = LiveStatus()
    scanner = Scanner(status, args, tsv_f, jsonl_f, warn_f)
    started = time.time()

    print()
    print(b("→ Scan läuft..."))
    print(d("  (Live-Status unten — Strg-C zum Abbrechen, partial Output bleibt erhalten)"))
    print()
    try:
        for ro in chosen:
            try:
                scanner.scan(ro)
            except KeyboardInterrupt:
                status.line(y("  ⚠ Strg-C gedrückt, partial-Scan wird gespeichert..."))
                raise
            except Exception as e:
                status.line(r(f"  [ERR] Scan {ro.label} crashed: {e}"))
    except KeyboardInterrupt:
        pass
    finally:
        # Status-Line clear & flush
        if status.enabled:
            sys.stdout.write("\r\x1b[K")
            sys.stdout.flush()
        tsv_f.close()
        jsonl_f.close()
        warn_f.close()

    elapsed = time.time() - started
    print_summary(scanner, output_tsv, jsonl_path, warn_path, elapsed)

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        print(y("Abbruch durch User."))
        sys.exit(130)
