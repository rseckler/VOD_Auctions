# Artikel ohne Bild — Bestands-Daten-Analyse

**Erstellt:** 2026-05-17
**Frage:** Was bedeuten die ~8.700 Artikel ohne Bild für den Datenbestand, und wie hängt das Vorhandensein eines Bildes mit dem tatsächlichen Lagerbestand zusammen?
**Datenstand:** Prod-DB `bofblwqieuvmqybzxapx`, Snapshot 2026-05-17.
**Status:** Analyse + Storefront-Umsetzung. Daten/DB unverändert; im Storefront werden bildlose Artikel seit 2026-05-17 ausgeblendet — siehe Abschnitt 8.

---

## 1. Grundgesamtheit

| Kategorie | Releases | ohne `coverImage` | mit `coverImage` | Anteil ohne Bild |
|---|--:|--:|--:|--:|
| `release` | 41.412 | 7.896 | 33.516 | 19,1 % |
| `press_literature` | 6.330 | 517 | 5.813 | 8,2 % |
| `band_literature` | 3.917 | 252 | 3.665 | 6,4 % |
| `label_literature` | 1.129 | 52 | 1.077 | 4,6 % |
| **Gesamt** | **52.788** | **8.717** | **44.071** | **16,5 %** |

Die Bild-Lücke sitzt fast vollständig bei den Tonträgern (`release`). Literatur/Merch ist gut versorgt.

---

## 2. Frank's Bestands-Logik (präzisiert 2026-05-17)

Die Bild-Lücke ist **kein Daten-Defekt und kein Inventar-Loch**, sondern Ergebnis von Frank's Arbeitsmodell:

1. **Artikel ohne Bild = nicht im physischen Warenbestand.** Es sind reine Datenbank-/Referenzeinträge — Diskographie-Wissen für Artikel, die Frank ggf. später über aufgekaufte Sammlungen physisch bekommt.
2. **Die einzige belastbare Wahrheit, was wirklich am Lager ist, schafft der Inventory Process** — ein erfasstes `erp_inventory_item`. Nicht `coverImage`, nicht `legacy_available`, nicht `shop_price`.
3. Grobe Herkunfts-Faustregel bis zur Inventur-Erfassung:
   - **tape-mag-Legacy-DB** → überwiegend am Lager.
   - **CSV-Importe** (drei Quellen: Pargmann, Bremer, Frank) → nur **teilweise** am Lager.

---

## 3. Daten nach Herkunft (`Release.data_source`)

`Release.data_source` kennt nur zwei Werte:

| `data_source` | Releases | ohne Bild | mit Bild | per Inventory erfasst | `legacy_available=true` |
|---|--:|--:|--:|--:|--:|
| `legacy` (tape-mag-DB) | 41.558 | 8.649 | 32.909 | 13.760 (33 %) | 41.185 |
| `discogs_import` (CSV-Importe) | 11.230 | 68 | 11.162 | 2.791 (25 %) | 0 |
| **Gesamt** | **52.788** | **8.717** | **44.071** | **16.551** | 41.185 |

**Befund:** Der `discogs_import`-Batch hat zu **99,4 %** ein Bild — weil der Discogs-Import-Prozess automatisch Cover zieht. Trotzdem ist er laut Frank nur *teilweise* am Lager. Für diese 11.230 Artikel ist ein vorhandenes Bild also **kein** Bestands-Signal. `legacy_available` ist für sie durchgängig `false`/NULL (das Feld stammt aus dem tape-mag-`frei`-Feld und existiert nur für Legacy-Daten).

> Die drei CSV-Quellen (Pargmann, Bremer, Frank) sind auf Release-Ebene **nicht** unterscheidbar — alle tragen `data_source='discogs_import'`. Eine Trennung ginge nur über die jeweilige `import_session` (eine Session pro CSV-Upload).

---

## 4. Was `coverImage` wirklich bedeutet

`Release.coverImage` macht aktuell Doppeldienst:

