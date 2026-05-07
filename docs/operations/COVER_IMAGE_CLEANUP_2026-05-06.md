# Cover-Image Cleanup — 50 betroffene Releases (2026-05-06)

Beim Apply des Felds **Cover Image** im Discogs-Review-Modal hat das Backend bisher eine neue Image-Row mit `rang=0` eingefügt, ohne die existierenden Images vorher um +10 zu bumpen. Dadurch stapeln sich alle Cover-Apply-Versuche auf rang=0, und der Storefront-Sort `rang ASC, id ASC` friert das älteste Bild als sichtbares Cover ein — obwohl `Release.coverImage` bereits auf den neuesten URL zeigt.

Der Bug ist im Backend gefixt (siehe Footer). Die 50 hier gelisteten Releases — meist 2-4 gestapelte `media-edit-*`-Rows aus den heutigen Tests durch Frank und David — müssen aber einmalig manuell bereinigt werden: pro Release das richtige Cover via ★-Button im Admin-UI setzen, dann ruft das Backend `set-cover/route.ts` auf und nummeriert die rang-Werte korrekt durch.

Eine SQL-Migration wäre schneller, ist aber riskanter: die Heuristik "neuestes Bild als Cover" stimmt nicht zwingend mit "richtiges Bild als Cover" überein. Manuelle Sichtprüfung pro Release ist sicherer.

**Zuständig:** Frank, David — geschätzter Aufwand ca. 30 Sekunden pro Release × 50 ≈ **25 Minuten total**.

## Anleitung

1. Admin-Link aus dem jeweiligen Block öffnen.
2. In der Galerie-Sektion das gewünschte Cover-Bild identifizieren — alle Image-URLs sind in der Tabelle direkt verlinkt, vorher in einem extra Tab anschauen hilft beim Vergleich.
3. Auf das Stern-Symbol (★) am gewünschten Bild klicken — das setzt es als neues Cover und nummeriert die rang-Werte korrekt durch.
4. Storefront-Link öffnen und prüfen: das Cover sollte sich nach ca. 1 Sekunde aktualisiert haben.
5. Den `☐` vor dem Release-Titel zu `☑` umändern (oder den Block einfach durchstreichen).

---

## ☐ 0067.055 — Motörhead — Motörhead (1978)

- **Release-ID:** `legacy-release-30505`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-30505
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-30505
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Motorhead.jpg) |
| 2 | 0 | admin_edit | 2026-05-06 07:48:52 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-30505_fbe086d0.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ 2305 — Men Without Hats — The Safety Dance (UK Remix) (1993)

- **Release-ID:** `discogs-release-675866`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-675866
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-675866
- **Images (5):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-03 14:11:41 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-675866_7f5545d5.webp) |
| 2 | 1 | discogs | 2026-04-10 12:24:11 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-675866_e890d912.webp) |
| 3 | 2 | discogs | 2026-04-10 12:24:11 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-675866_abd04c72.webp) |
| 4 | 3 | discogs | 2026-04-10 12:24:11 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-675866_274f1bb6.webp) |
| 5 | 4 | discogs | 2026-04-10 12:24:11 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-675866_4d1656f9.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ 25 499 XOT — Ultravox! — Ha!-Ha!-Ha! (1977)

- **Release-ID:** `discogs-release-47772`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-47772
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-47772
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 11:29:13 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-47772_555f094e.webp) |
| 2 | 1 | discogs | 2026-04-12 09:34:30 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-47772_dd4496e1.webp) |
| 3 | 2 | discogs | 2026-04-12 09:34:30 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-47772_733a3f7f.webp) |
| 4 | 3 | discogs | 2026-04-12 09:34:30 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-47772_0df474ee.webp) |
| 5 | 4 | discogs | 2026-04-12 09:34:30 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-47772_d04b2be1.webp) |
| 6 | 5 | discogs | 2026-04-12 09:34:30 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-47772_4a6dc9b4.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ 4D-140 — Various — The Industrial Records Story (1985)

