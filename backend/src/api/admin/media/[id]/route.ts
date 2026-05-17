import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { createMovement } from "../../../../lib/inventory"
import { pushReleaseNow } from "../../../../lib/meilisearch-push"
import { revalidateReleaseCatalogPage } from "../../../../lib/storefront-revalidate"
import { logEdit, HARD_STAMMDATEN_FIELDS, SYSTEM_ID_FIELDS, looseEqual } from "../../../../lib/release-audit"
import { validateReleaseStammdaten } from "../../../../lib/release-validation"
import { lockFields, getHardFieldsInBody } from "../../../../lib/release-locks"
import { isValidFormat, isValidDescriptor } from "../../../../lib/format-mapping"
import { normalizeCountryToIso } from "../../../../lib/country-normalize"
import { isValidGenre } from "../../../../admin/data/genre-styles"
import { downloadOptimizeUpload, isR2Configured, isR2Url } from "../../../../lib/image-upload"
import { findOrCreateLabelByName } from "../../../../lib/label-resolver"

// GET /admin/media/:id — Single release detail with sync history
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const { id } = req.params

  // Fetch release with artist + label + format + pressorga + auction block
  // (NO inventory join — inventory is loaded separately as array to support
  // multiple exemplars per release). Auction block joined for Q6: show Block
  // Name + Link instead of raw ULID.
  //
  // Type-cast note: Release.current_block_id is uuid, auction_block.id is text
  // (ULID). Knex's default on() builder emits "r.current_block_id =
  // auction_block.id" which Postgres refuses with 42883 (uuid = text). Cast
  // to text on the uuid side so the JOIN resolves as a no-op when types
  // actually differ but matches for equal string values when compatible.
  const release = await pgConnection("Release")
    .select(
      "Release.*",
      "Artist.name as artist_name",
      "Label.name as label_name",
      "Format.name as format_name",
      "Format.format_group",
      "PressOrga.name as pressorga_name",
      "auction_block.title as current_block_title",
      "auction_block.slug as current_block_slug"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .leftJoin("PressOrga", "Release.pressOrgaId", "PressOrga.id")
    .leftJoin("auction_block", function () {
      this.on(pgConnection.raw('"Release"."current_block_id"::text = "auction_block"."id"'))
    })
    .where("Release.id", id)
    .first()

  if (!release) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  // Fetch ALL inventory items (exemplars) for this release as array.
  // Supports multi-exemplar model: each physical copy has its own row.
  let inventory_items: unknown[] = []
  try {
    inventory_items = await pgConnection("erp_inventory_item")
      .select(
        "erp_inventory_item.id as inventory_item_id",
        "erp_inventory_item.barcode as inventory_barcode",
        "erp_inventory_item.status as inventory_status",
        "erp_inventory_item.quantity as inventory_quantity",
        "erp_inventory_item.source as inventory_source",
        "erp_inventory_item.copy_number",
        "erp_inventory_item.condition_media as erp_condition_media",
        "erp_inventory_item.condition_sleeve as erp_condition_sleeve",
        "erp_inventory_item.exemplar_price",
        "erp_inventory_item.price_locked",
        "erp_inventory_item.price_locked_at",
        "erp_inventory_item.last_stocktake_at",
        "erp_inventory_item.last_stocktake_by",
        "erp_inventory_item.barcode_printed_at",
        "erp_inventory_item.notes as inventory_notes",
        "erp_inventory_item.warehouse_location_id",
        "warehouse_location.code as warehouse_location_code",
        "warehouse_location.name as warehouse_location_name"
      )
      .leftJoin("warehouse_location", "erp_inventory_item.warehouse_location_id", "warehouse_location.id")
      .where("erp_inventory_item.release_id", id)
      .orderBy("erp_inventory_item.copy_number", "asc")
  } catch {
    inventory_items = []
  }

  // Backward compatibility: flatten first item's fields onto release object
  // so existing UI code that reads release.inventory_item_id etc. still works.
  // Q1(b) COALESCE: when erp has values, surface them as the canonical
  // media_condition/sleeve_condition/inventory on the release object, so the
  // Catalog Edit-Valuation form shows the stocktake values instead of the
  // stale Release.* columns. Release.legacy_* remain the MySQL-owned fallback.
  const firstItem = inventory_items[0] as Record<string, unknown> | undefined
  if (firstItem) {
    Object.assign(release, firstItem)
    const relRec = release as Record<string, unknown>
    if (firstItem.erp_condition_media != null) relRec.media_condition = firstItem.erp_condition_media
    if (firstItem.erp_condition_sleeve != null) relRec.sleeve_condition = firstItem.erp_condition_sleeve
    if (firstItem.inventory_quantity != null) relRec.inventory = firstItem.inventory_quantity
    // Effective price: exemplar_price (Copy #2+) overrides legacy_price in display
    if (firstItem.exemplar_price != null) relRec.effective_price = firstItem.exemplar_price
  }

  // Fetch inventory movement history for ALL exemplars of this release
  let inventory_movements: unknown[] = []
  const itemIds = (inventory_items as Array<Record<string, unknown>>).map(i => i.inventory_item_id).filter(Boolean) as string[]
  if (itemIds.length > 0) {
    try {
      inventory_movements = await pgConnection("erp_inventory_movement")
        .whereIn("inventory_item_id", itemIds)
        .orderBy("created_at", "desc")
        .limit(50)
        .select(
          "id",
          "inventory_item_id",
          "type",
          "quantity_change",
          "reason",
          "reference",
          "performed_by",
          "created_at"
        )
    } catch {
      inventory_movements = []
    }
  }

  // Fetch sync history (last 20 entries)
  const sync_history = await pgConnection("sync_log")
    .where("release_id", id)
    .orderBy("sync_date", "desc")
    .limit(20)

  // Fetch images
  const images = await pgConnection("Image")
    .where("releaseId", id)
    .orderBy("rang", "asc")
    .orderBy("id", "asc")

  // Fetch contributing artists (rc52.6.1)
  const contributing_artists = await pgConnection("ReleaseArtist")
    .where("ReleaseArtist.releaseId", id)
    .leftJoin("Artist", "ReleaseArtist.artistId", "Artist.id")
    .select(
      "ReleaseArtist.id as link_id",
      "ReleaseArtist.artistId as artist_id",
      "ReleaseArtist.role as role",
      "ReleaseArtist.createdAt as created_at",
      "Artist.name as artist_name",
      "Artist.slug as artist_slug"
    )
    .orderBy("ReleaseArtist.createdAt", "asc")
    .orderBy("ReleaseArtist.id", "asc")

  // Fetch import history — LEFT JOIN with import_session for collection metadata
  // A release can appear in multiple imports (inserted once, updated by later
  // runs) — return them ordered newest first.
  let import_history: unknown[] = []
  try {
    const importLogResult = await pgConnection.raw(
      `SELECT
         il.id,
         il.run_id,
         il.action,
         il.discogs_id,
         il.collection_name,
         il.import_source,
         il.created_at,
         s.id as session_id,
         s.status as session_status
       FROM import_log il
       LEFT JOIN import_session s ON s.run_id = il.run_id
       WHERE il.release_id = ? AND il.import_type = 'discogs_collection'
       ORDER BY il.created_at DESC
       LIMIT 10`,
      [id]
    )
    import_history = importLogResult.rows || []
  } catch {
    // import_log table doesn't exist yet → empty array (release pre-dates Discogs import service)
    import_history = []
  }

  const meta = {
    is_stammdaten_editable: true, // All releases editable — lock is per-field via locked_fields
    source: release.data_source ?? "legacy",
    locked_fields: release.locked_fields || [],
  }

  res.json({ release, sync_history, images, contributing_artists, import_history, inventory_items, inventory_movements, meta })
}

