# Inventur Workflow v2 — Search-First statt Queue-Driven

**Version:** 2.0
**Erstellt:** 2026-04-12
**Autor:** Robin Seckler
**Status:** Konzept — noch nicht implementiert
**Bezug:** `INVENTUR_COHORT_A_KONZEPT.md` (v3.0), ERP_INVENTORY Flag (ON seit 2026-04-12)

---

## 1. Problem mit dem aktuellen Workflow

### 1.1 Ist-Zustand (Queue-Driven)

Der aktuelle Session-Screen (`/app/erp/inventory/session`) arbeitet **system-getrieben**: Das System zeigt das nächste Item aus einer vorsortierten Queue (Format-Gruppe → Artist → Alphabet). Frank soll die angezeigte Platte physisch im Lager suchen, bewerten und bestätigen.

### 1.2 Warum das nicht funktioniert

- **Frank arbeitet physisch, nicht digital.** Er steht im Lager, nimmt einen Artikel in die Hand und will ihn im System finden — nicht umgekehrt.
- **Die Sortierung im System stimmt nicht mit der Lager-Sortierung überein.** Das Lager ist nicht sortiert (W1: "Gar nicht in der Regel oder völlig unterschiedlich. Mehrere Orte, mehrere Stellen"). Frank müsste für jedes angezeigte Item durch das gesamte Lager suchen.
- **Kein Einstiegspunkt für "Artikel in der Hand".** Es gibt keine Suchfunktion. Frank kann nur durch eine feste Queue blättern.
- **Zustandsbewertung fehlt.** Der aktuelle Screen zeigt den Legacy-Zustand an, aber Frank kann ihn nicht ändern (Media/Sleeve-Grading).
- **Keine Exemplar-Granularität.** Das aktuelle Modell hat 1 `erp_inventory_item` pro Release mit `quantity`-Zähler. Aber gebrauchte Tonträger sind Unikate — jedes Exemplar hat einen eigenen Zustand und braucht ein eigenes Barcode-Label.

### 1.3 Neuer Ansatz: Search-First + Exemplar-Modell

```
Frank nimmt Artikel in die Hand
  → Sucht im System (Titel, Artist, Cat#, oder scannt Barcode)
  → System zeigt Treffer (Release-Ebene)
  → Frank öffnet Treffer, sieht vorhandene Exemplare
  → Bewertet DIESES Exemplar: Zustand Media + Sleeve, Preis
  → Bestätigt → Exemplar bekommt eigenen Barcode + Label
  → Label druckt automatisch, Fokus zurück auf Suche
  → Nächster Artikel
```

**Zwei Kernunterschiede zum alten Workflow:**
1. **Der Mensch treibt den Prozess** (Suche statt Queue)
2. **Jedes physische Exemplar ist ein eigener Datensatz** (Exemplar statt Zähler)

---

## 2. Datenmodell-Umbau: Vom Zähler-Modell zum Exemplar-Modell

### 2.1 Das Problem

Aktuell: **1 `erp_inventory_item` pro Release**, Menge als `quantity`-Integer.

```
Release "Coil — Horse Rotorvator"
  └── erp_inventory_item (id: "01KJ...", quantity: 1, barcode: "VOD-000042")
```

Frank hat aber ggf. 3 Exemplare derselben Platte — jedes in anderem Zustand, jedes mit eigenem Preis, jedes muss einen eigenen Barcode-Aufkleber bekommen. Mit dem `quantity`-Modell geht das nicht.

### 2.2 Neues Modell: 1 Row pro physisches Exemplar

```
Release "Coil — Horse Rotorvator" (legacy_price: €45)
  ├── erp_inventory_item (id: "01KJa...", copy_number: 1, condition_media: "NM", price: €45, barcode: "VOD-000042")
  ├── erp_inventory_item (id: "01KJb...", copy_number: 2, condition_media: "VG", price: €28, barcode: "VOD-000043")
  └── erp_inventory_item (id: "01KJc...", copy_number: 3, condition_media: "G+", price: €12, barcode: "VOD-000044")
```

**Jeder physische Gegenstand = ein eigener `erp_inventory_item`-Datensatz mit:**
- Eigenem Barcode (`VOD-XXXXXX`)
- Eigenem Zustand (Media + Sleeve)
- Eigenem Preis (kann vom Release.legacy_price abweichen)
- Eigener Stocktake-History
- Eigenem Label

### 2.3 Was sich am Schema ändert

**Bestehende Tabelle `erp_inventory_item` — Spalten-Änderungen:**

```sql
-- Migration: 2026-04-XX_erp_exemplar_model.sql

-- 1. Neue Spalten
ALTER TABLE erp_inventory_item
  ADD COLUMN IF NOT EXISTS condition_media TEXT 
    CHECK (condition_media IN ('M','NM','VG+','VG','G+','G','F','P')),
  ADD COLUMN IF NOT EXISTS condition_sleeve TEXT
    CHECK (condition_sleeve IN ('M','NM','VG+','VG','G+','G','F','P')),
  ADD COLUMN IF NOT EXISTS copy_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS exemplar_price NUMERIC(10,2);
  -- exemplar_price: Individueller Preis dieses Exemplars.
  -- NULL = Release.legacy_price gilt (Standard-Fall für Exemplar #1).
  -- Gesetzt wenn Frank bei Inventur einen abweichenden Preis vergibt.

-- 2. quantity-Felder werden auf Exemplar-Modell nicht mehr als
--    "Menge dieses Artikels" genutzt, sondern immer 1.
--    quantity bleibt als Spalte bestehen (Abwärtskompatibilität),
--    wird aber bei neuen Exemplar-Rows immer auf 1 gesetzt.
--    Die ECHTE Menge eines Release ergibt sich aus:
--    SELECT COUNT(*) FROM erp_inventory_item WHERE release_id = ?

-- 3. UNIQUE Constraint auf (release_id, copy_number)
--    Verhindert doppelte copy_number pro Release
ALTER TABLE erp_inventory_item
  ADD CONSTRAINT uq_release_copy UNIQUE (release_id, copy_number);
```

