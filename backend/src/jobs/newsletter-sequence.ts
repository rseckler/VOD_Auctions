import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendBlockNewsletter } from "../lib/brevo"

const TEASER_DAYS_BEFORE = 7
const TOMORROW_HOURS_BEFORE = 24
const ENDING_HOURS_BEFORE = 6

export default async function newsletterSequence(container: MedusaContainer) {
  const pgConnection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const now = new Date()

  console.log(`[newsletter-sequence] Running at ${now.toISOString()}`)

  // Fetch all scheduled and active blocks
  const blocks = await pgConnection("auction_block")
    .whereIn("status", ["scheduled", "active"])
    .whereNull("deleted_at")
    .select(
      "id",
      "title",
      "subtitle",
      "description",
      "slug",
      "status",
      "start_time",
      "end_time",
      "newsletter_teaser_sent_at",
      "newsletter_tomorrow_sent_at",
      "newsletter_live_sent_at",
      "newsletter_ending_sent_at"
    )

  if (blocks.length === 0) {
    console.log(`[newsletter-sequence] No scheduled/active blocks found`)
    return
  }

  for (const block of blocks) {
    const startTime = block.start_time ? new Date(block.start_time) : null
    const endTime = block.end_time ? new Date(block.end_time) : null

    try {
      // -----------------------------------------------------------------------
      // T-7: Teaser (only while scheduled, send when within 7d of start)
      // -----------------------------------------------------------------------
      if (
        block.status === "scheduled" &&
        startTime &&
        !block.newsletter_teaser_sent_at
      ) {
        const teaserWindow = new Date(startTime.getTime() - TEASER_DAYS_BEFORE * 86400_000)
        if (now >= teaserWindow) {
          console.log(`[newsletter-sequence] Sending teaser for block "${block.title}" (${block.id})`)
          const items = await fetchItems(pgConnection, block.id, 3, "lot_number", "asc")
          const itemCount = await countItems(pgConnection, block.id)
          await sendBlockNewsletter("teaser", { ...block, item_count: itemCount }, items)
          await pgConnection("auction_block")
            .where("id", block.id)
            .update({ newsletter_teaser_sent_at: now, updated_at: now })
          console.log(`[newsletter-sequence] Teaser sent for block "${block.title}"`)
        }
        continue // process only one email type per block per run
      }

      // -----------------------------------------------------------------------
      // T-24h: Tomorrow (only while scheduled, send when within 24h of start)
      // -----------------------------------------------------------------------
      if (
        block.status === "scheduled" &&
        startTime &&
        !block.newsletter_tomorrow_sent_at
      ) {
        const tomorrowWindow = new Date(startTime.getTime() - TOMORROW_HOURS_BEFORE * 3_600_000)
        if (now >= tomorrowWindow) {
          console.log(`[newsletter-sequence] Sending tomorrow email for block "${block.title}" (${block.id})`)
          const items = await fetchItems(pgConnection, block.id, 6, "lot_number", "asc")
          const itemCount = await countItems(pgConnection, block.id)
          await sendBlockNewsletter("tomorrow", { ...block, item_count: itemCount }, items)
          await pgConnection("auction_block")
            .where("id", block.id)
            .update({ newsletter_tomorrow_sent_at: now, updated_at: now })
          console.log(`[newsletter-sequence] Tomorrow email sent for block "${block.title}"`)
        }
        continue
      }

      // -----------------------------------------------------------------------
      // T+0: Live (when block is active and live email not yet sent)
      // -----------------------------------------------------------------------
      if (block.status === "active" && !block.newsletter_live_sent_at) {
        console.log(`[newsletter-sequence] Sending live email for block "${block.title}" (${block.id})`)
        const items = await fetchItems(pgConnection, block.id, 6, "lot_number", "asc")
        const itemCount = await countItems(pgConnection, block.id)
        await sendBlockNewsletter("live", { ...block, item_count: itemCount }, items)
        await pgConnection("auction_block")
          .where("id", block.id)
          .update({ newsletter_live_sent_at: now, updated_at: now })
        console.log(`[newsletter-sequence] Live email sent for block "${block.title}"`)
        continue
      }

      // -----------------------------------------------------------------------
      // T-6h: Ending (when block is active, end within 6h, ending email not yet sent)
      // -----------------------------------------------------------------------
      if (
        block.status === "active" &&
        endTime &&
        !block.newsletter_ending_sent_at
      ) {
        const endingWindow = new Date(endTime.getTime() - ENDING_HOURS_BEFORE * 3_600_000)
        if (now >= endingWindow) {
          console.log(`[newsletter-sequence] Sending ending email for block "${block.title}" (${block.id})`)
          // Fetch top 5 items by bid_count DESC for most active lots
          const topItems = await fetchItems(pgConnection, block.id, 5, "bid_count", "desc")
          await sendBlockNewsletter("ending", block, topItems)
          await pgConnection("auction_block")
            .where("id", block.id)
            .update({ newsletter_ending_sent_at: now, updated_at: now })
          console.log(`[newsletter-sequence] Ending email sent for block "${block.title}"`)
        }
        continue
      }
    } catch (err) {
      console.error(`[newsletter-sequence] Error processing block "${block.title}" (${block.id}):`, err)
      // Continue to next block rather than crashing the whole job
    }
  }

  console.log(`[newsletter-sequence] Done`)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchItems(
  pgConnection: any,
  blockId: string,
  limit: number,
  orderBy: string,
  orderDir: "asc" | "desc"
) {
  return pgConnection("block_item")
    .where("block_item.auction_block_id", blockId)
    .whereNull("block_item.deleted_at")
    .join("Release", "block_item.release_id", "Release.id")
    .leftJoin("Artist", "Release.artistId", "Artist.id")
    .orderBy(`block_item.${orderBy}`, orderDir)
    .limit(limit)
    .select(
      "block_item.lot_number",
      "block_item.start_price",
      "block_item.current_price",
      "block_item.bid_count",
      "Release.title as release_title",
      "Release.coverImage as release_cover",
      "Artist.name as release_artist"
    )
}

async function countItems(pgConnection: any, blockId: string): Promise<number> {
  const result = await pgConnection("block_item")
    .where("auction_block_id", blockId)
    .whereNull("deleted_at")
    .count("id as cnt")
    .first()
  return parseInt(String(result?.cnt ?? 0), 10)
}

export const config = {
  name: "newsletter-sequence",
  schedule: "0 * * * *", // Hourly
}
