---
**Status:** ✅ Live data analysis
**Created:** 2026-04-26
**Author:** Robin Seckler
**Source:** Discogs API live-fetch from `pripuzzi` account (Frank)
**Raw data:** `scripts/discogs_wantlist_analysis/cache/{wantlist_full,discographies_sample}.json` + `output/analysis.json`
---

# Discogs Wantlist Analysis — pripuzzi (Frank)

Stand 2026-04-26 17:55 CEST. Vollständig live aus Franks Discogs-Account gezogen, nicht geschätzt.

## Account-Profil

| Kennzahl | Wert |
|---|---|
| Username | `pripuzzi` |
| Discogs User ID | 39558 |
| Account aktiv seit | 2003-05-27 |
| Email | vinylondemand@gmail.com |
| **Wantlist-Größe** | **45.972 Items** |
| Collection (eigener Bestand) | 10.517 Items |
| Pending Orders | 86 |
| Inventory (zum Verkauf) | 0 |
| Buyer Rating | 100% (6 ratings) |
| Seller Rating | 100% (2 ratings) |
| Currency | EUR |

**Korrektur zur ursprünglichen Annahme:** Frank sprach von „ungefähr 20.000" — tatsächlich sind es **45.972 Items**, also mehr als das Doppelte. Year-Span 1951-2015, Median-Year-Cluster 1980er-2000er.

## Wantlist-Struktur

### Distinct Entities

| | Anzahl |
|---|---|
| Distinct Artists | **7.462** |
| Distinct Labels | **7.347** |

### Long-Tail-Profil

**Artists nach Want-Frequenz:**

| Frequenz | Artists | Anteil |
|---|---|---|
| 1 Eintrag | 4.144 | 55,5 % |
| 2-5 Einträge | 2.334 | 31,3 % |
| 6-20 Einträge | 686 | 9,2 % |
| 21+ Einträge | 298 | 4,0 % |

**Labels nach Want-Frequenz:**

| Frequenz | Labels | Anteil |
|---|---|---|
| 1 Eintrag | 3.710 | 50,5 % |
| 2-5 Einträge | 2.318 | 31,6 % |
| 6-20 Einträge | 911 | 12,4 % |
| 21-100 Einträge | 326 | 4,4 % |
| 100+ Einträge | 82 | 1,1 % |

**Implikation:** Über 50% der Source-Entities haben nur einen Eintrag in der Wantlist — das sind keine Komplettist-Targets, sondern One-off-Akzidente. Eine sinnvolle Auto-Expansion sollte eine **Min-Frequenz** als Filter haben (≥3 Einträge → ~2.000 Artists / ~2.500 Labels statt 7.500).

### Top 20 Artists

| # | Artist | Wants |
|---|---|---:|
| 1 | Depeche Mode | 2.417 |
| 2 | New Order | 972 |
| 3 | Kraftwerk | 670 |
| 4 | Yello | 535 |
| 5 | Cabaret Voltaire | 340 |
| 6 | Siouxsie & The Banshees | 339 |
| 7 | Joy Division | 339 |
| 8 | The Residents | 329 |
| 9 | The Smiths | 326 |
| 10 | Merzbow | 307 |
| 11 | Front 242 | 306 |
| 12 | The Sisters Of Mercy | 276 |
| 13 | Soft Cell | 260 |
| 14 | Einstürzende Neubauten | 240 |
| 15 | Psychic TV | 234 |
| 16 | Cocteau Twins | 226 |
| 17 | Current 93 | 223 |
| 18 | John Cage | 222 |
| 19 | Nurse With Wound | 219 |
| 20 | Muslimgauze | 214 |

Klassisches Industrial / Synth-Pop / Post-Punk / Dark-Wave-Pantheon. Kein Mainstream.

### Top 20 Labels

| # | Label | Wants |
|---|---|---:|
| 1 | Mute | 3.547 |
| 2 | 4AD | 1.601 |
| 3 | Rough Trade | 1.548 |
| 4 | ZH27 | 1.099 |
| 5 | Virgin | 892 |
| 6 | Factory | 841 |
| 7 | Sire | 548 |
| 8 | Polydor | 534 |
| 9 | Mercury | 475 |
| 10 | EMI | 472 |
| 11 | RRRecords | 441 |
| 12 | Some Bizzare | 437 |
| 13 | Cherry Red | 398 |
| 14 | London Records | 392 |
| 15 | Les Disques Du Crépuscule | 376 |
| 16 | Capitol Records | 353 |
| 17 | Torso | 345 |
| 18 | Epic | 328 |
| 19 | Old Europa Cafe | 321 |
| 20 | Sub Rosa | 309 |

