module.exports = {
  apps: [
    {
      name: "vodauction-backend",
      script: "node_modules/.bin/medusa",
      args: "start",
      cwd: "/root/VOD_Auctions/backend",
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
