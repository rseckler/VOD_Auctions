# Phase B — Registration-Opening + Bestandskunden-Onboarding

**Workstream:** §14 Registrierung-Opening + Fortschritts-Newsletter (Phase B)
**Stand:** 2026-05-08
**Vorgänger:** Phase A live (rc53.14, Commit `2b267d3`) — Public `/newsletter`-Form + DSGVO-Checkboxes + Datenschutz §12
**Geschätzter Aufwand:** ~6h Code + 1-2h Frank-Briefing + 1h DSGVO-Final-Decision

---

## 1. Datengrundlage (Audit 2026-05-08, Production)

20.826 Master-Contacts gesamt (war im CLAUDE.md mit 14.450 dokumentiert — über Mail-Imports + Backfills auf 20.826 gewachsen). 12.995 davon mit Primary-Email (~62%).

### 1.1 Newsletter-Status

| Metrik | Wert | Quelle |
|---|---|---|
| Newsletter `opted_in=true` | **3.634** | `crm_master_communication_pref` |
| Newsletter `opted_in=false` (Unsub) | 0 | (rc53.4 Webhook noch keine Events) |
| Active in `newsletter_subscribers` | 3.567 | rc53.4 Backfill aus Brevo |
| Tag `newsletter_only` | 1.954 | Auto-Master via Webhook |
| Aktive Invite-Tokens | 1 | (Frank-Test) |
| Redeemed Invite-Tokens | 0 | — |
| Waitlist Applications | 1 | (Frank-Test) |
| Master-Contacts mit Medusa-Account | **0** | Noch keine echten User! |

### 1.2 Source-Verteilung (`crm_master_source_link`)

| Source | Master-Count | Bedeutung |
|---|---|---|
| `vod_records_db2013` | 7.905 | Hauptwebshop-Kunden 2013-heute |
| `mo_pdf` | 6.014 | Aus MonKey-Office-PDF-Rechnungen extrahiert (kein Email!) |
| `vodtapes_members` | **3.632** | tape-mag.com Member-DB ≈ Brevo-Liste 5 |
| `vod_records_db1` | 2.472 | Alter Webshop |
| `vod_records_db2013_alt` | 2.456 | Alt-Snapshot |
| `imap_*` | 275 | Aus IMAP-Mails extrahiert |

### 1.3 Tape-mag-Overlap

3.632 vodtapes_members (alle mit Email) vs. 3.567 active newsletter_subscribers:
- **Nur 482** Master sind in beiden → die historischen tape-mag-Newsletter-Subscriber, die auch im Member-DB sind
- Die anderen 3.085 newsletter_subscribers sind: 1.460 nur webshop, 337 in beiden, 2.029 weder noch (1.954 davon mit `newsletter_only`-Tag)

**Schlussfolgerung:** Brevo-Liste 5 enthält ~3.567 Newsletter-Subscriber mit DOI-Historie aus tape-mag.com Newsletter-Sendungen. Nur ~482 davon sind vodtapes-Member. Die meisten sind direkt-aus-Newsletter-Sign-up oder eben Webshop-Kunden mit Newsletter-Opt-in.

### 1.4 Segmentierung für Bestandskunden-Onboarding

| Tier | Master-Count | Profil | DSGVO-Status |
|---|---|---|---|
| **T1: Opt-in Newsletter** | **3.634** | Bestätigte Newsletter-Subscriber | ✅ **Direct Send OK** |
| **T2: Webshop-Kunde, ohne Newsletter** | 6.455 | vod-records-DB-Kunde mit Email, ohne Newsletter-Opt-in | ⚠️ **§7(3) UWG Bestandskundenwerbung möglich** (siehe §3) |
| **T3: Vodtapes-only-Legacy** | 2.737 | Tape-mag.com Member, kein Webshop-Kauf, kein Newsletter | ❌ **Cold — Re-Opt-In-DOI-Mail nötig** |
| T4: mo_pdf-only mit Email | 0 | (Invoice-Extracts haben keine Emails) | n/a |
| Top-Tier (Platinum+Gold) | 446 | High-Value-Customer | (überlappt mit T1+T2) |

