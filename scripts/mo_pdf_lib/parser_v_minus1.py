"""MO-Invoice-Parser für Layout `mo-2007-2010` (legacy vinyl-on-demand era).

Eingabe: pdftotext -layout Output (str).
Ausgabe: dict mit invoice-, customer-, items-, totals-Daten oder None bei Parse-Failure.

Layout-Charakteristika (verifiziert 2026-05-04 gegen samples 2007/2008):
  - Header: 'vinyl-on-demand' (lowercase) + 'Frank Maier * <addr>'
    Adresse: 'Hochstr. 25' (2007-2008) ODER 'Alpenstr.25/1' (2009-2010)
  - Invoice-Nr-Format: 'Rechnung-Nr.: RE-YYYYMM/NNNNN'
  - Customer-Nr: 4-5stellig numerisch ('Kunden-Nr.: 1384')
  - Item-Tabelle: 5 Spalten (Menge | Artikel | USt % | EP | GP)
    Article-Namen werden oft doppelt gerendert ('Snatch     Snatch')
  - Totals-Block: 'Summe Brutto X,XX EURO' / 'Summe Netto' / 'USt.0%'
"""
from __future__ import annotations

import re
from typing import Any
from .regex_patterns import parse_de_amount, parse_de_date, SHIPPING_KEYWORDS
from .parser_v0 import normalize_country

# ─── Detection ────────────────────────────────────────────────────────────────

# Lowercase "vinyl-on-demand" — präziser Anchor weil unique zu VOD und alle
# v-1-Sub-Varianten 2004-2010 enthalten ihn. "Frank Maier" ist NICHT immer da
# (z.B. 2004 hat nur "vinyl-on-demand * Hochstr. 25 * 88045 Friedrichshafen").
# Detail-Sub-Varianten:
#   - 2004-2006: "vinyl-on-demand * Hochstr. 25" (Sterne als Trenner)
#   - 2007-2008: "vinyl-on-demand" + "Frank Maier * Hochstr. 25" (2-Spalten)
#   - 2009-2010: "vinyl-on-demand" + "Frank Maier *Alpenstr.25/1" (2-Spalten)
RE_VOD_HEADER_VMINUS1 = re.compile(r"vinyl-on-demand", re.IGNORECASE)

# Invoice-Nr — Field-Label variiert über Sub-Vintages:
#   "Rechnung-Nr.: RE-..." (2007-2010)
#   "Rechnung Nummer: RE-..." (2004-2006)
RE_INVOICE_NO_VMINUS1 = re.compile(
    r"(?:Rechnung-Nr\.?|Nummer):?\s+(RE-\d{6}/\d{4,5})"
)

# Customer-Nr — Field-Label variiert:
#   "Kunden-Nr.: 1234" (2007-2010)
#   "Ihre Nummer: 1234" (2004-2006)
RE_CUSTOMER_NO_VMINUS1 = re.compile(
    r"(?:Kunden-Nr\.?|Ihre\s+Nummer):?\s+(\d{3,8})"
)

# Datum (kein "Rechnungsdatum" — nur "Datum:")
RE_INVOICE_DATE_VMINUS1 = re.compile(r"Datum:?\s+(\d{2}\.\d{2}\.\d{4})")

# Totals-Block
RE_TOTAL_GROSS_VMINUS1 = re.compile(r"Summe\s+Brutto\s+(-?[\d.,]+)\s*EURO?")
RE_TOTAL_NET_VMINUS1 = re.compile(r"Summe\s+Netto\s+(-?[\d.,]+)\s*EURO?")
# "USt.0%   0,00 EURO" oder "USt.19%  X,XX EURO"
RE_TOTAL_TAX_VMINUS1 = re.compile(r"USt\.\s*([\d.,]+)\s*%\s+(-?[\d.,]+)\s*EURO?")

