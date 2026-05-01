# Runbook — Mac-Onboarding Rollout (Phase 2.5)

**Zweck:** Den 7-Stage-Rollout des Multi-Mac-Modells aus [`DRUCKER_VERWALTUNG_KONZEPT.md`](../optimizing/DRUCKER_VERWALTUNG_KONZEPT.md) §13/§14 sicher durchziehen, ohne den laufenden Druckbetrieb (Frank Alpenstraße + David Eugenstraße) zu unterbrechen.

**Strategie:** Strangler-Pattern. Bridge bleibt dual-mode (rc52-env-vars + neuer DB-Fetch). Kay onboardet zuerst auf neuem Modus als Pilot. Frank/David werden erst migriert nachdem Kay 1-2 Wochen sauber druckt.

**Zielgruppe:** Robin (alle Stages), Frank (Mit-Validierung Stage A/D/E), Kay (selbst-Onboarding Stage D).

---

## Modell-Empfehlung pro Stage

| Stage | Modell | Begründung |
|---|---|---|
| A — DB + Admin-UI | Sonnet 4.6 | Standard-Pattern, viel Boilerplate |
| B — Bridge dual-mode | Sonnet 4.6 | Python-stdlib, klare Spec |
| **C — Pairing-Endpoint** | **Opus 4.7** | Sicherheitskritisch (TOCTOU, Rate-Limit, Hashing) |
| D — Kay-Pilot + Bugfixes | Sonnet 4.6 | Punkt-Fixes sobald Issues auftauchen |
| **E — Frank-Cutover** | **Opus 4.7** | Live-Druckbetrieb, schnelles Debugging nötig |
| F — David-Cutover | Sonnet 4.6 | Muster bereits in E erprobt |
| G — Cleanup (optional) | Sonnet 4.6 | Code-Removal |

`/model sonnet` bzw. `/model opus` zwischen den Sessions.

---

## Stage A — DB + Admin-UI (Sonnet 4.6)

**Ziel:** Drei neue Tabellen anlegen, `/app/erp/printers` und `/app/erp/bridges` Pages live, Initial-Daten aus rc52-State migriert. **Bridges bleiben unangetastet im env-var-Modus.**

**Risiko:** Nahe Null. Alles additiv. Frank/David merken nichts.

### Schritte

- [ ] Migration `printer`-Tabelle (Schema aus §4 des Konzepts)
- [ ] Migration `bridge_host`-Tabelle (Schema aus §13.1)
- [ ] Migration `bridge_pairing_token`-Tabelle (Schema aus §14.2)
- [ ] Initial-Daten-Migration: 2 Drucker (Alpenstraße + Eugenstraße) aus §4 SQL
- [ ] Initial-Daten-Migration: 2 Bridges (Frank-Mac-Studio + David-MBA) — `bridge_uuid` heute noch unbekannt → temporär `bridge_uuid = 'rc52-pre-pair-FRANK'` / `'rc52-pre-pair-DAVID'`, wird beim späteren Cutover (Stage E/F) auf echten UUID umgeschrieben
- [ ] Admin-Routes `/admin/erp/printers/*` (5 Endpoints aus §5.1)
- [ ] Admin-Routes `/admin/erp/bridges/*` (Listen + Detail + PATCH + DELETE)
- [ ] Admin-UI Page `/app/erp/printers` (Liste + Detail + Add) — siehe §7 Mockups
- [ ] Admin-UI Page `/app/erp/bridges` (Liste + Detail) — Pairing-Button noch deaktiviert (kommt in Stage C)
- [ ] **Test-Druck-Button** Backend-Pfad — direkt aus Backend an `printer.ip_address:port` via brother_ql, umgeht Bridge
- [ ] Sidebar-Shortcut für `/app/erp/printers` ergänzen (rc52.4-Pattern)

### Verifikation

- [ ] Frank loggt sich in `/app/erp/printers` ein, sieht beide Drucker, klickt Test-Druck → echtes Label kommt aus Alpenstraße-Drucker raus
- [ ] Frank klickt Test-Druck Eugenstraße → Label kommt im 2. Standort raus (David verifiziert vor Ort oder per Foto)
- [ ] Frank's normaler Druckworkflow im Inventory-Process unverändert (rc52-env-var-Modus läuft weiter)
- [ ] `/admin/erp/printers` returnt 200 mit beiden Drucker-Rows
- [ ] Vite-Cache geclearet vor Build (rm -rf node_modules/.vite .medusa) — sonst 404 auf neue Routes

