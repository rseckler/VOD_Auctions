"""MO-Invoice-Parser für Layout `mo-2010-2018` (Vinyl-on-Demand era).

Eingabe: pdftotext -layout Output (str).
Ausgabe: dict mit invoice-, customer-, items-, totals-Daten oder None bei Parse-Failure.

Layout-Charakteristika (verifiziert 2026-05-04 gegen samples 2012/2014/2016):
  - Header: 'Vinyl on Demand, Alpenstrasse 25/1, 88045 Friedrichshafen'
  - Invoice-Nr-Format: 'RE-YYYYMM/NNNNN'
  - Kunden-Nr: 4-5stellig numerisch ('Ihre Kundennummer: 2303')
  - Item-Tabelle: 4 Spalten (Artikel-Nr, Bezeichnung, Menge, Einzelpreis, Gesamtpreis EUR)
  - Totals-Block: 'Summe', 'Betrag netto', 'Betrag USt.'
"""
from __future__ import annotations

import re
from typing import Any
from .regex_patterns import parse_de_amount, parse_de_date, SHIPPING_KEYWORDS

# ─── Patterns v0 ──────────────────────────────────────────────────────────────

RE_VOD_HEADER_V0 = re.compile(
    r"Vinyl\s+on\s+Demand,?\s+Alpenstrasse\s+25/1,?\s+88045\s+Friedrichshafen"
)

# Invoice-Nr 'RE-YYYYMM/NNNNN' — kommt meist als alleinstehende Zeile
RE_INVOICE_NO_V0 = re.compile(r"\b(RE-\d{6}/\d{4,5})\b")

# Kunden-Nr 4-5stellig numerisch
RE_CUSTOMER_NO_V0 = re.compile(r"Ihre\s+Kundennummer:?\s+(\d{3,8})")

# Datums
RE_INVOICE_DATE_V0 = re.compile(r"Rechnungsdatum\s+(\d{2}\.\d{2}\.\d{4})")
RE_DELIVERY_DATE_V0 = re.compile(r"Lieferdatum:?\s+(\d{2}\.\d{2}\.\d{4})")

# Totals-Block
RE_TOTAL_GROSS_V0 = re.compile(r"Summe\s+(-?[\d.,]+)\s+EUR")
RE_TOTAL_NET_V0 = re.compile(r"Betrag\s+netto\s+(-?[\d.,]+)\s+EUR")
RE_TOTAL_TAX_V0 = re.compile(r"Betrag\s+USt\.\s+(-?[\d.,]+)\s+EUR")
RE_PORTO_V0 = re.compile(r"Porto\s+(-?[\d.,]+)\s+EUR")

# Tax-Notes (auf Seite 2 oder im Summenblock)
RE_TAX_FREE_EU_V0 = re.compile(r"innergemeinschaftliche\s+Lieferung", re.IGNORECASE)
RE_TAX_FREE_EXPORT_V0 = re.compile(r"steuerfreie?\s+Ausfuhr", re.IGNORECASE)
RE_VAT_RATE_V0 = re.compile(
    r"Voller\s+Steuersatz\s+([\d.,]+)\s+EUR\s+([\d.,]+)\s+EUR\s+([\d.,]+)\s+EUR"
)

# Payment-Terms
RE_PAYMENT_TERMS_V0 = re.compile(r"Sofort\s+ohne\s+Abzug", re.IGNORECASE)

# Position-Block-Anker
RE_POSITION_HEADER_V0 = re.compile(
    r"Artikel-Nr\.\s+Bezeichnung\s+Menge\s+Einzelpreis:?\s+Gesamtpreis:?"
)

