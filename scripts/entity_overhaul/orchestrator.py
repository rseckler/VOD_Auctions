#!/usr/bin/env python3
"""
Orchestrator — Main entry point for Entity Content Overhaul pipeline.
Processes entities through: Enrich → Profile → Write → SEO → Quality → DB.

Usage:
  python3 orchestrator.py --type artist --priority P1 --limit 10
  python3 orchestrator.py --type all --priority P1 --dry-run
  python3 orchestrator.py --type all --resume
  python3 orchestrator.py --entity-id legacy-artist-1892 --force
"""
import argparse
import json
import signal
import sys
import time
import logging
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras

from config import (
    DATABASE_URL, DATA_DIR, LOGS_DIR, PROGRESS_FILE, REJECTS_FILE,
    MAX_REVISIONS, WORD_TARGETS,
)
from enricher import enrich_entity
from profiler import profile_entity
from writer import write_entity
from seo_agent import generate_seo
from quality_agent import review_content
from musician_mapper import map_musicians, save_musicians
from db_writer import save_entity_content

# ── Logging ───────────────────────────────────────────────────────────────────
log_file = LOGS_DIR / f"overhaul_{datetime.now().strftime('%Y%m%d')}.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("orchestrator")

# ── Signal Handling ───────────────────────────────────────────────────────────
_shutdown = False

def _signal_handler(signum, frame):
    global _shutdown
    log.warning("Shutdown signal received, finishing current entity...")
    _shutdown = True

signal.signal(signal.SIGINT, _signal_handler)
signal.signal(signal.SIGTERM, _signal_handler)

# ── Progress Tracking ─────────────────────────────────────────────────────────

def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {
        "status": "idle",
        "current_phase": "",
        "started_at": None,
        "entities_processed": 0,
        "entities_total": 0,
        "entities_accepted": 0,
        "entities_revised": 0,
        "entities_rejected": 0,
        "current_entity": None,
        "errors": 0,
        "last_updated": None,
        "processed_ids": [],
    }

def save_progress(progress: dict):
    progress["last_updated"] = datetime.now(timezone.utc).isoformat()
    PROGRESS_FILE.write_text(json.dumps(progress, indent=2))

