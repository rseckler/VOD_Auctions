# VOD Auctions — Pre-Launch Konzept

**Version:** 1.0  
**Erstellt:** 2026-04-02  
**Status:** Konzept — zur Umsetzung freigegeben

---

## 1. Ziel & Strategie

Die Pre-Launch Phase schafft eine exklusive Frühzugangs-Community, bevor VOD Auctions öffentlich zugänglich ist. Statt eines harten Password-Gates (aktuell: `vod2026`) wird ein kuratierter Einladungsprozess etabliert, der:

- Erstanwender aus der bestehenden Tape-mag / VOD-Records-Community rekrutiert
- Exklusivitätsgefühl erzeugt (Bewerbung → Einladung → individueller Link)
- Qualifizierte frühe Nutzer selektiert (Sammler, keine Schaulustigen)
- Eine Warteliste aufbaut, die beim echten Launch sofort konvertiert

**Tonalität:** Nicht "Beta-Zugang für Tech-Enthusiasten", sondern "Der Katalog öffnet für ausgewählte Sammler." Die Zielgruppe ist Industrial-Music-Community — sie schätzt Kuration und ist skeptisch gegenüber Kommerzialisierung.

---

## 2. User Journey & Flow

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: Awareness                                         │
│  • E-Mail an Tape-mag-Liste (3.580 Kontakte, Brevo List 5) │
│  • E-Mail an VOD-Records-Bestandskunden                     │
│  • Social Media: Instagram, Discogs Forum, Facebook         │
│  → Ziel: vod-auctions.com/apply aufrufen                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: Bewerbung                                         │
│  Seite: /apply (öffentlich, kein Passwort)                  │
│  Felder: Name, E-Mail, Land, Genres, Kaufverhalten          │
│  → Status: pending (gespeichert in waitlist_applications)   │
│  → Bestätigung: "Wir prüfen deine Bewerbung"                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 3: Admin-Review (optional, Batch-Prozess)            │
│  Admin-Panel: /admin/waitlist                               │
│  • Liste aller Bewerbungen (pending/approved/invited)       │
│  • Einzel- oder Bulk-Approval                               │
│  • Wave-Zuweisung (Welle 1: tape-mag-Käufer, Welle 2: Rest) │
│  → Status: approved                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 4: Einladung versenden                               │
│  • System generiert einmaligen Invite-Token                  │
│  • Format: VOD-XXXXX-XXXXX (10 chars, Base62)               │
│  • Invite-E-Mail: "Dein Zugang ist bereit"                  │
│  • Link: vod-auctions.com/invite/[token]                    │
│  • Gültigkeit: 21 Tage                                      │
│  → Status: invited                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 5: Token-Einlösung                                   │
│  • User öffnet /invite/[token]                              │
│  • Validierung: gültig / abgelaufen / bereits genutzt       │
│  • Gültig → Registrierungsformular (E-Mail vorausgefüllt)   │
│  • Medusa-Account wird angelegt                             │
│  • Token wird als "used" markiert, Timestamp + IP           │
│  • Session-Cookie: vod_invite_session (umgeht den Gate)     │
│  → Status: registered                                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 6: Frühzugang                                        │
│  • User sieht vollen Katalog + aktive Auktionen             │
│  • Bieten, Merkliste, Direktkauf möglich                    │
│  • Feedback-Mechanismus (optional)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Segmentierung der Einladungswellen

| Welle | Zielgruppe | Quelle | Prozess | Timing |
|-------|-----------|--------|---------|--------|
| **Welle 0** | Interne Tester | Admin-Manuel | Direkteinladung ohne Apply | Sofort (RSE-77) |
| **Welle 1** | Tape-mag-Bestandskäufer | Brevo List 5 + Legacy DB | Direkteinladung (kein Apply-Schritt) | T+0 |
| **Welle 2** | Tape-mag-Newsletter-Abonnenten (keine Käufer) | Brevo List 5 | Apply-Bewerbung + Auto-Approval | T+7 Tage |
| **Welle 3** | Organisch (Social Media, Discogs-Forum) | /apply Seite | Apply-Bewerbung + Admin-Review | T+14 Tage |
| **Launch** | Alle | Öffentlich | Kein Gate mehr | T+X |

---

## 4. E-Mail-Kampagne

### Welle 1: Direkteinladung Tape-mag-Käufer

**Subject:** `[First name], your early access to VOD Auctions`  
**Preheader:** `41,500 rarities. Exclusive access for tape-mag collectors.`