### 2.4 Backfill-Migration: Bestehende Daten

Die 13.107 bestehenden `erp_inventory_item`-Rows haben aktuell `quantity=1` und sind alle Exemplar #1. Die Migration ist daher trivial:

```sql
-- Alle bestehenden Rows sind Exemplar #1 (Default-Wert copy_number=1)
-- Kein Daten-Update nötig, nur Schema-Erweiterung
-- quantity bleibt 1 (korrekt für Exemplar-Modell: 1 Row = 1 Stück)
```

**Kein Breaking Change:** Bestehende Rows bekommen `copy_number=1` per Default. Alle bestehenden Queries die `quantity` lesen, funktionieren weiter (Wert ist und bleibt 1 pro Row).

### 2.5 Wie entsteht Exemplar #2+?

Wenn Frank bei der Inventur eine Platte sucht und findet, dass es davon schon ein Exemplar #1 gibt (verifiziert oder nicht), kann er ein **weiteres Exemplar anlegen**:

```
Frank sucht "Coil Horse Rotorvator"
  → Treffer: Release mit Exemplar #1 (NM, €45, ✓ verifiziert)
  → Frank hat ein zweites Exemplar in der Hand
  → Klickt "Weiteres Exemplar hinzufügen"
  → Neuer erp_inventory_item-Datensatz: copy_number=2
  → Bewertet: VG, €28
  → Bestätigt → VOD-000043 zugewiesen → Label druckt
```

**API:**
```
POST /admin/erp/inventory/items/add-copy
Body: { release_id: "legacy-release-12345", condition_media: "VG", condition_sleeve: "VG", exemplar_price: 28, notes: "..." }
```

Logik:
1. `SELECT MAX(copy_number) FROM erp_inventory_item WHERE release_id = ?` → +1
2. `INSERT erp_inventory_item (id, release_id, copy_number, source, quantity, ...)` mit Barcode, Condition, Preis
3. `INSERT erp_inventory_movement (type: 'inbound', reason: 'stocktake_additional_copy')`

### 2.6 Auswirkungen auf andere System-Teile — Impact-Analyse

**Methodik:** Alle 33 Dateien die `erp_inventory_item` referenzieren wurden geprüft. Ergebnis: 7 Dateien nehmen 1:1 (Release → inventory_item) an und müssen angepasst werden.

#### SICHER — Keine Änderung nötig

| System-Teil | Warum sicher |
|-------------|-------------|
| **Storefront Catalog** (store/catalog/) | Kein JOIN auf erp_inventory_item. Nutzt nur `Release.legacy_price`, `legacy_available`. Exemplare sind rein intern. |
| **Storefront Cart/Checkout** | Nutzt `Release`-Felder, keinen Inventory-Join. |
| **Auction System** | `block_item.release_id` verweist auf Release-Ebene. Welches Exemplar verkauft wird, ist im MVP irrelevant (Frank weiß es physisch). Später: `block_item.inventory_item_id`. |
| **Transaction/Order** | Verweist auf Release-Ebene. |
| **`/lib/inventory.ts`** | Operiert auf `inventory_item_id` (nicht release_id). `assignBarcode()` ist item-spezifisch. |
| **`/erp/inventory/stats/`** | COUNT-basiert, zählt Rows → korrekt auch bei N Exemplaren. |
| **`/erp/inventory/filter-options/`** | DISTINCT-Aggregation, safe. |
| **POS Receipt** | Joined über `inventory_item_id`, nicht `release_id`. |
| **Label-Druck** | Jedes Exemplar hat eigenen Barcode → funktioniert bereits item-basiert. |
| **Versand-Workflow** | Barcode-Scan identifiziert exaktes Exemplar → sogar besser als vorher. |

#### KRITISCH — Muss vor Go-Live gefixt werden

