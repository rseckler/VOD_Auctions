# 6 — Frank-Agenda: die 11 Entscheidungen

**Stand:** 2026-05-16
**Autor:** Robin Seckler
**Zweck:** Entscheidungsvorlage für die gemeinsame Sitzung mit Frank (Umsetzungsplan Phase 0.1). Alle 11 offenen Entscheidungen, die getroffen werden müssen, **bevor** der Umsetzungsplan startet.
**Kontext:** [`2_STRATEGIE_KONZEPT.md`](2_STRATEGIE_KONZEPT.md) (Begründungen), [`5_SEO_KONZEPT.md`](5_SEO_KONZEPT.md) (SEO-Details).

**So nutzen:** Jede Entscheidung hat Kontext, Optionen, eine Empfehlung und ein Feld „Entscheidung". In der Sitzung durchgehen, Entscheidung eintragen, danach in `docs/TODO.md` + Linear überführen.

---

## Übersicht & empfohlene Reihenfolge

Die Entscheidungen sind in vier Blöcke gruppiert. **Block A zuerst** — er liegt auf dem kritischen Pfad (StB-abhängig, blockiert den Shop-Cutover).

| Block | Entscheidungen | Thema |
|---|---|---|
| **A — Recht & Geschäftsmodell** | #4 | Kommissionsmodell (kritischer Pfad) |
| **B — Membership & Zugang** | #8, #9, #11 | Membership-Umfang, Bestandskunden, tape-mag-Gate |
| **C — Marke & SEO** | #1, #10 | Label-Domain, Canonical-Hoheit |
| **D — Migration & Architektur** | #2, #3, #5, #6, #7 | Accounts, Community, Bestellhistorie, Reihenfolge, POS |

| # | Kurzfrage | Empfehlung |
|---|---|---|
| 1 | Primäre Label-Domain? | `vod-records.com` |
| 2 | Kunden-Accounts: Auto vs. Invite? | Invite-Flow |
| 3 | Wo lebt die Community? | primär tape-mag-Erlebnis-App |
| 4 | Kommissionsmodell? | reine Vermittlung (StB-Bestätigung) |
| 5 | Bestellhistorie: echtes Archiv vs. `transaction`? | read-only Legacy-Archiv |
| 6 | tape-mag-App oder vod-records-Cutover zuerst? | parallel |
| 7 | Ladengeschäft/POS vor oder nach Online-Cutover? | nach Cutover |
| 8 | Umfang Basis-Membership? | inkl. Bieten/Kaufen, kein Verkauf |
| 9 | Bestandskunden-Übergang ins Membership? | Grandfathering / Gratis-Startkontingent |
| 10 | SEO-Canonical-Hoheit? | tape-mag kanonisch für Katalog-Content |
| 11 | tape-mag-Zugang: frei vs. gegated? | „Freemium-tape-mag" (Preview + Member-Tiefe) |

---

# Block A — Recht & Geschäftsmodell

## Entscheidung #4 — Kommissionsmodell ⚠️ kritischer Pfad

**Frage:** Wenn Dritt-Verkäufer über VOD Auctions verkaufen — handelt VOD als **echter Verkaufskommissionär** (verkauft im eigenen Namen für Rechnung des Einlieferers) oder als **reiner Vermittler** (Kaufvertrag entsteht direkt zwischen Verkäufer und Käufer, VOD stellt nur die Plattform)?

**Kontext:** Diese Entscheidung bestimmt Datenmodell, Rechnungslogik, Haftung und §25a-Anwendbarkeit. Sie steht laut `Bereinigte_Fassung_VOD_Records_2026-03-28.md` auf ROT und muss mit dem Steuerberater geklärt werden. Da VOD über **Membership** statt Provision monetarisiert, tendiert das Modell ohnehin Richtung reine Vermittlung.

**Optionen:** (A) echte Verkaufskommission · (B) reine Vermittlung / Plattformmodell.

**Empfehlung:** **(B) reine Vermittlung** — passt zum Membership-Modell (keine Provision pro Verkauf), einfachere Rechnungs-/Haftungslogik. **Muss vom Steuerberater bestätigt werden.**

**Blockiert:** Shop-Datenmodell, §25a-Rechnungslogik, gesamten Marktplatz-Bau (P2).

**Entscheidung:** _______________________________________________

---

# Block B — Membership & Zugang

## Entscheidung #8 — Umfang der Basis-Membership

