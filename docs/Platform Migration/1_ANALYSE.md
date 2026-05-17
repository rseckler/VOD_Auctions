# 1 — Analyse: Ausgangslage Platform Migration

**Stand:** 2026-05-16 (v2)
**Autor:** Robin Seckler
**Zweck:** Kritische, ehrliche Bestandsaufnahme. Was existiert, was liegt schon auf dem gemeinsamen Fundament, wo stehen wir wirklich, welche Befunde prägen die Strategie.

---

## 1. Die Ziel-Architektur als Bezugsrahmen

Damit die Analyse einzuordnen ist, vorab das bestätigte Zielbild:

- **Ein gemeinsames Fundament** — die bestehende VOD_Auctions-Codebasis (Medusa.js 2.13 Backend + Supabase PostgreSQL + Next.js) als technischer Unterbau für alles.
- **Eine geteilte Katalog-Datenbank** — die ~41.529 Releases + Stammdaten in Supabase. Beide Apps lesen daraus.
- **App A — Commerce.** Auktion *und* Festpreis-Verkauf. Eine Plattform, mehrere Domains: `vod-auctions.com`, `vod-records.com`, `vinyl-on-demand.com`. **Existiert bereits** (die heutige VOD_Auctions-App, `beta_test`).
- **App B — tape-mag-Erlebnisplattform.** Eigenständige neue App unter `tape-mag.com`, auf der das gesamte Archiv *erlebt/entdeckt* wird. **Existiert auf dem neuen Stack noch nicht** — die alte PHP-Seite läuft weiter.

tape-mag (Erlebnis) und Commerce (Verkauf) sind **zwei verschiedene Themen** auf demselben Fundament.

---

## 2. Die Akteure — drei Alt-Properties, ein gemeinsames Fundament

### 2.1 tape-mag.com (alt) — die Archiv-Seite
- **Was:** Nicht-kommerzielles Online-Archiv von Frank Bulls Industrial-Music-Sammlung (Vinyl, Kassetten, Reels, Bücher, Poster, Literatur). Reine Informations-/Erlebnisplattform.
- **Technik:** PHP 5.x, eigenentwickeltes „3wadmin"-CMS, jQuery, MySQL, FTP-Deployment, `tmpl_*.html`-Templates.
- **Server:** Hetzner Dedicated `213.133.106.99` (`dedi99.your-server.de`).
- **Datenbank `vodtapes`:** ~82 Tabellen, ~325k Datensätze.
  - `3wadmin_tapes_releases` — **30.093–30.179 Releases** (Streuung je Stichtag)
  - `3wadmin_tapes_band` — **12.435–12.455 Bands/Artists**
  - `3wadmin_tapes_labels` — **~3.080 Labels** (Spalte heißt `label`, nicht `name`)
  - `3wadmin_extranet_user` — **3.632 Mitglieder** (Community-Login)
  - `3wadmin_tapes_comment` — **~500 Nutzer-Kommentare/Reviews**
  - `bilder_1` / `mpool_bilder` — **~80.000 Bilddateien**
- **Datenqualität:** 63 % Releases ohne Preis, 26 % ohne Bild, latin1-Storage, HTML-Entities in ~1.160 Titeln, Discogs-Roh-HTML in ~21.682 Beschreibungen.
- **Status:** Live. GA4 (`G-Y3600HYKP3`) aktiv. **Soll erhalten bleiben — aber als neue App neu gebaut.**

### 2.2 vod-records.com + vinyl-on-demand.com — der laufende Webshop
- **Was:** Der **kommerziell aktive Webshop** (beide Domains, dieselbe 3wadmin-Shop-Instanz). Verkauf gebrauchter Tonträger, primär Eigenhandel, sekundär Kommissionsware.
- **Technik:** 3wadmin-CMS, derselbe Hetzner-Server.
- **Datenbanken:**
  - `maier_db2013` (**LIVE**): **~11.641 Kunden** (8.544 + 3.097 `_kunden_alt`), **17.315 Adressen**, **8.230 Bestellköpfe / 13.617 Positionen**, **547 kuratierte Artikel**, 2013-03-02 → 2026-04-30, 7.728 Login-Events.
  - `maier_db1` (Vor-2013): **3.114 Kunden**, 3.062 Bestellungen / 4.701 Positionen.
  - `maier_db11` (Backup-Snapshot 2005–2012): 2.556 Kunden, 2.501 Bestellungen — nur Cross-Check.