def save_reject(entity_name: str, entity_type: str, entity_id: str, score: int, feedback: list):
    rejects = []
    if REJECTS_FILE.exists():
        rejects = json.loads(REJECTS_FILE.read_text())
    rejects.append({
        "entity_name": entity_name,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "score": score,
        "feedback": feedback,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    REJECTS_FILE.write_text(json.dumps(rejects, indent=2))

# ── Entity Fetching ───────────────────────────────────────────────────────────

def fetch_entities(pg_conn, entity_type: str, priority: str, limit: int, offset: int = 0) -> list[dict]:
    """Fetch entities to process, ordered by release count desc."""
    cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    type_configs = {
        "artist": ('"Artist"', '"artistId"'),
        "label": ('"Label"', '"labelId"'),
        "press_orga": ('"PressOrga"', '"pressOrgaId"'),
    }

    results = []
    types_to_process = [entity_type] if entity_type != "all" else ["artist", "label", "press_orga"]

    for et in types_to_process:
        table, fk = type_configs[et]

        # Priority filter
        if priority == "P1":
            having = "HAVING COUNT(r.id) > 10"
        elif priority == "P2":
            having = "HAVING COUNT(r.id) BETWEEN 3 AND 10"
        elif priority == "P3":
            having = "HAVING COUNT(r.id) BETWEEN 1 AND 2"
        else:
            having = ""

        cur.execute(f"""
            SELECT e.id as entity_id, e.name as entity_name, '{et}' as entity_type,
                   COUNT(r.id)::int as release_count
            FROM {table} e
            LEFT JOIN "Release" r ON r.{fk} = e.id
            GROUP BY e.id, e.name
            {having}
            ORDER BY COUNT(r.id) DESC
            LIMIT %s OFFSET %s
        """, (limit, offset))
        results.extend([dict(r) for r in cur.fetchall()])

    cur.close()
    return results

# ── Process Single Entity ─────────────────────────────────────────────────────

def process_entity(pg_conn, entity_type: str, entity_id: str, entity_name: str, dry_run: bool = False) -> dict:
    """
    Full pipeline for a single entity.
    Returns: {"status": "accepted"|"revised"|"rejected"|"error", "score": int, "description": str}
    """
    result = {"status": "error", "score": 0, "description": ""}
    start_time = time.time()

    try:
        # Step 1: Enrich
        log.info(f"  [1/6] Enriching {entity_name}...")
        enriched = enrich_entity(pg_conn, entity_type, entity_id, entity_name)

        # Skip "Various" or entities with no releases
        if entity_name.lower() == "various" or (enriched.get("internal", {}).get("release_count", 0) == 0):
            log.info(f"  Skipped: {entity_name} (no releases or 'Various')")
            return {"status": "skipped", "score": 0, "description": ""}

        # Step 2: Profile
        log.info(f"  [2/6] Profiling (tone: ?)...")
        profile = profile_entity(enriched)
        tone = profile.get("tone_directive", "?")
        log.info(f"         tone={tone}, genre={profile.get('primary_genre')}, tier={profile.get('significance_tier')}")

        # Step 3: Write (with revision loop)
        revision_feedback = None
        final_description = ""
        final_members = ""
        final_score = 0
        decision = "reject"

        for attempt in range(1 + MAX_REVISIONS):
            label = "Writing" if attempt == 0 else f"Revising (attempt {attempt})"
            log.info(f"  [3/6] {label}...")

            write_result = write_entity(enriched, profile, revision_feedback)
            if write_result.get("error"):
                log.error(f"  Writer error: {write_result['error']}")
                return {"status": "error", "score": 0, "description": ""}

            final_description = write_result["description"]
            final_members = write_result.get("members_block", "")

            if dry_run:
                log.info(f"  [DRY RUN] Would write {len(final_description.split())} words")
                return {"status": "dry_run", "score": 0, "description": final_description}

            # Step 4: SEO
            log.info(f"  [4/6] Generating SEO metadata...")
            seo = generate_seo(enriched, profile, final_description)

            # Step 5: Quality review
            log.info(f"  [5/6] Quality review...")
            review = review_content(
                entity_name, entity_type, final_description,
                seo.get("short_description", ""), profile, enriched,
            )
            final_score = review.get("total_score", 0)
            decision = review.get("decision", "reject")
            log.info(f"         Score: {final_score}, Decision: {decision}")

            if decision == "accept":
                break
            elif decision == "revise" and attempt < MAX_REVISIONS:
                revision_feedback = review.get("revision_instructions", "Improve tone match and individuality.")
                log.info(f"         Revising: {revision_feedback[:100]}...")
            else:
                break

        # Step 6: Save to DB
        if decision in ("accept", "revise"):  # Save revised too if max attempts reached
            log.info(f"  [6/6] Saving to DB...")

            # Determine country and year
            country = enriched.get("merged_country")
            yr = enriched.get("merged_year_range") or {}
            founded_year = str(yr["start"]) if yr.get("start") else None

            # External links
            ext_links = {}
            wiki = enriched.get("wikipedia") or {}
            if wiki.get("url"):
                ext_links["wikipedia"] = wiki["url"]
            lastfm = enriched.get("lastfm") or {}
            if lastfm.get("url"):
                ext_links["lastfm"] = lastfm["url"]
            bandcamp = enriched.get("bandcamp") or {}
            if bandcamp.get("url"):
                ext_links["bandcamp"] = bandcamp["url"]

            save_entity_content(
                pg_conn, entity_type, entity_id,
                final_description,
                seo.get("short_description", ""),
                seo.get("genre_tags", []),
                country, founded_year,
                ext_links if ext_links else None,
            )

            # Save musicians (artists only)
            if entity_type == "artist":
                musicians = map_musicians(enriched, profile, pg_conn)
                if musicians:
                    mus_result = save_musicians(musicians, entity_id, pg_conn)
                    log.info(f"         Musicians: {mus_result['created']} created, {mus_result['linked']} linked")

            result = {"status": "accepted" if decision == "accept" else "revised", "score": final_score, "description": final_description}
        else:
            # Rejected
            save_reject(entity_name, entity_type, entity_id, final_score, review.get("feedback", []))
            result = {"status": "rejected", "score": final_score, "description": final_description}

        elapsed = time.time() - start_time
        log.info(f"  Done: {entity_name} — {result['status']} (score {final_score}, {elapsed:.1f}s)")
        return result

    except Exception as e:
        log.error(f"  Error processing {entity_name}: {e}", exc_info=True)
        return {"status": "error", "score": 0, "description": ""}

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Entity Content Overhaul Pipeline")
    parser.add_argument("--type", choices=["artist", "label", "press_orga", "all"], default="all")
    parser.add_argument("--priority", choices=["P1", "P2", "P3", "all"], default="all")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--entity-id", type=str, help="Process a single entity by ID")
    parser.add_argument("--force", action="store_true", help="Overwrite existing content")
    parser.add_argument("--dry-run", action="store_true", help="Run without saving to DB")
    parser.add_argument("--resume", action="store_true", help="Resume from progress file")
    parser.add_argument("--new-only", action="store_true", help="Only process entities without content")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info(f"Entity Content Overhaul Pipeline")
    log.info(f"  Type: {args.type}, Priority: {args.priority}, Limit: {args.limit}")
    log.info(f"  Dry run: {args.dry_run}, Force: {args.force}, Resume: {args.resume}")
    log.info("=" * 60)

    conn = psycopg2.connect(DATABASE_URL)

    # Load or initialize progress
    progress = load_progress() if args.resume else load_progress()
    processed_ids = set(progress.get("processed_ids", []))

    if args.entity_id:
        # Single entity mode
        cur = conn.cursor()
        for table, et in [('"Artist"', 'artist'), ('"Label"', 'label'), ('"PressOrga"', 'press_orga')]:
            cur.execute(f"SELECT id, name FROM {table} WHERE id = %s", (args.entity_id,))
            row = cur.fetchone()
            if row:
                entity_id, entity_name = row
                result = process_entity(conn, et, entity_id, entity_name, args.dry_run)
                log.info(f"Result: {result['status']} (score {result['score']})")
                break
        else:
            log.error(f"Entity {args.entity_id} not found")
        cur.close()
        conn.close()
        return

    # Batch mode
    entities = fetch_entities(conn, args.type, args.priority, args.limit, args.offset)
    log.info(f"Fetched {len(entities)} entities to process")

    progress["status"] = "running"
    progress["current_phase"] = f"{args.type}/{args.priority}"
    progress["started_at"] = progress.get("started_at") or datetime.now(timezone.utc).isoformat()
    progress["entities_total"] = len(entities)
    save_progress(progress)

    for i, entity in enumerate(entities):
        if _shutdown:
            log.warning("Shutdown requested, saving progress...")
            break

        entity_id = entity["entity_id"]
        entity_name = entity["entity_name"]
        entity_type = entity["entity_type"]

        # Skip already processed (resume mode)
        if entity_id in processed_ids and not args.force:
            continue

        # Skip entities with existing content (unless --force)
        if args.new_only and not args.force:
            cur = conn.cursor()
            cur.execute(
                "SELECT 1 FROM entity_content WHERE entity_type = %s AND entity_id = %s AND description IS NOT NULL AND description != ''",
                (entity_type, entity_id),
            )
            has_content = cur.fetchone()
            cur.close()
            if has_content:
                continue

        log.info(f"\n[{i+1}/{len(entities)}] {entity_name} ({entity_type}, {entity['release_count']}r)")
        progress["current_entity"] = entity_name
        save_progress(progress)

        result = process_entity(conn, entity_type, entity_id, entity_name, args.dry_run)

        # Update progress
        progress["entities_processed"] = i + 1
        if result["status"] == "accepted":
            progress["entities_accepted"] += 1
        elif result["status"] == "revised":
            progress["entities_revised"] += 1
        elif result["status"] == "rejected":
            progress["entities_rejected"] += 1
        elif result["status"] == "error":
            progress["errors"] += 1

        processed_ids.add(entity_id)
        progress["processed_ids"] = list(processed_ids)
        save_progress(progress)

    # Done
    progress["status"] = "completed" if not _shutdown else "paused"
    progress["current_entity"] = None
    save_progress(progress)

    log.info("\n" + "=" * 60)
    log.info(f"Pipeline {'completed' if not _shutdown else 'paused'}")
    log.info(f"  Processed: {progress['entities_processed']}/{progress['entities_total']}")
    log.info(f"  Accepted: {progress['entities_accepted']}")
    log.info(f"  Revised: {progress['entities_revised']}")
    log.info(f"  Rejected: {progress['entities_rejected']}")
    log.info(f"  Errors: {progress['errors']}")
    log.info("=" * 60)

    conn.close()


if __name__ == "__main__":
    main()
