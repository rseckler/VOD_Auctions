# VOD Auctions — Changelog

Vollständiger Entwicklungs-Changelog. Aktuelle Änderungen stehen in CLAUDE.md.

---

### 2026-04-02 — Bugfixes Fehler 8–13: Format Badge, CRM Staleness, Bid Email, Countdown, Translate

#### Format Badge Fix (Fehler 10) — Lot Detail Page

- **Root Cause:** `Release.format` ist ein Legacy-Rohstring ("LP") statt der echten Format-Bezeichnung aus der `Format`-Tabelle.
- **Backend** `store/auction-blocks/[slug]/items/[itemId]/route.ts`: `Format.name as format_name` via LEFT JOIN zu `Format`-Tabelle ergänzt.
- **Storefront** `auctions/[slug]/[itemId]/page.tsx`: Hilfsfunktionen `formatLabel()` + `formatColorKey()` — nutzen `format_name` wenn vorhanden, Fallback auf `format`. "Vinyl-7"" statt "LP" korrekt angezeigt.

#### CRM Drawer KPI Staleness Fix (Fehler 9)

- **Root Cause:** CRM-Listenview zeigte 0 Bids für aktive Bidder weil `customer_stats` nur stündlich per Cron aktualisiert wird.
- **`admin/routes/crm/page.tsx`**: KPI-Karten (Purchases/Bids/Wins) nutzen jetzt live `data`-Counts wenn Drawer offen ist, statt gecachte `customer_stats`-Werte.
- **Auto-Recalc on Mount**: Seite ruft beim Laden automatisch `POST /admin/customers/recalc-stats` im Hintergrund auf und refreshed die Liste bei Erfolg — kein manueller Klick nötig.

#### Bid Confirmation Email (Fehler 11 Teil 1)

- **`backend/src/emails/bid-placed.ts`** (NEU): Grüne "You are the highest bidder" Bestätigungs-E-Mail. Subject: `Bid confirmed — Lot #XX: €X.XX`. Cover-Bild, Lot-Details, Lot-Link.
- **`backend/src/lib/email-helpers.ts`**: `sendBidPlacedEmail()` ergänzt.
- **`backend/src/api/store/auction-blocks/[slug]/items/[itemId]/bids/route.ts`**: Ruft `sendBidPlacedEmail()` nach erfolgreichem Winning-Bid auf.
- **Admin Email Preview** (`/app/emails`): `bid-placed` zu TEMPLATES-Array + POST-Switch + `renderTemplate`-Switch in `[id]/route.ts` ergänzt. Cover-Bild (`DEMO_COVER`) für alle Item-bezogenen E-Mail-Templates hinzugefügt.

#### Lot Page Winning Indicator (Fehler 11 Teil 2) — `ItemBidSection.tsx`

- **Root Cause:** Öffentliche Bids-API anonymisiert `user_id` — eigener Bid nicht identifizierbar.
- **Fix:** `GET /store/account/bids` (auth) auf Mount — gleiche Logik wie `BlockItemsGrid`. `userIsWinning: boolean | null` State. `onBidResult` Callback in `BidForm` ruft `setUserIsWinning(won)` auf.
- Realtime: wenn fremdes Winning-Bid eintrifft → `setUserIsWinning(false)` (Outbid-Anzeige).
- Banner: "You are the highest bidder" (grün) oder "You have been outbid" (orange) unterhalb der Bid-Form.

#### Saved Items Bid Status (Fehler 12)

- **`storefront/src/app/account/saved/page.tsx`**: `fetchBidStatus()` ruft `GET /store/account/bids` auf, baut Map `block_item_id → { is_winning, amount }`. Badge unter Titel: "Highest bid · €X.XX" (grün) oder "Outbid · €X.XX" (orange).

#### Countdown Seconds Fix (Fehler 13)

- Sekunden werden jetzt erst angezeigt wenn < 60 Minuten verbleiben. Vorher immer sichtbar.
- **4 Dateien** angepasst: `ItemBidSection.tsx`, `auctions/[slug]/page.tsx`, `BlockItemsGrid.tsx`, `PreviewCountdown.tsx`.

#### Address Update

- Adresse "Alpenstrasse 25/1" → "Eugenstrasse 57/2" in allen 5 rechtlichen Seiten: Impressum, Datenschutz, AGB, Widerruf, Gallery.

#### Disable Browser Auto-Translate

- `translate="no"` auf `<html>` + `<meta name="google" content="notranslate">` im Root Layout.
- Verhindert Chrome/Android-Übersetzung von Bandnamen und Eigennamen (z.B. "Pulsating Grain" → "Pochender Körner").

---

### 2026-04-01 — Bugfixes Fehler 1–7: Live Bidding, Tracklist, Saved Items, CRM Stats

#### Live Bidding Fixes (Fehler 1–6) — `storefront/src/components/ItemBidSection.tsx`

- **Fehler 1 — `isActive` nie true:** DB speichert `"open"` für aktive Lots, Code prüfte `=== "active"`. Fix: reaktiver State `liveItemStatus` + Guard `liveItemStatus === "active" || liveItemStatus === "open"`. Auch `liveBlockStatus` als reaktiver State.
- **Fehler 2 — Stale ISR-Props:** Next.js ISR-gecachte Props (revalidate: 30s) können veraltet sein. Mount-fetch gegen `/store/auction-blocks/:slug/items/:itemId` aktualisiert `currentPrice`, `bidCount`, `lotEndTime`, `liveBlockStatus`, `liveItemStatus` mit Live-Daten.
- **Fehler 3 — HTML-Tags in Description sichtbar:** `release.description` enthält rohes Discogs-HTML. Inline-Strip in `auctions/[slug]/[itemId]/page.tsx`: `<br>` → `\n`, alle Tags entfernt, HTML-Entities dekodiert, Whitespace normalisiert. Guard: Description-Sektion nur sichtbar wenn kein Tracklist + keine Credits (Discogs-Daten kommen aus demselben Feld).
- **Fehler 4 — Bid silent bei "Already Highest Bidder":** `toast.error(msg, { duration: 8000 })` + Hint-Description "Use 'Set maximum bid'..." wenn already-winning-Pattern in Fehlermeldung erkannt.
- **Fehler 5 — Toast-Duration zu kurz:** Alle Success/Warning-Toasts auf `duration: 6000`, Errors auf `duration: 8000`.
- **Fehler 6 — Saved Items → falscher Link:** `/account/saved` verlinkte immer auf `/catalog/:release_id` auch wenn das Item in einer aktiven Auktion war. Fix: `GET /store/account/saved` joinent `block_item` (status: open/active) + `auction_block` (status: active/preview/scheduled). `SavedItem`-Typ um `block_item_id` + `block_slug` erweitert. Link-Logik: `/auctions/:slug/:itemId` wenn Lot vorhanden, sonst `/catalog/:id` als Fallback.

#### Tracklist Parser Fixes — `storefront/src/lib/utils.ts`

- **`POSITION_RE` erweitert:** `/^[A-Z]?\d{1,2}\.?$/` → `/^([A-Z]{1,2}\d{0,2}|\d{1,2})\.?$/`. Neu: single-letter Vinyl-Seiten (A/B), Doppelbuchstaben (AA/BB), Seitenvarianten (A1/B2), rein numerische Positionen (1/12) — alle korrekt erkannt.
- **Minimum-Threshold 3→2:** `extractTracklistFromText` gab bei < 3 Tracks `remainingCredits: raw` zurück. Gesenkt auf < 2 — 7"-Singles mit exakt 2 Tracks werden jetzt als Tracklist erkannt.
- **`alreadyStructured`-Bail-out entfernt:** `parseUnstructuredTracklist` bail-outed wenn irgendein JSONB-Eintrag `position + title` hatte (z.B. `{position:"I", title:"Confess"}` von Discogs-Seiten-Bezeichnung). Das verhinderte das Parsing komplett. Prüfung entfernt.
- **Testfall:** 7"-Single "I Confess / Softness" zeigte "SIDE I / Confess" als flache Liste. Zeigt jetzt: `A / I Confess / 3:11`, `B / Softness / 2:08`.

#### Collapsible Block Description — `storefront/src/components/CollapsibleDescription.tsx` (NEU)

- `long_description` auf Auction-Block-Seite war immer vollständig ausgeklappt → Nutzer musste weit scrollen bis zu den Lots.
- Neuer Client-Component `CollapsibleDescription`: zeigt max. 3 Zeilen (`-webkit-line-clamp: 3`), "Show more / Show less" Chevron-Toggle. Automatische Erkennung ob Collapse nötig (> 300 Zeichen oder mehrere Absätze).
- Ersetzt inline-`prose`-Block in `storefront/src/app/auctions/[slug]/page.tsx`.

#### CRM Bids-Counter Fix (Fehler 7) — `customer_stats` + Admin CRM

