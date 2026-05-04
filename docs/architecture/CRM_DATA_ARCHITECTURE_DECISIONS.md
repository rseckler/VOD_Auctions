# CRM-Architektur — Entscheidungsvorlage

**Status:** ✅ Abgezeichnet von Robin Seckler · 2026-05-04
**Erstellt:** 2026-05-03
**Autor:** Claude Code (für Robin)
**Verbindliche Entscheidungspunkte:** 6 (alle entschieden)
**Resultat:** 1B · 2C · 3A · 4B · **5A** · 6B (5A weicht von Empfehlung 5B ab — Robin will Notes/Audit/Tags direkt in S1)

**Zweck:** Bevor wir einen einzigen Code-Sprint starten, müssen 6 architektonische Fragen geklärt sein, die alles weitere prägen. Dieses Dokument legt die Optionen offen, wägt Pros/Cons ab, gibt eine begründete Empfehlung pro Frage und lässt Raum für Robin's Entscheidung. Erst danach werden die Sprint-Pläne in [`CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md`](../optimizing/CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md) finalisiert.

**Lesedauer:** 20-30 Min mit Konzentration. Das ist die Investition wert, weil eine falsche Entscheidung hier 2-4 Wochen Code kosten kann.

---

## Vorab — Ist-Zustand und Constraints

### Was bereits feststeht (nicht verhandelbar)
- **Datenbank:** Supabase PostgreSQL (`bofblwqieuvmqybzxapx`, eu-central-1) — wechseln wir nicht. Free-Plan, derzeit ausreichend
- **Backend-Framework:** Medusa.js 2.x — wechseln wir nicht. Bringt eigene `customer`-Tabelle mit eigenem ULID-PK + Auth + Sessions
- **Brevo:** bleibt als Marketing-/Newsletter-Tool (Liste 5 = 3.580 echte tape-mag-Bestandskunden). Webhook für Inbound-Events live, Outbound-Sync via `crm-sync.ts` live
- **Admin-UI:** Medusa-Admin Framework (custom Routes + Components) — wechseln wir nicht
- **vod-auctions.com ist nicht live mit echten Kunden** — keine echten Bestellungen, keine echten Bids. 12 customers + 21 List-7-Kontakte sind alle Test/Dev
- **Echte Bestandsdaten ausschließlich aus Legacy:** 4 MySQL-DBs auf dedi99 + 10.575 MO-PDFs (2019-2026, weitere bis 2003 folgen) + 80-120k Mails in 2 Frank-Postfächern + 3.580 Brevo-Kontakte (Liste 5)

### Anforderungen, die alle Optionen erfüllen müssen
1. Eine Person kann **mehrere Emails** über die Jahre haben (Privat + Geschäft, Wechsel, Familien-Account)
2. Eine Person kann **mehrere Adressen** haben (Wechsel, Liefer ≠ Rechnung)
3. Eine Person kann **mehrere Telefon-Nummern** haben
4. Eine Person kann **ohne Email** existieren (Telefon-/Postal-Only-Käufer aus älteren MO-Rechnungen)
5. **Aktivität aus 7 Quellen** muss am Kontakt zusammenlaufen: MO-PDFs, vodtapes-Member, vod-records-Webshop (3 DBs), IMAP-Mails, vod-auctions Bids/Orders/Bestellungen
6. **DSGVO-konform:** Auskunfts-/Löschungs-/Anonymisierungs-Pfad pro Person
7. **Bridge zu Medusa:** Wenn ein Kontakt sich auf vod-auctions registriert/kauft → Verknüpfung zum Medusa-`customer`
8. **Audit-fähig:** wer hat wann welchen Datensatz mit welcher Quelle verknüpft

### Out-of-Scope
- Mautic, HubSpot, Salesforce — siehe [`CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md`](CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md) §3.1, klare Entscheidung gegen klassisches CRM
- OCR (Robin-Entscheidung 2026-05-03) — nur native PDFs werden verarbeitet
- Bidirectional MO-Sync (OfficeConnect) — Phase 3, nicht Teil dieser Vorlage

---

## Entscheidung 1 — Wo wohnt die zentrale CRM-Datenbank?

### Anforderung
Wir brauchen einen Ort, an dem ein **Master-Contact** liegt — eine kanonische Person mit allen ihren Identifiers (Email, Adresse, Telefon, Legacy-Kundennummern), allen ihren Touches (Käufe, Bids, Mails) über alle Jahre und über alle 7 Quellen.

### Optionen

#### Option 1A — Medusa `customer` ist der Master

Alle Legacy-Kontakte werden als Stub-Rows in die existierende Medusa-`customer`-Tabelle eingetragen. Schema wird via `metadata jsonb` erweitert. `customer_stats` bleibt als Aggregat-Layer (existiert schon, siehe `CRM_SYSTEM_VOD_AUCTIONS.md`).

```
customer (Medusa-native)
├─ id (TEXT, ULID, PK)
├─ email (UNIQUE, NOT NULL)         ← Problem: was wenn keine Email?
├─ first_name, last_name             ← was wenn nur „Max & Anna Müller" als Doppelname?
├─ phone, has_account
└─ metadata jsonb {                 ← alles weitere wird hier reingestopft
     legacy_customer_ids: [...],
     all_emails: [...],
     all_addresses: [...],
     source_links: [...]
   }
```

**Pros:**
- Eine Tabelle, eine Auth-Quelle, ein UI
- `customer_stats` und Brevo-Sync funktionieren ohne Anpassung
- Bestehender `subscribers/customer-created.ts` greift automatisch
- Storefront/POS/Admin-Code muss nichts neu lernen

**Cons:**
- **Email-UNIQUE-Pflicht ist Killer-Constraint:** Telefon-/Postal-Only-Kontakte aus MO-PDFs (potenziell ~30-40% des Bestands) brauchen Pseudo-Emails (`unknown_<id>@vod-auctions-pseudo.local`) — Datenverschmutzung
- Wenn ein Mensch 2 echte Emails hat (Privat + Geschäft), muss eine als Pseudo-Sekundär modelliert werden
- `metadata jsonb` für komplexe N:M-Beziehungen ist anti-pattern (kein Index, kein Constraint, kein Type)
- Stub-Rows verschmutzen die Tabelle für alle existierenden Medusa-Konsumenten (Customer-Listen, Search, Brevo-Sync)
- Force-Backfill von ~12-18k Stubs kollidiert mit Medusa-internen Annahmen (`has_account=false` erlaubt Login nicht, aber Sicht- und Filter-Logik muss überall angepasst werden)

