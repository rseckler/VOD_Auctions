# Brother QL-820NWB — Raster-Mode einstellen (Web-Interface)

**Wichtig:** Das ist der **Haupt-Stolperstein**. Ohne diese Einstellung druckt der Drucker winzige quadratische Labels, egal wie die PDF-Größe ist.

---

## Warum?

Der Brother QL-820NWB wird ab Werk im **`P-touch Template`**-Mode ausgeliefert. In diesem Modus interpretiert er eingehende Druckdaten als Template-Füllung auf eine **fest einkodierte Default-Länge (~29mm)** — er ignoriert unsere `Custom.29x90mm`-Einstellung komplett.

Lösung: Command Mode auf **`Raster`** umstellen. Dann nimmt der Drucker die eingehende Bitmap 1:1 und druckt die tatsächlichen Pixel-Dimensionen.

Diese Einstellung ist **nur übers Web-Interface** am Drucker selbst änderbar — nicht über macOS, CUPS, oder einen Treiber.

---

## Anleitung

### 1. Drucker-IP finden

Am Drucker-Display:
- **Menü** → **WLAN** → **Info** → IP-Adresse notieren (z.B. `192.168.1.42`)

Oder im Terminal:
```bash
dns-sd -B _ipp._tcp local. | grep -i brother
```

### 2. Web-Interface öffnen

Safari / Chrome:
```
https://192.168.1.42/
```

(HTTPS! Port 443. HTTP auf 80 funktioniert auch, aber HTTPS ist Default.)

**Zertifikatswarnung akzeptieren** — self-signed Cert vom Drucker, ist ok.

### 3. Login

- Klick **"Open Secure Login"**
- **Passwort** steht auf der Rückseite des Druckers auf einem weißen Aufkleber:
  ```
  Pwd: abc12345
  ```
- User-Feld leer lassen, nur Passwort.

### 4. Navigation

Im Web-Interface oben:
- **Printer Settings** (zweiter Tab von links, manchmal "Drucker-Einstellungen")
- Sub-Menü links: **Device Settings** (oder "Geräteeinstellungen")

### 5. Command Mode ändern

Auf der Device-Settings-Seite ganz oben:

```
Command Mode:   [P-touch Template ▼]
```

Aufklappen und auswählen:

```
Command Mode:   [Raster ▼]
```

Die Dropdown-Optionen sind:
- ESC/P (für alte Label-Software)
- Raster ← **DAS HIER**
- P-touch Template (Werks-Default — NICHT das hier)

### 6. Speichern

Ganz unten auf der Seite: **Submit** / **Send** button.

### 7. Drucker neustarten

Empfohlen: Drucker aus-/einschalten (Power-Taste 2s halten). Stellt sicher dass die neue Config aktiv ist.

---

## Verifikation

Zurück im Terminal:

```bash
PRINTER_IP=192.168.1.42  # deine Drucker-IP
PRINTER_PW=abc12345      # dein Drucker-Passwort

curl -sk -L -c /tmp/cj -b /tmp/cj \
  -d "B14b=${PRINTER_PW}" -d "loginurl=/printer/device_settings.html" \
  "https://${PRINTER_IP}/home/status.html" -o /tmp/ds.html
grep -oE 'value="2[012]"[^>]*selected[^>]*' /tmp/ds.html
```

Erwartet:
```
value="21" selected="selected"
```

**Codes:**
- `value="20"` = ESC/P
- `value="21"` = **Raster** ← korrekt
- `value="22"` = P-touch Template ← falsch

---

## Test-Druck danach

```bash
cd ~/Desktop/VOD_Auctions/frank-macbook-setup  # oder wo das Kit liegt
bash test-print.sh
```

**Korrekter Output:**
- Label ist ca. 90mm lang × 29mm breit (NICHT quadratisch)
- Barcode oben, klar lesbar
- Ruler mit 0/30/60/90mm Markierungen

**Falls Label trotzdem klein ist:**
- Prüf nochmal ob Command Mode wirklich auf Raster steht (curl-Check oben)
- Drucker auf Werkseinstellungen zurücksetzen (Menü → System → Zurücksetzen → Werkseinstellungen), dann Setup neu

---

## Screenshots

Wenn dein Web-Interface anders aussieht (neuere Firmware):
- Variante A: Haupt-Navigation links statt oben → Printer Settings/Device Settings ist gleich
- Variante B: Mehrstufige Sub-Navigation → Printer Settings → Device Settings → Command Settings
- Variante C: Anderer Dropdown-Name "Command Mode" / "Befehlsmodus" / "Emulation"

Such nach: **Raster** / **Command Mode** / **Befehlsmodus** — das ist der Wert der umgestellt werden muss.

---

## Warum wird das nicht am Drucker-Display angeboten?

Brother hat die Command-Mode-Einstellung nur im Web-Interface offengelegt. Am LCD-Menü gibt es sie nicht. Das ist ein bekannter Brother-Quirk bei der QL-Serie.