- **Root Cause:** `customer_stats`-Tabelle wird nur stündlich via Cron (`customer-stats-recalc.ts`) aktualisiert. Kunden mit frisch platzierten Bids zeigten 0 in der CRM-Liste bis zum nächsten Cron-Lauf.
- **`POST /admin/customers/recalc-stats`** (NEU, `backend/src/api/admin/customers/recalc-stats/route.ts`) — Führt sofortigen Full-UPSERT aller Customer-Stats aus live `bid`- + `transaction`-Tabellen aus. Identische Logik wie der Cron-Job.
- **"↻ Recalc Stats" Button** in `admin/routes/crm/page.tsx` — Neben "Export CSV". Zeigt "Recalculating…" während Fetch, refreshed die Tabelle automatisch bei Erfolg.

### 2026-03-31 — E2E Test Suite Stabilisierung + Storefront OOM-Fix

#### Playwright Test Suite: 66 passed, 3 skipped, 0 failed
- **`tests/helpers/auction-setup.ts`** (NEU) — Wiederverwendbarer Helper für E2E-Tests: erstellt einen vollständig aktiven Auktionsblock via Admin-API (draft → scheduled → active, Items aktivieren) und räumt ihn danach via Lifecycle-Job auf. Fallback auf Hardcoded Release-IDs wenn Catalog-API nicht antwortet.
- **`tests/05-auction-browse.spec.ts`** — `beforeAll`/`afterAll` mit eigenem Testblock. ISR-Cache-Problem behoben: Tests navigieren direkt zu `testBlock.slug` statt aktive Blöcke auf `/auctions` zu suchen.
- **`tests/06-bidding.spec.ts`** — React-Hydration-Race behoben via `waitForTimeout(2s)` nach `networkidle`. Bid-Section ist Client-Component, hydratisiert asynchron → `isVisible()` lieferte false obwohl Elemente sichtbar waren.

#### Storefront OOM Restart-Loop behoben (5.687 → 0 Restarts)
- **Root Cause:** PM2 `max_memory_restart: 300MB` — Next.js mit ISR + 41k-Katalog + Sentry-SDK überschreitet diese Grenze regelmäßig. PM2 killt den Prozess, startet sofort neu → Dauerschleife.
- **`ecosystem.config.js`** (NEU) — Zentrale PM2-Konfiguration für Backend + Storefront: `max_memory_restart: 600MB`, `node_args: --max-old-space-size=512`.
- **`storefront/next.config.ts`** — `outputFileTracingRoot: path.join(__dirname, "../")` hinzugefügt. Behebt Next.js workspace-root Warning, das bei jedem Restart in `error.log` geschrieben wurde.

### 2026-03-29 — CRM User Management + Rudderstack Integration

#### CRM: Vollständiges User-Management-Backend

**DB Migration (`Migration20260401000000.ts`)**
- Neue Tabelle `customer_note` (id, customer_id, body, author_email, created_at, deleted_at)
- Neue Tabelle `customer_audit_log` (id, customer_id, action, details JSONB, admin_email, created_at)
- `customer_stats` erweitert: brevo_contact_id, brevo_synced_at, blocked_at, blocked_reason

**Neue Backend-Endpunkte (`/admin/customers/[id]/`)**
- `PATCH [id]` — Stammdaten bearbeiten (name, email, phone, tags, is_vip, is_dormant). E-Mail-Uniqueness-Check + auth_identity-Update (best-effort).
- `notes/` — GET/POST (erstellen) + `notes/[noteId]/` DELETE (soft-delete). Autor aus auth_context.
- `timeline/` — Unified Event-Feed aus bid, transaction, customer_note, customer. LEFT JOIN Release für Titel. Sortiert DESC, max 100.
- `block/` + `unblock/` — Account sperren/entsperren via `customer.deleted_at`.
- `brevo-sync/` — Manueller Brevo-Push via crmSyncRegistration.
- `password-reset/` — Placeholder (safe, kein Crash).
- `anonymize/` — DSGVO-Anonymisierung: PII ersetzen + customer_address anonymisieren + customer_audit_log Eintrag.
- `gdpr-export/` — Admin-seitiger GDPR-Datenexport (Content-Disposition JSON-Download).
- `addresses/` — GET (saved addresses aus customer_address) + POST (neue Adresse anlegen).
- `delete/` — Hard-Delete: user_id in transactions auf NULL, cascade delete customer_stats/notes/addresses/customer. Brevo-Löschung (best-effort).
- `export/` — CSV-Export aller Kunden mit Stats, BOM für Excel, 13 Spalten.

**Neue Endpunkte (`/admin/customer-addresses/`)**
- `[addressId]/` — PATCH (Adresse bearbeiten) + DELETE (soft-delete).

**CRM Admin-UI (`admin/routes/crm/page.tsx`) — vollständig erweitert**
- **Overview-Tab:** Inline Edit-Form (Name/E-Mail/Telefon), Tags-CRUD (Chips + Dropdown + Custom Input), VIP/Dormant-Toggles, Password-Reset-Button, Brevo-Sync-Status + "Sync Now" Button, Saved-Addresses-Section (Edit/Delete/Add Inline-Forms), Danger Zone (Anonymize + Admin GDPR Export + Delete Contact).
- **Notes-Tab** (neu, 4. Tab): Notizen-Liste mit Author + Datum, Textarea + "Add Note", Delete mit Confirm.
- **Timeline-Tab** (neu, 5. Tab): Chronologischer Event-Feed mit Typ-Icons (💰🔨🏆📦📝👤).
- **Block/Unblock:** Button im Drawer-Header, "Blocked"-Badge bei gesperrten Accounts.
- **Export CSV:** Button im Customers-Tab-Header (`window.open`).
- Neue Typen: `CustomerNote`, `TimelineEvent`, `SavedAddress`.

#### Rudderstack Integration (P1.5)

**Backend (`backend/src/lib/rudderstack.ts`)** — neu
- `rudderTrack(userId, event, properties)` + `rudderIdentify(userId, traits)`.
- Graceful degradation: no-op wenn RUDDERSTACK_WRITE_KEY/DATA_PLANE_URL fehlen oder SDK nicht installiert.
- `require()` statt `import` für optionale Abhängigkeit.

**`backend/src/lib/crm-sync.ts`** — erweitert
- Alle 5 CRM-Sync-Funktionen rufen zusätzlich `rudderTrack()` auf (Brevo-Calls unverändert):
  - `crmSyncRegistration` → `Customer Registered` + `rudderIdentify`
  - Bid Placed → `Bid Placed`
  - Auction Won → `Auction Won`
  - Payment Completed → `Payment Completed`
  - Order Shipped → `Order Shipped`

**Storefront (`storefront/src/lib/rudderstack.ts`)** — neu
- Browser-SDK-Helpers: `rudderTrack`, `rudderPage`, `rudderIdentify` (no-op wenn nicht initialisiert).

**`storefront/src/components/RudderstackProvider.tsx`** — neu
- CDN Script-Tag Initialisierung + automatisches `page()` auf Route-Change via `usePathname`.

**Tracking-Events in Storefront:**
- `ItemBidSection.tsx` → `Bid Submitted` bei erfolgreichem Gebot
- `SaveForLaterButton.tsx` → `Item Saved` beim Speichern
- `checkout/page.tsx` → `Checkout Started` + `Checkout Completed` (alle 3 Payment-Paths)

**Setup:**
- Rudderstack Cloud Data Plane: `https://secklerrovofrz.dataplane.rudderstack.com`
- SDK installiert: `@rudderstack/rudder-sdk-node@3.0.3`
- Env Vars gesetzt in backend/.env + storefront/.env.local (VPS)
- Doku: `docs/architecture/RUDDERSTACK_SETUP.md`

**Commits:** `4e13966` · `f84d651`

---

### 2026-03-30 — Orders: Mark Refunded Action + UI Fixes (RSE-269 follow-up)

**Backend (`api/admin/transactions/[id]/route.ts`)**
- Neue Action `mark_refunded`: Setzt `status = refunded` in der DB ohne Stripe/PayPal API aufzurufen. Iteriert alle Transaktionen der `order_group_id`. Setzt `auction_status = available` auf verknüpftem Release. Schreibt `order_event` Audit-Entry "Marked as refunded (manual)".
- Abgesichert: gibt 400 zurück wenn `status` bereits `refunded`.

**Validation (`lib/validation.ts`)**
- `UpdateTransactionSchema.action` Zod-Enum: `mark_refunded` hinzugefügt. Vorher: Request schlug mit "Validation failed" fehl.

