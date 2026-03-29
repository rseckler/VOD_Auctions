# User Management Backend — Konzept & Architektur

**Projekt:** VOD Auctions Admin Backoffice
**Bereich:** CRM → User Management
**Status:** Konzept (P1 teilweise implementiert)
**Stand:** 2026-03-29

---

## 1. Übersicht & Ziele

Ein professionelles User-Management-Backend ermöglicht dem Shop-Betreiber, Kundendaten vollständig zu verwalten, Probleme zu lösen und die Kundenbeziehung aktiv zu steuern — ohne direkten Datenbank-Zugriff.

**Referenzstandards:**
- **Shopify Customer Admin** — Stammdaten bearbeiten, Tags, Notizen, Timeline, Metafelder
- **eBay Seller Hub** — Käufer-Kommunikation, Transaktionshistorie, Sperr-/Freigabe-Mechanismen
- **Catawiki Backoffice** — Bieter-Verwaltung, Verifizierungsstatus, Bid-History pro Kunde

**Ziele:**
1. Kundendaten direkt im Admin korrigieren (z. B. Tippfehler in Adresse, E-Mail-Änderung)
2. Manuelle Tags & VIP-Status setzen (unabhängig von automatischen Regeln)
3. Notizen für interne Kommunikation
4. Volle Aktivitäts-Timeline (Bids, Käufe, Logins, E-Mails)
5. Sicherheits-Aktionen: Passwort-Reset-Mail senden, Account sperren/entsperren
6. DSGVO-Compliance: Daten anonymisieren / exportieren
7. Brevo-Sync: CRM-Status direkt aus Admin steuern

---

## 2. Aktueller Stand (P1 — Implementiert)

### Datenbank
- **`customer` (Medusa):** id, email, first_name, last_name, phone, created_at, deleted_at
- **`customer_stats`:** total_spent, total_purchases, total_bids, total_wins, last_purchase_at, first_purchase_at, last_bid_at, tags TEXT[], is_vip, is_dormant, updated_at
- **`customer_address` (Medusa):** Shipping-Adressen

### Admin UI (`/app/crm`)
- Paginated Customer-Liste mit Search (Name/E-Mail/Telefon)
- Customer Detail Drawer: Overview, Orders, Bids Tabs
- GDPR Export Button (→ `GET /store/account/gdpr-export`)
- VIP-Badge, Dormant-Badge (read-only)

### API-Endpunkte
- `GET /admin/customers/list` — Liste mit Stats, Search, Sort, Pagination
- `GET /admin/customers/:id` — Detail mit Orders + Bids + Addresses

---

## 3. Funktionskatalog

### P1 — Stammdaten bearbeiten (Kritisch)

| Feature | Beschreibung | Endpunkt |
|---------|-------------|----------|
| Name bearbeiten | first_name, last_name ändern | `PATCH /admin/customers/:id` |
| E-Mail ändern | Neue E-Mail inkl. Uniqueness-Check | `PATCH /admin/customers/:id` |
| Telefon ändern | phone-Feld | `PATCH /admin/customers/:id` |
| Adresse bearbeiten | Shipping-Adressen editieren/löschen | `PATCH /admin/customer-addresses/:id` |
| Passwort-Reset-Mail | Trigger Medusa password-reset-flow | `POST /admin/customers/:id/password-reset` |

**UI:** Edit-Button im Detail-Drawer öffnet Inline-Form (nicht neues Modal). Felder: Vorname, Nachname, E-Mail, Telefon. Save/Cancel Buttons. Validierung client-seitig (leere Felder, E-Mail-Format).

### P1 — Tags & Klassifizierung

| Feature | Beschreibung |
|---------|-------------|
| Tags anzeigen | Bestehende `customer_stats.tags` als Chips |
| Tag hinzufügen | Dropdown mit Vorschlägen + Freitext |
| Tag entfernen | × auf Tag-Chip |
| VIP manuell setzen | Override `is_vip` unabhängig vom €500-Schwellwert |
| Dormant manuell setzen | Override `is_dormant` |

**Standard-Tags (Vorschläge):**
- `vip`, `dormant`, `trusted_bidder`, `problematic`, `wholesale`, `press`, `collector`
- `high_value`, `new_customer`, `repeat_customer`, `newsletter_subscriber`

**API:** `PATCH /admin/customers/:id` mit `{ tags, is_vip, is_dormant }`

### P1 — Interne Notizen

