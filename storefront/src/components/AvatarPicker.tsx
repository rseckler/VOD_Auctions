"use client"

import { useState } from "react"
import { Check } from "lucide-react"

// 30 thematically fitting avatar presets for a vinyl/music collector platform
const PRESET_AVATARS: { id: string; emoji: string; label: string }[] = [
  // Vinyl & Music
  { id: "vinyl", emoji: "\uD83C\uDFB5", label: "Music Note" },
  { id: "disc", emoji: "\uD83D\uDCBF", label: "Disc" },
  { id: "headphones", emoji: "\uD83C\uDFA7", label: "Headphones" },
  { id: "microphone", emoji: "\uD83C\uDFA4", label: "Microphone" },
  { id: "guitar", emoji: "\uD83C\uDFB8", label: "Guitar" },
  { id: "drum", emoji: "\uD83E\uDD41", label: "Drum" },
  { id: "piano", emoji: "\uD83C\uDFB9", label: "Piano" },
  { id: "speaker", emoji: "\uD83D\uDD0A", label: "Speaker" },
  { id: "radio", emoji: "\uD83D\uDCFB", label: "Radio" },
  { id: "tape", emoji: "\uD83D\uDCFC", label: "Cassette" },
  // Industrial / Dark
  { id: "skull", emoji: "\uD83D\uDC80", label: "Skull" },
  { id: "bat", emoji: "\uD83E\uDD87", label: "Bat" },
  { id: "spider", emoji: "\uD83D\uDD77\uFE0F", label: "Spider" },
  { id: "moon", emoji: "\uD83C\uDF19", label: "Moon" },
  { id: "lightning", emoji: "\u26A1", label: "Lightning" },
  { id: "fire", emoji: "\uD83D\uDD25", label: "Fire" },
  { id: "chain", emoji: "\u26D3\uFE0F", label: "Chain" },
  { id: "gear", emoji: "\u2699\uFE0F", label: "Gear" },
  { id: "factory", emoji: "\uD83C\uDFED", label: "Factory" },
  { id: "satellite", emoji: "\uD83D\uDEF0\uFE0F", label: "Satellite" },
  // Collector / Culture
  { id: "crown", emoji: "\uD83D\uDC51", label: "Crown" },
  { id: "gem", emoji: "\uD83D\uDC8E", label: "Gem" },
  { id: "star", emoji: "\u2B50", label: "Star" },
  { id: "eye", emoji: "\uD83D\uDC41\uFE0F", label: "Eye" },
  { id: "robot", emoji: "\uD83E\uDD16", label: "Robot" },
  { id: "alien", emoji: "\uD83D\uDC7E", label: "Alien" },
  { id: "ghost", emoji: "\uD83D\uDC7B", label: "Ghost" },
  { id: "crystal", emoji: "\uD83D\uDD2E", label: "Crystal Ball" },
  { id: "globe", emoji: "\uD83C\uDF0D", label: "Globe" },
  { id: "rocket", emoji: "\uD83D\uDE80", label: "Rocket" },
]

export function getPresetEmoji(presetId: string | null): string | null {
  if (!presetId) return null
  return PRESET_AVATARS.find((a) => a.id === presetId)?.emoji || null
}

export function CollectorAvatar({
  avatarType,
  avatarPreset,
  displayName,
  size = "md",
}: {
  avatarType: string
  avatarPreset: string | null
  displayName: string
  size?: "sm" | "md" | "lg"
}) {
  const sizeClasses = {
    sm: "h-8 w-8 text-sm",
    md: "h-12 w-12 text-xl",
    lg: "h-20 w-20 text-3xl",
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
}: {
  selected: string | null
  onSelect: (presetId: string | null) => void
}) {
  const [showAll, setShowAll] = useState(false)
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