**Frage:** Was darf die Basis-Membership (~€2–3/Monat) auf dem VOD-Auctions-Marktplatz — strikt nur ansehen, oder auch bieten/kaufen?

**Kontext:** „read-only" wörtlich hieße nur ansehen. Kaufen/Bieten ist aber der eigentliche Zweck. (VOD-Records-Label-Käufe sind ohnehin membership-frei — das ist geklärt.)

**Optionen:** (A) strikt read-only + separates Kauf-Tier · (B) Basis-Membership = bieten + kaufen, nur kein Verkauf.

**Empfehlung:** **(B)** — Basis-Membership erlaubt Bieten/Kaufen auf dem Marktplatz; Verkaufen erfordert die Seller-Membership.

**Blockiert:** Membership-Tier-Design.

**Entscheidung:** _______________________________________________

## Entscheidung #9 — Bestandskunden-Übergang ins Membership-Modell

**Frage:** Wie kommen die ~11.600 vod-records-Bestandskunden und 3.632 tape-mag-Mitglieder in das neue Membership-Modell, ohne dass sie an der Paywall abspringen?

**Kontext:** Beim Umzug treffen langjährige Kunden plötzlich auf eine Membership-Hürde. Ohne Übergangsregel droht massive Abwanderung der wertvollsten Kundengruppe.

**Optionen:** (A) Grandfathering — Bestandskunden dauerhaft frei/vergünstigt · (B) kostenloses Start-Kontingent / Einführungszeitraum · (C) reguläre Einführungs-Aktion (Rabatt).

**Empfehlung:** **Grandfathering bzw. kostenloses Start-Kontingent** für Bestandskunden — Vertrauen der Top-Kunden hat Vorrang vor kurzfristigem Membership-Umsatz.

**Blockiert:** Migrations-Kommunikation, Account-Migration (P2.10).

**Entscheidung:** _______________________________________________

## Entscheidung #11 — tape-mag-Zugang: frei vs. membership-gegated ⚠️ SEO-kritisch

