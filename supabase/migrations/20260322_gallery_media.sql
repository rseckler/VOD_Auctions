-- Migration: Gallery Media Management
-- Date: 2026-03-22
-- Purpose: gallery_media table for VOD Gallery page images + content_block seeds for gallery text

-- =============================================================================
-- 1. Gallery Media Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS gallery_media (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  section TEXT NOT NULL DEFAULT 'visual_gallery',
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  subtitle TEXT,
  description TEXT,
  link_url TEXT,
  link_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sections: hero, visual_gallery, collection_sound_carriers, collection_printed_matter,
-- collection_artwork, collection_documents, collection_rare, featured, listening_room, experience

CREATE INDEX idx_gallery_media_section ON gallery_media(section);
CREATE INDEX idx_gallery_media_position ON gallery_media(section, position);
CREATE INDEX idx_gallery_media_active ON gallery_media(is_active);

-- RLS
ALTER TABLE gallery_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gallery_media_public_read" ON gallery_media FOR SELECT USING (true);
CREATE POLICY "gallery_media_admin_all" ON gallery_media FOR ALL USING (true);

-- =============================================================================
-- 2. Seed Gallery Images
-- =============================================================================

INSERT INTO gallery_media (id, filename, url, alt_text, section, position, title, description) VALUES
-- Hero
('gm-01', 'gallery-04.jpg', '/gallery/gallery-04.jpg', 'VOD Gallery interior — warm light illuminating shelves of records and artefacts', 'hero', 0, NULL, NULL),

-- Visual Gallery (main grid)
('gm-02', 'gallery-01.jpg', '/gallery/gallery-01.jpg', 'VOD Gallery panoramic view — display vitrines and shelving', 'visual_gallery', 0, NULL, NULL),
('gm-03', 'gallery-12.jpg', '/gallery/gallery-12.jpg', 'Wall of framed concert posters — Laibach, Coil, SPK', 'visual_gallery', 1, NULL, NULL),
('gm-04', 'gallery-06.jpg', '/gallery/gallery-06.jpg', 'Throbbing Gristle Roland case and rare artefacts', 'visual_gallery', 2, NULL, NULL),
('gm-05', 'gallery-11.jpg', '/gallery/gallery-11.jpg', 'Vinyl records and cassette tape wall display', 'visual_gallery', 3, NULL, NULL),
('gm-06', 'gallery-09.jpg', '/gallery/gallery-09.jpg', 'Flowmotion zines and cassettes in glass vitrine', 'visual_gallery', 4, NULL, NULL),
('gm-07', 'gallery-14.jpg', '/gallery/gallery-14.jpg', 'Gallery interior — books, vinyl, posters and collectibles', 'visual_gallery', 5, NULL, NULL),

-- Collection category images
('gm-08', 'gallery-11.jpg', '/gallery/gallery-11.jpg', 'Vinyl records and cassette tape wall display', 'collection_sound_carriers', 0, 'Sound Carriers', 'Vinyl, cassettes, CDs, reels — from first pressings to rare test presses'),
('gm-09', 'gallery-08.jpg', '/gallery/gallery-08.jpg', 'Bookshelves with art books and framed posters', 'collection_printed_matter', 0, 'Printed Matter', 'Zines, books, magazines, liner notes — the written word of underground culture'),
('gm-10', 'gallery-12.jpg', '/gallery/gallery-12.jpg', 'Wall of framed concert posters', 'collection_artwork', 0, 'Artwork & Posters', 'Original artwork, prints, photography — the visual language of industrial music'),
('gm-11', 'gallery-09.jpg', '/gallery/gallery-09.jpg', 'Flowmotion zines in glass vitrine', 'collection_documents', 0, 'Documents & Ephemera', 'Flyers, correspondence, setlists — the paper trail of a movement'),
('gm-12', 'gallery-06.jpg', '/gallery/gallery-06.jpg', 'Throbbing Gristle Roland case and artefacts', 'collection_rare', 0, 'Rare Collectibles', 'One-of-a-kind items, artist proofs, hand-numbered editions, prototype releases'),

-- Featured highlights
('gm-13', 'gallery-06.jpg', '/gallery/gallery-06.jpg', 'Throbbing Gristle Roland synthesizer case', 'featured', 0, 'Throbbing Gristle — Roland Synthesizer Case', 'Original flight case marked "T.G. London", used to transport equipment during the Industrial Records era. Surrounded by original photographs and press documentation from the period.'),
('gm-14', 'gallery-05.jpg', '/gallery/gallery-05.jpg', 'SPK poster and cassette collection', 'featured', 1, 'SPK — Original Concert Poster & Tape Archive', 'Framed original poster alongside a comprehensive collection of SPK cassette releases, zines and related ephemera from the early 1980s Australian industrial scene.'),
('gm-15', 'gallery-12.jpg', '/gallery/gallery-12.jpg', 'Wall of framed concert posters', 'featured', 2, 'Original Concert Posters — Laibach, Coil & More', 'A curated wall of framed original concert and event posters spanning four decades of industrial and experimental music — Cop Shoot Cop, The World of Skin, Laibach, Neurosis.'),
('gm-16', 'gallery-09.jpg', '/gallery/gallery-09.jpg', 'Flowmotion zine collection in glass vitrine', 'featured', 3, 'Flowmotion — Complete Zine Archive', 'The full run of Flowmotion magazine, one of the essential publications of the European industrial and experimental music scene, displayed alongside related cassette releases.'),

-- Listening Room
('gm-17', 'gallery-13.jpg', '/gallery/gallery-13.jpg', 'Browsing the cassette collection at VOD Gallery', 'listening_room', 0, NULL, NULL),

-- Extra images (available for future use)
('gm-18', 'gallery-02.jpg', '/gallery/gallery-02.jpg', 'Glass vitrine with SPK, Whitehouse and industrial cassettes', 'visual_gallery', 6, NULL, NULL),
('gm-19', 'gallery-03.jpg', '/gallery/gallery-03.jpg', 'Long vitrine display with zines and cassettes', 'visual_gallery', 7, NULL, NULL),
('gm-20', 'gallery-07.jpg', '/gallery/gallery-07.jpg', 'Vinyl display rack and band t-shirts', 'visual_gallery', 8, NULL, NULL),
('gm-21', 'gallery-10.jpg', '/gallery/gallery-10.jpg', 'Gallery with bookshelves, vinyl crates and counter', 'visual_gallery', 9, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 3. Gallery Text Content (content_block table)
-- =============================================================================

INSERT INTO content_block (id, page, section, content, is_published) VALUES
(gen_random_uuid()::text, 'gallery', 'hero', '{"title": "A Collection You Can Walk Into", "subtitle": "41,500+ records, artefacts and rare collectibles. Friedrichshafen, Germany.", "cta_text": "Plan Your Visit", "cta_link": "#visit"}', true),
(gen_random_uuid()::text, 'gallery', 'introduction', '{"body": "The VOD Gallery in Friedrichshafen houses one of Europe''s most comprehensive collections of industrial, experimental and underground music. More than a store, it is an archive, a listening room and a meeting point — a place where five decades of sound culture become visible, audible and accessible. Visitors are welcome to browse, listen, discover and acquire pieces that exist nowhere else."}', true),
(gen_random_uuid()::text, 'gallery', 'listening_room', '{"title": "The Listening Room", "body": "A dedicated space within the gallery, equipped with a high-fidelity sound system and a curated programme of recordings drawn from the VOD archive. No requests. No playlists. The selection is made by Frank Bull — five decades of listening, distilled into one room.\n\nDrop in during opening hours and listen. No appointment necessary. Coffee is included."}', true),
(gen_random_uuid()::text, 'gallery', 'coffee', '{"quote": "Every visit to the VOD Gallery begins with coffee — or ends with one. Our professional espresso machine produces the kind of coffee that makes you want to stay a little longer, look a little closer, listen a little deeper. No hurry. The records aren''t going anywhere."}', true),
(gen_random_uuid()::text, 'gallery', 'visit', '{"hours": "Wednesday – Friday  14:00 – 19:00\nSaturday  11:00 – 17:00\n\nOr by appointment.", "phone": "+49 7541 34412", "email": "frank@vinyl-on-demand.com", "address": "VOD Gallery\nAlpenstrasse 25/1\n88045 Friedrichshafen\nGermany", "region": "Lake Constance / Bodensee region"}', true),
(gen_random_uuid()::text, 'gallery', 'closing', '{"quote": "Some collections are catalogued. This one is lived."}', true)
ON CONFLICT DO NOTHING;
