# Session 2026-05-17 — Artikel ohne Bild: Bestands-Daten-Analyse

**Typ:** Analyse + Storefront-Code-Änderung (DB/Daten unverändert).

## Auslöser
Frage von Robin: Datenbestand aller Artikel ohne Bild analysieren. Im Verlauf von Frank zweimal präzisiert, wie „Bild" mit Lagerbestand zusammenhängt.

## Ergebnis
- 8.717 von 52.788 Releases (16,5 %) ohne `coverImage`, fast alle in Kategorie `release`.
- Frank's Modell bestätigt: bildlos = nicht im physischen Bestand (reiner Referenzkatalog). Einzige Bestands-Wahrheit = der Inventory Process (`erp_inventory_item`).
- Segmentierung nach `Release.data_source` ist entscheidend:
  - `legacy` (41.558, tape-mag-DB): überwiegend am Lager.
  - `discogs_import` (11.230, CSV-Importe Pargmann/Bremer/Frank): nur teilweise am Lager; 99,4 % haben ein Bild → Bild ist hier **kein** Bestands-Signal.
- `coverImage` macht Doppeldienst (Visibility-Gate + de-facto Bestands-Näherung) — die zweite Bedeutung ist nicht belastbar.
- 4 Ausnahme-Buckets dokumentiert (150 Phantom-bildlos / 22 bildlos-mit-ERP-Item / 248 bildlos-mit-Preis / ~10.600 Inventur-Rückstand).
- Kein bildloses Release ist kaufbar → kein Revenue-Impact.

## Umsetzung — Storefront blendet bildlose Artikel aus
Beauftragt von Robin. 4 Backend-API-Dateien geändert (rein additive Read-Filter):
- `catalog/route.ts` — Meili-Filter `has_cover: true` (Postgres-Fallback filterte schon).
- `band/[slug]`, `label/[slug]`, `press/[slug]` — `whereNotNull("Release.coverImage")` auf Listen + Kopf-Zähler.
Nicht gefiltert: Account-Seiten (eigene Käufe), Auction-Blocks (Admin-kuratiert), Community (nutzer-kuratiert).
Details + Reversibilität in IMAGE_STOCK_DATA_ANALYSIS_2026-05-17.md §8.

## Artefakte
- `docs/optimizing/IMAGE_STOCK_DATA_ANALYSIS_2026-05-17.md` — Analyse + Umsetzung (§8).
- Memory `project_coverimage_stock_proxy.md` angelegt + korrigiert.
- 4 Backend-Routes geändert (Storefront-Visibility).

## Offene Punkte
- **Deploy ausstehend** — Änderung ist nur committed/lokal, noch nicht auf VPS. Nach Deploy CHANGELOG + GitHub-Release nachziehen.
- MiniMax Phase 4 (KI-Placeholder-Cover) mit Frank klären — unter der präzisierten Logik fragwürdig.
- Buckets ①–③ abarbeitbar, aber bewusst geparkt.
- Drei CSV-Quellen auf Release-Ebene nicht trennbar (nur über `import_session`).
