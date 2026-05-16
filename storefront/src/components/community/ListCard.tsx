import Link from "next/link"
import type { CommunityListCard } from "@/lib/community-api"
import { MemberAvatar } from "./CommunityUI"

// Curated-list card for the lists directory + profile Lists tab.
// Cover: the list's own image, else a montage of its first release covers.
export function ListCard({ list }: { list: CommunityListCard }) {
  const covers = list.preview_covers || []
  return (
    <Link
      href={`/community/lists/${list.slug || list.id}`}
      className="cm-list-card"
      prefetch={false}
    >
      <div className="cm-list-card-cover">
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
        <span className="cm-list-card-count">{list.item_count}</span>
      </div>
      <div className="cm-list-card-body">
        <h3 className="cm-list-card-title">{list.title}</h3>
        {list.description && (
          <p className="cm-list-card-desc">{list.description}</p>
        )}
        <div className="cm-list-card-author">
          <MemberAvatar
            name={list.author.display_name}
            tier={list.author.tier}
            avatarUrl={list.author.avatar_url}
            size={24}
          />
          <span>{list.author.display_name}</span>
        </div>
      </div>
    </Link>
  )
}