#### Option 1B — Eigenes `crm_*`-Schema, Medusa schlank

Neue Tabellen-Domäne `crm_*` in derselben Supabase-DB. Medusa-`customer` bleibt schlank — nur tatsächlich registrierte vod-auctions-Accounts. Bridge via `crm_contact.medusa_customer_id` (nullable FK).

```
crm_contact                            ← Person/Firma (= „Master")
├─ id (uuid PK)
├─ display_name
├─ contact_type (person|business)
├─ tier
├─ medusa_customer_id (nullable FK)   ← gesetzt wenn registriert
├─ first_seen_at, last_seen_at
└─ ...

crm_contact_email   (1:N)              crm_contact_address (1:N)
crm_contact_phone   (1:N)              crm_contact_source_link (1:N)

crm_legacy_transaction                 ← MO-PDFs + Webshop-Bestellungen
crm_legacy_transaction_item

crm_email_candidate                    ← IMAP-Match-Output
crm_contact_note, crm_contact_audit_log
```

**Pros:**
- Modelliert das Problem sauber: ein Mensch hat N Emails/Adressen/Quellen, kann ohne Email existieren
- Medusa bleibt unangetastet — keine Custom-Migrations auf Standardprodukt
- Activity-Timeline ist natürlich: alle Quellen zeigen auf `crm_contact_id`
- DSGVO-Anonymisierung sauber pro Kontakt umsetzbar
- Brevo-Sync und `customer_stats` bleiben unverändert für Medusa-Customers
- Tier-Logik (Section G) sitzt sauber auf `crm_contact`-Aggregaten — keine Vermischung mit `customer_stats`

**Cons:**
- Mehr Schema (~10 neue Tabellen)
- Bridge-Logik zwischen `crm_contact` ↔ `customer` muss konsistent in 6 Code-Pfaden gehalten werden (Storefront-Register, Forgot-Password, POS-Checkout, Storefront-Anonymous-Checkout, Admin-Create, Pre-Launch-Invite-Redeem)
- Activity-Timeline-Query muss über zwei Schema-Domänen joinen (langsamer wenn nicht indiziert)
- 2 Admin-UI-Sektionen: Medusa-Customer-Management (Auth, Sessions) UND CRM-Contact-Management (Tier, Notes, Activity)

#### Option 1C — Eigene separate DB / externe Plattform

Komplett eigene Postgres-DB für CRM (auf VPS oder zweite Supabase) oder externer Service.

**Pros:**
- Vollständige Trennung
- Skaliert unabhängig

**Cons:**
- Cross-DB-JOINs nicht möglich → jede Abfrage „zeige alle Bids dieses Kontakts" wird zur App-Logik
- Backup-/Migration-/Auth-Komplexität verdoppelt
- Externe Plattform (z.B. Attio, HubSpot) wurde explizit ausgeschlossen (siehe Vorab-Constraints)
- Kein Mehrwert gegenüber Option 1B in derselben Supabase

### Vergleich

| Aspekt | 1A Medusa-Master | 1B `crm_*` neben Medusa | 1C Separate DB |
|---|:-:|:-:|:-:|
| Modelliert Email-lose Kontakte | ✗ Pseudo-Email | ✓ | ✓ |
| Modelliert N:M Email/Adresse | ✗ jsonb-Hack | ✓ | ✓ |
| Eine Auth-Quelle | ✓ | ✓ | ✗ |
| Cross-Source-Activity-Timeline einfach | △ jsonb-Mess | ✓ JOIN in einer DB | ✗ App-Logik |
| Medusa-Standard unangetastet | ✗ | ✓ | ✓ |
| Anzahl neuer Tabellen | 0 | ~10 | ~10 + DB-Setup |
| Bridge-Komplexität | 0 | mittel (1 FK) | hoch (App-Sync) |
| Reversibel | mittel (Stubs identifizierbar) | hoch (additiv) | hoch |
| Aufwand initial | 5-7 Tage | 10-12 Tage | 15-20 Tage |
| Langfristige Wartung | hoch (Schema-Konflikte) | niedrig | mittel |

### Empfehlung

**Option 1B — eigenes `crm_*`-Schema in derselben Supabase, Medusa-`customer` bleibt schlank.**

Begründung in einem Satz: Email-UNIQUE-Pflicht und 1:1-Annahmen in Medusa-`customer` passen nicht zu unserer realen Datenstruktur (viele Kontakte ohne Email, viele Kontakte mit mehreren Emails, viele Quellen pro Kontakt) — und ein Force-Fit (1A) zahlt jeden Monat Wartungs-Schmerzen, während eine separate Schema-Domäne (1B) das Problem **einmal** sauber löst.

**Reversibilitäts-Argument:** 1B ist additiv. Wenn sich später herausstellt, dass wir 1A doch besser haben wollten, können wir die `crm_contact`-Daten in `customer.metadata` schreiben und `crm_*` droppen. Umgekehrt geht das nicht — aus einer mit Pseudo-Emails verschmutzten `customer`-Tabelle holen wir die Daten nie wieder sauber raus.

### Robin's Entscheidung
- [ ] Option 1A — Medusa-customer als Master (akzeptiert Email-Pseudo-Schmerz)
- [x] **Option 1B — eigenes `crm_*`-Schema (empfohlen)** ← gewählt 2026-05-04
- [ ] Option 1C — separate DB (nicht empfohlen)
- [ ] eine andere Variante: ___________________

---

## Entscheidung 2 — Welches System verwaltet die CRM-Daten?

### Anforderung
Brauchen wir ein eigenes System (Self-Build im Medusa-Admin) oder nutzen wir ein Off-the-shelf-Tool?

### Optionen

#### Option 2A — SaaS-CRM (HubSpot, Pipedrive, Attio, Folk, …)
Externe Plattform mit eigener UI, Daten-Sync via API zu unserem Backend.

**Pros:**
- Keine UI-Programmierung
- Bewährt
- Email-Sequenzen, Lifecycle-Tracking, Activity-Timeline out-of-the-box

