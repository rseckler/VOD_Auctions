# Development Governance — VOD Auctions

**Version:** 1.0
**Erstellt:** 2026-04-05
**Geltungsbereich:** Alle Entwicklungsarbeiten an der VOD Auctions Plattform (Storefront, Backend, Admin, Scripts, Infrastruktur)
**Status:** Verbindlich

---

## 1. Kernprinzip

**Deploy early, activate when ready.**

Jede neue Funktionalität wird deployed, sobald sie code-complete und getestet ist — unabhängig davon, ob sie operativ aktiviert wird. Die Trennung von Deployment, Aktivierung und fachlichem Go-Live ist kein optionaler Prozess, sondern Grundprinzip der Plattformentwicklung.

Das bedeutet:
- **Deployment ≠ Aktivierung.** Code kann wochenlang deployed sein, ohne den Betrieb zu beeinflussen.
- **Aktivierung ≠ Go-Live.** Ein Feature kann intern getestet werden, bevor es für Endnutzer sichtbar wird.
- **Go-Live ≠ Fertig.** Nach Aktivierung wird beobachtet, gemessen und bei Bedarf zurückgerollt.

---

## 2. Warum diese Methodik

Das Live-System läuft und wird aktiv genutzt. Gleichzeitig werden größere Features und Architektur-Erweiterungen entwickelt. Beides muss parallel möglich sein, ohne dass sich die Arbeitsströme blockieren.

Konkret:
- Bug-Fixes und kleine Verbesserungen am Live-System müssen jederzeit deployed werden können.
- Neue Features müssen entwickelt und getestet werden, ohne Live-Daten zu gefährden.
- Einzelne Komponenten sollen vor einem Gesamt-Release kontrolliert ins Live-System überführbar sein.
- Bestehende Geschäftslogik (Auktionen, Payments, Checkout) darf nicht gebrochen werden.

---

## 3. Feature Flags

### Konzept

Neue Funktionalität wird hinter Feature Flags deployed. Ein Feature Flag ist ein Boolean in der `site_config`-Tabelle, der über den Admin unter `/admin/config` umgeschaltet werden kann.

```typescript
// backend/src/lib/feature-flags.ts
export const FEATURES = {
  // Beispiele — jedes neue Feature erhält einen eigenen Flag
  ERP_INVOICING: false,
  ERP_SENDCLOUD: false,
  MARKETPLACE_SELLER: false,
  CATALOG_V2: false,
} as const
```

### Regeln

| Regel | Beschreibung |
|-------|-------------|
| **Jedes nicht-triviale Feature bekommt einen Flag** | Ausnahme: reine Bug-Fixes, CSS-Änderungen, Dokumentation |
| **Default = false** | Kein Feature ist bei Deployment automatisch aktiv |
| **Flag-Name ist sprechend** | `ERP_SENDCLOUD`, nicht `FEATURE_42` |
| **Flag wird im Code geprüft** | `if (siteConfig.features.ERP_SENDCLOUD) { ... } else { bestehenderWorkflow() }` |
| **Kein Mischbetrieb** | Wenn ein Flag aktiv ist, ersetzt der neue Pfad den alten vollständig für den betreffenden Prozess |
| **Cleanup nach Stabilisierung** | 4 Wochen nach vollständiger Aktivierung: Flag und alten Code-Pfad entfernen |

### Flag-Lebenszyklus

```
Flag erstellt (false)
  → Code deployed (Feature inaktiv im Live-System)
  → Staging-Test (Flag auf Staging = true)
  → Interner Pilot (Flag auf Production = true, nur für Admin sichtbar)
  → Selektiver Rollout (Flag = true, Feature für alle aktiv)
  → Stabilisierungsphase (4 Wochen beobachten)
  → Cleanup (Flag entfernen, alter Code-Pfad entfernen)
```

---

## 4. Branching-Strategie

