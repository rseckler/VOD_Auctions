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

  if (stammdaten.barcode !== undefined && stammdaten.barcode && !/^\d+$/.test(stammdaten.barcode)) {
    errors.barcode = "Barcode must contain only digits"
  }

  if (stammdaten.catalogNumber !== undefined && stammdaten.catalogNumber && stammdaten.catalogNumber.length > MAX_CATALOG_NUMBER) {
    errors.catalogNumber = `Catalog number must be at most ${MAX_CATALOG_NUMBER} characters`
  }

  if (stammdaten.description !== undefined && stammdaten.description && stammdaten.description.length > MAX_DESCRIPTION) {
    errors.description = `Description must be at most ${MAX_DESCRIPTION} characters`
  }

  return errors
}