# Position-Zeile:
#   "  VOD104                  VOD104                       5,00          16,99           84,95 EUR"
# Artikel-Nr (Token ohne Whitespace), Bezeichnung (Rest bis Menge), Menge, Einzelpreis, Gesamtpreis EUR
RE_POSITION_LINE_V0 = re.compile(
    r"^\s*(?P<art_no>[A-Za-z][A-Za-z0-9.\-/]*)\s+"
    r"(?P<desc>.+?)\s{2,}"
    r"(?P<qty>-?\d+,\d+)\s+"
    r"(?P<unit_price>-?[\d.,]+)\s+"
    r"(?P<line_total>-?[\d.,]+)\s+EUR\s*$",
    re.MULTILINE,
)

# Wrapped position lines: wenn art_no und desc gleichermaßen sind und line break nach art_no.
# Dann ist Zeile 1 nur "vodmemWAVE2014" und Zeile 2 "          vodmemWAVE2014    1,00    339,00     339,00 EUR"
RE_POSITION_LINE_WRAPPED_V0 = re.compile(
    r"^\s*(?P<art_no>[A-Za-z][A-Za-z0-9.\-/]*)\s*$\n"
    r"^\s+(?P<desc>\S.*?)\s{2,}"
    r"(?P<qty>-?\d+,\d+)\s+"
    r"(?P<unit_price>-?[\d.,]+)\s+"
    r"(?P<line_total>-?[\d.,]+)\s+EUR\s*$",
    re.MULTILINE,
)

# Country-Mappings (im v0 ist Country oft als German-Word "ITALIEN", "NIEDERLANDE", etc.)
COUNTRY_DE_TO_ISO = {
    "DEUTSCHLAND": "DE", "DE": "DE",
    "ÖSTERREICH": "AT", "OESTERREICH": "AT", "AT": "AT",
    "SCHWEIZ": "CH", "CH": "CH",
    "ITALIEN": "IT", "ITA": "IT", "IT": "IT",
    "FRANKREICH": "FR", "FR": "FR", "FRA": "FR",
    "SPANIEN": "ES", "ES": "ES", "ESP": "ES",
    "NIEDERLANDE": "NL", "NL": "NL", "NLD": "NL",
    "BELGIEN": "BE", "BE": "BE",
    "GROSSBRITANNIEN": "GB", "GROßBRITANNIEN": "GB",
    "VEREINIGTES KÖNIGREICH": "GB", "UK": "GB", "GB": "GB",
    "USA": "US", "US": "US", "VEREINIGTE STAATEN": "US",
    "JAPAN": "JP", "JP": "JP", "JPN": "JP",
    "KANADA": "CA", "CA": "CA",
    "AUSTRALIEN": "AU", "AU": "AU",
    "SCHWEDEN": "SE", "SE": "SE",
    "DÄNEMARK": "DK", "DK": "DK",
    "NORWEGEN": "NO", "NO": "NO",
    "FINNLAND": "FI", "FI": "FI",
    "POLEN": "PL", "PL": "PL",
    "TSCHECHIEN": "CZ", "CZ": "CZ",
    "GRIECHENLAND": "GR", "GR": "GR",
    "PORTUGAL": "PT", "PT": "PT",
    "IRLAND": "IE", "IE": "IE",
    "RUSSLAND": "RU", "RU": "RU",
    "TÜRKEI": "TR", "TR": "TR",
    "MEXIKO": "MX", "MX": "MX",
    "BRASILIEN": "BR", "BR": "BR",
}


def normalize_country(s: str | None) -> str | None:
    if not s:
        return None
    key = s.strip().rstrip("-").upper()
    return COUNTRY_DE_TO_ISO.get(key, key if len(key) <= 3 else None)


# ─── Detection ───────────────────────────────────────────────────────────────

def detect_v0(text: str) -> bool:
    """Mo-2010-2018 erkennen via Header + Invoice-Nr-Format."""
    return bool(RE_VOD_HEADER_V0.search(text)) and bool(RE_INVOICE_NO_V0.search(text))


# ─── Customer-Block ──────────────────────────────────────────────────────────