| Feature | Beschreibung |
|---------|-------------|
| Notiz anlegen | Freitext, gespeichert in `customer_note` Tabelle |
| Notiz anzeigen | Chronologisch, mit Admin-Author + Timestamp |
| Notiz löschen | Soft-delete |

**Neue Tabelle:** `customer_note`
```sql
CREATE TABLE customer_note (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id),
  body TEXT NOT NULL,
  author_email TEXT NOT NULL,  -- Admin-User der die Notiz erstellt hat
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
```

**API:** `GET /admin/customers/:id/notes`, `POST /admin/customers/:id/notes`, `DELETE /admin/customers/:id/notes/:noteId`

### P2 — Aktivitäts-Timeline

Eine chronologische Zusammenfassung aller Kundenereignisse in einem Feed:

| Event-Typ | Quelle | Anzeige |
|-----------|--------|---------|
| Account erstellt | `customer.created_at` | "Konto angelegt" |
| Bid abgegeben | `bid` Tabelle | "Gebot €X auf [Release]" |
| Auktion gewonnen | `bid.is_winning` | "Auktion gewonnen: [Release]" |
| Kauf abgeschlossen | `transaction.status=paid` | "Zahlung €X — [Release]" |
| Versand | `transaction.fulfillment_status=shipped` | "Paket versendet (VOD-ORD-XXXXXX)" |
| Notiz hinzugefügt | `customer_note` | "[Admin]: [Notiz-Text]" |
| Tag gesetzt | Audit-Log | "Tag 'vip' gesetzt" |
| GDPR-Export | API-Log | "Datenexport angefordert" |
| Passwort-Reset | Auth-Log | "Passwort-Reset-Mail gesendet" |

**Implementation:** Zusammengeführter Query aus bid, transaction, customer_note. Chronologisch sortiert. Max. 100 Events.

**API:** `GET /admin/customers/:id/timeline`

**UI:** Neuer Tab "Timeline" im Detail-Drawer. Event-Cards mit Icon, Timestamp, Beschreibung.

### P2 — Account-Sicherheit & -Status

| Feature | Beschreibung | Technisch |
|---------|-------------|-----------|
| Account sperren | Kein Login möglich | `customer.deleted_at = NOW()` (Medusa soft-delete) |
| Account entsperren | Zugang wiederherstellen | `customer.deleted_at = NULL` |
| Passwort-Reset senden | Reset-Mail via Resend | Medusa Auth-Provider Reset-Flow |
| Login-History | Letzte Logins anzeigen | *(P3 — erfordert Auth-Middleware-Logging)* |

**Wichtig:** Medusa's `customer.deleted_at` sperrt tatsächlich den Login. Keine eigene `is_blocked`-Spalte nötig.

**API:** `POST /admin/customers/:id/block`, `POST /admin/customers/:id/unblock`

**UI:** Im Overview-Tab ein "Account sperren" / "Entsperren" Button mit Confirm-Dialog.

### P2 — Brevo CRM-Sync

| Feature | Beschreibung |
|---------|-------------|
| Brevo-Status anzeigen | Ist der Kunde in Brevo-Liste 4 (VOD)? |
| Manuell zu Brevo hinzufügen | `POST /admin/customers/:id/brevo-sync` |
| Newsletter Opt-out | Aus Brevo-Liste entfernen |
| Letzte Brevo-E-Mail | Welche transaktionale Mail zuletzt gesendet? |

**Datenbank:** `customer_stats` um `brevo_contact_id TEXT, brevo_synced_at TIMESTAMPTZ` ergänzen (bereits teilweise vorhanden via `crm-sync.ts`)

### P3 — Erweiterte Features

| Feature | Priorität | Beschreibung |
|---------|-----------|-------------|
| Merge-Accounts | P3 | Zwei Kunden-Accounts zusammenführen (z. B. Duplikate) |
| Manueller Kauf erstellen | P3 | Offline-Kauf für Stammkunden anlegen |
| Rabatt-Code zuweisen | P3 | Persönlichen Promo-Code für Kunden generieren |
| Login-History | P3 | Letzte N Logins mit IP/Timestamp |
| Kunden-Segment-Export | P3 | Gefilterte Kundenliste als CSV |
| Suspicion-Score | P3 | Automatische Risikowarnung (viele Bids + 0 Käufe etc.) |

---

## 4. Datenbankänderungen

### Neue Tabelle: `customer_note`
```sql
CREATE TABLE customer_note (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  body TEXT NOT NULL,
  author_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customer(id)
);
CREATE INDEX idx_customer_note_customer_id ON customer_note(customer_id);
```

