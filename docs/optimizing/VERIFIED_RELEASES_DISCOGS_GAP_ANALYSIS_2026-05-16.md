# Verifizierte Artikel — Discogs-Daten-Lücken-Analyse

**Erstellt:** 2026-05-16
**Frage:** Welche Discogs-Informationen fehlen bei den bereits verifizierten Artikeln?
**Datenstand:** Prod-DB `bofblwqieuvmqybzxapx`, Snapshot 2026-05-16.

---

## 1. Grundgesamtheit

| Kennzahl | Wert |
|---|---|
| Verifizierte Inventar-Exemplare (`erp_inventory_item.last_stocktake_at` gesetzt) | **5.517** |
| Davon betroffene Releases (distinct) | **5.211** |
| — davon `product_category = release` | 5.206 |
| — davon `band_literature` | 5 |
| Verifiziert seit 2026-05-01 | 3.253 (62 %) |

## 2. Gesamt-Befund

| Kategorie | Releases | Anteil |
|---|---|---|
| ✅ **Vollständig** (Discogs-Link + Genres + Styles + Credits + Tracklist + Marktpreis) | **3.734** | 71,7 % |
| 🔧 **Verlinkt, aber mit Lücken** — ein Refetch würde sie schließen | **1.311** | 25,2 % |
| 🔗 **Nicht verlinkt** (kein `discogs_id`) — braucht erst eine Verknüpfung | **166** | 3,2 % |

Knapp **drei Viertel** der verifizierten Releases sind sauber. Die übrigen ~1.477 haben Lücken.

## 3. Lücken im Detail (verlinkte Releases, Mehrfachnennung möglich)

| Fehlendes Feld | Verlinkte Releases | Quelle / Fixbarkeit |
|---|---|---|
| **Styles** | 910 | Discogs-Release-Metadaten — per Refetch holbar |
| **Genres** | 812 | Discogs-Release-Metadaten — per Refetch holbar |
| Genre **oder** Style fehlt | 910 | (Styles-Lücke umfasst die Genre-Lücke fast komplett) |
| **Credits** | 308 | Aus Discogs `extraartists` — per Refetch holbar; ein Teil hat real keine Credits auf Discogs |
| **Marktpreis** (`discogs_median_price`) | 181 | siehe Aufschlüsselung unten |
| **Tracklist** | 158 | Seit rc69 per Refetch holbar |
| **Cover** | 23 | (alle verifizierten Releases) — kleinste Lücke |

### Marktpreis-Lücke (181) — aufgeschlüsselt

| Fall | Anzahl | Bedeutung |
|---|---|---|
| Nie synchronisiert (`discogs_last_synced` NULL) | 51 | Cron / Refetch füllt sie automatisch |
| Synchronisiert, aber Discogs liefert keine Preis-Suggestion | 130 | **Echte Datenlücke bei Discogs** — kein Fix möglich |
| Releases, denen **nur** der Marktpreis fehlt (Metadaten sonst OK) | 65 | Deckt der `discogs_daily_sync.py`-Cron ohnehin ab |

## 4. Interpretation

1. **Größte mechanisch behebbare Lücke: Genres/Styles auf ~910 verlinkten Releases.**
   Diese Releases haben einen `discogs_id`, aber nie die Genre-/Style-Metadaten
   übernommen — vermutlich vor der Genre-Apply-Logik verlinkt, oder über einen Pfad,
   der nur den Link, nicht die Metadaten gesetzt hat (z. B. Legacy-Migration, oder
   `discogs_daily_sync.py` schreibt grundsätzlich keine Genres/Styles, nur Preise).
   Ein Discogs-Release-Refetch (genau das, was der rc69-Flow jetzt kann) füllt sie.

2. **Marktpreise sind kein großes Thema.** Nur 51 sind echt offen (Cron erledigt das);
   130 sind eine echte Discogs-seitige Datenlücke, an der kein Refetch etwas ändert.

3. **Tracklist ist überraschend gut** — nur 158 verlinkte Releases ohne. Der Großteil
   kam über den Bulk-Discogs-Import bzw. die Legacy-Migration. Seit rc69 sind diese
   158 per Refetch nachrüstbar.

4. **166 unverlinkte Releases** brauchen menschliche Arbeit: jemand muss die korrekte
   Discogs-Release-ID finden. Das ist nicht bulk-automatisierbar (Pressungs-Auswahl),
   höchstens per Fuzzy-Match vorschlagbar.

## 5. Mögliche nächste Schritte (noch nicht umgesetzt — nur Optionen)

| Option | Umfang | Aufwand |
|---|---|---|
| **A — Metadaten-Backfill-Skript** für die ~910–1.246 verlinkten Releases mit Genre/Style/Credits/Tracklist-Lücken: Discogs-Release-Endpoint je `discogs_id` ziehen, additiv schreiben (nur leere Felder). | ~1.250 API-Calls, Discogs-Rate-Limit ~60/min ⇒ ~25 min | mittel |
| **B — Marktpreise** den `discogs_daily_sync.py`-Cron nachholen lassen | 51 offene Fälle | null (läuft eh) |
| **C — 166 unverlinkte Releases**: Fuzzy-Match-Vorschlagsliste (Titel/Artist/CatNo gegen Discogs-Search) für Frank zum Bestätigen | Liste erzeugen + UI/CSV | mittel-hoch |
| **D — nichts tun**: Frank verlinkt/refetcht beim Verifizieren künftig manuell (rc69-Sektion im Erfassungs-Tab) | — | null, aber langsam |

> Empfehlung zur Diskussion: **B läuft sowieso.** Für die Genre/Style-Lücke ist **A**
> der mit Abstand größte Hebel — ein einmaliges, rate-limitiertes Skript, additiv
> (überschreibt nichts manuell Editiertes). **C** ist der einzige Posten mit echtem
> Handarbeits-Anteil.
