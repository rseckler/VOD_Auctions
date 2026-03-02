import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
import Placeholder from "@tiptap/extension-placeholder"
import { useEffect, useCallback } from "react"

type RichTextEditorProps = {
  content: string
  onChange: (html: string) => void
  placeholder?: string
}

const MenuButton = ({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void
  active?: boolean
  children: React.ReactNode
  title?: string
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`px-2 py-1 text-xs rounded transition-colors ${
      active
        ? "bg-ui-fg-base text-ui-bg-base"
        : "text-ui-fg-subtle hover:bg-ui-bg-subtle-hover"
    }`}
  >
    {children}
  </button>
)

const RichTextEditor = ({ content, onChange, placeholder }: RichTextEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-blue-400 underline" },
      }),
      Image.configure({
        HTMLAttributes: { class: "rounded-lg max-w-full" },
      }),
      Placeholder.configure({
        placeholder: placeholder || "Schreibe hier...",
      }),
    ],
    content: content || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm prose-invert max-w-none min-h-[200px] p-3 focus:outline-none " +
          "[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 " +
          "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 " +
          "[&_p]:mb-2 [&_p]:leading-relaxed " +
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 " +
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 " +
          "[&_li]:mb-1 " +
          "[&_blockquote]:border-l-2 [&_blockquote]:border-ui-fg-muted [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-ui-fg-subtle " +
          "[&_code]:bg-ui-bg-subtle [&_code]:px-1 [&_code]:rounded [&_code]:text-xs " +
          "[&_pre]:bg-ui-bg-subtle [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto " +
          "[&_hr]:border-ui-border-base [&_hr]:my-4 " +
          "[&_a]:text-blue-400 [&_a]:underline " +
          "[&_img]:rounded-lg [&_img]:max-w-full",
      },
    },
  })

  // Sync external content changes (e.g. on load)
  useEffect(() => {
    if (editor && content && editor.getHTML() !== content) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  const addLink = useCallback(() => {
    if (!editor) return
    const url = window.prompt("URL eingeben:")
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }, [editor])

  const addImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt("Bild-URL eingeben:")
    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }, [editor])

  if (!editor) return null

  return (
    <div className="border border-ui-border-base rounded-lg overflow-hidden bg-ui-bg-base">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 p-1.5 border-b border-ui-border-base bg-ui-bg-subtle">
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Überschrift 2"
        >
          H2
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Überschrift 3"
        >
          H3
        </MenuButton>

        <span className="w-px bg-ui-border-base mx-1" />

        <MenuButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Fett"
        >
          <strong>B</strong>
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Kursiv"
        >
          <em>I</em>
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Durchgestrichen"
        >
          <s>S</s>
        </MenuButton>

        <span className="w-px bg-ui-border-base mx-1" />

        <MenuButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Aufzählung"
        >
          • Liste
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Nummerierung"
        >
          1. Liste
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Zitat"
        >
          ❝ Zitat
        </MenuButton>

        <span className="w-px bg-ui-border-base mx-1" />

        <MenuButton onClick={addLink} active={editor.isActive("link")} title="Link einfügen">
          🔗 Link
        </MenuButton>
        <MenuButton onClick={addImage} title="Bild einfügen">
          🖼 Bild
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Trennlinie"
        >
          ─ Linie
        </MenuButton>

        <span className="w-px bg-ui-border-base mx-1" />

        <MenuButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          title="Code-Block"
        >
          {"</>"}
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Rückgängig"
        >
          ↩
        </MenuButton>
        <MenuButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Wiederholen"
        >
          ↪
        </MenuButton>
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />
    </div>
  )
}

export default RichTextEditor
