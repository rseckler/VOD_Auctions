#!/usr/bin/env python3
"""
mo_pdf_pipeline — D1 MO-PDF-Ingestion-Service.

Quelle:  Monkey Office/Rechnungen/<Jahr>/*.pdf
Target:  crm_staging_transaction + crm_staging_transaction_item +
         crm_staging_contact (mo_pdf-Erscheinungen) + crm_staging_address

Phase 1 Stub: Inventory + Hash-Dedup + pdftotext-Extraction live;
              Layout-Detection + Parser sind TODO (siehe ParserBase).

Verwendung:
    cd VOD_Auctions/scripts
    source venv/bin/activate
    python3 mo_pdf_pipeline.py --root "../Monkey Office/Rechnungen" --sample 100
    python3 mo_pdf_pipeline.py --root "../Monkey Office/Rechnungen" --full

Robin-Constraints (2026-05-03):
  - Kein OCR — nur native PDFs via pdftotext
  - Multi-Vintage (2003-2026), zunächst nur Layout 2019-2026 implementiert
  - Idempotent via source_pdf_hash
"""

from __future__ import annotations

import argparse
import hashlib
import os
import random
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crm_staging_lib import (  # noqa: E402
    pull_run, crm_log_progress, pdf_hash_exists, insert_layout_review,
    upsert_staging_contact, insert_staging_address,
    upsert_staging_transaction, insert_staging_transaction_item,
)
from mo_pdf_lib.parser import parse_invoice as _mo_parse  # noqa: E402