**Orders UI (`admin/routes/transactions/page.tsx`)**
- Neue Funktion `markRefunded()` — ruft `action: "mark_refunded"` auf.
- Lila "Mark ✓" Button neben rotem "Refund" Button für alle `status=paid` Transaktionen.
- **Layout-Fix:** Alle Action-Buttons als `<span>` statt `<button>` → umgeht Medusa globales `button { min-height }` CSS. Buttons in vertikalem Stack: Ship oben, Refund + Mark ✓ unten nebeneinander. `whiteSpace: nowrap` + `lineHeight: 18px`.

**Dashboard (`admin/routes/dashboard/page.tsx`)**
- "Cancel Order" Button in Overdue Payment Cards (ACTION REQUIRED). Ruft `action: "cancel"` auf. Entfernt Transaction sofort aus Queue via State-Update. Für Fälle wo Payment-Reminder Cron nicht läuft.

**Commits:** `8c96247` · `68ceb84` · `c3e3fad` · `b552c1b`

---

### 2026-03-30 — E2E Test Suite: Neue Admin-Route Coverage

**`tests/10-admin.spec.ts` — 5 neue Smoke-Tests**
- `admin dashboard route accessible` → `/app/dashboard`
- `admin ai-assistant route accessible` → `/app/ai-assistant`
- `admin catalog hub route accessible` → `/app/catalog`
- `admin marketing hub route accessible` → `/app/marketing`
- `admin operations hub route accessible` → `/app/operations`

Alle Tests folgen dem bestehenden Login-then-Navigate-Muster. Bestehende Tests bleiben valide (`/app/transactions`, `/app/auction-blocks`, `/app/live-monitor` existieren weiterhin — Sidebar-Umbenennung "Transactions" → "Orders" betrifft nur den Label, nicht die Route-URL).

**`backend/src/admin/routes/test-runner/page.tsx`**
- Subtitle-Counter aktualisiert: "64 tests" → "69 tests across 10 spec files"

---

### 2026-03-29 — Admin UX Overhaul: Task-Oriented Layout + Orders Redesign (RSE-269)

**Ended-State Task Dashboard (`auction-blocks/[id]/page.tsx`)**
- Block-Detailseite bei `status=ended` zeigt statt Edit-Form einen Task-Dashboard.
- **NEXT STEPS** — 4 Schritt-Cards: (1) Winner Emails (✓ Sent automatically), (2) Payments (paid/total · X pending · X refunded), (3) Pack & Ship (shipped/paid), (4) Archive Block (Button wenn alles shipped).
- Payments-Step unterscheidet jetzt korrekt `pending` vs. `refunded` — refunded wird lila angezeigt, nicht als "Awaiting Payment".
- Won/No Bid Tab-Toggle in der Lots-Tabelle. Lot-Zeilen klickbar → `/app/transactions/{tx.id}`.
- **Relist-Modal** für No-Bid-Lots: 3 Optionen (bestehender Draft-Block / neuer Scheduled-Block / Make Available direkt).
- Analytics-Tab + Edit-Form als aufklappbare Accordion-Sektionen (versteckt by default — Fokus liegt auf Aufgaben).
- **Breadcrumb** `← Auction Blocks › [Block Title]` oben links, identisches Styling wie Orders-Seite.

**Auction Blocks Liste (`auction-blocks/page.tsx`) — komplett neu**
- Ended-Blöcke als prominente **EndedBlockCard** mit farbigem linken Rand (rot=unpaid, amber=packing, grün=done).
- Live-Task-Badges pro Karte: `⚠ X unpaid` (rot), `X refunded` (lila), `📦 X to pack/ship` (amber), `X no bid` (grau), `✓ X shipped` (blau).
- Section-Header mit pulsierendem rotem Punkt wenn urgentCount > 0.
- Reihenfolge: **Needs Processing** → Live Now → Upcoming → Drafts → Archived.
- Summaries für alle Ended-Blöcke werden parallel via `Promise.allSettled` geladen.

**Bugfixes: Refund/Cancelled/Failed Status**
- `getCurrentStep()` + `getTxStatusLabel()` in `post-auction/page.tsx`: Terminal-States (refunded/cancelled/failed) werden vor `fulfillment_status` geprüft. Vorher: refunded Lots zeigten "Awaiting Payment".
- Backend `post-auction/route.ts`: `summary.unpaid` zählt jetzt nur `status = 'pending'`. Neues Feld `summary.refunded` für refunded/cancelled/failed.
- `EndedStateDashboard` (Payments-Step) und `EndedBlockCard` (Badge) nutzen `summary.refunded`.

**Orders-Seite — Visual Redesign (`transactions/page.tsx`)**
- Medusa `Table`-Komponente durch raw `<table>` ersetzt — gleicher Stil wie Auction Blocks (grauer Header-Background, 10px uppercase Spalten, inline `onMouseEnter/Leave` hover).
- Advanced Filter (Payment / Fulfillment / Provider / Datum) hinter `Filters ▾` Button versteckt (collapsed by default, leuchtet blau bei aktiven Filtern).
- **Shopify-style Quick Tabs**: Needs Shipping (default) / Packing / Shipped / Awaiting Payment / All.
- Status-Badges als inline `Pill`-Komponente (custom bg/color, kein Medusa-Dependency).
- Bulk-Action-Bar als dunkler floating Pill (statt weißem Kasten).
- Customer-Spalte zeigt Stadt + Land. Amount-Spalte zeigt Provider darunter.

**Extensions Sidebar-Fix (`admin-nav.tsx`)**
- CSS: `nav [data-radix-collapsible-trigger] { display: none !important; }` — fängt beide Varianten (+ und −) ab.
- JS-Match: `!text?.includes("Extensions")` statt `=== "Extensions"` (textContent enthält Icon-Zeichen).

**Commits:** `e925fb0` · `044b25c` · `994f91d` · `8e2b879` · `abeb526` · `6fcd931` · `b9cb9b0`

---

### 2026-03-30 — Admin AI Assistant

**Neuer Admin-Bereich `/app/ai-assistant`**
- Chat-Interface im Medusa-Admin mit Claude Haiku als Backend-AI.
- Streaming SSE: Antworten erscheinen sofort, kein Warten auf komplette Response.
- **5 read-only Tools** (Knex-Queries direkt, kein HTTP-Roundtrip):
  - `get_dashboard_stats` — KPI-Snapshot (aktive Auktionen, offene Bestellungen, Katalog-Größe, Gesamtumsatz)
  - `list_auction_blocks` — Blocks nach Status filtern
  - `search_transactions` — Bestellungen nach Kunde, E-Mail, Bestellnummer, Status suchen
  - `search_media` — 41k Releases durchsuchen (Titel, Artist, Label, Kategorie)
  - `get_system_health` — DB-Connectivity-Check
- **Agentic loop:** Claude kann mehrere Tools pro Antwort aufrufen (max 5 Iterationen).
- **Tool-Chips in der UI:** Zeigen welche Tools aufgerufen wurden, klickbar für Raw-JSON.
- **5 Suggestion-Chips** als Schnellstart (Deutsch).
- **Markdown-Rendering:** Tabellen, Code-Blöcke, Bold, Listen.
- Sidebar: rank 6 (nach Operations), Sparkles-Icon.
- Model: `claude-haiku-4-5-20251001` (~$0.001/Anfrage).
- `ANTHROPIC_API_KEY` in `backend/.env` (aus 1Password: "Anthropic API Key (MyNews)").

**Neue Dateien:**
- `backend/src/api/admin/ai-chat/route.ts` — Backend-Endpoint (POST, SSE-Streaming)
- `backend/src/admin/routes/ai-assistant/page.tsx` — Chat-UI
- `@anthropic-ai/sdk` zu `backend/package.json` hinzugefügt

---

### 2026-03-30 — Admin Backoffice Fixes + Dashboard Landing Page

**Neue Admin-Dashboard-Seite (`/app/dashboard`)**
- `backend/src/admin/routes/dashboard/page.tsx` (NEU) — Einstiegsseite für das Admin-Backend. Sidebar: erster Punkt (rank 0, Home-Icon). Auto-Refresh 60s.
- **KPI-Bar:** 5 Cards: Unpaid Overdue (rot wenn >0), Ready to Pack (amber), Labels Pending (lila), Active Auctions (grün), Shipped This Week.
- **ACTION REQUIRED Queue:** Prioritätsliste — pro überfälliger Transaktion (>3 Tage) eigene Karte mit Link zu `/app/transactions/{id}`. Gruppierte Karten für „Ready to Pack" + „Labels Pending". Grüner „All caught up"-State wenn leer.
- **LIVE NOW Widget:** Aktive Auction Blocks mit End-Zeit, Item-Anzahl, Buttons: Live Monitor + Manage.
- **COMING SOON:** Bis zu 3 scheduled/preview Blocks mit Start-Datum und Edit-Link.
- **Week Stats Bar:** Revenue, Orders, Shipped, Pending — als kleine Zusammenfassung unten.
- Datenquellen: 5 parallele Fetches via `Promise.allSettled` gegen bestehende Admin-Endpoints.