```
main ──────────────────────────────────────────────→  (Production)
  │                                              ↑
  ├── hotfix/fix-xyz ─────────────────────────→──┤    (Hotfixes direkt)
  │                                              │
  └── develop ─────────────────────────────────→──┤    (Next Release)
        │                                        │
        ├── feature/erp-inventory ──→┐           │
        ├── feature/erp-sendcloud ──→┤  merge    │
        ├── feature/catalog-v2 ─────→┤  nach     │
        └── feature/marketplace ────→┘  develop  │
                                                 │
        develop → main (Release-Tag) ────────────┘
```

### Branch-Typen

| Branch | Lebt auf | Merge-Ziel | Wann |
|--------|---------|-----------|------|
| `main` | Production | — | Immer stabil, jeder Commit = deploybar |
| `develop` | Integration | `main` (bei Release) | Sammelt fertige Features |
| `feature/*` | Lokal + GitHub | `develop` | Wenn Feature code-complete + getestet |
| `hotfix/*` | Lokal + GitHub | `main` + `develop` | Für dringende Live-Fixes |

### Regeln

- **Jeder Commit auf `main` muss das Live-System stabil halten.**
- Feature-Branches werden erst nach Staging-Test auf `develop` gemergt.
- Hotfixes gehen direkt auf `main` UND werden in `develop` zurückgemergt.
- Merge-Konflikte werden auf dem Feature-Branch gelöst, nie auf `main`.
- Release-Tags: `v2026.MM.DD` oder `v2026.MM.DD-name` für benannte Releases.

---

## 5. Umgebungsmodell

```
┌────────────┐    ┌──────────────┐    ┌────────────────┐    ┌────────────┐
│ Local Dev  │ →  │ Feature      │ →  │ Staging        │ →  │ Production │
│            │    │ Branch       │    │ (Testdaten)    │    │ (VPS)      │
│ localhost  │    │ GitHub       │    │ VPS :3007/:9001│    │ VPS :3006  │
│ :3000/9000 │    │              │    │ Separate DB    │    │ :9000      │
└────────────┘    └──────────────┘    └────────────────┘    └────────────┘
```

### Umgebungen

| Umgebung | Zweck | Daten | Zugang |
|----------|-------|-------|--------|
| **Local Dev** | Entwicklung, schnelle Iteration | Lokale DB oder Dev-Supabase | Entwickler |
| **Staging** | Integration-Test, Feature-Validierung | Testdaten (keine echten Kundendaten) | Team |
| **Production** | Live-Betrieb | Echte Daten | Öffentlich |

### Staging-Umgebung

- Separate Supabase-Datenbank (oder Schema) mit Testdaten
- Storefront auf Port 3007, Backend auf Port 9001
- sevDesk/easybill Sandbox-Account für Rechnungstests
- Sendcloud Test-Modus (Labels werden nicht an Carrier übermittelt)
- Stripe Test-Mode (bestehend)
- Feature Flags können unabhängig von Production gesetzt werden

---

## 6. Datenbank-Migrationen

### Regeln

| Erlaubt | Verboten |
|---------|---------|
| `CREATE TABLE IF NOT EXISTS` | `DROP TABLE` auf Live-Tabellen |
| `ALTER TABLE ADD COLUMN IF NOT EXISTS` (nullable, mit Default) | `DROP COLUMN` auf Live-Tabellen |
| `CREATE INDEX` | `RENAME COLUMN` auf Live-Tabellen |
| Neue Constraints auf neuen Tabellen | `ALTER TYPE` auf bestehenden Spalten |

### Grundsatz

- Neue Tabellen und Spalten sind immer sicher — sie haben keine Auswirkung auf bestehende Queries.
- Bestehende Tabellen werden nur **additiv** verändert.
- Datenmigrationen (z.B. Release → inventory_item) laufen als **separate, idempotente Scripts** — nicht als DB-Migration.
- Jede Migration muss einen dokumentierten Rollback-Pfad haben.

---

## 7. API-Versionierung

### Regeln

- Bestehende Endpunkte bleiben stabil. Keine Breaking Changes auf bestehenden Routen.
- Neue Funktionalität bekommt **eigene Routen** unter eigenem Prefix (z.B. `/admin/erp/*`).
- Wenn bestehende Endpunkte neue Daten zurückgeben sollen: **Optional**, via Query-Parameter (`?include=erp_data`), geprüft gegen Feature Flag.
- Deprecation: Mindestens 4 Wochen Vorlauf, dokumentiert im CHANGELOG.

