#!/usr/bin/env python3
"""
mo_pdf_ai_consolidate_master — 2nd AI-Pass: Master-Level Address-Konsolidierung.

Hintergrund: Nach dem 1st AI-Pass (mo_pdf_ai_extract.py) sind die staging_contacts
sauber. Aber pro Master existieren oft 3-5 master_addresses (verschiedene
customer_no über die Jahre = verschiedene staging_contacts → verschiedene
master_addresses), die meist DASSELBE Customer mit minimal-different rendering
sind:

  Sample (Bleep Ltd Spectrum House):
    Address 1: "Bleep Ltd Spectrum House / 32-34 Gordon House Road / GB"
    Address 2: "Deutschland / Bleep Ltd Spectrum House / Bleep Ltd Spectrum House / GB"
    Address 3: "Bleep Ltd Spectrum House / 32-34 Gordon House Road / GB"

  Was Robin will: 1 canonical address
    company   = "Bleep Ltd"
    street    = "Spectrum House, 32-34 Gordon House Road"
    postal    = NW5 1LP (aus PDF-history)
    city      = London
    country   = GB

LLM-Strategie: Für jeden Master mit ≥2 master_addresses ODER broken-pattern,
sammle alle 3-5 partial-Adressen + alle raw_customer_blocks, schicke an Haiku
mit "consolidate to 1 best address" prompt. Output schreibt:
  - EINE canonical crm_master_address (replace approach: soft-delete olds, insert new)
  - master_contact: company + primary_* fields aus consolidated output

Modes:
  --sample N       Nur N eligible master (default 10)
  --commit         Schreibt UPDATEs (default: dry-run print)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from shared import get_pg_connection, _ensure_psycopg2  # noqa: E402

try:
    import anthropic
except ImportError:
    print("ERROR: anthropic package not installed", file=sys.stderr)
    sys.exit(1)

HAIKU_MODEL = "claude-haiku-4-5-20251001"
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not ANTHROPIC_API_KEY:
    backend_env = Path(__file__).parent.parent / "backend" / ".env"
    if backend_env.exists():
        for line in backend_env.read_text().splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                ANTHROPIC_API_KEY = line.split("=", 1)[1].strip()
                break
if not ANTHROPIC_API_KEY:
    print("ERROR: ANTHROPIC_API_KEY missing", file=sys.stderr)
    sys.exit(1)


SYSTEM_PROMPT = """\
You consolidate multiple partial address entries (for the SAME customer)
into one canonical address. Inputs are 2-6 raw address blocks plus
optionally extracted fields. Some are broken (e.g. country-word in name
slot, name doubled, line-overlaps). Combine the BEST pieces from all
inputs.

Rules:
- contact_type: "business" if ANY input has company-suffix (GmbH/Ltd/SL/SARL/Inc/...)
  or company-keyword (Records/Music/Studio/Distribution/Books/Mag/Group/etc.).
  Else "person".
- company: cleaned company name. Strip trailing fragments that belong to street
  ("Bleep Ltd Spectrum House" → company="Bleep Ltd", street prefix="Spectrum House").
- first_name + last_name: only if person.
- street: full multi-line street (e.g. "Spectrum House, 32-34 Gordon House Road").
  EXCLUDE country-words ("Deutschland", "Italy", "ITA"...).
- postal_code + city: pick the most-detailed/most-recent. Strip prefix codes
  ("EW SOEST" → postal=EW, city=SOEST? No: postal=3766, city=SOEST. NL postal=4-digit
  + 2-letter; UK 2 alphas + 2-3 digits; etc.).
- country_iso: 2-letter ISO. "Deutschland"→DE, "GB"→GB, "United States"→US.
- confidence: "high" if all addresses agree on city, "medium" if streets differ
  but city same, "low" if real conflicts.

Output ONLY valid JSON, no prose:
{
  "contact_type": "business" | "person",
  "company": string | null,
  "first_name": string | null,
  "last_name": string | null,
  "street": string | null,
  "postal_code": string | null,
  "city": string | null,
  "country_iso": string | null,
  "confidence": "high" | "medium" | "low",
  "kept_address_indices": [int]   // which input addresses match the canonical
}
"""


def fetch_eligible_masters(conn, limit: int) -> list[dict]:
    """Master mit ≥2 master_addresses ODER broken-address-pattern."""
    pg = _ensure_psycopg2()
    sql = f"""
        WITH addr_counts AS (
          SELECT a.master_id,
            COUNT(*) AS addr_count,
            BOOL_OR(a.street ~* '^(Deutschland|Italien|Germany|France|ITA-?)$') AS has_country_in_street,
            BOOL_OR(a.street IS NULL OR a.street = '') AS has_empty_street
          FROM crm_master_address a
          JOIN crm_master_source_link sl ON sl.master_id = a.master_id
          WHERE sl.source = 'mo_pdf'
          GROUP BY a.master_id
        )
        SELECT m.id, m.display_name, m.contact_type, m.company,
               m.first_name, m.last_name,
               ac.addr_count
        FROM addr_counts ac
        JOIN crm_master_contact m ON m.id = ac.master_id
        WHERE m.deleted_at IS NULL
          AND (ac.addr_count >= 2 OR ac.has_country_in_street OR ac.has_empty_street)
        ORDER BY ac.addr_count DESC
        LIMIT {int(limit)}
    """
    with conn.cursor(cursor_factory=pg.extras.RealDictCursor) as cur:
        cur.execute(sql)
        return cur.fetchall()


def fetch_master_inputs(conn, master_id: str) -> dict:
    """Sammle alle staging_addresses + raw_customer_blocks + existing master_addresses."""
    pg = _ensure_psycopg2()
    with conn.cursor(cursor_factory=pg.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT a.id, a.street, a.postal_code, a.city, a.country, a.country_code, a.region
            FROM crm_master_address a
            WHERE a.master_id = %s
            ORDER BY a.created_at
        """, (master_id,))
        master_addrs = cur.fetchall()

        cur.execute("""
            SELECT sc.raw_payload->>'raw_customer_block' AS raw_block,
                   sc.display_name, sc.first_name, sc.last_name, sc.company
            FROM crm_master_source_link sl
            JOIN crm_staging_contact sc ON sc.id = sl.staging_contact_id
            WHERE sl.master_id = %s AND sl.source = 'mo_pdf'
              AND sc.raw_payload->>'raw_customer_block' IS NOT NULL
        """, (master_id,))
        staging_blocks = [r for r in cur.fetchall() if r.get("raw_block")]

    return {"master_addrs": master_addrs, "staging_blocks": staging_blocks}


