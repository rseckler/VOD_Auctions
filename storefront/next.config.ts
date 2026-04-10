import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../"),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "tape-mag.com",
      },
      {
        protocol: "https",
        hostname: "pub-433520acd4174598939bc51f96e2b8b9.r2.dev",
      },
      // Discogs CDN — used for Discogs-imported releases. Images are hotlinked
      // directly from Discogs until we batch-download them to R2 (see
      // docs/DISCOGS_IMPORT_SERVICE.md "R2 upload deferred to batch process").
      // Wildcard covers i.discogs.com, img.discogs.com, s.discogs.com etc.
      {
        protocol: "https",
        hostname: "**.discogs.com",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  sourcemaps: {
    disable: process.env.NODE_ENV !== "production",
  },
});
