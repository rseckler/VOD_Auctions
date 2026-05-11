// Unit tests for lib/country-resolve.ts (rc54.0 Variante A — dual-tolerant filter).
//
// resolveCountryForFilter ist KRITISCH für Zero-Downtime während der Migration:
// pre-backfill enthält DB English-Names + Aliase, post-backfill ISO-Codes.
// Die Funktion returnt ALLE bekannten DB-Variants damit WHERE-IN beide Welten matched.
//
// Run: TEST_TYPE=unit pnpm test:unit

import { resolveCountryForFilter } from "../lib/country-resolve"

describe("resolveCountryForFilter", () => {
  describe("Single-Country: ISO + English-Name beide returnt", () => {
    it("germany → DE + Germany", () => {
      const result = resolveCountryForFilter("germany")
      expect(result).toContain("DE")
      expect(result).toContain("Germany")
    })

    it("DE → DE + Germany (ISO-input)", () => {
      const result = resolveCountryForFilter("DE")
      expect(result).toContain("DE")
      expect(result).toContain("Germany")
    })

    it("Deutschland (German alias) → DE + Germany", () => {
      // findCountryByName matched nameDe → DE → result enthält ISO + nameEn
      const result = resolveCountryForFilter("Deutschland")
      expect(result).toContain("DE")
      expect(result).toContain("Germany")
    })

    it("France → FR + France", () => {
      const result = resolveCountryForFilter("France")
      expect(result).toContain("FR")
      expect(result).toContain("France")
    })
  })

  describe("UK-Special: alle Aliase + Compounds matched", () => {
    it("UK input → GB + United Kingdom + alle UK-Compounds", () => {
      const result = resolveCountryForFilter("UK")
      expect(result).toContain("GB")
      expect(result).toContain("United Kingdom")
      expect(result).toContain("UK")
      expect(result).toContain("UK & Europe")
      expect(result).toContain("UK & US")
      expect(result).toContain("UK & France")
    })

    it("united kingdom → GB + UK-Variants", () => {
      const result = resolveCountryForFilter("united kingdom")
      expect(result).toContain("GB")
      expect(result).toContain("United Kingdom")
      expect(result).toContain("UK")
    })
  })

  describe("USA-Special: USA-Aliase + Compounds", () => {
    it("USA → US + Compounds", () => {
      const result = resolveCountryForFilter("USA")
      expect(result).toContain("US")
      expect(result).toContain("United States")
      expect(result).toContain("USA")
      expect(result).toContain("USA & Canada")
      expect(result).toContain("USA & Europe")
    })
  })

  describe("Multi-Region: Pure-Europe → EU + Europe + European Union", () => {
    it("Europe → EU + alle Pure-EU-Strings", () => {
      const result = resolveCountryForFilter("Europe")
      expect(result).toContain("EU")
      expect(result).toContain("Europe")
      expect(result).toContain("European Union")
    })

    it("EU input → identische Liste", () => {
      const result = resolveCountryForFilter("EU")
      expect(result).toContain("EU")
      expect(result).toContain("Europe")
    })
  })

  describe("Worldwide → WO + Worldwide", () => {
    it("Worldwide → WO + Worldwide", () => {
      const result = resolveCountryForFilter("Worldwide")
      expect(result).toContain("WO")
      expect(result).toContain("Worldwide")
    })
  })

  describe("Region-Sammelnamen → primary country + Region-String", () => {
    it("Benelux → NL + Benelux", () => {
      const result = resolveCountryForFilter("Benelux")
      expect(result).toContain("NL")
      expect(result).toContain("Benelux")
    })

    it("Scandinavia → SE + Scandinavia", () => {
      const result = resolveCountryForFilter("Scandinavia")
      expect(result).toContain("SE")
      expect(result).toContain("Scandinavia")
    })
  })

  describe("Case-insensitivity", () => {
    it("lowercase → same result as proper-case", () => {
      const lc = resolveCountryForFilter("germany")
      const pc = resolveCountryForFilter("Germany")
      expect(lc.sort()).toEqual(pc.sort())
    })

    it("UPPER → same", () => {
      const uc = resolveCountryForFilter("GERMANY")
      const pc = resolveCountryForFilter("Germany")
      expect(uc.sort()).toEqual(pc.sort())
    })
  })

  describe("Whitespace + edge cases", () => {
    it("empty → []", () => {
      expect(resolveCountryForFilter("")).toEqual([])
      expect(resolveCountryForFilter("   ")).toEqual([])
    })

    it("trims whitespace", () => {
      expect(resolveCountryForFilter("  Germany  ")).toContain("DE")
    })

    it("unknown input → passthrough single-element", () => {
      const result = resolveCountryForFilter("Foobaria")
      expect(result).toEqual(["Foobaria"])
    })
  })

  describe("Dedup", () => {
    it("kein Duplikat im result", () => {
      // EU-Input: nameEn ist "Europe (EU)" — nicht in DB_HISTORICAL_NAMES;
      // "Europe" wird über historical hinzugefügt; "EU" via ISO.
      // Keine Duplikate erwartet.
      const result = resolveCountryForFilter("Europe")
      const unique = Array.from(new Set(result))
      expect(result.length).toBe(unique.length)
    })
  })
})
