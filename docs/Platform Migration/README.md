# Platform Migration — Dokumentenbündel

**Stand:** 2026-05-16 (v2 — nach Klarstellung der Plattform-Landschaft)
**Autor:** Robin Seckler
**Zweck:** Konsolidierte, kritisch geprüfte Gesamtdarstellung der Überführung von **tape-mag.com** und **vod-records.com / vinyl-on-demand.com** auf das gemeinsame neue Plattform-Fundament.

Bisher waren die Überlegungen über ~15 Dokumente in `docs/business/`, `docs/architecture/`, `docs/optimizing/`, `docs/Community/` verstreut. Dieses Bündel führt sie zusammen, prüft sie kritisch und macht das Thema sauber angehbar.

---

## Das Zielbild in einem Satz

> **Ein gemeinsames technisches Fundament** (Medusa/Next.js/Supabase, die bestehende VOD_Auctions-Codebasis), darauf **zwei Apps**, die sich **eine Katalog-Datenbank teilen**:
> - die **Commerce-App** — technisch eine Plattform, mit zwei Marken-Gesichtern: **VOD Records** (das Plattenlabel, eigene Editionen seit 20+ Jahren, `vod-records.com` / `vinyl-on-demand.com`) und **VOD Auctions** (die Marktplatz-Plattform für Auktion + Direktverkauf, perspektivisch auch Dritt-Verkäufer, `vod-auctions.com`);
> - die **tape-mag-Erlebnis-App** — eigenständige neue Anwendung unter `tape-mag.com`, auf der Frank's gesamtes Archiv *erlebt* wird.

tape-mag und die Commerce-Plattform sind **zwei unterschiedliche Themen** — Erlebnis vs. Verkauf — auf demselben Unterbau.

## Die drei Arbeitspakete des Scopes

1. **tape-mag-Erlebnisplattform — Neuaufbau.** Die alte PHP-„3wadmin"-Seite wird durch eine neue App auf dem gemeinsamen Stack ersetzt. tape-mag als Marke/Plattform **bleibt erhalten**.
2. **vod-records-Shop — Migration.** Der laufende Legacy-Webshop (3wadmin) wird in die bestehende Commerce-App überführt; `vod-records.com`/`vinyl-on-demand.com` werden Domains derselben.
3. **Auktion + Community.** Bereits Teil der Commerce-Plattform bzw. gebaut; Facebook-Content-Migration läuft.

---

## Die Kerndokumente

| # | Dokument | Inhalt |
|---|----------|--------|
| 1 | [`1_ANALYSE.md`](1_ANALYSE.md) | Bestandsaufnahme: Properties, gemeinsames Fundament, was schon liegt, was nicht — inkl. kritischer Befunde |
| 2 | [`2_STRATEGIE_KONZEPT.md`](2_STRATEGIE_KONZEPT.md) | Ziel-Architektur, Marken-Strategie, Membership-Modell, inhaltliches Konzept beider Apps, offene Entscheidungen |
| 3 | [`3_TECHNISCHES_KONZEPT.md`](3_TECHNISCHES_KONZEPT.md) | Quell-/Zielsysteme, geteilte Katalog-DB, Shop-Cutover, tape-mag-App-Aufbau, Membership-System, Decommissioning |
| 4 | [`4_UMSETZUNGSPLAN.md`](4_UMSETZUNGSPLAN.md) | Phasenplan mit Meilensteinen, Owner, Abhängigkeiten, Exit-Kriterien, Risiko-Register |
| 5 | [`5_SEO_KONZEPT.md`](5_SEO_KONZEPT.md) | Wie SEO-Power trotz Membership-Paywall maximal genutzt wird — Drei-Zonen-Modell, was zu bauen ist |
| 6 | [`6_FRANK_AGENDA.md`](6_FRANK_AGENDA.md) | Entscheidungsvorlage für die Frank-Sitzung — alle 11 offenen Entscheidungen mit Kontext, Optionen, Empfehlung |
| 7 | [`7_DESIGN_PROMPT.md`](7_DESIGN_PROMPT.md) | Fertiger Prompt für ein Design-Tool — UX/UI-Konzepte für tape-mag (Erlebnis) und VOD Records (Commerce) |

**Leseempfehlung:** In Reihenfolge 1 → 2 → 3 → 4; Dok. 5 vertieft das SEO-Thema; Dok. 6 ist das Arbeitsdokument für die Entscheidungssitzung; Dok. 7 ist ein Tool-Input für die Design-Phase.

---

## Quelldokumente (Referenz, nicht verschoben)

Ausgewertet, bleiben an ihrem Ort (Verschieben würde Verweise in `CLAUDE.md` u.a. brechen):

- **Geschäft/Recht:** `docs/business/KONZEPT.md`, `docs/business/Bereinigte_Fassung_VOD_Records_2026-03-28.md`, `docs/business/Buchhaltung_Differenzbesteuerung.md`, `docs/legal/tape-mag_*.md`, `docs/legal/vod-records_*.md`
- **Daten/Architektur:** `docs/architecture/LEGACY_MYSQL_DATABASES.md`, `docs/architecture/PROJECT_SUMMARY.md`, `docs/optimizing/CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md`, `docs/architecture/CRM_SYSTEM_STATE_2026-05-04.md`
- **Community/Facebook:** `docs/Community/Community Concept.md` (+ Facebook Migration Annex), `docs/Community/COMMUNITY_SYSTEM_STATE.md`, `docs/sessions/2026-05-07_fb_archive_pipeline.md`

> **Hinweis:** Ein älteres Verzeichnis `VOD/tape-mag-migration/` erwähnt eine Shopify-Migration. **Shopify ist kein Bestandteil dieses Vorhabens** und kommt in keinem der vier Dokumente vor.

---

## Kurz-Fazit (Details in Dok. 1)

1. **Der Katalog liegt schon auf dem gemeinsamen Fundament** — 41.529 Releases, 75.124 Bilder in der Supabase-Katalog-DB. Beide Apps teilen sich diese Datenbasis.
2. **Die tape-mag-Erlebnisplattform existiert auf dem neuen Stack noch nicht** — sie muss neu gebaut werden; die alte PHP-Seite läuft weiter.
3. **vod-records.com ist die eigentliche Migrations-Baustelle** — ein laufender, umsatzführender Webshop (€5,27 M Lifetime). Cutover, kein Big-Bang.
4. **Recht/Steuer ist der harte Blocker** — §25a-Differenzbesteuerung + Kommissionsmodell ungeklärt (Status ROT), AGB-Anwalt offen (RSE-78).
5. **SEO unter Paywall** — gelöst über das Prinzip „es muss eine öffentliche, crawlbare Ebene geben". Ob tape-mag selbst frei bleibt oder ebenfalls membership-gegated wird (dann mit öffentlicher Preview-Schicht), ist eine offene Entscheidung. Vollständiges Konzept mit beiden Szenarien in Dok. 5.