### Rollback

```bash
# Auf VPS, falls Stage A schiefgeht:
psql ... -c "DROP TABLE bridge_pairing_token; DROP TABLE bridge_host; DROP TABLE printer;"
git revert <stage-a-commit>
# Admin-UI-Cards verschwinden mit Code-Revert
```

Frank/David weiterhin unbeeinflusst, weil die Bridge nichts an der DB liest.

---

## Stage B — Bridge dual-mode (Sonnet 4.6)

**Ziel:** Bridge-Version 2.3.0 deployt. **Aktiviert sich nicht automatisch** — solange `BRIDGE_API_TOKEN` nicht in plist gesetzt ist, läuft Bridge unverändert im rc52-env-var-Modus.

**Risiko:** Niedrig. Detection-Logik ist die einzige neue Code-Pfad die immer durchlaufen wird.

### Schritte

- [ ] `vod_print_bridge.py` v2.3.0:
  - [ ] Mode-Detection: wenn `BRIDGE_API_TOKEN` env gesetzt → DB-Fetch-Mode, sonst rc52-Modus
  - [ ] DB-Fetch-Pfad: HTTP-Polling alle 60s an `/api/print/printers`
  - [ ] Cache-File-Mgmt in `~/.local/lib/vod-print-bridge/printers.cache.json`
  - [ ] Heartbeat-Pfad: POST `/api/print/bridges/heartbeat` alle 5min
  - [ ] `/print?location=` resolved aus Cache statt aus env-vars (im DB-Fetch-Mode)
  - [ ] `/health` returnt zusätzlich `mode: "rc52" | "db_fetch"` für Drift-Banner
- [ ] `install-bridge.sh` v2.3.0 — bestehende rc52-Args weiter unterstützt, neue Optional-Args:
  - [ ] `--update-token <TOKEN>` (für späteres Token-Push ohne Re-Pair)
  - [ ] `--pair` und `--backend-url` werden in Stage C aktiviert, hier nur Skeleton
- [ ] Auf Frank/David **manuell** Update der Bridge:
  - [ ] `bash install-bridge.sh` (alte rc52-Args, ohne Token) → Bridge updated, bleibt im rc52-Modus
- [ ] Frontend `/health`-Drift-Banner erweitert: zeigt `mode` jetzt mit an

### Verifikation

- [ ] Frank's Mac: `curl https://localhost:17891/health` zeigt `mode: "rc52"`, alle Standorte aus env-vars
- [ ] David's Mac: dito
- [ ] Frank druckt 1 Test-Etikett im Inventory-Workflow → kommt raus wie immer
- [ ] David druckt 1 Test-Etikett → kommt raus wie immer
- [ ] Bridge-Version in `/health.version` zeigt `2.3.0`

### Rollback

```bash
# Auf jedem Mac:
launchctl bootout gui/$UID com.vod-auctions.print-bridge
git -C ~/vod-print-bridge checkout v2.2.x  # oder den rc52-Tag
bash install-bridge.sh  # rc52-Args
```

Wir haben den vorherigen Bridge-Code in einem getaggten Release, Rollback ist ein Befehl.

---

## Stage C — Pairing-Endpoint + UI (Opus 4.7)

**Ziel:** §14-Flow vollständig implementiert. Frank kann Pairing-Codes generieren, aber niemand löst einen ein.

**Risiko:** Endpoint ist öffentlich erreichbar. Sicherheits-Spec muss präzise stimmen. **Hier kein Sonnet.**

### Schritte

- [ ] `POST /admin/erp/bridges/pairing-tokens` — Code-Generation (Crockford-Base32, 12 Chars, TTL 30min)
- [ ] `GET /admin/erp/bridges/pairing-tokens/:id` — Status-Polling für UI
- [ ] **`POST /api/print/bridges/pair`** (öffentlich, kein Bearer):
  - [ ] `SELECT FOR UPDATE` auf `bridge_pairing_token` innerhalb Transaktion
  - [ ] Validierung: code matched + nicht expired + nicht used
  - [ ] Idempotenz: wenn `bridge_uuid` bereits in `bridge_host` existiert → existierende Row updaten + neuen Token, nicht duplizieren
  - [ ] api_token: 32-byte random, sha256-hash in DB, Klartext nur 1× in Response
  - [ ] Rate-Limit: 5/min/IP, 50/min global (express-rate-limit oder Redis)
