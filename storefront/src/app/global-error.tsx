"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          backgroundColor: "#1c1915",
          color: "#e8e0d4",
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: "480px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #d4a54a, #b8860b)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 2rem",
              fontSize: "28px",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1c1915"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="2" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12" y2="16" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: "2rem",
              fontWeight: "bold",
              marginBottom: "0.5rem",
              color: "#e8e0d4",
            }}
          >
            Something went wrong
          </h1>

          <p style={{ color: "#a89f91", marginBottom: "2rem", lineHeight: 1.6 }}>
            An unexpected error occurred. Please try again or navigate back to the homepage.
          </p>

          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                padding: "0.625rem 1.5rem",
                borderRadius: "0.375rem",
                border: "none",
                background: "#d4a54a",
                color: "#1c1915",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "0.625rem 1.5rem",
                borderRadius: "0.375rem",
                border: "1px solid rgba(232,224,212,0.2)",
                background: "transparent",
                color: "#e8e0d4",
                fontWeight: 500,
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              Go to Homepage
            </a>
            <a
              href="/catalog"
              style={{
                padding: "0.625rem 1.5rem",
                borderRadius: "0.375rem",
                border: "1px solid rgba(232,224,212,0.2)",
                background: "transparent",
                color: "#e8e0d4",
                fontWeight: 500,
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              Browse Catalog
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
