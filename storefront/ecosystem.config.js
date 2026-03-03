module.exports = {
  apps: [{
    name: "vodauction-storefront",
    script: "node_modules/.bin/next",
    args: "start -p 3006",
    cwd: "/root/VOD_Auctions/storefront",
    env: {
      NODE_ENV: "production",
      PORT: "3006",
    },
    max_memory_restart: "300M",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
  }]
}