- [ ] `POST /admin/erp/bridges/:id/rotate-token` — neuer Token, alter `revoked_at` gesetzt
- [ ] `install-bridge.sh --pair` — interaktiver Modus aus §14.4
- [ ] Admin-UI: „+ Neuen Mac pairen"-Button + Modal (§14.1) + Auto-Refresh-Polling
- [ ] `bridge_host`-Detail-Page „Token rotieren"-Button + Bestätigungs-Modal

### Verifikation (mit Test-Mac)

**Wichtig: nicht mit Kays MBA testen — erst auf Test-Mac (Robin's eigenem Mac in DRY_RUN-Modus oder einer VM).**

- [ ] Robin auf Test-Mac: `bash install-bridge.sh --pair` mit von Frank generiertem Code → Bridge starts
- [ ] Test-Mac sendet Heartbeat → erscheint in `/app/erp/bridges` als grüner Punkt
- [ ] Robin: Token rotieren → Test-Mac's Bridge meldet 401 nach nächstem Poll
- [ ] Robin: erneut pair mit demselben Test-Mac → existierende `bridge_host`-Row wird updated, kein Duplikat
- [ ] Code-Bruteforce: 5 falsche Codes hintereinander → 6. Versuch wird per Rate-Limit geblockt
- [ ] Code 31 Min nach Generierung einlösen → 410 Gone
- [ ] Code 2× einlösen → 2. Versuch fail wegen `used_at IS NOT NULL`

### Rollback

```bash
# Backend Endpoint deaktivieren via Feature-Flag:
# UPDATE site_config SET features = features || '{"pairing_enabled": false}' WHERE id=1;
# Bridge-Version 2.3.0 bleibt drauf, Pairing-UI versteckt
```

Frank/David sind weiterhin im rc52-Modus, Stage C kann komplett zurückgenommen werden ohne Mac-Touch.

---

## Stage D — Kay als Pilot (Sonnet 4.6 für Bugfixes)

**Ziel:** Kay arbeitet 1-2 Wochen ausschließlich über das neue System. Frank/David weiter im rc52-Modus, **null Berührung**.

**Risiko:** Auf Kay isoliert. Wenn was schiefgeht — temporär kann Kay rc52-Mode-Bridge bekommen, oder Print-Bedarf wird kurz manuell überbrückt.

### Schritte

- [ ] Frank generiert Pairing-Code für „Kay" in `/app/erp/bridges` (mobil ✓, kein default_location)
- [ ] Kay öffnet Terminal auf seinem MBA und führt aus:
  ```bash
  curl -fsSL https://api.vod-auctions.com/install-bridge.sh | bash -s -- --pair
  ```
- [ ] Kay tippt Code → Bridge startet
- [ ] Kay öffnet Inventur-Session, wählt 📍-Standort, druckt Test-Etikett
- [ ] Verifikation: Etikett kommt am gewählten Drucker raus
- [ ] Soak-Periode startet (Kalender-Eintrag setzen für Stage E)

### Soak-Periode (1-2 Wochen)

Was zu monitoren:
- [ ] Kays Bridge-Status in `/app/erp/bridges` bleibt grün (Heartbeat alle 5min)
- [ ] `last_print_at` läuft hoch wenn Kay arbeitet
- [ ] `last_location_used` flippt korrekt zwischen Standorten wenn Kay wechselt
- [ ] Keine Kay-Tickets mit „Etikett kam nicht raus" / „falscher Drucker" / „Bridge tot"
- [ ] Drift-Banner bleibt grün

Mindest-Datenpunkte vor Stage E:
- [ ] **5+ Drucktage** mit echtem Volumen (>20 Etiketten)
- [ ] **Mindestens 1× Standort-Wechsel** durch Kay (z.B. von Eugenstraße nach Alpenstraße oder umgekehrt) ohne Probleme
- [ ] **Mindestens 1× Mac-Reboot** auf Kays MBA — Bridge muss self-resume mit Cache-File
- [ ] **Mindestens 1× Token-Rotation-Drill** durch Frank für Kay (Test der Rotate-Funktion + Re-Pair-Idempotenz)
- [ ] **0 Severity-1-Issues** in der Soak-Periode

### Was tun bei Issues während Soak

- Bug auftauchend → Sonnet patcht → re-deploy → Kay testet → Soak-Counter neu starten
- Kay komplett blockiert (kann nicht drucken) → temporär `bash install-bridge.sh` mit rc52-Args (env-var-Mode) auf seinem Mac → Kay arbeitet weiter, neuer DB-Fetch-Mode wird gefixt → re-pair später
- Bridge-API-Endpoint instabil → Feature-Flag aus § Stage C zur Deaktivierung

---

## Stage E — Frank-Cutover (Opus 4.7)

**Ziel:** Frank-Mac-Studio von rc52-env-var-Modus auf DB-Fetch-Modus migrieren. ~5 Min Ausfall, Rollback in <2 Min möglich.

**Risiko:** Höchstes Risiko des ganzen Rollouts. Fehler hier blockiert Frank's Tagesgeschäft. **Nur auf Opus, nur außerhalb Inventur-Stunden, nur mit Robin live dabei.**

### Pre-Flight (alle muss-grün vor Cutover)

- [ ] Stage D mindestens **5 Drucktage** ohne Issue, Soak-Counter bei 0 Resets
- [ ] Test-Druck-Button für Frank's Drucker (`/app/erp/printers/<alpenstrasse-id>` → „Test-Druck") — **einmal grün** in den letzten 24h. Beweist dass DB-Fetch-Pfad und Backend→Drucker-Konnektivität stehen, ohne Frank's Mac anzufassen
- [ ] Rollback-Snippet in 1Password Note **„Frank Bridge Rollback rc52"** vorbereitet:
  ```bash
  # ROLLBACK: Frank's Bridge zurück auf rc52-env-var-Modus
  cd ~/vod-print-bridge
  bash install-bridge.sh \
    --printer-for ALPENSTRASSE=10.1.1.136 \
    --printer-for EUGENSTRASSE=192.168.1.124 \
    --default-location ALPENSTRASSE
  # Bridge restartet automatisch, env-var-Mode aktiv
  ```
  - **WICHTIG:** IPs aus aktueller DB lesen, nicht aus alten Notizen — DHCP-Drift möglich. Vor Stage E in `/app/erp/printers` nachsehen.
- [ ] Cutover-Slot fix terminiert: ruhiger Sonntagabend ODER frühmorgens (vor 8:00) ODER abends (nach 19:00). **Niemals** während Inventur-Stunden.
- [ ] Robin physisch oder per Screen-Share dabei. Kein SSH-only-Cutover.
- [ ] Frank weiß Bescheid und ist bereit, nach Cutover sofort 3 Test-Etiketten zu drucken
- [ ] Backup der aktuellen Frank's plist: `cp ~/Library/LaunchAgents/com.vod-auctions.print-bridge.plist ~/Desktop/plist-backup-frank-$(date +%Y%m%d).plist`

### Cutover-Schritte

- [ ] Frank in `/app/erp/bridges`: Klick „Re-Pair Frank-Mac-Studio" (oder neuen Eintrag „Frank" mit `is_mobile=false, default_location=ALPENSTRASSE`)
- [ ] Backend zeigt Pairing-Code
- [ ] Auf Frank's Mac (Robin physisch oder live per Screen-Share):
  ```bash
  bash ~/vod-print-bridge/install-bridge.sh --pair
  ```