- **Release-ID:** `legacy-release-23015`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-23015
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-23015
- **Images (3):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Various_Industrial_Record_Story_A.jpg) |
| 2 | 0 | admin_edit | 2026-05-06 11:33:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-23015_dd3778e7.webp) |
| 3 | 1 | legacy | 2026-03-06 15:27:09 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Various_Industrial_record_Story.jpg) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ 6400 741 — Warning — Why Can The Bodies Fly (1983)

- **Release-ID:** `discogs-release-218766`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-218766
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-218766
- **Images (5):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-05 15:18:51 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-218766_05a11d8b.webp) |
| 2 | 1 | discogs | 2026-04-12 06:50:34 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-218766_cef15222.webp) |
| 3 | 2 | discogs | 2026-04-12 06:50:34 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-218766_1ac7a76e.webp) |
| 4 | 3 | discogs | 2026-04-12 06:50:34 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-218766_9c036677.webp) |
| 5 | 4 | discogs | 2026-04-12 06:50:34 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-218766_a7a42bbc.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ 72445-11052-1-RE — Tool — Undertow (1996)

- **Release-ID:** `discogs-release-2267578`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-2267578
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-2267578
- **Images (3):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 10:31:16 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2267578_186fa62e.webp) |
| 2 | 1 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2267578_db82cf8a.webp) |
| 3 | 2 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2267578_f9676cff.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ 828 006-1 — Violent Femmes — The Blind Leading The Naked (1986)

- **Release-ID:** `discogs-release-11496537`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-11496537
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-11496537
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 11:26:51 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-11496537_5a6264f3.webp) |
| 2 | 1 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-11496537_085dd63d.webp) |
| 3 | 2 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-11496537_b59e51c1.webp) |
| 4 | 3 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-11496537_f2eddda7.webp) |
| 5 | 4 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-11496537_176727cc.webp) |
| 6 | 5 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-11496537_80a6751e.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ 9123 017 — Ultravox! — Ultravox! (1977)

- **Release-ID:** `discogs-release-3098321`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-3098321
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-3098321
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 10:21:35 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-3098321_32eec56e.webp) |
| 2 | 1 | discogs | 2026-04-12 09:34:30 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-3098321_64e3e2a4.webp) |
| 3 | 2 | discogs | 2026-04-12 09:34:30 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-3098321_49b8b54f.webp) |
| 4 | 3 | discogs | 2026-04-12 09:34:30 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-3098321_63b521b8.webp) |
| 5 | 4 | discogs | 2026-04-12 09:34:30 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-3098321_2dc2f5d1.webp) |
| 6 | 5 | discogs | 2026-04-12 09:34:30 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-3098321_d2691dc6.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ AFTER 2 — Vyllies, The — Lilith (1986)

- **Release-ID:** `legacy-release-24720`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-24720
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-24720
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Vyllies_Lilith.jpg) |
| 2 | 0 | admin_edit | 2026-05-05 14:44:16 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-24720_2dd219b1.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ AM2241TLP — Front 242 — Geography (2016)

- **Release-ID:** `legacy-release-32837`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-32837
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-32837
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Front_242_geography_himalaya_33jpg) |
| 2 | 0 | admin_edit | 2026-05-06 09:51:45 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-32837_558460d2.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ AVRS 7013 X — no-artist — Hans Koller Plays Kovac Vol. 1 (1957)

- **Release-ID:** `discogs-release-19888204`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-19888204
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-19888204
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-02 07:52:49 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-19888204_dfb489b6.webp) |
| 2 | 1 | discogs | 2026-04-11 14:08:01 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-19888204_cce4e5d7.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ BLP 5025 — no-artist — New Faces–New Sounds (1953)

- **Release-ID:** `discogs-release-2879008`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-2879008
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-2879008
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-02 08:28:07 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2879008_37a6f495.webp) |
| 2 | 1 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2879008_585ed292.webp) |
| 3 | 2 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2879008_1af183ec.webp) |
| 4 | 3 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2879008_38230539.webp) |
| 5 | 4 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2879008_bd114029.webp) |
| 6 | 5 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2879008_5e1012f7.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ BSK 3239 — no-artist — Q: Are We Not Men? A: We Are Devo! (1978)

