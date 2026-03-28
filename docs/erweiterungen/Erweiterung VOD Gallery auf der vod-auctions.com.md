# VOD Gallery — Konzept für die Erweiterung der Informationsarchitektur auf vod-auctions.com

**Version:** 1.0
**Datum:** 2026-03-22
**Status:** Konzept / Strategische Empfehlung

---

## Executive Summary

Die VOD Gallery ist kein weiterer Menüpunkt. Sie ist die physische Verdichtung dessen, wofür VOD Records seit Jahrzehnten steht: die tiefste Sammlung industrieller und experimenteller Musik in Europa, kuratiert von einem Menschen, der diese Szene nicht nur dokumentiert, sondern mitgeprägt hat.

Der neue Bereich auf vod-auctions.com inszeniert die Galerie in Friedrichshafen als kulturelle Destination — ein Ort, an dem 41.500+ Tonträger, Artefakte, Dokumente und Kunstwerke einer halben Jahrhundert Klanggeschichte sichtbar, hörbar und erwerbbar werden. Die digitale Präsenz übersetzt die Atmosphäre des physischen Raums in eine Einladung: Komm her. Hör zu. Entdecke. Nimm etwas mit, das es nirgendwo sonst gibt.

Das Konzept positioniert die VOD Gallery bewusst nicht als Shop, sondern als Archiv, Ausstellungsraum und Begegnungsort — mit der diskreten Möglichkeit, Stücke zu erwerben, die anderswo nicht verfügbar sind. Die Tonalität orientiert sich an internationalen Vorbildern wie The Vinyl Factory (London), Staalplaat (Berlin) und den japanischen Listening Bars — Orte, an denen kulturelle Autorität und kommerzielle Funktion sich nicht widersprechen, sondern gegenseitig verstärken.

---

## 1. Strategische Positionierung

### 1.1 Rolle im Marken-Ökosystem

Das VOD-Universum besteht aus vier sich ergänzenden Säulen:

| Säule | Funktion | Medium |
|-------|----------|--------|
| **VOD Records** | Label & Verlag | Produktion, Veröffentlichung |
| **tape-mag.com** | Archiv & Katalog | Dokumentation, Referenz |
| **vod-auctions.com** | Marktplatz | Handel, Auktion, Direktkauf |
| **VOD Gallery** | Erlebnisraum | Begegnung, Entdeckung, Erwerb |

Die Gallery schließt die Lücke zwischen digitalem Katalog und physischer Erfahrung. Sie macht das, was online als Datensatz existiert (41.500 Releases, 12.451 Artists, 3.077 Labels), körperlich erlebbar — als Raum, als Klang, als Gespräch.

### 1.2 Differenzierung

Die VOD Gallery ist **keines** der folgenden Dinge:

- **Kein Record Store.** Record Stores verkaufen Ware. Die Gallery präsentiert eine Sammlung und ermöglicht Erwerb als Nebeneffekt der Begegnung.
- **Kein Museum.** Museen konservieren für die Nachwelt. Die Gallery ist lebendig — Stücke werden berührt, gehört, gekauft, mitgenommen.
- **Kein Café mit Platten.** Der Kaffee ist exzellent, aber er ist Begleitung, nicht Zweck.
- **Kein Showroom für den Online-Shop.** Die Gallery zeigt Dinge, die online nicht vermittelt werden können: Haptik, Klang, Kontext, Konversation.

### 1.3 Marken- und Erlebnispositionierung

**Positionierungssatz:**

> Die VOD Gallery ist Europas dichteste Sammlung industrieller und experimenteller Musikkultur — ein Ort in Friedrichshafen, an dem Tonträger, Artefakte und Dokumente einer halben Jahrhundert Klanggeschichte sichtbar, hörbar und erwerbbar werden.

**Erlebnisversprechen:**

> Betreten. Staunen. Zuhören. Entdecken. Mitnehmen.

Drei Erlebnisebenen:

1. **Sensorisch:** Sehen (Covers, Artefakte, Architektur), Hören (kuratiertes Programm über High-End-Anlage), Riechen (Kaffee, Vinyl), Fühlen (Platten in der Hand)
2. **Intellektuell:** Kontext verstehen (wer hat das gemacht, warum, in welcher Zeit), Zusammenhänge entdecken, Expertise des Gastgebers erleben
3. **Transaktional:** Etwas finden, das man haben möchte — und es mitnehmen können. Diskret, ohne Verkaufsdruck.

---

## 2. Haupt-Informationsarchitektur

### 2.1 Integration in die Hauptnavigation

**Aktuelle Navigation:**
`Auctions` · `Catalog` · `About`

**Empfohlene Navigation (neu):**
`Auctions` · `Catalog` · `Gallery` · `About`

**Begründung:** Die Gallery erhält die dritte Position — nach den transaktionalen Bereichen (Auctions, Catalog), aber vor dem informativen Bereich (About). Diese Platzierung signalisiert: Die Gallery ist ein eigenständiger Erlebnisbereich, keine Unterseite von About. Sie steht gleichberechtigt neben Auctions und Catalog als dritter Pfeiler des Angebots.

Auf Mobile erhält die Gallery ein eigenes Icon in der Sheet-Navigation (vorgeschlagen: `Landmark` oder `Building2` aus Lucide Icons), positioniert zwischen Catalog und About.

