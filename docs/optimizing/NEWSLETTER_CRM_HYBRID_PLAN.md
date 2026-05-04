# Newsletter ↔ CRM Hybrid-Verheiratung

**Status:** Plan, awaiting Robin-Approval
**Datum:** 2026-05-04
**Verwandt:** rc53.0 CRM Master v1, rc53.1 Email Review, Brevo-Integration

## Ausgangslage

3 Wahrheits-Stellen für Newsletter-Status existieren parallel:

| Stelle | Inhalt | Aktualität |
|---|---|---|
| **Brevo** | List-Membership (List 4 vod-auctions, List 5 tape-mag), Contact-Attribute (NEWSLETTER_OPTIN, SPAM_REPORTED, EMAIL_VALID) | **Canonical** — Brevo-API ist authoritativ |
| **`newsletter_subscribers`** (lokal) | 3.634 Rows mit subscribed_at, unsubscribed_at, brevo_contact_id, source | Nur per Storefront-Signup geschrieben. **Brevo-Webhook updated diese Tabelle aktuell NICHT** (Bug — Webhook ruft nur Brevo-API-roundtrips, schreibt aber keinen Mirror) |
| **`crm_master_communication_pref`** | 6 Channel-Schema (email_marketing, sms, phone, postal, push, email_transactional), aktuell **0 Rows** | Designed in rc53.0 S7.2, nie populated |

**Match-Coverage:** Nur 46.2 % der active Subscriber (1.680 von 3.634) haben einen `crm_master_contact` via Email. **1.954 Subscriber sind newsletter-only** — kein Master, im CRM nicht sichtbar.

## Ziel

Frank öffnet den Master-Drawer im CRM und sieht im Tab **Communication** den Newsletter-Status. Toggle dort → Brevo-Liste wird aktualisiert. Subscribern, die heute keinen Master haben, wird einer angelegt (`lifecycle_stage='lead'`, `tag='newsletter_only'`).

## Design-Entscheidungen

### Channel-Naming
**Reuse `email_marketing`** als Channel-Identifier. Newsletter ist der einzige email_marketing-Use-Case heute, granularere Channels lohnen sich nicht. Falls später `auction_announcements` separat opt-out-fähig werden soll: dann ein neuer Channel.

### Source-of-Truth-Hierarchie

```
Brevo  (canonical: List-Membership + Attributes)
  ↑↓ Brevo API roundtrip (lib/brevo.ts)
crm_master_communication_pref  (Hauptspiegel im CRM, channel='email_marketing')
  ↓ Trigger AFTER UPDATE
newsletter_subscribers  (Audit-Trail + Source-Tracking, NICHT mehr SoT)
```

- **Lese-Anfragen** (Drawer-Render, Smart-List) gehen gegen `crm_master_communication_pref`
- **Schreib-Anfragen** (Drawer-Toggle, Webhook, Storefront-Subscribe) updaten `crm_master_communication_pref` **first**, dann triggert ein DB-Trigger den Mirror nach `newsletter_subscribers` + die Application-Schicht ruft die Brevo-API auf

### Auto-Master für unmatched Subscriber

Die 1.954 newsletter-only-Subscriber bekommen einen minimal-Master via Backfill:

```
display_name = email (oder name aus newsletter_subscribers wenn vorhanden)
primary_email = email
lifecycle_stage = 'lead'
acquisition_channel = 'newsletter_signup'
tags = ['newsletter_only']
manual_review_status = NULL  (kein Review nötig — passive)
```

So tauchen alle Newsletter-Empfänger im CRM auf, ohne dass sie als "Customer" maskiert werden. Filter "Tag: newsletter_only" trennt sie von echten Käufern.

## Implementierung — 5 Phasen

### Phase 1 — Schema-Hardening (Migration, additive)

```sql
-- crm_master_communication_pref: UNIQUE constraint sicherstellen
ALTER TABLE crm_master_communication_pref
  ADD CONSTRAINT IF NOT EXISTS unique_master_channel UNIQUE (master_id, channel);

-- Index für Smart-List-Performance
CREATE INDEX IF NOT EXISTS idx_pref_channel_optedin
  ON crm_master_communication_pref (channel, opted_in)
  WHERE opted_in = TRUE;

-- newsletter_subscribers: bereits UNIQUE auf email
-- FK zu crm_master_contact NICHT erzwingen — Subscriber kann ohne Master existieren
-- (Edge-Case: Master später gelöscht → Subscriber bleibt, kommt in nächsten Backfill-Lauf)
```

