# Buchhaltung & Warenwirtschaft — VOD Records
## Differenzbesteuerung, Kommissionsgeschäft & Systemauswahl
**Stand:** 2026-03-28 | **Rechtsgrundlagen:** § 25a UStG, § 383 ff. HGB

---

## Inhaltsverzeichnis

1. [Unternehmenskontext](#1-unternehmenskontext)
2. [Kernproblem und Lösung — Differenzbesteuerung](#2-kernproblem-und-lösung--differenzbesteuerung)
3. [Voraussetzungen §25a UStG](#3-voraussetzungen-25a-ustg)
4. [Anwendung nach Einkaufsquelle](#4-anwendung-nach-einkaufsquelle)
5. [Kontenrahmen SKR03 / SKR04](#5-kontenrahmen-skr03--skr04)
6. [Buchungslogik](#6-buchungslogik)
7. [Artikelstammblatt und Margennachweis](#7-artikelstammblatt-und-margennachweis)
8. [Eigenbeleg bei Privatankauf](#8-eigenbeleg-bei-privatankauf-muster)
9. [Ausgangsrechnung — Pflichtangaben](#9-ausgangsrechnung--pflichtangaben)
10. [USt-Voranmeldung](#10-ust-voranmeldung)
11. [Jahresabschluss (EÜR)](#11-jahresabschluss-eür)
12. [Ablagestruktur](#12-ablagestruktur-digital)
13. [Betriebliche Checklisten](#13-betriebliche-checklisten)
14. [Erweiterung: Drittanbieter-Modell (Kommissionsgeschäft)](#14-erweiterung-drittanbieter-modell-kommissionsgeschäft)
15. [Systemvergleich: Buchhaltung & Warenwirtschaft](#15-systemvergleich-buchhaltung--warenwirtschaft)
16. [Empfehlung: Dreistufige Strategie](#16-empfehlung-dreistufige-strategie)
16a. [Detailvergleich: Odoo vs. ERPNext](#16a-detailvergleich-odoo-vs-erpnext)
16b. [ERPNext Installationsplanung (VPS)](#16b-erpnext-installationsplanung-vps)
17. [Steuerberater-Entscheidungsvorlage](#17-steuerberater-entscheidungsvorlage)
18. [Softwarekonfiguration (Kurzreferenz)](#18-softwarekonfiguration-kurzreferenz)

---

## 1. Unternehmenskontext

| Feld | Wert |
|------|------|
| Unternehmen | VOD Records |
| Inhaber | Frank Bull |
| Adresse | Alpenstrasse 25/1, 88045 Friedrichshafen |
| Gesellschaftsform | Einzelunternehmen |
| Branche | Handel (Gebrauchtwaren: Vinyl, Kassetten, CDs, Merchandise) |
| USt-IdNr. | DE232493058 |
| Steuerpflicht | Umsatzsteuerpflichtig (19%) |
| Plattform | vod-auctions.com |
| Buchführung | Einnahmen-Überschuss-Rechnung (EÜR) |

---

## 2. Kernproblem und Lösung — Differenzbesteuerung

### Problem

Einkauf von Gebrauchtwaren ohne abziehbare Vorsteuer:
- Kauf von **Privatpersonen** (keine USt ausgewiesen)
- Kauf von **Kleinunternehmern** (§ 19 UStG, keine USt)
- Kauf von **EU-Privatpersonen** (kein Vorsteuerabzug möglich)

Ohne Sonderregelung: 19% USt auf den **vollen Verkaufspreis** → struktureller Steuernachteil.

### Lösung: Differenzbesteuerung § 25a UStG

Für **selbst angekaufte gebrauchte Gegenstände**, die die Voraussetzungen des § 25a UStG erfüllen, wird die Umsatzsteuer **nicht aus dem gesamten Verkaufspreis**, sondern aus der **Bemessungsgrundlage der Marge** ermittelt. Bei Anwendung der Einzeldifferenzbesteuerung ist grundsätzlich je Artikel die positive Differenz zwischen Verkaufs- und Einkaufspreis maßgeblich. Ein gesonderter Umsatzsteuerausweis in der Rechnung ist unzulässig.

```
Beispielrechnung:
  Einkauf (Privatperson):       € 100,00  (kein VSt-Abzug)
  Verkauf:                      € 150,00
  Marge (Bemessungsgrundlage):  €  50,00
  USt (19/119 × 50,00):        €   7,98
  Netto-Marge:                  €  42,02

  Ohne §25a: USt auf Vollpreis = €150 × 19/119 = €23,95
  Mit  §25a: USt auf Marge     = € 50 × 19/119 =  €7,98
  Ersparnis:                                      €15,97  (= 19% auf EK-Preis)
```

> **Geltungsbereich:** Diese Aussage gilt ohne Einschränkung nur für **eigene Ware**. Für **Kommissionsfälle** (Drittanbieter-Modell) ist eine gesonderte umsatzsteuerliche Prüfung je Einzelfall erforderlich — die Anwendung von §25a ist dort nicht pauschal gegeben.

---

## 3. Voraussetzungen §25a UStG

Alle Kriterien müssen gleichzeitig erfüllt sein:

| Kriterium | Status VOD Records |
|-----------|-------------------|
| Wiederverkäufer (gewerblicher Händler) | ✅ Einzelunternehmen, Bereich Handel |
| Gebrauchtgegenstände (körperliche, bewegliche Gegenstände) | ✅ Vinyl, Kassetten, CDs, Bücher, Merchandise |
| Erwerb von Privatpersonen | ✅ |
| Erwerb von Kleinunternehmern (§ 19 UStG) | ✅ |
| Erwerb von nicht zum gesondertem Steuerausweis berechtigten Vorverkäufern oder unter Margenregelung | ✅ je nach Beleglage prüfen |
| Kein gesonderter VSt-Ausweis beim Einkauf | ✅ Bedingung per Definition erfüllt |

> **Hinweis zu grenzüberschreitenden Sachverhalten:** Bei Einkäufen innerhalb der EU ist die konkrete Rechnungslage je Einzelfall zu prüfen und zu dokumentieren. Eine pauschale Annahme "EU-Händler ohne USt = §25a sicher anwendbar" ist nicht zulässig — die Berechtigung des Vorverkäufers zur Differenzbesteuerung muss aus der Rechnung erkennbar sein.

---

## 4. Anwendung nach Einkaufsquelle

| Einkaufsquelle | Standardbewertung | Hinweis |
|----------------|-------------------|---------|
| Deutsche Privatperson | §25a regelmäßig möglich | Eigenbeleg sauber dokumentieren, Verfügungsberechtigung bestätigen lassen |
| EU-Privatperson (eBay, Discogs, Ankauf vor Ort) | oft §25a-fähig | Einzelfall und Beleglage prüfen, Herkunft dokumentieren |
| EU-Händler mit Rechnung unter Differenzbesteuerung | oft §25a-fähig | Rechnungstext muss §25a-Vermerk enthalten, Herkunft dokumentieren |
| Kleinunternehmer DE/EU (§ 19 UStG) | häufig prüfbar | Einzelfall mit Steuerberater abstimmen |
| EU-Händler mit offenem USt-Ausweis | Reguläre Besteuerung | Vorsteuer nur bei Erfüllung aller Voraussetzungen |
| Non-EU Import (USA, Japan, UK) | Reguläre Importlogik | Einfuhr-USt gesondert behandeln, als Vorsteuer abziehbar |

> **Wichtig:** Die Tabelle zeigt Regeltendenzen, keine Garantien. Gerade bei EU-Fällen und Händlereinkäufen darf §25a nicht ohne Rechnungsprüfung pauschal als anwendbar angenommen werden. Im Zweifel: Steuerberater einschalten.

---

## 5. Kontenrahmen SKR03 / SKR04

### Einkauf (Aufwand)

| SKR03 | SKR04 | Bezeichnung | Steuercode |
|-------|-------|-------------|------------|
| 3400 | 5400 | Wareneinkauf Differenzbesteuerung — Privat DE | Kein (U0) |
| 3420 | 5420 | Wareneinkauf Differenzbesteuerung — EU-Privat | Kein (U0) |
| 3200 | 5200 | Wareneinkauf regulär (mit Vorsteuer) | VSt 19% |
| 3730 | 5730 | Provisionsauszahlung Einlieferer (Kommission) | Kein Umsatz |

### Verkauf (Erlöse)

| SKR03 | SKR04 | Bezeichnung | Steuercode |
|-------|-------|-------------|------------|
| 8200 | 4200 | Erlöse Differenzbesteuerung §25a — eigene Ware | USt auf Marge |
| 8201 | 4201 | Erlöse Differenzbesteuerung §25a — Kommissionsware | USt auf Provision |
| 8400 | 4400 | Erlöse regulär 19% | USt 19% |
| 8120 | 4120 | Provisionserlöse Kommissionsgeschäft | USt 19% |

### Bestandskonten (optional bei doppelter Buchführung)

| SKR03 | SKR04 | Bezeichnung |
|-------|-------|-------------|
| 1140 | 1140 | Warenbestand eigene Ware (Differenzbesteuerung) |
| 1141 | 1141 | Warenbestand Kommissionsware (Fremdbestand) |

---

## 6. Buchungslogik

### 6.1 Einkauf von Privatperson (eigene Ware)

```
SOLL  3400  Wareneinkauf Differenz      100,00 €
  HABEN  1600  Kasse / 1200 Bank        100,00 €

Steuercode:  Kein (kein VSt-Abzug)
Belegtext:   "Ankauf Privat: [Name], [Artikel-Nr.], [Beschreibung]"
```

### 6.2 Verkauf — Differenzbesteuerung

```
SOLL  1600  Kasse / 1200 Bank           150,00 €
  HABEN  8200  Erlöse Differenz-Best.   150,00 €

Steuercode:  Differenz §25a
Belegtext:   "Verkauf §25a: [Artikel-Nr.], EK: 100,00 €, VK: 150,00 €"

Interne USt-Berechnung:
  Marge brutto:     50,00 €
  USt (19/119):      7,98 €
  Netto-Marge:      42,02 €
```

### 6.3 Kommissionsgeschäft — Buchungsfluss

> ⚠️ **Vorläufige Skizze — keine endgültige steuerliche Buchungsanweisung.**
> Die umsatzsteuerliche Einordnung des Kommissionsmodells (echte Verkaufskommission vs. Vermittlungsmodell) muss vor Go-live mit dem Steuerberater verbindlich geklärt und freigegeben werden. Die Auszahlung an den Einlieferer ist **nicht pauschal als neutraler Durchläufer** zu behandeln — die steuerliche Lieferkette (Einlieferer → Kommissionär → Käufer) erfordert eine gesonderte Prüfung.

```
Einlieferung (kein Buchungssatz — Fremdbestand, kein Eigentumswechsel):
  → Nur Bestands- und Vertragsnachweis in Warenwirtschaft

Verkauf der Kommissionsware (vorläufig):
SOLL  1600  Kasse / 1200 Bank           150,00 €
  HABEN  8201  Erlöse Kommissionsware   150,00 €

Auszahlung an Einlieferer (vorläufig):
SOLL  3730  Provisionsauszahlung        115,01 €
  HABEN  1200  Bank                     115,01 €

Einbehaltene Provision VOD Records:
  Verkaufserlös:             150,00 €
  - Auszahlung Einlieferer: -115,01 €
  = Provision:                34,99 €  (eigenständige Erlöskomponente)
```

**Zwei Varianten — Entscheidung erforderlich (siehe Kapitel 14):**

| | Variante A — Echte Verkaufskommission | Variante B — Vermittlungsmodell |
|-|--------------------------------------|--------------------------------|
| Verkauf | VOD Records im eigenen Namen | Einlieferer verkauft direkt |
| Kaufvertrag | VOD Records ↔ Käufer | Einlieferer ↔ Käufer |
| USt-Kette | Gesonderte Prüfung Lieferkette | Provision = einziger Umsatz VOD |
| §25a möglich | Je nach Einlieferer-Status | Nicht relevant für Durchlauf |
| Haftung | VOD Records | Einlieferer |

### 6.4 Wahl der Differenzbesteuerungsmethode

| Methode | Beschreibung | Empfehlung VOD Records |
|---------|-------------|----------------------|
| **Einzeldifferenzbesteuerung** | Jeder Artikel mit EK-Preis einzeln dokumentiert. USt auf Einzelmarge. Negative Marge = 0 € USt. | ✅ Empfohlen |
| **Gesamtdifferenzbesteuerung** (§ 25a Abs. 4) | Monatliche Saldierung aller EK/VK-Summen. Positive und negative Margen verrechenbar. | Nur bei sehr vielen gleichartigen Kleinstartikeln |

---

## 7. Artikelstammblatt und Margennachweis

### Pflichtfelder pro Artikel

Für jeden Artikel müssen folgende Felder geführt werden (in vod-auctions.com bereits teilweise vorhanden):

```
Artikel-Nr.:        VOD-00001
Beschreibung:       Throbbing Gristle - 20 Jazz Funk Greats
Format:             Vinyl LP
Zustand:            NM/VG+

EINKAUF
  Datum:            2026-03-15
  Lieferant:        Max Mustermann (Privatperson)
  Adresse:          Musterstr. 1, 12345 Berlin
  Einkaufspreis:    € 85,00
  Beleg-Nr.:        EK-2026-0042
  Steuerart:        Differenzbesteuerung (Privat DE)
  Eigentümer:       VOD Records (eigene Ware)

VERKAUF
  Datum:            2026-03-22
  Verkaufskanal:    vod-auctions.com / Auktion
  Verkaufspreis:    € 140,00
  Marge brutto:     €  55,00
  USt auf Marge:    €   8,78  (= 19/119 × 55,00)
  Netto-Marge:      €  46,22
```

### A. Margennachweis Eigenware §25a UStG (monatlich, Excel-Vorlage)

> Nur eigene, selbst angekaufte Ware. Kommissionsware gehört in Tabelle B.

| Artikel-Nr. | Beschreibung | EK-Datum | EK-Preis | VK-Datum | VK-Preis | Marge brutto | USt (19/119) | Netto-Marge |
|------------|--------------|----------|----------|----------|----------|-------------|-------------|-------------|
| VOD-00001 | TG — 20 Jazz Funk... | 15.03. | 85,00 | 22.03. | 140,00 | 55,00 | 8,78 | 46,22 |
| VOD-00002 | NWW — Nurse With... | 10.03. | 40,00 | 28.03. | 95,00 | 55,00 | 8,78 | 46,22 |
| **Summe März (Eigenware)** | | | **125,00** | | **235,00** | **110,00** | **17,56** | **92,44** |

> **Abgrenzung:** Diese Summe geht in KZ 81 (Netto-Marge 92,44 €) der USt-Voranmeldung ein.

### B. Abrechnungsnachweis Kommissionsware (monatlich, Excel-Vorlage)

> Nur Ware Dritter (Einlieferer). Bemessungsgrundlage für USt = einbehaltene Provision, NICHT der Vollverkaufspreis.

| Artikel-Nr. | Einlieferer | VK-Datum | VK-Preis | Provision (%) | Provision € | USt auf Provision (19%) | Netto-Provision | Auszahlung Einlieferer |
|------------|------------|----------|----------|:------------:|------------|:----------------------:|----------------|----------------------|
| VOD-00103 | Einlieferer A | 18.03. | 80,00 | 20% | 16,00 | 2,55 | 13,45 | 64,00 |
| **Summe März (Kommission)** | | | **80,00** | | **16,00** | **2,55** | **13,45** | **64,00** |

> **Wichtig:** Die Summe der Provisions-Erlöse (KZ 81: 13,45 € netto) und die der Eigenware-Marge (92,44 €) sind **getrennt nachzuweisen** und dürfen in der USt-Voranmeldung nicht vermischt werden. Auszahlung an den Einlieferer (64,00 €) ist **kein Umsatz** von VOD Records — die umsatzsteuerliche Einordnung ist jedoch abhängig vom gewählten Kommissionsmodell (Variante A/B, siehe Kapitel 14). Verbindliche Klärung durch Steuerberater erforderlich.

---

## 8. Eigenbeleg bei Privatankauf (Muster)

Pflichtdokument bei jedem Kauf von einer Privatperson, wenn kein schriftlicher Kaufvertrag vorliegt. Aufbewahrungspflicht: **10 Jahre**.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EIGENBELEG / ANKAUFQUITTUNG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Käufer:
  VOD Records, Frank Bull
  Alpenstrasse 25/1, 88045 Friedrichshafen
  USt-IdNr.: DE232493058

Verkäufer (Privatperson):
  Name:     [Vorname Nachname]
  Adresse:  [Straße Nr., PLZ Ort]
  (Keine USt-IdNr. — Privatperson)

Datum:        JJJJ-MM-TT
Beleg-Nr.:    EK-2026-XXXX

Ware:
  [Künstler — Titel — Format — Pressung — Zustand]

Einkaufspreis:          € XX,00
(Kein Umsatzsteuerausweis — Privatverkauf)

Intern:
  Artikel-Nr.:          VOD-XXXXX
  Steuerbehandlung:     Differenzbesteuerung §25a UStG
                        Kein Vorsteuerabzug möglich

Bestätigung Verkäufer:
  Der Verkäufer bestätigt, verfügungsberechtigt zu sein und
  die Ware aus seinem Privatvermögen zu veräußern. Die Ware
  ist nicht Gegenstand eines laufenden Gewerbebetriebs.

Unterschrift Verkäufer: _______________________
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

> **Hinweis (O-08):** Die Bestätigung der Verfügungsberechtigung ist Voraussetzung für die Anwendung von §25a UStG. Ohne sie kann das Finanzamt die Differenzbesteuerung im Prüfungsfall versagen. Eigenbelege ohne diese Bestätigung sind **nicht ausreichend** als Nachweis.

---

## 9. Ausgangsrechnung — Pflichtangaben

### Was NICHT auf der Rechnung stehen darf

- Kein gesonderter USt-Betrag (auch nicht als "0%" oder "enthaltene USt: €7,98")
- Kein Hinweis auf den Einkaufspreis oder die berechnete Marge

### Pflichttext auf jeder Differenzbesteuerungs-Rechnung

```
"Gebrauchtgegenstände / Sonderregelung (§ 25a UStG).
 Ein gesonderter Umsatzsteuerausweis ist nicht zulässig."
```

> ⚠️ **Wichtig (O-01):** Die Formulierung **„ist nicht zulässig"** ist gegenüber der Variante „entfällt" zwingend zu bevorzugen. „Entfällt" suggeriert eine optionale Weglassung; „ist nicht zulässig" stellt klar, dass ein USt-Ausweis rechtlich untersagt ist (§ 25a Abs. 3 UStG). Eine Rechnung mit offenem USt-Ausweis bei §25a-Ware ist **steuerrechtlich fehlerhaft** und kann zur Nachforderung führen.

**Interne Prüfregeln vor Rechnungsversand:**
- [ ] Kein Euro-Betrag für USt ausgewiesen (auch nicht als 0 €)
- [ ] Kein %-Satz für USt aufgeführt
- [ ] §25a-Pflichttext vollständig und wortgenau enthalten
- [ ] Einkaufspreise und Marge nicht in der Rechnung sichtbar

**Konsequenz für den Käufer:** Gewerbliche Käufer können aus diesen Rechnungen **keine Vorsteuer** ziehen.

### Rechnungsmuster

```
VOD Records — Frank Bull
Alpenstrasse 25/1, 88045 Friedrichshafen
USt-IdNr.: DE232493058

RECHNUNG Nr. VK-2026-XXXX
Datum: JJJJ-MM-TT

An: [Kundenname]
    [Straße, PLZ Ort, Land]

Pos.  Art.-Nr.     Beschreibung                        Preis
──────────────────────────────────────────────────────────────
 1    VOD-00001    Throbbing Gristle                  140,00 €
                  20 Jazz Funk Greats
                  Vinyl LP, UK 1979, NM/VG+
──────────────────────────────────────────────────────────────
Rechnungsbetrag:                                     140,00 €

Gebrauchtgegenstände / Sonderregelung (§ 25a UStG).
Ein gesonderter Umsatzsteuerausweis ist nicht zulässig.
```

---

## 10. USt-Voranmeldung

### Korrekte Eintragung (Elster / DATEV)

```
Kennziffer 81 — Steuerpflichtige Umsätze 19%:
  → NUR die Netto-Marge eintragen, NICHT den Verkaufspreis!

Beispiel Monat März:
  Verkäufe Differenzbesteuerung gesamt:    10.000,00 €
  Zugehörige Einkäufe (Privat):             6.000,00 €
  Gesamtmarge (brutto inkl. USt-Anteil):    4.000,00 €

  KZ 81 — Bemessungsgrundlage (netto):      3.361,34 €  (= 4.000 × 100/119)
  KZ 81 — Steuer:                             638,66 €  (= 4.000 × 19/119)
```

### Häufiger Fehler

```
FALSCH: Verkaufspreis 10.000 € in KZ 81 → zu hohe USt-Zahlung!
RICHTIG: Nur Netto-Marge 3.361 € in KZ 81 → korrekte USt-Last
```

### Kommissions-Provision in der USt-VA

```
Provisionserlöse VOD Records (eigene Leistung):
  KZ 81 — voller Provisionsbetrag netto (19% USt auf Provision)

Durchlaufender Betrag (Auszahlung an Einlieferer):
  Kein Umsatz, kein Eintrag in USt-VA
  (vorbehaltlich Klärung Kommissionsmodell durch Steuerberater)
```

> ⚠️ **Vorbehalt (O-05):** Die korrekte Ermittlung der in KZ 81 einzutragenden Bemessungsgrundlage bei §25a-Umsätzen — insbesondere die Abgrenzung zwischen Eigenware-Marge und Kommissions-Provision — ist **vor der ersten Voranmeldung mit dem Steuerberater zu bestätigen**. Eine fehlerhafte Eintragung (z. B. Vollverkaufspreise statt Netto-Margen in KZ 81) führt zur Überzahlung von Umsatzsteuer und ist im Prüfungsfall schwer korrigierbar.

---

## 11. Jahresabschluss (EÜR)

```
EINNAHMEN
  Erlöse Differenzbesteuerung (eigene Ware):     XX.XXX,00 €  (Vollbetrag VK-Preise)
  Erlöse regulär 19%:                            XX.XXX,00 €
  Provisionserlöse Kommissionsgeschäft:          XX.XXX,00 €

AUSGABEN
  Wareneinkauf Differenz (ohne VSt):             XX.XXX,00 €
  Wareneinkauf regulär (netto):                  XX.XXX,00 €
  Auszahlungen an Einlieferer:                   XX.XXX,00 €  (⚠ Einordnung je nach Kommissionsmodell, s. Hinweis)
  Abgeführte USt auf Marge:                      XX.XXX,00 €  ← Betriebsausgabe, mindert ESt-Gewinn
  Sonstige Betriebsausgaben:                     XX.XXX,00 €

GEWINN (vor Einkommensteuer):                    XX.XXX,00 €
```

> **Hinweis:** Die abgeführte USt auf die Handelsmarge ist Betriebsausgabe und mindert den einkommensteuerpflichtigen Gewinn.

> ⚠️ **Wichtig für Kommissionsware (O-10):** Die Auszahlung an Einlieferer ist **nicht pauschal als neutraler Durchläufer** ohne einkommensteuerliche Relevanz zu behandeln. Bei der **echten Verkaufskommission (Variante A)** kann der volle Verkaufserlös als Einnahme und die Einliefererzahlung als Betriebsausgabe zu erfassen sein — dies hängt von der steuerrechtlichen Einordnung der Lieferkette ab. Die EÜR-Behandlung ist **mit dem Steuerberater vor Beginn des Kommissionsgeschäfts verbindlich zu klären** und zu dokumentieren.

---

## 12. Ablagestruktur (digital)

```
VOD_Records_Buchhaltung/
├── JJJJ_Einkauf_Differenzbesteuerung/
│   ├── DE_Privat/
│   │   └── EK-JJJJ-NNNN_[Name]_[Artikel].pdf
│   └── EU_Privat/
│       └── EK-JJJJ-NNNN_[Name]_[Artikel].pdf
├── JJJJ_Einkauf_Regulaer/
│   └── RE-JJJJ-NNNN_[Lieferant].pdf
├── JJJJ_Verkauf_Differenzbesteuerung/
│   └── VK-JJJJ-NNNN.pdf
├── JJJJ_Verkauf_Regulaer/
├── JJJJ_Kommission/
│   ├── Einlieferungsbelege/
│   │   └── EINL-JJJJ-NNNN_[Einlieferer].pdf
│   └── Abrechnungen/
│       └── ABR-JJJJ-NNNN_[Einlieferer].pdf
├── JJJJ_Margennachweis/
│   └── Margen_[Monat]_JJJJ.xlsx
└── JJJJ_USt_Voranmeldungen/
    └── USt_VA_[MM]_JJJJ.pdf
```

---

## 13. Betriebliche Checklisten

### Monatlich

- [ ] Margennachweis-Tabelle aktualisieren (alle Verkäufe mit EK-Preis)
- [ ] USt-Voranmeldung: nur Netto-Margen in KZ 81 eintragen
- [ ] Eigenbelege für alle Privatankäufe vorhanden und abgelegt
- [ ] Abrechnungsbelege für Einlieferer erstellen und versenden
- [ ] Auszahlungen an Einlieferer durchführen und buchen

### Quartalsweise

- [ ] Differenzbesteuerungs-Konten mit Margennachweis abstimmen
- [ ] Artikel ohne Beleg identifizieren und nacherfassen
- [ ] Kommissionsbestand mit physischem Lager abgleichen

### Jährlich

- [ ] Vollständige Margenaufstellung an Steuerberater übergeben
- [ ] Prüfung: Alle Differenzbesteuerungs-Artikel korrekt dokumentiert
- [ ] Jahres-USt-Erklärung: Anlage UN
- [ ] Aufbewahrungsfrist prüfen: **10 Jahre** (alle Belege + Margennachweis)
- [ ] Einlieferer-Jahresabrechnung (optional, für Steuererklärung Einlieferer)

---

## 14. Erweiterung: Drittanbieter-Modell (Kommissionsgeschäft)

### Rechtliche Grundlage

Das Kommissionsgeschäft nach **§ 383 ff. HGB** ist die geeignete Rechtsform für den Verkauf fremder Ware auf vod-auctions.com:

```
Einlieferer (Kommittent)
  ↓  übergibt Ware zur Verwahrung + Verkauf
VOD Records (Kommissionär)
  ↓  verkauft in eigenem Namen, aber für Rechnung des Einlieferers
Käufer

Abrechnung (Beispiel):
  Verkaufspreis (Auktion):       € 150,00
  ./. Provision VOD (20%):      -€  30,00
  ./. Versandkosten (pauschal): -€   4,99
  = Auszahlung an Einlieferer:  € 115,01
```

### Steuerliche Behandlung

| Position | Umsatzsteuer | Buchung |
|----------|-------------|---------|
| Verkaufserlös (Gesamtbetrag) | Umsatz VOD Records (Differenzbesteuerung oder 19%) | 8200/8201 |
| Einbehaltene Provision | 19% USt auf Provision | 8120 |
| Auszahlung an Einlieferer | Kein Umsatz (⚠️ nicht pauschal Durchläufer — Klärung StB erforderlich) | 3730 |
| Einlieferer ist Privatperson | Differenzbesteuerung auf Gesamterlös anwendbar | §25a |
| Einlieferer ist Unternehmer mit USt | Reguläre Abrechnung, VSt prüfen | regulär |

### Einlieferer-Einlieferungsbeleg (Muster)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EINLIEFERUNGSBELEG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOD Records — Frank Bull
Alpenstrasse 25/1, 88045 Friedrichshafen

Einlieferer:      [Name, Adresse]
Beleg-Nr.:        EINL-2026-XXXX
Datum:            JJJJ-MM-TT

Eingelieferte Ware:
Pos.  Art.-Nr.  Beschreibung             Mindestpreis  Zielpreis
────────────────────────────────────────────────────────────────
  1   VOD-0200  Einstürzende Neubauten   € 60,00       € 85,00
                Kollaps LP, DE 1981
  2   VOD-0201  SPK — Information        € 40,00       € 65,00
                12", AU 1983
────────────────────────────────────────────────────────────────

Provisionsvereinbarung:
  Provision VOD Records:  20% vom Verkaufspreis
  Mindestlaufzeit:        90 Tage
  Rückgabe nicht verkaufter Ware: nach Ablauf auf Anfrage

Unterschrift Einlieferer: _____________________
Unterschrift VOD Records: _____________________
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Abrechnungsbeleg für Einlieferer (Muster)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABRECHNUNG Nr. ABR-2026-0001
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Von:  VOD Records, Frank Bull
      Alpenstrasse 25/1, 88045 Friedrichshafen
      USt-IdNr.: DE232493058

An:   [Einlieferer Name, Adresse]

Zeitraum: 01.03.2026 – 31.03.2026

Verkaufte Artikel:
Pos.  Art.-Nr.  Beschreibung         Datum    VK-Preis   Provision  Auszahlung
─────────────────────────────────────────────────────────────────────────────
  1   VOD-0200  Einstürzende N.     08.03.   €  85,00   € 17,00    €  68,00
  2   VOD-0201  SPK — Information   18.03.   €  65,00   € 13,00    €  52,00
─────────────────────────────────────────────────────────────────────────────
  Summe Verkäufe:                            € 150,00
  ./. Provision VOD Records (20%):           -€  30,00
  = Auszahlungsbetrag:                        € 120,00
─────────────────────────────────────────────────────────────────────────────

Noch nicht verkauft (Bestand):
  - VOD-0202  Nurse With Wound LP  (eingeliefert 05.03., Mindestpreis €90)

Auszahlung erfolgt auf:
  IBAN: [IBAN des Einlieferers]
  Zahlungsziel: 14 Tage

VOD Records, Alpenstrasse 25/1, 88045 Friedrichshafen
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Datenbankschema (Erweiterung vod-auctions.com)

```sql
-- Einlieferer-Stammdaten
CREATE TABLE consignor (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  address          TEXT,
  iban             TEXT,
  commission_rate  DECIMAL(5,2) DEFAULT 20.00,
  tax_id           TEXT,          -- USt-IdNr. falls gewerblich
  is_private       BOOLEAN DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Eingelieferte Artikel (verknüpft mit Release-Tabelle)
CREATE TABLE consignment_item (
  id                    TEXT PRIMARY KEY,
  consignor_id          TEXT REFERENCES consignor(id),
  release_id            TEXT,     -- FK zur bestehenden Release-Tabelle
  agreed_min_price      DECIMAL(10,2),
  consignor_target_price DECIMAL(10,2),
  reception_date        DATE,
  status                TEXT DEFAULT 'received',
                        -- received / listed / sold / returned / expired
  sold_price            DECIMAL(10,2),
  commission_rate       DECIMAL(5,2),
  commission_amount     DECIMAL(10,2),
  payout_amount         DECIMAL(10,2),
  settlement_id         TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Abrechnungsbelege
CREATE TABLE consignment_settlement (
  id                 TEXT PRIMARY KEY,
  settlement_number  TEXT UNIQUE,   -- ABR-2026-0001
  consignor_id       TEXT REFERENCES consignor(id),
  period_from        DATE,
  period_to          DATE,
  total_sales        DECIMAL(10,2),
  total_commission   DECIMAL(10,2),
  total_payout       DECIMAL(10,2),
  status             TEXT DEFAULT 'draft',  -- draft / sent / paid
  pdf_url            TEXT,
  sent_at            TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 15. Systemvergleich: Buchhaltung & Warenwirtschaft

### Anforderungsübersicht

| Anforderung | Eigene Ware | Drittanbieter-Modell |
|------------|:-----------:|:--------------------:|
| §25a Differenzbesteuerung (Margennachweis) | ✅ Pflicht | ✅ Pflicht |
| Lagerbestand pro Artikel | ✅ | ✅ (getrennt nach Eigentümer) |
| Einlieferer-Verwaltung | — | ✅ Pflicht |
| Abrechnungsbeleg PDF generieren | — | ✅ Pflicht |
| Provisionsberechnung automatisch | — | ✅ Pflicht |
| Integration vod-auctions.com | ✅ | ✅ |
| DATEV-Export für Steuerberater | ✅ Sinnvoll | ✅ Sinnvoll |
| Ausgangsrechnungen automatisch | ✅ | ✅ |
| Multi-Channel (eBay, Discogs, etc.) | Sinnvoll | Optional |

---

### Option A1 — Lexoffice

| Kriterium | Bewertung | Details |
|-----------|:---------:|---------|
| §25a Differenzbesteuerung | ✅ | Individueller Steuersatz konfigurierbar |
| Kommissionsabrechnung | ❌ | Manuell via Excel erforderlich |
| API / Integration vod-auctions.com | ✅ | REST API + Webhooks vorhanden |
| Warenwirtschaft | ❌ | Nicht enthalten |
| Einlieferer-Verwaltung | ❌ | Nicht vorhanden |
| Abrechnungsbeleg PDF | ❌ | Nicht vorhanden |
| DATEV-Export | ✅ | Standard |
| Preis | ✅ | €8–18/Monat |
| Lernaufwand | ✅ | Niedrig |
| Skalierbarkeit | ⚠️ | Begrenzt |

**Geeignet für:** Übergangsphase, reine eigene Ware, bis ~200 Transaktionen/Monat.

---

### Option A2 — sevDesk

| Kriterium | Bewertung | Details |
|-----------|:---------:|---------|
| §25a Differenzbesteuerung | ✅ | Steuercode konfigurierbar |
| Kommissionsabrechnung | ⚠️ | Workaround möglich, nicht nativ |
| API / Integration | ✅ | REST API verfügbar |
| Warenwirtschaft | ⚠️ | Basic (Artikel, kein Lager-Tracking) |
| Einlieferer-Verwaltung | ❌ | Nicht vorhanden |
| DATEV-Export | ✅ | Standard |
| Preis | ⚠️ | €14–49/Monat |
| Lernaufwand | ✅ | Niedrig |
| Skalierbarkeit | ⚠️ | Begrenzt |

**Geeignet für:** Kleine bis mittlere Betriebe, wenn Kommission manuell tolerierbar ist.

---

### Option A3 — Odoo (Cloud oder Self-Hosted)

| Kriterium | Bewertung | Details |
|-----------|:---------:|---------|
| §25a Differenzbesteuerung | ✅ | Steuermodul vollständig konfigurierbar |
| Kommissionsabrechnung | ✅ | Konsignationslager-Modul vorhanden |
| API / Integration | ✅ | XML-RPC + REST API |
| Warenwirtschaft | ✅ | Vollständig (Lager, Lot-Tracking, Seriennummern) |
| Einlieferer-Verwaltung | ✅ | Vendor-Verwaltung |
| Abrechnungsbeleg PDF | ✅ | Mit Konfiguration |
| DATEV-Export | ✅ | Via Modul |
| Preis | ⚠️ | €0 Community (eingeschränkt) / €24+/User/Monat Enterprise |
| Self-Hosting | ✅ | Community Edition kostenlos, aber Open Core |
| Lernaufwand | ❌ | Hoch (vollständiges ERP) |
| Integration vod-auctions.com | ⚠️ | Erheblicher Anpassungsaufwand |
| Open Source | ⚠️ | Open Core — Enterprise-Features kostenpflichtig |

**Geeignet für:** Wenn Drittanbieter-Modell schnell skaliert und vollständiges ERP gewünscht wird.
**Kritischer Punkt:** Auktions-Spezialmodell erfordert erhebliche Odoo-Anpassung. Open Core Modell bedeutet: viele relevante Features nur gegen Aufpreis.

---

### Option A5 — ERPNext / Frappe (Cloud oder Self-Hosted) ← Strategische Wahl

| Kriterium | Bewertung | Details |
|-----------|:---------:|---------|
| §25a Differenzbesteuerung | ⚠️ | Nicht nativ — konfigurierbar via Custom Tax Templates, Einzelfall prüfen |
| Kommissionsabrechnung | ⚠️ | Sales Partners / Commission-Modul vorhanden, Konsignationslager custom |
| API / Integration | ✅ | REST API + Webhooks + OAuth 2.0, n8n/Zapier-Konnektoren |
| Warenwirtschaft | ✅ | Vollständig (Multi-Warehouse, Serial/Batch-Tracking, Lagerberichte) |
| Einlieferer-Verwaltung | ✅ | Via Custom DocTypes realisierbar |
| Abrechnungsbeleg PDF | ✅ | Integrierter PDF-Generator, Jinja2-Templates anpassbar |
| DATEV-Export | ✅ | Community-Module: ALYF (SKR04), 4commerce (SKR03 Mini) |
| SKR03 / SKR04 | ✅ | Community-gepflegte Kontenrahmen-Templates |
| GoBD-Konformität | ✅ | Immutable Audit Trail, unveränderliche Buchungen |
| Preis Self-Hosted | ✅✅ | €0 — vollständig Open Source, keine Feature-Locks |
| Preis Cloud (Frappe Cloud) | ✅ | Ab $5/Monat (Site) oder $20/Monat (Server, unlimitierte Sites) |
| Preis pro User | ✅✅ | Keine User-Lizenzgebühren |
| Self-Hosting | ✅ | Docker + Linux, technisch anspruchsvoll |
| Lernaufwand | ⚠️ | Hoch (vollständiges ERP), aber übersichtlichere UI als Odoo |
| Integration vod-auctions.com | ✅ | REST API + Webhooks, MonkeyOffice Connect-ähnlich |
| Open Source | ✅✅ | Echtes Open Source — kein Open Core, alle Features frei |
| Deutsche Implementierungspartner | ✅ | ALYF (Heidelberg), 4commerce (Hamburg) |

**Geeignet für:** VOD Records als strategische Langfristlösung — kein Vendor Lock-in, keine User-Kosten, vollständige Kontrolle.
**Kritischer Punkt:** §25a und Konsignation erfordern initiale Konfiguration mit deutschem Implementierungspartner.

---

### Option A4 — Billbee (E-Commerce-Spezialist)

| Kriterium | Bewertung | Details |
|-----------|:---------:|---------|
| §25a Differenzbesteuerung | ✅ | Margenbesteuerung vorhanden |
| Kommissionsabrechnung | ❌ | Nicht vorhanden |
| API / Integration | ✅ | Sehr gut (Shopify, eBay, Etsy, eigene API) |
| Warenwirtschaft | ✅ | Gut (Multi-Channel-Lager) |
| Einlieferer-Verwaltung | ❌ | Nicht vorhanden |
| Rechnungsautomatisierung | ✅ | Sehr gut |
| Preis | ✅ | €9–99/Monat (nach Bestellvolumen) |
| Lernaufwand | ✅ | Mittel |
| Skalierbarkeit | ⚠️ | Gut für Multi-Channel, nicht für Kommission |

**Geeignet für:** Multi-Channel-Betrieb (vod-auctions.com + eBay + Discogs parallel).

---

### Option B1 — Eigenentwicklung (Integration in vod-auctions.com)

| Kriterium | Bewertung | Details |
|-----------|:---------:|---------|
| §25a Differenzbesteuerung | ✅ | Vollständig integriert |
| Kommissionsabrechnung | ✅ | Maßgeschneidert |
| API / Integration | ✅✅ | Natives Teil der Plattform |
| Warenwirtschaft | ✅ | Bereits 41.500 Artikel vorhanden |
| Einlieferer-Verwaltung | ✅ | Admin-Modul baubar |
| Abrechnungsbeleg PDF | ✅ | pdfkit (wie Invoice-Modul) |
| DATEV-Export | ⚠️ | CSV-Export für StB realisierbar |
| Monatliche Kosten | ✅ | €0 (nur Entwicklungszeit) |
| Entwicklungsaufwand | ⚠️ | 3–4 Wochen |
| Steuerrechtliche Korrektheit | ⚠️ | Selbstverantwortet, StB abstimmen |
| Skalierbarkeit | ✅✅ | Unbegrenzt |

**Geeignet für:** Sobald Drittanbieter-Modell startet — optimale Nutzung vorhandener Infrastruktur.

---

### Gesamtvergleich

| Kriterium | Lexoffice | sevDesk | Odoo | Billbee | ERPNext | Eigenentwicklung |
|-----------|:---------:|:-------:|:----:|:-------:|:-------:|:---------------:|
| §25a Differenzbesteuerung | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Kommissionsabrechnung | ❌ | ⚠️ | ✅ | ❌ | ⚠️ | ✅ |
| Integration vod-auctions.com | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅✅ |
| Einlieferer-Verwaltung | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Automatische Abrechnungsbelege | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Margennachweis §25a | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ |
| DATEV-Export | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ CSV |
| SKR03 / SKR04 | ✅ | ✅ | ✅ | ⚠️ | ✅ | — |
| GoBD-Konformität | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| Multi-Channel | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ |
| Open Source (echtes) | ❌ | ❌ | ⚠️ Open Core | ❌ | ✅✅ | ✅✅ |
| Monatliche Kosten | €8–18 | €14–49 | €0–50+/User | €9–99 | €0–20 | €0 |
| User-Lizenzkosten | — | — | €24+/User | — | €0 | €0 |
| Lernaufwand | Niedrig | Niedrig | Hoch | Mittel | Mittel-Hoch | Entwicklungszeit |
| Vendor Lock-in | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ |
| Skalierbarkeit | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅✅ | ✅✅ |
| **Gesamt-Score (1–5)** | **2** | **2** | **3** | **2** | **4** | **5** |

---

## 16a. Detailvergleich: Odoo vs. ERPNext

### Philosophie & Lizenzmodell

| Dimension | Odoo | ERPNext |
|-----------|------|---------|
| **Open Source Modell** | Open Core — Kern frei, viele Module nur Enterprise | Echtes Open Source — alle Features frei verfügbar |
| **Community Edition** | Eingeschränkt (kein Studio, kein voller Support) | Vollständig identisch mit Enterprise-Deployments |
| **Enterprise Edition** | €24,90+/User/Monat (alle nötigen Module) | Nicht existent — Community = Enterprise |
| **Eigentümer** | Odoo SA (Belgien, börsennotiert) | Frappe Technologies (Indien, Community-driven) |
| **GitHub Stars** | ~38.000 | ~22.000 |
| **Framework** | Odoo Framework (proprietär, Python) | Frappe Framework (Open Source, Python) |
| **Datenbank** | PostgreSQL | MariaDB / MySQL |

### Kosten im Vergleich (VOD Records, 1–3 User)

| Szenario | Odoo | ERPNext |
|----------|------|---------|
| Self-Hosted, 1 User | €0/Monat (Community, eingeschränkt) | €0/Monat (vollständig) |
| Self-Hosted, 3 User | €0/Monat (Community) oder €75/Monat (Enterprise) | €0/Monat |
| Cloud, 1 User | €24,90/Monat (Odoo Online) | $5–20/Monat (Frappe Cloud) |
| Cloud, 3 User | €74,70/Monat | $5–20/Monat (keine User-Gebühr) |
| **5 Jahre TCO, 3 User** | **€4.482–€8.964** | **€300–€1.200** |

### Module & Funktionsumfang

| Modul | Odoo | ERPNext |
|-------|------|---------|
| **Buchhaltung / Accounting** | ✅ Sehr stark | ✅ Stark |
| **Warenwirtschaft / Inventory** | ✅ Vollständig | ✅ Vollständig inkl. Multi-Warehouse |
| **Verkauf / Sales** | ✅ | ✅ |
| **Einkauf / Purchase** | ✅ | ✅ |
| **CRM** | ✅ | ✅ |
| **HR / Payroll** | ✅ | ✅ |
| **E-Commerce nativ** | ✅ Stärker | ✅ Vorhanden |
| **Konsignation / Kommission** | ✅ Konsignationslager-Modul | ⚠️ Sales Partners + Custom DocTypes |
| **Audit Trail / GoBD** | ✅ | ✅ |
| **Custom DocTypes** | ✅ (Studio — kostenpflichtig) | ✅✅ (Frappe Framework — kostenlos) |
| **Workflow Engine** | ✅ | ✅ |
| **Report Builder** | ✅ | ✅ |
| **POS (Point of Sale)** | ✅ | ✅ |

### Deutsche Lokalisierung

| Kriterium | Odoo | ERPNext |
|-----------|------|---------|
| **SKR03** | ✅ Offiziell | ✅ Community (4commerce) |
| **SKR04** | ✅ Offiziell | ✅ Community (ALYF) |
| **DATEV-Export** | ✅ Via Modul | ✅ Via Community-Modul (ALYF) |
| **GoBD** | ✅ | ✅ |
| **§25a Differenzbesteuerung** | ✅ Konfigurierbar | ⚠️ Konfigurierbar, Testfall nötig |
| **Umsatzsteuervoranmeldung** | ✅ | ⚠️ Manuell / Custom |
| **Deutsche Implementierungspartner** | Viele (Odoo-Partner-Netz) | ALYF (Heidelberg), 4commerce (Hamburg) |
| **Offizielles DE-Support** | ✅ Offiziell von Odoo SA | ⚠️ Community-getragen |

### API & Integration

| Kriterium | Odoo | ERPNext |
|-----------|------|---------|
| **REST API** | ✅ JSON-RPC + REST | ✅ Native REST API |
| **Webhooks** | ✅ | ✅ |
| **Authentication** | API Keys, OAuth | API Keys, Token, OAuth 2.0 |
| **n8n / Zapier** | ✅ | ✅ |
| **SDK / Libraries** | Python, JS, Community | Python, JS, Community |
| **GraphQL** | ❌ | ❌ |
| **Custom API Endpoints** | ✅ | ✅✅ (Frappe: sehr einfach) |

### Deployment & Hosting

| Kriterium | Odoo | ERPNext |
|-----------|------|---------|
| **Docker Self-Hosted** | ✅ Einfacher (Single Container möglich) | ⚠️ Komplexer (Redis + MariaDB + Python + Node + Socket.io) |
| **Managed Cloud** | Odoo Online (teurer) | Frappe Cloud ($5–20/Monat) |
| **Deutsche Cloud-Hoster** | Mehrere Odoo-Partner | ALYF (DSGVO-konform, DE Datacenter) |
| **Backup & Monitoring** | Bei Odoo Online inklusive | Bei Frappe Cloud inklusive |
| **Multi-Tenant** | ✅ | ✅ |
| **Eigene Server (VPS)** | ✅ | ✅ (bereits VPS vorhanden bei VOD Records) |

### Entscheidungsmatrix für VOD Records

| Faktor | Gewichtung | Odoo | ERPNext |
|--------|:----------:|:----:|:-------:|
| Kosten (5 Jahre) | 25% | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Deutsche Steuer (§25a, DATEV) | 25% | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Kommissionsgeschäft | 20% | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Integration vod-auctions.com | 15% | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Vendor Lock-in Risiko | 10% | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Entwicklerfreundlichkeit | 5% | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Gesamt** | **100%** | **⭐⭐⭐** | **⭐⭐⭐⭐** |

### Wann Odoo wählen?

- Sofort fertige §25a-Konfiguration ohne eigene Arbeit gewünscht
- Größeres Team (5+ User) mit komplexen Sales-Prozessen
- Offizieller Enterprise-Support aus einer Hand gewünscht
- Kein technisches Team für initiale ERPNext-Konfiguration

### Wann ERPNext wählen? ← VOD Records

- Kostenoptimierung langfristig wichtig (kein User-Pricing)
- Vendor Lock-in vermeiden
- Volle Kontrolle über Quellcode und Anpassungen
- Custom DocTypes ohne Aufpreis (Konsignation, Einlieferer)
- VPS bereits vorhanden (Self-Hosting oder Frappe Cloud günstig)
- Integration mit vod-auctions.com via REST API
- Deutsche Partner verfügbar (ALYF für §25a-Setup)

### Empfohlene Implementierungspartner Deutschland

| Partner | Spezialisierung | Kontakt |
|---------|----------------|---------|
| **ALYF GmbH** (Heidelberg) | ERPNext DE, SKR04, DATEV, §25a | alyf.de |
| **4commerce** (Hamburg) | ERPNext DE, SKR03 Mini | 4commerce-technologies.de |

> **Hinweis:** Vor Go-live mit einem dieser Partner einen §25a-Testfall und DATEV-Export-Test durchführen — das ist die entscheidende Absicherung.

---

## 16b. ERPNext Installationsplanung (VPS)

> **Vollständiger Installationsplan:** `docs/PLAN_ERPNext_Installation.md`

### Entscheidung (2026-03-28)

| Parameter | Wert |
|-----------|------|
| **Methode** | frappe_docker (Docker Compose) |
| **Domain** | `erp.vod-auctions.com` |
| **Server** | VPS 72.62.148.205 (Hostinger Ubuntu 24.04) |
| **ERPNext Version** | v15 (aktuell stabil) |
| **Datenbank** | MariaDB 10.6 im Docker-Container (getrennt von MySQL 8.0 auf Port 3306) |
| **Port** | 8090 intern → nginx Proxy → HTTPS |
| **Lokalisierung** | ALYF GmbH — SKR04, DATEV, §25a |

### VPS-Ressourcen (geprüft 2026-03-28)

| Ressource | Verfügbar | Ausreichend |
|-----------|-----------|:-----------:|
| Disk frei | 57 GB | ✅ |
| RAM verfügbar | ~4,5 GB | ✅ |
| Docker | 29.1.3 | ✅ |
| OS | Ubuntu 24.04.3 LTS | ✅ |

### Architektur auf dem VPS

```
nginx (Port 443)
  └─ erp.vod-auctions.com → localhost:8090

Docker-Stack /root/erpnext/ (frappe_docker):
  ├─ frappe-frontend   (nginx intern, Port 8090 → Host)
  ├─ frappe-backend    (gunicorn)
  ├─ frappe-worker-*   (Queue-Worker)
  ├─ frappe-scheduler
  ├─ frappe-socketio
  ├─ mariadb           (Port 3307 → Host, kein Konflikt mit MySQL 3306)
  └─ redis-{cache,queue,socketio}

Bestehende Services bleiben unberührt:
  PM2: vodauction-backend (9000), storefront (3006), service-overview (3002)
  Docker: freqtrade (8085/8086), n8n (5678 intern), teamspeak6
  Apache: VOD Fest WordPress (8080/8081)
```

### Manuell erforderlich (vor Installation)

- [ ] **DNS-A-Record** im Hostinger hPanel setzen:
  `erp` → `72.62.148.205` (gleiche Zone wie admin.vod-auctions.com)
- [ ] **Passwörter in 1Password** generieren:
  - `ERPNEXT_MARIADB_ROOT_PASSWORD`
  - `ERPNEXT_ADMIN_PASSWORD`
- [ ] DNS-Propagation abwarten: `nslookup erp.vod-auctions.com` → `72.62.148.205`

### Installations-Phasen (Claude Code übernimmt ~85%)

| Phase | Was | Wer |
|-------|-----|:---:|
| 1 | frappe_docker klonen, `.env`, Images pullen, Container starten | Claude Code |
| 2 | ERPNext-Site erstellen + App installieren (~15 Min) | Claude Code |
| 3 | nginx-Config + SSL-Zertifikat (Certbot) | Claude Code |
| 4 | ALYF German Accounting App (SKR04 + §25a) | Claude Code |
| 5 | Setup Wizard: Firma, SKR04, EUR, DE | Browser |
| 6 | Backup-Cron + Systemd Auto-Start | Claude Code |
| 7 | API Key + Integration vod-auctions.com vorbereiten | Claude Code + Browser |

**Gesamtdauer:** ~75 Minuten (davon ~25 Min Wartezeit für Docker-Pull + Site-Setup)

### Nach der Installation: Erste Konfigurationsschritte

```
1. Setup Wizard (Browser):
   Company: VOD Records | Land: Deutschland | Währung: EUR
   Chart of Accounts: Germany SKR04 (ALYF)
   Geschäftsjahr: 01.01.2026 – 31.12.2026

2. §25a Steuertemplate anlegen:
   Name: "§25a UStG — Differenzbesteuerung"
   Steuerausweis: keiner (Bruttobetrag, kein separater USt-Betrag)
   Pflichttext: "Gebrauchtgegenstände / Sonderregelung (§ 25a UStG).
                 Ein gesonderter Umsatzsteuerausweis ist nicht zulässig."

3. Firma-Stammdaten:
   Adresse: Alpenstrasse 25/1, 88045 Friedrichshafen
   USt-IdNr.: DE232493058

4. ALYF §25a-Testfall mit Steuerberater durchführen
```

### Rollback (wenn nötig)

```bash
# ERPNext komplett stoppen — alle anderen Services bleiben unberührt
cd /root/erpnext && docker compose down

# nginx-Config deaktivieren
rm /etc/nginx/sites-enabled/erpnext.conf && nginx -s reload
```

---

## 16. Empfehlung: Dreistufige Strategie

### Stufe 1 — Sofort: Steuerlogik sauber festziehen (vor Software-Entscheidung)

```
Vor jeder Software-Implementierung:
  1. Geschäftsmodell verbindlich entscheiden:
     Eigenhandel / echte Verkaufskommission / Vermittlungsmodell
  2. Musterbelege für alle 4 Typen erstellen:
     - Einkauf Privatperson (Eigenware)
     - Verkauf Eigenware §25a
     - Verkauf Kommissionsware Privat-Einlieferer
     - Verkauf Kommissionsware Unternehmer-Einlieferer
  3. Steuerberater: Testmonat simulieren
     (3–5 Vorfälle, Musterbuchungen, Muster-USt-VA)

  → Erst nach dieser Phase: Software-Konfiguration
  → "Nicht die Software bestimmt das Steuerkonzept,
     sondern das Steuerkonzept bestimmt die Softwarekonfiguration."
```

### Stufe 2 — Übergang: MonkeyOffice + ERPNext Evaluation

```
MonkeyOffice (bereits im Einsatz):
  + MonKey Office Connect API aktivieren
  + Stripe Webhook → MonkeyOffice JSON-API (Ausgangsrechnung)
  + Manuelle §25a-Margennachweis-Tabelle (Excel)
  + Manuelle Kommissionsabrechnung bis Modell geklärt

Parallel: ERPNext Evaluation mit ALYF oder 4commerce
  + §25a-Testfall durchführen
  + DATEV-Export testen
  + Konsignations-DocTypes prototypen
  + Entscheidung: Self-Hosted (VPS) oder Frappe Cloud ($20/Monat)

Aufwand Evaluation:    2–4 Wochen
Laufende Kosten:       €0 (MonkeyOffice bereits bezahlt)
```

### Stufe 3 — Ziel: ERPNext als zentrales System

```
ERPNext (Self-Hosted auf VPS oder Frappe Cloud):
  Buchhaltung:        SKR04 via ALYF-Modul, §25a konfiguriert
  Warenwirtschaft:    41.500 Artikel (Import aus vod-auctions.com)
  Kommission:         Custom DocTypes: Einlieferer, Konsignationsartikel,
                      Abrechnung, Settlement
  DATEV-Export:       Monatlich an Steuerberater
  API-Integration:    vod-auctions.com ↔ ERPNext via REST + Webhooks

  vod-auctions.com bleibt:
    → Auktions-Frontend (Bieten, Katalog, Checkout)
    → Primäre Datenquelle (Artikel, Transaktionen)
    → ERPNext übernimmt: Buchhaltung, Compliance, Reporting

Entwicklungsaufwand:    6–8 Wochen (Einrichtung + Custom DocTypes)
Laufende Kosten:        €0 Self-Hosted / $20/Monat Frappe Cloud
```

### Integrationsarchitektur (Zielzustand)

```
vod-auctions.com (Medusa.js)
  │
  ├─ Stripe Webhook (payment_intent.succeeded)
  │    └─→ ERPNext API: Sales Invoice erstellen (§25a)
  │
  ├─ Neuer Einlieferer angelegt
  │    └─→ ERPNext API: Supplier/Consignor DocType anlegen
  │
  ├─ Artikel verkauft (Kommission)
  │    └─→ ERPNext API: Konsignationsartikel → sold, Abrechnung erstellen
  │
  └─ Monatlicher Margennachweis
       └─→ ERPNext Report → CSV/PDF für Steuerberater
```

---

## 17. Steuerberater-Entscheidungsvorlage

> Diese fünf Fragen müssen **vor Go-live** des Kommissionsmodells durch den Steuerberater schriftlich beantwortet und freigegeben werden. Das Dokument dient als Gesprächsgrundlage und zur Nachweisdokumentation.

---

### Frage 1 — §25a UStG: Geltungsbereich bei Kommissionsware

**Sachverhalt:** VOD Records plant, Ware von Privatpersonen (Einlieferer) als Kommissionär im eigenen Namen zu verkaufen.

**Klärungsbedarf:**
- Gilt §25a UStG für den Kommissionär (VOD Records) bei Verkauf von Privateinlieferer-Ware?
- Wenn ja: Welche Voraussetzungen müssen Einlieferungsbeleg und Abrechnung erfüllen?
- Wenn nein: Unter welchem Steuersatz ist der Verkauf zu verbuchen?

**Erwartetes Ergebnis:** Schriftliche Freigabe mit konkreter Buchungsanweisung (Konten + Steuercode) für Variante A (Kommission) und Variante B (Vermittlung).

---

### Frage 2 — Kommissionsmodell: Variante A vs. Variante B

**Sachverhalt:** Zwei rechtliche Strukturen sind möglich:
- **Variante A** (§ 383 HGB): VOD Records als echter Kommissionär — verkauft in eigenem Namen, Erlös geht vollständig durch VOD, Provision wird einbehalten
- **Variante B** (Vermittlungsmodell): Einlieferer bleibt Verkäufer, VOD vermittelt gegen Provision; Kaufvertrag zwischen Einlieferer und Käufer

**Klärungsbedarf:**
- Welche Variante ist aus steuerrechtlicher und haftungsrechtlicher Sicht für VOD Records zu empfehlen?
- Wie unterscheiden sich die Buchungssätze in Variante A vs. B?
- Hat die Wahl Auswirkungen auf die Pflicht zur Rechnungsstellung durch den Einlieferer?

**Erwartetes Ergebnis:** Empfehlung der Variante mit schriftlicher Begründung + Musterbuchungssatz.

---

### Frage 3 — USt-Voranmeldung: Bemessungsgrundlage KZ 81

**Sachverhalt:** In KZ 81 werden §25a-Umsätze gemeldet. Bei gemischtem Sortiment (Eigenware + Kommission) droht Verwechslung der Bemessungsgrundlagen.

**Klärungsbedarf:**
- Wie lautet die korrekte Bemessungsgrundlage je Transaktionstyp in KZ 81?
  - Eigenware §25a: Netto-Marge (= brutto × 100/119)
  - Kommissionsware Privateinlieferer: Provision oder Vollerlös?
  - Kommissionsware Unternehmer-Einlieferer: anderer Sachverhalt?
- Muss eine getrennte Buchführung (zwei getrennte Konten) geführt werden?

**Erwartetes Ergebnis:** Tabellarische Übersicht: Transaktionstyp → KZ 81-Eintrag (Bemessungsgrundlage + Steuer).

---

### Frage 4 — Auszahlung an Einlieferer: EÜR-Einordnung

**Sachverhalt:** Bei Variante A bucht VOD den Vollerlös als Einnahme und zahlt dem Einlieferer den Restbetrag nach Provision aus.

**Klärungsbedarf:**
- Ist die Auszahlung an den Einlieferer in der EÜR als Betriebsausgabe zu behandeln?
- Oder: Wird nur die einbehaltene Provision als Einnahme erfasst (dann: kein Durchläufer, sondern zwei Buchungsebenen)?
- Besteht eine Pflicht zur Übermittlung der Einlieferer-Daten an das Finanzamt (§ 22f UStG, Meldesystem für Online-Marktplätze)?

**Erwartetes Ergebnis:** Klare EÜR-Buchungsanweisung für Kommissionsauszahlungen + Hinweis auf etwaige Meldepflichten.

---

### Frage 5 — Eigenbeleg und Belegqualität

**Sachverhalt:** Privatankäufe werden durch einen selbsterstellten Eigenbeleg (Ankaufquittung) dokumentiert.

**Klärungsbedarf:**
- Genügt der Eigenbeleg (inkl. Verfügungsberechtigungsbestätigung) als Nachweis für §25a UStG bei einer Betriebsprüfung?
- Welche Mindestangaben muss der Eigenbeleg enthalten?
- Reicht eine digitale Signatur (PDF mit Scan der Unterschrift), oder ist Schriftform (Original) zwingend?
- Bei EU-Ankäufen: Welche Zusatzdokumentation (z. B. Versandnachweis, Kommunikation) ist erforderlich?

**Erwartetes Ergebnis:** Checkliste der Pflichtfelder für den Eigenbeleg + Freigabe des Musterbelegs aus Kapitel 8.

---

### Zusammenfassung Offene Punkte (Ampelbewertung nach Bereinigte Fassung 2026-03-28)

| Thema | Ampel | Handlungsbedarf |
|-------|:-----:|-----------------|
| §25a Eigenware (Grundprinzip) | 🟢 | Korrekt — keine Änderung nötig |
| Margennachweis Dokumentation | 🟢 | Korrekt — Tabelle A/B jetzt getrennt |
| Rechnungspflichttext | 🟡 | Korrigiert auf "ist nicht zulässig" — StB Freigabe einholen |
| USt-VA KZ 81 Bemessungsgrundlage | 🟡 | Frage 3 klären — vor erster VA |
| Kommissionsgeschäft steuerliche Struktur | 🔴 | Fragen 1+2 zwingend vor Go-live |
| EÜR-Einordnung Einlieferer-Auszahlung | 🔴 | Frage 4 zwingend vor Go-live |
| Eigenbeleg Verfügungsberechtigung | 🟡 | Ergänzt — Freigabe über Frage 5 |

---

## 18. Softwarekonfiguration (Kurzreferenz)

### Lexoffice

```
Einstellungen → Steuern → Individueller Steuersatz
  Name:      "Differenzbesteuerung §25a UStG"
  Satz:      0% (auf Brutto — USt intern kalkuliert)
  Konto:     8200 / 4200

Eingangsbeleg:
  Kategorie: "Wareneinkauf ohne Vorsteuer"
  Konto:     3400

Textbaustein (Rechnungsfußzeile):
  "Gebrauchtgegenstände / Sonderregelung (§ 25a UStG).
   Ein gesonderter Umsatzsteuerausweis ist nicht zulässig."
```

### DATEV (mit Steuerberater)

```
Einkauf Privat DE:
  Buchungsschlüssel: 40 (Aufwand ohne USt)
  Steuerschlüssel:   0  (kein VSt)
  Konto:             3400

Verkauf Differenzbesteuerung:
  Steuerschlüssel:   98 (Differenzbesteuerung §25a)
  Konto:             8200
  → DATEV berechnet USt aus der Marge, nicht aus dem Rechnungsbetrag

Info an Steuerberater / DATEV-Buchhalter:
  "Alle Buchungen auf Konto 3400/3420 sind Privatankäufe ohne
   Vorsteuer. Zugehörige Verkäufe auf 8200 unterliegen §25a UStG.
   USt-Berechnung auf Basis Einzelmarge pro Artikel.
   Margennachweis liegt als Datei [Pfad] vor."
```

### vod-auctions.com (API-Integration Lexoffice)

```typescript
// Stripe Webhook → automatische Lexoffice-Rechnung
// backend/src/api/webhooks/stripe/route.ts (Erweiterung)

async function createLexofficeInvoice(transaction: Transaction) {
  const margin = transaction.sale_price - transaction.purchase_price;
  const vatOnMargin = margin * (19 / 119);

  await fetch("https://api.lexoffice.io/v1/vouchers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LEXOFFICE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "salesinvoice",
      voucherDate: new Date().toISOString(),
      address: { name: transaction.customer_name },
      lineItems: [{
        type: "custom",
        name: transaction.release_title,
        quantity: 1,
        unitPrice: { currency: "EUR", netAmount: transaction.sale_price,
                     taxRatePercent: 0 },  // §25a: kein separater USt-Ausweis
      }],
      taxConditions: { taxType: "vatfree" },  // Differenzbesteuerung
      remark: "Gebrauchtgegenstände / Sonderregelung (§ 25a UStG). " +
              "Ein gesonderter Umsatzsteuerausweis ist nicht zulässig.",
    }),
  });
}
```

---

## Nächste Schritte

```
SOFORT — Steuerlogik (vor jeder Software):
  1. Steuerberater: Kommissionsmodell verbindlich klären
     (echte Verkaufskommission vs. Vermittlungsmodell)
  2. Musterbeleg-Katalog mit StB durcharbeiten (4 Typen)
  3. Excel-Margennachweis-Template anlegen + befüllen

KURZFRISTIG — MonkeyOffice Connect:
  4. MonKey Office Connect API aktivieren
  5. Stripe Webhook → MonkeyOffice JSON-API (Ausgangsrechnung §25a)
  6. Pflichttext auf Rechnungen korrigieren:
     "Gebrauchtgegenstände / Sonderregelung (§ 25a UStG).
      Ein gesonderter Umsatzsteuerausweis ist nicht zulässig."

KURZFRISTIG — ERPNext Evaluation:
  7. ALYF GmbH (alyf.de) oder 4commerce kontaktieren
  8. §25a-Testfall + DATEV-Export-Test anfordern
  9. Frappe Cloud 14-Tage-Trial starten (kostenlos)
 10. SKR04 (ALYF) oder SKR03 (4commerce) Template installieren

MITTELFRISTIG — ERPNext Einrichtung (nach StB-Freigabe):
 11. ERPNext Self-Hosted auf VPS oder Frappe Cloud einrichten
 12. Custom DocTypes: Einlieferer, Konsignationsartikel, Settlement
 13. vod-auctions.com ↔ ERPNext REST API-Integration
 14. /admin/consignors Seite in vod-auctions.com (RSE-230)
 15. PDF-Abrechnungsbeleg-Generator (pdfkit oder ERPNext nativ)
```

### Empfohlene externe Ressourcen

| Ressource | URL | Zweck |
|-----------|-----|-------|
| ERPNext Docs | docs.erpnext.com | Technische Dokumentation |
| Frappe Cloud | frappecloud.com | Managed Hosting (14-Tage-Trial) |
| ALYF GmbH | alyf.de | DE-Partner, SKR04, §25a |
| 4commerce | github.com/4commerce-technologies-AG | SKR03 Mini Template |
| Frappe Forum DE | discuss.frappe.io | Community Support |
| §25a UStG | dejure.org/gesetze/UStG/25a.html | Gesetzestext |

---

*Dokument erstellt: 2026-03-28 | Letzte Revision: 2026-03-28 (Steuerrechtliche Korrekturen O-01 bis O-11 aus Bereinigte Fassung eingearbeitet)*
*Erstellt für: VOD Records, Frank Bull — vod-auctions.com*
*Rechtshinweis: Dieses Dokument dient der internen Dokumentation und ersetzt keine steuerliche oder rechtliche Beratung. Alle steuerrechtlichen Umsetzungen, insbesondere das Kommissionsmodell und die USt-VA-Eintragung, sind mit dem Steuerberater abzustimmen und schriftlich freizugeben (siehe Kapitel 17 — Steuerberater-Entscheidungsvorlage).*
