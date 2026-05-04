#!/usr/bin/env python3
"""
mo_pdf_ai_extract — AI-Fuzzy-Extract für problematische staging_contacts.

Hintergrund: Der regex-basierte parser_v0/v_minus1 versagt bei mehrspaltigem
pdftotext-Layout — Customer-Block und Lieferanschrift werden falsch
auseinander gesplittet (z.B. "Esplendor Herrn / Esplendor Music SL / 28013
Madrid / ES" wird als person="Esplendor Herrn" + street="Esplendor Music SL"
geparst statt company="Esplendor Music SL"). Plus 40+ Doppel-Master pro
Firma weil display_name + city minimal variieren.

Diese Pipeline lädt für jede problematische staging_contact-Row den
raw_customer_block aus raw_payload und ruft Claude Haiku 4.5 mit einem
JSON-Schema-Prompt um die Felder sauber zu extrahieren.

DSGVO: Anthropic Haiku 4.5 (EU/US Data Residency, AVV vorhanden via VOD)
— korrekt für Customer-PII. MiniMax wäre billiger, ist aber laut DSGVO-Regel
NICHT für Customer-Daten zugelassen.

Trigger-Filter (Eligibility):
  1. display_name endet auf Firmen-Suffix (Ltd|GmbH|AG|Inc|SL|...) aber
     contact_type='person' oder company IS NULL
  2. street enthält Land-Token ("Deutschland", "ITALIEN", "Germany"...)
  3. display_name = "Herrn"/"Frau" alone (anrede statt name)
  4. street = "(no street)" oder NULL aber raw_block hat Inhalt

Modes:
  --sample N            Nur N random eligible staging_contacts durchgehen,
                        print Vergleich (regex vs LLM), kein DB-write
  --commit              UPDATE crm_staging_contact + crm_staging_address mit
                        LLM-Output, original-regex-Werte werden in
                        raw_payload.regex_original aufgehoben
  --filter-mode <n>     Nur Filter n verarbeiten (1=company-suffix, 2=street-country,
                        3=anrede-only, 4=empty-street). Default: alle
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
    print("ERROR: anthropic package not installed. Run: pip install anthropic", file=sys.stderr)
    sys.exit(1)


HAIKU_MODEL = "claude-haiku-4-5-20251001"  # Haiku 4.5 — pinned per CLAUDE.md
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

if not ANTHROPIC_API_KEY:
    # Fallback: try loading from backend/.env if scripts/.env didn't have it
    backend_env = Path(__file__).parent.parent / "backend" / ".env"
    if backend_env.exists():
        for line in backend_env.read_text().splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                ANTHROPIC_API_KEY = line.split("=", 1)[1].strip()
                break

if not ANTHROPIC_API_KEY:
    print("ERROR: ANTHROPIC_API_KEY not set", file=sys.stderr)
    sys.exit(1)


SYSTEM_PROMPT = """\
You are a strict structured-data extractor for German invoice customer-blocks.
Input is a raw text block from a PDF customer/billing area, possibly with
column-layout artifacts. Extract the customer's profile fields and return
ONLY a JSON object — no prose, no markdown.

Rules:
- contact_type: "business" if name contains GmbH/AG/Ltd/SL/SARL/S.r.l./Inc/Corp/UG
  or has explicit company structure. Else "person".
- company: company name if business, else null.
- first_name + last_name: only if person. Split European names correctly:
  "van Dam" / "de la Cruz" → last_name keeps the particle.
- salutation: "Herr" / "Frau" / "Herrn" / null. Strip from first_name if present.
- street: postal address line(s). Concatenate multi-line street. Exclude
  country-words like "Deutschland", "ITALIEN", "ITA-".
- postal_code + city: from PLZ-line. Strip "EW", "AB" etc. UK/NL formats OK
  (e.g. "M1 7HG", "2662CA").
- country_iso: 2-letter ISO code if recognizable (DE/AT/CH/IT/FR/ES/NL/GB/US/JP/...),
  else null. "Deutschland"→DE, "ITALIEN"→IT, "OES"→AT, "UK"→GB.
- If a token clearly belongs to a different field (e.g. "Esplendor Herrn"
  followed by "Esplendor Music SL" → "Herrn" is salutation, NOT part of name;
  company is "Esplendor Music SL"), correct it.

