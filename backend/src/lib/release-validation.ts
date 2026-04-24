export type StammdatenInput = {
  title?: string | null
  year?: string | number | null
  country?: string | null
  catalogNumber?: string | null
  barcode?: string | null
  description?: string | null
}

const MAX_TITLE = 500
const MAX_DESCRIPTION = 10000
const MAX_CATALOG_NUMBER = 100

export function validateReleaseStammdaten(stammdaten: StammdatenInput): Record<string, string> {
  const errors: Record<string, string> = {}

  if (stammdaten.title !== undefined) {
    const trimmed = (stammdaten.title ?? "").trim()
    if (!trimmed) {
      errors.title = "Title is required"
    } else if (trimmed.length > MAX_TITLE) {
      errors.title = `Title must be at most ${MAX_TITLE} characters`
    }
  }

  if (stammdaten.year !== undefined && stammdaten.year !== null && stammdaten.year !== "") {
    const yearNum = typeof stammdaten.year === "string" ? parseInt(stammdaten.year, 10) : stammdaten.year
    const currentYear = new Date().getFullYear()
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > currentYear) {
      errors.year = `Year must be between 1900 and ${currentYear}`
    }
  }

  if (stammdaten.country !== undefined && stammdaten.country && !/^[A-Z]{2}$/.test(stammdaten.country)) {
    errors.country = "Country must be a 2-letter ISO code (e.g. DE, SE, US)"
  }

  if (stammdaten.barcode !== undefined && stammdaten.barcode) {
    // rc51.1 R5: Strengere Format-Validation — UPC-A (12) oder EAN-13 (13)
    // plus optional EAN-8 (8) für ältere Releases. Nur digits-only war zu lose.
    if (!/^\d+$/.test(stammdaten.barcode)) {
      errors.barcode = "Barcode must contain only digits"
    } else if (![8, 12, 13].includes(stammdaten.barcode.length)) {
      errors.barcode = `Barcode must be 8 (EAN-8), 12 (UPC-A), or 13 digits (EAN-13) — got ${stammdaten.barcode.length}`
    } else if (!validateBarcodeChecksum(stammdaten.barcode)) {
      errors.barcode = "Barcode checksum invalid — check for typos"
    }
  }

  if (stammdaten.catalogNumber !== undefined && stammdaten.catalogNumber && stammdaten.catalogNumber.length > MAX_CATALOG_NUMBER) {
    errors.catalogNumber = `Catalog number must be at most ${MAX_CATALOG_NUMBER} characters`
  }

  if (stammdaten.description !== undefined && stammdaten.description && stammdaten.description.length > MAX_DESCRIPTION) {
    errors.description = `Description must be at most ${MAX_DESCRIPTION} characters`
  }

  return errors
}

/**
 * Validates the check digit of UPC-A (12), EAN-13 (13) or EAN-8 (8).
 *
 * Algorithm (GTIN check digit):
 *  - Right-aligned: odd-position digits × 3, even-position digits × 1
 *  - Sum all, take mod 10; check digit = (10 - sum % 10) % 10
 *  - Compare to the last digit.
 *
 * Reference: GS1 General Specifications, Section 7.9.
 */
export function validateBarcodeChecksum(barcode: string): boolean {
  if (!/^\d+$/.test(barcode)) return false
  if (![8, 12, 13].includes(barcode.length)) return false

  const digits = barcode.split("").map((c) => parseInt(c, 10))
  const check = digits.pop()!

  // Right-align: rightmost data digit is odd-position (×3). Build weights from the right.
  let sum = 0
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += digits[i] * weight
  }
  const computed = (10 - (sum % 10)) % 10
  return computed === check
}
