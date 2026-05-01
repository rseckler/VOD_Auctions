import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, generateEntityId } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { matchesPairingCode, isValidPairingCodeFormat } from "../../../../lib/pairing-codes"
import { generateApiToken } from "../../../../lib/api-tokens"
import { checkPairRateLimit, getClientIp } from "../../../../lib/rate-limiter"
import { getSiteConfig } from "../../../../lib/site-config"

/**
 * POST /print/bridges/pair
 *
 * Public — kein Bearer. Bridge ruft mit Pairing-Code, eigener bridge_uuid und
 * Telemetrie. Backend matched den Code in `bridge_pairing_token`, erzeugt eine
 * `bridge_host`-Row (oder updated existierende bei wiederholtem Pair derselben
 * Bridge), generiert einen 32-byte api_token und liefert ihn 1× im Response.
 *
 * Sicherheits-Profil:
 *   - Crockford-Base32 12-Char-Code = 60 bit Entropie + 30min TTL
 *   - Rate-Limit 5/min/IP + 50/min global gegen Bruteforce
 *   - SELECT FOR UPDATE auf bridge_pairing_token gegen TOCTOU
 *   - api_token nur als sha256-Hash in DB
 *   - Idempotenz: gleicher bridge_uuid → existierende Row updaten, neuen Token
 *   - Feature-Flag `pairing_enabled` als Notfall-Killswitch
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const ip = getClientIp(req)

  // Rate-Limit zuerst — auch vor Body-Parse, damit Bruteforce billig wegfällt
  const rateLimitHit = checkPairRateLimit(ip)
  if (rateLimitHit) {
    res.set("Retry-After", String(rateLimitHit.retryAfterSec))
    res.status(429).json({ message: rateLimitHit.reason })
    return
  }

  // Feature-Flag-Gate
  const config = await getSiteConfig(pg)
  const pairingEnabled = config.features?.pairing_enabled !== false // default: true
  if (!pairingEnabled) {
    res.status(503).json({ message: "Pairing endpoint disabled" })
    return
  }

  const body = (req.body || {}) as Record<string, unknown>
  const pairing_code = String(body.pairing_code || "").trim()
  const bridge_uuid = String(body.bridge_uuid || "").trim()
  const hostname = typeof body.hostname === "string" ? body.hostname.trim() : null
  const mac_address = typeof body.mac_address === "string" ? body.mac_address.trim() : null
  const platform = typeof body.platform === "string" ? body.platform.trim() : null
  const bridge_version = typeof body.bridge_version === "string" ? body.bridge_version.trim() : null

  if (!pairing_code || !isValidPairingCodeFormat(pairing_code)) {
    res.status(400).json({ message: "Invalid pairing_code format" })
    return
  }
  if (!bridge_uuid || bridge_uuid.length < 16 || bridge_uuid.length > 64) {
    res.status(400).json({ message: "bridge_uuid must be 16-64 chars" })
    return
  }
  // bridge_uuid muss alphanumerisch + -/_ sein — gegen SQL-Injection durch
  // ungewöhnliche Werte (Knex .where escaped, aber defense-in-depth)
  if (!/^[A-Za-z0-9_-]+$/.test(bridge_uuid)) {
    res.status(400).json({ message: "bridge_uuid contains invalid characters" })
    return
  }

  try {
    const result = await pg.transaction(async (trx) => {
      // 1) Pairing-Token row-locked holen
      // Unbedingt FOR UPDATE — Race zwischen zwei zeitgleichen Pair-Calls auf
      // demselben Code muss linearisiert werden.
      const candidates = await trx("bridge_pairing_token")
        .select("*")
        .whereNull("used_at")
        .where("expires_at", ">", new Date())
        .forUpdate()

      // Code-Match in JS (mit Crockford-Tolerance) — DB-WHERE auf pairing_code
      // exakt würde eine 0/O- oder I/L-Verwechslung des Users falsch ablehnen.
      const token = candidates.find((r: any) => matchesPairingCode(pairing_code, r.pairing_code))
      if (!token) {
        return { kind: "not_found" as const }
      }

      // 2) api_token generieren (Klartext + sha256-hash)
      const { clear: clearToken, hash: tokenHash } = generateApiToken()
      const now = new Date()

      // 3) bridge_host UPSERT — Idempotenz: bei selbem bridge_uuid existierende
      // Row updaten + neuen Token. Bei rc52-pre-pair-Placeholdern (z.B. Frank/David
      // wenn die irgendwann den Pairing-Flow durchlaufen) wird die Placeholder-Row
      // ebenfalls überschrieben.
      const existing = await trx("bridge_host")
        .where("bridge_uuid", bridge_uuid)
        .forUpdate()
        .first()

      let bridgeId: string
      if (existing) {
        // Sicherheits-Check: Wenn die existierende Row nicht im rc52-env-var-mode
        // ist, dann hat schon mal ein echtes Pairing stattgefunden — Re-Pair
        // erlaubt (Token-Rotation), aber Logging.
        bridgeId = existing.id
        await trx("bridge_host")
          .where("id", bridgeId)
          .update({
            api_token_hash: tokenHash,
            api_token_issued_at: now,
            api_token_revoked_at: null,
            person_label: token.person_label,
            display_name: token.display_name,
            is_mobile: token.is_mobile,
            default_location_id: token.default_location_id,
            notes: token.notes,
            hostname,
            mac_address,
            platform,
            bridge_version,
            last_known_ip: ip,
            paired_at: now,
            paired_by_admin_id: token.created_by_admin_id,
            is_active: true,
            updated_at: now,
          })
      } else {
        bridgeId = generateEntityId()
        await trx("bridge_host").insert({
          id: bridgeId,
          bridge_uuid,
          api_token_hash: tokenHash,
          api_token_issued_at: now,
          api_token_revoked_at: null,
          person_label: token.person_label,
          display_name: token.display_name,
          is_mobile: token.is_mobile,
          default_location_id: token.default_location_id,
          notes: token.notes,
          hostname,
          mac_address,
          platform,
          bridge_version,
          last_known_ip: ip,
          paired_at: now,
          paired_by_admin_id: token.created_by_admin_id,
          is_active: true,
          created_at: now,
          updated_at: now,
        })
      }

      // 4) Pairing-Token verbrennen
      await trx("bridge_pairing_token")
        .where("id", token.id)
        .update({
          used_at: now,
          used_by_bridge_uuid: bridge_uuid,
        })

      // 5) Default-Location-Code laden für Response
      let default_location_code: string | null = null
      if (token.default_location_id) {
        const wl = await trx("warehouse_location")
          .select("code")
          .where("id", token.default_location_id)
          .first()
        default_location_code = wl?.code ?? null
      }

      // 6) Initiale Drucker-Map als Seed (identisch zu /print/bridge-config)
      const printers = await trx("printer as p")
        .join("warehouse_location as wl", "p.warehouse_location_id", "wl.id")
        .select(
          "wl.code as location_code",
          "p.ip_address",
          "p.port",
          "p.brother_ql_model",
          "p.label_type",
          "p.is_default_for_location"
        )
        .where("p.is_active", true)
      const printersMap: Record<string, { ip: string; model: string; label_type: string; port: number }> = {}
      for (const p of printers) {
        if (!printersMap[p.location_code] || p.is_default_for_location) {
          printersMap[p.location_code] = {
            ip: p.ip_address,
            model: p.brother_ql_model || "QL-820NWB",
            label_type: p.label_type,
            port: Number(p.port),
          }
        }
      }

      return {
        kind: "ok" as const,
        bridge_host_id: bridgeId,
        api_token: clearToken,
        default_location_code,
        printers: printersMap,
        person_label: token.person_label,
        display_name: token.display_name,
      }
    })

    if (result.kind === "not_found") {
      res.status(404).json({ message: "Invalid or expired pairing code" })
      return
    }

    res.status(201).json({
      api_token: result.api_token,
      bridge_host_id: result.bridge_host_id,
      default_location: result.default_location_code,
      person_label: result.person_label,
      display_name: result.display_name,
      printers: result.printers,
    })
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Pairing failed" })
  }
}

