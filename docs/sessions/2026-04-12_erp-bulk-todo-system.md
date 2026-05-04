# Session 2026-04-12 — ERP Bulk +15% + TODO-System Setup

**Dauer:** ~2h
**Fokus:** V5 Scratch-Test, Bulk +15% Ausführung, 3-Ebenen TODO-System aufgebaut, Linear-Audit

---

## TL;DR

- **V5 Scratch-Test bestanden** — Test-Item `legacy-release-28094` mit `price_locked=true` gelockt, Sync-Run 06:00 UTC abgewartet, Preis unverändert, 0 Violations. Sync-Schutz funktioniert unter Last.
- **Bulk +15% ausgeführt** — 13.107 Cohort-A Items, €404.929 → €465.358, alle Preise auf ganze Euro gerundet, 13.107 Audit-Movements erstellt. Log-ID: `bulk_15pct_20260412_060527`.
- **3-Ebenen TODO-System aufgebaut:**
  1. `CLAUDE.md` → Current Focus (Top-3 Aktionen)
  2. `docs/TODO.md` → Operative Arbeitsliste (Now/Next/Later + 10 Workstreams)
  3. Linear → Management-Ebene (7 offene Issues mit Blocking-Ketten)
- **Linear-Audit:** 69 Issues geprüft, RSE-78 auf High gesetzt, RSE-227/RSE-288 Descriptions aktualisiert, RSE-294 + RSE-295 neu angelegt, RSE-79/RSE-80 als fehlend identifiziert.
- **Reusable Template** erstellt: `1_Overview/templates/PROJECT_MANAGEMENT_TEMPLATE.md` — anwendbar auf alle 30 Projekte.

---

## 1. V5 Scratch-Test

| Schritt | Ergebnis |
|---|---|
| Test-Item gelockt (`legacy-release-28094`, €1.00) | `price_locked=true` seit 05:46 UTC |
| Sync-Run 06:00 UTC (id=25493) abgewartet | `phase=success`, `validation_status=warnings` (nur V3 orphan_labels) |
| `legacy_price` geprüft | Unverändert €1.00 |
| `sync_change_log` geprüft | 0 Rows für dieses Release |
| Cleanup | `price_locked=false` zurückgesetzt + Audit-Movements |

## 2. Bulk +15%

| Metrik | Wert |
|---|---|
| Eligible Items | 13.107 |
| Gesamtwert vorher | €404.929 |
| Gesamtwert nachher | €465.358 |
| Uplift | +€60.429 (~14,9% effektiv) |
| Rundung | Alle Preise ganze Euro (ROUND(x * 1.15, 0)) |
| Audit-Trail | 13.107 Movements mit `reason='bulk_15pct_2026'` |
| Log-ID | `bulk_15pct_20260412_060527` |
| Spot-Check | 10 Random-Releases: `cent_remainder=0.00` |

## 3. TODO-System

### Struktur

```
CLAUDE.md          → Current Focus: Top-3 nächste Aktionen + Verweis auf TODO.md
docs/TODO.md       → Now/Next/Later + 10 Workstreams mit Ziel/Status/Blocker/Nächste Aktion
Linear             → 7 offene Issues: RSE-78, RSE-227, RSE-288, RSE-289, RSE-291, RSE-294, RSE-295
```

### Now (aktiv)
1. Inventur-Aktivierung (Frank briefen)
2. Launch-Vorbereitung (AGB-Anwalt)

### Next (wartet auf Trigger)
3. POS Walk-in Sale (StB-Termin)
4. Sendcloud-Integration
5. Sync Monitoring

### Later (bewusst geparkt)
6-10: Entity Overhaul, CRM, Admin UI, Invoicing, Checkout Phase C

## 4. Linear-Audit

| Aktion | Details |
|---|---|
| RSE-78 | Priority Medium → **High**, Description mit Blocker |
| RSE-227 | Description: P2 paused, Budget-Stand |
| RSE-288 | Description: Import DONE, nur Preisvergleich-UI fehlt |
| RSE-294 (neu) | Erste öffentliche Auktionen, blocked by RSE-78 |
| RSE-295 (neu) | Marketing-Strategie, blocked by RSE-294 |
| RSE-79, RSE-80 | Fehlen in Linear (in CLAUDE.md referenziert aber nie angelegt), ersetzt durch RSE-294/RSE-295 |

## 5. Dokumentation aktualisiert

| Datei | Was |
|---|---|
| `INVENTUR_COHORT_A_KONZEPT.md` | DB-Stand, Aktivierungs-Checkliste (6/9 abgehakt) |
| `CHANGELOG.md` | rc26 + ERP_INVENTORY Flag active |
| `CLAUDE.md` | ERP Status, Current Focus, Linear-Tabelle |
| `docs/TODO.md` | Komplett neu: Now/Next/Later + 10 Workstreams |
| Memory: `feedback_session_todo_bridge.md` | Session→TODO Brücke |

## 6. Offene Next Actions (→ TODO.md)

- [ ] Frank briefen für Inventur (E3-E5 in TODO.md)
- [ ] AGB-Anwalt beauftragen (L1)
- [ ] StB-Termin für POS §10 (POS-D1/D2)

---

## Referenzen

- Template: `1_Overview/templates/PROJECT_MANAGEMENT_TEMPLATE.md`
- TODO: `docs/TODO.md`
- Konzept: `docs/optimizing/INVENTUR_COHORT_A_KONZEPT.md`
- CHANGELOG: `docs/architecture/CHANGELOG.md` (rc26)