- **Release-ID:** `discogs-release-2603754`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-2603754
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-2603754
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-04-30 09:34:42 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2603754_18d73ee7.webp) |
| 2 | 1 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2603754_5b6c0b2c.webp) |
| 3 | 2 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2603754_0be24d13.webp) |
| 4 | 3 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2603754_04cc5190.webp) |
| 5 | 4 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2603754_893525d4.webp) |
| 6 | 5 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2603754_7cd30d8c.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ BSK 3398 — Wire — 154 (1979)

- **Release-ID:** `discogs-release-540618`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-540618
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-540618
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 10:24:52 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-540618_6e434a0e.webp) |
| 2 | 1 | discogs | 2026-04-11 06:03:02 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-540618_7d18fea5.webp) |
| 3 | 2 | discogs | 2026-04-11 06:03:02 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-540618_dfacfc9d.webp) |
| 4 | 3 | discogs | 2026-04-11 06:03:02 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-540618_bdc482c6.webp) |
| 5 | 4 | discogs | 2026-04-11 06:03:02 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-540618_b3399876.webp) |
| 6 | 5 | discogs | 2026-04-11 06:03:02 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-540618_313ae54e.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ BST 84027 — no-artist — The Music From "The Connection" (1960)

- **Release-ID:** `discogs-release-5495455`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-5495455
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-5495455
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-02 12:13:59 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-5495455_21c7d2e8.webp) |
| 2 | 1 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-5495455_ea91c400.webp) |
| 3 | 2 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-5495455_fdc24122.webp) |
| 4 | 3 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-5495455_0d24ba6f.webp) |
| 5 | 4 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-5495455_0fcaa1cd.webp) |
| 6 | 5 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-5495455_190355c8.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ BST 84362 K — no-artist — San Francisco (1971)

- **Release-ID:** `discogs-release-901911`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-901911
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-901911
- **Images (5):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-02 09:10:34 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-901911_b184d171.webp) |
| 2 | 1 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-901911_df143e53.webp) |
| 3 | 2 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-901911_ddc6a48c.webp) |
| 4 | 3 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-901911_ab71f3f9.webp) |
| 5 | 4 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-901911_bafe617d.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ CD007 — Avengers — Avengers (no-year)

- **Release-ID:** `discogs-release-2851786`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-2851786
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-2851786
- **Images (5):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 05:45:56 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2851786_7b25b29b.webp) |
| 2 | 1 | discogs | 2026-04-10 12:26:06 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2851786_d660d172.webp) |
| 3 | 2 | discogs | 2026-04-10 12:26:06 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2851786_9f695080.webp) |
| 4 | 3 | discogs | 2026-04-10 12:26:06 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2851786_e91d79bf.webp) |
| 5 | 4 | discogs | 2026-04-10 12:26:06 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2851786_31683330.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ CEL 2 6565 — Teenage Jesus And The Jerks — Pre Teenage Jesus And The Jerks (1980)

- **Release-ID:** `discogs-release-2365221`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-2365221
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-2365221
- **Images (5):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-03 13:46:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2365221_e2e78da8.webp) |
| 2 | 1 | discogs | 2026-04-10 12:26:06 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2365221_fbc6d767.webp) |
| 3 | 2 | discogs | 2026-04-10 12:26:06 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2365221_3f106713.webp) |
| 4 | 3 | discogs | 2026-04-10 12:26:06 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2365221_b82bcf50.webp) |
| 5 | 4 | discogs | 2026-04-10 12:26:06 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2365221_47e65b81.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ EPC 82097 — Vibrators, The — Pure Mania (1977)

