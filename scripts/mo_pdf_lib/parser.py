"""MO-Invoice-Parser — multi-layout dispatcher.

Eingabe: pdftotext -layout Output (str).
Ausgabe: dict mit invoice-, customer-, items-, totals-Daten oder None bei Parse-Failure.

Supported layouts:
  - mo-2019-2026  (VOD-Records • Alpenstrasse 25/1, RG-YYYY-NNNNNN, ADR-XXXXXX)
  - mo-2010-2018  (Vinyl on Demand, Alpenstrasse 25/1, RE-YYYYMM/NNNNN, num-CustNr)
"""

from __future__ import annotations

import re
from typing import Any

from .regex_patterns import (
    RE_INVOICE_NO, RE_CUSTOMER_NO, RE_INVOICE_DATE, RE_DELIVERY_DATE,
    RE_CONTACT_PERSON, RE_AB_REFERENCE, RE_KR_REFERENCE,
    RE_TOTAL_GROSS, RE_TOTAL_TAX, RE_TOTAL_NET,
    RE_TAX_FREE_EXPORT, RE_TAX_FREE_EU, RE_TAX_NOTE_INLINE,
    RE_PAYMENT_TERMS_DEFAULT,
    RE_POSITION_LINE, RE_POSITION_HEADER, RE_VOD_HEADER,
    RE_ARTICLE_PARTS, SHIPPING_KEYWORDS,
    parse_de_amount, parse_de_date,
)
from .parser_v0 import detect_v0, parse_invoice_v0
from .parser_v_minus1 import detect_v_minus1, parse_invoice_v_minus1


def detect_layout(text: str) -> str | None:
    """Layout-Version erkennen — Reihenfolge nach Spezifität:
      v1 (2019-2026): VOD-Records-Header mit Bullets, RG-YYYY-NNNNNN
      v0 (2010-2018): "Vinyl on Demand," (TitleCase) + Alpenstrasse, RE-YYYYMM/NNNNN
      v-1 (2007-2010): "vinyl-on-demand" (lowercase) + Frank Maier, RE-YYYYMM/NNNNN

    Returns 'mo-2019-2026' / 'mo-2010-2018' / 'mo-2007-2010' / None.
    """
    if RE_VOD_HEADER.search(text) and (
        RE_POSITION_HEADER.search(text) or RE_INVOICE_NO.search(text)
    ):
        return "mo-2019-2026"
    if detect_v0(text):
        return "mo-2010-2018"
    if detect_v_minus1(text):
        return "mo-2007-2010"
    return None


def parse_doc_type_from_filename(filename: str) -> str:
    """RG-XXX → invoice, KR-XXX → credit_note, PR-XXX → proforma, AR-XXX → partial."""
    stem = filename.split("/")[-1].split("\\")[-1].upper()
    if stem.startswith("RG-"):
        return "invoice"
    if stem.startswith("KR-"):
        return "credit_note"
    if stem.startswith("PR-"):
        return "proforma"
    if stem.startswith("AR-"):
        return "partial"
    return "invoice"  # default