**Cons:**
- **Falsche Zielgruppe:** klassische CRMs sind B2B-Sales-Pipelines (Leads, Deals, Quotes, Pipeline-Stages) — wir brauchen B2C-Auktions-Customer-Verwaltung
- Monatliche Kosten (€20-150/Monat ab Tier 2)
- DSGVO-Konformität: Daten in US-Cloud (AVV nötig, einige sind problematisch)
- Vendor-Lock-In für die wertvollste Asset-Klasse: Customer-History
- Ein-Wege-Sync schwer: wenn der Admin im SaaS einen Tag setzt, muss das in unsere DB zurückfließen
- Nicht möglich: Auctions-spezifische Flows (Block-Tier-Visibility-Gate, Bid-History-Anzeige) — die SaaS-Tools wissen nichts von Auktionen

#### Option 2B — Self-Build im Medusa-Admin
Eigene Routes + Komponenten in `backend/src/admin/routes/crm/` und `backend/src/api/admin/crm/`.

**Pros:**
- Volle Kontrolle: Schema, UI, Berechtigungen, Anbindung an Auctions/Bids/Orders
- DSGVO-Vorteil: Daten bleiben in unserer Supabase, kein Drittanbieter
- Kosten: €0 (Hosting bezahlen wir bereits)
- Auctions-Domain-spezifische Features einbau-bar (Block-Visibility, Bid-Restrictions, Tier-Gate)
- Bestehender Stack (Medusa-Admin, shadcn, Tailwind, Knex) reicht
- Bestehende `customer_stats`/`crm-sync.ts`/Webhooks bleiben Teil davon

**Cons:**
- Wir müssen die UI bauen (Customer-Detail-Page, Activity-Timeline, Search/Filter)
- Wir müssen Tab-Routing, Pagination, Permissions selber lösen
- ~10-15 Tage Initial-Aufwand für Polish-UI-Niveau

#### Option 2C — Hybrid: Self-Build Master + Brevo für Marketing
Master-Contact in unserer DB (= 2B), aber Email-Versand und Newsletter weiterhin via Brevo (existing).

**Pros:**
- Wie 2B, aber wir nutzen Brevo's Stärke (Templates, Deliverability, Open-Tracking) wo es sinnvoll ist
- Bidirectional Sync ist schon teilweise live (`webhooks/brevo` für Bounces/Unsubscribes)

**Cons:**
- Identisch zu 2B's Cons; Brevo ist kein Architektur-Trade-off, sondern eine Tool-Wahl die ohnehin bleibt

### Empfehlung

**Option 2C (= 2B-Variante).** Self-Build im Medusa-Admin als Master-System; Brevo bleibt als Marketing-Tool (= Status quo). Begründung:

- B2C-Auctions ist nicht das Brot-und-Butter-Geschäft eines klassischen SaaS-CRMs
- Unsere wertvollste Differenzierung — Tier-basierter Auctions-Block-Zugang, Bid-History pro Customer, Cross-Source-Activity-Timeline — gibt es bei keinem SaaS-Tool out-of-the-box
- Marktvergleich aus `CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md` §2.1 zeigt Shopify-Niveau als realistisches Target — das ist self-buildbar in 2-3 Wochen
- `CRM_CUSTOMER_MANAGEMENT_KONZEPT_2026.md` §3.1 trifft genau diese Entscheidung schon (zustimmend ja oder Re-Open?)

### Robin's Entscheidung
- [ ] Option 2A — SaaS-CRM (welcher? ___________)
- [x] **Option 2B/2C — Self-Build im Medusa-Admin + Brevo für Marketing (empfohlen)** ← gewählt 2026-05-04
- [ ] anders: ___________________

---

## Entscheidung 3 — Tab-Struktur im Admin-CRM-UI

### Anforderung
Aktuell `/app/crm` hat 2 Tabs: „Overview" (Brevo-Aggregate) + „Customers" (lokale Liste mit `customer_stats`). Wenn wir den Master-Contact einführen, brauchen wir Klarheit, welche Tabs es gibt und was jeder zeigt.

### Optionen

#### Option 3A — 4 Tabs nebeneinander
```
[ Overview ] [ Contacts ] [ Customers ] [ Sources ]
```
- **Overview:** wie heute (Brevo-KPIs, Top-Spender, Recent Registrations)
- **Contacts:** NEU — Master-View über `crm_contact` (alle ~12-18k Kontakte, mit Tier, Source-Indikator, Activity-Recency)
- **Customers:** wie heute (Medusa-`customer`-Liste — relevant für Auth/Account-Verwaltung)
- **Sources:** NEU — Source-Health (letzter MO-PDF-Run, letzter DB-Pull, IMAP-Drift, Manual-Review-Queue-Counts)

**Pros:**
- Klare Trennung der Domänen: Contact = Mensch, Customer = Account
- „Customers" bleibt für reine Account-Verwaltung (Sperren, Passwort-Reset) erhalten
- „Sources" gibt Frank/Robin Operations-Sicht

**Cons:**
- 4 Tabs ist viel — Frank verliert vielleicht den Überblick
- Doppelung bei Personen, die Account haben: einmal in Contacts, einmal in Customers (Klick-Weg ist 2× nötig)

#### Option 3B — 3 Tabs, „Customers" geht in „Contacts" auf
```
[ Overview ] [ Contacts ] [ Sources ]
```
- **Contacts:** Master-View, mit Filter „nur registrierte Accounts" um die Customer-Sicht zu reproduzieren
- Alle Account-Funktionen (Sperren, Passwort-Reset) im Contact-Detail-Drawer wenn `medusa_customer_id` gesetzt ist
- **Sources:** wie 3A

**Pros:**
- Single-Pane-of-Glass für jeden Menschen
- Weniger Klick-Wege
- Die meisten Funktionen sind ohnehin am Contact, nicht am Customer (Tier, Notes, Tags, Bids-History)

**Cons:**
- Account-Funktionen sind „weiter weg" für jemanden der nur am Customer-Account arbeiten will
- Für Frank verwirrender wenn er nur „die 12 Test-Accounts sehen" will → muss mit Filter arbeiten

#### Option 3C — 2 Tabs, „Sources" als Detail-Page
```
[ Overview ] [ Contacts ]
```
- Sources werden zu Detail-Routen (`/app/crm/sources`, `/app/crm/sources/mo-pdfs`) statt Tab — über einen Link aus Overview oder Contacts erreichbar