- **Release-ID:** `discogs-release-674430`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-674430
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-674430
- **Images (5):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 10:07:34 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-674430_bd3ce966.webp) |
| 2 | 1 | discogs | 2026-04-10 12:24:11 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-674430_33d717be.webp) |
| 3 | 2 | discogs | 2026-04-10 12:24:11 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-674430_8770a868.webp) |
| 4 | 3 | discogs | 2026-04-10 12:24:11 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-674430_1fedefdf.webp) |
| 5 | 4 | discogs | 2026-04-10 12:24:11 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-674430_f3597dc5.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ ESP-1002 — Albert Ayler Trio — Spiritual Unity (1965)

- **Release-ID:** `discogs-release-567275`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-567275
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-567275
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-03 17:38:33 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-567275_d40fea1c.webp) |
| 2 | 1 | discogs | 2026-04-12 12:53:08 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-567275_70a264b0.webp) |
| 3 | 2 | discogs | 2026-04-12 12:53:08 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-567275_3cbe61cb.webp) |
| 4 | 3 | discogs | 2026-04-12 12:53:08 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-567275_70da1acd.webp) |
| 5 | 4 | discogs | 2026-04-12 12:53:08 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-567275_2ef021c2.webp) |
| 6 | 5 | discogs | 2026-04-12 12:53:08 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-567275_82ecd0e6.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ ESP-1006 — Ornette Coleman — Town Hall, 1962 (1973)

- **Release-ID:** `discogs-release-4436030`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-4436030
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-4436030
- **Images (4):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-04 05:40:00 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-4436030_a5a2ab6d.webp) |
| 2 | 1 | discogs | 2026-04-11 18:48:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-4436030_5dbc2c08.webp) |
| 3 | 2 | discogs | 2026-04-11 18:48:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-4436030_46158165.webp) |
| 4 | 3 | discogs | 2026-04-11 18:48:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-4436030_d8b299d3.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ FACT 40 — Joy Division — Still (1981)

- **Release-ID:** `legacy-release-32957`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-32957
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-32957
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 14:37:45 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-32957_711173b6.webp) |
| 2 | 3 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Joy_division_still_BASE_25jpg) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ IC 1007 — no-artist — Live At The Hilcrest Club 1958 (1976)

- **Release-ID:** `discogs-release-9612847`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-9612847
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-9612847
- **Images (4):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-01 14:27:03 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-9612847_b16781d3.webp) |
| 2 | 1 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-9612847_933dc831.webp) |
| 3 | 2 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-9612847_ea74dfa5.webp) |
| 4 | 3 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-9612847_5598340a.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ INT 146.800 — no-artist — Fireside Favourites (1981)

- **Release-ID:** `legacy-release-27813`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-27813
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-27813
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-03 09:44:22 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-27813_491271b9.webp) |
| 2 | 27 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Fad_Gadget_Fireside.jpg) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ MOP 3 — Test Dept. — Victory (1987)

- **Release-ID:** `legacy-release-33476`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-33476
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-33476
- **Images (3):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 12:36:05 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-33476_5f3fe0eb.webp) |
| 2 | 0 | admin_edit | 2026-05-06 13:29:24 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-33476_136a5fd7.webp) |
| 3 | 1 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Test_Dept_a_good_night_out_9jpg) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ MOP13 — Test Dept. — Victory (1987)

- **Release-ID:** `legacy-release-33480`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-33480
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-33480
- **Images (1):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 12:34:34 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-33480_0d340298.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ MOP4 — Test Dept. / Brith Gof — Gododdin (1989)

- **Release-ID:** `legacy-release-25217`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-25217
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-25217
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Test_Dept_Brith_Gof.jpg) |
| 2 | 0 | admin_edit | 2026-05-06 12:27:12 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-25217_bd09c2c8.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ MOS 003 — Chrome — Into The Eyes Of The Zombie King (1984)

- **Release-ID:** `legacy-release-32553`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-32553
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-32553
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 14:16:45 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-32553_4663f1e9.webp) |
| 2 | 3 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Chrome_into_the_eyes_19jpg) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ MW010 — Das Kabinette — Spy Thriller (2008)