| # | Datei | Problem | Fix |
|---|-------|---------|-----|
| **C1** | `admin/media/route.ts` (Zeile 88) | `LEFT JOIN erp_inventory_item ON Release.id = release_id` ohne GROUP BY → Release erscheint N-mal in der Ergebnisliste, **Pagination bricht** (25er-Page zeigt nur 15 Releases wenn 10 davon 2 Exemplare haben). | Subquery oder `DISTINCT ON (Release.id)` + Aggregatfelder für Exemplar-Count. Oder: nur erstes Exemplar joinen via `ROW_NUMBER() OVER (PARTITION BY release_id ORDER BY copy_number) = 1`. |
| **C2** | `admin/media/[id]/route.ts` (Zeile 43) | `.first()` nach LEFT JOIN → nur 1. Exemplar sichtbar, Rest **unsichtbar** in Admin. | Inventory-Daten als Array laden (separate Query), nicht per JOIN + `.first()`. |
| **C3** | `admin/routes/media/[id]/page.tsx` (Zeile 76-89) | UI hat skalare Felder (`inventory_barcode: string`, `inventory_status: string`), **kein Array-Rendering**. | Type-Definition auf `inventory_items: InventoryItem[]` umbauen. Exemplar-Liste im Detail-Panel rendern. |
| **C4** | `admin/erp/inventory/export/route.ts` (Zeile 28) | LEFT JOIN ohne Aggregation → **doppelte Rows im CSV** bei mehreren Exemplaren. | Entweder: 1 Row pro Exemplar (gewollt, Release-Daten wiederholt — Standard-CSV-Design) mit `copy_number`-Spalte. Oder: Aggregation pro Release mit `STRING_AGG`. |

#### HOCH — Funktioniert, aber Semantik muss geklärt werden

| # | Datei | Problem | Fix |
|---|-------|---------|-----|
| **H1** | `scripts/legacy_sync_v2.py` (Zeile 694-698) | `SELECT release_id FROM erp_inventory_item WHERE price_locked = true` → wenn EIN Exemplar locked ist, wird `Release.legacy_price` komplett geschützt. | **Gewollt:** Sobald ein Exemplar verifiziert ist, soll der Release-Preis nicht mehr vom MySQL-Sync überschrieben werden. Die Semantik ist: `price_locked` ist eine Release-Level-Policy, auch wenn sie pro Exemplar gespeichert ist. **Kein Code-Change nötig**, aber Dokumentation aktualisieren. |
| **H2** | `admin/erp/inventory/bulk-price-adjust/` (Zeile 139-169) | `UPDATE Release SET legacy_price = ... WHERE id = ANY(?)` → betrifft alle Exemplare gleich (da Release-Level). | **Gewollt für Bulk +15%** (schon ausgeführt). Für zukünftige Bulk-Anpassungen: Entscheidung ob `exemplar_price` ebenfalls angepasst wird oder nur `legacy_price`. Kommentar im Code ergänzen. |
| **H3** | `admin/pos/sessions/.../items/route.ts` (Zeile 55-60) | Barcode-Lookup OK (barcode ist UNIQUE per Exemplar). Aber danach: Auction-Check ist Release-level (`WHERE bi.release_id = ?`). | **Akzeptabel für MVP:** Wenn ein Release in einer Auktion ist, sind alle Exemplare gesperrt. Später verfeinern zu `block_item.inventory_item_id`. |

#### Zusammenfassung Migrationsaufwand

| Prio | Fixes | Aufwand |
|------|-------|---------|
| **Kritisch (C1-C4)** | 4 Dateien: Media-Liste, Media-Detail (API + UI), Export | ~4h |
| **Hoch (H1-H3)** | Nur Dokumentation/Kommentare, kein Code-Change für MVP | ~30 min |
| **Total zusätzlich** | Über Phase 1 hinaus | ~4.5h |

### 2.7 Release.legacy_price vs exemplar_price — Preis-Logik

**Regel:** Der **Verkaufspreis** eines Artikels ist:
- `exemplar_price` wenn gesetzt (individueller Preis für dieses Exemplar)
- `Release.legacy_price` wenn `exemplar_price` IS NULL (Standard-Preis)

**SQL:** `COALESCE(ii.exemplar_price, r.legacy_price) AS effective_price`

**Wann wird `exemplar_price` gesetzt?**
- Bei Exemplar #2+: immer (jedes Exemplar braucht eigenen Preis, da der Zustand unterschiedlich ist)
- Bei Exemplar #1: nur wenn Frank den Preis bei der Inventur ändert (sonst bleibt NULL → Release.legacy_price gilt)

**Sync-Schutz:** `Release.legacy_price` wird bei `price_locked=true` nicht vom Sync überschrieben. `exemplar_price` lebt komplett in ERP, hat keinen Sync-Kontakt.

---

## 3. Neuer Workflow im Detail

### 3.1 Ablauf pro Artikel

