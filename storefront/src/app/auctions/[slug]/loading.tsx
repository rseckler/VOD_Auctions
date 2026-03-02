import { Skeleton } from "@/components/ui/skeleton"

export default function BlockDetailLoading() {
  return (
    <main>
      {/* Hero skeleton */}
      <div className="relative h-72 md:h-[28rem] bg-card">
        <div className="absolute inset-0 flex items-end">
          <div className="mx-auto max-w-7xl w-full px-6 pb-10 space-y-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-10 w-96" />
            <Skeleton className="h-5 w-64" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="mx-auto max-w-7xl px-6 py-12 space-y-8">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
