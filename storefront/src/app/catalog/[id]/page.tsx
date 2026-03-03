import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight, ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ImageGallery } from "@/components/ImageGallery"
import { medusaFetch } from "@/lib/api"
import type { Release } from "@/types"

type CatalogRelease = Release & {
  images?: { id: string; url: string; alt: string }[]
  various_artists?: { artist_name: string | null; role: string }[]
  comments?: { id: string; content: string; rating: number | null; legacy_date: string | null }[]
  discogs_lowest_price?: number | null
  discogs_num_for_sale?: number | null
}

async function getRelease(id: string): Promise<{ release: CatalogRelease } | null> {
  return medusaFetch<{ release: CatalogRelease }>(
    `/store/catalog/${id}`,
    { revalidate: 60 }
  )
}

const FORMAT_COLORS: Record<string, string> = {
  LP: "bg-format-vinyl/15 text-format-vinyl border-format-vinyl/30",
  CD: "bg-format-cd/15 text-format-cd border-format-cd/30",
  CASSETTE: "bg-format-cassette/15 text-format-cassette border-format-cassette/30",
}

export default async function CatalogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getRelease(id)
  if (!data) notFound()

  const release = data.release

  const images: string[] = []
  if (release.coverImage) images.push(release.coverImage)
  if (release.images) {
    for (const img of release.images) {
      if (img.url && img.url !== release.coverImage) {
        images.push(img.url)
      }
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-8 flex items-center gap-1 flex-wrap">
        <Link href="/catalog" className="hover:text-foreground transition-colors">
          Katalog
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="text-foreground truncate">
          {release.artist_name
            ? `${release.artist_name} — ${release.title}`
            : release.title}
        </span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Images */}
        <ImageGallery images={images} title={release.title} />

        {/* Details */}
        <div>
          <p className="text-muted-foreground text-lg">
            {release.artist_name || "Unknown Artist"}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-1">
            {release.title}
          </h1>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {release.format && (
              <Badge
                variant="outline"
                className={FORMAT_COLORS[release.format] || "bg-secondary text-muted-foreground"}
              >
                {release.format}
              </Badge>
            )}
            {release.year && (
              <Badge variant="secondary">{release.year}</Badge>
            )}
            {release.country && (
              <Badge variant="secondary">{release.country}</Badge>
            )}
          </div>

          {/* Price info */}
          <div className="mt-6 bg-card border border-border/50 rounded-lg p-4 space-y-2">
            {release.legacy_price && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Katalogpreis</span>
                <span className="text-xl font-mono font-bold text-primary">
                  &euro;{release.legacy_price.toFixed(2)}
                </span>
              </div>
            )}
            {release.discogs_lowest_price && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Discogs ab</span>
                <span className="text-sm font-mono">
                  &euro;{release.discogs_lowest_price.toFixed(2)}
                  {release.discogs_num_for_sale ? (
                    <span className="text-muted-foreground ml-1">
                      ({release.discogs_num_for_sale} Angebote)
                    </span>
                  ) : null}
                </span>
              </div>
            )}
            {release.estimated_value && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Schätzwert</span>
                <span className="text-sm font-mono">
                  &euro;{release.estimated_value.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <Separator className="my-6" />
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Details</h2>
            <dl className="space-y-2 text-sm">
              {release.label_name && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Label</dt>
                  <dd>{release.label_name}</dd>
                </div>
              )}
              {release.catalogNumber && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Katalognummer</dt>
                  <dd className="font-mono text-xs">{release.catalogNumber}</dd>
                </div>
              )}
              {release.legacy_condition && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Zustand</dt>
                  <dd className="font-mono text-xs uppercase">{release.legacy_condition}</dd>
                </div>
              )}
              {release.legacy_format_detail && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Format (Detail)</dt>
                  <dd>{release.legacy_format_detail}</dd>
                </div>
              )}
              {release.media_condition && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Medium</dt>
                  <dd>{release.media_condition}</dd>
                </div>
              )}
              {release.sleeve_condition && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Hülle</dt>
                  <dd>{release.sleeve_condition}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Various Artists */}
          {release.various_artists && release.various_artists.length > 0 && (
            <>
              <Separator className="my-6" />
              <div>
                <h2 className="text-lg font-semibold mb-2">Beteiligte Künstler</h2>
                <div className="flex flex-wrap gap-1.5">
                  {release.various_artists.map((va, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {va.artist_name || "Unknown"}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Tracklist */}
          {release.tracklist && release.tracklist.length > 0 && (
            <>
              <Separator className="my-6" />
              <div>
                <h2 className="text-lg font-semibold mb-3">Tracklist</h2>
                <ol className="space-y-1.5">
                  {release.tracklist.map((track, i) => (
                    <li key={i} className="flex items-baseline gap-3 text-sm">
                      <span className="text-muted-foreground font-mono text-xs w-8 flex-shrink-0 text-right">
                        {track.position || `${i + 1}.`}
                      </span>
                      <span className="flex-1">{track.title}</span>
                      {track.duration && (
                        <span className="text-muted-foreground font-mono text-xs">
                          {track.duration}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}

          {/* Credits */}
          {release.credits && (
            <>
              <Separator className="my-6" />
              <div>
                <h2 className="text-lg font-semibold mb-2">Credits</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {release.credits}
                </p>
              </div>
            </>
          )}

          {/* Comments */}
          {release.comments && release.comments.length > 0 && (
            <>
              <Separator className="my-6" />
              <div>
                <h2 className="text-lg font-semibold mb-3">
                  Bewertungen ({release.comments.length})
                </h2>
                <div className="space-y-3">
                  {release.comments.map((comment) => (
                    <div key={comment.id} className="bg-secondary/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        {comment.rating && (
                          <span className="text-primary text-sm">
                            {"★".repeat(comment.rating)}{"☆".repeat(5 - comment.rating)}
                          </span>
                        )}
                        {comment.legacy_date && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(comment.legacy_date).toLocaleDateString("de-DE")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm">{comment.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Separator className="my-8" />
      <Button variant="ghost" asChild>
        <Link href="/catalog">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zum Katalog
        </Link>
      </Button>
    </main>
  )
}
