#!/usr/bin/env python3
"""
crm_staging_lib — geteilte Helfer für CRM Phase-1-Pipelines.

Konsumenten:
  - mo_pdf_pipeline.py    (Source-Tag: 'mo_pdf')
  - legacy_db_pull.py     (Source-Tags: 'vodtapes_members', 'vod_records_db1', 'vod_records_db2013', ...)
  - imap_indexer.py       (Source-Tags: 'imap_vod_records', 'imap_vinyl_on_demand')

Funktionalität:
  - SUPABASE_DB_URL-Connection (re-uses scripts/shared.py)
  - 1Password-Cred-Resolver (op CLI, R/O Vault Work)
  - Pull-Run-Lifecycle (start/finish/fail mit Audit)
  - Insert-Helpers für staging_contact / _email / _address / _phone / _transaction / _transaction_item / _imap_message

Konventionen:
  - Source-Tag-Whitelist: VALID_SOURCES (siehe unten)
  - Idempotenz: alle Inserts nutzen ON CONFLICT … DO UPDATE
  - Kein pwd-Hash zieht — niemals
  - Roh-Daten in raw_payload jsonb sichern
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from contextlib import contextmanager
from datetime import datetime
from typing import Any

# Re-use bestehende Postgres-Connection aus shared.py
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shared import get_pg_connection  # noqa: E402

# ---------------------------------------------------------------------------
# Source-Tag-Whitelist (hartcodiert — Schema CHECKt nicht, wir validieren in Code)
# ---------------------------------------------------------------------------

VALID_SOURCES = {
    # MO-PDF
    "mo_pdf",
    # Legacy MySQL
    "vodtapes_members",
    "vod_records_db1",
    "vod_records_db11",
    "vod_records_db2013",
    "vod_records_db2013_alt",  # _kunden_alt-Tabelle
    # IMAP
    "imap_vod_records",
    "imap_vinyl_on_demand",
    # Brevo (für Phase 2)
    "tape_mag_brevo_list5",
    "vod_auctions_brevo_list7",
    # Manueller Fall
    "manual",
}

VALID_PIPELINES = {"d1_mo_pdf", "e1_legacy_db", "f1_imap"}


def assert_source(source: str) -> None:
    if source not in VALID_SOURCES:
        raise ValueError(f"Unknown source '{source}' — must be one of {sorted(VALID_SOURCES)}")


# ---------------------------------------------------------------------------
# 1Password-Resolver (R/O Vault Work via Service-Account-Token)
# ---------------------------------------------------------------------------

def op_get(item_id: str, field_label: str) -> str:
    """Hole ein Feld aus einem 1Password-Item via op CLI.

    Voraussetzung: OP_SERVICE_ACCOUNT_TOKEN ist in der Umgebung gesetzt
    (siehe ~/.zshrc oder Memory-Eintrag reference_1password_service_account.md).
    """
    try:
        out = subprocess.run(
            ["op", "item", "get", item_id, "--vault", "Work",
             "--fields", f"label={field_label}", "--reveal"],
            capture_output=True, text=True, check=True, timeout=15,
        )
        value = out.stdout.strip()
        # op manchmal mit Anführungszeichen — strippen
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
        return value
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"1Password lookup failed for {item_id}/{field_label}: {e.stderr}") from e


# ---------------------------------------------------------------------------
# Pull-Run-Lifecycle
# ---------------------------------------------------------------------------

@contextmanager
def pull_run(source: str, pipeline: str, parser_version: str | None = None, notes: str | None = None):
    """Context-Manager: erzeugt eine crm_pull_run-Row, yields run_id,
    schreibt finished_at + status='done' bei Exit oder 'failed' bei Exception.

    Usage:
        with pull_run("mo_pdf", "d1_mo_pdf", parser_version="v1") as (run_id, conn):
            # ... pull logic ...
            crm_log_progress(conn, run_id, files_ok=42)
    """
    assert_source(source)
    if pipeline not in VALID_PIPELINES:
        raise ValueError(f"Unknown pipeline '{pipeline}' — must be one of {sorted(VALID_PIPELINES)}")

    conn = get_pg_connection()
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO crm_pull_run (source, pipeline, parser_version, notes, started_at, status)
        VALUES (%s, %s, %s, %s, NOW(), 'running')
        RETURNING id
        """,
        (source, pipeline, parser_version, notes),
    )
    run_id = cur.fetchone()[0]
    conn.commit()
    print(f"[pull_run] {source}/{pipeline} START run_id={run_id}", flush=True)

    try:
        yield run_id, conn
    except Exception as exc:
        cur.execute(
            "UPDATE crm_pull_run SET finished_at=NOW(), status='failed', error_message=%s WHERE id=%s",
            (str(exc)[:2000], run_id),
        )
        conn.commit()
        print(f"[pull_run] {source}/{pipeline} FAILED run_id={run_id}: {exc}", flush=True)
        raise
    else:
        cur.execute(
            "UPDATE crm_pull_run SET finished_at=NOW(), status='done' WHERE id=%s AND status='running'",
            (run_id,),
        )
        conn.commit()
        print(f"[pull_run] {source}/{pipeline} DONE run_id={run_id}", flush=True)
    finally:
        cur.close()
        conn.close()


