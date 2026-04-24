export type AuctionBlock = {
  id: string
  title: string
  subtitle: string | null
  slug: string
  status: string
  block_type: string
  start_time: string
  end_time: string
  short_description: string | null
  long_description: string | null
  header_image: string | null
  video_url: string | null
  items_count: number
  items?: BlockItem[]
  min_price?: number
  max_price?: number
  cover_images?: string[]
}

export type TracklistEntry = {
  position?: string
  title: string
  duration?: string
}

export type VariousArtist = {
  artist_name: string | null
  role: string
}

export type ReleaseComment = {
  id: string
  content: string
  rating: number | null
  legacy_date: string | null
  createdAt: string
}

export type Release = {
  id: string
  title: string
  slug: string
  format: string
  format_id?: number | null
  format_name?: string | null
  format_group?: string | null
  product_category?: string | null
  year: number | null
  country: string | null
  coverImage: string | null
  catalogNumber: string | null
  article_number: string | null
  estimated_value: number | null
  artist_name: string | null
  artist_slug?: string | null
  label_name: string | null
  label_slug?: string | null
  press_orga_name?: string | null
  press_orga_slug?: string | null
  pressOrgaId?: string | null
  description?: string | null
  media_condition?: string | null
  sleeve_condition?: string | null
  // Price model per docs/architecture/PRICING_MODEL.md — rc47.2+:
  //   Canonical shop price = effective_price (= shop_price when verified, else null)
  //   Purchasable gate = is_purchasable (effective_price + legacy_available)
  // Never render legacy_price / discogs_*_price as a shop price. They ship
  // through the API for backwards compat + admin-side display only.
  /** @deprecated rc47.2 — Historical tape-mag price. Do not render as shop price. */
  legacy_price?: number | null
  legacy_condition?: string | null
  legacy_format_detail?: string | null
  tracklist?: TracklistEntry[] | null
  credits?: string | null
  discogs_id?: number | null
  /** @deprecated rc47.2 — Market reference only, not a shop price. */
  discogs_lowest_price?: number | null
  /** @deprecated rc47.2 — Market reference only, not a shop price. */
  discogs_median_price?: number | null
  /** @deprecated rc47.2 — Market reference only, not a shop price. */
  discogs_highest_price?: number | null
  discogs_num_for_sale?: number | null
  auction_status?: string | null
  sale_mode?: string | null
  shop_price?: number | null
  effective_price?: number | null
  is_verified?: boolean
  inventory?: number | null
  is_purchasable?: boolean
  various_artists?: VariousArtist[]
  comments?: ReleaseComment[]
}

export type ReleaseImage = {
  id: string
  url: string
  type: string
}

export type BlockItem = {
  id: string
  release_id: string
  start_price: number
  estimated_value: number | null
  current_price: number | null
  bid_count: number
  lot_number: number | null
  status: string
  lot_end_time?: string | null
  extension_count?: number
  reserve_met?: boolean | null
  view_count?: number
  release: Release | null
  images?: ReleaseImage[]
}

export type BidRecord = {
  id: string
  amount: number
  max_amount: number | null
  user_id: string
  created_at: string
  is_winning: boolean
  is_proxy: boolean
}

export type Customer = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
}

export type BidEntry = {
  id: string
  amount: number
  is_winning: boolean
  is_outbid: boolean
  created_at: string
  item: {
    id: string
    current_price: number
    status: string
    lot_number: number | null
    release_title: string | null
    release_artist: string | null
    release_cover: string | null
    release_format: string | null
  }
  block: {
    id: string
    title: string
    slug: string
    status: string
  }
}

export type WinEntry = {
  bid_id: string
  final_price: number
  bid_date: string
  item: {
    id: string
    lot_number: number | null
    status: string
    release_id?: string
    release_title: string | null
    release_artist: string | null
    release_cover: string | null
    release_format: string | null
  }
  block: {
    id: string
    title: string
    slug: string
  }
}

export type Transaction = {
  id: string
  block_item_id: string | null
  item_type: "auction" | "direct_purchase"
  order_group_id: string | null
  amount: number
  shipping_cost: number
  total_amount: number
  currency: string
  status: "pending" | "paid" | "failed" | "refunded"
  shipping_status: "pending" | "shipped" | "delivered"
  paid_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  tracking_number: string | null
  carrier: string | null
  tracking_url_pattern: string | null
  created_at: string
  release_title: string | null
  release_artist: string | null
  block_title: string | null
  block_slug: string | null
  lot_number: number | null
}

export type CartItem = {
  id: string
  release_id: string
  price: number
  created_at: string
  title: string
  coverImage: string | null
  format: string
  sale_mode: string | null
  shop_price: number | null
  auction_status: string | null
  artist_name: string | null
}
