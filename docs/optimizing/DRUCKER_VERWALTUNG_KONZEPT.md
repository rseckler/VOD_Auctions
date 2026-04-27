# Drucker-Verwaltung — Konzept

**Status:** Draft (2026-04-27, post rc52 verfasst)
**Owner:** Robin
**Implementierung:** offen, bewusst zurückgehalten bis 3. Standort sich abzeichnet
**Verwandt:** `BROTHER_QL_820NWB_SETUP.md` · `INVENTUR_WORKFLOW_V2_KONZEPT.md` · `POS_WALK_IN_KONZEPT.md`

---

## 1. Status quo (rc52, 2026-04-27)

Drucker-Konfiguration ist **statisch in der LaunchAgent-plist** auf jedem Mac eingebrannt:

```bash
# install-bridge.sh schreibt diese env-vars in com.vod-auctions.print-bridge.plist
VOD_PRINT_BRIDGE_PRINTERS_JSON='{"ALPENSTRASSE":"10.1.1.136","EUGENSTRASSE":"192.168.1.124"}'
VOD_PRINT_BRIDGE_DEFAULT_LOCATION="ALPENSTRASSE"
VOD_PRINT_BRIDGE_MODEL="QL-820NWB"
VOD_PRINT_BRIDGE_LABEL="29"
```

Die Bridge route per `/print?location=<CODE>` aus dieser JSON-Map zur passenden IP. Frontend matcht über `warehouse_location.code` (Code-String, Pflicht-Match — siehe rc52.3 Drift-Banner).

**Aktueller Bestand (Stand rc52, 2026-04-27):**

| Drucker | Standort | code | IP | Modell |
|---|---|---|---|---|
| Brother QL-820NWB | Alpenstraße | `ALPENSTRASSE` | `10.1.1.136` | QL-820NWB |
| Brother QL-820NWB | Eugenstraße | `EUGENSTRASSE` | `192.168.1.124` | QL-820NWB |

**Schmerzen die wir hatten in rc52:**

1. Frank legt `warehouse_location` mit Code `EGSTR57/2` an, ich bake Bridge mit `EUGENSTRASSE` → stilles Mismatch, Lagerort defaultet falsch (Drift-Banner gefixt, aber das Symptom hätte nie auftreten dürfen)
2. DHCP-Lease-Drift: Drucker wechselt IP `192.168.1.140 → 192.168.1.124` binnen Stunden → Bridge-Reinstall auf Mac nötig (heute: SSH-Zugang nötig, händisches `bash install-bridge.sh ...`)
3. Neuer Standort = Bridge auf jedem betroffenen Mac neu installieren (heute: SSH oder physischer Zugang zu jedem Mac)
4. Kein zentraler Überblick "welche Drucker existieren, wo, mit welcher IP, welchem Status" — Information verstreut über 3 plist-Files
5. Drucker-Modell + Label-Type sind heute pro-Mac einheitlich (`QL-820NWB` + `29`), bei Hardware-Mix später wäre das ein Thema (z.B. POS-Belegdrucker zusätzlich)

**Was funktioniert (nicht ändern):**

- Bridge selbst: TCP-Direct-Send via `brother_ql`, lokal auf jedem Mac, robust, offline-fähig
- 📍-Toolbar-Switcher in Inventur-Session: persistiert `vod.print.location` in localStorage
- Bridge↔DB Drift-Banner (rc52.3): zeigt Mismatches sichtbar
- Doku-Pflicht: Bridge-Code ↔ `warehouse_location.code` muss matchen

---

## 2. Goals & Non-Goals

### Goals

