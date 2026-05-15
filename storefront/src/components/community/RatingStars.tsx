// Static 1–5 star display (Increment 1: whole stars, §17.4).
export function RatingStars({
  value,
  size = 16,
}: {
  value: number
  size?: number
}) {
  const filled = Math.round(value)
  return (
    <span
      className="cm-rating-stars"
      style={{ fontSize: size }}
      aria-label={`${value} von 5 Sternen`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={"cm-star" + (n <= filled ? " is-filled" : "")}
        >
          ★
        </span>
      ))}
    </span>
  )
}
