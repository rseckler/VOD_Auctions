module.exports = {
  apps: [{
    name: "vodauction-storefront",
    // Direct path to the Node entry point instead of node_modules/.bin/next.
    // Reason: pnpm install creates a shell-script wrapper at .bin/next that
    // PM2 can't execute as a Node script (SyntaxError: missing ) after
    // argument list). The wrapper works fine via shell but PM2's
    // ProcessContainerFork.js tries to require() it as a JS module.
    script: "node_modules/next/dist/bin/next",
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
