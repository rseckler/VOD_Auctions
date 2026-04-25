# Stammdaten-Editierbarkeit — Offene Lücken nach rc51.3

**Status:** Offen · **Datum:** 2026-04-25 · **Quelle:** Robin-Review nach rc51.3 Deploy
**Bezug:** [`CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md`](CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md)

Drei Lücken aus Frank-/Robin-Walkthrough auf `/admin/media/[id]`:

---

## Gap 1 — Format / Genre / Styles fehlen im Edit-Card

**Befund:** Backend ist komplett. `allowedReleaseFields` in `backend/src/api/admin/media/[id]/route.ts:227-254` enthält `format_id`, `genres`, `styles`, `credits`. POST-Handler würde sie schreiben.

**Frontend-Lücke:** Edit-Stammdaten-Card in `backend/src/admin/routes/media/[id]/page.tsx:1108-1277` rendert nur 8 Felder (Title, Artist, Label, Year, Country, Catalog No., Barcode, Description). Format / Genre / Styles wurden bei rc50/51 nicht in die Edit-UI migriert — Read-Mode zeigt sie korrekt (Zeilen 953, 962, 963), Edit-Mode hat keine Inputs.

**Fix:** Drei neue Picker im Edit-Card hinzufügen, sd-State-Variablen + Save-Payload erweitern. Kein Backend-Change.

---

## Gap 2 — Format / Genre nur via Dropdown (kein Freitext)

**Format (Pflicht-Dropdown, kein Freitext möglich):**
- `Release.format_id` ist FK auf `Format`-Tabelle (~39 Einträge, gruppiert per `format_group`).
- `FormatPickerModal` analog `CountryPickerModal` — Modal mit Group-Tabs (Vinyl / CD / Cassette / Digital / Other) + Suche.
- API: entweder neuer `/admin/formats/list`-Endpoint oder im bestehenden `/admin/media/filter-options` mitliefern.

**Genre (Pflicht-Dropdown, kuratierte Liste):**
- `Release.genres` ist `text[]`. Discogs-Standard: ~15 Top-Level-Genres (Rock, Electronic, Jazz, Industrial, Experimental, …).
- Statisches Dataset in `backend/src/admin/data/genres.ts` (analog `country-iso.ts`), Multi-Select-Picker.
- Cleanup-Migration für aktuelle Schmutzwerte (Free-Text-Drift aus Legacy/Discogs) — Mapping auf kuratierte Liste, Unmappbares löschen oder als Style umzieren.

**Styles — offene Entscheidung Robin:**
- Discogs hat ~500 Styles, Pflicht-Dropdown grenzwertig.
- Optionen: (a) Multi-Select aus voller Discogs-Liste, kein Freitext · (b) Multi-Select + Freitext-Fallback · (c) Status quo Freitext.
- → **Robin entscheidet.**

---

## Gap 3 — `article_number` wird bei NEUEN Releases nicht vergeben (Discogs UND tape-mag) — ✅ FIXED rc51.6 (2026-04-25)

**Status:** ✅ Live deployed via Migration `backend/scripts/migrations/2026-04-25_release_article_number_auto_assign.sql`. 22.630 NULL-Rows backfilled (Discogs + Legacy/Literatur), `BEFORE INSERT`-Trigger aktiv. Smoke-Test: Sequence advanced 52788→52789 nach synthetic INSERT/ROLLBACK. Sequence-Position: 52.788. Siehe CHANGELOG rc51.6.

