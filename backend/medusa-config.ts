import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production — refusing to start with insecure default')
  if (!process.env.COOKIE_SECRET) throw new Error('COOKIE_SECRET must be set in production — refusing to start with insecure default')
}

module.exports = defineConfig({
  projectConfig: {
    redisUrl: process.env.REDIS_URL,
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions: {
      connection: {
        ssl: {
          rejectUnauthorized: false,
        },
      },
    },
    http: {
      storeCors: process.env.STORE_CORS || process.env.STOREFRONT_URL || "http://localhost:3000",
      adminCors: process.env.ADMIN_CORS || process.env.ADMIN_URL || "http://localhost:9000",
      authCors: process.env.AUTH_CORS || process.env.STOREFRONT_URL || "http://localhost:3000",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
      jwtExpiresIn: "30d",
    }
  },
  modules: [
    {
      resolve: "./src/modules/auction",
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/resend",
            id: "resend",
            options: {
              channels: ["email"],
              api_key: process.env.RESEND_API_KEY,
              from: process.env.EMAIL_FROM || "VOD Auctions <noreply@vod-auctions.com>",
            },
          },
        ],
      },
    },
  ],
})
