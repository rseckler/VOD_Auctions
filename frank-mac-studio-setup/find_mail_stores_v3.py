#!/usr/bin/env python3
"""find_mail_stores_v3 — Tiefen-Diagnose nach Mail-Daten.

Probleme von v2:
  - 16.7 TB in 68 Sek = nur Metadata-Walk, kein Content-Inspect
  - ZIPs wurden nur per Filename-Hint geflaggt — Inhalt nie geprüft
  - 7416 permission-denied silent geskippt — keine Liste was unlesbar war
  - Magic-Byte-Check nur auf Files mit suggested-name (inbox/sent/etc)
  - Mail-Listen in DOCX/XLSX/CSV/VCF wurden nicht gefunden

v3 fixes:
  1. ZIP/TAR/GZ Content-Listing (zipfile/tarfile stdlib): findet Mail-Files
     INNERHALB von Containern, ohne extrahieren zu müssen
  2. Universal Magic-Byte-Probe: für JEDE File <= 100 MB ohne erkannte
     Extension (statt nur suggestive-name) — Cost: 8 bytes per file
  3. Mail-Adress-Extraktion aus DOCX/XLSX/CSV/TXT/VCF/HTML — findet
     Frank's manuelle Mail-Listen (z.B. emailsmembers.docx, mitgliederemails.docx)
  4. Permission-Denied-Reporting: erste 100 unlesbare Verzeichnisse
     mit Pfad zu separater Datei
  5. Thunderbird-Profile-Detection: erkennt komplette Profile-Trees
     auch wenn die einzelnen mbox-Files keine Extension haben
  6. Apple-Mail-Identity-Detection: findet komplette Mail-V*-Identities
  7. Outlook 2011/2016 Identity-Stores
  8. Parallel-I/O via ThreadPoolExecutor (sinnvoll für ZIP-Inspect, weil
     I/O-bound)
  9. Live-UI mit Phase-Anzeige (Walk → Inspect-ZIPs → Content-Sniff →
     Mail-Lists)

Pure stdlib. Optional: brew install libpst für .pst-Extract (das macht
das Skript NICHT — es findet nur und reportet).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import struct
import sys
import tarfile
import time
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# ─── Patterns ────────────────────────────────────────────────────────────────

MAIL_FILE_EXTS = {".emlx", ".eml"}
MBOX_EXT = ".mbox"

ARCHIVE_EXTS = {
    ".olm": "Outlook for Mac (ZIP+XML)",
    ".pst": "Outlook Windows",
    ".ost": "Outlook offline",
    ".mbx": "Eudora/Pegasus mailbox",
    ".tbb": "Thunderbird folder summary",
    ".nbu": "Nokia/Eudora backup",
    ".olk14message": "Outlook 2011 message",
    ".olk15message": "Outlook 2016 message",
}

ZIP_EXTS = {".zip", ".jar"}
TAR_EXTS = {".tar"}
TAR_GZ_PATTERNS = (".tar.gz", ".tgz", ".tar.bz2", ".tbz", ".tbz2", ".tar.xz", ".txz")

# Files mit Inhalt-Sniff (Mail-Adressen suchen)
TEXT_LIKE_EXTS = {
    ".txt", ".csv", ".tsv", ".vcf", ".vcard", ".ldif", ".tab",
    ".html", ".htm", ".log", ".md", ".rst",
}
# OOXML/odf — wir können in deren ZIPs reingucken (document.xml extrahieren)
OOXML_EXTS = {".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp"}

# Naked mail-file Heuristik
SUGGESTIVE_NAKED_NAME = re.compile(
    r"^(inbox|sent|drafts|trash|archive|outbox|spool|mail|mbox|deleted|"
    r"posteingang|gesendet|entw|gelöscht|papierkorb|gel\xf6schte|"
    r"junk|spam|notes|chats)$",
    re.IGNORECASE,
)

# Suspekte Verzeichnis-Namen
SUSPICIOUS_DIR_PATTERN = re.compile(
    r"(?<![a-z0-9])"
    r"(mail|mailbox|inbox|outbox|sent|drafts|trash|archiv|"
    r"outlook|imap|email|"
    r"posteingang|postausgang|gesendet|entwurf|papierkorb|gelöscht|"
    r"thunderbird|exchange)"
    r"(?![a-z0-9])",
    re.IGNORECASE,
)

# Mail-Adress-Regex (für Content-Sniff)
EMAIL_RE = re.compile(rb"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b")

# VOD-Hint-Patterns für Content-Sniff
VOD_HINTS = re.compile(
    rb"(vinyl-on-demand|vod-records|vodrecords|frank.{0,5}maier)",
    re.IGNORECASE,
)

# Magic Bytes
MAGIC_MBOX = b"From "
MAGIC_OLM = b"PK\x03\x04"
MAGIC_PST = b"!BDN"
MAGIC_OOXML = b"PK\x03\x04"  # OOXML ist auch ZIP

# Skips
SKIP_PATH_FRAGMENTS = (
    "/.Spotlight-V100/", "/.fseventsd/", "/.DocumentRevisions-V100/",
    "/.TemporaryItems/", "/.Trashes/", "/.PKInstallSandboxManager/",
    "/.MobileBackups/", "/__MACOSX/", "/.git/",
    "/node_modules/",
)

MIN_MAIL_SIZE = 100
MAX_MAIL_SIZE = 50 * 1024 * 1024
MAX_PROBE_SIZE = 100 * 1024 * 1024  # max file size für Magic-Byte-Probe
MAX_ZIP_INSPECT_SIZE = 5 * 1024 * 1024 * 1024  # 5 GB — drüber wird ZIP-Listing skippen
MAX_CONTENT_SNIFF_SIZE = 50 * 1024 * 1024  # 50 MB max for content-sniff

RENDER_INTERVAL = 0.25
ZIP_INSPECT_WORKERS = 4

# Files für Content-Sniff: read first N KB
CONTENT_SNIFF_BYTES = 256 * 1024  # 256 KB


# ─── Color / TTY ─────────────────────────────────────────────────────────────

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
    CYAN = "\x1b[36m" if enabled else ""
    GRAY = "\x1b[90m" if enabled else ""
    MAGENTA = "\x1b[35m" if enabled else ""
    RESET = "\x1b[0m" if enabled else ""


def b(s): return f"{Col.BOLD}{s}{Col.RESET}"
def g(s): return f"{Col.GREEN}{s}{Col.RESET}"
def y(s): return f"{Col.YELLOW}{s}{Col.RESET}"
def r(s): return f"{Col.RED}{s}{Col.RESET}"
def cy(s): return f"{Col.CYAN}{s}{Col.RESET}"
def m(s): return f"{Col.MAGENTA}{s}{Col.RESET}"
def d(s): return f"{Col.GRAY}{s}{Col.RESET}"


# ─── Live-Status ─────────────────────────────────────────────────────────────

class LiveStatus:
    def __init__(self):
        self.enabled = Col.enabled and sys.stdout.isatty()
        self.last_render = 0.0
        self.start_time = time.time()
        self.phase = "init"
        self.cur_dir = ""
        self.dirs_seen = 0
        self.files_seen = 0
        self.bytes_seen = 0
        self.mails_total = 0
        self.archives_total = 0
        self.zips_inspected = 0
        self.zips_with_mail = 0
        self.text_sniffed = 0
        self.mail_lists_found = 0
        self.perm_denied = 0
        self.errors = 0

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
        cur = self.cur_dir
        max_dir = max(20, cols - 110)
        if len(cur) > max_dir:
            cur = "…" + cur[-(max_dir - 1):]
        line = (
            f"  [{m(self.phase[:8]):8s}] "
            f"d={self.dirs_seen:>5} "
            f"f={self.files_seen:>7} "
            f"mails={cy(f'{self.mails_total:>6}')} "
            f"arc={y(f'{self.archives_total:>3}')} "
            f"zip-in={self.zips_inspected:>3}/{g(f'{self.zips_with_mail:>3}')} "
            f"lists={g(f'{self.mail_lists_found:>3}')} "
            f"{d(cur)} "
            f"[{elapsed//60}m{elapsed%60:02d}s]"
        )
        sys.stdout.write(f"\r\x1b[K{line[:cols + 80]}")
        sys.stdout.flush()

    def line(self, msg: str):
        if self.enabled:
            sys.stdout.write(f"\r\x1b[K{msg}\n")
            self._render()
        else:
            print(msg, flush=True)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def format_size(num: int) -> str:
    n = float(num)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024
    return f"{n:.1f} PB"


def safe_str(s: str, maxlen: int = 200) -> str:
    return s.replace("\t", " ").replace("\n", " ").replace("\r", " ")[:maxlen]


def is_skipped(path_str: str) -> bool:
    return any(frag in path_str for frag in SKIP_PATH_FRAGMENTS)


def detect_magic(path: Path, n: int = 16) -> bytes | None:
    try:
        with path.open("rb") as f:
            return f.read(n)
    except OSError:
        return None


def is_tar_gz_name(fn: str) -> bool:
    fn_lower = fn.lower()
    return any(fn_lower.endswith(ext) for ext in TAR_GZ_PATTERNS)


# ─── Content-Sniff für Text/OOXML-Files ──────────────────────────────────────

def sniff_text_for_emails(path: Path, max_bytes: int = CONTENT_SNIFF_BYTES) -> tuple[int, int, list[str]]:
    """Liest first N KB einer Text-File, returnt (email_count, vod_email_count, sample_emails)."""
    try:
        with path.open("rb") as f:
            data = f.read(max_bytes)
    except OSError:
        return (0, 0, [])
    emails = EMAIL_RE.findall(data)
    if not emails:
        return (0, 0, [])
    seen = set()
    samples = []
    vod_count = 0
    for e in emails:
        try:
            es = e.decode("utf-8", errors="replace").lower()
        except Exception:
            continue
        if es in seen:
            continue
        seen.add(es)
        if any(dom in es for dom in ("vinyl-on-demand.com", "vod-records.com")):
            vod_count += 1
        if len(samples) < 5:
            samples.append(es)
    return (len(seen), vod_count, samples)


def sniff_ooxml_for_emails(path: Path) -> tuple[int, int, list[str]]:
    """OOXML (.docx/.xlsx) ist ein ZIP — extrahiere document.xml/sheet1.xml und sniff."""
    try:
        with zipfile.ZipFile(str(path)) as zf:
            text_buf = b""
            for inner in zf.namelist():
                if inner.endswith(".xml") and any(
                    h in inner for h in ("document.xml", "sheet", "shared", "content.xml")
                ):
                    try:
                        text_buf += zf.read(inner)
                        if len(text_buf) > CONTENT_SNIFF_BYTES * 4:
                            break
                    except Exception:
                        continue
    except (zipfile.BadZipFile, OSError, RuntimeError):
        return (0, 0, [])

    if not text_buf:
        return (0, 0, [])
    emails = EMAIL_RE.findall(text_buf)
    if not emails:
        return (0, 0, [])
    seen = set()
    samples = []
    vod_count = 0
    for e in emails:
        try:
            es = e.decode("utf-8", errors="replace").lower()
        except Exception:
            continue
        if es in seen:
            continue
        seen.add(es)
        if any(dom in es for dom in ("vinyl-on-demand.com", "vod-records.com")):
            vod_count += 1
        if len(samples) < 5:
            samples.append(es)
    return (len(seen), vod_count, samples)


# ─── ZIP / TAR Content-Inspect ───────────────────────────────────────────────

def inspect_zip(path: Path) -> dict | None:
    """Listet ZIP-Inhalt, sucht Mail-Files. Returnt None wenn kein ZIP oder zu groß."""
    try:
        size = path.stat().st_size
    except OSError:
        return None
    if size > MAX_ZIP_INSPECT_SIZE:
        return {"path": str(path), "size": size, "skipped": "too_large_for_inspect",
                "mail_files": [], "total_files": 0}
    try:
        with zipfile.ZipFile(str(path)) as zf:
            names = zf.namelist()
    except (zipfile.BadZipFile, OSError, RuntimeError, NotImplementedError):
        return None  # Nicht echtes ZIP (z.B. Magic-Byte-Match aber kein valider ZIP)

    mail_files = []
    for n in names:
        n_lower = n.lower()
        if any(n_lower.endswith(ext) for ext in MAIL_FILE_EXTS):
            mail_files.append(n)
        elif n_lower.endswith(MBOX_EXT) and not n_lower.endswith("/" + MBOX_EXT.lstrip(".")):
            mail_files.append(n)
        elif any(n_lower.endswith(ext) for ext in ARCHIVE_EXTS):
            mail_files.append(n)
        # Filename suggests mbox without extension
        elif "/" in n:
            base = n.rsplit("/", 1)[1]
            if SUGGESTIVE_NAKED_NAME.match(base):
                mail_files.append(n)
        elif SUGGESTIVE_NAKED_NAME.match(n):
            mail_files.append(n)

    return {
        "path": str(path),
        "size": size,
        "total_files": len(names),
        "mail_files": mail_files[:50],  # cap an die wichtigsten 50
        "mail_count": len(mail_files),
    }


def inspect_tar(path: Path) -> dict | None:
    """Listet TAR/TGZ-Inhalt, sucht Mail-Files."""
    try:
        size = path.stat().st_size
    except OSError:
        return None
    if size > MAX_ZIP_INSPECT_SIZE:
        return {"path": str(path), "size": size, "skipped": "too_large_for_inspect",
                "mail_files": [], "total_files": 0}
    mode = "r:*"
    try:
        with tarfile.open(str(path), mode) as tf:
            names = tf.getnames()
    except (tarfile.TarError, OSError, EOFError):
        return None

    mail_files = []
    for n in names:
        n_lower = n.lower()
        if any(n_lower.endswith(ext) for ext in MAIL_FILE_EXTS):
            mail_files.append(n)
        elif n_lower.endswith(MBOX_EXT):
            mail_files.append(n)
        elif any(n_lower.endswith(ext) for ext in ARCHIVE_EXTS):
            mail_files.append(n)
        elif "/" in n:
            base = n.rsplit("/", 1)[1]
            if SUGGESTIVE_NAKED_NAME.match(base):
                mail_files.append(n)

    return {
        "path": str(path),
        "size": size,
        "total_files": len(names),
        "mail_files": mail_files[:50],
        "mail_count": len(mail_files),
    }


# ─── Inventory ───────────────────────────────────────────────────────────────

class Inventory:
    def __init__(self, tsv_writer, perm_writer):
        self.tsv = tsv_writer
        self.perm = perm_writer
        self.counters = defaultdict(int)
        self.total_size_by_kind = defaultdict(int)
        self.folder_mail_counts: dict[str, int] = defaultdict(int)
        self.large_archives: list[tuple[int, str, str]] = []  # (size, kind, path)
        self.naked_mbox_findings: list[tuple[int, str]] = []
        self.zips_to_inspect: list[Path] = []
        self.tars_to_inspect: list[Path] = []
        self.text_files_to_sniff: list[Path] = []
        self.ooxml_files_to_sniff: list[Path] = []
        self.zip_results: list[dict] = []  # nach Inspect
        self.mail_lists: list[dict] = []  # Files mit vielen Mail-Adressen
        self.suspicious_dirs: list[tuple[int, str]] = []
        self.thunderbird_profiles: list[str] = []
        self.apple_mail_identities: list[str] = []
        self.outlook_identities: list[str] = []
        self.perm_denied_paths: list[str] = []

    def add(self, kind: str, path, size: int, hint: str = "") -> None:
        self.counters[kind] += 1
        self.total_size_by_kind[kind] += size
        try:
            mtime = int(Path(str(path)).stat().st_mtime)
        except OSError:
            mtime = 0
        self.tsv.write("\t".join([
            str(path),
            kind,
            str(size),
            time.strftime("%Y-%m-%d", time.localtime(mtime)) if mtime else "",
            safe_str(hint, 200),
        ]) + "\n")

        if kind in ARCHIVE_EXTS or kind in ("archive-magic", "outlook-sqlite",
                                            "thunderbird-profile", "apple-mail-identity"):
            self.large_archives.append((size, kind, str(path)))
        elif kind == "naked-mbox":
            self.naked_mbox_findings.append((size, str(path)))
        elif kind == "mail-list" or kind == "mail-list-ooxml":
            pass  # already tracked separately

    def add_mail_to_folder(self, folder: Path, count: int = 1) -> None:
        f = folder
        for _ in range(5):
            self.folder_mail_counts[str(f)] += count
            if f.parent == f:
                break
            f = f.parent

    def note_perm_denied(self, path: str, reason: str = "") -> None:
        self.counters["perm_denied"] += 1
        if len(self.perm_denied_paths) < 200:
            self.perm_denied_paths.append(path)
        self.perm.write(f"{path}\t{reason}\n")


# ─── Walk-Phase ─────────────────────────────────────────────────────────────

def walk_phase(root: Path, status: LiveStatus, inv: Inventory,
               include_time_machine: bool) -> None:
    status.phase = "walk"

    for dirpath_str, dirnames, filenames in os.walk(
        str(root), followlinks=False,
        onerror=lambda e: _on_error(e, status, inv)
    ):
        if is_skipped(dirpath_str + "/"):
            dirnames[:] = []
            continue
        # Time Machine handling
        if not include_time_machine:
            dirnames[:] = [d for d in dirnames
                           if d != "Backups.backupdb" and d != ".backupdb"]

        dirpath = Path(dirpath_str)
        status.cur_dir = dirpath_str
        status.dirs_seen += 1
        status.tick()

        # ── Identity-Detection ────────────────────────────────────────────────
        # Apple Mail Identity (Library/Mail/V*/<UUID>/)
        if dirpath.parent.name.startswith("V") and len(dirpath.name) == 36 and "-" in dirpath.name:
            inv.apple_mail_identities.append(dirpath_str)

        # Thunderbird Profile
        if dirpath.name.endswith(".default") or ".default-" in dirpath.name:
            mail_sub = dirpath / "Mail"
            if mail_sub.exists():
                inv.thunderbird_profiles.append(dirpath_str)
                # Skip recursion — we'll mark whole tree as mail-store
                # but still walk into Mail/ for individual files

        # Outlook 2011/2016 Identity
        if dirpath.name == "Main Identity" and dirpath.parent.name in (
            "Office 2011 Identities", "Outlook 2011 Identities",
            "Microsoft", "Office",
        ):
            inv.outlook_identities.append(dirpath_str)
        if dirpath.name == "Outlook 15 Profiles":
            inv.outlook_identities.append(dirpath_str)

        # ── mbox-Bundle (Apple Mail folder) ──────────────────────────────────
        if dirpath.suffix.lower() == MBOX_EXT and dirpath != root:
            count = _count_mails_in_folder_quick(dirpath)
            inv.add("mbox-bundle", dirpath, count,
                    f"Apple-Mail-Folder mit ~{count} Mails")
            inv.add_mail_to_folder(dirpath.parent, count)

        # ── Suspect-Folder-Name ──────────────────────────────────────────────
        if dirpath != root and SUSPICIOUS_DIR_PATTERN.search(dirpath.name):
            count = _count_mails_in_folder_quick(dirpath)
            if count > 0 or _has_archive_files(dirpath):
                inv.suspicious_dirs.append((count, dirpath_str))

        # ── Files ───────────────────────────────────────────────────────────
        for fn in filenames:
            full = dirpath / fn
            full_str = str(full)
            status.files_seen += 1

            if is_skipped(full_str):
                continue
            if fn.startswith("._"):  # macOS resource forks
                continue

            try:
                size = full.stat().st_size
            except OSError:
                inv.note_perm_denied(full_str, "stat-failed")
                status.perm_denied = inv.counters["perm_denied"]
                continue

            status.bytes_seen += size
            suffix = full.suffix.lower()

            # Catch double-suffix like .tar.gz
            is_tar_gz = is_tar_gz_name(fn)

            # 1. Direct mail-files
            if suffix in MAIL_FILE_EXTS:
                if MIN_MAIL_SIZE <= size <= MAX_MAIL_SIZE:
                    kind = suffix.lstrip(".") + "-file"
                    inv.add(kind, full, size)
                    inv.add_mail_to_folder(dirpath)
                    status.mails_total += 1
                continue

            # 2. .mbox file (NICHT folder)
            if suffix == MBOX_EXT and full.is_file():
                inv.add("mbox-file", full, size, "Standalone mbox flat-file")
                inv.add_mail_to_folder(dirpath)
                status.mails_total += 1
                continue

            # 3. Mail-Archive
            if suffix in ARCHIVE_EXTS:
                inv.add(suffix.lstrip("."), full, size, ARCHIVE_EXTS[suffix])
                status.archives_total += 1
                continue

            # 4. Outlook.sqlite
            if fn.lower() in ("outlook.sqlite", "outlook.sqlite-wal",
                              "outlook.sqlite-shm", "database",
                              "outlook 15 profiles"):
                if "outlook" in dirpath_str.lower() or "office" in dirpath_str.lower():
                    inv.add("outlook-sqlite", full, size, "Outlook SQLite-Store")
                    status.archives_total += 1
                    continue

            # 5. Compressed Archives (ZIP/TAR/etc) — queue zur Inspect-Phase
            if suffix in ZIP_EXTS:
                if size <= MAX_ZIP_INSPECT_SIZE:
                    inv.zips_to_inspect.append(full)
                continue
            if suffix in TAR_EXTS or is_tar_gz:
                if size <= MAX_ZIP_INSPECT_SIZE:
                    inv.tars_to_inspect.append(full)
                continue

            # 6. OOXML — queue für Mail-List-Sniff (.docx/.xlsx etc enthalten oft Adressen)
            if suffix in OOXML_EXTS:
                if size <= MAX_CONTENT_SNIFF_SIZE:
                    inv.ooxml_files_to_sniff.append(full)
                continue

            # 7. Text-Files — queue für Email-Sniff
            if suffix in TEXT_LIKE_EXTS:
                if size <= MAX_CONTENT_SNIFF_SIZE:
                    inv.text_files_to_sniff.append(full)
                continue

            # 8. Naked / unknown extension — Magic-Byte-Probe für ALLE
            if size >= MIN_MAIL_SIZE and size <= MAX_PROBE_SIZE:
                head = detect_magic(full, n=16)
                if not head:
                    continue
                if head.startswith(MAGIC_MBOX):
                    inv.add("naked-mbox", full, size,
                            "Magic-Byte 'From ' — mbox ohne Extension")
                    inv.add_mail_to_folder(dirpath)
                    status.mails_total += 1
                elif head.startswith(MAGIC_PST):
                    inv.add("archive-magic-pst", full, size,
                            "Magic-Byte !BDN — PST-Format (keine Extension)")
                    status.archives_total += 1
                # ZIP magic ohne entsprechende Extension: nur flag wenn
                # filename "mail/outlook" enthält (sonst zu viele False-Positives)
                elif head.startswith(MAGIC_OLM):
                    fn_lower = fn.lower()
                    if any(h in fn_lower for h in
                           ("mail", "outlook", "imap", "exchange", "olm",
                            "thunderbird", "posteingang", "gesendet")):
                        inv.add("archive-magic-zip", full, size,
                                "Magic-Byte ZIP + verdächtiger Name — könnte .olm sein")
                        status.archives_total += 1


def _count_mails_in_folder_quick(folder: Path) -> int:
    count = 0
    try:
        for entry in folder.iterdir():
            try:
                if entry.is_file() and entry.suffix.lower() in MAIL_FILE_EXTS:
                    count += 1
                elif entry.is_dir() and entry.name in ("Messages", "Data"):
                    for sub in entry.rglob("*"):
                        try:
                            if sub.is_file() and sub.suffix.lower() in MAIL_FILE_EXTS:
                                count += 1
                        except (OSError, PermissionError):
                            continue
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError):
        return 0
    return count


def _has_archive_files(folder: Path) -> bool:
    try:
        for entry in folder.iterdir():
            try:
                if entry.is_file() and entry.suffix.lower() in ARCHIVE_EXTS:
                    return True
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError):
        pass
    return False


def _on_error(exc: OSError, status: LiveStatus, inv: Inventory) -> None:
    inv.note_perm_denied(str(exc.filename or "?"), exc.strerror or "?")
    status.perm_denied = inv.counters["perm_denied"]


# ─── Inspect-Phase: ZIP/TAR/OOXML/Text ───────────────────────────────────────

def inspect_phase(status: LiveStatus, inv: Inventory) -> None:
    # ZIPs
    if inv.zips_to_inspect:
        status.phase = "zip-inspect"
        status.force_render()
        with ThreadPoolExecutor(max_workers=ZIP_INSPECT_WORKERS) as ex:
            futures = {ex.submit(inspect_zip, p): p for p in inv.zips_to_inspect}
            for fut in as_completed(futures):
                p = futures[fut]
                status.cur_dir = str(p)
                status.zips_inspected += 1
                status.tick()
                try:
                    res = fut.result()
                except Exception:
                    res = None
                if res:
                    inv.zip_results.append(res)
                    if res.get("mail_count", 0) > 0:
                        status.zips_with_mail += 1
                        kind = "mail-zip"
                        try:
                            sz = p.stat().st_size
                        except OSError:
                            sz = 0
                        inv.add(kind, p, sz,
                                f"{res['mail_count']} Mail-Files in ZIP "
                                f"({res['total_files']} Files total)")

    # TAR/TGZ
    if inv.tars_to_inspect:
        status.phase = "tar-inspect"
        status.force_render()
        with ThreadPoolExecutor(max_workers=ZIP_INSPECT_WORKERS) as ex:
            futures = {ex.submit(inspect_tar, p): p for p in inv.tars_to_inspect}
            for fut in as_completed(futures):
                p = futures[fut]
                status.cur_dir = str(p)
                status.zips_inspected += 1
                status.tick()
                try:
                    res = fut.result()
                except Exception:
                    res = None
                if res:
                    inv.zip_results.append(res)
                    if res.get("mail_count", 0) > 0:
                        status.zips_with_mail += 1
                        try:
                            sz = p.stat().st_size
                        except OSError:
                            sz = 0
                        inv.add("mail-tar", p, sz,
                                f"{res['mail_count']} Mail-Files in TAR")

    # OOXML (DOCX/XLSX)
    if inv.ooxml_files_to_sniff:
        status.phase = "ooxml"
        status.force_render()
        for p in inv.ooxml_files_to_sniff:
            status.cur_dir = str(p)
            status.text_sniffed += 1
            status.tick()
            count, vod_count, samples = sniff_ooxml_for_emails(p)
            if count >= 5:  # signifikant viele Adressen
                try:
                    sz = p.stat().st_size
                except OSError:
                    sz = 0
                inv.add("mail-list-ooxml", p, sz,
                        f"{count} Mail-Adressen ({vod_count} VOD-Domain)"
                        + (f" — {','.join(samples[:3])}" if samples else ""))
                inv.mail_lists.append({"path": str(p), "kind": "ooxml",
                                       "emails": count, "vod_emails": vod_count,
                                       "samples": samples})
                status.mail_lists_found += 1

    # Text-Files
    if inv.text_files_to_sniff:
        status.phase = "text"
        status.force_render()
        for p in inv.text_files_to_sniff:
            status.cur_dir = str(p)
            status.text_sniffed += 1
            status.tick()
            count, vod_count, samples = sniff_text_for_emails(p)
            if count >= 5:
                try:
                    sz = p.stat().st_size
                except OSError:
                    sz = 0
                inv.add("mail-list", p, sz,
                        f"{count} Mail-Adressen ({vod_count} VOD-Domain)"
                        + (f" — {','.join(samples[:3])}" if samples else ""))
                inv.mail_lists.append({"path": str(p), "kind": "text",
                                       "emails": count, "vod_emails": vod_count,
                                       "samples": samples})
                status.mail_lists_found += 1


# ─── Banner / Confirm ──────────────────────────────────────────────────────

def banner():
    print()
    print(b("╔════════════════════════════════════════════════════════════════════╗"))
    print(b("║  VOD-Mail-Inventory v3 — Tiefen-Diagnose                           ║"))
    print(b("║                                                                    ║"))
    print(b("║  Findet wirklich ALLES: Files + Folder + ZIP-Inhalte +             ║"))
    print(b("║  Mail-Listen in DOCX/XLSX/CSV + Thunderbird-Profile +              ║"))
    print(b("║  Magic-Byte-Universal + explizite Permission-Reports               ║"))
    print(b("║                                                                    ║"))
    print(b("║  KEIN Body-Export, KEIN Import — nur Inventur                      ║"))
    print(b("║  Realistisch: 30-60 Min für 16 TB                                  ║"))
    print(b("╚════════════════════════════════════════════════════════════════════╝"))
    print()


def confirm_root(root: Path, args) -> None:
    print(b(f"Drive zu scannen: {root}"))
    if not root.exists():
        print(r("  ✗ existiert nicht!"))
        sys.exit(1)
    try:
        st = os.statvfs(str(root))
        used = (st.f_blocks - st.f_bavail) * st.f_frsize
        total = st.f_blocks * st.f_frsize
        print(f"  {d(format_size(used) + ' belegt von ' + format_size(total))}")
    except OSError:
        pass
    print()
    print(d("Phasen:"))
    print(d("  1. Walk      — alle Verzeichnisse traversieren, parseable Mails finden"))
    print(d("  2. ZIP-Inspect — ZIP-Inhalte listen, Mail-Files innerhalb finden"))
    print(d("  3. TAR-Inspect — TAR/TGZ-Inhalte listen"))
    print(d("  4. OOXML     — Mail-Adressen aus DOCX/XLSX/PPTX extrahieren"))
    print(d("  5. Text      — Mail-Adressen aus CSV/TXT/VCF/HTML extrahieren"))
    print()
    if args.yes:
        print(g("→ Scan startet (--yes)"))
        return
    print(d("Drücke ENTER zum Starten, Strg-C zum Abbrechen."))
    try:
        input("→ ")
    except EOFError:
        pass


# ─── Final Report ────────────────────────────────────────────────────────────

def write_summary(inv: Inventory, root: Path, summary_path: Path,
                  perm_path: Path, elapsed: float, status: LiveStatus) -> None:
    lines = []

    def L(s=""):
        lines.append(s)

    L("═" * 76)
    L(f"  Mail-Inventory v3: {root}")
    L(f"  Gescannt:          {time.strftime('%Y-%m-%d %H:%M:%S')}")
    L(f"  Laufzeit:          {int(elapsed//60)}m {int(elapsed%60)}s")
    L(f"  Dirs/Files:        {status.dirs_seen} dirs / {status.files_seen} files")
    L(f"  Bytes durchgangen: {format_size(status.bytes_seen)}")
    L(f"  ZIP/TAR-Inspekt:   {status.zips_inspected} ({status.zips_with_mail} mit Mails)")
    L(f"  Text-Files-Sniff:  {status.text_sniffed} ({status.mail_lists_found} mit Mail-Listen)")
    if inv.counters["perm_denied"] > 0:
        L(f"  Permission-Denied: {inv.counters['perm_denied']} (Liste: {perm_path.name})")
    L("═" * 76)
    L()

    L("FINDINGS NACH KIND")
    L("─" * 76)
    for kind in sorted(inv.counters.keys()):
        if kind == "perm_denied":
            continue
        c = inv.counters[kind]
        sz = inv.total_size_by_kind.get(kind, 0)
        L(f"  {kind:30s} {c:>8}  {format_size(sz):>14}")
    L()

    # MAIL-ZIPS — höchste Priorität (das ist das was v2 verfehlt hat)
    mail_zips = [(z["size"], z["path"], z["mail_count"], z.get("total_files", 0))
                 for z in inv.zip_results if z.get("mail_count", 0) > 0]
    if mail_zips:
        L("ZIP/TAR-FILES MIT MAIL-INHALTEN (NEU in v3 — Inhalte gelistet)")
        L("─" * 76)
        for sz, p, mc, tc in sorted(mail_zips, reverse=True)[:30]:
            L(f"  [{mc} Mails / {tc} Files]  {format_size(sz):>10}  {p}")
        L()

    # MAIL-LISTEN (DOCX/XLSX/CSV mit vielen Adressen)
    if inv.mail_lists:
        L("MAIL-LISTEN (Files mit ≥ 5 Mail-Adressen — manuelle Listen, vCards, ...)")
        L("─" * 76)
        sorted_lists = sorted(inv.mail_lists, key=lambda x: -x["emails"])[:30]
        for ml in sorted_lists:
            vod_marker = f" ⭐ {ml['vod_emails']} VOD" if ml['vod_emails'] > 0 else ""
            L(f"  [{ml['emails']:>5} Mails{vod_marker}]  {ml['path']}")
            if ml['samples']:
                L(f"    Beispiele: {', '.join(ml['samples'][:3])}")
        L()

    # Apple-Mail-Identities
    if inv.apple_mail_identities:
        L("APPLE-MAIL-IDENTITIES (komplette Mail-Stores)")
        L("─" * 76)
        for p in inv.apple_mail_identities[:20]:
            L(f"  {p}")
        L()

    # Thunderbird-Profile
    if inv.thunderbird_profiles:
        L("THUNDERBIRD-PROFILES (komplette Mail-Stores)")
        L("─" * 76)
        for p in inv.thunderbird_profiles[:20]:
            L(f"  {p}")
        L()

    # Outlook-Identities
    if inv.outlook_identities:
        L("OUTLOOK-IDENTITIES (Outlook 2011/2016)")
        L("─" * 76)
        for p in inv.outlook_identities[:20]:
            L(f"  {p}")
        L()

    if inv.large_archives:
        L("MAIL-ARCHIVES (.olm/.pst/.ost/.mbx/Magic)")
        L("─" * 76)
        for sz, kind, p in sorted(inv.large_archives, reverse=True)[:30]:
            L(f"  [{kind:24s}] {format_size(sz):>10}  {p}")
        L()

    if inv.naked_mbox_findings:
        L("NAKED-MBOX (Files ohne Extension, Magic-Byte 'From ')")
        L("─" * 76)
        for sz, p in sorted(inv.naked_mbox_findings, reverse=True)[:30]:
            L(f"  {format_size(sz):>10}  {p}")
        L()

    # Top-Folder
    top_folders = sorted(
        ((c, p) for p, c in inv.folder_mail_counts.items() if c > 0),
        reverse=True
    )[:30]
    if top_folders:
        L("TOP-FOLDER MIT DEN MEISTEN MAIL-FILES")
        L("─" * 76)
        for c, p in top_folders:
            L(f"  {c:>8} mails  {p}")
        L()

    # Permission-Denied (zeig erste 30 zur Diagnose)
    if inv.perm_denied_paths:
        L("PERMISSION-DENIED (erste 30 — vollständige Liste in der TSV)")
        L("─" * 76)
        for p in inv.perm_denied_paths[:30]:
            L(f"  {p}")
        L(f"  (insgesamt {inv.counters['perm_denied']} Pfade)")
        L()

    L("═" * 76)
    L("EMPFOHLENE NÄCHSTE SCHRITTE")
    L("─" * 76)
    L()
    if mail_zips:
        big = [z for z in mail_zips if z[2] > 100]
        if big:
            L(f"  ⭐ {len(big)} ZIPs enthalten je ≥ 100 Mail-Files — TOP-PRIORITÄT")
            for sz, p, mc, tc in sorted(big, reverse=True)[:5]:
                L(f"     {p}  ({mc} Mails)")
            L(f"     Diese ZIPs entpacken → mit find_old_emails_v2.py auf entpackten Folder scannen")
            L()
    if inv.mail_lists:
        with_vod = [m for m in inv.mail_lists if m["vod_emails"] > 0]
        if with_vod:
            L(f"  ⭐ {len(with_vod)} Files mit VOD-Mail-Adressen — manuelle Listen!")
            for ml in sorted(with_vod, key=lambda x: -x["vod_emails"])[:10]:
                L(f"     {ml['path']}  ({ml['vod_emails']} VOD / {ml['emails']} total)")
            L(f"     Diese Files händisch öffnen — Frank's manuelle Mailing-Listen")
            L()
    if inv.thunderbird_profiles:
        L(f"  • Thunderbird-Profile ({len(inv.thunderbird_profiles)}):")
        for p in inv.thunderbird_profiles:
            L(f"     {p}")
        L(f"     → Apple Mail: 'Postfach > Postfach importieren > Thunderbird'")
        L()
    if inv.large_archives:
        pst_archives = [a for a in inv.large_archives if a[1] in ("pst", "ost", "archive-magic-pst")]
        if pst_archives:
            L(f"  • PST-Files ({len(pst_archives)}) — brauchen libpst (brew install libpst):")
            for sz, kind, p in sorted(pst_archives, reverse=True)[:5]:
                L(f"     {p}  ({format_size(sz)})")
            L(f"     readpst -o /tmp/extracted '<file.pst>' → liefert mbox-Files")
            L()
    if not (mail_zips or inv.mail_lists or inv.thunderbird_profiles or inv.large_archives):
        L("  Keine signifikanten Mail-Daten auf dieser Drive gefunden.")

    text = "\n".join(lines)
    with summary_path.open("w", encoding="utf-8") as f:
        f.write(text)
    print()
    print(text)


# ─── Main ───────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Tiefen-Inventur einer Drive nach Mail-Daten",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--root", default="/Volumes/VOD BIGRAID")
    ap.add_argument("--output-dir", default=None)
    ap.add_argument("--yes", "-y", action="store_true")
    ap.add_argument("--no-color", action="store_true")
    ap.add_argument("--include-time-machine", action="store_true",
                    help="Time-Machine-Snapshots mit-scannen (sehr viele Duplikate)")
    args = ap.parse_args()

    if args.no_color:
        for attr in ("BOLD", "DIM", "RED", "GREEN", "YELLOW", "CYAN", "GRAY", "MAGENTA", "RESET"):
            setattr(Col, attr, "")
        Col.enabled = False

    banner()
    root = Path(args.root).expanduser().resolve()
    confirm_root(root, args)

    out_dir = Path(args.output_dir).expanduser() if args.output_dir else \
        Path.home() / "Documents" / "VOD Mail-Inventory"
    out_dir.mkdir(parents=True, exist_ok=True)
    label = re.sub(r"[^a-zA-Z0-9_.-]+", "_", root.name) or "root"
    tsv_path = out_dir / f"{label}_v3_findings.tsv"
    summary_path = out_dir / f"{label}_v3_summary.txt"
    perm_path = out_dir / f"{label}_v3_permission_denied.tsv"

    print()
    print(b(f"→ Output-Folder: {out_dir}"))
    print(d(f"  TSV:        {tsv_path.name}"))
    print(d(f"  Summary:    {summary_path.name}"))
    print(d(f"  Perm-Liste: {perm_path.name}"))
    print()

    tsv_f = tsv_path.open("w", encoding="utf-8")
    tsv_f.write("path\tkind\tsize_bytes\tmtime_date\thint\n")
    perm_f = perm_path.open("w", encoding="utf-8")
    perm_f.write("path\treason\n")

    inv = Inventory(tsv_f, perm_f)
    status = LiveStatus()
    t0 = time.time()

    print(b("→ Scan startet — kann 30-60 Min für 16 TB dauern"))
    print(d("  Strg-C → partial Output bleibt erhalten"))
    print()

    try:
        walk_phase(root, status, inv, args.include_time_machine)
        inspect_phase(status, inv)
    except KeyboardInterrupt:
        if status.enabled:
            sys.stdout.write("\r\x1b[K")
        print()
        print(y("⚠ Strg-C — partial Inventory wird gespeichert..."))
    finally:
        if status.enabled:
            sys.stdout.write("\r\x1b[K")
            sys.stdout.flush()
        tsv_f.close()
        perm_f.close()

    elapsed = time.time() - t0
    write_summary(inv, root, summary_path, perm_path, elapsed, status)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        sys.exit(130)
