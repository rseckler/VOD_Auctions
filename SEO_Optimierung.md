# SEO-Optimierung: Entity-Seiten für Bands, Labels & Presse-Organisationen

**Projekt:** VOD Auctions Platform
**Datum:** 2026-03-08
**Autor:** Robin Seckler / Claude
**Status:** Konzept
**Bezug:** KONZEPT.md, RSE-97 (SEO & Meta Tags)

---

## 1. Analyse: Macht das SEO-technisch Sinn?

### 1.1 Eindeutiges Ergebnis: JA

Die Erstellung dedizierter Unterseiten für Bands, Labels und Presse-Organisationen ist eine der **wirkungsvollsten SEO-Maßnahmen** für VOD Auctions. Die Begründung basiert auf mehreren fundierten SEO-Prinzipien:

#### A) Entity-Based SEO (Google-Trend 2025/2026)

Google hat sich von keyword-basiertem Ranking zu **Entity-basiertem Ranking** entwickelt. Entitäten (Bands, Labels, Presseorgane) sind eigenständige "Knowledge-Objekte", die Google versteht und vernetzt. Jede Entity-Seite signalisiert Google:

- "Diese Website ist eine **Autorität** für Industrial Music"
- "Diese Website kennt **Throbbing Gristle**, **Mute Records**, **Industrial Culture Handbook**"
- "Diese Website versteht die **Beziehungen** zwischen Künstlern, Labels und Veröffentlichungen"

