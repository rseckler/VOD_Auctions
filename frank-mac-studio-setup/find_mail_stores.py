#!/usr/bin/env python3
"""find_mail_stores — Pure Inventory einer Drive: WO sind Mail-Daten?

Anders als find_old_emails_v2.py:
  - KEIN Body-Export, KEINE VOD-Klassifikation, KEIN JSONL
  - Findet auch Folder-Bundles (Apple-Mail .mbox/-Dirs), Archive (.olm/.pst),
    naked-mbox-Files, verdächtige ZIPs, suspekte Verzeichnisse
  - Output ist reine Inventur — TSV + Top-Suspects-Report
  - Damit kann man manuell prüfen ob auf der Drive Mail-Stores liegen die
    der normale Scanner verfehlt hätte

Use-Case: Frank's VOD BIGRAID. Erste v2-Scan-Runde fand nur 113 Mails dort —
unwahrscheinlich, da Frank manuell Mails archiviert haben soll. Diese
Inventory zeigt JEDE mail-relevante Datei und JEDEN suspekten Folder.

Pure stdlib.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path

# ─── Erkennungs-Patterns ─────────────────────────────────────────────────────

# Files mit diesen Extensions sind direkt Mail-Daten (parseable)
PARSEABLE_EXTS = {".emlx", ".eml"}

# .mbox kann File ODER Folder sein — wir behandeln beide separat
MBOX_EXT = ".mbox"

# Binary Mail-Archive
ARCHIVE_EXTS = {
    ".olm": "Outlook for Mac (ZIP+XML)",
    ".pst": "Outlook Windows",
    ".ost": "Outlook offline storage",
    ".mbx": "Eudora/Pegasus mailbox",
    ".tbb": "Thunderbird folder summary",
    ".nbu": "Nokia/Eudora backup",
    ".olk14message": "Outlook 2011 message",
    ".olk14msgsource": "Outlook 2011 source",
    ".olk15message": "Outlook 2016 message",
}

# Compressed/Container Files — wir flaggen sie wenn der Name "mail" enthält
COMPRESSED_EXTS = {".zip", ".tar", ".gz", ".bz2", ".7z", ".rar", ".tgz", ".tbz"}

# Filename-Pattern für naked-mbox-Heuristik (File ohne Extension)
SUGGESTIVE_NAKED_NAME = re.compile(
    r"^(inbox|sent|drafts|trash|archive|outbox|spool|mail|mbox|deleted|"
    r"posteingang|gesendet|entw|gelöscht|papierkorb)$",
    re.IGNORECASE,
)

# Patterns für "verdächtige" Verzeichnisse (deutsche + englische Begriffe)
SUSPICIOUS_DIR_PATTERN = re.compile(
    r"(?<![a-z0-9])"
    r"(mail|mailbox|inbox|outbox|sent|drafts|trash|archive|archiv|"
    r"outlook|imap|email|e[-_]?mail|"
    r"posteingang|postausgang|gesendet|entwurf|papierkorb|gelöscht|"
    r"backup\s*mail|mail\s*backup|exchange|thunderbird)"
    r"(?![a-z0-9])",
    re.IGNORECASE,
)

# Pattern für verdächtige ZIP-Namen
SUSPICIOUS_ZIP_PATTERN = re.compile(
    r"(mail|outlook|email|imap|exchange|posteingang|gesendet|backup\s*mail|"
    r"thunderbird|mailbox|archiv)",
    re.IGNORECASE,
)

# Magic Bytes für Format-Detection
MAGIC_MBOX = b"From "
MAGIC_OLM = b"PK\x03\x04"
MAGIC_PST = b"!BDN"
MAGIC_OST = MAGIC_PST

# Skips — System-Pfade die wir nicht walken (auf einer fremden Drive selten,
# aber sicherheitshalber)
SKIP_PATH_FRAGMENTS = (
    "/.Spotlight-V100/", "/.fseventsd/", "/.DocumentRevisions-V100/",
    "/.TemporaryItems/", "/.Trashes/", "/.PKInstallSandboxManager/",
    "/.MobileBackups/", "/.HFS+ Private Directory Data/",
    "/__MACOSX/",
)

# Min-Größe damit eine Datei als parseable Mail durchgeht
MIN_MAIL_SIZE = 100
MAX_MAIL_SIZE = 50 * 1024 * 1024  # 50 MB pro single message

# Live-UI Refresh-Rate
RENDER_INTERVAL = 0.25


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
    RESET = "\x1b[0m" if enabled else ""


def b(s): return f"{Col.BOLD}{s}{Col.RESET}"
def g(s): return f"{Col.GREEN}{s}{Col.RESET}"
def y(s): return f"{Col.YELLOW}{s}{Col.RESET}"
def r(s): return f"{Col.RED}{s}{Col.RESET}"
def cy(s): return f"{Col.CYAN}{s}{Col.RESET}"
def d(s): return f"{Col.GRAY}{s}{Col.RESET}"


# ─── Live-Status ─────────────────────────────────────────────────────────────

class LiveStatus:
    def __init__(self):
        self.enabled = Col.enabled and sys.stdout.isatty()
        self.last_render = 0.0
        self.start_time = time.time()
        self.cur_dir = ""
        self.dirs_seen = 0
        self.files_seen = 0
        self.mails_total = 0
        self.archives_total = 0
        self.suspicious_dirs = 0
        self.suspicious_zips = 0
        self.bytes_seen = 0
        self.perm_denied = 0

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
        max_dir = max(20, cols - 90)
        if len(cur) > max_dir:
            cur = "…" + cur[-(max_dir - 1):]
        line = (
            f"  dirs={self.dirs_seen:>5}  files={self.files_seen:>7}  "
            f"mails={cy(f'{self.mails_total:>6}')}  "
            f"arc={y(f'{self.archives_total:>3}')}  "
            f"susp={y(f'{self.suspicious_dirs:>3}')}  "
            f"{d(cur)}  "
            f"[{elapsed//60:>2}m{elapsed%60:02d}s]"
        )
        sys.stdout.write(f"\r\x1b[K{line[:cols + 50]}")
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


def detect_magic(path: Path) -> str | None:
    """Liest erste 8 Bytes, returnt 'mbox'/'olm'/'pst' oder None."""
    try:
        with path.open("rb") as f:
            head = f.read(8)
    except OSError:
        return None
    if head.startswith(MAGIC_MBOX):
        return "mbox"
    if head.startswith(MAGIC_OLM):
        return "olm"
    if head.startswith(MAGIC_PST):
        return "pst"
    return None


def count_mails_in_folder(folder: Path) -> int:
    """Zähle .emlx und .eml Files direkt + 1 Level tief — Heuristik für mbox-Bundles."""
    count = 0
    try:
        for entry in folder.iterdir():
            try:
                if entry.is_file() and entry.suffix.lower() in PARSEABLE_EXTS:
                    count += 1
                elif entry.is_dir() and entry.name.lower() in ("messages", "data"):
                    # Apple-Mail .mbox/Messages/ oder .mbox/Data/<n>/.../Messages/
                    for sub in entry.rglob("*"):
                        if sub.is_file() and sub.suffix.lower() in PARSEABLE_EXTS:
                            count += 1
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError):
        return 0
    return count


# ─── Inventory ───────────────────────────────────────────────────────────────

class Inventory:
    """Sammelt alle Findings + Stats."""

    def __init__(self, tsv_writer):
        self.tsv = tsv_writer
        self.counters = defaultdict(int)
        self.total_size_by_kind = defaultdict(int)
        # Top-N tracking
        self.folder_mail_counts: dict[str, int] = defaultdict(int)  # folder → count of mails directly + in subfolders
        self.large_archives: list[tuple[int, str, str]] = []  # (size, kind, path)
        self.large_zips: list[tuple[int, str]] = []  # (size, path)
        self.suspicious_dirs: list[tuple[int, str]] = []  # (mail_count_below, dir_path)
        self.naked_mbox_findings: list[tuple[int, str]] = []  # (size, path)

    def add(self, kind: str, path: Path, size: int, hint: str = "") -> None:
        self.counters[kind] += 1
        self.total_size_by_kind[kind] += size
        try:
            mtime = int(path.stat().st_mtime)
        except OSError:
            mtime = 0
        self.tsv.write("\t".join([
            str(path),
            kind,
            str(size),
            time.strftime("%Y-%m-%d", time.localtime(mtime)) if mtime else "",
            safe_str(hint, 120),
        ]) + "\n")

        # Track top-suspects
        if kind in ARCHIVE_EXTS or kind == "archive-magic":
            self.large_archives.append((size, kind, str(path)))
        elif kind == "naked-mbox":
            self.naked_mbox_findings.append((size, str(path)))
        elif kind == "compressed-suspect":
            self.large_zips.append((size, str(path)))

    def add_mail_to_folder(self, folder: Path, count: int = 1) -> None:
        # Walk up 3 levels und zähle für jeden Parent
        f = folder
        for _ in range(4):
            self.folder_mail_counts[str(f)] += count
            if f.parent == f:
                break
            f = f.parent

    def note_suspicious_dir(self, path: Path, mail_count_below: int) -> None:
        self.suspicious_dirs.append((mail_count_below, str(path)))


# ─── Walker ─────────────────────────────────────────────────────────────────

def walk(root: Path, status: LiveStatus, inv: Inventory,
         deep_magic_check: bool, max_files_for_magic: int = 50_000) -> None:
    """Walk root, klassifiziere jeden File + Folder, schreibe TSV.

    deep_magic_check=True → für jeden File ohne erkannte Extension wird ein
    Magic-Byte-Check gemacht. Sehr gründlich aber langsamer.
    Limit max_files_for_magic damit's nicht aus dem Ruder läuft.
    """
    magic_checks_done = 0

    for dirpath_str, dirnames, filenames in os.walk(
        str(root), followlinks=False, onerror=lambda e: _on_error(e, status, inv)
    ):
        if is_skipped(dirpath_str + "/"):
            dirnames[:] = []
            continue

        dirpath = Path(dirpath_str)
        status.cur_dir = dirpath_str
        status.dirs_seen += 1
        status.tick()

        # Mbox-Bundle-Detection: Verzeichnis-Name endet auf .mbox
        if dirpath.suffix.lower() == MBOX_EXT and dirpath != root:
            mail_count = count_mails_in_folder(dirpath)
            inv.add("mbox-bundle", dirpath, mail_count,
                    f"Apple-Mail-Folder mit ~{mail_count} Mails")
            inv.add_mail_to_folder(dirpath.parent, mail_count)
            # Trotzdem weiter walken — die Mails drin werden auch gefunden

        # Suspect-Folder-Name-Check
        if dirpath != root and SUSPICIOUS_DIR_PATTERN.search(dirpath.name):
            count = count_mails_in_folder(dirpath)
            if count > 0 or _has_archive_files(dirpath):
                inv.note_suspicious_dir(dirpath, count)
                status.suspicious_dirs += 1

        for fn in filenames:
            full = dirpath / fn
            full_str = str(full)
            status.files_seen += 1

            if is_skipped(full_str):
                continue
            if fn.startswith(".") and fn != ".mbox":
                continue

            try:
                size = full.stat().st_size
            except OSError:
                inv.counters["perm_denied"] += 1
                status.perm_denied = inv.counters["perm_denied"]
                continue

            status.bytes_seen += size
            suffix = full.suffix.lower()

            # 1. Parseable mail-files
            if suffix in PARSEABLE_EXTS:
                if MIN_MAIL_SIZE <= size <= MAX_MAIL_SIZE:
                    kind = suffix.lstrip(".") + "-file"
                    inv.add(kind, full, size)
                    inv.add_mail_to_folder(dirpath)
                    status.mails_total += 1
                continue

            # 2. .mbox file (NICHT folder — folders sind oben behandelt)
            if suffix == MBOX_EXT and full.is_file():
                inv.add("mbox-file", full, size, "Standalone mbox flat-file")
                inv.add_mail_to_folder(dirpath)
                status.mails_total += 1
                continue

            # 3. Archive (Outlook etc)
            if suffix in ARCHIVE_EXTS:
                inv.add(suffix.lstrip("."), full, size, ARCHIVE_EXTS[suffix])
                status.archives_total += 1
                continue

            # 4. Outlook.sqlite
            if fn.lower() in ("outlook.sqlite", "outlook.sqlite-wal",
                              "outlook.sqlite-shm", "outlook 2011 identities",
                              "outlook 15 profiles"):
                inv.add("outlook-sqlite", full, size, "Outlook 2016+ SQLite-Store")
                status.archives_total += 1
                continue

            # 5. Compressed-File mit verdächtigem Namen
            if suffix in COMPRESSED_EXTS or fn.lower().endswith(".tar.gz") or fn.lower().endswith(".tar.bz2"):
                if SUSPICIOUS_ZIP_PATTERN.search(fn):
                    inv.add("compressed-suspect", full, size,
                            f"ZIP/TAR mit '{fn}'-Hint — manuell prüfen")
                    status.suspicious_zips += 1
                continue

            # 6. Naked-mbox-Heuristik (nur wenn deep-check, weil teuer)
            if not suffix or SUGGESTIVE_NAKED_NAME.match(fn):
                if size >= MIN_MAIL_SIZE and magic_checks_done < max_files_for_magic:
                    magic_checks_done += 1
                    magic = detect_magic(full)
                    if magic == "mbox":
                        inv.add("naked-mbox", full, size,
                                "Magic-Byte 'From ' — vermutlich mbox ohne Extension")
                        inv.add_mail_to_folder(dirpath)
                        status.mails_total += 1
                continue

            # 7. Deep magic check (für UNBEKANNTE-Suffixes)
            if deep_magic_check and size >= MIN_MAIL_SIZE and magic_checks_done < max_files_for_magic:
                # Nur Files prüfen die "verdächtig" aussehen — sonst zu viele I/O-Calls
                if SUSPICIOUS_DIR_PATTERN.search(fn) or SUSPICIOUS_ZIP_PATTERN.search(fn):
                    magic_checks_done += 1
                    magic = detect_magic(full)
                    if magic == "mbox":
                        inv.add("naked-mbox", full, size, "Magic-Byte 'From '")
                        status.mails_total += 1
                    elif magic == "olm":
                        inv.add("archive-magic", full, size,
                                "Magic-Byte ZIP — könnte .olm sein")
                        status.archives_total += 1
                    elif magic == "pst":
                        inv.add("archive-magic", full, size,
                                "Magic-Byte !BDN — PST-Format")
                        status.archives_total += 1


def _has_archive_files(folder: Path) -> bool:
    try:
        for entry in folder.iterdir():
            if entry.is_file() and entry.suffix.lower() in ARCHIVE_EXTS:
                return True
    except (OSError, PermissionError):
        pass
    return False


def _on_error(exc: OSError, status: LiveStatus, inv: Inventory) -> None:
    inv.counters["perm_denied"] += 1
    status.perm_denied = inv.counters["perm_denied"]
    if inv.counters["perm_denied"] <= 3:
        status.line(d(f"  [skip] {exc.strerror}: {exc.filename}"))


# ─── Banner / Preview ───────────────────────────────────────────────────────

def banner():
    print()
    print(b("╔════════════════════════════════════════════════════════════════╗"))
    print(b("║  VOD-Mail-Inventory                                            ║"))
    print(b("║                                                                ║"))
    print(b("║  Reine Diagnose: WO sind Mail-Daten auf dieser Drive?          ║"))
    print(b("║  Findet: .emlx .eml .mbox + .olm/.pst/.ost/.mbx Archives,      ║"))
    print(b("║  mbox-Bundles, naked-mbox, verdächtige ZIPs + Folder           ║"))
    print(b("║                                                                ║"))
    print(b("║  KEIN Body-Export — nur Inventur                               ║"))
    print(b("╚════════════════════════════════════════════════════════════════╝"))
    print()


def confirm_root(root: Path, args) -> None:
    print(b("Drive zu scannen:"))
    print(f"  {b(str(root))}")
    if root.exists():
        try:
            st = os.statvfs(str(root))
            used = (st.f_blocks - st.f_bavail) * st.f_frsize
            print(f"  {d(format_size(used) + ' belegt')}")
        except OSError:
            pass
    else:
        print(r(f"  ✗ existiert nicht!"))
        sys.exit(1)
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
                  elapsed: float, status: LiveStatus) -> None:
    lines = []

    def line(s=""):
        lines.append(s)

    line("═" * 72)
    line(f"  Mail-Inventory: {root}")
    line(f"  Gescannt:       {time.strftime('%Y-%m-%d %H:%M:%S')}")
    line(f"  Laufzeit:       {int(elapsed//60)}m {int(elapsed%60)}s")
    line(f"  Verzeichnisse:  {status.dirs_seen}")
    line(f"  Files:          {status.files_seen}  ({format_size(status.bytes_seen)})")
    if inv.counters["perm_denied"] > 0:
        line(f"  Permission-Denied: {inv.counters['perm_denied']} (silent skip)")
    line("═" * 72)
    line()

    line("FINDINGS NACH KIND")
    line("─" * 72)
    for kind in sorted(inv.counters.keys()):
        if kind == "perm_denied":
            continue
        c = inv.counters[kind]
        sz = inv.total_size_by_kind.get(kind, 0)
        line(f"  {kind:30s} {c:>8}  {format_size(sz):>12}")
    line()

    if inv.large_archives:
        line("ARCHIVES (.olm / .pst / .ost / .mbx / .tbb / Outlook.sqlite / Magic)")
        line("─" * 72)
        for sz, kind, p in sorted(inv.large_archives, reverse=True)[:30]:
            line(f"  [{kind:14s}] {format_size(sz):>10}  {p}")
        line()

    if inv.naked_mbox_findings:
        line("NAKED-MBOX (Files ohne Extension, Magic-Byte 'From ')")
        line("─" * 72)
        for sz, p in sorted(inv.naked_mbox_findings, reverse=True)[:30]:
            line(f"  {format_size(sz):>10}  {p}")
        line()

    if inv.large_zips:
        line("VERDÄCHTIGE ZIPS/TARS (Filename mit 'mail|outlook|backup'-Hint)")
        line("─" * 72)
        for sz, p in sorted(inv.large_zips, reverse=True)[:30]:
            line(f"  {format_size(sz):>10}  {p}")
        line()

    # Top-Folder mit den meisten Mails
    top_folders = sorted(
        ((c, p) for p, c in inv.folder_mail_counts.items() if c > 0),
        reverse=True
    )[:30]
    if top_folders:
        line("TOP-FOLDER MIT DEN MEISTEN MAIL-FILES")
        line("─" * 72)
        for c, p in top_folders:
            line(f"  {c:>8} mails  {p}")
        line()

    # Suspekte Dirs
    sus = sorted(inv.suspicious_dirs, reverse=True)[:30]
    if sus:
        line("VERDÄCHTIGE FOLDER-NAMEN (mail/inbox/archive/...)")
        line("─" * 72)
        for c, p in sus:
            mark = f"({c} mails drin)" if c > 0 else "(leer/Archive)"
            line(f"  {p:60s}  {mark}")
        line()

    line("═" * 72)
    line("EMPFOHLENE NÄCHSTE SCHRITTE")
    line("─" * 72)
    line()
    if inv.large_archives:
        line("  • Archive ({}): manuell extrahieren oder Frank fragen.".format(
            len(inv.large_archives)))
        line("    .olm → Outlook for Mac → File → Export")
        line("    .pst → libpst/readpst (brew install libpst) auf einem Linux/Mac")
    if inv.large_zips:
        line("  • Verdächtige ZIPs ({}): in temporären Folder entpacken,".format(
            len(inv.large_zips)))
        line("    dann nochmal `find_mail_stores.py` oder `find_old_emails_v2.py`")
        line("    drauf laufen lassen.")
    if top_folders:
        line(f"  • Top-Folder ({top_folders[0][0]} Mails): mit Apple Mail")
        line("    'Postfach > Postfach importieren' → diesen Folder als")
        line(f"    Apple Mail Quelle: {top_folders[0][1]}")
    if not (inv.large_archives or inv.large_zips or top_folders):
        line("  Keine signifikanten Mail-Daten auf dieser Drive gefunden.")
        line("  Kein weiterer Schritt nötig.")
    line()

    text = "\n".join(lines)
    with summary_path.open("w", encoding="utf-8") as f:
        f.write(text)
    # Print to terminal too
    print()
    print(text)


# ─── Main ───────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Inventur einer Drive nach Mail-Daten — keine Extraktion",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--root", default="/Volumes/VOD BIGRAID",
                    help="Drive/Verzeichnis das gescannt wird (default: /Volumes/VOD BIGRAID)")
    ap.add_argument("--output-dir", default=None,
                    help="Output-Ordner (default: ~/Documents/VOD Mail-Inventory/)")
    ap.add_argument("--yes", "-y", action="store_true",
                    help="Kein Confirm-Prompt, Scan sofort starten")
    ap.add_argument("--no-color", action="store_true")
    ap.add_argument("--deep", action="store_true",
                    help="Magic-Byte-Check auf alle Files mit verdächtigen Namen "
                         "(langsamer aber gründlicher)")
    args = ap.parse_args()

    if args.no_color:
        for attr in ("BOLD", "DIM", "RED", "GREEN", "YELLOW", "CYAN", "GRAY", "RESET"):
            setattr(Col, attr, "")
        Col.enabled = False

    banner()

    root = Path(args.root).expanduser().resolve()
    confirm_root(root, args)

    out_dir = Path(args.output_dir).expanduser() if args.output_dir else \
        Path.home() / "Documents" / "VOD Mail-Inventory"
    out_dir.mkdir(parents=True, exist_ok=True)
    drive_label = re.sub(r"[^a-zA-Z0-9_.-]+", "_", root.name) or "root"
    tsv_path = out_dir / f"{drive_label}_findings.tsv"
    summary_path = out_dir / f"{drive_label}_summary.txt"

    print()
    print(b(f"→ Output: {out_dir}"))
    print(d(f"  TSV:     {tsv_path.name}"))
    print(d(f"  Summary: {summary_path.name}"))
    if args.deep:
        print(d("  Mode:    --deep (Magic-Byte-Check für verdächtige Files)"))
    print()
    print(b("→ Scan läuft..."))
    print(d("  (Live-Status — Strg-C bricht ab, TSV bleibt erhalten)"))
    print()

    tsv_f = tsv_path.open("w", encoding="utf-8")
    tsv_f.write("path\tkind\tsize_bytes\tmtime_date\thint\n")
    inv = Inventory(tsv_f)
    status = LiveStatus()
    t0 = time.time()

    try:
        walk(root, status, inv, deep_magic_check=args.deep)
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

    elapsed = time.time() - t0
    write_summary(inv, root, summary_path, elapsed, status)

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        sys.exit(130)