Mische aus Independent-Industrial-Stamm-Labels (Mute, 4AD, Rough Trade, Factory, RRRecords, Some Bizzare, Cherry Red) und Major-Labels (Virgin, Polydor, Mercury, EMI, Capitol). Die Major-Labels sind hier Akzident — Frank hat einzelne Releases von dort, **nicht** den Komplettist-Anspruch auf Polydors gesamte Diskografie.

### Format-Mix

| Format | Anzahl | Anteil |
|---|---:|---:|
| CD | 19.400 | 42,2 % |
| Vinyl | 18.083 | 39,3 % |
| Cassette | 6.011 | 13,1 % |
| CDr | 2.191 | 4,8 % |
| Box Set | 744 | 1,6 % |
| DVD | 388 | 0,8 % |
| VHS | 347 | 0,8 % |
| File (digital) | 330 | 0,7 % |
| Flexi-disc | 125 | 0,3 % |
| SACD | 62 | 0,1 % |

Klar physische Tonträger (>95%). 7"-Singles werden in Discogs nicht separat gezählt — stecken in der „Vinyl"-Kategorie und müssen über `formats[].descriptions` rausgefiltert werden.

### Year-Distribution

| Dekade | Items | Anteil |
|---|---:|---:|
| pre-1970 | 170 | 0,4 % |
| 1970er | 950 | 2,1 % |
| **1980er** | **15.511** | **33,7 %** |
| **1990er** | **15.096** | **32,8 %** |
| **2000er** | **12.252** | **26,7 %** |
| 2010er | 6 | 0,0 % |
| 2020er | 0 | 0,0 % |

**Wichtige Erkenntnis:** Frank hat seit ~2015 die Wantlist quasi nicht mehr substanziell erweitert. Auto-Expansion würde ihm vor allem **alte Releases** vorschlagen — was zum Sammler-Profil passt.

## Sample-Diskografien

Stichprobe: 50 Artists + 25 Labels aus Franks Top-Liste + Long-Tail (Random-Sample mit seed=42, ≥2 Wants). Capped auf 15 Pages × 500 Releases = 7.500 pro Entity (für hochrechnung mit Skalierungsfaktor).

### Artist-Stichprobe (Auszug)

| Artist | Wants | Discogs Releases |
|---|---:|---:|
| Depeche Mode | 2.417 | 7.500+ (capped) |
| New Order | 972 | 4.500+ |
| Kraftwerk | 670 | 1.700+ |
| Yello | 535 | 1.200+ |
| Merzbow | 307 | 2.000+ |
| Throbbing Gristle | 185 | 1.000+ |
| Coil | 163 | 800+ |
| Random sample (median) | — | ~80 |

### Label-Stichprobe (Auszug)

| Label | Wants | Discogs Releases |
|---|---:|---:|
| Mute | 3.547 | 30.000+ (capped) |
| London Records | 392 | **431.500** (Major-Label-Aggregation) |
| Pathé | <10 | 115.000 |
| Polydor | 534 | 25.000+ |
| Some Bizzare | 437 | 1.200 |
| Old Europa Cafe | 321 | 800 |
| Random sample (median) | — | ~120 |

**Key Finding:** Die Major-Labels (London, Polydor, EMI, Capitol etc.) sind in Franks Wantlist **Einzelfälle** (einzelne Releases), aber ihre Discogs-Diskografien umfassen Hunderttausende Releases (alles was der Konzern je gepresst hat, inkl. Klassik-Klassiker, Schlager, Easy-Listening). **Eine naive Auto-Expansion auf alle Labels in der Wantlist würde Millionen irrelevanter Releases triggern.**

→ **Fix:** Filter `max_source_entity_size` (z.B. 500 Releases/Entity max) — schließt Major-Label-Aggregation systematisch aus, lässt unabhängige Industrial-Labels durch.

## Filter-Profile mit echten Zahlen

Drei Profile getestet, alle mit aktivem Major-Label-Cap:

### Profil "Konservativ"

```
Vinyl LP/12" + Cassette + CD-Album, ab 1980, master_id-Dedupe, kein Reissue
Min Wantlist-Frequenz: 3 (Source-Entity muss ≥3× in Wantlist auftauchen)
Max Source-Entity-Größe: 500 Releases (filtert Mega-Labels)
```

