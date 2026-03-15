import { Skeleton } from "@/components/ui/skeleton"

export default function CatalogLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      {/* Header area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Search bar */}
      <Skeleton className="h-10 w-full mb-6" />

      {/* Category pills */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
        ))}
      </div>

      {/* Results count */}
      <Skeleton className="h-5 w-32 mb-6" />

      {/* Card grid: 2 cols mobile, 3 md, 6 lg */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="space-y-2">
            {/* Cover image */}
            <Skeleton className="aspect-square w-full rounded-lg" />
            {/* Artist name */}
            <Skeleton className="h-4 w-3/4" />
            {/* Title */}
            <Skeleton className="h-4 w-full" />
            {/* Format / Price row */}
            <div className="flex justify-between">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-14" />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-2 mt-10">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-9 rounded-md" />
        ))}
      </div>
    </main>
  )
}
