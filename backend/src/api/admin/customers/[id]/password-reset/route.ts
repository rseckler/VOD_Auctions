import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// POST /admin/customers/:id/password-reset
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  res.status(200).json({
    message:
      "Password reset not yet supported via API — use Medusa admin UI or the customer's self-service reset flow.",
  })
}
