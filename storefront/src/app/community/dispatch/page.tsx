import type { Metadata } from "next"
import { fetchFeed } from "@/lib/community-api"
import { EditorialCard } from "@/components/community/CommunityUI"

export const metadata: Metadata = {
  title: "Dispatch — VOD Community",
  description:
    "From the Vault — editorial dispatches from the VOD curator.",
}

// Dispatch — the curator editorial track. All kind='editorial' posts.
export default async function CommunityDispatchPage() {
  const { posts } = await fetchFeed({ kind: "editorial", limit: 40 })

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 64 }}
    >
      <header className="cm-hub-head">
        <div className="cm-editorial-eyebrow" style={{ marginBottom: 8 }}>
          <span>From the Vault</span>
        </div>
        <h1 className="cm-hub-title">Dispatch</h1>
        <p className="cm-hub-sub">
          Editorial dispatches from the VOD curator — stories, re-discoveries
          and notes from the archive.
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="cm-empty">No dispatches published yet.</div>
      ) : (
        <div className="cm-feed">
          {posts.map((p) => (
            <EditorialCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  )
}
