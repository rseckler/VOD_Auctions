// Server-compatible avatar component (no "use client")
// For client components, use CollectorAvatar from AvatarPicker.tsx

const PRESET_EMOJI: Record<string, string> = {
  vinyl: "\uD83C\uDFB5", disc: "\uD83D\uDCBF", headphones: "\uD83C\uDFA7", microphone: "\uD83C\uDFA4",
  guitar: "\uD83C\uDFB8", drum: "\uD83E\uDD41", piano: "\uD83C\uDFB9", speaker: "\uD83D\uDD0A",
  radio: "\uD83D\uDCFB", tape: "\uD83D\uDCFC", skull: "\uD83D\uDC80", bat: "\uD83E\uDD87",
  spider: "\uD83D\uDD77\uFE0F", moon: "\uD83C\uDF19", lightning: "\u26A1", fire: "\uD83D\uDD25",
  chain: "\u26D3\uFE0F", gear: "\u2699\uFE0F", factory: "\uD83C\uDFED", satellite: "\uD83D\uDEF0\uFE0F",
  crown: "\uD83D\uDC51", gem: "\uD83D\uDC8E", star: "\u2B50", eye: "\uD83D\uDC41\uFE0F",
  robot: "\uD83E\uDD16", alien: "\uD83D\uDC7E", ghost: "\uD83D\uDC7B", crystal: "\uD83D\uDD2E",
  globe: "\uD83C\uDF0D", rocket: "\uD83D\uDE80",
}

export function CollectorAvatarServer({
  avatarType,
  avatarPreset,
  displayName,
  size = "lg",
}: {
  avatarType?: string
  avatarPreset?: string | null
  displayName: string
  size?: "sm" | "md" | "lg"
}) {
  const sizeClasses = { sm: "h-8 w-8 text-sm", md: "h-12 w-12 text-xl", lg: "h-20 w-20 text-3xl" }
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
