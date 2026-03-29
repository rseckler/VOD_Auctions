import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import Anthropic from "@anthropic-ai/sdk"

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_dashboard_stats",
    description: "Get a summary of key platform stats: active auctions, pending orders, unpaid wins, catalog size.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_auction_blocks",
    description: "List auction blocks, optionally filtered by status (draft/scheduled/preview/active/ended/archived).",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "scheduled", "preview", "active", "ended", "archived"], description: "Filter by block status" },
        limit: { type: "number", description: "Max results, default 10" },
      },
      required: [],
    },
  },
  {
    name: "search_transactions",
    description: "Search orders/transactions by customer name, email, order number, or filter by status/fulfillment.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query (name, email, order number)" },
        status: { type: "string", enum: ["pending", "paid", "refunded", "partially_refunded", "cancelled", "failed"], description: "Payment status filter" },
        fulfillment_status: { type: "string", enum: ["unfulfilled", "packing", "shipped", "delivered", "returned"], description: "Fulfillment status filter" },
        limit: { type: "number", description: "Max results, default 10" },
      },
      required: [],
    },
  },
  {
    name: "search_media",
    description: "Search the catalog of ~41,500 releases by title, artist, label, format or category.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query (title, artist, label)" },
        category: { type: "string", enum: ["release", "band_literature", "label_literature", "press_literature"], description: "Product category" },
        limit: { type: "number", description: "Max results, default 10" },
      },
      required: [],
    },
  },
  {
    name: "get_system_health",
    description: "Get the current health status of all platform services (DB, Stripe, PayPal, Resend, etc.).",
    input_schema: { type: "object", properties: {}, required: [] },
  },
]

