# Phase 1: eBay Test Tracking Template

## Ziel
Validierung der Auktionsidee mit 100 Items auf eBay über 2 Monate

## KPIs

### Primäre Metriken
- **Auktionspreis vs. Schätzwert:** Ziel >120%
- **Anzahl Gebote pro Item:** Ziel >5
- **Verkaufsquote:** Ziel >80% (mit Reserve Price)
- **Retourenquote:** Ziel <10%

### Sekundäre Metriken
- **Zeitpunkt der Gebote:** Früh vs. Späte Gebote
- **Wiederkehrende Bieter:** Wie viele bieten auf mehrere Items?
- **Durchschnittliche Gebotshöhe**
- **Preis pro Genre/Format**

## Tracking Spreadsheet

### Spalten

```
A: Item ID (eigene Nummerierung: TA001, TA002, etc.)
B: eBay Listing URL
C: Künstler
D: Titel
E: Format (Vinyl, CD, Cassette, 7", 12", etc.)
F: Label
G: Jahr
H: Land
I: Media Condition (M, NM, VG+, VG, G+, G, P)
J: Sleeve Condition
K: Genre (Industrial, Noise, Dark Ambient, etc.)
L: Schätzwert (€) - Basierend auf Discogs-Recherche
M: Startpreis (€)
N: Reserve Price (€)
O: Buy It Now Preis (€) - Optional
P: Endpreis (€)
Q: Anzahl Gebote
R: Anzahl Unique Bieter
S: Verkauft? (Ja/Nein)
T: Verkaufsdatum
U: Käufer Username (anonymisiert: buyer_001)
V: Versandkosten (€)
W: eBay Gebühren (€)
X: Payment Gebühren (€)
Y: Nettogewinn (€)
Z: Return? (Ja/Nein)
AA: Return Grund
AB: Notizen
```

## Beispiel-Einträge

```csv
Item ID,eBay URL,Künstler,Titel,Format,Label,Jahr,Land,Media,Sleeve,Genre,Schätzwert,Startpreis,Reserve,BuyNow,Endpreis,Gebote,Bieter,Verkauft?,Datum,Käufer,Versand,eBay Fee,Payment Fee,Netto,Return?,Return Grund,Notizen
TA001,ebay.de/itm/123,Throbbing Gristle,20 Jazz Funk Greats,Vinyl,Industrial Records,1979,UK,VG+,VG+,Industrial,80,40,60,150,125,23,12,Ja,2026-02-15,buyer_042,5.99,16.00,3.75,105.26,Nein,,Sehr aktive Auktion
TA002,ebay.de/itm/124,Coil,Horse Rotorvator,CD,Some Bizzare,1986,UK,NM,NM,Industrial,30,15,20,50,28,7,5,Ja,2026-02-15,buyer_018,3.99,3.58,0.84,23.59,Nein,,Weniger Gebote als erwartet
TA003,ebay.de/itm/125,Merzbow,Pulse Demon,CD,Release,1996,Japan,M,M,Noise,50,25,35,,32,4,3,Nein,2026-02-16,,,0,0,-0.50,Nein,,Reserve nicht erreicht - neu listen mit niedrigerem Reserve?
```

## Analyse-Formeln (Excel/Google Sheets)

### Durchschnittlicher Auktionspreis vs. Schätzwert
```
=AVERAGE(P:P) / AVERAGE(L:L) * 100
```

### Verkaufsquote
```
=COUNTIF(S:S,"Ja") / COUNTA(S:S) * 100
```

### Durchschnittliche Anzahl Gebote
```
=AVERAGEIF(S:S,"Ja",Q:Q)
```

### Nettogewinn pro verkauftem Item
```
=AVERAGEIF(S:S,"Ja",Y:Y)
```

### Retourenquote
```
=COUNTIF(Z:Z,"Ja") / COUNTIF(S:S,"Ja") * 100
```

### Beste Genres (nach Durchschnittspreis)
```
=AVERAGEIF(K:K,"Industrial",P:P)
```

## Wöchentlicher Report

Fülle am Ende jeder Woche aus:

### Woche 1 (2026-02-10 bis 2026-02-16)
- **Gelistete Items:** 10
- **Abgeschlossene Auktionen:** 0 (laufen noch)
- **Durchschnittliche Gebote bisher:** 0 (zu früh)
- **Highest Price so far:** N/A
- **Learnings:** [Hier eintragen]

