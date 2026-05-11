#!/usr/bin/env python3
"""Unit-Tests für scripts/data/country_iso.py (rc54.0 Country-ISO Migration).

Mirror der TS-Tests in backend/src/__tests__/country-normalize.unit.spec.ts —
beide MÜSSEN identische Outputs liefern.

Run:
    cd VOD_Auctions/scripts
    python3 country_iso_test.py
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

# Pfad zur scripts/data hinzufügen
sys.path.insert(0, str(Path(__file__).parent))
from data.country_iso import (  # noqa: E402
    ALL_VALID_CODES,
    COUNTRY_TO_ISO,
    lookup_iso,
    normalize_country_to_iso,
)


class TestSingleCountryNames(unittest.TestCase):
    """89 distinct DB-Werte aus dem Backfill-Mapping."""

    def test_major_markets(self):
        cases = [
            ("Germany", "DE"),
            ("United States", "US"),
            ("United Kingdom", "GB"),
            ("France", "FR"),
            ("Netherlands", "NL"),
            ("Italy", "IT"),
            ("Belgium", "BE"),
            ("Japan", "JP"),
            ("Canada", "CA"),
            ("Switzerland", "CH"),
            ("Australia", "AU"),
            ("Austria", "AT"),
            ("Spain", "ES"),
            ("Sweden", "SE"),
            ("Norway", "NO"),
            ("Poland", "PL"),
            ("Denmark", "DK"),
            ("Portugal", "PT"),
            ("Iceland", "IS"),
        ]
        for name, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(normalize_country_to_iso(name), expected)

    def test_lithuania_latvia(self):
        """Discogs-Cache-Audit 2026-05-11 entdeckt — auto-resolved via nameEn."""
        self.assertEqual(normalize_country_to_iso("Lithuania"), "LT")
        self.assertEqual(normalize_country_to_iso("Latvia"), "LV")


class TestDiscogsAliases(unittest.TestCase):
    def test_uk_usa_aliases(self):
        self.assertEqual(normalize_country_to_iso("UK"), "GB")
        self.assertEqual(normalize_country_to_iso("uk"), "GB")
        self.assertEqual(normalize_country_to_iso("USA"), "US")
        self.assertEqual(normalize_country_to_iso("usa"), "US")


class TestIdentityPassthrough(unittest.TestCase):
    """KRITISCH (rc54.0): lookup_iso MUSS ISO-Codes als Identity returnen.

    Sonst bricht Meili-Sync zwischen Phase 4 und Phase 6.
    """

    def test_iso_codes_passthrough(self):
        for code in ["DE", "US", "GB", "FR", "IT", "JP", "EU", "WO", "YU", "DD", "CS", "SU"]:
            with self.subTest(code=code):
                self.assertEqual(lookup_iso(code), code)
                self.assertEqual(normalize_country_to_iso(code), code)

    def test_case_insensitive_iso(self):
        self.assertEqual(lookup_iso("de"), "DE")
        self.assertEqual(lookup_iso("gb"), "GB")
        self.assertEqual(lookup_iso("eu"), "EU")

    def test_invalid_two_letter(self):
        """XX ist user-assigned aber nicht in unserer Liste → None."""
        self.assertIsNone(lookup_iso("XX"))
        self.assertIsNone(lookup_iso("ZZ"))


class TestMultiRegion(unittest.TestCase):
    def test_pure_europe_to_eu(self):
        self.assertEqual(normalize_country_to_iso("Europe"), "EU")
        self.assertEqual(normalize_country_to_iso("European Union"), "EU")
        self.assertEqual(normalize_country_to_iso("EU"), "EU")

    def test_worldwide_to_wo(self):
        self.assertEqual(normalize_country_to_iso("Worldwide"), "WO")
        self.assertEqual(normalize_country_to_iso("WO"), "WO")

    def test_region_sammel(self):
        self.assertEqual(normalize_country_to_iso("Benelux"), "NL")
        self.assertEqual(normalize_country_to_iso("Scandinavia"), "SE")

    def test_compound_primary_first(self):
        cases = [
            # UK-first
            ("UK & Europe", "GB"),
            ("UK & US", "GB"),
            ("UK & Ireland", "GB"),
            ("UK & Germany", "GB"),
            ("UK & France", "GB"),
            ("UK, Europe & US", "GB"),
            # USA-first
            ("USA & Europe", "US"),
            ("USA & Canada", "US"),
            ("USA, Canada & Europe", "US"),
            ("USA, Canada & UK", "US"),
            # DE-first
            ("Germany, Austria, & Switzerland", "DE"),
            ("Germany & Switzerland", "DE"),
            # FR-first
            ("France & Benelux", "FR"),
            # AU-first (entdeckt im Discogs-Cache-Audit 2026-05-11)
            ("Australia & New Zealand", "AU"),
        ]
        for name, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(normalize_country_to_iso(name), expected)


class TestDeprecatedISO(unittest.TestCase):
    """ISO-3166-3 — historische Codes bleiben erhalten."""

    def test_yugoslavia(self):
        self.assertEqual(normalize_country_to_iso("Yugoslavia"), "YU")

    def test_east_germany(self):
        for name in [
            "East Germany",
            "East Germany (GDR)",
            "German Democratic Republic",
            "German Democratic Republic (GDR)",
            "GDR",
        ]:
            with self.subTest(name=name):
                self.assertEqual(normalize_country_to_iso(name), "DD")

    def test_ussr(self):
        self.assertEqual(normalize_country_to_iso("USSR"), "SU")
        self.assertEqual(normalize_country_to_iso("Soviet Union"), "SU")

    def test_czechoslovakia(self):
        self.assertEqual(normalize_country_to_iso("Czechoslovakia"), "CS")
        self.assertEqual(normalize_country_to_iso("Serbia and Montenegro"), "CS")


class TestEdgeCases(unittest.TestCase):
    def test_none_and_empty(self):
        self.assertIsNone(normalize_country_to_iso(None))
        self.assertIsNone(normalize_country_to_iso(""))
        self.assertIsNone(normalize_country_to_iso(" "))
        self.assertIsNone(normalize_country_to_iso("   "))

    def test_whitespace_trimmed(self):
        self.assertEqual(normalize_country_to_iso("  Germany  "), "DE")
        self.assertEqual(normalize_country_to_iso("  DE  "), "DE")

    def test_case_insensitive_names(self):
        self.assertEqual(normalize_country_to_iso("germany"), "DE")
        self.assertEqual(normalize_country_to_iso("GERMANY"), "DE")
        self.assertEqual(normalize_country_to_iso("united kingdom"), "GB")

    def test_unknown(self):
        self.assertIsNone(normalize_country_to_iso("Foobaria"))
        self.assertIsNone(normalize_country_to_iso("123"))


class TestRegistryIntegrity(unittest.TestCase):
    """Konsistenz-Checks für die Maps selbst."""

    def test_all_targets_in_valid_codes(self):
        """Jeder ISO-Code im COUNTRY_TO_ISO-Map muss in ALL_VALID_CODES sein."""
        for name, iso in COUNTRY_TO_ISO.items():
            with self.subTest(name=name, iso=iso):
                self.assertIn(iso, ALL_VALID_CODES)

    def test_reserved_codes_present(self):
        for code in ["EU", "WO", "YU", "DD", "CS", "SU"]:
            self.assertIn(code, ALL_VALID_CODES)


if __name__ == "__main__":
    unittest.main()