---

## 8. Modulare Komponentenübernahme

### 5-Stufen-Aktivierungsmodell

Jede neue Komponente durchläuft diese Stufen:

```
1. DEPLOYED       → Code ist auf Production, Feature Flag = false
                     Tabellen existieren, Endpunkte antworten (leer/404)
                     Kein Einfluss auf laufende Prozesse

2. DARK            → Feature Flag = true, aber kein UI-Zugang für Endnutzer
                     Nur über direkte API-Calls oder Admin testbar

3. INTERN          → Im Admin sichtbar und nutzbar (nur für Team)
                     Endnutzer sehen nichts davon

4. SELEKTIV LIVE   → Für ausgewählte Nutzer oder Prozesse aktiv
                     z.B. nur für neue Bestellungen, nicht für bestehende

5. VOLL LIVE       → Für alle aktiv, alter Code-Pfad wird entfernt
```

### Entscheidungs-Framework

Vor jeder Aktivierung muss geprüft werden:

| Frage | Antwort bestimmt |
|-------|-----------------|
| Ist die Komponente technisch stabil? (Tests grün, keine Errors) | Übergang 1→2 |
| Funktioniert sie mit echten Daten? (Staging-Test bestanden) | Übergang 2→3 |
| Ist die fachliche Logik validiert? (StB, Anwalt, Product Owner) | Übergang 3→4 |
| Sind betroffene Nutzer informiert? | Übergang 4→5 |
| Gibt es einen dokumentierten Rollback-Plan? | Voraussetzung für jede Stufe |

### Wer entscheidet?

| Übergang | Entscheider |
|----------|-----------|
| Deployed → Dark | Entwickler (technische Bereitschaft) |
| Dark → Intern | Entwickler + Product Owner (fachliche Prüfung) |
| Intern → Selektiv Live | Product Owner + ggf. Steuerberater/Anwalt |
| Selektiv → Voll Live | Product Owner (nach Stabilisierungsphase) |

---

## 9. Aktivierungs-Matrix (Template)

Für jede neue Komponente wird diese Matrix ausgefüllt:

| Dimension | Bewertung |
|-----------|----------|
| Technisch deploybar? | Ja / Nein / In Arbeit |
| Feature-Flag-fähig? | Ja / Nein (Einmalvorgang) |
| Dark Launch möglich? | Ja / Nein |
| Interner Pilot möglich? | Ja / Nein |
| Alt/Neu parallel möglich? | Ja / Nein / Nicht sinnvoll |
| Datenmigration vor Aktivierung nötig? | Ja (welche?) / Nein |
| Rollback realistisch? | Ja (wie?) / Nein (warum?) |
| Klarer Cutover nötig? | Ja (wann?) / Nein |
| Fachliche Freigabe erforderlich? | Ja (wer?) / Nein |
| Operative Verantwortung | Name/Rolle |

---

## 10. Rollback-Strategie

### Grundsatz

Jedes Feature muss einen dokumentierten Rollback-Plan haben, bevor es über Stufe 2 (Dark) hinaus aktiviert wird.

### Rollback-Typen

| Typ | Wann | Wie |
|-----|------|-----|
| **Feature-Flag-Rollback** | Feature ist Flag-gesteuert | Flag auf `false` setzen → sofort inaktiv |
| **Code-Rollback** | Defekter Code auf main | `git revert` + Deploy |
| **Daten-Rollback** | Fehlerhafte Datenmigration | Vorbereitetes Rollback-Script ausführen |
| **Kein Rollback möglich** | Irreversible Datenänderung | Muss VOR Aktivierung dokumentiert und akzeptiert sein |

### Regeln

- Feature-Flag-Rollback muss in < 5 Minuten möglich sein (Admin Toggle).
- Code-Rollback muss in < 15 Minuten möglich sein (git revert + deploy).
- Daten-Rollback-Scripts werden VOR der Migration geschrieben und auf Staging getestet.
- Wenn kein Rollback möglich ist: Explizite Freigabe durch Product Owner vor Aktivierung.

---

