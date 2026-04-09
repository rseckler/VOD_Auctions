# VOD Auctions — Preiskonzept

**Version:** 2.0
**Datum:** 2026-04-09
**Status:** Freigegeben (Frank, 09.04.2026)

---

## Management Summary (für Frank)

**Situation:**
Wir haben 41.546 Artikel in der Datenbank. Davon haben 13.568 deinen alten Preis aus tape-mag. Jetzt kommen über den Discogs-Importer neue Sammlungen dazu. Zusätzlich haben wir für ~11.788 Artikel bereits Discogs-Marktpreise. Wir brauchen ein klares System, wann welcher Preis gilt.

**Erkenntnis:**
Bei 4.957 Artikeln haben wir sowohl deinen Preis als auch Discogs-Daten. Dein Durchschnittspreis liegt bei **€34,51**, der Discogs-Median bei **€20,11**. Du bepreist also deutlich über Markt — das ist gewollt (Qualität, Kuration, Zustand), muss aber bewusst sein wenn wir Discogs-Preise als Referenz nutzen.

**Das System in einfachen Worten:**

Jeder Artikel durchläuft 3 Stufen:

```
Stufe 1: Automatische Referenzpreise (informativ)
         → "Was sagt der Markt? Was hat Frank gesagt?"
         
Stufe 2: Berechneter Richtwert (Vorschlag)
         → "Was wäre ein sinnvoller Preis?" (z.B. Discogs VG+ × 1,2)
         
Stufe 3: Finaler Verkaufspreis (deine Entscheidung)
         → "Was kostet der Artikel bei uns?" — nur du/wir setzen das
```

**Kein Artikel wird automatisch kaufbar.** Der Importer und alle Syncs füllen nur Stufe 1+2. Stufe 3 kommt erst durch den Inventur-Prozess.

**Die 4 Artikelgruppen:**

| Gruppe | Anzahl | Was passiert |
|--------|--------|-------------|
| Deine Artikel mit Discogs-Match | 6.541 | Haben deinen Preis + Discogs-Referenz. Inventur vergleicht beides. |
| Deine Artikel ohne Discogs | 7.027 | Haben nur deinen Preis. Discogs-Match nachholen wo möglich. |
| Artikel mit Discogs aber ohne deinen Preis | 10.049 | Nur Discogs-Referenz. Richtwert berechnen. Inventur setzt Preis. |
| Artikel ohne alles | 17.929 | Kein Preis. Warten auf Discogs-Match oder manuelle Bewertung. |

**+ Neue Discogs-Imports** (wachsend): Kommen mit Discogs-Preisen, ohne Verkaufspreis. Inventur setzt Preis.

**Offene Fragen an dich:**

| # | Frage | Empfehlung |
|---|-------|------------|
| 1 | Aufschlag auf Discogs VG+ als Richtwert: 20%, 30%, oder mehr? | 20% (du liegst aktuell ~72% über Discogs, also ist 20% konservativ) |
| 2 | Sollen wir für deine 6.541 Artikel den Discogs-Richtwert daneben zeigen? | Ja — zum Vergleich. Ändert nichts an deinem Preis. |
| 3 | Wie oft Discogs-Preise aktualisieren? | Wöchentlich für alle mit Discogs-ID |
| 4 | Wann wird der neue Verkaufspreis (`direct_price`) das Kaufbar-Kriterium? | Nach der ersten Inventur-Runde, schrittweise |

---

## 1. Bestandsaufnahme: Alle Artikel und ihre Preise

### 1.1 Die 5 Artikelgruppen

**Stand: 09.04.2026 — 41.546 Releases total (30.171 Tonträger + 11.375 Literatur/Merch)**

| # | Gruppe | Anzahl | legacy_price | Discogs-Preise | Nächster Schritt |
|---|--------|--------|-------------|---------------|-----------------|
| A | **Legacy + Discogs + Preis** | 6.541 | Ja (Ø €34,51) | Ja (Ø Median €20,11) | Inventur: beide Preise vergleichen, final setzen |
| B | **Legacy + Discogs, kein Preis** | 10.049 | Nein | Ja (Listing-Preise) | Richtwert berechnen (VG+ × Aufschlag), Inventur setzt Preis |
| C | **Legacy + Preis, kein Discogs** | 7.027 | Ja | Nein | Discogs-Match nachholen (discogs_batch.py), dann wie A |
| D | **Legacy, weder Preis noch Discogs** | 17.929 | Nein | Nein | Discogs-Match versuchen, sonst manuelle Bewertung |
| E | **Neue Discogs-Imports** | 0 (wachsend) | Nein | Ja (voll) | Richtwert berechnen, Inventur setzt Preis |

### 1.2 Preisvergleich: Frank vs. Discogs (4.957 Artikel mit beiden Werten)