Output schema (strict):
{
  "contact_type": "business" | "person",
  "company": string | null,
  "first_name": string | null,
  "last_name": string | null,
  "salutation": string | null,
  "street": string | null,
  "postal_code": string | null,
  "city": string | null,
  "country_iso": string | null,
  "confidence": "high" | "medium" | "low"
}
"""


def build_eligible_query(filter_mode: int | None, limit: int) -> str:
    """SQL für eligible staging_contacts."""
    where_clauses = []

    # Filter 1: company-suffix in display_name aber not detected as business
    f1 = """
        (sc.display_name ~* '\\b(Ltd|GmbH|AG|Inc|Corp|S\\.A\\.|S\\.r\\.l\\.|sàrl|S\\.L\\.|UG|BV|SARL|SAS)\\b'
         AND (sc.company IS NULL OR sc.contact_type != 'business'))
    """

    # Filter 2: street contains country-word
    f2 = """
        EXISTS (SELECT 1 FROM crm_staging_address sa
          WHERE sa.staging_contact_id = sc.id
            AND sa.street ~* '^(Deutschland|Italien|Germany|France|Spain|Italy|Netherlands|UK|United Kingdom|Schweiz|Austria|Belgien|Polen|Finland|Sweden|ITA-?|DE-?|FR-?|ES-?|NL-?|UK-?|CH-?|AT-?)$')
    """

    # Filter 3: display_name is just an anrede
    f3 = """
        sc.display_name ~* '^(Herr|Frau|Herrn|Mr\\.|Mrs\\.|Ms\\.)\\s*$'
    """

    # Filter 4: street is empty/missing but raw_block has content
    f4 = """
        EXISTS (SELECT 1 FROM crm_staging_address sa
          WHERE sa.staging_contact_id = sc.id
            AND (sa.street IS NULL OR sa.street = '' OR sa.street ~* '^\\(no'))
        AND sc.raw_payload->>'raw_customer_block' IS NOT NULL
        AND length(sc.raw_payload->>'raw_customer_block') > 20
    """

    # Filter 5: street looks like person-name (firstname lastname, no digit) —
    # Lieferanschrift-Overlap-Bug: parser hat name als street verwendet
    f5 = """
        EXISTS (SELECT 1 FROM crm_staging_address sa
          WHERE sa.staging_contact_id = sc.id
            AND sa.street IS NOT NULL
            AND sa.street ~* '^[A-Z][a-z]+ [A-Z][a-z]+'
            AND sa.street !~* '\\d')
    """

    if filter_mode == 1:
        where_clauses.append(f1)
    elif filter_mode == 2:
        where_clauses.append(f2)
    elif filter_mode == 3:
        where_clauses.append(f3)
    elif filter_mode == 4:
        where_clauses.append(f4)
    elif filter_mode == 5:
        where_clauses.append(f5)
    else:
        where_clauses.append(f"({f1} OR {f2} OR {f3} OR {f4} OR {f5})")

    return f"""
        SELECT sc.id, sc.display_name, sc.first_name, sc.last_name, sc.company,
               sc.contact_type,
               sc.raw_payload->>'raw_customer_block' AS raw_block,
               sa.id AS address_id, sa.street, sa.postal_code, sa.city,
               sa.country, sa.country_code
        FROM crm_staging_contact sc
        LEFT JOIN crm_staging_address sa ON sa.staging_contact_id = sc.id
        WHERE sc.source = 'mo_pdf'
          AND sc.raw_payload->>'raw_customer_block' IS NOT NULL
          AND ({' OR '.join(where_clauses)})
        ORDER BY random()
        LIMIT {int(limit)}
    """


def extract_with_haiku(client: "anthropic.Anthropic", raw_block: str) -> dict | None:
    """Single LLM-call. Returns parsed JSON dict or None on failure."""
    try:
        msg = client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=400,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Customer block:\n```\n{raw_block}\n```"}],
        )
        text = msg.content[0].text.strip()
        # Strip ```json fences if Haiku adds them anyway
        if text.startswith("```"):
            text = re.sub(r"^```\w*\n", "", text)
            text = re.sub(r"\n```$", "", text)
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(f"  [llm] JSON parse fail: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  [llm] error: {e}", file=sys.stderr)
        return None


def diff_fields(orig: dict, new: dict) -> list[str]:
    """Liste der Felder wo new vs orig sich unterscheiden."""
    keys = ["contact_type", "company", "first_name", "last_name",
            "street", "postal_code", "city", "country"]
    out = []
    for k in keys:
        # In orig haben wir country (text), in new haben wir country_iso
        if k == "country":
            o = (orig.get("country") or "").strip()
            n = (new.get("country_iso") or "").strip()
        else:
            o = (orig.get(k) or "").strip()
            n = (new.get(k) or "").strip()
        if o.lower() != n.lower():
            out.append(f"{k}: '{o}' → '{n}'")
    return out


def run_sample(conn, client, limit: int, filter_mode: int | None, commit: bool) -> dict:
    pg = _ensure_psycopg2()
    counts = {"processed": 0, "improved": 0, "no_change": 0, "errors": 0,
              "updates_written": 0}

    with conn.cursor(cursor_factory=pg.extras.RealDictCursor) as cur:
        sql = build_eligible_query(filter_mode, limit)
        cur.execute(sql)
        rows = cur.fetchall()

    print(f"[ai-extract] {len(rows)} eligible staging_contacts", flush=True)

    for i, row in enumerate(rows, 1):
        counts["processed"] += 1
        raw = row["raw_block"]
        if not raw or len(raw) < 10:
            continue

        new = extract_with_haiku(client, raw)
        if not new:
            counts["errors"] += 1
            continue

        # Original-Werte aus row
        orig = {
            "contact_type": row["contact_type"],
            "company": row["company"],
            "first_name": row["first_name"],
            "last_name": row["last_name"],
            "street": row["street"],
            "postal_code": row["postal_code"],
            "city": row["city"],
            "country": row["country"],
        }

        diffs = diff_fields(orig, new)
        if diffs:
            counts["improved"] += 1
            print(f"\n[{i}] {row['display_name']!r}")
            print(f"    raw_block: {raw[:200].replace(chr(10), ' | ')!r}")
            for d in diffs:
                print(f"    Δ {d}")
            print(f"    confidence: {new.get('confidence')}")

            if commit:
                # Update staging_contact + staging_address
                with conn.cursor() as cur2:
                    # Audit: original-regex-Werte in raw_payload sichern
                    cur2.execute(
                        """
                        UPDATE crm_staging_contact SET
                          contact_type = %s,
                          company = %s,
                          first_name = %s,
                          last_name = %s,
                          raw_payload = COALESCE(raw_payload, '{}'::jsonb) ||
                                        jsonb_build_object(
                                          'ai_extracted_at', now()::text,
                                          'ai_model', %s,
                                          'ai_confidence', %s,
                                          'regex_original', jsonb_build_object(
                                            'contact_type', %s,
                                            'company', %s,
                                            'first_name', %s,
                                            'last_name', %s,
                                            'salutation', %s
                                          )
                                        )
                        WHERE id = %s
                        """,
                        (new.get("contact_type") or row["contact_type"],
                         new.get("company"),
                         new.get("first_name"),
                         new.get("last_name"),
                         HAIKU_MODEL, new.get("confidence"),
                         row["contact_type"], row["company"],
                         row["first_name"], row["last_name"], None,
                         row["id"]),
                    )
                    if row.get("address_id"):
                        cur2.execute(
                            """
                            UPDATE crm_staging_address SET
                              street = COALESCE(%s, street),
                              postal_code = COALESCE(%s, postal_code),
                              city = COALESCE(%s, city),
                              country = COALESCE(%s, country),
                              country_code = COALESCE(%s, country_code)
                            WHERE id = %s
                            """,
                            (new.get("street"), new.get("postal_code"),
                             new.get("city"), new.get("country_iso"),
                             new.get("country_iso"), row["address_id"]),
                        )
                    counts["updates_written"] += 1
                if i % 50 == 0:
                    conn.commit()
                    print(f"  [checkpoint] {counts}", flush=True)
        else:
            counts["no_change"] += 1

        # Light rate-limit (Anthropic Tier-1: 50 req/min) — 100 req fits in ~2min
        if i % 50 == 0:
            time.sleep(1)

    if commit:
        conn.commit()

    return counts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=20, help="Anzahl eligible staging_contacts (default 20)")
    ap.add_argument("--commit", action="store_true", help="UPDATEs in DB (default: dry-run)")
    ap.add_argument("--filter-mode", type=int, choices=[1, 2, 3, 4], default=None,
                    help="Nur Filter N (1=company-suffix, 2=street-country, 3=anrede, 4=empty-street)")
    args = ap.parse_args()

    print(f"[ai-extract] mode={'COMMIT' if args.commit else 'DRY-RUN'}, "
          f"sample={args.sample}, filter_mode={args.filter_mode}", flush=True)

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    conn = get_pg_connection()
    try:
        counts = run_sample(conn, client, args.sample, args.filter_mode, args.commit)
    finally:
        conn.close()

    print("\n=== AI-Extract Report ===")
    for k, v in counts.items():
        print(f"  {k:20} {v:>6}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