```
Hi [First name],

you know us from Tape-mag — and now we're opening something new.

VOD Auctions is our own auction platform for 41,500 rare industrial 
releases from the VOD Records catalogue. No eBay fees, no Discogs 
commissions — just the catalogue and collectors like you.

You're one of the first to get access.

→ Register now: vod-auctions.com/invite/[TOKEN]

Your link is valid for 21 days and can only be used once.

Frank & Robin
VOD Records / VOD Auctions
```

**Timing:** Dienstag oder Mittwoch, 10:00 Uhr MEZ  
**Follow-up:** Nach 5 Tagen an Nicht-Öffner: gleicher Inhalt, neue Subject-Zeile

### Welle 2: Apply-Aufforderung Newsletter

**Subject:** `Tape-mag collectors: apply for early access to VOD Auctions`  
**Preheader:** `41,500 releases. 200 spots. Apply now.`

### Kampagnen-Sequenz

```
Tag 0:   E-Mail 1 (Einladung / Apply)
Tag 5:   E-Mail 2 (Follow-up an Nicht-Öffner)
Tag 12:  E-Mail 3 (Letzte Erinnerung: "Zugang läuft ab")
Tag 21:  Alle offenen Tokens laufen ab
```

### Social Media

| Kanal | Content | Timing |
|-------|---------|--------|
| **Instagram** | Teaser-Reel mit Cover-Fotos aus dem Katalog | T-3 Tage |
| **Instagram** | "Bewerbungen offen" + Link in Bio | T+0 |
| **Discogs Forum** | Thread: "VOD Records öffnet eigene Auktionsplattform" | T+0 |
| **Facebook** (VOD-Records-Seite) | Text-Post mit Link | T+1 |

---

## 5. Technische Architektur

### 5.1 Datenbank-Schema

```sql
-- Wartelisten-Bewerbungen
CREATE TABLE waitlist_applications (
  id            TEXT PRIMARY KEY DEFAULT gen_ulid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  country       TEXT,
  genres        TEXT[],             -- ['Industrial','EBM','Neofolk',...]
  buy_channels  TEXT[],             -- ['Discogs','eBay','Bandcamp',...]
  buy_volume    TEXT,               -- '1-10' / '10-50' / '50+'
  referrer_info TEXT,               -- Wie hast du uns gefunden?
  ref_code      TEXT UNIQUE,        -- Eigener Referral-Code (8 chars Base62)
  referred_by   TEXT,               -- ref_code des Einladers
  status        TEXT NOT NULL DEFAULT 'pending',
                                    -- pending/approved/invited/registered/rejected
  wave          INTEGER,            -- Einladungswelle 0-3
  source        TEXT,               -- 'tapemag_buyer'/'tapemag_list'/'organic'/'social'/'referral'
  admin_notes   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  approved_at   TIMESTAMPTZ,
  invited_at    TIMESTAMPTZ,
  registered_at TIMESTAMPTZ
);

-- Einladungs-Tokens
CREATE TABLE invite_tokens (
  id              TEXT PRIMARY KEY DEFAULT gen_ulid(),
  token           TEXT NOT NULL UNIQUE,       -- 10 chars Base62 (raw)
  token_display   TEXT NOT NULL UNIQUE,       -- 'VOD-XXXXX-XXXXX' (für E-Mail)
  application_id  TEXT REFERENCES waitlist_applications(id),
  email           TEXT NOT NULL,
  issued_by       TEXT DEFAULT 'system',      -- 'system' oder Admin-E-Mail
  issued_at       TIMESTAMPTZ DEFAULT now(),
  expires_at      TIMESTAMPTZ,                -- NULL = kein Ablauf
  used_at         TIMESTAMPTZ,
  used_ip         TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
                                              -- active/used/expired/revoked
  CONSTRAINT valid_status CHECK (status IN ('active','used','expired','revoked'))
);

-- Token-Zugriffslog (Sicherheit)
CREATE TABLE invite_token_attempts (
  id           BIGSERIAL PRIMARY KEY,
  token        TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  result       TEXT NOT NULL,  -- 'success'/'already_used'/'expired'/'invalid'
  attempted_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON invite_tokens(token);
CREATE INDEX ON invite_tokens(email);
CREATE INDEX ON invite_tokens(status);
CREATE INDEX ON invite_token_attempts(token);
CREATE INDEX ON invite_token_attempts(attempted_at);
```

### 5.2 Token-Generierung

```typescript
// backend/src/lib/invite.ts
import crypto from 'crypto'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export function generateRawToken(length = 10): string {
  const bytes = crypto.randomBytes(length * 2)
  let result = ''
  for (let i = 0; i < bytes.length && result.length < length; i++) {
    const idx = bytes[i] % 62
    result += BASE62[idx]
  }
  return result.toUpperCase()
}

export function formatToken(raw: string): string {
  return `VOD-${raw.slice(0, 5)}-${raw.slice(5, 10)}`
}
// Result: VOD-A7K2P-X9RQM
```

