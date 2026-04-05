module.exports = {
  apps: [
    {
      // IMPORTANT: cwd points to the build output, NOT the source tree.
      // Medusa 2.x production runtime loads medusa-config.js + compiled
      // routes from .medusa/server/. Running from backend/ causes a
      // "Cannot find module medusa-config" crash because only the .ts
      // source exists there and the prod runtime does not transpile TS.
      // See docs/architecture/DEPLOYMENT_METHODOLOGY.md for the full
      // deploy sequence, including the mandatory .env symlink.
      name: "vodauction-backend",
      script: "npm",
      args: "run start",
      cwd: "/root/VOD_Auctions/backend/.medusa/server",
      node_args: "--max-old-space-size=512",
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: "9000",
      },
    },
    {
      name: "vodauction-storefront",
      script: "node_modules/.bin/next",
      args: "start -p 3006",
      cwd: "/root/VOD_Auctions/storefront",
      node_args: "--max-old-space-size=512",
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: "3006",
      },
    },
  ],
}
