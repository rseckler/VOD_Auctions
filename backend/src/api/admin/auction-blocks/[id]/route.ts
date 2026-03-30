import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import AuctionModuleService from "../../../../modules/auction/service"
import { AUCTION_MODULE } from "../../../../modules/auction"

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["scheduled"],
  scheduled: ["preview", "active", "ended"],
  preview: ["active", "ended"],
  active: ["ended"],
  ended: ["archived"],
}

// GET /admin/auction-blocks/:id — Get block detail with enriched items
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const block = await auctionService.retrieveAuctionBlock(req.params.id, {
    relations: ["items"],
  })

  // Enrich items with Release data (artist, title)
  if (block.items && block.items.length > 0) {
    const releaseIds = block.items.map((i: any) => i.release_id).filter(Boolean)
    if (releaseIds.length > 0) {
      const releases = await pgConnection("Release")
        .select(
          "Release.id",
          "Release.title",
          "Release.format",
          "Release.coverImage",
          "Artist.name as artist_name"
        )
        .leftJoin("Artist", "Release.artistId", "Artist.id")
        .whereIn("Release.id", releaseIds)

      const releaseMap = new Map(releases.map((r: any) => [r.id, r]))
      block.items = block.items.map((item: any) => {
        const rel = releaseMap.get(item.release_id)
        return {
          ...item,
          release_title: rel?.title || null,
          release_artist: rel?.artist_name || null,
          release_format: rel?.format || null,
          release_cover: rel?.coverImage || null,
        }
      })
    }
  }

  res.json({ auction_block: block })
}

// POST /admin/auction-blocks/:id — Update block (with status transition validation)
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)

  const newStatus = req.body.status
  if (newStatus) {
    // Load current block to validate transition
    const current = await auctionService.retrieveAuctionBlock(req.params.id, {
      relations: ["items"],
    })

    const currentStatus = current.status
    if (newStatus !== currentStatus) {
      const allowed = VALID_TRANSITIONS[currentStatus] || []
      if (!allowed.includes(newStatus)) {
        res.status(400).json({
          message: `Invalid status transition: ${currentStatus} → ${newStatus}`,
        })
        return
      }

      // Validation for draft → scheduled
      if (currentStatus === "draft" && newStatus === "scheduled") {
        const errors: string[] = []
        if (!current.title?.trim()) errors.push("Title is required")
        if (!current.slug?.trim()) errors.push("Slug is required")
        if (!current.start_time) errors.push("Start time is required")
        if (!current.end_time) errors.push("End time is required")
        if (
          current.start_time &&
          current.end_time &&
          new Date(current.start_time) >= new Date(current.end_time)
        ) {
          errors.push("Start time must be before end time")
        }
        if (!current.items || current.items.length === 0) {
          errors.push("At least one product must be assigned")
        }
        if (errors.length > 0) {
          res.status(400).json({ message: errors.join(". ") })
          return
        }
      }
    }
  }

  // Strip relations from body — items are managed via /items endpoint
  const { items, ...updateData } = req.body

  const block = await auctionService.updateAuctionBlocks({
    id: req.params.id,
    ...updateData,
  })

  res.json({ auction_block: block })
}

// DELETE /admin/auction-blocks/:id — Delete block (only draft, ended, archived)
export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const auctionService: AuctionModuleService = req.scope.resolve(AUCTION_MODULE)
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const DELETABLE_STATUSES = ["draft", "ended", "archived"]

  // Load block to check status
  let block: any
  try {
    block = await auctionService.retrieveAuctionBlock(req.params.id, {
      relations: ["items"],
    })
  } catch {
    res.status(404).json({ message: "Auction block not found" })
    return
  }

  if (!DELETABLE_STATUSES.includes(block.status)) {
    res.status(409).json({
      message: `Cannot delete active auction`,
    })
    return
  }

  // 1. Release all associated releases back to 'available'
  const itemRows = await pgConnection("block_item")
    .select("release_id")
    .where("auction_block_id", req.params.id)

  const releaseIds = itemRows.map((r: any) => r.release_id).filter(Boolean)
  if (releaseIds.length > 0) {
    await pgConnection("Release")
      .whereIn("id", releaseIds)
      .update({ auction_status: "available" })
  }

  // 2. Delete all block_item rows for this block
  await pgConnection("block_item")
    .where("auction_block_id", req.params.id)
    .delete()

  // 3. Delete the auction_block row
  await auctionService.deleteAuctionBlocks(req.params.id)

  res.status(200).json({ success: true })
}
