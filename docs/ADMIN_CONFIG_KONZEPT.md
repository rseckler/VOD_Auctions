# VOD Auctions — Admin Configuration Panel Konzept

**Version:** 1.0  
**Erstellt:** 2026-04-02  
**Status:** Konzept — zur Umsetzung freigegeben

---

## 1. Ziel

Ein zentrales Admin-Panel `/admin/config` (oder `/admin/site-settings`) mit strukturierten On/Off-Schaltern und Konfigurationswerten für alle plattformweiten Funktionen. Kein Deploy nötig für operative Entscheidungen.

**Kern-Prinzip:** Nur was sich zur Laufzeit ändern muss, kommt in die Config. Secrets bleiben in `.env`.

---

## 2. Plattform-Modi

Die wichtigste Konfigurationsdimension ist der aktuelle Betriebsmodus der Plattform:

| Modus | Beschreibung | Middleware-Verhalten |
|-------|-------------|---------------------|
| `pre_launch` | Nur Invited Users haben Zugang | Gate aktiv — nur mit Passwort oder `vod_invite_session` Cookie |
| `preview` | Ausgewählte User, breiter Kreis | Gate aktiv — Passwort ODER Invite-Cookie |
| `live` | Öffentlicher Launch | Gate deaktiviert — alle können zugreifen |
| `maintenance` | Temporäre Wartung | Alle geblockt, auch eingeloggte User |

**Anzeige im Admin:** Persistenter farbiger Badge im Admin-Header (immer sichtbar):

| Modus | Badge-Farbe | Icon |
|-------|------------|------|
| `pre_launch` | Gelb `#eab308` | 🔒 |
| `preview` | Blau `#3b82f6` | 👁 |
| `live` | Grün `#22c55e` | ✅ |
| `maintenance` | Rot `#ef4444` | 🔧 |

---

## 3. Konfigurationsstruktur (6 Sektionen)

### 3.1 General

| Einstellung | Typ | Default | Beschreibung |
|-------------|-----|---------|-------------|
| `catalog_visibility` | select: all/visible | `visible` | `visible` = nur Releases mit CoverImage; `all` = alle |
| `default_currency` | text | `EUR` | Wird in allen Preisanzeigen genutzt |
| `site_title` | text | `VOD Auctions` | Meta-Title |
| `contact_email` | text | `frank@vod-records.com` | Support-E-Mail |

### 3.2 Access / Launch ⚡

| Einstellung | Typ | Default | Beschreibung |
|-------------|-----|---------|-------------|
| `platform_mode` | select | `pre_launch` | Betriebsmodus (Haupt-Toggle) |
| `gate_password` | text (masked) | `vod2026` | Passwort für Password-Gate (nur bei pre_launch/preview aktiv) |
| `invite_mode_active` | boolean | `true` | Invite-Links als Zugangsalternative aktivieren |
| `apply_page_visible` | boolean | `true` | /apply Seite öffentlich zeigen |
| `waitlist_counter_visible` | boolean | `true` | Wartelisten-Zähler auf /apply anzeigen |

> ⚠️ **`platform_mode → live`** ist ein High-Risk-Toggle (Tier 3): Pre-Flight-Checklist + Typed Confirmation "GO LIVE"

### 3.3 Auction

| Einstellung | Typ | Default | Beschreibung |
|-------------|-----|---------|-------------|
| `auction_anti_snipe_minutes` | number | `5` | Anti-Sniping: verlängert Lot um X Min bei Gebot in letzten X Min |
| `auction_default_duration_hours` | number | `168` | Standard-Laufzeit neuer Auktionsblöcke (168h = 7 Tage) |
| `auction_stagger_interval_seconds` | number | `120` | Standard-Stagger-Abstand zwischen Lots (2 Min) |
| `auction_direct_purchase_enabled` | boolean | `true` | Direktkauf-Funktion global aktivieren |
| `auction_reserve_price_visible` | boolean | `false` | Reservepreis für Bieter sichtbar? |
| `bid_ending_reminders_enabled` | boolean | `true` | 24h/8h/1h/5m Reminder-E-Mails aktivieren |

### 3.4 Payments

| Einstellung | Typ | Default | Beschreibung |
|-------------|-----|---------|-------------|
| `stripe_enabled` | boolean | `true` | Stripe als Zahlungsanbieter |
| `paypal_enabled` | boolean | `true` | PayPal als Zahlungsanbieter |
| `payment_deadline_days` | number | `5` | Tage bis zur automatischen Stornierung |

> Hinweis: API-Keys bleiben immer in `.env`, nie in der DB-Config.

### 3.5 Email

| Einstellung | Typ | Default | Beschreibung |
|-------------|-----|---------|-------------|
| `email_welcome_enabled` | boolean | `true` | Welcome-Mail bei Registrierung |
| `email_outbid_enabled` | boolean | `true` | Outbid-Alert |
| `email_bid_ending_enabled` | boolean | `true` | Bid-Ending-Reminder (24h/8h/1h/5m) |
| `email_feedback_request_enabled` | boolean | `true` | Feedback-Request 5 Tage nach Versand |
| `newsletter_double_optin` | boolean | `true` | Double-Opt-In für Newsletter |

