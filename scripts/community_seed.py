#!/usr/bin/env python3
"""VOD Community — demo content seeder (Rebuild Plan R0).

Loads a realistic, flag-gated demo dataset into the live community_* tables so
the Community surface can be experienced and QA'd before real content exists.

Every demo row is authored by a demo profile whose id carries the prefix
``cmpro_demo_``. The backend read routes hide all such content unless the
COMMUNITY_DEMO feature flag is ON (see backend/src/lib/community.ts). The
dataset is therefore invisible on production by default and fully removable.

Usage:
    venv/bin/python3 community_seed.py --load     # purge + insert (idempotent)
    venv/bin/python3 community_seed.py --purge    # remove all demo rows
    venv/bin/python3 community_seed.py --load --dry-run

Requires SUPABASE_DB_URL in VOD_Auctions/.env.

Demo marking: id-prefix convention — NO schema change, NO replica DDL.
  community_profile.id  → cmpro_demo_<key>
  community_post.id     → cmpst_demo_<nnn>
  community_comment.id  → cmcmt_demo_<nnn>
  community_review.id   → cmrev_demo_<nnn>
  community_reaction.id → cmrea_demo_<nnn>
"""
import argparse
import json
import os
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DEMO_PREFIX = "cmpro_demo_"
NOW = datetime.now(timezone.utc)
RNG = random.Random(20260516)  # deterministic — reproducible seed runs

REACTIONS = ["🔥", "❤️", "🤘", "👀", "💯", "🙏", "⚡"]


# ─── Demo members ───────────────────────────────────────────────────────────
# key, display_name, location, collector_since, tier, is_curator, bio, links
MEMBERS = [
    ("frank", "Frank Maier", "Pratteln, CH", 2003, "curator", True,
     "Founder of Vinyl on Demand. Building the archive since 2003. The voice "
     "behind every Dispatch from the Vault.",
     {"website": "https://vinyl-on-demand.com"}),
    ("zko", "DiscoveredZkoIn1989", "Berlin, DE", 2009, "gold", False,
     "Industrial & tape underground since the 90s. Focus on Z'EV, Maurizio "
     "Bianchi, early ZKO. I don't trade — I only buy.",
     {"discogs": "https://www.discogs.com/user/demo", "bandcamp": "https://bandcamp.com"}),
    ("tape", "TapeUndergroundDe", "Cologne, DE", 2014, "silver", False,
     "West German tape underground. I compare pressings and document inner "
     "sleeves nobody else photographs.",
     {"discogs": "https://www.discogs.com/user/demo"}),
    ("noise", "NoiseAndArchive", "Vienna, AT", 2011, "silver", False,
     "Viennese noise-scene archive. Garrard 401 and a drawer of original styli.",
     {"soundcloud": "https://soundcloud.com"}),
    ("prague", "IndustrialPragueOG", "Prague, CZ", 2018, "bronze", False,
     "Industrial in Prague since 2018. Boyd Rice / NON focus. Still learning, "
     "still digging.",
     {}),
    ("mb", "MaurizioForever", "Milan, IT", 2007, "platinum", False,
     "Maurizio Bianchi bibliography in progress. I collect pressings made "
     "before 1985 and nothing after.",
     {"website": "https://example.com/mb", "discogs": "https://www.discogs.com/user/demo"}),
    ("ukpe", "PowerElectronicsUK", "Manchester, UK", 2005, "gold", False,
     "Power electronics, Come Org, Broken Flag. Twenty years deep and the "
     "shelves are still not full.",
     {"bandcamp": "https://bandcamp.com"}),
    ("jp", "CassetteCultureJP", "Osaka, JP", 2013, "silver", False,
     "Japanese cassette culture, Vanity / Telegraph era. Trading scans, not "
     "tapes.",
     {"website": "https://example.com/jp"}),
    ("arch", "ZkoArchivist", "Hamburg, DE", 2010, "gold", False,
     "Trying to catalogue every ZKO box completely. Spreadsheets are a "
     "lifestyle.",
     {"discogs": "https://www.discogs.com/user/demo"}),
    ("fr", "DeathIndustrialFR", "Lyon, FR", 2019, "bronze", False,
     "Death industrial and martial fringe. New to the proper collecting side.",
     {}),
    ("nl", "AnalogTapeHead", "Rotterdam, NL", 2012, "silver", False,
     "Reel-to-reel obsessive. If it was dubbed on a TEAC I want to hear it.",
     {"soundcloud": "https://soundcloud.com"}),
    ("us", "NoiseFloorUS", "Portland, US", 2020, "bronze", False,
     "American latecomer to the European tape underground. Grateful for every "
     "re-issue.",
     {}),
]

