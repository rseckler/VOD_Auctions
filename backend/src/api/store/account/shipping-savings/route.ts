import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// Weight estimates by format
const FORMAT_WEIGHTS: Record<string, number> = {
  LP: 350,
  "12\"": 350,
  "10\"": 280,
  "7\"": 120,
  CD: 120,
  Cassette: 80,
  VHS: 200,
}
const DEFAULT_WEIGHT = 150

// Simple zone-based shipping cost
const ZONE_SHIPPING: Record<string, number> = {
  de: 4.99,
  eu: 9.99,
  world: 14.99,
}

// Country → zone mapping
const DE_CODES = ["DE"]
const EU_CODES = [
  "AT", "BE", "BG", "CY", "CZ", "DK", "EE", "FI", "FR", "GR", "HR",
  "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
  "SE", "SI", "SK", "ES",
]

function getZone(countryCode: string): string {
  const upper = countryCode.toUpperCase()
  if (DE_CODES.includes(upper)) return "de"
  if (EU_CODES.includes(upper)) return "eu"
  return "world"
}

function estimateWeight(format: string | null): number {
  if (!format) return DEFAULT_WEIGHT
  // Check exact match first, then partial
  if (FORMAT_WEIGHTS[format]) return FORMAT_WEIGHTS[format]
  const lower = format.toLowerCase()
  if (lower.includes("lp") || lower.includes("12")) return 350
  if (lower.includes("10")) return 280
  if (lower.includes("7")) return 120
  if (lower.includes("cd")) return 120
  if (lower.includes("cassette") || lower.includes("tape") || lower.includes("mc")) return 80
  if (lower.includes("vhs")) return 200
  return DEFAULT_WEIGHT
}

// GET /store/account/shipping-savings?country=DE
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { country = "DE" } = req.query as Record<string, string>

  // Get unpaid auction wins (pending transactions)
  const unpaidWins = await pgConnection("transaction")
    .select(
      "transaction.id",
      "transaction.release_id",
      "Release.format"
    )
    .leftJoin("Release", "Release.id", "transaction.release_id")
    .where("transaction.user_id", customerId)
    .where("transaction.status", "pending")
    .where("transaction.item_type", "auction")

  // Get cart items
  const cartItems = await pgConnection("cart_item")
    .select(
      "cart_item.id",
      "cart_item.release_id",
      "Release.format"
    )
    .join("Release", "Release.id", "cart_item.release_id")
    .where("cart_item.user_id", customerId)
    .whereNull("cart_item.deleted_at")

  // Calculate weights per category
  let unpaidWinsWeight = 0
  for (const item of unpaidWins) {
    unpaidWinsWeight += estimateWeight(item.format)
  }
  let cartWeight = 0
  for (const item of cartItems) {
    cartWeight += estimateWeight(item.format)
  }
  const totalWeight = unpaidWinsWeight + cartWeight

  const zone = getZone(country)
  const baseShipping = ZONE_SHIPPING[zone] || 14.99
  const itemsCount = unpaidWins.length + cartItems.length

  // Next shipping tier threshold (2kg standard parcel limit for combined shipping)
  const nextTierAt = 2000
  const remainingCapacity = Math.max(0, nextTierAt - totalWeight)
  const avgItemWeight = 350 // typical LP weight
  const estimatedItemsCapacity = Math.floor(remainingCapacity / avgItemWeight)

  // Savings: if each item shipped individually vs combined
  const savingsVsIndividual = itemsCount > 1
    ? (itemsCount - 1) * baseShipping
    : 0

  res.json({
    unpaid_wins: unpaidWins.length,
    unpaid_wins_weight_g: unpaidWinsWeight,
    cart_items: cartItems.length,
    cart_weight_g: cartWeight,
    total_weight_g: totalWeight,
    shipping_cost: baseShipping,
    next_tier_at_g: nextTierAt,
    remaining_capacity_g: remainingCapacity,
    estimated_items_capacity: estimatedItemsCapacity,
    savings_vs_individual: Math.round(savingsVsIndividual * 100) / 100,
    items_count: itemsCount,
    zone_slug: zone,
  })
}