- **Geschäftszahlen:** **€5,27 M Lifetime-Umsatz** über 21.733 Transaktionen, Median €83, P95 €1.313, Top-Kunde €338k.
- **Status:** **Live und umsatzführend.** Soll in die Commerce-App migriert, die Alt-Instanz abgeschaltet werden.

### 2.3 Facebook „Vinyl On Demand Records" — die Reichweite
- **11.926 Follower**, **5.819 Posts** (2017→2026), 6.369 Medien (2,3 GB), ~4 GB Export.
- Nur Franks **2.654 eigene Antworten** im Export (Meta/DSGVO-Limit).
- **Status:** Aktiv, Export liegt vor, Aufbereitungs-Pipeline weitgehend fertig (§3.4).

### 2.4 Das gemeinsame Fundament (VOD_Auctions / Commerce-App)
- **Technik:** Medusa.js 2.13 (`:9000`) + Next.js 16 (`:3006`) + Supabase PostgreSQL (eu-central-1) + Upstash Redis + Cloudflare R2 + Stripe/PayPal + Resend/Brevo + Meilisearch. VPS, PM2, Nginx.
- **Katalog-DB:** **41.529 Releases** (30.159 Musik + 3.915 Band-Lit + 1.129 Label-Lit + 6.326 Press-Lit), 12.451 Artists, 3.077 Labels, **75.124 Bilder** (93–97 % Cover).
- **Commerce:** Auktion (Themen-Blöcke, Proxy-Bidding) **und** Festpreis (13.571 freigeschaltete Direktkauf-Artikel) — beides bereits implementiert.
- **Community:** Increments 1–4 live (rc55–rc57) — Profile, Posts, Reviews, Following, Feed, Moderation.
- **CRM:** Phase 1 — 14.450 Master-Kontakte.
- **Status:** `beta_test`. Launch-Blocker: AGB-Anwalt (RSE-78).

---

## 3. Was schon auf dem Fundament liegt — und was nicht

### 3.1 Katalog — ✅ liegt (geteilte DB)
Die Katalog-DB ist aus den tape-mag-Daten entstanden und Discogs-angereichert. **Beide künftigen Apps teilen sich genau diese Datenbasis.** Der Katalog-Inhalt ist also kein offener Migrationspunkt — er ist das Fundament.

### 3.2 Bilder — ✅ liegt
75.124 Bilder auf Cloudflare R2. Cover-Abdeckung 93–97 %.

### 3.3 Commerce-App (Auktion + Festpreis) — ✅ existiert, beta
Die App läuft, kann Auktion und Direktkauf, hat Checkout/Versand/Email. Sie ist die Basis, in die vod-records einzieht.

### 3.4 Facebook-Community-Content — 🟡 Pipeline fast fertig, Import offen
P1 rsync ✅ · P2 Bild-Aufbereitung ✅ (7.310 Dateien R2) · P3 Regel-Match ✅ · P4 AI-Vision ✅ · P5 CSV-Review ✅. **P6 (Import 5.461 Posts → `community_post`) offen** (Deployment-Timing). Frank arbeitet 2.140 Tier-2-Karten manuell ab.

### 3.5 CRM / Kundendaten — 🟡 Phase 1 fertig, 2/3 offen
14.450 Master-Kontakte, 76,7 % Email-Abdeckung, aus 5 Quellen dedupliziert. Phase 3 offen: ~4.286 Restkunden `maier_db2013`, Login-Events, Vor-2013-Details, 500 Reviews. Mail-Import 116.901/422.755, gestoppt (Importer-v2 nötig).
⚠️ **CRM ≠ Kunden-Accounts.** Migrierte Kontakte sind Marketing-Datensätze; die ~11.641 vod-records-Kunden haben keinen Login auf dem neuen Fundament.

### 3.6 tape-mag-Kommentare — 🔴 offen
~500 Legacy-Kommentare aus `vodtapes.3wadmin_tapes_comment` → `community_review`. **Blocker: `typ`-Feld nicht dekodiert.**

