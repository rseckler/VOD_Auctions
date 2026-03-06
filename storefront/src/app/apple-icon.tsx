import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 90,
          background: "linear-gradient(135deg, #d4a54a, #b8860b)",
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            border: "3px solid #1c1915",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              border: "3px solid #1c1915",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  )
}