### 2.2 URL-Struktur

```
/gallery                          → Landingpage (Hero + Übersicht)
/gallery/collection               → Die Sammlung (Highlights, Kategorien)
/gallery/exhibitions              → Aktuelle & vergangene Ausstellungen
/gallery/exhibitions/[slug]       → Einzelne Ausstellung
/gallery/listening-room           → Der Hörraum (Konzept, Programm)
/gallery/visit                    → Besuch planen (Öffnungszeiten, Anfahrt, Kontakt)
```

### 2.3 Seitenstruktur mit Begründung

```
VOD Gallery (Hauptseite)
├── The Collection                   ← Was gibt es hier?
│   ├── Tonträger (Vinyl, Tape, CD)
│   ├── Printed Matter (Zines, Bücher, Magazine)
│   ├── Artwork & Photography
│   ├── Documents & Ephemera
│   └── Rare Collectibles
├── Exhibitions                      ← Was passiert gerade?
│   ├── Current Exhibition
│   └── Past Exhibitions (Archiv)
├── Listening Room                   ← Was kann ich erleben?
│   └── Current Programme
└── Plan Your Visit                  ← Wie komme ich hin?
    ├── Opening Hours
    ├── Getting Here
    ├── Coffee & Atmosphere
    └── Contact & Appointments
```

**Begründung aus drei Perspektiven:**

| Perspektive | Logik |
|-------------|-------|
| **Nutzer** | Der Besucher bewegt sich von Neugier (Was ist das?) über Interesse (Was gibt es?) zu Aktion (Wann kann ich kommen?). Die Struktur folgt diesem natürlichen Trichter. |
| **Marke** | Jede Unterseite erzählt einen Aspekt der Markengeschichte: Tiefe (Collection), Lebendigkeit (Exhibitions), Sinnlichkeit (Listening Room), Gastfreundschaft (Visit). |
| **Conversion** | Der Besucher wird durch Bilder und Beschreibungen emotional aufgeladen, bevor die Visit-Seite den letzten Impuls gibt. Der Kauf ist nie das erste Versprechen. |

---

## 3. Seitenkonzept — Die zentrale Landingpage `/gallery`

### 3.1 Seitenarchitektur (Top-to-Bottom)

Die Landingpage ist eine vertikale Erzählung in 10 Sektionen. Jede Sektion hat eine eigene emotionale Funktion.

---

#### Sektion 1 — Hero: Der erste Eindruck

**Funktion:** Atmosphäre setzen. Sofort zeigen, dass dies kein gewöhnlicher Ort ist.

**Inhalt:**
- Vollbreites, atmosphärisches Foto der Gallery (Innenraum, gedämpftes Licht, Regale, Vinyl, Artefakte)
- Overlay-Text: Headline in DM Serif Display, groß, Gold auf dunklem Bild
- Subline: Ein Satz, der den Ort positioniert
- CTA: „Plan Your Visit" (Ghost-Button, dezent)

**Vorgeschlagene Headline-Optionen:**
- „Where Sound Becomes Tangible"
- „41,500 Records. One Room. Decades of History."
- „A Collection You Can Walk Into"

**Design-Hinweis:** Kein Slider, kein Karussell. Ein einziges, starkes Bild. Still. Die Qualität des Fotos entscheidet über den gesamten Bereich. Wenn möglich: professionelle Architekturfotografie mit natürlichem Licht und Tiefenschärfe.

---

#### Sektion 2 — Einführung: Was ist die VOD Gallery?

**Funktion:** In 3-4 Sätzen erklären, was der Besucher vor sich hat.

**Inhalt:**
- Kurztext (max. 80 Wörter), links ausgerichtet, mit großzügigem Weißraum
- Optional: kleines, ergänzendes Foto (Detail: Hand auf Vinyl, Regalausschnitt, Kaffeetasse neben Platte)

**Vorgeschlagener Text:**

> The VOD Gallery in Friedrichshafen houses one of Europe's most comprehensive collections of industrial, experimental and underground music. More than a store, it is an archive, a listening room and a meeting point — a place where five decades of sound culture become visible, audible and accessible. Visitors are welcome to browse, listen, discover and acquire pieces that exist nowhere else.

**Tonalität:** Sachlich-einladend, ohne Superlative, die nicht belegt werden können. Die Zahlen (41.500 Releases, 5 Dekaden) sprechen für sich.

---

#### Sektion 3 — Visual Gallery: Den Raum zeigen

**Funktion:** Den physischen Ort emotional erlebbar machen.

**Inhalt:**
- 4-6 Fotos in einem asymmetrischen Grid (nicht gleichförmig, nicht Masonry — bewusst gesetzt)
- Motive: Regale mit Vinyl, Detailaufnahme eines seltenen Covers, die Siebträgermaschine, ein Besucher im Gespräch, ein Artefakt in Vitrine, Blick durch den Raum

**Design-Hinweis:** Keine Bildunterschriften nötig. Die Bilder erzählen durch sich selbst. Warmer Farbton (leichtes Amber/Sepia als Overlay, passend zum Gold-Theme). Hover-Effekt: leichtes Zoom (CSS `transform: scale(1.03)`, 500ms ease).

---

#### Sektion 4 — The Collection: Was gibt es hier?

**Funktion:** Die Bandbreite und Tiefe der Sammlung kommunizieren.

