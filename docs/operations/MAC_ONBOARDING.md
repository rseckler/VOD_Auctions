# Neuen Mac einbinden — in 60 Sekunden

**Zielgruppe:** Frank, Robin (Admin) — und die Person, die ihren neuen Mac mitbringt
**Was das hier beschreibt:** Wie ein neuer Mac (z.B. Kays MacBook Air) ans Inventar-System angeschlossen wird, sodass er Etiketten drucken kann
**Status:** geplante Implementierung — heute (2026-05-01) läuft das noch über Robins SSH-Zugang. Nach Phase 2.5 (siehe Drucker-Verwaltungs-Konzept) wie unten beschrieben.

---

## TL;DR

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│   1.  Frank klickt im Backend „+ Neuen Mac pairen"                 │
│   2.  Backend zeigt einen 12-stelligen Code                        │
│   3.  Kay tippt den Code auf seinem MBA in eine Zeile              │
│       → ✓ fertig, druckt sofort                                    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Kein SSH, kein Robin, kein Token aus 1Password kopieren, kein Reinstall auf den anderen Macs. Eine Person mit Admin-Zugang plus die Person mit dem neuen Mac, beide vor ihrem eigenen Bildschirm. 60 Sekunden, fertig.

---

## Der Ablauf in Bildern

### Schritt 1 — Frank im Backend

Frank geht in `/app/erp/bridges` und klickt **„+ Neuen Mac pairen"**:

```
┌─ Neuen Mac pairen ─────────────────────────────────────────────────┐
│                                                                    │
│ Person:           [Kay                                           ] │
│ Display-Name:     [Kays MBA                                      ] │
│ Mobil:            [✓]                                              │
│ Default-Standort: [— bei mobilen Macs leer lassen —            ▼] │
│                                                                    │
│ [Pairing-Code generieren]                                          │
└────────────────────────────────────────────────────────────────────┘
```

Frank füllt drei Felder aus: wer (Person), wie heißt die Maschine, ist sie mobil. Klick.

### Schritt 2 — Backend zeigt den Code