| Kennzahl | Franks Preis (`legacy_price`) | Discogs Median | Verhältnis |
|----------|-------------------------------|----------------|------------|
| Durchschnitt | €34,51 | €20,11 | Frank = **172%** von Discogs |
| Interpretation | Subjektive Bewertung + Kuration | Marktdurchschnitt aller Verkäufe | Frank bepreist über Markt |

**Fazit:** Franks Preise sind deutlich höher als der Discogs-Marktmedian. Das spiegelt die Kuration und den Zustand der Artikel wider — ist aber wichtig zu wissen, wenn wir Richtwerte aus Discogs berechnen. Ein Richtwert von VG+ × 1.2 liegt bei den meisten Artikeln deutlich unter Franks Preis.

---

## 2. Die 3 Preisebenen

### Ebene 1: Referenzpreise (automatisch, informativ)

Diese Preise werden automatisch befüllt und aktualisiert. Sie sind **nie der Verkaufspreis**, sondern Entscheidungsgrundlage.

| Preis | Feld | Quelle | Update | Beschreibung |
|-------|------|--------|--------|-------------|
| Franks Preis | `legacy_price` | Legacy MySQL Sync | Stündlich | Historischer Preis aus tape-mag. Geschützt — wird nie automatisch überschrieben. |
| Discogs Lowest | `discogs_lowest_price` | Discogs API | Täglich (Mo-Fr) | Niedrigstes aktuelles Marketplace-Listing |
| Discogs Median | `discogs_median_price` | Discogs API | Täglich | Median aus vergangenen Verkäufen |
| Discogs Highest | `discogs_highest_price` | Discogs API | Täglich | Höchstes aktuelles Marketplace-Listing |
| Discogs Suggested | `discogs_suggested_prices` (JSONB) | Discogs API | Bei Import + wöchentlich | **Preise pro Zustand** (M, NM, VG+, VG, ...) aus echten Verkäufen — wertvollste Referenz |
| Preis-History | `discogs_price_history` (JSONB) | System | Bei jedem Update | Zeitreihe aller Preis-Snapshots mit Datum + Quelle |
| Marktdaten | `discogs_num_for_sale`, `discogs_have`, `discogs_want` | Discogs API | Täglich | Angebot/Nachfrage-Indikatoren |

### Ebene 2: Kalkulierter Richtwert (automatisch, Vorschlag)

| Preis | Feld | Berechnung | Beschreibung |
|-------|------|-----------|-------------|
| Richtwert | `estimated_value` | Discogs VG+ × Aufschlagsfaktor | Automatisch berechneter Preisvorschlag. Wird im Inventur-Screen als Default vorausgefüllt. |

**Aufschlagsfaktor:** Default **1.2** (20% auf Discogs VG+ Suggested Price)
- Konfigurierbar im Admin
- Beispiel: Discogs VG+ = €16,25 → Richtwert = €19,50

**Fallback-Kette** wenn VG+ nicht verfügbar:
1. `discogs_suggested_prices.VG+` × Aufschlag
2. `discogs_median_price` × 1.0
3. `legacy_price` (unverändert)
4. Kein Wert → manuell im Inventur-Prozess

### Ebene 3: Finaler Verkaufspreis (nur manuell)

| Preis | Feld | Gesetzt durch | Beschreibung |
|-------|------|--------------|-------------|
| **Verkaufspreis** | `direct_price` | Inventur-Prozess / Admin | Der echte, endgültige Preis. Nur ein Mensch setzt diesen Wert. |

- **Kein automatisierter Prozess darf `direct_price` schreiben**
- Erst wenn `direct_price > 0`, ist ein Artikel zum Direktkauf verfügbar
- Im Inventur-Screen wird `estimated_value` als Vorschlag vorausgefüllt
- Admin kann übernehmen, anpassen oder komplett frei setzen

---

## 3. Was jeder Prozess darf (und was nicht)

### 3.1 Discogs Collection Importer

| Aktion | Erlaubt? | Feld |
|--------|----------|------|
| Discogs-Referenzpreise setzen | **Ja** | `discogs_lowest_price`, `discogs_suggested_prices`, `discogs_price_history` |
| Richtwert berechnen | **Ja** | `estimated_value` |
| Condition setzen | **Ja** | `media_condition`, `sleeve_condition` |
| Inventory setzen | **Ja** | `inventory` (0 oder 1) |
| Legacy-Preis überschreiben | **Nein** | `legacy_price` ist geschützt |
| Verkaufspreis setzen | **Nein** | `direct_price` ist geschützt |
| Kaufbar machen | **Nein** | `sale_mode` bleibt `auction_only` |

### 3.2 Legacy MySQL Sync (stündlich)

