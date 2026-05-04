#!/usr/bin/env python3
"""
find_old_invoices.py — Scan a large drive for legacy VOD-Records invoice PDFs.

Background
----------
MonKey Office data goes back to 2019 only. Frank started VOD-Records in 2003.
Old invoices (2003-2018) are presumably scattered across his Mac Studio and an
external RAID. This tool walks any directory, scores every PDF as a possible
invoice, and writes a reviewable TSV. After approval, a second pass copies
the approved PDFs into one folder.

Two phases
----------
  1) scan     Walk a directory, find PDFs, extract text, score, write TSV.
  2) collect  Read the TSV, copy approved rows into one target folder.

Typical workflow
----------------
  # 1) Scan the RAID (writes scan-results.tsv next to script)
  python3 find_old_invoices.py scan /Volumes/RAID

  # 2) Open scan-results.tsv in Numbers/Excel, mark approved rows with "x" in
  #    the 'approve' column (or use --all-matches in step 3 to skip review).

  # 3) Collect approved PDFs into ~/Documents/VOD Rechnungen (year subfolders)
  python3 find_old_invoices.py collect scan-results.tsv
  # …or override target:
  python3 find_old_invoices.py collect scan-results.tsv --target /some/where

Requirements
------------
  - Python 3.9+
  - pdftotext (poppler). Install on macOS:    brew install poppler

Author: Robin Seckler — for VOD_Auctions / Monkey Office migration
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import multiprocessing as mp
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

# ---------------------------------------------------------------------------
# Configuration / patterns
# ---------------------------------------------------------------------------

# What identifies a VOD-Records invoice in the PDF text. Regex, case-insensitive.
SENDER_PATTERNS = [
    (r"VOD[\s\-]?Records",                     "VOD-Records"),
    (r"Vinyl[\s\-]?On[\s\-]?Demand",           "Vinyl On Demand"),
    (r"vod[\s\-]?records?\.com",               "vod-records.com"),
    (r"vinyl[\s\-]?on[\s\-]?demand\.com",      "vinyl-on-demand.com"),
    (r"Alpenstr(?:asse|\.)?\s*25",             "Alpenstrasse 25"),
    (r"88045\s*Friedrichshafen",               "88045 Friedrichshafen"),
]

# What suggests "this is an invoice". Score boosters.
INVOICE_KEYWORDS = [
    r"\bRechnung(?:s\-?nummer)?\b",
    r"\bRechnungs\-?Nr\.?\b",
    r"\bRe\-?Nr\.?\b",
    r"\bInvoice\b",
    r"\bFaktura\b",
    r"\bGutschrift\b",
    r"\bKorrekturrechnung\b",
    r"\bProforma(?:rechnung)?\b",
    r"\bLieferschein\b",
]

# MonKey-Office filename prefixes (likely never present pre-2019, but cheap to check)
DOCTYPE_PREFIX_RE = re.compile(r"\b(RG|KR|PR|AR|GU)\-(\d{4})\-(\d{4,7})\b", re.I)

# Generic invoice number patterns we might encounter pre-MO
INVOICE_NO_PATTERNS = [
    re.compile(r"Rechnung[s\-]?\s*Nr\.?\s*[:\.]?\s*([A-Z0-9\-/]{3,20})", re.I),
    re.compile(r"Rechnungsnummer\s*[:\.]?\s*([A-Z0-9\-/]{3,20})", re.I),
    re.compile(r"\bInvoice\s*(?:No\.?|Number)?\s*[:\.]?\s*([A-Z0-9\-/]{3,20})", re.I),
    re.compile(r"Re\-?Nr\.?\s*[:\.]?\s*([A-Z0-9\-/]{3,20})", re.I),
]

# 4-digit years 19xx/20xx — used for date detection
YEAR_RE = re.compile(r"\b(19\d{2}|20[0-2]\d)\b")
# DD.MM.YYYY (German) or YYYY-MM-DD (ISO)
GERMAN_DATE_RE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.((?:19|20)\d{2})\b")
ISO_DATE_RE = re.compile(r"\b((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})\b")

# Compiled once
_SENDER_RES = [(re.compile(p, re.I), label) for p, label in SENDER_PATTERNS]
_KEYWORD_RES = [re.compile(p, re.I) for p in INVOICE_KEYWORDS]

# Defaults
DEFAULT_PDFTOTEXT_PAGES = 2
DEFAULT_PDFTOTEXT_TIMEOUT = 20  # seconds
DEFAULT_MAX_FILE_MB = 500
DEFAULT_PROCESSES = max(2, (os.cpu_count() or 4) - 1)

TSV_FIELDS = [
    "approve",       # left empty — user marks 'x' to keep
    "status",        # match | maybe | skip | error
    "score",         # 0..100
    "path",
    "size_mb",
    "mtime",
    "year_fn",       # year guessed from filename
    "year_text",     # earliest plausible year found in PDF text
    "doc_type",      # RG / KR / PR / AR / GU / "" (or "Rechnung" / "Invoice")
    "invoice_no",
    "customer_hint",
    "sender",        # matched sender label(s)
    "keywords",      # matched invoice keyword(s)
    "snippet",       # ~180 chars, single line, around first sender hit
    "error",
]


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------

@dataclass
class ScanRow:
    approve: str = ""
    status: str = "skip"
    score: int = 0
    path: str = ""
    size_mb: str = ""
    mtime: str = ""
    year_fn: str = ""
    year_text: str = ""
    doc_type: str = ""
    invoice_no: str = ""
    customer_hint: str = ""
    sender: str = ""
    keywords: str = ""
    snippet: str = ""
    error: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def human_mb(n_bytes: int) -> str:
    return f"{n_bytes / (1024 * 1024):.2f}"


def iso_mtime(p: Path) -> str:
    try:
        return datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc) \
                       .astimezone().strftime("%Y-%m-%d %H:%M:%S")
    except OSError:
        return ""


def year_from_filename(name: str) -> str:
    m = DOCTYPE_PREFIX_RE.search(name)
    if m:
        return m.group(2)
    m = YEAR_RE.search(name)
    return m.group(1) if m else ""


def doctype_from_filename(name: str) -> str:
    m = DOCTYPE_PREFIX_RE.search(name)
    return m.group(1).upper() if m else ""


def customer_hint_from_filename(name: str) -> str:
    """RG-2019-000001_DE WINTER_JURGEN.pdf  →  'DE WINTER JURGEN'."""
    base = re.sub(r"\.pdf$", "", name, flags=re.I)
    base = DOCTYPE_PREFIX_RE.sub("", base)
    base = base.strip(" _-")
    base = re.sub(r"[_]+", " ", base)
    base = re.sub(r"\s+", " ", base).strip()
    return base[:60]


def earliest_year_in_text(text: str) -> str:
    candidates: list[int] = []
    for _, _, y in GERMAN_DATE_RE.findall(text):
        candidates.append(int(y))
    for y, _, _ in ISO_DATE_RE.findall(text):
        candidates.append(int(y))
    if not candidates:
        for y in YEAR_RE.findall(text):
            candidates.append(int(y))
    plausible = [y for y in candidates if 1995 <= y <= datetime.now().year]
    return str(min(plausible)) if plausible else ""


def extract_invoice_no(text: str) -> str:
    m = DOCTYPE_PREFIX_RE.search(text)
    if m:
        return m.group(0).upper()
    for rx in INVOICE_NO_PATTERNS:
        m = rx.search(text)
        if m:
            return m.group(1).strip()
    return ""


def make_snippet(text: str, hit_index: int, span: int = 90) -> str:
    start = max(0, hit_index - span)
    end = min(len(text), hit_index + span)
    snippet = text[start:end]
    return re.sub(r"\s+", " ", snippet).strip()


def check_pdftotext() -> Optional[str]:
    path = shutil.which("pdftotext")
    if path:
        return path
    sys.stderr.write(
        "ERROR: pdftotext not found in PATH.\n"
        "Install on macOS:\n"
        "    brew install poppler\n"
        "Then retry. (pdftotext ships with the poppler package.)\n"
    )
    return None


# ---------------------------------------------------------------------------
# Per-PDF worker
# ---------------------------------------------------------------------------

def _init_worker():
    # Children should ignore Ctrl-C; the parent handles it.
    signal.signal(signal.SIGINT, signal.SIG_IGN)


def extract_text(pdf_path: str, pages: int, timeout: int) -> tuple[str, str]:
    """Return (text, error). Empty error string == success."""
    try:
        proc = subprocess.run(
            [
                "pdftotext",
                "-l", str(pages),
                "-layout",
                "-nopgbrk",
                "-enc", "UTF-8",
                pdf_path,
                "-",
            ],
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        if proc.returncode != 0:
            err = proc.stderr.decode("utf-8", errors="replace").strip().splitlines()
            return ("", err[-1] if err else f"pdftotext rc={proc.returncode}")
        return (proc.stdout.decode("utf-8", errors="replace"), "")
    except subprocess.TimeoutExpired:
        return ("", f"pdftotext timeout after {timeout}s")
    except FileNotFoundError:
        return ("", "pdftotext binary missing")
    except Exception as exc:  # noqa: BLE001
        return ("", f"pdftotext crash: {exc}")


def score_pdf(args) -> dict:
    pdf_path, pages, timeout, max_mb = args
    p = Path(pdf_path)
    row = ScanRow(path=str(p))

    try:
        st = p.stat()
    except OSError as e:
        row.status = "error"
        row.error = f"stat: {e}"
        return asdict(row)

    row.size_mb = human_mb(st.st_size)
    row.mtime = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc) \
                        .astimezone().strftime("%Y-%m-%d %H:%M:%S")
    row.year_fn = year_from_filename(p.name)
    row.doc_type = doctype_from_filename(p.name)
    row.customer_hint = customer_hint_from_filename(p.name)

    if st.st_size > max_mb * 1024 * 1024:
        row.status = "skip"
        row.error = f"file > {max_mb} MB"
        return asdict(row)

    text, err = extract_text(str(p), pages=pages, timeout=timeout)
    if err and not text:
        row.status = "error"
        row.error = err
        return asdict(row)

    sender_hits: list[str] = []
    first_hit_pos = -1
    for rx, label in _SENDER_RES:
        m = rx.search(text)
        if m:
            sender_hits.append(label)
            if first_hit_pos < 0:
                first_hit_pos = m.start()
    keyword_hits: list[str] = []
    for rx in _KEYWORD_RES:
        m = rx.search(text)
        if m:
            keyword_hits.append(m.group(0))

    row.sender = ", ".join(sorted(set(sender_hits)))
    row.keywords = ", ".join(sorted(set(keyword_hits)))[:120]
    row.year_text = earliest_year_in_text(text)
    row.invoice_no = extract_invoice_no(text)

    if first_hit_pos < 0 and keyword_hits:
        first_hit_pos = text.lower().find(keyword_hits[0].lower())
    if first_hit_pos >= 0:
        row.snippet = make_snippet(text, first_hit_pos, span=90)[:180]

    score = 0
    if sender_hits:
        score += 60
        if len(sender_hits) >= 2:
            score += 10
    if keyword_hits:
        score += 20
        if len(keyword_hits) >= 2:
            score += 5
    if row.invoice_no:
        score += 5
    if row.year_text:
        score += 5

    row.score = min(score, 100)
    if sender_hits and keyword_hits:
        row.status = "match"
    elif sender_hits or keyword_hits:
        row.status = "maybe"
    else:
        row.status = "skip"

    return asdict(row)


# ---------------------------------------------------------------------------
# Filesystem walking
# ---------------------------------------------------------------------------

SKIP_DIRS = {
    ".Trashes", ".Spotlight-V100", ".DocumentRevisions-V100",
    ".fseventsd", ".TemporaryItems", "$RECYCLE.BIN", "System Volume Information",
    ".git", "node_modules", ".venv", "venv", "__pycache__",
    "Backups.backupdb",  # Time Machine — tunable
}


def iter_pdfs(root: Path, follow_symlinks: bool, include_tm: bool) -> Iterable[Path]:
    skip_dirs = set(SKIP_DIRS)
    if include_tm:
        skip_dirs.discard("Backups.backupdb")
    for dirpath, dirnames, filenames in os.walk(root, followlinks=follow_symlinks):
        dirnames[:] = [d for d in dirnames if d not in skip_dirs]
        for fname in filenames:
            if fname.lower().endswith(".pdf"):
                yield Path(dirpath) / fname


# ---------------------------------------------------------------------------
# TSV I/O
# ---------------------------------------------------------------------------

def write_tsv(out_path: Path, rows: Iterable[dict], append: bool) -> int:
    mode = "a" if append and out_path.exists() else "w"
    n = 0
    with out_path.open(mode, encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=TSV_FIELDS, delimiter="\t",
                                extrasaction="ignore", quoting=csv.QUOTE_MINIMAL)
        if mode == "w":
            writer.writeheader()
        for r in rows:
            writer.writerow(r)
            n += 1
    return n


def read_tsv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        return list(reader)


def already_scanned_paths(tsv_path: Path) -> set[str]:
    if not tsv_path.exists():
        return set()
    try:
        return {row["path"] for row in read_tsv(tsv_path) if row.get("path")}
    except Exception:  # noqa: BLE001
        return set()


# ---------------------------------------------------------------------------
# Phase 1: scan
# ---------------------------------------------------------------------------

def cmd_scan(args: argparse.Namespace) -> int:
    if not check_pdftotext():
        return 2

    root = Path(args.path).expanduser().resolve()
    if not root.exists():
        print(f"ERROR: path does not exist: {root}", file=sys.stderr)
        return 2

    out = Path(args.out).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    print(f"Scan root      : {root}")
    print(f"TSV output     : {out}")
    print(f"Workers        : {args.workers}")
    print(f"Pages/PDF      : {args.pages}")
    print(f"Per-PDF timeout: {args.timeout}s")
    print(f"Max file size  : {args.max_mb} MB")
    print(f"Resume         : {'on' if args.resume else 'off'}")
    print()

    seen = already_scanned_paths(out) if args.resume else set()
    if seen:
        print(f"Resume: {len(seen):,} PDFs already in {out.name} — will skip those.")

    print("Indexing PDF files…")
    t0 = time.time()
    all_pdfs = []
    for p in iter_pdfs(root, follow_symlinks=args.follow_symlinks,
                       include_tm=args.include_time_machine):
        if str(p) in seen:
            continue
        all_pdfs.append(str(p))
    print(f"  found {len(all_pdfs):,} PDFs to scan ({time.time() - t0:.1f}s)")
    if not all_pdfs:
        print("Nothing to do.")
        return 0

    work = [(p, args.pages, args.timeout, args.max_mb) for p in all_pdfs]

    print("Scanning…")
    t0 = time.time()
    processed = 0
    matches = 0
    maybes = 0
    errors = 0
    batch: list[dict] = []
    flush_every = 200

    write_header_now = not (args.resume and out.exists())
    if write_header_now:
        with out.open("w", encoding="utf-8", newline="") as f:
            csv.DictWriter(f, fieldnames=TSV_FIELDS, delimiter="\t").writeheader()

    pool = mp.Pool(processes=args.workers, initializer=_init_worker)
    try:
        for row in pool.imap_unordered(score_pdf, work, chunksize=8):
            batch.append(row)
            processed += 1
            if row["status"] == "match":
                matches += 1
            elif row["status"] == "maybe":
                maybes += 1
            elif row["status"] == "error":
                errors += 1

            if len(batch) >= flush_every:
                write_tsv(out, batch, append=True)
                batch.clear()

            if processed % 200 == 0 or processed == len(all_pdfs):
                rate = processed / max(0.001, time.time() - t0)
                eta = (len(all_pdfs) - processed) / max(0.001, rate)
                print(
                    f"  [{processed:>6,}/{len(all_pdfs):,}] "
                    f"match={matches:,}  maybe={maybes:,}  err={errors:,}  "
                    f"{rate:5.1f} pdf/s  ETA {eta/60:5.1f}m",
                    flush=True,
                )
    except KeyboardInterrupt:
        print("\nInterrupted — flushing partial results…", file=sys.stderr)
        pool.terminate()
        pool.join()
        if batch:
            write_tsv(out, batch, append=True)
        return 130
    else:
        pool.close()
        pool.join()

    if batch:
        write_tsv(out, batch, append=True)

    elapsed = time.time() - t0
    print()
    print(f"Done in {elapsed/60:.1f}m  —  scanned {processed:,} PDFs")
    print(f"  match : {matches:,}   (sender + invoice keyword)")
    print(f"  maybe : {maybes:,}    (sender OR keyword only)")
    print(f"  errors: {errors:,}")
    print()
    print(f"Open {out} in Numbers/Excel and put 'x' in the 'approve' column for")
    print(f"every PDF you want copied. Then run:")
    print(f"  python3 {Path(__file__).name} collect {out}")
    print(f"  → copies into ~/Documents/VOD Rechnungen/<jahr>/<originalname>.pdf")
    print(f"  (override with --target /some/other/path)")
    return 0


# ---------------------------------------------------------------------------
# Phase 2: collect
# ---------------------------------------------------------------------------

def is_approved(row: dict, mode: str, min_score: int) -> bool:
    if mode == "approved":
        return (row.get("approve") or "").strip().lower() in {"x", "y", "yes", "1", "true", "ok"}
    if mode == "matches":
        return row.get("status") == "match" and int(row.get("score") or 0) >= min_score
    if mode == "maybes":
        return row.get("status") in {"match", "maybe"} and int(row.get("score") or 0) >= min_score
    return False


def safe_copy(src: Path, dest: Path, dry_run: bool) -> tuple[Path, str]:
    """Copy src to dest, appending _dup{n} if dest exists with different content."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        if not dry_run:
            shutil.copy2(src, dest)
        return dest, "copied"

    if dest.stat().st_size == src.stat().st_size and _same_hash(src, dest):
        return dest, "duplicate-skipped"

    stem, suffix = dest.stem, dest.suffix
    n = 1
    while True:
        cand = dest.with_name(f"{stem}_dup{n}{suffix}")
        if not cand.exists():
            if not dry_run:
                shutil.copy2(src, cand)
            return cand, "copied-dup"
        n += 1