PARSER_VERSION = "v0.2-mo-2019-2026"


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def pdftotext_extract(path: Path) -> str:
    """Extrahiert Roh-Text via pdftotext -layout. Liefert leeren String bei Fehler."""
    try:
        r = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(path), "-"],
            capture_output=True, text=True, timeout=30,
        )
        if r.returncode != 0:
            return ""
        return r.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def process_pdf(conn, run_id: str, path: Path, year_hint: int | None) -> str:
    """Returns: 'inserted' | 'skipped' | 'review' | 'error'."""
    h = file_hash(path)

    if pdf_hash_exists(conn, h):
        return "skipped"

    text = pdftotext_extract(path)
    if not text.strip():
        insert_layout_review(
            conn,
            source_file_path=str(path),
            source_file_hash=h,
            review_reason="parse_error",
            raw_text=None,
        )
        return "review"

    parsed = _mo_parse(text, filename=str(path))
    if parsed is None:
        insert_layout_review(
            conn,
            source_file_path=str(path),
            source_file_hash=h,
            review_reason="unknown_layout",
            raw_text=text[:50000],
        )
        return "review"

    # === Insert into Staging ===
    invoice_no = parsed["invoice_no"]
    customer_no = parsed["customer_no"]
    cust = parsed.get("customer") or {}

    name_line = cust.get("name_line") or ""
    # Heuristik: Firma erkennen wenn Endung GmbH/AG/Ltd/Inc oder ALLCAPS-Mehrwortig
    is_business = bool(
        re.search(r"\b(GmbH|AG|Ltd|Inc|Corp|S\.A\.|S\.r\.l\.|sàrl|S\.L\.|UG)\b", name_line, re.IGNORECASE)
    )
    company = name_line if is_business else None
    # Privatperson: erste 1-2 Wörter = Vorname, Rest = Nachname
    first_name = last_name = None
    if not is_business and name_line:
        toks = name_line.split()
        if len(toks) >= 2:
            first_name = toks[0]
            last_name = " ".join(toks[1:])
        elif toks:
            last_name = toks[0]

    raw_payload_contact = {
        "raw_customer_block": cust.get("raw_customer_block"),
        "contact_person": parsed.get("contact_person"),
        "ab_reference": parsed.get("ab_reference"),
    }

    contact_id = upsert_staging_contact(
        conn,
        pull_run_id=run_id,
        source="mo_pdf",
        source_record_id=customer_no,    # ADR-XXXXXX
        display_name=name_line,
        first_name=first_name,
        last_name=last_name,
        company=company,
        contact_type="business" if is_business else "person",
        primary_email=None,    # MO-PDFs enthalten keine Customer-Emails
        country_code=None,
        raw_payload=raw_payload_contact,
    )

    # Adresse aus PDF (eine pro Customer-PDF — billing)
    insert_staging_address(
        conn,
        staging_contact_id=contact_id,
        source="mo_pdf",
        source_record_id=invoice_no,    # eindeutig pro Rechnung
        type="billing",
        company=company,
        first_name=first_name,
        last_name=last_name,
        street=cust.get("street"),
        postal_code=cust.get("postal_code"),
        city=cust.get("city"),
        region=cust.get("region"),
        country=cust.get("country"),
        is_primary=False,
        raw_address=cust.get("raw_customer_block"),
    )

    # Transaction
    tx_id = upsert_staging_transaction(
        conn,
        pull_run_id=run_id,
        source="mo_pdf",
        source_record_id=invoice_no,
        customer_source="mo_pdf",
        customer_source_record_id=customer_no,
        doc_type=parsed["doc_type"],
        doc_number=invoice_no,
        external_reference=parsed.get("ab_reference"),
        doc_date=parsed["invoice_date"],
        delivery_date=parsed.get("delivery_date"),
        total_gross=parsed.get("total_gross"),
        total_net=parsed.get("total_net"),
        total_tax=parsed.get("total_tax"),
        currency=parsed.get("currency", "EUR"),
        status="paid" if parsed["doc_type"] == "invoice" else None,    # MO-Rechnungen sind als bezahlt zu betrachten
        payment_terms=parsed.get("payment_terms"),
        correction_for_doc_number=parsed.get("correction_for_invoice_no"),
        notes_or_warnings=";".join(parsed.get("extraction_warnings", [])) or None,
        source_pdf_path=str(path),
        source_pdf_hash=h,
        parser_version=PARSER_VERSION,
        raw_payload={"tax_note": parsed.get("tax_note"),
                     "contact_person": parsed.get("contact_person")},
    )

    # Items
    for item in parsed["items"]:
        insert_staging_transaction_item(
            conn,
            transaction_id=tx_id,
            position=item["position"],
            article_no=item.get("article_no"),
            article_name=item.get("article_name") or "(no description)",
            quantity=item.get("quantity") or 1,
            unit_price=item.get("unit_price"),
            vat_rate=item.get("vat_rate"),
            line_total_gross=item.get("line_total_gross"),
            is_shipping=item.get("is_shipping", False),
            raw_line=item.get("raw_line"),
        )

    # Wenn Parse-Warnings: zusätzlich in Layout-Review (Soft-Warning, kein Fail)
    if parsed.get("extraction_warnings"):
        # Nicht in review_queue, nur als notes auf transaction. Schon oben gemacht.
        pass

    return "inserted"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="Root-Ordner mit Jahres-Unterordnern")
    ap.add_argument("--sample", type=int, default=0, help="Nur N zufällige PDFs verarbeiten (für QA-Sample-Run)")
    ap.add_argument("--full", action="store_true", help="Alle PDFs verarbeiten")
    ap.add_argument("--year", type=int, help="Nur dieses Jahr verarbeiten (2003-2026)")
    args = ap.parse_args()

    if not args.full and not args.sample:
        ap.error("--full oder --sample N angeben")

    root = Path(args.root).expanduser().resolve()
    if not root.is_dir():
        ap.error(f"Root-Ordner nicht gefunden: {root}")

    # Inventory
    pdfs: list[tuple[Path, int | None]] = []
    for year_dir in sorted(root.iterdir()):
        if not year_dir.is_dir():
            continue
        try:
            y = int(year_dir.name)
        except ValueError:
            continue
        if args.year and y != args.year:
            continue
        for pdf in sorted(year_dir.glob("*.pdf")):
            pdfs.append((pdf, y))

    if args.sample:
        pdfs = random.sample(pdfs, min(args.sample, len(pdfs)))

    print(f"[d1_mo_pdf] {len(pdfs)} PDFs to process")

    counts = {"inserted": 0, "skipped": 0, "review": 0, "error": 0}

    with pull_run("mo_pdf", "d1_mo_pdf", parser_version=PARSER_VERSION,
                  notes=f"sample={args.sample} full={args.full} year={args.year}") as (run_id, conn):
        for i, (path, y) in enumerate(pdfs, 1):
            try:
                result = process_pdf(conn, run_id, path, y)
                counts[result] += 1
            except Exception as exc:
                counts["error"] += 1
                print(f"  [error] {path.name}: {exc}", flush=True)

            if i % 100 == 0:
                conn.commit()
                crm_log_progress(conn, run_id,
                                 files_total=len(pdfs),
                                 files_ok=counts["inserted"] + counts["skipped"],
                                 files_warning=counts["review"],
                                 files_failed=counts["error"])
                print(f"  [{i}/{len(pdfs)}] {counts}", flush=True)

        conn.commit()
        crm_log_progress(conn, run_id,
                         files_total=len(pdfs),
                         files_ok=counts["inserted"] + counts["skipped"],
                         files_warning=counts["review"],
                         files_failed=counts["error"],
                         rows_inserted=counts["inserted"])

    print(f"[d1_mo_pdf] DONE counts={counts}")


if __name__ == "__main__":
    main()
