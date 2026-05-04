# Legacy MySQL Databases — Reference

**Status:** Discovery 2026-05-03
**Quelle:** SSH + MySQL-Probe auf `dedi99.your-server.de` mit allen R/O-Credentials aus 1Password Work; Cross-Reference mit `scripts/crm_import.py`, `scripts/legacy_sync_v2.py` und Live-HTML-Inspektion der drei Sites.
**Ziel:** Ein verbindlicher Überblick über alle Legacy-MySQL-Datenbanken, deren Schema, Live-Status und Site-Zuordnung — als Grundlage für Section E des [`CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md`](../optimizing/CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md) und für jeden zukünftigen Pull oder Migrations-Schritt.

---

## 1. Hosting-Infrastruktur

**Ein Server, vier Sites, mehrere DBs:**

```
                    Hetzner-Dedi
                  213.133.106.99
            (= dedi99.your-server.de)
                          │
         ┌────────────────┼────────────────┐
         │                │                │
   tape-mag.com    vod-records.com   vinyl-on-demand.com
   record-price-       (Shop)           (Shop, gleicher
   guide.org           ↓                 Code wie vod-records)
   (Mirror, Member-    ↓                 ↓
    CMS)               ↓                 ↓
        │              └────────┬────────┘
        │                       │
        ▼                       ▼
    ┌─────────┐         ┌──────────────────────┐
    │vodtapes │         │ maier_db2013 (LIVE)  │
    │(Member  │         │ + maier_db1 (alt)    │
    │+Catalog)│         │ + maier_db11 (alt)   │
    └─────────┘         └──────────────────────┘
```

