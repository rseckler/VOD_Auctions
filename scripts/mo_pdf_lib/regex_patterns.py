"""Regex-Patterns für MO-PDF-Layouts.

Layout-Versionen:
  mo-2019-2026 — verifiziert 2026-05-03 gegen 3 Samples (PAGLIANITE_FRANK,
                 DAYSS_BERND, DANI_MORENO). Stabil über 7 Jahre.

Alle Patterns sind multi-line-safe und nutzen `re.MULTILINE`.
"""

import re

# Layout: mo-2019-2026
# ============================================================================

# Header-Felder (rechte Spalte)
# Matched: "Rechnung Nr.", "Korrekturrechnung Nr.", "Proformarechnung Nr.", "Abschlagsrechnung Nr."
RE_INVOICE_NO = re.compile(r"(?:Korrektur|Proforma|Abschlags)?[Rr]echnung\s+Nr\.\s+(\S+)")
RE_CUSTOMER_NO = re.compile(r"Kunden-Nr\.:\s+(ADR-\d+)")
RE_INVOICE_DATE = re.compile(r"Datum:\s+(\d{2}\.\d{2}\.\d{4})")
RE_DELIVERY_DATE = re.compile(r"Lieferdatum:\s+(\d{2}\.\d{2}\.\d{4})")
RE_CONTACT_PERSON = re.compile(r"Rückfragen an:\s+(\S+)")
RE_AB_REFERENCE = re.compile(r"\(Gehört zu Auftragsbestätigung Nr\.\s+(\S+)")

# Korrektur-Rechnungen (KR-) — referenzieren ursprüngliche RG
RE_KR_REFERENCE = re.compile(r"Korrektur\s+(?:zu|für)\s+(?:Rechnung\s+)?Nr\.\s+(\S+)", re.IGNORECASE)

# Summen-Block (rechts) — Negativ-Werte bei Korrekturrechnungen erlaubt
RE_TOTAL_GROSS = re.compile(r"Gesamt\s+Brutto\s+€:\s+(-?[\d.,]+)")
RE_TOTAL_TAX = re.compile(r"Gesamt\s+Steuer\s+€:\s+(-?[\d.,]+)")
RE_TOTAL_NET = re.compile(r"Gesamt\s+Netto\s+€:\s+(-?[\d.,]+)")

# Steuer-Hinweise
RE_TAX_FREE_EXPORT = re.compile(r"steuerfreie\s+Ausfuhrlieferung", re.IGNORECASE)
RE_TAX_FREE_EU = re.compile(r"steuerfreie\s+innergemeinschaftliche\s+Lieferung", re.IGNORECASE)
RE_TAX_NOTE_INLINE = re.compile(r"Umsatzsteuer\s+([\d.,]+)%:\s+([\d.,]+)\s+€,\s+Netto:\s+([\d.,]+)\s+€")

# Zahlungsbedingungen
RE_PAYMENT_TERMS_DEFAULT = re.compile(
    r"Fällig\s+innerhalb\s+von\s+(\d+)\s+Tagen", re.IGNORECASE
)

# Position-Zeile in der Tabelle — Negativ-Werte für Korrekturrechnungen
RE_POSITION_LINE = re.compile(
    r"^\s*(?P<pos>\d+)\s+"
    r"(?P<desc>.+?)\s+"
    r"(?P<qty>-?\d+,\d+)\s+"           # Menge (1,00 oder -1,00)
    r"(?P<unit>\S*)\s*"
    r"(?P<vat>\d+,\d+)%\s+"
    r"(?P<unit_price>-?[\d.,]+)\s+"    # kann negativ sein
    r"(?P<line_total>-?[\d.,]+)\s*$",  # kann negativ sein
    re.MULTILINE,
)

# Position-Block-Anker (alles dazwischen sind Items)
RE_POSITION_HEADER = re.compile(
    r"Pos\.\s+Bezeichnung\s+Menge\s+Einh\.\s+USt\s+Einzelpreis\s+€\s+Gesamtpreis\s+€"
)

# Customer-Block-Anker (zwischen VOD-Header und Rechnungs-Nr)
RE_VOD_HEADER = re.compile(
    r"VOD-Records\s+•\s+Alpenstrasse\s+25/1\s+•\s+88045\s+Friedrichshafen"
)

# Article-Number-Pattern in Position
# Beispiele: "VOD141TS / VOD141TS", "ART-000003 / Porto / Postage", "ART-000153 / VOD183"
RE_ARTICLE_PARTS = re.compile(r"^\s*(?P<art_no>[A-Z][A-Z0-9.\-/]*)\s*/\s*(?P<rest>.+)$")

# Shipping-Detection (Position-Beschreibung enthält Porto/Postage/Versand)
SHIPPING_KEYWORDS = ("porto", "postage", "versand", "shipping")


def parse_de_amount(s: str) -> float | None:
    """'93,26' / '1.234,56' → 93.26 / 1234.56. Returns None bei Failure."""
    if s is None:
        return None
    s = s.strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def parse_de_date(s: str):
    """'24.07.2024' → date(2024, 7, 24)."""
    from datetime import date
    if not s:
        return None
    try:
        d, m, y = s.strip().split(".")
        return date(int(y), int(m), int(d))
    except (ValueError, TypeError):
        return None
