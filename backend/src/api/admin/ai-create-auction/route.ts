import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import Anthropic from "@anthropic-ai/sdk"

// ─── Tools for the AI auction creator ────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_catalog",
    description: "Search the catalog for releases matching keywords (title, artist, label). Returns id, title, artist, label, format, year, estimated_value, legacy_price, auction_status.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query" },
        category: {
          type: "string",
          enum: ["release", "band_literature", "label_literature", "press_literature"],
          description: "Product category filter (optional)"
        },
        limit: { type: "number", description: "Max results, default 20, max 50" },
      },
      required: ["q"],
    },
  },
  {
    name: "create_auction_draft",
    description: "Create a new draft auction block. Returns the new block id and slug.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Block title" },
        slug: { type: "string", description: "URL slug (lowercase, hyphens only)" },
        subtitle: { type: "string", description: "Short subtitle (1 sentence)" },
        long_description: { type: "string", description: "Full editorial description for the block page" },
        block_type: {
          type: "string",
          enum: ["standard", "highlight", "clearance", "flash"],
          description: "Block type, default standard"
        },
        start_time: {
          type: "string",
          description: "Auction start as ISO 8601 datetime, e.g. 2026-04-15T10:00:00Z. If not specified by user, default to 7 days from now at 10:00 UTC."
        },
        end_time: {
          type: "string",
          description: "Auction end as ISO 8601 datetime. If not specified, default to start_time + 7 days."
        },
      },
      required: ["title", "slug"],
    },
  },
  {
    name: "add_items_to_block",
    description: "Add releases to the auction block as lot items. Provide an array of release IDs with optional start prices. Only call this after create_auction_draft. Returns added count and any errors.",
    input_schema: {
      type: "object",
      properties: {
        block_id: { type: "string", description: "The auction block id returned by create_auction_draft" },
        items: {
          type: "array",
          description: "Releases to add",
          items: {
            type: "object",
            properties: {
              release_id: { type: "string" },
              start_price: { type: "number", description: "Start price in EUR (whole number). If omitted, calculated from estimated_value or legacy_price." },
            },
            required: ["release_id"],
          },
        },
      },
      required: ["block_id", "items"],
    },
  },
]

