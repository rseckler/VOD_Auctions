"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { CommunityListItem } from "@/lib/community-api"
import {
  addListItem,
  removeListItem,
  deleteList,
  CommunityError,
} from "@/lib/community-mutations"
import { ReleasePicker, type PickedRelease } from "./ReleasePicker"

// Items area of a list-detail page. Read-only for visitors; the owner gets
// an add-release picker, per-item remove, and a delete-list control.
export function ListManager({
  listId,
  isOwner,
  initialItems,
}: {
  listId: string
  isOwner: boolean
  initialItems: CommunityListItem[]
}) {
  const router = useRouter()
  const [items, setItems] = useState<CommunityListItem[]>(initialItems)
  const [picker, setPicker] = useState<PickedRelease | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function add(r: PickedRelease) {
    setPicker(null)
    if (items.some((i) => i.release_id === r.id)) return
    setBusy(true)
    setError(null)
    try {
      await addListItem(listId, r.id)
      setItems((prev) => [
        ...prev,
        {
          release_id: r.id,
          rank: prev.length + 1,
          note: null,
          release: {
            id: r.id,
            title: r.title,
            cover_image: r.cover_image || null,
            artist_name: r.artist_name || null,
          },
        },
      ])
    } catch (e) {
      setError(e instanceof CommunityError ? e.message : "Could not add release.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(releaseId: string) {
    setBusy(true)
    setError(null)
    try {
      await removeListItem(listId, releaseId)
      setItems((prev) => prev.filter((i) => i.release_id !== releaseId))
    } catch (e) {
      setError(
        e instanceof CommunityError ? e.message : "Could not remove release."
      )
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this list? This cannot be undone.")) return
    setBusy(true)
    try {
      await deleteList(listId)
      router.push("/community/lists")
    } catch (e) {
      setError(e instanceof CommunityError ? e.message : "Could not delete.")
      setBusy(false)
    }
  }

  return (
    <div>
      {isOwner && (
        <div className="cm-list-add">
          <ReleasePicker value={picker} onChange={(r) => r && add(r)} />
        </div>
      )}
      {error && (
        <div className="cm-composer-error" style={{ margin: "8px 0" }}>
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="cm-empty">
          {isOwner
            ? "This list is empty — search the catalog above to add releases."
            : "This list has no releases yet."}
        </div>
      ) : (
        <ol className="cm-list-items">
          {items.map((it, i) => (
            <li key={it.release_id} className="cm-list-item">
              <span className="cm-list-item-rank">{i + 1}</span>
              <Link
                href={`/catalog/${it.release_id}`}
                className="cm-list-item-main"
                prefetch={false}
              >
                <span
                  className="cm-list-item-cover"
                  style={
                    it.release?.cover_image
                      ? { backgroundImage: `url(${it.release.cover_image})` }
                      : undefined
                  }
                />
                <span className="cm-list-item-info">
                  <span className="cm-list-item-title">
                    {it.release?.title || it.release_id}
                  </span>
                  {it.release?.artist_name && (
                    <span className="cm-list-item-artist">
                      {it.release.artist_name}
                    </span>
                  )}
                </span>
              </Link>
              {isOwner && (
                <button
                  type="button"
                  className="cm-list-item-remove"
                  onClick={() => remove(it.release_id)}
                  disabled={busy}
                  aria-label="Remove from list"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {isOwner && (
        <div style={{ marginTop: 28 }}>
          <button
            type="button"
            className="cm-btn cm-btn-ghost cm-btn-sm"
            onClick={onDelete}
            disabled={busy}
          >
            Delete list
          </button>
        </div>
      )}
    </div>
  )
}