- **Storefront-Visibility-Gate** — `coverImage IS NOT NULL` entscheidet, ob ein Release im Katalog erscheint.
- **De-facto Bestands-Näherung** — historisch gewachsen, weil tape-mag nur eigene Ware fotografiert hat.

Diese zweite Bedeutung ist **nicht belastbar**:

- Sie hält *grob* für `data_source='legacy'` (Bild ≈ war physisch da).
- Sie **bricht vollständig** für `data_source='discogs_import'` (fast alles hat ein Bild, ist aber nur teilweise am Lager).

Es gibt **kein** dediziertes „im physischen Bestand"-Feld. Wer Bestand wissen will, muss `erp_inventory_item` prüfen.

**Konsequenz für künftige Arbeit:**
- `coverImage` strikt nur als Visibility-Gate behandeln.
- **Nie `coverImage` aus nicht-physischer Quelle schreiben** (Discogs-Auto-Cover-Fetch, KI-Placeholder) — das verfälscht das Gate und macht Nicht-Bestandsware sichtbar.
- **MiniMax Phase 4** (KI-Placeholder-Cover für bildlose Releases, CLAUDE.md Workstream 7) ist unter dieser Logik konzeptionell fragwürdig: bildlose Legacy-Artikel *sollen* bewusst unsichtbar bleiben. Vor Aufwand mit Frank klären.

---

## 5. Bestands-Wahrheit: `erp_inventory_item`

| Kennzahl | Wert |
|---|--:|
| `erp_inventory_item`-Zeilen (Status `in_stock`, inkl. Mehrfach-Exemplare) | 16.973 |
| Davon betroffene Releases (distinct) | 16.551 |
| — aus `data_source='legacy'` | 13.760 |
| — aus `data_source='discogs_import'` | 2.791 |

Der einzige Status-Wert ist aktuell `in_stock`. Die Inventur v2 läuft — der Rest beider Quellen ist bestandsmäßig **unbestätigt**.

---

## 6. Ausnahmen / Daten-Widersprüche

Vier Buckets, in denen die Daten von Frank's Modell abweichen — **nur dokumentiert, nicht bearbeitet**:

| # | Bucket | Anzahl | Einordnung |
|---|---|--:|---|
| ① | „Phantom-bildlos" — `Image`-Row mit `rang=0` vorhanden (alle aus `tape-mag/standard/`, gültige R2-URL), aber `coverImage` ist NULL | 150 | Legacy-Import-Defekt (147 `press_literature`, 3 `label_literature`): Bild existiert, wurde nie ins `coverImage`-Feld promotet → im Storefront unsichtbar. Sauberer Quick-Fix möglich. |
| ② | Release **ohne** Bild, aber **mit** `erp_inventory_item` | 22 | Echter Widerspruch — ins ERP erfasst (= im Bestand), aber nie fotografiert. Wäre eine konkrete Foto-Arbeitsliste. |
| ③ | Release **ohne** Bild, aber `shop_price > 0` | 248 | Preis ohne Bild — Regelverstoß. Aufteilung: 152 `release`, 65 `press_literature`, 27 `band_literature`, 4 `label_literature`. Nur 22 davon haben ein ERP-Item. |
| ④ | Release **mit** Bild **und** `legacy_available=true`, aber **ohne** `erp_inventory_item` | ~10.600 | Der eigentliche offene Berg: Inventur-v2-Rückstand. Nicht die bildlosen Artikel. |

**Kein** bildloses Release ist aktuell im Shop kaufbar (`shop_price > 0` **und** verifiziertes `erp_inventory_item` = 0 Treffer). Das Visibility-Gate greift sauber — die Bild-Lücke hat **keinen** direkten Revenue-Impact.

---

## 7. Schlussfolgerungen

