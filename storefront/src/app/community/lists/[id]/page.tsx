import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { fetchList } from "@/lib/community-api"
import { MemberAvatar, TierLabel } from "@/components/community/CommunityUI"
import { ListManager } from "@/components/community/ListManager"

type Params = { id: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { id } = await params
  const data = await fetchList(id)
  return {
    title: data ? `${data.list.title} — VOD Community` : "List — VOD Community",
  }
}

export default async function CommunityListPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { id } = await params
  const data = await fetchList(id)
  if (!data) notFound()

  const { list, items, is_owner } = data
  const covers = list.preview_covers || []

  return (
    <div
      className="cm-container-narrow"
      style={{ paddingTop: 32, paddingBottom: 80 }}
    >
      <Link
        href="/community/lists"
        className="cm-link-gold"
        style={{ fontSize: 12 }}
        prefetch={false}
      >
        ← All lists
      </Link>

      <div className="cm-list-detail-head">
        <div className="cm-list-detail-cover">
          {list.cover_image_url ? (
            <div
              className="cm-list-cover-full"
              style={{ backgroundImage: `url(${list.cover_image_url})` }}
            />
          ) : covers.length > 0 ? (
            <div className="cm-list-cover-grid">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="cm-list-cover-tile"
                  style={
                    covers[i]
                      ? { backgroundImage: `url(${covers[i]})` }
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <div className="cm-list-cover-empty">List</div>
          )}
        </div>
        <div className="cm-list-detail-meta">
          <h1 className="cm-list-detail-title">{list.title}</h1>
          {!list.is_public && (
            <span className="cm-list-private-tag">Private</span>
          )}
          <Link
            href={`/community/members/${list.author.handle}`}
            className="cm-list-detail-author"
            prefetch={false}
          >
            <MemberAvatar
              name={list.author.display_name}
              tier={list.author.tier}
              avatarUrl={list.author.avatar_url}
              size={28}
            />
            <span>{list.author.display_name}</span>
            <TierLabel tier={list.author.tier} />
          </Link>
          {list.description && (
            <p className="cm-list-detail-desc">{list.description}</p>
          )}
          <div className="cm-list-detail-count">
            {list.item_count} {list.item_count === 1 ? "release" : "releases"}
          </div>
        </div>
      </div>

      <ListManager listId={list.id} isOwner={is_owner} initialItems={items} />
    </div>
  )
}