# ─── Editorials (Frank, kind='editorial') ───────────────────────────────────
# title, tags, body_html
EDITORIALS = [
    ("From the Vault № 43: The ZKO Tape Era 1984–1986",
     ["zko", "tape-culture", "archive-find", "z-ev"],
     "<p>In autumn 1984 Z'EV sent two cassettes to Frank Tovey in West Berlin. "
     "One of them was officially released as ZKO 005. The other — the one "
     "collectors have whispered about for years — was considered lost. "
     "Until this February, while systematically sorting Cosey's correspondence, "
     "a handwritten note surfaced: <em>„W-Mic, B-side, do not destroy.“</em></p>"
     "<p>What we can now say with certainty: the second tape exists, dates to "
     "no later than November 1984, and was recorded with a Walther studio "
     "microphone.</p>"
     "<h2>The provenance</h2>"
     "<p>The trail runs through three stations: Cosey's Pratteln archive, "
     "Genesis P.'s correspondence with Frank Tovey, and Z'EV's own recording "
     "log.</p>"
     "<blockquote>Frank's handwriting on the sleeve was unmistakable. It took "
     "three hours to line the dating up against the travel diary.</blockquote>"
     "<p>Part two next week: the B-side material itself.</p>"),
    ("Re-Discovered: A Forgotten Maurizio Bianchi Recording",
     ["maurizio-bianchi", "re-issue", "archive-find"],
     "<p>A test pressing with no sleeve and a label hand I had never seen "
     "before. Two weeks of sorting later, here is what the archive gave up "
     "about Bianchi in 1983.</p>"
     "<p>The acetate had been filed under the wrong year for nearly four "
     "decades. The give-away was the matrix scratch — a numbering system "
     "Bianchi only used for a handful of months.</p>"
     "<h2>Why it matters</h2>"
     "<p>It reframes the gap between <em>Symphony for a Genocide</em> and what "
     "everyone assumed was silence. There was no silence. There was a tape "
     "nobody had heard.</p>"),
    ("Why Industrial Was Never Dance Music — A Retrospective",
     ["industrial", "power-electronics", "essay"],
     "<p>Every few years someone re-frames early industrial as a precursor to "
     "techno. It is a tidy story and it is wrong.</p>"
     "<p>The tape underground was built on refusal — of the club, of the "
     "groove, of the body as a unit of rhythm. To hear <em>Pagan Muzak</em> as "
     "proto-dance is to mishear it entirely.</p>"
     "<h2>The refusal</h2>"
     "<p>What the early labels shared was not a sound but a posture. The "
     "format itself — the cassette, dubbed in editions of forty — was "
     "the argument.</p>"),
    ("Inside the Archive: Two Weeks Sorting Vortex Campaign",
     ["zko", "archive-find", "vortex-campaign"],
     "<p>Two weeks, one shelf, and a box marked only with a year. What sorting "
     "Vortex Campaign material taught me about how a label actually remembers "
     "itself.</p>"
     "<p>The catalogue numbers lie. Not maliciously — they were assigned by "
     "intention, then overtaken by reality. Three releases share the same "
     "number because the first two never shipped.</p>"
     "<blockquote>An archive is not a record of what happened. It is a record "
     "of what someone decided to keep.</blockquote>"),
    ("From the Vault № 41: NON — Pagan Muzak and the Myth of the First Pressing",
     ["non", "first-pressing", "boyd-rice"],
     "<p>There is no such thing as <em>the</em> first pressing of Pagan Muzak. "
     "There are several firsts, and the collector market has quietly agreed to "
     "forget that.</p>"
     "<p>The locked grooves were cut differently across runs. I have three "
     "copies here. None of them agree.</p>"
     "<h2>What a first pressing is for</h2>"
     "<p>We want the first pressing because we want to stand closest to the "
     "moment. But the moment, in this case, was deliberately un-fixed.</p>"),
    ("The Tape Underground of West Germany, 1983–1987",
     ["tape-culture", "industrial", "germany"],
     "<p>Before the labels had names worth printing, there was a postal "
     "network. This is a map of it — incomplete, like all such maps.</p>"
     "<p>Cassettes moved between roughly twenty addresses. The releases we "
     "now treat as canonical are simply the nodes that kept the best records.</p>"
     "<h2>The postal logic</h2>"
     "<p>Edition sizes were set by how many blank tapes a person could afford "
     "that month. Scarcity was not a marketing decision. It was arithmetic.</p>"),
]

