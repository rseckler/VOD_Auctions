"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useAuth } from "@/components/AuthProvider"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"
import { getToken } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

const RATINGS = [
  { emoji: "\u{1F61F}", label: "Poor" },
  { emoji: "\u{1F610}", label: "Fair" },
  { emoji: "\u{1F642}", label: "Good" },
  { emoji: "\u{1F60A}", label: "Great" },
  { emoji: "\u{1F929}", label: "Amazing" },
]

export default function FeedbackPage() {
  const searchParams = useSearchParams()
  const orderRef = searchParams.get("order")
  const initialRating = searchParams.get("rating")
  const { customer } = useAuth()

  const [rating, setRating] = useState<number>(
    initialRating ? Math.min(5, Math.max(1, parseInt(initialRating))) : 0
  )
  const [comment, setComment] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!rating || !orderRef) return
    setSubmitting(true)

    try {
      const token = getToken()
      const res = await fetch(`${MEDUSA_URL}/store/account/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          order_group_id: orderRef,
          rating,
          comment: comment.trim() || undefined,
        }),
      })

      if (res.ok) {
        setSubmitted(true)
        toast.success("Thank you for your feedback!")
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.message || "Failed to submit feedback")
      }
    } catch {
      toast.error("Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  if (!orderRef) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">No order specified.</p>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <p className="text-4xl mb-4">&#10003;</p>
        <h2 className="text-xl font-bold mb-2">Thank you!</h2>
        <p className="text-muted-foreground mb-6">
          Your feedback helps us improve VOD Auctions.
        </p>
        <Button variant="outline" asChild>
          <a href="/auctions">Browse Auctions</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">How was your purchase?</h2>
      <p className="text-muted-foreground mb-6">
        Hi {customer?.first_name || "there"}, we'd love to hear about your experience.
      </p>

      <div className="mb-6">
        <p className="text-sm text-muted-foreground mb-3">Rate your experience:</p>
        <div className="flex justify-center gap-2">
          {RATINGS.map((r, i) => {
            const value = i + 1
            const isSelected = rating === value
            return (
              <button
                key={value}
                onClick={() => setRating(value)}
                className={`h-12 w-12 rounded-full text-2xl transition-all ${
                  isSelected
                    ? "bg-primary/20 ring-2 ring-primary scale-110"
                    : "bg-muted hover:bg-muted/80"
                }`}
                title={r.label}
              >
                {r.emoji}
              </button>
            )
          })}
        </div>
        {rating > 0 && (
          <p className="text-center text-sm text-muted-foreground mt-2">
            {RATINGS[rating - 1].label}
          </p>
        )}
      </div>

      <div className="mb-6">
        <label className="text-sm text-muted-foreground mb-2 block">
          Comments (optional):
        </label>
        <textarea
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us about your experience..."
          className="w-full rounded-lg border border-primary/25 bg-input p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!rating || submitting}
        className="w-full"
      >
        {submitting ? "Submitting..." : "Send Feedback"}
      </Button>
    </div>
  )
}
