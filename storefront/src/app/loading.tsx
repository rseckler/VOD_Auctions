import { Skeleton } from "@/components/ui/skeleton"

export default function HomeLoading() {
  return (
    <main>
      {/* Hero skeleton */}
      <section className="py-32 md:py-48 px-6">
        <div className="mx-auto max-w-4xl text-center space-y-6">
          <Skeleton className="h-14 w-3/4 mx-auto" />
          <Skeleton className="h-6 w-1/2 mx-auto" />
          <Skeleton className="h-12 w-40 mx-auto rounded-lg" />
        </div>
      </section>

      {/* Block grid skeleton */}
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <Skeleton className="h-8 w-48 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-video w-full rounded-lg" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