### Erweiterung: `customer_stats`
```sql
ALTER TABLE customer_stats
  ADD COLUMN IF NOT EXISTS brevo_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS brevo_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS internal_note TEXT,  -- Deprecated nach customer_note Migration
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
```

### Neue Tabelle: `customer_audit_log` (P2)
```sql
CREATE TABLE customer_audit_log (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  action TEXT NOT NULL,        -- 'tag_added', 'vip_set', 'blocked', 'note_added', etc.
  details JSONB,               -- { "tag": "vip", "prev_value": false, "new_value": true }
  admin_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 5. API-Endpunkte (Gesamt)

### Bestehend (P1 — Read-Only)
```
GET  /admin/customers/list                    # Liste mit Stats
GET  /admin/customers/:id                     # Detail
```

### Neu P1 — Stammdaten & Tags
```
PATCH /admin/customers/:id                    # Edit: name, email, phone, tags, is_vip, is_dormant
POST  /admin/customers/:id/password-reset     # Trigger Reset-Mail
```

### Neu P1 — Notizen
```
GET    /admin/customers/:id/notes             # Alle Notizen
POST   /admin/customers/:id/notes             # Notiz erstellen
DELETE /admin/customers/:id/notes/:noteId     # Notiz löschen
```

### Neu P2 — Timeline & Sicherheit
```
GET  /admin/customers/:id/timeline            # Aktivitäts-Feed
POST /admin/customers/:id/block               # Account sperren
POST /admin/customers/:id/unblock             # Account entsperren
POST /admin/customers/:id/brevo-sync          # Manueller Brevo-Push
```

---

## 6. UI-Konzept: Customer Detail Drawer

### Aktuell: 3 Tabs (Overview, Orders, Bids)

### Ziel: 5 Tabs (Overview, Orders, Bids, Notes, Timeline)

**Tab 1: Overview**
```
┌─────────────────────────────────────────────────────────┐
│  Max Mustermann                          [Edit] [Block]  │
│  max@example.com · +49 123 456789                        │
│  Kunde seit: 15.01.2026                                   │
├─────────────────────────────────────────────────────────┤
│  STATS                                                    │
│  €1.240 ausgegeben  ·  8 Käufe  ·  23 Bids  ·  5 Wins   │
│  Letzter Kauf: 22.03.2026                                 │
├─────────────────────────────────────────────────────────┤
│  TAGS                                                     │
│  [vip ×] [trusted_bidder ×]  [+ Tag hinzufügen]          │
├─────────────────────────────────────────────────────────┤
│  BREVO                                                    │
│  ✓ In Liste "VOD Auctions" (seit 15.01.2026)             │
│  Letzte Mail: "bid-won" am 22.03.2026                    │
├─────────────────────────────────────────────────────────┤
│  ADRESSEN                                                 │
│  Hauptstraße 1, 12345 Berlin, DE  [Edit]                 │
└─────────────────────────────────────────────────────────┘
```

**Tab 4: Notes**
```
┌─────────────────────────────────────────────────────────┐
│  [+ Neue Notiz]                                          │
├─────────────────────────────────────────────────────────┤
│  admin@vod.de · 22.03.2026 14:32                        │
│  "Kunde bevorzugt Abholung in Wien. Hat nach Bundle-    │
│   Rabatt für 3+ Lots gefragt."                           │
│                                          [Löschen]       │
└─────────────────────────────────────────────────────────┘
```

**Tab 5: Timeline**
```
┌─────────────────────────────────────────────────────────┐
│  22.03.2026 14:00  💰 Zahlung €89.00 — VOD-ORD-004521  │
│  22.03.2026 13:45  🏆 Auktion gewonnen — Lot #7         │
│  22.03.2026 13:30  🔨 Gebot €85.00 auf Lot #7           │
│  22.03.2026 13:15  🔨 Gebot €72.00 auf Lot #7           │
│  20.03.2026 11:00  📦 Paket versendet (VOD-ORD-004120)  │
│  15.01.2026 09:00  👤 Konto angelegt                    │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Technische Implementierung

### Backend-Reihenfolge
1. `PATCH /admin/customers/:id` — Edit-Endpunkt (name, email, phone)
2. Tags CRUD via gleichem PATCH-Endpunkt
3. `POST/GET/DELETE /admin/customers/:id/notes` + DB-Migration
4. `POST /admin/customers/:id/password-reset` via Medusa Auth-Provider
5. `GET /admin/customers/:id/timeline` — aggregierter Query
6. Block/Unblock über `customer.deleted_at`

