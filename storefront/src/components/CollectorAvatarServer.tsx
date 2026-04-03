// Server-compatible avatar component (no "use client")
// For client components, use CollectorAvatar from AvatarPicker.tsx

const PRESET_EMOJI: Record<string, string> = {
  skull: "\uD83D\uDC80", gear: "\u2699\uFE0F", factory: "\uD83C\uDFED", chain: "\u26D3\uFE0F",
  lightning: "\u26A1", fire: "\uD83D\uDD25", dagger: "\uD83D\uDDE1\uFE0F", shield: "\uD83D\uDEE1\uFE0F",
  hammer: "\uD83D\uDD28", bomb: "\uD83D\uDCA3", bat: "\uD83E\uDD87", spider: "\uD83D\uDD77\uFE0F",
  moon: "\uD83C\uDF19", eye: "\uD83D\uDC41\uFE0F", crystal: "\uD83D\uDD2E", ghost: "\uD83D\uDC7B",
  snake: "\uD83D\uDC0D", black_heart: "\uD83D\uDDA4", coffin: "\u26B0\uFE0F", candle: "\uD83D\uDD6F\uFE0F",
  disc: "\uD83D\uDCBF", headphones: "\uD83C\uDFA7", speaker: "\uD83D\uDD0A", tape: "\uD83D\uDCFC",
  microphone: "\uD83C\uDFA4", robot: "\uD83E\uDD16", alien: "\uD83D\uDC7E", satellite: "\uD83D\uDEF0\uFE0F",
  radioactive: "\u2622\uFE0F", biohazard: "\u2623\uFE0F",
}

export function CollectorAvatarServer({
  avatarType,
  avatarPreset,
  avatarUrl,
  displayName,
  size = "lg",
}: {
  avatarType?: string
  avatarPreset?: string | null
  avatarUrl?: string | null
  displayName: string
  size?: "sm" | "md" | "lg"
}) {
  const sizeClasses = { sm: "h-8 w-8 text-sm", md: "h-12 w-12 text-xl", lg: "h-20 w-20 text-3xl" }

  if (avatarType === "custom" && avatarUrl) {
    return (
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden flex-shrink-0 border border-primary/30`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={displayName} className="object-cover h-full w-full" />
      </div>
    )
  }

  const emoji = avatarType === "preset" && avatarPreset ? PRESET_EMOJI[avatarPreset] : null

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0`}>
      {emoji ? (
        <span>{emoji}</span>
      ) : (
        <span className="font-serif text-primary">{(displayName || "?").charAt(0).toUpperCase()}</span>
      )}
    </div>
  )
}