- **Release-ID:** `legacy-release-32619`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-32619
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-32619
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-03 12:54:40 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-32619_c4e23b03.webp) |
| 2 | 18 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Das_Kabinette_Spy_thriller_119jpg) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ NIM-001 — Zero Boys — Vicious Circle (1982)

- **Release-ID:** `legacy-release-27911`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-27911
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-27911
- **Images (1):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 10:00:52 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-27911_6b9a960e.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ No. 12 — no-artist — DNA On DNA (2008)

- **Release-ID:** `legacy-release-33816`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-33816
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-33816
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/DNA_you_and_youjpg) |
| 2 | 0 | admin_edit | 2026-04-30 08:54:41 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-33816_afe3bd89.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ RR0677 — Residents, The — Meet The Residents (1979)

- **Release-ID:** `discogs-release-159779`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-159779
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-159779
- **Images (5):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 14:54:10 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-159779_ef05ce3f.webp) |
| 2 | 1 | discogs | 2026-04-12 12:53:08 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-159779_39f4f0f4.webp) |
| 3 | 2 | discogs | 2026-04-12 12:53:08 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-159779_3e40ba24.webp) |
| 4 | 3 | discogs | 2026-04-12 12:53:08 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-159779_f0d0e544.webp) |
| 5 | 4 | discogs | 2026-04-12 12:53:08 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-159779_6dbfe323.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ RRA 12 — Slapp Happy / Henry Cow — Desperate Straights (no-year)

- **Release-ID:** `discogs-release-2990641`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-2990641
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-2990641
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 14:41:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2990641_4995ffa4.webp) |
| 2 | 1 | discogs | 2026-04-11 12:44:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2990641_aeea77db.webp) |
| 3 | 2 | discogs | 2026-04-11 12:44:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2990641_34d41b3b.webp) |
| 4 | 3 | discogs | 2026-04-11 12:44:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2990641_6702958d.webp) |
| 5 | 4 | discogs | 2026-04-11 12:44:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2990641_8132789d.webp) |
| 6 | 5 | discogs | 2026-04-11 12:44:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2990641_cd344d45.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ RTD 55 — no-artist — Within The Realm Of A Dying Sun (1987)

- **Release-ID:** `legacy-release-33975`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-33975
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-33975
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | legacy | 2026-04-01 13:58:32 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Dead_Can_Dance_Within_The_Realm_Of_A_Dying_Sunjpg) |
| 2 | 0 | admin_edit | 2026-04-30 09:00:02 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-33975_ca60d2d8.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ SHELP 2 — Glove, The — Blue Sunshine (1983)

- **Release-ID:** `legacy-release-32859`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-32859
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-32859
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-03 15:27:24 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-32859_a544fc41.webp) |
| 2 | 5 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/glove_blue_sunshine_uk_18jpg) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ SMJ-6503 — Miles Davis Quintet, The — Workin' With The Miles Davis Quintet (1975)

- **Release-ID:** `discogs-release-6020239`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-6020239
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-6020239
- **Images (5):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-04 05:48:00 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-6020239_9b04db0f.webp) |
| 2 | 1 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-6020239_a20c1f80.webp) |
| 3 | 2 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-6020239_cb2098ec.webp) |
| 4 | 3 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-6020239_6f50d194.webp) |
| 5 | 4 | discogs | 2026-04-11 12:45:48 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-6020239_20b007e9.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ SOLV 13 — Legendary Pink Dots, The — The Maria Dimension Complete Recordings (2015)

- **Release-ID:** `legacy-release-33903`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-33903
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-33903
- **Images (1):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 09:31:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-33903_f783d15c.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ SPITTLE122 — Rats — C'est Disco (2022)

