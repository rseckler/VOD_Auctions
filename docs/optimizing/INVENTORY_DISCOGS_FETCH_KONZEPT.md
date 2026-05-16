# Inventory Discogs Fetch — Konzept

**Status:** ✅ Live (rc69.0, 2026-05-16) — Fix 1 + Fix 2 + Erweiterung b deployed.
Codex-Review-Nachbesserung **rc71.3** (2026-05-16): F1 — eine leere Discogs-Tracklist
wird nicht mehr als Diff vorgeschlagen (sonst hätte ihr Apply vorhandene Tracks
gelöscht); F3 — der Apply-Button im Modal bleibt bei 0 ausgewählten Feldern aktiv,
wenn Marktpreise vorliegen (Markt-only-Refresh).
**Erstellt:** 2026-05-16
**Kontext:** Frank meldet, dass der Inventory-Process (`/app/erp/inventory`, Erfassungs-Tab)
bei frisch über den Katalog verlinkten Discogs-Releases keine Markt-/Suggestion-Daten
zeigt. Zusätzlich: Discogs-Fetch soll direkt im Inventory-Process auslösbar sein.

---

## 1. Befund & Root Cause

### 1.1 Symptom (Bug a)

- Release **ohne** `discogs_id` → im Katalog (`/admin/media/:id`) neue Discogs-ID gesetzt,
  Review-Modal bestätigt → im Inventory-Process erscheint **kein** Block „Markt aktuell /
  Discogs-Suggestion".
- Release **mit** bereits vorhandener `discogs_id` → Block erscheint im Inventory-Process.
- Eindruck: Fetch zieht nur Bilder, nicht Credits/Tracklist.

### 1.2 Root Cause — Markt-/Preisdaten

Der Discogs-Flow im Katalog läuft seit rc51.9.2 **immer** über den Review-Modal:

```
Save Linking (ID geändert)  ─┐
Refetch from Discogs        ─┴─→ POST /admin/media/:id/discogs-preview
                                 → DiscogsReviewModal
                                 → POST /admin/media/:id   (apply)
```

Dieser Pfad schreibt Stammdaten (Titel, Genres, Styles, Credits, Cover, Galerie …),
aber **nie** die vier Markt-Preis-Felder:

| Spalte | Wer schreibt sie heute |
|---|---|
| `discogs_lowest_price` | nur `discogs_daily_sync.py` (Cron) |
| `discogs_median_price` | nur `discogs_daily_sync.py` (Cron) |
| `discogs_highest_price` | nur `discogs_daily_sync.py` (Cron) |
| `discogs_num_for_sale` | nur `discogs_daily_sync.py` (Cron) |

Gründe:

1. `api/admin/media/[id]/discogs-preview/route.ts` fetcht **kein** `/marketplace/stats`
   und **kein** `/marketplace/price_suggestions` (entfernt 2026-05-07 — „M3", Codex).
2. `allowedReleaseFields` in `api/admin/media/[id]/route.ts` kennt die vier Preis-Spalten
   **nicht** → selbst wenn der Modal sie sendete, würden sie silent gedroppt.

Der Inventory-Process zeigt den Block „Markt aktuell / Discogs-Suggestion"
(`ErfassungTab.tsx:1356`) gegated auf `discogs_lowest != null || discogs_median != null`.
Bei einer frisch verlinkten Platte sind alle vier Felder NULL → Block ausgeblendet.

**Warum alt-verlinkte Releases funktionieren:** Der nächtliche Cron `discogs_daily_sync.py`
(`WHERE discogs_id IS NOT NULL`, chunked) hat deren Preisfelder längst befüllt. Frisch
verlinkte Releases bekommen Preise erst beim nächsten Cron-Durchlauf — chunked, also
ggf. Tage später.

> Nebenbefund: `api/admin/media/[id]/refetch-discogs/route.ts` **schreibt** die Preisfelder
> korrekt — wird aber vom Katalog-UI seit rc51.9.2 nicht mehr aufgerufen (toter Pfad,
> der „Refetch from Discogs"-Button öffnet ebenfalls nur den Review-Modal).

### 1.3 Root Cause — Tracklist & Credits

- **Tracklist:** echter Gap. `discogs-preview` holt `apiData.tracklist` nicht; der
  Apply-Pfad legt keine `Track`-Rows an. Nur der Bulk-Import (`discogs-import/commit`)
  schreibt Tracks. Über den Katalog-Discogs-Fetch kommt eine Tracklist **nie** rein.
- **Credits:** **kein** Gap. `discogs-preview` baut `credits` aus `apiData.extraartists`
  (`buildCreditsText()`), `credits` ist im Diff, in `allowedReleaseFields` und im
  `DiscogsReviewModal` per Default angehakt (nur sync-locked Felder sind per Default aus).
  Credits werden also bereits heute gefetcht und übernommen. Erscheint Credits leer,
  liegt es daran, dass das Discogs-Release keine `extraartists` hat **oder** der Wert
  identisch zum vorhandenen ist (Diff zeigt nur Abweichungen).

---

## 2. Fix 1 — Discogs-Marktpreise beim Verlinken schreiben

**Ziel:** Preisfelder landen sofort beim Verlinken/Refetch, ohne auf den Cron zu warten.

Marktpreise sind **Markt-Referenz, keine Stammdaten** — sie werden nicht reviewt
(kein Checkbox-Konflikt mit manuellen Edits) und immer frisch gezogen.

### Änderungen

1. **`discogs-preview/route.ts`** — `/marketplace/stats` + `/marketplace/price_suggestions`
   wieder fetchen (fail-soft, wie in `refetch-discogs`). Neues, **nicht-reviewbares**
   `market`-Objekt in der Response:
   ```ts
   market: {
     discogs_lowest_price, discogs_median_price,
     discogs_highest_price, discogs_num_for_sale
   } | null
   ```
   `market` geht NICHT in `diff` — keine Checkbox.

2. **`media/[id]/route.ts`** — die vier Preis-Spalten zu `allowedReleaseFields` ergänzen.
   Sie sind nicht in `HARD_STAMMDATEN_FIELDS`/`STAMMDATEN_AUDIT_FIELDS` → kein Lock-/
   Audit-Noise. Zusätzlich `discogs_last_synced` setzen, wenn Preise mitkommen.

3. **`media/[id]/page.tsx` `handleApplyDiscogsPreview`** — `discogsPreview.market`-Felder
   **immer** in den Apply-Body mergen, unabhängig von `selectedFields`.

4. **`DiscogsReviewModal.tsx`** — read-only Info-Zeile „Market prices will be refreshed:
   ab €X · Median €Y · Mint €Z" (kein Checkbox). Reine UX-Politur.

`pushReleaseNow()` am Ende des Apply-Pfads schiebt die Änderung nach Meili; die
Inventory-`copies`-Route liest `Release.discogs_*` ohnehin direkt aus Postgres.

---

## 3. Fix 2 — Tracklist beim Discogs-Fetch mitziehen

**Ziel:** Tracklist wird beim Katalog-Discogs-Fetch als reviewbares Feld übernommen.

### Änderungen

1. **`discogs-preview/route.ts`** — `apiData.tracklist` fetchen, `tracklist` zu
   `ProposedFields` (Array `{ position, title, duration }`, nur Einträge mit `title`).
   `current.tracklist` aus den vorhandenen `Track`-Rows (`SELECT … FROM "Track"
   WHERE "releaseId" = id ORDER BY position`). Über `isEqual` (JSON-Vergleich) diffen.

2. **`media/[id]/route.ts`** — wenn `body.tracklist` ein Array ist: innerhalb der
   Transaktion alle `Track`-Rows der Release löschen + neu inserten.
   `Track` hat keine `createdAt`/`updatedAt`. PK `id` = `tr-{releaseId}-{idx}`.
   `tracklist` ist **kein** Release-Column → Sonder-Body-Key wie `gallery_images`,
   nicht in `allowedReleaseFields`.

3. **`DiscogsReviewModal.tsx`** — `tracklist` als `TRACKLIST_FIELDS`-Sonderfall
   rendern (Anzahl + erste Titel statt roher JSON-Dump), Checkbox wie üblich.

**Hinweis Credits:** kein Code-Change nötig (siehe 1.3). Optional Fix 3 (separat):
prüfen, ob das Credits-Häkchen im Modal sichtbar/sinnvoll vorbelegt ist.

---

## 4. Erweiterung b — Discogs-Fetch im Inventory-Process

**Entscheidung (Robin, 2026-05-16):** denselben `DiscogsReviewModal` nutzen wie der
Katalog — kein eigener Direkt-Schreib-Pfad.

### Ablauf

Im Release-Panel des `ErfassungTab` eine kompakte „Discogs"-Sektion, analog zur
Katalog-Box „Discogs Linking":

- Release **hat** `discogs_id` → Button „Refetch Discogs".
- Release **ohne** `discogs_id` → kleines ID-Eingabefeld + Button „Fetch".
- Klick → `POST /admin/media/:id/discogs-preview` (`:id` = Release-ID, identisch zum
  Katalog) → `DiscogsReviewModal` → `POST /admin/media/:id` (apply).
- Nach erfolgreichem Apply: `releaseDetail` neu laden (`/admin/erp/inventory/release/:id/copies`).
  → Markt-Block + die `[D]`/`[Mint]`/`[Markt]`-Preis-Quickbuttons erscheinen sofort.

`DiscogsReviewModal`, `discogs-preview` und der Apply-Pfad liegen auf `/admin/media/*`
und sind per Release-ID erreichbar — keine neuen Backend-Routen nötig. Wiederverwendung
1:1, inklusive der Fix-1/Fix-2-Verbesserungen.

**Umgesetzt (2026-05-16):** Die „Discogs"-Sektion ist **immer** im Release-Panel sichtbar
— auch ohne Link erscheint ein ID-Eingabefeld statt nichts, damit Frank direkt verknüpfen
kann. ID-Feld ist immer editierbar (Relink/Korrektur). `release/:id/copies` gibt jetzt
`discogs_id` raw zurück. Shortcut-Handler pausiert, solange der Modal offen ist.

---

## 5. Reihenfolge & Risiko

| Schritt | Dateien | Risiko |
|---|---|---|
| Fix 1 | `discogs-preview`, `media/[id]/route.ts`, `media/[id]/page.tsx`, `DiscogsReviewModal.tsx` | gering — additive Felder, fail-soft Fetch |
| Fix 2 | `discogs-preview`, `media/[id]/route.ts`, `DiscogsReviewModal.tsx` | mittel — Track-Replace (DELETE+INSERT) in Transaktion |
| Erw. b | `ErfassungTab.tsx` (+ Modal-Import) | gering — reine FE-Verdrahtung |

Keine DB-Migration (alle Spalten/Tabellen existieren). Keine Replica-DDL.
Deploy nach `npx medusa build` + Vite-Cache-Clear (neue Admin-Logik, aber keine neue Route).