# ─── Discussion posts ───────────────────────────────────────────────────────
# author_key, title, tags, anchor (True = attach a release), body_html
POSTS = [
    ("zko", "Finally found it after 12 years of searching",
     ["archive-find", "first-pressing"], True,
     "<p>After twelve years of searching I finally landed my first copy of an "
     "original 1985 ZKO tape. Won it out of the last block. The sound is "
     "rougher than I expected — and that is exactly the point.</p>"
     "<p>Holding it next to the re-issue, the difference is not quality. It is "
     "<em>temperature</em>.</p>"),
    ("tape", "Comparing two pressings of the same re-issue",
     ["re-issue", "pressing-comparison"], True,
     "<p>Does anyone still have the 2024 ZKO re-issue sealed? I am comparing "
     "pressings and I think side B was re-cut mid-run.</p>"
     "<p>Track 3 has a tape-saturation artefact on my copy that a friend's "
     "copy simply does not have.</p>"),
    ("noise", "Garrard 401 — original vs reproduction idler",
     ["hardware", "turntables"], False,
     "<p>I finally swapped in an original idler wheel on the 401 and the noise "
     "floor dropped noticeably. Reproduction parts are fine for daily use but "
     "for archival listening the original rubber still wins.</p>"),
    ("mb", "The 1983 Bianchi gap — what are we missing?",
     ["maurizio-bianchi", "discography"], True,
     "<p>Working through the Bianchi bibliography again and the 1983 window "
     "still does not add up. Two releases, then nothing for nine months, then "
     "a flood. Frank's last Dispatch hints at an answer. Anyone have primary "
     "sources?</p>"),
    ("ukpe", "Broken Flag distribution outside the UK",
     ["power-electronics", "broken-flag"], False,
     "<p>How did Broken Flag tapes actually reach continental buyers in the "
     "mid-80s? Mine all have German postal marks but the label never listed a "
     "distributor. Mail-order chains were wilder than the discographies admit.</p>"),
    ("jp", "Vanity Records pressing scans — sharing my set",
     ["cassette-only", "japan"], False,
     "<p>I scanned my full Vanity Records set at 1200 dpi. Happy to share with "
     "anyone documenting the label. The j-card stock changes twice across the "
     "run and nobody seems to have written that down.</p>"),
    ("arch", "ZKO box completeness — my running spreadsheet",
     ["zko", "discography"], False,
     "<p>My ZKO completeness spreadsheet is now public-ready. 14 boxes "
     "tracked, 3 still with question marks. The numbering jumps are not "
     "errors — they map onto shipping delays, exactly like Frank wrote.</p>"),
    ("prague", "First proper industrial purchase — nervous and happy",
     ["industrial", "new-collector"], True,
     "<p>Just placed my first serious bid and won. Probably overpaid. Do not "
     "care. This scene welcomed me faster than any other I have been part of.</p>"),
    ("fr", "Martial industrial — where does the fringe end?",
     ["death-industrial", "discussion"], False,
     "<p>Genuine question for the longtime collectors: where do you personally "
     "draw the line between the martial fringe and the rest of the catalogue? "
     "I am trying to build a coherent shelf and the edges are blurry.</p>"),
    ("nl", "Reel-to-reel dubs — are they collectible or just copies?",
     ["reel-to-reel", "discussion"], False,
     "<p>I have a stack of reel dubs from the 80s tape network. Are these "
     "considered collectible objects in their own right, or just second-"
     "generation copies? The community seems split.</p>"),
    ("us", "A latecomer's thank-you to the re-issue labels",
     ["re-issue", "appreciation"], False,
     "<p>I started collecting in 2020. Without the re-issue programme I would "
     "never have heard half of this music. Originals are a different "
     "conversation — but the re-issues opened the door.</p>"),
    ("zko", "Inner sleeve printing varieties nobody documents",
     ["pressing-comparison", "archive-find"], True,
     "<p>The inner sleeves are where the real variants hide. Same catalogue "
     "number, three different print runs, and the only tell is the weight of "
     "the paper. Photographing all of mine this month.</p>"),
    ("tape", "West German postal marks as a dating tool",
     ["tape-culture", "germany"], False,
     "<p>You can date a lot of these tapes by the postal franking alone. The "
     "machine marks changed format in 1986. If your sleeve has the older "
     "frank, the tape predates that.</p>"),
    ("ukpe", "Come Organisation — the editions never matched the labels",
     ["power-electronics", "come-org"], True,
     "<p>Stated edition sizes on Come Org releases are aspirational at best. "
     "I have catalogue evidence that at least two ‘edition of 100’ "
     "releases never broke 60 copies.</p>"),
    ("noise", "What is the most over-restored re-issue you own?",
     ["re-issue", "discussion"], False,
     "<p>Some re-issues clean up the source so much they lose the document. "
     "Which one, in your collection, went too far? I will start: a certain "
     "2019 LP that scrubbed the tape hiss into oblivion.</p>"),
    ("mb", "Test pressings — provenance or it didn't happen",
     ["test-pressing", "provenance"], True,
     "<p>A test pressing without provenance is just an unlabelled record. I "
     "no longer buy them without a paper trail. Learned that the expensive "
     "way.</p>"),
    ("arch", "Cataloguing software — what does everyone use?",
     ["discussion", "tooling"], False,
     "<p>Discogs is fine for market data but useless for the variant-level "
     "detail this scene needs. What are people using to track pressing "
     "variants properly?</p>"),
    ("jp", "Telegraph era cassettes — j-card stock changes",
     ["cassette-only", "japan"], True,
     "<p>Documented two distinct j-card stocks across the Telegraph run. The "
     "later batch is visibly thinner. If your card flexes easily, it is the "
     "second batch.</p>"),
    ("prague", "Storage — how do you keep tapes alive long-term?",
     ["preservation", "new-collector"], False,
     "<p>Now that I own things worth preserving: what is the real consensus "
     "on long-term cassette storage? Temperature, humidity, orientation. "
     "Point me at the good threads.</p>"),
    ("us", "Building a coherent shelf from scratch in 2024",
     ["new-collector", "discussion"], False,
     "<p>Five years in, I am finally happy with the shape of the collection. "
     "Sharing the logic I used in case it helps another latecomer: buy the "
     "re-issues, study the originals, never bid drunk.</p>"),
]