**Sicherheit:** 10 Zeichen Base62 = 62^10 ≈ 8,4 × 10^17 Kombinationen → Brute-Force nicht praktikabel.  
Rate-Limiting: max. 10 Versuche pro IP pro Minute auf `/invite/[token]`.

### 5.3 Frontend-Routen

| Route | Sichtbarkeit | Funktion |
|-------|-------------|---------|
| `/apply` | Öffentlich (kein Gate) | Bewerbungsformular |
| `/apply/confirm` | Öffentlich | Bestätigungsseite nach Formular-Submit |
| `/invite/[token]` | Öffentlich (kein Gate) | Token-Einlösung + Registrierung |
| `/invite/invalid` | Öffentlich | Fehler: ungültig/abgelaufen/genutzt |

### 5.4 Backend-Routen

| Route | Methode | Funktion |
|-------|---------|---------|
| `POST /store/waitlist/apply` | POST | Bewerbung einreichen |
| `GET /store/invite/[token]` | GET | Token-Status prüfen (öffentlich) |
| `POST /store/invite/redeem` | POST | Token einlösen → Account anlegen |
| `GET /admin/waitlist` | GET | Bewerbungsliste (paginiert, filter) |
| `PATCH /admin/waitlist/:id` | PATCH | Status ändern (approve/reject) |
| `POST /admin/waitlist/bulk-invite` | POST | Bulk-Einladungen versenden |
| `GET /admin/invite-tokens` | GET | Token-Übersicht |
| `PATCH /admin/invite-tokens/:id/revoke` | PATCH | Token widerrufen |

### 5.5 Middleware-Integration

Die bestehende `middleware.ts` prüft aktuell nur das Passwort-Cookie. Erweiterung:

```typescript
// middleware.ts (Erweiterung)
// Bestehende Logik bleibt — zusätzlich:
// Wenn platform_mode === 'pre_launch' UND keine gültige Passwort-Session:
//   → Prüfe auf vod_invite_session Cookie (gesetzt beim Token-Einlösen)
//   → Wenn vorhanden und gültig: Durchlass
//   → Wenn nicht vorhanden: → /apply weiterleiten (statt /gate)
```

**Session-Cookie beim Token-Einlösen:**
```typescript
// Nach erfolgreichem Redeem:
response.cookies.set('vod_invite_session', signedSessionId, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365, // 1 Jahr
  path: '/',
})
```

### 5.6 Admin-Panel: /admin/waitlist

Neue Admin-Route mit:
- **Übersicht:** Tabelle aller Bewerbungen (Status-Filter, Suche, Sortierung)
- **Stats-Header:** Pending / Approved / Invited / Registered / Rejection-Rate
- **Aktionen:** Einzel-Approve, Einzel-Reject, Bulk-Approve + Invite, CSV-Export
- **Token-Tab:** Alle ausgegebenen Tokens mit Status und Nutzungsdaten
- **Wave-Steuerung:** Welle 1/2/3 mit Versand-Button

---

## 6. Landing Page `/apply` — Konzept

### Inhalt

```
[VOD Auctions Logo]

Early Access for Collectors

41,500 rare industrial releases. Our own platform.
No eBay fees. No Discogs commissions.

[Wartelisten-Zähler: "3,200 collectors in the queue"]

─────────────────────────────────

Apply for access:

Name *
Email *
Country *
What do you primarily collect? (checkboxes)
  ☐ Industrial / Power Electronics
  ☐ EBM / Synth
  ☐ Neofolk / Dark Folk
  ☐ Dark Ambient / Drone
  ☐ Post-Punk / Goth
  ☐ Other

Where do you usually buy? (checkboxes)
  ☐ Discogs  ☐ eBay  ☐ Bandcamp  ☐ Record Fairs  ☐ Other

How did you hear about us?
[Free text — optional]

[Apply now →]

─────────────────────────────────

Already have an invite?
[I have an invite link →]
```

### Design

- Gleiche "Vinyl Culture" Ästhetik: DM Serif Display, Gold #d4a54a, Dark #1c1915
- Cover-Art-Collage aus dem Katalog als Hero-Hintergrund
- Mobile-first
- Kein Header-Nav (kein Zugang zum restlichen Katalog ohne Einladung)

---

## 7. E-Mail-Template: Einladung

