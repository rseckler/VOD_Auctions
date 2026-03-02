import { model } from "@medusajs/framework/utils"

const AuctionBlock = model.define("auction_block", {
  id: model.id().primaryKey(),

  // Basis
  title: model.text(),
  subtitle: model.text().nullable(),
  slug: model.text(),

  // Zeitplan
  start_time: model.dateTime(),
  end_time: model.dateTime(),
  preview_from: model.dateTime().nullable(),

  // Status: draft | scheduled | preview | active | ended | archived
  status: model.text().default("draft"),

  // Block-Typ: theme | highlight | clearance | flash
  block_type: model.text().default("theme"),

  // Redaktioneller Content
  short_description: model.text().nullable(),
  long_description: model.text().nullable(),
  header_image: model.text().nullable(),
  video_url: model.text().nullable(),
  audio_url: model.text().nullable(),

  // Einstellungen
  staggered_ending: model.boolean().default(false),
  stagger_interval_seconds: model.number().default(120),
  default_start_price_percent: model.number().default(50),
  auto_extend: model.boolean().default(true),
  extension_minutes: model.number().default(5),

  // Ergebnisse (nach Ende)
  total_revenue: model.float().nullable(),
  total_items: model.number().nullable(),
  sold_items: model.number().nullable(),
  total_bids: model.number().nullable(),

  // Relations
  items: model.hasMany(() => BlockItem),
})

export default AuctionBlock

// Forward reference resolved below
import BlockItem from "./block-item"