**Inhalt:**
- Headline: „The Collection"
- 5 Kategorie-Cards in horizontalem Scroll oder 2×3 Grid:

| Kategorie | Beschreibung | Beispiel-Visuell |
|-----------|-------------|------------------|
| **Sound Carriers** | Vinyl, cassettes, CDs, reels — from first pressings to rare test presses | Stack von Vinyl, Seitenansicht |
| **Printed Matter** | Zines, books, magazines, liner notes — the written word of underground culture | Aufgefächerte Magazine |
| **Artwork & Photography** | Original artwork, prints, photography — the visual language of industrial music | Gerahmtes Cover-Artwork |
| **Documents & Ephemera** | Flyers, correspondence, setlists, contracts — the paper trail of a movement | Vergilbtes Konzertplakat |
| **Rare Collectibles** | One-of-a-kind items, artist proofs, hand-numbered editions, prototype releases | Einzelstück in Vitrine |

Jede Card: Bild + Kategoriename + 1-Zeilen-Beschreibung. Klick führt zu `/gallery/collection` mit Anker zur jeweiligen Kategorie.

---

#### Sektion 5 — Featured Highlights: Begehrlichkeit erzeugen

**Funktion:** 3-5 konkrete Stücke zeigen, die die Qualität der Sammlung belegen.

**Inhalt:**
- Headline: „Currently Featured" oder „From the Archive"
- 3-5 ausgewählte Stücke als große Cards (Bild + Titel + Artist + kurze Geschichte)
- Jedes Stück mit 2-3 Sätzen Kontext: Warum ist das besonders? Was macht es selten?

**Beispiel-Card:**
> **Throbbing Gristle — Second Annual Report**
> First pressing, Industrial Records IR 0002, 1977. One of fewer than 800 copies from the original run. Sleeve hand-stamped by Genesis P-Orridge. This copy includes the original Prostitution insert.

**Design-Hinweis:** Keine Preise auf der Gallery-Seite. Wenn käuflich, dezenter Hinweis „Available for acquisition" mit Link zum Katalog oder Kontaktmöglichkeit. Die Gallery-Seite verkauft Begehren, nicht Ware.

---

#### Sektion 6 — Exhibitions: Was passiert gerade?

**Funktion:** Lebendigkeit zeigen. Die Gallery ist kein statischer Ort.

**Inhalt:**
- Headline: „Current Exhibition"
- Große Card mit Ausstellungstitel, Beschreibung, Zeitraum, 1-2 Bilder
- Darunter: Link zu „Past Exhibitions" (Archiv)

**Vorgeschlagene Ausstellungs-Formate:**
- **Thematische Werkschauen:** „The Berlin School 1995-2005: When Techno Went Industrial"
- **Label-Porträts:** „Cold Meat Industry: Sweden's Dark Heart"
- **Medien-Fokus:** „Cassette Culture: The Tape Underground 1978-1992"
- **Einzelkünstler:** „Merzbow: Noise as Architecture"

Ausstellungen müssen nicht groß sein. Eine kuratierte Wand mit 20-30 Stücken, begleitet von einem kurzen Text und einer Playlist auf der Anlage, genügt. Die digitale Dokumentation auf der Website gibt der Ausstellung Reichweite über Friedrichshafen hinaus.

---

#### Sektion 7 — The Listening Room: Der Hörraum

**Funktion:** Das einzigartigste Element der Gallery als eigenes Erlebnis hervorheben.

**Inhalt:**
- Headline: „The Listening Room"
- Atmosphärisches Foto (Nahaufnahme: Plattenspieler, Verstärker, Lautsprecher, Sessel)
- Kurztext: Was ist der Listening Room? Was passiert dort?

**Vorgeschlagener Text:**

> A dedicated space within the gallery, equipped with a high-fidelity sound system and a curated programme of recordings drawn from the VOD archive. No requests. No playlists. The selection is made by Frank Bull — five decades of listening, distilled into one room.
>
> Drop in during opening hours and listen. No appointment necessary. Coffee is included.

**Warum ein Listening Room?**
Das Konzept hat internationale Vorbilder: Devon Turnbull's OJAS Listening Rooms (installiert im SFMOMA, Cooper Hewitt, Lisson Gallery), die japanischen Jazz Kissa, Spiritland und Brilliant Corners in London. Die Idee: Ein Raum, eine Anlage, ein Kurator. Die radikale Einfachheit ist das Statement.

Für Friedrichshafen bedeutet das: ein Alleinstellungsmerkmal, das in der gesamten Bodensee-Region (und weit darüber hinaus) einzigartig wäre. Der Listening Room macht die Gallery zum Ziel, nicht zum Zwischenstopp.

---

#### Sektion 8 — The Experience: Was erwartet mich?

**Funktion:** Die verschiedenen Möglichkeiten vor Ort in einem einzigen, atmosphärischen Block zusammenfassen.

**Inhalt:**
- 5 Erlebnis-Module als Icon + Kurztext:

| Icon | Erlebnis | Beschreibung |
|------|----------|-------------|
| Headphones | **Listen** | Immerse yourself in curated selections on our high-fidelity system |
| Archive | **Discover** | Browse 41,500+ records, artefacts and rare collectibles |
| Coffee | **Linger** | Take your time over expertly prepared espresso from our professional machine |
| MessageCircle | **Connect** | Meet Frank Bull and fellow collectors — conversation is part of the experience |
| Package | **Acquire** | Find pieces available nowhere else — from rare first pressings to unique artefacts |

