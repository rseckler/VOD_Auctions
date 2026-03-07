import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import {
  sendCampaign,
  isBrevoConfigured,
  BREVO_LIST_VOD_AUCTIONS,
  BREVO_LIST_TAPE_MAG,
} from "../../../../lib/brevo"

// POST /admin/newsletter/send — Send a newsletter campaign
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!isBrevoConfigured()) {
    res.status(400).json({ message: "Brevo not configured" })
    return
  }

  const { type, subject, templateId, listIds, block_id, scheduledAt } =
    req.body as {
      type: "campaign" | "block_announcement"
      subject?: string
      templateId?: number
      listIds?: number[]
      block_id?: string
      scheduledAt?: string
    }

  if (!type) {
    res.status(400).json({ message: "type is required" })
    return
  }

  try {
    if (type === "block_announcement" && block_id) {
      // Aggregate block data for announcement
      const pgConnection: Knex = req.scope.resolve(
        ContainerRegistrationKeys.PG_CONNECTION
      )

      const block = await pgConnection("auction_block")
        .where("id", block_id)
        .first()

      if (!block) {
        res.status(404).json({ message: "Block not found" })
        return
      }

      // Get top 5 items with release data
      const items = await pgConnection("block_item")
        .join("Release", "Release.id", "block_item.release_id")
        .leftJoin("ReleaseArtist", "ReleaseArtist.releaseId", "Release.id")
        .leftJoin("Artist", "Artist.id", "ReleaseArtist.artistId")
        .where("block_item.block_id", block_id)
        .select(
          "block_item.id",
          "block_item.start_price",
          "Release.title as release_title",
          "Release.coverImage as cover_image",
          "Artist.name as artist_name"
        )
        .orderBy("block_item.lot_number", "asc")
        .limit(5)

      const targetLists = [BREVO_LIST_VOD_AUCTIONS, BREVO_LIST_TAPE_MAG].filter(
        (id) => id > 0
      )

      if (!targetLists.length) {
        res.status(400).json({ message: "No newsletter lists configured" })
        return
      }

      // Use Brevo template if provided, otherwise require templateId
      if (!templateId) {
        res
          .status(400)
          .json({ message: "templateId is required for block announcements" })
        return
      }

      const campaign = await sendCampaign({
        name: `Auction: ${block.title}`,
        subject: subject || `New Auction: ${block.title}`,
        templateId,
        listIds: targetLists,
        params: {
          BLOCK_TITLE: block.title,
          BLOCK_SUBTITLE: block.subtitle || "",
          BLOCK_DESCRIPTION: block.short_description || "",
          BLOCK_START: block.start_time,
          BLOCK_END: block.end_time,
          BLOCK_URL: `https://vod-auctions.com/auctions/${block.slug}`,
          ITEMS: items.map((item: any) => ({
            title: item.release_title,
            artist: item.artist_name || "Various",
            price: Number(item.start_price).toFixed(2),
            image: item.cover_image
              ? `https://tape-mag.com/bilder/gross/${item.cover_image}`
              : "",
          })),
          ITEM_COUNT: items.length,
        },
        scheduledAt,
      })

      console.log(
        `[newsletter] Block announcement sent: ${block.title} (campaign ${campaign.id})`
      )
      res.json({ success: true, campaign_id: campaign.id })
    } else if (type === "campaign") {
      // Generic campaign send
      if (!subject || !templateId) {
        res
          .status(400)
          .json({ message: "subject and templateId are required" })
        return
      }

      const targetLists = listIds?.length
        ? listIds
        : [BREVO_LIST_VOD_AUCTIONS, BREVO_LIST_TAPE_MAG].filter(
            (id) => id > 0
          )

      const campaign = await sendCampaign({
        name: subject,
        subject,
        templateId,
        listIds: targetLists,
        scheduledAt,
      })

      console.log(`[newsletter] Campaign sent: ${subject} (${campaign.id})`)
      res.json({ success: true, campaign_id: campaign.id })
    } else {
      res.status(400).json({ message: "Invalid type" })
    }
  } catch (err: any) {
    console.error("[newsletter/send] Error:", err.message)
    res.status(500).json({ message: err.message || "Failed to send campaign" })
  }
}
