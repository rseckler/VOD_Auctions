// Unit tests for lib/country-normalize.ts (rc54.0 Country-ISO Migration).
//
// Deckt alle 89 distinct DB-Werte aus dem Backfill-Mapping ab + 71 distinct
// Discogs-Cache-Werte (90-Tage-Snapshot 2026-05-11) + Edge-Cases.
//
// Run: TEST_TYPE=unit pnpm test:unit

import { normalizeCountryToIso } from "../lib/country-normalize"

describe("normalizeCountryToIso", () => {
  describe("Single-Country English Names → ISO", () => {
    it.each([
      ["Germany", "DE"],
      ["United States", "US"],
      ["United Kingdom", "GB"],
      ["France", "FR"],
      ["Netherlands", "NL"],
      ["Italy", "IT"],
      ["Belgium", "BE"],
      ["Japan", "JP"],
      ["Canada", "CA"],
      ["Switzerland", "CH"],
      ["Australia", "AU"],
      ["Austria", "AT"],
      ["Spain", "ES"],
      ["Sweden", "SE"],
      ["Norway", "NO"],
      ["Poland", "PL"],
      ["Denmark", "DK"],
      ["Portugal", "PT"],
      ["Iceland", "IS"],
      ["Hungary", "HU"],
      ["Greece", "GR"],
      ["Slovenia", "SI"],
      ["Finland", "FI"],
      ["New Zealand", "NZ"],
      ["Mexico", "MX"],
      ["South Africa", "ZA"],
      ["Russia", "RU"],
      ["Ireland", "IE"],
      ["Brazil", "BR"],
      ["Czech Republic", "CZ"],
      ["Argentina", "AR"],
      ["Romania", "RO"],
      ["Israel", "IL"],
      ["India", "IN"],
      ["Slovakia", "SK"],
      ["Turkey", "TR"],
      ["Peru", "PE"],
      ["Uruguay", "UY"],
      ["Colombia", "CO"],
      ["Venezuela", "VE"],
      ["Luxembourg", "LU"],
      ["Philippines", "PH"],
      ["Hong Kong", "HK"],
      ["Thailand", "TH"],
      ["Papua New Guinea", "PG"],
      ["Chile", "CL"],
      ["Malaysia", "MY"],
      ["China", "CN"],
      ["Guatemala", "GT"],
      ["Serbia", "RS"],
      ["Croatia", "HR"],
      ["Lebanon", "LB"],
      ["Indonesia", "ID"],
      ["Lithuania", "LT"],
      ["Latvia", "LV"],
    ])("%s → %s", (input, expected) => {
      expect(normalizeCountryToIso(input)).toBe(expected)
    })
  })

  describe("Discogs-Aliase → ISO", () => {
    it.each([
      ["UK", "GB"],
      ["uk", "GB"],
      ["USA", "US"],
      ["usa", "US"],
    ])("%s → %s", (input, expected) => {
      expect(normalizeCountryToIso(input)).toBe(expected)
    })
  })

  describe("Already-ISO Identity-Passthrough", () => {
    it.each([
      ["DE", "DE"],
      ["US", "US"],
      ["GB", "GB"],
      ["FR", "FR"],
      ["IT", "IT"],
      ["NL", "NL"],
      ["BE", "BE"],
      ["JP", "JP"],
      ["CA", "CA"],
      ["CH", "CH"],
      ["ES", "ES"],
      ["AT", "AT"],
      ["NO", "NO"],
      ["IS", "IS"],
      ["EU", "EU"],
      ["WO", "WO"],
      // Case-insensitive
      ["de", "DE"],
      ["gb", "GB"],
    ])("%s → %s", (input, expected) => {
      expect(normalizeCountryToIso(input)).toBe(expected)
    })
  })

  describe("Multi-Region Pure-Europe → EU", () => {
    it.each([
      ["Europe", "EU"],
      ["European Union", "EU"],
      ["EU", "EU"],
    ])("%s → %s", (input, expected) => {
      expect(normalizeCountryToIso(input)).toBe(expected)
    })
  })

  describe("Worldwide → WO", () => {
    it("Worldwide → WO", () => {
      expect(normalizeCountryToIso("Worldwide")).toBe("WO")
    })
  })

  describe("Region-Sammelnamen → primary country", () => {
    it("Benelux → NL", () => {
      expect(normalizeCountryToIso("Benelux")).toBe("NL")
    })
    it("Scandinavia → SE", () => {
      expect(normalizeCountryToIso("Scandinavia")).toBe("SE")
    })
  })

  describe("Compound Multi-Region → primary-country-first", () => {
    it.each([
      // UK-first
      ["UK & Europe", "GB"],
      ["UK & US", "GB"],
      ["UK & Ireland", "GB"],
      ["UK & Germany", "GB"],
      ["UK & France", "GB"],
      ["UK, Europe & US", "GB"],
      // USA-first
      ["USA & Europe", "US"],
      ["USA & Canada", "US"],
      ["USA, Canada & Europe", "US"],
      ["USA, Canada & UK", "US"],
      // DE-first
      ["Germany, Austria, & Switzerland", "DE"],
      ["Germany & Switzerland", "DE"],
      // FR-first
      ["France & Benelux", "FR"],
      // AU-first (entdeckt im Discogs-Cache-Audit 2026-05-11)
      ["Australia & New Zealand", "AU"],
    ])("%s → %s", (input, expected) => {
      expect(normalizeCountryToIso(input)).toBe(expected)
    })
  })

  describe("Deprecated ISO-3166-3 → bleibt erhalten", () => {
    it.each([
      ["Yugoslavia", "YU"],
      ["East Germany (GDR)", "DD"],
      ["German Democratic Republic (GDR)", "DD"],
      ["German Democratic Republic", "DD"],
      ["GDR", "DD"],
      ["USSR", "SU"],
      ["Soviet Union", "SU"],
      ["Czechoslovakia", "CS"],
      ["Serbia and Montenegro", "CS"],
      // Identity-Passthrough
      ["YU", "YU"],
      ["DD", "DD"],
      ["CS", "CS"],
      ["SU", "SU"],
    ])("%s → %s", (input, expected) => {
      expect(normalizeCountryToIso(input)).toBe(expected)
    })
  })

  describe("Edge cases", () => {
    it.each([
      [null, null],
      [undefined, null],
      ["", null],
      [" ", null],
      ["   ", null],
      // Unknown / nicht-mappbar
      ["Foobaria", null],
      ["XX", null],  // XX ist user-assigned aber nicht in unserer Liste
      ["123", null],
    ])("%s → %s", (input, expected) => {
      expect(normalizeCountryToIso(input as string | null | undefined)).toBe(expected)
    })

    it("trims whitespace", () => {
      expect(normalizeCountryToIso("  Germany  ")).toBe("DE")
      expect(normalizeCountryToIso("  DE  ")).toBe("DE")
    })

    it("is case-insensitive on names", () => {
      expect(normalizeCountryToIso("germany")).toBe("DE")
      expect(normalizeCountryToIso("GERMANY")).toBe("DE")
      expect(normalizeCountryToIso("united kingdom")).toBe("GB")
    })
  })
})
