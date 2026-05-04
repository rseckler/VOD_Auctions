#!/usr/bin/env python3
"""
master_resolver — Phase 2 Cross-Source-Dedup-Engine.

Liest aus crm_staging_*-Tabellen, schreibt nach crm_master_*-Tabellen.

Stages:
  S1 — Email-Match (primary key: lower(email))
  S2 — Adress-Hash-Match für Customer ohne Email (z.B. mo_pdf)
  S3 — Name+PLZ-Fuzzy-Match für Rest (Manual-Review-Queue)
  S4 — IMAP-Email-Anreicherung (separater Step)

Verwendung:
  cd VOD_Auctions/scripts
  source venv/bin/activate
  python3 master_resolver.py --stage 1                # nur Stage 1
  python3 master_resolver.py --stage all              # 1 + 2 + 3
  python3 master_resolver.py --stage 1 --dry-run      # ohne Schreiben

Idempotent: kann beliebig oft re-runned werden (UNIQUE auf source_link).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shared import get_pg_connection  # noqa: E402

ALGORITHM_VERSION = "v0.1-email-address"


# ---------------------------------------------------------------------------
# Run-Lifecycle
# ---------------------------------------------------------------------------

def start_run(conn, version: str, notes: str | None = None) -> str:
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO crm_master_resolver_run (algorithm_version, notes, status)
        VALUES (%s, %s, 'running')
        RETURNING id
        """,
        (version, notes),
    )
    run_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    return run_id


def finish_run(conn, run_id: str, **counts) -> None:
    cur = conn.cursor()
    if counts:
        setters = ", ".join(f"{k} = %s" for k in counts)
        cur.execute(
            f"UPDATE crm_master_resolver_run SET finished_at=NOW(), status='done', {setters} WHERE id=%s",
            list(counts.values()) + [run_id],
        )
    else:
        cur.execute(
            "UPDATE crm_master_resolver_run SET finished_at=NOW(), status='done' WHERE id=%s",
            (run_id,),
        )
    conn.commit()
    cur.close()


def fail_run(conn, run_id: str, err: str) -> None:
    cur = conn.cursor()
    cur.execute(
        "UPDATE crm_master_resolver_run SET finished_at=NOW(), status='failed', error_message=%s WHERE id=%s",
        (err[:2000], run_id),
    )
    conn.commit()
    cur.close()


# ---------------------------------------------------------------------------
# Stage 1: Email-Match
# ---------------------------------------------------------------------------

