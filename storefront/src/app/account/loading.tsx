import { Skeleton } from "@/components/ui/skeleton"

// Generic account loading — shown by Next.js during route transitions for any /account/* page.
// Must be visually neutral enough to work as a placeholder for overview, cart, bids, saved, etc.
export default function AccountLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