- **Release-ID:** `discogs-release-2352526`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-2352526
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-2352526
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 13:21:36 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2352526_e800e7d0.webp) |
| 2 | 1 | discogs | 2026-04-12 12:05:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2352526_8cdcc97a.webp) |
| 3 | 2 | discogs | 2026-04-12 12:05:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2352526_d8f5291a.webp) |
| 4 | 3 | discogs | 2026-04-12 12:05:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2352526_88421715.webp) |
| 5 | 4 | discogs | 2026-04-12 12:05:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2352526_f5035d3f.webp) |
| 6 | 5 | discogs | 2026-04-12 12:05:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2352526_f22a5059.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ SPV 50-7329 — Moev — Yeah Whatever (1988)

- **Release-ID:** `legacy-release-33098`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-33098
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-33098
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Moev_yeah_whateverjpg) |
| 2 | 0 | admin_edit | 2026-05-03 14:13:11 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-33098_c3402001.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ SR-103 — Germs — (GI) (1979)

- **Release-ID:** `discogs-release-374364`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-374364
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-374364
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 07:41:19 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-374364_f9e0a3b1.webp) |
| 2 | 1 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-374364_c9288c39.webp) |
| 3 | 2 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-374364_f102bb43.webp) |
| 4 | 3 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-374364_d7283da4.webp) |
| 5 | 4 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-374364_d0776006.webp) |
| 6 | 5 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-374364_50e582d7.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ SST 059 — Sonic Youth — Evol (1986)

- **Release-ID:** `discogs-release-843885`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-843885
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-843885
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 07:22:10 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-843885_37308f44.webp) |
| 2 | 1 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-843885_ed4fa145.webp) |
| 3 | 2 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-843885_610d1f84.webp) |
| 4 | 3 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-843885_99b4ae22.webp) |
| 5 | 4 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-843885_f2bf12fa.webp) |
| 6 | 5 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-843885_39881b98.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ ST 7559 — Chrome — Live In Germany (1989)

- **Release-ID:** `legacy-release-32552`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-32552
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-32552
- **Images (5):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 13:59:41 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-32552_1205b511.webp) |
| 2 | 0 | admin_edit | 2026-05-06 14:02:25 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-32552_10027a0f.webp) |
| 3 | 0 | admin_edit | 2026-05-06 14:04:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-32552_d1af4b92.webp) |
| 4 | 0 | admin_edit | 2026-05-06 14:09:31 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-32552_fc58ea71.webp) |
| 5 | 2 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Chrome_Germany_15jpg) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ THRILL 013 — Tortoise — Tortoise (1994)

- **Release-ID:** `discogs-release-97896`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-97896
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-97896
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 11:59:58 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-97896_c7fa1384.webp) |
| 2 | 1 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-97896_9dc23278.webp) |
| 3 | 2 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-97896_08ab9b6b.webp) |
| 4 | 3 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-97896_41ad45d9.webp) |
| 5 | 4 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-97896_21799de1.webp) |
| 6 | 5 | discogs | 2026-04-11 17:27:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-97896_05af524d.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ TORSO RECORDS 33181 — no-artist — Love's Secret Domain (1991)

- **Release-ID:** `discogs-release-104403`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-104403
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-104403
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-04-29 19:10:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-104403_2fa2aa67.webp) |
| 2 | 1 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-104403_5312adaa.webp) |
| 3 | 2 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-104403_7126ea80.webp) |
| 4 | 3 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-104403_1a566c2e.webp) |
| 5 | 4 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-104403_92779ac6.webp) |
| 6 | 5 | discogs | 2026-04-12 14:01:54 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-104403_53200b04.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ Tempo 123 — Pankow — Touch (1988)

- **Release-ID:** `legacy-release-33275`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-33275
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-33275
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-03 17:22:50 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-33275_5d989386.webp) |
| 2 | 1 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Pnakow_Touch_promojpg) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ UD0134 — Nurse With Wound — Psilotripitaka (1990)