# Tax-Notes
RE_TAX_FREE_EU_VMINUS1 = re.compile(
    r"Steuerfreie\s+innergemeinschaftliche\s+Lieferung", re.IGNORECASE
)
RE_TAX_FREE_EXPORT_VMINUS1 = re.compile(
    r"Steuerfreie?\s+Ausfuhr|Drittland", re.IGNORECASE
)

# Payment
RE_PAYMENT_TERMS_VMINUS1 = re.compile(r"Zahlbar:?\s+Sofort\s+ohne\s+Abzug", re.IGNORECASE)

# Items-Block-Anchor: Tabellen-Header "Menge | Artikel | USt. % | EP | GP"
RE_ITEMS_HEADER_VMINUS1 = re.compile(
    r"Menge\s+Artikel\s+USt\.?\s*%\s+EP\s+GP"
)

# Item-Zeile:
# "        3,00           Johnduncan Johnduncan                                           0    36,99                            110,97"
# 5-Spalten: qty | art_no/desc (oft doppelt) | vat | unit_price | line_total
RE_ITEM_LINE_VMINUS1 = re.compile(
    r"^\s+(?P<qty>\d+,\d+)\s+"
    r"(?P<art_no>\S+)\s+"
    r"(?P<desc>.+?)\s+"
    r"(?P<vat>\d+(?:,\d+)?)\s+"
    r"(?P<unit_price>-?[\d.,]+)\s+"
    r"(?P<line_total>-?[\d.,]+)\s*$",
    re.MULTILINE,
)

# Wrapped Item-Line: art_no in Zeile 1, Rest in Zeile 2 (siehe "Kopp Psico CD" Sample)
RE_ITEM_LINE_WRAPPED_VMINUS1 = re.compile(
    r"^\s+(?P<qty>\d+,\d+)\s+"
    r"(?P<art_no>\S+)\s+(?P<desc1>\S.*?)\s*$\n"
    r"^\s+(?P<desc2>\S.*?)\s+"
    r"(?P<vat>\d+(?:,\d+)?)\s+"
    r"(?P<unit_price>-?[\d.,]+)\s+"
    r"(?P<line_total>-?[\d.,]+)\s*$",
    re.MULTILINE,
)


def detect_v_minus1(text: str) -> bool:
    """Mo-2007-2010 erkennen."""
    return (
        RE_VOD_HEADER_VMINUS1.search(text) is not None
        and RE_INVOICE_NO_VMINUS1.search(text) is not None
    )


