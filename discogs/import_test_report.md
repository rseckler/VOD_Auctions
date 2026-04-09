# Discogs Collection Import — Report

| Field | Value |
|-------|-------|
| Source | `VOD_discogs_export.xlsx` |
| Collection | VOD Eigenbestand |
| Date | 2026-04-09 11:38 |
| Total unique | 20 |
| Mode | **Simulation** (no DB write) |

## Summary

| Category | Count | Action |
|----------|------:|--------|
| EXISTING | 4 | Update prices + community data |
| LINKABLE | 0 | Add discogs_id + prices to existing release |
| NEW | 16 | Full import (Release + Artist + Label + Tracks) |
| SKIPPED | 0 | API error — not importable |
| **Total** | **20** | |

## NEW Releases (16)

| # | Artist | Title | Year | Format | Discogs ID |
|--:|--------|-------|------|--------|------------|
| 1 | 1919 | Repulsion | 1982 | 7" | 1104999 |
| 2 | ...And The Native Hipsters | There Goes Concorde Again | 1980 | 7", RP, Pri | 750267 |
| 3 | 0 8 / 15 | 1000 Gelbe Tennisbälle / Halbe Sache | 1981 | 7" | 799717 |
| 4 | 1. Futurologischer Congress | Schützt Die Verliebten | 1982 | LP, Album | 7279984 |
| 5 | 1/2 Japanese | No Direct Line From My Brain To My Heart | 1978 | 7", EP | 1350045 |
| 6 | 1000 Ohm | A.G.N.E.S. / Look Around | 1981 | 12" | 425426 |
| 7 | 100th Monkey Effect | Bouncy Bouncy | 1984 | 7" | 1454052 |
| 8 | 19/Juke | Ninety Seven Circles | 1981 | LP, Album | 1401651 |
| 9 | 2 3 | All Time Low / Where To Now? | 1978 | 7", Single | 1290243 |
| 10 | 23 Skidoo | The Gospel Comes To New Guinea / Last Words | 1981 | 12", Single | 29041 |
| 11 | 23 Skidoo | Seven Songs | 1982 | LP, MiniAlbum | 184358 |
| 12 | 23 Skidoo | The Culling Is Coming | 1983 | LP, Album | 315198 |
| 13 | 3 Minutes | Automatic Kids | 1980 | 7", Single | 371191 |
| 14 | 3 Phase | Der Klang Der Familie | 1992 | 12", W/Lbl | 1315253 |
| 15 | 3 Phase Featuring Dr. Motte | Der Klang Der Familie | 1992 | 12", EP | 52256 |
| 16 | 39 Clocks | Pain It Dark | 1981 | LP, Album | 797653 |

## EXISTING Releases (4)

These 4 releases already have a matching `discogs_id` in the database.
On commit, only prices and community data would be updated.

<details>
<summary>Show all existing matches</summary>

| # | DB Release ID | Artist | Title | Discogs ID |
|--:|---------------|--------|-------|------------|
| 1 | `legacy-release-23943` | 1. Futurologischer Congress | Posthum | 2000306 |
| 2 | `legacy-release-23944` | 1. Futurologischer Congress | Heimatlied | 665510 |
| 3 | `legacy-release-23752` | 19/Juke | Untitled | 722873 |
| 4 | `legacy-release-24966` | 23 Skidoo | Tearing Up The Plans | 29040 |

</details>

## Sample API Data (first 3 NEW releases)

### 1919 — Repulsion (discogs:1104999)

- **Country:** UK
- **Year:** 1982
- **Genres:** Rock
- **Styles:** Goth Rock, Punk
- **Formats:** Vinyl
- **Community:** 263 have / 208 want
- **Lowest Price:** 10.32
- **For Sale:** 6
- **Tracklist:** 2 tracks
  - A Repulsion ()
  - B Tear Down These Walls ()
- **Images:** 4

### ...And The Native Hipsters — There Goes Concorde Again (discogs:750267)

- **Country:** UK
- **Year:** 1980
- **Genres:** Electronic, Rock
- **Styles:** Avantgarde, Minimal
- **Formats:** Vinyl
- **Community:** 174 have / 201 want
- **Lowest Price:** 45.88
- **For Sale:** 13
- **Tracklist:** 3 tracks
  - A1 There Goes Concorde Again ()
  - B1 Stands, Still The Building ()
  - B2 I Wanna Be Around (Paul) ()
- **Images:** 10

### 0 8 / 15 — 1000 Gelbe Tennisbälle / Halbe Sache (discogs:799717)

- **Country:** Germany
- **Year:** 1981
- **Genres:** Electronic
- **Styles:** Electro, Minimal
- **Formats:** Vinyl
- **Community:** 97 have / 489 want
- **Lowest Price:** 123.41
- **For Sale:** 7
- **Tracklist:** 2 tracks
  - A 1000 Gelbe Tennisbälle ()
  - B Halbe Sache ()
- **Images:** 5