# ─── Comment pool ───────────────────────────────────────────────────────────
COMMENTS = [
    "This matches what I have on my copy exactly. Good to see it written down.",
    "Frank, is the second recording the one with the Walther microphone? If "
    "so this is a small sensation.",
    "Exactly that. I cross-checked the provenance in February. More in part two.",
    "The re-issue runs on the new master. Original is original, but the "
    "re-issue is cleaner by design, not by accident.",
    "Have you compared it against the 1986 Japanese promo cut? Allegedly only "
    "30 copies pressed.",
    "I disagree slightly — side A sounds warmer on the re-issue to my ears.",
    "Adding this to my notes. The paper-weight tell is real, I can confirm it "
    "on three copies here.",
    "Welcome to the scene. You did not overpay — you bought a story.",
    "This is the most useful thread I have read all month. Thank you for "
    "documenting it.",
    "My copy has the older postal frank, so that lines up with your dating.",
    "Source: I have the original recording log in scan form. Happy to share.",
    "The numbering jumps always confused me until this. It finally makes sense.",
    "Reproduction parts are fine for daily play, agreed. For archival, no.",
    "I would call reel dubs collectible if the provenance is solid. Otherwise "
    "they are just copies.",
    "Test pressing without provenance = unlabelled record. Hard agree.",
    "This is why I keep coming back here instead of the old group.",
    "Great write-up. The postal-logic point reframes the whole edition-size "
    "debate.",
    "Bookmarking this. The variant detail is exactly what Discogs misses.",
]

# ─── Review pool ────────────────────────────────────────────────────────────
# rating, body_html
REVIEWS = [
    (5, "<p>Reference pressing. The 2018 master pulls detail out of the A-side "
        "I never heard on my original copy until three listening sessions in.</p>"),
    (5, "<p>One of the defining documents of the genre. Essential, and the "
        "re-issue does it justice.</p>"),
    (4, "<p>Excellent re-issue. Marginally too clean for my taste, but the "
        "pressing quality is undeniable.</p>"),
    (4, "<p>Strong release. The packaging research alone makes this worth "
        "owning.</p>"),
    (3, "<p>Solid, historically important, but not the entry point I would "
        "recommend to a newcomer.</p>"),
    (5, "<p>Cleaner by design — and that is not a criticism. A careful, "
        "respectful restoration.</p>"),
    (4, "<p>The tape saturation survives just enough. A hard balance to "
        "strike and they mostly got it right.</p>"),
    (2, "<p>Over-restored. The hiss was part of the document and it is gone. "
        "Historically I am glad it exists; sonically I am not.</p>"),
    (5, "<p>I waited years for this and it exceeded the wait. Flawless.</p>"),
    (3, "<p>Good, not transcendent. The mastering is fine; the source had "
        "limits.</p>"),
]

