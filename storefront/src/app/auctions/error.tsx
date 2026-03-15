"use client"

import Link from "next/link"
import { Disc3 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AuctionsError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="text-center py-16">
      <Disc3 className="h-12 w-12 text-primary/30 mx-auto mb-4" />
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        {error.message || "Failed to load the auctions. Please try again."}
      </p>
      <div className="flex gap-3 justify-center">
        <Button onClick={reset} className="bg-primary hover:bg-primary/90 text-[#1c1915]">
          Try Again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Go to Homepage</Link>
        </Button>
      </div>
    </div>
  )
}