def _parse_customer_block_v0(text: str) -> dict[str, Any]:
    """Block zwischen 'Vinyl on Demand'-Header und 'Lieferdatum:'/'Rechnung'-Zeile.

    Layout:
      Vinyl on Demand, Alpenstrasse 25/1, 88045 Friedrichshafen          Lieferanschrift
      <Customer-Name>                                                    <Lieferanschrift-Name>
      <Customer-Strasse>                                                 ...
      <Customer-PLZ Ort>
      <Customer-Land>

    Customer-Daten links, Lieferanschrift rechts. Splittel an ≥3 Spaces.
    """
    m_hdr = RE_VOD_HEADER_V0.search(text)
    if not m_hdr:
        return {}
    # Block bis "Lieferdatum:" oder "Rechnungsdatum"
    m_end = re.search(r"\b(Lieferdatum:|Rechnungsdatum|Rechnung\s*$)", text[m_hdr.end():], re.MULTILINE)
    end_pos = m_hdr.end() + (m_end.start() if m_end else 2000)
    block = text[m_hdr.end():end_pos]

    customer_lines: list[str] = []
    for line in block.splitlines():
        if not line.strip():
            continue
        # Split bei ≥3 Spaces, links = customer
        parts = re.split(r"\s{3,}", line, maxsplit=1)
        left = parts[0].strip()
        if not left:
            continue
        # Skip die meta-Anker
        if re.match(r"^(Lieferdatum:|Rechnungsdatum|Rechnung\b|Ursprünglicher\s+Auftrag|Ihre\s+Kundennummer|Buchhaltungskonto|Ihr\s+Zeichen|Ihre\s+Bestellung|Unser\s+Zeichen|Unsere\s+Nachricht|Pos\.|Artikel-Nr\.)", left, re.IGNORECASE):
            continue
        customer_lines.append(left)

    if not customer_lines:
        return {}

    name_line = customer_lines[0]
    street = customer_lines[1] if len(customer_lines) > 1 else None

    # PLZ-Zeile finden
    plz_pattern = re.compile(r"^(?P<plz>\d{4,6})\s+(?P<city>.+)$")
    nl_pattern = re.compile(r"^(?P<plz>\d{4}[A-Z]{2})\s+(?P<city>.+)$")  # NL: 2662CA
    us_pattern = re.compile(r"^(?P<state>[A-Z]{2})\s+(?P<plz>\d{5})\s+(?P<city>.+)$")

    postal_code = None
    city = None
    region = None
    plz_idx = None
    for i, line in enumerate(customer_lines[1:], start=1):
        for pat, has_state in [(plz_pattern, False), (nl_pattern, False), (us_pattern, True)]:
            m = pat.match(line)
            if m:
                postal_code = m.group("plz")
                city = m.group("city").strip()
                if has_state:
                    region = m.group("state")
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


# ─── Positions ───────────────────────────────────────────────────────────────

def _parse_positions_v0(text: str) -> list[dict[str, Any]]:
    m_header = RE_POSITION_HEADER_V0.search(text)
    if not m_header:
        return []
    # Block ab Header bis "Rabatt" (start of totals-block)
    m_end = re.search(r"\bRabatt\s+\d+,\d+\s*%", text[m_header.end():])
    end_pos = m_header.end() + (m_end.start() if m_end else 5000)
    block = text[m_header.end():end_pos]

    items: list[dict[str, Any]] = []
    seen_lines: set[tuple] = set()  # dedup für wrapped vs single match

    # Erst wrapped-Pattern (greift wenn art_no in Zeile 1 + rest in Zeile 2)
    for m in RE_POSITION_LINE_WRAPPED_V0.finditer(block):
        key = (m.group("art_no"), m.group("qty"), m.group("line_total"))
        seen_lines.add(key)
        items.append(_pos_to_dict(m))

    # Dann single-line
    for m in RE_POSITION_LINE_V0.finditer(block):
        key = (m.group("art_no"), m.group("qty"), m.group("line_total"))
        if key in seen_lines:
            continue
        items.append(_pos_to_dict(m))

    # Re-numerieren (v0-Layout hat keine sichtbare Pos.-Spalte)
    for i, item in enumerate(items, start=1):
        item["position"] = i
    return items


