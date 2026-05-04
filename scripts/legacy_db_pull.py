#!/usr/bin/env python3
"""
legacy_db_pull — E1 Legacy-MySQL-Pull (vodtapes + 3× maier_db).

Quellen (alle auf dedi99.your-server.de:3306, R/O-Accounts):
  - vodtapes              (tape-mag.com Members, 3.632 Rows in 3wadmin_extranet_user)
  - maier_db2013          (vod-records.com LIVE — 8.544 Customers + 17.315 Adressen)
  - maier_db1             (Pre-2013-Iteration — 3.114 Customers, datum=int Unix-TS)
  - maier_db11            (Snapshot 2012 — SKIP, Cross-Check only)

Target: crm_staging_contact + _email + _address + _phone + _transaction + _transaction_item

Verwendung:
    cd VOD_Auctions/scripts
    source venv/bin/activate
    # 1Password Service-Account-Token muss im Env sein
    python3 legacy_db_pull.py --source vodtapes_members
    python3 legacy_db_pull.py --source vod_records_db2013
    python3 legacy_db_pull.py --source vod_records_db1
    python3 legacy_db_pull.py --all       # alle drei sequentiell

Robin-Constraints (2026-05-03):
  - pwd-Spalten NIEMALS ziehen
  - _kunden_bank NIEMALS ziehen
  - Charset-Repair via ftfy bei Mojibake
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Iterator

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crm_staging_lib import (  # noqa: E402
    pull_run, crm_log_progress, op_get,
    upsert_staging_contact, insert_staging_email, insert_staging_address,
    insert_staging_phone, upsert_staging_transaction, insert_staging_transaction_item,
)

PARSER_VERSION = "v0.1-stub"

# 1Password-Items für DB-Credentials
DB_CONFIGS = {
    "vodtapes_members": {
        "host": "dedi99.your-server.de",
        "port": 3306,
        "database": "vodtapes",
        "user": "maier1_2_r",
        "op_item_id": "s5e7ebssyfyvtx4n3ehqirjtem",
        "op_field": "maier1_2_r Passwort",
        "pipeline": "e1_legacy_db",
    },
    "vod_records_db2013": {
        "host": "dedi99.your-server.de",
        "port": 3306,
        "database": "maier_db2013",
        "user": "maier_2013_r",
        "op_item_id": "ml4lcccpje4ocgxxvnjrojbtlm",
        "op_field": "R/O Passwort",
        "pipeline": "e1_legacy_db",
    },
    "vod_records_db1": {
        "host": "dedi99.your-server.de",
        "port": 3306,
        "database": "maier_db1",
        "user": "maier_r",
        "op_item_id": "bxedowvg33lzphnmrvty56j5zy",
        "op_field": "R/O Passwort",
        "pipeline": "e1_legacy_db",
    },
}


def get_mysql_connection(source: str):
    """Connect to legacy MySQL via R/O account, password from 1Password.

    Robust gegen Idle-Timeouts: connection_timeout=10, autocommit=True,
    use_pure=True (pure-Python statt CExtension, robuster bei langer Idle).
    """
    import mysql.connector
    cfg = DB_CONFIGS[source]
    pwd = op_get(cfg["op_item_id"], cfg["op_field"])
    return mysql.connector.connect(
        host=cfg["host"], port=cfg["port"],
        user=cfg["user"], password=pwd,
        database=cfg["database"],
        charset="utf8mb4", use_unicode=True,
        ssl_disabled=False,
        connection_timeout=20,
        autocommit=True,
        use_pure=True,
    )


def my_ping(conn_my, source: str = None):
    """Reconnect MySQL falls Verbindung weg. Bei Fail: neu öffnen."""
    try:
        conn_my.ping(reconnect=True, attempts=3, delay=2)
    except Exception as e:
        print(f"      [my_ping] reconnect failed: {e}; opening fresh", flush=True)
        return get_mysql_connection(source) if source else conn_my
    return conn_my


def load_customer_uuid_map(conn_pg, source: str) -> dict[int, str]:
    """Lädt {legacy_id_int → staging_contact_uuid} für eine Source aus Postgres.

    Wird benutzt, um die in-memory map nach einem Resume zu rekonstruieren.
    """
    cur = conn_pg.cursor()
    cur.execute(
        "SELECT source_record_id, id FROM crm_staging_contact WHERE source = %s",
        (source,),
    )
    result = {int(rid): str(uid) for rid, uid in cur.fetchall()}
    cur.close()
    return result


# ---------------------------------------------------------------------------
# Pull-Logik pro Quelle (Stubs — Implementation folgt in Sprint S2)
# ---------------------------------------------------------------------------

def pull_vodtapes_members(conn_my, conn_pg, run_id: str) -> dict:
    """Pull `3wadmin_extranet_user` (3.632 Members) → crm_staging_contact + _email + _phone.

    Schema (vodtapes.3wadmin_extranet_user — verifiziert via DESCRIBE 2026-05-03):
      id (PRI), name, vorname, email (UNI), pwd (NEVER pull), tel,
      position, exbild, bereich, fachgebiet, buero, kommentar, aktiv

    Mapping → crm_staging_contact:
      source              = 'vodtapes_members'
      source_record_id    = str(id)
      display_name        = "{vorname} {name}".strip()  bzw. nur was da ist
      first_name          = vorname (NULL wenn leer)
      last_name           = name (NULL wenn leer)
      contact_type        = 'person' (Member-Login = persönlich)
      primary_email       = email (lower in primary_email_lower)
      raw_payload         = {position, bereich, fachgebiet, buero, kommentar, aktiv}
                            (= alle Custom-Felder zur Audit-Spur)

    Plus pro Row:
      - insert_staging_email wenn email nicht leer
      - insert_staging_phone wenn tel nicht leer
    """
    cur_my = conn_my.cursor(dictionary=True)
    cur_my.execute("""
        SELECT id, name, vorname, email, tel,
               position, bereich, fachgebiet, buero, kommentar, aktiv
        FROM 3wadmin_extranet_user
        ORDER BY id
    """)

    contacts = emails_inserted = phones_inserted = 0

    for row in cur_my:
        rec_id = str(row["id"])
        first = (row.get("vorname") or "").strip() or None
        last = (row.get("name") or "").strip() or None
        email = (row.get("email") or "").strip() or None
        tel = (row.get("tel") or "").strip() or None

        display_name = " ".join(p for p in (first, last) if p) or email or f"member-{rec_id}"

        # Audit-Payload: alle Felder die nicht in Standard-Spalten gehen
        raw = {
            "position": row.get("position"),
            "bereich": row.get("bereich"),
            "fachgebiet": row.get("fachgebiet"),
            "buero": row.get("buero"),
            "kommentar": (row.get("kommentar") or "").strip() or None,
            "aktiv": row.get("aktiv"),
        }

        contact_id = upsert_staging_contact(
            conn_pg,
            pull_run_id=run_id,
            source="vodtapes_members",
            source_record_id=rec_id,
            display_name=display_name,
            first_name=first,
            last_name=last,
            company=None,
            contact_type="person",
            primary_email=email,
            country_code=None,
            raw_payload=raw,
        )
        contacts += 1

        if email:
            insert_staging_email(
                conn_pg,
                staging_contact_id=contact_id,
                source="vodtapes_members",
                source_record_id=rec_id,
                email=email,
                is_primary=True,
                is_verified=False,
                confidence=1.0,
            )
            emails_inserted += 1

        if tel:
            insert_staging_phone(
                conn_pg,
                staging_contact_id=contact_id,
                source="vodtapes_members",
                source_record_id=rec_id,
                phone=tel,
                phone_type="landline",
                is_primary=True,
            )
            phones_inserted += 1

        # Commit alle 200 Rows
        if contacts % 200 == 0:
            conn_pg.commit()
            print(f"    [vodtapes_members] {contacts} contacts processed", flush=True)

    cur_my.close()
    conn_pg.commit()
    return {"contacts": contacts, "emails": emails_inserted, "phones": phones_inserted}


def pull_vod_records_db2013(conn_my, conn_pg, run_id: str) -> dict:
    """Pull maier_db2013 (vod-records.com / vinyl-on-demand.com LIVE-Webshop).

    Vier Sub-Pässe:
      Pass 1: kunden + emails + phones (8.544 Rows)
      Pass 2: kunden_adresse (17.315 Rows, FK kid → kunden.id)
      Pass 3: kunden_alt mit source='vod_records_db2013_alt' (3.097 Rows, separater Bestand)
      Pass 4: bestellungen + bestellungen_artikel (8.230 + 13.617 Rows)

    Schema-Notizen:
      - kunden: id, wid (eindeutige Kundennr), email (MUL), tel, fax, pwd (NEVER), nick,
                bild, datum (datetime), kundentyp, preisliste, liquide, sprache
      - kunden_adresse: id, kid (FK), typ (1=Rech, 2=Liefer), anrede, titel, firma,
                        vorname, name, strasse, plz, ort, staat, land (FK on shop_countries.id), datum
      - kunden_alt: anderes (älteres) Schema mit allem inline — als separater source eingetragen
      - bestellungen: gesamtpreis, versandkosten, status, paketnr, rechadr/lieferadr (Text-Snapshot)
      - bestellungen_artikel: bid varchar(40) FK auf bestellungen.id (int → CAST nötig beim JOIN)
    """
    SOURCE = "vod_records_db2013"
    SOURCE_ALT = "vod_records_db2013_alt"

    counts = {"contacts": 0, "emails": 0, "phones": 0, "addresses": 0,
              "contacts_alt": 0, "transactions": 0, "items": 0}

    # Pre-fetch country-Lookup (id → land-name)
    conn_my = my_ping(conn_my, SOURCE)
    cur_my = conn_my.cursor(dictionary=True)
    cur_my.execute("SELECT id, land FROM 3wadmin_shop_laender")
    laender_map = {row["id"]: (row["land"] or "").strip() for row in cur_my.fetchall()}
    cur_my.close()
    print(f"    [db2013] Loaded {len(laender_map)} country mappings", flush=True)

    # ------------------------------------------------------------------
    # PASS 1: kunden → contact + email + phone
    # ------------------------------------------------------------------
    print("    [db2013] PASS 1: kunden", flush=True)
    conn_my = my_ping(conn_my, SOURCE)
    cur_my = conn_my.cursor(dictionary=True)
    cur_my.execute("""
        SELECT id, wid, email, tel, fax, nick, bild, datum,
               kundentyp, preisliste, liquide, sprache
        FROM 3wadmin_shop_kunden
        ORDER BY id
    """)
    kunden_rows = cur_my.fetchall()    # alles in Memory laden, MySQL-Conn idle-frei
    cur_my.close()
    print(f"      Fetched {len(kunden_rows)} kunden rows in memory", flush=True)
    # Track contact_id für Pass 2 (Adressen) — kid → staging_contact_uuid
    customer_uuid_map: dict[int, str] = {}

    for row in kunden_rows:
        rec_id = str(row["id"])
        email = (row.get("email") or "").strip() or None
        tel = (row.get("tel") or "").strip() or None
        fax = (row.get("fax") or "").strip() or None
        nick = (row.get("nick") or "").strip() or None
        wid = (row.get("wid") or "").strip() or None
        display = nick or wid or email or f"customer-{rec_id}"

        raw = {
            "wid": wid,
            "kundentyp": row.get("kundentyp"),
            "preisliste": row.get("preisliste"),
            "liquide": row.get("liquide"),
            "sprache": row.get("sprache"),
            "nick": nick,
            "bild": (row.get("bild") or "").strip() or None,
        }

        contact_id = upsert_staging_contact(
            conn_pg,
            pull_run_id=run_id,
            source=SOURCE,
            source_record_id=rec_id,
            display_name=display,
            first_name=None,    # kommt aus Adresse-Pass
            last_name=None,
            company=None,
            contact_type=None,  # wird in Pass 2 ggf. auf 'business' gesetzt
            primary_email=email,
            country_code=None,
            source_created_at=row.get("datum"),
            raw_payload=raw,
        )
        customer_uuid_map[row["id"]] = contact_id
        counts["contacts"] += 1

        if email:
            insert_staging_email(
                conn_pg, staging_contact_id=contact_id,
                source=SOURCE, source_record_id=rec_id,
                email=email, is_primary=True, is_verified=False, confidence=1.0,
            )
            counts["emails"] += 1

        if tel:
            insert_staging_phone(
                conn_pg, staging_contact_id=contact_id,
                source=SOURCE, source_record_id=rec_id,
                phone=tel, phone_type="landline", is_primary=True,
            )
            counts["phones"] += 1

        if fax:
            insert_staging_phone(
                conn_pg, staging_contact_id=contact_id,
                source=SOURCE, source_record_id=rec_id,
                phone=fax, phone_type="fax", is_primary=False,
            )
            counts["phones"] += 1

        if counts["contacts"] % 500 == 0:
            conn_pg.commit()
            print(f"      [pass 1] {counts['contacts']} contacts", flush=True)

    conn_pg.commit()
    print(f"    [db2013] PASS 1 done: contacts={counts['contacts']}, emails={counts['emails']}, phones={counts['phones']}", flush=True)

    # Falls map leer (Resume-Szenario): aus Postgres rekonstruieren
    if not customer_uuid_map:
        customer_uuid_map = load_customer_uuid_map(conn_pg, SOURCE)
        print(f"      [resume] Loaded {len(customer_uuid_map)} customers from staging", flush=True)

    # ------------------------------------------------------------------
    # PASS 2: kunden_adresse → address (1:N pro contact)
    # ------------------------------------------------------------------
    print("    [db2013] PASS 2: kunden_adresse", flush=True)
    conn_my = my_ping(conn_my, SOURCE)
    cur_my = conn_my.cursor(dictionary=True)
    cur_my.execute("""
        SELECT id, kid, typ, anrede, titel, firma, vorname, name,
               strasse, plz, ort, staat, land, datum
        FROM 3wadmin_shop_kunden_adresse
        ORDER BY kid, typ, id
    """)
    adresse_rows = cur_my.fetchall()
    cur_my.close()
    print(f"      Fetched {len(adresse_rows)} kunden_adresse rows in memory", flush=True)
    # Tracker: erste Adresse pro (kid,typ) ist primary
    seen_primary: set[tuple[int, int]] = set()

    for row in adresse_rows:
        kid = row.get("kid")
        contact_id = customer_uuid_map.get(kid)
        if contact_id is None:
            # orphan — sollte nicht vorkommen, aber loggen
            continue

        typ_int = row.get("typ") or 0
        addr_type = "billing" if typ_int == 1 else "shipping" if typ_int == 2 else None
        primary_key = (kid, typ_int)
        is_primary = primary_key not in seen_primary
        seen_primary.add(primary_key)

        firma = (row.get("firma") or "").strip() or None
        country_name = laender_map.get(row.get("land"))

        insert_staging_address(
            conn_pg,
            staging_contact_id=contact_id,
            source=SOURCE,
            source_record_id=str(row["id"]),
            type=addr_type,
            salutation=(row.get("anrede") or "").strip() or None,
            title=(row.get("titel") or "").strip() or None,
            company=firma,
            first_name=(row.get("vorname") or "").strip() or None,
            last_name=(row.get("name") or "").strip() or None,
            street=(row.get("strasse") or "").strip() or None,
            postal_code=(row.get("plz") or "").strip() or None,
            city=(row.get("ort") or "").strip() or None,
            region=(row.get("staat") or "").strip() or None,
            country=country_name,
            country_code=None,  # ISO-2 erst im Resolver Phase 2
            valid_from=row.get("datum"),
            is_primary=is_primary,
            raw_payload={"kid": kid, "typ_int": typ_int, "land_id": row.get("land")},
        )
        counts["addresses"] += 1

        if counts["addresses"] % 1000 == 0:
            conn_pg.commit()
            print(f"      [pass 2] {counts['addresses']} addresses", flush=True)

    conn_pg.commit()
    print(f"    [db2013] PASS 2 done: addresses={counts['addresses']}", flush=True)

    # ------------------------------------------------------------------
    # PASS 3: kunden_alt → separater contact-Bestand
    #
    # Das _kunden_alt-Schema entspricht dem alten maier_db1-Format und enthält
    # Pre-2013-Customer-Data, die beim Schema-Upgrade nicht ins neue
    # kunden+kunden_adresse-Modell konvertiert wurde.
    # ------------------------------------------------------------------
    print("    [db2013] PASS 3: kunden_alt", flush=True)
    conn_my = my_ping(conn_my, SOURCE)
    cur_my = conn_my.cursor(dictionary=True)
    cur_my.execute("""
        SELECT id, anrede, firma, vorname, name, strasse, plz, ort, staat, land,
               tel, fax, email, datum
        FROM 3wadmin_shop_kunden_alt
        ORDER BY id
    """)
    alt_rows = cur_my.fetchall()
    cur_my.close()
    print(f"      Fetched {len(alt_rows)} kunden_alt rows in memory", flush=True)
    for row in alt_rows:
        rec_id = str(row["id"])
        email = (row.get("email") or "").strip() or None
        firma = (row.get("firma") or "").strip() or None
        first = (row.get("vorname") or "").strip() or None
        last = (row.get("name") or "").strip() or None
        tel = (row.get("tel") or "").strip() or None
        fax = (row.get("fax") or "").strip() or None
        country_name = laender_map.get(row.get("land"))

        display = " ".join(p for p in (first, last) if p) or firma or email or f"alt-{rec_id}"
        # datum ist int Unix-TS in alt-table
        from datetime import datetime, timezone
        d_raw = row.get("datum")
        source_created = datetime.fromtimestamp(d_raw, tz=timezone.utc) if isinstance(d_raw, int) and d_raw > 0 else None

        contact_id = upsert_staging_contact(
            conn_pg,
            pull_run_id=run_id,
            source=SOURCE_ALT,
            source_record_id=rec_id,
            display_name=display,
            first_name=first,
            last_name=last,
            company=firma,
            contact_type="business" if firma else "person",
            primary_email=email,
            country_code=None,
            source_created_at=source_created,
            raw_payload={"datum_unix": d_raw, "land_id": row.get("land")},
        )
        counts["contacts_alt"] += 1

        if email:
            insert_staging_email(
                conn_pg, staging_contact_id=contact_id,
                source=SOURCE_ALT, source_record_id=rec_id,
                email=email, is_primary=True, is_verified=False, confidence=1.0,
            )
            counts["emails"] += 1

        # Inline Adresse aus _alt-Row → eine Adresse pro Customer
        if any([first, last, firma, row.get("strasse"), row.get("plz")]):
            insert_staging_address(
                conn_pg,
                staging_contact_id=contact_id,
                source=SOURCE_ALT,
                source_record_id=rec_id,
                type="billing",  # _alt hatte nur eine Adresse
                salutation=(row.get("anrede") or "").strip() or None,
                company=firma,
                first_name=first,
                last_name=last,
                street=(row.get("strasse") or "").strip() or None,
                postal_code=(row.get("plz") or "").strip() or None,
                city=(row.get("ort") or "").strip() or None,
                region=(row.get("staat") or "").strip() or None,
                country=country_name,
                is_primary=True,
                raw_payload={"land_id": row.get("land")},
            )
            counts["addresses"] += 1

        if tel:
            insert_staging_phone(
                conn_pg, staging_contact_id=contact_id,
                source=SOURCE_ALT, source_record_id=rec_id,
                phone=tel, phone_type="landline", is_primary=True,
            )
            counts["phones"] += 1
        if fax:
            insert_staging_phone(
                conn_pg, staging_contact_id=contact_id,
                source=SOURCE_ALT, source_record_id=rec_id,
                phone=fax, phone_type="fax", is_primary=False,
            )
            counts["phones"] += 1

        if counts["contacts_alt"] % 500 == 0:
            conn_pg.commit()
            print(f"      [pass 3] {counts['contacts_alt']} alt-contacts", flush=True)

    conn_pg.commit()
    print(f"    [db2013] PASS 3 done: alt-contacts={counts['contacts_alt']}", flush=True)

    # ------------------------------------------------------------------
    # PASS 4: bestellungen + bestellungen_artikel → transactions + items
    # ------------------------------------------------------------------
    print("    [db2013] PASS 4: bestellungen", flush=True)
    conn_my = my_ping(conn_my, SOURCE)

    # First: alle Items gruppiert nach bid (FK auf bestellungen.id)
    cur_items = conn_my.cursor(dictionary=True)
    cur_items.execute("""
        SELECT bid, artikel, artnr, anzahl, typ, spezial, besch, preis, steuer
        FROM 3wadmin_shop_bestellungen_artikel
        ORDER BY CAST(bid AS UNSIGNED), id
    """)
    items_by_bid: dict[str, list[dict]] = {}
    for it in cur_items.fetchall():
        bid = str(it["bid"]).strip()
        items_by_bid.setdefault(bid, []).append(it)
    cur_items.close()
    print(f"      Pre-fetched items for {len(items_by_bid)} bestellungen-IDs", flush=True)

    conn_my = my_ping(conn_my, SOURCE)
    cur_my = conn_my.cursor(dictionary=True)
    cur_my.execute("""
        SELECT id, kunde, kundentyp, lieferid, rechadr, lieferadr, datum,
               zahlungsart, zalung_gebuehr, anmerkung, gemahnt, bezahlt, versand,
               versandkosten, versand_steuer, gesamtpreis, gutschein, gutschein_wert,
               status, paketnr, rezension
        FROM 3wadmin_shop_bestellungen
        ORDER BY id
    """)
    bestellungen_rows = cur_my.fetchall()
    cur_my.close()
    print(f"      Fetched {len(bestellungen_rows)} bestellungen rows in memory", flush=True)
    for row in bestellungen_rows:
        rec_id = str(row["id"])
        kunde_id = row.get("kunde")
        bezahlt = row.get("bezahlt")

        # Status-Mapping
        status_text = (
            "paid" if bezahlt == 1 else
            "open" if bezahlt == 0 else
            f"raw_{bezahlt}"
        )

        gesamt = row.get("gesamtpreis")
        # Negativ-Beträge → credit_note
        doc_type = "credit_note" if (gesamt is not None and gesamt < 0) else "invoice"

        # Doc-Date (datum ist datetime in db2013)
        doc_date = row.get("datum")
        if doc_date is None:
            counts.setdefault("transactions_skipped_no_date", 0)
            counts["transactions_skipped_no_date"] += 1
            continue
        # datetime → date
        doc_date_only = doc_date.date() if hasattr(doc_date, "date") else doc_date

        raw = {
            "kundentyp": row.get("kundentyp"),
            "lieferid": row.get("lieferid"),
            "anmerkung": (row.get("anmerkung") or "").strip() or None,
            "gemahnt": row.get("gemahnt"),
            "bezahlt_raw": bezahlt,
            "versand": row.get("versand"),
            "versand_steuer": row.get("versand_steuer"),
            "zalung_gebuehr": float(row["zalung_gebuehr"]) if row.get("zalung_gebuehr") is not None else None,
            "gutschein": (row.get("gutschein") or "").strip() or None,
            "gutschein_wert": float(row["gutschein_wert"]) if row.get("gutschein_wert") is not None else None,
            "status_raw": row.get("status"),
            "rezension": row.get("rezension"),
        }

        tx_id = upsert_staging_transaction(
            conn_pg,
            pull_run_id=run_id,
            source=SOURCE,
            source_record_id=rec_id,
            customer_source=SOURCE,
            customer_source_record_id=str(kunde_id) if kunde_id is not None else "",
            doc_type=doc_type,
            doc_number=None,    # MO-Format gibt's hier nicht — Bestell-ID ist die einzige Referenz
            doc_date=doc_date_only,
            total_gross=float(gesamt) if gesamt is not None else None,
            shipping_cost=float(row["versandkosten"]) if row.get("versandkosten") is not None else None,
            currency="EUR",
            status=status_text,
            payment_method=str(row.get("zahlungsart")) if row.get("zahlungsart") is not None else None,
            package_tracking=(row.get("paketnr") or "").strip() or None,
            billing_address_raw=(row.get("rechadr") or "").strip() or None,
            shipping_address_raw=(row.get("lieferadr") or "").strip() or None,
            raw_payload=raw,
        )
        counts["transactions"] += 1

        # Items für diese Bestellung
        for pos, it in enumerate(items_by_bid.get(rec_id, []), 1):
            preis = it.get("preis")
            anzahl = it.get("anzahl") or 1
            insert_staging_transaction_item(
                conn_pg,
                transaction_id=tx_id,
                position=pos,
                article_no=(it.get("artnr") or "").strip() or None,
                article_name=(it.get("besch") or "").strip() or "(no description)",
                quantity=float(anzahl),
                unit_price=float(preis) if preis is not None else None,
                vat_rate=None,  # steuer ist FK auf mwst-Tabelle (Phase 2 resolven)
                line_total_gross=float(preis) * float(anzahl) if preis is not None else None,
                raw_payload={"artikel_id": it.get("artikel"),
                             "typ": it.get("typ"),
                             "spezial": it.get("spezial"),
                             "steuer_id": it.get("steuer")},
            )
            counts["items"] += 1

        if counts["transactions"] % 500 == 0:
            conn_pg.commit()
            print(f"      [pass 4] {counts['transactions']} transactions / {counts['items']} items", flush=True)

    conn_pg.commit()
    print(f"    [db2013] PASS 4 done: transactions={counts['transactions']}, items={counts['items']}", flush=True)

    return counts


# ---------------------------------------------------------------------------
# Entry-Point
# ---------------------------------------------------------------------------

def pull_vod_records_db1(conn_my, conn_pg, run_id: str) -> dict:
    """Pull maier_db1 (Pre-2013-Webshop, älteres Schema).

    Schema-Unterschiede zu db2013:
      - kunden hat alles inline (anrede, firma, vorname, name, strasse, plz, ort,
        staat, land, tel, fax, email, datum=int Unix-TS) — KEINE separate Adress-Tabelle
      - bestellungen schmaler: kein gesamtpreis, kein paketnr, kein rechadr/lieferadr
      - bestellungen_artikel: kein artnr-Snapshot, kein steuer
      - datum-Felder sind alle int (Unix-TS), in Python konvertiert

    Vermutlich Pre-2013-Iteration des vod-records.com-Shops, vom Schema-Upgrade
    nicht in db2013 migriert (3.097 Pre-2013-Customers landeten im _kunden_alt
    von db2013, restliche ~3.114 sind hier separat).
    """
    from datetime import datetime, timezone

    SOURCE = "vod_records_db1"
    counts = {"contacts": 0, "emails": 0, "phones": 0, "addresses": 0,
              "transactions": 0, "items": 0}

    cur_my = conn_my.cursor(dictionary=True)

    # Country-Lookup
    cur_my.execute("SELECT id, land FROM 3wadmin_shop_laender")
    laender_map = {row["id"]: (row["land"] or "").strip() for row in cur_my.fetchall()}

    def unix_to_dt(ts):
        if isinstance(ts, int) and ts > 0:
            try:
                return datetime.fromtimestamp(ts, tz=timezone.utc)
            except (OSError, OverflowError):
                return None
        return None

    # ------------------------------------------------------------------
    # PASS 1: kunden → contact + email + phone + (inline) address
    # ------------------------------------------------------------------
    print("    [db1] PASS 1: kunden", flush=True)
    cur_my.execute("""
        SELECT id, anrede, firma, vorname, name, strasse, plz, ort, staat, land,
               tel, fax, email, datum
        FROM 3wadmin_shop_kunden
        ORDER BY id
    """)
    customer_uuid_map: dict[int, str] = {}

    for row in cur_my:
        rec_id = str(row["id"])
        first = (row.get("vorname") or "").strip() or None
        last = (row.get("name") or "").strip() or None
        firma = (row.get("firma") or "").strip() or None
        email = (row.get("email") or "").strip() or None
        tel = (row.get("tel") or "").strip() or None
        fax = (row.get("fax") or "").strip() or None
        country_name = laender_map.get(row.get("land"))
        d_unix = row.get("datum")
        source_created = unix_to_dt(d_unix)

        display = " ".join(p for p in (first, last) if p) or firma or email or f"db1-{rec_id}"

        contact_id = upsert_staging_contact(
            conn_pg,
            pull_run_id=run_id,
            source=SOURCE,
            source_record_id=rec_id,
            display_name=display,
            first_name=first,
            last_name=last,
            company=firma,
            contact_type="business" if firma else "person",
            primary_email=email,
            country_code=None,
            source_created_at=source_created,
            raw_payload={"datum_unix": d_unix, "land_id": row.get("land")},
        )
        customer_uuid_map[row["id"]] = contact_id
        counts["contacts"] += 1

        # Inline-Adresse aus kunden-Row (db1 hatte keine separate Tabelle)
        if any([first, last, firma, row.get("strasse"), row.get("plz"), row.get("ort")]):
            insert_staging_address(
                conn_pg,
                staging_contact_id=contact_id,
                source=SOURCE,
                source_record_id=rec_id,
                type="billing",
                salutation=(row.get("anrede") or "").strip() or None,
                company=firma,
                first_name=first,
                last_name=last,
                street=(row.get("strasse") or "").strip() or None,
                postal_code=(row.get("plz") or "").strip() or None,
                city=(row.get("ort") or "").strip() or None,
                region=(row.get("staat") or "").strip() or None,
                country=country_name,
                is_primary=True,
                raw_payload={"land_id": row.get("land")},
            )
            counts["addresses"] += 1

        if email:
            insert_staging_email(
                conn_pg, staging_contact_id=contact_id,
                source=SOURCE, source_record_id=rec_id,
                email=email, is_primary=True, is_verified=False, confidence=1.0,
            )
            counts["emails"] += 1

        if tel:
            insert_staging_phone(
                conn_pg, staging_contact_id=contact_id,
                source=SOURCE, source_record_id=rec_id,
                phone=tel, phone_type="landline", is_primary=True,
            )
            counts["phones"] += 1
        if fax:
            insert_staging_phone(
                conn_pg, staging_contact_id=contact_id,
                source=SOURCE, source_record_id=rec_id,
                phone=fax, phone_type="fax", is_primary=False,
            )
            counts["phones"] += 1

        if counts["contacts"] % 500 == 0:
            conn_pg.commit()
            print(f"      [pass 1] {counts['contacts']} contacts", flush=True)

    conn_pg.commit()
    print(f"    [db1] PASS 1 done: contacts={counts['contacts']}, addresses={counts['addresses']}", flush=True)

    # ------------------------------------------------------------------
    # PASS 2: bestellungen + items (schmaleres Schema)
    # ------------------------------------------------------------------
    print("    [db1] PASS 2: bestellungen", flush=True)

    # Items pre-fetchen, gruppiert nach bid (varchar)
    cur_items = conn_my.cursor(dictionary=True)
    cur_items.execute("""
        SELECT bid, artikel, anzahl, typ, spezial, besch, preis
        FROM 3wadmin_shop_bestellungen_artikel
        ORDER BY CAST(bid AS UNSIGNED), id
    """)
    items_by_bid: dict[str, list[dict]] = {}
    for it in cur_items.fetchall():
        bid = str(it["bid"]).strip()
        items_by_bid.setdefault(bid, []).append(it)
    cur_items.close()
    print(f"      Pre-fetched items for {len(items_by_bid)} bestellungen-IDs", flush=True)

    cur_my.execute("""
        SELECT id, kunde, datum, zahlungsart, anmerkung, gemahnt, bezahlt, versand, versandkosten
        FROM 3wadmin_shop_bestellungen
        ORDER BY id
    """)

    for row in cur_my:
        rec_id = str(row["id"])
        kunde_id = row.get("kunde")
        bezahlt = row.get("bezahlt")
        d_unix = row.get("datum")
        d_dt = unix_to_dt(d_unix)
        if d_dt is None:
            counts.setdefault("transactions_skipped_no_date", 0)
            counts["transactions_skipped_no_date"] += 1
            continue
        doc_date_only = d_dt.date()

        status_text = "paid" if bezahlt == 1 else "open" if bezahlt == 0 else f"raw_{bezahlt}"

        # Total aus Items aggregieren (kein gesamtpreis-Feld in db1)
        total_gross = None
        items = items_by_bid.get(rec_id, [])
        if items:
            total_gross = sum(
                (float(it["preis"]) * float(it["anzahl"]))
                for it in items
                if it.get("preis") is not None and it.get("anzahl") is not None
            )

        doc_type = "credit_note" if (total_gross is not None and total_gross < 0) else "invoice"

        raw = {
            "anmerkung": (row.get("anmerkung") or "").strip() or None,
            "gemahnt": row.get("gemahnt"),
            "bezahlt_raw": bezahlt,
            "versand": row.get("versand"),
            "datum_unix": d_unix,
        }

        tx_id = upsert_staging_transaction(
            conn_pg,
            pull_run_id=run_id,
            source=SOURCE,
            source_record_id=rec_id,
            customer_source=SOURCE,
            customer_source_record_id=str(kunde_id) if kunde_id is not None else "",
            doc_type=doc_type,
            doc_date=doc_date_only,
            total_gross=total_gross,
            shipping_cost=float(row["versandkosten"]) if row.get("versandkosten") is not None else None,
            currency="EUR",
            status=status_text,
            payment_method=str(row.get("zahlungsart")) if row.get("zahlungsart") is not None else None,
            raw_payload=raw,
        )
        counts["transactions"] += 1

        for pos, it in enumerate(items, 1):
            preis = it.get("preis")
            anzahl = it.get("anzahl") or 1
            insert_staging_transaction_item(
                conn_pg,
                transaction_id=tx_id,
                position=pos,
                article_no=None,    # db1 hat keinen artnr-Snapshot
                article_name=(it.get("besch") or "").strip() or "(no description)",
                quantity=float(anzahl),
                unit_price=float(preis) if preis is not None else None,
                line_total_gross=float(preis) * float(anzahl) if preis is not None else None,
                raw_payload={"artikel_id": it.get("artikel"),
                             "typ": it.get("typ"),
                             "spezial": it.get("spezial")},
            )
            counts["items"] += 1

        if counts["transactions"] % 500 == 0:
            conn_pg.commit()
            print(f"      [pass 2] {counts['transactions']} transactions / {counts['items']} items", flush=True)

    conn_pg.commit()
    cur_my.close()
    print(f"    [db1] PASS 2 done: transactions={counts['transactions']}, items={counts['items']}", flush=True)

    return counts


PULLERS = {
    "vodtapes_members": pull_vodtapes_members,
    "vod_records_db2013": pull_vod_records_db2013,
    "vod_records_db1": pull_vod_records_db1,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=list(DB_CONFIGS.keys()), help="Einzelne Quelle pullen")
    ap.add_argument("--all", action="store_true", help="Alle 3 Quellen sequentiell")
    args = ap.parse_args()

    if not args.source and not args.all:
        ap.error("--source oder --all angeben")

    sources = list(DB_CONFIGS.keys()) if args.all else [args.source]

    for source in sources:
        cfg = DB_CONFIGS[source]
        print(f"\n[e1_legacy_db] === {source} ({cfg['database']} via {cfg['user']}) ===")

        conn_my = get_mysql_connection(source)
        try:
            with pull_run(source, cfg["pipeline"], parser_version=PARSER_VERSION) as (run_id, conn_pg):
                puller = PULLERS[source]
                stats = puller(conn_my, conn_pg, run_id)
                print(f"  stats={stats}")
                crm_log_progress(conn_pg, run_id,
                                 rows_inserted=stats.get("contacts", 0) + stats.get("transactions", 0))
        finally:
            conn_my.close()


if __name__ == "__main__":
    main()