**Backoffice Bugfixes (B1–B4)**
- **B1 — 404 entfernt:** „Post-Auction Workflow →" Button in `post-auction/page.tsx` gelöscht. Verwies auf nicht existente Route `/post-auction/workflow`.
- **B2 — Lot-Zeilen klickbar:** Jede Lot-Zeile in der Post-Auction-Seite navigiert direkt zu `/app/transactions/{tx.id}`. Cursor `pointer`, hover-Highlight blau. Lots ohne Transaction (kein Gebot) nicht klickbar.
- **B3 — Refund-Button:** In `ActionButton` für alle bezahlten Lots (Steps 2–4): roter „Refund"-Button neben dem Hauptbutton. Confirm-Dialog mit Betrag. Ruft `POST /admin/transactions/{id}` mit `action: "refund"`.
- **B4 — Auction-Blocks-Liste klickbar:** Jede Tabellenzeile in `/app/auction-blocks` navigiert zu `/app/auction-blocks/{id}`. Buttons in der Aktions-Spalte stoppen Event-Propagation.

**Konzept-Dokument**
- `docs/architecture/ADMIN_BACKOFFICE_KONZEPT_2026.md` (NEU) — Vollständige Analyse aller Bugs, Marktvergleich (eBay, Catawiki, Shopify), Konzept mit Wireframes, Umsetzungsplan P1–P4, offene Fragen.

**Admin Sidebar — CSS Fix**
- `admin-nav.tsx` überarbeitet: Extensions-Collapsible wird jetzt erst via `btn.click()` geöffnet (aria-expanded check), dann via `requestAnimationFrame` versteckt. Radix-Collapsible CSS-Override (`[data-radix-collapsible-content]` height: auto) verhindert dass Inhalt bei height:0 bleibt. Modul-Level `injectNavCSS()` für sofortiges Style-Inject vor React-Render.

---

### 2026-03-30 — Admin UI Restructuring + System Health Erweiterung

**Admin Sidebar: 15 Flat Items → 5 strukturierte Gruppen**

- **`/app/catalog`** (NEU) — Hub-Seite für alle Katalog-Bereiche. Cards: Media Browser, Entity Content, Musicians. Live-Stats-Bar (Total Releases, Artists, Enrichment-%, Musicians/Bands). `defineRouteConfig` auf neuer Hub-Seite.
- **`/app/marketing`** (NEU) — Hub-Seite für alle Marketing-Bereiche. Cards: Newsletter, Email Templates, CRM Dashboard, Content Blocks, Gallery. Stats: 3.580 CRM-Kontakte, 4 Newsletter-Templates, 6 Transactional Emails, 9 Gallery-Sektionen.
- **`/app/operations`** (NEU) — Hub-Seite für Platform-Tools. Cards: System Health, Shipping, Sync Status, Test Runner. Grüner Live-Banner (pulsierend) wenn aktive Auktionen laufen — direkt mit Live-Monitor verknüpft.
- **"Transactions" → "Orders"** umbenannt in Sidebar-Label.
- `defineRouteConfig` entfernt aus: `content`, `customers`, `emails`, `entity-content`, `gallery`, `live-monitor`, `media`, `musicians`, `newsletter`, `shipping`, `sync`, `system-health`, `test-runner` — alle weiter über `/app/[name]` erreichbar, aber nicht mehr in Sidebar.

**System Health: 9 → 11 Services**
- **VPS / API Server (Hostinger)** — Live HTTP-Check gegen `api.vod-auctions.com/health`, Fallback auf `/store/auction-blocks`. Zeigt Latenz in ms.
- **Storefront (vod-auctions.com)** — Live HTTP-Check gegen public domain.
- Neue Icons: 🖥️ (VPS), 🌍 (Storefront public) in `SERVICE_ICONS`.

**Docs**
- `docs/architecture/ADMIN_UI_KONZEPT_2026.md` — Konzept-Dokument (Problem-Analyse, Hub-Struktur, Routing-Regeln, Implementierungsplan, Auction Detail + Order Detail Konzepte).
- `docs/architecture/MONITORING_SETUP_GUIDE.md` (NEU) — Setup-Anleitung für GA4, Sentry (inkl. npx wizard), ContentSquare + Microsoft Clarity als kostenlose Alternative. Env-Var-Tabelle.
- `docs/architecture/mockups/` (NEU) — 6 HTML-Mockups: index, sidebar overview, catalog hub, operations hub, auction detail, order detail.

---

### 2026-03-29 — Post-Auction Workflow + Bugfixes

**Post-Auction Workflow (Admin)**
- `GET /admin/auction-blocks/:id/post-auction` — liefert alle Lots eines ended Blocks mit Gewinner (Name, Email), Transaction-Status (paid/pending), Fulfillment-Status, `label_printed_at`. Summary: total/paid/unpaid/no_bid/shipped.
- `backend/src/admin/routes/auction-blocks/[id]/post-auction/page.tsx` (NEU) — 5-stufiger Step-Tracker (Ended → Paid → Packing → Label Printed → Shipped) pro Lot. Farbcodiert: grün=done, gold=aktiv, grau=pending. Filter-Tabs: All/Unpaid/Paid/Shipped. Action-Button pro Lot: "Mark Packing" / "Print Label" / "Mark Shipped" / "Done ✓" / "No Bid". Refetch nach jeder Action.
- Block-Detail-Seite: "Post-Auction Workflow →" Button erscheint wenn `block.status === "ended"`.
- `GET /admin/transactions/:id/shipping-label` — pdfkit-PDF mit VOD Records Absender, Empfänger (Shipping-Adresse aus Transaction), Bestellnummer, Items-Liste. Setzt `label_printed_at = NOW()` nach Generierung.
- `POST /admin/transactions/:id` neue actions: `packing` (→ `fulfillment_status = "packing"`) + `label_printed` (→ `label_printed_at = NOW()`). Beide mit `order_event` Audit-Log.
- `POST /admin/transactions/bulk-action` — `{ ids: string[], action: "packing" | "label_printed" }` für Batch-Updates.
- DB-Migration: `ALTER TABLE transaction ADD COLUMN IF NOT EXISTS label_printed_at TIMESTAMP` — ausgeführt.
- `lib/validation.ts`: `UpdateTransactionSchema` um `"packing"` + `"label_printed"` erweitert. `BulkActionSchema` neu.

**Won-Badge (Storefront)**
- `GET /store/account/status`: `wins_count` neu — zählt `transaction` WHERE `status="pending"` AND `block_item_id IS NOT NULL` (unbezahlte Auction-Wins).
- `AuthProvider`: `winsCount` State + Context-Feld hinzugefügt.
- `AccountLayoutClient`: Rotes Badge `bg-destructive/80` bei "Won" wenn `winsCount > 0`.

**Bugfixes**
- **Email Cover-Image kaputt:** `email-helpers.ts` baute `https://tape-mag.com/bilder/gross/${coverImage}` — aber `coverImage` enthält bereits die volle URL. Doppelte URL → Broken Image in allen Emails mit Item-Preview. Fix: `release.coverImage || undefined` direkt verwenden (Zeilen 70 + 474).
- **Storefront Build-Fehler (Sentry):** `transpileClientSDK` (deprecated), `hideSourceMaps` (nicht mehr in `SentryBuildOptions`), `disableLogger` (deprecated) aus `next.config.ts` entfernt.
- **Storefront Build-Fehler (Playwright):** `playwright.config.ts` + `tests/` zu `exclude` in `storefront/tsconfig.json` hinzugefügt — `@playwright/test` ist kein Prod-Dependency.

---

### 2026-03-30 — Zahlungs- und Sicherheitssanierung

**Betroffene Dateien:** `backend/src/lib/paypal.ts`, `backend/src/api/store/account/capture-paypal-order/route.ts`, `backend/src/api/store/account/update-payment-intent/route.ts`, `backend/src/api/webhooks/stripe/route.ts`, `backend/src/api/store/auction-blocks/[slug]/items/[itemId]/bids/route.ts`, `backend/medusa-config.ts`, `deploy.sh`

