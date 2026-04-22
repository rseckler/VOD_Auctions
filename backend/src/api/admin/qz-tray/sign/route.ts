import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as crypto from "crypto"

/**
 * POST /admin/qz-tray/sign
 *
 * Signiert QZ Tray Request-Payloads mit unserem Private-Key. QZ Tray nutzt
 * SHA-512-with-RSA als default. Der Client ruft diesen Endpoint fuer jede
 * ausgehende Request (via `qz.security.setSignaturePromiser`) — QZ Tray
 * verifiziert die Signatur gegen das via `/admin/qz-tray/cert` gelieferte
 * Public-Cert und erlaubt persistente "Remember this decision".
 *
 * Body kann zwei Formate haben:
 *   - Raw text: der zu signierende String direkt
 *   - JSON: { toSign: "..." } (falls Content-Type application/json)
 */
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const privateKey = process.env.QZ_SIGN_PRIVATE_KEY
  if (!privateKey) {
    res.status(503).json({ message: "QZ_SIGN_PRIVATE_KEY not configured" })
    return
  }

  // Body extraction — works for both raw text and JSON body
  let toSign = ""
  const rawBody = req.body as unknown
  if (typeof rawBody === "string") {
    toSign = rawBody
  } else if (rawBody && typeof rawBody === "object" && "toSign" in rawBody) {
    toSign = String((rawBody as { toSign: unknown }).toSign || "")
  }

  if (!toSign) {
    res.status(400).json({ message: "Empty signing payload" })
    return
  }

  try {
    // Replace escaped newlines from ENV with real newlines for PEM parsing
    const pemKey = privateKey.replace(/\\n/g, "\n")
    const signer = crypto.createSign("SHA512")
    signer.update(toSign)
    signer.end()
    const signature = signer.sign(pemKey, "base64")

    res.setHeader("Content-Type", "text/plain")
    res.send(signature)
  } catch (e: any) {
    console.error("QZ Tray sign error:", e.message)
    res.status(500).json({ message: "Signing failed" })
  }
}
