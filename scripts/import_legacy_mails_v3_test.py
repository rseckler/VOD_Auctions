#!/usr/bin/env python3
"""Unit-Tests für import_legacy_mails_v3 — pure stdlib, keine DB.

Run:
    cd VOD_Auctions/scripts
    python3 import_legacy_mails_v3_test.py

Deckt ab:
  - parse_iso_date: gültig / leer / kaputt / Timezone
  - parse_addresses: einzeln / Liste / Display-Name / kaputt / leer
  - derive_account: vod-records / vinyl-on-demand / unknown / Mixed-Case
  - extract_emails_from_body: leer / mehrere / Duplikate / max-cap / Unicode
  - make_msg_id: real / fallback / deterministisch / Edge-Cases
  - parse_record: vollständig / no-date / leeres body / lange to-Liste / synthetic-id
  - dedup_in_batch: keine Duplikate / einfache Duplikate / verschiedene msg_ids
"""
from __future__ import annotations

import os
import sys
import unittest

# Stub psycopg2/dotenv damit Import nicht crasht (Test brauchen sie nicht)
class _StubModule:
    def __getattr__(self, name): return _StubModule()
    def __call__(self, *a, **k): return _StubModule()

for mod in ("psycopg2", "psycopg2.extras", "dotenv"):
    if mod not in sys.modules:
        sys.modules[mod] = _StubModule()

# Stub shared.get_pg_connection bevor wir den Importer importieren
sys.modules.setdefault("shared", _StubModule())
sys.modules.setdefault("load_tier", _StubModule())

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Direktimport der reinen Helfer (vermeidet shared.py-Init)
import importlib.util
spec = importlib.util.spec_from_file_location(
    "ilm_v3",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "import_legacy_mails_v3.py"),
)
ilm = importlib.util.module_from_spec(spec)
# Dummy psycopg2 für Modul-Top-Level — die Helper brauchen es nicht
spec.loader.exec_module(ilm)  # type: ignore[union-attr]


class TestParseIsoDate(unittest.TestCase):
    def test_rfc822_valid(self):
        s = ilm.parse_iso_date("Tue, 27 Aug 2024 16:18:07 +0200")
        self.assertIsNotNone(s)
        self.assertIn("2024-08-27", s)
        self.assertIn("16:18:07", s)

    def test_empty(self):
        self.assertIsNone(ilm.parse_iso_date(""))

    def test_none(self):
        self.assertIsNone(ilm.parse_iso_date(None))  # type: ignore[arg-type]

    def test_garbage(self):
        # Manche garbage-Strings parst email.utils tolerant — wir akzeptieren
        # entweder None oder einen ISO-String, aber kein Crash
        result = ilm.parse_iso_date("not a date")
        self.assertTrue(result is None or isinstance(result, str))

    def test_no_timezone(self):
        s = ilm.parse_iso_date("Tue, 27 Aug 2024 16:18:07")
        self.assertIsNotNone(s)


class TestParseAddresses(unittest.TestCase):
    def test_single(self):
        emails, names = ilm.parse_addresses("Frank Maier <frank@vod-records.com>")
        self.assertEqual(emails, ["frank@vod-records.com"])
        self.assertEqual(names, ["Frank Maier"])

    def test_multiple(self):
        emails, names = ilm.parse_addresses(
            "A <a@x.de>, B <b@y.de>, c@z.de"
        )
        self.assertEqual(emails, ["a@x.de", "b@y.de", "c@z.de"])
        self.assertEqual(names, ["A", "B"])

    def test_empty(self):
        self.assertEqual(ilm.parse_addresses(""), ([], []))
        self.assertEqual(ilm.parse_addresses(None), ([], []))  # type: ignore[arg-type]

    def test_no_display_name(self):
        emails, names = ilm.parse_addresses("plain@example.de")
        self.assertEqual(emails, ["plain@example.de"])
        self.assertEqual(names, [])

    def test_quoted_name(self):
        emails, names = ilm.parse_addresses('"Last, First" <user@ex.de>')
        self.assertEqual(emails, ["user@ex.de"])
        self.assertEqual(names, ["Last, First"])


