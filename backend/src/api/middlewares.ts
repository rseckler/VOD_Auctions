import { defineMiddlewares, authenticate } from "@medusajs/framework/http"

export default defineMiddlewares({
  routes: [
    {
      // Stripe webhook — raw body for signature verification, no auth
      matcher: "/webhooks/stripe",
      methods: ["POST"],
      bodyParser: false,
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
