export function validateReleaseStammdaten(stammdaten: {
  title?: string | null
  year?: string | number | null
  country?: string | null
  catalogNumber?: string | null
  barcode?: string | null
  description?: string | null
}): Record<string, string> {
  const errors: Record<string, string> = {}

  if (stammdaten.title !== undefined && !stammdaten.title) {
    errors.title = "Title is required"
  }

  if (stammdaten.year !== undefined && stammdaten.year !== null && stammdaten.year !== "") {
    const yearNum = typeof stammdaten.year === "string" ? parseInt(stammdaten.year) : stammdaten.year
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear()) {
      errors.year = `Year must be between 1900 and ${new Date().getFullYear()}`
    }
  }

  if (stammdaten.country !== undefined && stammdaten.country && !/^[A-Z]{2}$/.test(stammdaten.country)) {
    errors.country = "Country must be a 2-letter ISO code (e.g. DE, SE, US)"
  }

  if (stammdaten.barcode !== undefined && stammdaten.barcode && !/^\d+$/.test(stammdaten.barcode)) {
    errors.barcode = "Barcode must contain only digits"
  }

  return errors
}
