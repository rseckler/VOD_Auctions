import { Skeleton } from "@/components/ui/skeleton"

export default function ItemDetailLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      {/* Back link */}
      <Skeleton className="h-9 w-32 mb-8" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Image gallery skeleton */}
        <div className="space-y-3">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="aspect-square w-full rounded" />
            ))}
          </div>
        </div>

        {/* Details skeleton */}
        <div className="space-y-6">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-10 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    </main>
  )
}
