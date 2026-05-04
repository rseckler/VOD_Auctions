# Inventory-Produktivität 2026-05-03

**Erfasst:** 2026-05-04
**Datenquelle:** `erp_inventory_item.last_stocktake_at` / `last_stocktake_by`, gefiltert auf `warehouse_location_id`

## Hinweis zu User-Attribution

Es existiert kein eigener User-Account "David" im System. Inventur-Items am Standort **Eugenstrasse** wurden unter Frank's Account (`user_01KK9D34HRWG5SB3MWR5ZWY2XC` + Email-Fallback `frank@vinyl-on-demand.com`) erfasst. Da Frank am gleichen Tag parallel in Alpenstrasse gearbeitet hat, wird die Eugenstrasse-Aktivität David zugeordnet.

**Empfehlung:** Eigenen User-Account für David anlegen, sonst werden alle Reports zu Stundenleistung pro Mitarbeiter unmöglich.

## Vergleich

| Kennzahl | David — Eugenstrasse | Frank — Alpenstrasse |
|---|---|---|
| Bearbeitete Platten | **387** | **124** |
| Erstes Item | 09:01 | 05:51 |
| Letztes Item | 17:28 | 17:39 |
| Anwesenheits-Spanne | 8h 27min | 11h 48min |
| Pausen >10min | 1 | 5 |
| Längste Pause | 48 min (Mittag) | 229 min (~3h 49min) |
| Effektive Arbeitszeit | **~7,68h** | **~2,36h** |
| Tempo (Items/h, effektiv) | **~50 Items/h** | **~53 Items/h** |
| Sek pro Platte | 72s | 68s |

## Kosten-Rechnung @ €15/h

| Modell | David | Frank |
|---|---|---|
| Effektive Zeit × €15 | 7,68h × €15 = **€115,20** | 2,36h × €15 = **€35,40** |
| **€ pro Platte (effektiv)** | **€0,30** | **€0,29** |
| Brutto-Spanne × €15 (nur theoretisch) | 8,45h × €15 = €126,75 → €0,33/Platte | 11,80h × €15 = €177,00 → €1,43/Platte |

> Die Brutto-Rechnung für Frank ist verzerrt — er hat in den 9h Pausen offensichtlich andere Aufgaben erledigt (POS, Admin, Verhandlungen). Ein fairer Stundenlohn-Vergleich geht nur über die effektive Inventur-Zeit.

## Franks Tagesablauf (Alpenstrasse)

| Block | Items | Dauer |
|---|---|---|
| 05:51 → 06:33 | Frühschicht 1 | 42min |
| 07:02 → 07:11 | Frühschicht 2 | 9min |
| **07:11 → 10:48** | **Pause (217 min)** | — |
| 10:48 → 10:58 | Vormittag 1 | 10min |
| **10:58 → 11:16** | **Pause (18 min)** | — |
| 11:16 → 11:43 | Vormittag 2 | 27min |
| **11:43 → 13:02** | **Mittag (79 min)** | — |
| 13:02 → 13:26 | Nachmittag | 24min |
| **13:26 → 17:15** | **Pause (229 min)** | — |
| 17:15 → 17:39 | Endspurt | 24min |

→ Frank macht Inventur in Sessions zwischen anderen Aufgaben, nicht als Tageshauptarbeit.

## Davids Tagesablauf (Eugenstrasse)

| Block | Beschreibung |
|---|---|
| 09:01 → 12:?? | Vormittag (durchgehend) |
| **48 min Mittagspause** | — |
| ?? → 17:28 | Nachmittag (durchgehend) |

→ Klassische 8h-Schicht mit einer Mittagspause. Sehr fokussiert.

## Bewertung

- **Tempo (50 vs. 53 Items/h)** ist praktisch identisch — beide sind beim Exemplar-Modell (Foto, Goldmine-Grading, Preisfestlegung) auf etwa der gleichen Geschwindigkeit. Die Erlern-Kurve scheint flach zu sein, oder David ist bereits gut eingearbeitet.
- **€0,30 pro Platte** ist ein gutes Benchmark für die laufenden Inventur-Kosten. Bei den verbleibenden ~28.000 Items ohne Verify wären das **~€8.400 reine Personal-Kosten** für die komplette Bestandsaufnahme.
- **Volumen-Output** an einem Tag: David hat bei der gleichen €/Platte-Quote **3,1× mehr** Items durchgebracht als Frank — weil er fokussiert in einer langen Session arbeitet, statt zwischen Aufgaben zu switchen.

## Operativ

1. **User für David anlegen** — sonst keine saubere Stunden-Zuordnung möglich.
2. **Tempo bei 50/h als Norm setzen** — Sessions <40/h triggern Review (Schulungs- oder UX-Bedarf).
3. **Wenn 28k Items komplett durchverifizierbar wären:** ~70 Personentage à 8h Inventur (= ~14 Wochen 1 FTE oder 7 Wochen 2 FTE).
