"""
DB Writer — commits final content to entity_content table + musician tables.
"""
import psycopg2
from datetime import datetime, timezone


def save_entity_content(
    pg_conn,
    entity_type: str,
    entity_id: str,
    description: str,
    short_description: str,
    genre_tags: list[str],
    country: str | None,
    founded_year: str | None,
    external_links: dict | None,
) -> bool:
    """Upsert entity_content record."""
    cur = pg_conn.cursor()
    now = datetime.now(timezone.utc)

    # Check if record exists
    cur.execute(
        "SELECT id FROM entity_content WHERE entity_type = %s AND entity_id = %s",
        (entity_type, entity_id),
    )
    existing = cur.fetchone()

    try:
        if existing:
            cur.execute("""
                UPDATE entity_content SET
                    description = %s,
                    short_description = %s,
                    genre_tags = %s,
                    country = %s,
                    founded_year = %s,
                    external_links = %s,
                    is_published = true,
                    ai_generated = true,
                    ai_generated_at = %s,
                    updated_at = %s
                WHERE entity_type = %s AND entity_id = %s
            """, (
                description, short_description,
                genre_tags if genre_tags else None,
                country, founded_year,
                psycopg2.extras.Json(external_links) if external_links else None,
                now, now,
                entity_type, entity_id,
            ))
        else:
            ec_id = f"ec-{entity_type}-{entity_id.replace('legacy-', '')}-v2"
            cur.execute("""
                INSERT INTO entity_content (
                    id, entity_type, entity_id,
                    description, short_description, genre_tags,
                    country, founded_year, external_links,
                    is_published, ai_generated, ai_generated_at,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, true, true, %s, %s, %s)
            """, (
                ec_id, entity_type, entity_id,
                description, short_description,
                genre_tags if genre_tags else None,
                country, founded_year,
                psycopg2.extras.Json(external_links) if external_links else None,
                now, now, now,
            ))

        pg_conn.commit()
        return True
    except Exception as e:
        print(f"  [DBWriter] Error saving entity_content: {e}")
        pg_conn.rollback()
        return False
    finally:
        cur.close()