## 11. Code-Qualität und Review

### Vor jedem Merge auf develop/main

- [ ] Build erfolgreich (`npm run build`)
- [ ] Keine neuen TypeScript-Fehler
- [ ] Keine neuen hardcoded Hex-Werte (Tokens nutzen)
- [ ] Keine neuen `window.confirm` oder `window.alert`
- [ ] Feature Flag vorhanden (wenn nicht-triviales Feature)
- [ ] Bestehende Funktionalität nicht gebrochen (Bidding, Checkout, Auth)
- [ ] Mobile getestet (390px Viewport)
- [ ] Accessibility: Focus-States, aria-Labels, Touch Targets ≥ 44px

### Vor jedem Deploy auf Production

- [ ] Staging-Test bestanden
- [ ] Feature Flag korrekt konfiguriert
- [ ] Rollback-Plan dokumentiert
- [ ] CHANGELOG.md aktualisiert
- [ ] Keine Testdaten im Commit

---

## 12. Dokumentation

### Pflicht-Dokumentation

| Dokument | Wann aktualisieren |
|----------|-------------------|
| `CHANGELOG.md` | Bei jedem Deploy auf Production |
| `CLAUDE.md` | Bei neuen API-Endpunkten, DB-Tabellen, Konfigurationen |
| Feature-spezifische Docs (z.B. ERP-Konzept) | Bei Architekturänderungen |
| Linear Issues | Status-Updates bei Fortschritt |

### Commit-Messages

Format:
```
Kurze Beschreibung (max 72 Zeichen)

Optionaler Detailtext der erklärt was und warum.
GAP-IDs oder RSE-IDs wenn relevant.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

---

## 13. Deploy-Prozess

### Standard-Deploy (Storefront)

```bash
# 1. Push auf main
git push origin main

# 2. VPS: Pull + Build + Restart
ssh root@72.62.148.205
cd /root/VOD_Auctions && git pull origin main
cd storefront && npm run build && pm2 restart vodauction-storefront
```

### Standard-Deploy (Backend)

```bash
ssh root@72.62.148.205
cd /root/VOD_Auctions && git pull origin main
cd backend && npx medusa build
rm -rf public/admin && cp -r .medusa/server/public/admin public/admin
pm2 restart vodauction-backend
```

### Regeln

- **Reihenfolge:** Immer `git push` auf Mac BEVOR `git pull` auf VPS.
- **Admin Build:** `.medusa/server/public/admin/` MUSS nach `public/admin/` kopiert werden.
- **Neue Dependencies:** `npm install` auf VPS ausführen.
- **Neue Admin-Routes:** Vite-Cache clearen: `rm -rf node_modules/.vite .medusa`
- **SSH:** Nie parallele SSH-Calls zum VPS (Hostinger Rate-Limiting).

---

## 14. Incident-Handling

### Wenn etwas auf Production kaputt geht

1. **Assess:** Ist es user-facing? Betrifft es Payments/Bidding?
2. **Mitigate:** Feature Flag auf `false` wenn möglich (< 5 Min)
3. **Fix:** Hotfix-Branch von `main`, Fix implementieren
4. **Test:** Lokal testen, dann auf Staging wenn Zeit erlaubt
5. **Deploy:** Hotfix auf `main` mergen + deployen
6. **Backmerge:** Hotfix in `develop` mergen
7. **Postmortem:** Was ist passiert, warum, wie verhindern wir es künftig

### Severity-Level

| Level | Beschreibung | Reaktionszeit |
|-------|-------------|---------------|
| **P0** | Payments/Bidding kaputt, Datenverlust | Sofort |
| **P1** | Feature defekt, User sehen Fehler | < 4 Stunden |
| **P2** | Visueller Bug, Performance-Problem | Nächster Arbeitstag |
| **P3** | Kosmetisch, Edge-Case | Nächster Sprint |

---

*Dieses Dokument ist verbindlich für alle Entwicklungsarbeiten an der VOD Auctions Plattform. Es wird bei Bedarf aktualisiert — Änderungen werden im CHANGELOG dokumentiert.*

*Version 1.0 — 2026-04-05 — Robin Seckler*
