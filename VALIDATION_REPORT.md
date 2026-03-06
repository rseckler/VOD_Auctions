# Validierungsbericht: Legacy MySQL DB vs. VOD-Auctions Plattform

**Datum:** 2026-03-06
**Quellen:** Legacy MySQL (vodtapes @ 213.133.106.99), VOD-Auctions PostgreSQL (Supabase), tape-mag.com Frontend

---

## 1. Legacy MySQL Datenbank — Übersicht

**82 Tabellen**, davon **~20 mit Inhaltsdaten**, Rest CMS-Framework (3wadmin) + Import-Staging-Tabellen.

### Kerntabellen (Content)

| Legacy Tabelle | Zeilen | Beschreibung |
|---|---|---|
| `3wadmin_tapes_releases` | **30.163** | Releases (Tapes, Vinyl, CD, Video) |
| `3wadmin_tapes_band` | **12.453** | Künstler/Bands |
| `3wadmin_tapes_labels` | **3.077** | Labels |
| `3wadmin_tapes_formate` | **39** | Format-Definitionen |
| `3wadmin_shop_countries` | **253** | Länder |
| `3wadmin_tapes_band_lit` | **3.915** | Artists & Bands Literatur |
| `3wadmin_tapes_labels_lit` | **1.129** | Labels Literatur |
| `3wadmin_tapes_pressorga_lit` | **6.326** | Press/Org Literatur |
| `3wadmin_tapes_pressorga` | **1.983** | Presse-Organisationen |
| `3wadmin_tapes_labels_person` | **458** | Label-Personen |
| `3wadmin_tapes_releases_various` | **42.174** | Various-Artists-Verknüpfungen |
| `3wadmin_tapes_comment` | **496** | Kommentare |
| `3wadmin_tapes_katalog` | **45.998** | Katalog-Einträge |
| `bilder_1` | **74.424** | Bilder (alle Typen) |
| `3wadmin_tapes_kategorien` | **2** | Kategorien: Tapes (1), Vinyl (2) |
| `3wadmin_tapes_pers_verkn` | **368** | Person-Verknüpfungen |

### Import-/Staging-Tabellen (Legacy-CSV-Importe)

| Legacy Tabelle | Zeilen | Beschreibung |
|---|---|---|
| `artistsandbands` | 2.859 | CSV-Import Staging (nicht normalisiert) |
| `labels` | 678 | CSV-Import Staging |
| `releases` | 2.441 | CSV-Import Staging |
| `pressorga` | 461 | CSV-Import Staging |
| `maglabelpeople` | 411 | CSV-Import Staging (Label-Personen) |
| `literaturetoartists` | 312 | CSV-Import Staging (Band-Lit) |
| `literaturetolabels` | 162 | CSV-Import Staging (Label-Lit) |
| `literaturepressorg` | 788 | CSV-Import Staging (Press-Lit) |

### Releases: Detailstatistik

| Merkmal | Anzahl | Prozent |
|---|---|---|
| Total | 30.163 | 100% |
| Mit Preis > 0 | 11.193 | 37,1% |
| Mit Year > 0 | 24.530 | 81,3% |
| Mit Moreinfo | 22.523 | 74,7% |
| Year-Range | 88–19.983 | (Datenfehler bei Extremwerten) |

### Literatur-Tabellen: Preis-Statistik

| Tabelle | Total | Preis > 0 | % mit Preis |
|---|---|---|---|
| `band_lit` | 3.915 | 807 | 20,6% |
| `labels_lit` | 1.129 | 120 | 10,6% |
| `pressorga_lit` | 6.326 | 1.448 | 22,9% |

### Bilder (bilder_1): 74.424 Einträge nach Typ

| typ | Anzahl | Verwendung (aus PHP-Code) |
|---|---|---|
| **10** | **33.531** | Release-Bilder (Hauptbilder) |
| **11** | 324 | Press/Org-Bilder |
| **12** | 29.989 | Labels-Lit-Referenzbilder |
| **13** | 7.275 | Band-Lit-Referenzbilder |
| **14** | 3.135 | Labels-Lit / Press-Lit Bilder |
| **15** | 52 | Label-Bilder |
| **16** | 103 | Artist/Band-Bilder |
| **17** | 13 | Label-Person-Bilder |
| 1 | 2 | (Legacy/ungenutzt) |

