"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function GatePage() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push("/")
      router.refresh()
    } else {
      setError("Incorrect password")
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0c0a09",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              backgroundColor: "#d4a54a",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              color: "#0c0a09",
            }}
          >
            V
          </div>
          <span
            style={{
              color: "#d4a54a",
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            VOD Auctions
          </span>
        </div>

        {/* Card */}
        <div
          style={{
            backgroundColor: "#1c1917",
            borderRadius: 16,
            border: "1px solid #292524",
            padding: "40px 32px",
          }}
        >
          <h1
            style={{
              color: "#fafaf9",
              fontSize: 22,
              fontWeight: 600,
              margin: "0 0 8px",
            }}
          >
            Coming Soon
          </h1>
          <p
            style={{
              color: "#a8a29e",
              fontSize: 14,
              lineHeight: 1.6,
              margin: "0 0 28px",
            }}
          >
            We&apos;re preparing something special.
            <br />
            Enter the password to preview the site.
          </p>

          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                padding: "12px 16px",
                backgroundColor: "#0c0a09",
                border: error
                  ? "1px solid #ef4444"
                  : "1px solid #44403c",
                borderRadius: 10,
                color: "#fafaf9",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                marginBottom: error ? 8 : 16,
                transition: "border-color 0.2s",
              }}
            />
            {error && (
              <p
                style={{
                  color: "#ef4444",
                  fontSize: 13,
                  margin: "0 0 12px",
                  textAlign: "left",
                }}
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              style={{
                width: "100%",
                padding: "12px 24px",
                backgroundColor:
                  loading || !password ? "#92702a" : "#d4a54a",
                color: "#0c0a09",
                fontSize: 14,
                fontWeight: 600,
                border: "none",
                borderRadius: 10,
                cursor:
                  loading || !password ? "not-allowed" : "pointer",
                transition: "background-color 0.2s",
                opacity: loading || !password ? 0.6 : 1,
              }}
            >
              {loading ? "Checking..." : "Enter"}
            </button>
          </form>
        </div>

        <p
          style={{
            color: "#57534e",
            fontSize: 12,
            marginTop: 24,
          }}
        >
          Curated Music Auctions &mdash; 40,000+ Releases
        </p>
      </div>
    </div>
  )
}
