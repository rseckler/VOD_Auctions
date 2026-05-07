# Community Concept — Facebook Migration Annex

**Status:** Draft 2026-05-07
**Bezug:** Anhang zu [`Community Concept.md`](Community%20Concept.md), insbesondere §10.2 (Migrations-Plan) und §15-16 (User-Voice).
**Auslöser:** Frank hat 2026-05-07 den vollständigen Facebook-Datenexport seines Profils „Vinyl On Demand Records" heruntergeladen (~4 GB, JSON + HTML, ~2.3 GB Bilder). Sein Wunsch:
> „Ich möchte versuchen meine kompletten Postings in einem Forum / Threat über VOD-Auctions zu rekonstruieren und dann ähnlich wie bei Facebook Beiträge erstellen wo leute kommentieren können. Des Weiteren will ich das die Bilder von Facebook so bennant werden das es eine Zuordnung zu dem entsprechenden Posting gibt. Sprich wenn ein Posting zu Throbbing Gristle und der Platte Heathen Earth war, soll das Bild was dazu gezeigt wurde in Throbbing Gristle Heathen Earth FB umbenannt werden."

Dieser Annex inventarisiert die exportierten Daten, validiert die Idee gegen die Realität des Exports und mappt sie auf die existierende Concept-Roadmap.

---

## A1. Inventar des Facebook-Exports

**Pfad lokal (Stand 2026-05-07):** `~/Downloads/swisstransfer_eca5a895-…/facebook-vinylondemandrecords-07.05.2026-MTswXnXT/`
**Format:** Facebook-Native-Export (Settings → Your Information → Download Your Information). Beide Varianten heruntergeladen — JSON (Maschinen-lesbar) und HTML (menschen-lesbar). Wir arbeiten mit der **JSON-Variante** weiter (bessere Struktur, vollständiger).

### A1.1 Posts

| Metrik | Wert |
|---|---|
| Posts insgesamt | **5.819** |
| Zeitraum | 2017-04-03 → 2026-05-06 (~9 Jahre, ~640 Posts/Jahr im Schnitt, ~1,75/Tag) |
| Posts mit eigenem Text (`data[].post`) | 5.330 (91,6 %) |
| Posts mit Media-Attachment (Foto/Video) | 4.528 (77,8 %) |
| Posts mit externem Link (YouTube, Bandcamp, …) | 381 (6,5 %) |
| Reine Status-Updates (Text only) | ~536 |
| „Geteilte" Beiträge (kein eigener Inhalt) | ~358 |
| Avg / Max Text-Länge | 485 / 11.255 Zeichen |

**Verteilung Foto-Anzahl pro Post:**

| Fotos | Posts |
|---|---|
| 0 | 1.291 |
| **1** | **3.389** |
| 2 | 663 |
| 3-5 | 343 |
| 6-10 | 95 |
| 11+ | 38 (Long-Tail bis 52 Fotos in 1 Post) |

**→ Schlüssel-Erkenntnis:** **3.294 Posts haben genau 1 Foto + substantiellen Text** (>20 Zeichen). Das ist der „goldene Pfad" für 1:1-Image-Rename — knapp 57 % aller Posts.

### A1.2 Media-Files

| Quelle | Files | Größe |
|---|---|---|
| `posts/media/Fotos_…/` | ~5.300 | 1,8 GB |
| `posts/media/UploadsvonMobilgeraten_…/` | ~700 | 364 MB |
| `posts/media/your_posts/` (HTML-Variante) | 467 | 160 MB |
| **Gesamt eindeutig** | **~6.369 Bilder/Videos** | **~2,3 GB** |

Filenames sind FB-interne IDs (`1552756183521074.jpg`), keine Semantik. EXIF-Daten teilweise erhalten (iPhone-Modell, GPS, taken_timestamp).

**Wichtig:** Das Feld `provenance_info.is_gen_ai: "true"` taucht in vielen Records auf — das ist ein **FB-Export-Artefakt** ab ~2024 und bedeutet **NICHT**, dass die Fotos KI-generiert sind. Es ist ein flachgesetzter Default in Metas Pipeline. Ignorieren.

### A1.3 Comments — wichtige Limitierung

| Metrik | Wert |
|---|---|
| Comments im Export | 2.717 |
| Davon **von Frank selbst** | **2.654 (97,7 %)** |
| Davon Replies-auf-andere | 2.643 |
| Eindeutige User, an die Frank repliziert hat | **910** |

**Das ist eine Sackgasse für Franks Wunsch „andere kommentieren."** Der Personen-Datenexport von Facebook enthält nur die Comments, **die Frank selbst geschrieben** hat. Die Comments **anderer Mitglieder auf Franks Posts sind NICHT im Export** — Meta gibt diese aus DSGVO-Gründen nur den jeweiligen Autoren raus.

Wir können also rekonstruieren:
- ✅ Alle ~5.300 Frank-Posts mit Text + Bild
- ✅ Alle ~2.650 Frank-Replies (mit Datum + Originaltext)
- ❌ **Originale Comments anderer User auf seine Posts** — fehlen

→ Heißt: Migrierte Posts werden im neuen Forum **ohne historische Comments** angezeigt. Diskussion startet bei 0. Frank's Replies sind „Antworten ins Leere" — wir können sie als Frank-Comment unter den Original-Post legen, müssen aber transparent kennzeichnen (z. B. „Frank's Antwort an Chuck van Zyl, 2019 — Original-Comment nicht verfügbar").

### A1.4 Reactions — gleiche Limitierung

