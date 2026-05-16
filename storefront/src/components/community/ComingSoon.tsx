// Placeholder for community surfaces that are scheduled in a later rebuild
// phase (Explore → R7, Lists → R5, Members directory → R3). The sub-nav links
// to them already, so they need a tasteful holding page rather than a 404.

export function ComingSoon({
  title,
  blurb,
  phase,
}: {
  title: string
  blurb: string
  phase: string
}) {
  return (
    <div className="cm-container-narrow" style={{ padding: "72px 0 110px" }}>
      <div className="cm-empty">
        <div
          style={{
            font: "700 10px var(--font-sans)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--primary)",
            marginBottom: 14,
          }}
        >
          {phase}
        </div>
        <h1
          style={{
            font: "400 28px var(--font-serif)",
            color: "var(--foreground)",
            marginBottom: 12,
          }}
        >
          {title}
        </h1>
        <p style={{ maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>
          {blurb}
        </p>
      </div>
    </div>
  )
}