### Format-Verteilung (Releases)

| Format | kat | Anzahl |
|---|---|---|
| Tape (+ Tape-2 bis Tape-32) | 1 | **20.978** (69,6%) |
| Vinyl-Lp (+ Varianten) | 2 | **5.880** (19,5%) |
| Vinyl-7"/10"/12" | 2 | **2.707** (9,0%) |
| Video | 1 | 413 (1,4%) |
| Reel | 1 | 163 (0,5%) |
| CD | 1 | 2 |
| Ohne Format | — | 16 |

---

## 2. VOD-Auctions PostgreSQL — Übersicht

**171 Tabellen** (inkl. Medusa-Commerce-Framework), davon **~20 Anwendungstabellen**.

### Kerntabellen

| VOD-Auctions Tabelle | Zeilen | Legacy-Quelle |
|---|---|---|
| `Release` | **41.529** | releases + band_lit + labels_lit + pressorga_lit |
| `Artist` | **12.452** | 3wadmin_tapes_band |
| `Label` | **3.077** | 3wadmin_tapes_labels |
| `Format` | **39** | 3wadmin_tapes_formate |
| `Image` | **67.882** | bilder_1 (teilweise) |
| `PressOrga` | **1.983** | 3wadmin_tapes_pressorga |
| `ArtistLink` | **3.914** | 3wadmin_tapes_band_lit (Verknüpfung) |
| `LabelLink` | **1.129** | 3wadmin_tapes_labels_lit (Verknüpfung) |
| `ReleaseArtist` | **42.174** | 3wadmin_tapes_releases_various |
| `Comment` | **414** | 3wadmin_tapes_comment |
| `Katalog` | **45.998** | 3wadmin_tapes_katalog |

### Release nach product_category

| product_category | Anzahl | Legacy-Quelle |
|---|---|---|
| `release` | **30.159** | 3wadmin_tapes_releases |
| `press_literature` | **6.326** | 3wadmin_tapes_pressorga_lit |
| `band_literature` | **3.915** | 3wadmin_tapes_band_lit |
| `label_literature` | **1.129** | 3wadmin_tapes_labels_lit |
| **Gesamt** | **41.529** | |

### Release: Preis- und Bild-Statistik

| Merkmal | Gesamt | release | band_lit | labels_lit | press_lit |
|---|---|---|---|---|---|
| Total | 41.529 | 30.159 | 3.915 | 1.129 | 6.326 |
| legacy_price NOT NULL | 13.562 | 11.187 | 807 | 120 | 1.448 |
| coverImage NOT NULL | 26.989 | 22.303 | 3.661 | 24 | 1.001 |
| **Preis + Bild** | **12.067** | **11.030** | **780** | **2** | **255** |

### Format-Verteilung (VOD-Auctions)

| format (enum) | Anzahl |
|---|---|
| CASSETTE | 20.978 |
| MAGAZINE | 10.923 |
| LP | 8.587 |
| DVD | 413 |
| POSTER | 248 |
| REEL | 163 |
| PHOTO | 143 |
| POSTCARD | 52 |
| OTHER | 20 |
| CD | 2 |

---

## 3. tape-mag.com Frontend — Kategorien

| typset | Name | Geschätzte Einträge | Legacy-Tabelle | VOD-Auctions |
|---|---|---|---|---|
| 1 | Artists & Bands | ~12.500 | `tapes_band` (12.453) | `Artist` (12.452) |
| 2 | Labels | ~3.100 | `tapes_labels` (3.077) | `Label` (3.077) |
| 3 | Press & Organisations | ~2.000 | `tapes_pressorga` (1.983) | `PressOrga` (1.983) |
| 4 | Labels Persons | ~500 | `tapes_labels_person` (458) | **FEHLT** |
| 5 | Artists & Bands Literature | ~4.000 | `tapes_band_lit` (3.915) | Release/band_literature (3.915) |
| 6 | Labels-Literature | ~1.200 | `tapes_labels_lit` (1.129) | Release/label_literature (1.129) |
| 7 | Press & Org Literature | ~6.400 | `tapes_pressorga_lit` (6.326) | Release/press_literature (6.326) |
| 8 | Releases | ~30.200 | `tapes_releases` (30.163) | Release/release (30.159) |