### Phase 2 — Backfill-Script

`scripts/backfill_newsletter_to_crm.py` (~200 Zeilen):

1. **Match-Pass:** Alle `newsletter_subscribers WHERE unsubscribed_at IS NULL` → join mit `crm_master_email`
2. **Auto-Master-Pass:** Unmatched Subscriber → INSERT in `crm_master_contact` (mit `tag='newsletter_only'`, `lifecycle_stage='lead'`) + INSERT in `crm_master_email` (primary=true)
3. **Pref-Pass:** Für jeden Subscriber (matched + neu erstellt) → UPSERT in `crm_master_communication_pref` (`channel='email_marketing'`, `opted_in=true`, `opted_in_at=subscribed_at`, `source='brevo_legacy_backfill'`, `notes=brevo_contact_id`)
4. **Audit-Log-Pass:** Pro Insert eine Row in `crm_master_audit_log` (`action='comm_pref_backfilled'`)
5. **Report:** matched / new_master_created / prefs_inserted / errors

Idempotent — Re-Run schreibt nur Diffs.

**Dry-run-Mode** mit `--dry-run` Flag, schreibt nichts, zeigt nur Counts.

### Phase 3 — Brevo-Webhook erweitern

`backend/src/api/webhooks/brevo/route.ts` Erweiterung — pro Event neben Brevo-Attribute auch lokal mirrors:

| Event | Action lokal |
|---|---|
| `unsubscribed` | `crm_master_communication_pref.opted_in = false` (channel=email_marketing) + `newsletter_subscribers.unsubscribed_at = NOW()` + Audit-Log |
| `hardBounce` | wie unsubscribed + `crm_master_email.is_verified = false` |
| `complaint`/`spam` | wie unsubscribed + Audit-Log mit notes='spam_complaint' |
| `softBounce` | log only, kein Status-Change |

Match per Email → Master finden via `crm_master_email`. Wenn kein Master existiert: Auto-Master anlegen analog Phase 2 (idempotent).

### Phase 4 — Drawer-Toggle-Endpoint erweitern

`backend/src/api/admin/crm/contacts/[id]/communication-prefs/route.ts` POST-Branch um Newsletter-Special-Case:

Wenn `channel === 'email_marketing'`:
1. Update `crm_master_communication_pref` (existing logic)
2. **NEU:** Fetch primary_email vom Master
3. **NEU:** Brevo-API-Call:
   - Wenn `opted_in=true` → `addContactToList(email, BREVO_LIST_VOD_AUCTIONS)` + `updateContactAttributes(email, {NEWSLETTER_OPTIN: true})`
   - Wenn `opted_in=false` → `removeContactFromList(email, BREVO_LIST_VOD_AUCTIONS)` + `updateContactAttributes(email, {NEWSLETTER_OPTIN: false})`
4. **NEU:** Update `newsletter_subscribers` (UPSERT — anlegen wenn nicht da; `subscribed_at`/`unsubscribed_at` setzen)
5. Audit-Log mit Brevo-Status (success/error) in `details`

Brevo-Errors loggen + im API-Response surface (200 mit `brevo_warning` field), aber lokale DB nicht rollbacken — Brevo retry später möglich.

### Phase 5 — Smart-List-Filter + Drawer-UI

**Smart-List (`crm_saved_filter`-Seed):**
- "Newsletter Subscribers" → `JSON-Filter: {channel: 'email_marketing', opted_in: true}`
- "Newsletter Unsubscribed" → `{channel: 'email_marketing', opted_in: false}`
- "Newsletter-Only Leads" → `{tag: 'newsletter_only'}`

**Backend-API:** existing contacts-list endpoint muss `?has_pref_channel=email_marketing&pref_opted_in=true` Query unterstützen — JOIN mit `crm_master_communication_pref`.