**Pros:**
- Minimal
- Sources sind ohnehin selten — nicht prominent als Tab nötig

**Cons:**
- Source-Health ist operational wichtig (verfehlte Pulls, Drift) — als versteckte Detail-Page könnte das übersehen werden

### Empfehlung

**Option 3A — 4 Tabs.** Begründung:

- Account-Verwaltung (Customers-Tab) ist eine eigene Disziplin mit eigenen Aktionen (Sperren, Passwort-Reset, GDPR-Anonymisieren) und eigener Sicht (alle Test-Accounts auf einen Blick) — das in Contacts zu verstecken erschwert die Arbeit
- Sources-Tab ist die einzige Stelle wo wir den **Daten-Pipeline-Health** im Auge behalten — ohne dedizierten Tab vergessen wir das schnell und merken Drift erst in Wochen
- 4 Tabs sind verkraftbar — Shopify hat im Customer-Management-Bereich auch 5+ Tabs

**Migration-Pfad:** Aktuell sind 2 Tabs live. Wir fügen Schritt für Schritt hinzu:
- Schritt 1: „Sources"-Tab als erstes (zeigt Health der Pull-Pipelines)
- Schritt 2: „Contacts"-Tab nach Master-Resolver-Run
- „Customers"-Tab + „Overview"-Tab bleiben unverändert

### Robin's Entscheidung
- [x] **Option 3A — 4 Tabs (empfohlen)** ← gewählt 2026-05-04
- [ ] Option 3B — 3 Tabs, Customers integriert
- [ ] Option 3C — 2 Tabs, Sources als Detail-Page
- [ ] anders: ___________________

---

## Entscheidung 4 — Reihenfolge der Implementierung

### Anforderung
Mehrere Pipelines + Tabs + Migrations können parallel oder seriell implementiert werden. Was zuerst?

### Optionen

#### Option 4A — Daten zuerst, UI zuletzt
1. Schema-Migration (`crm_*`-Tabellen anlegen)
2. MO-PDF-Pipeline (Section D) → schreibt in `crm_legacy_transaction` + `crm_contact`-Stubs
3. Legacy-DB-Pull (Section E) → ergänzt `crm_contact`
4. IMAP-Mining (Section F) → ergänzt `crm_email_candidate`
5. Master-Resolver (Section H) → konsolidiert
6. Tiering (Section G) → setzt Tier-Schwellen
7. ERST DANN Admin-UI bauen

**Pros:**
- Wenn UI startet, hat sie reale Daten (12-18k Contacts) statt Test-Daten
- UI-Iteration auf realistischer Datenmenge

**Cons:**
- 4-6 Wochen ohne sichtbare UI-Fortschritte — frustrierend
- Bugs in der Pipeline werden erst spät entdeckt (kein UI zur Stichproben-Sichtung)
- Manual-Review-Queues (Layout-Drift, Master-Resolver-Konflikte) brauchen UI um bearbeitbar zu sein — sonst stauen sich Cases auf

#### Option 4B — UI parallel ab Tag 1
1. Schema-Migration
2. Admin-UI-Skelett mit „Sources"-Tab (zeigt Pipeline-Status, auch wenn Pipelines leer sind)
3. **Parallel:** MO-PDF-Pipeline + Manual-Review-UI für Layout-Drift
4. **Parallel:** Legacy-DB-Pull + Pull-Trigger im UI
5. **Parallel:** IMAP-Mining + Email-Candidate-Review-UI
6. **Parallel:** Master-Resolver + Conflict-Resolution-UI
7. Tiering + Tier-Filter im Contacts-Tab
8. Wave-Strategie-Integration (siehe `PRE_LAUNCH_KONZEPT.md`)

**Pros:**
- UI wächst mit Daten
- Stichproben-Sichtung ab Tag 1 möglich
- Manual-Review-Queues haben sofort UI
- Frank kann bei Stichproben-Sichtung mithelfen, ohne CLI-Skripte zu lernen

**Cons:**
- UI-Code muss mehrfach refactored werden (jeder neuer Datensatz bringt neue Felder)
- Initial mehr Aufwand — paralleles UI für Skelett-Daten ist Zusatz-Code

#### Option 4C — Pipeline-by-Pipeline End-to-End
1. MO-PDF-Pipeline (D) komplett: Pipeline + UI + Manual-Review + im Contacts-Tab anzeigen → Sprint 1
2. Legacy-DB-Pull (E) komplett: Pipeline + Diff-Anzeige + Source-Health → Sprint 2
3. IMAP (F) komplett → Sprint 3
4. Master-Resolver (H) komplett → Sprint 4
5. Tiering (G) komplett → Sprint 5

**Pros:**
- Pro Sprint ein Ende-zu-Ende-Flow live
- Demos möglich nach jedem Sprint
- Mentaler Fokus pro Sprint klar

**Cons:**
- Master-Resolver kommt erst spät — bis dahin sind Daten in `crm_*` bereits dedupliziert nötig (oder unsauber)
- Tiering kommt zuletzt — wir können Wave 1 erst nach Sprint 5 fahren

### Empfehlung

**Option 4B — UI parallel ab Tag 1, mit „Sources"-Tab als erstes Liefer-Asset.**

Begründung:
- Pipelines ohne UI bauen heißt: Bugs werden erst nach Wochen entdeckt
- Manual-Review-Queues sind Engpässe (Layout-Drift, Resolver-Konflikte, IMAP-Match-Confidence). Ohne UI für die Queues muss alles über CLI/SQL — ineffizient
- Risiko von 4B (UI-Refactoring) ist klein, weil wir das Schema gut planen + die UI-Komponenten klein halten

**Konkrete Sprint-Reihenfolge (Vorschlag):**