// POST /admin/media/:id — Update editable fields
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )
  const { id } = req.params
  const body = (req.body || {}) as Record<string, any>

  // Zone-0: Strip system IDs silently — never writable via this endpoint
  for (const f of SYSTEM_ID_FIELDS) {
    delete body[f]
  }

  // Load current release for Guard + Audit old-values
  const currentRelease = await pgConnection("Release").where("id", id).first()
  if (!currentRelease) {
    res.status(404).json({ message: "Release not found" })
    return
  }

  // Stammdaten validation — single source of truth for FE + BE.
  // Only validates fields actually present in the body (partial updates ok).
  const stammdatenErrors = validateReleaseStammdaten({
    title: body.title,
    year: body.year,
    country: body.country,
    catalogNumber: body.catalogNumber,
    barcode: body.barcode,
    description: body.description,
  })
  if (Object.keys(stammdatenErrors).length > 0) {
    res.status(400).json({
      error: "validation_failed",
      message: Object.values(stammdatenErrors)[0],
      errors: stammdatenErrors,
    })
    return
  }

  const actorId: string = (req as any).auth_context?.actor_id || "admin"
  const actorEmail: string | null = (req as any).auth_context?.actor_email || null

  // Allowed Release fields — Zone-3 Commerce + Zone-2 Soft + Zone-1 Hard
  // Zone-1 is open for ALL releases (legacy included) — edited fields auto-lock
  // against sync overwrite via locked_fields JSONB array (rc51.0 Sync-Lock-Modell)
  const allowedReleaseFields = [
    // Zone-3 Commerce
    "estimated_value",
    "sale_mode",
    "shop_price",
    "shipping_item_type_id",
    "discogs_id",
    // Fix 1 (2026-05-16): Discogs-Marktpreise. Markt-Referenz, kein Stammdatum
    // — kein Lock, kein Audit, kein Review-Checkbox. Werden vom discogs-preview-
    // Apply-Pfad (market-Objekt) immer mitgeschickt, damit der Inventory-Process
    // den "Markt aktuell"-Block sofort nach dem Verlinken zeigt statt erst nach
    // dem nächsten discogs_daily_sync.py-Cron.
    "discogs_lowest_price",
    "discogs_median_price",
    "discogs_highest_price",
    "discogs_num_for_sale",
    // Zone-2 Soft-Stammdaten (always open, no lock needed)
    "genres",
    "styles",
    "barcode",
    "credits",
    "format_descriptors", // Picture Disc, Reissue, Limited Edition, … — never synced
    // Zone-1 Hard-Stammdaten (all releases — auto-locks on edit)
    // rc51.1 R1: `format` entfernt — Legacy-MySQL-owned, kein UI-Input, nicht in SYNC_PROTECTED_FIELDS.
    "title",
    "description",
    "year",
    "format_id",
    "format_v2", // rc51.7+: 71-Wert-Whitelist, granularer als format_id (16 Werte). Lock-protected.
    "catalogNumber",
    "country",
    "artistId",
    "artist_display_name", // rc52.12 RSE-320: composed multi-artist display string. NULL = use Artist.name fallback.
    "labelId",
    "coverImage",
    "legacy_format_detail",
    "legacy_condition",
    "legacy_available",
    "legacy_price",
  ]
  const releaseUpdates: Record<string, any> = {}

  for (const field of allowedReleaseFields) {
    if (body[field] !== undefined) {
      releaseUpdates[field] = body[field]
    }
  }

  // Fix 1 (2026-05-16): wenn Discogs-Marktpreise im Body sind, discogs_last_synced
  // mitstempeln — sonst zeigt die Source-Badge weiter "Last sync: —" obwohl
  // gerade frische Marktdaten gezogen wurden.
  if (
    releaseUpdates.discogs_lowest_price !== undefined ||
    releaseUpdates.discogs_median_price !== undefined ||
    releaseUpdates.discogs_highest_price !== undefined ||
    releaseUpdates.discogs_num_for_sale !== undefined
  ) {
    releaseUpdates.discogs_last_synced = new Date()
  }

  // rc54.0: country defensiv durch Normalizer. Picker liefert schon ISO,
  // aber idempotent + verhindert dass jemand via API einen raw "Germany"-
  // String reinwirft. Nach Phase 5 würde die CHECK-Constraint das blocken,
  // aber wir geben eine cleaner Fehlermeldung wenn wir hier early-rejecten.
  if (releaseUpdates.country !== undefined && releaseUpdates.country !== null) {
    const normalized = normalizeCountryToIso(String(releaseUpdates.country))
    if (normalized === null && releaseUpdates.country) {
      res.status(400).json({
        error: "invalid_country",
        message: `Country '${releaseUpdates.country}' is not a valid ISO-3166-1 alpha-2 code or known alias`,
      })
      return
    }
    releaseUpdates.country = normalized
  }

  // Normalize genres/styles: accept string[] directly or split "a, b, c" string
  const normalizeArray = (v: unknown): string[] | null => {
    if (v == null) return null
    if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean)
    if (typeof v === "string") return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null
    return null
  }
  if (body.genres !== undefined) {
    const arr = normalizeArray(body.genres)
    if (arr === null) {
      releaseUpdates.genres = null
    } else {
      // Strict whitelist — only the 15 Discogs top-level genres allowed.
      const invalid = arr.filter((g) => !isValidGenre(g))
      if (invalid.length > 0) {
        res.status(400).json({
          error: "validation_failed",
          message: `Invalid genres: ${invalid.join(", ")} — must be one of the 15 Discogs top-level genres`,
        })
        return
      }
      releaseUpdates.genres = arr
    }
  }
  // styles — open whitelist (DB-derived suggestions + custom add). No validation.
  if (body.styles !== undefined) releaseUpdates.styles = normalizeArray(body.styles)

  // format_v2 — strict whitelist (71 values from FORMAT_VALUES). Empty/null clears.
  if (body.format_v2 !== undefined) {
    const v = body.format_v2
    if (v === null || v === "") {
      releaseUpdates.format_v2 = null
    } else if (typeof v === "string" && isValidFormat(v)) {
      releaseUpdates.format_v2 = v
    } else {
      res.status(400).json({
        error: "validation_failed",
        message: `Invalid format_v2 value: "${String(v)}" — must be one of the 71 whitelisted FORMAT_VALUES`,
      })
      return
    }
  }

  // format_descriptors — array, each entry must be in FORMAT_DESCRIPTOR_VALUES
  if (body.format_descriptors !== undefined) {
    const arr = normalizeArray(body.format_descriptors)
    if (arr === null) {
      releaseUpdates.format_descriptors = null
    } else {
      const invalid = arr.filter((d) => !isValidDescriptor(d))
      if (invalid.length > 0) {
        res.status(400).json({
          error: "validation_failed",
          message: `Invalid format_descriptors: ${invalid.join(", ")} — must be from FORMAT_DESCRIPTOR_VALUES`,
        })
        return
      }
      releaseUpdates.format_descriptors = arr
    }
  }

  // Q1(b): media_condition, sleeve_condition, inventory are now owned by
  // erp_inventory_item when one exists. These fields are written to erp first,
  // then mirrored onto Release.* as fallback for Non-Cohort-A releases.
  const erpFields: Record<string, any> = {}
  if (body.media_condition !== undefined) erpFields.condition_media = body.media_condition || null
  if (body.sleeve_condition !== undefined) erpFields.condition_sleeve = body.sleeve_condition || null
  if (body.inventory !== undefined) erpFields.quantity = body.inventory !== "" && body.inventory !== null ? Number(body.inventory) : 1

  // warehouse_location_id also lives on erp_inventory_item
  const warehouseLocationId = body.warehouse_location_id

  const hasAnyUpdate =
    Object.keys(releaseUpdates).length > 0 ||
    Object.keys(erpFields).length > 0 ||
    warehouseLocationId !== undefined ||
    body.media_condition !== undefined ||
    body.sleeve_condition !== undefined ||
    body.inventory !== undefined

  if (!hasAnyUpdate) {
    res.status(400).json({ message: "No valid fields to update" })
    return
  }

  // Validate sale_mode
  if (releaseUpdates.sale_mode && !["auction_only", "direct_purchase", "both"].includes(releaseUpdates.sale_mode)) {
    res.status(400).json({ message: "Invalid sale_mode. Must be: auction_only, direct_purchase, or both" })
    return
  }

  // If sale_mode requires shop_price, validate it exists
  if (releaseUpdates.sale_mode && releaseUpdates.sale_mode !== "auction_only") {
    const current = await pgConnection("Release").where("id", id).select("shop_price").first()
    if (!releaseUpdates.shop_price && (!current?.shop_price || Number(current.shop_price) <= 0)) {
      res.status(400).json({ message: "shop_price is required when sale_mode is not auction_only" })
      return
    }
  }

  // Validate discogs_id is a positive integer if provided
  if (releaseUpdates.discogs_id !== undefined && releaseUpdates.discogs_id !== null && releaseUpdates.discogs_id !== "") {
    const parsed = parseInt(String(releaseUpdates.discogs_id), 10)
    if (isNaN(parsed) || parsed <= 0) {
      res.status(400).json({ message: "discogs_id must be a positive integer" })
      return
    }
    releaseUpdates.discogs_id = parsed
  } else if (releaseUpdates.discogs_id === "" || releaseUpdates.discogs_id === null) {
    releaseUpdates.discogs_id = null
  }

  // Q1(b): Also mirror the condition/inventory changes onto Release columns
  // as fallback for Non-Cohort-A releases (keeps legacy Release reads working).
  if (body.media_condition !== undefined) releaseUpdates.media_condition = body.media_condition || null
  if (body.sleeve_condition !== undefined) releaseUpdates.sleeve_condition = body.sleeve_condition || null
  if (body.inventory !== undefined) releaseUpdates.inventory = body.inventory !== "" && body.inventory !== null ? Number(body.inventory) : null

  // rc51.7: When format_id is changed, derive format_v2 from LEGACY_FORMAT_ID_MAP
  // so the new value is consistent without a separate sync run.
  // BUT: if user explicitly set format_v2 directly, that wins (granular 71-value
  // picker overrides the 16-value tape-mag mapping).
  if (releaseUpdates.format_id !== undefined && body.format_v2 === undefined) {
    const { classifyTapeMagFormat } = await import("../../../../lib/format-mapping.js")
    const fid = releaseUpdates.format_id == null ? null : Number(releaseUpdates.format_id)
    releaseUpdates.format_v2 = classifyTapeMagFormat(Number.isFinite(fid as number) ? (fid as number) : null)
  }

  // rc51.9.5: External coverImage URLs (e.g., from Discogs apply) → R2-Upload.
  // Discogs serves images via i.discogs.com; hotlinking would break with their
  // referer-restrictions. Mirror to R2 + create Image-row so the new cover
  // shows up in the gallery. R2-URLs (already on our bucket) and null/clear
  // pass through. R2-Failure: store the source URL as fallback (matches
  // discogs-import/commit behavior).
  let newImageRow: { id: string; url: string; releaseId: string } | null = null
  if (
    typeof releaseUpdates.coverImage === "string" &&
    releaseUpdates.coverImage.startsWith("http") &&
    !isR2Url(releaseUpdates.coverImage)
  ) {
    const sourceUrl = releaseUpdates.coverImage
    if (isR2Configured()) {
      // M2 (Codex 2026-05-07): generateEntityId() statt Date.now(). Same-ms
      // Apply-Kollisionen würden sonst identische image_id + R2-key produzieren,
      // ON CONFLICT DO NOTHING beim Insert silent skippen, aber Release.cover
      // Image trotzdem auf die neue URL setzen → orphan-state (cover URL ohne
      // matchende Image-Row). ULID ist global eindeutig.
      const imageId = `media-edit-${generateEntityId()}`
      const r2Url = await downloadOptimizeUpload(sourceUrl, id, imageId)
      if (r2Url) {
        releaseUpdates.coverImage = r2Url
        newImageRow = { id: imageId, url: r2Url, releaseId: id }
      }
      // R2-Failure: fall through with sourceUrl as-is (hotlink fallback)
    }
  }

  releaseUpdates.updatedAt = new Date()

  // rc53.18: Galerie-Replace-Vorbereitung. Der Modal sendet `gallery_images`
  // als Array von Discogs-URIs (secondaries). Wir downloaden + R2-uploaden
  // VOR der Transaktion (kein DB-Lock-Hold während Netz-IO), und legen die
  // Image-Rows dann inside trx atomic an. Bei Netz-Fehler einzelner Bilder:
  // die erfolgreichen werden trotzdem geschrieben, fehlende geloggt.
  type GalleryUpload = { idx: number; uri: string; r2Url: string; imageId: string }
  let galleryUploads: GalleryUpload[] | null = null
  let galleryReplaceTriggered = false
  let gallerySkippedDueToUploadFailure = false
  if (Array.isArray(body.gallery_images)) {
    galleryReplaceTriggered = true
    const uris = (body.gallery_images as unknown[])
      .map((u) => (typeof u === "string" ? u.trim() : ""))
      .filter((u) => u.length > 0 && u.startsWith("http"))

    galleryUploads = []
    if (isR2Configured() && releaseUpdates.discogs_id) {
      const discogsIdForGallery = Number(releaseUpdates.discogs_id) || currentRelease.discogs_id
      for (let idx = 0; idx < uris.length; idx++) {
        const uri = uris[idx]
        const imageId = `discogs-image-${discogsIdForGallery}-${idx + 1}`
        const r2Url = await downloadOptimizeUpload(uri, id, imageId)
        if (r2Url) {
          galleryUploads.push({ idx, uri, r2Url, imageId })
        }
      }
    } else if (releaseUpdates.discogs_id == null && currentRelease.discogs_id) {
      // discogs_id nicht in Body geändert → existing Wert nutzen
      for (let idx = 0; idx < uris.length; idx++) {
        const uri = uris[idx]
        const imageId = `discogs-image-${currentRelease.discogs_id}-${idx + 1}`
        const r2Url = await downloadOptimizeUpload(uri, id, imageId)
        if (r2Url) {
          galleryUploads.push({ idx, uri, r2Url, imageId })
        }
      }
    }
  }

  await pgConnection.transaction(async (trx) => {
    // M1 (Codex 2026-05-07): row-level Lock auf Release damit konkurrente
    // Cover-Applies serialisiert werden. Default-PG-MVCC würde Bumps zwar
    // sequenziell durchführen, aber FOR UPDATE macht die Serialisierung
    // explizit + schützt vor künftigen Refactors die das Locking-Pattern
    // auflockern könnten. Cost: vernachlässigbar (Single-Row-Lookup).
    if (newImageRow || galleryReplaceTriggered) {
      await trx("Release").where("id", id).select("id").forUpdate().first()
    }

    // rc53.18: Resolve label_name → labelId via find-or-create. Geht VOR der
    // Release-UPDATE damit der resolved labelId in releaseUpdates landet und
    // in einer einzigen UPDATE-Statement persistiert wird. Empty-string
    // explicit clears (releaseUpdates.labelId = null). Wenn body.labelId
    // bereits gesetzt ist, gewinnt es (User explicit override).
    //
    // Mirror auch auf body.labelId damit Auto-Lock (getHardFieldsInBody) +
    // Audit-Log (STAMMDATEN_AUDIT_FIELDS) den Label-Wechsel erfassen — die
    // beiden lesen body, nicht releaseUpdates.
    if (typeof body.label_name === "string" && releaseUpdates.labelId === undefined) {
      const cleanedLabelName = body.label_name.trim()
      if (cleanedLabelName) {
        const resolvedLabelId = await findOrCreateLabelByName(trx, cleanedLabelName)
        if (resolvedLabelId) {
          releaseUpdates.labelId = resolvedLabelId
          body.labelId = resolvedLabelId
        }
      } else {
        releaseUpdates.labelId = null
        body.labelId = null
      }
    }

    if (Object.keys(releaseUpdates).length > 1) {
      // more than just updatedAt
      // node-postgres serializes JS arrays as text[] literals ("{a,b}"), and
      // PG has no implicit cast text[] → jsonb. Stringify JSONB-array fields
      // so PG sees a JSON literal that the assignment-cast accepts.
      // (genres/styles are PG text[] and stay as arrays.)
      const updatePayload: Record<string, unknown> = { ...releaseUpdates }
      if (Array.isArray(updatePayload.format_descriptors)) {
        updatePayload.format_descriptors = JSON.stringify(updatePayload.format_descriptors)
      }
      await trx("Release").where("id", id).update(updatePayload)
    }

    // rc51.9.5: bei R2-Upload des coverImage zusätzlich Image-Row anlegen
    // mit rang=0 als neue Cover-Position. PFLICHT: vorher alle existierenden
    // Images +10 bumpen, sonst stapeln sich rang=0-Rows und der Storefront-
    // Sort `rang ASC, id ASC` friert die älteste als sichtbares Cover ein
    // (David-Bug 2026-05-06: 4× Discogs-Apply → 4× rang=0 → ältestes blieb
    // Cover trotz neuem Release.coverImage). Same Pattern wie POST /images
    // mit set_as_cover=true.
    if (newImageRow) {
      await trx("Image").where("releaseId", id).increment("rang", 10)
      await trx.raw(
        `INSERT INTO "Image" (id, url, alt, "releaseId", rang, source, "createdAt")
         VALUES (?, ?, ?, ?, 0, 'admin_edit', NOW())
         ON CONFLICT (id) DO NOTHING`,
        [newImageRow.id, newImageRow.url, "", newImageRow.releaseId]
      )
    }

    // rc53.18: Galerie-Replace. Wenn body.gallery_images übergeben wurde,
    // löschen wir alle bisherigen secondary-Rows (`source='discogs'` AND
    // rang > 1) und legen die neuen R2-URLs bei rang 31+i an. Cover
    // (rang 0 admin_edit ODER rang 1 discogs-import primary) und alle
    // admin_edit-Rows bleiben unangetastet. R2-Objekte der gelöschten Rows
    // bleiben Orphans im Bucket — bekanntes Cleanup-Backlog.
    //
    // rc53.18.1 (Codex P2#1): rang > 0 → rang > 1, sonst würde bei
    // discogs-import-Releases das Primary-Image-Row mit gelöscht.
    //
    // rc53.18.1 (Codex P2#2): wenn Frank Galerie-Replace gewollt hat aber
    // alle downloadOptimizeUpload-Calls haben null returnt (R2 down /
    // Discogs CDN 404 / ratelimited), würde galleryUploads.length === 0
    // einen DELETE-ohne-INSERT auslösen → leere Galerie nach transientem
    // Fehler. Statt zu wipen: existing Galerie behalten und im
    // Response-Header `x-gallery-skipped` signalisieren, damit das
    // Frontend einen Toast ziehen kann.
    if (galleryReplaceTriggered && galleryUploads) {
      const userWantedAtLeastOne =
        Array.isArray(body.gallery_images) && (body.gallery_images as unknown[]).length > 0
      if (galleryUploads.length === 0 && userWantedAtLeastOne) {
        // Keep existing gallery — do nothing. Signal to the FE so it can
        // show a "gallery upload failed, kept existing" toast.
        gallerySkippedDueToUploadFailure = true
      } else {
        await trx("Image")
          .where({ releaseId: id, source: "discogs" })
          .andWhere("rang", ">", 1)
          .del()

        for (const upload of galleryUploads) {
          await trx.raw(
            `INSERT INTO "Image" (id, url, alt, "releaseId", rang, source, "createdAt")
             VALUES (?, ?, ?, ?, ?, 'discogs', NOW())
             ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, rang = EXCLUDED.rang`,
            [upload.imageId, upload.r2Url, "", id, 31 + upload.idx]
          )
        }
      }
    }

    // Fix 2 (2026-05-16): Tracklist-Replace. Der DiscogsReviewModal sendet
    // `tracklist` als Array von { position, title, duration } wenn Frank die
    // Tracklist-Diff-Zeile anhakt. Tracklist ist KEIN Release-Column → eigener
    // Body-Key wie gallery_images, nicht in allowedReleaseFields. Replace =
    // alle bisherigen Track-Rows der Release löschen + neu inserten. Track hat
    // keine createdAt/updatedAt-Spalten (siehe discogs-import/commit).
    // F1 (Codex-Review 2026-05-16): `length > 0` — ein leeres tracklist-Array
    // darf NIE den DELETE-Pfad auslösen (sonst Tracklist-Wipe). discogs-preview
    // schlägt leere Tracklisten ohnehin nicht mehr vor; dieser Guard ist
    // Defense-in-Depth für jeden anderen Aufrufer.
    if (Array.isArray(body.tracklist) && body.tracklist.length > 0) {
      const tracks = (body.tracklist as unknown[])
        .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : null))
        .filter((t): t is Record<string, unknown> => t != null && typeof t.title === "string" && (t.title as string).trim() !== "")
      await trx("Track").where("releaseId", id).del()
      for (let idx = 0; idx < tracks.length; idx++) {
        const t = tracks[idx]
        await trx.raw(
          `INSERT INTO "Track" (id, "releaseId", position, title, duration, artist_name)
           VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
          [
            `tr-${id}-${idx}`,
            id,
            typeof t.position === "string" ? t.position : "",
            (t.title as string).trim(),
            typeof t.duration === "string" ? t.duration : "",
            // rc71.6: Per-Track-Künstler strukturiert.
            typeof t.artist_name === "string" && t.artist_name.trim() !== "" ? t.artist_name.trim() : null,
          ]
        )
      }
    }

    // Auto-lock: any Zone-1 Hard-Stammdaten field that actually CHANGED gets
    // added to locked_fields (rc51.1 R2 — vorher: alle Felder im Body auch
    // wenn unverändert, was zu Noise im locked_fields-Array führte).
    // looseEqual handelt DECIMAL-Roundtrip (String vs Number) korrekt ab.
    const hardFieldsChanged = getHardFieldsInBody(body).filter(
      (f) => !looseEqual(currentRelease[f], body[f])
    )
    if (hardFieldsChanged.length > 0) {
      await lockFields(trx, id, hardFieldsChanged)
    }

    // Update erp_inventory_item(s) — applies to all exemplars of this release.
    // Condition/quantity/location are release-level concerns in the legacy
    // single-exemplar view. For proper per-exemplar edits, use the stocktake
    // session UI which targets a specific inventory_item_id.
    const erpUpdatePayload: Record<string, any> = {}
    if (Object.keys(erpFields).length > 0) Object.assign(erpUpdatePayload, erpFields)
    if (warehouseLocationId !== undefined) erpUpdatePayload.warehouse_location_id = warehouseLocationId || null

    // Single-exemplar price mirror: when Frank changes shop_price in the
    // Edit-Valuation form AND there is exactly one inventory_item for this
    // release, mirror the new price onto erp_inventory_item.exemplar_price.
    // This keeps the label print (COALESCE(exemplar, direct, legacy)) showing
    // the correct current price without forcing Frank back into the stocktake
    // session. Multi-exemplar releases are skipped — each copy has its own
    // price and a release-level change would be ambiguous.
    //
    // Audit-Trail: wenn Preis-Mirror passiert, legen wir ein Movement an
    // damit die Item-History im Catalog-Detail den Preis-Change zeigt
    // (Franks Request 2026-04-22 — auch Non-Session-Änderungen müssen in
    // der Item-History sichtbar sein).
    let priceChangeAudit: {
      itemId: string
      oldPrice: number | null
      newPrice: number
    } | null = null

    const shopPriceProvided =
      releaseUpdates.shop_price !== undefined && releaseUpdates.shop_price !== null
    if (shopPriceProvided) {
      const existingItems = await trx("erp_inventory_item")
        .where("release_id", id)
        .select("id", "exemplar_price")
      if (existingItems.length === 1) {
        const newPrice = Number(releaseUpdates.shop_price)
        const oldPrice =
          existingItems[0].exemplar_price != null
            ? Number(existingItems[0].exemplar_price)
            : null
        erpUpdatePayload.exemplar_price = newPrice
        erpUpdatePayload.price_locked = true
        erpUpdatePayload.price_locked_at = new Date()

        // Nur als Audit markieren wenn der Preis sich tatsächlich ändert
        if (oldPrice !== newPrice) {
          priceChangeAudit = {
            itemId: existingItems[0].id as string,
            oldPrice,
            newPrice,
          }
        }
      }
    }

    if (Object.keys(erpUpdatePayload).length > 0) {
      const existing = await trx("erp_inventory_item").where("release_id", id).first()
      if (existing) {
        erpUpdatePayload.updated_at = new Date()
        await trx("erp_inventory_item").where("release_id", id).update(erpUpdatePayload)
      }
      // Don't auto-create erp_inventory_item — that's done via ERP inventory session
    }

    // Preis-Change-Movement anlegen damit die Item-History im Catalog-Detail
    // (und im Session-Recent-Activity, sobald reasons auf "catalog_%" ebenfalls
    // aufgenommen werden) die Catalog-basierte Preisänderung zeigt.
    if (priceChangeAudit) {
      await createMovement(trx, {
        inventoryItemId: priceChangeAudit.itemId,
        type: "adjustment",
        quantityChange: 0,
        reason: "catalog_price_update",
        performedBy: actorId,
        reference: JSON.stringify({
          old_price: priceChangeAudit.oldPrice,
          new_price: priceChangeAudit.newPrice,
          source: "catalog_detail",
        }),
      })
    }

    // Audit-Log: track Stammdaten field changes (Zone-1 + Zone-2)
    // Zone-3 Commerce fields (shop_price, sale_mode, etc.) are tracked via
    // erp_inventory_movement and bulk_price_adjustment_log instead.
    // Hard-Stammdaten (inkl. barcode seit R1-Merge) + Zone-2 Soft-Stammdaten
    // + discogs_id (Codex 2026-05-07: Verknüpfungs-ID-Änderungen sind nach-
    // vollziehbar wichtig — vorher silent geupdated)
    const STAMMDATEN_AUDIT_FIELDS = Array.from(new Set([
      ...(HARD_STAMMDATEN_FIELDS as readonly string[]),
      "credits", "genres", "styles", "format_descriptors",
      "discogs_id",
    ]))
    const auditFields: Record<string, { oldValue: unknown; newValue: unknown }> = {}
    for (const field of STAMMDATEN_AUDIT_FIELDS) {
      if (releaseUpdates[field] !== undefined) {
        auditFields[field] = {
          oldValue: currentRelease[field],
          newValue: releaseUpdates[field],
        }
      }
    }
    if (Object.keys(auditFields).length > 0) {
      await logEdit(trx, {
        releaseId: id,
        fields: auditFields,
        actor: { id: actorId, email: actorEmail },
      })
    }
  })

  // Response-Shape muss identisch zum GET sein — das Frontend (media/[id]/page.tsx)
  // setzt setRelease(d.release) direkt und Properties wie release.price_locked
  // und release.inventory_item_id sind conditional-gerendert (z.B. Label-
  // drucken-Button). Vorher gab POST nur das plain Release-Row zurück ohne
  // erp_inventory_item-Merge → price_locked=undefined → Button verschwand
  // nach Preis-Save. Frank hit this 2026-04-22. Plus Artist/Label-JOIN
  // (rc50.1.1): Phase-2-Stammdaten-Edit ändert artistId/labelId, ohne JOIN
  // wären artist_name/label_name in der Response undefined und die UI würde
  // "—" anzeigen bis zum Reload.
  const release = await pgConnection("Release")
    .select(
      "Release.*",
      "Artist.name as artist_name",
      "Label.name as label_name",
      "Format.name as format_name",
      "Format.format_group",
      "PressOrga.name as pressorga_name"
    )
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .leftJoin("Label", "Release.labelId", "Label.id")
    .leftJoin("Format", "Release.format_id", "Format.id")
    .leftJoin("PressOrga", "Release.pressOrgaId", "PressOrga.id")
    .where("Release.id", id)
    .first()

  if (release) {
    const firstItem = await pgConnection("erp_inventory_item")
      .select(
        "id as inventory_item_id",
        "barcode as inventory_barcode",
        "status as inventory_status",
        "quantity as inventory_quantity",
        "source as inventory_source",
        "copy_number",
        "condition_media as erp_condition_media",
        "condition_sleeve as erp_condition_sleeve",
        "exemplar_price",
        "price_locked",
        "price_locked_at",
        "last_stocktake_at",
        "last_stocktake_by",
        "barcode_printed_at",
        "warehouse_location_id",
      )
      .where("release_id", id)
      .orderBy("copy_number", "asc")
      .first()

    if (firstItem) {
      Object.assign(release, firstItem)
      const relRec = release as Record<string, unknown>
      if (firstItem.erp_condition_media != null) relRec.media_condition = firstItem.erp_condition_media
      if (firstItem.erp_condition_sleeve != null) relRec.sleeve_condition = firstItem.erp_condition_sleeve
      if (firstItem.inventory_quantity != null) relRec.inventory = firstItem.inventory_quantity
      if (firstItem.exemplar_price != null) relRec.effective_price = firstItem.exemplar_price
    }
  }

  // rc53.18.1 (Codex P2#2): signal to FE if gallery replace was requested
  // but skipped because all image uploads failed — used for a toast.
  const responseBody: Record<string, unknown> = { release }
  if (gallerySkippedDueToUploadFailure) {
    responseBody.gallery_skipped = true
    responseBody.gallery_skipped_reason = "upload_failed"
  }
  res.json(responseBody)

  // Klasse-B on-demand-Reindex (rc48 §3.8) — Admin-Edit soll sofort im
  // Catalog-Listing sichtbar sein. Plus Inventory-Item-Änderungen (Warehouse,
  // Status, Stocktake-Reset) die im Admin-Catalog-Filter gefragt sind.
  pushReleaseNow(pgConnection, id).catch((err) => {
    console.warn(
      JSON.stringify({
        event: "meili_push_now_failed",
        handler: "admin_media_patch",
        release_id: id,
        error: err?.message,
      })
    )
  })

  // rc51.9.3: Storefront-Catalog-Detail nutzt ISR mit `revalidate: 60`. Ohne
  // diesen Hook wäre ein Stammdaten-Edit für bis zu 60s nicht auf der
  // Public-Page sichtbar — Frank konfundiert das mit "Apply hat nicht
  // gegriffen". Fire-and-forget; schlägt der Call fehl, läuft die übliche
  // 60s-ISR-Revalidation als Safety-Net.
  revalidateReleaseCatalogPage(id)
}
