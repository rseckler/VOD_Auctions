# CRM Data-Gaps Diagnose — was wir aus db2013 + IMAP nicht rausgeholt haben

**Datum:** 2026-05-04
**Anlass:** Robin: "Mail Accounts noch nicht sauber genug nach Informationen geprüft. können wir hier nochmals tiefer gehen und mehr Infos raus holen? auch in der db2013 sollten doch noch mehr infos sein oder?"
**Stand:** klare Lücken identifiziert + 1 IMAP-Bug.

---

## 1. db2013 — 6 von 169 Tables migriert

Aktueller `legacy_db_pull.py` zieht nur:
- `3wadmin_shop_kunden` (8.544) → `crm_staging_contact`
- `3wadmin_shop_kunden_adresse` (17.315) → `crm_staging_address`
- `3wadmin_shop_kunden_alt` (3.097) → archived addresses
- `3wadmin_shop_bestellungen` (8.230) → `crm_staging_transaction`
- `3wadmin_shop_bestellungen_artikel` (13.617) → `crm_staging_transaction_item`
- `3wadmin_shop_laender` (15) → country lookup

### Wertvolle ungenutzte Sources

| Table | Rows | Inhalt | Schema | Wert |
|---|---:|---|---|---|
| **`newsletter_log`** | 83.000 | Newsletter-Versand-Tracking | `nid` (Newsletter-ID), `userid` (Customer-ID), `datum` | **HOCH** — pro-Customer Newsletter-Engagement seit 2008 |
| **`newsletter_mail_gruppe`** | 51.000 | Newsletter-Subscriber-Membership | `mid`, `gid` | **HOCH** — wer ist in welcher Newsletter-Gruppe |
| **`3wadmin_shop_login_log`** | 7.728 | Login-History pro Customer | `user`, `datum`, `ip`, `typ` | **HOCH** — Last-Login + Login-Frequency + Geo (via IP) |
| **`phpbb_users`** | 1.333 | Forum-Users | (vermutlich) username/email/posts-count | **MITTEL** — Power-User-Detection wenn Email matched |
| **`phpbb_posts`** + `phpbb_topics` | 1.792 + 1.411 | Forum-Beiträge + Threads | poster_id, topic_id, post_time, post_text | **MITTEL** — Engagement-History |
| `3wadmin_history` | 113.985 | Field-Change-Log (generic) | `logid`, `feld`, `text` | NIEDRIG — ohne logid-Master schwer entzifferbar |
| `gbook` | 104 | Gästebuch | `name`, `mail`, `msg` | NIEDRIG |
| `admin_mail` | 770 | Admin-zu-Customer-Korrespondenz | TBD | MITTEL — könnte parallel zu IMAP sein |

### Nicht-relevant für CRM

- `3wadmin_shop_warenkorb` (1.7M) — Cart-Items, aber nur per `sid` (Session-ID), kein Customer-Bezug → NICHT migrieren
- `phpbb_search_*` (407k+69k) — Suche-Index, generic
- `3wadmin_login_log` (3.7k) — Admin-Login-Log (Frank himself)
- `3wadmin_shop_pwdneu` (928) — Password-Reset-Anfragen, sicherheits-sensitiv → NICHT migrieren

### Empfehlung

**Phase 5 Erweiterung (parallel zu CRM P0/P1):**
1. **Newsletter-Engagement-Pull**: `newsletter_log` + `newsletter_mail_gruppe` → neue Tabelle `crm_master_newsletter_event` (sent/opened) + Engagement-Score
2. **Login-History-Pull**: `3wadmin_shop_login_log` → `crm_master_login_event` (für last_login_at, login_count, login_country via IP-Geolocation)
3. **Forum-Activity-Pull**: `phpbb_users` (mit Email-Match) + `phpbb_posts` → `crm_master_forum_post` + `forum_engagement_score` als Tier-Faktor

Aufwand: ~1-2 Tage für alle 3, additiv zum existing Resolver-Run-Pattern.

---

## 2. IMAP — kritischer Bug: 0 Bodies gespeichert

### Befund

Bei 153.075 indexierten Mails: **`body_excerpt IS NULL` für 100% der Rows.**

```
account                       | folder                | mails  | with_body | with_detected
frank@vinyl-on-demand.com     | INBOX                 | 13.910 |        0  | 342
                              | INBOX.Sent Messages   |  6.561 |        0  |  27
                              | INBOX.Sent            |  6.561 |        0  |  27
                              | INBOX.Archive         |      5 |        0  |   0
frank@vod-records.com         | INBOX                 | 56.140 |        0  | 641
                              | INBOX.Sent            | 34.937 |        0  |  82
                              | INBOX.Sent Messages   | 34.935 |        0  |  82
                              | INBOX.Archive         |    319 |        0  |   0
```

### Root-Cause

`scripts/imap_indexer.py:278` macht `BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.5120>`.
Der Code parst die fetch-response auf Zeile 292-309 mit einem Pattern, der die TEXT-Payload anscheinend nicht in `parts["body"]` lädt.