- **Single Source of Truth in DB:** Drucker-Liste lebt in einer Postgres-Tabelle, nicht mehr in plist-env-vars
- **Admin-UI** zur Verwaltung: CRUD-Page unter `/app/erp/printers` (oder Sub-Hub von `/app/operations`)
- **Drucker → Lagerort-Zuweisung** explizit modelliert (FK zu `warehouse_location`)
- **Pro Drucker speicherbar:** Hersteller, Modell, IP, Port, Label-Type, Standort, Notizen, is_active
- **Multi-Drucker pro Standort möglich:** z.B. Eugenstraße bekommt später einen 2. Drucker für POS-Belege
- **Bridge auf jedem Mac fetched diese Liste** → keine Reinstall mehr bei Hinzufügen/Ändern/IP-Drift
- **Frontend nutzt diese Liste** für 📍-Switcher statt `health.locations[]` aus Bridge
- **DB-Code ↔ Bridge-Code Drift kann nicht mehr passieren** (gleiche Quelle)

### Non-Goals

- Live-Drucker-Status (online/offline-Probe pro Drucker) — separates Feature, nicht in dieser Phase
- Auto-Discovery via Bonjour mit DB-Auto-Insert — zu fragil, manuell pflegen ist OK bei <10 Druckern
- Replace QZ-Tray-Era-Stuff — die Bridge bleibt unverändert als Runtime, nur die Config-Quelle ändert sich
- Authentifizierung pro-Drucker (z.B. SNMP-Community) — Brother QL hat keine sinnvolle Auth in dem Use-Case
- Cross-Mac-Druck (Mac A schickt Druckjob an Mac B's Bridge) — nicht nötig, jeder Mac hat lokale Bridge

---

## 3. Architektur-Optionen

Dreh- und Angelpunkt: **wo liegt die Source of Truth, und wie kommt die Bridge an die Daten?**

### Option A — DB als SoT, Bridge fetched zur Laufzeit

```
┌──────────────┐  GET /admin/printers       ┌──────────────┐
│ Bridge (Mac) │ ───────────────────────────│ Backend (VPS)│
│ Cache (1min) │ ◄─────────────────────────  │ Postgres     │
└──────┬───────┘                             └──────────────┘
       │  /print?location=EUGENSTRASSE
       ▼  (resolve via cached printer list)
   ┌────────────┐
   │ Drucker    │
   │ tcp://...  │
   └────────────┘
```

**Pros:**
- Echte Single SoT
- Adding/changing/IP-drift propagiert automatisch (≤1 min)
- Keine Mac-Reinstall mehr nach DB-Änderung
- Admin-UI zeigt aktuelle Realität

**Cons:**
- Bridge braucht Netzwerk-Reach zum Backend für Initial-Fetch (Cold-Boot-Hen-und-Ei wenn Backend down)
- Auth: Bridge braucht Token zum Lesen von `/admin/printers` — aktuell hat sie keinen
- Polling vs. Webhook vs. Push? Polling ist einfachst (cron-style)
- Fallback bei Backend-Down: Cache muss persistiert werden (sonst Bridge-Restart = printer_found:false)

### Option B — DB als SoT, Bridge ignoriert es, sync durch Reinstall

DB hat die Tabelle, Admin-UI editiert sie, **aber Bridge bleibt env-var-basiert wie heute**. Bei DB-Änderung muss `install-bridge.sh` nochmal laufen (event. via SSH-Job oder mac-lokal vom User).

**Pros:**
- Minimal-invasiv: kein neuer Code-Pfad in der Bridge, keine Auth-Frage
- Admin-UI ist "Quelle der Wahrheit für Menschen", install-bridge.sh propagiert manuell
- Schmerz wird nicht beseitigt — heute haben wir genau das Problem

**Cons:**
- Drift bleibt möglich (Admin-UI sagt X, Bridge auf Mac sagt Y)
- Nichts gewonnen außer: zentraler View

→ **Verworfen.** Löst keines der echten Probleme.

### Option C — DB als SoT, Bridge fetched mit Cache-Fallback (empfohlen)

Wie A, aber:
- Bridge fetched on-startup + alle 60s via Polling
- Letztes erfolgreiches Fetch wird in `~/.local/lib/vod-print-bridge/printers.cache.json` persistiert
- Bei Backend-down: Cache wird genutzt (mit Warnung im Log)
- Bei `/print` ohne ?location=: Mac lokaler Default-Standort entscheidet (siehe §6 unten)
- Admin-UI hat einen "Push to Bridges"-Button der eine Webhook-Notification an alle bekannten Bridges schickt — optional als Speed-Optimierung gegenüber 60s-Polling

**Pros:**
- Robust gegen Backend-Outages (Bridge funktioniert weiter mit letztem Cache)
- ≤60s Propagation (gut genug für IP-Drift, Drucker-Add etc.)
- Auth lösbar via permanent issued API-Token pro Mac
- Cold-Boot-Ei: bei allerersten Bridge-Start ohne Internet = `install-bridge.sh` schreibt einen "Bootstrap-Cache" mit Default-Daten

**Cons:**
- Komplexere Bridge-Logik (Polling, Cache-File-Mgmt, Token-Header)
- Auth-Token-Verwaltung: 1Password-Item pro Mac, oder shared Token mit Read-only-Scope

→ **Empfohlen.** Drittel mehr Komplexität für ein Feature das DB-Drift komplett eliminiert.

---

## 4. Datenmodell

Neue Tabelle `printer`:

```sql
CREATE TABLE printer (
  id text PRIMARY KEY,                              -- ULID (generateEntityId)
  warehouse_location_id text NOT NULL REFERENCES warehouse_location(id),
  manufacturer text NOT NULL,                       -- z.B. 'Brother', 'Zebra', 'DYMO'
  model text NOT NULL,                              -- z.B. 'QL-820NWB', 'ZD420'
  ip_address text NOT NULL,                         -- z.B. '10.1.1.136' (auch hostnames erlaubt?)
  port integer NOT NULL DEFAULT 9100,               -- Brother Direct-Print
  label_type text NOT NULL DEFAULT '29',            -- '29' = DK-22210 continuous 29mm, '29x90' = die-cut
  brother_ql_model text,                            -- exakter Model-String für brother_ql Library
                                                    -- (manche Modelle haben Unterschiede zwischen
                                                    -- Hardware-Name und Library-Identifier)

  -- Funktion / Verwendung
  is_active boolean NOT NULL DEFAULT true,
  is_default_for_location boolean NOT NULL DEFAULT false,  -- bei Multi-Printer pro Lager
                                                            -- der primäre für Inventur-Labels
  use_for jsonb NOT NULL DEFAULT '["labels"]'::jsonb,      -- ["labels", "receipts", "invoices"]
                                                            -- — POS-Belegdrucker = ["receipts"]

  -- Identifikation / Netzwerk-Stabilität
  mac_address text,                                 -- für DHCP-Reservation-Doku, optional
  hostname text,                                    -- alternativ zu IP, falls Bonjour zuverlässig

  -- Metadata
  display_name text,                                -- "Etiketten-Drucker Werkstatt" (UI-Label)
  notes text,
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE (warehouse_location_id, ip_address),       -- gleicher Drucker nicht doppelt im Lager
  CHECK (port > 0 AND port < 65536)
);

-- Pro Lager max 1 Default-Drucker pro Use-Case (manuell zu prüfen oder via Trigger)
CREATE INDEX idx_printer_warehouse ON printer(warehouse_location_id) WHERE is_active;
CREATE INDEX idx_printer_default ON printer(warehouse_location_id, is_default_for_location)
  WHERE is_active AND is_default_for_location;
```

**Beziehung zu `warehouse_location`:**

```
warehouse_location (1) ───< printer (N)
```

Ein Lager hat 0..N Drucker. Heute typisch 1 (nur Etiketten). Zukunft denkbar: 1 Etiketten + 1 POS-Belegdrucker pro Lager.

**`brother_ql_model`-Feld erklärt:** brother_ql-Library nutzt teilweise andere Namen als die offizielle Hardware-Bezeichnung. Beispiel: `QL-820NWB` heißt in der Library tatsächlich `QL-820NWB`, aber bei einem späteren `QL-1100` müsste man prüfen ob die Library `QL-1100` oder `QL-1100NWB` erwartet. Wir haben das Feld separat damit das User-facing `model` (für die UI) entkoppelt vom technischen `brother_ql_model`-String ist.

**Initiale Daten-Migration aus rc52-State:**

```sql
-- Annahme: Alpenstraße = warehouse_location.code='ALPENSTRASSE',
-- Eugenstraße = warehouse_location.code='EUGENSTRASSE'

INSERT INTO printer (id, warehouse_location_id, manufacturer, model, ip_address, port, label_type, brother_ql_model, is_default_for_location, display_name, mac_address, notes)
SELECT
  generateEntityId(),
  wl.id,
  'Brother',
  'QL-820NWB',
  '10.1.1.136',
  9100,
  '29',
  'QL-820NWB',
  true,
  'Etiketten-Drucker Alpenstraße',
  NULL,                                  -- noch zu pflegen
  'Hauptlager-Drucker, fest installiert seit 2026-04-11.'
FROM warehouse_location wl WHERE wl.code = 'ALPENSTRASSE'
UNION ALL
SELECT
  generateEntityId(),
  wl.id,
  'Brother',
  'QL-820NWB',
  '192.168.1.124',
  9100,
  '29',
  'QL-820NWB',
  true,
  'Etiketten-Drucker Eugenstraße',
  NULL,
  '2. Standort, eigenes WLAN 192.168.1.0/24, statische DHCP-Reservation Pflicht (rc52-Lesson).'
FROM warehouse_location wl WHERE wl.code = 'EUGENSTRASSE';
```

---

## 5. API-Endpunkte

### 5.1 Admin CRUD (cookie-auth wie übliche Admin-Routes)

```
GET    /admin/erp/printers                  → Liste aller Drucker mit Lager-Join
GET    /admin/erp/printers/:id              → Einzeldrucker mit kompletten Feldern
POST   /admin/erp/printers                  → Anlegen (Body: alle Felder außer id/timestamps)
PATCH  /admin/erp/printers/:id              → Update (partial)
DELETE /admin/erp/printers/:id              → soft-delete (is_active=false), nicht hart löschen
                                              wegen Audit-Trail in Druck-Logs

POST   /admin/erp/printers/:id/test-print   → Sample-Label an genau diesen Drucker schicken,
                                              vom Backend aus (umgeht den Bridge-Cache)
                                              → Diagnose-Werkzeug für IP-Drift-Verdacht

POST   /admin/erp/printers/notify-bridges   → Webhook-Push an alle Bridges,
                                              "deine Cache-Liste neu fetchen!" (optional in Phase 1)
```

### 5.2 Bridge-Fetch-Endpoint

Separate Route weil Auth-Modell anders (Service-Token statt Cookie):

```
GET /api/print/printers
  Authorization: Bearer <BRIDGE_API_TOKEN>

  Response: {
    "version": 1,
    "fetched_at": "2026-04-27T20:30:00Z",
    "printers": [
      {
        "id": "01ABC...",
        "location_code": "ALPENSTRASSE",     // de-normalisiert für Bridge-Convenience
        "ip_address": "10.1.1.136",
        "port": 9100,
        "brother_ql_model": "QL-820NWB",
        "label_type": "29",
        "is_default_for_location": true,
        "use_for": ["labels"]
      },
      ...
    ]
  }
```

Token-Modell:
- 1 shared `BRIDGE_API_TOKEN` reicht (alle Macs lesen das Gleiche, kein per-Mac-Scoping nötig)
- Token in 1Password "VOD Bridge API Token" (Work)
- `install-bridge.sh` schreibt Token in plist als env-var → Bridge nutzt ihn als `Authorization` Header
- Token-Rotation: alle 6 Monate, dann auf jedem Mac einmal `install-bridge.sh` mit neuem Token re-run

---

## 6. Bridge-Integration

### 6.1 Neue Bridge-Logik (Pseudocode, in `vod_print_bridge.py`)

```python
# Cache-File
CACHE_PATH = "~/.local/lib/vod-print-bridge/printers.cache.json"
POLL_INTERVAL_SECONDS = 60

# Auf Startup:
def load_printers():
    try:
        # Try fresh fetch from backend
        response = requests.get(
            f"{BACKEND_URL}/api/print/printers",
            headers={"Authorization": f"Bearer {BRIDGE_API_TOKEN}"},
            timeout=5,
        )
        if response.ok:
            cache = response.json()
            write_cache_file(cache)
            return cache
    except Exception as e:
        log.warning(f"Failed to fetch printers from backend: {e}")
    # Fallback: read cache file
    if cache_file_exists():
        log.info("Using cached printer list")
        return read_cache_file()
    log.error("No cache available — bridge starts in degraded mode (DRY_RUN-equivalent)")
    return None

# Background polling
def poll_loop():
    while True:
        time.sleep(POLL_INTERVAL_SECONDS)
        load_printers()  # refresh cache silently

# Bei /print?location=ALPENSTRASSE:
def resolve_target(location_code):
    printers = current_cache()
    if not printers:
        return None, "no_cache"
    candidates = [p for p in printers["printers"] if p["location_code"] == location_code]
    # Bei Multi-Printer pro Standort: nimm den is_default_for_location=true
    default = next((p for p in candidates if p["is_default_for_location"]), None)
    return default or candidates[0] if candidates else None
```

### 6.2 install-bridge.sh wird einfacher

```bash
# Vorher (rc52):
bash install-bridge.sh \
  --printer-for ALPENSTRASSE=10.1.1.136 \
  --printer-for EUGENSTRASSE=192.168.1.124 \
  --default-location ALPENSTRASSE

# Neu (rc53+):
bash install-bridge.sh \
  --backend-url https://api.vod-auctions.com \
  --bridge-token "$VOD_BRIDGE_API_TOKEN" \
  --default-location ALPENSTRASSE   # nur falls Mac stationär — sonst per Toolbar-Switcher
```

`--default-location` bleibt nützlich für Macs die fest an einem Standort sind (Mac Studio = Alpenstraße). Wenn weggelassen, hat die Bridge keinen Default und der Frontend muss `?location=` immer explizit mitsenden (in der Praxis tut es das eh via Toolbar-Switcher).

### 6.3 Backwards-Compat während Übergang

Phase 1 (siehe §9): Bridge unterstützt **beide** Modi gleichzeitig:
- Wenn `BACKEND_URL` + `BRIDGE_API_TOKEN` gesetzt → DB-Fetch-Mode
- Sonst → fall back auf `PRINTERS_JSON`-env-var wie heute (rc52)

So können wir die Macs einzeln umstellen ohne Big-Bang-Migration.

---

## 7. Admin UI

### 7.1 Navigation

Neuer Hub-Eintrag im ERP-Hub (`/app/erp`):

```
ERP Hub
├── Inventory
├── Locations         (existiert)
├── Printers          (NEU)
└── (POS, ...)
```

Oder als Sub-Hub von `/app/operations` falls "Printers" eher ein Operations- als ERP-Konzept ist. Je nach Hub-Karten-Belegung.

### 7.2 Listen-Ansicht `/app/erp/printers`

```
┌─ Printers ──────────────────────────────────── [+ Add Printer] ───┐
│                                                                    │
│ Drucker · 2 aktiv                                                  │
│                                                                    │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Standort        Hersteller  Modell      IP             Status │ │
│ ├────────────────────────────────────────────────────────────────┤ │
│ │ ALPENSTRASSE    Brother     QL-820NWB   10.1.1.136     ●      │ │
│ │ EUGENSTRASSE    Brother     QL-820NWB   192.168.1.124  ●      │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ ⚠️ Hinweis: Bridges fetchen die Liste alle 60s. Änderungen          │
│    propagieren automatisch. Bei Notfall: [Push to Bridges]         │
└────────────────────────────────────────────────────────────────────┘
```

**Status-Indicator (Phase 2):** Grüner Punkt = `printer_found:true` aus letztem Bridge-`/health`-Sample. Geht nur wenn wir Bridges remote pingen (Reverse-Probe-Tunnel oder ähnlich) — komplex, daher Phase 2.

### 7.3 Detail-Ansicht `/app/erp/printers/:id`

```
┌─ Drucker bearbeiten: Etiketten-Drucker Alpenstraße ────────────────┐
│                                                                    │
│ Standort:        [ALPENSTRASSE — frank@vod-records.com  ▼]         │
│                                                                    │
│ Display-Name:    [Etiketten-Drucker Alpenstraße                  ] │
│                                                                    │
│ Hersteller:      [Brother                                        ] │
│ Modell:          [QL-820NWB                                      ] │
│ brother_ql:      [QL-820NWB                                      ] │
│ Use-Cases:       [✓ Labels  ✗ Receipts  ✗ Invoices              ] │
│                                                                    │
│ IP-Adresse:      [10.1.1.136                                     ] │
│ Port:            [9100                                           ] │
│ Hostname:        [                                                ] │
│ MAC-Adresse:     [                                  (für DHCP-Res.)] │
│                                                                    │
│ Label-Type:      [29 — DK-22210 (29mm continuous)              ▼] │
│                                                                    │
│ Aktiv:           [✓]   Default für Standort: [✓]                  │
│ Sort-Order:      [0]                                               │
│                                                                    │
│ Notizen:                                                           │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Hauptlager-Drucker, fest installiert seit 2026-04-11.         │ │
│ │                                                                │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ ─────────────────────────────────────────────────────────────────  │
│                                                                    │
│ [Test-Druck (Sample-Label)]  [Speichern]  [Löschen (soft)]        │
└────────────────────────────────────────────────────────────────────┘
```

**Test-Druck:** Backend sendet ein Sample-PDF direkt an den Drucker (umgeht den Bridge-Cache). Ergebnis wird live angezeigt: ✅ "Label sollte rauskommen" oder ❌ "Connection refused / Timeout / brother_ql Fehler X". Hilft wenn ein Drucker nach IP-Wechsel nicht mehr antwortet.

**Lösch-Button:** macht `is_active=false`, nicht hart DELETE. Audit-Trail (Movement-Logs etc.) bleibt referentiell intakt.

### 7.4 "+ Add Printer"-Form

Gleiches Layout wie Detail-Ansicht, leer. Workflow für 3. Standort:

1. Frank legt `warehouse_location` mit code z.B. `WERKSTATT` an (existierender Workflow)
2. Frank legt Drucker an: Standort = `WERKSTATT`, IP = `192.168.x.y`, ...
3. Backend speichert in `printer`-Tabelle
4. Bridges auf allen Macs fetchen das ≤60s später automatisch
5. Frontend 📍-Switcher zeigt jetzt 3 Optionen (Multi-Printer-Macs)

Keine SSH-Aktion auf irgendeinem Mac nötig. Erste echte Reduktion von Ops-Aufwand.

---

## 8. Migration von rc52 zu rc53

### Phase 0 — Vorbereitung (1 Stunde)

- Konzept gereviewed (dieses Dokument)
- 1Password-Item "VOD Bridge API Token" mit 32-byte Random-Token erstellt
- Token in `.env` der Storefront/Backend-Production-Config

### Phase 1 — DB-Tabelle + Admin-CRUD-Page (1-2 Tage)

- Migration `printer`-Tabelle anlegen (idempotent additiv, kein Bridge-Touch)
- 7 Admin-Routes (`/admin/erp/printers/*`)
- Initiale Daten-Migration (SQL aus §4)
- Admin-UI Listen + Detail + Add (drei TSX-Files)
- Drift-Banner aus rc52.3 erweitern: vergleicht jetzt zusätzlich `printer.warehouse_location` mit Bridge-`health.locations[]`

**Output Phase 1:** Admin-UI funktioniert, DB hat die Wahrheit, **aber Bridge ignoriert das noch** (rc52-env-var-Modus aktiv). Drift gibt's also weiterhin, ist aber sichtbar im Banner.

### Phase 2 — Bridge fetched DB (1-2 Tage)

- Backend `/api/print/printers`-Endpoint mit Bearer-Auth
- `vod_print_bridge.py` erweitert: Polling, Cache-File, Backward-compat zu env-vars
- VERSION 2.1.1 → 2.2.0
- `install-bridge.sh` erweitert: `--backend-url` + `--bridge-token` Flags, default-location bleibt
- Migration: auf jedem Mac einmal `bash install-bridge.sh --backend-url ... --bridge-token ... --default-location ALPEN/EUGEN` laufen lassen
- Drift-Banner zeigt "no drift" weil Bridge jetzt aus derselben Source liest

**Output Phase 2:** Drift unmöglich. Adding/changing/IP-drift propagiert in 60s.

### Phase 3 — Optional: Live-Status & Push-Reload (~3 Tage, fakultativ)

- Bridge meldet sich beim Backend an (Heartbeat alle 5min): mac_id, IP, version, last_print_at
- Admin-UI listet Drucker mit Live-Status (grün/rot)
- "Push to Bridges"-Button triggert SSE/Webhook → alle Bridges fetchen sofort statt 60s zu warten
- Test-Druck-Button geht durch's Backend → durch eine spezifische Bridge → druckt

**Output Phase 3:** Volle Operations-Übersicht. Wahrscheinlich erst sinnvoll bei 4+ Druckern oder wenn Frank mehr Standorte als 2 hat.

---

## 9. Phasen-Plan & Effort

| Phase | Effort | Wert | Kann später? |
|---|---|---|---|
| **Phase 0** Token-Provisioning | 1h | Voraussetzung | nein |
| **Phase 1** DB + Admin-CRUD | 1-2d | Zentraler View, **Drift bleibt** | wenn nur 2 Standorte: ja, aber Phase 2 baut darauf |
| **Phase 2** Bridge-Fetch + Cache | 1-2d | **Drift eliminiert**, IP-Drift selbstheilend | sehr empfohlen wenn 3+ Standorte |
| **Phase 3** Live-Status + Push | 2-3d | Operations-Komfort | erst bei echtem Bedarf |

**Empfehlung Stand 2026-04-27:**

Robin/Frank haben gerade rc52 erfolgreich deployed mit 2 Standorten + Drift-Banner. Aktuell tut nichts weh. Phase 1+2 lohnen erst wenn ein 3. Standort konkret ansteht (Werkstatt? Lager-Erweiterung? Pop-Up bei Festivals?). Dann ist die manuelle 3-Mac-Reinstall-Reibung das Trigger-Event für die Implementierung.

**Trigger-Kriterium:** 3. Standort konkret in Planung (z.B. Mietvertrag unterzeichnet, MAC-Adresse des dritten Druckers bekannt).

Bis dahin: Konzept liegt griffbereit, nichts zu tun.

---

## 10. Offene Fragen

1. **Hub-Position der UI:** ERP-Hub oder Operations-Hub oder eigener Top-Level?
   - Empfehlung: ERP-Hub neben Locations — passt vom Modell her (Drucker ist physisches Inventar einer Location)

2. **Brother-only oder Multi-Vendor von Anfang an?**
   - DB-Spalte `manufacturer` macht es offen, aber Bridge unterstützt heute nur `brother_ql`. Wenn POS-Belegdrucker dazukommt (z.B. Star Micronics ESC/POS), brauchen wir entweder einen 2. Bridge-Backend (`escpos`-Library) oder ein anderes Setup. Nicht in Phase 1+2.
   - Empfehlung: Spalte offen lassen, aber Bridge-Code nur `Brother + QL-*` initial. Erweiterung später.

3. **Token-Rotation-Strategie:**
   - Heute (rc52): keine, plist hat keinen Token
   - Phase 2: ein gemeinsamer Token, jährliche Rotation
   - Strenger: per-Mac-Token mit individueller Sperrung möglich
   - Empfehlung: Single Token + 1-Jahres-Rotation reicht, wenig Angriffsfläche (lokales Netzwerk)

4. **`use_for: ["labels", "receipts"]` — schon jetzt modellieren?**
   - Pro: future-proof, billig
   - Con: fügt Komplexität hinzu für ein Feature das es heute nicht gibt
   - Empfehlung: ja, weil das Feld in der DB anzulegen Centsache ist; Bridge ignoriert es initial und routet alle Jobs nach Standort.

5. **Hostname statt IP unterstützen?**
   - Brother QL-820NWB hat einen Bonjour-Hostnamen wie `Brother-QL-820NWB.local`, der DHCP-stabil ist. Damit wäre IP-Drift kein Thema.
   - Aber: Bonjour funktioniert nur im selben WLAN, nicht über Subnetze. Bei MBA in Eugenstraße + Drucker `Brother-QL-820NWB.local` (oder lokal-eindeutig) könnte das gehen.
   - Empfehlung: `hostname`-Spalte vorsehen, Bridge probiert erst hostname → bei Failure IP. Tradeoff Komplexität minimal.

6. **Was passiert wenn ein Mac keinen `--default-location` hat aber auch keinen Toolbar-Switch macht?**
   - Heute (rc52): Bridge fällt auf `single_printer_fallback` (PRINTER_IP env)
   - Neu (rc53): Bridge hat keine PRINTER_IP-env mehr. Wenn `?location=` fehlt UND `--default-location` weggelassen wurde → 503 mit Liste verfügbarer Locations
   - Empfehlung: bei `install-bridge.sh` ohne `--default-location` und mehr als 1 Drucker in DB → Warnung im Installer-Output, Frontend muss explizit `?location=` mitsenden

---

## 11. Risiko & Rollback

**Risiken:**

- **Backend-Outage während Bridge-Cold-Boot** → Bridge startet ohne Cache → druckt nicht
  - Mitigation: `install-bridge.sh` schreibt einen Bootstrap-Cache aus den `--printer-for`-Flags (für genau dieses Szenario rückwärtskompatibel)

- **Falsch konfigurierter Drucker in DB** → alle Bridges propagieren den Fehler
  - Mitigation: Test-Druck-Button vor dem Speichern, Validation im Backend (Port range, IP-Format)

- **Drift-Banner false-positive** → User-Confusion
  - Mitigation: Banner erst nach 2× Polling-Cycle zeigen (1 Min Toleranz), nicht bei jedem Cache-Flicker

**Rollback Phase 2 → Phase 1:**

- Single Feature-Flag `PRINTER_DB_FETCH_ENABLED` in `site_config.features`
- Bei `false`: Bridge nutzt env-var-Fallback (rc52-Modus)
- Schaltbar im laufenden System ohne Bridge-Reinstall

**Rollback Phase 1 → rc52:**

- Migration ist additiv (neue Tabelle, nichts gelöscht)
- Admin-UI ist eigenständig, deaktivieren = einfach den Hub-Card unsichtbar machen
- DB-Tabelle bleibt zur Wiederverwendung

---

## 12. Verwandte Konzepte

- `INVENTUR_WORKFLOW_V2_KONZEPT.md` — Inventur-Session mit 📍-Switcher, das aktive Lager-Konzept stammt von dort
- `POS_WALK_IN_KONZEPT.md` — POS-Belegdrucker als 2. Drucker pro Standort vorgesehen
- `ERP_WARENWIRTSCHAFT_KONZEPT.md` — Lagerort-Modell, FK-Ziel für `printer.warehouse_location_id`
- `BROTHER_QL_820NWB_SETUP.md` — Hardware-Setup-Guide, bleibt bestehen
- rc52 CHANGELOG — Vorgeschichte, statische plist-Config

---

**Autor-Notiz:** Dieser Konzept-Doc ist bewusst ohne Code geschrieben — Implementierung erst wenn ein 3. Standort konkret ansteht. Bis dahin liegt er als Plan griffbereit.