`likes_and_reactions.json` enthält **9.782 Einträge**, das sind **ausschließlich Reaktionen, die Frank auf andere gesetzt hat** — nicht Reaktionen anderer auf seine Posts. Zahlen wie „Wie viele Likes hatte Post X?" sind aus diesem Export NICHT rekonstruierbar.

### A1.5 Connections

| Metrik | Wert |
|---|---|
| Followers (people who followed VOD) | **11.926** |
| Friends (separate Liste, leer auf Page-Profil) | — |
| Following (Pages, denen VOD folgt) | 1 |

→ **11.926 Followers ist eine starke Zahl** — relevant für Migration-Pre-Pop und Beta-Invite-Pool. Allerdings: Die Liste enthält Display-Names, keine E-Mails (DSGVO-Filter von Meta). Cross-Match mit unseren 14.450 CRM-Master-Contacts ist über Display-Name-Fuzzy-Match möglich, aber lossy (Frank-Stammkunden mit Klarname identifizierbar, anonyme FB-Handles nicht).

---

## A2. Frank's Idee — Realisierbarkeits-Check

### A2.1 Idee zerlegt

Frank's Anforderung hat **drei separate Sub-Ideen**, die wir einzeln bewerten:

| # | Sub-Idee | Realisierbar? |
|---|---|---|
| 1 | „Posts in einem Forum/Thread rekonstruieren" | ✅ **Voll** (Daten vollständig) |
| 2 | „Beiträge erstellen wo Leute kommentieren können" | ✅ **Voll** (im Community-MVP M3+M4 enthalten) — historische Comments anderer fehlen aber |
| 3 | „Bilder umbenennen nach Posting-Inhalt, z. B. `Throbbing Gristle Heathen Earth FB.jpg`" | ⚠️ **Teilweise** — siehe §A3 |

### A2.2 Sub-Idee 1 — Posts rekonstruieren

**Datenlage:** Vollständig. Jeder Post hat Timestamp, Volltext, Liste der Media-URIs (lokal vorhanden), externe Links, Title-Type. Pre-Migration in unsere `community_post`-Tabelle (Concept §5.4) ist ein 1× Python-Script-Job, ~1 Tag Aufwand:

```text
für jeden Eintrag in profile_posts_1.json:
    - Erzeuge community_post (author=Frank-System-Account, ts=original, content=tiptap-konvertiert)
    - Lade Bild-Files nach R2 hoch (mit zugewiesenem Slug, siehe §A3)
    - Verlinke media_uris als Post-Attachments
    - Tag: 'archive', 'facebook-import', 'historic'
```

Erlaubte UI-Konventionen (Concept §6 + Vinyl-Culture-Design):
- **Importierte Posts visuell gekennzeichnet** — z. B. kleines „From the Facebook Archive · 2019-08-12" Header-Subtitel auf jedem Imported-Post (analog zu Bandcamp's „Posted on Patreon" Cross-Reference)
- **Posten in chronologischer Schein-Verteilung** — wir können entweder alle 5.819 Posts auf einmal verfügbar machen (massive Wand) oder wöchentlich „Throwback Posts" einspielen (Engagement-Hack)

