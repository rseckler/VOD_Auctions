import { z } from "zod"

export const CreateAuctionBlockSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional(),
  status: z
    .enum(["draft", "scheduled", "preview", "active", "ended", "archived"])
    .optional()
    .default("draft"),
  start_time: z.string().datetime().optional().nullable(),
  end_time: z.string().datetime().optional().nullable(),
  staggered_ending: z.boolean().optional().default(false),
  stagger_interval_minutes: z.number().int().min(1).max(60).optional(),
  newsletter_list_id: z.number().int().optional().nullable(),
})

export const CreateBlockItemSchema = z.object({
  release_id: z.string().min(1),
  lot_number: z.number().int().min(1),
  // start_price: optional. Wenn nicht angegeben, berechnet der POST-Handler
  // den Default aus round(shop_price × block.default_start_price_percent / 100),
  // Fallback shop_price → estimated_value → legacy_price → 400.
  start_price: z.number().min(0).optional().nullable(),
  reserve_price: z.number().min(0).optional().nullable(),
  condition_grade: z
    .enum(["M", "NM", "VG+", "VG", "G+", "G", "F", "P"])
    .optional()
    .nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

export const UpdateTransactionSchema = z.object({
  action: z.enum(["ship", "refund", "note", "cancel", "mark_paid", "packing", "label_printed", "mark_refunded"]),
  tracking_number: z.string().optional(),
  carrier: z.string().optional(),
  note: z.string().max(2000).optional(),
  refund_amount: z.number().min(0).optional(),
  refund_reason: z.string().optional(),
})

export const BulkShipSchema = z.object({
  transaction_ids: z.array(z.string()).min(1).max(100),
  tracking_number: z.string().optional(),
  carrier: z.string().optional(),
})

export const BulkActionSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
  action: z.enum(["packing", "label_printed"]),
})

export function validateBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown
): { data: T } | { error: string; details: z.ZodError } {
  const result = schema.safeParse(body)
  if (!result.success) {
    return { error: "Validation failed", details: result.error }
  }
  return { data: result.data }
}