Neues Template `invite-welcome.ts` mit:
- **Subject:** `[First name], your access to VOD Auctions is ready`
- **Preheader:** `Your personal invite link — valid for 21 days`
- Invite-Link prominent (Gold CTA-Button)
- Token lesbar angezeigt: `VOD-A7K2P-X9RQM`
- Ablaufdatum kommuniziert: "Valid until [date]"
- Hinweis: "This link is personal and can only be used once."

---

## 8. Implementierungsplan

### Phase A — Datenbank & Backend (Sprint 1)
- [ ] SQL: `waitlist_applications`, `invite_tokens`, `invite_token_attempts` anlegen
- [ ] `POST /store/waitlist/apply` — Bewerbung speichern
- [ ] `GET/POST /store/invite/[token]` — Token validieren + einlösen
- [ ] `GET/PATCH/POST /admin/waitlist` — Admin-Routes
- [ ] `lib/invite.ts` — Token-Generierung
- [ ] Rate-Limiting auf `/invite/[token]`

### Phase B — E-Mail-Templates (Sprint 1)
- [ ] `emails/invite-welcome.ts` — Einladungs-Mail
- [ ] `emails/waitlist-confirm.ts` — Bewerbungsbestätigung
- [ ] Admin-Template-Registration (beide in `/app/emails`)

### Phase C — Frontend (Sprint 2)
- [ ] `storefront/app/apply/page.tsx` — Bewerbungsformular
- [ ] `storefront/app/apply/confirm/page.tsx` — Bestätigung
- [ ] `storefront/app/invite/[token]/page.tsx` — Token-Einlösung + Registrierung
- [ ] `storefront/app/invite/invalid/page.tsx` — Fehlerseite
- [ ] Middleware-Erweiterung: `vod_invite_session` Cookie-Check

### Phase D — Admin-Panel (Sprint 2)
- [ ] `admin/routes/waitlist/page.tsx` — Bewerbungs-Management
- [ ] Bulk-Approve + Invite-Versand
- [ ] Token-Übersicht + Revoke
- [ ] Stats-Dashboard (Pending / Invited / Registered)

### Phase E — Kampagne (Sprint 3)
- [ ] Brevo: Tape-mag-Liste segmentieren (Käufer vs. Abonnenten)
- [ ] E-Mail-Kampagnen aufsetzen (3 Waves à 2 Follow-ups)
- [ ] Social Media Posts vorbereiten

### Phase F — Integration Config-Panel
- [ ] Pre-Launch Mode im Config-Panel aktivierbar
- [ ] `platform_mode` steuert Middleware-Verhalten
- [ ] Deaktivierung nach Launch (ausgegraut)

---

## 9. Linear-Tickets (zu erstellen)

| Ticket | Titel | Priorität |
|--------|-------|-----------|
| RSE-XXX | Pre-Launch: DB Schema (waitlist + invite_tokens) | P0 |
| RSE-XXX | Pre-Launch: Backend API Routes | P0 |
| RSE-XXX | Pre-Launch: /apply Landing Page | P0 |
| RSE-XXX | Pre-Launch: /invite/[token] Redemption Page | P0 |
| RSE-XXX | Pre-Launch: Admin Waitlist Management | P1 |
| RSE-XXX | Pre-Launch: E-Mail Templates (invite + confirm) | P1 |
| RSE-XXX | Pre-Launch: Tape-mag Kampagne (Brevo) | P1 |
| RSE-XXX | Pre-Launch: Social Media Assets | P2 |

---

## 10. KPIs & Erfolgsmessung

| Metrik | Ziel |
|--------|------|
| E-Mail-Öffnungsrate (Welle 1) | > 30% |
| Click-to-Apply Rate | > 10% |
| Apply-to-Registered | > 60% |
| Registrierte Nutzer vor Launch | 200+ |
| Invite-Link-Nutzung innerhalb 21 Tage | > 70% |

---

## 11. Sicherheitsüberlegungen

- Tokens sind kryptografisch sicher (crypto.randomBytes, nicht Math.random)
- Undifferenzierte Fehlermeldungen (kein Unterschied zwischen invalid/used/expired)
- Rate-Limiting: 10 Versuche/IP/Minute auf `/invite/[token]`
- Alle Zugriffsversuche werden in `invite_token_attempts` geloggt
- HTTPS-only (keine HTTP-Fallback-Tokens in URLs)
- Token-Revokation über Admin-Panel jederzeit möglich
- Session-Cookie: httpOnly, Secure, SameSite=Lax

---

*Dieses Dokument wird mit der Implementierung fortlaufend aktualisiert.*  
*Verknüpfte Dokumente: `ADMIN_CONFIG_KONZEPT.md`, `CHANGELOG.md`*
