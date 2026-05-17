# 3 — Technisches Konzept

**Stand:** 2026-05-16 (v2)
**Autor:** Robin Seckler
**Zweck:** Quell-/Zielsysteme, geteilte Katalog-DB, vod-records-Shop-Cutover, Aufbau der tape-mag-Erlebnis-App, SEO-Redirects, Domain/Email-Cutover, Decommissioning.
**Voraussetzung:** [`1_ANALYSE.md`](1_ANALYSE.md), [`2_STRATEGIE_KONZEPT.md`](2_STRATEGIE_KONZEPT.md).

---

## 1. Quellsysteme — Inventar

| System | Ort | Inhalt | Zugriff |
|---|---|---|---|
| MySQL `vodtapes` | Hetzner `213.133.106.99` | tape-mag-Katalog, 3.632 Mitglieder, ~500 Kommentare | read-only `maier1_2_r` |
| MySQL `maier_db2013` | Hetzner (LIVE) | vod-records-Shop: 547 Artikel, 11.641 Kunden, 17.315 Adressen, 8.230 Bestellungen | read-only |
| MySQL `maier_db1` / `maier_db11` | Hetzner | Vor-2013-Historie + Backup-Snapshot | read-only |
| FTP/FTPS | Hetzner | ~80.000 Bilddateien, PHP-Templates | `FTP_TLS`, User `maier1` |
| Facebook-Export | VPS (rsync) | 5.819 Posts, 6.369 Medien, ~4 GB | lokale Dateien |
| IMAP-Postfächer | `mail.your-server.de` | ~422.755 Mails | IMAP-Login |

⚠️ **Hetzner-DBs strikt read-only.** Pulls mit `SET NAMES 'utf8mb4'` (latin1→utf8), sonst Sonderzeichen-Korruption.

## 2. Zielarchitektur — gemeinsames Fundament, zwei Apps

```
Medusa.js Backend (:9000)  ──  Supabase PostgreSQL (Katalog-DB, eu-central-1)
        │                              │
        │      Cloudflare R2 · Meilisearch · Upstash Redis · Auth · Stripe/PayPal
        │                              │
   ┌────▼──────────────┐      ┌────────▼─────────────┐
   │ App A — Commerce   │      │ App B — tape-mag      │
   │ Next.js (existiert)│      │ Next.js (NEU)         │
   │ Auktion+Festpreis  │      │ Erlebnis/Archiv       │
   └────────────────────┘      └───────────────────────┘
```

- **App A (Commerce)** = die heutige VOD_Auctions-Storefront. Bleibt, vod-records zieht ein.
- **App B (tape-mag)** = neue Next.js-App im selben Repo/Monorepo oder als eigenes Storefront-Projekt; **liest dieselbe Supabase-Katalog-DB**, primär read-only (plus Community-Writes).
- Backend-API: bestehende Medusa-`/store`-Routen wiederverwenden; für reine Erlebnis-Bedürfnisse ggf. eigene read-only-Routen (Prefix z.B. `archive`).
- ⚠️ Native Medusa-Route-Pfade nicht überschreiben; eigene Prefixes (`CLAUDE.md`-Gotcha).

---

## 3. Datenmapping & Bauvorhaben

### 3.1 Katalog — ✅ liegt (geteilt)
`Release`/`Artist`/`Label`/`Image` sind migriert. Beide Apps lesen daraus. Der stündliche `legacy_sync_v2.py` aus `vodtapes` läuft, **bis die alte tape-mag-Seite abgeschaltet wird** — dann Cron stoppen, `Release` wird voll kanonisch.

### 3.2 tape-mag-Erlebnis-App — Neuaufbau (kein Datenimport)
Hier ist nichts zu „migrieren" — der Katalog liegt. Das Bauvorhaben ist ein **neues Frontend**:
- App-Gerüst auf bestehendem Stack (Next.js 16, Tailwind, shadcn/ui), eigenes Design (siehe `docs/Community/Community Design Brief.md` als Referenz).
- Discovery-/Stöber-UX, reiche Entity-Seiten, Embeds, Galerien.
- Anbindung an Meilisearch (Discovery-Profil existiert) + Community-Endpoints.
- Verknüpfung zu App A: „Bei VOD verfügbar"-Verweis via `is_purchasable`/`effective_price` (Helper `shop-price.ts`).

### 3.3 CRM-Kontakte — Phase 2/3 abschließen
Plan: `docs/optimizing/CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md`. Offen: ~4.286 Restkunden `maier_db2013`, Login-Events, Vor-2013-Details, 500 Reviews. **Mail-Importer-v2** (Batch-Dedup, Last-Stufen, State-Resume) — der alte Importer lief Supabase tot (116.901/422.755).

