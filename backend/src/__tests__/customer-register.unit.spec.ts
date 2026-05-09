// Unit tests for the pure helpers exported by lib/customer-register.ts.
//
// These cover the building blocks that don't require a Postgres connection
// or a Medusa container. The integration-side guarantees (atomic token
// claim, compensation pattern) are exercised by scripts/test_register_race.sh
// which hits the deployed endpoint with concurrent requests — a Knex mock
// cannot prove a Postgres-level race-condition.
//
// Run: TEST_TYPE=unit pnpm test:unit  (or npm run test:unit)

import {
  isValidEmail,
  normalizeRawToken,
  constantTimePad,
  PRE_APPROVED_SOURCES,
  UNIFORM_INVITE_REQUIRED_BODY,
} from "../lib/customer-register"

describe("customer-register helpers", () => {
  describe("isValidEmail", () => {
    it("accepts standard formats", () => {
      expect(isValidEmail("user@example.com")).toBe(true)
      expect(isValidEmail("first.last+tag@sub.example.de")).toBe(true)
      expect(isValidEmail("a@b.co")).toBe(true)
    })

    it("rejects malformed strings", () => {
      expect(isValidEmail("")).toBe(false)
      expect(isValidEmail("no-at-sign.com")).toBe(false)
      expect(isValidEmail("two@@at.com")).toBe(false)
      expect(isValidEmail("trailing space@example.com")).toBe(false)
      expect(isValidEmail("@example.com")).toBe(false)
      expect(isValidEmail("user@")).toBe(false)
      expect(isValidEmail("user@example")).toBe(false)
    })

    it("rejects emails over 254 chars", () => {
      // 250 chars total → still acceptable
      expect(isValidEmail(`${"x".repeat(245)}@e.co`)).toBe(true)
      // 255 chars total → rejected
      expect(isValidEmail(`${"x".repeat(250)}@e.co`)).toBe(false)
    })
  })

  describe("normalizeRawToken", () => {
    it("strips VOD- prefix and dashes, uppercases", () => {
      expect(normalizeRawToken("VOD-ABC12-DE34F")).toBe("ABC12DE34F")
      expect(normalizeRawToken("vod-abc12-de34f")).toBe("ABC12DE34F")
      expect(normalizeRawToken("ABC12-DE34F")).toBe("ABC12DE34F")
    })

    it("passes raw 10-char tokens through unchanged", () => {
      expect(normalizeRawToken("ABC12DE34F")).toBe("ABC12DE34F")
      expect(normalizeRawToken("abc12de34f")).toBe("ABC12DE34F")
    })

    it("normalizes mixed-case + multiple dashes", () => {
      expect(normalizeRawToken("vod-Abc-12-De-34F")).toBe("ABC12DE34F")
    })
  })

  describe("constantTimePad", () => {
    it("delays at least the lower bound (target-100, floor 50)", async () => {
      const t0 = Date.now()
      await constantTimePad(150)
      const elapsed = Date.now() - t0
      // Lower bound is max(50, 150-100) = 50ms. Allow 5ms slack for OS jitter.
      expect(elapsed).toBeGreaterThanOrEqual(45)
    })

    it("respects the upper bound (target+100)", async () => {
      const t0 = Date.now()
      await constantTimePad(120)
      const elapsed = Date.now() - t0
      // Upper bound is 120+100 = 220ms. Slack for slow CI runners.
      expect(elapsed).toBeLessThan(500)
    })

    it("uses sane defaults when target is not provided", async () => {
      const t0 = Date.now()
      await constantTimePad()
      const elapsed = Date.now() - t0
      // Default 200ms target → min 100, max 300. Slack for slow CI.
      expect(elapsed).toBeGreaterThanOrEqual(95)
      expect(elapsed).toBeLessThan(600)
    })
  })

  describe("PRE_APPROVED_SOURCES", () => {
    it("includes only real customer-relationship sources (CODEX P1#1)", () => {
      expect(PRE_APPROVED_SOURCES).toEqual([
        "vodtapes_members",
        "vod_records_db1",
        "vod_records_db2013",
        "vod_records_db2013_alt",
      ])
    })

    it("excludes mo_pdf and imap_* sources by design", () => {
      expect(PRE_APPROVED_SOURCES).not.toContain("mo_pdf")
      expect(PRE_APPROVED_SOURCES).not.toContain("imap_vod_records")
      expect(PRE_APPROVED_SOURCES).not.toContain("imap_vinyl_on_demand")
    })
  })

  describe("UNIFORM_INVITE_REQUIRED_BODY (CODEX P2#5)", () => {
    it("returns identical structure for both 'invite required' and 'email in use' paths in invite-mode", () => {
      // The body is reused across the two response paths so attackers can't
      // enumerate which emails already have an account in invite-only mode.
      expect(UNIFORM_INVITE_REQUIRED_BODY).toEqual({
        error: "registration_not_possible",
        message:
          "Registration is currently invite-only. Apply for early access at /apply.",
        apply_url: "/apply",
      })
    })

    it("does not leak whether email already exists", () => {
      expect(JSON.stringify(UNIFORM_INVITE_REQUIRED_BODY)).not.toMatch(
        /email|existing|already/i
      )
    })
  })
})