### Woche 2 (2026-02-17 bis 2026-02-23)
- **Gelistete Items:** 20 (kumulativ: 30)
- **Abgeschlossene Auktionen:** 10
- **Durchschnittlicher Endpreis:** [Berechnen]
- **Verkaufsquote:** [Berechnen]
- **Top Performer:** [Item mit höchstem Preis]
- **Learnings:**
  - Welche Genres liefen am besten?
  - Gab es Sniping (Last-Minute-Gebote)?
  - Wiederkehrende Bieter?

### Woche 3-8
[... fortsetzten]

## Segmentierung der 100 Test-Items

### Tier 1: Premium (20 Items)
**Schätzwert >50€**
- [ ] 10x Vinyl Raritäten (Erstpressungen, limitierte Auflagen)
- [ ] 5x Signierte Items
- [ ] 5x Test Pressings / White Labels

**Startpreis:** 50% des Schätzwerts
**Reserve:** 80% des Schätzwerts
**Laufzeit:** 7 Tage
**Start:** Sonntag 20:00 Uhr (prime time)

### Tier 2: Mittelklasse (50 Items)
**Schätzwert 20-50€**
- [ ] 30x Vinyl (gängige Künstler, guter Zustand)
- [ ] 20x CD (gefragte Alben)

**Startpreis:** 1€ (Attention Grabber)
**Reserve:** 40% des Schätzwerts
**Laufzeit:** 5 Tage
**Start:** Rolling (täglich neue Auktionen)

### Tier 3: Experiment (30 Items)
**Schätzwert <20€**
- [ ] 15x Vinyl (häufige Titel, aber guter Zustand)
- [ ] 15x CD (Masse)

**Startpreis:** 0,99€
**Reserve:** Kein Reserve
**Laufzeit:** 3 Tage
**Start:** Rolling

## Item-Auswahl-Checkliste

Für jedes der 100 Items:

### Recherche
- [ ] Discogs-Suche: Release gefunden?
- [ ] Preis-Historie checken (Min/Median/Max Last 12 Monate)
- [ ] Konkurrierende eBay-Listings prüfen
- [ ] Schätzwert festlegen (konservativ!)

### Dokumentation
- [ ] Zustand prüfen (Visual Grading + Abspielen wenn möglich)
- [ ] Fotos machen:
  - [ ] Cover (Front)
  - [ ] Cover (Back)
  - [ ] Labels (beide Seiten bei Vinyl)
  - [ ] Spine
  - [ ] Besonderheiten (Signaturen, Schäden, Inserts)
- [ ] Beschreibung schreiben (siehe Template unten)

### Listing
- [ ] eBay-Kategorie wählen
- [ ] Titel optimiert (Artist - Title - Format - Label - Year)
- [ ] Beschreibung eingefügt
- [ ] Fotos hochgeladen
- [ ] Versandoptionen gesetzt
- [ ] Zahlungsmethoden gesetzt
- [ ] Startpreis & Reserve gesetzt
- [ ] Laufzeit & Startzeit gesetzt
- [ ] Vorschau geprüft
- [ ] Veröffentlicht

## Beschreibungs-Template

```
🎵 [ARTIST] - [TITLE]

Format: [Vinyl/CD/Cassette] | [LP/12"/7"/etc.]
Label: [Label Name]
Catalog #: [Catalog Number]
Year: [Year]
Country: [Country]

CONDITION:
Media: [M/NM/VG+/VG/etc.] - [Details: z.B. "Leichte Oberflächenkratzer, keine Sprünge"]
Sleeve: [M/NM/VG+/VG/etc.] - [Details: z.B. "Ringwear an den Kanten"]

NOTES:
[Besonderheiten: Erstpressung, limitierte Auflage, Inserts, etc.]

GRADING GUIDE:
M (Mint): Perfekt, wie neu
NM (Near Mint): Fast perfekt, minimal sichtbare Gebrauchsspuren
VG+ (Very Good Plus): Gut erhalten, leichte Gebrauchsspuren
VG (Very Good): Deutliche Gebrauchsspuren, aber voll funktionsfähig

SHIPPING:
Germany: 5,99€ (Tracked)
EU: 9,99€ (Tracked)
Worldwide: 14,99€ (Tracked)

Will be shipped in protective sleeve + cardboard mailer within 2 business days.

Questions? Feel free to ask!
```