// ─── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  pg: Knex
): Promise<unknown> {
  switch (name) {
    case "search_catalog": {
      const limit = Math.min(Number(input.limit) || 20, 50)
      let query = pg("Release")
        .select(
          "Release.id",
          "Release.title",
          "Release.product_category",
          "Release.format",
          "Release.year",
          "Release.estimated_value",
          "Release.legacy_price",
          "Release.auction_status",
          "Artist.name as artist_name",
          "Label.name as label_name"
        )
        .leftJoin("Artist", "Artist.id", "Release.artistId")
        .leftJoin("Label", "Label.id", "Release.labelId")
        .whereNotNull("Release.coverImage")
        .where("Release.auction_status", "available")
        .orderBy("Release.estimated_value", "desc")
        .limit(limit)

      if (input.category) query = query.where("Release.product_category", input.category as string)
      if (input.q) {
        const q = `%${input.q}%`
        query = query.where(function () {
          this.whereILike("Release.title", q)
            .orWhereILike("Artist.name", q)
            .orWhereILike("Label.name", q)
        })
      }

      const rows = await query
      return {
        releases: rows.map((r: any) => ({
          id: r.id,
          title: r.title,
          artist: r.artist_name,
          label: r.label_name,
          format: r.format,
          year: r.year,
          estimated_value: r.estimated_value ? parseFloat(r.estimated_value) : null,
          legacy_price: r.legacy_price ? parseFloat(r.legacy_price) : null,
          auction_status: r.auction_status,
        })),
        count: rows.length,
      }
    }

    case "create_auction_draft": {
      const slug = (input.slug as string)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 200)

      // Default dates: start = 7 days from now at 10:00 UTC, end = start + 7 days
      const now = new Date()
      const defaultStart = new Date(now)
      defaultStart.setUTCDate(defaultStart.getUTCDate() + 7)
      defaultStart.setUTCHours(10, 0, 0, 0)
      const defaultEnd = new Date(defaultStart)
      defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 7)

      const startTime = input.start_time
        ? new Date(input.start_time as string)
        : defaultStart
      const endTime = input.end_time
        ? new Date(input.end_time as string)
        : new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000)

      const blockId = generateEntityId("", "aublk")
      const insertNow = new Date()
      await pg("auction_block").insert({
        id: blockId,
        title: input.title as string,
        slug,
        subtitle: (input.subtitle as string | undefined) || null,
        long_description: (input.long_description as string | undefined) || null,
        short_description: null,
        block_type: (input.block_type as string | undefined) || "standard",
        status: "draft",
        start_time: startTime,
        end_time: endTime,
        preview_from: null,
        staggered_ending: false,
        stagger_interval_seconds: 120,
        default_start_price_percent: 50,
        auto_extend: true,
        extension_minutes: 5,
        created_at: insertNow,
        updated_at: insertNow,
      })

      return {
        block_id: blockId,
        slug,
        title: input.title as string,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        admin_url: `/app/auction-blocks/${blockId}`,
      }
    }

    case "add_items_to_block": {
      const blockId = input.block_id as string
      const items = input.items as { release_id: string; start_price?: number }[]

      // Fetch releases to calculate start prices
      const releaseIds = items.map((i) => i.release_id)
      const releases = await pg("Release")
        .select("id", "estimated_value", "legacy_price")
        .whereIn("id", releaseIds)

      const releaseMap: Record<string, any> = {}
      releases.forEach((r: any) => { releaseMap[r.id] = r })

      const added: string[] = []
      const errors: string[] = []
      let lotNumber = 1

      // Get current lot count
      const [countRow] = await pg("block_item")
        .where("auction_block_id", blockId)
        .count("id as n")
      lotNumber = (Number(countRow?.n) || 0) + 1

      for (const item of items) {
        try {
          const release = releaseMap[item.release_id]
          if (!release) {
            errors.push(`Release ${item.release_id} not found`)
            continue
          }

          let startPrice = item.start_price
          if (!startPrice) {
            const ev = release.estimated_value ? parseFloat(release.estimated_value) : null
            const lp = release.legacy_price ? parseFloat(release.legacy_price) : null
            startPrice = ev ? Math.round(ev * 0.5) : lp ? Math.round(lp * 0.5) : 1
          }

          const now = new Date()
          const id = generateEntityId("", "bitem")
          await pg("block_item").insert({
            id,
            auction_block_id: blockId,
            release_id: item.release_id,
            start_price: startPrice,
            current_price: startPrice,
            estimated_value: release.estimated_value ? parseFloat(release.estimated_value) : null,
            lot_number: lotNumber++,
            status: "active",
            bid_count: 0,
            created_at: now,
            updated_at: now,
          })

          // Mark release as reserved
          await pg("Release")
            .where("id", item.release_id)
            .update({ auction_status: "reserved", updatedAt: now })

          added.push(item.release_id)
        } catch (err: any) {
          errors.push(`${item.release_id}: ${err?.message || "unknown error"}`)
        }
      }

      return {
        added_count: added.length,
        errors: errors.length ? errors : undefined,
        block_id: blockId,
      }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an AI assistant that creates curated auction blocks for VOD Auctions, a platform selling ~41,500 industrial music releases (vinyl, CDs, tapes, and literature).

Your job: given a brief from the admin, search the catalog, pick the best matching available items, create a themed draft auction block, and add the items.

Guidelines:
- Search the catalog multiple times with different queries to find good matches (artist names, genres, labels, time periods).
- Prefer items with estimated_value set — they are better curated for auction.
- Aim for 10–25 items unless the brief specifies otherwise.
- Only include items with auction_status = "available" (the search already filters this).
- Create a compelling title, slug, and long_description that fits the theme.
- For start_time/end_time: extract from the user's brief if provided (convert to ISO 8601 UTC). If the user does NOT mention dates or times, omit start_time and end_time entirely — the tool will apply sensible defaults automatically. Never ask the user for dates; just proceed.
- For start_price: use estimated_value × 50% if available, otherwise legacy_price × 50%, minimum €1. Round to whole euros.
- After adding items, report what you created and list the items with titles and start prices.
- Always call create_auction_draft before add_items_to_block.
- Be efficient: search 2–4 times max, then commit.`

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" })
    return
  }

  const { brief } = req.body as { brief: string }
  if (!brief?.trim()) {
    res.status(400).json({ error: "brief is required" })
    return
  }

  // SSE streaming setup
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const anthropic = new Anthropic({ apiKey })

  try {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: brief },
    ]

    let iteration = 0
    const MAX_ITERATIONS = 10

    while (iteration < MAX_ITERATIONS) {
      iteration++

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      })

      for (const block of response.content) {
        if (block.type === "text") {
          send({ type: "text", text: block.text })
        } else if (block.type === "tool_use") {
          send({ type: "tool_call", tool: block.name, input: block.input })
        }
      }

      if (response.stop_reason === "end_turn") {
        break
      }

      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const block of response.content) {
          if (block.type === "tool_use") {
            try {
              const result = await executeTool(
                block.name,
                block.input as Record<string, unknown>,
                pg
              )
              send({ type: "tool_result", tool: block.name, result })
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(result),
              })
            } catch (err: any) {
              const errMsg = err?.message || "Tool execution failed"
              send({ type: "tool_error", tool: block.name, error: errMsg })
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify({ error: errMsg }),
                is_error: true,
              })
            }
          }
        }

        messages.push({ role: "assistant", content: response.content })
        messages.push({ role: "user", content: toolResults })
      } else {
        break
      }
    }

    send({ type: "done" })
  } catch (err: any) {
    send({ type: "error", message: err?.message || "Unknown error" })
  } finally {
    res.end()
  }
}