### 3.7 tape-mag-Erlebnisplattform — 🔴 nicht begonnen
**Echtes Bauvorhaben.** Die alte PHP-Seite läuft; eine neue Erlebnis-App auf dem gemeinsamen Stack existiert nicht. Hier ist nichts „zu migrieren" außer dem (schon vorhandenen) Katalog — es ist ein **Neuaufbau eines Frontends** auf geteilter Datenbasis.

### 3.8 vod-records-Shop — 🔴 nicht begonnen
**Die eigentliche Migrations-Lücke.** Nicht migriert: die 547 aktiv verkauften Artikel als ERP-/Festpreis-Bestand · 8.230 + 3.062 Bestellungen · 17.315 Adressen · die §25a-Preis-/Rechnungslogik · Domain-/SEO-/Email-Cutover.

### Status-Matrix

| Gegenstand | Quelle | Ziel | Status |
|---|---|---|---|
| Release-Katalog | vodtapes | geteilte Katalog-DB | ✅ Liegt |
| Bilder | FTP/`bilder_1` | R2 | ✅ Liegt |
| Commerce-App (Auktion+Festpreis) | — | VOD_Auctions | ✅ Existiert (beta) |
| CRM-Kontakte | 5 Quellen | `crm_master_contact` | 🟡 Phase 1 fertig |
| Mail-Index | IMAP | CRM | 🟡 28 %, gestoppt |
| FB-Posts | FB-Export | `community_post` | 🟡 Pipeline fertig, Import offen |
| tape-mag-Kommentare | `3wadmin_tapes_comment` | `community_review` | 🔴 `typ`-Decode offen |
| **tape-mag-Erlebnis-App** | (Neuaufbau) | neue Next.js-App | 🔴 **Nicht begonnen** |
| tape-mag-Mitglieder-Accounts | `3wadmin_extranet_user` | Medusa-Auth | 🔴 Nicht begonnen |
| **vod-records 547 Artikel** | `maier_db2013` | ERP/`Release.shop_price` | 🔴 **Nicht begonnen** |
| **vod-records Bestellhistorie** | `maier_db2013`/`db1` | `legacy_order` (neu) | 🔴 **Nicht begonnen** |
| **vod-records Adressen** | `maier_db2013` | Kunden-Adressen | 🔴 **Nicht begonnen** |
| SEO-Redirects | tape-mag/vod-records URLs | Nginx/Next.js | 🔴 Nicht begonnen |
| Domain/Email-Cutover | Hetzner | VPS/all-inkl | 🔴 Nicht begonnen |
| Alt-Systeme abschalten | 3wadmin (×2) | — | 🔴 Nicht begonnen |

---

## 4. Kritische Befunde

### Befund A — Das Vorhaben ist zur Hälfte Neubau, nicht nur Umzug
Der *Katalog* liegt schon auf dem Fundament. Aber die **tape-mag-Erlebnisplattform muss als neue App gebaut werden** (3.7), und der **vod-records-Shop muss migriert werden** (3.8). „Platform Migration" ist also: **ein Neuaufbau (tape-mag) + eine echte Geschäfts-Migration (vod-records) + Restarbeiten (Community, CRM)** — nicht ein simpler Datenumzug. Die Energie muss in 3.7 und 3.8.

### Befund B — vod-records.com ist ein lebendes Geschäft, kein Datensatz
€5,27 M Lifetime, Bestellungen bis 2026-04-30. Das ist ein **Cutover eines laufenden, umsatzführenden Betriebs**: Parallelbetrieb-Phase, Bestand-Freeze/Delta-Strategie, Kundenkommunikation, lückenlose Bestellhistorie, 301-Redirects, Email-Kontinuität. Ein Big-Bang ist nicht zulässig.

### Befund C — Recht/Steuer ist der echte Launch-Blocker
Aus `Bereinigte_Fassung_VOD_Records_2026-03-28.md` (Ampel):
- 🔴 **Kommissionsgeschäft** — Modell ungeklärt: echte Verkaufskommission vs. reine Vermittlung. Muss **vor** dem Shop-Cutover-Bau entschieden werden — es bestimmt Datenmodell, Rechnungslogik, Buchung.
- 🔴 **Lexoffice als §25a-Sofortlösung** — nicht bestätigt.
- 🟡 Rechnungs-Pflichtvermerk §25a, USt-Voranmeldung technisch.
- Zusätzlich: **AGB-Anwalt (RSE-78)** offen.
> *„Nicht die Software bestimmt das Steuerkonzept, sondern das Steuerkonzept bestimmt die Softwarekonfiguration."*

