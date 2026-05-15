"use client"

import { useCallback } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
} from "lucide-react"

// Tiptap rich-text editor for the community composer. Emits sanitised-on-server
// HTML + the Tiptap JSON doc. SSR-safe via immediatelyRender: false.
export function PostEditor({
  placeholder,
  onChange,
}: {
  placeholder?: string
  onChange: (html: string, json: unknown, text: string) => void
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Placeholder.configure({
        placeholder: placeholder || "Teile deine Gedanken…",
      }),
    ],
    content: "",
    editorProps: { attributes: { class: "cm-prose cm-editor-area" } },
    onUpdate: ({ editor }) =>
      onChange(editor.getHTML(), editor.getJSON(), editor.getText()),
  })

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes("link").href as string | undefined
    const url = window.prompt("Link-URL", prev || "https://")
    if (url === null) return
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
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
          title="Fett"
          className={"cm-composer-tool" + (editor.isActive("bold") ? " is-active" : "")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          title="Kursiv"
          className={"cm-composer-tool" + (editor.isActive("italic") ? " is-active" : "")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          title="Überschrift"
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
          title="Unterüberschrift"
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
          title="Liste"
          className={
            "cm-composer-tool" + (editor.isActive("bulletList") ? " is-active" : "")
          }
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </button>
        <button
          type="button"
          title="Nummerierte Liste"
          className={
            "cm-composer-tool" + (editor.isActive("orderedList") ? " is-active" : "")
          }
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </button>
        <button
          type="button"
          title="Zitat"
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
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
