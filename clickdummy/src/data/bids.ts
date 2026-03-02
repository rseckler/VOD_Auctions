export interface Bid {
  id: string
  itemId: string
  bidder: string
  amount: number
  timestamp: string
  isUser?: boolean
}

export const bidHistoryForLot7: Bid[] = [
  { id: "bid-001", itemId: "itm-007", bidder: "vinyl_hunter_88", amount: 45, timestamp: "2026-03-01T10:05:00Z" },
  { id: "bid-002", itemId: "itm-007", bidder: "dark_collector", amount: 48, timestamp: "2026-03-01T14:22:00Z" },
  { id: "bid-003", itemId: "itm-007", bidder: "ambient_freak", amount: 52, timestamp: "2026-03-02T09:15:00Z" },
  { id: "bid-004", itemId: "itm-007", bidder: "noise_dealer", amount: 55, timestamp: "2026-03-03T11:30:00Z" },
  { id: "bid-005", itemId: "itm-007", bidder: "vinyl_hunter_88", amount: 58, timestamp: "2026-03-04T16:45:00Z" },
  { id: "bid-006", itemId: "itm-007", bidder: "dark_collector", amount: 62, timestamp: "2026-03-05T08:10:00Z" },
  { id: "bid-007", itemId: "itm-007", bidder: "cmi_fanatic", amount: 67, timestamp: "2026-03-06T20:30:00Z" },
  { id: "bid-008", itemId: "itm-007", bidder: "ambient_freak", amount: 72, timestamp: "2026-03-07T13:55:00Z" },
  { id: "bid-009", itemId: "itm-007", bidder: "noise_dealer", amount: 78, timestamp: "2026-03-08T17:20:00Z" },
]

export function getUserBidHistory(userBidAmount?: number): Bid[] {
  if (!userBidAmount) return bidHistoryForLot7
  return [
    ...bidHistoryForLot7,
    {
      id: "bid-user",
      itemId: "itm-007",
      bidder: "Du",
      amount: userBidAmount,
      timestamp: new Date().toISOString(),
      isUser: true,
    },
  ].sort((a, b) => b.amount - a.amount)
}