def _pos_to_dict(m: re.Match) -> dict[str, Any]:
    art_no = m.group("art_no").strip()
    desc = m.group("desc").strip() if "desc" in m.groupdict() and m.group("desc") else art_no
    is_shipping = (
        art_no.upper().startswith("ART-000003")
        or any(kw in desc.lower() for kw in SHIPPING_KEYWORDS)
    )
    return {
        "position": 0,  # set by caller
        "article_no": art_no,
        "article_name": desc,
        "quantity": parse_de_amount(m.group("qty")),
        "vat_rate": None,  # v0 hat VAT nur im totals, nicht pro line
        "unit_price": parse_de_amount(m.group("unit_price")),
        "line_total_gross": parse_de_amount(m.group("line_total")),
        "is_shipping": is_shipping,
        "raw_line": m.group(0).strip(),
    }


# ─── Top-level Parse ─────────────────────────────────────────────────────────

def parse_invoice_v0(text: str, filename: str = "") -> dict[str, Any] | None:
    if not detect_v0(text):
        return None

    warnings: list[str] = []

    m_inv = RE_INVOICE_NO_V0.search(text)
    m_cust = RE_CUSTOMER_NO_V0.search(text)
    m_date = RE_INVOICE_DATE_V0.search(text)
    if not m_inv or not m_date:
        return None
    invoice_no = m_inv.group(1)
    customer_no = m_cust.group(1) if m_cust else None
    if not customer_no:
        warnings.append("customer_no_missing")
        customer_no = f"v0-unknown-{invoice_no}"
    invoice_date = parse_de_date(m_date.group(1))

    m_deliv = RE_DELIVERY_DATE_V0.search(text)
    delivery_date = parse_de_date(m_deliv.group(1)) if m_deliv else None

    # Doc-Type aus Filename bzw. Invoice-Nr-Prefix
    # v0 Mostly RE- (= Rechnung). Storno-Cases nicht häufig.
    doc_type = "invoice"

    # Totals
    m_brutto = RE_TOTAL_GROSS_V0.search(text)
    m_netto = RE_TOTAL_NET_V0.search(text)
    m_steuer = RE_TOTAL_TAX_V0.search(text)
    total_gross = parse_de_amount(m_brutto.group(1)) if m_brutto else None
    total_net = parse_de_amount(m_netto.group(1)) if m_netto else None
    total_tax = parse_de_amount(m_steuer.group(1)) if m_steuer else None

    if total_gross is None:
        warnings.append("total_gross_missing")

    # Tax-note
    tax_note = None
    if RE_TAX_FREE_EXPORT_V0.search(text):
        tax_note = "tax_free_export"
    elif RE_TAX_FREE_EU_V0.search(text):
        tax_note = "tax_free_eu"
    elif total_tax and total_tax > 0:
        # VAT rate detect from totals-block
        m_vat = RE_VAT_RATE_V0.search(text)
        if m_vat:
            tax_note = "vat_19_pct"  # Fixed in v0 — German default rate

    # Payment-Terms
    payment_terms = "immediate" if RE_PAYMENT_TERMS_V0.search(text) else None

    customer_block = _parse_customer_block_v0(text)
    items = _parse_positions_v0(text)
    if not items:
        warnings.append("no_items_parsed")

    if items and total_gross is not None:
        item_sum = sum((i["line_total_gross"] or 0) for i in items)
        diff = abs(item_sum - total_gross)
        if diff > 0.5:  # v0 has shipping in totals but not always in items
            warnings.append(f"sum_mismatch:items={item_sum:.2f}_total={total_gross:.2f}")

    return {
        "invoice_no": invoice_no,
        "doc_type": doc_type,
        "invoice_date": invoice_date,
        "delivery_date": delivery_date,
        "customer_no": customer_no,
        "contact_person": None,  # v0 hat keinen "Rückfragen an"
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
        "layout": "mo-2010-2018",
    }
