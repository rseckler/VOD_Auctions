# 4 — Umsetzungsplan

**Stand:** 2026-05-16 (v2)
**Autor:** Robin Seckler
**Zweck:** Phasenplan mit Meilensteinen, Owner, Abhängigkeiten, Exit-Kriterien. Operative Aufgaben wandern nach Freigabe in `docs/TODO.md` + Linear.
**Voraussetzung:** [`1_ANALYSE.md`](1_ANALYSE.md) – [`3_TECHNISCHES_KONZEPT.md`](3_TECHNISCHES_KONZEPT.md).

---

## Übersicht

Zwei Bau-Stränge auf gemeinsamer Vorarbeit:

```
P0 Entscheidungen & Recht ─► P1 Daten konsolidieren ─┬─► P2 vod-records Shop-Cutover ─┐
                                                     │                                ├─► P5 SEO/Domain ─► P6 Decommissioning ─► P7 Launch
                                                     └─► P3 tape-mag-Erlebnis-App ─────┤
                                                     └─► P4 Community/FB (parallel) ───┘
```

P2 und P3 sind die zwei großen Bau-Stränge und können **parallel** laufen. P0, P5, P6 enthalten harte Blocker/Gates.

---

## Phase 0 — Entscheidungen & rechtliche Grundlage (BLOCKER)