```
┌─────────────────────────────────────────────────────────┐
│  1. SUCHEN                                              │
│     Frank tippt Artist/Titel/CatNo in Suchfeld          │
│     ODER scannt vorhandenen Barcode (Inateck BCST-70)   │
│                                                         │
│  2. AUSWÄHLEN                                           │
│     System zeigt Treffer-Liste (Release-Ebene):         │
│     Cover, Artist, Title, Format, Preis, Exemplar-Count │
│     Frank klickt oder Enter auf richtigen Treffer       │
│                                                         │
│  3. EXEMPLARE SEHEN                                     │
│     System zeigt vorhandene Exemplare für diesen Release │
│     Exemplar #1: NM/NM · €45 · VOD-000042 · ✓          │
│     [+ Weiteres Exemplar]                               │
│                                                         │
│  4. BEWERTEN                                            │
│     Frank wählt Exemplar (oder legt neues an):          │
│     • Zustand Media:  [M] [NM] [VG+] [VG] [G+] [G]    │
│     • Zustand Sleeve: [M] [NM] [VG+] [VG] [G+] [G]    │
│     • Preis:          [€33] (pre-filled, änderbar)      │
│     • Discogs-Referenz + [Discogs-Preis übernehmen]     │
│     • Notiz:          [optional Freitext]               │
│                                                         │
│  5. BESTÄTIGEN                                          │
│     [Enter] oder [V] = Verify                           │
│     → Exemplar-Daten gespeichert                        │
│     → price_locked = true (auf Exemplar)                │
│     → Barcode zugewiesen (falls noch keiner)            │
│     → Label druckt automatisch (Brother QL-820NWB)      │
│     → Suchfeld wird geleert, Fokus zurück auf Suche     │
│                                                         │
│  6. NÄCHSTER ARTIKEL                                    │
│     Frank nimmt den nächsten Artikel in die Hand → 1.   │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Sonderfälle

| Fall | Aktion |
|------|--------|
| **Artikel nicht im System** | "Kein Treffer" — Frank legt ihn beiseite (Cohort B/C oder fehlerhafte Daten) |
| **Artikel schon verifiziert (Exemplar #1)** | Treffer zeigt ✓-Badge. Frank kann re-verifizieren (Zustand/Preis korrigieren) oder weiteres Exemplar anlegen |
| **Zweites Exemplar derselben Platte** | Frank öffnet Release → sieht Exemplar #1 → klickt "+ Weiteres Exemplar" → bewertet #2 separat |
| **Artikel beschädigt** | Zustand auf entsprechende Stufe setzen (F/P). Preis anpassen oder auf 0 |
| **Barcode-Scan eines schon gelabelten Exemplars** | Direkter Sprung zum Exemplar → Re-Verify/Korrektur möglich |

### 3.3 Warum "Missing" aus dem Haupt-Flow rausfällt

Im Search-First-Workflow hat Frank einen **physischen Artikel in der Hand** — der ist per Definition vorhanden. Missing-Erkennung passiert **nach der Inventur** als Abgleich: "Welche Cohort-A Exemplare wurden nach 6 Wochen nicht verifiziert?" → Das sind die fehlenden. Siehe §6.

---

## 4. UI-Layout: Session Screen v2

### 4.1 Drei-Zonen-Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Stocktake Session          4.231 / 13.107 verified (32.3%)     │
│  Auto-Print: ● ON           [Dashboard]  [Exit Session]          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ SUCHE ─────────────────────────────────────────────────────┐ │
│  │  🔍  Artist, Titel oder Katalognummer...                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ TREFFER (Release-Ebene) ──────────────────────────────────┐ │
│  │  [Cover] :Of The Wand..: — Bridges.. · LP · €33  2 Ex. [✓]│ │
│  │  [Cover] :Of The Wand..: — Lucifer.. · LP · €28  1 Ex.    │ │
│  │  [Cover] :Of The Wand..: — :Emptine. · CD · €15  1 Ex.    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
├──── nach Auswahl eines Treffers ────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐   :OF THE WAND & THE MOON:                    │
│  │             │   Bridges Burned And Hands Of Time              │
│  │   Cover     │   Cat #: HEIM025 · Heiðrunar Myrkrunar · LP    │
│  │   Image     │   Country: Germany · Year: 2006                 │
│  │   (300px)   │                                                 │
│  └─────────────┘                                                 │
│                                                                  │
│  ┌─ EXEMPLARE ─────────────────────────────────────────────────┐ │
│  │                                                             │ │
│  │  #1  NM / NM   €45   VOD-000042   ✓ verifiziert 12.04.     │ │
│  │  #2  VG / VG   €28   VOD-000043   ✓ verifiziert 12.04.     │ │
│  │                                                             │ │
│  │  [+ Weiteres Exemplar hinzufügen]                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ BEWERTUNG (Exemplar #3 — NEU) ────────────────────────────┐ │
│  │                                                             │ │
│  │  Zustand Media    [M] [NM] [VG+] [VG] [G+] [G] [F] [P]    │ │
│  │  Zustand Sleeve   [M] [NM] [VG+] [VG] [G+] [G] [F] [P]    │ │
│  │                                                             │ │
│  │  Preis  [ €33 ]   Discogs: Low €4 · Med €13 · High €36     │ │
│  │                   8 for sale  → View on Discogs             │ │
│  │                   [Discogs Median übernehmen: €13]          │ │
│  │                                                             │ │
│  │  Notiz  [ __________________________________________ ]      │ │
│  │                                                             │ │
│  │  ┌────────────────────┐  ┌───────────────┐                  │ │
│  │  │ [V] Bestätigen     │  │ [Esc] Zurück  │                  │ │
│  │  └────────────────────┘  └───────────────┘                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Zuletzt: ✓ Throbbing Gristle — D.o.A #1  ✓ SPK — Leichens. #2│
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Exemplar-Bewertung vs Release-Bewertung

**Beim ersten Exemplar (Exemplar #1, existiert bereits aus Backfill):**
- Frank sucht Release → öffnet → sieht Exemplar #1 (unverifiziert)
- Klickt auf Exemplar #1 → Bewertungsformular öffnet sich
- Preis pre-filled mit `Release.legacy_price` (€33 nach +15%)
- Condition pre-filled mit Legacy-Zustand (Mapping, siehe §4.5)
- Frank bewertet, bestätigt → Exemplar #1 verifiziert + Label druckt

**Beim weiteren Exemplar (Exemplar #2+, wird neu angelegt):**
- Frank sieht: Release hat schon Exemplar #1 (verifiziert)
- Klickt "+ Weiteres Exemplar" → leeres Bewertungsformular
- Preis pre-filled mit `Release.legacy_price` (als Ausgangspunkt)
- Condition leer (neues Exemplar, muss bewertet werden)
- Frank bewertet, bestätigt → neuer `erp_inventory_item`-Datensatz + Barcode + Label

### 4.3 Zustandserfassung — Goldmine-Grading

Standardisiertes Vinyl-Grading nach Goldmine/Discogs-Standard:

| Kürzel | Bedeutung | Beschreibung |
|--------|-----------|--------------|
| **M** | Mint | Ungeöffnet, perfekt |
| **NM** | Near Mint | Kaum Gebrauchsspuren |
| **VG+** | Very Good Plus | Leichte Spuren, spielt einwandfrei |
| **VG** | Very Good | Deutliche Spuren, leichtes Knistern |
| **G+** | Good Plus | Stärkere Spuren, aber spielbar |
| **G** | Good | Erhebliche Abnutzung |
| **F** | Fair | Schwere Beschädigungen |
| **P** | Poor | Kaum spielbar |

**UI:** Toggle-Buttons in einer Reihe (wie Radio-Buttons). Ein Klick wählt den Zustand.

### 4.4 Preis mit Discogs-Übernahme (W4)

Frank will Discogs-Preise per Ein-Klick übernehmen können:

```
Preis  [ €33 ]   Discogs: Low €4.19 · Med €13.38 · High €36.33
                  [Median übernehmen]  → View on Discogs ↗