def _parse_customer_block(text: str) -> dict[str, Any]:
    """Customer-Block oben links — zwischen VOD-Header und 'Rechnung Nr.'.

    Strategie:
      - Block zwischen VOD-Header und 'Rechnung Nr.' isolieren
      - Zeilen filtern: skip leer, skip Meta-Block-Zeilen, skip VOD-Footer-Bullets
      - Pro Zeile am ≥3-Space-Block splitten, links = Customer-Daten

    Customer-Daten haben 2-5 Zeilen (Name, Strasse, [c/o], PLZ Ort, Land).
    """
    m_vod = RE_VOD_HEADER.search(text)
    m_inv = RE_INVOICE_NO.search(text)
    if not m_vod or not m_inv:
        return {}
    block = text[m_vod.end():m_inv.start()]
    customer_lines: list[str] = []
    for line in block.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        # Skip VOD-Footer-Reste: " • Deutschland" o.ä.
        if stripped.startswith("•") or stripped == "•":
            continue
        if stripped.startswith("• "):
            continue
        # Split bei ≥3 aufeinanderfolgenden Spaces
        parts = re.split(r"\s{3,}", line, maxsplit=1)
        left = parts[0].strip()
        if not left:
            continue
        # Skip Lines, die nur die VOD-Footer-Continuation sind (z.B. "• Deutschland")
        if left.startswith("•"):
            continue
        # Skip Meta-Block-Zeilen
        if left.startswith(("Kunden-Nr.:", "Datum:", "Lieferdatum:", "Rückfragen", "Seite:")):
            continue
        customer_lines.append(left)

    if not customer_lines:
        return {}

    # Customer-Block-Layout:
    #   Zeile 1: Name (Firma oder Privatperson)
    #   Zeile 2: Strasse + Hausnr (oder c/o)
    #   Zeile 3: [optional] zusätzliche Address-Zeile (Apt, Unit etc.)
    #   Zeile letzte: Land (US, UK, IT, etc.)
    #   Zeile vorletzte: PLZ Ort (DE/AT 4-5 stellig, US "FL 33351 Sunrise", UK "M1 7HG Manchester")
    name_line = customer_lines[0]
    street = customer_lines[1] if len(customer_lines) > 1 else None

    # Heuristik: PLZ-Zeile finden — eine Zeile mit Ziffern-Block am Anfang
    # ODER Zeile mit US-State-Pattern (FL 33351, NY 10001)
    plz_pattern = re.compile(r"^(?P<plz>\d{4,6})\s+(?P<city>.+)$")
    us_pattern = re.compile(r"^(?P<state>[A-Z]{2})\s+(?P<plz>\d{5})\s+(?P<city>.+)$")

    postal_code = None
    city = None
    region = None
    plz_line_idx = None
    for i, line in enumerate(customer_lines[2:], start=2):
        m = plz_pattern.match(line)
        if m:
            postal_code = m.group("plz")
            city = m.group("city").strip()
            plz_line_idx = i
            break
        m = us_pattern.match(line)
        if m:
            postal_code = m.group("plz")
            city = m.group("city").strip()
            region = m.group("state")
            plz_line_idx = i
            break

    # Country = letzte Zeile NACH PLZ-Zeile (sofern existent)
    country = None
    if plz_line_idx is not None and plz_line_idx + 1 < len(customer_lines):
        country = customer_lines[plz_line_idx + 1]
    # Spezialfall: keine PLZ erkannt aber 4 Zeilen → letzte ist evtl. Land
    elif plz_line_idx is None and len(customer_lines) >= 4:
        country = customer_lines[-1]
    # Wenn die "Country"-Zeile sehr kurz und mit Bindestrich endet (z.B. "SP-"), normalisieren
    if country and re.match(r"^[A-Z]{1,3}-?$", country.strip()):
        country = country.strip().rstrip("-")

    return {
        "raw_customer_block": "\n".join(customer_lines),
        "name_line": name_line,
        "street": street,
        "postal_code": postal_code,
        "city": city,
        "region": region,
        "country": country,
    }


def _parse_positions(text: str) -> list[dict[str, Any]]:
    """Positionen aus dem Tabellen-Block extrahieren."""
    m_header = RE_POSITION_HEADER.search(text)
    if not m_header:
        return []
    # Block ab Header-Zeile bis zur "Gesamt Brutto"-Zeile (oder Steuer-Note davor)
    m_total = RE_TOTAL_GROSS.search(text, pos=m_header.end())
    if not m_total:
        return []
    block = text[m_header.end():m_total.start()]

    items = []
    for m in RE_POSITION_LINE.finditer(block):
        desc = m.group("desc").strip()
        qty = parse_de_amount(m.group("qty"))
        vat = parse_de_amount(m.group("vat"))
        unit_price = parse_de_amount(m.group("unit_price"))
        line_total = parse_de_amount(m.group("line_total"))

        # Article-Nr aus Beschreibung extrahieren ("VOD141TS / VOD141TS" → "VOD141TS")
        article_no = None
        article_name = desc
        am = RE_ARTICLE_PARTS.match(desc)
        if am:
            article_no = am.group("art_no").strip()
            article_name = am.group("rest").strip() or article_no

        # Shipping-Detection
        is_shipping = (
            (article_no or "").upper().startswith("ART-000003")
            or any(kw in article_name.lower() for kw in SHIPPING_KEYWORDS)
        )

        items.append({
            "position": int(m.group("pos")),
            "article_no": article_no,
            "article_name": article_name,
            "quantity": qty,
            "vat_rate": vat,
            "unit_price": unit_price,
            "line_total_gross": line_total,
            "is_shipping": is_shipping,
            "raw_line": m.group(0).strip(),
        })

    return items


