# Anleitung für Frank — Inventur & Kasse auf dem MacBook

**Für dich:** So startest du deinen Tag. Keep it simple.

---

## Vor dem Start — Hardware-Check (30 Sekunden)

| Gerät | Was prüfen |
|---|---|
| **Label-Drucker** (Brother, weiß, auf dem Tisch) | Grüne Power-LED leuchtet. Rolle eingelegt. Deckel zu. |
| **Scanner** (Inateck, schwarz, mit USB-Empfänger) | USB-Empfänger im MacBook eingesteckt. Scanner eingeschaltet (Power-Knopf rechts). |
| **MacBook** | Im WLAN. Drucker muss im gleichen WLAN sein. |

---

## Admin öffnen

1. **Dock** (unten am Bildschirmrand) → **"VOD Admin"** (schwarzes Icon) anklicken
2. Einloggen:
   - **User:** `frank@vod-records.com`
   - **Passwort:** *(auf dem gelben Post-it unter der Tastatur)*

Falls das Dock-Icon nicht da ist: Safari öffnen → `https://admin.vod-auctions.com`

---

## Inventur-Modus

**Klick-Pfad:** Sidebar → **ERP** → **Inventory** → **Start Session**

Oder direkt: `https://admin.vod-auctions.com/app/erp/inventory/session`

### Ablauf pro Artikel

1. **Nimm einen Tonträger in die Hand.**
2. **Suche** im System:
   - Tipp Artist oder Titel ins Suchfeld, **oder**
   - Scanne den vorhandenen Barcode mit dem Inateck-Scanner (falls das Exemplar schon gelabelt war)
3. **Wähle** den richtigen Treffer aus der Liste (↑/↓ mit Pfeiltasten, Enter zum Öffnen).
4. **Bewerte:**
   - **Zustand Media** (Schallplatte): M / NM / VG+ / VG / G+ / G / F / P
   - **Zustand Sleeve** (Hülle): gleiche Skala
   - **Preis:** Vorschlag ist schon drin. Wenn Discogs-Preis anders ist, Button **"Median übernehmen"** klicken.
5. **[Enter]** oder **[V]** → Exemplar ist verifiziert. Label druckt automatisch.
6. Nächster Artikel.

### Mehrere Exemplare derselben Platte

Wenn du 2 Stück in der Hand hast:
1. Suche → Treffer öffnen
2. Exemplar #1 bewerten → bestätigen → Label 1 druckt
3. Klick **"+ Weiteres Exemplar"** (oder Taste [A])
4. Exemplar #2 bewerten → bestätigen → Label 2 druckt

Jedes Exemplar bekommt seinen eigenen Barcode. Nicht durcheinander bringen — Label sofort auf dieses Exemplar kleben!

### Nicht im System?

Wenn die Suche nichts findet: Platte in die Kiste **"Nicht im System"** legen. Wir kümmern uns später drum.

### Foto machen (iPhone)

Wenn das Cover-Bild im System fehlt oder veraltet ist:
1. Im Release-Detail → **Kamera-Button** (📷) neben dem Cover
2. iPhone-Kamera öffnet sich → Foto machen
3. Lädt automatisch hoch + optimiert

---

## Kasse (POS Walk-in)

**Klick-Pfad:** Sidebar → **POS** → **Terminal**

Oder direkt: `https://admin.vod-auctions.com/app/pos`

### Ablauf Laden-Verkauf

1. **Neue Session starten** → Terminal öffnet sich
2. **Scanne Barcode** jedes Artikels → landet im Warenkorb
3. **Kunde:** 
   - **Anonym** (Laufkundschaft ohne Name) oder
   - **Suchen** (Stammkunde) oder
   - **Neu anlegen** (mit Adresse für Rechnung)
4. **Zahlungsart:** SumUp (Karte) / Bar / PayPal / Überweisung
5. Bei Bar: **Kassengeld eingeben** → Wechselgeld wird angezeigt
6. **Checkout** → Quittung druckt (A6 auf dem normalen Drucker)

### Rabatt geben

Im Warenkorb: **"Rabatt"** → Betrag in EUR oder Prozent.

---

## Drucker-Probleme

| Symptom | Lösung |
|---|---|
| Label bleibt leer / gar nichts passiert | Drucker aus/an. `brew services restart qz-tray` im Terminal. |
| Label ist winzig (quadratisch) | Ruf Robin an — Drucker-Mode ist verstellt. |
| Label ist nur halb bedruckt | Rolle neu einlegen (Deckel auf, Rolle rausnehmen, wieder rein, Deckel zu). |
| Scanner tippt Schrott (z.B. `ß` statt `-`) | Ruf Robin an — Scanner-Tastaturlayout ist verstellt. |
| Admin-Seite lädt nicht | WLAN prüfen. Safari → Neu laden (Cmd+R). |

---

## Feierabend

1. Browser-Tab schließen (nicht abmelden — am nächsten Tag bist du direkt drin)
2. Scanner ausschalten (Power-Knopf lang drücken)
3. Drucker kann an bleiben (geht nach 5 Min in Standby)

---

## Notfallkontakt

**Robin:** rseckler@gmail.com — Slack / Telefon / SMS

Wenn was nicht geht: Screenshot machen (Cmd + Shift + 4), beschreiben was du gemacht hast, schicken.