```

Button "Median übernehmen" setzt das Preis-Feld auf den gerundeten Discogs-Median (`Math.round(13.38)` = €13). Frank kann danach noch manuell anpassen.

### 4.5 Legacy-Condition Mapping (Pre-Fill)

`Release.legacy_condition` enthält Freitext-Werte wie `m-/m-`, `vg+/vg`, `nm/vg+`. Für Pre-Fill beim ersten Exemplar:

```typescript
function parseLegacyCondition(legacy: string | null): { media: string | null, sleeve: string | null } {
  if (!legacy) return { media: null, sleeve: null };
  const parts = legacy.toLowerCase().split('/').map(s => s.trim());
  const map: Record<string, string> = {
    'm': 'M', 'mint': 'M',
    'nm': 'NM', 'near mint': 'NM', 'n/m': 'NM',
    'm-': 'NM',  // m- ist zwischen M und VG+, mapping zu NM (konservativ)
    'vg+': 'VG+', 'very good plus': 'VG+', 'ex': 'VG+', 'excellent': 'VG+',
    'vg': 'VG', 'very good': 'VG',
    'g+': 'G+', 'good plus': 'G+',
    'g': 'G', 'good': 'G',
    'f': 'F', 'fair': 'F',
    'p': 'P', 'poor': 'P',
  };
  return {
    media: map[parts[0]] || null,
    sleeve: parts[1] ? (map[parts[1]] || null) : null,
  };
}
```

Pre-Fill ist nur ein **Vorschlag** — Frank überschreibt mit seiner eigenen Bewertung.

### 4.6 Keyboard-Shortcuts

| Key | Kontext | Aktion |
|-----|---------|--------|
| `/` oder `F` | Jederzeit | Suchfeld fokussieren |
| `↑` / `↓` | Trefferliste | Treffer navigieren |
| `Enter` | Trefferliste | Ausgewählten Treffer öffnen |
| `Enter` | Bewertungsformular | Bestätigen (= Verify) |
| `V` | Bewertungsformular (kein Input fokussiert) | Bestätigen (= Verify) |
| `A` | Exemplar-Ansicht | Weiteres Exemplar hinzufügen |
| `D` | Bewertungsformular (kein Input fokussiert) | Discogs Median übernehmen |
| `L` | Nach Verify | Label nochmal drucken (manuell) |
| `Esc` | Bewertungsformular | Zurück zur Suche |
| `Esc` | Suchfeld | Exit-Confirmation |
| `Tab` | Bewertungsformular | Media → Sleeve → Preis → Notiz |

**Scanner-Input:** `onScan.js` erkennt schnelle Zeichenketten (< 40ms/Char). `VOD-XXXXXX` Pattern → direkter Barcode-Lookup → Exemplar öffnet sich sofort.

### 4.7 Auto-Print nach Verify

Gleich wie bisher: QZ Tray (WebSocket localhost:8181) wenn verfügbar, sonst Browser-Print-Fallback. Toggle "Auto-Print" im Header. Nach Verify:
1. Barcode wird zugewiesen (falls noch keiner)
2. Label-PDF generiert (29mm × 90mm, Brother QL-820NWB)
3. Auto-Print wenn aktiviert
4. Toast: "Verified — Exemplar #1 — VOD-000042 — Label printed"
5. Suchfeld wird geleert + fokussiert

---

## 5. Suche — Technisches Konzept

### 5.1 Anforderungen

- **Schnell:** < 200ms Antwortzeit
- **Fuzzy-tolerant:** "Wand Moon" muss `:Of The Wand & The Moon:` finden
- **Multi-Feld:** Artist, Title, CatalogNumber, Barcode
- **Exemplar-Count:** Jeder Treffer zeigt Anzahl vorhandener Exemplare + Verified-Count
- **Scope:** Nur Releases die einen `erp_inventory_item`-Eintrag haben (Cohort A)

### 5.2 API

```
GET /admin/erp/inventory/search?q=<query>&limit=20
```

**Query-Logik:**

```sql
-- Schritt 1: Barcode-Exact-Match (Scanner-Input)
SELECT ... FROM erp_inventory_item ii
JOIN "Release" r ON r.id = ii.release_id
WHERE ii.barcode = :q