def _same_hash(a: Path, b: Path, chunk: int = 1024 * 1024) -> bool:
    h1, h2 = hashlib.sha256(), hashlib.sha256()
    with a.open("rb") as fa, b.open("rb") as fb:
        while True:
            ba = fa.read(chunk)
            bb = fb.read(chunk)
            if not ba and not bb:
                break
            h1.update(ba)
            h2.update(bb)
    return h1.hexdigest() == h2.hexdigest()


def cmd_collect(args: argparse.Namespace) -> int:
    tsv = Path(args.tsv).expanduser().resolve()
    if not tsv.exists():
        print(f"ERROR: TSV not found: {tsv}", file=sys.stderr)
        return 2
    target = Path(args.target).expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)

    rows = read_tsv(tsv)
    print(f"Loaded {len(rows):,} rows from {tsv.name}")

    selected = [r for r in rows if is_approved(r, args.select, args.min_score)]
    print(f"Selected {len(selected):,} rows  (mode={args.select}, min_score={args.min_score})")
    if not selected:
        print("Nothing to copy. Did you mark rows with 'x' in the 'approve' column?")
        print("Or use --select matches / --select maybes to skip manual approval.")
        return 1

    print(f"Target folder: {target}")
    print(f"Dry run      : {'YES (no files copied)' if args.dry_run else 'no'}")
    print()

    by_year: dict[str, int] = {}
    bytes_copied = 0
    copied = 0
    duplicates = 0
    missing = 0

    for i, row in enumerate(selected, 1):
        src = Path(row["path"])
        if not src.exists():
            missing += 1
            print(f"  [skip] missing: {src}")
            continue

        year = (row.get("year_text") or row.get("year_fn") or "unknown").strip() or "unknown"
        sub = target / year
        dest = sub / src.name

        result_path, action = safe_copy(src, dest, dry_run=args.dry_run)
        if action == "duplicate-skipped":
            duplicates += 1
        else:
            copied += 1
            try:
                bytes_copied += src.stat().st_size
            except OSError:
                pass
            by_year[year] = by_year.get(year, 0) + 1

        if i % 100 == 0 or i == len(selected):
            print(f"  [{i:>5,}/{len(selected):,}] copied={copied}  dup={duplicates}  miss={missing}",
                  flush=True)

    print()
    print(f"Done. Copied {copied:,} files  ({bytes_copied/(1024*1024):.1f} MB)")
    if duplicates:
        print(f"Skipped {duplicates:,} exact duplicates already in target.")
    if missing:
        print(f"WARNING: {missing:,} source files were missing on disk.")
    if by_year:
        print("By year:")
        for y in sorted(by_year):
            print(f"  {y}: {by_year[y]:,}")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="find_old_invoices.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=__doc__,
    )
    sub = p.add_subparsers(dest="command", required=True)

    ps = sub.add_parser("scan", help="Walk a directory and write a TSV of PDF candidates.")
    ps.add_argument("path", help="Root path to scan (e.g. /Volumes/RAID).")
    ps.add_argument("--out", default=str(Path(__file__).with_name("scan-results.tsv")),
                    help="TSV output path (default: scan-results.tsv next to script).")
    ps.add_argument("--workers", type=int, default=DEFAULT_PROCESSES,
                    help=f"Parallel workers (default: {DEFAULT_PROCESSES}).")
    ps.add_argument("--pages", type=int, default=DEFAULT_PDFTOTEXT_PAGES,
                    help=f"Pages of each PDF to inspect (default: {DEFAULT_PDFTOTEXT_PAGES}).")
    ps.add_argument("--timeout", type=int, default=DEFAULT_PDFTOTEXT_TIMEOUT,
                    help=f"pdftotext timeout per file in seconds (default: {DEFAULT_PDFTOTEXT_TIMEOUT}).")
    ps.add_argument("--max-mb", type=int, default=DEFAULT_MAX_FILE_MB,
                    help=f"Skip PDFs larger than this many MB (default: {DEFAULT_MAX_FILE_MB}).")
    ps.add_argument("--follow-symlinks", action="store_true",
                    help="Follow symlinks while walking (off by default).")
    ps.add_argument("--include-time-machine", action="store_true",
                    help="Do NOT skip Time Machine 'Backups.backupdb' folders.")
    ps.add_argument("--no-resume", dest="resume", action="store_false",
                    help="Re-scan everything even if TSV already lists some paths.")
    ps.set_defaults(resume=True)
    ps.set_defaults(func=cmd_scan)

    pc = sub.add_parser("collect", help="Copy approved PDFs from a scan TSV into one folder.")
    pc.add_argument("tsv", help="Path to a TSV produced by 'scan'.")
    pc.add_argument("--target", default="~/Documents/VOD Rechnungen",
                    help="Target folder for copied PDFs "
                         "(default: ~/Documents/VOD Rechnungen).")
    pc.add_argument("--select", choices=["approved", "matches", "maybes"], default="approved",
                    help="Which rows to copy: 'approved' = column 'approve' is set "
                         "(default); 'matches' = all status=match rows; 'maybes' = match+maybe.")
    pc.add_argument("--min-score", type=int, default=60,
                    help="Min score when using --select matches/maybes (default: 60).")
    pc.add_argument("--dry-run", action="store_true",
                    help="Print what would be copied; don't touch the target folder.")
    pc.set_defaults(func=cmd_collect)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