**Design-Hinweis:** Kein Grid aus gleichförmigen Kacheln. Stattdessen: vertikale Aufzählung mit großzügigem Spacing, links Icon/Illustration, rechts Text. Jedes Modul hat genug Raum zum Atmen.

**Zum Kaffee-Erlebnis im Detail:**

> The gallery's professional espresso machine is not an afterthought. It is an invitation to stay. Industrial music was born in spaces where people gathered, argued, exchanged ideas and records over strong coffee. The VOD Gallery continues this tradition — with freshly roasted beans and the kind of preparation that rewards patience.

---

#### Sektion 9 — Plan Your Visit: Praktische Information

**Funktion:** Alle Informationen für einen Besuch auf einen Blick.

**Layout:** Zwei-Spalten (Desktop), gestapelt (Mobile)

**Linke Spalte — Öffnungszeiten & Kontakt:**

```
OPENING HOURS

Wednesday – Friday    14:00 – 19:00
Saturday              11:00 – 17:00

Or by appointment.
```

```
CONTACT

+49 7541 34412
gallery@vod-records.com

Appointments welcome — write or call
to arrange a private visit.
```

**Rechte Spalte — Anfahrt:**

```
ADDRESS

VOD Gallery
Alpenstrasse 25/1
88045 Friedrichshafen
Germany

Lake Constance / Bodensee region

BY CAR    A96 → Exit Friedrichshafen-Nord, 5 min
BY TRAIN  Friedrichshafen Stadtbahnhof, 10 min walk
BY FERRY  Konstanz/Meersburg ferry + 20 min drive
```

**Darunter:** Eingebettete Map (Google Maps / OpenStreetMap Embed, dark-themed passend zum Design)

**Terminvereinbarung:** Expliziter Hinweis, dass private Besuche und Gruppenbesuche nach Vereinbarung möglich sind. Dies signalisiert Exklusivität und persönliche Betreuung — kein Massengeschäft.

---

#### Sektion 10 — Closing Statement: Der letzte Eindruck

**Funktion:** Emotionaler Abschluss. Kein CTA-Bombardement, sondern eine stille Einladung.

**Inhalt:**
- Ein einzelner Satz in DM Serif Display, zentriert, Gold auf Dunkel

> „Some collections are catalogued. This one is lived."

- Darunter: dezenter Link „Browse the full catalogue" (führt zu `/catalog`)

---

## 4. Inhaltsmodule — Emotionsarchitektur

### 4.1 Modul-Typologie

Jedes Inhaltsmodul auf der Gallery gehört zu einer von drei Kategorien:

| Typ | Zweck | Beispiele | Tonalität |
|-----|-------|-----------|-----------|
| **Emotional** | Atmosphäre, Staunen, Begehren | Hero-Bild, Visual Gallery, Listening Room, Closing | Poetisch, sinnlich, reduziert |
| **Informativ** | Verständnis, Kontext, Orientierung | Einführung, Collection-Kategorien, Öffnungszeiten | Sachlich, klar, einladend |
| **Transaktional** | Handlung auslösen (Besuch, Kauf, Kontakt) | Featured Highlights, Visit-Sektion, Appointment | Dezent, nie drängend |

**Verteilungsregel:** Auf der Landingpage stehen emotionale Module (ca. 50%) vor informativen (ca. 35%) vor transaktionalen (ca. 15%). Der Besucher soll zuerst fühlen, dann verstehen, dann handeln wollen.

### 4.2 Begehrlichkeit ohne Kommerz

Die Gallery-Seite zeigt Stücke, aber selten Preise. Die Logik:

1. **Zeigen, nicht anbieten.** „From the Archive" zeigt Highlights mit Geschichte — nicht mit Preistag.
2. **Verfügbarkeit als Signal.** „Available for acquisition" ist ein leiser Hinweis, kein Kaufbutton.
3. **Kontext statt Conversion.** Die Geschichte eines Stücks (wer hat es gemacht, warum ist es selten, wie kam es in die Sammlung) erzeugt mehr Begehren als ein Rabatt-Badge.
4. **Verknüpfung zum Katalog.** Wer ein Stück kaufen möchte, findet es im Catalog — mit Preis, Zustand, Artikelnummer. Die Gallery-Seite verlinkt dorthin, aber macht den Sprung nicht zum Hauptzweck.

### 4.3 Bild-Text-Verhältnis

**Regel:** Auf der Gallery-Landingpage dominieren Bilder. Mindestens 60% der sichtbaren Fläche sollte fotografisch sein. Texte sind kurz, präzise, atmosphärisch. Kein Absatz länger als 80 Wörter.

**Bildtypen:**
- **Raumaufnahmen** (Weitwinkel, zeigen die Größe und Tiefe)
- **Detail-Stills** (Nahaufnahme: Vinyl-Rillen, Typo auf einem Cover, Dampf aus der Siebträgermaschine)
- **Kontext-Bilder** (Hände, die eine Platte halten; ein Besucher, der in ein Regal blickt)
- **Artefakt-Porträts** (einzelnes Stück, freigestellt oder in Vitrine, mit Tiefenschärfe)