def crm_log_progress(conn, run_id: str, **counts) -> None:
    """Inkrementelles Update der Counts auf einer laufenden pull_run.

    Akzeptierte keys: files_total, files_ok, files_warning, files_failed,
                      rows_inserted, rows_updated, rows_skipped, notes
    """
    if not counts:
        return
    setters = ", ".join(f"{k} = %s" for k in counts)
    cur = conn.cursor()
    cur.execute(
        f"UPDATE crm_pull_run SET {setters} WHERE id = %s",
        list(counts.values()) + [run_id],
    )
    conn.commit()
    cur.close()


# ---------------------------------------------------------------------------
# Insert-Helpers (idempotent via ON CONFLICT)
# ---------------------------------------------------------------------------

def upsert_staging_contact(
    conn,
    *,
    pull_run_id: str,
    source: str,
    source_record_id: str,
    display_name: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    company: str | None = None,
    contact_type: str | None = None,    # 'person' | 'business'
    primary_email: str | None = None,    # Roh-Email; lower wird normalisiert
    country_code: str | None = None,
    source_created_at: datetime | None = None,
    source_last_seen_at: datetime | None = None,
    raw_payload: dict[str, Any] | None = None,
) -> str:
    """UPSERT auf (source, source_record_id). Returnt staging_contact.id."""
    assert_source(source)
    cur = conn.cursor()
    primary_email_lower = primary_email.lower().strip() if primary_email else None
    cur.execute(
        """
        INSERT INTO crm_staging_contact (
            pull_run_id, source, source_record_id,
            display_name, first_name, last_name, company, contact_type,
            primary_email_lower, country_code,
            source_created_at, source_last_seen_at,
            raw_payload, pulled_at
        ) VALUES (%s,%s,%s, %s,%s,%s,%s,%s, %s,%s, %s,%s, %s, NOW())
        ON CONFLICT (source, source_record_id) DO UPDATE SET
            pull_run_id = EXCLUDED.pull_run_id,
            display_name = COALESCE(EXCLUDED.display_name, crm_staging_contact.display_name),
            first_name = COALESCE(EXCLUDED.first_name, crm_staging_contact.first_name),
            last_name = COALESCE(EXCLUDED.last_name, crm_staging_contact.last_name),
            company = COALESCE(EXCLUDED.company, crm_staging_contact.company),
            contact_type = COALESCE(EXCLUDED.contact_type, crm_staging_contact.contact_type),
            primary_email_lower = COALESCE(EXCLUDED.primary_email_lower, crm_staging_contact.primary_email_lower),
            country_code = COALESCE(EXCLUDED.country_code, crm_staging_contact.country_code),
            source_created_at = COALESCE(EXCLUDED.source_created_at, crm_staging_contact.source_created_at),
            source_last_seen_at = COALESCE(EXCLUDED.source_last_seen_at, crm_staging_contact.source_last_seen_at),
            raw_payload = COALESCE(EXCLUDED.raw_payload, crm_staging_contact.raw_payload),
            pulled_at = NOW()
        RETURNING id
        """,
        (pull_run_id, source, source_record_id,
         display_name, first_name, last_name, company, contact_type,
         primary_email_lower, country_code,
         source_created_at, source_last_seen_at,
         json.dumps(raw_payload) if raw_payload is not None else None),
    )
    contact_id = cur.fetchone()[0]
    cur.close()
    return contact_id