def _parse_customer_block_v_minus1(text: str) -> dict[str, Any]:
    """Customer-Block zwischen 'vinyl-on-demand <addr>' (zweites Vorkommen, oft als
    Footer-Anschrift) und 'Rechnung\\s+Rechnung-Nr.'-Zeile.

    Struktur:
      vinyl-on-demand <addr> 88045 Friedrichshafen   <-- zweites Vorkommen, Trennzeile

      Herrn                                          IBAN: ...
      <Customer-Name>                                BIC: ...
      <Strasse>                                      ...
      <PLZ Ort>
      <Land>

    Customer-Daten links, Bank-Info rechts. Splittel an ≥3 Spaces.
    """
    # Suche nach der Trenn-Zeile (zweites Vorkommen mit Adresse + 88045).
    # Sub-Varianten:
    #   "vinyl-on-demand Hochstr. 25 88045 Friedrichshafen" (no stars)
    #   "vinyl-on-demand * Hochstr. 25 * 88045 Friedrichshafen" (mit Sternen, 2004-2006)
    #   "vinyl-on-demand Alpenstr.25/1 88045 Friedrichshafen"
    m_sep = re.search(
        r"vinyl-on-demand[\s\*]+(?:Hochstr|Alpenstr)\.?[\s\*]*\d[^\n]*88045\s+Friedrichshafen",
        text,
        re.IGNORECASE,
    )
    if not m_sep:
        return {}
    # Anchor nach Customer-Block: 'Rechnung Rechnung-Nr.' (v-1) oder 'Rechnung Nummer:' (2004-2006)
    m_inv_anchor = re.search(
        r"\bRechnung\b\s+(?:Rechnung-Nr\.|Nummer:)",
        text[m_sep.end():],
    )
    if not m_inv_anchor:
        return {}
    block = text[m_sep.end():m_sep.end() + m_inv_anchor.start()]

    customer_lines: list[str] = []
    for line in block.splitlines():
        if not line.strip():
            continue
        # Split bei ≥3 Spaces, links = customer
        parts = re.split(r"\s{3,}", line, maxsplit=1)
        left = parts[0].strip()
        if not left:
            continue
        # Skip "Herrn" / "Frau" anrede
        if left in ("Herrn", "Herr", "Frau", "An:"):
            continue
        # Skip footer-anchors die ggf. matchen
        if re.match(r"^(IBAN|BIC|PayPal|VAT|TaxNo|Tel:|Fax:|e-Mail|www)", left):
            continue
        customer_lines.append(left)

    if not customer_lines:
        return {}

    name_line = customer_lines[0]
    street = customer_lines[1] if len(customer_lines) > 1 else None

    plz_pattern = re.compile(r"^(?P<plz>\d{4,6})\s+(?P<city>.+)$")
    nl_pattern = re.compile(r"^(?P<plz>\d{4}\s*[A-Z]{2})\s+(?P<city>.+)$")
    uk_pattern = re.compile(r"^(?P<plz>[A-Z]{1,2}\d{1,2}\s*\d?[A-Z]{0,2})\s+(?P<city>.+)$")

    postal_code = city = region = None
    plz_idx = None
    for i, line in enumerate(customer_lines[1:], start=1):
        for pat in [plz_pattern, nl_pattern, uk_pattern]:
            m = pat.match(line)
            if m:
                postal_code = m.group("plz").strip()
                city = m.group("city").strip()
                plz_idx = i
                break
        if plz_idx:
            break

    country = None
    if plz_idx is not None and plz_idx + 1 < len(customer_lines):
        country = customer_lines[plz_idx + 1]
    elif plz_idx is None and len(customer_lines) >= 4:
        country = customer_lines[-1]

    country_iso = normalize_country(country)

    return {
        "raw_customer_block": "\n".join(customer_lines),
        "name_line": name_line,
        "street": street,
        "postal_code": postal_code,
        "city": city,
        "region": region,
        "country": country_iso or country,
    }


def _parse_items_v_minus1(text: str) -> list[dict[str, Any]]:
    m_hdr = RE_ITEMS_HEADER_VMINUS1.search(text)
    if not m_hdr:
        return []
    # Block ab Header bis "Warenwert" (Anfang totals-block)
    m_end = re.search(r"\bWarenwert\b", text[m_hdr.end():])
    end_pos = m_hdr.end() + (m_end.start() if m_end else 5000)
    block = text[m_hdr.end():end_pos]

    items: list[dict[str, Any]] = []
    seen: set[tuple] = set()

    # Erst wrapped, dann single
    for m in RE_ITEM_LINE_WRAPPED_VMINUS1.finditer(block):
        key = (m.group("art_no"), m.group("qty"), m.group("line_total"))
        seen.add(key)
        items.append(_item_to_dict_vminus1(m, wrapped=True))

    for m in RE_ITEM_LINE_VMINUS1.finditer(block):
        key = (m.group("art_no"), m.group("qty"), m.group("line_total"))
        if key in seen:
            continue
        items.append(_item_to_dict_vminus1(m, wrapped=False))

    for i, item in enumerate(items, start=1):
        item["position"] = i
    return items