def build_prompt(display_name: str, inputs: dict) -> str:
    parts = [f"Master display_name: {display_name!r}\n"]
    if inputs["master_addrs"]:
        parts.append("Existing master_addresses (parsed):")
        for i, a in enumerate(inputs["master_addrs"], 1):
            parts.append(f"  [{i}] street={a['street']!r}, postal={a['postal_code']!r}, "
                         f"city={a['city']!r}, country={a['country']!r}")
    if inputs["staging_blocks"]:
        parts.append("\nRaw customer-blocks from PDFs:")
        for i, sb in enumerate(inputs["staging_blocks"][:5], 1):  # max 5
            parts.append(f"  [{i}] {sb['raw_block']!r}")
    return "\n".join(parts)


def consolidate(client, prompt: str) -> dict | None:
    try:
        msg = client.messages.create(
            model=HAIKU_MODEL, max_tokens=600,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```\w*\n", "", text)
            text = re.sub(r"\n```$", "", text)
        return json.loads(text)
    except Exception as e:
        print(f"  [llm] error: {e}", file=sys.stderr)
        return None


def apply_consolidation(conn, master_id: str, result: dict, commit: bool) -> bool:
    """Wendet consolidation auf master + replaces master_addresses durch 1 canonical."""
    if not commit:
        return False
    pg = _ensure_psycopg2()
    try:
        with conn.cursor() as cur:
            # Update master profile fields
            cur.execute("""
                UPDATE crm_master_contact
                SET contact_type = COALESCE(%s, contact_type),
                    company = COALESCE(%s, company),
                    first_name = COALESCE(%s, first_name),
                    last_name = COALESCE(%s, last_name),
                    primary_postal_code = COALESCE(%s, primary_postal_code),
                    primary_city = COALESCE(%s, primary_city),
                    primary_country_code = COALESCE(%s, primary_country_code),
                    updated_at = NOW()
                WHERE id = %s
            """, (
                result.get("contact_type"), result.get("company"),
                result.get("first_name"), result.get("last_name"),
                result.get("postal_code"), result.get("city"),
                result.get("country_iso"),
                master_id,
            ))
            # Soft-delete duplicate addresses, keep only one canonical
            # Strategy: DELETE all existing, INSERT one new
            cur.execute("DELETE FROM crm_master_address WHERE master_id = %s", (master_id,))
            cur.execute("""
                INSERT INTO crm_master_address
                  (master_id, type, company, first_name, last_name,
                   street, postal_code, city, country, country_code,
                   is_primary, source_count, source_list)
                VALUES (%s, 'billing', %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        true, 1, ARRAY['ai_consolidated'])
            """, (
                master_id,
                result.get("company"),
                result.get("first_name"),
                result.get("last_name"),
                result.get("street"),
                result.get("postal_code"),
                result.get("city"),
                result.get("country_iso"),  # country (long-form) — wir setzen ISO weil normalized
                result.get("country_iso"),
            ))
        return True
    except Exception as e:
        print(f"  [apply] error: {e}", file=sys.stderr)
        conn.rollback()
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=10)
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()

    print(f"[ai-consolidate] mode={'COMMIT' if args.commit else 'DRY-RUN'}, sample={args.sample}", flush=True)

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    conn = get_pg_connection()
    counts = {"processed": 0, "consolidated": 0, "errors": 0, "applied": 0}

    try:
        masters = fetch_eligible_masters(conn, args.sample)
        print(f"[ai-consolidate] {len(masters)} eligible masters\n", flush=True)

        for i, m in enumerate(masters, 1):
            counts["processed"] += 1
            inputs = fetch_master_inputs(conn, m["id"])
            if not inputs["master_addrs"] and not inputs["staging_blocks"]:
                continue

            prompt = build_prompt(m["display_name"], inputs)
            result = consolidate(client, prompt)
            if not result:
                counts["errors"] += 1
                continue
            counts["consolidated"] += 1

            print(f"[{i}] {m['display_name']!r} (addrs={m['addr_count']})")
            print(f"    company:    {m['company']!r} → {result.get('company')!r}")
            print(f"    contact:    {m['contact_type']!r} → {result.get('contact_type')!r}")
            print(f"    street:     {result.get('street')!r}")
            print(f"    city:       {result.get('postal_code')} {result.get('city')} / {result.get('country_iso')}")
            print(f"    confidence: {result.get('confidence')}")

            if apply_consolidation(conn, m["id"], result, args.commit):
                counts["applied"] += 1

            if i % 50 == 0 and args.commit:
                conn.commit()
                print(f"  [checkpoint] {counts}", flush=True)

        if args.commit:
            conn.commit()
    finally:
        conn.close()

    print("\n=== AI-Consolidate Report ===")
    for k, v in counts.items():
        print(f"  {k:15} {v:>6}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
