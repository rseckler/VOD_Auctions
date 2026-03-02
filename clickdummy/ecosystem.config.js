module.exports = {
  apps: [
    {
      name: "vodauction-clickdummy",
      cwd: "/root/VOD_Auctions/clickdummy",
      script: "node_modules/.bin/next",
      args: "start -p 3005",
      env: {
        NODE_ENV: "production",
        PORT: 3005,
      },
    },
  ],
}