def _item_to_dict_vminus1(m: re.Match, wrapped: bool) -> dict[str, Any]:
    art_no = m.group("art_no").strip()
    if wrapped:
        # desc1 (rest from line 1) + desc2 (line 2, but desc2 might just be art_no again)
        desc = (m.group("desc1") or "").strip() + " " + (m.group("desc2") or "").strip()
    else:
        desc = m.group("desc").strip()
    # Strip trailing repeat ("Snatch     Snatch" → "Snatch")
    if desc.endswith(art_no):
        desc = desc[:-len(art_no)].strip() or art_no
    if desc == art_no:
        article_name = art_no
    else:
        article_name = desc or art_no

    is_shipping = (
        art_no.lower().startswith("art-000003")
        or any(kw in article_name.lower() for kw in SHIPPING_KEYWORDS)
    )
    return {
        "position": 0,
        "article_no": art_no,
        "article_name": article_name,
        "quantity": parse_de_amount(m.group("qty")),
        "vat_rate": parse_de_amount(m.group("vat")),
        "unit_price": parse_de_amount(m.group("unit_price")),
        "line_total_gross": parse_de_amount(m.group("line_total")),
        "is_shipping": is_shipping,
        "raw_line": m.group(0).strip(),
    }


def parse_invoice_v_minus1(text: str, filename: str = "") -> dict[str, Any] | None:
    if not detect_v_minus1(text):
        return None

    warnings: list[str] = []

    m_inv = RE_INVOICE_NO_VMINUS1.search(text)
    m_cust = RE_CUSTOMER_NO_VMINUS1.search(text)
    m_date = RE_INVOICE_DATE_VMINUS1.search(text)
    if not m_inv or not m_date:
        return None

    invoice_no = m_inv.group(1)
    customer_no = m_cust.group(1) if m_cust else f"vminus1-unknown-{invoice_no}"
    if not m_cust:
        warnings.append("customer_no_missing")
    invoice_date = parse_de_date(m_date.group(1))

    # Totals
    m_brutto = RE_TOTAL_GROSS_VMINUS1.search(text)
    m_netto = RE_TOTAL_NET_VMINUS1.search(text)
    m_steuer = RE_TOTAL_TAX_VMINUS1.search(text)
    total_gross = parse_de_amount(m_brutto.group(1)) if m_brutto else None
    total_net = parse_de_amount(m_netto.group(1)) if m_netto else None
    total_tax = parse_de_amount(m_steuer.group(2)) if m_steuer else None

    if total_gross is None:
        warnings.append("total_gross_missing")

    # Tax-Note
    tax_note = None
    if RE_TAX_FREE_EXPORT_VMINUS1.search(text):
        tax_note = "tax_free_export"
    elif RE_TAX_FREE_EU_VMINUS1.search(text):
        tax_note = "tax_free_eu"
    elif m_steuer and parse_de_amount(m_steuer.group(1)):
        rate = parse_de_amount(m_steuer.group(1))
        if rate and rate > 0:
            tax_note = f"vat_{int(rate)}_pct"

    payment_terms = "immediate" if RE_PAYMENT_TERMS_VMINUS1.search(text) else None

    customer_block = _parse_customer_block_v_minus1(text)
    items = _parse_items_v_minus1(text)
    if not items:
        warnings.append("no_items_parsed")

    if items and total_gross is not None:
        item_sum = sum((i["line_total_gross"] or 0) for i in items)
        diff = abs(item_sum - total_gross)
        if diff > 0.5:
            warnings.append(f"sum_mismatch:items={item_sum:.2f}_total={total_gross:.2f}")

    return {
        "invoice_no": invoice_no,
        "doc_type": "invoice",
        "invoice_date": invoice_date,
        "delivery_date": None,
        "customer_no": customer_no,
        "contact_person": None,
        "ab_reference": None,
        "correction_for_invoice_no": None,
        "customer": customer_block,
        "items": items,
        "total_gross": total_gross,
        "total_tax": total_tax,
        "total_net": total_net,
        "currency": "EUR",
        "tax_note": tax_note,
        "payment_terms": payment_terms,
        "extraction_warnings": warnings,
        "layout": "mo-2007-2010",
    }
