# Plan: ReleaseArtist-Bereinigung (Legacy + Discogs)

## Problem

Die `ReleaseArtist`-Tabelle enthält ~50% Garbage-Daten (20.935 von 42.174 Einträgen). Im Legacy-System (`3wadmin_tapes_band`) wurden generische Wörter wie "FROM", "NO", "Tape", "A4", "Logo", "Inserts" als Band-Einträge gespeichert und massenhaft mit Releases verknüpft. Diese erscheinen fälschlicherweise als "Contributing Artists" auf der Website.

**Top-Offender:** FROM (3.218x), NO (1.644x), Tape (1.315x), Love (950x), Sound (872x), Red (718x), Blue (599x), Peter (543x), Das (507x), Front (482x)

**60 Fake-Artists** mit je >100 Contributor-Links identifiziert.

## Ausgangslage

| Kategorie | Releases | ReleaseArtist-Einträge | davon Garbage |
|-----------|----------|----------------------|---------------|
| Mit Discogs-ID | 16.590 | 25.801 | 13.340 (51%) |
| Ohne Discogs-ID | 24.944 | 16.351 | 7.595 (46%) |
| **Gesamt** | **41.534** | **42.174** | **20.935 (50%)** |

## Umsetzung

### Schritt 1 — Garbage-Blacklist definieren

60 Fake-Artists identifizieren (Heuristik: >100 Contributor-Links, Ratio >50 zu Hauptkünstler-Releases). Liste manuell verifizieren — einige Namen (Logo, Love, NO, Front, Material, Come) sind echte Bands mit eigenen Releases, deren Artist-Einträge behalten werden. Nur die ReleaseArtist-Verknüpfungen werden gelöscht.

### Schritt 2 — Releases MIT Discogs-ID: Ersetzen durch Discogs extraartists

Für 16.590 Releases mit `discogs_id`:

1. Alle bestehenden ReleaseArtist-Einträge löschen
2. Discogs API `GET /releases/{discogs_id}` aufrufen
3. `extraartists`-Array parsen → `name`, `role`, `id`
4. Discogs-Artist mit VOD-Artist matchen (Name oder neue Discogs-ID-Spalte)
5. Falls Artist nicht existiert → neuen Artist-Eintrag anlegen
6. ReleaseArtist befüllen mit korrekter `role` (Design, Mastering, Producer, etc.)

**Aufwand:** ~16.590 API-Calls × Rate-Limit (60/min) = ~4,5 Stunden einmalig

### Schritt 3 — Releases OHNE Discogs-ID: Garbage entfernen, Rest behalten

Für 24.944 Releases ohne `discogs_id`:

1. ReleaseArtist-Einträge der 60 Garbage-Artists löschen (~7.595 Einträge)
2. Verbleibende ~8.756 Einträge behalten (`role = 'performer'`)
3. Wenn später Discogs-Matches dazukommen → automatisch nachziehen

### Schritt 4 — Frontend: Rollen sinnvoll anzeigen

Discogs-Rollen differenziert darstellen:
- Performer-Rollen → "Contributing Artists"
- Design, Mastering, Photography, etc. → "Credits"

### Schritt 5 — Daily Sync erweitern

`discogs_daily_sync.py` anpassen: bei zukünftigen Syncs auch `extraartists` extrahieren, damit neue Discogs-Matches automatisch korrekte Contributing Artists bekommen.

## Reihenfolge

1. **Sofort:** Schritt 1 + 3 (Blacklist + Garbage entfernen) — risikoarm, sofort wirksam
2. **Danach:** Schritt 2 (Discogs-Import) — braucht Script-Entwicklung + API-Laufzeit
3. **Zum Schluss:** Schritt 4 + 5 (Frontend + Daily Sync)
