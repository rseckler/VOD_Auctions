import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"

// POST /admin/media/bulk — Bulk update releases
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pgConnection: Knex = req.scope.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  )

  const { ids, updates } = req.body as {
    ids: string[]
    updates: Record<string, any>
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: "ids must be a non-empty array" })
    return
  }

  if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
    res.status(400).json({ message: "updates must be a non-empty object" })
    return
  }

  const allowedFields = [
    "estimated_value",
    "media_condition",
    "sleeve_condition",
    "auction_status",
  ]

  const sanitized: Record<string, any> = {}
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      sanitized[field] = updates[field]
    }
  }

  if (Object.keys(sanitized).length === 0) {
    res.status(400).json({
      message: `No valid fields to update. Allowed: ${allowedFields.join(", ")}`,
    })
    return
  }

  // Validate media_condition / sleeve_condition
  const validConditions = ["Mint (M)", "Near Mint (NM or M-)", "Very Good Plus (VG+)", "Very Good (VG)", "Good Plus (G+)", "Good (G)", "Fair (F)", "Poor (P)"]
  if (sanitized.media_condition && !validConditions.includes(sanitized.media_condition)) {
    res.status(400).json({ message: `Invalid media_condition. Must be one of: ${validConditions.join(", ")}` })
    return
  }
  if (sanitized.sleeve_condition && !validConditions.includes(sanitized.sleeve_condition)) {
    res.status(400).json({ message: `Invalid sleeve_condition. Must be one of: ${validConditions.join(", ")}` })
    return
  }

  // Validate auction_status
  const validStatuses = ["available", "reserved", "in_auction", "sold", "unsold"]
  if (sanitized.auction_status && !validStatuses.includes(sanitized.auction_status)) {
    res.status(400).json({ message: `Invalid auction_status. Must be one of: ${validStatuses.join(", ")}` })
    return
  }

  // Validate estimated_value
  if (sanitized.estimated_value !== undefined) {
    const val = Number(sanitized.estimated_value)
    if (isNaN(val) || val < 0) {
      res.status(400).json({ message: "estimated_value must be a non-negative number" })
      return
    }
    sanitized.estimated_value = val
  }

  sanitized.updatedAt = new Date()

  const updated = await pgConnection("Release")
    .whereIn("id", ids)
    .update(sanitized)

  res.json({ updated_count: updated })
}