- [ ] Pairing-Code eintippen → Bridge startet, plist umgeschrieben
- [ ] `curl https://localhost:17891/health` → `mode: "db_fetch"`, `printers: [Alpenstraße, Eugenstraße]`
- [ ] Frank druckt **3 Test-Etiketten** aus dem normalen Inventur-Workflow:
  - [ ] 1× am Alpenstraße-Drucker (default)
  - [ ] 1× nach Standort-Wechsel auf Eugenstraße (Override-Test)
  - [ ] 1× zurück Alpenstraße
- [ ] Frank bestätigt: alle 3 kamen am richtigen Drucker raus
- [ ] In `/app/erp/bridges` zeigt Frank-Mac-Studio grünen Punkt + `last_print_at` aktualisiert

### Wenn auch nur 1 Test-Etikett scheitert: SOFORT-ROLLBACK

```bash
# Auf Frank's Mac, ohne Diskussion:
bash ~/vod-print-bridge/install-bridge.sh \
  --printer-for ALPENSTRASSE=<aktuelle-IP-aus-DB> \
  --printer-for EUGENSTRASSE=<aktuelle-IP-aus-DB> \
  --default-location ALPENSTRASSE
```

Bridge ist in <2 Min zurück im rc52-Mode. Frank arbeitet weiter. Issue wird offline analysiert (Bridge-Logs, Backend-Logs, Heartbeat-Trail), nicht live debuggt während Frank wartet.

