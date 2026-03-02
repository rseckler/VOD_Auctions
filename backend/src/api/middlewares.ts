import { defineMiddlewares, authenticate } from "@medusajs/framework/http"

export default defineMiddlewares({
  routes: [
    {
      // Protect bid submission — require authenticated customer
      matcher: "/store/auction-blocks/*/items/*/bids",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
      ],
    },
    {
      // Protect account routes — require authenticated customer
      matcher: "/store/account/*",
      methods: ["GET"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
      ],
    },
  ],
})
