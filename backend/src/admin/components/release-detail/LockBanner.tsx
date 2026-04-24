import { C, T, S } from "../admin-tokens"

type LockBannerProps = {
  locked: boolean
  reason?: string | null
}

export function LockBanner({ locked, reason }: LockBannerProps) {
  if (!locked) return null

  return (
    <div
      style={{
        background: C.error + "15",
        border: `1px solid ${C.error}40`,
        borderRadius: S.radius.md,
        padding: "12px 14px",
        marginBottom: S.gap.lg,
        display: "flex",
        alignItems: "center",
        gap: S.gap.md,
      }}
    >
      <span style={{ fontSize: 18 }}>🔒</span>
      <div style={{ flex: 1 }}>
        <div style={{ ...T.small, color: C.text, fontWeight: 600 }}>
          Stammdaten are locked
        </div>
        {reason && (
          <div style={{ ...T.micro, color: C.muted, marginTop: 4 }}>
            {reason}
          </div>
        )}
      </div>
      <a
        href="/docs/catalog-stammdaten-editability"
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...T.small, color: C.error, textDecoration: "none", whiteSpace: "nowrap" }}
      >
        Learn more →
      </a>
    </div>
  )
}
