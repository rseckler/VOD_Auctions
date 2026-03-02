import Link from "next/link"
import { notFound } from "next/navigation"

const MEDUSA_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

type ReleaseImage = {
  id: string
  url: string
  type: string | null
  sortOrder: number | null
}

type Release = {
  id: string
  title: string
  slug: string
  format: string
  year: number | null
  country: string | null
  coverImage: string | null
  catalogNumber: string | null
  estimated_value: number | null
  description: string | null
  media_condition: string | null
  sleeve_condition: string | null
  artist_name: string | null
  label_name: string | null
  images: ReleaseImage[]
}

type BlockItem = {
  id: string
  release_id: string
  start_price: number
  estimated_value: number | null
  current_price: number | null
  bid_count: number
  lot_number: number | null
  status: string
  release: Release | null
}

type BlockInfo = {
  id: string
  title: string
  slug: string
  status: string
}

async function getItem(
  slug: string,
  itemId: string
): Promise<{ block_item: BlockItem; auction_block: BlockInfo } | null> {
  try {
    const res = await fetch(
      `${MEDUSA_URL}/store/auction-blocks/${slug}/items/${itemId}`,
      {
        next: { revalidate: 30 },
        headers: { "x-publishable-api-key": PUBLISHABLE_KEY },
      }
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ slug: string; itemId: string }>
}) {
  const { slug, itemId } = await params
  const data = await getItem(slug, itemId)

  if (!data) notFound()

  const { block_item: item, auction_block: block } = data
  const release = item.release

  // Collect all images
  const images: string[] = []
  if (release?.coverImage) images.push(release.coverImage)
  if (release?.images) {
    for (const img of release.images) {
      if (img.url && img.url !== release.coverImage) {
        images.push(img.url)
      }
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-zinc-500 mb-8">
        <Link href="/auctions" className="hover:text-zinc-300">
          Auktionen
        </Link>
        <span className="mx-2">/</span>
        <Link href={`/auctions/${block.slug}`} className="hover:text-zinc-300">
          {block.title}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-300">
          {release?.artist_name ? `${release.artist_name} — ${release.title}` : release?.title || `Lot ${item.lot_number}`}
        </span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Images */}
        <div>
          {images.length > 0 ? (
            <div className="space-y-3">
              <div className="aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800">
                <img
                  src={images[0]}
                  alt={release?.title || ""}
                  className="w-full h-full object-cover"
                />
              </div>
              {images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {images.slice(1, 5).map((url, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded overflow-hidden bg-zinc-900 border border-zinc-800"
                    >
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-square rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <span className="text-zinc-600">Kein Bild vorhanden</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          {item.lot_number && (
            <p className="text-xs text-zinc-500 font-mono mb-1">
              Lot #{item.lot_number}
            </p>
          )}

          <p className="text-zinc-400 text-lg">
            {release?.artist_name || "Unknown Artist"}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold mt-1">
            {release?.title || item.release_id}
          </h1>

          {/* Format & Year */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {release?.format && (
              <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300">
                {release.format}
              </span>
            )}
            {release?.year && (
              <span className="text-sm text-zinc-400">{release.year}</span>
            )}
            {release?.country && (
              <span className="text-sm text-zinc-500">{release.country}</span>
            )}
          </div>

          {/* Price Section */}
          <div className="mt-6 p-4 rounded-lg border border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-zinc-400">Startpreis</span>
              <span className="text-2xl font-bold">
                &euro;{item.start_price.toFixed(2)}
              </span>
            </div>
            {item.estimated_value && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">Schätzwert</span>
                <span className="text-zinc-400">
                  &euro;{item.estimated_value.toFixed(2)}
                </span>
              </div>
            )}
            {item.bid_count > 0 && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-zinc-500">Gebote</span>
                <span className="text-zinc-400">{item.bid_count}</span>
              </div>
            )}

            <button
              disabled
              className="w-full mt-4 py-3 rounded-lg bg-zinc-700 text-zinc-400 text-sm font-medium cursor-not-allowed"
            >
              Bieten (demnächst verfügbar)
            </button>
            <p className="text-xs text-zinc-600 text-center mt-2">
              Die Bieten-Funktion wird in Kürze freigeschaltet.
            </p>
          </div>

          {/* Release Details */}
          <div className="mt-6 space-y-3">
            <h2 className="text-lg font-semibold">Details</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {release?.label_name && (
                <>
                  <dt className="text-zinc-500">Label</dt>
                  <dd>{release.label_name}</dd>
                </>
              )}
              {release?.catalogNumber && (
                <>
                  <dt className="text-zinc-500">Katalognummer</dt>
                  <dd className="font-mono text-xs">
                    {release.catalogNumber}
                  </dd>
                </>
              )}
              {release?.media_condition && (
                <>
                  <dt className="text-zinc-500">Medium</dt>
                  <dd>{release.media_condition}</dd>
                </>
              )}
              {release?.sleeve_condition && (
                <>
                  <dt className="text-zinc-500">Hülle</dt>
                  <dd>{release.sleeve_condition}</dd>
                </>
              )}
            </dl>
          </div>

          {/* Description */}
          {release?.description && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-2">Beschreibung</h2>
              <p className="text-sm text-zinc-400 whitespace-pre-line">
                {release.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Back Link */}
      <div className="mt-12 pt-8 border-t border-zinc-800">
        <Link
          href={`/auctions/${block.slug}`}
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          &larr; Zurück zu &quot;{block.title}&quot;
        </Link>
      </div>
    </main>
  )
}