| # | Aufgabe | Owner | Abhängigkeit |
|---|---------|-------|--------------|
| 0.1 | Sitzung mit Frank: 11 offene Entscheidungen (Vorlage: Dok. 6 `6_FRANK_AGENDA.md`) | Robin + Frank | — |
| 0.2 | Commerce-Leitdomain festlegen (#1) | Frank | 0.1 |
| 0.3 | Kommissionsmodell festlegen: echte Kommission vs. Vermittlung (#4) | Frank + StB | 0.1 |
| 0.4 | StB-Testfall-Katalog: §25a-Musterbelege, 3–5 Vorfälle, Muster-USt-VA, USt-Behandlung der Membership-Gebühren (19 %) | Frank + StB | 0.3 |
| 0.5 | AGB-Anwalt beauftragen/abschließen (RSE-78) | Frank | — |
| 0.6 | Account-Strategie (#2), Bestellhistorie (#5), Community-Verortung (#3), Membership-Umfang (#8), Bestandskunden-Übergang (#9), SEO-Canonical (#10), tape-mag-Zugang frei vs. gegated (#11) | Robin + Frank | 0.1 |

**Exit:** Leitdomain entschieden · Kommissionsmodell + §25a StB-freigegeben · AGB final · Account-/Order-/Community-Strategie dokumentiert · Membership-Detailentscheidungen getroffen.
**⚠️ Ohne P0 darf P2 nicht starten.** P1, P3, P4 dürfen parallel zu 0.3–0.5 laufen.

---

## Phase 1 — Datenkonsolidierung abschließen

| # | Aufgabe | Owner | Abhängigkeit |
|---|---------|-------|--------------|
| 1.1 | Frischer Count gegen alle Hetzner-Live-DBs (Befund F) | Robin | — |
| 1.2 | CRM Phase 2/3: Restkunden db2013, Login-Events, Vor-2013-Details | Robin | 1.1 |
| 1.3 | Mail-Importer-v2 bauen (Batch-Dedup, Last-Stufen, State-Resume) | Robin | — |
| 1.4 | Mail-Import fortsetzen (ab 116.901/422.755) | Robin | 1.3 |
| 1.5 | `typ`-Decode klären, ~500 Kommentare → `community_review` | Robin | — |
| 1.6 | Volldump aller Hetzner-DBs + FTP-Bilder als Cold-Backup | Robin | 1.1 |

**Exit:** CRM-Master vollständig · Mail-Index abgeschlossen · Legacy-Reviews migriert · Cold-Backup verifiziert.

---

## Phase 2 — Commerce-App ausbauen: vod-records-Cutover + Membership (BLOCKER) — Strang Commerce

| # | Aufgabe | Owner | Abhängigkeit |
|---|---------|-------|--------------|
| 2.1 | 547 Artikel gegen `Release` matchen, Review-Liste der Nicht-Treffer | Robin | P0 · 1.1 |
| 2.2 | `shop_price` + `sale_mode` + `erp_inventory_item` für die 547 setzen | Robin + Frank | 2.1 |
| 2.3 | §25a-Schema: `tax_scheme`-Flag, Margennachweis, Rechnungs-Pflichtvermerk | Robin | 0.3 · 0.4 |
| 2.4 | Rechnungslogik §25a + Kommission implementieren | Robin | 0.4 (StB-Freigabe) |
| 2.5 | `legacy_order`/`legacy_order_item` + Import Bestellhistorie | Robin | 0.6 |
| 2.6 | Kunden-Account-Migration: Invite-Flow + Historie-/Tier-Zuordnung | Robin | 0.6 · 1.2 |
| 2.7 | 17.315 Adressen an Kundenkonten/CRM hängen | Robin | 2.6 |
| 2.8 | Codex-Review des Cutover-Endpoints (Cross-Module) vor Implementierung | Robin | 2.3 |
| 2.9 | Membership-System: Tiers (Basis/Seller), Stripe-Subscriptions, Access-Gate, Seller-Kontingent | Robin | 0.6 |
| 2.10 | Bestandskunden-Übergangsregel ins Membership-Modell umsetzen (#9) | Robin + Frank | 0.6 · 2.6 |
| 2.11 | Paywall-aware Rendering (Inhalt offen, nur Transaktion gegated) + Canonical-Strategie + Structured Data der Commerce-App (Dok. 5) | Robin | 2.9 |

**Exit:** Alle 547 Artikel kaufbar · §25a-Rechnung an StB-Testfall abgenommen · Bestellhistorie pro Konto sichtbar · Invite-Flow getestet · Membership-System lauffähig (Tiers, Billing, Gate, Kontingent) · Bestandskunden-Übergang umgesetzt · Commerce-Seiten indexierbar (kein Cloaking).

---

## Phase 3 — tape-mag-Erlebnis-App neu bauen — Strang Erlebnis

| # | Aufgabe | Owner | Abhängigkeit |
|---|---------|-------|--------------|
| 3.1 | App-Gerüst auf gemeinsamem Stack (Next.js, Anbindung Katalog-DB) | Robin | — |
| 3.2 | Design/UX-Konzept der Erlebnis-App (Discovery, Entity-Seiten, Stöbern) | Robin + Frank | 0.1 |
| 3.3 | Read-only `/store`/`archive`-Routen + Meilisearch-Discovery-Anbindung | Robin | 3.1 |
| 3.4 | Entity-Seiten (Band/Label/Press) mit redaktionellem Content, Galerien, Embeds | Robin | 3.3 |
| 3.5 | Community in der Erlebnis-App verorten (gem. Entscheidung #3) | Robin | 0.6 · P4 |
| 3.6 | „Bei VOD verfügbar"-Verknüpfung zur Commerce-App | Robin | 3.4 |
| 3.7 | tape-mag-Mitglieder (3.632) → Account-/Community-Onboarding | Robin | 3.5 |
| 3.8 | SEO-Fundament der Erlebnis-App: SSR/SSG, Structured Data, segmentierte Sitemaps, Hub-Seiten, interne Verlinkung (Dok. 5) | Robin | 3.3 |

**Exit:** Neue tape-mag.com-App lauffähig · Katalog erlebbar · Community integriert · Verweis auf Commerce funktioniert · SEO-Fundament steht (Zone 1 voll crawlbar).

---

## Phase 4 — Community & Facebook-Content (parallel zu P2/P3)

| # | Aufgabe | Owner | Abhängigkeit |
|---|---------|-------|--------------|
| 4.1 | Frank schließt 2.140 Tier-2-Karten in `/app/fb-archive-review` ab | Frank | — |
| 4.2 | FB-Pipeline P6: Import 5.461 Posts → `community_post` | Robin | 4.1 |
| 4.3 | Hand-QA Community Increments 1–4 (Member + Admin) | Robin + Frank | — |

**Exit:** FB-Content live · Community-QA bestanden.

---

## Phase 5 — SEO, Domain & Email-Cutover

| # | Aufgabe | Owner | Abhängigkeit |
|---|---------|-------|--------------|
| 5.1 | URL-Inventar tape-mag.com + vod-records.com (Sitemap/GA4/GSC/Logs) | Robin | 0.2 |
| 5.2 | 301-Mapping-Matrix Alt-URL → Neu-URL + Catch-all (beide Welten) | Robin | 5.1 |
| 5.3 | Redirects in Nginx + Next.js implementieren & testen | Robin | 5.2 |
| 5.4 | Email-Postfächer Hetzner → all-inkl migrieren | Robin | 0.2 |
| 5.5 | **Parallel-Run:** beide neuen Apps live neben Alt-Systemen | Robin + Frank | P2 · P3 · 5.3 · 5.4 |
| 5.6 | Bestand-Freeze Alt-Shop, finaler Delta-Pull `maier_db2013` | Robin | 5.5 |
| 5.7 | **Cutover-Tag:** DNS umstellen, Redirects scharf, Alt-Systeme → Wartung | Robin + Frank | 5.6 |
| 5.8 | SEO-Launch-Check: Sold-Archive live, Structured-Data-Validierung, Sitemap-Einreichung, GSC-Monitoring (Dok. 5) | Robin | 5.7 |

**Exit:** Redirects verifiziert (keine 404-Spitzen, GSC ok) · Email auf neuer Infra · Delta-Pull eingespielt · Cutover vollzogen · SEO-Assets indexierbar + Sitemaps eingereicht.

---

## Phase 6 — Decommissioning (BLOCKER-Gate)

| # | Aufgabe | Owner | Abhängigkeit |
|---|---------|-------|--------------|
| 6.1 | Alte tape-mag-PHP-Seite abschalten | Robin | 5.3 verifiziert |
| 6.2 | vod-records.com-Shop (3wadmin) abschalten | Robin | 5.7 verifiziert |
| 6.3 | `legacy_sync_v2.py`-Cron stoppen | Robin | 6.1 |
| 6.4 | Hetzner Dedicated kündigen | Frank | 6.1 · 6.2 · 1.6 |

**Exit:** Keine Alt-Seite mehr live · kein verwaister Cron · Hetzner gekündigt · Cold-Backup gesichert.
**⚠️ Jeder Abschalt-Schritt erst nach verifiziertem Backup + verifiziertem Redirect.**

---

## Phase 7 — Stabilisierung & Launch

| # | Aufgabe | Owner |
|---|---------|-------|
| 7.1 | Beta-Invite-Wellen: vod-records-Kunden → tape-mag-Mitglieder → FB-Follower | Frank |
| 7.2 | Platform-Mode `beta_test` → `pre_launch` → `live` | Robin + Frank |
| 7.3 | Monitoring: 404-Raten, Conversion, Bestandskunden-Reaktivierung | Robin |
| 7.4 | CLAUDE.md + CHANGELOG + GitHub-Release aktualisieren | Robin |
| 7.5 | Ladengeschäft/POS P1 (StB-abhängig) — separater Strang | Frank |

---

## Risiko-Register

| Risiko | Wahrsch. | Wirkung | Gegenmaßnahme |
|---|---|---|---|
| StB-Freigabe §25a/Kommission verzögert | Hoch | P2 blockiert | P0 früh starten; P1/P3/P4 parallel vorziehen |
| SEO-Traffic-Einbruch nach Cutover | Mittel | Hoch | vollständige 301-Matrix, Catch-all, GSC-Monitoring |
| Membership-Paywall würgt Top-of-Funnel + SEO ab | Mittel | Hoch | tape-mag als freie Discovery-Ebene, nur Transaktion gegatet; Bestandskunden-Grandfathering; Preis-Deckungsrechnung |
| Bestandskunde verliert Historie/Zugang | Mittel | Reputationsschaden | Invite-Flow getestet, Legacy-Order-Archiv, Support-Mail |
| vod-records-Umsatzausfall im Cutover | Mittel | Hoch | Parallel-Run, klare „Bestellungen über X"-Regel, kurzer Freeze |
| tape-mag-App-Bau unterschätzt (echtes Frontend-Projekt) | Mittel | Mittel | bestehendes Fundament + Komponenten wiederverwenden, kein neuer Stack |
| Daten gehen bei Abschaltung verloren | Niedrig | Sehr hoch | Cold-Backup vor jedem Decommissioning-Schritt, verifizieren |
| Mail-Importer läuft erneut tot | Mittel | Mittel | Importer-v2 mit Last-Stufen, `pg_stat_activity`-Check |
| Zwei Alt-Systeme altern weiter (Delta wächst) | Hoch | Mittel | P6 zügig nach Cutover; Bestand-Freeze diszipliniert |

---

## Kritischer Pfad

```
P0.3 Kommissionsmodell ─► P0.4 StB-§25a-Freigabe ─► P2.4 Rechnungslogik ─► P2 Exit ─► P5.5 Parallel-Run ─► P5.7 Cutover ─► P6 Decommissioning
```

Der **StB-/Rechts-Strang ist der kritische Pfad** — nicht die Technik. Empfehlung: P0.3–0.5 sofort anstoßen; P1, P3 (tape-mag-App) und P4 parallel ziehen, damit die Wartezeit auf den StB produktiv genutzt wird.

---

## Was NICHT Teil dieses Plans ist

- Neuentwicklung des Fundaments — Backend/DB/Auktion/Festpreis existieren.
- Community-Phase-2-Features (Lists, Polls, Trending) — separater Roadmap-Strang.
- **Dritt-Verkäufer-Marktplatz** (RSE-291) — nächste Ausbaustufe *nach* der Migration. Aber: Entscheidung #4 (Kommissionsmodell) wird bereits in P0 getroffen und das `tax_scheme`/`seller_id`-Schema in P2 so angelegt, dass der Marktplatz additiv aufsetzen kann (Dok. 3 §3.9).

---

## Nächster Schritt

**Phase 0.1** — gemeinsame Sitzung mit Frank. Agenda = die 11 Entscheidungen; vollständige Vorlage in [`6_FRANK_AGENDA.md`](6_FRANK_AGENDA.md). Ergebnis entscheidet, ob der Umsetzungsplan in `docs/TODO.md` + Linear überführt wird.
