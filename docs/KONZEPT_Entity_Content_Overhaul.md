# Concept: Qualitative Overhaul of Entity Description Texts

**Created:** 2026-03-22
**Status:** Concept / Pre-Implementation
**Execution Environment:** VPS (72.62.148.205), NOT local
**Scope:** ~17,500 entities (12,451 Artists, 3,077 Labels, 1,983 Press Orgs)

---

## Table of Contents

1. [Analysis of Current Texts](#1-analysis-of-current-texts)
2. [Proposed Content Architecture](#2-proposed-content-architecture)
3. [Data Sources & Enrichment Strategy](#3-data-sources--enrichment-strategy)
4. [Multi-Agent System Concept](#4-multi-agent-system-concept)
5. [VPS Execution Plan](#5-vps-execution-plan)
6. [Effort Estimation](#6-effort-estimation)
7. [TODO Plan](#7-todo-plan)

---

## 1. Analysis of Current Texts

### Current Generation System

The existing system (`scripts/generate_entity_content.py`) uses **Claude Haiku 4.5** with a single generic prompt per entity type. The prompt instructs:

- "Write in an encyclopedic, neutral tone suitable for a music archive/auction platform"
- "Do not invent specific dates, member names, or facts"
- "Be factual"

Context provided to the AI: entity name, release count, and 10 sample releases (title, year, label, format). No genre data, no member data, no external sources.

### Systematic Weaknesses

| Criterion | Current State | Problem |
|-----------|--------------|---------|
| **Interchangeability** | HIGH | A blackened noise project reads the same as a minimal synth band. The enforced "neutral encyclopedic" tone flattens all individuality. |
| **Stylistic Depth** | LOW | Plain factual paragraphs only. No atmospheric language, no scene-specific vocabulary, no evocative writing. |
| **Individuality** | LOW | Template-driven structure: origin -> style -> releases -> influence. Every entity sounds like a Wikipedia stub. |
| **Tonality** | UNIFORM | A power electronics label reads identically to a deep drone ambient label. The prompt enforces sameness. |
| **Journalistic Quality** | MINIMAL | No voice, no perspective, no scene context. Missing: what makes this entity *matter*. |
| **Genre Fit** | ABSENT | The prompt mentions "industrial, experimental, noise, dark ambient" but never instructs the AI to *adapt its tone to the genre*. |
| **SEO Potential** | BASIC | Only `short_description` is populated. No structured keywords, no genre-specific long-tail phrases, no member names, no "sounds like" associations. |
| **Data Completeness** | LOW | Only `description` + `short_description` populated. `genre_tags`, `external_links`, `country`, `founded_year` remain mostly empty. No member data at all. |

### Root Causes

1. **Single-prompt architecture** — One prompt template generates all content regardless of genre, significance, or entity character.
2. **Haiku 4.5 as generator** — Fast and cheap, but lacks the nuance needed for atmospheric, genre-aware writing. Good for factual summaries, insufficient for tone-matched prose.
3. **No genre classification input** — The AI doesn't know if it's writing about a death industrial project or an academic sound art label.
4. **No tone-matching instruction** — The prompt explicitly says "encyclopedic, neutral" — the opposite of what's needed.
5. **No member/personnel data** — The schema has no field for band members, and the prompt says "do not invent member names."
6. **Single data source** — Only 10 sample releases from our own DB. No external context from Discogs, MusicBrainz, Bandcamp, Wikipedia, or other sources.
7. **No quality gate** — Every generated text is auto-published without review.

### What Should Be Checked in Existing Texts

- **Swap test:** Could this text describe another band in the same genre? If yes, it's too generic.
- **Vibe test:** Would a fan of this entity recognize the aesthetic from the description?
- **Fact density:** Are concrete details present (members, years, key releases, scene context)?
- **SEO test:** Does the short_description contain unique, searchable terms?
- **AI-ism check:** Does the text contain phrases like "delve into", "it's worth noting", "tapestry of sound"?

---

## 2. Proposed Content Architecture

### 2.1 Band Descriptions

**Goal:** A text that reads like a well-informed music journalist wrote it — someone who knows the scene, understands the aesthetic, and can convey why this band matters within its specific niche.

**Structure (P1 entities, 300-500 words):**

```
1. OPENING HOOK (1-2 sentences)
   -> Atmospheric, genre-matched opening that captures the essence.

   EXAMPLE (dark ambient):
   "From the fog-laden periphery of Scandinavian experimental music,
   Lustmord carved a sonic territory so deep and inhospitable that it
   redefined what darkness could sound like."

   EXAMPLE (harsh noise):
   "Merzbow doesn't create music -- he detonates it. Since 1979,
   Masami Akita has weaponized feedback, distortion, and sheer volume
   into one of the most prolific and uncompromising bodies of work
   in experimental sound."

   EXAMPLE (minimal synth):
   "Lebanon Hanover exist in the cold blue glow between post-punk
   austerity and darkwave yearning -- two voices, two continents,
   and a deliberate rejection of everything warm."

2. FORMATION & CONTEXT (2-3 sentences)
   -> Who, when, where -- placed within scene context.
   -> Active members listed inline: "Founded by [Name] (vocals,
      electronics) and [Name] (tapes, field recordings)..."

3. SONIC IDENTITY (2-3 sentences)
   -> Genre-matched vocabulary describing their sound.
   -> Concrete sonic references, not abstract labels.
   -> "Sounds like" associations where natural.

4. KEY WORKS & EVOLUTION (2-4 sentences)
   -> Highlight 2-3 pivotal releases from catalog data.
   -> Describe artistic arc (early rawness -> refinement,
      or consistent vision).

5. LEGACY / SCENE POSITION (1-2 sentences)
   -> Label affiliations, scene connections, influence.
   -> What gap they fill in the VOD catalog.

MEMBERS: (structured data block)
   -> Name -- Role(s) -- Active years -- Other projects
```

**P2 entities (150-250 words):** Sections 1+3+4 only, members if known.
**P3 entities (75-120 words):** Sections 1+3 only, factual minimum.

### 2.2 Label Descriptions

**Goal:** Convey the label's curatorial identity — what it stands for aesthetically, who it champions, and what role it plays in the ecosystem.

**Structure (300-500 words for P1):**

```
1. POSITIONING STATEMENT (1-2 sentences)
   -> What this label IS in the scene -- not just "a record label."

   EXAMPLE: "Cold Meat Industry was the cathedral of Scandinavian dark
   ambient -- a label whose catalog defined the genre's golden era."

   EXAMPLE: "Tesco Organisation didn't just release power electronics --
   it codified the genre's visual and sonic language for a generation."

2. FOUNDING & PHILOSOPHY (2-3 sentences)
   -> Who founded it, when, where, with what vision.
   -> Format preferences (tape-only? vinyl purist? unlimited editions?).

3. ROSTER & AESTHETIC (2-3 sentences)
   -> Key artists, genre focus.
   -> What connects the catalog -- a curatorial thread.

4. CATALOG HIGHLIGHTS (2-3 sentences)
   -> Notable releases, series, or catalog landmarks.

5. STATUS & LEGACY (1-2 sentences)
   -> Active/defunct, current relevance, collector market position.
```

### 2.3 Press Org Descriptions

**Goal:** Document the publication's role in the underground press ecosystem.

**Structure (200-400 words for P1):**

```
1. IDENTITY (1-2 sentences)
   -> What type of publication (fanzine, magazine, book publisher),
      who ran it, when.

2. FOCUS & COVERAGE (2-3 sentences)
   -> What scenes/genres, what kind of content (reviews, interviews,
      essays, documentation).

3. NOTABLE CONTRIBUTIONS (1-2 sentences)
   -> Key interviews, special issues, discoveries, controversial takes.

4. LEGACY (1 sentence)
   -> Role in scene documentation, collector value of issues.
```

### 2.4 Tone Mapping Table

The Writer Agent selects tone based on the Profiler Agent's genre classification:

| Genre/Aesthetic | Vocabulary | Sentence Rhythm | Perspective |
|-----------------|-----------|-----------------|-------------|
| **Dark Ambient** | cavernous, glacial, subterranean, ritual, liminal, bottomless | Long, flowing sentences. Slow build. Measured pauses. | Contemplative, reverent |
| **Power Electronics** | confrontational, abrasive, cathartic, visceral, unrelenting | Short, punchy. Staccato. Impact over elegance. | Direct, unflinching |
| **Industrial** | mechanical, relentless, dystopian, percussive, functional | Medium, rhythmic. Factory cadence. Repetitive structures. | Observational, clinical |
| **Noise** | obliterating, saturated, tectonic, ecstatic, total | Run-on cascades OR one-word impacts. | Immersive, experiential |
| **Minimal Synth / Coldwave** | austere, spectral, analog warmth, nocturnal, skeletal | Measured, precise. Cold elegance. | Detached, aesthetic |
| **Experimental / Avant-garde** | exploratory, liminal, process-driven, sculptural, fractal | Variable, reflecting the work itself. | Analytical yet engaged |
| **Neofolk** | archaic, pastoral, ritualistic, stark, elemental | Cadenced, almost literary. | Mythological, invocational |
| **Death Industrial** | corroded, suffocating, terminal, decayed, hostile | Heavy, compressed. Low oxygen. | Witness to collapse |
| **Drone** | infinite, harmonic, tectonic, gravitational, sustained | One long sentence that never fully resolves. | Geological time |
| **EBM / Electro-Industrial** | pulsing, regimented, synthetic, club-ready, angular | Metronomic. Beat-locked prose. | Functional, kinetic |

### 2.5 Musician Database Structure

For future SEO-optimized musician pages (`/musician/[slug]`):

```sql
CREATE TABLE musician (
    id TEXT PRIMARY KEY,               -- mus-{uuid}
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    real_name TEXT,                     -- Legal name if publicly known
    birth_year INTEGER,
    death_year INTEGER,
    country TEXT,
    bio TEXT,                          -- Short bio (AI-generated)
    photo_url TEXT,
    discogs_id INTEGER,               -- Discogs artist ID for this person
    musicbrainz_id TEXT,              -- MusicBrainz artist MBID

    -- SEO
    short_description TEXT,            -- Meta description

    -- Tracking
    data_source TEXT,                  -- 'discogs' | 'musicbrainz' | 'credits' | 'ai' | 'manual'
    confidence DECIMAL(3,2),          -- 0.00-1.00

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE musician_role (
    id TEXT PRIMARY KEY,
    musician_id TEXT REFERENCES musician(id),
    artist_id TEXT REFERENCES "Artist"(id),   -- Band/project in our DB
    role TEXT NOT NULL,                        -- 'vocals', 'electronics', 'guitar', etc.
    active_from INTEGER,                       -- Year joined
    active_to INTEGER,                         -- Year left (NULL = current)
    is_founder BOOLEAN DEFAULT false,

    UNIQUE(musician_id, artist_id, role)
);

-- Cross-project links (musician appears in multiple bands)
CREATE TABLE musician_project (
    id TEXT PRIMARY KEY,
    musician_id TEXT REFERENCES musician(id),
    project_name TEXT NOT NULL,            -- External project name
    project_artist_id TEXT,                -- FK to Artist if project exists in our DB
    role TEXT,
    years TEXT,                            -- e.g. "1982-1995"

    UNIQUE(musician_id, project_name)
);

-- Indexes
CREATE INDEX idx_musician_slug ON musician(slug);
CREATE INDEX idx_musician_discogs ON musician(discogs_id) WHERE discogs_id IS NOT NULL;
CREATE INDEX idx_musician_role_artist ON musician_role(artist_id);
CREATE INDEX idx_musician_role_musician ON musician_role(musician_id);
CREATE INDEX idx_musician_project_musician ON musician_project(musician_id);
```

**Data Sources for Population (in priority order):**
1. Discogs API `/artists/{id}` -> `members[]` + `groups[]` (highest confidence)
2. MusicBrainz API `/artist/{mbid}?inc=artist-rels` -> member relationships
3. Parsed release credits from our DB (medium confidence)
4. AI extraction for well-known acts (lower confidence, flagged for review)
5. Manual curation via Admin UI

---

## 3. Data Sources & Enrichment Strategy

### Beyond Discogs: Comprehensive Source Matrix

The current system uses ONLY our internal release database (10 sample releases) as context for AI generation. This is drastically insufficient. The following sources should be queried to build a rich context package before writing:

### 3.1 Source Overview

| Source | Data Type | Access Method | Rate Limit | Cost | Reliability |
|--------|-----------|---------------|------------|------|-------------|
| **Discogs** | Members, groups, profile text, images, label roster | REST API (token auth) | 60 req/min | Free | HIGH -- best structured data for this niche |
| **MusicBrainz** | Members, relationships, areas, tags, ISRCs, begin/end dates | REST API (no auth) | 1 req/sec | Free | HIGH -- open data, excellent for relationships |
| **Wikidata** | Structured facts, genre IDs, inception dates, country, members | SPARQL / REST API | None | Free | HIGH -- machine-readable, linked data |
| **Wikipedia** | Prose biography, discography, history | REST API / HTML parse | None | Free | MEDIUM -- not all entities have articles, quality varies |
| **Bandcamp** | Active catalog, merch, bio text, tags, location | Web scrape / search | Be polite (2 req/s) | Free | MEDIUM -- only for active artists, no API |
| **Rate Your Music (Sonemic)** | Genre classifications, descriptors, ratings, lists | Web scrape | Aggressive anti-bot | Free | HIGH for genre data -- best genre taxonomy |
| **Last.fm** | Tags, similar artists, listener counts, bio (wiki) | REST API (key) | 5 req/sec | Free | MEDIUM -- biased toward popular acts |
| **AllMusic** | Professional reviews, styles, moods, influences | Web scrape | Be polite | Free | HIGH quality but incomplete for underground |
| **Metal Archives (Encyclopaedia Metallum)** | Members, discography, lyrics, genre, status | REST API (unofficial) | 1 req/3s | Free | HIGH for metal/industrial crossover |
| **Internet Archive** | Archived fanzines, defunct label sites, historical pages | Wayback Machine API | Generous | Free | HIGH for press orgs, defunct labels |
| **Brave Search API** | Current web presence, recent news, social profiles | REST API (key) | 1 req/sec | Free tier: 2000/mo | MEDIUM -- good for discovery |
| **YouTube** | Live performances, interviews, channel presence | Data API v3 | 10,000 units/day | Free | LOW priority -- supplementary |

### 3.2 Source-to-Entity-Type Matrix

| Source | Bands | Labels | Press Orgs | Key Data Points |
|--------|:-----:|:------:|:----------:|-----------------|
| **Discogs** | +++ | +++ | + | Members, groups, label roster, profile, format stats |
| **MusicBrainz** | +++ | ++ | - | Member relationships with dates, area, tags, ISNI |
| **Wikidata** | ++ | + | + | Inception, dissolution, genre QIDs, country, coordinates |
| **Wikipedia** | ++ | + | + | Prose history, often has member lists with sources |
| **Bandcamp** | ++ | ++ | - | Current activity signal, bio, location, tags, pricing |
| **Rate Your Music** | ++ | + | - | Primary/secondary genres, descriptors (harsh, atmospheric, lo-fi) |
| **Last.fm** | ++ | - | - | Similar artists, user-generated tags, play counts |
| **Metal Archives** | + | - | - | Detailed lineup history with dates, side projects |
| **Internet Archive** | + | + | +++ | Archived fanzine pages, defunct label catalogs |
| **Brave Search** | + | + | + | Current web presence, social profiles, recent mentions |

### 3.3 Enrichment Pipeline (per entity)

```
PHASE 1: Internal Data (instant, no API calls)
   -> Release catalog: titles, years, formats, labels, genres
   -> Release credits: parsed roles ("Produced by X", "Mastered at Y")
   -> Related entities: shared labels, compilation appearances
   -> Existing entity_content (if any, for comparison)

PHASE 2: Discogs (primary external source)
   -> GET /artists/{discogs_id} -> profile, members[], groups[], urls[]
   -> GET /labels/{discogs_id} -> profile, sublabels[], urls[]
   -> Already have discogs_id for ~60% of releases -> can resolve artist/label IDs

PHASE 3: MusicBrainz (complementary structured data)
   -> Search: GET /ws/2/artist?query={name}&type=group
   -> Detail: GET /ws/2/artist/{mbid}?inc=artist-rels+url-rels+tags
   -> Yields: member relationships with begin/end dates, area, tags
   -> Disambiguation: use release titles to verify correct match

PHASE 4: Wikidata (structured facts)
   -> SPARQL: SELECT ?item WHERE { ?item rdfs:label "{name}"@en; wdt:P31 wd:Q215380 }
   -> Yields: inception date, dissolution date, genre QIDs, country, coordinates
   -> Genre QIDs resolve to human-readable names via labels

PHASE 5: Wikipedia (prose context)
   -> GET /api/rest_v1/page/summary/{title}
   -> Only if Wikidata has a Wikipedia sitelink
   -> Extract: first 2 paragraphs for context, not for copying
   -> Use as REFERENCE for the Writer, not as source text

PHASE 6: Web Discovery (fill gaps)
   -> Brave Search: "{entity_name} industrial music" or "{label_name} record label"
   -> Extract: Bandcamp URL, social profiles, recent activity signals
   -> Bandcamp scrape (if URL found): bio text, location, active catalog size
   -> Internet Archive (for press orgs): archived fanzine pages, issue scans

PHASE 7: Genre Classification (aggregate)
   -> Merge genre signals from: Discogs styles, MusicBrainz tags,
      RYM genres (if available), Last.fm tags, our own genre/tag tables
   -> Deduplicate and rank by frequency across sources
   -> Result: primary_genre + secondary_genres + descriptors
```

### 3.4 Data Source Confidence & Merging Strategy

When multiple sources provide conflicting data (e.g., different founding years), use this hierarchy:

```
1. MusicBrainz (community-curated, sourced, versioned)     -> confidence 0.95
2. Discogs (community-curated, large dataset)               -> confidence 0.90
3. Wikidata (linked data, often sourced)                    -> confidence 0.85
4. Wikipedia (prose, may be outdated)                        -> confidence 0.75
5. Metal Archives (niche but meticulous)                     -> confidence 0.85
6. Bandcamp (self-reported by artist)                        -> confidence 0.80
7. Last.fm (user-generated tags)                             -> confidence 0.60
8. Brave Search results (variable quality)                   -> confidence 0.50
9. AI knowledge (from training data)                         -> confidence 0.40
```

**Merge Rule:** Highest-confidence source wins. If two sources with confidence >= 0.85 disagree, flag for manual review.

### 3.5 API Key Requirements

| Source | Auth Required | Key Location | Already Available? |
|--------|:------------:|-------------|:------------------:|
| Discogs | Yes (token) | Backend .env `DISCOGS_TOKEN` | YES |
| MusicBrainz | No (User-Agent only) | Set User-Agent header | N/A |
| Wikidata | No | N/A | N/A |
| Wikipedia | No | N/A | N/A |
| Bandcamp | No (scrape) | N/A | N/A |
| Last.fm | Yes (API key) | scripts/.env `LASTFM_API_KEY` | YES (registered 2026-03-22) |
| Brave Search | Yes (API key) | Backend .env `BRAVE_API_KEY` | YES (Blackfire project) |
| YouTube Data API | Yes (API key) | scripts/.env `YOUTUBE_API_KEY` | YES (registered 2026-03-22) |
| Metal Archives | No (unofficial) | N/A | N/A |
| Internet Archive | No | N/A | N/A |

**Last.fm API (registered 2026-03-22):**
- Application: "VOD Auctions", registered to `rseckler`
- API Key + Shared Secret stored in 1Password ("last.fm API Key", Work vault)
- Deployed to VPS: `~/VOD_Auctions/scripts/.env` (`LASTFM_API_KEY`, `LASTFM_SHARED_SECRET`)

**YouTube Data API v3 (registered 2026-03-22):**
- Google Cloud Project: "VOD Auctions", restricted to YouTube Data API v3
- API Key stored in 1Password ("YouTube VOD Auctions API Key", Work vault)
- Deployed to VPS: `~/VOD_Auctions/scripts/.env` (`YOUTUBE_API_KEY`)

**All API keys are now deployed.**

### 3.6 Expected Data Yield per Source

For a typical P1 artist (e.g., "Coil", "SPK", "Nurse With Wound"):

| Source | Expected Hit Rate | Unique Data Contributed |
|--------|:-----------------:|------------------------|
| Internal DB | 100% | Release catalog, credits, label network |
| Discogs | ~85% | Members, groups, profile text, real names |
| MusicBrainz | ~70% | Member dates, area, tags, ISNI, relationships |
| Wikidata | ~50% | Inception/dissolution, genre QIDs, coordinates |
| Wikipedia | ~40% | Prose history, context, sourced claims |
| Bandcamp | ~30% | Active status signal, current bio, location |
| Last.fm | ~60% | Similar artists, listener-generated tags |
| Metal Archives | ~15% | Detailed lineup (only metal-adjacent acts) |

For a typical P3 artist (obscure, 1-2 releases):

| Source | Expected Hit Rate | Notes |
|--------|:-----------------:|-------|
| Internal DB | 100% | Often minimal: 1-2 releases, no credits |
| Discogs | ~40% | May exist but sparse profile |
| MusicBrainz | ~20% | Unlikely for very obscure acts |
| Wikipedia | ~5% | Almost never |
| Bandcamp | ~15% | Some obscure acts self-release here |

**Conclusion:** For P3 entities, the AI must work primarily from internal catalog data + Discogs (if available). The tone and style can still be genre-matched even with sparse factual data -- the Profiler Agent infers genre from release titles, labels, and format patterns.

---

## 4. Multi-Agent System Concept

### Architecture Overview

```
                    +---------------------------+
                    |    ORCHESTRATOR AGENT      |
                    |   (Pipeline Controller)    |
                    +------------+--------------+
                                 |
        +------------------------+------------------------+
        v                        v                         v
  +------------+         +--------------+          +--------------+
  |  ENRICHER  |         |   PROFILER   |          |   MUSICIAN   |
  |   AGENT    |         |    AGENT     |          |   MAPPER     |
  +-----+------+         +------+-------+          +------+-------+
        |                        |                         |
        |                  +-----+------+                  |
        |                  v            v                  |
        |           +----------+  +----------+             |
        |           |  WRITER  |  |   SEO    |             |
        |           |  AGENT   |  |  AGENT   |             |
        |           +----+-----+  +----+-----+             |
        |                |             |                    |
        |                v             v                    |
        |           +-----------------------+               |
        |           |    QUALITY AGENT      |               |
        |           |  (Review + Score)     |               |
        |           +-----------+-----------+               |
        |                       |                           |
        +-----------------------+---------------------------+
                                v
                        +--------------+
                        |  DB WRITER   |
                        |   (Final)    |
                        +--------------+
```

### Agent Definitions

#### Agent 1: ORCHESTRATOR

| Field | Detail |
|-------|--------|
| **Task** | Controls pipeline execution, manages batch processing, handles retries and failures, tracks state |
| **Input** | Entity list (type, ID, priority), batch size, regeneration flags |
| **Output** | Pipeline status, completion metrics, error reports |
| **Decision Authority** | Retry failed entities, skip permanently broken ones, escalate quality failures, pause pipeline if error rate > 20% |
| **Handoff** | Dispatches entities to Enricher -> Profiler -> Writer -> Quality in sequence |

**Key Logic:**
- Processes entities in batches of 50
- Tracks state per entity: `pending -> enriched -> profiled -> drafted -> reviewed -> published`
- Circuit breaker: if >20% of a batch fails quality review, pauses for prompt adjustment
- Resume capability: reads progress from `entity_overhaul_progress.json`
- Signal handling: SIGINT/SIGTERM -> graceful shutdown, save progress

#### Agent 2: ENRICHER

| Field | Detail |
|-------|--------|
| **Task** | Gather all available data about an entity from internal DB + 6-8 external sources |
| **Input** | Entity type + ID |
| **Output** | Enriched data package (JSON) |
| **Decision Authority** | Decides which external APIs to call based on data availability (skip MusicBrainz if no match found, skip Metal Archives for non-metal acts) |
| **Handoff** | Passes enriched package to Profiler Agent + Musician Mapper |

**Data Package Structure:**
```json
{
  "entity": {
    "name": "Coil",
    "slug": "coil-123",
    "country": "United Kingdom",
    "year": "1982"
  },
  "internal": {
    "release_count": 47,
    "earliest_year": 1984,
    "latest_year": 2005,
    "formats": { "LP": 12, "CASSETTE": 28, "CD": 7 },
    "labels_released_on": ["Some Bizzare", "Threshold House", "Eskaton"],
    "sample_releases": [ /* 15-20 releases with full metadata */ ],
    "parsed_credits": [ /* roles extracted from release credits text */ ],
    "related_artists": [ /* from ReleaseArtist + shared labels */ ],
    "genre_tags_internal": [ /* from our Genre/Tag tables */ ]
  },
  "discogs": {
    "profile": "English experimental music group...",
    "members": [
      { "name": "John Balance", "id": 123, "active": true },
      { "name": "Peter Christopherson", "id": 456, "active": true }
    ],
    "groups": [],
    "urls": ["http://www.brainwashed.com/coil/"],
    "styles": ["Industrial", "Ambient", "Experimental", "Noise"]
  },
  "musicbrainz": {
    "mbid": "abc-def-123",
    "type": "Group",
    "area": "London, England",
    "begin": "1982",
    "end": "2004",
    "tags": ["industrial", "experimental", "dark ambient"],
    "member_relations": [
      { "name": "John Balance", "type": "member of band", "begin": "1982", "end": "2004", "attributes": ["vocals"] },
      { "name": "Peter Christopherson", "type": "member of band", "begin": "1982", "end": "2004", "attributes": ["electronics"] }
    ]
  },
  "wikidata": {
    "qid": "Q193710",
    "inception": "1982",
    "dissolution": "2004",
    "genre_qids": [{ "id": "Q183440", "label": "Industrial music" }],
    "country": "United Kingdom",
    "has_wikipedia": true
  },
  "wikipedia": {
    "extract": "Coil were an English experimental music group formed in 1982 by John Balance and Peter 'Sleazy' Christopherson...",
    "url": "https://en.wikipedia.org/wiki/Coil_(band)"
  },
  "bandcamp": {
    "url": null,
    "active": false
  },
  "lastfm": {
    "listeners": 245000,
    "tags": ["industrial", "experimental", "dark ambient", "noise", "psychedelic"],
    "similar_artists": ["Current 93", "Nurse With Wound", "Throbbing Gristle", "Death in June"]
  },
  "web_discovery": {
    "bandcamp_url": null,
    "social_profiles": [],
    "recent_mentions": [],
    "is_active": false
  }
}
```

**Rate Limiting Strategy (sequential per source):**
```
Internal DB:       No limit (local PostgreSQL)
Discogs:           40 req/min (existing rate limiter in shared.py)
MusicBrainz:       1 req/sec (their policy, User-Agent required)
Wikidata:          5 req/sec (generous)
Wikipedia:         Batch via Wikidata sitelinks
Last.fm:           5 req/sec
Brave Search:      1 req/sec
Bandcamp:          2 req/sec (polite scraping)
Internet Archive:  2 req/sec
```

**Estimated enrichment time per entity:** 3-8 seconds (depending on how many sources have data)

#### Agent 3: PROFILER

| Field | Detail |
|-------|--------|
| **Task** | Classify the entity's aesthetic profile, determine tone/style for writing |
| **Input** | Enriched data package from Enricher |
| **Output** | Entity Profile (genre classification, tone directive, key talking points) |
| **Decision Authority** | Selects tone template, determines which aspects to emphasize, picks writing style |
| **Handoff** | Passes profile to Writer Agent + SEO Agent |

**Output Structure:**
```json
{
  "primary_genre": "dark_ambient",
  "secondary_genres": ["ritual", "drone", "psychedelic"],
  "descriptors": ["dense", "ritualistic", "hypnotic", "transgressive"],
  "tone_directive": "contemplative_transgressive",
  "writing_style": "flowing_atmospheric_with_edge",
  "emphasis": ["sonic_identity", "member_dynamics", "occult_dimension", "label_network"],
  "avoid": ["generic_industrial_framing", "wikipedia_tone", "sanitizing_controversial_aspects"],
  "key_talking_points": [
    "Emerged from Throbbing Gristle/Psychic TV lineage",
    "Balance + Christopherson partnership defines the project",
    "Threshold House as self-contained label/world",
    "Range from harsh industrial to devotional ambient",
    "Occult/alchemical practice as integral, not decorative"
  ],
  "active_status": "dissolved",
  "significance_tier": "P1_foundational",
  "similar_entities_for_context": ["Current 93", "Nurse With Wound", "Throbbing Gristle"],
  "member_data": [
    {
      "name": "John Balance",
      "real_name": "Geoffrey Rushton",
      "roles": ["vocals", "lyrics", "concept"],
      "years": "1982-2004",
      "other_projects": ["Psychic TV"],
      "confidence": 0.95,
      "source": "discogs+musicbrainz"
    },
    {
      "name": "Peter Christopherson",
      "real_name": "Peter Christopherson",
      "roles": ["electronics", "production", "visuals"],
      "years": "1982-2004",
      "other_projects": ["Throbbing Gristle", "Psychic TV", "Soisong"],
      "confidence": 0.95,
      "source": "discogs+musicbrainz"
    }
  ]
}
```

**Implementation:** Uses **GPT-4o-mini** (fast, cheap, sufficient for structured classification). The prompt includes the full tone mapping table and instructs the model to classify based on all available data signals.

#### Agent 4: WRITER

| Field | Detail |
|-------|--------|
| **Task** | Generate the actual description text, tone-matched to entity profile |
| **Input** | Enriched data package + Entity Profile from Profiler |
| **Output** | Draft description (structured with sections) + member block |
| **Decision Authority** | Creative control over phrasing, metaphor selection, narrative arc |
| **Handoff** | Passes draft to Quality Agent |

**Implementation:** Uses **GPT-4o** (best creative writing quality in the OpenAI lineup) with a genre-specific system prompt.

**Key Prompt Element -- Tone Injection:**
```
You are writing for VOD Auctions, a specialist platform for industrial and
experimental music vinyl, tapes, and publications. Your audience: collectors,
DJs, scene veterans, and curious newcomers.

Your writing voice for THIS entity is: {tone_directive}.

STYLE RULES FOR "{tone_directive}":
- Vocabulary palette: {descriptors}
- Sentence rhythm: {writing_style}
- Perspective: {perspective from tone mapping table}

ABSOLUTE RULES:
- DO NOT write like Wikipedia or an encyclopedia.
- DO NOT use phrases like "is a band known for", "have been influential in",
  "exploring the boundaries of", "a unique blend of."
- DO NOT begin with "{Name} is a/an..." -- find a more compelling opening.
- DO NOT sanitize. If the music is harsh, say so. If the aesthetic is
  transgressive, acknowledge it. This is underground music, not a press release.
- DO weave member names into the narrative naturally.
- DO reference specific releases from the catalog data.
- DO place the entity in its scene context (geographic, temporal, aesthetic).
- DO use the vocabulary palette -- these words should appear naturally.

WRONG: "Coil was an English experimental music group formed in 1982 by
John Balance and Peter Christopherson. They were known for their
exploration of industrial and ambient music."

RIGHT: "Coil were a rupture in the fabric of post-industrial music --
an alchemical partnership between John Balance and Peter Christopherson
that spent two decades transmuting noise, devotion, and transgression
into some of the most singular recordings the underground has produced."
```

**Few-Shot Examples:** The prompt includes 3-5 pre-written example texts for the assigned tone category. These examples are hand-crafted during the prompt design phase (Phase 4 of implementation) and stored in a `tone_examples/` directory.

#### Agent 5: SEO AGENT

| Field | Detail |
|-------|--------|
| **Task** | Generate SEO-optimized metadata: short_description, genre_tags, keywords |
| **Input** | Entity Profile + Draft description from Writer |
| **Output** | SEO package |
| **Decision Authority** | Keyword selection, meta description phrasing, tag taxonomy |
| **Handoff** | Merges with Writer output for Quality review |

**Output:**
```json
{
  "short_description": "Transgressive English experimental duo. John Balance and Peter Christopherson's alchemical industrial project, active 1982-2004. 47 releases on VOD Auctions.",
  "genre_tags": ["Industrial", "Dark Ambient", "Experimental", "Ritual", "Drone"],
  "seo_keywords": [
    "Coil band discography",
    "Coil industrial music vinyl",
    "John Balance Peter Christopherson",
    "Threshold House records",
    "experimental music collectors"
  ],
  "schema_org_genre": "Experimental"
}
```

**Implementation:** Uses **GPT-4o-mini** (sufficient for structured metadata extraction).

#### Agent 6: MUSICIAN MAPPER

| Field | Detail |
|-------|--------|
| **Task** | Extract, validate, and structure member/personnel data for the musician DB |
| **Input** | Enriched data (discogs members, musicbrainz relations, credits analysis) |
| **Output** | Structured musician records ready for DB insert |
| **Decision Authority** | Confidence threshold: >= 0.70 = auto-insert, 0.40-0.69 = insert with `needs_review` flag, < 0.40 = skip |
| **Handoff** | Passes to DB Writer for `musician` + `musician_role` inserts |

**Source Priority:**
1. MusicBrainz member relations (confidence 0.95 -- has dates, roles, disambiguation)
2. Discogs `members[]` array (confidence 0.90 -- names + IDs)
3. Parsed release credits (confidence 0.70 -- "Vocals by X" patterns)
4. AI inference for well-known acts (confidence 0.50 -- flagged for review)

**Deduplication:** Match musicians across bands by name + Discogs ID + MusicBrainz MBID. A single musician appearing in multiple projects gets ONE `musician` record and multiple `musician_role` entries.

#### Agent 7: QUALITY AGENT

| Field | Detail |
|-------|--------|
| **Task** | Score and validate generated content against quality criteria |
| **Input** | Draft description + Entity Profile + Enriched data |
| **Output** | Quality score (0-100) + specific feedback + accept/reject/revise decision |
| **Decision Authority** | Accept (score >= 75), Revise (50-74, back to Writer with feedback), Reject (< 50, manual queue) |
| **Handoff** | Accept -> DB Writer. Revise -> Writer (max 2 retries). Reject -> manual review queue. |

**Scoring Rubric:**

| Criterion | Weight | What's Checked |
|-----------|--------|----------------|
| **Tone Match** | 25% | Does the writing match the profiled tone directive? Would swapping the tone words break the text? |
| **Factual Grounding** | 20% | Are dates/names/releases verifiable against the enriched data? No hallucinated facts? |
| **Individuality** | 20% | Swap test: would this text only work for THIS entity? Is the opening hook unique? |
| **Structural Completeness** | 15% | All required sections present? Members listed (if data available)? Key releases referenced? |
| **SEO Quality** | 10% | Keywords present? Short_description under 160 chars? Genre tags accurate? |
| **Anti-AI-ism** | 10% | No "delve into", "tapestry of", "it's worth noting", "unique blend", "sonic landscape"? Natural flow? |

**Implementation:** Uses **GPT-4o-mini** with rubric-based evaluation. Returns structured JSON:

```json
{
  "total_score": 82,
  "decision": "accept",
  "scores": {
    "tone_match": 85,
    "factual_grounding": 90,
    "individuality": 75,
    "structural_completeness": 80,
    "seo_quality": 85,
    "anti_ai_ism": 70
  },
  "feedback": [
    "Opening hook is strong but could reference a specific sonic quality",
    "Remove 'sonic landscape' in paragraph 3 -- AI-ism",
    "Member roles could be more specific (change 'electronics' to 'synthesizers, tape manipulation')"
  ],
  "revision_instructions": null
}
```

### Pipeline Flow (per entity)

```
1. Orchestrator selects entity from queue
2. Enricher gathers data from DB + external sources    (~5-10s, API calls)
3. Profiler classifies tone/style/emphasis              (~1s, GPT-4o-mini)
4. Writer + SEO run in PARALLEL                         (~3s GPT-4o + ~1s GPT-4o-mini)
5. Musician Mapper runs in PARALLEL with step 4         (~1s, data merge)
6. Quality Agent reviews combined output                (~1s, GPT-4o-mini)
7. If accepted (>= 75): DB Writer commits all data
   If revision needed (50-74): back to Writer (max 2 retries)
   If rejected (< 50): flagged for manual review
8. Orchestrator logs result, moves to next entity
```

**Per-entity processing time:** ~10-15 seconds (including API calls and AI inference)
**Throughput:** ~240-360 entities/hour (with rate limiting across sources)

---

## 5. VPS Execution Plan

### Environment

All processing runs on the VPS (72.62.148.205), not locally. This ensures:
- Direct database access (no network latency to Supabase)
- Existing Python venv with dependencies (`scripts/venv/`)
- Existing API keys in `.env`
- Process can run overnight/weekends via `nohup` or `screen`
- Logs accessible via `tail -f`

### File Structure on VPS

```
~/VOD_Auctions/scripts/
  entity_overhaul/
    orchestrator.py              # Main entry point + batch controller
    enricher.py                  # Data gathering from all sources
    profiler.py                  # Genre/tone classification
    writer.py                    # Content generation
    seo_agent.py                 # SEO metadata generation
    musician_mapper.py           # Member extraction + dedup
    quality_agent.py             # Scoring + review
    db_writer.py                 # Final DB commit
    config.py                    # API keys, rate limits, thresholds
    tone_mapping.py              # Genre -> tone directive mapping
    tone_examples/               # Hand-crafted example texts per tone
      dark_ambient.txt
      power_electronics.txt
      industrial.txt
      noise.txt
      minimal_synth.txt
      experimental.txt
      neofolk.txt
      death_industrial.txt
      drone.txt
      ebm.txt
    data/
      entity_overhaul_progress.json     # Resume state
      quality_rejects.json              # Manual review queue
      musician_review_queue.json        # Low-confidence musician data
    logs/
      overhaul_YYYYMMDD.log             # Daily log
```

### Execution Commands

```bash
# SSH to VPS
ssh vps

# Navigate
cd ~/VOD_Auctions/scripts

# Install new dependencies (if needed)
source venv/bin/activate
pip3 install musicbrainzngs

# Test run: 10 P1 artists only (dry run)
python3 entity_overhaul/orchestrator.py --type artist --priority P1 --limit 10 --dry-run

# Test run: 10 P1 artists (real, with quality gate)
python3 entity_overhaul/orchestrator.py --type artist --priority P1 --limit 10

# Full P1 run (background, with logging)
nohup python3 entity_overhaul/orchestrator.py --type all --priority P1 \
  >> logs/overhaul_$(date +%Y%m%d).log 2>&1 &

# Monitor progress
tail -f logs/overhaul_$(date +%Y%m%d).log

# Check progress JSON
cat data/entity_overhaul_progress.json | python3 -m json.tool

# Resume after interruption (reads progress file)
python3 entity_overhaul/orchestrator.py --type all --priority P1 --resume

# Run specific priority
python3 entity_overhaul/orchestrator.py --type artist --priority P2

# Force regenerate specific entity
python3 entity_overhaul/orchestrator.py --entity-id legacy-artist-101 --force

# Review quality rejects
cat data/quality_rejects.json | python3 -m json.tool
```

### Resource Considerations

- **Memory:** Enricher holds data for one entity at a time. Peak ~50MB. VPS has 4GB RAM -- no issue.
- **Disk:** Logs + progress files. Minimal. <100MB for full run.
- **Network:** API calls to external sources. VPS has stable connection. Rate limiting prevents bandwidth issues.
- **CPU:** Minimal. All heavy computation is on OpenAI's side (GPT-4o / GPT-4o-mini API calls).
- **Existing services:** Pipeline runs alongside existing PM2 services (backend, storefront). No conflict -- different process, different resources.

### Crontab Integration (post-rollout)

After initial overhaul, new entities (from daily `legacy_sync.py`) should get content automatically:

```bash
# Generate content for new entities (daily, 05:00 UTC, after legacy_sync at 04:00)
0 5 * * * cd ~/VOD_Auctions/scripts && source venv/bin/activate && \
  python3 entity_overhaul/orchestrator.py --new-only --type all \
  >> logs/overhaul_daily.log 2>&1
```

---

## 6. Effort Estimation

### Phase Breakdown

| Phase | Scope | Duration | Dependencies |
|-------|-------|----------|-------------|
| **1. Analysis** | Pull 50 existing texts from DB, score against criteria, document patterns and weaknesses | **1 day** | DB access |
| **2. Conception Refinement** | Finalize tone mapping, structural templates, example texts (3-5 per tone category = 30-50 hand-written examples) | **2-3 days** | Phase 1 insights |
| **3. Data Model** | `musician` + `musician_role` + `musician_project` tables, migration, basic Admin CRUD | **1-2 days** | None |
| **4. Enricher Implementation** | Python module: DB queries + Discogs + MusicBrainz + Wikidata + Wikipedia + Bandcamp + Last.fm + Brave Search + Internet Archive integration | **3-4 days** | API keys |
| **5. Prompt & Agent Design** | Write all agent prompts, configure tone injection, quality rubric, few-shot examples | **2-3 days** | Phase 2 examples |
| **6. Pipeline Implementation** | Orchestrator, all 7 agents, state management, resume capability, logging | **3-4 days** | Phases 4+5 |
| **7. Test Phase** | Run on 100 entities (mixed P1/P2/P3), manual review, iterative prompt tuning | **3-4 days** | Phase 6 |
| **8. P1 Rollout** | ~900 entities, monitor quality, fix edge cases | **2-3 days** | Phase 7 |
| **9. P2+P3 Rollout** | ~16,600 remaining entities | **3-4 days** | Phase 8 stable |
| **10. QA** | Spot-check 5% of generated content, fix outliers, review musician data | **2-3 days** | Phase 9 |

### Total Estimates by Scenario

| Scenario | Entity Count | Working Days | OpenAI API Cost (est.) |
|----------|-------------|:------------:|----------------------:|
| **Small** (P1 only) | ~900 | **10-14 days** | ~$18 |
| **Medium** (P1 + P2) | ~5,000 | **16-22 days** | ~$100 |
| **Full** (all tiers) | ~17,500 | **22-30 days** | ~$350 |

### Cost Breakdown per Entity (OpenAI Hybrid)

**Model Strategy:** GPT-4o for Writer (creative quality), GPT-4o-mini for all other agents (structured tasks).

| Agent | Model | Input Tokens | Output Tokens | Cost/Entity |
|-------|-------|:------------:|:-------------:|:-----------:|
| Profiler | GPT-4o-mini | ~3,000 | ~600 | ~$0.0008 |
| Writer | **GPT-4o** | ~4,000 | ~800 | **~$0.018** |
| SEO | GPT-4o-mini | ~1,500 | ~300 | ~$0.0004 |
| Quality | GPT-4o-mini | ~3,500 | ~500 | ~$0.0008 |
| Musician Mapper | GPT-4o-mini | ~1,000 | ~200 | ~$0.0003 |
| **Subtotal** | | | | **~$0.020** |
| Revision (~30%) | GPT-4o | ~4,000 | ~800 | +$0.005 avg |
| **Effective per entity** | | | | **~$0.020** |

**Pricing (as of 2026-03):**
- GPT-4o: $2.50/1M input, $10.00/1M output
- GPT-4o-mini: $0.15/1M input, $0.60/1M output

External API costs: $0 (all free tiers sufficient for this volume).

**Savings vs. original Claude Sonnet plan:** ~65-70% cheaper ($350 vs. $1,000).

### Critical Path

```
                      Conception (2-3d)
Analysis (1d) ------> Tone Examples ------+
                                          |
Data Model (1-2d) ---------------------->|
                                          v
Enricher (3-4d) ----> Prompt Design ----> Pipeline (3-4d) ----> Test (3-4d)
                        (2-3d)                                      |
                                                                    v
                                                            P1 Rollout (2-3d)
                                                                    |
                                                                    v
                                                            P2+P3 (3-4d) -> QA (2-3d)
```

**Parallelizable:** Data Model can run in parallel with Conception + Enricher.
**Bottleneck:** Test Phase -- this is where prompts get refined. Rushing this produces mediocre results at scale.

### Key Risk: Prompt Quality

The entire system lives or dies on prompt quality. The test phase is where 80% of the creative work happens -- iterating on prompts until output consistently matches the vision. Budget 3-4 days for this, not 1. The wrong approach is to rush to rollout with mediocre prompts.

### Assumptions

1. VPS has stable internet for API calls over multi-day runs
2. Discogs rate limit (40 req/min) is the primary throughput bottleneck
3. ~30% of first drafts will need one revision pass from Quality Agent
4. ~5% will be flagged for manual review (reject or edge cases)
5. Musician data will be incomplete for P3 entities (~40% with no member data)
6. All ~17,500 existing `entity_content` records will be overwritten
7. Admin review capacity: 1-2 hours/day during rollout for QA spot-checks
8. Python dependencies on VPS: `musicbrainzngs` + `openai` (both installed 2026-03-22)
9. OpenAI API key on VPS is active with sufficient credits (~$350 for full run)

---

## 7. TODO Plan

Concrete, actionable task list. All implementation runs on VPS (72.62.148.205).

### Phase 1: Analysis (1 day)

- [ ] **1.1** Pull 50 existing entity_content descriptions from DB (mixed: 20 artists, 15 labels, 15 press orgs; across P1/P2/P3)
- [ ] **1.2** Score each text against the 6 quality criteria (Tone Match, Factual Grounding, Individuality, Structural Completeness, SEO Quality, Anti-AI-ism)
- [ ] **1.3** Document recurring patterns, common weaknesses, and worst offenders
- [ ] **1.4** Identify 10 "golden standard" entities (well-known acts with rich data) to use as benchmark targets
- [ ] **1.5** Write analysis summary with specific before/after examples

### Phase 2: Conception & Tone Examples (2-3 days)

- [ ] **2.1** Finalize tone mapping table (10 genre categories with vocabulary, rhythm, perspective)
- [ ] **2.2** Hand-write 3 example descriptions per tone category (30 total) -- these serve as few-shot examples for the Writer Agent
  - [ ] Dark Ambient (3 examples)
  - [ ] Power Electronics (3 examples)
  - [ ] Industrial (3 examples)
  - [ ] Noise (3 examples)
  - [ ] Minimal Synth / Coldwave (3 examples)
  - [ ] Experimental / Avant-garde (3 examples)
  - [ ] Neofolk (3 examples)
  - [ ] Death Industrial (3 examples)
  - [ ] Drone (3 examples)
  - [ ] EBM / Electro-Industrial (3 examples)
- [ ] **2.3** Write 3 label description examples (different vibes: tape label, vinyl purist, eclectic catalog)
- [ ] **2.4** Write 2 press org description examples (fanzine vs. academic publication)
- [ ] **2.5** Store all examples in `scripts/entity_overhaul/tone_examples/` on VPS
- [ ] **2.6** Define the "anti-pattern" list (banned phrases, AI-isms, generic formulations)

### Phase 3: Data Model -- Musician Database (1-2 days)

- [ ] **3.1** Write SQL migration: `musician`, `musician_role`, `musician_project` tables + indexes + RLS
- [ ] **3.2** Run migration on Supabase (vod-auctions project)
- [ ] **3.3** Add basic Admin API endpoints: `GET/POST /admin/musicians`, `GET /admin/musicians/:id`
- [ ] **3.4** Add basic Admin UI page: `/admin/musicians` (list + search + edit)
- [ ] **3.5** Extend band storefront page (`/band/[slug]`) to display members from musician table
- [ ] **3.6** Add Schema.org `member` property to MusicGroup JSON-LD

### Phase 4: Enricher Implementation (3-4 days)

- [ ] **4.1** Create `scripts/entity_overhaul/` directory structure on VPS
- [ ] **4.2** Implement `config.py` -- load all API keys from `.env`, rate limit settings
- [ ] **4.3** Implement internal DB enricher (release catalog, credits, related entities, genre signals)
- [ ] **4.4** Implement Discogs enricher (artists: profile + members + groups; labels: profile + sublabels)
- [ ] **4.5** Implement MusicBrainz enricher (search + detail with artist-rels, url-rels, tags)
- [ ] **4.6** Implement Wikidata enricher (SPARQL query for structured facts + genre QIDs)
- [ ] **4.7** Implement Wikipedia enricher (summary extraction via REST API, only if Wikidata sitelink exists)
- [ ] **4.8** Implement Last.fm enricher (tags, similar artists, listener counts)
- [ ] **4.9** Implement Brave Search enricher (web presence, Bandcamp URL discovery, social profiles)
- [ ] **4.10** Implement Bandcamp scraper (bio text, location, active catalog -- only if URL found)
- [ ] **4.11** Implement Internet Archive enricher (for press orgs: archived fanzine pages)
- [ ] **4.12** Implement data merge logic (confidence-weighted, conflict detection, dedup)
- [ ] **4.13** Test enricher standalone on 20 entities (5 well-known, 5 mid-tier, 10 obscure)
- [ ] **4.14** Install Python dependencies on VPS venv: `pip3 install musicbrainzngs`

### Phase 5: Prompt & Agent Design (2-3 days)

- [ ] **5.1** Write Profiler Agent prompt (genre classification, tone directive assignment)
- [ ] **5.2** Write Writer Agent system prompt with tone injection mechanism
- [ ] **5.3** Write Writer Agent per-tone prompt variants (referencing tone_examples/)
- [ ] **5.4** Write SEO Agent prompt (short_description, genre_tags, keywords)
- [ ] **5.5** Write Quality Agent prompt with scoring rubric (6 criteria, weighted)
- [ ] **5.6** Write Musician Mapper logic (source priority, confidence thresholds, dedup rules)
- [ ] **5.7** Define revision instruction templates (what the Quality Agent tells the Writer on reject)
- [ ] **5.8** Test each prompt individually on 5 entities via direct Claude API calls
- [ ] **5.9** Iterate prompts based on output quality (expect 2-3 rounds)

### Phase 6: Pipeline Implementation (3-4 days)

- [ ] **6.1** Implement `orchestrator.py` -- batch processing, state management, resume, signal handling
- [ ] **6.2** Implement `profiler.py` -- GPT-4o-mini call with enriched data -> entity profile
- [ ] **6.3** Implement `writer.py` -- GPT-4o call with profile + tone examples -> draft
- [ ] **6.4** Implement `seo_agent.py` -- GPT-4o-mini call -> SEO metadata
- [ ] **6.5** Implement `musician_mapper.py` -- data merge + confidence scoring -> musician records
- [ ] **6.6** Implement `quality_agent.py` -- GPT-4o-mini call -> score + accept/revise/reject
- [ ] **6.7** Implement `db_writer.py` -- upsert entity_content + musician + musician_role
- [ ] **6.8** Implement progress tracking (`entity_overhaul_progress.json`)
- [ ] **6.9** Implement logging (structured, per-entity, with timing)
- [ ] **6.10** Implement retry logic (Writer revision loop, max 2 retries)
- [ ] **6.11** Implement reject queue (`quality_rejects.json` for manual review)
- [ ] **6.12** End-to-end test: run full pipeline on 5 entities, verify DB output

### Phase 7: Test Phase (3-4 days)

- [ ] **7.1** Run pipeline on 100 entities (30 P1 artists, 20 P1 labels, 10 P1 press, 20 P2, 20 P3)
- [ ] **7.2** Manual review of all 100 outputs against quality criteria
- [ ] **7.3** Identify systematic prompt weaknesses (e.g., certain genres always scoring low)
- [ ] **7.4** Iterate prompts: adjust Writer tone, refine Profiler classification, tune Quality thresholds
- [ ] **7.5** Re-run failed/weak entities with adjusted prompts
- [ ] **7.6** Compare new texts side-by-side with old texts for the same entities
- [ ] **7.7** Validate musician data accuracy for 20 well-known acts (cross-check with Discogs/MusicBrainz)
- [ ] **7.8** Performance check: measure throughput (entities/hour), API costs, error rates
- [ ] **7.9** Sign-off: 100 test entities meet quality bar -> proceed to rollout

### Phase 8: P1 Rollout (~900 entities, 2-3 days)

- [ ] **8.1** Run pipeline for all P1 artists (~54 entities with >10 releases)
- [ ] **8.2** Run pipeline for all P1 labels (~50 entities)
- [ ] **8.3** Run pipeline for all P1 press orgs (~20 entities)
- [ ] **8.4** Run pipeline for P1 remaining (~776 entities)
- [ ] **8.5** Spot-check 10% of P1 output (90 entities)
- [ ] **8.6** Review and resolve quality rejects queue
- [ ] **8.7** Review musician data: check `musician_review_queue.json` for low-confidence entries
- [ ] **8.8** Verify storefront rendering: check 20 entity pages on vod-auctions.com

### Phase 9: P2 + P3 Rollout (~16,600 entities, 3-4 days)

- [ ] **9.1** Run pipeline for all P2 entities (~4,100 entities, 3-10 releases each)
- [ ] **9.2** Monitor error rate and quality scores during P2 run
- [ ] **9.3** Run pipeline for all P3 entities (~12,500 entities, 1-2 releases each)
- [ ] **9.4** Spot-check 3% of P2+P3 output (~500 entities)
- [ ] **9.5** Resolve remaining quality rejects

### Phase 10: QA & Finalization (2-3 days)

- [ ] **10.1** Statistical analysis: score distribution, per-genre quality, revision rates
- [ ] **10.2** Fix systematic outliers (if any genre consistently underperforms)
- [ ] **10.3** Review all musician data with confidence < 0.70 (`musician_review_queue.json`)
- [ ] **10.4** Verify SEO impact: check indexed pages in Google Search Console
- [ ] **10.5** Set up daily crontab for new entities (05:00 UTC, after legacy_sync)
- [ ] **10.6** Update CLAUDE.md with new entity_overhaul system documentation
- [ ] **10.7** Archive old `generate_entity_content.py` (keep as reference, rename to `_legacy`)
- [ ] **10.8** Final sign-off

### Status Tracking

| Phase | Status | Started | Completed | Notes |
|-------|--------|---------|-----------|-------|
| 1. Analysis | NOT STARTED | - | - | |
| 2. Conception | NOT STARTED | - | - | |
| 3. Data Model | NOT STARTED | - | - | Can run parallel with Phase 2 |
| 4. Enricher | NOT STARTED | - | - | Depends on API keys (Last.fm: DONE) |
| 5. Prompt Design | NOT STARTED | - | - | Depends on Phase 2 |
| 6. Pipeline | NOT STARTED | - | - | Depends on Phases 4+5 |
| 7. Test | NOT STARTED | - | - | Depends on Phase 6 |
| 8. P1 Rollout | NOT STARTED | - | - | Depends on Phase 7 sign-off |
| 9. P2+P3 Rollout | NOT STARTED | - | - | Depends on Phase 8 |
| 10. QA | NOT STARTED | - | - | Depends on Phase 9 |

### Prerequisites Checklist

- [x] Last.fm API Key registered and deployed to VPS (2026-03-22)
- [x] Discogs API Token available on VPS
- [x] OpenAI API Key deployed to VPS scripts/.env (2026-03-22)
- [x] Brave Search API Key available (Blackfire project)
- [x] YouTube Data API Key registered and deployed to VPS (2026-03-22)
- [x] `musicbrainzngs` 0.7.1 installed on VPS (system-wide, 2026-03-22)
- [x] `openai` 2.29.0 installed on VPS (system-wide, 2026-03-22)
- [ ] OpenAI API credits sufficient (~$350 for full run)