- **PayPal server-side amount verification:** `getPayPalOrder()` in `paypal.ts` ergänzt (`GET /v2/checkout/orders/{id}`). `capture-paypal-order` verifiziert jetzt immer serverseitig bei PayPal: `status=COMPLETED` + Betrag ±€0.02 gegen DB-Summe aller `pending`-Transaktionen. Client-seitige `captured_amount`-Angabe nicht mehr verwendet. Bei Mismatch: Transaktionen auf `failed` gesetzt, 400-Error. `paypal_order_id` ist jetzt required.
- **PayPal-Orders erhalten Bestellnummern (Bonus-Fix):** `capture-paypal-order` generiert `order_number` (Sequenz `order_number_seq`) + `order_event`-Audit-Eintrag direkt. Zuvor fiel beides durch: der PayPal-Webhook prüft `WHERE paypal_capture_id = X AND status = 'paid'` → fand nach dem Capture-Endpoint immer `alreadyPaid` und skippt komplett.
- **Stripe Webhook idempotent (`checkout.session.completed`):** `alreadyPaid`-Guard am Anfang des `orderGroupId`-Branch eingefügt (identisch zu `payment_intent.succeeded`). Verhindert bei doppelter Webhook-Zustellung: zweiten Promo-Code-`used_count`-Increment, zweite Sequenznummer, duplizierten `order_event`, zweite Bestätigungsmail.
- **Promo-Code-Rabatt bei Shipping-Neuberechnung erhalten:** `update-payment-intent` liest `discount_amount` aus bestehenden Transaktionen (proportional bereits verteilt) und subtrahiert ihn bei `total_amount` pro Transaktion und beim Stripe-PaymentIntent-Betrag. Vorher: `grandTotal = itemsTotal + shippingCost` ohne Rabatt → Nutzer zahlte vollen Preis nach Adressänderung.
- **`user_id`-Leak in öffentlicher Bid-History geschlossen:** `GET /store/auction-blocks/*/items/*/bids` gab `user_id: bid.user_id` im Response-Objekt zurück. 1 Zeile entfernt. `user_hint` (SHA-256-Hash) bleibt erhalten.
- **Production-Startup-Check JWT/Cookie:** `medusa-config.ts` wirft Exception wenn `NODE_ENV=production` und `JWT_SECRET`/`COOKIE_SECRET` nicht gesetzt. Vorher stiller Fallback auf `"supersecret"`.
- **`deploy.sh` Credentials entfernt:** `DATABASE_URL`-Passwort, `SUPABASE_DB_URL`-Passwort, `LEGACY_DB_PASSWORD` durch Platzhalter `REPLACE_WITH_*` ersetzt. Git-History enthält die alten Werte noch — Rotation empfohlen.

---

### 2026-03-29 — Admin Backoffice Erweiterungen (System Health + Email Preview)

- **System Health Dashboard:** `GET /admin/system-health` — Live-Checks für 9 Services: PostgreSQL (SELECT 1), Stripe (balance API), PayPal (OAuth Token), Resend (domains list), Brevo (account API), Storefront (HTTP check), Sentry (ENV check), ContentSquare (ENV check), GA4 (ENV check). Latenz in ms, Status: ok/error/unconfigured. `backend/src/admin/routes/system-health/page.tsx` — Service-Cards mit Ping-Animation, Summary-Bar, Auto-Refresh 30s, Quick Links zu allen Dashboards.
- **Email Template Preview + Edit:** `GET /admin/email-templates/:id` — rendert vollständiges HTML mit Musterdaten, gibt `{ html, subject, subject_default, config }` zurück. `PUT /admin/email-templates/:id` — speichert Subject-Override, Preheader-Override, Notes in `content_block` (page=`email_config`). Admin-Seite `/admin/emails` komplett überarbeitet: Klick auf Template öffnet Side-Drawer mit 3 Tabs — Preview (iframe mit echtem HTML), Edit (Subject/Preheader-Override + Notes speicherbar), Send Test (inline Email-Versand).
- **Admin-Sidebar:** Emails, Test Runner, System Health jetzt in Sidebar sichtbar. Bug behoben: `cp -r` auf existierenden Ordner merged statt zu überschreiben → Fix: `rm -rf public/admin` vor Copy.

---

### 2026-03-29 — Email System Upgrade (B1, B2, B3, B4)

- **B4 Email HTML Redesign:** `layout.ts` updated — `<html xmlns:v>` VML namespace, `format-detection` meta, `#0d0b08` outer background, `<div role="article">` wrapper, plain `<span>VOD AUCTIONS</span>` header, explicit divider `<tr>` between body and footer, MSO `<style>` conditional comment. `buildFooter` now returns `<tr><td>` (inline within container table, not standalone). Preheader color updated to `#0d0b08`. Footer copy: "VOD Auctions · Curated Industrial & Experimental Music" + unsubscribe + email-preferences + visit links.
- **B4 Preheader Texts:** All 10 Resend transactional templates updated to exact-spec preheader strings (verify-email, password-reset, bid-won, outbid, payment-confirmation, payment-reminder-1, payment-reminder-3, shipping, watchlist-reminder, feedback-request).
- **B1 Unsubscribe Page:** `storefront/src/app/email-preferences/unsubscribed/page.tsx` — dark-theme confirmation page with "changed your mind?" re-subscribe panel, Back to Home + Browse Auctions CTAs. Backend route + HMAC token system was already complete.
- **B2 Double Opt-In Newsletter:** `backend/src/emails/newsletter-confirm.ts` — new confirmation email template. `POST /store/newsletter` rewritten — no longer inserts directly to Brevo; sends confirmation email via Resend instead. `GET /store/newsletter/confirm` — validates daily HMAC (today + yesterday window), inserts to Brevo on success, redirects to `/newsletter/confirmed`. `storefront/src/app/newsletter/confirmed/page.tsx` — success/error state page with expected-email list.
- **B3 Admin Email Template UI:** `GET /admin/email-templates` returns 15 template metadata objects. `POST /admin/email-templates` renders preview + sends test email via Resend. `backend/src/admin/routes/emails/page.tsx` — filter tabs (All/Resend/Brevo), template cards with Channel + Category badges, preheader preview text, Send Test modal with email input + status feedback.

---

### 2026-03-29 — Frontend Code Quality (D7, D14)
- **D7 TypeScript:** `any`-Types in `ItemBidSection.tsx` (2x Supabase Realtime payloads) und `checkout/page.tsx` (3x: `WinEntry.item.release_id`, items array, body object) durch konkrete Inline-Types ersetzt. `release_id?: string` zu `WinEntry.item` in `types/index.ts` hinzugefügt. Kein neues `lib/types.ts` — bestehende `types/index.ts` war bereits vollständig.
- **D14 Bundle Size:** `PayPalButton` in `checkout/page.tsx` auf `next/dynamic` mit `ssr: false` + Skeleton-Loader umgestellt. PayPal JS SDK wird nur geladen wenn tatsächlich gerendert. `ShareButton` + `BidHistoryTable` in Server Component korrekt — code-split bereits durch Client/Server-Boundary.

---

### 2026-03-29 — Backend Code Quality II (D3, D11)
- **D3 Zod Validation:** `lib/validation.ts` mit `CreateAuctionBlockSchema`, `CreateBlockItemSchema`, `UpdateTransactionSchema`, `BulkShipSchema` + `validateBody` Helper. Admin-Routes `/admin/auction-blocks` (POST), `/admin/auction-blocks/:id/items` (POST), `/admin/transactions/:id` (POST), `/admin/transactions/bulk-ship` (POST) validieren `req.body` und geben strukturierte 400-Fehler mit `issues`-Array zurück. `zod@^3.23.8` zu `package.json` hinzugefügt.
- **D11 Anonymization:** Bidder-Anzeige von `"R***"` auf `"Bidder A3F2C1"` (SHA-256 Hash, 6 Hex-Zeichen) umgestellt — konsistent pro User, nicht bruteforceable. Kein DB-Lookup mehr nötig (nur noch userId-Hash).

---

### 2026-03-29 — Frontend Quality (C3, C5, C7, D5, D8, D10)
- **C3 Gate Fix:** Hardcoded password fallback `"vod2026"` entfernt aus `middleware.ts` + `api/gate/route.ts`. Gate deaktiviert wenn `GATE_PASSWORD` ENV nicht gesetzt. Launch-Checklist-Kommentar hinzugefügt.
- **C5 Hotjar:** `components/providers/HotjarProvider.tsx` — lädt Hotjar-Script nur wenn `NEXT_PUBLIC_HOTJAR_ID` gesetzt + User hat Marketing-Consent gegeben. In `layout.tsx` eingebunden.
- **C7 GA4 E-Commerce:** `view_item`, `add_to_cart`, `begin_checkout`, `purchase` Events in `lib/analytics.ts`. `CatalogViewTracker.tsx` Client-Component für Server-seitige Catalog-Detail-Seite. `trackBeginCheckout` + `trackPurchase` in Checkout-Page (Stripe + PayPal).
- **D5 Error Boundaries:** `components/ErrorBoundary.tsx` React Class Component. Eingebunden in Lot-Detail-Seite (`ItemBidSection`) + `AccountLayoutClient` (deckt Checkout + alle Account-Pages ab).
- **D8 Fetch Errors:** `fetchError` State in Checkout-Page. `catch`-Block war `/* silent */` → zeigt jetzt rote Fehlermeldung mit Refresh-Hinweis.
- **D10 Loading States:** Spinner-SVG + `disabled` auf Place Bid Button + Confirm Bid Modal Button + Pay Now Button. Button-Text wechselt zu "Processing..." während Load.