---

## 2. DSGVO-Decision-Tree (Robin entscheidet)

### 2.1 Tier 1 — opted-in Newsletter (3.634)

**Entscheidung:** Newsletter-Versand direkt erlaubt. Kein zusätzliches Opt-in nötig.

Begründung: Art. 6 (1)(a) DSGVO — explizite Einwilligung über DOI-Flow oder Webhook-Backfill aus Brevo (rc53.4). Unsubscribe-Link in jedem Send (Brevo-Default + unser `newsletter-layout.ts` Footer).

### 2.2 Tier 2 — Webshop-Kunde ohne Newsletter (6.455)

**Drei Optionen:**

#### Option A — §7(3) UWG Bestandskundenwerbung („Direct Marketing to Existing Customers")

**Voraussetzungen:**
- (a) Email aus konkretem Verkauf: ✅ erfüllt (sind Bestandskunden)
- (b) Werbung für ähnliche Produkte: ✅ erfüllt (VOD Auctions = Music-Sales-Continuation von vod-records-Webshop)
- (c) Klarer Opt-out bei jedem Send: ✅ erfüllt (Brevo `{{ unsubscribe }}` in Layout)
- (d) Klare Opt-out-Info bei Erst-Erhebung der Email: ⚠️ **Ungeprüft** — bei tape-mag.com / vod-records-Webshop-Anmeldung war diese Info historisch vermutlich schwach

**Risiko:** Mittel — bei Beschwerde von Verbraucherzentrale könnte Tier 2 gekippt werden. Empfohlene Mitigation: Im Erst-Mail explizit auf §7(3)-Basis hinweisen + sehr prominenter Unsubscribe.

#### Option B — Re-Opt-In für T2 ebenfalls

Konservativste Wahl: Jeder T2-Kontakt bekommt erst eine Re-Opt-In-Mail (DOI-Style mit Bestätigungs-Link), erst nach Click landet er in der Subscriber-Liste.

**Konsequenz:** Conversion-Rate typisch 2-15% bei kalten Bestandskunden → 130-960 echte Newsletter-Subscriber von 6.455. Die anderen sind dann formal opted-out, aber legal sauber.

#### Option C — Hybrid-Strategie (Recommendation)