---

## 5. UX- und Design-Richtung

### 5.1 Gestalterische Leitlinie

Die Gallery-Seiten unterscheiden sich visuell leicht vom Rest der Plattform — nicht durch einen Bruch, sondern durch eine Verdichtung der bestehenden Designsprache.

| Element | Rest der Plattform | Gallery-Bereich |
|---------|-------------------|-----------------|
| **Bildanteil** | Funktional (Thumbnails, Produktfotos) | Atmosphärisch (Raumfotos, Stills, Großformat) |
| **Typografie** | DM Serif Display für Titel, DM Sans für Body | Gleich, aber mit mehr vertikalem Spacing und größerer Headline-Skala (5xl-7xl statt 3xl-4xl) |
| **Farbgebung** | Gold #d4a54a als Akzent auf Dark #1c1915 | Gleich, aber mit zusätzlichem Warm-Tone auf Fotos (leichtes Amber-Grading) |
| **Layout** | max-w-6xl Container, funktionales Grid | Vollbreite Hero-Bilder, max-w-5xl für Text (schmaler = eleganter), asymmetrische Bild-Grids |
| **Whitespace** | Effizient (py-8 bis py-12) | Großzügig (py-16 bis py-24) — Raum ist Luxus |
| **Interaktion** | Buttons, Filter, Pagination | Wenig Interaktion, viel Scrollen, dezente Hover-States |

### 5.2 Bildsprache

**Referenz:** Die Bildsprache von The Vinyl Factory (thevinylfactory.com) und Brilliant Corners (Pressefotos) — nicht glatt, nicht inszeniert, aber bewusst komponiert.

**Grundsätze:**
- **Natürliches Licht bevorzugen.** Kein Blitzlicht, keine LED-Leisten. Warmes Tageslicht oder gedämpfte Innenbeleuchtung.
- **Menschen sparsam zeigen.** Hände ja, Gesichter selten. Der Raum und die Objekte stehen im Vordergrund.
- **Patina willkommen.** Abgegriffene Covers, vergilbte Flyer, Staubkörner im Gegenlicht — das ist keine Unordnung, sondern Authentizität.
- **Keine Stock-Fotos.** Alles muss vor Ort fotografiert sein. Die Gallery IST der Content.

### 5.3 Typografie und Tonalität

**Headline-Hierarchie auf Gallery-Seiten:**
- H1: DM Serif Display, 48-72px (5xl-7xl), Gold oder Foreground
- H2: DM Serif Display, 28-36px (2xl-4xl), Foreground
- Body: DM Sans, 16-18px, Muted Foreground, line-height 1.7 (großzügiger als auf anderen Seiten)

**Tonalität der Texte:**
- **Nicht:** „Willkommen in unserem tollen Shop!" / „Entdecken Sie jetzt unsere Angebote!"
- **Sondern:** Sachlich, leise selbstbewusst, mit gelegentlicher poetischer Verdichtung
- **Vorbild:** Galerietexte in zeitgenössischen Kunstinstitutionen — informiert, ohne zu belehren; einladend, ohne zu betteln

### 5.4 Wie die Gallery sich von einem Shop unterscheidet

| Shop-Logik | Gallery-Logik |
|-----------|--------------|
| Produkte in Reihen, nach Preis sortierbar | Stücke in Kontext, nach Geschichte erzählt |
| „Add to Cart" prominent | „Available for acquisition" dezent |
| Möglichst viele Items zeigen | Wenige, dafür tiefe Einblicke |
| Conversion-Optimierung (CTA, Urgency) | Verweildauer-Optimierung (Atmosphäre, Bildwelten) |
| Suche und Filter | Kuratierte Pfade und redaktionelle Führung |

---

## 6. Kategoriestruktur der Sammlung

### 6.1 Primäre Kategorien

Die Sammlung wird in fünf Hauptkategorien gegliedert, die sowohl die physische Aufstellung in der Gallery als auch die digitale Darstellung auf `/gallery/collection` strukturieren:

#### I. Sound Carriers — Tonträger

Die Kernsammlung. 41.500+ physische Tonträger.

