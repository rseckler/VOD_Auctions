"use client"

import { useState, useRef } from "react"
import { Check, Upload } from "lucide-react"
import Image from "next/image"

// 30 thematic avatar presets — Industrial Music, Dark Electronics, Vinyl Culture
const PRESET_AVATARS: { id: string; emoji: string; label: string }[] = [
  // Industrial / Dark Electronics
  { id: "skull", emoji: "\uD83D\uDC80", label: "Skull" },
  { id: "gear", emoji: "\u2699\uFE0F", label: "Gear" },
  { id: "factory", emoji: "\uD83C\uDFED", label: "Factory" },
  { id: "chain", emoji: "\u26D3\uFE0F", label: "Chain" },
  { id: "lightning", emoji: "\u26A1", label: "Lightning" },
  { id: "fire", emoji: "\uD83D\uDD25", label: "Fire" },
  { id: "dagger", emoji: "\uD83D\uDDE1\uFE0F", label: "Dagger" },
  { id: "shield", emoji: "\uD83D\uDEE1\uFE0F", label: "Shield" },
  { id: "hammer", emoji: "\uD83D\uDD28", label: "Hammer" },
  { id: "bomb", emoji: "\uD83D\uDCA3", label: "Bomb" },
  // Dark / Occult
  { id: "bat", emoji: "\uD83E\uDD87", label: "Bat" },
  { id: "spider", emoji: "\uD83D\uDD77\uFE0F", label: "Spider" },
  { id: "moon", emoji: "\uD83C\uDF19", label: "Crescent Moon" },
  { id: "eye", emoji: "\uD83D\uDC41\uFE0F", label: "Eye" },
  { id: "crystal", emoji: "\uD83D\uDD2E", label: "Crystal Ball" },
  { id: "ghost", emoji: "\uD83D\uDC7B", label: "Ghost" },
  { id: "snake", emoji: "\uD83D\uDC0D", label: "Snake" },
  { id: "black_heart", emoji: "\uD83D\uDDA4", label: "Black Heart" },
  { id: "coffin", emoji: "\u26B0\uFE0F", label: "Coffin" },
  { id: "candle", emoji: "\uD83D\uDD6F\uFE0F", label: "Candle" },
  // Music & Vinyl
  { id: "disc", emoji: "\uD83D\uDCBF", label: "Disc" },
  { id: "headphones", emoji: "\uD83C\uDFA7", label: "Headphones" },
  { id: "speaker", emoji: "\uD83D\uDD0A", label: "Speaker" },
  { id: "tape", emoji: "\uD83D\uDCFC", label: "Cassette" },
  { id: "microphone", emoji: "\uD83C\uDFA4", label: "Microphone" },
  // Sci-Fi / Dystopian
  { id: "robot", emoji: "\uD83E\uDD16", label: "Robot" },
  { id: "alien", emoji: "\uD83D\uDC7E", label: "Alien" },
  { id: "satellite", emoji: "\uD83D\uDEF0\uFE0F", label: "Satellite" },
  { id: "radioactive", emoji: "\u2622\uFE0F", label: "Radioactive" },
  { id: "biohazard", emoji: "\u2623\uFE0F", label: "Biohazard" },
]

export function getPresetEmoji(presetId: string | null): string | null {
  if (!presetId) return null
  return PRESET_AVATARS.find((a) => a.id === presetId)?.emoji || null
}

export function CollectorAvatar({
  avatarType,
  avatarPreset,
  avatarUrl,
  displayName,
  size = "md",
}: {
  avatarType: string
  avatarPreset: string | null
  avatarUrl?: string | null
  displayName: string
  size?: "sm" | "md" | "lg"
}) {
  const sizeMap = { sm: 32, md: 48, lg: 80 }
  const sizeClasses = {
    sm: "h-8 w-8 text-sm",
    md: "h-12 w-12 text-xl",
    lg: "h-20 w-20 text-3xl",
  }

  if (avatarType === "custom" && avatarUrl) {
    return (
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden flex-shrink-0 border border-primary/30`}>
        <Image src={avatarUrl} alt={displayName} width={sizeMap[size]} height={sizeMap[size]} className="object-cover h-full w-full" />
      </div>
    )
  }

  const emoji = avatarType === "preset" ? getPresetEmoji(avatarPreset) : null

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0`}
    >
      {emoji ? (
        <span>{emoji}</span>
      ) : (
        <span className="font-serif text-primary">
          {(displayName || "?").charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}

export function AvatarPicker({
  selected,
  onSelect,
  onUpload,
  uploading,
}: {
  selected: string | null
  onSelect: (presetId: string | null) => void
  onUpload?: (file: File) => void
  uploading?: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const visible = showAll ? PRESET_AVATARS : PRESET_AVATARS.slice(0, 15)

  return (
    <div>
      <div className="grid grid-cols-6 sm:grid-cols-10 gap-2">
        {/* Initial letter option */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`relative h-10 w-10 rounded-full flex items-center justify-center border transition-colors ${
            selected === null
              ? "border-primary bg-primary/20"
              : "border-border hover:border-primary/50 bg-secondary/50"
          }`}
          title="Use initial letter"
        >
          <span className="font-serif text-sm text-primary">A</span>
          {selected === null && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 bg-primary rounded-full flex items-center justify-center">
              <Check className="h-2 w-2 text-primary-foreground" />
            </span>
          )}
        </button>
        {/* Upload custom avatar */}
        {onUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file && file.size <= 2 * 1024 * 1024) {
                  onUpload(file)
                }
                e.target.value = ""
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative h-10 w-10 rounded-full flex items-center justify-center border border-dashed border-primary/40 hover:border-primary bg-secondary/30 transition-colors"
              title="Upload custom avatar (max 2 MB)"
            >
              {uploading ? (
                <span className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              ) : (
                <Upload className="h-4 w-4 text-primary/60" />
              )}
            </button>
          </>
        )}
        {/* Preset avatars */}
        {visible.map((avatar) => (
          <button
            key={avatar.id}
            type="button"
            onClick={() => onSelect(avatar.id)}
            className={`relative h-10 w-10 rounded-full flex items-center justify-center border transition-colors ${
              selected === avatar.id
                ? "border-primary bg-primary/20"
                : "border-border hover:border-primary/50 bg-secondary/50"
            }`}
            title={avatar.label}
          >
            <span className="text-lg">{avatar.emoji}</span>
            {selected === avatar.id && (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 bg-primary rounded-full flex items-center justify-center">
                <Check className="h-2 w-2 text-primary-foreground" />
              </span>
            )}
          </button>
        ))}
      </div>
      {!showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs text-primary hover:text-primary/80 mt-2 transition-colors"
        >
          Show all 30 avatars
        </button>
      )}
    </div>
  )
}
