// Unit tests for lib/label-resolver.ts.
//
// `findOrCreateLabelByName` does a single Knex.raw INSERT ... ON CONFLICT,
// so we cover slug normalization here and stub Knex.raw to verify the
// SQL contract. Race-safety is a Postgres-level guarantee — exercised
// implicitly by the unique constraint on Label.slug.
//
// Run: TEST_TYPE=unit pnpm test:unit

import { findOrCreateLabelByName, slugifyLabelName } from "../lib/label-resolver"

describe("label-resolver", () => {
  describe("slugifyLabelName", () => {
    it("normalizes typical names", () => {
      expect(slugifyLabelName("New Dance")).toBe("new-dance")
      expect(slugifyLabelName("Mute Records")).toBe("mute-records")
      expect(slugifyLabelName("4AD")).toBe("4ad")
    })

    it("strips diacritics", () => {
      expect(slugifyLabelName("Tëst Lábel")).toBe("test-label")
      expect(slugifyLabelName("Élek")).toBe("elek")
    })

    it("strips punctuation but keeps hyphens", () => {
      expect(slugifyLabelName("Wax Trax!")).toBe("wax-trax")
      expect(slugifyLabelName("Some/Where")).toBe("somewhere")
      expect(slugifyLabelName("A & B")).toBe("a-b")
    })

    it("collapses repeated whitespace and dashes", () => {
      expect(slugifyLabelName("New   Dance")).toBe("new-dance")
      expect(slugifyLabelName("New---Dance")).toBe("new-dance")
      expect(slugifyLabelName("  spaced  out  ")).toBe("spaced-out")
    })

    it("returns empty string for unusable input", () => {
      expect(slugifyLabelName("")).toBe("")
      expect(slugifyLabelName("!!!")).toBe("")
      expect(slugifyLabelName("   ")).toBe("")
    })
  })

  describe("findOrCreateLabelByName", () => {
    function makeTrx(rawResult: { rows?: Array<{ id: string }> }) {
      const calls: Array<{ sql: string; params: unknown[] }> = []
      const trx = {
        raw: jest.fn(async (sql: string, params: unknown[]) => {
          calls.push({ sql, params })
          return rawResult
        }),
      }
      return { trx, calls }
    }

    it("returns null for null/undefined/empty name", async () => {
      const { trx } = makeTrx({ rows: [] })
      // Cast to satisfy the Knex type — the helper only uses .raw().
      expect(await findOrCreateLabelByName(trx as never, null)).toBeNull()
      expect(await findOrCreateLabelByName(trx as never, undefined)).toBeNull()
      expect(await findOrCreateLabelByName(trx as never, "")).toBeNull()
      expect(await findOrCreateLabelByName(trx as never, "   ")).toBeNull()
      expect(trx.raw).not.toHaveBeenCalled()
    })

    it("returns null when name slugs to empty (e.g. all punctuation)", async () => {
      const { trx } = makeTrx({ rows: [] })
      expect(await findOrCreateLabelByName(trx as never, "!!!")).toBeNull()
      expect(trx.raw).not.toHaveBeenCalled()
    })

    it("strips Discogs disambiguator suffix '(N)'", async () => {
      const { trx, calls } = makeTrx({
        rows: [{ id: "enriched-label-mute" }],
      })
      const id = await findOrCreateLabelByName(trx as never, "Mute (3)")
      expect(id).toBe("enriched-label-mute")
      expect(calls).toHaveLength(1)
      // Cleaned name is in params[1], slug in params[2]
      expect(calls[0].params).toEqual(["enriched-label-mute", "Mute", "mute"])
    })

    it("invokes UPSERT on Label.slug and returns id from RETURNING", async () => {
      const { trx, calls } = makeTrx({
        rows: [{ id: "enriched-label-new-dance" }],
      })
      const id = await findOrCreateLabelByName(trx as never, "New Dance")
      expect(id).toBe("enriched-label-new-dance")
      expect(calls).toHaveLength(1)
      expect(calls[0].sql).toMatch(/INSERT INTO "Label"/)
      expect(calls[0].sql).toMatch(/ON CONFLICT \(slug\)/)
      expect(calls[0].sql).toMatch(/RETURNING id/)
      expect(calls[0].params).toEqual([
        "enriched-label-new-dance",
        "New Dance",
        "new-dance",
      ])
    })

    it("returns null when RETURNING yields no rows (degenerate case)", async () => {
      const { trx } = makeTrx({ rows: [] })
      const id = await findOrCreateLabelByName(trx as never, "Whatever")
      expect(id).toBeNull()
    })
  })
})
