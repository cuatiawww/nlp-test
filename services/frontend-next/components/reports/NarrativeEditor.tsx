'use client'

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { looksLikeHtml } from '@/lib/report-outline.mjs'

function toHtml(value: string) {
  if (!value) return ''
  if (looksLikeHtml(value)) return value
  return `<p>${value
    .split('\n')
    .map((line) => line.replace(/</g, '&lt;').replace(/>/g, '&gt;') || '<br>')
    .join('</p><p>')}</p>`
}

export default function NarrativeEditor({
  value,
  onChange,
  disabled,
  placeholder,
  minHeight = 140,
}: {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
  minHeight?: number
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Underline,
      Image,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder || 'Write narrative…' }),
    ],
    content: toHtml(value || ''),
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'sitrep-prose min-h-[8rem] px-3 py-2 text-sm leading-relaxed outline-none',
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (!editor) return
    const incoming = toHtml(value || '')
    if (incoming !== editor.getHTML()) {
      editor.commands.setContent(incoming, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  if (!editor) {
    return (
      <textarea
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    )
  }

  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-[11px] font-bold ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`

  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${disabled ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap gap-1 border-b border-slate-100 px-2 py-1">
        <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
        <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
        <button type="button" className={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()}><span className="underline">U</span></button>
        <button type="button" className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()}>List</button>
        <button type="button" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</button>
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</button>
      </div>
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
