"use client"

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  createRef,
} from "react"
import { createRoot, type Root } from "react-dom/client"
import Mention from "@tiptap/extension-mention"
import type { SuggestionOptions } from "@tiptap/suggestion"
import { MEDUSA_URL, PUBLISHABLE_KEY } from "@/lib/api"

// @-mention support for the community composer: one "@" trigger searches both
// members and catalog releases. Members → mention notifications; releases →
// inline reference. Mentions serialise to
//   <span class="cm-mention" data-mention data-mention-type=… data-id=…>@label</span>
// which the backend sanitiser allows and parses for notifications.

export interface MentionItem {
  kind: "user" | "release"
  id: string
  label: string
  sub?: string | null
}

// ─── Suggestion popup list ──────────────────────────────────────────────────
interface MentionListHandle {
  onKeyDown: (e: KeyboardEvent) => boolean
}

const MentionList = forwardRef<
  MentionListHandle,
  { items: MentionItem[]; command: (item: MentionItem) => void }
>(function MentionList({ items, command }, ref) {
  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        setIndex((i) => (i + 1) % Math.max(1, items.length))
        return true
      }
      if (e.key === "ArrowUp") {
        setIndex((i) => (i - 1 + items.length) % Math.max(1, items.length))
        return true
      }
      if (e.key === "Enter") {
        if (items[index]) command(items[index])
        return true
      }
      return false
    },
  }))

  if (items.length === 0) {
    return <div className="cm-mention-popup cm-mention-empty">No matches</div>
  }
  return (
    <div className="cm-mention-popup">
      {items.map((it, i) => (
        <button
          key={`${it.kind}:${it.id}`}
          type="button"
          className={"cm-mention-item" + (i === index ? " is-active" : "")}
          onMouseEnter={() => setIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault()
            command(it)
          }}
        >
          <span className={`cm-mention-kind cm-mention-kind-${it.kind}`}>
            {it.kind === "user" ? "@" : "♪"}
          </span>
          <span className="cm-mention-item-text">
            <span className="cm-mention-item-label">{it.label}</span>
            {it.sub && (
              <span className="cm-mention-item-sub">{it.sub}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
})

// ─── Backend search ─────────────────────────────────────────────────────────
async function searchMentions(query: string): Promise<MentionItem[]> {
  if (!query) return []
  try {
    const res = await fetch(
      `${MEDUSA_URL}/store/community/mention-search?q=${encodeURIComponent(query)}`,
      { headers: { "x-publishable-api-key": PUBLISHABLE_KEY } }
    )
    const d = await res.json()
    const users: MentionItem[] = (d?.users || []).map((u: any) => ({
      kind: "user" as const,
      id: u.id,
      label: u.handle,
      sub: u.display_name,
    }))
    const releases: MentionItem[] = (d?.releases || []).map((r: any) => ({
      kind: "release" as const,
      id: r.id,
      label: r.title || "release",
      sub: r.artist_name,
    }))
    return [...users, ...releases].slice(0, 10)
  } catch {
    return []
  }
}

// ─── Suggestion render glue (no tippy — manual positioning) ─────────────────
const suggestion: Omit<SuggestionOptions<MentionItem>, "editor"> = {
  char: "@",
  items: ({ query }) => searchMentions(query.trim()),
  command: ({ editor, range, props }) => {
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        {
          type: "mention",
          attrs: { id: props.id, label: props.label, mentionType: props.kind },
        },
        { type: "text", text: " " },
      ])
      .run()
  },
  render: () => {
    let root: Root | null = null
    let el: HTMLDivElement | null = null
    const listRef = createRef<MentionListHandle>()

    const draw = (props: any) => {
      if (!root) return
      root.render(
        <MentionList ref={listRef} items={props.items} command={props.command} />
      )
    }
    const place = (props: any) => {
      const rect = props.clientRect?.()
      if (!rect || !el) return
      el.style.position = "absolute"
      el.style.left = `${rect.left + window.scrollX}px`
      el.style.top = `${rect.bottom + window.scrollY + 6}px`
      el.style.zIndex = "200"
    }

    return {
      onStart: (props) => {
        el = document.createElement("div")
        document.body.appendChild(el)
        root = createRoot(el)
        draw(props)
        place(props)
      },
      onUpdate: (props) => {
        draw(props)
        place(props)
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") return false
        return listRef.current?.onKeyDown(props.event) ?? false
      },
      onExit: () => {
        root?.unmount()
        el?.remove()
        root = null
        el = null
      },
    }
  },
}

// ─── The extension ──────────────────────────────────────────────────────────
export const CommunityMention = Mention.extend({
  addAttributes() {
    return {
      id: { default: null },
      label: { default: null },
      mentionType: {
        default: "user",
        parseHTML: (el) => el.getAttribute("data-mention-type") || "user",
      },
    }
  },
}).configure({
  suggestion,
  renderHTML({ node }) {
    return [
      "span",
      {
        class: "cm-mention",
        "data-mention": "",
        "data-mention-type": node.attrs.mentionType || "user",
        "data-id": node.attrs.id,
      },
      `@${node.attrs.label}`,
    ]
  },
  renderText({ node }) {
    return `@${node.attrs.label}`
  },
})