# ─── Demo lists ─────────────────────────────────────────────────────────────
# author_key, title, description
LISTS = [
    ("zko", "Essential ZKO Tapes 1984–1987",
     "The cassettes that define the early ZKO catalogue — start here, then "
     "go deeper."),
    ("mb", "The First-Pressing Hunt",
     "Releases where the original pressing is worth the chase. Provenance "
     "matters."),
    ("ukpe", "Power Electronics: The Broken Flag Years",
     "Come Org, Broken Flag and the UK noise underground of the mid-80s."),
    ("us", "A Newcomer's First Industrial Year",
     "If you started collecting last year, this is the shelf to build first."),
    ("tape", "Re-issues That Got It Right",
     "Restorations that respected the source instead of scrubbing it clean."),
    ("arch", "Cassette-Only, Never Repressed",
     "Tape-underground releases that never made it to vinyl — and probably "
     "never will."),
]


def connect(pg_url_override=None):
    url = pg_url_override or os.getenv("SUPABASE_DB_URL")
    if not url:
        print("ERROR: pass --pg-url or set SUPABASE_DB_URL in VOD_Auctions/.env")
        sys.exit(1)
    conn = psycopg2.connect(url)
    conn.autocommit = False
    return conn


def purge(cur):
    """Remove every demo row. FK-safe order. Self-corrects review aggregates."""
    affected = [
        r[0] for r in _fetchall(
            cur,
            "SELECT DISTINCT release_id FROM community_review "
            "WHERE author_id LIKE %s AND release_id IS NOT NULL",
            (DEMO_PREFIX + "%",),
        )
    ]
    cur.execute("DELETE FROM community_reaction WHERE id LIKE %s OR profile_id LIKE %s",
                ("cmrea_demo_%", DEMO_PREFIX + "%"))
    cur.execute("DELETE FROM community_notification "
                "WHERE recipient_id LIKE %s OR actor_id LIKE %s",
                (DEMO_PREFIX + "%", DEMO_PREFIX + "%"))
    cur.execute("DELETE FROM community_comment WHERE author_id LIKE %s "
                "OR post_id IN (SELECT id FROM community_post WHERE author_id LIKE %s)",
                (DEMO_PREFIX + "%", DEMO_PREFIX + "%"))
    cur.execute("DELETE FROM community_review WHERE author_id LIKE %s",
                (DEMO_PREFIX + "%",))
    cur.execute("DELETE FROM community_post WHERE author_id LIKE %s",
                (DEMO_PREFIX + "%",))
    cur.execute("DELETE FROM community_follow "
                "WHERE follower_id LIKE %s OR followed_id LIKE %s",
                (DEMO_PREFIX + "%", DEMO_PREFIX + "%"))
    # community_list_item cascades on the community_list FK.
    cur.execute("DELETE FROM community_list WHERE author_id LIKE %s",
                (DEMO_PREFIX + "%",))
    cur.execute("DELETE FROM community_profile WHERE id LIKE %s",
                (DEMO_PREFIX + "%",))
    # Re-point Release rating aggregates to non-demo reviews only.
    for rid in affected:
        cur.execute("SELECT community_recompute_release_rating(%s)", (rid,))
    print(f"  purged demo rows · {len(affected)} release rating aggregates recomputed")


def _fetchall(cur, sql, params=None):
    cur.execute(sql, params or ())
    return cur.fetchall()


def pick_releases(cur, n):
    """A stable set of real releases with cover art to anchor demo content."""
    rows = _fetchall(
        cur,
        'SELECT r.id, r.title, a.name FROM "Release" r '
        'LEFT JOIN "Artist" a ON a.id = r."artistId" '
        'WHERE r."coverImage" IS NOT NULL AND r.title IS NOT NULL '
        'ORDER BY r.id LIMIT 400',
    )
    if not rows:
        return []
    RNG.shuffle(rows)
    return rows[:n]


