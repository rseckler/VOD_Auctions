/**
 * ConditionBadge — Discogs/Goldmine grading standard
 * Displays a color-coded badge with a tooltip explaining the grade.
 */

const CONDITION_DESCRIPTIONS: Record<string, string> = {
  M: "Mint — Perfect, unplayed, still in shrink",
  NM: "Near Mint — Nearly perfect, minimal signs of handling",
  "VG+": "Very Good Plus — Shows some signs of play, small scuffs",
  VG: "Very Good — Clearly played, surface marks visible",
  "G+": "Good Plus — Heavy wear, plays through with noise",
  G: "Good — Very heavy wear, significant noise",
  F: "Fair — Badly damaged, plays but very badly",
  P: "Poor — Damaged, plays through only with difficulty",
}

function getColorClass(grade: string): string {
  switch (grade) {
    case "M":
    case "NM":
      return "bg-green-500/15 text-green-400 border-green-500/20"
    case "VG+":
    case "VG":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20"
    case "G+":
    case "G":
      return "bg-orange-500/15 text-orange-400 border-orange-500/20"
    case "F":
    case "P":
      return "bg-red-500/15 text-red-400 border-red-500/20"
    default:
      return "bg-secondary/50 text-muted-foreground border-border"
  }
}

type ConditionBadgeProps = {
  grade: string
  label?: string
}

export function ConditionBadge({ grade, label }: ConditionBadgeProps) {
  const description = CONDITION_DESCRIPTIONS[grade] || grade
  return (
    <span
      title={description}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getColorClass(grade)} cursor-default`}
    >
      {label && <span className="text-[9px] opacity-60 font-normal">{label}</span>}
      {grade}
    </span>
  )
}

type ConditionRowProps = {
  mediaCondition?: string | null
  sleeveCondition?: string | null
}

/**
 * ConditionRow — renders Media + Sleeve condition badges side by side.
 * Returns null if neither condition is set.
 */
export function ConditionRow({ mediaCondition, sleeveCondition }: ConditionRowProps) {
  if (!mediaCondition && !sleeveCondition) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {mediaCondition && <ConditionBadge grade={mediaCondition} label="Media" />}
      {sleeveCondition && <ConditionBadge grade={sleeveCondition} label="Sleeve" />}
    </div>
  )
}
