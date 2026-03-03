module.exports = {
  apps: [{
    name: "vodauction-backend",
    script: "npm",
    args: "run start",
    cwd: "/root/VOD_Auctions/backend",
    env: {
      NODE_ENV: "production",
    },
    max_memory_restart: "500M",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
  }]
}