def load(cur):
    releases = pick_releases(cur, 16)
    if not releases:
        print("ERROR: no releases with cover art found to anchor demo content")
        sys.exit(1)
    rel_ids = [r[0] for r in releases]
    rel_title = {r[0]: (r[1] or "a release") for r in releases}
    print(f"  anchoring demo content to {len(rel_ids)} real releases")

    # ── Profiles ────────────────────────────────────────────────────────────
    # The public @handle keeps the mockup-style names (Design Brief §10).
    handles = {
        "frank": "frankmaier", "zko": "discoveredzkoin1989",
        "tape": "tapeundergroundde", "noise": "noiseandarchive",
        "prague": "industrialpragueog", "mb": "maurizioforever",
        "ukpe": "powerelectronicsuk", "jp": "cassetteculturejp",
        "arch": "zkoarchivist", "fr": "deathindustrialfr",
        "nl": "analogtapehead", "us": "noisefloorus",
    }
    pid = {}
    for key, name, loc, since, tier, is_curator, bio, links in MEMBERS:
        pid[key] = DEMO_PREFIX + key
        created = NOW - timedelta(days=RNG.randint(120, 900))
        cur.execute(
            "INSERT INTO community_profile "
            "(id, customer_id, claimed, handle, display_name, bio, location, "
            " collector_since, links, tier, is_curator, is_banned, trust_level, "
            " created_at, updated_at) "
            "VALUES (%s,NULL,true,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,false,%s,%s,%s)",
            (pid[key], handles[key], name, bio, loc, since,
             json.dumps(links), tier, is_curator,
             3 if is_curator else RNG.randint(1, 3), created, created),
        )
    print(f"  + {len(MEMBERS)} demo profiles")

    member_keys = [k for k, *_ in MEMBERS if k != "frank"]
    posts = []   # (post_id, author_key, kind)
    seq = 0

    def slug(title):
        s = "".join(c if c.isalnum() else "-" for c in title.lower())
        s = "-".join(p for p in s.split("-") if p)[:54]
        return s

    # ── Editorials ──────────────────────────────────────────────────────────
    for i, (title, tags, body) in enumerate(EDITORIALS):
        seq += 1
        post_id = f"cmpst_demo_{seq:03d}"
        published = NOW - timedelta(days=7 * (len(EDITORIALS) - i), hours=RNG.randint(0, 20))
        rid = rel_ids[i % len(rel_ids)] if i % 2 == 0 else None
        cur.execute(
            "INSERT INTO community_post "
            "(id, author_id, kind, title, slug, body_html, excerpt, tags, "
            " release_id, status, is_pinned, reaction_count, comment_count, "
            " created_at, updated_at, published_at) "
            "VALUES (%s,%s,'editorial',%s,%s,%s,%s,%s,%s,'published',%s,0,0,%s,%s,%s)",
            (post_id, pid["frank"], title, f"demo-{seq}-{slug(title)}", body,
             _excerpt(body), tags, rid, i == 0, published, published, published),
        )
        posts.append((post_id, "frank", "editorial"))

    # ── Discussion posts ────────────────────────────────────────────────────
    for i, (akey, title, tags, anchor, body) in enumerate(POSTS):
        seq += 1
        post_id = f"cmpst_demo_{seq:03d}"
        published = NOW - timedelta(days=RNG.randint(0, 55), hours=RNG.randint(0, 23))
        rid = rel_ids[(i + 3) % len(rel_ids)] if anchor else None
        cur.execute(
            "INSERT INTO community_post "
            "(id, author_id, kind, title, slug, body_html, excerpt, tags, "
            " release_id, status, is_pinned, reaction_count, comment_count, "
            " created_at, updated_at, published_at) "
            "VALUES (%s,%s,'discussion',%s,%s,%s,%s,%s,%s,'published',false,0,0,%s,%s,%s)",
            (post_id, pid[akey], title, f"demo-{seq}-{slug(title)}", body,
             _excerpt(body), tags, rid, published, published, published),
        )
        posts.append((post_id, akey, "discussion"))
    print(f"  + {len(EDITORIALS)} editorials, {len(POSTS)} discussion posts")

    # ── Comments (~50, one threading level) ─────────────────────────────────
    comment_count = 0
    cseq = 0
    per_post = {}
    for post_id, author_key, kind in posts:
        n = RNG.randint(1, 4) if kind == "discussion" else RNG.randint(3, 6)
        tops = []
        for _ in range(n):
            cseq += 1
            commenter = RNG.choice([k for k in member_keys if k != author_key] + ["frank"])
            text = RNG.choice(COMMENTS)
            ts = NOW - timedelta(days=RNG.randint(0, 40), hours=RNG.randint(0, 23))
            cid = f"cmcmt_demo_{cseq:03d}"
            cur.execute(
                "INSERT INTO community_comment "
                "(id, post_id, author_id, parent_id, body_html, status, "
                " reaction_count, created_at, updated_at) "
                "VALUES (%s,%s,%s,NULL,%s,'published',0,%s,%s)",
                (cid, post_id, pid[commenter], f"<p>{text}</p>", ts, ts),
            )
            tops.append(cid)
            comment_count += 1
        # One reply on roughly half the posts.
        if tops and RNG.random() < 0.5:
            cseq += 1
            replier = RNG.choice(member_keys + ["frank"])
            ts = NOW - timedelta(days=RNG.randint(0, 20), hours=RNG.randint(0, 23))
            cur.execute(
                "INSERT INTO community_comment "
                "(id, post_id, author_id, parent_id, body_html, status, "
                " reaction_count, created_at, updated_at) "
                "VALUES (%s,%s,%s,%s,%s,'published',0,%s,%s)",
                (f"cmcmt_demo_{cseq:03d}", post_id, pid[replier], tops[0],
                 f"<p>{RNG.choice(COMMENTS)}</p>", ts, ts),
            )
            comment_count += 1
        per_post[post_id] = comment_count
    # Denormalised comment_count per post.
    for post_id, *_ in posts:
        cur.execute(
            "UPDATE community_post SET comment_count = "
            "(SELECT count(*) FROM community_comment WHERE post_id=%s AND status='published') "
            "WHERE id=%s", (post_id, post_id))
    print(f"  + {comment_count} comments")

    # ── Reviews (~30) ───────────────────────────────────────────────────────
    rseq = 0
    review_pairs = set()
    affected_releases = set()
    target = 30
    while rseq < target:
        akey = RNG.choice(member_keys)
        rid = RNG.choice(rel_ids)
        if (akey, rid) in review_pairs:
            continue
        review_pairs.add((akey, rid))
        rseq += 1
        rating, body = RNG.choice(REVIEWS)
        ts = NOW - timedelta(days=RNG.randint(0, 50), hours=RNG.randint(0, 23))
        cur.execute(
            "INSERT INTO community_review "
            "(id, release_id, author_id, rating, body_html, is_verified_acquired, "
            " status, reaction_count, comment_count, created_at, updated_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,'published',0,0,%s,%s)",
            (f"cmrev_demo_{rseq:03d}", rid, pid[akey], rating, body,
             RNG.random() < 0.6, ts, ts),
        )
        affected_releases.add(rid)
    print(f"  + {rseq} reviews across {len(affected_releases)} releases")

    # ── Reactions ───────────────────────────────────────────────────────────
    react_seq = 0
    all_keys = [k for k, *_ in MEMBERS]
    for post_id, author_key, kind in posts:
        n = RNG.randint(2, 18) if kind == "editorial" else RNG.randint(0, 12)
        reactors = RNG.sample(all_keys, min(n, len(all_keys)))
        for rk in reactors:
            react_seq += 1
            cur.execute(
                "INSERT INTO community_reaction "
                "(id, profile_id, target_kind, target_id, emoji, created_at) "
                "VALUES (%s,%s,'post',%s,%s,%s) ON CONFLICT DO NOTHING",
                (f"cmrea_demo_{react_seq:03d}", pid[rk], post_id,
                 RNG.choice(REACTIONS),
                 NOW - timedelta(days=RNG.randint(0, 30))),
            )
    # Denormalised reaction_count per post.
    cur.execute(
        "UPDATE community_post p SET reaction_count = "
        "(SELECT count(*) FROM community_reaction r "
        " WHERE r.target_kind='post' AND r.target_id=p.id) "
        "WHERE p.author_id LIKE %s", (DEMO_PREFIX + "%",))
    print(f"  + {react_seq} reactions")

    # ── Follows ─────────────────────────────────────────────────────────────
    follow_count = 0
    for follower in all_keys:
        targets = RNG.sample([k for k in all_keys if k != follower],
                             RNG.randint(2, 7))
        # Everyone follows the curator.
        if "frank" not in targets and follower != "frank":
            targets.append("frank")
        for t in targets:
            cur.execute(
                "INSERT INTO community_follow (follower_id, followed_id, created_at) "
                "VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                (pid[follower], pid[t], NOW - timedelta(days=RNG.randint(1, 200))))
            follow_count += 1
    print(f"  + {follow_count} follow edges")

    # ── Lists ───────────────────────────────────────────────────────────────
    list_seq = 0
    item_total = 0
    for akey, title, desc in LISTS:
        list_seq += 1
        lid = f"cmlst_demo_{list_seq:03d}"
        created = NOW - timedelta(days=RNG.randint(2, 120))
        cur.execute(
            "INSERT INTO community_list "
            "(id, author_id, title, slug, description, is_public, item_count, "
            " created_at, updated_at) "
            "VALUES (%s,%s,%s,%s,%s,true,%s,%s,%s)",
            (lid, pid[akey], title, f"demo-{list_seq}-{slug(title)}", desc,
             0, created, created),
        )
        picks = RNG.sample(rel_ids, min(RNG.randint(4, 8), len(rel_ids)))
        for rank, rid in enumerate(picks, start=1):
            cur.execute(
                "INSERT INTO community_list_item "
                "(list_id, release_id, rank, created_at) VALUES (%s,%s,%s,%s)",
                (lid, rid, rank, created),
            )
            item_total += 1
        cur.execute(
            "UPDATE community_list SET item_count=%s WHERE id=%s",
            (len(picks), lid),
        )
    print(f"  + {list_seq} lists, {item_total} list items")

    # ── Acquired-feed posts ─────────────────────────────────────────────────
    # A subset of members opts into the acquired feed; seed a few acquired
    # posts so the feature is visible in the demo dataset.
    acq_members = RNG.sample(member_keys, 6)
    for akey in acq_members:
        cur.execute(
            "UPDATE community_profile SET show_acquired_feed=true WHERE id=%s",
            (pid[akey],),
        )
    acq_count = 0
    for akey in acq_members:
        for rid in RNG.sample(rel_ids, RNG.randint(1, 2)):
            seq += 1
            post_id = f"cmpst_demo_{seq:03d}"
            ts = NOW - timedelta(days=RNG.randint(0, 45), hours=RNG.randint(0, 23))
            body = (f"<p>Added <strong>{rel_title[rid]}</strong> "
                    "to the collection.</p>")
            cur.execute(
                "INSERT INTO community_post "
                "(id, author_id, kind, title, slug, body_html, excerpt, tags, "
                " release_id, status, is_pinned, reaction_count, comment_count, "
                " created_at, updated_at, published_at) "
                "VALUES (%s,%s,'acquired',NULL,%s,%s,%s,%s,%s,'published',"
                "false,0,0,%s,%s,%s)",
                (post_id, pid[akey], f"demo-{seq}-acquired",
                 body, _excerpt(body), ["acquired"], rid, ts, ts, ts),
            )
            acq_count += 1
    print(f"  + {acq_count} acquired posts")

    # ── Strip demo influence from Release rating aggregates ─────────────────
    # The review trigger rolled demo ratings into Release.averageRating. Reset
    # every affected release to reflect non-demo reviews only.
    for rid in affected_releases:
        cur.execute(
            'UPDATE "Release" r SET "averageRating" = agg.avg_rating, '
            '"ratingCount" = agg.cnt FROM ('
            "  SELECT ROUND(AVG(rating)::numeric,2)::double precision AS avg_rating, "
            "         COUNT(rating)::int AS cnt FROM community_review "
            "  WHERE release_id=%s AND status='published' AND rating IS NOT NULL "
            "        AND author_id NOT LIKE %s"
            ") agg WHERE r.id=%s",
            (rid, DEMO_PREFIX + "%", rid))
        cur.execute(
            'UPDATE "Release" SET "averageRating"=NULL, "ratingCount"=0 '
            "WHERE id=%s AND NOT EXISTS ("
            "  SELECT 1 FROM community_review cr WHERE cr.release_id=%s "
            "  AND cr.status='published' AND cr.rating IS NOT NULL "
            "  AND cr.author_id NOT LIKE %s)",
            (rid, rid, DEMO_PREFIX + "%"))
    print("  · Release rating aggregates stripped of demo influence")


def _excerpt(html, limit=220):
    text, skip = [], False
    for ch in html:
        if ch == "<":
            skip = True
        elif ch == ">":
            skip = False
        elif not skip:
            text.append(ch)
    s = " ".join("".join(text).split())
    return s[:limit].rstrip() + "…" if len(s) > limit else s


def main():
    ap = argparse.ArgumentParser(description="VOD Community demo seeder (R0)")
    ap.add_argument("--load", action="store_true", help="purge then insert demo data")
    ap.add_argument("--purge", action="store_true", help="remove all demo data")
    ap.add_argument("--dry-run", action="store_true", help="roll back instead of commit")
    ap.add_argument("--pg-url", help="override the Postgres connection URL")
    args = ap.parse_args()
    if not args.load and not args.purge:
        ap.error("pass --load or --purge")

    conn = connect(args.pg_url)
    cur = conn.cursor()
    try:
        print("VOD Community demo seeder")
        print("  purging existing demo rows…")
        purge(cur)
        if args.load:
            print("  loading demo dataset…")
            load(cur)
        if args.dry_run:
            conn.rollback()
            print("DRY RUN — rolled back, nothing committed.")
        else:
            conn.commit()
            print("Committed." if args.load else "Demo data purged.")
    except Exception as e:
        conn.rollback()
        print(f"ERROR — rolled back: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
