"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/AuthProvider"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { getToken } from "@/lib/auth"
import { toast } from "sonner"
import { Loader2, Save, ExternalLink, Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import { AvatarPicker, CollectorAvatar } from "@/components/AvatarPicker"

type ProfileData = {
  display_name: string | null
  bio: string | null
  genre_tags: string[]
  is_public: boolean
  avatar_type: string
  avatar_preset: string | null
}

export default function ProfilePage() {
  const { isAuthenticated } = useAuth()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [slug, setSlug] = useState("")

  const [displayName, setDisplayName] = useState("")
  const [bio, setBio] = useState("")
  const [genreTagsInput, setGenreTagsInput] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [avatarType, setAvatarType] = useState<"initial" | "preset" | "custom">("initial")
  const [avatarPreset, setAvatarPreset] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const fetchProfile = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch(`${MEDUSA_URL}/store/account/profile`, {
        headers: {
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        setSlug(data.slug || "")
        if (data.profile) {
          setDisplayName(data.profile.display_name || "")
          setBio(data.profile.bio || "")
          setGenreTagsInput(
            (data.profile.genre_tags || []).join(", ")
          )
          setIsPublic(data.profile.is_public || false)
          setAvatarType(data.profile.avatar_type || "initial")
          setAvatarPreset(data.profile.avatar_preset || null)
          setAvatarUrl(data.profile.avatar_url || null)
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile()
    }
  }, [isAuthenticated, fetchProfile])

  async function handleSave() {
    const token = getToken()
    if (!token) return

    setSaving(true)
    try {
      const genre_tags = genreTagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)

      const res = await fetch(`${MEDUSA_URL}/store/account/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          genre_tags,
          is_public: isPublic,
          avatar_type: avatarType,
          avatar_preset: avatarPreset,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setSlug(data.slug || slug)
        toast.success("Profile saved successfully")
      } else {
        toast.error("Failed to save profile")
      }
    } catch {
      toast.error("Failed to save profile")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-6">Collector Profile</h2>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Collector Profile</h2>

      <div className="space-y-6">
        {/* Profile Form */}
        <Card className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Public Profile
          </h3>

          <div className="space-y-4">
            {/* Avatar */}
            <div className="space-y-3">
              <Label>Avatar</Label>
              <div className="flex items-center gap-4 mb-3">
                <CollectorAvatar
                  avatarType={avatarType}
                  avatarPreset={avatarPreset}
                  avatarUrl={avatarUrl}
                  displayName={displayName || `Collector-${slug}`}
                  size="lg"
                />
                <div>
                  <p className="text-sm font-medium">{displayName || `Collector-${slug}`}</p>
                  <p className="text-xs text-muted-foreground">
                    {avatarType === "preset" ? "Custom avatar" : "Initial letter"}
                  </p>
                </div>
              </div>
              <AvatarPicker
                selected={avatarType === "preset" ? avatarPreset : null}
                onSelect={(presetId) => {
                  if (presetId) {
                    setAvatarType("preset")
                    setAvatarPreset(presetId)
                    setAvatarUrl(null)
                  } else {
                    setAvatarType("initial")
                    setAvatarPreset(null)
                    setAvatarUrl(null)
                  }
                }}
                uploading={uploading}
                onUpload={async (file) => {
                  const token = getToken()
                  if (!token) return
                  setUploading(true)
                  try {
                    const res = await fetch(`${MEDUSA_URL}/store/account/profile-avatar`, {
                      method: "POST",
                      headers: {
                        "Content-Type": file.type,
                        "x-publishable-api-key": PUBLISHABLE_KEY,
                        Authorization: `Bearer ${token}`,
                      },
                      body: file,
                    })
                    if (res.ok) {
                      const data = await res.json()
                      setAvatarType("custom")
                      setAvatarPreset(null)
                      setAvatarUrl(data.avatar_url)
                      toast.success("Avatar uploaded")
                    } else {
                      const err = await res.json().catch(() => ({}))
                      toast.error(err.message || "Upload failed")
                    }
                  } catch {
                    toast.error("Upload failed")
                  } finally {
                    setUploading(false)
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={`Collector-${slug}`}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                Shown on your public profile. Leave empty to use your anonymous ID.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell other collectors about yourself and your collection..."
                maxLength={1000}
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">
                {bio.length}/1000
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="genreTags">Genre Tags</Label>
              <Input
                id="genreTags"
                value={genreTagsInput}
                onChange={(e) => setGenreTagsInput(e.target.value)}
                placeholder="Industrial, EBM, Noise, Dark Ambient"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of genres you collect.
              </p>
              {genreTagsInput.trim() && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {genreTagsInput
                    .split(",")
                    .map((t) => t.trim())
                    .filter((t) => t.length > 0)
                    .map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="bg-[#d4a54a]/10 text-[#d4a54a] border-[#d4a54a]/30 text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Visibility */}
        <Card className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">
            Visibility
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                {isPublic ? (
                  <Eye className="h-4 w-4 text-[#d4a54a]" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
                Public Profile
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, other collectors can view your profile and stats.
              </p>
            </div>
            <button
              onClick={() => setIsPublic(!isPublic)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                isPublic ? "bg-primary" : "bg-muted"
              }`}
              role="switch"
              aria-checked={isPublic}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isPublic ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {isPublic && slug && (
            <div className="mt-4 p-3 rounded-md bg-[#d4a54a]/5 border border-[#d4a54a]/20">
              <p className="text-xs text-muted-foreground mb-1">
                Your public profile URL:
              </p>
              <Link
                href={`/collector/${slug}`}
                className="text-sm text-[#d4a54a] hover:underline inline-flex items-center gap-1"
              >
                vod-auctions.com/collector/{slug}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-2"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Profile
        </Button>
      </div>
    </div>
  )
}