def stage1_email_match(conn, run_id: str, dry_run: bool = False) -> dict:
    """Cluster all staging-contacts by primary_email_lower, create master per cluster."""
    cur = conn.cursor()

    # Alle staging-contacts mit Email-Mapping holen — eine Row pro contact
    cur.execute("""
        SELECT c.id AS staging_id, c.source, c.source_record_id,
               c.display_name, c.first_name, c.last_name, c.company, c.contact_type,
               c.primary_email_lower, c.country_code,
               c.source_created_at, c.source_last_seen_at
        FROM crm_staging_contact c
        WHERE c.primary_email_lower IS NOT NULL AND c.primary_email_lower <> ''
    """)
    staging_rows = cur.fetchall()
    print(f"  Stage 1: {len(staging_rows)} staging-contacts mit Email", flush=True)

    # Clustering by email_lower
    by_email: dict[str, list[tuple]] = defaultdict(list)
    for row in staging_rows:
        by_email[row[8]].append(row)

    print(f"  Stage 1: {len(by_email)} unique Emails → master_contacts", flush=True)

    masters_created = 0
    masters_existing = 0
    source_links_created = 0

    for email, rows in by_email.items():
        # Master-Existenz check (idempotent re-run)
        cur.execute(
            "SELECT id FROM crm_master_contact WHERE primary_email_lower = %s",
            (email,),
        )
        ex = cur.fetchone()

        if ex:
            master_id = ex[0]
            masters_existing += 1
        else:
            # Repräsentativer Datensatz aus Cluster wählen (= reichste Source)
            # Source-Priorität für display_name/first_name/last_name etc.:
            #   vod_records_db2013 > vod_records_db1 > vodtapes_members > vod_records_db2013_alt > mo_pdf
            priority = {
                "vod_records_db2013": 5,
                "vod_records_db1": 4,
                "vodtapes_members": 3,
                "vod_records_db2013_alt": 2,
                "mo_pdf": 1,
            }
            best = max(rows, key=lambda r: priority.get(r[1], 0))
            display_name = best[3] or email
            first_name = best[4]
            last_name = best[5]
            company = best[6]
            contact_type = best[7]
            country_code = best[9]

            # source_created_at über alle Rows: minimum (= erste Erscheinung)
            created_dts = [r[10] for r in rows if r[10] is not None]
            first_seen = min(created_dts) if created_dts else None
            last_dts = [r[11] for r in rows if r[11] is not None]
            last_seen = max(last_dts) if last_dts else None

            if dry_run:
                masters_created += 1
                continue

            cur.execute(
                """
                INSERT INTO crm_master_contact (
                    display_name, contact_type,
                    primary_email, primary_email_lower,
                    primary_country_code,
                    first_seen_at, last_seen_at,
                    manual_review_status
                ) VALUES (%s,%s, %s,%s, %s, %s,%s, 'auto')
                RETURNING id
                """,
                (display_name, contact_type,
                 email, email,
                 country_code,
                 first_seen, last_seen),
            )
            master_id = cur.fetchone()[0]
            masters_created += 1

        if dry_run:
            continue

        # Source-Links für jede staging-contact in diesem Cluster
        sources_in_cluster = []
        for r in rows:
            staging_id, source, source_record_id = r[0], r[1], r[2]
            try:
                cur.execute(
                    """
                    INSERT INTO crm_master_source_link
                        (master_id, source, source_record_id, staging_contact_id,
                         match_method, match_confidence)
                    VALUES (%s,%s,%s,%s,'email',1.0)
                    ON CONFLICT (source, source_record_id) DO NOTHING
                    """,
                    (master_id, source, source_record_id, staging_id),
                )
                if cur.rowcount > 0:
                    source_links_created += 1
                    sources_in_cluster.append(source)
            except Exception as e:
                print(f"    [stage1] source_link fail for ({source},{source_record_id}): {e}", flush=True)

        # Master-Email einfügen (UNIQUE auf master_id+email_lower)
        cur.execute(
            """
            INSERT INTO crm_master_email (master_id, email, is_primary, source_count, source_list)
            VALUES (%s, %s, true, %s, %s)
            ON CONFLICT (master_id, email_lower) DO UPDATE SET
                source_count = GREATEST(crm_master_email.source_count, EXCLUDED.source_count),
                source_list = (
                    SELECT array_agg(DISTINCT s)
                    FROM unnest(crm_master_email.source_list || EXCLUDED.source_list) AS s
                )
            """,
            (master_id, email, len({r[1] for r in rows}),
             list({r[1] for r in rows})),
        )

        if masters_created % 1000 == 0 and masters_created > 0:
            conn.commit()
            print(f"    [stage1] {masters_created} masters created, {masters_existing} existing", flush=True)

    if not dry_run:
        conn.commit()
    cur.close()

    return {
        "stage1_email_matches": source_links_created,
        "masters_created": masters_created,
        "masters_existing": masters_existing,
        "source_links_created": source_links_created,
    }


# ---------------------------------------------------------------------------
# Stage 1b: Address + Phone für Email-gematchte Master-Contacts hinzufügen
# ---------------------------------------------------------------------------

def stage1b_attach_addresses_and_phones(conn, run_id: str) -> dict:
    """Nach Stage 1: jeder Master-Contact bekommt seine Adressen + Phones aus den
    verlinkten Staging-Contacts, dedupliziert via address_hash."""
    cur = conn.cursor()

    # Adressen: alle staging_addresses, die zu einem source_link gehören
    cur.execute("""
        WITH addr_per_master AS (
            SELECT
                sl.master_id,
                a.type, a.salutation, a.title, a.company,
                a.first_name, a.last_name,
                a.street, a.street_2, a.postal_code, a.city, a.region,
                a.country, a.country_code,
                a.is_primary,
                LOWER(REGEXP_REPLACE(
                    COALESCE(a.street,'') || '|' || COALESCE(a.postal_code,'') || '|' ||
                    COALESCE(a.city,'') || '|' || COALESCE(a.country,''),
                    '\s+', '', 'g'
                )) AS addr_hash,
                a.source
            FROM crm_master_source_link sl
            JOIN crm_staging_address a ON a.staging_contact_id = sl.staging_contact_id
        )
        INSERT INTO crm_master_address (
            master_id, type, salutation, title, company,
            first_name, last_name, street, street_2, postal_code, city, region,
            country, country_code, is_primary, source_count, source_list
        )
        SELECT
            master_id, type, salutation, title, company,
            first_name, last_name, street, street_2, postal_code, city, region,
            country, country_code,
            BOOL_OR(is_primary) AS is_primary,
            COUNT(DISTINCT source) AS source_count,
            array_agg(DISTINCT source) AS source_list
        FROM addr_per_master
        WHERE addr_hash <> '|||'  -- skip leere Adressen
        GROUP BY master_id, type, salutation, title, company,
                 first_name, last_name, street, street_2, postal_code, city, region,
                 country, country_code, addr_hash
        ON CONFLICT DO NOTHING
    """)
    addresses = cur.rowcount
    conn.commit()

    # Phones
    cur.execute("""
        INSERT INTO crm_master_phone (master_id, phone_raw, phone_normalized, phone_type, is_primary, source_count, source_list)
        SELECT
            sl.master_id,
            p.phone_raw,
            MAX(p.phone_normalized) AS phone_normalized,
            MAX(p.phone_type) AS phone_type,
            BOOL_OR(p.is_primary) AS is_primary,
            COUNT(DISTINCT p.source) AS source_count,
            array_agg(DISTINCT p.source) AS source_list
        FROM crm_master_source_link sl
        JOIN crm_staging_phone p ON p.staging_contact_id = sl.staging_contact_id
        GROUP BY sl.master_id, p.phone_raw
        ON CONFLICT (master_id, phone_raw) DO NOTHING
    """)
    phones = cur.rowcount
    conn.commit()

    # Convenience-Felder im master_contact aktualisieren (primary_postal_code etc.)
    cur.execute("""
        UPDATE crm_master_contact m SET
            primary_postal_code = sub.postal_code,
            primary_city = sub.city,
            primary_country_code = COALESCE(m.primary_country_code, sub.country_code)
        FROM (
            SELECT DISTINCT ON (master_id)
                master_id, postal_code, city, country_code
            FROM crm_master_address
            WHERE postal_code IS NOT NULL
            ORDER BY master_id, is_primary DESC, source_count DESC
        ) sub
        WHERE m.id = sub.master_id
          AND (m.primary_postal_code IS NULL OR m.primary_city IS NULL)
    """)
    primary_attrs_updated = cur.rowcount
    conn.commit()
    cur.close()

    print(f"    [stage1b] {addresses} addresses + {phones} phones attached, "
          f"{primary_attrs_updated} primary attrs updated", flush=True)
    return {"addresses": addresses, "phones": phones, "primary_attrs": primary_attrs_updated}