def parse_invoice(text: str, layout: str | None = None,
                  filename: str = "") -> dict[str, Any] | None:
    """Vollständiger Parser für mo-2019-2026.

    Returns dict on success, None bei Parse-Failure (= Pflichtfelder fehlen).
    Bei partiellen Erfolgen: warnings-list im Result.
    """
    if layout is None:
        layout = detect_layout(text)
    if layout == "mo-2010-2018":
        return parse_invoice_v0(text, filename=filename)
    if layout == "mo-2007-2010":
        return parse_invoice_v_minus1(text, filename=filename)
    if layout != "mo-2019-2026":
        return None

    warnings: list[str] = []

    # Header-Felder
    m_inv = RE_INVOICE_NO.search(text)
    m_cust = RE_CUSTOMER_NO.search(text)
    m_date = RE_INVOICE_DATE.search(text)
    if not m_inv or not m_cust or not m_date:
        return None    # Pflichtfelder fehlen → Layout-Review

    invoice_no = m_inv.group(1)
    customer_no = m_cust.group(1)
    invoice_date = parse_de_date(m_date.group(1))

    m_deliv = RE_DELIVERY_DATE.search(text)
    delivery_date = parse_de_date(m_deliv.group(1)) if m_deliv else None

    m_contact = RE_CONTACT_PERSON.search(text)
    contact_person = m_contact.group(1) if m_contact else None

    m_ab = RE_AB_REFERENCE.search(text)
    ab_reference = m_ab.group(1) if m_ab else None

    m_kr = RE_KR_REFERENCE.search(text)
    correction_for = m_kr.group(1) if m_kr else None

    # Doc-Type aus Filename
    doc_type = parse_doc_type_from_filename(filename) if filename else "invoice"
    # Override: KR im Filename UND KR-Reference im Text → credit_note
    if invoice_no.startswith("KR-"):
        doc_type = "credit_note"
    elif invoice_no.startswith("PR-"):
        doc_type = "proforma"
    elif invoice_no.startswith("AR-"):
        doc_type = "partial"

    # Summen
    m_brutto = RE_TOTAL_GROSS.search(text)
    m_steuer = RE_TOTAL_TAX.search(text)
    m_netto = RE_TOTAL_NET.search(text)
    total_gross = parse_de_amount(m_brutto.group(1)) if m_brutto else None
    total_tax = parse_de_amount(m_steuer.group(1)) if m_steuer else None
    total_net = parse_de_amount(m_netto.group(1)) if m_netto else None
    if total_gross is None:
        warnings.append("total_gross_missing")

    # Steuer-Hinweis
    tax_note = None
    if RE_TAX_FREE_EXPORT.search(text):
        tax_note = "tax_free_export"
    elif RE_TAX_FREE_EU.search(text):
        tax_note = "tax_free_eu"
    elif RE_TAX_NOTE_INLINE.search(text):
        m_inline = RE_TAX_NOTE_INLINE.search(text)
        tax_note = f"vat_{m_inline.group(1)}_pct"

    # Payment-Terms
    payment_terms = None
    m_pt = RE_PAYMENT_TERMS_DEFAULT.search(text)
    if m_pt:
        payment_terms = f"net_{m_pt.group(1)}_days"

    # Customer-Block
    customer_block = _parse_customer_block(text)

    # Items
    items = _parse_positions(text)
    if not items:
        warnings.append("no_items_parsed")

    # Plausibilitäts-Check: Σ items ≈ total_gross
    if items and total_gross is not None:
        item_sum = sum((i["line_total_gross"] or 0) for i in items)
        diff = abs(item_sum - total_gross)
        if diff > 0.05:
            warnings.append(f"sum_mismatch:items={item_sum:.2f}_total={total_gross:.2f}_diff={diff:.2f}")

    return {
        "invoice_no": invoice_no,
        "doc_type": doc_type,
        "invoice_date": invoice_date,
        "delivery_date": delivery_date,
        "customer_no": customer_no,
        "contact_person": contact_person,
        "ab_reference": ab_reference,
        "correction_for_invoice_no": correction_for,
        "customer": customer_block,
        "items": items,
        "total_gross": total_gross,
        "total_tax": total_tax,
        "total_net": total_net,
        "currency": "EUR",
        "tax_note": tax_note,
        "payment_terms": payment_terms,
        "extraction_warnings": warnings,
        "layout": layout,
    }