1. Die 8.717 bildlosen Artikel sind **gewollt** — Frank's Schatten-/Referenzkatalog. Sie sollen unsichtbar bleiben, bis ein Stück physisch erfasst wird.
2. **`erp_inventory_item` ist die einzige Bestands-Wahrheit.** Jede Bestands-Aussage muss darüber laufen, nicht über `coverImage`/`legacy_available`/`shop_price`.
3. Jede Bild-/Katalog-Analyse muss nach `data_source` segmentieren — `legacy` und `discogs_import` haben grundverschiedene Bestands-Semantik.
4. Maßnahmen, die `coverImage` aus nicht-physischer Quelle füllen würden (Discogs-Cover-Fetch, MiniMax-Placeholder), sind mit Frank's Modell unvereinbar und vor jeder Umsetzung mit ihm zu klären.

**Offene Punkte (nicht beauftragt):** Buckets ①–③ aus Abschnitt 6 wären jederzeit abarbeitbar, sind aber bewusst geparkt.

---

## 8. Umsetzung — Storefront blendet bildlose Artikel aus (2026-05-17)

**Beauftragt von Robin:** „Alle Artikel, die kein Bild haben, im Frontend erst mal ausblenden."

**Regel:** Releases mit `coverImage IS NULL` erscheinen in keiner öffentlichen Browse-/Discovery-Oberfläche des Storefronts. Das ist die bereits in CLAUDE.md dokumentierte Visibility-Regel (`coverImage IS NOT NULL`) — sie war nur nicht überall durchgesetzt.

**Geänderte Dateien (alle Backend-API, deckt das Frontend vollständig ab — die Storefront-Seiten holen ihre Daten ausschließlich über diese Endpunkte):**

| Datei | Änderung |
|---|---|
| `backend/src/api/store/catalog/route.ts` | Meili-Pfad: `has_cover: true` zum Filter ergänzt. Der Postgres-Fallback filterte bereits via `whereNotNull("Release.coverImage")`. |
| `backend/src/api/store/band/[slug]/route.ts` | `whereNotNull("Release.coverImage")` auf Release-Liste, Literatur-Liste **und** Kopf-Zähler. |
| `backend/src/api/store/label/[slug]/route.ts` | dito (Release-Liste, Literatur-Liste, Kopf-Zähler). |
| `backend/src/api/store/press/[slug]/route.ts` | dito (Publikations-Liste, Kopf-Zähler). |

**Bereits vorher korrekt (keine Änderung nötig):** `/store/catalog/suggest` (Meili `has_cover:true` + Postgres-Fallback), `/store/catalog/facets`, `/store/catalog/[id]` (404 bei bildlosem Release).

**Bewusst NICHT gefiltert (Trade-offs offengelegt):**
- **Account-Seiten** (`/store/account/{saved,bids,orders,cart,wins,recommendations}`) — zeigen die *eigenen* Artikel des Kunden. Ein gekaufter/gemerkter Artikel muss sichtbar bleiben, auch wenn er kein Bild hat.
- **Auction-Blocks** (`/store/auction-blocks`) — Block-Items sind vom Admin kuratiert. Ein bewusst in einen Block gelegter Artikel soll nicht still aus dem Block verschwinden.
- **Community** (`/store/community/*`) — flag-gated, nutzer-kuratierte Listen/Profile; eigene Sichtbarkeitslogik.

**Trade-off der Maßnahme:** Die Filterung ist **unbedingt** (kein Query-Param, kein Flag). Der bestehende Admin-Toggle `site_config.catalog_visibility` (`visible`/`all`) steuert weiterhin nur die *Preis*-Sichtbarkeit (Artikel ohne Preis) — er kann bildlose Artikel **nicht** wieder einblenden. Wer das rückgängig machen will, entfernt die vier oben genannten Code-Stellen (alle mit Kommentar-Anker „Bildlose Artikel ausblenden (2026-05-17)" markiert — per Grep auffindbar).

**Wirkung:** ~8.700 bildlose Releases verschwinden aus Katalog, Künstler-/Label-/Press-Seiten und Sitemap. Kein Revenue-Impact (kein bildloses Release war kaufbar, siehe Abschnitt 6). Kein Deploy-Risiko über das Übliche hinaus — rein additive Read-Filter.

**Reversibilität:** Vier Code-Stellen, je mit Kommentar markiert. `grep -rn "Bildlose Artikel ausblenden (2026-05-17)" backend/src`.