**Befund — Bug war breiter als gedacht:**
- `article_number` wird heute nur an einer Stelle gesetzt: `scripts/generate_article_numbers.sql` — einmalige Bulk-Migration (Legacy-Bestand vom Cutover).
- **Tape-mag MySQL hat keine `article_number`-Spalte.** Die VOD-XXXXX-Nummern auf den ~41k Legacy-Releases wurden komplett vom VOD-System vergeben, nicht aus tape-mag gezogen.
- `legacy_sync_v2.py` syncht 14 Felder aus tape-mag (`scripts/legacy_sync_v2.py:179-194`) — `article_number` ist **nicht dabei**. Konsequenz: **wenn auf tape-mag.com heute ein neuer Artikel angelegt wird, kommt er beim nächsten Sync mit `article_number = NULL` an.**
- **Discogs-Import-Insert** (`backend/src/api/admin/discogs-import/commit/route.ts:696-748`) setzt `article_number` ebenfalls nicht → alle Discogs-Imports (Frank, Bremer, Pargmann, …) liegen mit `article_number = NULL` in der DB.
- Verify-Pfad (`erp/inventory/items/[id]/verify/route.ts`) erzeugt keine neuen Releases, nur `erp_inventory_item`-Rows + Updates auf bestehende Releases.

**Konzept-Doc-Widerspruch:** Zone-0-Beschreibung sagt "wird bei Import/Verify frisch vergeben" — nicht implementiert.

**Fix — `BEFORE INSERT` Trigger erschlägt alle Insert-Pfade automatisch:**

```sql
-- 1) Sequence mit Startwert nach existierendem Maximum
CREATE SEQUENCE IF NOT EXISTS release_article_number_seq;
SELECT setval('release_article_number_seq',
  COALESCE((SELECT MAX(substring(article_number from 'VOD-(\d+)')::int)
            FROM "Release"
            WHERE article_number ~ '^VOD-\d+$'), 0));

-- 2) Trigger-Funktion: nur bei NULL die nächste Nummer ziehen
CREATE OR REPLACE FUNCTION assign_release_article_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.article_number IS NULL THEN
    NEW.article_number := 'VOD-' || LPAD(nextval('release_article_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) BEFORE INSERT Trigger
DROP TRIGGER IF EXISTS trg_release_article_number ON "Release";
CREATE TRIGGER trg_release_article_number
  BEFORE INSERT ON "Release"
  FOR EACH ROW EXECUTE FUNCTION assign_release_article_number();

-- 4) Backfill aller bestehenden NULL-Rows (deterministisch nach createdAt)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn,
         nextval('release_article_number_seq') AS seq_val
  FROM "Release"
  WHERE article_number IS NULL
)
UPDATE "Release" r
SET article_number = 'VOD-' || LPAD(numbered.seq_val::text, 5, '0')
FROM numbered
WHERE r.id = numbered.id;
```

**Vorteile des Trigger-Ansatzes:**
- Greift **automatisch** für `legacy_sync_v2.py` (neue tape-mag-Anlagen), `discogs-import/commit`, zukünftige Manual-Add-Endpoints — kein Code-Pfad muss daran denken.
- Bestehende Rows unverändert (Trigger läuft nur bei INSERT, nicht UPDATE).
- Race-condition-frei (Sequence ist atomar).
- Idempotent: Trigger ignoriert Rows mit bereits gesetztem `article_number` (z.B. Backfill).

**Offene Frage:** Brauchen wir einen rein-manuellen Add-Release-Endpoint (Walk-In ohne Discogs-Match, ohne tape-mag)? Heute existiert keiner. Falls ja, gleicher Trigger greift automatisch.

---

## Empfohlenes Vorgehen

Ein RC-Bundle (rc51.4 oder rc52.0):
- **Frontend:** Format-Picker, Genre-Multi-Select, Styles (je nach Robin-Entscheidung) im Edit-Stammdaten-Card
- **Backend:** Sequence + Discogs-Import-Insert-Patch + Backfill-Script + Genre-Cleanup-Migration
- **Konzept-Doc:** Zone-0-Beschreibung präzisieren ("auto-vergeben bei Insert via Sequence, danach immutable"), Genre/Format/Styles als Pflicht-Dropdowns dokumentieren

**Blocker bis Start:** Robin-Entscheidung zu Styles (Option a/b/c) + manueller Add-Release-Endpoint ja/nein.