---

## 4. Mapping: Legacy → VOD-Auctions

### Direkte Tabellen-Zuordnung

| Legacy | VOD-Auctions | Status |
|---|---|---|
| `tapes_releases` (30.163) | `Release` product_category=release (30.159) | **-4 Differenz** |
| `tapes_band` (12.453) | `Artist` (12.452) | **-1 Differenz** |
| `tapes_labels` (3.077) | `Label` (3.077) | OK |
| `tapes_formate` (39) | `Format` (39) | OK |
| `tapes_pressorga` (1.983) | `PressOrga` (1.983) | OK |
| `tapes_band_lit` (3.915) | `Release` band_literature (3.915) | OK |
| `tapes_labels_lit` (1.129) | `Release` label_literature (1.129) | OK |
| `tapes_pressorga_lit` (6.326) | `Release` press_literature (6.326) | OK |
| `tapes_releases_various` (42.174) | `ReleaseArtist` (42.174) | OK |
| `tapes_comment` (496) | `Comment` (414) | **-82 Differenz** |
| `tapes_katalog` (45.998) | `Katalog` (45.998) | OK |
| `bilder_1` (74.424) | `Image` (67.882) | **-6.542 Differenz** |
| `shop_countries` (253) | `region_country` (250) | Medusa-Standard |

### NICHT migrierte Tabellen

| Legacy | Zeilen | Status |
|---|---|---|
| `tapes_labels_person` | 458 | **NICHT MIGRIERT** — Kein Äquivalent in VOD-Auctions |
| `tapes_pers_verkn` | 368 | **NICHT MIGRIERT** — Person-Verknüpfungen |
| `tapes_select` | 3 | Gender-Optionen (Female/Male/Mixed) — nicht separat migriert |
| `tapes_kategorien` | 2 | Tapes/Vinyl — in Format.kat integriert |
| `artistsandbands` | 2.859 | Staging-Tabelle (Originaldaten vor Normalisierung) |
| `labels` | 678 | Staging-Tabelle |
| `releases` | 2.441 | Staging-Tabelle |
| `pressorga` | 461 | Staging-Tabelle |
| `maglabelpeople` | 411 | Staging-Tabelle → teilweise in tapes_labels_person |
| `literaturetoartists` | 312 | Staging-Tabelle |
| `literaturetolabels` | 162 | Staging-Tabelle |
| `literaturepressorg` | 788 | Staging-Tabelle |
| `mpool_bilder` | 80.185 | Media-Pool (CMS-intern) |
| `extranet_user` | 3.575 | Legacy-User (nicht migriert) |

---

## 5. Bilder-Validierung

### Legacy bilder_1 nach typ vs. VOD-Auctions Image

| Legacy typ | Anzahl Legacy | Importiert | Beschreibung |
|---|---|---|---|
| **10** (Release-Bilder) | 33.531 | ~29.996 | Release-Hauptbilder |
| **11** (Press/Org) | 324 | ? | Press/Org-Bilder |
| **12** (Labels-Lit-Ref) | 29.989 | Teilweise | Labels-Literatur-Referenzbilder |
| **13** (Band-Lit-Ref) | 7.275 | Teilweise | Band-Literatur-Referenzbilder |
| **14** (Lit-Bilder) | 3.135 | Teilweise | Literatur-Bilder |
| **15** (Label) | 52 | ? | Label-Bilder |
| **16** (Artist) | 103 | ? | Artist/Band-Bilder |
| **17** (Label-Person) | 13 | ? | Label-Person-Bilder |
| **Gesamt** | **74.424** | **67.882** | **Differenz: -6.542** |

### coverImage-Problem

Das Hauptproblem im Catalog: `coverImage` wird aus den Bilddaten befüllt und dient als Vorschaubild.

