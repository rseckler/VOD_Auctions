import { Skeleton } from "@/components/ui/skeleton"

export default function AuctionsLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      {/* Heading */}
      <Skeleton className="h-8 w-36 mb-2" />
      <Skeleton className="h-5 w-80 mb-8" />

      {/* Status filter pills */}
      <div className="flex gap-2 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      {/* Auction block cards */}
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col sm:flex-row gap-6 rounded-lg border border-border p-4"
          >
            {/* Block image */}
            <Skeleton className="h-48 w-full sm:w-64 rounded-lg shrink-0" />

            {/* Block info */}
            <div className="flex-1 space-y-3">
              {/* Status badge */}
              <Skeleton className="h-5 w-20 rounded-full" />
              {/* Title */}
              <Skeleton className="h-7 w-3/4" />
              {/* Description */}
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              {/* Meta row */}
              <div className="flex gap-4 mt-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