| | Wert |
|---|---:|
| Eligible Artists nach Frequenz-Filter | 2.064 |
| Eligible Labels nach Frequenz-Filter | 2.501 |
| Nach Größen-Cap | **1.032 Artists / 800 Labels** |
| Median Pass per Artist | 6 Releases |
| Median Pass per Label | 9 Releases |
| **Net New Wants (Median-Schätzung)** | **~9.000** |
| **Net New Wants (Mean-Schätzung)** | **~14.600** |
| **API-Zeit gesamt** | **~3,4 Stunden** |

### Profil "Mittel"

```
Vinyl + Cassette + CD, ab 1970, alle Pressing-Varianten, kein Test Pressing
Min Wantlist-Frequenz: 2
Max Source-Entity-Größe: 2.000 Releases
```

| | Wert |
|---|---:|
| Eligible Artists | 3.316 |
| Eligible Labels | 3.636 |
| Nach Größen-Cap | **3.050 Artists / 1.454 Labels** |
| Median Pass per Artist | 8 Releases |
| Median Pass per Label | 11 Releases |
| Net New Wants (Median) | **~27.000** |
| Net New Wants (Mean — mit Outliers) | ~148.000 |
| API-Zeit | **~9,7 Stunden** |

### Profil "Umfassend"

```
Alle Formate, alle Jahre, alle Versionen, nur die ganz großen Major-Aggregationen aus
Min Wantlist-Frequenz: 1 (auch one-offs)
Max Source-Entity-Größe: 5.000 Releases
```

| | Wert |
|---|---:|
| Eligible Entities | 7.310 Artists / 2.938 Labels |
| Net New Wants (Median) | **~1,5 Mio** |
| Net New Wants (Mean) | ~2,6 Mio |
| API-Zeit | **~446 Stunden = 18,6 Tage 24/7** |

→ **Klare Empfehlung gegen "Umfassend"** — das ist nicht mehr Wantlist sondern Volltext-Discogs-Kopie und auch operativ unrealistisch (18 Tage Dauerlauf).

## Methodische Hinweise

- **Sampling:** 50 Artists + 25 Labels, davon je ~60% aus Franks Top-Frequenz und ~40% Random-Sample aus Long-Tail (≥2 Wants), seed=42 für Reproduzierbarkeit
- **Page-Cap:** 15 Pages × 500 Releases = max 7.500 pro Entity. Capped Entities: bei Hochrechnung skaliert mit `total_pages_available / fetched_pages`
- **Median > Mean:** Bei stark schiefen Verteilungen (Mute-Effekt) ist der Median robuster. Mean wird mitberichtet als oberes Konfidenz-Band
- **Overlap-Annahme:** 30% Overlap zwischen Artist- und Label-Discoveries (selbe Release ist in beiden gelistet) — empirisch konservativ angesetzt, müsste in echtem Run gemessen werden
- **Already-Wanted-Annahme:** 8% — basiert nicht auf empirischer Messung, sollte im echten Run als erstes Feedback-Signal genutzt werden
- **Rate-Limit-Annahme:** 55 Calls/min mit Buffer (Discogs-Limit ist 60/min auth)

## Zentrale Implikationen für das Konzept

1. **Wantlist-Größe** ist 45.972 (nicht 20k) — Konsequenzen für jeden Read-Phase-Aufwand
2. **Long-Tail-Filter ist Pflicht** — Min-Frequenz ≥3 reduziert Scan-Volumen um 70% bei minimalem Signal-Verlust
3. **Major-Label-Cap ist Pflicht** — ohne diesen Cap landen wir bei Millionen Wants
4. **„Maximal"-Profil ist nicht praktikabel** — 18 Tage 24/7 API-Run, 1,5+ Mio Wants
5. **„Konservativ" ist real machbar** — 9-15k neue Wants, halber Tag API-Zeit
6. **Year-Lücke seit 2015** — Auto-Expansion sollte standardmäßig auch nichts nach 2015 vorschlagen, sonst kommen viele Reissues von alten Sachen

## Anhang: Reproduzierbarkeit

```bash
cd scripts/discogs_wantlist_analysis
python3 fetch_wantlist.py        # ~8 min, 460 API calls
python3 sample_discographies.py  # ~12 min, ~300 API calls
python3 analyze.py               # < 1s, pure aggregation
```

Token: `DISCOGS_TOKEN` aus `backend/.env` (User `pripuzzi` verifiziert via `/oauth/identity`).

Output: `cache/wantlist_full.json` (9 MB), `cache/discographies_sample.json` (21 MB), `output/analysis.json`.