Verifikation: Sample-Mail hat `subject="Regarding Your Project."` + `from_email=frank@vinyl-on-demand.com` (Header korrekt), aber `body_excerpt=NULL` und `raw_headers={}`. Der Header-Block kommt vermutlich auch nicht voll an.

**Konsequenz:** alle Body-Mining-Operationen, die wir in Phase 1 geplant hatten (Customer-Refs in Bodies finden, Invoice-Refs etc.) sind unwirksam. Stage 4 IMAP-Anreicherung hat trotzdem 244 Master enriched, aber **nur via from_email-Header-Match** — Body-Match wäre 5-10× mehr Treffer.

### Plus: Folder-Duplikate

`INBOX.Sent` und `INBOX.Sent Messages` sind beide indexiert mit (fast) identischen Mail-Counts. Das ist Hetzner-IMAP-Aliasing — gleicher Folder unter zwei Namen. Storage doppelt + Match-Logic potenziell doppelt.

### Empfehlung

**Sub-Sprint "IMAP-Re-Run" (parallel zu CRM P0/P1):**

1. **Bug fix in `imap_indexer.py`:** parse-loop mit Logging instrumentieren, Sample-Mail-Trace, Pattern korrigieren — ggf. auf `email.parser.BytesParser` umstellen statt manuelles imaplib-Tuple-Parsing
2. **Folder-Dedup:** Apple-Aliases erkennen (gleiche `uid_validity` → gleiche Mailbox) und nur einmal pullen. Bestehende Duplikate cleanen
3. **Re-Run** mit Body-Indexing — full bodies (5kb pro Mail = ~750 MB total, OK)
4. **Optional:** Drafts + Trash + Junk-Folders prüfen ob Customer-Korrespondenz drin ist
5. **Stage 4 IMAP-Anreicherung mit Body-Match nochmal laufen lassen** — erwartet 5-10× mehr Master mit Email

Aufwand: ~1 Tag (Bug-Fix + Re-Run + Anreicherung).

---

## 3. db2013 Failed-Run (Robin's Original-Frage zum Screenshot)

**Source-Card "vod-records.com (db2013, 2013+)" zeigt 50% Success / 1 Failed Run.**

### Befund

| Run-ID | Started | Status | Error |
|---|---|---|---|
| `65544aaf-...` | 2026-05-03 16:16 | **failed** | "Lost connection to MySQL server during query" |
| `02e3bfd5-...` | 2026-05-03 16:23 | done | 16.774 rows inserted |

### Root-Cause

MySQL-Idle-Timeout während des ersten Pulls — bekanntes Pattern aus Memory `feedback_mysql_streaming_idle_timeout.md`. Re-Run mit ping(reconnect)+fetchall-Fix war erfolgreich.

**Kein offener Bug.** UI zeigt korrekten historischen Fail.

### Verbesserung (nice-to-have)

Health-Heuristik in `/admin/crm/sources` Endpoint erweitern: wenn der **letzte** Run `done` ist und kein `active_run` läuft, sollte der Card-Status `ok` sein — nicht `warning` weil 1 historischer Fail. Heißt: `failed_runs_since_last_success > 0` als Trigger statt absolute `failed_runs > 0`.

5 Min Backend-Patch.

---

## 4. Zusammenfassung — was zu tun ist

### Sofort (parallel zu P0+P1-Implementation)

| Workstream | Aufwand | Output |
|---|---|---|
| IMAP-Body-Bug fix + Re-Run | 1 Tag | full body_excerpt für 153k Mails, +5-10× Stage-4-Treffer |
| Folder-Dedup (`INBOX.Sent` Aliases) | 2h | -50% IMAP-Storage |
| Source-Health-Heuristik (failed_since_last_success) | 30min | Card "ok" statt "warning" für db2013 |

### Nach P0+P1 ready

| Workstream | Aufwand | Output |
|---|---|---|
| Newsletter-Engagement-Pull (`newsletter_log` + `_mail_gruppe`) | 4h | Engagement-Score pro Master, Newsletter-Open-History |
| Login-History-Pull (`3wadmin_shop_login_log`) | 2h | last_login_at, login_count, IP-Geolocation |
| Forum-Activity-Pull (`phpbb_users` + `phpbb_posts`) | 4h | Forum-Engagement-Score, Power-User-Tag |

Total Diagnose-zu-Repair: ~2-3 Tage.

---

## 5. Was noch zu klären ist

1. **PII-Frage:** Body-Volltext (5kb/Mail × 153k = ~750 MB) — DSGVO-konform OK weil eigene Postfächer? Oder lieber nur 1kb-Excerpt + key-phrase-Match?
2. **Forum-Verlinkung:** phpbb_users hat eigene IDs. Match auf email gegen Master, dann Post-History migrieren?
3. **Login-History-Retention:** alle 7.728 Logins (seit ~2008) speichern? Oder nur last_login + Aggregat?