### 3.6 Integrations

| Einstellung | Typ | Default | Beschreibung |
|-------------|-----|---------|-------------|
| `discogs_sync_enabled` | boolean | `true` | Discogs Daily Sync (Mo-Fr) |
| `rudderstack_enabled` | boolean | `true` | Analytics/Tracking |
| `sentry_enabled` | boolean | `true` | Error-Tracking via Sentry |
| `brevo_sync_enabled` | boolean | `true` | CRM-Sync zu Brevo |

---

## 4. Datenbankschema

### 4.1 Erweiterung `site_config`

Die bestehende `site_config`-Tabelle wird um dedizierte Spalten erweitert (statt JSONB-Blob). Klare Typen sind einfacher zu validieren.

```sql
-- Bestehende Tabelle erweitern
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS platform_mode TEXT DEFAULT 'pre_launch';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS gate_password TEXT DEFAULT 'vod2026';
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS invite_mode_active BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS apply_page_visible BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS waitlist_counter_visible BOOLEAN DEFAULT true;

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS auction_anti_snipe_minutes INTEGER DEFAULT 5;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS auction_default_duration_hours INTEGER DEFAULT 168;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS auction_stagger_interval_seconds INTEGER DEFAULT 120;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS auction_direct_purchase_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS auction_reserve_price_visible BOOLEAN DEFAULT false;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS bid_ending_reminders_enabled BOOLEAN DEFAULT true;

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS stripe_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS paypal_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS payment_deadline_days INTEGER DEFAULT 5;

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS email_welcome_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS email_outbid_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS email_bid_ending_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS email_feedback_request_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS newsletter_double_optin BOOLEAN DEFAULT true;

ALTER TABLE site_config ADD COLUMN IF NOT EXISTS discogs_sync_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS rudderstack_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS sentry_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_config ADD COLUMN IF NOT EXISTS brevo_sync_enabled BOOLEAN DEFAULT true;
```

### 4.2 Config Audit Log

```sql
CREATE TABLE config_audit_log (
  id          TEXT PRIMARY KEY DEFAULT gen_ulid(),
  config_key  TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  admin_email TEXT NOT NULL,
  changed_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON config_audit_log(changed_at DESC);
CREATE INDEX ON config_audit_log(config_key);
```

Jede Änderung über das Config-Panel schreibt automatisch einen Audit-Log-Eintrag.

### 4.3 Caching (Upstash Redis)

Die Config wird auf Redis gecacht, um DB-Calls bei jedem Request zu vermeiden:

```typescript
// lib/site-config.ts
const CACHE_KEY = 'site_config:v1'
const CACHE_TTL = 300 // 5 Minuten

export async function getSiteConfig(): Promise<SiteConfig> {
  // 1. Check Redis
  const cached = await redis.get(CACHE_KEY)
  if (cached) return JSON.parse(cached)

  // 2. Fallback: DB
  const config = await pgConnection('site_config').first()
  await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(config))
  return config
}

export async function updateSiteConfig(
  key: string,
  value: unknown,
  adminEmail: string
): Promise<void> {
  const old = await getSiteConfig()
  await pgConnection('site_config').update({ [key]: value, updated_at: new Date() })
  
  // Audit log
  await pgConnection('config_audit_log').insert({
    id: generateEntityId(),
    config_key: key,
    old_value: JSON.stringify({ [key]: old[key as keyof SiteConfig] }),
    new_value: JSON.stringify({ [key]: value }),
    admin_email: adminEmail,
  })
  
  // Cache invalidieren
  await redis.del(CACHE_KEY)
}
```

---

## 5. API-Routen

```
GET    /admin/site-config           → Aktuelle Config + letzten 20 Audit-Logs
PATCH  /admin/site-config           → Einzelne oder mehrere Keys updaten
GET    /admin/site-config/audit-log → Vollständiger Audit-Log (paginiert)
POST   /admin/site-config/go-live   → Spezial-Route für platform_mode → live (mit Checklist)
```

---

## 6. UI-Design

### 6.1 Struktur

```
/admin/config
  ├── [Header] Platform Status Badge (immer sichtbar)
  │
  ├── [Tab: General]
  │   └── Inline-editierbare Felder, Save-Button
  │
  ├── [Tab: Access / Launch]  ← Pre-Launch Controls
  │   ├── Platform Mode Selector (Dropdown mit Warnung bei 'live')
  │   ├── Gate Password (masked input)
  │   ├── Invite Mode Toggle
  │   ├── Apply Page Toggle
  │   └── [GO LIVE Button] → Pre-Flight-Checklist Modal
  │
  ├── [Tab: Auction]
  │   └── Number inputs + Toggles
  │
  ├── [Tab: Payments]
  │   └── Toggles mit Status-Anzeige (Stripe/PayPal connected ✓)
  │
  ├── [Tab: Email]
  │   └── Toggles pro E-Mail-Typ
  │
  ├── [Tab: Integrations]
  │   └── Toggles + Last-Sync-Timestamp
  │
  └── [Tab: Change History]
      └── Audit-Log Tabelle (key, old, new, who, when)
```

