// Core domain types for VOD Auctions backend

export interface Bid {
  id: string
  block_item_id: string
  user_id: string
  amount: string | number
  max_amount: string | number | null
  is_winning: boolean
  is_outbid: boolean
  created_at: Date
  updated_at: Date
}

export interface BlockItem {
  id: string
  auction_block_id: string
  release_id: string
  lot_number: number
  lot_label: string
  start_price: string | number
  current_price: string | number | null
  reserve_price: string | number | null
  bid_count: number
  auction_status: "available" | "reserved" | "in_auction" | "sold" | "unsold"
  lot_end_time: Date | null
  condition_grade: string | null
  view_count: number
  extension_count: number
}

export interface Transaction {
  id: string
  order_group_id: string
  order_number: string | null
  user_id: string
  release_id: string
  block_item_id: string | null
  item_type: "auction" | "direct_purchase"
  status: "pending" | "paid" | "refunded" | "partially_refunded" | "cancelled" | "failed"
  fulfillment_status: "unfulfilled" | "packing" | "shipped" | "delivered" | "returned"
  payment_provider: "stripe" | "paypal" | null
  amount: string | number
  shipping_cost: string | number
  created_at: Date
}

export interface CustomerSummary {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
}

export interface AuctionBlockPublic {
  id: string
  title: string
  slug: string
  status: "draft" | "scheduled" | "preview" | "active" | "ended" | "archived"
  start_time: Date | null
  end_time: Date | null
  description: string | null
  item_count?: number
}
