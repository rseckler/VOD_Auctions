import { Skeleton } from "@/components/ui/skeleton"

export default function CatalogDetailLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-48" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Left: Image area */}
        <div className="space-y-4">
          {/* Main image */}
          <Skeleton className="aspect-square w-full rounded-lg" />
          {/* Thumbnail strip */}
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-16 rounded-md shrink-0" />
            ))}
          </div>
        </div>

        {/* Right: Info area */}
        <div className="space-y-6">
          {/* Format badge */}
          <Skeleton className="h-6 w-20 rounded-full" />

          {/* Artist */}
          <Skeleton className="h-5 w-40" />

          {/* Title */}
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />

          {/* Price / Purchase area */}
          <div className="rounded-lg border border-border p-6 space-y-4">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          {/* Details section (vinyl groove style) */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex justify-between border-b border-dotted border-border/50 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </div>

          {/* Tracklist section */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-20" />
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Credits section */}
          <div className="space-y-3">
            <Skeleton className="h-5 w-16" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Related releases section */}
      <div className="mt-16 space-y-4">
        <Skeleton className="h-6 w-36" />
        <div className="flex gap-2 mb-4">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