- **Top-Tier (Platinum/Gold, ~446 in T2) → Personalisierte Re-Opt-In-Mail** mit individuellem Tonfall (Frank schreibt Text, einmaliger Send)
- **Standard-Tier (~6.000 in T2) → §7(3)-UWG-Send** mit klarer Disclaimer-Zeile in der ersten Mail („Sie erhalten diese Mail, weil Sie früher bei vod-records.com bestellt haben. Sollten Sie keine Updates wünschen, klicken Sie hier zum Abmelden.")

**Aufwand:** +1 Email-Template `re-opt-in.ts`, +1 SQL-Pflicht-Migration für `re_opt_in_sent_at` Tracking-Spalte, +1 Background-Job für Send-Throttle.

### 2.3 Tier 3 — Vodtapes-only-Legacy (2.737)

**Entscheidung:** Re-Opt-In-DOI-Mail Pflicht. Tape-mag-Member-DB-Eintrag deckt rechtlich KEINE Newsletter-Einwilligung — diese Personen haben sich nur registriert, nicht zum Newsletter angemeldet.

**Variante:** Wir können dieses Tier mit einer „We're back as VOD Auctions"-Mail kontaktieren, die NICHT als Marketing zählt sondern als reine Service-Information („wir haben uns rebrandet, hier ist deine alte Member-Account-Info zum Schließen oder Reaktivieren") + klarer Newsletter-Opt-in-Button. Diese Mail sollte rechtlich grenzwertig OK sein als „letztmalige Information" — aber empfehlenswert ist auch hier Anwalts-Check.

### 2.4 Gewählter Pfad (Robin-Decision 2026-05-08)

```
T1 (3.634)  → Newsletter-Versand direkt (Art. 6 (1)(a) DSGVO, opted-in)
T2 (6.455)  → Aggressiv via §7(3) UWG mit klarem Bestandskunden-Disclaimer
T3 (2.737)  → Auch §7(3) UWG (max Reach, siehe Framing unten)
```

**Framing der Kommunikation (wichtig für Tonalität + Rechtsbasis):**

VOD ist die Dach-Marke mit drei Angeboten:
1. **VOD Records** — Webshop (bestehend)
2. **tape-mag.com** — Archive + Member-DB (bestehend, wird später ggf. unter VOD-Branding gezogen)
3. **VOD Auctions** — Auktionsplattform (NEU)

Die Newsletter-Kommunikation ist also KEIN Rebrand, sondern „VOD startet etwas Neues neben VOD Records und tape-mag". Das stärkt §7(3) UWG für alle drei Tiers, weil VOD bereits eine Kundenbeziehung mit allen Kontakten hat und VOD Auctions ein „ähnliches Produkt/ähnliche Dienstleistung" zu VOD Records (Musik-Verkauf) ist.

**Kern-Mail-Text-Skelett:**

> *"VOD Records und tape-mag.com kennst Du. Jetzt startet VOD Auctions — unsere neue Auktionsplattform für seltene Industrial-Music-Releases. Du bekommst diese Mail, weil Du bei [VOD Records bestellt / auf tape-mag registriert / unseren Newsletter abonniert] hast.*
>
> *Hier ist Dein Early-Access-Token: VOD-XXXXX-XXXXX. [Account anlegen] | [Mehr erfahren]*
>
> *Du möchtest keine VOD-Updates mehr? [Hier abmelden]"*

Per-Tier-Variation nur in der „Du bekommst diese Mail, weil…"-Zeile (drei Varianten via Template-Param).

**Anwalts-Check:** Optional, RSE-78 AGB-Anwalt kann zusätzlich Tier-2/3-Mailing-Disclaimer prüfen. Implementation startet vorher.

---

## 3. Code-Plan (Frontend + Backend)

### 3.1 Backend: Bulk-Invite Endpoint (NEU)

**Pfad:** `backend/src/api/admin/crm/contacts/bulk-invite/route.ts`

**Warum eigener Endpoint statt `/admin/crm/contacts/bulk` Action:** Email-Versand ist nicht idempotent in einer DB-Transaktion. Brauchen Job-Tracker (`background_job` Tabelle aus rc53.11) für Send-Status, Resume bei Crash, Per-Master-Result.

**Body:**
```ts
{
  master_ids: string[]      // max 1000 per call
  expires_days?: number      // default 21
  template?: 'invite-welcome' | 're-opt-in' | 'rebrand-info'
  custom_note?: string       // optional 1-line note from Frank
}
```

**Flow:**
1. Validate (max 1000 ids, expires_days range).
2. Create `background_job` row mit `kind='bulk_invite'`, `total=ids.length`.
3. Return 202 `{ job_id, total }` immediately.
4. Async loop:
   - Per master_id: lookup primary_email + display_name from `crm_master_contact`
   - Skip if no email or `is_blocked=true` → record skip in `bulk_invite_log` (neue Tabelle)
   - Generate token + `INSERT invite_tokens` mit `application_id=NULL`, `email=master.primary_email_lower`, `master_id=master_id` (NEUE Spalte!)
   - Send email via `sendBulkInviteEmailToMaster(pg, master_id, token, template)` (NEUE Helper-Funktion)
   - Update `background_job.processed`, `background_job.heartbeat_at`
   - Resend rate-limit: 100/sec → throttle via `await sleep(15)` zwischen Sends (~70/sec sicher unter Quota)
5. Mark `background_job.status='completed'`, `finished_at=NOW()`.

**Schema-Migrations:**
```sql
-- a) invite_tokens.master_id (Verknüpfung zu CRM-Master für nicht-waitlist-Tokens)
ALTER TABLE invite_tokens ADD COLUMN master_id text REFERENCES crm_master_contact(id);
CREATE INDEX idx_invite_tokens_master_id ON invite_tokens(master_id) WHERE master_id IS NOT NULL;

-- b) Re-Opt-In-Tracking (für Tier-2/3-Send-Status)
ALTER TABLE crm_master_contact ADD COLUMN re_opt_in_sent_at timestamptz;
CREATE INDEX idx_crm_master_re_opt_in_sent ON crm_master_contact(re_opt_in_sent_at)
  WHERE re_opt_in_sent_at IS NOT NULL;
```

### 3.2 Backend: Helper `sendBulkInviteEmailToMaster`

**Pfad:** `backend/src/lib/email-helpers.ts` (neue Funktion neben `sendInviteWelcomeEmail`)

Liest `crm_master_contact` direkt (nicht `waitlist_applications`), nimmt `display_name` als Anrede. Bei `template='re-opt-in'` wird `re_opt_in_sent_at = NOW()` gesetzt UND der Token-Link ist `/newsletter?token=...` (nicht `/invite/...`) — Re-Opt-In landet auf Newsletter-Sign-up-Form mit pre-filled Email.

### 3.3 Backend: Neue Email-Templates

- `backend/src/emails/re-opt-in.ts` — „Wir bauen VOD Auctions, willst Du Updates?" mit Re-Subscribe-Button → `/newsletter?prefill=<email>&via=re-opt-in`
- `backend/src/emails/invite-welcome-from-crm.ts` — Variante von `invite-welcome.ts` ohne Waitlist-Application-Bezug, mit Frank-handgeschriebener Anrede-Tonalität

### 3.4 Backend: `background_job`-Tabelle erweitern

`bulk_invite` als neuer Job-Kind im UI sichtbar machen (UI ist `/app/fb-archive` Phase-Cards). Optional: separate Page `/app/bulk-invite-monitor`. Reuse existing `JobTracker`-Helper.

### 3.5 Frontend: CRM-Bulk-Action „Send Invite"

**Datei:** `backend/src/admin/components/crm/contacts-tab.tsx`

In `BulkActionBar` (ab Zeile 1264) neuen Button:
```tsx
<button onClick={() => onAction("invite")} style={{ ...bulkBtnStyle(), color: C.gold }}>
  ✉ Send Invite
</button>
```

In `BulkActionModal` neuer Case:
```tsx
{action === "invite" && (
  <>
    <p>Send invite-tokens + welcome-emails to {ids.length} selected contacts.</p>
    <select value={template} onChange={...}>
      <option value="invite-welcome">Welcome (Direct Invite)</option>
      <option value="re-opt-in">Re-Opt-In (cold contacts)</option>
      <option value="rebrand-info">Rebrand Info (vodtapes legacy)</option>
    </select>
    <textarea placeholder="Optional 1-line note from Frank" />
    <Btn label={`Send ${ids.length} invites`} onClick={submit} />
  </>
)}
```

POST `/admin/crm/contacts/bulk-invite` mit `{ master_ids: ids, template, custom_note }`. Response zeigt Job-ID + Toast „Sending in background — see /app/operations/bulk-invite for progress".

### 3.6 Frontend: `/newsletter`-Page Re-Opt-In-Mode

**Datei:** `storefront/src/app/newsletter/page.tsx`

Erweiterung: `?prefill=<email>&via=re-opt-in` Query-Params lesen, Email-Field pre-filled (read-only optional), Hero-Text variabel:
```tsx
{via === 're-opt-in' ? (
  <>
    <h1>Welcome back</h1>
    <p>We're rebuilding what tape-mag started, as VOD Auctions. Confirm below to keep getting updates.</p>
  </>
) : ...}
```

DOI-Token in URL als zusätzlicher Sicherheits-Layer (HMAC, 14 Tage gültig statt 24h).

---

## 4. Test-Welle (10-20 Vertraute)

**Vor Bulk-Send:**
- Frank stellt 10-20 Personen-Liste zusammen (Stamm-Sammler, gute Freunde, Tester)
- Master-IDs aus `/app/crm` filtern oder direkt per Smart-List
- Bulk-Invite mit `template='invite-welcome'` (nicht Re-Opt-In)
- Frank reviewt Emails-Empfangen-Bestätigung in 24h, sammelt Feedback zu Storefront-UX

**Erfolgs-Kriterium:**
- ≥ 70% redeem-Rate in 7 Tagen
- Keine kritischen UX-Bugs gemeldet
- Newsletter-Confirm-Mail kommt in Inbox an (nicht Spam)

---

## 5. Reihenfolge der Implementierung

1. **DSGVO-Decision festziehen** (Robin, ohne Code) — Tier 2 + 3 Strategie wählen → bestimmt Template-Set
2. **Schema-Migrations** (~30 Min) — `invite_tokens.master_id` + `crm_master_contact.re_opt_in_sent_at`
3. **Backend-Helper + Templates** (~2h) — `sendBulkInviteEmailToMaster`, neue Templates, Re-Opt-In-Page-Mode
4. **Backend-Endpoint Bulk-Invite** (~2h) — `POST /admin/crm/contacts/bulk-invite` mit JobTracker
5. **Frontend Bulk-Action** (~1h) — Button + Modal in contacts-tab.tsx
6. **Storefront Re-Opt-In-Mode** (~30 Min) — Query-Param-Handling auf `/newsletter`
7. **Test-Welle** (Frank, asynchron 1-7 Tage) — 10-20 echte Sends, Feedback sammeln
8. **Tier-1 Production-Send** (Frank, nach Test-Welle-OK) — 3.634 Newsletter-Subscriber bekommen erste Fortschritts-Newsletter
9. **Tier-2 Re-Opt-In-Welle** (Frank, nach Tier-1-OK) — 6.455 Webshop-Kunden mit gewählter Strategie (Hybrid empfohlen)
10. **Tier-3 Re-Opt-In-Welle** (Frank, optional) — 2.737 Vodtapes-Legacy

---

## 6. Offene Punkte

- **Resend-Quota-Check:** Aktuelles Resend-Plan-Limit prüfen (vermutlich 100/sec, monatlich 50k inkl.). Bei 13.000 Sends in einer Welle (T1+T2) sind wir nah am Limit.
- **Brevo Side:** Wenn der Newsletter-Versand selbst über Brevo-Campaigns läuft (nicht Resend), dann sind Resend-Quotas nur für Confirmation+Re-Opt-In-DOI-Mails relevant. Frank's Workflow auf `/app/newsletter/send` sollte Brevo nutzen.
- **Frank-Briefing:** UI-Walkthrough nötig — Smart-List-Wahl, Bulk-Action, Job-Monitor, was tun bei Bounce/Block.
- **Anwalts-Check für Tier 2 §7(3) UWG-Pfad:** Optional aber empfohlen, idealerweise mit RSE-78 AGB-Anwalt zusammenlegen.

---

## 7. Akzeptanz-Kriterien Phase B

- [ ] DSGVO-Decision dokumentiert in Linear / CHANGELOG.md
- [ ] Schema-Migrations applied (Supabase MCP `apply_migration`)
- [ ] `POST /admin/crm/contacts/bulk-invite` accepts ≥1000 ids, returns job_id, sends via JobTracker
- [ ] Bulk-Action „Send Invite" in `/app/crm` Contacts-Tab funktioniert mit allen 3 Templates
- [ ] Storefront `/newsletter?prefill=&via=re-opt-in` shows correct hero + works end-to-end
- [ ] Test-Welle erfolgreich (10-20 Personen, ≥70% Redeem-Rate)
- [ ] Tier-1-Send (3.634) durch ohne kritische Bounces / Spam-Reports
- [ ] CHANGELOG.md + GitHub Release `v0.53.15-rcXX` für jeden Deploy-Step

---

**Author:** Claude (Phase-B-Audit + Plan, 2026-05-08)
**Reviewer:** Robin (DSGVO-Decision pending)
