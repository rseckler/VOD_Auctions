# RSE-320 — Discogs Multi-Artist Bug

**Für:** Frank
**Von:** Robin
**Datum:** 2026-05-03
**Status:** Analyse fertig, Entscheidung steht aus
**Linear:** [RSE-320 — Discogs Informations für Interpreten unvollständig](https://linear.app/rseckler/issue/RSE-320/discogs-informations-fur-interpreten-unvollstandig)

---

## 1. Was du gesehen hast

Beim Stocktake von **VOD-47684** „Improvisations Pour Piano, Basse Et Batterie" zeigt unser System nur **„Paul Bley"** als Interpret. Auf Discogs steht aber:

> **Paul Bley, Charlie Mingus*, Art Blakey** – Improvisations Pour Piano, Basse Et Batterie

Drei Musiker als gleichberechtigte Hauptinterpreten. Bei uns ist nur der erste übernommen.

## 2. Was wirklich in der DB steht

Genaugenommen sind alle drei Musiker in unserer Datenbank — nur **falsch eingeordnet**:

| Wo | Was |
|---|---|
| `Release.artistId` (Hauptinterpret-Feld) | nur Paul Bley |
| `ReleaseArtist`-Tabelle (Mitwirkende mit Rollen) | Paul Bley (Piano), Charles Mingus (Bass), Art Blakey (Drums) |
| `Release.credits` (Credits-Textfeld) | „Bass: Charles Mingus / Drums: Art Blakey / Piano: Paul Bley" |

**Bei VOD-47684 ist es Glück:** Discogs listet die drei sowohl als Hauptinterpreten als auch in den Credits mit Rollen. Daher landen sie immerhin als „Mitwirkende" in unserer DB — sie werden nur in der Stocktake-Anzeige nicht als Hauptinterpreten gerendert.

## 3. Wie schlimm ist es im Bestand

Wir haben aktuell **11.211 Releases** über Discogs importiert. Davon haben:

| Bucket | Anzahl | Kommentar |
|---|---|---|
| Single-Artist (z.B. „Coil") | 10.036 (89,5 %) | nicht betroffen |
| Multi-Artist mit „Glücksfall" wie VOD-47684 | **500** (4,5 %) | DB komplett, nur Anzeige unvollständig |
| Multi-Artist mit **echtem Daten-Verlust** | **675** (6,0 %) | Hauptinterpret 2 + 3 + ... fehlen komplett in DB |

**Beispiele für echten Daten-Verlust:**

| Release | Bei uns | Bei Discogs |
|---|---|---|
| VOD-41551 „Konzentration Der Kräfte" | „Walter Thielsch" | **2 Artists** |
| VOD-41643 „The Red Face / The Breath And Pain Of God" (Split-12") | „Current 93" | **2 Artists** |
| VOD-41880 „Eruption" (Compilation-Single) | „Conrad" | **5 Artists** — 4 verloren |
| VOD-41939 „Sometimes I Wish I Was Dead / King Of The Flies" (Split) | „Depeche Mode" | **2 Artists** |

Pattern: hauptsächlich Splits, Compilations, Collaborations, Featurings.

Plus: tape-mag-Legacy-Releases haben einen verwandten Bug — wenn in der MySQL-Quelle `band_name` „Coil, Current 93" steht, wird der ganze Komma-String als ein einziger Artist-Name gespeichert (also Anzeige: „Coil, Current 93" als ein Künstler im System). Anzahl betroffener Legacy-Releases nicht ermittelt — der Code ist eine andere Stelle, das Symptom für dich aber identisch.

## 4. Warum passiert das

Wir haben in unserem Datenmodell historisch immer **einen** Hauptinterpret-Slot pro Release (`Release.artistId` = einzelne Verlinkung zur Artist-Tabelle). Discogs dagegen modelliert es seit Anfang an als **geordnete Liste mit Render-Hinweisen pro Verlinkung**:

```
Release "Improvisations…":
  Artist 1 = Paul Bley       (join: ",")
  Artist 2 = Charles Mingus  (anv: "Charlie Mingus", join: ",")
  Artist 3 = Art Blakey      (join: "")
```

Pro Verlinkung speichert Discogs:
- **Position** (Reihenfolge zählt — der erste ist der „Lead")
- **`anv`** = Artist Name Variant — wie der Name auf **diesem konkreten Release** geschrieben wird (Charles Mingus heißt global „Charles Mingus", aber auf diesem Cover „Charlie Mingus")
- **`join`** = der Trenner zum nächsten Artist („,", „&", „/", „Featuring", „Vs.", „Pres.")

Unser Discogs-Import nimmt aber im aktuellen Code an drei Stellen jeweils **nur den ersten Eintrag** und verwirft den Rest:
1. Beim Cache-Build (Speichern der Discogs-Antwort) werden `anv` und `join` weggestrippt — nur Name + ID bleiben
2. Beim Anlegen des Releases wird nur `artists[0]` als Hauptinterpret übernommen
3. Beim „Refetch from Discogs" (Stammdaten-Aktualisierung im Admin) wird `artists[]` komplett ignoriert

## 5. Lösungsvorschläge

Drei Optionen, vom kleinsten bis zum strukturell-saubersten Eingriff. Jede löst das Problem für **dich in der UI** vollständig — der Unterschied ist Eleganz, Wartbarkeit und ob wir bei zukünftigen Imports verlustfrei sind.

### Option A — Quick-Fix (~3-4 Stunden)

**Was passiert:**
- Neues Feld `Release.artist_display_name` (Text) wird hinzugefügt
- Für die 1.175 betroffenen Releases einmalig direkt von Discogs nachgeladen → Display-String mit `anv` + `join` korrekt befüllt („Paul Bley, Charlie Mingus, Art Blakey")
- UI rendert: `artist_display_name ?? Artist.name`
- Plus Cache-Build-Fix damit zukünftige Imports `anv`/`join` mitspeichern

**Was du bekommst:**
- ✅ Stocktake-Anzeige korrigiert für **alle 1.175 Bestand-Releases**
- ✅ Korrekte Schreibweise (Charlie statt Charles)
- ✅ Korrekte Trenner („A & B" statt fix „A, B")
- ✅ Zukünftige Discogs-Imports speichern alles richtig

**Was du NICHT bekommst:**
- Du kannst Multi-Artist nicht über die Admin-UI editieren (kein Multi-Picker)
- Filter „Alle Releases von Charlie Mingus" funktioniert nur für Releases wo er **erster** Artist ist (was er bei VOD-47684 nicht ist) → er taucht im Filter „Charlie Mingus" nicht auf
- Strukturell bleibt die DB-Architektur „1 Hauptinterpret pro Release"

### Option B — Strukturierter Refactor (~1 Arbeitswoche)

**Was passiert:**
- DB-Schema wird zu Discogs's Modell ausgebaut — die `ReleaseArtist`-Tabelle bekommt vier neue Spalten:
  - `is_primary` (ist das ein Hauptinterpret oder ein Mitwirkender mit Rolle?)
  - `position` (Reihenfolge)
  - `name_variant` (= anv, Display-Form für diesen einen Release)
  - `join_separator` (= join, Trenner zum nächsten)
- Pro Release können dadurch beliebig viele Hauptinterpreten in beliebiger Reihenfolge mit individuellen Namen-Varianten und Trennern gespeichert werden
- Ca. 40 Code-Stellen müssen angepasst werden (Storefront-Catalog, Admin-Listen, Suche, Meilisearch, Email-Templates, Bid/Order-Display, etc.)
- Edit-UI im Admin bekommt Multi-Artist-Picker mit Drag-Reorder + Editor für Variant + Trenner

**Was du bekommst:**
- ✅ Alles aus Option A
- ✅ Filter „Alle Releases von Charlie Mingus" findet ihn auch wenn er als zweiter/dritter Artist gelistet ist
- ✅ Du kannst manuell Multi-Artist-Releases in der Admin-UI pflegen (z.B. einen Featuring-Artist nachtragen)
- ✅ Storefront kann ordentliche Künstler-Detail-Seiten zeigen die alle Releases listen wo ein Künstler beteiligt war
- ✅ Future-proof gegen alle Discogs-Datenmodelle (auch exotische Joiner wie „Pres.", „Vs.")

**Was du NICHT bekommst:**
- nichts substanzielles offen, das ist die saubere Lösung

### Option C — Hybrid (~3-4 Stunden Sofort + Stage 2 in Ruhe)

**Stage 1 (sofort):** Schema von Option B vorbereiten + Backfill der Junction-Tabelle. Aber `Release.artistId` bleibt vorerst als „erster Hauptinterpret"-Cache-Spalte erhalten. Plus Display-String wie in Option A. Damit ist das User-sichtbare Problem gelöst, ohne die 40 Code-Stellen anfassen zu müssen.

**Stage 2 (irgendwann später, projekt-strukturiert):** Schrittweise die Read-Pfade von `Release.artistId` auf die Junction umstellen, wo's einen Mehrwert bringt (zuerst Storefront Artist-Detail-Seite, dann Catalog-Filter, dann Search, dann der Rest).

**Was du bekommst:**
- ✅ Sofort: Stocktake-Anzeige korrekt + Daten-Modell future-proof angelegt
- ✅ Später: schrittweise UI-Verbesserungen (Multi-Artist-Picker etc.) ohne Big-Bang-Risiko
- ✅ Vermeidet die 1-Wochen-Aktion am Stück

## 6. Was passiert mit den 675 Daten-Verlust-Cases?

Bei **allen drei Optionen** holen wir uns die fehlenden Artists einmalig live von Discogs zurück. Kein manuelles Nachpflegen nötig. Die 1.175 Multi-Artist-Releases werden in einem ~3-Stunden-Sync aktualisiert (Discogs-API-Rate-Limit).

## 7. Empfehlung

**Option C** — entkoppelt das User-sichtbare Problem (was du heute siehst) vom strukturellen Refactor (was Wochen kostet). Stage 1 ist nur unwesentlich aufwendiger als Option A, gibt uns aber das saubere Schema bereits in der DB liegen, sodass Stage 2 später risikolos schrittweise gemacht werden kann.

Wenn du sagst „lieber sofort komplett sauber, eine Woche Pause für andere Sachen", dann **Option B**.
Wenn du sagst „nur das Symptom, ich will keinen Schema-Eingriff", dann **Option A**.

## 8. Worauf du dich entscheiden musst

1. **Welche Option** (A / B / C)?
2. Falls C: **wann Stage 2** angegangen wird (jetzt schon planen, oder offen lassen bis nächste Catalog-Refactor-Session)?
3. **Tape-mag-Legacy-Releases mit Komma-band_name** — separat in einem zweiten Ticket behandeln, oder im gleichen Sweep mitnehmen? (Sie sind ein anderer Code-Pfad.)

Sag Bescheid, dann setze ich das um.

---

## Anhang: Verweise

- Linear-Ticket: [RSE-320](https://linear.app/rseckler/issue/RSE-320/discogs-informations-fur-interpreten-unvollstandig)
- Code-Stelle Hauptinterpret-Pickup: `backend/src/api/admin/discogs-import/commit/route.ts:1077`
- Code-Stelle Cache-Strip: `backend/src/api/admin/discogs-import/fetch/route.ts:282-284`
- Code-Stelle Refetch-Lücke: `backend/src/api/admin/media/[id]/discogs-preview/route.ts`
- Tape-mag-Legacy-Stelle: `scripts/legacy_sync_v2.py:624`