**Drawer-Communication-Tab:** existing UI rendert die 6 Channels. Newsletter (channel=email_marketing) bekommt zusätzlich:
- Brevo-Contact-ID-Anzeige (read-only, mono-font)
- Last sync timestamp
- Falls Brevo-Sync-Error: kleine warning-badge "Brevo out of sync — manual check needed"

## Migrations-Reihenfolge

1. **Phase 1 Migration** auf Prod (additive, idempotent — Supabase MCP `apply_migration`)
2. **Phase 2 Backfill** dry-run → Counts checken → echter Run mit `--commit`
3. **Phase 3+4 Code-Deploy** (rc53.3) — Webhook + API-Erweiterung
4. **Phase 5 UI** (rc53.4) — Smart-Lists + Drawer-Erweiterung

Phasen 3+4 müssen ZUSAMMEN deployed werden, sonst zeigt der Drawer-Toggle inkonsistente State (lokal updated, Brevo nicht).

## Risiken + Mitigations

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| Backfill legt 1.954 Auto-Master an, die als "Customer" wirken | Mittel | `tag='newsletter_only'` + `lifecycle_stage='lead'` + Smart-List-Trennung. Frank-Briefing mit Hinweis |
| Brevo-API-Call im Drawer-Toggle hängt → User-Wartezeit 2-5s | Hoch | Async-Call mit `setTimeout`-fallback. UI updated optimistisch, Brevo-Sync-Failure zeigt sich als badge |
| Brevo-Webhook-Endpoint ist nicht idempotent (Brevo retried bei 500-Response) | Mittel | UPSERT auf prefs+subscribers, Trigger ist `IS DISTINCT FROM`-gated (Memory `feedback_where_gated_upsert.md`) |
| Email-Case-Sensitivity (Brevo lowercased, lokal manchmal mixed-case) | Hoch | Konsistent `lower(trim(email))` als Match-Key — Memory-bekanntes Problem |
| Backfill timing: läuft 30 min, blockiert Master-Inserts? | Niedrig | Chunked 500/Batch, `ON CONFLICT DO UPDATE WHERE IS DISTINCT FROM` (verhindert unnötige Trigger-Fires) |
| Drawer öffnet sich langsam, weil 6 prefs-Rows joined werden | Niedrig | UNIQUE-Index auf (master_id, channel) macht Lookup O(1) |

## Code-Aufwand-Schätzung

- **Phase 1 Migration:** 30 Zeilen SQL, 5 min
- **Phase 2 Backfill-Script:** 200 Zeilen Python, ~2h
- **Phase 3 Webhook:** 60 Zeilen TS-Erweiterung, ~1h
- **Phase 4 Drawer-Endpoint:** 80 Zeilen TS-Erweiterung, ~1h
- **Phase 5 Smart-Lists + UI:** 50 Zeilen Backend + 100 Zeilen UI, ~2h
- **Tests + Backfill-Run + Verification:** ~2h
- **Doku + CHANGELOG:** ~30 min

**Total: ~9 Stunden netto**, 1-2 Sessions.

## Open Questions für Robin

1. **Auto-Master für unmatched Subscriber:** Approve oder lieber unmatched in `newsletter_subscribers`-only lassen (keine CRM-Visibility)?
2. **Brevo-Liste:** Default-Liste für CRM-Toggle = `BREVO_LIST_VOD_AUCTIONS` (List 4)? Oder soll der Toggle die List-Wahl exposen (z.B. Tape-Mag-List 5 separat)?
3. **Webhook-Auto-Master:** Wenn Brevo-Webhook `unsubscribed`-Event für eine Email kommt, die wir noch nicht kennen — Auto-Master anlegen oder ignorieren?
4. **Drawer-Sync-Mode:** Brevo-API-Call synchron (Frank wartet 2-5s) oder async (sofortige Response, Background-Sync)?

## Nächste Schritte

Nach Approval:
1. Migration für Phase 1 schreiben + auf Prod anwenden (Supabase MCP)
2. Backfill-Script mit Dry-Run, Counts mit Robin abnehmen
3. Echter Backfill-Run + Verification-Queries
4. Phase 3+4 als ein rc53.3 Deploy
5. Phase 5 als rc53.4 Deploy (entkoppelbar weil UI-only)