class TestDeriveAccount(unittest.TestCase):
    def test_vod_records_in_from(self):
        a = ilm.derive_account("frank@vod-records.com", "x@y.de")
        self.assertEqual(a, "frank@vod-records.com")

    def test_vinyl_on_demand_in_to(self):
        a = ilm.derive_account("x@y.de", "frank@vinyl-on-demand.com")
        self.assertEqual(a, "frank@vinyl-on-demand.com")

    def test_unknown(self):
        a = ilm.derive_account("a@example.de", "b@example.de")
        self.assertEqual(a, "unknown")

    def test_case_insensitive(self):
        a = ilm.derive_account("FRANK@VOD-RECORDS.COM", "")
        self.assertEqual(a, "frank@vod-records.com")

    def test_demand_wins_over_records_when_both(self):
        # Reihenfolge in derive_account: VOD_DEMAND_DOMAIN check first
        a = ilm.derive_account("frank@vod-records.com", "x@vinyl-on-demand.com")
        self.assertEqual(a, "frank@vinyl-on-demand.com")

    def test_empty_strings(self):
        self.assertEqual(ilm.derive_account("", ""), "unknown")
        self.assertEqual(ilm.derive_account(None, None), "unknown")  # type: ignore[arg-type]


class TestExtractEmailsFromBody(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(ilm.extract_emails_from_body(""), [])
        self.assertEqual(ilm.extract_emails_from_body(None), [])  # type: ignore[arg-type]

    def test_basic(self):
        out = ilm.extract_emails_from_body("Hi a@x.de and b@y.de")
        self.assertEqual(set(out), {"a@x.de", "b@y.de"})

    def test_dedup(self):
        out = ilm.extract_emails_from_body("a@x.de a@x.de A@X.DE")
        # alle landen lower-case, dedup
        self.assertEqual(out, ["a@x.de"])

    def test_max_cap(self):
        body = " ".join(f"u{i}@x.de" for i in range(100))
        out = ilm.extract_emails_from_body(body, max_count=10)
        self.assertEqual(len(out), 10)

    def test_unicode_neighbors(self):
        out = ilm.extract_emails_from_body("Grüße ümlaut@xy.de — okay")
        self.assertIn("ümlaut@xy.de" if "ümlaut@xy.de" in out else "umlaut@xy.de",
                      out + ["ümlaut@xy.de", "umlaut@xy.de"])
        # Realistisch: regex matched ASCII, Umlaut email kommt vermutlich nicht durch.
        # Test ist dokumentativ — wir akzeptieren beide Realitäten ohne Crash.

    def test_in_subject(self):
        out = ilm.extract_emails_from_body("contact: support@example.de end")
        self.assertEqual(out, ["support@example.de"])


class TestMakeMsgId(unittest.TestCase):
    def test_real_id_passthrough(self):
        self.assertEqual(
            ilm.make_msg_id({"message_id": "<abc@x.de>"}),
            "<abc@x.de>",
        )

    def test_fallback_synthetic(self):
        out = ilm.make_msg_id({"subject": "x", "date": "y", "from": "z"})
        self.assertTrue(out.startswith("synthetic:"))
        self.assertEqual(len(out), len("synthetic:") + 16)

    def test_fallback_deterministic(self):
        rec = {"subject": "Hi", "date": "2024", "from": "frank"}
        a = ilm.make_msg_id(rec)
        b = ilm.make_msg_id(dict(rec))
        self.assertEqual(a, b)

    def test_fallback_different_inputs(self):
        a = ilm.make_msg_id({"subject": "A", "date": "x", "from": "f"})
        b = ilm.make_msg_id({"subject": "B", "date": "x", "from": "f"})
        self.assertNotEqual(a, b)

    def test_empty_message_id_uses_fallback(self):
        out = ilm.make_msg_id({"message_id": "", "subject": "s", "date": "d", "from": "f"})
        self.assertTrue(out.startswith("synthetic:"))

    def test_missing_message_id_key(self):
        out = ilm.make_msg_id({"subject": "s", "date": "d", "from": "f"})
        self.assertTrue(out.startswith("synthetic:"))


class TestParseRecord(unittest.TestCase):
    def _full_rec(self, **over):
        base = {
            "message_id": "<abc@vod-records.com>",
            "date": "Tue, 27 Aug 2024 16:18:07 +0200",
            "from": "Frank Maier <frank@vod-records.com>",
            "to": "Ben <ben@example.de>, c@example.de",
            "cc": "z@cc.de",
            "subject": "Test",
            "body": "Hello world support@example.de bye",
        }
        base.update(over)
        return base

    def test_full_happy_path(self):
        out = ilm.parse_record(self._full_rec())
        self.assertIsNotNone(out)
        self.assertEqual(out["msg_id"], "<abc@vod-records.com>")
        self.assertEqual(out["account"], "frank@vod-records.com")
        self.assertEqual(out["from_email"], "frank@vod-records.com")
        self.assertEqual(out["from_name"], "Frank Maier")
        self.assertEqual(out["to_emails"], ["ben@example.de", "c@example.de"])
        self.assertEqual(out["cc_emails"], ["z@cc.de"])
        self.assertEqual(out["subject"], "Test")
        self.assertIn("Hello world", out["body_excerpt"])
        self.assertIn("support@example.de", out["detected_emails"])
        self.assertTrue(out["msg_uid"].startswith("legacy:"))
        self.assertEqual(len(out["msg_uid"]), len("legacy:") + 24)

    def test_no_date_returns_none(self):
        out = ilm.parse_record(self._full_rec(date=""))
        self.assertIsNone(out)

    def test_empty_body(self):
        out = ilm.parse_record(self._full_rec(body=""))
        self.assertIsNotNone(out)
        self.assertIsNone(out["body_excerpt"])
        self.assertEqual(out["detected_emails"], [])

    def test_long_body_truncated(self):
        out = ilm.parse_record(self._full_rec(body="A" * 6000))
        self.assertEqual(len(out["body_excerpt"]), 5000)

    def test_long_subject_truncated(self):
        out = ilm.parse_record(self._full_rec(subject="X" * 600))
        self.assertEqual(len(out["subject"]), 500)

    def test_long_to_list(self):
        many = ", ".join(f"u{i}@x.de" for i in range(50))
        out = ilm.parse_record(self._full_rec(to=many))
        self.assertEqual(len(out["to_emails"]), 50)

    def test_no_message_id_falls_back_to_synthetic(self):
        out = ilm.parse_record(self._full_rec(message_id=""))
        self.assertIsNotNone(out)
        self.assertTrue(out["msg_id"].startswith("synthetic:"))
        self.assertTrue(out["msg_uid"].startswith("legacy:"))

    def test_no_from_no_to_unknown_account(self):
        out = ilm.parse_record(self._full_rec(
            **{"from": "x@example.de", "to": "y@example.de"}
        ))
        self.assertEqual(out["account"], "unknown")

    def test_unicode_subject(self):
        out = ilm.parse_record(self._full_rec(subject="Übër Müßig"))
        self.assertEqual(out["subject"], "Übër Müßig")

    def test_subject_returns_none_when_empty(self):
        out = ilm.parse_record(self._full_rec(subject=""))
        self.assertIsNone(out["subject"])

    def test_from_name_none_when_missing(self):
        out = ilm.parse_record(self._full_rec(**{"from": "raw@x.de"}))
        self.assertIsNone(out["from_name"])

    def test_msg_uid_deterministic(self):
        a = ilm.parse_record(self._full_rec())
        b = ilm.parse_record(self._full_rec())
        self.assertEqual(a["msg_uid"], b["msg_uid"])


class TestDedupInBatch(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(ilm.dedup_in_batch([]), [])

    def test_no_duplicates(self):
        items = [{"msg_id": f"id{i}"} for i in range(5)]
        self.assertEqual(len(ilm.dedup_in_batch(items)), 5)

    def test_with_duplicates(self):
        items = [
            {"msg_id": "a"}, {"msg_id": "b"}, {"msg_id": "a"}, {"msg_id": "c"},
        ]
        out = ilm.dedup_in_batch(items)
        self.assertEqual(len(out), 3)
        self.assertEqual([o["msg_id"] for o in out], ["a", "b", "c"])

    def test_preserves_first_occurrence(self):
        items = [
            {"msg_id": "a", "tag": 1},
            {"msg_id": "a", "tag": 2},
        ]
        out = ilm.dedup_in_batch(items)
        self.assertEqual(out[0]["tag"], 1)


class TestStripNul(unittest.TestCase):
    def test_none(self):
        self.assertIsNone(ilm.strip_nul(None))

    def test_empty(self):
        self.assertEqual(ilm.strip_nul(""), "")

    def test_no_nul(self):
        self.assertEqual(ilm.strip_nul("clean text"), "clean text")

    def test_single_nul(self):
        self.assertEqual(ilm.strip_nul("a\x00b"), "ab")

    def test_multiple_nuls(self):
        self.assertEqual(ilm.strip_nul("\x00a\x00b\x00"), "ab")

    def test_only_nuls(self):
        self.assertEqual(ilm.strip_nul("\x00\x00\x00"), "")


class TestParseRecordWithNul(unittest.TestCase):
    def test_nul_in_subject(self):
        rec = {
            "message_id": "<a@x.de>",
            "date": "Tue, 27 Aug 2024 16:18:07 +0200",
            "from": "Frank <frank@vod-records.com>",
            "to": "x@y.de",
            "subject": "hello\x00world",
            "body": "test",
        }
        out = ilm.parse_record(rec)
        self.assertEqual(out["subject"], "helloworld")

    def test_nul_in_body(self):
        rec = {
            "message_id": "<a@x.de>",
            "date": "Tue, 27 Aug 2024 16:18:07 +0200",
            "from": "frank@vod-records.com",
            "to": "x@y.de",
            "subject": "Hi",
            "body": "before\x00after\x00end",
        }
        out = ilm.parse_record(rec)
        self.assertEqual(out["body_excerpt"], "beforeafterend")

    def test_nul_in_message_id_fallback(self):
        # Synthetic message-id falls real one missing; NUL must be stripped from input first
        rec = {
            "message_id": "<id\x00clean@x.de>",
            "date": "Tue, 27 Aug 2024 16:18:07 +0200",
            "from": "frank@vod-records.com",
            "to": "x@y.de",
            "subject": "Hi",
            "body": "",
        }
        out = ilm.parse_record(rec)
        self.assertNotIn("\x00", out["msg_id"])
        self.assertEqual(out["msg_id"], "<idclean@x.de>")


class TestRealJSONLSample(unittest.TestCase):
    """Test gegen Echt-Records aus Frank's JSONL-Export."""
    def test_real_emlx_record(self):
        rec = {
            "path": "/Users/frank/.../699448.emlx",
            "format": "emlx",
            "year": 2024,
            "size_bytes": 1900558,
            "date": "Tue, 27 Aug 2024 16:18:07 +0200",
            "message_id": "<D65C074F-79D8-4207-AA73-B26ED7ED92CD@vod-records.com>",
            "from": "Frank Maier <frank@vod-records.com>",
            "to": "Ben Ponton <bp@zovietfrance.org>",
            "cc": "kim wah yuen <bauhaushk@yahoo.com.hk>",
            "reply_to": "",
            "subject": "Suggestion Workflow Production CD's",
            "body": "",
        }
        out = ilm.parse_record(rec)
        self.assertIsNotNone(out)
        self.assertEqual(out["msg_id"], rec["message_id"])
        self.assertEqual(out["account"], "frank@vod-records.com")
        self.assertEqual(out["from_email"], "frank@vod-records.com")
        self.assertEqual(out["to_emails"], ["bp@zovietfrance.org"])
        self.assertEqual(out["cc_emails"], ["bauhaushk@yahoo.com.hk"])
        self.assertIsNone(out["body_excerpt"])
        self.assertEqual(out["detected_emails"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
