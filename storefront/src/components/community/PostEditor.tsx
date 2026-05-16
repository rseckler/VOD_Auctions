"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import TiptapImage from "@tiptap/extension-image"
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  ImagePlus,
  Film,
} from "lucide-react"
import {
  uploadCommunityImage,
  resolveEmbed,
  CommunityError,
} from "@/lib/community-mutations"
import { Embed } from "./tiptap-embed"
import { CommunityMention } from "./mention"

// Tiptap rich-text editor for the community composer. Emits sanitised-on-server
// HTML + the Tiptap JSON doc. SSR-safe via immediatelyRender: false.
export function PostEditor({
  placeholder,
  initialContent,
  onChange,
}: {
  placeholder?: string
  initialContent?: string | null
  onChange: (html: string, json: unknown, text: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const seeded = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      TiptapImage.configure({ HTMLAttributes: { class: "cm-post-image" } }),
      Embed,
      CommunityMention,
      Placeholder.configure({
        placeholder: placeholder || "Share your thoughts…",
      }),
    ],
    content: "",
    editorProps: { attributes: { class: "cm-prose cm-editor-area" } },
    onUpdate: ({ editor }) =>
      onChange(editor.getHTML(), editor.getJSON(), editor.getText()),
  })

  // Seed the editor once when editing an existing post.
  useEffect(() => {
    if (editor && initialContent && !seeded.current) {
      seeded.current = true
      editor.commands.setContent(initialContent)
      onChange(editor.getHTML(), editor.getJSON(), editor.getText())
    }
  }, [editor, initialContent, onChange])

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes("link").href as string | undefined
    const url = window.prompt("Link URL", prev || "https://")
    if (url === null) return
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }, [editor])

  const onImageFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = "" // allow re-picking the same file
      if (!file || !editor) return
      setUploadError(null)
      setUploading(true)
      try {
        const url = await uploadCommunityImage(file)
        editor.chain().focus().setImage({ src: url }).run()
      } catch (err) {
        setUploadError(
          err instanceof CommunityError
            ? err.message
            : "Image upload failed — please try again."
        )
      } finally {
        setUploading(false)
      }
    },
    [editor]
  )

  const insertEmbed = useCallback(async () => {
    if (!editor) return
    const url = window.prompt(
      "Media URL — YouTube, Vimeo, Spotify, SoundCloud or Bandcamp"
    )
    if (!url || !url.trim()) return
    setUploadError(null)
    setUploading(true)
    try {
      const { provider, embed_url } = await resolveEmbed(url.trim())
      editor
        .chain()
        .focus()
        .insertContent({ type: "embed", attrs: { src: embed_url, provider } })
        .run()
    } catch (err) {
      setUploadError(
        err instanceof CommunityError
          ? err.message
          : "Could not embed this link."
      )
    } finally {
      setUploading(false)
    }
  }, [editor])

  if (!editor) {
    return (
      <div className="cm-editor">
        <div className="cm-editor-area" />
      </div>
    )
  }

  return (
    <div className="cm-editor">
      <div className="cm-editor-toolbar">
        <button
          type="button"
          title="Bold"
          className={"cm-composer-tool" + (editor.isActive("bold") ? " is-active" : "")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          title="Italic"
          className={"cm-composer-tool" + (editor.isActive("italic") ? " is-active" : "")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          title="Heading"
          className={
            "cm-composer-tool" +
            (editor.isActive("heading", { level: 2 }) ? " is-active" : "")
          }
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={15} />
        </button>
        <button
          type="button"
          title="Subheading"
          className={
            "cm-composer-tool" +
            (editor.isActive("heading", { level: 3 }) ? " is-active" : "")
          }
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={15} />
        </button>
        <button
          type="button"
          title="Bullet list"
          className={
            "cm-composer-tool" + (editor.isActive("bulletList") ? " is-active" : "")
          }
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </button>
        <button
          type="button"
          title="Numbered list"
          className={
            "cm-composer-tool" + (editor.isActive("orderedList") ? " is-active" : "")
          }
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </button>
        <button
          type="button"
          title="Quote"
          className={
            "cm-composer-tool" + (editor.isActive("blockquote") ? " is-active" : "")
          }
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={15} />
        </button>
        <button
          type="button"
          title="Link"
          className={"cm-composer-tool" + (editor.isActive("link") ? " is-active" : "")}
          onClick={setLink}
        >
          <Link2 size={15} />
        </button>
        <button
          type="button"
          title="Insert image"
          className="cm-composer-tool"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <ImagePlus size={15} />
        </button>
        <button
          type="button"
          title="Embed video or audio"
          className="cm-composer-tool"
          onClick={insertEmbed}
          disabled={uploading}
        >
          <Film size={15} />
        </button>
        {uploading && <span className="cm-editor-uploading">Uploading…</span>}
        {uploadError && (
          <span className="cm-composer-error">{uploadError}</span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onImageFile}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
