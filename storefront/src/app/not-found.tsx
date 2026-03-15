import Link from "next/link"
import { Disc3, Home, BookOpen, Gavel } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      {/* Spinning disc icon */}
      <div className="mb-8 flex justify-center">
        <Disc3 className="h-16 w-16 text-primary/40 animate-spin" style={{ animationDuration: "4s" }} />
      </div>

      {/* Large 404 */}
      <h1
        className="font-serif text-[8rem] leading-none font-bold tracking-tight text-primary/20 select-none"
        style={{ fontFamily: "var(--font-dm-serif)" }}
      >
        404
      </h1>

      {/* Heading */}
      <h2
        className="mt-2 text-3xl font-bold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-dm-serif)" }}
      >
        Page Not Found
      </h2>

      {/* Description */}
      <p className="mt-4 text-lg text-muted-foreground max-w-md mx-auto">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      {/* Navigation links */}
      <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/">
            <Home className="mr-2 h-4 w-4" />
            Go to Homepage
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/catalog">
            <BookOpen className="mr-2 h-4 w-4" />
            Browse Catalog
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/auctions">
            <Gavel className="mr-2 h-4 w-4" />
            View Auctions
          </Link>
        </Button>
      </div>
    </main>
  )
}