-- Schritt 2: Falls kein Barcode-Match → Textsuche (Release-Ebene, aggregiert)
SELECT 
  r.id, r.title, r."coverImage", r.legacy_price, r.format, r."catalogNumber",
  a.name AS artist_name, l.name AS label_name,
  COUNT(ii.id) AS exemplar_count,
  COUNT(ii.id) FILTER (WHERE ii.last_stocktake_at IS NOT NULL) AS verified_count,
  r.discogs_lowest_price, r.discogs_median_price, r.discogs_highest_price,
  r.discogs_num_for_sale, r.discogs_id
FROM "Release" r
JOIN erp_inventory_item ii ON ii.release_id = r.id
LEFT JOIN "Artist" a ON a.id = r."artistId"
LEFT JOIN "Label" l ON l.id = r."labelId"
WHERE 
  a.name ILIKE '%' || :q || '%'
  OR r.title ILIKE '%' || :q || '%'
  OR r."catalogNumber" ILIKE '%' || :q || '%'
GROUP BY r.id, a.name, l.name
ORDER BY
  CASE WHEN a.name ILIKE :q THEN 0
       WHEN r.title ILIKE :q THEN 1
       WHEN a.name ILIKE :q || '%' THEN 2
       WHEN r.title ILIKE :q || '%' THEN 3
       ELSE 4 END,
  a.name ASC NULLS LAST, r.title ASC
LIMIT 20
```

### 5.3 Exemplar-Detail-API

Wenn Frank einen Treffer öffnet, werden die Exemplare geladen:

```
GET /admin/erp/inventory/release/:releaseId/copies
```

Response:
```json
{
  "release": {
    "id": "legacy-release-12345",
    "title": "Bridges Burned And Hands Of Time",
    "artist_name": ":Of The Wand & The Moon:",
    "cover_image": "https://...",
    "format": "LP",
    "catalog_number": "HEIM025",
    "label_name": "Heiðrunar Myrkrunar",
    "country": "Germany",
    "year": 2006,
    "legacy_price": 33,
    "legacy_condition": "m-/m-",
    "discogs_lowest": 4.19,
    "discogs_median": 13.38,
    "discogs_highest": 36.33,
    "discogs_num_for_sale": 8,
    "discogs_url": "https://www.discogs.com/release/..."
  },
  "copies": [
    {
      "id": "01KJa...",
      "copy_number": 1,
      "barcode": "VOD-000042",
      "condition_media": "NM",
      "condition_sleeve": "NM",
      "exemplar_price": null,
      "effective_price": 33,
      "status": "in_stock",
      "is_verified": true,
      "verified_at": "2026-04-12T...",
      "verified_by": "frank@vod-records.com",
      "notes": null
    }
  ],
  "can_add_copy": true
}
```

---

## 6. Dashboard & Übersicht

### 6.1 Hub Page `/app/erp/inventory` — Stats

```
┌──────────────────────────────────────────────────────────────────┐
│  Inventory Stocktake — Cohort A                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Releases:    13.107 total                                       │
│  Exemplare:   13.284 total  (177 zusätzliche Exemplare)          │
│  Verifiziert: 4.231 Exemplare  (31.8%)                          │
│  ████████████████░░░░░░░░░░░░░░░░░░░░  31.8%                    │
│                                                                  │
│  [Start Session]     [Export CSV]     [Fehlbestands-Check]        │
│                                                                  │
├── Tabs ─────────────────────────────────────────────────────────┤
│  [Alle]  [Verifiziert ✓]  [Ausstehend]  [Mehrere Exemplare]    │
│                                                                  │
│  Statistiken heute:                                              │
│  Verifiziert: 127  │  Neue Exemplare: 12  │  Preise geändert: 34│
│  Durchschnittspreis: €35.52                                      │
│                                                                  │
│  Format-Fortschritt:                                             │
│  Vinyl:  2.100 / 6.500  ████████░░░░░  32%                      │
│  Tape:   1.200 / 3.800  ██████░░░░░░░  32%                      │
│  Print:    800 / 2.200  ███████░░░░░░  36%                      │
│  Other:    131 /   607  ████░░░░░░░░░  22%                      │
└──────────────────────────────────────────────────────────────────┘
```

**Neue Kennzahlen durch Exemplar-Modell:**
- "Releases" = Anzahl DISTINCT release_id in erp_inventory_item (= 13.107, unverändert)
- "Exemplare" = Anzahl erp_inventory_item Rows (wächst wenn Frank Exemplar #2+ anlegt)
- "Zusätzliche Exemplare" = Exemplare - Releases (Differenz = Doppelte/Dreifache)

### 6.2 Fehlbestands-Check (Phase 2 — nach Inventur-Abschluss)

Wenn Frank die Inventur für abgeschlossen erklärt:

**"Fehlbestands-Check"** → Zeigt alle Cohort-A Exemplare die **nicht verifiziert** wurden:

```
Fehlbestand: 342 Exemplare nicht verifiziert