**Frage:** Bleibt die tape-mag-Erlebnisplattform frei zugänglich, oder wird auch sie membership-gegated („Nur mit Membership kommst du auf tape-mag")?

**Kontext:** Dies ist die SEO-kritischste Einzelentscheidung. Eine *komplett* gegatete Plattform kann von Suchmaschinen nicht gecrawlt werden — der 41k-Long-Tail wird unsichtbar, neue Sammler finden VOD nicht mehr (Cold-Start-Tod). Details: [`5_SEO_KONZEPT.md`](5_SEO_KONZEPT.md) §1.

**Optionen:**
- (A) **tape-mag bleibt frei** — gesamte Erlebnisplattform öffentlich. Maximale SEO-Power.
- (B) **tape-mag wird gegated** — nur tragbar **mit** öffentlicher, crawlbarer Preview-Seite pro Entität. SEO reduziert, aber erhalten.
- **Rote Linie:** keine Variante ohne öffentliche Preview-Schicht — das wäre SEO-Totalverlust.

**Empfehlung:** **„Freemium-tape-mag"** — öffentliche, crawlbare Preview pro Entität (Cover, Eckdaten, Teaser, Sold-Preis) + volle Erlebnistiefe (Galerien, Editorial, Community) hinter der Membership. Erlaubt Membership-Upselling auf tape-mag **und** erhält SEO + Discovery.

**Blockiert:** SEO-Modell, tape-mag-App-Scope, Redirect-Strategie.

**Entscheidung:** _______________________________________________

---

# Block C — Marke & SEO

## Entscheidung #1 — Primäre Label-Domain

**Frage:** `vod-records.com` oder `vinyl-on-demand.com` als primäre Domain des Plattenlabels VOD Records? Die jeweils andere wird 301-umgeleitet.

**Kontext:** Beide gehören zur selben Label-Marke. Es braucht eine kanonische Domain. `vod-records.com` passt zum Email-Absender `frank@vod-records.com` und zum Impressum; `vinyl-on-demand.com` ist der voll ausgeschriebene Name.

**Empfehlung:** **`vod-records.com`** als primär (passt zu Email/Impressum, kürzer), `vinyl-on-demand.com` → 301.

**Blockiert:** 301-Redirect-Matrix.

**Entscheidung:** _______________________________________________

## Entscheidung #10 — SEO-Canonical-Hoheit

**Frage:** Dasselbe Release wird auf tape-mag *und* in der Commerce-App gerendert. Welche Seite ist die kanonische (`rel=canonical`) für den Katalog-Content?

**Kontext:** Ohne klare Canonical-Hoheit kannibalisieren sich die Domains und Google rankt keine zuverlässig.

**Empfehlung:** **tape-mag-Release-Seite ist kanonisch** für die immergültige Katalog-/Release-Identität. Auktions-Lose sind eigene Seiten; Festpreis-Commerce-Seiten verweisen per Canonical auf tape-mag.

**Blockiert:** interne Verlinkung, Sitemap-Design.

**Entscheidung:** _______________________________________________

---

# Block D — Migration & Architektur

## Entscheidung #2 — Kunden-Account-Migration

**Frage:** Erhalten die ~11.600 Bestandskunden automatisch Accounts (Passwort-Reset-Mail) oder registrieren sie sich per Invite-Flow neu?

**Kontext:** Auto-Accounts bedeuten Massen-Kaltmail + viele Account-Leichen. Der Invite-Flow ordnet Bestellhistorie + CRM-Tier nach Email-Verifikation zu.

**Optionen:** (A) Auto-Accounts + Passwort-Reset-Mail · (B) Invite-Flow mit Historie-Zuordnung.

**Empfehlung:** **(B) Invite-Flow** — DSGVO-sauberer, kein Massen-Kaltmail, keine Karteileichen.

**Blockiert:** Account-Migrationsschritt (P2.6).

**Entscheidung:** _______________________________________________

## Entscheidung #3 — Wo lebt die Community?

**Frage:** Lebt das Community-System primär in der tape-mag-Erlebnis-App oder in der Commerce-App?

**Kontext:** Das Community-System ist heute Teil der Commerce-App. Inhaltlich gehört „Diskutieren, Bewerten, Entdecken" zur Erlebnis-Plattform.

**Empfehlung:** **Primär in der tape-mag-Erlebnis-App**, technisch auf dem geteilten Fundament — sodass Reviews auch in der Commerce-App an Releases erscheinen können.

**Blockiert:** tape-mag-App-Scope.

**Entscheidung:** _______________________________________________

## Entscheidung #5 — Bestellhistorie-Modell

**Frage:** Werden die 8.230 + 3.062 Alt-Bestellungen als echte `transaction`-Rows importiert oder als read-only Anzeige-Archiv?

**Kontext:** Echte `transaction`-Rows verfälschen Reporting und erzeugen FK-Konflikte. Ein Anzeige-Archiv (`legacy_order`-Tabellen) zeigt die Historie pro Kundenkonto, ohne das Live-System zu verschmutzen.

**Empfehlung:** **Read-only Legacy-Archiv** pro Kundenkonto.

**Blockiert:** Order-Migrations-Schema (P2.5).

**Entscheidung:** _______________________________________________

## Entscheidung #6 — Reihenfolge der Bau-Stränge

**Frage:** Zuerst die tape-mag-Erlebnis-App bauen oder zuerst den vod-records-Shop-Cutover?

**Kontext:** Es sind zwei getrennte Bau-Stränge (P2 Commerce-Cutover, P3 tape-mag-App). Die Daten- und Recht-Phasen (P0/P1) sind ohnehin gemeinsam.

**Empfehlung:** **Parallel** — gemeinsame Daten-/Recht-Phase, dann beide Builds parallel. So wird die Wartezeit auf den Steuerberater produktiv genutzt.

**Blockiert:** Phasen-Priorisierung.

**Entscheidung:** _______________________________________________

## Entscheidung #7 — Ladengeschäft / POS-Timing

**Frage:** Wird das Ladengeschäft / POS vor oder nach dem Online-Cutover scharfgeschaltet?

**Kontext:** POS läuft aktuell im Dry-Run und wartet ohnehin auf den Steuerberater (P1).

**Empfehlung:** **Nach dem Online-Cutover** — POS als separater Strang, nicht den Online-Umzug blockieren.

**Blockiert:** POS-Priorisierung.

**Entscheidung:** _______________________________________________

---

## Nach der Sitzung

1. Entscheidungen in dieses Dokument eintragen (Felder oben).
2. Betroffene Stellen in `2_STRATEGIE_KONZEPT.md` §10, `4_UMSETZUNGSPLAN.md` Phase 0 und ggf. `5_SEO_KONZEPT.md` aktualisieren.
3. Umsetzungsplan in `docs/TODO.md` + Linear überführen.
4. Steuerberater-Termin für #4 + §25a-Testfall ansetzen (kritischer Pfad).
