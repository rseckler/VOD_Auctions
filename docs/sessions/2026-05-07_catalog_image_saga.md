# Session 2026-05-07 — Catalog-Image-Edit Saga (rc53.9 + rc53.10)

**Auslöser:** David per WhatsApp: "Was bedeutet Cover Image locked denn es lässt sich dann bei Bild ändern bzw von Discogs ziehen" + "jedes mal wenn ich neu fetche und Unlocke übernimmt es mir dann immer und immer wieder das neue Bild nochmal aber tauscht nicht das falsche aus." Frank parallel: Drag&Drop und iPhone-Foto-Upload "geht oft nicht."

Was als kleiner Bug-Report begann, wurde eine 6-Wave-Saga über DB-Constraint-Drift, Race-Conditions, Body-Limits und Codex-Review.

## Reihenfolge der Wellen

| Wave | Commit | Inhalt | Auslöser |
|---|---|---|---|
| 1 | `acbe280` | Cover-Stack-Bug + Drag&Drop-Cover-Target + 25mb Upload + Modal-Wording + `artist_display_name`-Begleitbug | David & Frank Reports |
| 2 | `90cd400` | 57 Releases re-ranked via SQL-Migration "match auf `Release.coverImage`" + obsolete Cleanup-Doc removed | Cleanup nach Wave 1 |
| 3 | `903e18c` | `chk_action_valid` extended um `image_reorder`, `field_unlocked`, `contributing_artist_*` (Supabase + Replica) | Frank's Drag&Drop warf weiter HTTP 500 |
| 4 | `9f448d2` | Auto-generated `release_audit_log_action_check` (Postgres-Default-Name, 8 Werte) gedroppt — lebte still parallel zu `chk_action_valid` | Frank's Drag&Drop warf NOCH IMMER 500 |
| 5 | `64ae682` | Codex Major M1+M2+M3: `FOR UPDATE` Release-Lock, `generateEntityId()` statt `Date.now()`, Discogs-Preisfelder aus Modal entfernt | Codex Code-Review (gpt-5.5 nach CLI-Update) |
| 6 | `d57c092` | Codex Minor: `discogs_id` zu `STAMMDATEN_AUDIT_FIELDS`, neuer `_constraints_reference.sql` als Single Source of Truth | Schema-Hygiene |

## Drei systemische Probleme die unter dem Bug lagen

### 1. Cover-Stack durch fehlenden Bump
`backend/src/api/admin/media/[id]/route.ts:458` (vor Fix): Insert eines neuen Image-Rows mit `rang=0` ohne die existierenden +10 zu bumpen. Storefront-Sort `ORDER BY rang ASC, id ASC` friert dann das alphabetisch erste Bild als Cover ein. Nach 4× Discogs-Apply hatte David's Release 4 Image-Rows alle mit `rang=0` — der älteste Apply blieb sichtbares Cover, alle weiteren Versuche stapelten sich dahinter.

`Release.coverImage` (separate Spalte) wurde bei jedem Apply korrekt geupdated, aber die Storefront liest aus dem Image-Array, nicht aus der Spalte. Single-Source-of-Truth-Drift zwischen `Release.coverImage` und `images[0]`.

**Fix:** `await trx("Image").where("releaseId", id).increment("rang", 10)` vor dem Insert. Same Pattern wie `POST /admin/media/:id/images` mit `set_as_cover=true`.

### 2. Doppelter CHECK-Constraint
Für Frank's Drag&Drop bestand der echte Killer-Bug nicht im Code, sondern in der DB: `release_audit_log` hatte ZWEI separate `CHECK (action = ANY (...))`-Constraints:
- `chk_action_valid` — explizit benannt, 7 Werte ursprünglich, fehlten `image_reorder` und 4 weitere
- `release_audit_log_action_check` — Postgres-Default-Name, automatisch generiert beim ursprünglichen `ALTER TABLE ADD COLUMN action TEXT CHECK (...)`, 8 Werte (auch ohne `image_reorder`)

Beide Constraints werden bei jedem Insert evaluiert; der engere kippt. Selbst nach Erweiterung von `chk_action_valid` blockierte der Auto-Duplikat weiter. Frank's HTTP 500 hatte zwei verschiedene Constraint-Namen in den Stacks — erst beim genauen Lesen der zweiten Logs wurde das sichtbar.

**Lesson:** Knex-Migrations und SQL-DDL **niemals** Inline-`CHECK (... IN (...))` ohne expliziten Namen — `ADD CONSTRAINT chk_<name>` ist Pflicht. Sonst koexistieren still zwei Constraints unter unterschiedlichen Namen, die beim DDL-Drift einen unerwarteten Shutdown produzieren. Memory: [`feedback_check_constraint_action_drift.md`](../../.claude/projects/.../feedback_check_constraint_action_drift.md).

### 3. ID-Generator mit `Date.now()`
`media-edit-${id}-${Date.now()}` als Image-ID-Generator. Im Same-Millisecond-Fall (zwei parallele Apply-Klicks) kollidiert die ID, R2-Object-Key kollidiert auch (wird aus dem ID-Hash abgeleitet), `ON CONFLICT DO NOTHING` skippt den Insert silent — aber `Release.coverImage` wird trotzdem auf die neue URL geupdated. Resultat: orphan-State (Cover-URL ohne matchende Image-Row).

**Fix:** `generateEntityId()` (ULID) — global eindeutig, kollisionsfrei.

## SQL-Migration für 57 Releases

Pre-Check zeigte: für alle 57 betroffenen Releases matchte `Release.coverImage` exakt eine Image-Row. Strategie war damit deterministisch sicher (kein Heuristik-Risiko):