---

### 2026-03-29 — Testing Infrastructure (A1, A3)
- **A1 Test Concept:** `docs/TEST_CONCEPT.md` — vollständiges Testkonzept (Scope, 15 User Journeys, Testarten, Infrastruktur, Environments, Regression-Protokoll)
- **A3 Test Dashboard:** `/admin/test-runner` — Playwright-Ergebnisse anzeigen (Summary-Karte, Spec-Tabelle, Failed-Tests mit Fehlertext), Testläufe triggern (POST mit Concurrency-Guard), Run-History (Mini-Bar-Chart + Tabelle, letzte 30 Läufe)
  - Backend: `backend/src/api/admin/test-runner/route.ts` (GET + POST, JSON-Report + History)
  - Admin UI: `backend/src/admin/routes/test-runner/page.tsx` (3s Polling während Lauf aktiv)

---

### 2026-03-29 — Config & Code Quality (C1, C2, C6, D12, D13)
- **C1 Brevo:** `VOD_AUCTIONS_LIST_ID`/`TAPE_MAG_LIST_ID` mit sicheren Defaults (4/5) in `brevo.ts`; backward-compat Aliase erhalten; `backend/.env.example` vollständig dokumentiert
- **C2 Sentry:** `sentry.client.config.ts` mit Replay-Integration (maskAllText, blockAllMedia, 0.1 session sample rate); `sentry.server.config.ts` + `sentry.edge.config.ts` aktualisiert; `next.config.ts` mit `withSentryConfig` (authToken, widenClientFileUpload, tunnelRoute, hideSourceMaps, disableLogger, Source Maps nur in Production); `storefront/.env.local.example` erstellt
- **C6 Uptime:** `docs/UPTIME_KUMA_SETUP.md` mit vollständiger VPS-Installationsanleitung (Docker, Nginx, Certbot, 4 Monitore)
- **D12 Types:** `backend/src/lib/types.ts` mit Bid, BlockItem, Transaction, CustomerSummary, AuctionBlockPublic Interfaces
- **D13 Constants:** `backend/src/lib/constants.ts` mit LOG, AUCTION_STATUS, ITEM_STATUS, TRANSACTION_STATUS, FULFILLMENT_STATUS und numerischen Konstanten

---

### 2026-03-29 — Backend Code Quality (D1, D2, D4, D6, D7, D11)
- **D1 Race Condition:** `bid`-Tabelle mit `.forUpdate()` gelockt in Bid-Transaktion
- **D2 Error Handling:** Alle `.catch(() => {})` durch Console.error-Logging ersetzt (bids/route.ts, auction-lifecycle.ts, webhooks/stripe/route.ts)
- **D4 Checkout Atomicity:** DELETE+INSERT in atomarer DB-Transaktion (checkout-helpers.ts)
- **D6 N+1 Fix:** Live-Bids Batch-Load (3 Queries statt 3×N) in admin/auction-blocks/[id]/live-bids/route.ts
- **D7 Null Guard:** `parseFloat(null)` → NaN Guard in Bid-Validation (bids/route.ts)
- **D11 CORS:** Explizite storeCors/adminCors/authCors Fallbacks in medusa-config.ts

---

### 2026-03-28 — Hotfix: Backend-Crash pdfkit

- **Ursache:** `backend/src/lib/invoice-template.ts` imported `pdfkit`, das auf dem VPS nicht installiert war → `Cannot find module 'pdfkit'` → PM2 restart-loop
- **Fix:** `npm install pdfkit @types/pdfkit` auf VPS + `pdfkit: ^0.15.2` + `@types/pdfkit: ^0.13.9` in `backend/package.json` committed

---

### 2026-03-29 — Auction Workflow Vollimplementierung (P1+P2+P3+K-Series)

**P1 — Kritische Gaps:**
- **Tiered Bid Increments:** €0.50→€25 Stufentabelle; `getMinIncrement()` in Backend + Storefront "Min. bid" Anzeige
- **Anti-Sniping:** `max_extensions` (10) + `extension_count` auf `auction_block`/`block_item`; Admin-UI Toggle; Realtime Broadcast `lot_extended` via Supabase (benötigt `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`)
- **Payment Deadline:** 5-Tage-Frist; Cron `payment-deadline.ts` (tägl. 09:00 UTC) — Tag 1+3 Reminder-Mails, Tag 5 Auto-Relist + Admin-Alert; Felder `payment_reminder_1/3_sent_at` auf `transaction`
- **Condition Grading:** Discogs-Standard Dropdowns (M/NM/VG+/VG/G+/G/F/P) im Admin Media Editor; `ConditionBadge.tsx` Storefront (farb-kodiert mit Tooltip)

