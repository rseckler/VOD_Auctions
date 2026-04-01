/**
 * Bid Configuration
 * -----------------
 * Change these values to adjust bidding behaviour platform-wide.
 * Both backend validation and frontend UI read from this single source of truth.
 *
 * To switch back to cent-level bidding: set whole_euros_only = false.
 * The increment_table has separate columns for both modes.
 */

export const BID_CONFIG = {
  /**
   * When true: only whole Euro amounts are accepted (no cents).
   * Minimum bid equals min_bid_amount. Amounts with decimals are rejected.
   */
  whole_euros_only: true as boolean,

  /** Absolute minimum bid in EUR (enforced regardless of increment table) */
  min_bid_amount: 1,

  /**
   * Tiered increment table.
   * `below`            — applies when currentPrice < this value
   * `increment_std`    — used when whole_euros_only = false (cent-level)
   * `increment_whole`  — used when whole_euros_only = true  (euro-level)
   */
  increment_table: [
    { below: 10,       increment_std: 0.50, increment_whole: 1  },
    { below: 50,       increment_std: 1.00, increment_whole: 1  },
    { below: 200,      increment_std: 2.50, increment_whole: 3  },
    { below: 500,      increment_std: 5.00, increment_whole: 5  },
    { below: 2000,     increment_std: 10.0, increment_whole: 10 },
    { below: Infinity, increment_std: 25.0, increment_whole: 25 },
  ],
}

/**
 * Returns the minimum increment to add to currentPrice for the next valid bid.
 * Uses whole_euros_only setting from BID_CONFIG.
 */
export function getMinIncrement(currentPrice: number): number {
  const row = BID_CONFIG.increment_table.find((r) => currentPrice < r.below)!
  return BID_CONFIG.whole_euros_only ? row.increment_whole : row.increment_std
}

/**
 * Validates a bid amount against the current config.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateBidAmount(amount: number): string | null {
  if (BID_CONFIG.whole_euros_only) {
    if (!Number.isInteger(amount)) {
      return "Only whole Euro amounts are accepted (no cents)."
    }
    if (amount < BID_CONFIG.min_bid_amount) {
      return `Minimum bid is €${BID_CONFIG.min_bid_amount}.`
    }
  }
  return null
}
