import { Skeleton } from "@/components/ui/skeleton"

export default function AuctionsLoading() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <Skeleton className="h-10 w-64 mb-2" />
      <Skeleton className="h-5 w-96 mb-8" />

      {/* Tabs skeleton */}
      <Skeleton className="h-10 w-80 mb-8 rounded-lg" />

      {/* Block list skeleton */}
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="w-52 h-36 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-3 py-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