- **Release-ID:** `discogs-release-133221`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-133221
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-133221
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-06 09:47:09 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-133221_3398857b.webp) |
| 2 | 1 | discogs | 2026-04-10 12:23:05 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-133221_73835078.webp) |
| 3 | 2 | discogs | 2026-04-10 12:23:05 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-133221_caa6d7d8.webp) |
| 4 | 3 | discogs | 2026-04-10 12:23:05 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-133221_dc069fb1.webp) |
| 5 | 4 | discogs | 2026-04-10 12:23:05 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-133221_b62b5c2c.webp) |
| 6 | 5 | discogs | 2026-04-10 12:23:05 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-133221_4bea2e24.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ WA 1001 — no-artist — Alpha And Omega (1973)

- **Release-ID:** `discogs-release-2692614`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-2692614
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-2692614
- **Images (5):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-01 14:05:26 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2692614_b2ea27b2.webp) |
| 2 | 1 | discogs | 2026-04-11 12:44:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2692614_57d0c75f.webp) |
| 3 | 2 | discogs | 2026-04-11 12:44:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2692614_ad1f4007.webp) |
| 4 | 3 | discogs | 2026-04-11 12:44:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2692614_848e6126.webp) |
| 5 | 4 | discogs | 2026-04-11 12:44:37 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-2692614_f5778b3f.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ WESTSIDE 21014 — Moskwa TV — Tekno Talk (Bombing Mix) (1985)

- **Release-ID:** `discogs-release-351787`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-351787
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-351787
- **Images (6):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-03 14:24:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-351787_7bbd6836.webp) |
| 2 | 1 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-351787_e1e154c5.webp) |
| 3 | 2 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-351787_122ade11.webp) |
| 4 | 3 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-351787_aaf8d3d0.webp) |
| 5 | 4 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-351787_ab67bb80.webp) |
| 6 | 5 | discogs | 2026-04-12 14:42:18 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-351787_877bdf61.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ WESTSIDE 21017 R — Moskwa TV — Generator 7/8 (Double Remix) (1985)

- **Release-ID:** `legacy-release-33106`
- **Admin:** https://admin.vod-auctions.com/app/media/legacy-release-33106
- **Storefront:** https://vod-auctions.com/catalog/legacy-release-33106
- **Images (2):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-03 14:23:45 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/legacy-release-33106_b441aa81.webp) |
| 2 | 1 | legacy | 2026-03-01 18:46:53 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/standard/Moskwa_TV_dynamics_9jpg) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

## ☐ Youdo 07 — Brannten Schnüre — Durch Unser Zugedecktes Tal (2019)

- **Release-ID:** `discogs-release-14357290`
- **Admin:** https://admin.vod-auctions.com/app/media/discogs-release-14357290
- **Storefront:** https://vod-auctions.com/catalog/discogs-release-14357290
- **Images (1):** sortiert nach aktueller `rang ASC, id ASC` — der ERSTE in der Liste ist aktuell das sichtbare Cover.

| # | rang | Source | Created | URL |
|---|---|---|---|---|
| 1 | 0 | admin_edit | 2026-05-03 14:36:51 | [Bild](https://pub-433520acd4174598939bc51f96e2b8b9.r2.dev/tape-mag/discogs/discogs-release-14357290_89123d8c.webp) |

**Aktion:** Im Admin den richtigen Bild-Kandidaten via ★ als Cover setzen. Das alte falsche Cover bleibt als Galerie-Thumbnail erhalten (kann optional via × entfernt werden).

---

**Backend-Fix:** `backend/src/api/admin/media/[id]/route.ts:458-466` (rc52.x) — neuer Cover-Apply bumpt alle existierenden Images +10 vorher. Same Pattern wie POST /images mit set_as_cover=true. Der Bug taucht ab dem nächsten Deploy nicht mehr auf.

**Begleit-Fixes:**
- `discogs-preview/route.ts` — current.artist_display_name war nicht im Snapshot → diff zeigte das Feld immer als geändert. Jetzt korrekt.
- `DiscogsReviewModal.tsx` — Badge `🔒 locked` → `🔒 sync-locked` mit Tooltip; Footer-Erklärung klarer.

**Wenn fertig:**
Diese MD-Datei umbenennen zu `COVER_IMAGE_CLEANUP_2026-05-06_done.md` oder löschen.