def insert_staging_email(conn, *, staging_contact_id: str, source: str, email: str,
                         source_record_id: str | None = None,
                         is_primary: bool = False, is_verified: bool = False,
                         confidence: float = 1.0, raw_payload: dict | None = None) -> None:
    """UPSERT auf (staging_contact_id, source, LOWER(TRIM(email)))."""
    assert_source(source)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO crm_staging_email (staging_contact_id, source, source_record_id, email,
                                       is_primary, is_verified, confidence, raw_payload)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (staging_contact_id, source, email_lower) DO UPDATE SET
            is_primary = EXCLUDED.is_primary OR crm_staging_email.is_primary,
            is_verified = EXCLUDED.is_verified OR crm_staging_email.is_verified,
            confidence = GREATEST(EXCLUDED.confidence, crm_staging_email.confidence),
            source_record_id = COALESCE(EXCLUDED.source_record_id, crm_staging_email.source_record_id),
            raw_payload = COALESCE(EXCLUDED.raw_payload, crm_staging_email.raw_payload),
            pulled_at = NOW()
        """,
        (staging_contact_id, source, source_record_id, email,
         is_primary, is_verified, confidence,
         json.dumps(raw_payload) if raw_payload is not None else None),
    )
    cur.close()


def insert_staging_address(conn, *, staging_contact_id: str, source: str,
                           source_record_id: str | None = None,
                           type: str | None = None,
                           salutation: str | None = None, title: str | None = None,
                           company: str | None = None,
                           first_name: str | None = None, last_name: str | None = None,
                           street: str | None = None, street_2: str | None = None,
                           postal_code: str | None = None, city: str | None = None,
                           region: str | None = None, country: str | None = None,
                           country_code: str | None = None,
                           raw_address: str | None = None,
                           valid_from: datetime | None = None, valid_to: datetime | None = None,
                           is_primary: bool = False,
                           raw_payload: dict | None = None) -> None:
    assert_source(source)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO crm_staging_address (
            staging_contact_id, source, source_record_id, type,
            salutation, title, company, first_name, last_name,
            street, street_2, postal_code, city, region, country, country_code,
            raw_address, raw_payload,
            valid_from, valid_to, is_primary
        ) VALUES (%s,%s,%s,%s, %s,%s,%s,%s,%s, %s,%s,%s,%s,%s,%s,%s, %s,%s, %s,%s,%s)
        ON CONFLICT (staging_contact_id, source, source_record_id, type) DO UPDATE SET
            salutation = COALESCE(EXCLUDED.salutation, crm_staging_address.salutation),
            title = COALESCE(EXCLUDED.title, crm_staging_address.title),
            company = COALESCE(EXCLUDED.company, crm_staging_address.company),
            first_name = COALESCE(EXCLUDED.first_name, crm_staging_address.first_name),
            last_name = COALESCE(EXCLUDED.last_name, crm_staging_address.last_name),
            street = COALESCE(EXCLUDED.street, crm_staging_address.street),
            street_2 = COALESCE(EXCLUDED.street_2, crm_staging_address.street_2),
            postal_code = COALESCE(EXCLUDED.postal_code, crm_staging_address.postal_code),
            city = COALESCE(EXCLUDED.city, crm_staging_address.city),
            region = COALESCE(EXCLUDED.region, crm_staging_address.region),
            country = COALESCE(EXCLUDED.country, crm_staging_address.country),
            country_code = COALESCE(EXCLUDED.country_code, crm_staging_address.country_code),
            raw_address = COALESCE(EXCLUDED.raw_address, crm_staging_address.raw_address),
            raw_payload = COALESCE(EXCLUDED.raw_payload, crm_staging_address.raw_payload),
            valid_from = COALESCE(EXCLUDED.valid_from, crm_staging_address.valid_from),
            valid_to = COALESCE(EXCLUDED.valid_to, crm_staging_address.valid_to),
            is_primary = EXCLUDED.is_primary OR crm_staging_address.is_primary,
            pulled_at = NOW()
        """,
        (staging_contact_id, source, source_record_id, type,
         salutation, title, company, first_name, last_name,
         street, street_2, postal_code, city, region, country, country_code,
         raw_address, json.dumps(raw_payload) if raw_payload is not None else None,
         valid_from, valid_to, is_primary),
    )
    cur.close()