**Server-Zugang:**
- SSH: `ssh maier@dedi99.your-server.de -p222` (1Password Work `u74qt347j7myu7sqmgy4vcwzn4`)
- MySQL: `dedi99.your-server.de:3306` (öffentlich erreichbar mit DB-User-Credentials)
- DNS-Bestätigt: vod-records.com, vinyl-on-demand.com, tape-mag.com, record-price-guide.org → alle `213.133.106.99`
- Mailserver: `mail.your-server.de` (= Hetzner Mailbox-Hosting, IP `78.46.5.205`) — **getrennt** vom Webserver (Frank's IMAP-Postfächer, siehe Section F)

**Shared Hosting:** Der `maier`-Master-Account hat Zugriff auf ~80+ Datenbanken vieler Hosting-Kunden. Wir interessieren uns nur für die `maier_*`-, `vodtapes*`-, `vod_db*`- und `maier1_db`-Domänen. Alle anderen sind fremde Projekte (camp_*, koch_*, knm_*, etc. → ignorieren).

**Auth-Quirk:** Die R/O-User sind als `<dbname>_r` benannt (z.B. `maier_r`, `maier_db11_r`, `maier_2013_r`, `maier1_2_r`). Sie haben jeweils nur SELECT-GRANTs auf die zugehörige DB — Cross-DB-Zugriff funktioniert nicht (1044 Access Denied beim Wechseln).

---

## 2. Datenbank-Übersicht

| DB | Bedient Site | Stand (Date-Range) | Customers | Orders | Status |
|---|---|---|---:|---:|---|
| **`vodtapes`** | tape-mag.com + record-price-guide.org | aktiv (Catalog-Sync läuft) | 3.632 Members | n/a (kein Kassen-Shop) | **LIVE** |
| **`maier_db2013`** | vod-records.com + vinyl-on-demand.com | **2013-03-02 bis 2026-04-30** | 8.544 + 17.315 Adressen | 8.230 (13.617 Items) | **LIVE** |
| **`maier_db1`** | älterer Stand der gleichen Webshops? | unbekannt (`datum int Unix-TS`) | 3.114 | 3.062 (4.701 Items) | **Backup oder pre-2013-Iteration** |
| **`maier_db11`** | älterer Stand (Snapshot) | **2005-10-13 bis 2012-01-25** | 2.556 | 2.501 (3.772 Items) | **Snapshot 2012** |
| `vodtapes1`, `vodtapes2`, `vod_db1`, `maier1_db` | unbekannt | nicht zugänglich | nicht zugänglich | **Credentials fehlen** — vermutlich weitere Backups/Forks |

**Schema-Hash-Vergleich `3wadmin_shop_kunden`:**
- `maier_db1` und `maier_db11`: identischer Hash `fc951d…` → gleicher Code-Stack, db11 ist Snapshot von db1 oder eine geschwister-Iteration
- `maier_db2013`: anderer Hash `dffe66…` → **neueres Schema** mit separater Adressen-Tabelle

---

## 3. `vodtapes` — tape-mag.com / record-price-guide.org

### 3.1 Site-Profil
- **Type:** Member-Login-CMS mit Catalog-Browse (kein Kassen-Shop)
- **URLs:** `tape-mag.com`, `record-price-guide.org` (= 100% Mirror, gleicher HTML-Output mit `og:url=https://tape-mag.com/...`)
- **Login-Element:** `<a href="#" id="login">Member-Login</a>` (oben rechts in der Navigation)
- **Live-Sync:** `scripts/legacy_sync_v2.py` (Cron stündlich) zieht **`3wadmin_tapes_*`-Catalog** in unsere Supabase

### 3.2 Connection
| Feld | Wert |
|---|---|
| Server | `dedi99.your-server.de:3306` |
| Database | `vodtapes` |
| R/O User | `maier1_2_r` |
| 1Password Work | `s5e7ebssyfyvtx4n3ehqirjtem` (Title `maier1_2`) — Passwort-Feld `maier1_2_r Passwort` |
| Legacy-Cred-Notiz | `eajngb2kdtjlkaw7ztrf45xupe` (Title „Legacy MySQL tape-mag" — verweist auf gleiche DB, hat aber `database`-Feld irrtümlich auf `vodtapes` gesetzt) |
| FTP-Cred-Backup | `lpqjisznyhropc7q5c6cqgscue` (Title „Legacy FTP tape-mag", User `maier1`) |

### 3.3 Tabellen-Inventar (76 Tabellen)

**Catalog (8 Kerntabellen, Quelle der 41.529 Releases in unserer Supabase):**

| Tabelle | Rows | Zweck |
|---|---:|---|
| `3wadmin_tapes_releases` | **30.179** | Vinyl-/Tape-Releases (id, artist FK, title, cataloguenumber, label FK, country, year, format FK, spezifikation, review, preis, frei) |
| `3wadmin_tapes_band` | **12.455** | Artists/Bands (id, name, text, alias, country, members, gender) |
| `3wadmin_tapes_labels` | **3.081** | Plattenlabels (id, label, text, country, years_running) |
| `3wadmin_tapes_pressorga` | **1.982** | Press/Orgs (id, name, text, country, year, format) |
| `3wadmin_tapes_formate` | 38 | Format-Definitionen (id, name, typ FK, kat FK) |
| `3wadmin_tapes_katalog` | 45.998 | Generische Katalog-Items (id, navid, text) |
| `3wadmin_tapes_kategorien` | 2 | Top-Kategorien |
| `3wadmin_tapes_releases_various` | 42.174 | „Various Artist"-Verknüpfungen |

**Literatur (drei separate Tabellen, Stack matcht unser `product_category`):**

| Tabelle | Rows |
|---|---:|
| `3wadmin_tapes_band_lit` | 3.917 |
| `3wadmin_tapes_labels_lit` | 1.129 |
| `3wadmin_tapes_pressorga_lit` | 6.327 |

**Verknüpfungen + Sonstiges:**
- `3wadmin_tapes_pers_verkn` (368) — Personen-Verknüpfungen
- `3wadmin_tapes_labels_person` (458) — Label-Personen-Bridge
- `3wadmin_tapes_comment` (500) — User-Reviews/Kommentare
- `3wadmin_tapes_select` (3) — kleine Lookup
- `artistsandbands`, `labels`, `pressorga`, `releases`, `maglabelpeople`, `literaturepressorg`, `literaturetoartists`, `literaturetolabels` — denormalisierte Views/Snapshot-Tables

**Member-System (Login):**

| Tabelle | Rows | Schema |
|---|---:|---|
| `3wadmin_extranet_user` | **3.632** | id, name, vorname, **email (UNIQUE)**, pwd, tel, position, exbild, bereich, fachgebiet, buero, kommentar, aktiv |
| `3wadmin_extranet_schutz` | tbd | Bereichs-/Rolle-Schutz |
| `3wadmin_login_log` | tbd | Login-Historie |

**Wichtig:** **Keine** `3wadmin_shop_*`-Tabellen (= keine Kasse). `3wadmin_extranet_user` ist nur Login + Profil, **keine Bestellungen**. Order-History für tape-mag.com-Kunden existiert in dieser DB nicht — die Käufe liefen über die separaten Webshops (vinyl-on-demand.com / vod-records.com → `maier_db2013`).

**CMS-Infrastruktur (~50 weitere Tabellen):**
- `3wadmin_*` Navigation, Footer, Slideshow, History, Mpool (Bilder/Filme), SEO-Footer
- `inhalt_1`, `leiste_*`, `nav_1`, `meta_1`, `bilder_1`, `bilder_besch_1` — CMS-Content-System (3wadmin Multi-Sprache, `_1` = Sprache 1)
- `formular_*` — Formular-Engine (Newsletter, Kontakt)
- `gallerie`, `gallery_text`, `gbook` — Galerie + Gästebuch

### 3.4 Wichtige Schema-Details

**`3wadmin_extranet_user.pwd`** — vermutlich altes Hash-Format (MD5/SHA1). **Niemals migrieren** als Auth-Quelle, nur Email als Bridge.

**`3wadmin_tapes_releases.frei`** — Status-Feld: `1` = verfügbar, `0` = nicht-listed, `>1` = Unix-TS „verkauft am" (Konvention bekannt aus CLAUDE.md: „MySQL `frei`-Feld — `frei=1`→true, `frei=0`→false, `frei>1` (Unix-TS) → false (auf tape-mag verkauft)").

**`3wadmin_tapes_releases.frei_user`** — der User, der den Release auf „nicht-frei" gesetzt hat (default `38` = vermutlich Frank's User-ID).

---

## 4. `maier_db2013` — vod-records.com / vinyl-on-demand.com (LIVE)

### 4.1 Site-Profil
- **Type:** 3wadmin-Webshop (mit Kasse, Warenkorb, Login, Versand-Tracking)
- **URLs:** `vod-records.com`, `vinyl-on-demand.com` (gleicher Shop, zwei Domains, Footer-Link bestätigt)
- **URL-Pattern:** `*-1-N.htm` (z.B. `SHOP-1-6.htm`, `Imprint-1-6.htm`)
- **AJAX-Endpoints:** `shop/ajax_warenkorb.php`, `shop/ajax_loggout.php`
- **Bestätigung Live:** Date-Range Bestellungen `2013-03-02 → 2026-04-30` (vorgestern), 928 Password-Reset-Tokens, 7.728 Login-Log-Einträge
- **`crm_import.py:7`-Kommentar „WooCommerce — CSV import, manual" ist veraltet** — der Shop läuft auf 3wadmin

### 4.2 Connection
| Feld | Wert |
|---|---|
| Server | `dedi99.your-server.de:3306` |
| Database | `maier_db2013` |
| R/O User | `maier_2013_r` |
| 1Password Work | `ml4lcccpje4ocgxxvnjrojbtlm` (Title `maier_db2013`) — Felder: `Passwort` (Master), `R/W Login`/`R/W Passwort`, `R/O Login`/`R/O Passwort` |

### 4.3 Tabellen-Inventar (~140 Tabellen)

**Customer-Stamm (SCHEMA-VARIANTE 2 — neuer):**

| Tabelle | Rows | Zweck |
|---|---:|---|
| `3wadmin_shop_kunden` | **8.544** | Login-Stamm — id, **wid** (eindeutige Kunden-Nr), **email (MUL)**, tel, fax, **pwd**, nick, bild, datum (datetime), kundentyp, preisliste, liquide, sprache |
| `3wadmin_shop_kunden_adresse` | **17.315** | Adressen — id, **kid** (FK auf kunden.id), **typ** (1=Rech, 2=Liefer), anrede, titel, firma, vorname, name, strasse, plz, ort, staat, land FK, datum |
| `3wadmin_shop_kunden_alt` | 3.097 | **Alte Customers (Vor-2013-Schema-Migration)** — gleiches Schema wie `maier_db1.3wadmin_shop_kunden`, also als Snapshot mitgenommen |
| `3wadmin_shop_kunden_bank` | 0 | (leer — Bankdaten-Tabelle nie genutzt) |
| `3wadmin_shop_personen` | 0 | (leer — B2B-Ansprechpartner) |
| `3wadmin_shop_personen_typ` | 0 | (leer) |
| `3wadmin_shop_pwdneu` | **928** | Password-Reset-Tokens (auch unbenutzte) |
| `3wadmin_shop_login_log` | **7.728** | Login-Historie (id, user, datum, ip, typ) |

**Bestellungen:**

| Tabelle | Rows | Zweck |
|---|---:|---|
| `3wadmin_shop_bestellungen` | **8.230** | Header — id, kunde FK, kundentyp, lieferid (FK auf Adresse), **rechadr**/**lieferadr** (Free-Text-Backup), datum (datetime), zahlungsart, zalung_gebuehr (sic), anmerkung, gemahnt, bezahlt, versand, versandkosten, versand_steuer, **gesamtpreis** (decimal 8,2), gutschein, gutschein_wert, status, **paketnr**, rezension |
| `3wadmin_shop_bestellungen_artikel` | **13.617** | Items — id, **bid** (Bestell-ID-Ref), artikel FK, **artnr** (Artikelnummer-Snapshot), anzahl, typ, spezial, besch (text), preis, steuer, rezension, rez_pwd |

**Wichtig:** `bestellungen.rechadr`/`lieferadr` sind **Text-Backups** der Adresse zum Zeitpunkt der Bestellung — auch wenn `kunden_adresse`-FK später geändert wird, bleibt im Bestellungs-Text die Original-Adresse erhalten. Beim Pull beide Quellen erfassen.

**Artikel/Catalog (Webshop, separat von vodtapes-Catalog):**

| Tabelle | Rows | Zweck |
|---|---:|---|
| `3wadmin_shop_artikel` | **547** | Produkte (id, preistyp, art_nr, nav, autor, frei, datum_frei, datum_in, rang, preis, steuer, gewicht, typ, kundentyp) |
| `3wadmin_shop_artikel_kat` | 747 | Artikel→Kategorie-Bridge |
| `3wadmin_shop_artikel_meta_1` | 601 | Sprach-Meta (Sprache 1 = DE?) |
| `3wadmin_shop_artikel_meta_2` | tbd | Sprach-Meta (Sprache 2 = EN) |
| `3wadmin_shop_artikel_pdf` | tbd | PDF-Anhänge |
| `3wadmin_shop_artikel_person` | tbd | Artikel↔Person-Verknüpfung |
| `3wadmin_shop_artikel_preis` | tbd | Preis-Staffelung |
| `3wadmin_shop_artikel_preis_kat` | tbd | Preis-Kategorie |
| `3wadmin_shop_artikel_preis_staffel` | tbd | Mengen-Staffel |
| `3wadmin_shop_artikel_text_1` | tbd | Beschreibungstext (Sprache 1) |
| `3wadmin_shop_artikel_typen` | tbd | Artikel-Typen |
| `3wadmin_shop_artikel_verknuepfung` | tbd | Cross-Sells |
| `3wadmin_shop_kategorie` | 21 | Top-Level-Kategorien |
| `3wadmin_shop_preisliste` | 0 | (leer) |
| `3wadmin_shop_preisliste_artikel` | 0 | (leer) |

**Wichtig:** Nur 547 Artikel. Das ist **deutlich weniger** als unsere 41.529 Releases. Erklärung: Der Webshop hat nur eine kuratierte Auswahl, der vollständige Katalog liegt in `vodtapes`.

**Sonstige:**

| Tabelle | Rows |
|---|---:|
| `3wadmin_shop_warenkorb` | tbd | Active + abandoned Carts |
| `3wadmin_shop_zahlungsart`, `_nachnahme`, `_paypal`, `_text_1`, `_region` | klein | Payment-Methoden |
| `3wadmin_shop_versandkosten`, `_versandtyp` | klein | Shipping-Tarife |
| `3wadmin_shop_laender` | 15 | Länder (alt) |
| `3wadmin_shop_countries` | **250** | Länder (ISO, neueres Schema in db2013) |
| `3wadmin_shop_regionen`, `_regionen_countries` | 16 | Region-Gruppen |
| `3wadmin_shop_mwst` | klein | Steuer-Sätze |
| `3wadmin_shop_setup` | klein | Shop-Konfiguration |
| `3wadmin_shop_typen` | klein | Generic-Typen-Lookup |
| `3wadmin_shop_rezension`, `_rezension_erinnerung` | leer | Reviews + Reminder |
| `3wadmin_shop_nav`, `_nav_2` | klein | Navi-Setup |
| `3wadmin_shop_bilder`, `_bilder_2`, `_bilder_besch_1`, `_bilder_besch_2` | tbd | Produkt-Bilder |
| `3wadmin_shop_sound_1`, `_sound_2` | tbd | Sample-Audios |

**CMS-Komponenten:** Wie vodtapes — Navigation, Footer, Bilder, Formulare, Galerie. Plus einige zusätzliche Tabellen wie `3wadmin_seofootergruppe`, `3wadmin_seofooterlinks`, `3wadmin_quicklink_*`, `3wadmin_nav_slideshow`.

### 4.4 Cross-Reference zu unserer Supabase

**Bestehende `customers`-Rows in unserer Supabase (7.890 unique):**

| Wahrscheinliche Quelle | Zahl | Begründung |
|---|---:|---|
| Phase 2 `crm_import.py` aus `vodtapes.3wadmin_extranet_user` | ~3.632 | Members tape-mag.com |
| Phase 3 manuell aus `maier_db2013.3wadmin_shop_kunden` (vor-Migration der ältesten ~) | ~4.258 | Differenz; Frank/Robin haben damals einen Subset migriert |

**Zusammen mit Telefon-/Messen-/POS-Customers aus den 10.575 MO-Rechnungen + den ~5-7 Jahren Frank-IMAP wird der echte Master-Bestand voraussichtlich bei 12.000-18.000 unique Personen landen** (siehe Section H Master-Resolver im CRM-Plan).

---

## 5. `maier_db1` — vermutlich pre-2013-Webshop (älteres Schema)

### 5.1 Connection
- 1Password Work `bxedowvg33lzphnmrvty56j5zy` (R/O User `maier_r`)

### 5.2 Schema (KOMPAKT, Schema-Variante 1)

`3wadmin_shop_kunden` enthält **alles inline** (keine Adress-Tabelle):

```
id, anrede, firma, vorname, name, strasse, plz, ort, staat, land,
tel, fax, email, pwd, datum (int Unix-TS)
```

`3wadmin_shop_bestellungen` ist sehr schmal:

```
id, kunde, datum (int Unix-TS), zahlungsart, anmerkung, gemahnt,
bezahlt, versand, versandkosten
```

→ **Kein** `gesamtpreis`-Feld, **kein** `paketnr`, **kein** `rechadr`/`lieferadr`-Backup. Order-Total muss aus `bestellungen_artikel` aufsummiert werden.

`3wadmin_shop_bestellungen_artikel` hat: `id, bid (varchar(40)!), artikel FK, anzahl, typ, spezial, besch, preis` — **kein** `artnr`-Snapshot, **kein** `steuer`.

`3wadmin_shop_artikel` ist auch schmaler — kein `preistyp`, kein `kundentyp`, datums als int statt datetime.

### 5.3 Counts
- 3.114 Customers
- 3.062 Bestellungen
- 4.701 Items
- 294 Artikel
- 11.895 Warenkorb-Rows (= viele abgebrochene Carts)

**Date-Range:** Nicht ermittelt (datum int Unix-TS muss konvertiert werden) — nächster Discovery-Step.

### 5.4 Forum-Tabellen (phpBB!)

`maier_db1` hat **40+ phpBB-Tabellen** — das war ein klassisches phpBB2-Forum, eingebettet in den Shop:
- `phpbb_users`, `phpbb_groups`, `phpbb_forums`, `phpbb_topics`, `phpbb_posts`, `phpbb_posts_text`
- `phpbb_privmsgs`, `phpbb_privmsgs_text` — Private Messages zwischen Forum-Usern
- `phpbb_search_*`, `phpbb_themes_*`, `phpbb_smilies`, `phpbb_words`
- `phpbb_vote_*` — Voting-Plugin

→ Bei einem Pull **phpBB-Tabellen NICHT migrieren** (zu alt, separates Datenmodell, kein Marketing-Wert). Falls historisch interessant, separater Forum-Archiv-Workstream.

---

## 6. `maier_db11` — Snapshot 2005-2012

### 6.1 Connection
- 1Password Work `hox5f3mgfezjzeca3b5d45c3yq` (R/O User `maier_db11_r`)

### 6.2 Charakter
- **137 Tabellen** total
- Schema **identisch** zu `maier_db1` (md5-Hash gleich)
- **Date-Range Bestellungen: 2005-10-13 15:42:35 bis 2012-01-25 00:04:22**

### 6.3 Counts
- 2.556 Customers
- 2.501 Bestellungen
- 3.772 Items
- 227 Artikel

### 6.4 Interpretation

`maier_db11` ist mit hoher Wahrscheinlichkeit ein **eingefrorener Snapshot von Anfang 2012** — vermutlich angelegt vor einer geplanten Software-Migration oder einem System-Update. Die Daten überschneiden sich vollständig mit den frühen Jahren von `maier_db2013` (das ja ab 2013 startet) und mit `maier_db1`.

**Empfehlung:** Im CRM-Pull ignorieren oder nur als Cross-Check für `maier_db1`-Konsistenz verwenden. Eigenständigen Wert bringt es nicht.

---

## 7. Schema-Migration zwischen den Webshop-DBs

**Hypothese (basierend auf Date-Ranges + Schema-Differenzen):**

```
maier_db1   (Schema 1, datum=Unix-TS int)
   │       Customers 3.114 · phpBB-Forum embedded
   ▼
   ├── maier_db11  (Snapshot 2012-01-25 — eingefroren)
   │      gleicher Schema-Hash, weniger Customers
   │
   ▼
maier_db2013 (Schema 2, datum=datetime, separate Adressen,
              Login-Log, Password-Reset, Countries-ISO,
              Login-Log-Tabelle, Personen-Modell)
   ▶ AKTIV bis heute (2026-04-30)
   │   Customers 8.544 (inkl. 3.097 als _alt aus dem
   │                     Schema-1-Bestand re-imported)
```

**Bestätigung:** `maier_db2013.3wadmin_shop_kunden_alt` (3.097 Rows) hat **das gleiche Schema** wie `maier_db1.3wadmin_shop_kunden` — also wurden die alten Customers beim Schema-Wechsel als „_alt"-Tabelle übernommen, statt sie ins neue Schema zu konvertieren.

**Konsequenz für Pull:**
- **Primärquelle:** `maier_db2013` (LIVE-Bestand, inkl. _alt-Tabelle für Pre-2013-Customers)
- **Sekundärquelle:** `maier_db1` (falls _alt unvollständig oder falls Order-History pre-2013 detailliert benötigt wird)
- **Tertiärquelle:** `maier_db11` (nur als Cross-Check für db1)

---

## 8. Andere DBs auf dedi99 (NICHT zugänglich)

| DB | In `SHOW DATABASES`? | Status |
|---|---|---|
| `vodtapes1` | ja | **Access denied** für `maier1_2_r` und `maier`-Master — Credentials fehlen |
| `vodtapes2` | ja | **Access denied** — Credentials fehlen |
| `vod_db1` | ja | **Access denied** — Credentials fehlen |
| `maier1_db` | ja | **Access denied** — Credentials fehlen |
| `maier1_2` | nein | DB existiert nicht (1Password-Item-Title irreführend, Database-Feld fälschlich gesetzt → der DB-Name auf dem Server ist `vodtapes`, nicht `maier1_2`) |

**Hypothese:** `vodtapes1`/`vodtapes2`/`vod_db1` sind alte Snapshots von vodtapes oder Test-Instanzen aus früheren Migrationen. `maier1_db` könnte eine vierte Webshop-Iteration sein (vor `maier_db1`).

**Backup-Verzeichnisse im SSH-Home (`/usr/home/maier/`):** 8 Backup-Ordner aus 2018:
- `bak_powermaier.com`, `bak_vinyloverdose.com`, `bak_vinyloverdose.de`, `bak_vod.3wadmin.de`, `bak_vod-records.com`, `bak_vod-records.de`, `bak_vodrecords.de`, `bak_powermaier.com`

→ Robin/Frank haben mehrere historische Marken/Subdomains betrieben. Die Backup-Ordner enthalten vermutlich SQL-Dumps + Webroot-Snapshots aus 2018.

**Empfehlung:** Vor der Migration einmal in die Backup-Ordner schauen (1-2 Stunden), um zu verstehen ob historische Customer-Daten aus den anderen Marken (powermaier, vinyloverdose, etc.) noch relevant sind oder bereits in `maier_db2013` konsolidiert wurden.

---

## 9. Cross-DB-Beziehungen

### 9.1 Innerhalb von `maier_db2013` (Webshop)

```
3wadmin_shop_kunden.id
       │
       ├──< 3wadmin_shop_kunden_adresse.kid     (typ=1 billing, typ=2 shipping)
       ├──< 3wadmin_shop_bestellungen.kunde
       ├──< 3wadmin_shop_warenkorb.user
       ├──< 3wadmin_shop_login_log.user
       └──< 3wadmin_shop_pwdneu.user

3wadmin_shop_bestellungen.id
       └──< 3wadmin_shop_bestellungen_artikel.bid   (string-FK!)

3wadmin_shop_bestellungen.lieferid
       └──< 3wadmin_shop_kunden_adresse.id

3wadmin_shop_artikel.id
       ├──< 3wadmin_shop_artikel_kat.aid
       ├──< 3wadmin_shop_artikel_meta_*.aid
       ├──< 3wadmin_shop_artikel_text_*.aid
       └──< 3wadmin_shop_bestellungen_artikel.artikel
```

### 9.2 Cross-Site (vodtapes ↔ maier_db2013)

**Keine harte FK** zwischen den Sites. Die einzige Bridge ist `email` — wenn ein Kunde über tape-mag.com Member ist UND parallel auf vinyl-on-demand.com bestellt hat, ist die `email`-Adresse beide Mal gleich (manuell, ohne automatische Cross-Source-Kopplung).

**Implikation für Master-Resolver (Section H im CRM-Plan):**
- Email = Primary-Match (Case-insensitive, getrimmt)
- Falls Email differiert (z.B. tape-mag mit Privat-Email, vod-records mit Geschäfts-Email) → Adress-Hash + Name-Match als Fallback

### 9.3 Beziehung zur Supabase-DB (vod-auctions)

**Aktuelle Spiegelung in unserer Supabase:**
- `Release` (52.847 rows) ← `vodtapes.3wadmin_tapes_releases` + `_band_lit` + `_labels_lit` + `_pressorga_lit` (via `legacy_sync_v2.py`)
- `Artist` (12.451) ← `vodtapes.3wadmin_tapes_band`
- `Label` (3.077) ← `vodtapes.3wadmin_tapes_labels`
- `PressOrga` (1.982) ← `vodtapes.3wadmin_tapes_pressorga`
- `Format` (39) ← `vodtapes.3wadmin_tapes_formate`
- `customers` (7.890 unique) ← Mix aus `vodtapes.3wadmin_extranet_user` (3.632) + `maier_db2013.3wadmin_shop_kunden` (Subset, ~4.258)
- `orders` (7.881) ← `maier_db2013.3wadmin_shop_bestellungen` (Subset)
- `customer_addresses` (9.393) ← `maier_db2013.3wadmin_shop_kunden_adresse` (Subset)

**Lücken (noch nicht migriert):**
- `vodtapes.3wadmin_tapes_pers_verkn` (368 Verknüpfungen)
- `vodtapes.3wadmin_tapes_comment` (500 User-Reviews)
- `maier_db2013.3wadmin_shop_kunden` rest (vermutlich ~4.286 noch nicht migriert)
- `maier_db2013.3wadmin_shop_login_log` (7.728 Login-Events — Activity-Recency-Quelle für Tier-Calc)
- `maier_db2013.3wadmin_shop_warenkorb` (Customer-Interest-Signal — was hatten sie im Cart aber nie gekauft?)
- `maier_db2013.3wadmin_shop_artikel` (547 Webshop-Artikel — überlappt mit unseren 41.529 Releases? Mapping nötig)
- `maier_db1.*` (3.114 Customers, 3.062 Orders, 4.701 Items — pre-2013-History)

---

## 10. Pull-Strategie für CRM-Konsolidierung

### 10.1 Reihenfolge (siehe auch Section E im CRM-Plan)

1. **`maier_db2013` zuerst** (LIVE-Hauptquelle)
   - `3wadmin_shop_kunden` + `_kunden_adresse` + `_kunden_alt`
   - `3wadmin_shop_bestellungen` + `_bestellungen_artikel`
   - `3wadmin_shop_login_log` (für Activity-Recency)
   - `3wadmin_shop_warenkorb` (für Interest-Signal)

2. **`maier_db1`** (Pre-2013-Ergänzung)
   - `3wadmin_shop_kunden` (3.114) — falls `_kunden_alt` unvollständig
   - `3wadmin_shop_bestellungen` + `_bestellungen_artikel` (Pre-2013-Order-History)
   - **NICHT phpBB-Tabellen**

3. **`vodtapes`**
   - `3wadmin_extranet_user` (3.632 Members) — Email + Name + Tel + aktiv-Flag
   - `3wadmin_tapes_comment` (500 Reviews) — User-Engagement-Signal
   - `3wadmin_login_log` (sofern existent)

4. **`maier_db11`** — **skip** (nur Cross-Check, kein eigenständiger Wert)

5. **`vodtapes1`/`vodtapes2`/`vod_db1`/`maier1_db`** — pending Credentials. Vor Pull klären welche Daten dort liegen.

### 10.2 Encoding/Charset

PHP4/MySQL4-Ära mit Latin1/cp1252 möglich. Vor Bulk-Pull stichproben:

```sql
-- Sample auf jeden Source-DB
SELECT email, name, vorname, ort
FROM 3wadmin_shop_kunden_adresse
WHERE name LIKE '%ü%' OR name LIKE '%ä%' OR name LIKE '%ö%'
LIMIT 20;
```

Wenn Output Mojibake (z.B. `MÃ¼ller`) zeigt → `ftfy.fix_text()`-Pass im Pull.

### 10.3 Sicherheits-Constraints

- **`pwd`-Spalten nie ziehen.** Hash-Algorithmen sind alt (vermutlich MD5), kein Marketing-Wert, hohes DSGVO-Risiko.
- **`_kunden_bank` (0 Rows in db2013).** Auch wenn nicht leer — niemals migrieren. PCI/DSGVO-Risiko.
- **`phpbb_*`-Tabellen.** Forum-Inhalte enthalten potenziell vertrauliche Privatnachrichten (`phpbb_privmsgs_text`). Niemals migrieren.
- **R/O-Accounts only.** Pull-Skripte verwenden ausschließlich `maier_r`, `maier_db11_r`, `maier_2013_r`, `maier1_2_r`.

### 10.4 Performance

- DBs sind klein (zusammen ~600 MB). Full-Pull pro DB <5 Min.
- Pull-Skript `scripts/legacy_db_pull.py` (nach Section E im CRM-Plan).
- Direkter MySQL-Connect über Port 3306 funktioniert, kein SSH-Tunnel nötig.

---

## 11. Bekannte Quirks + Gotchas

| Quirk | Auswirkung |
|---|---|
| `maier1_2` als DB-Name in 1Password Item ist falsch — die echte DB heißt `vodtapes` | Skript darf nicht den `Datenbank`-Feld-Wert nutzen, sondern den User-Namen `maier1_2_r` für DB `vodtapes` hardcoden ODER besser: Database-Name als ENV-Var setzen |
| `crm_import.py:7`-Kommentar „WooCommerce" für vod-records.com ist **veraltet** | Niemand sollte aus diesem Kommentar einen WooCommerce-API-Pull-Plan ableiten — der Shop ist 3wadmin |
| `bestellungen.bid` ist `varchar(40)` (FK auf `bestellungen.id` int) | Beim JOIN String-Cast nötig: `WHERE bestellungen.id = CAST(items.bid AS UNSIGNED)` oder ähnlich. Oder: alle items mit `LEFT JOIN bestellungen ON items.bid = bestellungen.id` mit MySQL implicit cast — funktioniert, aber Performance prüfen |
| `rechadr`/`lieferadr` Free-Text in Bestellungen | Adress-Snapshot zum Bestell-Zeitpunkt; **nicht parsen**, nur als raw_address speichern. Strukturierte Adresse via `lieferid`-FK auf `kunden_adresse`-Tabelle |
| `datum` Spalten teilweise int (Unix-TS), teilweise datetime | Per-DB unterschiedlich (db1/db11 = int, db2013 = datetime). Pull-Skript muss konvertieren: `FROM_UNIXTIME(datum)` für db1/db11 |
| `kunden_alt`-Schema in db2013 ≠ `kunden`-Schema in db2013 | _alt entspricht dem db1-Schema. Beim Pull als zwei separate Mappings behandeln |
| MariaDB Reserved Words wie `rows` brauchen Backticks | Bei AS-Aliasing aufpassen |
| `maier1_2_r` hat nur SELECT-GRANTs auf `vodtapes`, nicht auf `vodtapes1`/`vodtapes2` | Cross-DB-Discovery braucht eigene Credentials |

---

## 12. Quick-Connect-Cheatsheet

```bash
# 1Password-Service-Account-Token muss aktiv sein
# (siehe ~/.zshrc OP_SERVICE_ACCOUNT_TOKEN)

# vodtapes (tape-mag.com Catalog + Members)
mysql -h dedi99.your-server.de -P 3306 -u maier1_2_r \
  -p"$(op item get s5e7ebssyfyvtx4n3ehqirjtem --vault Work \
        --fields label='maier1_2_r Passwort' --reveal)" \
  vodtapes

# maier_db2013 (vod-records.com / vinyl-on-demand.com LIVE)
mysql -h dedi99.your-server.de -P 3306 -u maier_2013_r \
  -p"$(op item get ml4lcccpje4ocgxxvnjrojbtlm --vault Work \
        --fields label='R/O Passwort' --reveal)" \
  maier_db2013

# maier_db1 (Pre-2013-Webshop)
mysql -h dedi99.your-server.de -P 3306 -u maier_r \
  -p"$(op item get bxedowvg33lzphnmrvty56j5zy --vault Work \
        --fields label='R/O Passwort' --reveal)" \
  maier_db1

# maier_db11 (Snapshot 2012)
mysql -h dedi99.your-server.de -P 3306 -u maier_db11_r \
  -p"$(op item get hox5f3mgfezjzeca3b5d45c3yq --vault Work \
        --fields label='R/O Passwort' --reveal)" \
  maier_db11

# SSH (für mysqldump, file inspection, log access)
sshpass -p "$(op item get u74qt347j7myu7sqmgy4vcwzn4 --vault Work \
              --fields label=Passwort --reveal)" \
  ssh maier@dedi99.your-server.de -p 222
```

**Niemals R/W-Accounts verwenden** außer für den (zukünftigen) Bidirectional-Sync — und dann nur mit explizitem Code-Review.

---

## 13. Offene Klärungspunkte

1. **Welche Beziehung haben `maier_db1` und `maier_db11` zueinander?** Hypothese: db11 = Snapshot 2012, db1 = aktuelle/letzte Pre-2013-Iteration. Bestätigung via Schema-/Daten-Diff oder Frank-Frage.
2. **Was sind `vodtapes1`, `vodtapes2`, `vod_db1`, `maier1_db`?** Credentials fehlen; Klärung via Hetzner Plesk/Konsole oder Frank-Frage.
3. **Sind die Backup-Verzeichnisse in `~/bak_*` (8 Stück, 2018) noch CRM-relevant?** Sichten dauert ~1-2h, lohnt nur falls Robin verdächtigt dass ältere Customer-Bestände dort schlummern.
4. **`crm_import.py` Phase 3 (vod-records WooCommerce, CSV)** — wo liegen die CSVs? Wurde das Skript je gegen vod-records gefahren? Oder ist Phase 3 nur theoretisch dokumentiert und nie ausgeführt?
5. **Webshop-Artikel-Mapping:** Die 547 Artikel in `maier_db2013.3wadmin_shop_artikel` — überlappen mit unseren 41.529 Releases? Fehlt ein FK oder ist die Beziehung nur über `art_nr`-String?
6. **Welche Sprachen sind aktiv?** `_meta_1`/`_meta_2` und `_text_1`/`_text_2` deuten auf 2 Sprachen — DE + EN. Bestätigen.
7. **`3wadmin_shop_setup` und `3wadmin_setup` lesen** — vielleicht stehen dort Hinweise zu Versions-History oder Site-Konfiguration.

---

**Pflege:** Dieses Dokument wird aktualisiert, sobald (a) zusätzliche Credentials für die nicht-zugänglichen DBs auftauchen, (b) der Pull live geht und tatsächliche Cross-Source-Dedup-Counts bekannt sind, (c) die offenen Punkte aus Section 13 geklärt werden.