| Aktion | Erlaubt? | Feld |
|--------|----------|------|
| Legacy-Preis aktualisieren | **Ja** | `legacy_price` (aus MySQL `preis`) |
| Legacy-Verfügbarkeit | **Ja** | `legacy_available` (aus MySQL `frei`) |
| Discogs-Felder überschreiben | **Nein** | Geschützt |
| Verkaufspreis überschreiben | **Nein** | `direct_price` geschützt wenn `price_locked` |

### 3.3 Discogs Daily/Weekly Sync

| Aktion | Erlaubt? | Feld |
|--------|----------|------|
| Marketplace-Preise updaten | **Ja** | `discogs_lowest/median/highest_price` |
| Suggested Prices updaten | **Ja** (geplant) | `discogs_suggested_prices` |
| Richtwert neu berechnen | **Ja** | `estimated_value` (wenn noch kein `direct_price`) |
| Legacy-Preis überschreiben | **Nein** | Geschützt |
| Verkaufspreis überschreiben | **Nein** | `direct_price` geschützt |

### 3.4 Inventur-Prozess (Admin)

| Aktion | Erlaubt? | Feld |
|--------|----------|------|
| **Verkaufspreis setzen** | **Ja** | `direct_price` — die einzige Stelle |
| Sale-Mode ändern | **Ja** | `sale_mode` → `direct_purchase` / `both` |
| Condition anpassen | **Ja** | `media_condition`, `sleeve_condition` |
| Alle Preise einsehen | **Ja** | Sieht Legacy + Discogs + Richtwert |

---

## 4. Inventur-Prozess: Preisfindung im Detail

### 4.1 Was der Admin im Stocktake-Screen sieht

```
┌─────────────────────────────────────────────────────────────┐
│ 39 Clocks — Pain It Dark (1981, LP, VG+/VG+)               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ REFERENZPREISE                                              │
│ ┌──────────────────┬───────────────────────────────────┐    │
│ │ Franks Preis     │  €32,00  (Legacy tape-mag)        │    │
│ │ Discogs VG+      │  €16,25  (Suggested, echte Sales) │    │
│ │ Discogs Lowest   │  €23,52  (aktuelles Listing)      │    │
│ │ Discogs Median   │  €22,46  (Verkaufs-Median)        │    │
│ │ Discogs Highest  │  €89,00  (aktuelles Listing)      │    │
│ └──────────────────┴───────────────────────────────────┘    │
│                                                             │
│ RICHTWERT (automatisch berechnet)                           │
│ ┌──────────────────┬───────────────────────────────────┐    │
│ │ Estimated Value  │  €19,50  (VG+ × 1,2)              │    │
│ └──────────────────┴───────────────────────────────────┘    │
│                                                             │
│ VERKAUFSPREIS SETZEN                                        │
│ ┌──────────────────────────────────────────────────────┐    │
│ │ Preis:  [ €19,50 ]  ← vorausgefüllt mit Richtwert   │    │
│ │                        Admin kann frei ändern         │    │
│ └──────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Entscheidungshilfe pro Artikelgruppe

| Gruppe | Im Inventur-Screen | Empfohlene Aktion |
|--------|-------------------|-------------------|
| **A** (Legacy + Discogs + Preis) | Franks Preis + Discogs + Richtwert | Vergleichen. Bei großer Abweichung Franks Expertise bevorzugen, bei seltenen Artikeln Discogs als Untergrenze. |
| **B** (Discogs, kein Franks-Preis) | Nur Discogs + Richtwert | Richtwert als Basis, ggf. anpassen nach physischer Prüfung. |
| **C** (Franks Preis, kein Discogs) | Nur Franks Preis | Franks Preis übernehmen oder manuell recherchieren. |
| **D** (nichts) | Leer | Manuell bewerten oder Skip (nicht kaufbar lassen). |
| **E** (Discogs-Import) | Nur Discogs + Richtwert | Richtwert als Basis. |

---

## 5. Discogs Price Suggestions API

**Endpoint:** `GET /marketplace/price_suggestions/{discogs_id}`

Liefert Preise pro Zustand basierend auf **tatsächlichen Verkäufen** (nicht Listings):

| Zustand | Beispiel (39 Clocks) | Beschreibung |
|---------|---------------------|-------------|
| Mint (M) | €23,75 | Neuwertig, ungeöffnet |
| Near Mint (NM) | €21,25 | Nahezu perfekt |
| **Very Good Plus (VG+)** | **€16,25** | Standard für gut erhaltene Gebrauchtware |
| Very Good (VG) | €11,25 | Leichte Gebrauchsspuren |
| Good Plus (G+) | €6,25 | Deutliche Gebrauchsspuren |
| Good (G) | €3,75 | Stark gebraucht |
| Fair (F) | €2,50 | Beschädigt |
| Poor (P) | €1,25 | Stark beschädigt |

**Warum VG+ als Basis?** VG+ ist der Standard-Zustand für gut erhaltene gebrauchte Tonträger und der häufigste Zustand auf dem Markt. Er wird als Default-Condition beim Import gesetzt.

---

## 6. Preis-Felder: Vollständige Übersicht

| Feld | Typ | Quelle | Wer schreibt | Beschreibung |
|------|-----|--------|-------------|-------------|
| `legacy_price` | DECIMAL | Legacy MySQL | Nur Legacy Sync | Franks historischer Preis. Geschützt. |
| `direct_price` | DECIMAL | Admin/Inventur | **Nur Admin** | Finaler Verkaufspreis. Das ist DER Preis. |
| `estimated_value` | DECIMAL | Berechnung | Importer + Sync | Richtwert (VG+ × Aufschlag). Vorschlag. |
| `discogs_lowest_price` | DECIMAL | Discogs API | Sync + Importer | Niedrigstes aktuelles Listing |
| `discogs_median_price` | DECIMAL | Discogs API | Sync | Median vergangener Verkäufe |
| `discogs_highest_price` | DECIMAL | Discogs API | Sync | Höchstes aktuelles Listing |
| `discogs_suggested_prices` | JSONB | Discogs API | Importer + Sync | Preise pro Zustand (M bis P) — **NEU** |
| `discogs_price_history` | JSONB | System | Importer + Sync | Zeitreihe aller Snapshots |
| `discogs_num_for_sale` | INTEGER | Discogs API | Sync + Importer | Anzahl aktiver Listings |
| `discogs_have` / `discogs_want` | INTEGER | Discogs API | Sync + Importer | Community Angebot/Nachfrage |
| `discogs_last_synced` | TIMESTAMP | System | Sync + Importer | Letzter Discogs-Datenzugriff |

---

## 7. Kaufbar-Logik

### 7.1 Aktuell (Legacy-basiert)
```
Kaufbar = legacy_price > 0 AND legacy_available = true
```
→ 13.359 Artikel sind kaufbar

### 7.2 Ziel (nach Inventur-Einführung)
```
Kaufbar = direct_price > 0
          AND inventory > 0  
          AND sale_mode IN ('direct_purchase', 'both')