## Go/No-Go Kriterien (nach 100 Items)

### GO → Phase 2 (White-Label Setup)
✅ **Alle** folgenden Bedingungen erfüllt:
- [ ] Durchschnittlicher Auktionspreis >120% des Schätzwerts
- [ ] >5 Gebote pro Item im Schnitt
- [ ] >80% Verkaufsquote (bei Items mit Reserve)
- [ ] <10% Retourenquote
- [ ] Mindestens 50 verschiedene Bieter
- [ ] Nettogewinn >20% höher als bei Festpreis-Vergleich (Discogs)

**→ Investition in White-Label lohnt sich!**

### PIVOT → Hybrid-Strategie
⚠️ **Teilweise** erfüllt:
- [ ] Auktionspreis 105-120% des Schätzwerts (marginal besser)
- [ ] 3-5 Gebote pro Item
- [ ] 60-80% Verkaufsquote

**→ Nur Premium-Items (Top 10%) als Auktion, Rest als Festpreis**

### NO-GO → Zurück zu Discogs/Shopify
❌ **Mehrere** dieser Probleme:
- [ ] Auktionspreis <100% des Schätzwerts (schlechter als Festpreis!)
- [ ] <3 Gebote pro Item
- [ ] <60% Verkaufsquote
- [ ] >15% Retourenquote
- [ ] Weniger als 20 verschiedene Bieter

**→ Auktionen funktionieren nicht für diesen Markt**

## Bieter-Analyse

Tracke die Top-Bieter separat:

```
Bieter ID,Anzahl Gebote,Anzahl gewonnen,Durchschnittspreis,Genres,Verhalten,Kontaktiert?
buyer_001,45,8,67.50,"Industrial, Noise",Early Bidder,Nein
buyer_002,23,12,32.00,"Dark Ambient",Sniper (last minute),Ja - Newsletter?
buyer_003,19,3,120.00,"Industrial",High Roller,Ja - Private Sales?
```

**Nutze diese Daten:**
- Newsletter-Liste aufbauen
- Private Sales anbieten (umgeht eBay-Gebühren!)
- Personalisierte Empfehlungen

## Konkurrenz-Monitoring

Tracke 10 Mitbewerber auf eBay:

```
Verkäufer,Items Online,Auktion/Festpreis,Durchschnittspreis,Besonderheiten
vinyl_vault_de,230,Mix,45€,Viele Buy-It-Now Optionen
industrial_collector,89,Nur Auktionen,78€,Sehr hohe Qualität, lange Beschreibungen
discogs_reseller123,1200,Festpreis,22€,Masse statt Klasse
```

**Learnings:**
- Was machen die erfolgreichsten Verkäufer anders?
- Welche Preisstrategien funktionieren?
- Wie sehen deren Beschreibungen aus?

## Abschluss-Report (nach 100 Items)

### Quantitative Daten
```
Gesamtumsatz: [€]
Durchschnittspreis: [€]
Höchster Preis: [€] für [Item]
Verkaufsquote: [%]
Retourenquote: [%]
Durchschnittliche Gebote: [#]
Unique Bieter: [#]

eBay-Gebühren gesamt: [€]
Payment-Gebühren gesamt: [€]
Nettogewinn: [€]
```

### Qualitative Insights
```
Top 3 Genres (nach Preis):
1. [Genre] - Ø [€]
2. [Genre] - Ø [€]
3. [Genre] - Ø [€]

Top 3 Formate:
1. [Format] - Ø [€]
2. [Format] - Ø [€]
3. [Format] - Ø [€]

Learnings:
- [Learning 1]
- [Learning 2]
- [Learning 3]

Überraschungen:
- [Überraschung 1]
- [Überraschung 2]

Probleme:
- [Problem 1]
- [Problem 2]
```

### Entscheidung
```
[ ] GO - Phase 2 starten (White-Label)
[ ] PIVOT - Hybrid-Strategie (nur Premium-Auktionen)
[ ] NO-GO - Zurück zu Discogs/Shopify

Begründung:
[Hier begründen basierend auf Daten]
```

---

**Start:** 2026-02-10
**Ende:** 2026-04-10 (8 Wochen)
**Review:** 2026-04-15
