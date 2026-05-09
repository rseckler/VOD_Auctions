// POST /store/customer/register
//
// Custom storefront registration endpoint (rc53.17). Replaces the legacy
// 3-step dance (auth/register → store/customers → auth/login) with one
// transactional call that also enforces the site-mode invite gate, links the
// new account to crm_master_contact, and triggers welcome + newsletter DOI
// mails. See backend/src/lib/customer-register.ts for the logic.

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  registerCustomer,
  type RegisterSource,
} from "../../../../lib/customer-register"

type Body = {
  email?: string
  password?: string
  first_name?: string
  last_name?: string
  agb_accepted?: boolean
  newsletter_optin?: boolean
  source?: RegisterSource
  invite_token?: string
}

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const body = (req.body || {}) as Body

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  const userAgent = (req.headers["user-agent"] as string | undefined) ?? null

  const result = await registerCustomer(req, {
    email: body.email ?? "",
    password: body.password ?? "",
    first_name: body.first_name ?? "",
    last_name: body.last_name,
    agb_accepted: body.agb_accepted === true,
    newsletter_optin: body.newsletter_optin === true,
    source: body.source === "invite_redemption" ? "invite_redemption" : "self_signup",
    invite_token: body.invite_token,
    ip,
    user_agent: userAgent,
  })

  res.status(result.status).json(result.body)
}
