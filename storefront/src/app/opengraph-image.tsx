import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "VOD Auctions — Rare Music Auctions"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1c1915 0%, #2a2520 50%, #1c1915 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Vinyl record icon */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            background: "linear-gradient(135deg, #d4a54a, #b8860b)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              border: "3px solid #1c1915",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                border: "3px solid #1c1915",
              }}
            />
          </div>
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: "#e8e0d4",
            letterSpacing: "-1px",
            marginBottom: 12,
          }}
        >
          VOD Auctions
        </div>
        <div
          style={{
            fontSize: 24,
            color: "#d4a54a",
            letterSpacing: "2px",
            textTransform: "uppercase" as const,
          }}
        >
          Rare Music Auctions
        </div>
      </div>
    ),
    { ...size }
  )
}
