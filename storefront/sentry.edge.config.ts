import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: "https://cd24dd4b35d3e5dbce2ac4c4915ff0ac@o4510997236940800.ingest.de.sentry.io/4510997341798480",
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  debug: false,
})
