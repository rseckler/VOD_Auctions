import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { Knex } from "knex"
import { requireCommunityEnabled } from "../../../../lib/community"

// POST /store/community/embed — resolve a media URL to an embeddable iframe src.
//
// Body: { url }
// Returns { provider, embed_url }. Supported: YouTube, Vimeo, Spotify,
// SoundCloud (pure URL pattern) and Bandcamp (oEmbed lookup).
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const pg: Knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  if (!(await requireCommunityEnabled(pg, res))) return

  const customerId = (req as any).auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ message: "Authentication required" })
    return
  }

  const url = String((req.body as Record<string, any>)?.url || "").trim()
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(422).json({ message: "Please provide a valid URL" })
    return
  }

  // YouTube
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
  )
  if (yt) {
    res.json({ provider: "youtube", embed_url: `https://www.youtube.com/embed/${yt[1]}` })
    return
  }

  // Vimeo
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeo) {
    res.json({
      provider: "vimeo",
      embed_url: `https://player.vimeo.com/video/${vimeo[1]}`,
    })
    return
  }

  // Spotify
  const spotify = url.match(
    /open\.spotify\.com\/(track|album|playlist|episode|show)\/([\w]+)/
  )
  if (spotify) {
    res.json({
      provider: "spotify",
      embed_url: `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}`,
    })
    return
  }

  // SoundCloud — the player accepts the original URL directly
  if (/soundcloud\.com\//i.test(url) && !/w\.soundcloud\.com/i.test(url)) {
    res.json({
      provider: "soundcloud",
      embed_url: `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        url
      )}&color=%23d4a54a&hide_related=true&show_comments=false`,
    })
    return
  }

  // Bandcamp — needs an oEmbed lookup to get the EmbeddedPlayer src
  if (/bandcamp\.com\//i.test(url)) {
    try {
      const r = await fetch(
        `https://bandcamp.com/api/oembed?format=json&url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (r.ok) {
        const data = (await r.json()) as { html?: string }
        const src = data.html?.match(/src="([^"]+)"/)?.[1]
        if (src) {
          res.json({
            provider: "bandcamp",
            embed_url: src.startsWith("//") ? `https:${src}` : src,
          })
          return
        }
      }
    } catch {
      // fall through to the unsupported response
    }
    res.status(422).json({ message: "Could not embed this Bandcamp URL" })
    return
  }

  res.status(422).json({
    message: "Unsupported link — YouTube, Vimeo, Spotify, SoundCloud, Bandcamp",
  })
}
