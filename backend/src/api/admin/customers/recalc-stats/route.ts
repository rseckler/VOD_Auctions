import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"

const VIP_THRESHOLD = 500
const DORMANT_DAYS = 90

// POST /admin/customers/recalc-stats — Force recalculate customer_stats for all customers
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  try {
    const now = new Date()
    const dormantCutoff = new Date(now.getTime() - DORMANT_DAYS * 24 * 60 * 60 * 1000)

    const rows = await pgConnection.raw(`
      SELECT
        c.id AS customer_id,
        COALESCE(tx.total_spent, 0) AS total_spent,
        COALESCE(tx.total_purchases, 0) AS total_purchases,
        tx.last_purchase_at,
        tx.first_purchase_at,
        COALESCE(b.total_bids, 0) AS total_bids,
        COALESCE(b.total_wins, 0) AS total_wins,
        b.last_bid_at
      FROM customer c
      LEFT JOIN (
        SELECT
          user_id,
          SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS total_spent,
          COUNT(CASE WHEN status = 'paid' THEN id END) AS total_purchases,
          MAX(CASE WHEN status = 'paid' THEN updated_at END) AS last_purchase_at,
          MIN(CASE WHEN status = 'paid' THEN updated_at END) AS first_purchase_at
        FROM transaction
        WHERE deleted_at IS NULL
        GROUP BY user_id
      ) tx ON tx.user_id = c.id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(id) AS total_bids,
          COUNT(CASE WHEN is_winning = true THEN id END) AS total_wins,
          MAX(created_at) AS last_bid_at
        FROM bid
        GROUP BY user_id
      ) b ON b.user_id = c.id
      WHERE c.deleted_at IS NULL
    `)

    const customers = rows.rows as Array<{
      customer_id: string
      total_spent: string
      total_purchases: string
      total_bids: string
      total_wins: string
      last_purchase_at: Date | null
      first_purchase_at: Date | null
      last_bid_at: Date | null
    }>

    let upserted = 0
    for (const row of customers) {
      const totalSpent = Number(row.total_spent)
      const lastPurchaseAt = row.last_purchase_at
      const isDormant = lastPurchaseAt ? lastPurchaseAt < dormantCutoff : false
      const isVip = totalSpent >= VIP_THRESHOLD

      await pgConnection.raw(`
        INSERT INTO customer_stats (
          id, customer_id, total_spent, total_purchases, total_bids, total_wins,
          last_purchase_at, first_purchase_at, last_bid_at,
          tags, is_vip, is_dormant, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, NOW())
        ON CONFLICT (customer_id) DO UPDATE SET
          total_spent = EXCLUDED.total_spent,
          total_purchases = EXCLUDED.total_purchases,
          total_bids = EXCLUDED.total_bids,
          total_wins = EXCLUDED.total_wins,
          last_purchase_at = EXCLUDED.last_purchase_at,
          first_purchase_at = EXCLUDED.first_purchase_at,
          last_bid_at = EXCLUDED.last_bid_at,
          is_vip = EXCLUDED.is_vip,
          is_dormant = EXCLUDED.is_dormant,
          updated_at = NOW()
      `, [
        generateEntityId(),
        row.customer_id,
        totalSpent,
        Number(row.total_purchases),
        Number(row.total_bids),
        Number(row.total_wins),
        lastPurchaseAt,
        row.first_purchase_at,
        row.last_bid_at,
        isVip,
        isDormant,
      ])
      upserted++
    }

    res.json({ ok: true, upserted })
  } catch (err: any) {
    console.error("[recalc-stats] Error:", err.message)
    res.status(500).json({ message: err.message })
  }
}