### 3.4 Kunden-Accounts — neues Arbeitspaket
CRM-Kontakte ≠ Login-Accounts. Für vod-records-Bestandskunden (Entscheidung #2):
- **Invite-Flow:** Registrierung → Email-Verifikation → Backend matcht verifizierte Email gegen `crm_master_contact` → ordnet Bestellhistorie + Tier zu.
- ⚠️ Medusa Auth-Identity und `customer` liegen in getrennten Schema-Domänen — `pg.transaction` rollt nicht atomar; Workflow/Kompensation nötig (Memory).
- ⚠️ Invite-only-Register: 409 vs. 422 leakt Emails — uniformes 422 + Constant-Time-Pad (`CUSTOM_REGISTER_ENDPOINT_PLAN.md`).

### 3.5 vod-records 547 Artikel — Shop-Cutover (Kern)
Pro Artikel:
1. **Match gegen `Release`** (CatNo / Artikelnummer / Titel) — die meisten der 547 existieren im 41.529er-Katalog. Nicht-Treffer = Neuanlage, manuelle Review-Liste.
2. `Release.shop_price` + `sale_mode` setzen (rc47.2-Preis-Modell).
3. `erp_inventory_item` anlegen (Exemplar-Modell, `copy_number`, `condition_*`, `exemplar_price`, `warehouse_location_id`).
4. **§25a-Kennzeichnung** pro Artikel/Exemplar (§3.8).

### 3.6 Bestellhistorie — Anzeige-Archiv (empfohlen)
8.230 + 3.062 Bestellungen. **Nicht** als echte `transaction`-Rows importieren (verfälscht Reporting, FK-Chaos). Stattdessen neue read-only Tabellen `legacy_order` + `legacy_order_item` (snake_case, eigenes Prefix), pro Kundenkonto unter „Frühere Bestellungen" anzeigbar; Verknüpfung beim Account-Match (§3.4) via Email.
- ⚠️ `maier_db1`: Adressen inline, Unix-Timestamps → Konvertierung. `bestellungen.bid` `varchar(40)` FK auf `int id` → String-Cast.

### 3.7 Adressen, Kommentare, FB-Posts
- **17.315 Adressen** → an `crm_master_contact` / Kundenkonto (typ=1 Rechnung / typ=2 Versand), nicht als Medusa-Default aufzwingen bis Account aktiv.
- **~500 tape-mag-Kommentare** → `community_review`. **Blocker `typ`-Decode** — vorab `SELECT DISTINCT typ, COUNT(*)`.
- **FB-Posts** → `community_post` via P6-Pipeline (5.461 effektive Posts).

### 3.8 §25a / Steuer-Datenmodell — wartet auf Entscheidung
Nach Festlegung Kommissionsmodell (#4):
- Pro Artikel/Exemplar Flag `tax_scheme` (`§25a_differenz` | `regel_19` | `kommission`).
- §25a: kein gesonderter USt-Ausweis, Pflichtvermerk *„Gebrauchtgegenstände / Sonderregelung (§ 25a UStG). Ein gesonderter Umsatzsteuerausweis ist nicht zulässig."*
- Margennachweis Eigenware vs. Abrechnungsnachweis Kommissionsware getrennt.
- ⚠️ **Implementierung erst nach StB-Freigabe** (Befund C) — bis dahin nur Schema-Platzhalter.

### 3.9 Dritt-Verkäufer-Marktplatz — Ziel-Ausbau (nach der Migration)
VOD Auctions soll perspektivisch fremde Verkäufer aufnehmen (Linear RSE-291). Das ist **nicht** Teil des unmittelbaren Migrations-Scopes — aber Datenmodell und Rechtslogik müssen es vorbereiten, sonst kostet es später ein teures Re-Modeling:
- **Seller-Identität** pro Artikel/Exemplar — heute implizit „VOD Records" (First-Party). Schema so anlegen, dass ein `seller_id` später *additiv* ergänzbar ist (Default = VOD Records).
- **`tax_scheme`** (§3.8) muss `kommission` als Wert vorsehen — Dritt-Verkäufe sind je nach Modell (#4) echte Verkaufskommission oder reine Vermittlung mit jeweils anderer Rechnungs-/Haftungslogik.
- **Eigene Ausbaustufe:** Seller-Onboarding, Seller-Dashboard. **Keine** Provisions-/Auszahlungslogik im klassischen Sinn — VOD Auctions monetarisiert über Membership (§3.10), nicht über Verkaufsprovision.

### 3.10 Membership-System — neue Plattform-Komponente
VOD Auctions wird Membership-gegated (Dok. 2 §6) — Monetarisierung über Mitgliedschaft statt Provision. Technisch:
- **Subscription-Billing** über Stripe (Stripe Billing/Subscriptions) — die Stripe-Integration existiert bereits für Einmalzahlungen; Subscriptions kommen additiv dazu.
- **Membership-Schema** (`membership`, `membership_tier` mit Bezug auf `customer`): Tier (Basis/Seller), Status, Laufzeit, Verlängerung.
- **Seller-Kontingent** — Zähler „erlaubte aktive Listings" pro Seller-Membership + Upgrade-Pfad; Bezug zum `seller_id` aus §3.9.
- **Access-Gating** — Middleware/Layout-Gate analog zum bestehenden `platform_mode`-Gate: ohne aktive Membership keine **VOD-Auctions-Marktplatz-Transaktionen** (bieten, bei Dritt-Verkäufern kaufen, verkaufen). **Nicht gegated:** der VOD-Records-Label-Store (offener Kauf der eigenen Editionen, normaler Checkout) und die tape-mag-Erlebnis-App (freie Discovery-/SEO-Ebene). Das Gate ist also funktions-/bereichsbezogen, nicht plattformweit.
- **USt:** Membership-Erlöse sind reguläre 19-%-Dienstleistung — getrennt von §25a (`tax_scheme`) zu verbuchen.
- ⚠️ Stripe-Webhooks für Subscription-Events (`customer.subscription.*`, `invoice.*`) ergänzen; `rawBodyMiddleware` nicht anfassen (CLAUDE.md-Gotcha).

---

## 4. SEO-Redirect-Strategie

Zwei Redirect-Welten:
- **tape-mag.com (alt) → tape-mag.com (neue App).** Domain bleibt, App wechselt — Redirects auf URL-Pfad-Ebene innerhalb derselben Domain.
- **vod-records.com / vinyl-on-demand.com / vod-auctions.com → Commerce-Leitdomain.**

Ablauf (je Welt):
1. **URL-Inventar** via Sitemap, GA4, Google Search Console, Server-Logs.
2. **Mapping-Tabelle** Alt-URL → Neu-URL. tape-mag-Handles (`{artist}-{title}-{id}`) algorithmisch auf Release-Slugs mappen (Legacy-ID-Brücke `legacy-{entity}-{id}`).
3. **301-Redirects** in Nginx (Domain-Ebene) + Next.js (`next.config` rewrites / `middleware.ts`).
4. **Catch-all** für nicht mappbare URLs → passende Kategorie statt 404.
5. Neue `sitemap.xml`, GSC „Adressänderung", alte Sitemaps belassen bis Umzug indexiert.
6. Abschaltung der Alt-Systeme erst **nach** verifiziertem Crawl (keine 404-Spitzen).

## 5. Domain- & Email-Cutover

- **DNS:** Commerce-Leitdomain auf App A, Nebendomains auf 301-Vhost; `tape-mag.com` auf App B.
- **Email:** `frank@vod-records.com` etc. — Postfächer von Hetzner zu all-inkl migrieren **vor** Hetzner-Kündigung. IMAP-Volldump als Backup.
- **SSL:** Let's Encrypt/Certbot für alle Domains + Redirect-Vhosts.
- **Reihenfolge:** Email zuerst (Kontinuität), dann Web-Redirects, dann Abschaltung.

## 6. Parallelbetrieb & Freeze (vod-records)

1. **Parallel-Run:** Commerce-App live neben Alt-Shop; Bestellungen laufen bewusst nur über *eine* Quelle.
2. **Bestand-Freeze:** ab Cutover-Datum keine neuen Artikel im Alt-Shop; Restbestellungen dort abarbeiten.
3. **Delta-Pull:** letzter `maier_db2013`-Pull *nach* dem Freeze.
4. **Cutover-Tag:** DNS umstellen, Redirects scharf, Alt-Shop in Wartung.
- ⚠️ Multi-Pass-Pulls über SSH-Tunnel: `ping`/Reconnect vor jedem Pass, `fetchall()` statt Streaming (Memory).

## 7. Decommissioning-Reihenfolge

1. Volldump aller `vodtapes`/`maier_db*` (`mysqldump`) + FTP-Bilder-Spiegel → Cold-Backup.
2. SEO-Redirects verifiziert → alte tape-mag-PHP-Seite abschalten.
3. vod-records-Cutover verifiziert → vod-records-Shop abschalten.
4. `legacy_sync_v2.py`-Cron stoppen.
5. Hetzner Dedicated kündigen — **erst wenn 1–4 verifiziert**.

## 8. Technische Risiken & Stolpersteine

| Risiko | Mitigation |
|---|---|
| latin1→utf8 Sonderzeichen-Korruption | `SET NAMES 'utf8mb4'`, Stichproben-Diff |
| 547-Artikel-Match unvollständig | Multi-Key-Match, manuelle Review-Liste |
| Account-Migration über 2 Schema-Domänen nicht atomar | Medusa-Workflow / Kompensation |
| Bestell-Import verfälscht Reporting | separate `legacy_order`-Tabellen |
| §25a falsch implementiert | Schema-Platzhalter, Logik erst nach StB-Freigabe |
| SEO-Traffic-Verlust | vollständige 301-Matrix vor Abschaltung, Catch-all |
| Supabase-Last bei Massen-Import | Batch-Inserts, Last-Stufen, `pg_stat_activity` nach jeder Last prüfen |
| Datenverlust bei Abschaltung | Cold-Backup vor jedem Decommissioning-Schritt |
| tape-mag-App reimplementiert Backend doppelt | bestehende `/store`-Routen + Helper wiederverwenden, nur read-only-Ergänzungen |

> **Regel:** Importer/Pull-Skripte nie ohne Synthetic-Test + `--limit 100`-Sample gegen Produktion. Destruktive SQL-Schritte einzeln freigeben lassen.
