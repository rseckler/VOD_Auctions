import type { Metadata } from "next"
import Link from "next/link"
import { fetchLists } from "@/lib/community-api"
import { ListCard } from "@/components/community/ListCard"

export const metadata: Metadata = {
  title: "Lists — VOD Community",
  description: "Curated collections by the VOD collector community.",
}

export default async function CommunityListsPage() {
  const lists = await fetchLists({ sort: "recent", limit: 48 })

  return (
    <div className="cm-container" style={{ paddingTop: 28, paddingBottom: 80 }}>
      <div className="cm-list-head">
        <div>
          <h1 className="cm-page-head-title">Lists</h1>
          <p className="cm-page-head-sub">
            Curated collections — essential pressings, hunts, themed sets.
          </p>
        </div>
        <Link
          href="/community/lists/new"
          className="cm-btn cm-btn-primary"
          prefetch={false}
        >
          + New list
        </Link>
      </div>

      {lists.length === 0 ? (
        <div className="cm-empty">
          <p style={{ marginBottom: 12 }}>
            No lists yet — be the first to curate one.
          </p>
          <Link href="/community/lists/new" className="cm-btn cm-btn-primary">
            Create a list
          </Link>
        </div>
      ) : (
        <div className="cm-list-grid">
          {lists.map((l) => (
            <ListCard key={l.id} list={l} />
          ))}
        </div>
      )}
    </div>
  )
}