```
┌─ Pairing-Code für Kay ─────────────────────────────────────────────┐
│                                                                    │
│  ╔════════════════════════════════════════════╗                    │
│  ║                                            ║                    │
│  ║       VOD-A7K9-3MX2-N8PQ                   ║   gültig: 29:54   │
│  ║                                            ║                    │
│  ╚════════════════════════════════════════════╝                    │
│                                                                    │
│ Kay tippt auf seinem MBA in Terminal:                              │
│                                                                    │
│   curl -fsSL https://api.vod-auctions.com/install-bridge.sh \      │
│     | bash -s -- --pair                                            │
│                                                                    │
│ Diese Seite zeigt automatisch ✓ wenn Kay fertig ist.               │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Frank kann den Code via Slack, Whatsapp, persönlich oder am Telefon an Kay durchgeben. Der Code ist 30 Minuten gültig und kann nur einmal verwendet werden — wenn Kay zu lange braucht, klickt Frank einfach nochmal auf „Code generieren".

### Schritt 3 — Kay auf seinem MBA

Kay öffnet einmal das Terminal auf seinem Mac und kopiert die eine Zeile rein, die im Backend steht. Das Skript fragt:

```
Pairing-Code (Format VOD-XXXX-XXXX-XXXX):
```

Kay tippt `VOD-A7K9-3MX2-N8PQ` und drückt Enter. Nach ca. 5 Sekunden:

```
✓ Mac „Kays MBA" wurde erfolgreich eingerichtet.
✓ Drucker-Liste geladen: 2 Standorte verfügbar.
✓ Bridge läuft. Du kannst jetzt drucken.
```

Frank sieht im Backend gleichzeitig wie der Status von ⏳ „pairing pending" auf ● „aktiv" springt.

**Fertig.**

---

## Was Kay danach tun muss

Bei der ersten Inventur-Session: einmal oben rechts im 📍-Standort-Switcher den Standort wählen (Alpenstraße oder Eugenstraße), an dem er gerade arbeitet. Beim nächsten Standort-Wechsel einfach erneut klicken. Keine weiteren Einstellungen, kein Setup-Wizard.

Bei stationären Macs (Frank-Mac-Studio in Alpenstraße) wird der Standort vorausgewählt. Bei mobilen MacBook Airs muss der Standort pro Session aktiv gewählt werden — bewusst so, damit niemand versehentlich am falschen Drucker landet.

---

## Wenn etwas schiefgeht

| Was Kay sieht | Was es bedeutet | Was zu tun ist |
|---|---|---|
| „Pairing-Code abgelaufen" | Mehr als 30 Min seit Frank den Code generiert hat | Frank klickt im Backend nochmal „Code generieren" |
| „Pairing-Code unbekannt" | Tippfehler beim Code | Code nochmal aus dem Backend ablesen, achten auf O vs 0 (es gibt nur eines davon im Code) |
| „Bereits verwendet" | Code wurde schon einmal eingelöst | Frank generiert einen neuen Code |
| Skript hängt nach Code-Eingabe | Internet auf dem Mac weg | WLAN prüfen, Skript erneut starten |

In allen Fällen: einfach nochmal von vorne. Es kann nichts kaputt gehen, kein Mac wird durch einen falschen Versuch unbrauchbar.

---

## Warum geht das so einfach?

Drei Designentscheidungen machen den Prozess kurz:

**1. Der Mac generiert seine eigene Identität.**
Beim ersten Start würfelt der Mac eine zufällige UUID aus und merkt sie sich lokal. Frank muss diese UUID nirgends abtippen — der Mac schickt sie beim Pairing automatisch mit.

**2. Der Code ist die einzige menschliche Schnittstelle.**
Er ist 12 Zeichen lang, in 4er-Gruppen mit Bindestrich, und benutzt ein Alphabet ohne verwechselbare Zeichen (kein 0/O, kein 1/I/L). Damit ist er am Telefon durchgebbar, leicht lesbar, und trotzdem nicht zu erraten.

**3. Drucker-Liste kommt automatisch.**
Sobald der Mac gepairt ist, fragt er beim Backend „welche Drucker gibt es?" und cached die Antwort. Wird ein neuer Drucker im Backend angelegt, propagiert die Liste binnen einer Minute zu allen Macs — ohne dass Kay etwas tun müsste.

---

## Wenn Kay den Mac irgendwann verliert oder gibt ihn zurück

Frank klickt im Backend auf den Eintrag „Kay" und entweder:

- **„Token rotieren"** — der alte Mac druckt nicht mehr, Kay kann mit einem neuen Code erneut pairen
- **„Deaktivieren"** — der Eintrag bleibt zur Historie, der Mac druckt nicht mehr

Ein verlorenes MacBook stellt also kein Sicherheitsrisiko dar — der Zugang ist mit einem Klick weg, ohne dass die anderen Macs angefasst werden müssen.

---

## Vergleich zu früher (rc52, Stand 2026-04-27)

| Schritt | Heute (rc52) | Mit Pairing-UI (Phase 2.5) |
|---|---|---|
| Robin reaktiviert SSH-Zugang zum neuen Mac | ✓ nötig | — |
| Robin loggt sich auf dem Mac ein | ✓ nötig | — |
| Token aus 1Password ins Skript-Argument kopieren | ✓ nötig | — |
| `install-bridge.sh` mit korrekten IP-Argumenten zusammenbauen | ✓ nötig | — |
| Bei jedem späteren Drucker-Hinzufügen erneut auf jedem Mac laufen | ✓ nötig | — |
| **Anzahl Personen die mitarbeiten müssen** | Robin + Kay | Frank + Kay |
| **Anzahl beteiligte Macs** | Robins Mac + Kays Mac | nur Kays Mac |
| **Dauer** | 15-30 Min plus Terminkoordination | 60 Sek live |

---

## Verwandte Dokumente

- [`docs/optimizing/DRUCKER_VERWALTUNG_KONZEPT.md`](../optimizing/DRUCKER_VERWALTUNG_KONZEPT.md) §13/§14 — technische Tiefe (Datenmodell, Endpoints, Sicherheit)
- [`docs/hardware/BROTHER_QL_820NWB_SETUP.md`](../hardware/BROTHER_QL_820NWB_SETUP.md) — Drucker-Hardware-Setup
- [`docs/optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md`](../optimizing/INVENTUR_WORKFLOW_V2_KONZEPT.md) — der Inventur-Prozess für den die Macs eingerichtet werden