```

### 7.3 Übergangsphase
Beide Logiken laufen parallel:
- Legacy-Artikel: weiterhin über `legacy_price` kaufbar
- Neue Imports + inventarisierte Artikel: über `direct_price` kaufbar
- Schrittweise Migration: Bei jeder Inventur-Session wird `direct_price` gesetzt → Artikel wechselt ins neue System

---

## 8. Neues Schema-Feld

```sql
ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS discogs_suggested_prices JSONB;
```

**Format:**
```json
{
  "M": 23.75, "NM": 21.25, "VG+": 16.25, "VG": 11.25,
  "G+": 6.25, "G": 3.75, "F": 2.50, "P": 1.25,
  "currency": "EUR",
  "fetched_at": "2026-04-09T12:00:00Z"
}
```

---

## 9. Preis-Fluss (Gesamtsystem)

```
┌──────────────┐     ┌──────────────────┐
│  Legacy DB   │     │   Discogs API    │
│  (MySQL)     │     │                  │
└──────┬───────┘     └────────┬─────────┘
       │                      │
       ▼                      ▼
  legacy_price          discogs_*_price
  (Franks Preis)     discogs_suggested_prices
                        (Marktpreise)
       │                      │
       │    ┌─────────────────┘
       │    │
       ▼    ▼
  ┌──────────────────────────────┐
  │       estimated_value        │
  │   (VG+ × 1,2 = Richtwert)   │
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │     INVENTUR-PROZESS         │
  │  Admin sieht alle Preise     │
  │  und entscheidet final       │
  └──────────────┬───────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │       direct_price           │
  │  (FINALER VERKAUFSPREIS)     │
  │  → Artikel wird kaufbar      │
  └──────────────────────────────┘
```

---

## 10. Offene Fragen (Entscheidung durch Frank)

| # | Frage | Optionen | Empfehlung |
|---|-------|----------|------------|
| 1 | Aufschlag auf Discogs VG+ für Richtwert | ~~10%~~ / **20%** / ~~30%~~ / ~~50%+~~ | **Entschieden: 20%** |
| 2 | Richtwert auch für bestehende 6.541 Legacy+Discogs Artikel berechnen? | **Ja** / ~~Nein~~ | **Entschieden: Ja** |
| 3 | Discogs Suggested Prices Update-Frequenz | ~~Nur bei Import~~ / **Wöchentlich** / ~~Täglich~~ | **Entschieden: Wöchentlich** |
| 4 | Ab wann ist `direct_price` das primäre Kaufbar-Kriterium? | ~~Nach erster Inventur~~ / **Nach Go-Live** / ~~Sofort~~ | **Entschieden: Nach Go-Live** |
