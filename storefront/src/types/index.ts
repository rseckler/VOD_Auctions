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
  year: number | null
  country: string | null
  coverImage: string | null
  catalogNumber: string | null
  estimated_value: number | null
  artist_name: string | null
  label_name: string | null
  description?: string | null
  media_condition?: string | null
  sleeve_condition?: string | null
  legacy_price?: number | null
  legacy_condition?: string | null
  legacy_format_detail?: string | null
  tracklist?: TracklistEntry[] | null
  credits?: string | null
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