| Kategorie | Total | coverImage vorhanden | % |
|---|---|---|---|
| release | 30.159 | 22.303 | **74,0%** |
| band_literature | 3.915 | 3.661 | **93,5%** |
| press_literature | 6.326 | 1.001 | **15,8%** |
| **label_literature** | **1.129** | **24** | **2,1%** |

**label_literature hat nur 24 von 1.129 coverImages (2,1%)** — das ist der Hauptgrund für das ursprüngliche Problem. Die Bilder existieren in der Legacy-DB (typ=14: 3.135 Bilder), wurden aber beim Import nicht als coverImage zugeordnet.

---

## 6. Preis-Validierung

| Kategorie | Legacy Preis > 0 | VOD legacy_price NOT NULL | Differenz |
|---|---|---|---|
| release | 11.193 | 11.187 | **-6** |
| band_literature | 807 | 807 | OK |
| labels_literature | 120 | 120 | OK |
| press_literature | 1.448 | 1.448 | OK |

Preise wurden korrekt migriert (minimale Differenz bei releases).

---

## 7. Catalog-API Filter-Problem

Die API `/store/catalog` (route.ts Zeile 60-61) erzwingt:
```
.whereNotNull("Release.coverImage")
.whereNotNull("Release.legacy_price")
```

**Auswirkung auf sichtbare Einträge im Storefront:**

| Kategorie | Total | Im Catalog sichtbar | Verlust |
|---|---|---|---|
| release | 30.159 | 11.030 (37%) | 63% unsichtbar |
| band_literature | 3.915 | 780 (20%) | 80% unsichtbar |
| press_literature | 6.326 | 255 (4%) | 96% unsichtbar |
| **label_literature** | **1.129** | **2 (0,2%)** | **99,8% unsichtbar** |
| **Gesamt** | **41.529** | **12.067 (29%)** | **71% unsichtbar** |

---

## 8. Zusammenfassung: Lücken und Empfehlungen

### Kritische Lücken

| # | Problem | Schwere | Empfehlung |
|---|---|---|---|
| 1 | **label_literature: nur 24/1.129 coverImages** | KRITISCH | Bilder aus Legacy typ=14 als coverImage nachimportieren |
| 2 | **press_literature: nur 1.001/6.326 coverImages** | HOCH | Bilder aus Legacy typ=11,12,14 nachimportieren |
| 3 | **Catalog-API filtert 71% aller Einträge weg** | HOCH | Filter optional machen (Platzhalter-Bild zeigen) |
| 4 | **Labels Persons (458) nicht migriert** | MITTEL | typset=4 hat keine Entsprechung in VOD-Auctions |
| 5 | **82 Comments fehlen** (496→414) | NIEDRIG | Delta prüfen (evtl. leere/spam Kommentare) |
| 6 | **4 Releases fehlen** (30.163→30.159) | NIEDRIG | Duplikate oder leere Einträge |
| 7 | **6.542 Bilder fehlen** (74.424→67.882) | MITTEL | Prüfen welche typ-Werte nicht importiert wurden |
| 8 | **Year-Datenfehler** (88, 19.983) | NIEDRIG | Ungültige Jahreszahlen bereinigen |

### Korrekt migrierte Daten

- Releases: 30.159/30.163 (99,99%)
- Artists: 12.452/12.453 (99,99%)
- Labels: 3.077/3.077 (100%)
- Formate: 39/39 (100%)
- Press/Orga: 1.983/1.983 (100%)
- Band-Literatur: 3.915/3.915 (100%)
- Labels-Literatur: 1.129/1.129 (100%)
- Press-Literatur: 6.326/6.326 (100%)
- Various-Artists-Verknüpfungen: 42.174/42.174 (100%)
- Katalog: 45.998/45.998 (100%)
- Preise: korrekt migriert (minimale Differenz)

### Sofort-Maßnahmen

1. **coverImage für label_literature nachimportieren** — Legacy bilder_1 typ=14 als coverImage zuordnen
2. **coverImage für press_literature nachimportieren** — Legacy bilder_1 typ=11/12/14 prüfen
3. **Catalog-API anpassen** — `whereNotNull` für coverImage/price entfernen oder optional machen
4. **Labels Persons (458)** als eigene Entität oder als Release-Kategorie aufnehmen
