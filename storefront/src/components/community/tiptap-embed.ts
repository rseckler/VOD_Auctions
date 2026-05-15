import { Node } from "@tiptap/core"

// Custom Tiptap node for media embeds (YouTube / Vimeo / Spotify / SoundCloud
// / Bandcamp). Atom block node — renders a provider-classed wrapper + iframe.
// The embed src is resolved server-side via /store/community/embed.
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => el.querySelector("iframe")?.getAttribute("src") || null,
      },
      provider: {
        default: "generic",
        parseHTML: (el) => el.getAttribute("data-embed-provider") || "generic",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-community-embed]" }]
  },

  renderHTML({ HTMLAttributes }) {
    const provider = HTMLAttributes.provider || "generic"
    return [
      "div",
      {
        "data-community-embed": "",
        "data-embed-provider": provider,
        class: `cm-embed cm-embed-${provider}`,
      },
      [
        "iframe",
        {
          src: HTMLAttributes.src,
          frameborder: "0",
          allowfullscreen: "true",
          loading: "lazy",
        },
      ],
    ]
  },
})