```sql
WITH affected AS (
  SELECT DISTINCT "releaseId" FROM "Image"
  WHERE rang = 0 AND id LIKE 'media-edit-%'
),
keep_ids AS (
  SELECT r.id AS release_id,
    (SELECT i.id FROM "Image" i
     WHERE i."releaseId" = r.id AND i.url = r."coverImage" LIMIT 1) AS keep_id
  FROM "Release" r JOIN affected a ON a."releaseId" = r.id
),
ranked AS (
  SELECT id, "releaseId",
    (ROW_NUMBER() OVER (
      PARTITION BY "releaseId"
      ORDER BY (CASE WHEN id = keep_id THEN 0 ELSE 1 END) ASC,
               rang ASC, "createdAt" ASC, id ASC
    ) - 1) * 10 AS new_rang
  FROM "Image" i JOIN keep_ids k ON k.release_id = i."releaseId"
)
UPDATE "Image" SET rang = ranked.new_rang
FROM ranked
WHERE "Image".id = ranked.id AND "Image".rang IS DISTINCT FROM ranked.new_rang;
```

Resultat: 168 Row-Updates, 57 new covers, 11 demoted, 0 stacked nach Cleanup.

## Codex-Review-Prozess

Robin's Trigger: "mache für das Feature mit codex einen code review." Erster Versuch failte mit `gpt-5.5 model requires newer Codex` — CLI 0.118.0 zu alt. Nach `npm install -g @openai/codex@latest` (→ 0.128.0) zweite Attempt erfolgreich.

Codex fand 3 Major + 2 Minor + 3 Nice-to-Have:
- **Major:** Race-Condition (Lock fehlt), ID-Kollision, Modal-Backend-Drift bei Discogs-Preisfeldern
- **Minor:** `discogs_id` nicht audit-geloggt, DB-Constraints nicht im Repo versioniert
- **Nice-to-Have:** 3 weitere Tabellen mit Inline-CHECK ohne expliziten Namen (`promo_codes`, `crm_staging`, `erp_inventory_bootstrap`)

Alle Major + alle Minor adressiert in Wave 5+6. Nice-to-Have als Backlog in `docs/TODO.md` "Later"-Sektion dokumentiert (~1h Effort, kein aktueller Drift, Future-Risk-Pattern).

## Was wurde NICHT gemacht

- **GitHub Release Tag** (`gh release create v1.0.0-rc53.10`) — Robin's Hand
- **Memory `feedback_check_constraint_action_drift.md`** wurde geupdated (das einzige Memory-Update dieser Session)
- **Schema-Baseline-Dump + CI-Diff-Tool** — als Backlog notiert, nicht gebaut
- **Sentry/Knex-Type-Errors im Backend-Build** — pre-existing, harmlos (Build-Artefakte sind korrekt, siehe Memory `feedback_medusa_build_exit_nonzero.md`)

## Files modified (Session-Total)

```
backend/src/admin/components/release-detail/DiscogsReviewModal.tsx
backend/src/admin/components/release-image-gallery.tsx
backend/src/api/admin/media/[id]/discogs-preview/route.ts
backend/src/api/admin/media/[id]/route.ts
backend/src/api/middlewares.ts
backend/scripts/migrations/2026-05-07_release_audit_log_action_whitelist.sql  (new)
backend/scripts/migrations/2026-05-07_drop_duplicate_audit_action_check.sql   (new)
backend/scripts/migrations/_constraints_reference.sql                          (new)
docs/architecture/CHANGELOG.md
docs/operations/COVER_IMAGE_CLEANUP_2026-05-06.md  (created Wave 1, removed Wave 2)
docs/TODO.md
```

## Frank/David Status nach Wave 6

- ✅ Bilder hochladen bis 25 MB (vorher silent 1-MB-Cap)
- ✅ Galerie-Thumbnail aufs Cover ziehen → Cover-Wechsel mit gold-Outline-Indication
- ✅ Cover-Apply aus Discogs Review Modal stackt nicht mehr (Bump+ULID+FOR-UPDATE)
- ✅ Drag&Drop Reorder im rest-grid funktioniert (Doppel-Constraint gedroppt)
- ✅ Discogs Review Modal zeigt nur noch Stammdaten-Felder (keine Discogs-Preise)
- ✅ Modal-Wording `🔒 sync-locked` mit Tooltip statt missverständlichem `🔒 locked`
- ✅ 57 zuvor-betroffene Test-Releases haben automatisch korrekte Cover (SQL-Migration)
- ✅ `discogs_id`-Änderungen sind ab jetzt audit-geloggt

## Kritischer Reflexionspunkt

Die Saga zeigte einen **Multi-Layer-Bug**, bei dem ich nach jeder Welle dachte "fertig" — aber die nächste Schicht (DB-Constraint, Doppel-Constraint, Race, ID-Kollision) tauchte erst auf, nachdem die vorherige weg war. Das ist klassisch für DDL-Drift: man fixt die offensichtliche Stelle, die unterliegende Drift wird erst sichtbar wenn man drauf landet.

**Lesson für Schema-Reviews:** bei jeder neuen ENUM-artigen CHECK-Constraint-Modifikation immer beide Suchen fahren —
1. `pg_constraint`-Sweep auf alle CHECK-Constraints der Tabelle (nicht nur den vermuteten Namen)
2. Repo-grep auf alle `action: "..."` / `status: "..."` / `type: "..."` Insertions

Plus: Codex-Review nach jedem nicht-trivialen Feature-Block einplanen, nicht nur retrospektiv. Hätte Wave 5 schon nach Wave 1 gestartet, wären Race + ID-Kollision sofort gefunden statt nach 4 weiteren Iterationen.