| Sprint | Inhalt | Output |
|---|---|---|
| **S1** | Schema-Migration `crm_*` + Sources-Tab (Skelett) + Contacts-Tab (leer-Zustand) | Datenbank-Foundation, UI-Skelett |
| **S2** | MO-PDF-Pipeline + Layout-Drift-Review-UI + Upload-Endpoint | erste 10.575 Rechnungen geparst |
| **S3** | Legacy-DB-Pull (db2013 + db1 + vodtapes-Members) + Pull-Trigger im UI | ~14k Contacts in `crm_contact` |
| **S4** | IMAP-Mining (Indexer + Matcher) + Email-Candidate-Review-UI | ~50% der Contacts haben Email-Match |
| **S5** | Master-Resolver + Conflict-Resolution-UI | dedup'ed Contacts ~12-18k |
| **S6** | Tiering (Section G) + Customer-Detail-Page mit Activity-Timeline | Tier-Klassifikation + 360°-View |
| **S7** | Pre-Launch-Hardening (Section C) + Wave-1-Trigger | Wave 1 ready |

Jeder Sprint dauert ~3-5 Werktage. Total ~5-7 Wochen für vollständigen End-to-End-Flow.

### Robin's Entscheidung
- [ ] Option 4A — Daten zuerst, UI zuletzt
- [x] **Option 4B — UI parallel (empfohlen)** ← gewählt 2026-05-04
- [ ] Option 4C — Pipeline-by-Pipeline E2E
- [ ] anders: ___________________

---

## Entscheidung 5 — Notes/Tags/Audit-Log Timing

### Anforderung
[`USER_MANAGEMENT_KONZEPT_2026.md`](USER_MANAGEMENT_KONZEPT_2026.md) §3 listet `customer_note`, `customer_audit_log`, Tag-UI als P1-P2-Features. Soll das im Master-Contact-Schema von Anfang an dabei sein, oder später?

### Optionen

#### Option 5A — Direkt im ersten Schema-Wurf
`crm_contact_note`, `crm_contact_audit_log`, `crm_contact_tags` (TEXT[]) sind in der Migration S1 von Anfang an dabei.

**Pros:**
- Eine Migration, keine spätere Schema-Änderung
- Tags + Notes können sofort getestet werden, sobald Daten da sind

**Cons:**
- Kein direkter Wert in S1-S5 (UI dafür kommt erst in S6)
- 3 zusätzliche Tabellen ohne sofortige Konsumenten

#### Option 5B — Tags ja, Notes/Audit später
`crm_contact.tags TEXT[]` direkt im Schema (= analog zu `customer_stats.tags`). `crm_contact_note` + `crm_contact_audit_log` erst in S7-S8.

**Pros:**
- Tags sind günstig + sofort relevant (Source-Tagging beim Pull: `tape_mag_legacy`, `vod_records_legacy`, etc.)
- Audit-Log + Notes können sich entwickeln, sobald wir wissen welche Aktionen wirklich gebraucht werden

**Cons:**
- Eine spätere Migration nötig
- Kleine Diskrepanz zu `USER_MANAGEMENT_KONZEPT_2026.md` Schema-Vorschlag

#### Option 5C — Komplett später, in eigenem Sprint
Alle drei (Notes, Tags-UI, Audit-Log) in S8 nach Wave 1 GO.

**Pros:**
- Initial-Aufwand minimal
- Wenn Wave 1 Daten produziert, lernen wir was wir wirklich tracken müssen

**Cons:**
- Tags fehlen im Resolver/Pull — wir können keine Source-Markierungen setzen
- Master-Resolver-Konflikte ohne Audit-Log sind nicht nachvollziehbar

### Empfehlung

**Option 5B — `crm_contact.tags TEXT[]` direkt mit; `crm_contact_note` + `crm_contact_audit_log` in S6 (mit der Detail-Page).**

Begründung:
- Tags sind **operational notwendig** ab S2 (Source-Tagging beim Pull) — sonst kennen wir die Herkunft nicht
- Notes + Audit-Log sind **UI-getrieben** — ohne Detail-Page kein Use-Case → S6 reicht
- Eine Mini-Migration (~30 Min) in S6 ist akzeptabel

### Robin's Entscheidung
- [x] **Option 5A — alle drei direkt** ← gewählt 2026-05-04 (weicht von Empfehlung 5B ab; Robin will Notes + Audit-Log + Tags-Spalte ab S1, nicht erst S6)
- [ ] Option 5B — Tags direkt, Notes/Audit in S6 (empfohlen)
- [ ] Option 5C — alle drei nach Wave 1
- [ ] anders: ___________________

**Konsequenz für S1-Migration:** `crm_master_note`, `crm_master_audit_log` und `crm_master_contact.tags TEXT[]` werden in derselben Migration angelegt wie der Rest des Master-Schemas. Schema-Diff in nächstem Schritt prüft, ob Phase-1-Implementation diese bereits enthält oder ob additive Migration nötig ist.

---

## Entscheidung 6 — Master-Resolver Verhalten

### Anforderung
Wenn aus 4-7 Quellen Daten zu einer Person zusammenfließen, muss klar sein: wann wird ein neuer `crm_contact` angelegt, wann wird gemerged, wann split? Diese Logik prägt das gesamte Datenmodell.

### Optionen

#### Option 6A — Auto-Merge ohne Confirmation
Resolver matcht via Email > MO-Customer-No > Adress-Hash > Name+PLZ und merged automatisch. Bei Konflikt (z.B. zwei Emails an gleiche Adresse): jüngere Quelle gewinnt.

**Pros:**
- Vollautomatisch, keine Manual-Queue
- Schnell

**Cons:**
- Falsch-Merges sind katastrophal — zwei verschiedene Menschen werden zu einer Person, Lifetime-Revenue ist falsch, falsche Tier-Klassifikation
- Reverse-Engineering schwer (`crm_contact_audit_log` muss perfekt sein)

#### Option 6B — Auto-Merge bei hoher Konfidenz, Manual-Queue bei mittlerer
Confidence-Score wie in IMAP-Match (0-1):
- ≥0.95: Auto-Merge
- 0.70-0.94: Manual-Review-Queue mit Side-by-Side-Vergleich, Frank/Robin entscheidet
- <0.70: zwei separate Contacts, kein Merge-Vorschlag

**Pros:**
- Beste Balance
- Manual-Effort minimal (nur grenzwertige Fälle)
- Audit-Trail klar

**Cons:**
- Confidence-Schwelle muss kalibriert werden
- Manual-Review-UI muss gut gebaut sein (sonst wird es Engpass)

#### Option 6C — Niemals Auto-Merge, immer Manual
Jeder potenzielle Merge muss Frank/Robin manuell bestätigen.

