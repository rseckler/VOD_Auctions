// Rating distribution bars (5 → 1), RYM-style. Presentational.

export function RatingHistogram({
  histogram,
}: {
  histogram: Record<string, number>
}) {
  const rows = [5, 4, 3, 2, 1]
  const total = rows.reduce((s, n) => s + (histogram[String(n)] || 0), 0)
  if (total === 0) return null
  const max = Math.max(...rows.map((n) => histogram[String(n)] || 0), 1)

  return (
    <div className="cm-histogram">
      {rows.map((n) => {
        const count = histogram[String(n)] || 0
        return (
          <div key={n} className="cm-histogram-row">
            <span className="cm-histogram-label">
              {n} <span className="cm-histogram-star">★</span>
            </span>
            <span className="cm-histogram-track">
              <span
                className="cm-histogram-fill"
                style={{ width: `${Math.round((count / max) * 100)}%` }}
              />
            </span>
            <span className="cm-histogram-count">{count}</span>
          </div>
        )
      })}
    </div>
  )
}
