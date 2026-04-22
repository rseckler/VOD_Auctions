import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * GET /admin/qz-tray/cert
 *
 * Liefert das Public-Cert (PEM) unseres QZ Tray Signing-Setups. QZ Tray
 * zeigt dieses Cert beim ersten Connect mit "Allow + Remember" — danach
 * ist der Trust persistent und alle weiteren Prints laufen silent.
 *
 * Das Cert ist self-signed mit einer 2048-bit RSA Key Pair. Der Private-Key
 * liegt nur im Backend (`QZ_SIGN_PRIVATE_KEY`), wird nie an den Client
 * geschickt. Der Client ruft separat `/admin/qz-tray/sign` fuer jede
 * Request-Signatur.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const cert = process.env.QZ_SIGN_CERT
  if (!cert) {
    res.status(503).json({ message: "QZ_SIGN_CERT not configured on backend" })
    return
  }
  res.setHeader("Content-Type", "text/plain")
  res.setHeader("Cache-Control", "public, max-age=3600")
  // Replace any escaped newlines from ENV with real newlines
  res.send(cert.replace(/\\n/g, "\n"))
}