[Export CSV]  [Einzeln durchgehen]  [Alle als fehlend markieren]
```

- **"Einzeln durchgehen"**: Queue-View (alter Workflow recycled) NUR für unverifizierte Items. Frank entscheidet pro Item: "Doch da" (→ suchen + verifizieren) oder "Fehlt" (→ Missing = Preis auf 0).
- **"Alle als fehlend markieren"**: Bulk-Aktion mit Confirmation-Modal.
- **"Export CSV"**: Liste für manuelles Prüfen.

---

## 7. API-Änderungen Zusammenfassung

| Aktion | Bestehend | Neu/Geändert |
|--------|-----------|--------------|
| **Suche** | ✗ | `GET .../search?q=...` — NEU (Release-Level mit Exemplar-Count) |
| **Exemplar-Detail** | ✗ | `GET .../release/:id/copies` — NEU |
| **Exemplar anlegen** | ✗ | `POST .../items/add-copy` — NEU |
| **Verify** | `POST .../items/:id/verify` | Erweitert: `condition_media`, `condition_sleeve`, `exemplar_price` |
| **Queue** | `GET .../queue` | Bleibt für Fehlbestands-Check (Phase 2) |
| **Missing** | `POST .../items/:id/missing` | Bleibt für Fehlbestands-Check |
| **Stats** | `GET .../stats` | Erweitert: Exemplar-Count, Tagesstatistiken |
| **Browse** | ✗ | `GET .../browse?tab=...&page=...` — NEU |
| **Fehlbestand Bulk** | ✗ | `POST .../mark-missing-bulk` — NEU (Phase 2) |
| **Reset** | `POST .../items/:id/reset` | Erweitert: setzt `condition_media/sleeve`, `exemplar_price` zurück |
| **Note** | `POST .../items/:id/note` | Unverändert |
| **Label** | `GET .../items/:id/label` | Unverändert |
| **Scan** | `GET .../scan/:barcode` | Unverändert |

---

## 8. Was sich am Session-Screen ändert (Umbau-Scope)

### 8.1 Entfällt komplett

- Queue-Navigation (`←` / `→` / `[S] Skip`)
- Queue-Prefetch-Logik (50er-Batches)
- Cursor-basierte URL-Navigation
- Format-Gruppen-Sortierung als primärer Flow
- `[M] Missing` Button im Haupt-Screen

### 8.2 Bleibt gleich

- Cover-Image-Anzeige
- Release-Metadaten (Artist, Title, Format, Year, Country, CatNo, Label)
- Discogs-Preise Panel
- Barcode-Zuweisung bei Verify
- Auto-Print (QZ Tray / Browser-Fallback)
- Toast-Feedback
- Scanner-Input-Erkennung (onScan.js)
- Exit-Confirmation-Modal

### 8.3 Kommt neu

- **Suchfeld** als prominentes UI-Element (oben, immer sichtbar)
- **Treffer-Liste** mit Thumbnails, Exemplar-Count, Status-Badges
- **Exemplar-Ansicht** mit allen Kopien eines Release
- **"+ Weiteres Exemplar" Button**
- **Bewertungsformular** mit Condition-Grading (Media + Sleeve)
- **Discogs-Preis-Übernahme** per Ein-Klick
- **"Zuletzt bearbeitet"-Leiste** unten (letzte 3-5 Items)

---

## 9. Implementierungs-Plan

### Phase 0: Regression-Fixes (MUSS VOR Phase 1)

Die Exemplar-Modell-Migration (1 Release → N Exemplare) bricht 4 bestehende Dateien. Diese müssen **vor** dem Schema-Change gefixt werden, damit die Admin-Oberfläche nach Migration weiter funktioniert.

| Schritt | Beschreibung | Betroffene Datei | Aufwand |
|---------|--------------|------------------|--------|
| 0.1 | Media-Liste: LEFT JOIN → Subquery/DISTINCT ON, Exemplar-Count als Aggregat | `admin/media/route.ts` | 1.5h |
| 0.2 | Media-Detail API: Inventory als separate Query (Array statt `.first()`) | `admin/media/[id]/route.ts` | 1h |
| 0.3 | Media-Detail UI: Type + Rendering auf Exemplar-Array umbauen | `admin/routes/media/[id]/page.tsx` | 1.5h |
| 0.4 | Export: `copy_number`-Spalte hinzufügen, 1 Row pro Exemplar (explizit gewollt) | `admin/erp/inventory/export/route.ts` | 30 min |
| 0.5 | Dokumentation H1-H3: Sync-Schutz + Bulk-Adjust + POS Kommentare | Diverse | 30 min |

**Geschätzter Aufwand Phase 0:** ~5h

**Wichtig:** Phase 0 Fixes sind **abwärtskompatibel** — sie funktionieren auch mit dem aktuellen 1:1 Modell (Array mit 1 Element). Können also deployed werden bevor die Schema-Migration läuft.

### Phase 1: Schema-Migration + Search + Exemplar-Bewertung (Kern-Workflow)

| Schritt | Beschreibung | Aufwand |
|---------|--------------|--------|
| 1.1 | Migration: `condition_media`, `condition_sleeve`, `copy_number`, `exemplar_price`, UNIQUE Constraint | 30 min |
| 1.2 | Such-API: `GET /admin/erp/inventory/search?q=...` (Release-Level mit Exemplar-Count) | 1.5h |
| 1.3 | Exemplar-Detail-API: `GET .../release/:id/copies` | 1h |
| 1.4 | Add-Copy-API: `POST .../items/add-copy` | 1h |
| 1.5 | Verify-API erweitern: Condition + exemplar_price | 30 min |
| 1.6 | Session-Screen Umbau: Suchfeld + Trefferliste + Exemplar-Ansicht + Bewertungsformular | 4-5h |
| 1.7 | Keyboard-Shortcuts + Scanner anpassen | 30 min |
| 1.8 | Test: Lokaler Durchlauf, inkl. Exemplar #2 anlegen + verifizieren | 30 min |

**Geschätzter Aufwand Phase 1:** ~10h

### Phase 2: Dashboard + Übersicht

| Schritt | Beschreibung | Aufwand |
|---------|--------------|--------|
| 2.1 | Browse-API mit Tabs/Filter/Pagination (inkl. "Mehrere Exemplare" Tab) | 2h |
| 2.2 | Stats-API erweitern: Exemplar-Counts, Tagesstatistiken | 30 min |
| 2.3 | Hub-Page Umbau | 2-3h |

**Geschätzter Aufwand Phase 2:** ~5h

### Phase 3: Fehlbestands-Check (nach Inventur-Abschluss, ~6 Wochen)

| Schritt | Beschreibung | Aufwand |
|---------|--------------|--------|
| 3.1 | Fehlbestands-API + Bulk-Missing | 1.5h |
| 3.2 | Queue-View für Einzel-Durchsicht (bestehende Queue recyclen) | 1h |
| 3.3 | UI: Fehlbestands-Check | 1.5h |

**Geschätzter Aufwand Phase 3:** ~4h

### Gesamtaufwand & Reihenfolge

| Phase | Aufwand | Abhängigkeit |
|-------|---------|--------------|
| **Phase 0: Regression-Fixes** | ~5h | Keine — sofort machbar, abwärtskompatibel |
| **Phase 1: Kern-Workflow** | ~10h | Phase 0 muss deployed sein |
| **Phase 2: Dashboard** | ~5h | Phase 1 — nice-to-have für Start |
| **Phase 3: Fehlbestand** | ~4h | Erst in 4-6 Wochen |
| **Total** | **~24h** | |

**Deployment-Strategie:** Phase 0 zuerst deployen (kann auch ohne den Workflow-Umbau live gehen — macht die Admin-Media-Seite robuster). Dann Phase 1 als nächster Sprint.

---

## 10. Franks Antworten (W1-W4, 2026-04-12)

| # | Frage | Antwort | Auswirkung |
|---|-------|---------|------------|
| **W1** | Wie sind die Platten sortiert? | "Gar nicht in der Regel oder völlig unterschiedlich. Mehrere Orte, mehrere Stellen" | Queue-Workflow ist unmöglich → Search-First bestätigt |
| **W2** | Soll Zustand für alle bewertet werden? | "Für alle Artikel. Bei mehreren Exemplaren für jedes einzelne. Jedes Exemplar muss einen eigenen Code und ein eigenes Label bekommen. Eineindeutigkeit." | **Exemplar-Modell** (1 Row pro physisches Stück) statt Quantity-Zähler |
| **W3** | Gibt es Artikel mit Menge > 1? | "Ja, aber jedes Exemplar muss eindeutig identifizierbar sein, da der Zustand sich unterscheiden kann. Aber wir müssen dennoch wissen, dass es von dem Artikel >1 an Menge gibt" | `copy_number` + COUNT pro Release für Übersicht |
| **W4** | Discogs-Preis per Ein-Klick? | "Soll mit ein-Klick übernommen werden können" | "Median übernehmen" Button im Bewertungsformular |

**Zusätzlich:** Bisher wurden keine Items verifiziert. Prozess wurde noch nicht gestartet. → Kein Migrations-Risiko für bestehende verifizierte Daten.

---

## 11. Abgrenzung zu INVENTUR_COHORT_A_KONZEPT.md

| Aspekt | v3.0 (bisherig) | v2 Workflow (dieses Dokument) |
|--------|-----------------|-------------------------------|
| **Antrieb** | System (Queue) | Mensch (Suche) |
| **Einstieg** | System zeigt nächstes Item | Frank sucht Artikel |
| **Datenmodell** | 1 Row pro Release (quantity-Zähler) | **1 Row pro physisches Exemplar** |
| **Barcode** | 1 pro Release | **1 pro Exemplar** |
| **Zustand** | Nur Anzeige (Legacy) | Aktive Bewertung (Media + Sleeve Grading) |
| **Preis** | Nur Release.legacy_price | Release.legacy_price + exemplar_price (individuell) |
| **Missing** | Im Haupt-Flow (`[M]`-Taste) | Separater Fehlbestands-Check nach Inventur |
| **Navigation** | `←` `→` Queue-Buttons | Suchfeld + Trefferliste |
| **Sortierung** | Format-Gruppe → Alphabet (fest) | Egal — Frank bestimmt Reihenfolge physisch |

**Dieses Dokument ersetzt §6 (Inventur-Workflow) aus dem Hauptkonzept.** Alle anderen Abschnitte (Sync-Schutz §4, Bulk +15% §5, Barcode §14) bleiben gültig. Das Datenmodell §3 wird durch §2 dieses Dokuments erweitert (Exemplar-Spalten + UNIQUE Constraint).
