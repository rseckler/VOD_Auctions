"use client"

import { useState, useRef, useEffect } from "react"
import { Share2, Copy, Check, Mail } from "lucide-react"
import { toast } from "sonner"

interface ShareButtonProps {
  url: string
  title: string
  text?: string
  compact?: boolean
}

export function ShareButton({ url, title, text, compact = false }: ShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  async function handleShare() {
    // Mobile: use native share sheet
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url })
      } catch {
        // User cancelled — ignore
      }
      return
    }
    // Desktop: toggle dropdown
    setOpen((prev) => !prev)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success("Link copied!")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy link")
    }
    setOpen(false)
  }

  function shareVia(shareUrl: string) {
    window.open(shareUrl, "_blank", "noopener,noreferrer,width=600,height=400")
    setOpen(false)
  }

  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  return (
    <div className="relative" ref={ref}>
      {compact ? (
        // Icon-only style for tight contexts (e.g. item detail next to title)
        <button
          onClick={handleShare}
          title="Share"
          className={`w-11 h-11 rounded-[10px] border flex items-center justify-center transition-all flex-shrink-0 ${
            open
              ? "bg-primary/20 border-primary/50"
              : "bg-primary/8 border-primary/25 hover:bg-primary/15 hover:border-primary/40"
          }`}
        >
          <Share2 className="w-[22px] h-[22px] text-primary" />
        </button>
      ) : (
        // Text button style for block pages and general use
        <button
          onClick={handleShare}
          title="Share"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
            open
              ? "border-[rgba(232,224,212,0.2)] text-foreground"
              : "border-[rgba(232,224,212,0.12)] text-muted-foreground hover:text-foreground hover:border-[rgba(232,224,212,0.2)]"
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          Share
        </button>
      )}

      {open && (
        <div className="absolute top-[calc(100%+6px)] right-0 w-[200px] bg-secondary border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Copy Link */}
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-primary hover:bg-primary/10 transition-colors"
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied ? "Copied!" : "Copy Link"}
          </button>

          <div className="h-px bg-[rgba(232,224,212,0.06)] mx-2" />

          {/* WhatsApp */}
          <button
            onClick={() =>
              shareVia(`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`)
            }
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-primary/10 transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            WhatsApp
          </button>

          {/* X (Twitter) */}
          <button
            onClick={() =>
              shareVia(
                `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`
              )
            }
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-primary/10 transition-colors"
          >
            <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-xs font-extrabold text-foreground">𝕏</span>
            X (Twitter)
          </button>

          {/* Facebook */}
          <button
            onClick={() =>
              shareVia(
                `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
              )
            }
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-foreground hover:bg-primary/10 transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Facebook
          </button>
        </div>
      )}
    </div>
  )
}