# ---------------------------------------------------------------------------
# Stage 2: Adress-Hash-Match für mo_pdf-Customers
# ---------------------------------------------------------------------------

def _addr_hash(street: str | None, postal_code: str | None, city: str | None, country: str | None) -> str:
    """Address-Hash für Match-Lookup — MUSS exact die DB-Generation-Expression
    auf crm_master_address.address_hash matchen, sonst 0 matches.

    DB-Formula nach Migration 2026-05-04 (no country):
        lower(regexp_replace(
          COALESCE(street,'') || '|' || COALESCE(postal_code,'') || '|' || COALESCE(city,''),
          '\\s+', '', 'g'))

    country wird IGNORIERT (Bug aus rc53.0: existing data hatte country mal
    NULL, mal volles Label 'Finnland', mal ISO-2; parser_v0/v_minus1 normalisierten
    auf ISO-2 → drei Wege zur Hash-Inkonsistenz). street+plz+city ist
    diskriminierend genug.
    """
    parts = [street or "", postal_code or "", city or ""]
    s = "|".join(parts)
    return re.sub(r"\s+", "", s.lower())


def stage2_address_match(conn, run_id: str, dry_run: bool = False) -> dict:
    """mo_pdf-Customers ohne source_link: per address_hash mit existing master_address matchen."""
    cur = conn.cursor()

    # mo_pdf-Customers, die noch keinen source_link haben
    cur.execute("""
        SELECT c.id, c.source_record_id, c.display_name, c.first_name, c.last_name, c.company, c.contact_type,
               a.street, a.postal_code, a.city, a.country, a.country_code, a.region, a.salutation, a.title
        FROM crm_staging_contact c
        LEFT JOIN crm_master_source_link sl ON sl.source = c.source AND sl.source_record_id = c.source_record_id
        LEFT JOIN crm_staging_address a ON a.staging_contact_id = c.id
        WHERE c.source = 'mo_pdf' AND sl.id IS NULL
    """)
    rows = cur.fetchall()
    print(f"  Stage 2: {len(rows)} mo_pdf-Customers ohne match", flush=True)

    matched = created = 0

    for row in rows:
        (staging_id, src_rec_id, display_name, first_name, last_name, company, contact_type,
         street, postal_code, city, country, country_code, region, salutation, title) = row

        # Address-Hash
        ahash = _addr_hash(street, postal_code, city, country)
        master_id = None

        if ahash and ahash != "|||":
            cur.execute(
                "SELECT master_id FROM crm_master_address WHERE address_hash = %s LIMIT 1",
                (ahash,),
            )
            r = cur.fetchone()
            if r:
                master_id = r[0]

        if dry_run:
            if master_id:
                matched += 1
            else:
                created += 1
            continue

        if master_id:
            # Bekannten Master gefunden
            confidence = 0.85
            cur.execute(
                """
                INSERT INTO crm_master_source_link
                    (master_id, source, source_record_id, staging_contact_id,
                     match_method, match_confidence, match_evidence)
                VALUES (%s, 'mo_pdf', %s, %s, 'address_hash', %s, %s)
                ON CONFLICT (source, source_record_id) DO NOTHING
                """,
                (master_id, src_rec_id, staging_id, confidence,
                 json.dumps({"address_hash": ahash})),
            )
            matched += 1
            # Existing-Master mit mo_pdf-Tag erweitern (z.B. fehlt company)
            if company and contact_type == "business":
                cur.execute(
                    """
                    UPDATE crm_master_contact
                    SET contact_type = COALESCE(contact_type, 'business')
                    WHERE id = %s AND contact_type IS NULL
                    """,
                    (master_id,),
                )
        else:
            # Neuer Master ausschließlich aus mo_pdf — Profile-Felder direkt aus
            # staging_contact übernehmen (Bug-Fix 2026-05-04: vorher nur display_name
            # + country/plz/city, first_name/last_name/company blieben NULL).
            # acquisition_date initial = today (per Trigger / sql-default), wird beim
            # nightly-recalc auf min(staging_transaction.doc_date) korrigiert.
            cur.execute(
                """
                INSERT INTO crm_master_contact (
                    display_name, first_name, last_name, company, salutation, title,
                    contact_type,
                    primary_country_code, primary_postal_code, primary_city,
                    manual_review_status, acquisition_channel, acquisition_date
                ) VALUES (%s,%s,%s,%s,%s,%s, %s, %s,%s,%s, 'auto', 'mo_pdf_legacy', CURRENT_DATE)
                RETURNING id
                """,
                (display_name or src_rec_id, first_name, last_name, company, salutation, title,
                 contact_type or "person",
                 country_code, postal_code, city),
            )
            master_id = cur.fetchone()[0]

            cur.execute(
                """
                INSERT INTO crm_master_source_link
                    (master_id, source, source_record_id, staging_contact_id,
                     match_method, match_confidence, match_evidence)
                VALUES (%s, 'mo_pdf', %s, %s, 'seed', 1.0, %s)
                ON CONFLICT (source, source_record_id) DO NOTHING
                """,
                (master_id, src_rec_id, staging_id,
                 json.dumps({"reason": "no_match_new_master"})),
            )
            # Adresse für den neuen Master
            if ahash and ahash != "|||":
                cur.execute(
                    """
                    INSERT INTO crm_master_address (
                        master_id, type, salutation, title, company,
                        first_name, last_name, street, postal_code, city, region,
                        country, country_code, is_primary, source_count, source_list
                    ) VALUES (%s,'billing', %s,%s,%s, %s,%s, %s,%s,%s,%s, %s,%s, true, 1, ARRAY['mo_pdf'])
                    """,
                    (master_id, salutation, title, company,
                     first_name, last_name, street, postal_code, city, region,
                     country, country_code),
                )
            created += 1

        if (matched + created) % 500 == 0:
            conn.commit()
            print(f"    [stage2] matched={matched}, created={created}", flush=True)

    if not dry_run:
        conn.commit()
    cur.close()

    print(f"    [stage2] DONE: matched={matched} (existing master), created={created} (new master)", flush=True)
    return {"stage2_address_matches": matched, "stage2_new_masters": created}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["1", "1b", "2", "all"], default="all")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = get_pg_connection()
    conn.autocommit = False

    run_id = start_run(conn, ALGORITHM_VERSION,
                       notes=f"stage={args.stage} dry_run={args.dry_run}")
    print(f"[master_resolver] run_id={run_id} version={ALGORITHM_VERSION} stage={args.stage}", flush=True)

    counts = {}
    try:
        if args.stage in ("1", "all"):
            counts.update(stage1_email_match(conn, run_id, dry_run=args.dry_run))
        if args.stage in ("1b", "all") and not args.dry_run:
            counts.update(stage1b_attach_addresses_and_phones(conn, run_id))
        if args.stage in ("2", "all"):
            counts.update(stage2_address_match(conn, run_id, dry_run=args.dry_run))

        if not args.dry_run:
            finish_run(conn, run_id,
                       stage1_email_matches=counts.get("source_links_created"),
                       stage2_address_matches=counts.get("stage2_address_matches"),
                       total_master_contacts_created=counts.get("masters_created", 0) + counts.get("stage2_new_masters", 0),
                       total_master_contacts_existing=counts.get("masters_existing", 0),
                       total_source_links_created=counts.get("source_links_created"))
    except Exception as e:
        fail_run(conn, run_id, str(e))
        raise
    finally:
        conn.close()

    print(f"\n[master_resolver] DONE counts={counts}", flush=True)


if __name__ == "__main__":
    main()