def insert_staging_phone(conn, *, staging_contact_id: str, source: str, phone: str,
                         source_record_id: str | None = None,
                         phone_normalized: str | None = None,
                         phone_type: str | None = None,
                         is_primary: bool = False) -> None:
    """UPSERT auf (staging_contact_id, source, phone_raw)."""
    assert_source(source)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO crm_staging_phone (staging_contact_id, source, source_record_id,
                                       phone_raw, phone_normalized, phone_type, is_primary)
        VALUES (%s,%s,%s, %s,%s,%s,%s)
        ON CONFLICT (staging_contact_id, source, phone_raw) DO UPDATE SET
            phone_normalized = COALESCE(EXCLUDED.phone_normalized, crm_staging_phone.phone_normalized),
            phone_type = COALESCE(EXCLUDED.phone_type, crm_staging_phone.phone_type),
            is_primary = EXCLUDED.is_primary OR crm_staging_phone.is_primary,
            pulled_at = NOW()
        """,
        (staging_contact_id, source, source_record_id, phone, phone_normalized, phone_type, is_primary),
    )
    cur.close()


def upsert_staging_transaction(
    conn, *,
    pull_run_id: str, source: str, source_record_id: str,
    customer_source: str, customer_source_record_id: str,
    doc_date,
    doc_type: str = "invoice",
    doc_number: str | None = None,
    external_reference: str | None = None,
    delivery_date=None,
    total_gross=None, total_net=None, total_tax=None, shipping_cost=None,
    currency: str = "EUR",
    status: str | None = None, payment_method: str | None = None, payment_terms: str | None = None,
    package_tracking: str | None = None,
    billing_address_raw: str | None = None, shipping_address_raw: str | None = None,
    source_pdf_path: str | None = None, source_pdf_hash: str | None = None,
    parser_version: str | None = None,
    correction_for_doc_number: str | None = None,
    notes_or_warnings: str | None = None,
    raw_payload: dict | None = None,
) -> str:
    """UPSERT auf (source, source_record_id). Returnt transaction.id."""
    assert_source(source)
    assert_source(customer_source)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO crm_staging_transaction (
            pull_run_id, source, source_record_id,
            customer_source, customer_source_record_id,
            doc_type, doc_number, external_reference,
            doc_date, delivery_date,
            total_gross, total_net, total_tax, shipping_cost, currency,
            status, payment_method, payment_terms, package_tracking,
            billing_address_raw, shipping_address_raw,
            source_pdf_path, source_pdf_hash, parser_version,
            correction_for_doc_number, notes_or_warnings,
            raw_payload, pulled_at
        ) VALUES (%s,%s,%s, %s,%s, %s,%s,%s, %s,%s, %s,%s,%s,%s,%s, %s,%s,%s,%s, %s,%s, %s,%s,%s, %s,%s, %s, NOW())
        ON CONFLICT (source, source_record_id) DO UPDATE SET
            pull_run_id = EXCLUDED.pull_run_id,
            doc_date = EXCLUDED.doc_date,
            total_gross = COALESCE(EXCLUDED.total_gross, crm_staging_transaction.total_gross),
            total_net = COALESCE(EXCLUDED.total_net, crm_staging_transaction.total_net),
            total_tax = COALESCE(EXCLUDED.total_tax, crm_staging_transaction.total_tax),
            shipping_cost = COALESCE(EXCLUDED.shipping_cost, crm_staging_transaction.shipping_cost),
            status = COALESCE(EXCLUDED.status, crm_staging_transaction.status),
            package_tracking = COALESCE(EXCLUDED.package_tracking, crm_staging_transaction.package_tracking),
            billing_address_raw = COALESCE(EXCLUDED.billing_address_raw, crm_staging_transaction.billing_address_raw),
            shipping_address_raw = COALESCE(EXCLUDED.shipping_address_raw, crm_staging_transaction.shipping_address_raw),
            parser_version = COALESCE(EXCLUDED.parser_version, crm_staging_transaction.parser_version),
            notes_or_warnings = COALESCE(EXCLUDED.notes_or_warnings, crm_staging_transaction.notes_or_warnings),
            raw_payload = COALESCE(EXCLUDED.raw_payload, crm_staging_transaction.raw_payload),
            pulled_at = NOW()
        RETURNING id
        """,
        (pull_run_id, source, source_record_id,
         customer_source, customer_source_record_id,
         doc_type, doc_number, external_reference,
         doc_date, delivery_date,
         total_gross, total_net, total_tax, shipping_cost, currency,
         status, payment_method, payment_terms, package_tracking,
         billing_address_raw, shipping_address_raw,
         source_pdf_path, source_pdf_hash, parser_version,
         correction_for_doc_number, notes_or_warnings,
         json.dumps(raw_payload) if raw_payload is not None else None),
    )
    transaction_id = cur.fetchone()[0]
    cur.close()
    return transaction_id