**P2 — Hohe Priorität:**
- **Public Bid History:** `BidHistoryTable.tsx` (Bidder #N, 30s Poll, Framer Motion animation), auf Lot-Detail-Seite
- **Watchlist Reminder:** Stündlicher Cron `watchlist-reminder.ts`; 24h vor Lot-Ende → Email an Saver; Feld `watchlist_reminded_at` auf `saved_item`
- **Reserve Price:** `reserve_price` Feld auf `block_item`; Lifecycle-Check (kein Award wenn Reservepreis nicht erreicht); Storefront-Anzeige (Lock-Icon, ohne Betrag)
- **Admin Live Monitor:** `/admin/live-monitor` — 10s Auto-Refresh, Lot-Cards (rot = recent bids, grün = aktiv, grau = keine Bids)
- **Post-Block Analytics:** `GET /admin/auction-blocks/:id/analytics` — Conversion-Rate, Revenue, Avg-Price-Multiple, Top-Lots; Analytics-Tab in Block-Detail-Seite (auto-load für ended/archived)
- **Newsletter Sequenz:** Cron `newsletter-sequence.ts` (stündlich) — T-7d Teaser, T-24h, T+0 Live, T-6h Ending via Brevo Kampagnen-API (List ID 4); Felder `newsletter_*_sent_at` auf `auction_block`

**P3 — Mittelfristig:**
- **Going/Going/Gone:** <5 Min rotes Pulsing-Banner + roter Countdown in `ItemBidSection`; <1h Amber-Banner
- **"No Buyer's Premium" USP:** Badge auf Lot-Seite + Checkout-Summary (beide Instanzen) + Footer
- **Live Auction Banner:** `LiveAuctionBanner` Server-Component (ISR 60s) auf Homepage, Catalog, Auctions-Seite
- **1-Click Rebid:** Outbid-Email zeigt vorgeschlagenen Betrag (nächste Stufe); `?bid=X` URL-Param pre-füllt Bid-Input
- **Staggered Ending:** Admin Checkbox + Interval-Input (Min.) + Preview-Text + Header-Badge; Lots enden gestaffelt
- **View Counter:** `view_count` auf `block_item`, Fire-and-Forget Increment; Social-Proof-Anzeige auf Lot-Seite
- **Preview Block Storefront:** Amber-Banner + `PreviewCountdown.tsx` für scheduled/preview Blocks; Save-Buttons statt Bid-Formular
- **Bulk Price Editor:** Admin Panel — Modi: % vom Schätzwert / Fixed / Manuell; API `POST /admin/auction-blocks/:id/items/bulk-price`
- **Social Sharing:** `ShareButton.tsx` (Web Share API mobil + Dropdown Desktop: Copy/Twitter/Facebook/WhatsApp); auf Block + Lot-Seiten
- **Schema.org MusicAlbum:** JSON-LD auf Catalog-Detail-Seiten

**K-Series — Nachträglich identifizierte Verbesserungen:**
- **Invoice PDF:** `GET /store/account/orders/:groupId/invoice` — pdfkit-generiertes PDF; Rechnung mit VOD-Daten, MwSt, Positionen
- Alle bestehenden K-Series-Punkte (Bids Log, Block löschen, Bid Badges, Countdown, Nav Cleanup) wurden am 2026-03-28 implementiert (siehe RSE-235 unten)

**Neue Dateien (Backend):**
`lib/supabase.ts`, `lib/invoice-template.ts`, `jobs/payment-deadline.ts`, `jobs/watchlist-reminder.ts`, `jobs/newsletter-sequence.ts`, `api/admin/auction-blocks/[id]/analytics/route.ts`, `api/admin/auction-blocks/[id]/items/bulk-price/route.ts`, `api/store/account/orders/[groupId]/invoice/route.ts`, `admin/routes/live-monitor/page.tsx`, `emails/payment-reminder-1.ts`, `emails/payment-reminder-3.ts`, `emails/watchlist-reminder.ts`, `emails/block-teaser.ts`, `emails/block-tomorrow.ts`, `emails/block-live.ts`, `emails/block-ending.ts`, `emails/newsletter-layout.ts`

**Neue Dateien (Storefront):**
`components/ConditionBadge.tsx`, `components/BidHistoryTable.tsx`, `components/LiveAuctionBanner.tsx`, `components/PreviewCountdown.tsx`, `components/ShareButton.tsx`

**Migrationen:** `20260328` (auto_extend/max_extensions), `20260329000000` (payment_reminders), `20260329100000` (watchlist_reminded_at), `20260329200000` (reserve_price), `20260330000000` (newsletter_*_sent_at), `20260330100000` (view_count)

---

### 2026-03-28 — RSE-235: Admin UX + K-Series

- **Admin Bids Log:** `GET /admin/auction-blocks/:id/bids-log` — chronologisch, volle Bieter-Namen, Cover, Betrag, Proxy, Winning/Outbid Status
- **Auction Block löschen:** Delete-Button für draft/ended/archived Blocks. Confirmation-Dialog. Releases → `available`. `DELETE /admin/auction-blocks/:id` (409 bei active/scheduled/preview)
- **Live-Bids + Bids-Log:** Zeigen jetzt volle Namen statt anonymisierte Hints
- **Bid Badges (BlockItemsGrid):** Highest Bid = grünes Badge + `animate-pulse` + grüne Card-Border. Your Bid (Outbid) = goldenes Badge prominenter
- **Countdown H:M:S:** Überall `14h 23m 45s` Format. Block-Detail: Start+End Zeiten (CET/CEST auto-erkannt), End-Zeit als Gold-Pill-Badge
- **Storefront-Link Fix:** Block-Detail "Storefront" Button → `https://vod-auctions.com`
- **Medusa Nav Cleanup:** Ungenutzte Nav-Items (Orders, Products, Inventory, Customers, Promotions, Price Lists) per CSS-Injection in `auction-blocks/page.tsx` ausgeblendet
- **Konzept-Review Dokument:** `docs/architecture/AUCTION_WORKFLOW_KONZEPT_REVIEW_2026.md` — VOD vs eBay/Catawiki/Paddle8 Vergleich (9 Dimensionen, P1-Gaps identifiziert)

---

### 2026-03-22 — Entity Content Overhaul RSE-227 (Phase 1-7 + P1 abgeschlossen)

- **Multi-Agent Pipeline:** `scripts/entity_overhaul/` — 10 Module (orchestrator, enricher, profiler, writer, seo_agent, quality_agent, musician_mapper, db_writer, config, tone_mapping)
- **Enricher:** 10 Datenquellen (DB, MusicBrainz, Wikidata, Wikipedia, Last.fm, Brave, Bandcamp, IA, YouTube, Discogs). GPT-4o Writer + GPT-4o-mini für alle anderen Agents.
- **Tone Examples:** `scripts/entity_overhaul/tone_examples/` — 35 Beispieltexte (10 Genres × 3 + 3 Labels + 2 Press) + Ban List (40+ verbotene Phrasen)
- **Musician Database:** `musician`, `musician_role`, `musician_project` Tabellen. Admin CRUD `/admin/musicians`. Store API `/store/band/:slug` liefert `members[]`. 897 Musiker, 189 Bands mit Mitgliedern.
- **P1 Rollout abgeschlossen (2026-03-22 22:59):** 1.022 Entities, 1.013 accepted, 7 revised, 0 rejected, ~8h Laufzeit, Avg Score 82.3
- **Geänderte Dateien:** `store/band/[slug]/route.ts`, `band/[slug]/page.tsx`, `admin/routes/entity-content/page.tsx`

### 2026-03-22 — VOD Gallery

- **Storefront `/gallery`:** 10 Sektionen, Server Component, Schema.org JSON-LD (LocalBusiness+Museum+Store), GA4+Brevo Tracking
- **CMS/MAM:** `gallery_media` Tabelle. Admin CRUD `/admin/gallery` (4 Routes). Store API `/store/gallery`. 21 Medien + 6 Content-Blocks geseeded.
- **Navigation:** Gallery als 4. Nav-Link (Header, MobileNav, Footer)
- **Homepage Teaser:** 3-Bild-Grid mit CTA "Explore the Gallery"
- **Password Gate Fix:** `/gallery/gallery-*` Bildpfade durch Middleware-Bypass erlaubt

### 2026-03-22 — Entity Content Overhaul — Konzept + Admin Status Dashboard

- Konzept-Dokument: `docs/KONZEPT_Entity_Content_Overhaul.md`
- Admin Status Dashboard auf `/admin/entity-content` (Pipeline Status, Progress Bar, Data Quality Grid, Musician DB)
- Backend API: `GET /admin/entity-content/overhaul-status`
- VPS Setup: `OPENAI_API_KEY`, `LASTFM_API_KEY`, `YOUTUBE_API_KEY` in `scripts/.env`; `openai` 2.29.0 + `musicbrainzngs` 0.7.1 installiert

### 2026-03-18 — Transaction Module Phase 1 (Erweitertes Order Management)

- **DB-Migration:** 12 neue Spalten auf `transaction` (order_number, fulfillment_status, refund_amount, cancelled_at, cancel_reason, internal_note, phone, billing fields), neue `order_event` Tabelle (Audit Trail), `order_number_seq` Sequence
- **Order-Nummern:** VOD-ORD-XXXXXX, 6-stellig fortlaufend, generiert bei Payment-Success
- **Admin API erweitert:** Pagination, Search, 7 Filter, Sort, Bulk-Ship, CSV-Export (BOM/Excel-kompatibel, 15 Spalten)
- **Admin UI neu:** Transaction-Liste (Suchleiste, Filter-Pills, Pagination, Bulk-Checkboxen, Export). Neue Detail-Seite (`/app/transactions/:id`) mit Timeline, Actions, Notes.
- **Audit Trail:** Jede Status-Änderung → `order_event` Eintrag mit actor + Zeitstempel
- **VPS SSH Deploy Key:** Ed25519 Key, Git remote auf SSH umgestellt

### 2026-03-17 — Catalog Sort Fix + Infrastruktur-Wartung

- **Catalog Sort Fix:** Frontend sendete `sort=artist:asc` (Backend erwartet `sort=artist&order=asc`). Fix in `catalog/page.tsx` (SSR) + `CatalogClient.tsx`. `legacy_price` → `price` Mapping korrigiert.
- **Git Re-Clone:** Lokales Repo hatte korrupte Pack-Files. Fresh clone via HTTPS. Alle 3 Instanzen (VPS, GitHub, lokal) synchron.
- **VPS Disk Cleanup:** 90% → 78% (6 GB freigeräumt). PM2 log-rotation installiert. Disk-Alert-Script.
- **Gold-Tinted Input Styling:** `--input: #302a22`, `border-primary/25` auf Input/Select/Textarea
- **NIE `git pull` auf VPS** wenn VPS-Code nicht vorher gepusht wurde

### 2026-03-16 — PayPal Direkt-Integration

- **Architektur:** PayPal JS SDK (Hybrid) — Frontend rendert Button, Backend verwaltet Transactions
- **Neue Dateien:** `paypal.ts`, `checkout-helpers.ts`, `create-paypal-order/route.ts`, `capture-paypal-order/route.ts`, `webhooks/paypal/route.ts`, `PayPalButton.tsx`, `paypal-client.ts`
- **Betrags-Validierung:** `capture-paypal-order` vergleicht `captured_amount` mit `total_amount`. Abweichung > €0.02 → `failed`.
- **Sofort-Refund:** `refundPayPalCapture()` (nicht 5-7 Tage wie über Stripe)
- **Sandbox-Bug:** EUR + DE-Accounts → "internationale Vorschriften" Fehler. Nur Sandbox, Production OK.
- **Live-Test:** €18.49 Zahlung via PayPal Live erfolgreich

### 2026-03-15 (Fortsetzung) — Admin Refund + Invoice Fix

- **Admin Refund:** `POST /admin/transactions/:id` mit `action: "refund"` — Stripe API, Releases → `available`, Status → `refunded`
- **Invoice PDF:** Adresse Alpenstrasse 25/1 korrigiert. USt-IdNr DE232493058, 19% MwSt. Kein §19 UStG (war falsch).
- **Orders Count Badge:** Account-Sidebar zeigt Anzahl bezahlter Bestellungen
- **PayPal Redirect Fix:** `loading` State nach Redirect auf `false` gesetzt

### 2026-03-15 — Shopify-Style One-Page Checkout (Phase A+B)

- **Architektur:** Stripe Hosted Checkout → Stripe Payment Element inline. PaymentIntent statt Checkout Session.
- **Backend:** `POST /store/account/create-payment-intent`, `POST /store/account/update-payment-intent`. Webhook für `payment_intent.succeeded` + `.payment_failed`.
- **Frontend:** Two-Column Layout (60/40), Shipping Address + Method + Inline PaymentElement. `@stripe/stripe-js` + `@stripe/react-stripe-js`.
- **Phase C offen:** Apple Pay/Google Pay, Google Places, gespeicherte Adressen
- **Stripe Webhook Raw Body Fix (ROOT CAUSE):** Custom `rawBodyMiddleware` in `middlewares.ts`. NICHT entfernen — ohne es scheitern ALLE Webhooks.
- **Password Reset:** "Forgot password?" → Resend E-Mail → `/reset-password?token=...`

### 2026-03-11 — Catalog Visibility Redesign

- **Neue Logik:** Artikel mit mindestens 1 Bild = sichtbar. Preis bestimmt nur Kaufbarkeit (`is_purchasable`), nicht Sichtbarkeit.
- **"For Sale" Filter-Toggle:** "All Items" / "For Sale" Segmented Control
- **Geänderte Dateien:** `store/catalog/route.ts`, `store/catalog/[id]/route.ts`, `catalog/page.tsx`, `catalog/[id]/page.tsx`, `page.tsx`, `types/index.ts`

### 2026-03-10 — GitHub Releases + Sharing + Save for Later

- **GitHub Releases:** 9 historische Releases (v0.1.0–v0.9.0). Helper-Script `scripts/create-release.sh`.
- **ShareButton:** Hybrid Mobile/Desktop (native Share Sheet / 6-Option Dropdown: WhatsApp, X, Facebook, Telegram, Email, Copy Link)
- **Save for Later:** `saved_item` Medusa DML Model, Heart-Icon, Account-Seite `/account/saved`, Header-Badge
- **Dynamischer Release-Count:** Homepage Catalog-Teaser fetcht echten Count via `/store/catalog?limit=0`

### 2026-03-09 — ReleaseArtist-Bereinigung + Discogs Extraartists

- **Garbage Cleanup:** 60 Fake-Artists, 10.170 Garbage-Links entfernt, 10.765 behalten
- **Extraartists Import:** 16.590 Releases via Discogs API → `extraartists` → ReleaseArtist mit Rollen. `import_discogs_extraartists.py` (resumable, ~9h)
- **Discogs Prices & Links auf Storefront ausgeblendet:** `{/* HIDDEN: ... */}` Marker in 5 Dateien. Wiederherstellbar.
- **Admin User Fix:** `frank@vinyl-on-demand.com` — `app_metadata` manuell auf korrekte `user_id` gesetzt
- **Admin-Subdomain** `admin.vod-auctions.com` eingerichtet (nginx, SSL Let's Encrypt)
- **Pre-Launch Password Gate:** `middleware.ts`, `gate/page.tsx`, `api/gate/route.ts`. Passwort `vod2026`. Entfernen beim Launch: `middleware.ts` löschen + `layout.tsx` Cookie-Check entfernen.
- **Label Enrichment:** 7.002 Releases enriched, 2.829 neue Labels. `validate_labels.py` 3-Phasen-Pipeline. `label_enriched` schützt Labels vor `legacy_sync.py` Override.

### 2026-03-08 — Direct Purchase geöffnet + Image Ordering + CMS

- **Direct Purchase für alle User:** `hasWonAuction`-Gate entfernt. 13.571 Releases auf `sale_mode=direct_purchase` aktiviert.
- **Image Ordering Fix:** `rang` Spalte auf Image-Tabelle. `ORDER BY rang ASC, id ASC` in Catalog + Admin APIs. 4.593 Releases korrigiert.
- **CMS On-Demand Revalidation:** Backend CMS-Save → `POST /api/revalidate` auf Storefront
- **Google Search Console:** Domain `vod-auctions.com` verifiziert, Sitemap eingereicht
- **Catalog Filter Redesign:** 5 → 7 Kategorien (Tapes, Vinyl, CD, VHS + 3 Lit). Format-Subfilter.
- **Literature Image Regression Fix:** `bilder_typ` Mapping in `legacy_sync.py` korrigiert (label_lit 15→14, press_lit 14→12)

### 2026-03-07 — "Vinyl Groove" Design + CRM + Newsletter

- **Concept C "Vinyl Groove":** Gold Gradient Left-Border, DM Serif Display Headers, Tracklist Side A/B, CreditsTable Komponente
- **RSE-128-131,133,138:** Newsletter Opt-in, Brevo Templates (IDs 2-5), Brevo Webhook Handler, Datenschutz-Erweiterung, CRM Dashboard `/admin/customers`
- **Moreinfo Parser:** `fix_moreinfo_comprehensive.py` — 6 Format-Varianten. +463 Tracklists, +91 verbessert.
- **RSE-125/126/127: Brevo CRM Integration:** API Client `brevo.ts`, Event-Sync `crm-sync.ts` (5 Events), Batch-Import (3.580 tape-mag Kontakte)

### 2026-03-06 — Admin Lightbox + Data Quality + Checkout + Legal + Emails

- **Admin Detail Lightbox:** Fullscreen mit Prev/Next, Tastatur, Thumbnails
- **Catalog URL Persistence:** Filter/Sortierung/Pagination in URL-Query-Params
- **Data Quality Fix:** +3.437 band_lit Bilder. Tracklists (+774 repariert +332 neue). Credits (+1.736 vervollständigt).
- **RSE-77: Smoke-Test bestanden:** Backend online Port 9000, Storefront online Port 3006, SSL valid, Stripe Live-Mode gesetzt
- **RSE-78: Launch-Vorbereitung:** Cookie-Consent-Banner, Sentry Error-Tracking, Stripe Live-Keys deployed
- **RSE-117: CMS Content Management:** `content_block` Tabelle, TipTap Editor, 12 Content-Blocks geseeded
- **RSE-116: About VOD Records:** 9 Sektionen (Founder, Mission, Genres, Artists, Sub-Labels, TAPE-MAG, VOD Fest)
- **RSE-106: Google Analytics:** GA4 `G-M9BJGC5D69`, consent-gated, 7 Event-Tracking-Helpers
- **RSE-105: Legal Pages:** 5 Seiten (Impressum, AGB, Datenschutz, Widerruf, Cookies)
- **RSE-102: Transactional Emails:** 6 HTML-Templates, Resend, `noreply@vod-auctions.com`
- **RSE-103: Shipping Configuration:** 4 DB-Tabellen, Gewichtsbasiert, Admin 4-Tab-Seite

### 2026-03-05 — Direktkauf + Literature + Discogs + 5-Kategorie + UX

- **RSE-111: Direktkauf/Warenkorb:** `cart_item` Modell, Cart API, Combined Checkout, AuthProvider +cartCount. 31 Dateien.
- **Literature Migration:** Format-Tabelle (39 Einträge) + PressOrga (1.983) + 11.370 Lit-Items + ~4.686 Bilder
- **5-Kategorie Filter:** Tapes/Vinyl/Band-Lit/Label-Lit/Press-Lit via Format.typ/kat CASE SQL
- **RSE-115: Sync Dashboard:** `discogs_batch.py` PostgreSQL Rollback Fix. Batch Progress Card (live auto-refresh).
- **RSE-114: Credits Structured Rendering:** `parseCredits()` + `CreditsTable` Komponente
- **RSE-113: Inventory-Verwaltung:** `inventory` INTEGER Spalte
- **RSE-112: Visibility-System:** Ampel-Indikator, Visibility-Filter in Admin Media

### 2026-03-03 — RSE-87–96 (Translation, Article Numbers, Discogs, VPS)

- English Translation (alle UI-Texte auf Englisch)
- Article Numbers VOD-XXXXX (unique, visible in Details)
- Discogs Prices Low/Median/High (backfill abgeschlossen)
- Credits Cleanup (`cleanCredits()` utility)
- VPS Deployment (Backend Port 9000, Storefront Port 3006)
- Cronjobs: Legacy Sync täglich 04:00 UTC, Discogs wöchentlich (später täglich Mo-Fr)

### 2026-02-10 bis 2026-03-02 — Initialer Aufbau (RSE-72 bis RSE-85)

- **RSE-72:** Datenbank vorbereiten (Supabase Schema, RLS, Indexes)
- **RSE-73:** Admin-Panel (Medusa.js 2.x, Auction Blocks CRUD)
- **RSE-74:** Public Frontend (Next.js 16, Storefront)
- **RSE-75:** Bidding-Engine (Proxy-Bid, Supabase Realtime, Auction Lifecycle Cron)
- **RSE-76:** Stripe Payment Integration (Checkout Session, Webhook, Flat-Rate Versand)
- **RSE-83:** Medusa.js Projekt-Setup & Konfiguration
- **RSE-84:** UX Polish & Auktions-Workflow
- **RSE-85:** Storefront UX Redesign
- Legacy MySQL Migration: 12.451 Artists, 3.077 Labels, ~41.529 Releases, ~75.124 Images aus vodtapes DB