### Befund D — Drei Marken-Rollen, nicht eine Leitmarke
Es geht **nicht** um *eine* Commerce-Leitmarke, sondern um drei bewusst getrennte Rollen (Klarstellung Frank, 2026-05-16):
- **`tape-mag.com`** — Erlebnis-/Archiv-Marke. Bleibt.
- **VOD Records (`vod-records.com` / `vinyl-on-demand.com`)** — das **Plattenlabel**. Seit 20+ Jahren eigene Editionen/Pressungen. Diese Domains sind die Label-Identität (First-Party-Katalog der eigenen Veröffentlichungen).
- **VOD Auctions (`vod-auctions.com`)** — die **Marktplatz-Plattform**: Auktion *und* Direktverkauf, perspektivisch auch für **Dritt-Verkäufer**. VOD Records ist darauf der Flagship-/First-Party-Seller.

Technisch sind VOD Records (Label-Storefront) und VOD Auctions (Marktplatz) **eine Plattform** (App A), geschäftlich zwei Dinge: eigenes Label vs. Marktplatz für auch fremde Ware. **Kritische Verbindung:** Dritt-Verkäufe über VOD Auctions *sind* der Kommissions-/Vermittlungsfall aus Befund C — die Rechtsentscheidung bestimmt, wie der Marktplatz überhaupt funktionieren darf. (Strategie: Dok. 2 §3.)

### Befund E — SEO-Equity ist gefährdet
`tape-mag.com` und `vod-records.com` haben Jahre indexierter URLs. Domain-/App-Wechsel ohne vollständige **301-Redirect-Matrix** auf URL-Ebene = Traffic-Verlust. Es existiert keine solche Matrix.

### Befund F — Datenstand-Diskrepanzen
Quellzahlen schwanken zwischen Dokumenten (Releases 30.093 vs. 30.179; Kunden 11.641 vs. CRM-Master 14.450). Ursache: Stichtage + parallel laufende Altsysteme. **Vor jedem finalen Pull frischen Count gegen die Live-DB ziehen**, nicht Dokumentenwerte.

### Befund G — Zwei Alt-Systeme altern weiter
Solange das 3wadmin-CMS (tape-mag + vod-records) parallel zum neuen Fundament lebt, wächst der Delta-Abgleich. Decommissioning ist Teil der Risikoreduktion, nicht ein Aufräumschritt am Ende.

### Befund H — Community-Zuordnung ist eine offene Designfrage
Das Community-System ist heute Teil der Commerce-App. Mit tape-mag als *Erlebnis*-Plattform gehört „Diskutieren, Bewerten, Entdecken" inhaltlich eher dorthin. Wo Community künftig lebt (Erlebnis-App, Commerce-App, oder geteilt über das Fundament) ist zu entscheiden — siehe Dok. 2.

---

## 5. Stärken der Ausgangslage

- Das **Fundament existiert und läuft** — Backend, DB, Auktion, Festpreis-Checkout, Versand, Email, Meilisearch.
- Der **Katalog ist migriert und angereichert** — der größte Datenblock, von beiden Apps nutzbar.
- Das **Community-System ist gebaut** (Increments 1–4).
- Die **FB-Pipeline ist zu ~90 % fertig**.
- **CRM Phase 1** liefert ein dedupliziertes Kunden-Master-Bild inkl. Tier-Klassifikation.
- ERP-Inventur v2, POS, Preis-Modell (`shop_price`) sind vorhanden — die Bausteine für den Shop-Cutover existieren.

**Fazit:** Technisch ist alles konsolidierbar — das Fundament trägt beide Apps. Die echten Engpässe sind (1) die Rechts-/Steuerentscheidungen, (2) der Neuaufbau der tape-mag-Erlebnis-App als eigenes Bauvorhaben, (3) die saubere Cutover-Choreografie für den laufenden vod-records-Shop.