// ─── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  pg: Knex
): Promise<unknown> {
  switch (name) {
    case "get_dashboard_stats": {
      const [activeBlocks] = await pg("auction_block").where("status", "active").count("id as n")
      const [pendingTx] = await pg("transaction").where("status", "pending").count("id as n")
      const [unpaidWins] = await pg("transaction")
        .where("status", "pending")
        .whereNotNull("block_item_id")
        .count("id as n")
      const [catalogCount] = await pg("Release").count("id as n")
      const [revenueRow] = await pg("transaction")
        .where("status", "paid")
        .sum("total_amount as total")
      return {
        active_auctions: Number(activeBlocks.n),
        pending_orders: Number(pendingTx.n),
        unpaid_auction_wins: Number(unpaidWins.n),
        catalog_size: Number(catalogCount.n),
        total_revenue_paid: parseFloat(revenueRow.total || "0").toFixed(2) + " EUR",
      }
    }

    case "list_auction_blocks": {
      const limit = Math.min(Number(input.limit) || 10, 50)
      let query = pg("auction_block")
        .select("id", "title", "slug", "status", "block_type", "start_time", "end_time", "created_at")
        .orderBy("created_at", "desc")
        .limit(limit)
      if (input.status) query = query.where("status", input.status as string)
      const blocks = await query
      return { blocks, count: blocks.length }
    }

    case "search_transactions": {
      const limit = Math.min(Number(input.limit) || 10, 50)
      let query = pg("transaction")
        .select(
          "transaction.id",
          "transaction.order_number",
          "transaction.status",
          "transaction.fulfillment_status",
          "transaction.total_amount",
          "transaction.payment_provider",
          "transaction.created_at",
          "customer.email as customer_email",
          pg.raw("COALESCE(customer.first_name || ' ' || customer.last_name, transaction.shipping_name) as customer_name"),
          "Release.title as release_title"
        )
        .leftJoin("customer", "customer.id", "transaction.user_id")
        .leftJoin("block_item", "block_item.id", "transaction.block_item_id")
        .leftJoin(
          "Release",
          "Release.id",
          pg.raw("COALESCE(block_item.release_id, transaction.release_id)")
        )
        .orderBy("transaction.created_at", "desc")
        .limit(limit)

      if (input.status) query = query.where("transaction.status", input.status as string)
      if (input.fulfillment_status) query = query.where("transaction.fulfillment_status", input.fulfillment_status as string)
      if (input.q) {
        const q = `%${input.q}%`
        query = query.where(function () {
          this.whereILike("customer.first_name", q)
            .orWhereILike("customer.last_name", q)
            .orWhereILike("customer.email", q)
            .orWhereILike("transaction.order_number", q)
            .orWhereILike("transaction.shipping_name", q)
        })
      }

      const rows = await query
      return {
        transactions: rows.map((t: any) => ({
          ...t,
          total_amount: parseFloat(t.total_amount).toFixed(2) + " EUR",
        })),
        count: rows.length,
      }
    }

    case "search_media": {
      const limit = Math.min(Number(input.limit) || 10, 50)
      let query = pg("Release")
        .select(
          "Release.id",
          "Release.title",
          "Release.article_number",
          "Release.product_category",
          "Release.legacy_price",
          "Release.sale_mode",
          "Artist.name as artist_name",
          "Label.name as label_name"
        )
        .leftJoin("Artist", "Artist.id", "Release.artistId")
        .leftJoin("Label", "Label.id", "Release.labelId")
        .orderBy("Release.title", "asc")
        .limit(limit)

      if (input.category) query = query.where("Release.product_category", input.category as string)
      if (input.q) {
        const q = `%${input.q}%`
        query = query.where(function () {
          this.whereILike("Release.title", q)
            .orWhereILike("Artist.name", q)
            .orWhereILike("Label.name", q)
            .orWhereILike("Release.article_number", q)
        })
      }

      const rows = await query
      return {
        releases: rows.map((r: any) => ({
          ...r,
          legacy_price: r.legacy_price ? parseFloat(r.legacy_price).toFixed(2) + " EUR" : null,
        })),
        count: rows.length,
      }
    }

    case "get_system_health": {
      // Lightweight DB check
      try {
        await pg.raw("SELECT 1")
        return {
          database: "ok",
          note: "For full service health (Stripe, PayPal, etc.) visit /app/system-health",
        }
      } catch {
        return { database: "error", note: "Database connection failed" }
      }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the VOD Auctions admin assistant. You help the admin (Robin) manage the auction platform for ~41,500 industrial music releases.

Platform overview:
- ~41,500 releases (vinyl, CDs, tapes, literature) in the catalog
- Auction blocks: themed groups of lots (draft → scheduled → preview → active → ended → archived)
- Transactions/Orders: paid via Stripe or PayPal, fulfilled by shipping
- Customers: registered bidders and buyers

Available tools:
- get_dashboard_stats: platform-wide KPI snapshot
- list_auction_blocks: list blocks by status
- search_transactions: find orders by customer, status, order number
- search_media: search the release catalog
- get_system_health: database connectivity

Guidelines:
- Be concise and direct. Use short, readable answers.
- When showing data, format it clearly (markdown tables if helpful).
- You are read-only for now. If asked to create/update/delete something, explain that write operations aren't available yet.
- Always respond in the same language the user writes in (German or English).`

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

  const { messages } = req.body as { messages: Anthropic.MessageParam[] }
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "messages array required" })
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
    // Agentic loop: Claude may call multiple tools before final answer
    const conversationMessages: Anthropic.MessageParam[] = [...messages]
    let iteration = 0
    const MAX_ITERATIONS = 5

    while (iteration < MAX_ITERATIONS) {
      iteration++

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: conversationMessages,
      })

      // Stream text blocks to client as they come
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
        // Execute tools and build tool_result message
        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const block of response.content) {
          if (block.type === "tool_use") {
            try {
              const result = await executeTool(block.name, block.input as Record<string, unknown>, pg)
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

        // Continue conversation with tool results
        conversationMessages.push({ role: "assistant", content: response.content })
        conversationMessages.push({ role: "user", content: toolResults })
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
