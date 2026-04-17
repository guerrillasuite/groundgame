"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useEffect } from "react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

type ToolBtn = {
  label: string;
  title: string;
  action: (e: any) => void;
  active: () => boolean;
};

export default function RichTextEditor({ value, onChange, placeholder, minHeight = 90 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, code: false }),
      Underline,
    ],
    content: value || "",
    onUpdate({ editor }) {
      const html = editor.getHTML();
      // Treat empty paragraph as empty string
      onChange(html === "<p></p>" ? "" : html);
    },
    editorProps: {
      attributes: {
        style: [
          "outline:none",
          "min-height:" + minHeight + "px",
          "padding:10px 12px",
          "font-size:13px",
          "line-height:1.6",
          "color:inherit",
        ].join(";"),
      },
    },
  });

  // Sync external value changes (e.g. on load)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || "";
    if (current !== incoming && !(current === "<p></p>" && incoming === "")) {
      editor.commands.setContent(incoming, false);
    }
  }, [value, editor]);

  if (!editor) return null;

  const btn = (
    label: string,
    title: string,
    action: () => void,
    isActive: boolean
  ) => (
    <button
      key={title}
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); action(); }}
      style={{
        padding: "3px 7px",
        borderRadius: 4,
        border: "none",
        background: isActive ? "var(--gg-primary, #2563eb)" : "transparent",
        color: isActive ? "white" : "inherit",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1,
        opacity: isActive ? 1 : 0.7,
        minWidth: 26,
      }}
    >
      {label}
    </button>
  );

  const sep = (key: string) => (
    <span key={key} style={{ width: 1, background: "var(--gg-border, #e5e7eb)", margin: "2px 4px", alignSelf: "stretch", opacity: 0.5 }} />
  );

  return (
    <div style={{
      border: "1px solid var(--gg-border, #e5e7eb)",
      borderRadius: 6,
      overflow: "hidden",
      background: "transparent",
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 2,
        padding: "5px 8px",
        borderBottom: "1px solid var(--gg-border, #e5e7eb)",
        background: "rgba(0,0,0,0.04)",
      }}>
        {btn("B", "Bold", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
        {btn("I", "Italic", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
        {btn("U", "Underline", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
        {btn("S̶", "Strikethrough", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
        {sep("s1")}
        {btn("H1", "Heading 1", () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }))}
        {btn("H2", "Heading 2", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
        {btn("¶", "Normal text", () => editor.chain().focus().setParagraph().run(), editor.isActive("paragraph") && !editor.isActive("heading"))}
        {sep("s2")}
        {btn("• List", "Bullet list", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
        {btn("1. List", "Numbered list", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      </div>

      {/* Editor area */}
      <div style={{ position: "relative" }}>
        {!value && (
          <div style={{
            position: "absolute", top: 10, left: 12,
            fontSize: 13, opacity: 0.35, pointerEvents: "none", userSelect: "none",
          }}>
            {placeholder ?? "Start typing…"}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .tiptap p { margin: 0 0 0.4em; }
        .tiptap p:last-child { margin-bottom: 0; }
        .tiptap h1 { font-size: 1.4em; font-weight: 700; margin: 0.5em 0 0.3em; }
        .tiptap h2 { font-size: 1.15em; font-weight: 700; margin: 0.4em 0 0.25em; }
        .tiptap ul, .tiptap ol { padding-left: 1.4em; margin: 0.25em 0; }
        .tiptap li { margin: 0.15em 0; }
        .tiptap s { text-decoration: line-through; }
      `}</style>
    </div>
  );
}
