import { defineMiddlewares, authenticate } from "@medusajs/framework/http"
import type { NextFunction, Request, Response } from "express"

// Middleware to capture raw body before JSON parsing
function rawBodyMiddleware(req: Request, _res: Response, next: NextFunction) {
  const chunks: Buffer[] = []
  req.on("data", (chunk: Buffer) => chunks.push(chunk))
  req.on("end", () => {
    ;(req as any).rawBody = Buffer.concat(chunks)
    next()
  })
  req.on("error", next)
}

export default defineMiddlewares({
  routes: [
    {
      // Discogs import upload — allow large file uploads (up to 5 MB base64)
      matcher: "/admin/discogs-import/upload",
      methods: ["POST"],
      bodyParser: { sizeLimit: "10mb" },
    },
    {
      // ERP inventory image upload — iPhone-Fotos kommen als base64-JSON
      // (~5-10 MB raw + 33% base64-Overhead → bis 20 MB Payload).
      matcher: "/admin/erp/inventory/upload-image",
      methods: ["POST"],
      bodyParser: { sizeLimit: "25mb" },
    },
    {
      // Stripe webhook — raw body for signature verification, no auth
      matcher: "/webhooks/stripe",
      methods: ["POST"],
      bodyParser: false,
      middlewares: [rawBodyMiddleware as any],
    },
    {
      // PayPal webhook — raw body for signature verification, no auth
      matcher: "/webhooks/paypal",
      methods: ["POST"],
      bodyParser: false,
      middlewares: [rawBodyMiddleware as any],
    },
    {
      // Protect bid submission — require authenticated customer
      matcher: "/store/auction-blocks/*/items/*/bids",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
      ],
    },
    {
      // Protect account routes (GET) — require authenticated customer
      matcher: "/store/account/*",
      methods: ["GET"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
      ],
    },
    {
      // Protect checkout (POST) — require authenticated customer
      matcher: "/store/account/*",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
      ],
    },
    {
      // Protect cart delete — require authenticated customer
      matcher: "/store/account/*",
      methods: ["DELETE"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
      ],
    },
  ],
})