**Pros:**
- Sicherste Option

**Cons:**
- Bei ~5-10k potenziellen Merges (eine Person in 4 Quellen) wird das Wochen dauern
- Nicht skalierbar

### Empfehlung

**Option 6B — Confidence-basiert mit Manual-Queue.**

Konkrete Regeln:
- **Auto-Merge:** identische lower(email) UND identische strukturierte Adresse → Confidence ~1.0
- **Auto-Merge:** identische MO-Kundennummer (`ADR-XXXXXX`) → Confidence ~1.0
- **Manual-Review:** identische Email aber unterschiedliche Adresse → Confidence ~0.85 (könnte Familien-Account sein)
- **Manual-Review:** gleicher Name + gleiche PLZ aber andere Email → Confidence ~0.75 (könnte Email-Wechsel sein)
- **Kein Match:** alles andere → zwei separate Contacts

Manual-Queue wird in S5 mit dem Master-Resolver gebaut. Erwartete Größe: 200-800 Cases (basierend auf groben Schätzungen — kalibriert sich nach S2/S3-Daten).

### Robin's Entscheidung
- [ ] Option 6A — Auto-Merge alles
- [x] **Option 6B — Confidence-basiert mit Manual-Queue (empfohlen)** ← gewählt 2026-05-04
- [ ] Option 6C — Niemals Auto-Merge
- [ ] anders: ___________________

---

## Anhang A — Schema-Skizze (bei Wahl 1B)