### Post-Cutover (gleicher Tag)

- [ ] Frank arbeitet 1 vollständige Inventur-Session ohne Hilfe
- [ ] Robin checkt am Abend Bridge-Heartbeat-Log, `last_print_at`-Häufigkeit, irgendwelche Errors
- [ ] CHANGELOG-Entry rcXX.X — „Frank-Mac-Studio auf DB-Fetch-Mode migriert"
- [ ] GitHub-Release-Tag

---

## Stage F — David-Cutover (Sonnet 4.6)

**Ziel:** David-MBA migrieren. Identisches Muster wie Stage E, aber Sonnet ausreichend weil Pattern jetzt erprobt.

### Schritte

- [ ] Pre-Flight wie Stage E (außer „Stage D Drucktage" — das gilt mittlerweile auch für Frank's Daten)
- [ ] Cutover-Slot terminiert
- [ ] David per Screen-Share oder physisch dabei
- [ ] Pairing für „David" — `is_mobile=true`, `default_location=EUGENSTRASSE` (David ist meistens dort, aber MBA → mobil)
- [ ] `--pair`-Flow auf David's MBA
- [ ] 3 Test-Etiketten (Alpenstraße + Eugenstraße + Standort-Wechsel)
- [ ] Rollback-Snippet parat (analog Frank)

---

## Stage G — Cleanup (optional, Sonnet 4.6, Wochen später)

**Trigger:** alle aktiven Macs (Frank, David, Kay, ggf. Person 4) seit ≥4 Wochen im DB-Fetch-Mode ohne Issue.

### Schritte

- [ ] env-var-Pfad aus `vod_print_bridge.py` entfernen — nur noch DB-Fetch-Mode
- [ ] Mode-Detection raus, Code wird linearer
- [ ] `install-bridge.sh` `--printer-for`-Flag entfernen, nur noch `--pair`
- [ ] CHANGELOG: „rc52-env-var-Bridge-Mode end-of-life"
- [ ] Bridge-Version 3.0.0

**Auf jedem Mac einmal:** `bash install-bridge.sh --update` ohne Args (zieht neue Bridge-Version, Token bleibt).

---

## Allgemeine Notfall-Schalter

### Pairing global deaktivieren

```sql
UPDATE site_config SET features = features || '{"pairing_enabled": false}'::jsonb;
```

→ `/api/print/bridges/pair` returnt 503. Existierende Bridges laufen weiter, neue können nicht pairen.

### DB-Fetch-Mode global deaktivieren (Bridges fallen auf Cache zurück)

```sql
UPDATE site_config SET features = features || '{"printer_db_fetch_enabled": false}'::jsonb;
```

→ Backend `/api/print/printers` returnt 503, Bridges nutzen letzten Cache. **Achtung:** wenn ein Drucker während dieser Zeit IP-Drift hat, fällt der betroffene Mac aus bis Flag wieder true.

### Einzelnen Mac killen

In `/app/erp/bridges/:id`: „Token rotieren" → Mac druckt sofort nicht mehr. Oder „Soft-Disable" → Mac auch in `/health` als inaktiv.

---

## Erfolgs-Definition

- [ ] Alle aktiven Macs im DB-Fetch-Mode
- [ ] Kay (+ ggf. Person 4) onboarded ohne Robin-SSH-Eingriff
- [ ] Drucker-IP-Drift propagiert ≤60s zu allen Macs
- [ ] `/app/erp/bridges` zeigt 4 grüne Punkte
- [ ] Verlorenes-MBA-Drill (Token rotieren von einem Mac, andere unbetroffen) einmal real durchgespielt
- [ ] CHANGELOG + GitHub-Release pro Stage E/F gepostet

---

## Verwandte Dokumente

- [`docs/optimizing/DRUCKER_VERWALTUNG_KONZEPT.md`](../optimizing/DRUCKER_VERWALTUNG_KONZEPT.md) §13/§14 — technische Tiefe
- [`docs/operations/MAC_ONBOARDING.md`](../operations/MAC_ONBOARDING.md) — User-facing Anleitung für Frank/Kay
- [`docs/hardware/BROTHER_QL_820NWB_SETUP.md`](../hardware/BROTHER_QL_820NWB_SETUP.md) — Drucker-Hardware