### Admin-UI-Erweiterungen (crm/page.tsx)
1. Edit-Form inline im Overview-Tab (useState für `isEditing`)
2. Tags-Section: Chip-Render + Input + Dropdown
3. Neuer Tab "Notes" in `CustomerDrawer`
4. Neuer Tab "Timeline" in `CustomerDrawer`
5. Block/Unblock Button mit Confirm-Dialog

### Knex-Hinweise
- `customer` Tabelle: Medusa ORM-Tabelle, direkte Knex-Updates möglich
- Bei E-Mail-Änderung: Uniqueness-Check vorher: `SELECT id FROM customer WHERE email = $1 AND id != $2`
- `customer_stats.tags`: PostgreSQL `TEXT[]` — Update: `knex.raw("UPDATE customer_stats SET tags = ? WHERE customer_id = ?", [JSON.stringify(tags), customerId])`

---

## 8. DSGVO-Compliance

| Anforderung | Status | Implementation |
|-------------|--------|---------------|
| Daten exportieren | ✅ Fertig | `GET /store/account/gdpr-export` (JSON-Download) |
| Admin-Export | 🔲 Todo | `GET /admin/customers/:id/gdpr-export` für Admin |
| Daten anonymisieren | 🔲 Todo P2 | `POST /admin/customers/:id/anonymize` — ersetzt PII durch "ANONYMIZED_[id]" |
| Konto löschen | 🔲 Todo P2 | Hard-Delete aller PII, Anonymisierung von Transaktions-Records |
| Consent-History | 🔲 Todo P3 | Log wann Einwilligung gegeben/widerrufen wurde |

**Anonymisierung-Logik:**
```sql
UPDATE customer SET
  email = 'deleted-' || id || '@vod-auctions.com',
  first_name = 'Gelöschter',
  last_name = 'Nutzer',
  phone = NULL,
  deleted_at = NOW()
WHERE id = $1;

UPDATE customer_address SET
  address_1 = 'ANONYMIZED', address_2 = NULL,
  city = 'ANONYMIZED', postal_code = 'ANONYMIZED',
  phone = NULL
WHERE customer_id = $1;
```

---

## 9. Umsetzungsplan

### Sprint 1 (P1 — 2-3 Stunden)
- [ ] `PATCH /admin/customers/:id` — Edit name/email/phone
- [ ] Edit-Form in CRM-Drawer (Overview-Tab)
- [ ] Tags CRUD (API + UI)
- [ ] VIP/Dormant manuell togglen

### Sprint 2 (P1 — 2-3 Stunden)
- [ ] DB-Migration: `customer_note` Tabelle
- [ ] Notes-API (GET/POST/DELETE)
- [ ] Notes-Tab in CustomerDrawer
- [ ] Password-Reset-Mail-Button

### Sprint 3 (P2 — 3-4 Stunden)
- [ ] Timeline-API (aggregierter Query)
- [ ] Timeline-Tab in CustomerDrawer
- [ ] Block/Unblock (via deleted_at)
- [ ] Brevo-Sync-Status anzeigen

### Sprint 4 (P2 — optional)
- [ ] DSGVO-Anonymisierung
- [ ] Audit-Log Tabelle + API
- [ ] Admin GDPR-Export

---

## 10. Offene Fragen

1. **E-Mail-Änderung mit Auth-Auswirkung:** Medusa speichert E-Mail auch im Auth-Provider (`auth_identity`). Bei Admin-seitigem E-Mail-Change: muss `auth_identity` ebenfalls aktualisiert werden, sonst Login-Konflikt. → Zu klären: Direkter Knex-Update auf beiden Tabellen oder Medusa-Auth-API verwenden?

2. **Passwort-Reset-Flow:** Medusa 2.x Auth-Provider-spezifisch. Mit `emailpass`-Provider: `POST /auth/customer/emailpass/reset-password` als Admin-Proxy. Test in Staging-Umgebung empfohlen.

3. **Account-Sperre Auswirkungen:** `customer.deleted_at` sperrt Login — aber laufende Sessions bleiben aktiv bis JWT-Expiry (~1h). Akzeptabel für Support-Use-Case?

4. **Tags-Synchronisierung mit Brevo:** Brevo-Kontakt-Attribute (`IS_VIP`, etc.) sollten bei Tag-Änderung im Admin automatisch synchronisiert werden. → `crm-sync.ts` um Update-Funktion erweitern.