**Empfehlung:** Posts werden komplett importiert mit Original-Datum, sind über `/community/archive` eigenständig durchsuchbar (siehe §A6), und einzelne werden per Editorial-Decision von Frank/Robin aufs Hub gepinnt („Aus dem Archiv, 2019: Wieso TG ein Single-Beat-Genie war").

### A2.3 Sub-Idee 2 — neue Comments unter alten Posts

**Datenlage:** Daten reichen, das ist im MVP (M4) sowieso enthalten. Importierte Posts sind reguläre `community_post`-Einträge — Member können sie kommentieren wie native Posts.

**Reibung:** Member fragen sich „Warum ist das in 2026 plötzlich top im Feed, ist 7 Jahre alt?". Lösung: Imported-Posts erscheinen NICHT im Default-Activity-Feed (M6). Sie sind nur über `/community/archive` (eigene Sub-Sektion) oder über Catalog-Anchored-Discussion (M7) auffindbar — d. h. wenn ein Member auf der Release-Page „Throbbing Gristle / Heathen Earth" landet, sieht er dort Frank's Original-Post von 2023 als „From the Vault — Frank Maier auf Facebook, 12.07.2023".

**Das ist sogar ein USP**: Jede Release-Page bekommt automatisch historischen Frank-Kontext, falls vorhanden. Letterboxd hat das nicht. Discogs hat das nicht. **Bei uns kommt 9 Jahre Frank-Kommentar gratis mit jedem Catalog-Item.** Voraussetzung: §A3 funktioniert.

### A2.4 Sub-Idee 3 — Image-Rename

Das ist das technisch schwierigste Stück. Eigener Abschnitt §A3.

---

## A3. Image-Rename-Strategie

### A3.1 Was Frank konkret will

Beispiel: Post von 2023-07-13 mit Foto `737857861677581.jpg` und Text „Sometimes you think that certain things you will most likely never own in your life... Such as those two original Industrial Records Videos of the Oundle School and Recording of Heathen Earth by Throbbing Gristle from 1980/81."

Frank's Wunsch: Die Datei soll heißen `Throbbing Gristle Heathen Earth FB.jpg`.

### A3.2 Warum das nicht trivial automatisch geht

Die FB-Posts mappen NICHT 1:1 auf einzelne Releases:

- **Single-Photo-Posts (3.389 Stück):** 1 Foto, 1 Beschreibung — meist 1 Release. Hier funktioniert Auto-Rename gut.
- **Multi-Photo-Posts (1.245 Stück):** Frank zeigt z. B. 11 Industrial-Records-Releases in einem Post. Welches Foto ist welche Release? Steht oft im Fließtext („TG1: 24 Hours Cassette… TG2…"), aber nicht maschinen-direkt zuordenbar.
- **Mehrdeutige Posts:** „Heute Punk gelistet" mit 1 Foto von 8 LPs auf dem Tisch — kein einzelnes Release.
- **Posts ohne Release-Bezug:** „On the road to Athens", „Studio-Setup" — keine Release. Unbenannt zu lassen.

### A3.3 Vorgeschlagene Pipeline (3-Tier)

**Tier 1 — Regelbasiert + Catalog-Match (~50 % aller Single-Photo-Posts).** Python-Script:
1. Extrahiere Post-Text
2. Suche `Artist`-Namen aus VOD-DB (12.451 Artists, exact + fuzzy via `pg_trgm`)
3. Suche `Release`-Titel aus VOD-DB (52.834 Releases)
4. Falls **genau 1 Artist + 1 Release im Text + 1 Foto im Post** → Auto-Rename `{Artist} - {Release} FB.jpg`
5. Falls **mehrere Kandidaten** oder **Multi-Photo** → Tier 2

**Tier 2 — AI-Vision-Pass mit Haiku 4.5 (~30 %).** Für unklare Fälle:
1. Sende Post-Text + alle Foto-Thumbnails (256 px) an Claude Haiku 4.5 mit Tool-Use
2. Prompt: „Identifiziere für jedes Bild den Artist + Release-Titel. Antworte mit JSON-Array."
3. Wir haben die VOD-DB-Liste als Whitelist im Prompt (Top-10-Artist-Match aus Tier-1, Top-50-Release-Match)
4. Claude returnt strukturiertes JSON, Script benennt um
5. Kostenkalkulation: Haiku 4.5 ist ~$1/M Input + $5/M Output. Pro Post ~3k Tokens In + 200 Out. **6.369 Files × $0,005 = ~$32 total.**

**Tier 3 — Manual-Review (~20 %).** Frank bekommt eine kleine Admin-UI (`/admin/community-import-review`):
- Liste aller AI-Tier-2-Ergebnisse mit Confidence < 0,7
- Liste aller Multi-Photo-Posts mit ≥ 4 Fotos
- Pro Post: Foto + Original-Text + Vorschlag „TG - Heathen Earth" + Edit-Field + „Bestätigen" / „Skippen"
- Frank arbeitet das in 1-2 Wochen abends durch. Bei ~1.200-1.500 Manual-Cases × 30 sec/Stück = ~10-12 h Arbeit gesamt.

**Filename-Konvention:**
- Default: `{Artist} - {Release Title} FB.jpg` — Beispiel: `Throbbing Gristle - Heathen Earth FB.jpg`
- Multi-Photo-Series: `{Artist} - {Release Title} FB-1.jpg`, `…FB-2.jpg`, …
- Kein-Match: `{YYYY-MM-DD} {first-30-chars-of-text} FB.jpg` — Beispiel: `2017-08-22 On the road to Athens FB.jpg`
- Sonderzeichen-strip: `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` ersetzt durch `-`. Umlaute behalten.

### A3.4 Was wir damit gewinnen

Dual-Use:
1. **Frank's Wunsch erfüllt** — er kann die Fotos später lokal/auf Externe HDD ablegen und findet alles über Filename
2. **Catalog-Anreicherung** — bei jedem Auto-Match wird gleichzeitig ein **`gallery_media`-Eintrag** auf die entsprechende Release-Page gehängt (Sektion „Frank's FB-Archive"), womit die Storefront automatisch reicher wird (~2.000-3.000 Releases bekommen 1+ historisches Frank-Foto als Bonus-Content)
3. **Cross-Linking** — Imported-Post zeigt im Forum den Release als Auto-Card, Release-Page zeigt den Original-Post — die Verzahnung Catalog↔Community ist der Concept-USP (§5.2)

### A3.5 Empfohlener Umfang in MVP

**MVP-Zeitfenster (Phase 1, 8-12 Wochen):**
- ✅ Sub-Idee 1 (Posts importieren) — zwingend, 1 Tag Aufwand
- ✅ Sub-Idee 2 (Comments-fähig) — automatisch erfüllt durch M3+M4
- ⚠️ Sub-Idee 3 (Image-Rename) — Tier 1 (regelbasiert) im MVP, Tier 2 (AI) **post-MVP**, Tier 3 (Manual) ist Frank-Arbeit, kann parallel laufen

Ein partial-Rollout ist ok: Wir importieren erstmal alles mit Original-FB-IDs als Filename, und die Auto-Rename-Pipeline läuft als Background-Job nach. Bei jedem Match wird die Datei in R2 unter neuem Namen verfügbar — alte URL bleibt 301-redirecting (R2 supports das).

---

## A4. Mapping auf bestehendes Community Concept

| Frank-Wunsch | Concept-Stelle | Status | Bemerkung |
|---|---|---|---|
| Posts rekonstruieren | M3 (Posts) + M6 (Activity Feed) | ✅ enthalten | Brauchen `is_imported`-Flag im Datenmodell |
| Bilder zu Posts | M3 (Bilder via Tiptap-Image-Extension) + Catalog-Anchored-Gallery | ✅ enthalten | R2-Upload-Pfad existiert (`image-upload.ts`) |
| Andere kommentieren | M4 (Comments) | ✅ enthalten | Historische Comments anderer fehlen — siehe §A1.3 |
| Image-Rename mit Semantik | NICHT im Concept | ➕ **NEU** | Wird hier als Annex-Feature ergänzt |
| FB-Archive durchsuchbar | M14 (Search) + neue `/community/archive`-Sub-Page | ⚠️ Erweiterung | Klein, ~2 Tage Aufwand |
| Migration FB → eigene Plattform | §10.2 (Pre-Pop-the-Stage) | ✅ enthalten | Annex liefert konkrete Daten dazu |

### A4.1 Datenmodell-Erweiterung (Concept §5.4)

`community_post` braucht diese zusätzlichen Spalten für FB-Import:

```sql
ALTER TABLE community_post ADD COLUMN imported_from TEXT NULL;          -- 'facebook' | 'instagram' | NULL
ALTER TABLE community_post ADD COLUMN imported_external_id TEXT NULL;   -- FB-Post-ID falls verfügbar
ALTER TABLE community_post ADD COLUMN imported_at TIMESTAMPTZ NULL;
ALTER TABLE community_post ADD COLUMN historic_timestamp TIMESTAMPTZ NULL;  -- Original-FB-Timestamp (≠ created_at)
CREATE INDEX idx_community_post_imported ON community_post(imported_from) WHERE imported_from IS NOT NULL;
```

Default-Activity-Feed-Filter: `WHERE imported_from IS NULL OR pinned_to_feed_at IS NOT NULL` — Imported-Posts erscheinen nicht im Hauptstrom außer Frank pinnt sie aktiv.

### A4.2 Neue Sub-Sektion `/community/archive`

Ergänzung zu §6.2 Sitemap:

```
/community
├── /archive                    # NEU
│   ├── /                       # Liste aller importierten Frank-FB-Posts, paginiert, chronologisch
│   ├── /[slug]                 # einzelner Imported-Post mit „From the Facebook Archive"-Header
│   └── /by-year/[YYYY]         # Jahres-View
```

**UI-Treatment:**
- Eigenes „Archive"-Visual-Treatment — sepia/silberner Tone, Vinyl-Culture-Header
- Neben jedem Imported-Post: „Originally posted on Facebook · 12.07.2023"
- Comment-Section ist normal nutzbar wie native Posts
- Imported-Post landet auch automatisch auf der Release-Page als „From the Vault" (M7-Erweiterung)

---

## A5. Was den Community-MVP konkret verändert

Die FB-Migration verändert den MVP nur **additiv** — keine bestehenden M-Items werden gestrichen oder verschoben. Aber 3 Items brauchen eine kleine Erweiterung:

| # | Item | Add-On für FB-Import |
|---|---|---|
| M3 | Posts | `imported_from` + `historic_timestamp` Felder. Posts-API supportet Bulk-Insert via Admin-Endpoint. |
| M6 | Activity Feed | Filter-Logik: Imported-Posts standardmäßig NICHT im Default-Feed |
| M7 | Catalog-Anchored | Release-Page zeigt zusätzliche „From the Vault"-Sektion mit Imported-Posts (per `linked_release_id`) |

**Neue Items (post-MVP, ~2-3 Wochen Effort):**

| # | Item | Begründung |
|---|---|---|
| **A1** | **FB-Import-Pipeline** (Python-Script `scripts/community_fb_import.py`, idempotent, dry-run-fähig) | Einmalig zu schreiben. Importiert alle 5.819 Posts mit Anhängen. |
| **A2** | **Image-Rename Tier 1+2** (regelbasiert + Haiku-Vision) | ~3-4 Tage Build, $32 AI-Kosten |
| **A3** | **Manual-Review-Admin-UI** (`/admin/community-import-review`) | ~2-3 Tage Build. Frank arbeitet 10-12 h drin |
| **A4** | **`/community/archive` Frontend** | ~2-3 Tage Build, einfache Listen-View + Detail-Page |
| **A5** | **„From the Vault"-Block auf Release-Page** | ~1-2 Tage Build, M7-Erweiterung |

**Gesamt-Mehraufwand gegenüber Concept-MVP:** **~10-13 zusätzliche Build-Tage + 10-12 h Frank-Arbeit + ~$32 AI**.

---

## A6. Risiken & offene Fragen

### A6.1 Risiken

| # | Risiko | Mitigation |
|---|---|---|
| R1 | **Imported-Posts wirken wie Spam-Wand** auf Member, weil 5.800 Posts auf einmal | Default-Feed schließt Imported-Posts aus, sind nur über `/archive` und Catalog-Anchoring sichtbar |
| R2 | **DSGVO** — wir hosten Frank's FB-Posts auf eigenem Server | Posts sind Frank's geistiges Eigentum, er hat den Export bekommen, Hosting auf eigener Plattform ist erlaubt. Bilder die Dritte zeigen → vor Import scannen, Single-Photo-Filter ausreichend. |
| R3 | **Gemeinte Personen-Tags** in Posts (Comments verlinken Member) | Kein Cross-Linking auf Member-Profile bei Imported-Posts (sind keine in unserer DB). Mentions bleiben als Plain-Text. |
| R4 | **Image-Rename misst sich an unrealistischer Erwartung** — Frank denkt vielleicht „alle 6.369 perfekt", erreicht werden ~80 % | Klare Kommunikation der 3 Tier mit Schätzwerten an Frank: „Tier 1 ~50% automatisch, Tier 2 ~30% AI-vorgeschlagen + bestätigt, Tier 3 ~20% Frank-manuell" |
| R5 | **Comments-Asymmetrie** — Frank's Replies sind im Export, ursprünglicher Kommentar nicht | Importierte Frank-Replies werden mit Original-Datum als Quote-Block unter dem Post platziert: „Frank antwortete am 2023-07-12: …" — historischer Kontext, kein vorgegaukelter Dialog |
| R6 | **Followers-Liste ohne E-Mail** — keine direkte Re-Activation der 11.926 FB-Followers | Match gegen 14.450 CRM-Contacts via Display-Name + manuelle Klassifikation der Top-200 für Beta-Invite |
| R7 | **Re-Indexierung von 6.369 Bildern** in Meili / Storefront kann ~1-2 h Last erzeugen | Off-Peak-Cron-Run, Batch-Inserts mit `pg_trgm`-Index-Pause, identisch zur Catalog-Image-Saga rc53.x |

### A6.2 Decisions (durch Frank am 2026-05-07 entschieden)

| # | Frage | Decision | Konsequenz für Implementierung |
|---|---|---|---|
| 1 | GPS/EXIF anzeigen? | **Nein — vor R2-Upload strippen** | `Pillow → image.info.pop(...)` + Re-Encode WebP, 0 EXIF im Output. Identisch zur Catalog-Discogs-Pipeline. |
| 2 | Ein Profil oder zwei? | **Ein Profil — klar markiert als „Frank — VOD-Auctions"** | Posts unter `author_id=Frank-Account`, jeder Imported-Post mit Header-Subtitel „Originally posted on Facebook · {Datum}". Kein zweites Phantom-Profil. |
| 3 | Auto-Import künftiger FB-Posts? | **Nicht relevant — Frank postet nach Cut-off nicht mehr auf Facebook** | Import ist ein **einmaliger Snapshot** vom 2026-05-07. Keine inkrementelle FB-Sync-Pipeline nötig. Spart laufende Komplexität. |
| 4 | Manual-Review-Cadence? | **Frank-Tempo, blockiert nichts** | Imported-Posts sind ab Tag 1 nutzbar mit FB-ID-Filenames. Frank arbeitet die Manual-Queue über Wochen ab — Filenames werden inkrementell verbessert. |
| 5 | „Live Discussion"-Trigger für Imported-Posts? | **Ja** | Mod-UI bekommt Toggle „In Default-Feed pinnen" auf jedem Imported-Post — eröffnet „Throwback Thursday"-Editorial-Mechanik. |
| 6 | Was mit 358 reinen Shared-Posts? | **Skippen** | Import-Pipeline filtert `title LIKE '%Beitrag geteilt%' AND no own text` raus. Effektive Import-Menge: **~5.461 Posts**. |

### A6.3 Start-Zeitpunkt — Was wann läuft

**Live-Schaltung im Forum braucht:**
1. Community-MVP M3+M4+M7 live sind (8-12 Wochen Phase-1-Build)
2. Datenmodell-Erweiterung (§A4.1) deployed ist
3. AGB für Community freigegeben sind (RSE-78 Anwalt)

**Aber das ist nur der letzte Schritt — der Import-Workflow läuft VORBEREITEND auf dem VPS, parallel zum MVP-Build. Siehe §A10 (VPS-Vorab-Pipeline).** Beim MVP-Launch ist der Archive-Bestand bereits in R2, AI-Vorschläge sind generiert, Frank-Manual-Review ist durch — der finale `community_post`-Insert dauert dann nur noch ~30 Min.


---

## A7. Total-Aufwand-Zusammenfassung

| Block | Effort (Robin) | Effort (Frank) | $-Kosten |
|---|---|---|---|
| Datenmodell-Erweiterung | 0,5 d | 0 | $0 |
| FB-Import-Pipeline (Python) | 1-2 d | 0 | $0 |
| Image-Rename Tier 1 (regelbasiert) | 1 d | 0 | $0 |
| Image-Rename Tier 2 (AI Vision) | 2-3 d | 0 | ~$32 |
| Manual-Review-Admin-UI | 2-3 d | 10-12 h Reviews | $0 |
| `/community/archive` Frontend | 2-3 d | 0 | $0 |
| Release-Page „From the Vault"-Block | 1-2 d | 0 | $0 |
| **Σ** | **9,5-14,5 d** | **~12 h** | **~$32** |

Im Verhältnis zum 8-12-Wochen MVP-Build ist das ein **+15-20 % Aufwand** — vertretbar dafür, dass wir 9 Jahre Frank-Content + 11.926 Followers-Migration mitnehmen statt bei null zu starten.

---

## A8. Bezug zu Concept §15 (User-Voice „Hot List / Chat") und §10.2 (Migrations-Plan)

Der Annex liefert die **konkreten Daten-Grundlagen** für zwei bereits im Concept formulierte Strategien:

**§10.2 Pre-Pop-the-Stage:**
- Concept sagt: „Plattform mit Inhalt befüllen BEVOR Migration kommuniziert wird"
- Annex liefert: 5.330 Frank-Posts mit Text + 4.528 Posts mit Bildern + Catalog-Verzahnung. **Beim Public-Launch ist die Plattform also nicht 'leer mit 8 Beta-Posts' sondern bereits archive-reich.**

**§16.7 User-Voice (LP des Tages, Chat):**
- Concept antwortet schon: „LP-Voting in Phase 2, Chat als Event-Mode"
- Annex erweitert: Imported-Posts können als „Throwback LP des Tages" im Voting-Pool landen — Frank kuratiert eine Wochen-Auswahl aus 9 Jahren Archive plus Neudrops. Höhere Vielfalt als nur Catalog-Items.

---

## A9. Empfohlene nächste Schritte

1. ~~Frank reviewt 6 Fragen~~ → ✅ am 2026-05-07 entschieden, siehe §A6.2
2. **Annex-Inhalte in Concept §10.2 ergänzen** — Drei Bullet-Points: „FB-Archive-Import als zusätzlicher Pre-Pop-Hebel"
3. **VPS-Vorab-Pipeline starten (§A10)** — P1-Upload + P2-Image-Pipeline parallel zum MVP-Build
4. **Backlog-Eintrag in `docs/TODO.md`** unter „Community Phase 1 — FB-Migration" anlegen
5. **Operations-Tracker bauen** (§A11) — universelle Background-Job-Übersicht im Admin

---

## A10. VPS-Vorab-Pipeline — Was JETZT parallel zum MVP-Build laufen kann

**Kontext:** Der Import-Workflow ist nicht an den MVP gekoppelt. Alles bis zum finalen DB-Insert kann auf dem VPS vorbereitet werden — der Mac/MacBook ist nicht beteiligt. Wenn der MVP fertig ist, wird ein letzter `community_fb_import.py`-Lauf gestartet, der die Manifest-Daten in `community_post` lädt (~30 Min).

**Architektur-Prinzip:** Jede Phase produziert ein **persistentes Manifest** auf dem VPS unter `/root/VOD_Auctions/data/fb_archive/`. Phasen sind idempotent + resumable — wenn ein Job crasht, wird beim nächsten Start am letzten unverarbeiteten Item weitergemacht. Identisches Pattern wie `discogs_daily_sync.py`.

### A10.1 Phasen (alle laufen auf VPS, kein MacBook nötig)

| Phase | Was passiert | Dauer | Output | Abhängigkeit |
|---|---|---|---|---|
| **P1** | **Upload des FB-Exports zum VPS** via `rsync` aus Robin's Mac (einmalig 4 GB), entpackt nach `/root/VOD_Auctions/data/fb_archive_2026-05-07/` | 20-40 Min Upload | Vollständiger Export auf VPS | — |
| **P2** | **Image-Pre-Processing**: 6.369 Files → EXIF strip (insb. GPS) → WebP re-encode → Upload nach R2 unter `tape-mag/community-fb/<fb-id>.webp`. Manifest `images.parquet` mit `(fb_id, r2_url, original_size, new_size, exif_stripped_count)` | ~2-3 h Background | `images.parquet` + R2-Bucket | P1 |
| **P3** | **Tier-1 Auto-Match-Pipeline** (Python, regelbasiert): `profile_posts_1.json` parsen, Filter Shared-Posts, Match gegen `Artist`+`Release` via `pg_trgm` aus Catalog-DB. Manifest `matches.parquet` mit `(post_id, fb_image_id, suggested_filename, tier, confidence, artist_id_candidates, release_id_candidates, post_text_excerpt)` | ~30-60 Min | `matches.parquet` Tier-1-Treffer (~50 % der Posts) | P1 |
| **P4** | **Tier-2 AI-Vision-Pass** (Haiku 4.5): für alle Tier-1-Misses + Multi-Photo-Posts. Sendet Post-Text + Thumbnails + Top-Match-Kandidaten an Claude Haiku 4.5. Schreibt zurück nach `matches.parquet` mit AI-Vorschlägen + Confidence | **~9-12 h** Background, ~$32 | `matches.parquet` ergänzt um AI-Tier (~30 % zusätzlich) | P2 + P3 |
| **P5** | **Manual-Review CSV-Export** für Frank — Generiert `manual_review.csv` mit Confidence < 0,7 / Multi-Photo-Posts. Frank reviewt das in Numbers/Excel + lädt korrigierte CSV zurück hoch (oder reviewt später in Admin-UI nach MVP-Launch) | 0 (Export-Skript) → Frank arbeitet 10-12 h drin | `manual_review_frank.csv` | P4 |
| **P6** | **(Wartet auf MVP)** Finaler `community_fb_import.py`-Lauf: Liest alle Manifeste, schreibt `community_post`-Rows mit `imported_from='facebook'` + `historic_timestamp` + R2-URLs, generiert „From the Vault"-Verknüpfungen auf Catalog-Releases | ~30 Min | DB voll | MVP M3+M4+M7 live + P5 done |

### A10.2 Was Robin's MacBook NIE machen muss

Sobald P1 abgeschlossen ist (rsync läuft 20-40 Min, dann ist der Mac frei):
- Alle Python-Pipelines (P2-P5) laufen als `nohup` auf dem VPS
- Output landet in `/root/VOD_Auctions/data/fb_archive/` und in R2
- Robin schließt das MacBook, fährt damit rum, kein Job hängt
- Status-Updates kommen über den Operations-Tracker (§A11) ins Admin-Backend — sichtbar von jedem Device

**Wichtig (Erinnerung an `feedback_no_direct_vps_deploy.md`):** Die Python-Scripts werden lokal entwickelt → Git-Commit → Push → VPS pullt → dann laufen lassen. Kein direktes scp/ssh-Edit auf VPS-Code.

### A10.3 Konkrete VPS-Pfade + neue Files

```
scripts/
├── community_fb_archive/                    # NEU, Pipeline-Sammlung
│   ├── p2_image_preprocess.py               # EXIF-strip + WebP + R2-Upload
│   ├── p3_tier1_match.py                    # Regel-Match gegen Catalog-DB
│   ├── p4_tier2_ai_vision.py                # Haiku 4.5 Vision-Pass
│   ├── p5_export_manual_review.py           # CSV-Export für Frank
│   ├── p6_final_db_import.py                # WARTET auf MVP — finaler Insert
│   └── lib/
│       ├── manifest.py                      # Parquet-Read/Write Helper
│       └── job_tracker.py                   # schreibt Heartbeats in background_job-Table

data/fb_archive_2026-05-07/                  # NEU, persistente Outputs
├── source/                                  # Original-Export
├── images.parquet                           # P2 Output
├── matches.parquet                          # P3+P4 Output
├── manual_review_frank.csv                  # P5 Output
└── manual_review_frank_corrected.csv        # Frank's Edits (Upload zurück)
```

### A10.4 Hard-Pattern, das wir wiederverwenden

- **Discogs-Import-Session-Pattern (rc26):** `import_session` + `import_event` + `session_locks` mit Heartbeat-30s/Stale-150s — wir nutzen dieselbe Lock-Logik damit ein P4-Crash nicht Doppelt-AI-Calls triggert beim Restart
- **MO-PDF-Backfill-Pattern (rc53.7+):** PIDs in DB tracken, `nohup`-Background, Resumable-by-Default
- **`feedback_http_lifecycle_background_tasks.md`:** Pipelines NICHT an HTTP-Request koppeln — eigenständige Python-Prozesse, getriggert per Admin-Button („Job starten") der nur einen Row in `background_job` einfügt + nohup-Process startet, Response sofort

---

## A11. Operations-Tracker — Universelle Background-Job-Übersicht

**Robin's Anforderung (2026-05-07):** „Bei langlaufenden Prozessen im Back-End unter Operations eine Übersicht über den Status haben."

**Das ist nicht FB-Migration-spezifisch — es ist eine Plattform-Lücke**, die wir parallel schließen sollten. Aktuell verteilt sich der Status verschiedener Long-Running-Jobs über:
- `import_session` + `import_event` (Discogs-Import) — UI in `/app/erp` Discogs-Tab
- `mo_pdf_*` Tabellen (MO-PDF-Backfill) — kein UI, nur DB
- `meilisearch_drift_log` (Cron) — eigenes UI
- `system_health_*` (Sampler) — eigenes UI im Operations-Hub
- AI-Master-Consolidation (PID 59506 auf VPS) — gar kein UI, nur PID-Watching
- FB-Import-Pipeline (kommt neu dazu)

→ **5+ verschiedene Mechaniken, kein einheitlicher Status-Überblick.** Genau dieses Defizit war auch eine Lehre aus dem System-Health-Outage 2026-05-01 (Postmortem in `docs/operations/SYSTEM_HEALTH_OUTAGE_2026-05-01.md`, Backlog B1+B2).

### A11.1 Datenmodell — `background_job`

```sql
CREATE TABLE background_job (
  id              text PRIMARY KEY,                -- ULID via generateEntityId()
  kind            text NOT NULL,                   -- 'fb_import_p2', 'discogs_daily_sync', 'mo_pdf_extract', ...
  display_name    text NOT NULL,                   -- 'Facebook Image Pre-Processing (P2)'
  status          text NOT NULL,                   -- queued|running|paused|succeeded|failed|cancelled
  progress_done   bigint DEFAULT 0,
  progress_total  bigint,
  started_at      timestamptz,
  finished_at     timestamptz,
  last_heartbeat  timestamptz,
  pid             integer,                          -- für Kill-Button
  payload         jsonb,                            -- kind-spezifische Args (e.g. file paths, model)
  result_summary  jsonb,                            -- nach Erfolg: counts, costs, etc.
  log_tail        text,                             -- letzte ~5k Zeichen für In-UI-Preview
  log_file_path   text,                             -- vollständiger Log auf VPS für Download
  triggered_by    text,                             -- 'cron', 'admin_user_id', 'system'
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CHECK (status IN ('queued','running','paused','succeeded','failed','cancelled'))
);

CREATE INDEX idx_bg_job_active ON background_job(status, started_at DESC) WHERE status IN ('running','paused','queued');
CREATE INDEX idx_bg_job_recent ON background_job(created_at DESC);
CREATE INDEX idx_bg_job_kind ON background_job(kind, created_at DESC);
```

### A11.2 Admin-UI — `/app/operations/jobs`

**Hub-Card unter `/app/operations`:** „Background Jobs · 3 running · 2 queued · 1 failed"

**Detail-Page `/app/operations/jobs`:**
- **Top-Bar:** Filter (Status, Kind, Triggered-By), Auto-Refresh-Toggle (default 10s)
- **Aktiv-Liste:** alle `running`+`paused`+`queued` Jobs mit:
  - Display-Name + Kind-Badge
  - Status-Badge (mit Heartbeat-Health: grün < 60s, gelb < 300s, rot > 300s seit letztem Heartbeat → vermutlich gecrasht)
  - Progress-Bar (`done/total`, ETA wenn rate berechenbar)
  - Started-At + Elapsed-Time
  - Action-Buttons: **Pause** / **Resume** / **Cancel** / **Logs ansehen**
- **History-Liste:** letzte 50 abgeschlossene Jobs (`succeeded`+`failed`+`cancelled`), 1-Click-Restart bei Failed
- **Detail-Drawer:** auf Click öffnet sich rechts ein Drawer mit
  - Voller `payload` als JSON
  - `result_summary` als Key-Value-Grid
  - `log_tail` (letzte 5k Zeichen, Monospace)
  - „Full Log Download" → streamt die Datei aus `log_file_path`
  - Bei `kind='fb_import_*'`: Quick-Stats (Posts processed, Images uploaded, AI calls, $-cost)

### A11.3 Heartbeat-Pattern

Jeder Long-Running-Job ruft alle 10-30 Sekunden eine `update_heartbeat(job_id, progress_done)`-Funktion (Python-Helper in `scripts/community_fb_archive/lib/job_tracker.py`). Diese:
1. UPDATE `background_job` SET `last_heartbeat=now(), progress_done=$2, updated_at=now()` WHERE id=$1
2. Prüft `status` — wenn `cancelled` durch User-Click im UI → wirft `JobCancelledError`, der Python-Prozess fängt das + macht clean shutdown

**Stale-Detection:** Cron `*/2 * * * *` läuft `mark_stale_jobs.py`:
- `UPDATE background_job SET status='failed', result_summary=jsonb_build_object('error', 'heartbeat_stale') WHERE status='running' AND last_heartbeat < now() - interval '5 minutes'`
- → Crashed Jobs werden automatisch als failed markiert + sind im UI sichtbar

### A11.4 Bestehende Jobs migrieren

Damit der Tracker echten Wert liefert, schicken auch existierende Jobs Heartbeats rein (kein Big-Bang, inkrementell):

| Job | Heutiger Mechanismus | Migration |
|---|---|---|
| `discogs_daily_sync` (Cron) | `import_session`+`import_event` | Wrapper-Script, das auch `background_job` schreibt (+15 Zeilen) |
| `meilisearch_sync` (Cron) | `meilisearch_drift_log` | Pre/Post-Run-Hooks in `meili-cron-env.sh` |
| `mo_pdf_ai_consolidate_master` (nohup) | Nur PID-Watching | `lib/job_tracker.py` integrieren beim nächsten Run |
| `system_health_sampler` (Cron) | Eigenes UI | Health-Sampler-Run als Job tracken (Lehre aus 2026-05-01-Outage) |
| `legacy_sync_v2` (Cron) | `sync_log`-Table | Wrapper-Script |
| `fb_import_p2-p6` (NEU) | — | Native `job_tracker.py` ab Tag 1 |

### A11.5 Aufwand für Operations-Tracker

| Komponente | Effort |
|---|---|
| `background_job`-Migration + Indexe | 0,5 d |
| `lib/job_tracker.py` Python-Helper (heartbeat, cancel, register) | 0,5 d |
| `mark_stale_jobs.py` Cron + Setup | 0,25 d |
| Admin-UI `/app/operations/jobs` + Detail-Drawer | 2-3 d |
| Wrapper-Migration für 3 wichtigste bestehende Jobs (discogs_daily_sync, mo_pdf, meili_sync) | 1 d |
| **Σ** | **~4-5 d** |

**Begründung warum jetzt:** Der Tracker ist ein Plattform-Asset, das bei JEDEM zukünftigen Long-Running-Job sofort 1× verfügbar ist (CRM-Backfills, Master-Merges, neue AI-Pipelines, …). Wenn wir ihn jetzt für die FB-Migration bauen, hat die nächste Pipeline (z. B. MiniMax-Phase-5 Genre/Style-Backfill für 22.630 NULL-Cases) ihn schon. Das ist die gleiche Logik wie bei `release-search.ts` (rc39) — einmal sauber gebaut, wird in 5 Routen wiederverwendet.

### A11.6 Sequenzierung der Arbeit

**Vorschlag in Reihenfolge:**

1. **Sofort (diese Woche):** Operations-Tracker `background_job`-Schema + `lib/job_tracker.py` deployen (~1 d) → Foundation steht
2. **Nächste Woche:** P1-Upload (rsync 4 GB FB-Export auf VPS) + P2-Image-Pipeline (entwickeln, dry-run auf 100 Sample, dann Full-Run) — läuft 2-3 h Background, Robin sieht Status im neuen Tracker
3. **Woche danach:** P3-Tier-1-Match-Script (regelbasiert, ~30-60 Min Run)
4. **Parallel:** Admin-UI für Operations-Tracker bauen (~2-3 d) + Wrapper-Migration für discogs_daily_sync als erster Migrant
5. **Wenn Tier-1 läuft:** P4-AI-Vision-Pass starten (9-12 h Background-Job, ~$32) — Robin schaut über Tracker zu
6. **Nach P4:** Manual-Review-CSV exportieren, Frank arbeitet sie ab (über Wochen, blockiert nichts)
7. **Wenn MVP M3+M4+M7 live:** P6-Final-DB-Import (~30 Min) — alles ist schon da, nur noch reinkippen

→ **Niemand wartet auf den MacBook**, niemand wartet auf den MVP für die Vorarbeit. FB-Bestand ist beim MVP-Launch sofort live.

---

**Status (Stand 2026-05-07 ~16:00):**

| Phase | Status | Notes |
|---|---|---|
| Decisions §A6.2 | ✅ done | 6/6 Frank-Sign-off |
| Operations-Tracker-Foundation | ✅ live | DB-Schema applied, JobTracker + Stale-Cron auf VPS |
| `/app/fb-archive` Status-Page | ✅ live | Phase-Cards + DB-Health-Banner + Live-Rates |
| P1 rsync FB-Export → VPS | ✅ done | 3,8 GB (JSON+HTML beide gebraucht) |
| P2 Image-Preprocess + R2 | ✅ done | 7.310/7.358 in 65 Min, 72 % Compression, 0 errors |
| P3 Tier-1 Match (VPS-Replica) | 🟡 running | ~6,5 % Tier-1, ~93,5 % Tier-2, ETA ~11 Min |
| P4 AI Vision (Haiku 4.5) | 🟦 ready | Script committed, ungetestet, ~$17 für ~3.500 Posts |
| P5 Manual-Review-CSV-Export | ⏳ pending | nach P4 |
| P6 Final-DB-Import in `community_post` | ⏳ blocked | wartet auf Community-MVP M3+M4+M7 (Phase 1) |

**Memory neu:** `feedback_hostinger_vps_ipv6_default.md` — VPS routet outbound default IPv6 (`2a02:4780:41:2dca::1`), IPv4-only Cloudflare-IP-Filter blockt alles. 30-Min-Diagnose-Loop bei R2-Token-Setup vermeidbar mit pre-live single-PUT-Smoke-Test.

**Doku-Links:** [Session-Log](../sessions/2026-05-07_fb_archive_pipeline.md) · [CHANGELOG rc53.11](../architecture/CHANGELOG.md) · [TODO §Now Item 0](../TODO.md#now)