> *"Building authority in the modern era means knowing how entities connect, not just how keywords rank."* — [Mastering SEO Entities in 2026](https://wireinnovation.com/mastering-seo-entities/)

#### B) Programmatic SEO — Skalierung durch Templates

Mit **12.451 Artists**, **3.077 Labels** und **1.983 Press-Organisationen** können wir ~17.500 neue indexierbare Seiten generieren — alle aus bestehenden Daten. Das ist **Programmatic SEO** in Reinform:

- Jede Seite zielt auf Long-Tail-Keywords: *"Throbbing Gristle vinyl kaufen"*, *"Mute Records discography"*, *"RE/Search Publications industrial"*
- Template-basierte Generierung = minimaler manueller Aufwand
- Jede neue Seite wird automatisch intern verlinkt

> *"Programmatic SEO for niche marketplaces can generate 100k+ pages that actually rank."* — [Programmatic SEO for Niche Marketplaces](https://www.coinerella.com/programmatic-seo-100k-pages-that-rank/)

#### C) Interne Verlinkung — Das stärkste On-Page-Signal

Aktuell sind Artist/Label-Namen auf Detailseiten **nur Text**, keine Links. Durch Verlinkung entsteht ein **Content-Hub-Modell**:

```
                    Homepage
                   /    |    \
             /catalog  /auctions  /about
               |           |
    ┌──────────┼───────────┼──────────┐
    |          |           |          |
  /band/*   /label/*   /press/*   Release-Detail
    |          |           |        /    |    \
    └──────── Links hin und zurück ──────┘
```

**Effekt:**
- Jede Release-Detailseite verlinkt auf Band, Label, Press → **Link Equity fließt hoch**
- Jede Entity-Seite verlinkt auf alle zugehörigen Releases → **Link Equity fließt runter**
- Google erkennt **thematische Cluster** (Topical Authority)

> *"Dense internal linking—where each model page links to its parts, and each part links back—helps search engines follow these links and pages reinforce each other."* — [Programmatic SEO Internal Linking](https://seomatic.ai/blog/programmatic-seo-internal-linking)

#### D) Wettbewerbs-Benchmark: Discogs

Discogs (624. meistbesuchte Website weltweit) nutzt exakt dieses Modell:
- `/artist/18839-Throbbing-Gristle` → Artist-Seite mit Diskografie
- `/label/521-Mute` → Label-Seite mit Releases
- Jedes Release verlinkt auf Artist und Label

VOD Auctions kann dieses Modell für die **Industrial/Nischen-Nische** replizieren — mit einem entscheidenden Vorteil: **AI-generierte, kuratierte Inhalte** statt nur Datenbank-Listen.

#### E) Quantifizierter SEO-Impact

| Metrik | Aktuell | Nach Implementierung |
|--------|---------|---------------------|
| **Indexierbare Seiten** | ~42.500 (Releases + Blocks + Legal) | ~60.000 (+17.500 Entity-Seiten) |
| **Interne Links pro Release** | 0 Entity-Links | 2-3 Entity-Links (Band, Label, Press) |
| **Long-Tail Keywords** | Nur Release-Titel | +17.500 Entity-Keywords |
| **Topical Authority Signale** | Schwach (flache Struktur) | Stark (Hub-Spoke-Modell) |
| **Sitemap-Einträge** | ~1.010 | ~18.510 |
| **Erwarteter organischer Traffic** | Baseline | +30-60% (konservative Schätzung, 6-12 Monate) |

### 1.2 Risiken und Gegenmaßnahmen

| Risiko | Maßnahme |
|--------|----------|
| **Thin Content** — Seiten ohne Inhalt ranken nicht | AI-Recherche für Hintergründe + CMS für manuelle Pflege |
| **Duplicate Content** — Ähnliche Entity-Seiten | Canonical Tags + einzigartige Beschreibungen pro Entity |
| **Crawl Budget** — 17.500 neue Seiten belasten Googlebot | Priorisierung in Sitemap (Entities mit vielen Releases höher) |
| **Maintenance** — Inhalte veralten | CMS-Editor im Backoffice + periodische AI-Aktualisierung |

### 1.3 Fazit

**Die Maßnahme ist ein klarer SEO-Gewinn.** Die Kombination aus Entity-basiertem SEO, Programmatic SEO und interner Verlinkung ist nach aktuellem Stand (2026) eine der effektivsten Strategien für E-Commerce-Plattformen mit großen Datenbeständen.

---

## 2. URL-Struktur

### 2.1 Gewählte URLs

| Entity | URL-Muster | Beispiel |
|--------|-----------|----------|
| **Bands/Artists** | `vod-auctions.com/band/{slug}` | `/band/throbbing-gristle-101` |
| **Labels** | `vod-auctions.com/label/{slug}` | `/label/mute-records-521` |
| **Presse-Organisationen** | `vod-auctions.com/press/{slug}` | `/press/re-search-publications-42` |

### 2.2 Begründung

- `/band/` statt `/artist/` — konsistent mit Legacy-Datenbank (`3wadmin_tapes_band`) und Nischen-Terminologie
- `/label/` — branchenüblich (Discogs, Bandcamp, MusicBrainz)
- `/press/` — kurz, verständlich, SEO-relevant für Presse/Fanzine-Recherchen
- Slug enthält Name + Legacy-ID für Eindeutigkeit (z.B. `throbbing-gristle-101`)

### 2.3 Übersichtsseiten (optional, Phase 2)

| URL | Zweck |
|-----|-------|
| `/band` | Alle Bands alphabetisch / durchsuchbar |
| `/label` | Alle Labels alphabetisch / durchsuchbar |
| `/press` | Alle Press-Organisationen alphabetisch / durchsuchbar |

Diese Index-Seiten sind sekundär — der primäre Zugang erfolgt über Release-Detailseiten und Suchmaschinen.

---

## 3. Seitenstruktur & Design

### 3.1 Band-Detailseite (`/band/{slug}`)

```
┌─────────────────────────────────────────────────────────┐
│  BAND-SEITE                                              │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  HEADER                                          │    │
│  │  Band-Name (H1)                                  │    │
│  │  Herkunftsland | Aktiv seit | Genre-Tags         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  BESCHREIBUNG (CMS-editierbar)                   │    │
│  │  AI-recherchierter Hintergrund:                  │    │
│  │  - Bandgeschichte                                │    │
│  │  - Stilrichtung & Einfluss                       │    │
│  │  - Bemerkenswerte Mitglieder                     │    │
│  │  - Bedeutung im Industrial-Kontext               │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  DISKOGRAFIE (automatisch aus DB)                │    │
│  │  Tabelle: Cover | Titel | Format | Jahr | Preis │    │
│  │  → Link zu /catalog/{id} für jedes Release       │    │
│  │  Sortierung: Jahr (absteigend)                   │    │
│  │  Filter: Format (Tape/Vinyl/CD)                  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  LITERATURE (falls vorhanden)                    │    │
│  │  Zugehörige band_literature Einträge             │    │
│  │  → Link zu /catalog/{id}                         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  LABELS (automatisch)                            │    │
│  │  Alle Labels, auf denen die Band veröffentlicht  │    │
│  │  → Link zu /label/{slug}                         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  SEO FOOTER (automatisch)                        │    │
│  │  Schema.org MusicGroup Markup                    │    │
│  │  Breadcrumb: Home > Bands > {Band-Name}          │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Label-Detailseite (`/label/{slug}`)

```
┌─────────────────────────────────────────────────────────┐
│  LABEL-SEITE                                             │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  HEADER                                          │    │
│  │  Label-Name (H1)                                 │    │
│  │  Herkunftsland | Gegründet | Genre-Schwerpunkt   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  BESCHREIBUNG (CMS-editierbar)                   │    │
│  │  AI-recherchierter Hintergrund:                  │    │
│  │  - Label-Geschichte & Gründung                   │    │
│  │  - Roster & bemerkenswerte Releases              │    │
│  │  - Stilrichtung & Bedeutung                      │    │
│  │  - Personen hinter dem Label (aus LabelPerson)   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  KATALOG (automatisch aus DB)                    │    │
│  │  Alle Releases dieses Labels                     │    │
│  │  Tabelle: Cover | Artist | Titel | Format | Jahr│    │
│  │  → Links zu /catalog/{id} und /band/{slug}       │    │
│  │  Sortierung: Jahr (absteigend)                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  LITERATURE (falls vorhanden)                    │    │
│  │  Zugehörige label_literature Einträge            │    │
│  │  → Link zu /catalog/{id}                         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  PERSONEN (aus LabelPerson, falls vorhanden)     │    │
│  │  Name, Rolle/Beschreibung                        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  ARTISTS AUF DIESEM LABEL (automatisch)          │    │
│  │  Alle Bands, die auf diesem Label erschienen     │    │
│  │  → Link zu /band/{slug}                          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  SEO FOOTER (automatisch)                        │    │
│  │  Schema.org Organization Markup                  │    │
│  │  Breadcrumb: Home > Labels > {Label-Name}        │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Press-Orga-Detailseite (`/press/{slug}`)

```
┌─────────────────────────────────────────────────────────┐
│  PRESS-ORGA-SEITE                                        │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  HEADER                                          │    │
│  │  Organisation-Name (H1)                          │    │
│  │  Typ (Fanzine/Magazin/Verlag) | Land | Jahr     │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  BESCHREIBUNG (CMS-editierbar)                   │    │
│  │  AI-recherchierter Hintergrund:                  │    │
│  │  - Geschichte der Organisation                   │    │
│  │  - Publikationen & Schwerpunkte                  │    │
│  │  - Bedeutung für die Industrial-Szene            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  PUBLIKATIONEN (automatisch aus DB)              │    │
│  │  Alle press_literature Einträge                  │    │
│  │  Tabelle: Cover | Titel | Format | Jahr          │    │
│  │  → Link zu /catalog/{id}                         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  SEO FOOTER (automatisch)                        │    │
│  │  Schema.org Organization Markup                  │    │
│  │  Breadcrumb: Home > Press > {Org-Name}           │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 4. AI-Recherche der Hintergrundinformationen

### 4.1 Strategie

Für jede Entity wird ein **AI-generierter Hintergrundtext** erstellt und in der Datenbank gespeichert. Dieser Text ist der **Kern des SEO-Werts** — ohne ihn wären die Seiten "Thin Content" und würden nicht ranken.

### 4.2 Recherche-Prozess

```
┌─────────────────────────────────────────────────────┐
│  AI-RECHERCHE-PIPELINE                               │
│                                                      │
│  1. Entity aus DB laden (Name, Land, Jahr)           │
│  2. AI-Prompt mit Kontext:                           │
│     "Schreibe einen informativen Text über           │
│      {Entity} im Kontext von Industrial Music..."    │
│  3. AI generiert: Hintergrund, Geschichte,           │
│     Bedeutung, Stil (200-500 Wörter, Englisch)       │
│  4. Text in DB speichern (entity_content Tabelle)    │
│  5. Admin kann im Backoffice bearbeiten              │
│                                                      │
│  Batch-Verarbeitung:                                 │
│  - Priorität 1: Entities mit >10 Releases (Top 500) │
│  - Priorität 2: Entities mit 3-10 Releases          │
│  - Priorität 3: Rest (1-2 Releases)                  │
│                                                      │
│  Kosten-Schätzung (Claude Haiku 4.5):                │
│  - ~17.500 Entities × ~500 Tokens Output             │
│  - ≈ 8.75M Output Tokens → ~$8.75 einmalig          │
│  - + Input Tokens (Prompt) → ~$2-3                   │
│  - Gesamt: ~$10-15 einmalig                          │
└─────────────────────────────────────────────────────┘
```

### 4.3 AI-Prompt-Template

**Für Bands:**
```
You are a music historian specializing in industrial, experimental, and underground music.
Write a concise, informative description (200-400 words) about the band/artist "{name}".

Include (if applicable):
- Origin and formation history
- Musical style and genre classification
- Notable members or collaborators
- Key releases and their significance
- Influence on industrial/experimental music
- Current status (active/disbanded)

Context: This text will appear on a record auction platform specializing in industrial music.
Write in English. Be factual and encyclopedic in tone.
If you don't have reliable information about this artist, write a shorter generic text
focusing on what can be inferred from the name and context.
```

**Für Labels:**
```
You are a music historian specializing in industrial, experimental, and underground music labels.
Write a concise, informative description (200-400 words) about the record label "{name}".

Include (if applicable):
- Founding year, location, and founders
- Musical focus and roster
- Notable releases and catalog highlights
- Significance in the industrial/experimental scene
- Current status (active/defunct)
- Distribution and format preferences (vinyl, cassette, CD)

Context: This text will appear on a record auction platform.
Write in English. Be factual and encyclopedic in tone.
```

**Für Press-Organisationen:**
```
You are a music historian specializing in industrial and underground music publications.
Write a concise, informative description (200-400 words) about the publication/organization "{name}".

Include (if applicable):
- Type (fanzine, magazine, book publisher, documentation project)
- Founding and key people involved
- Content focus and notable issues/editions
- Significance for the industrial/underground music documentation
- Current status

Context: This text will appear on a record auction platform.
Write in English. Be factual and encyclopedic in tone.
```

### 4.4 Priorisierung

| Priorität | Kriterium | Anzahl (geschätzt) | AI-Recherche |
|-----------|-----------|-------------------|--------------|
| **P1 — Hoch** | Entities mit >10 Releases | ~500 | Sofort, ausführlich (400 Wörter) |
| **P2 — Mittel** | Entities mit 3-10 Releases | ~2.000 | Batch, standard (200 Wörter) |
| **P3 — Niedrig** | Entities mit 1-2 Releases | ~15.000 | Batch, kurz (100 Wörter) oder generisch |

**P1-Entities** bringen den meisten SEO-Wert, da sie die meisten internen Links haben und die relevantesten Suchanfragen bedienen.

---

## 5. CMS / Backoffice-Integration

### 5.1 Neue Datenbank-Tabelle: `entity_content`

```sql
CREATE TABLE entity_content (
    id TEXT PRIMARY KEY,                    -- ULID (Medusa-Pattern)
    entity_type TEXT NOT NULL,              -- 'artist' | 'label' | 'press_orga'
    entity_id TEXT NOT NULL,                -- FK zu Artist.id / Label.id / PressOrga.id

    -- CMS Content (editierbar im Backoffice)
    description TEXT,                       -- Haupttext (AI-generiert, manuell editierbar)
    short_description TEXT,                 -- Kurzbeschreibung für Meta/Listing (max 300 Zeichen)

    -- Zusätzliche Metadaten (editierbar)
    country TEXT,                           -- Herkunftsland
    founded_year TEXT,                      -- Gründungsjahr
    genre_tags TEXT[],                      -- Genre-Tags (Array)
    external_links JSONB,                   -- { website, discogs, bandcamp, wikipedia }

    -- Status
    is_published BOOLEAN DEFAULT false,     -- Nur published Seiten sind öffentlich
    ai_generated BOOLEAN DEFAULT false,     -- Marker: AI-generiert oder manuell
    ai_generated_at TIMESTAMPTZ,            -- Wann AI-Text generiert wurde

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(entity_type, entity_id)
);

-- Indexes
CREATE INDEX idx_entity_content_type ON entity_content(entity_type);
CREATE INDEX idx_entity_content_entity ON entity_content(entity_id);
CREATE INDEX idx_entity_content_published ON entity_content(is_published);

-- RLS
ALTER TABLE entity_content ENABLE ROW LEVEL SECURITY;
```

### 5.2 Admin-API Endpoints

```
Backend API (Auth required):

GET    /admin/entity-content                     -- Liste aller Entity-Contents (mit Filter)
       ?entity_type=artist|label|press_orga
       ?is_published=true|false
       ?has_content=true|false
       ?q=suchtext
       &page=1&limit=50

GET    /admin/entity-content/:type/:entityId     -- Detail + Entity-Daten
POST   /admin/entity-content/:type/:entityId     -- Erstellen / Aktualisieren (Upsert)
DELETE /admin/entity-content/:type/:entityId     -- Löschen

POST   /admin/entity-content/generate            -- AI-Recherche triggern
       { entity_type, entity_id }                -- Einzeln
       { entity_type, batch: true, priority: 1 } -- Batch für Prioritätsstufe
```

### 5.3 Store-API Endpoints (Public)

```
Store API (Publishable Key required):

GET /store/band/:slug                            -- Band-Detailseite
    → entity_content + Releases + Literature + Labels

GET /store/label/:slug                           -- Label-Detailseite
    → entity_content + Releases + Literature + Artists + LabelPersons

GET /store/press/:slug                           -- Press-Orga-Detailseite
    → entity_content + Literature
```

### 5.4 Admin-UI: Entity Content Editor

Neue Seite im Admin-Dashboard: **`/admin/entity-content`**

```
┌─────────────────────────────────────────────────────────┐
│  ENTITY CONTENT MANAGEMENT                               │
│                                                          │
│  Tabs: [All] [Bands] [Labels] [Press]                   │
│                                                          │
│  Filter: [Has Content ▼] [Published ▼] [🔍 Search...]   │
│                                                          │
│  Stats: 500/12.451 Bands | 200/3.077 Labels | 100/1.983 │
│         mit Content        mit Content        mit Content│
│                                                          │
│  ┌─────┬──────────────────┬────────┬───────┬──────────┐ │
│  │ Typ │ Name             │ Status │ Rel.  │ Actions  │ │
│  ├─────┼──────────────────┼────────┼───────┼──────────┤ │
│  │ 🎸  │ Throbbing Gristle│ ✅ Pub │  47   │ Edit     │ │
│  │ 🎸  │ Einstürzende NB  │ ✅ Pub │  38   │ Edit     │ │
│  │ 💿  │ Mute Records     │ ⚡ AI  │  125  │ Edit     │ │
│  │ 💿  │ Some Bizzare     │ ❌ Leer│  23   │ Generate │ │
│  │ 📰  │ RE/Search        │ ✅ Pub │  12   │ Edit     │ │
│  └─────┴──────────────────┴────────┴───────┴──────────┘ │
│                                                          │
│  [Generate AI Content for P1] [Generate for P2]         │
│  [Publish All with Content]                              │
└─────────────────────────────────────────────────────────┘
```

**Entity Content Detail-Editor:**

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to List                                          │
│                                                          │
│  THROBBING GRISTLE                          [🔗 View]   │
│  Band | 47 Releases | ID: legacy-artist-101              │
│                                                          │
│  ┌── Metadata ──────────────────────────────────────┐   │
│  │ Country:     [United Kingdom    ]                 │   │
│  │ Founded:     [1976              ]                 │   │
│  │ Genre Tags:  [Industrial] [Noise] [Experimental] │   │
│  │ External Links:                                   │   │
│  │   Wikipedia: [https://en.wiki.../Throbbing_...]   │   │
│  │   Discogs:   [https://discogs.com/artist/18839]   │   │
│  │   Bandcamp:  [                                ]   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌── Short Description (max 300 chars) ─────────────┐   │
│  │ Throbbing Gristle were a pioneering English       │   │
│  │ industrial music group, widely regarded as the    │   │
│  │ founders of the industrial music genre.           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌── Description (Rich Text Editor — TipTap) ───────┐   │
│  │ [B] [I] [H2] [H3] [Link] [List] [Quote]          │   │
│  │                                                    │   │
│  │ Throbbing Gristle (TG) were an English music      │   │
│  │ and visual arts group formed in 1975 in Hull...   │   │
│  │                                                    │   │
│  │ [AI-generated badge if applicable]                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌── Preview: Releases on this page ────────────────┐   │
│  │ (read-only, automatisch aus DB)                   │   │
│  │ 47 Releases: D.o.A. (1978), 20 Jazz Funk...     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Published: [Toggle ✅]    AI Generated: [Badge ⚡]     │
│                                                          │
│  [💾 Save] [🤖 Regenerate AI] [🗑 Delete Content]       │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Verlinkung auf Artikelseiten

### 6.1 Aktuelle Situation

Auf den Release-Detailseiten (`/catalog/[id]` und `/auctions/[slug]/[itemId]`) werden Band, Label und Press-Orga aktuell als **reiner Text** angezeigt:

```tsx
// Aktuell (catalog/[id]/page.tsx):
<p className="text-muted-foreground text-lg">
  {release.artist_name || "Unknown Artist"}
</p>
```

### 6.2 Gewünschte Änderung

Alle Entity-Referenzen werden zu **klickbaren Links**, die auf die jeweilige Entity-Seite verweisen:

```tsx
// Neu:
<Link href={`/band/${release.artist_slug}`} className="text-muted-foreground text-lg hover:text-primary transition-colors">
  {release.artist_name || "Unknown Artist"}
</Link>
```

### 6.3 Betroffene Stellen

| Datei | Element | Änderung |
|-------|---------|----------|
| `storefront/src/app/catalog/[id]/page.tsx` | Artist-Name (Header) | Text → Link zu `/band/{slug}` |
| `storefront/src/app/catalog/[id]/page.tsx` | Label-Name (Badge) | Text → Link zu `/label/{slug}` |
| `storefront/src/app/catalog/[id]/page.tsx` | PressOrga-Name | Text → Link zu `/press/{slug}` |
| `storefront/src/app/auctions/[slug]/[itemId]/page.tsx` | Artist-Name (Header) | Text → Link zu `/band/{slug}` |
| `storefront/src/app/auctions/[slug]/[itemId]/page.tsx` | Label-Name (Badge) | Text → Link zu `/label/{slug}` |
| `storefront/src/components/CatalogRelatedSection.tsx` | Artist-Tab / Label-Tab Headers | Text → Link |
| `storefront/src/components/RelatedSection.tsx` | Artist-Tab / Label-Tab Headers | Text → Link |
| `storefront/src/app/catalog/page.tsx` | Katalog-Liste: Artist-Spalte | Text → Link zu `/band/{slug}` |

### 6.4 Backend-Anpassung

Die Store-APIs müssen zusätzlich den **Slug** für Artist, Label und PressOrga zurückgeben:

```sql
-- Aktuell:
SELECT Artist.name as artist_name, Label.name as label_name

-- Neu (zusätzlich):
SELECT
  Artist.name as artist_name,
  Artist.slug as artist_slug,
  Label.name as label_name,
  Label.slug as label_slug,
  PressOrga.name as pressorga_name,
  PressOrga.slug as pressorga_slug
```

Betroffen:
- `GET /store/catalog` (Liste) — artist_slug, label_slug hinzufügen
- `GET /store/catalog/:id` (Detail) — artist_slug, label_slug, pressorga_slug hinzufügen
- `GET /store/auction-blocks/:slug/items/:itemId` — artist_slug, label_slug hinzufügen

---

## 7. SEO-Technische Umsetzung

### 7.1 Meta Tags (generateMetadata)

```tsx
// /band/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const band = await fetchBand(params.slug)
  return {
    title: `${band.name} — Discography & Releases`,
    description: band.short_description || `Browse ${band.release_count} releases by ${band.name} on VOD Auctions. Industrial music vinyl, cassettes, and more.`,
    openGraph: {
      title: `${band.name} — VOD Auctions`,
      description: band.short_description,
      type: 'profile',
    },
  }
}
```

### 7.2 Schema.org Structured Data

**Band-Seiten:**
```json
{
  "@context": "https://schema.org",
  "@type": "MusicGroup",
  "name": "Throbbing Gristle",
  "foundingDate": "1975",
  "foundingLocation": { "@type": "Place", "name": "Hull, England" },
  "genre": ["Industrial", "Noise", "Experimental"],
  "description": "...",
  "url": "https://vod-auctions.com/band/throbbing-gristle-101",
  "sameAs": ["https://www.discogs.com/artist/18839", "https://en.wikipedia.org/wiki/Throbbing_Gristle"]
}
```

**Label-Seiten:**
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Mute Records",
  "foundingDate": "1978",
  "description": "...",
  "url": "https://vod-auctions.com/label/mute-records-521"
}
```

### 7.3 Sitemap-Erweiterung

```typescript
// sitemap.ts — Erweiterung
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // ... bestehende Einträge ...

  // Entity-Seiten (nur published)
  const bands = await fetchPublishedEntities('artist')
  const labels = await fetchPublishedEntities('label')
  const pressOrgs = await fetchPublishedEntities('press_orga')

  const bandEntries = bands.map(b => ({
    url: `https://vod-auctions.com/band/${b.slug}`,
    lastModified: b.updated_at,
    changeFrequency: 'weekly' as const,
    priority: b.release_count > 10 ? 0.7 : 0.5,
  }))

  // ... analog für labels und press ...

  return [...existing, ...bandEntries, ...labelEntries, ...pressEntries]
}
```

### 7.4 Breadcrumbs

Alle Entity-Seiten erhalten Breadcrumbs für bessere Navigation und SEO:

```
Home > Bands > Throbbing Gristle
Home > Labels > Mute Records
Home > Press > RE/Search Publications
```

### 7.5 Canonical URLs

Jede Entity-Seite hat eine kanonische URL:
```html
<link rel="canonical" href="https://vod-auctions.com/band/throbbing-gristle-101" />
```

### 7.6 noindex für leere Seiten

Entities **ohne Content** (`is_published = false`) werden mit `noindex` gerendert oder geben 404 zurück, um Thin-Content-Abstrafung zu vermeiden.

---

## 8. Implementierungsplan

### Phase 1: Infrastruktur (1-2 Tage)

| # | Task | Aufwand |
|---|------|---------|
| 1.1 | DB-Tabelle `entity_content` anlegen (Migration) | 1h |
| 1.2 | Admin-API: CRUD für entity_content | 3h |
| 1.3 | Store-API: `/store/band/:slug`, `/store/label/:slug`, `/store/press/:slug` | 4h |
| 1.4 | Backend: artist_slug, label_slug, pressorga_slug in bestehende APIs aufnehmen | 2h |

### Phase 2: AI-Content-Generierung (1 Tag)

| # | Task | Aufwand |
|---|------|---------|
| 2.1 | Python-Script: `generate_entity_content.py` (Claude Haiku Batch) | 3h |
| 2.2 | P1-Entities generieren (~500 Entities mit >10 Releases) | 1h (Laufzeit) |
| 2.3 | P2-Entities generieren (~2.000 Entities mit 3-10 Releases) | 2h (Laufzeit) |
| 2.4 | P3-Entities generieren (~15.000 Rest) | 4h (Laufzeit) |
| 2.5 | Quality-Check: Stichprobe 50 Entities manuell prüfen | 1h |

### Phase 3: Storefront-Seiten (1-2 Tage)

| # | Task | Aufwand |
|---|------|---------|
| 3.1 | `/band/[slug]/page.tsx` — Band-Detailseite | 4h |
| 3.2 | `/label/[slug]/page.tsx` — Label-Detailseite | 4h |
| 3.3 | `/press/[slug]/page.tsx` — Press-Orga-Detailseite | 3h |
| 3.4 | SEO: generateMetadata, Schema.org, Breadcrumbs | 2h |
| 3.5 | Sitemap-Erweiterung | 1h |

### Phase 4: Verlinkung & Admin-UI (1 Tag)

| # | Task | Aufwand |
|---|------|---------|
| 4.1 | Catalog/Auction-Detailseiten: Text → Links | 2h |
| 4.2 | CatalogRelatedSection + RelatedSection: Links | 1h |
| 4.3 | Katalog-Liste: Artist-Spalte verlinken | 1h |
| 4.4 | Admin-UI: Entity Content Editor (`/admin/entity-content`) | 4h |
| 4.5 | Admin-UI: AI-Generate-Button + Batch-Trigger | 2h |

### Phase 5: Deploy & Monitoring (halber Tag)

| # | Task | Aufwand |
|---|------|---------|
| 5.1 | VPS Deploy (Backend + Storefront) | 1h |
| 5.2 | Google Search Console: Sitemap resubmit | 0.5h |
| 5.3 | Monitoring: Indexierung prüfen (nach 1-2 Wochen) | Laufend |

### Gesamt-Aufwand: ~4-6 Tage

### Geschätzte Kosten

| Posten | Kosten |
|--------|--------|
| AI-Content-Generierung (Claude Haiku 4.5) | ~$10-15 einmalig |
| Entwicklungszeit | 4-6 Tage |
| Laufende Kosten | $0 (alles auf bestehendem VPS) |

---

## 9. Erwartete Ergebnisse

### Kurzfristig (1-3 Monate)
- ~17.500 neue indexierbare Seiten
- Google beginnt Entity-Seiten zu crawlen und zu indexieren
- Interne Verlinkung verbessert Crawl-Effizienz für bestehende Release-Seiten

### Mittelfristig (3-6 Monate)
- Long-Tail-Keywords beginnen zu ranken (*"Throbbing Gristle vinyl buy"*, *"Mute Records catalog"*)
- Organischer Traffic +20-40%
- Verbesserte Topical Authority für "Industrial Music" Cluster

### Langfristig (6-12 Monate)
- Entity-Seiten werden zu Landing Pages für Sammler
- Organischer Traffic +30-60%
- VOD Auctions wird als **Autorität** für Industrial Music Records wahrgenommen
- Potenzial für Featured Snippets und AI Overviews

---

## 10. Quellen & Referenzen

- [Mastering SEO Entities in 2026](https://wireinnovation.com/mastering-seo-entities/) — Entity-Based SEO Guide
- [Semantic SEO in 2026: A Complete Guide](https://niumatrix.com/semantic-seo-guide/) — Entity SEO Fundamentals
- [Programmatic SEO Internal Linking](https://seomatic.ai/blog/programmatic-seo-internal-linking) — Internal Linking Strategies
- [Programmatic SEO for Niche Marketplaces](https://www.coinerella.com/programmatic-seo-100k-pages-that-rank/) — 100k+ Pages Strategy
- [E-Commerce SEO Best Practices 2026](https://www.smamarketing.net/blog/e-commerce-seo-best-practices) — Structured Data & E-E-A-T
- [Entity-Based SEO — Neil Patel](https://neilpatel.com/blog/entity-based-seo/) — Entity SEO Fundamentals
- [Discogs Traffic Analytics](https://www.similarweb.com/website/discogs.com/) — Competitor Benchmark
