# Stammdaten-Editierbarkeit — Lücken nach rc51.3 (alle 3 Gaps geschlossen)

**Status:** ✅ **ALLE GAPS GESCHLOSSEN** (2026-04-25 · rc51.6 + rc51.8 + rc51.9)
**Quelle:** Robin-Review nach rc51.3 Deploy
**Bezug:** [`CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md`](CATALOG_STAMMDATEN_EDITABILITY_KONZEPT.md)

| Gap | Thema | Release | Date |
|---|---|---|---|
| 1 | Format / Genre / Styles im Edit-Card sichtbar | rc51.8 + rc51.9 | 2026-04-25 |
| 2 | Format + Genre als Pflicht-Dropdown | rc51.8 + rc51.9 | 2026-04-25 |
| 3 | `article_number` Auto-Assign bei Insert | rc51.6 | 2026-04-25 |

---

## Gap 1 — Format / Genre / Styles fehlen im Edit-Card — ✅ FIXED rc51.8 + rc51.9

**Befund:** Edit-Stammdaten-Card in `backend/src/admin/routes/media/[id]/page.tsx` hatte ursprünglich nur 8 Felder (Title, Artist, Label, Year, Country, Catalog No., Barcode, Description). Read-Mode zeigte Format / Genre / Styles korrekt an, Edit-Mode hatte keine Inputs.

**Fix:**
- **rc51.8** (2026-04-25): Format-Picker (71-Wert-Whitelist gruppiert) + Descriptors-Picker (32 Tags) im Edit-Card.
- **rc51.9** (2026-04-25): Genre-Picker (15 Discogs-Top-Level-Werte) + Styles-Picker (DB-suggested + Custom-Add) im Edit-Card.

**Resultierende Edit-Card-Felder (Stand rc51.9):** Title · Artist · Label · Year · Country · Catalog No. · Barcode · Description · **Format · Descriptors · Genres · Styles**.

---

## Gap 2 — Format / Genre als Pflicht-Dropdown — ✅ FIXED rc51.8 + rc51.9

**Format (rc51.8):** `FormatPickerModal` mit 71-Wert-Whitelist aus `FORMAT_VALUES` (gruppiert in 12 Sections: Vinyl LP / Vinyl 7" / Vinyl 10" / Vinyl 12" Maxi / Sonderformate / Cassette / Reel / CD / Video / Digital / Literatur / Catch-all). Live-Search über raw-value + display-string. Server-Side Validation via `isValidFormat()` — 400 bei invalid. Neue Spalte `Release.format_v2` ist Lock-protected (auto-locked auf Edit, Sync respektiert Lock).

**Genre (rc51.9):** `GenrePickerModal` mit 15-Wert-Whitelist aus `GENRE_VALUES` (statisches Dataset in `backend/src/admin/data/genre-styles.ts`, matched DB DISTINCT exakt). Server-Side Validation via `isValidGenre()` — 400 bei invalid. Strict whitelist, kein Free-Text.

**Styles (rc51.9 — Variante (b) gewählt):** `StylesPickerModal` Multi-Select aus DB-suggested Values (`GET /admin/media/style-suggestions` returnt `DISTINCT unnest(styles)` — derzeit ~388 Werte, 10-min Cache) **plus Custom-Add** für neue Werte (Enter im Search-Input oder Klick auf "Add custom"-Button). Backend lässt `styles` unvalidiert (open whitelist). Begründung: 388 sauber gepflegte Werte als Suggestion-Liste sind besser als eine kuratierte 50-Wert-Hardcoded-Liste, und Custom-Add deckt seltene Spezialfälle ab.

**Architektur-Note Genres + Styles:** Zone-2-Felder — kein Sync schreibt sie (weder `legacy_sync_v2.py` noch `discogs_daily_sync.py`) → keine Lock-Mechanik nötig, Edits sind dauerhaft.

---

## Gap 3 — `article_number` wird bei NEUEN Releases nicht vergeben (Discogs UND tape-mag) — ✅ FIXED rc51.6

**Status:** ✅ Live deployed via Migration `backend/scripts/migrations/2026-04-25_release_article_number_auto_assign.sql`. 22.630 NULL-Rows backfilled (Discogs + Legacy/Literatur), `BEFORE INSERT`-Trigger aktiv. Smoke-Test: Sequence advanced 52788→52789 nach synthetic INSERT/ROLLBACK. Sequence-Position: 52.788. Siehe CHANGELOG rc51.6.

**Befund — Bug war breiter als gedacht:**
- `article_number` wurde vor rc51.6 nur an einer Stelle gesetzt: `scripts/generate_article_numbers.sql` — einmalige Bulk-Migration (Legacy-Bestand vom Cutover).
- **Tape-mag MySQL hat keine `article_number`-Spalte.** Die VOD-XXXXX-Nummern auf den ~41k Legacy-Releases wurden komplett vom VOD-System vergeben, nicht aus tape-mag gezogen.
- `legacy_sync_v2.py` syncht 14 Felder aus tape-mag — `article_number` ist **nicht dabei**. Konsequenz: jede neue tape-mag-Anlage kam mit `article_number = NULL` an.
- **Discogs-Import-Insert** (`backend/src/api/admin/discogs-import/commit/route.ts`) setzte `article_number` ebenfalls nicht → alle Discogs-Imports lagen mit `article_number = NULL` in der DB.

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
- Idempotent: Trigger ignoriert Rows mit bereits gesetztem `article_number`.

**Restliche offene Frage:** Brauchen wir einen rein-manuellen Add-Release-Endpoint (Walk-In ohne Discogs-Match, ohne tape-mag)? Heute existiert keiner. Falls ja, gleicher Trigger greift automatisch.

---

## Verbleibende Folge-Items

Nach Schließen der drei Gaps in rc51.6/.8/.9 sind keine weiteren akuten Stammdaten-Editor-Lücken offen. Mögliche Nice-to-Haves:

1. **Genre-Cleanup-Migration:** Prüfen ob `Release.genres`-Werte alle in der 15-Wert-Whitelist liegen (DB-Pre-Check 2026-04-25 zeigt 15/15 distinct match — wahrscheinlich ist alles sauber, ein Verify-Script wäre trotzdem nett).
2. **Styles-Cleanup-Migration:** Aktuell 388 distinct Styles in der DB — manche evtl. Tippfehler/Duplikate (z.B. "Synth-pop" vs "Synth Pop"). Optional: Admin-UI für Style-Konsolidierung (rename-all-occurrences) wenn Bedarf entsteht.
3. **Manueller Add-Release-Endpoint:** Walk-In-Szenarien (Frank wirft Platte ohne Discogs/tape-mag-Match auf den Tisch). Heute existiert keiner — falls Bedarf entsteht, ist die Architektur dafür komplett vorbereitet (Trigger setzt article_number automatisch, Edit-Card hat alle Felder).

Aktuell **kein Handlungsbedarf** — Workstream geschlossen.