def insert_staging_transaction_item(
    conn, *,
    transaction_id: str, position: int, article_name: str,
    article_no: str | None = None,
    unit: str | None = None,
    quantity: float = 1, unit_price=None, vat_rate=None,
    line_total_gross=None, line_total_net=None,
    is_shipping: bool = False, is_discount: bool = False,
    raw_line: str | None = None, raw_payload: dict | None = None,
    parse_warning: str | None = None,
) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO crm_staging_transaction_item (
            transaction_id, position, article_no, article_name, unit,
            quantity, unit_price, vat_rate, line_total_gross, line_total_net,
            is_shipping, is_discount, raw_line, raw_payload, parse_warning
        ) VALUES (%s,%s,%s,%s,%s, %s,%s,%s,%s,%s, %s,%s,%s,%s,%s)
        ON CONFLICT (transaction_id, position) DO UPDATE SET
            article_no = COALESCE(EXCLUDED.article_no, crm_staging_transaction_item.article_no),
            article_name = EXCLUDED.article_name,
            quantity = EXCLUDED.quantity,
            unit_price = EXCLUDED.unit_price,
            vat_rate = EXCLUDED.vat_rate,
            line_total_gross = EXCLUDED.line_total_gross,
            line_total_net = EXCLUDED.line_total_net,
            raw_line = COALESCE(EXCLUDED.raw_line, crm_staging_transaction_item.raw_line),
            parse_warning = EXCLUDED.parse_warning
        """,
        (transaction_id, position, article_no, article_name, unit,
         quantity, unit_price, vat_rate, line_total_gross, line_total_net,
         is_shipping, is_discount, raw_line,
         json.dumps(raw_payload) if raw_payload is not None else None,
         parse_warning),
    )
    cur.close()


def insert_layout_review(conn, *,
                         source_file_path: str, source_file_hash: str,
                         review_reason: str, raw_text: str | None = None,
                         detected_layout: str | None = None) -> None:
    """Schreibt einen Case in die Layout-Review-Queue (idempotent auf hash)."""
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO crm_layout_review_queue (source, source_file_path, source_file_hash,
                                             detected_layout, review_reason, raw_text)
        VALUES ('mo_pdf', %s, %s, %s, %s, %s)
        ON CONFLICT (source_file_hash) DO NOTHING
        """,
        (source_file_path, source_file_hash, detected_layout, review_reason, raw_text),
    )
    cur.close()


# ---------------------------------------------------------------------------
# Idempotenz-Check (für Skip-if-known)
# ---------------------------------------------------------------------------

def transaction_exists(conn, source: str, source_record_id: str) -> bool:
    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM crm_staging_transaction WHERE source=%s AND source_record_id=%s",
        (source, source_record_id),
    )
    result = cur.fetchone() is not None
    cur.close()
    return result


def pdf_hash_exists(conn, file_hash: str) -> bool:
    """True wenn das PDF schon mal verarbeitet wurde."""
    cur = conn.cursor()
    cur.execute(
        "SELECT 1 FROM crm_staging_transaction WHERE source_pdf_hash=%s",
        (file_hash,),
    )
    result = cur.fetchone() is not None
    cur.close()
    return result
