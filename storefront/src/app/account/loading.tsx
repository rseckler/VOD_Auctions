import { Skeleton } from "@/components/ui/skeleton"

export default function AccountLoading() {
  return (
    <div>
      {/* Welcome heading */}
      <Skeleton className="h-7 w-48 mb-6" />

      {/* Summary cards grid (matches 2-col layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-6 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-9 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}