```sql
-- ========================
-- KERN: Master-Contact
-- ========================
CREATE TABLE crm_contact (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name    text NOT NULL,
  contact_type    text NOT NULL CHECK (contact_type IN ('person','business')),

  -- Bridge zu Medusa (wenn registriert)
  medusa_customer_id  text NULL REFERENCES customer(id) ON DELETE SET NULL,

  -- Convenience-Felder (denormalisiert aus 1:N-Tabellen)
  primary_email   text NULL,    -- = (SELECT email FROM crm_contact_email WHERE is_primary)
  primary_phone   text NULL,
  country_code    text NULL,    -- ISO-2

  -- Tier (Section G)
  tier            text NULL CHECK (tier IN ('platinum','gold','silver','bronze','standard','dormant')),
  tier_calculated_at timestamptz NULL,
  lifetime_revenue_decayed numeric(10,2) NULL,

  -- Tags (Source-Tags + manuelle Tags)
  tags            text[] DEFAULT '{}',

  -- Status
  is_test         boolean DEFAULT false,
  is_blocked      boolean DEFAULT false,
  blocked_reason  text NULL,

  -- Lifecycle
  first_seen_at   timestamptz NOT NULL DEFAULT NOW(),
  last_seen_at    timestamptz NOT NULL DEFAULT NOW(),
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  deleted_at      timestamptz NULL    -- DSGVO-Anonymisierung
);

CREATE INDEX idx_crm_contact_medusa ON crm_contact(medusa_customer_id) WHERE medusa_customer_id IS NOT NULL;
CREATE INDEX idx_crm_contact_email_lower ON crm_contact(LOWER(primary_email));
CREATE INDEX idx_crm_contact_tier ON crm_contact(tier) WHERE tier IS NOT NULL;
CREATE INDEX idx_crm_contact_tags ON crm_contact USING GIN(tags);

-- ========================
-- 1:N — Identifiers
-- ========================
CREATE TABLE crm_contact_email (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES crm_contact(id) ON DELETE CASCADE,
  email           text NOT NULL,
  email_lower     text GENERATED ALWAYS AS (LOWER(email)) STORED,
  source          text NOT NULL,    -- 'mo_pdf' | 'vod_records_db2013' | 'vodtapes_members' | 'imap_<account>' | 'manual' | 'vod_auctions_register'
  source_record_id text NULL,        -- z.B. MO-Kundennummer, IMAP-msg-id
  confidence      numeric(3,2) NOT NULL DEFAULT 1.0,
  is_primary      boolean DEFAULT false,
  is_verified     boolean DEFAULT false,
  opted_out_at    timestamptz NULL,  -- aus Brevo-Webhook
  bounced_at      timestamptz NULL,  -- aus Brevo-Webhook
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(contact_id, email_lower)
);
CREATE INDEX idx_crm_contact_email_email ON crm_contact_email(email_lower);

CREATE TABLE crm_contact_address (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES crm_contact(id) ON DELETE CASCADE,
  type            text NOT NULL DEFAULT 'shipping',  -- 'billing'|'shipping'|'home'|'business'
  raw_input       text NULL,         -- Original-Free-Text (Backup)
  company         text NULL,
  first_name      text NULL,
  last_name       text NULL,
  street          text NULL,
  postal_code     text NULL,
  city            text NULL,
  region          text NULL,
  country_code    text NULL,         -- ISO-2
  source          text NOT NULL,
  source_record_id text NULL,
  is_primary      boolean DEFAULT false,
  valid_from      timestamptz NULL,
  valid_to        timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE crm_contact_phone (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES crm_contact(id) ON DELETE CASCADE,
  phone           text NOT NULL,
  phone_normalized text NULL,        -- E.164 wenn parsbar
  source          text NOT NULL,
  is_primary      boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

-- ========================
-- 1:N — Source-Links (Audit über Origins)
-- ========================
CREATE TABLE crm_contact_source_link (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES crm_contact(id) ON DELETE CASCADE,
  source          text NOT NULL,    -- 'mo_pdf' | 'vod_records_db1' | 'vod_records_db11' | 'vod_records_db2013' | 'vodtapes_members' | 'imap_vod_records' | 'imap_vinyl_on_demand' | 'tape_mag_brevo_list5' | 'vod_auctions'
  source_record_id text NOT NULL,    -- ADR-XXXXXX | DB-Row-ID | IMAP-msg-id | Brevo-Contact-ID | Medusa-customer-id
  source_data     jsonb NULL,        -- Roh-Daten zum Audit
  confidence      numeric(3,2) NOT NULL DEFAULT 1.0,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(source, source_record_id)
);

-- ========================
-- 1:N — Legacy-Transaktionen
-- ========================
CREATE TABLE crm_legacy_transaction (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES crm_contact(id) ON DELETE CASCADE,
  source          text NOT NULL,    -- 'mo_pdf' | 'vod_records_db1' | etc.
  source_record_id text NOT NULL,    -- Rechnungsnummer | Bestellungs-ID
  doc_type        text NOT NULL DEFAULT 'invoice', -- invoice | credit_note | proforma | partial
  doc_date        date NOT NULL,
  delivery_date   date NULL,
  total_gross     numeric(10,2) NULL,
  total_net       numeric(10,2) NULL,
  total_tax       numeric(10,2) NULL,
  currency        text DEFAULT 'EUR',
  status          text NULL,        -- 'paid' | 'open' | 'cancelled' | etc.
  raw_payload     jsonb NULL,        -- Roh-Daten der Quelle
  source_pdf_path text NULL,         -- nur für mo_pdf
  source_pdf_hash text NULL,         -- File-Hash
  parser_version  text NULL,         -- für Re-Run-Tracking
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(source, source_record_id)
);

CREATE TABLE crm_legacy_transaction_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid NOT NULL REFERENCES crm_legacy_transaction(id) ON DELETE CASCADE,
  position        int NOT NULL,
  article_no      text NULL,
  article_name    text NOT NULL,
  quantity        numeric(10,3) NOT NULL DEFAULT 1,
  unit_price      numeric(10,2) NULL,
  line_total      numeric(10,2) NULL,
  vat_rate        numeric(5,2) NULL,
  is_shipping     boolean DEFAULT false,
  raw_line        text NULL
);

-- ========================
-- IMAP-Mining
-- ========================
CREATE TABLE crm_imap_message (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account         text NOT NULL,    -- 'frank@vod-records.com' | 'frank@vinyl-on-demand.com'
  msg_uid         text NOT NULL,
  folder          text NOT NULL,
  date            timestamptz NOT NULL,
  from_email      text NULL,
  to_emails       text[] DEFAULT '{}',
  cc_emails       text[] DEFAULT '{}',
  subject         text NULL,
  body_excerpt    text NULL,         -- erste 2-5kb, nach 90d anonymisiert
  detected_emails text[] DEFAULT '{}',
  detected_customer_refs text[] DEFAULT '{}',  -- ADR-XXXXXX
  detected_invoice_refs text[] DEFAULT '{}',   -- RG-/KR-/PR-XXXXXX
  indexed_at      timestamptz NOT NULL DEFAULT NOW(),
  body_anonymized_at timestamptz NULL,
  UNIQUE(account, msg_uid)
);

CREATE TABLE crm_email_candidate (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES crm_contact(id) ON DELETE CASCADE,
  email           text NOT NULL,
  source_imap_msg_id uuid NULL REFERENCES crm_imap_message(id),
  matched_by      text NOT NULL,    -- 'customer_no_in_body' | 'name_in_header' | etc.
  confidence      numeric(3,2) NOT NULL,
  status          text NOT NULL DEFAULT 'pending', -- 'pending'|'accepted'|'rejected'
  reviewed_by     text NULL,        -- Admin-User-Email
  reviewed_at     timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

-- ========================
-- Notes + Audit (Phase S6)
-- ========================
CREATE TABLE crm_contact_note (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES crm_contact(id) ON DELETE CASCADE,
  body            text NOT NULL,
  author_email    text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  deleted_at      timestamptz NULL
);

CREATE TABLE crm_contact_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid NOT NULL REFERENCES crm_contact(id) ON DELETE CASCADE,
  action          text NOT NULL,    -- 'merge_from'|'split_to'|'tier_set'|'tag_added'|'block'|'unblock'|'note_added'|'sync_to_brevo'|...
  details         jsonb NULL,
  admin_email     text NULL,
  source          text NULL,        -- 'admin_ui' | 'system' | 'resolver_auto' | 'resolver_manual'
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

-- ========================
-- Pipeline-Audit
-- ========================
CREATE TABLE crm_extraction_run (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL,    -- 'mo_pdf'|'vod_records_db1'|'imap_vod_records'|...
  started_at      timestamptz NOT NULL DEFAULT NOW(),
  finished_at     timestamptz NULL,
  parser_version  text NULL,
  status          text NOT NULL DEFAULT 'running',  -- 'running'|'done'|'failed'|'partial'
  files_total     int NULL,
  files_ok        int NULL,
  files_warning   int NULL,
  files_failed    int NULL,
  contacts_inserted int NULL,
  contacts_updated  int NULL,
  notes           text NULL,
  error_message   text NULL
);

CREATE TABLE crm_layout_review_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL,    -- 'mo_pdf'
  source_file_path text NOT NULL,
  source_file_hash text NOT NULL,
  detected_layout text NULL,
  review_reason   text NOT NULL,    -- 'unknown_layout'|'parse_error'|'sum_mismatch'
  raw_text        text NULL,        -- pdftotext-Output für Frank/Robin
  status          text NOT NULL DEFAULT 'open',  -- 'open'|'resolved'|'skipped'
  resolved_by     text NULL,
  resolved_at     timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);
```

**Migrationsreihenfolge:**
1. Section S1: alle `crm_contact*`, `crm_contact_email`, `crm_contact_address`, `crm_contact_phone`, `crm_contact_source_link`, `crm_extraction_run`, `crm_layout_review_queue`
2. Section S2: `crm_legacy_transaction` + `crm_legacy_transaction_item`
3. Section S4: `crm_imap_message` + `crm_email_candidate`
4. Section S6: `crm_contact_note` + `crm_contact_audit_log`

---

## Anhang B — Daten-Fluss-Diagramm