| Subkategorie | Umfang | Besonderheit |
|-------------|--------|-------------|
| Vinyl (LP, 12", 10", 7") | ~18.000 | Erstpressungen, Test Pressings, farbiges Vinyl, Picture Discs |
| Cassettes | ~15.000 | DIY-Tapes, Labelkassetten, handnummerierte Editionen |
| CDs | ~5.000 | Limitierte Digipaks, Japan-Pressungen, Promo-CDs |
| Reels & Spulen | ~500 | Studiomaster, Rundfunk-Archive |
| VHS & Video | ~300 | Konzertmitschnitte, Kunstvideos, Video-Zines |
| Other Formats | ~200 | Lathe Cuts, Flexidiscs, Minidiscs, 8-Track |

#### II. Printed Matter — Druckerzeugnisse

Die textliche Begleitung der Musikkultur.

- **Zines & Fanzines** — selbstpublizierte Magazine der Szene
- **Books & Monographs** — Bücher über Künstler, Labels, Bewegungen
- **Magazines** — Ausgaben von Wire, Sounds, Industrial News, RE/Search
- **Liner Notes & Inserts** — Beilagen, Texthefte, Faltblätter
- **Sheet Music & Partituren** — Notenmaterial experimenteller Komposition (falls vorhanden)

#### III. Artwork & Photography

Die visuelle Dimension der industriellen Musik.

- **Original Cover Artwork** — Entwürfe, Druckvorlagen, Proofs
- **Photography** — Konzert-, Studio- und Porträtfotografie
- **Prints & Posters** — Siebdrucke, limitierte Kunstdrucke, Konzertplakate
- **Artist Multiples** — signierte Editionen, Objekte, Installationsreste

#### IV. Documents & Ephemera

Der Papier-Trail einer Bewegung.

- **Flyers & Handbills** — Konzert- und Clubflyer
- **Correspondence** — Briefe, Faxe, E-Mail-Ausdrucke zwischen Künstlern und Labels
- **Contracts & Business Documents** — Verträge, Pressunterlagen, Labelgründungsdokumente
- **Setlists & Notizen** — handgeschriebene Setlists, Studio-Notizen
- **Press Clippings** — Zeitungsausschnitte, Reviews, Interviews

#### V. Rare Collectibles — Einzigartige Sammlerstücke

Dinge, die es nur einmal gibt.

- **Test Pressings** — Vor-Serien-Exemplare
- **Artist Proofs** — vom Künstler geprüfte und signierte Stücke
- **Hand-Numbered Editions** — nummerierte Kleinauflagen
- **Prototype Releases** — nie veröffentlichte Versionen
- **One-of-a-Kind Objects** — Equipment, Studio-Gegenstände, persönliche Artefakte von Künstlern

### 6.2 Darstellungslogik

Auf `/gallery/collection` werden die Kategorien nicht als Produktliste, sondern als kuratierte Kapitel dargestellt:

- Jede Kategorie hat eine **Einleitung** (2-3 Sätze), ein **Leitbild** und **3-5 exemplarische Stücke**
- Stücke werden mit **Geschichte** gezeigt, nicht mit Spezifikationen
- Käufliche Stücke tragen den dezenten Hinweis „Also available in the catalogue" mit Verlinkung
- Die Darstellung wechselt zwischen Großbild (einzelnes Stück, ganzer Bildschirm) und Detailgrid (4-6 Stücke nebeneinander)

---

## 7. Besuchserlebnis vor Ort

### 7.1 Die VOD Gallery als physischer Erlebnisraum

Der physische Raum in der Alpenstrasse 25/1 wird in fünf Zonen gedacht:

#### Zone 1 — Eingang & Empfang
- Erste Orientierung, Begrüßung
- Aktuelle Ausstellung oder Featured Wall direkt sichtbar
- Keine Kasse im Eingangsbereich — der Raum beginnt mit Kultur, nicht mit Kommerz

#### Zone 2 — Die Sammlung
- Hauptraum mit Regalen, Browsing-Stations
- Vinyl nach Genre/Label/Epoche sortiert, nicht nach Preis
- Handgeschriebene Schilder oder gedruckte Karten mit Kontext (wie in guten Buchhandlungen)
- Möglichkeit, Platten in die Hand zu nehmen und zu betrachten

#### Zone 3 — Der Hörraum (Listening Room)
- Separater oder abgetrennter Bereich
- High-Fidelity-System (Plattenspieler + Röhrenverstärker + Standlautsprecher)
- 2-4 Sitzplätze (Sessel, keine Barhocker — Verweilen, nicht Stehen)
- Kuratiertes Programm: Frank Bull wählt, was läuft
- Kein Gespräch nötig — Zuhören ist ausreichend

#### Zone 4 — Kaffee & Konversation
- Die professionelle Siebträgermaschine als Zentrum der sozialen Zone
- Espresso, Cappuccino, Filter — keine ausufernde Karte, aber exzellente Qualität
- Stehtisch oder kleiner Tisch, an dem Gespräche entstehen
- Hier finden die Begegnungen statt: Sammler trifft Sammler, Besucher trifft Gastgeber

#### Zone 5 — Vitrinen & Raritäten
- Geschlossene Vitrinen für besonders wertvolle oder fragile Stücke
- Wechselnde Bestückung (monatlich oder zur jeweiligen Ausstellung)
- Beleuchtung: Museumsspots (warmweiß, gerichtet)
- Keine Preisschilder in den Vitrinen — Preis auf Anfrage

### 7.2 Inszenierung des Kaffee-Erlebnisses

Der Kaffee ist kein Zusatzangebot, sondern Teil der kulturellen Inszenierung. Die industrielle Musikszene entstand in Küchen, Hinterzimmern und improvisierten Studios — Orte, an denen Menschen zusammenkamen, diskutierten und experimentierten. Kaffee war immer dabei.

Die Siebträgermaschine steht nicht versteckt in einer Ecke, sondern sichtbar im Raum — als Objekt mit eigener ästhetischer Qualität (Chrom, Messing, Dampf). Die Zubereitung ist bewusst und sichtbar.

**Auf der Website wird dies so kommuniziert:**

> Every visit to the VOD Gallery begins with coffee — or ends with one. Our professional espresso machine produces the kind of coffee that makes you want to stay a little longer, look a little closer, listen a little deeper. No hurry. The records aren't going anywhere.

---

## 8. Benchmark-Analyse — Learnings aus internationalen Vorbildern

### 8.1 Analysierte Referenzen

| Referenz | Ort | Typ | Relevanz für VOD |
|----------|-----|-----|-----------------|
| **The Vinyl Factory + 180 Studios** | London | Label + Presswerk + Galerie + Magazin | Ökosystem-Modell: Alles verstärkt alles |
| **Staalplaat / Anagram Space** | Berlin | Experimenteller Musikladen + Galerie + Ateliers | Nächstes Analogon zu VOD: Nische + Galerie + Community |
| **Hard Wax** | Berlin | Kuratierter Record Store | Autorität durch Tiefe, nicht durch Breite |
| **Brilliant Corners** | London | Listening Bar + Restaurant | No-Design als stärkstes Design; Essen/Trinken als Wirtschaftsbasis |
| **Devon Turnbull / OJAS** | NYC / touring | HiFi Listening Room als Kunstinstallation | Zuhören als Galeriekunst — in SFMOMA, Cooper Hewitt, Lisson Gallery |
| **Honest Jon's** | London | Record Store + Label | Shop als kultureller Produzent (eigenes Label erhöht Autorität) |
| **Lovelight Records & Art** | Columbus, OH | Gallery + Record Store in kleiner Stadt | Funktionierendes Modell außerhalb der Metropolen |
| **SFMOMA „Art of Noise"** | San Francisco | Museumsausstellung | Beweis: Musikobjekte (Covers, Turntables, Poster) sind galerietaugliche Kunst |
| **JBS / Bar Music** | Tokyo | Listening Bar (Jazz Kissa-Tradition) | Kurator als einzige Autorität — radikale Einfachheit |

### 8.2 Verdichtete Learnings

**Learning 1: Autorität kommt aus Tiefe, nicht aus Marketing.**
Hard Wax hatte jahrelang keine Website, keinen Webshop, kein Schild an der Tür. Die Autorität kam aus dem Wissen der Betreiber und der Tiefe des Bestands. VOD hat beides: 41.500 Releases und Frank Bulls jahrzehntelange Expertise. Das muss nicht beworben werden — es muss sichtbar gemacht werden.

**Learning 2: Der physische Raum muss kein Designwunder sein.**
Brilliant Corners wurde ohne Architekt, ohne Designbüro, ohne Pläne gebaut. Staalplaat sieht aus wie ein Hinterzimmer. Die Authentizität eines nicht-überdesignten Raums ist glaubwürdiger als ein durchgestyltes Interieur. Die VOD Gallery braucht keine Innenarchitektur — sie braucht volle Regale, gutes Licht und eine gute Anlage.

**Learning 3: Ein Listening Room ist das stärkste Alleinstellungsmerkmal.**
Devon Turnbull installiert Hörräume im SFMOMA und Cooper Hewitt — und sie werden als Kunst behandelt. Ein permanenter Listening Room in Friedrichshafen wäre in der gesamten Bodensee-Region (Deutschland, Österreich, Schweiz) einzigartig. Investition: ein Raum, ein gutes Audiosystem, Sitzgelegenheiten. Kein High-End-Wahnsinn nötig — ein gut abgestimmtes System im Bereich 3.000-8.000 Euro reicht.

**Learning 4: Essen und Trinken machen die Ökonomie.**
Spiritland, Brilliant Corners und die japanischen Listening Bars finanzieren sich primär über Getränke und Essen. Der Kaffee in der VOD Gallery ist nicht nur atmosphärisch, sondern wirtschaftlich relevant: Er senkt die Hemmschwelle für einen Besuch, verlängert die Verweildauer und generiert Umsatz unabhängig vom Plattenverkauf.

**Learning 5: In kleinen Städten ist eine kulturelle Destination ein Magnet.**
Lovelight Records in Columbus, Ohio zeigt: Ein Gallery-Store-Hybrid mit regelmäßigen Events (wöchentliche DJ-Nacht, monatlicher Markt) wird zum kulturellen Anker einer ganzen Nachbarschaft. Friedrichshafen hat den Bodensee-Tourismus als zusätzlichen Besucherstrom — die Gallery könnte für Kulturtouristen ein Ziel werden.

**Learning 6: Die Grenzen zwischen Label, Shop, Galerie und Archiv auflösen.**
The Vinyl Factory ist gleichzeitig Presswerk, Label, Magazin, Galerie und Veranstaltungsort. Jede Aktivität verstärkt die andere. VOD Records hat bereits Label, Archiv (tape-mag.com) und Marktplatz (vod-auctions.com). Die Gallery ist das fehlende physische Bindeglied, das alle digitalen Aktivitäten erdet.

---

## 9. Ergebnis und Empfehlungen

### 9.1 Empfohlene finale Navigationsstruktur

**Desktop Header:**
```
[VOD Logo]    Auctions    Catalog    Gallery    About    [Search] [Saved] [Cart] [Account]
```

**Mobile Sheet Navigation:**
```
Auctions
Catalog
Gallery                    ← NEU
  > The Collection
  > Exhibitions
  > Listening Room
  > Plan Your Visit
About
-----
Search Catalog
Saved (Badge)
Cart (Badge)
My Account
  > My Bids
  > Won
  > Orders
  > Addresses
  > Settings
```

**Footer — Navigation Section (erweitert):**
```
Navigation          Gallery              Legal
Auctions            The Collection       Impressum
Catalog             Exhibitions          AGB
About               Listening Room       Datenschutz
                    Visit                Widerruf
                                         Cookies
```

### 9.2 Sitemap für den Bereich „VOD Gallery"

```
/gallery
|
+-- /gallery/collection
|   +-- #sound-carriers
|   +-- #printed-matter
|   +-- #artwork-photography
|   +-- #documents-ephemera
|   +-- #rare-collectibles
|
+-- /gallery/exhibitions
|   +-- /gallery/exhibitions/[slug]    (je Ausstellung)
|   +-- (Archiv vergangener Ausstellungen auf der Uebersichtsseite)
|
+-- /gallery/listening-room
|   +-- (Konzept + aktuelles Programm)
|
+-- /gallery/visit
    +-- #opening-hours
    +-- #getting-here
    +-- #coffee
    +-- #contact
```

**SEO-Hinweise:**
- Jede Seite erhält `generateMetadata()` mit spezifischem Title, Description und OG-Image
- Schema.org Markup: `LocalBusiness` + `Museum` + `Store` (Hybrid)
- Ausstellungsseiten: `ExhibitionEvent` Schema
- Gallery-Seiten in `sitemap.ts` aufnehmen
- ISR mit 300s Revalidierung (wie Entity Pages)

### 9.3 Zusammenfassung: Seitenkonzept der Landingpage `/gallery`

| # | Sektion | Typ | Funktion |
|---|---------|-----|----------|
| 1 | Hero (Vollbild-Foto + Headline) | Emotional | Atmosphäre setzen |
| 2 | Einführungstext | Informativ | Verständnis schaffen |
| 3 | Visual Gallery (Foto-Grid) | Emotional | Raum erlebbar machen |
| 4 | The Collection (5 Kategorien) | Informativ | Bandbreite zeigen |
| 5 | Featured Highlights (3-5 Stücke) | Emotional/Transaktional | Begehrlichkeit erzeugen |
| 6 | Current Exhibition | Informativ | Lebendigkeit zeigen |
| 7 | Listening Room | Emotional | Alleinstellung hervorheben |
| 8 | The Experience (5 Module) | Informativ | Möglichkeiten vermitteln |
| 9 | Plan Your Visit | Informativ/Transaktional | Besuch ermöglichen |
| 10 | Closing Statement | Emotional | Nachhall erzeugen |

### 9.4 Empfohlene Content-Module für CMS

Integration in das bestehende CMS-System (`content_block` Tabelle):

| Page | Section | Felder |
|------|---------|--------|
| gallery | hero | title, subtitle, image_url, cta_text, cta_link |
| gallery | introduction | body (richtext) |
| gallery | visual_gallery | images[] (6 URLs + alt-texts) |
| gallery | collection | categories[] (name, description, image_url, anchor) |
| gallery | featured | items[] (title, artist, description, image_url, catalog_link) |
| gallery | exhibition | title, description, date_range, images[], is_current |
| gallery | listening_room | title, body, image_url, current_programme |
| gallery | experience | modules[] (icon, title, description) |
| gallery | visit | hours (richtext), address, contact, map_embed_url |
| gallery | closing | quote |

### 9.5 Abschließende strategische Empfehlung

Die VOD Gallery ist die wichtigste Erweiterung, die vod-auctions.com vornehmen kann — nicht wegen des Umsatzpotenzials (das wird kommen, aber es ist nicht der primäre Treiber), sondern wegen der **Legitimation**.

Ein Online-Auktionshaus für industrielle Musik ist eine von vielen Möglichkeiten, Platten zu kaufen. Ein physischer Ort mit 41.500 Tonträgern, kuratiertem Hörprogramm und der Möglichkeit, Frank Bull persönlich zu treffen, ist **die einzige Möglichkeit, diese Musik so zu erleben**.

Die Gallery macht aus VOD Records das, was The Vinyl Factory für elektronische Musik ist, was Honest Jon's für World Music ist, was Staalplaat für experimentelle Kultur ist: einen Ort, an dem der Unterschied zwischen Archiv, Galerie, Label und Handel aufgehoben ist — weil alles demselben Zweck dient: diese Musik sichtbar, hörbar und greifbar zu machen.

**Die drei wichtigsten nächsten Schritte:**

1. **Professionelle Fotografie.** Der gesamte Gallery-Bereich steht und fällt mit der Bildqualität. Ein halber Tag mit einem Architekturfotografen (Raum, Details, Licht) ist die wichtigste Einzelinvestition.

2. **CMS-Integration.** Die Gallery-Seiten sollten über das bestehende CMS (`content_block`) editierbar sein — insbesondere Featured Highlights, Exhibitions und Listening Room Programme, die sich regelmäßig ändern.

3. **Soft Launch.** Die Gallery-Seite muss nicht mit allen Unterseiten gleichzeitig live gehen. Die Landingpage `/gallery` allein — mit Hero, Einführung, Visual Gallery, Öffnungszeiten und Kontakt — ist bereits ein starkes Statement. Collection, Exhibitions und Listening Room können iterativ folgen.

---

*Dieses Konzept wurde für die VOD Gallery als Teil des vod-auctions.com Ökosystems entwickelt. Es beschreibt die strategische, strukturelle und gestalterische Richtung — die technische Implementierung erfolgt als separater Schritt auf Basis der bestehenden Next.js 16 / Medusa.js Architektur.*