### 6.2 Toggle-Risiko-Stufen

**Tier 1 — Low Risk** (alle Standard-Einstellungen):
- Inline-Toggle
- Auto-Save mit debounce (500ms)
- Toast "Gespeichert ✓"

**Tier 2 — Medium Risk** (z.B. `auction_direct_purchase_enabled` deaktivieren):
- Toggle öffnet Bestätigungs-Dialog
- "Diese Änderung betrifft alle aktiven Kunden. Bestätigen?"
- Cancel + Bestätigen

**Tier 3 — High Risk: `platform_mode → live`**:
- Eigene Seite (nicht Modal): **Pre-Flight-Checklist**

```
Bevor du live gehst — Checkliste:

  ✅ Versandmethoden konfiguriert
  ✅ Stripe Webhook aktiv (Live-Mode)
  ✅ PayPal Webhook aktiv (Live-Mode)
  ⚠️ Mindestens 1 aktiver Auktionsblock?  ← dynamisch geprüft
  ✅ AGB / Impressum / Datenschutz veröffentlicht
  ✅ Support-E-Mail konfiguriert

Zum Bestätigen "GO LIVE" eintippen:
[ __________________ ]

[Abbrechen]   [🚀 Passwort-Gate entfernen & Live gehen]
```

Nach "Go Live":
- `platform_mode` → `live`
- `middleware.ts`-Gate wird deaktiviert
- E-Mail an `frank@vod-records.com`: "VOD Auctions ist jetzt öffentlich"
- Admin-Badge wechselt auf Grün "LIVE"

---

## 7. Implementierungsplan

### Sprint 1 — Foundation
- [ ] Supabase SQL: `site_config` ALTER TABLE + `config_audit_log` anlegen
- [ ] `lib/site-config.ts` — getSiteConfig() + updateSiteConfig() mit Redis-Cache
- [ ] `GET/PATCH /admin/site-config` Routes
- [ ] Middleware: `platform_mode` aus `site_config` lesen (statt hardcoded env)

### Sprint 2 — Admin UI
- [ ] `admin/routes/config/page.tsx` — Tab-Navigation + alle 6 Sektionen
- [ ] Platform Mode Badge im Admin-Header (via `useAdminNav` oder Layout)
- [ ] Tier-1/2/3-Toggle-UX-Komponenten
- [ ] Pre-Flight-Checklist für "Go Live"
- [ ] Change History Tab (Audit-Log)

### Sprint 3 — Pre-Launch Integration
- [ ] "Access / Launch" Tab mit Pre-Launch Controls
- [ ] Pre-Launch Mode: aktiviert `/apply`-Seite + Invite-System
- [ ] Deaktivierung nach Launch (Felder ausgegraut mit Tooltip "Nicht mehr aktiv")

---

## 8. Linear-Tickets (zu erstellen)

| Ticket | Titel | Priorität |
|--------|-------|-----------|
| RSE-XXX | Config: DB Schema (site_config + audit_log) | P0 |
| RSE-XXX | Config: lib/site-config.ts mit Redis-Cache | P0 |
| RSE-XXX | Config: Admin-Routes GET/PATCH | P0 |
| RSE-XXX | Config: Middleware liest platform_mode aus DB | P0 |
| RSE-XXX | Config: Admin UI (6 Tabs, alle Toggles) | P1 |
| RSE-XXX | Config: Go-Live Pre-Flight-Checklist | P1 |
| RSE-XXX | Config: Platform Mode Badge im Admin-Header | P1 |
| RSE-XXX | Config: Change History / Audit-Log Tab | P2 |

---

## 9. Beziehung Pre-Launch ↔ Config-Panel

```
Config-Panel "Access / Launch" Tab
        │
        ├── platform_mode = 'pre_launch'
        │       → Middleware aktiviert Gate
        │       → /apply Seite sichtbar
        │       → Invite-System aktiv
        │
        ├── platform_mode = 'preview'  
        │       → Gate aktiv, breiter Invite-Kreis
        │
        └── platform_mode = 'live'
                → Gate weg, öffentlich
                → "Access / Launch" Tab wird ausgegraut
                  mit Hinweis: "Launch abgeschlossen ✓"
                  (Pre-Launch-Felder read-only, nicht löschbar)
```

Nach dem Launch:
- Tab bleibt sichtbar (historisch nachvollziehbar)
- Alle Pre-Launch-Felder: disabled + grau + Tooltip "Pre-Launch abgeschlossen"
- `platform_mode` nicht mehr änderbar (rückwärts zu `pre_launch` nicht erlaubt)

---

## 10. Secrets-Grenze (absolut)

Diese Werte kommen **niemals** in `site_config` oder das Config-Panel:

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`
- `RESEND_API_KEY`
- `BREVO_API_KEY`
- `ANTHROPIC_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`

Diese bleiben immer in `.env` auf dem VPS und in den Umgebungsvariablen.

---

*Dieses Dokument wird mit der Implementierung fortlaufend aktualisiert.*  
*Verknüpfte Dokumente: `PRE_LAUNCH_KONZEPT.md`, `CHANGELOG.md`*