```
Quellen (außerhalb)                  Pipeline (Backend Cron + Service)         CRM-Schema (Supabase)
─────────────────────                ─────────────────────────────────         ──────────────────────

10.575+ MO-PDFs                ──→  mo_pdf_pipeline.py                    ──→  crm_legacy_transaction
(2003-2026, lokal)                  - Layout-Detection                          + crm_legacy_transaction_item
                                    - Multi-Vintage-Parser                      crm_extraction_run (Audit)
                                    - Hash-Dedup                               crm_layout_review_queue (offene Cases)

vodtapes (3.632 Members)        ──→  legacy_db_pull.py                     ──→  crm_contact (Stub mit
maier_db1 (3.114)                    - pymysql R/O                              metadata.source_db=…)
maier_db11 (2.556 — skip)            - Charset-Repair                           crm_contact_email/_address
maier_db2013 (8.544+17.315)          - source-Tagging                           crm_contact_source_link
                                    - Idempotente Upserts                      crm_legacy_transaction
                                                                                (für Webshop-Bestellungen)

frank@vod-records.com (60-80k)  ──→  imap_indexer.py                       ──→  crm_imap_message
frank@vinyl-on-demand.com           - imaplib SSL:993                           crm_email_candidate (mit Confidence)
                                    - BODY.PEEK (kein \Seen-Flag-Set)
                                    - Header-Parser
                                    - Customer/Invoice-Ref-Detection

Brevo List 5 (3.580)            ──→  brevo_pull.py (initial only, dann via    ──→  crm_contact_email (mit
                                    Webhook bidirectional aktualisiert)            opted_out_at, bounced_at aus
                                                                                Webhook)

vod-auctions (Storefront, POS,  ──→  Subscriber `customer-created.ts`     ──→  crm_contact (medusa_customer_id
   Admin)                           wird erweitert um:                          gesetzt; Email-Match ggf. mergt
                                    1. crm_contact_email-Lookup auf Email      auf existing Stub)
                                    2. Wenn Match: setze crm_contact.medusa_customer_id
                                    3. Sonst: lege neuen crm_contact an
                                    + crm_contact_audit_log
                                                                                ↓
                                                            Master-Resolver
                                                            ─────────────────
                                                            S5: resolver.py
                                                            - Email-Match (lower+trim)
                                                            - MO-Customer-No-Match
                                                            - Adress-Hash-Match
                                                            - Name+PLZ-Fuzzy
                                                            - Confidence-Banding
                                                            - Auto-Merge ≥0.95
                                                            - Manual-Queue 0.70-0.94
                                                                                ↓
                                                            Tier-Engine
                                                            ────────────
                                                            S6: customer-stats-recalc.ts
                                                            (extended)
                                                            - lifetime_revenue_decayed
                                                            - Tier-Berechnung
                                                            - Brevo-Attribut-Sync
                                                                                ↓
                                                            Admin-CRM-UI
                                                            ─────────────
                                                            /app/crm
                                                            - Overview (Brevo-Aggregate)
                                                            - Contacts (Master-View)
                                                            - Customers (Medusa-Accounts)
                                                            - Sources (Pipeline-Health)
```

---

## Anhang C — Was diese Entscheidungen NICHT festlegen

Damit klar ist, was wir **separat** entscheiden:

- **Wave-1-E-Mail-Wording:** kommt aus [`PRE_LAUNCH_KONZEPT.md`](../PRE_LAUNCH_KONZEPT.md) §4 — bereits definiert
- **Tier-Schwellen-Werte:** Vorschlag in [`CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md`](../optimizing/CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md) §G.1 — Frank kalibriert nach Histogramm
- **Brevo-Listen-Strategie:** Liste 5 (Tape-mag, 3.580) bleibt Read-Only; Liste 7 (vod-auctions, 21) wird gefüllt mit Newletter-Optins post-Launch
- **Rudderstack-Integration:** dokumentiert in [`RUDDERSTACK_SETUP.md`](RUDDERSTACK_SETUP.md), Backlog
- **DSGVO-Auskunfts-/Löschpfad:** existiert teilweise in `/store/account/gdpr-export`, muss für `crm_contact` erweitert werden — separater Workstream
- **Pre-Launch-Hardening:** existiert teilweise (Schema da), Section C im CRM-Plan vervollständigt — separater Sprint

---

## Anhang D — Folgefragen, die nach den 6 Entscheidungen geklärt werden

1. **Backup-Strategie** für die neuen `crm_*`-Tabellen (Supabase tier-2 Replica läuft bereits, Schema-Migrationen müssen mit-erweitert werden)
2. **Brevo-Sync-Granularität:** synct jeder `crm_contact_email`-Insert/Update an Brevo, oder nur primary?
3. **Performance:** bei 12-18k Contacts × ~10 Touches Aktivität ~120-180k Rows in `crm_legacy_transaction` — unkritisch in Postgres, aber Activity-Timeline-Query (UNION ALL über mehrere Tabellen) sollte materialisiert werden
4. **Test-Account-Markierung:** wie unterscheiden wir die 12 vod-auctions-Test-Accounts von den ~12-18k echten Legacy-Contacts in der `crm_contact`-Liste?
5. **POS-Search-Patch:** muss `customer-search/route.ts` (existing) so erweitert werden, dass es primär `crm_contact` queried, sekundär Medusa `customer`
6. **Pre-Launch-Invite-Bridge:** bei Invite-Redeem (siehe `PRE_LAUNCH_KONZEPT.md` §5.4) muss zusätzlich `crm_contact.medusa_customer_id` gesetzt werden, falls das Invite an einen bestehenden Contact ging

---

## Robin's Sammel-Entscheidung

Bitte hier die Entscheidungen markieren:

| Frage | Entscheidung |
|---|---|
| 1. Wo wohnt die zentrale CRM-Datenbank? | [ ] 1A · [x] **1B** · [ ] 1C |
| 2. Welches System verwaltet die CRM-Daten? | [ ] 2A · [x] **2B/2C** · [ ] anders |
| 3. Tab-Struktur im Admin-UI | [x] **3A** · [ ] 3B · [ ] 3C |
| 4. Reihenfolge der Implementierung | [ ] 4A · [x] **4B** · [ ] 4C |
| 5. Notes/Tags/Audit-Log Timing | [x] **5A** · [ ] 5B · [ ] 5C *(Abweichung von Empfehlung 5B — Notes/Audit/Tags ab S1)* |
| 6. Master-Resolver Verhalten | [ ] 6A · [x] **6B** · [ ] 6C |

Mit Datum + Initialen unten zeichnen und im Repo committen — danach starten wir Sprint S1.

✅ **Robin Seckler · 2026-05-04** — Decisions abgezeichnet, Sprint S1 startet

---

*Sobald die Entscheidungen vorliegen, wird [`CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md`](../optimizing/CRM_LEGACY_CUSTOMER_INTEGRATION_PLAN.md) finalisiert mit den Schema-Details aus Anhang A und der Sprint-Reihenfolge aus Entscheidung 4.*
