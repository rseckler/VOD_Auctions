"use client"

export default function SentryExamplePage() {
  function triggerError() {
    // Intentional unhandled error — triggers Sentry's global error boundary
    ;(undefined as any).sentry_test_error()
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 480 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Sentry Test</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Wirft einen unhandled Error → Sentry global-error boundary fängt ihn ab und sendet ihn.
      </p>
      <button
        onClick={triggerError}
        style={{
          background: "#7c3aed",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "10px 20px",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Unhandled Error auslösen
      </button>
    </div>
  )
}
