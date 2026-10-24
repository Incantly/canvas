import { useEffect, useId, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useDocumentEditor } from '../DocumentEditorContext.js'

type Command = (editor: Editor) => boolean

interface FormatButtonProps {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  command: Command
  editor: Editor
  children: ReactNode
}

function FormatButton({ label, shortcut, active = false, disabled = false, command, editor, children }: FormatButtonProps) {
  const run = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (!disabled) command(editor)
  }
  return (
    <button type="button" className="incantly-format-button" aria-label={label} aria-pressed={active}
      disabled={disabled} title={shortcut ? `${label} (${shortcut})` : label} onMouseDown={run}>
      {children}
    </button>
  )
}

function useFormattingState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => current ? ({
      editable: current.isEditable,
      bold: current.isActive('bold'), italic: current.isActive('italic'), underline: current.isActive('underline'),
      strike: current.isActive('strike'), code: current.isActive('code'), paragraph: current.isActive('paragraph'),
      heading1: current.isActive('heading', { level: 1 }), heading2: current.isActive('heading', { level: 2 }),
      bulletList: current.isActive('bulletList'), orderedList: current.isActive('orderedList'),
      blockquote: current.isActive('blockquote'), canUndo: current.can().chain().focus().undo().run(),
      canRedo: current.can().chain().focus().redo().run(),
    }) : null,
  })
}

const toggleMark = (name: string): Command => (editor) => editor.chain().focus().toggleMark(name).run()
const setParagraph: Command = (editor) => editor.chain().focus().setNode('paragraph').run()
const setHeading = (level: 1 | 2): Command => (editor) => editor.chain().focus().setNode('heading', { level }).run()
const toggleBulletList: Command = (editor) => editor.chain().focus().toggleList('bulletList', 'listItem').run()
const toggleOrderedList: Command = (editor) => editor.chain().focus().toggleList('orderedList', 'listItem').run()
const toggleBlockquote: Command = (editor) => editor.chain().focus().toggleWrap('blockquote').run()

export interface DocumentToolbarProps extends HTMLAttributes<HTMLDivElement> {
  editor?: Editor | null
}

export function DocumentToolbar({ editor: suppliedEditor, className, ...props }: DocumentToolbarProps) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const state = useFormattingState(editor)
  if (!editor || !state) return null
  const disabled = !state.editable
  return (
    <div {...props} className={['incantly-document-toolbar', className].filter(Boolean).join(' ')}
      role="toolbar" aria-label={props['aria-label'] ?? 'Document formatting'}>
      <FormatButton editor={editor} label="Undo" shortcut="Mod-Z" disabled={disabled || !state.canUndo}
        command={(current) => current.chain().focus().undo().run()}>↶</FormatButton>
      <FormatButton editor={editor} label="Redo" shortcut="Mod-Shift-Z" disabled={disabled || !state.canRedo}
        command={(current) => current.chain().focus().redo().run()}>↷</FormatButton>
      <span className="incantly-toolbar-separator" aria-hidden="true" />
      <FormatButton editor={editor} label="Paragraph" active={state.paragraph} disabled={disabled} command={setParagraph}>P</FormatButton>
      <FormatButton editor={editor} label="Heading 1" active={state.heading1} disabled={disabled} command={setHeading(1)}>H1</FormatButton>
      <FormatButton editor={editor} label="Heading 2" active={state.heading2} disabled={disabled} command={setHeading(2)}>H2</FormatButton>
      <span className="incantly-toolbar-separator" aria-hidden="true" />
      <FormatButton editor={editor} label="Bold" shortcut="Mod-B" active={state.bold} disabled={disabled} command={toggleMark('bold')}><strong>B</strong></FormatButton>
      <FormatButton editor={editor} label="Italic" shortcut="Mod-I" active={state.italic} disabled={disabled} command={toggleMark('italic')}><em>I</em></FormatButton>
      <FormatButton editor={editor} label="Underline" shortcut="Mod-U" active={state.underline} disabled={disabled} command={toggleMark('underline')}><u>U</u></FormatButton>
      <FormatButton editor={editor} label="Strikethrough" shortcut="Mod-Shift-S" active={state.strike} disabled={disabled} command={toggleMark('strike')}><s>S</s></FormatButton>
      <FormatButton editor={editor} label="Inline code" shortcut="Mod-E" active={state.code} disabled={disabled} command={toggleMark('code')}>&lt;/&gt;</FormatButton>
      <span className="incantly-toolbar-separator" aria-hidden="true" />
      <FormatButton editor={editor} label="Bullet list" active={state.bulletList} disabled={disabled} command={toggleBulletList}>• List</FormatButton>
      <FormatButton editor={editor} label="Numbered list" active={state.orderedList} disabled={disabled} command={toggleOrderedList}>1. List</FormatButton>
      <FormatButton editor={editor} label="Blockquote" active={state.blockquote} disabled={disabled} command={toggleBlockquote}>“”</FormatButton>
    </div>
  )
}

export interface DocumentBubbleToolbarProps extends Omit<DocumentToolbarProps, 'children'> {
  editor?: Editor | null
}

export function DocumentBubbleToolbar({ editor: suppliedEditor, className, ...props }: DocumentBubbleToolbarProps) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const state = useFormattingState(editor)
  if (!editor || !state || !state.editable) return null
  return (
    <BubbleMenu editor={editor} shouldShow={({ state: current }) => !current.selection.empty}>
      <div {...props} className={['incantly-document-bubble-toolbar', className].filter(Boolean).join(' ')}
        role="toolbar" aria-label={props['aria-label'] ?? 'Selection formatting'}>
        <FormatButton editor={editor} label="Bold" shortcut="Mod-B" active={state.bold} command={toggleMark('bold')}><strong>B</strong></FormatButton>
        <FormatButton editor={editor} label="Italic" shortcut="Mod-I" active={state.italic} command={toggleMark('italic')}><em>I</em></FormatButton>
        <FormatButton editor={editor} label="Underline" shortcut="Mod-U" active={state.underline} command={toggleMark('underline')}><u>U</u></FormatButton>
        <FormatButton editor={editor} label="Inline code" shortcut="Mod-E" active={state.code} command={toggleMark('code')}>&lt;/&gt;</FormatButton>
      </div>
    </BubbleMenu>
  )
}

export type { SlashMenuItem } from '../slashCommand.js'
export { defaultSlashMenuItems } from '../slashCommand.js'
import {
  commitSlashMenuItem,
  readSlashMenuSnapshot,
  writeSlashMenuUi,
  type IncantlySlashMenuSnapshot,
  type SlashMenuItem,
} from '../slashCommand.js'

export interface DocumentSlashMenuProps extends HTMLAttributes<HTMLDivElement> {
  editor?: Editor | null
  items?: readonly SlashMenuItem[]
  renderItem?: (item: SlashMenuItem) => ReactNode
  onOpenChange?: (open: boolean) => void
}

const closedSlashSnapshot: IncantlySlashMenuSnapshot = { open: false, query: '', range: null, items: [], selectedIndex: 0 }

export function DocumentSlashMenu({ editor: suppliedEditor, items, renderItem,
  onOpenChange, className, ...props }: DocumentSlashMenuProps) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const [snapshot, setSnapshot] = useState<IncantlySlashMenuSnapshot>(closedSlashSnapshot)

  // Detection, keyboard commit, and the default item registry live in the
  // IncantlySlashCommand extension; this component renders its state and
  // forwards host overrides (items) plus presentation (renderItem, className).
  useEffect(() => {
    if (!editor) return
    writeSlashMenuUi(editor, {
      listener: (next) => setSnapshot(next),
      itemsOverride: items ?? null,
    })
    const initial = readSlashMenuSnapshot(editor)
    if (initial) setSnapshot(initial)
    return () => { writeSlashMenuUi(editor, { listener: null, itemsOverride: null }) }
  }, [editor, items])

  const { open, range, selectedIndex } = snapshot
  const filtered = snapshot.items
  const [position, setPosition] = useState<CSSProperties | null>(null)
  useEffect(() => { onOpenChange?.(open) }, [onOpenChange, open])
  useEffect(() => {
    if (!editor || !open || !range) { return }
    const updatePosition = () => {
      const host = editor.view.dom.closest<HTMLElement>('[data-incantly-document-editor]')
      if (!host) return
      let caret: { top: number; bottom: number; left: number }
      try {
        caret = editor.view.coordsAtPos(range.to)
      } catch {
        // Layout-less hosts (SSR test runners) have no caret rectangles. The
        // browser will calculate the anchored position on its next layout pass.
        return
      }
      const hostRect = host.getBoundingClientRect()
      const menuHeight = menuRef.current?.offsetHeight ?? 0
      const fitsBelow = caret.bottom + menuHeight + 8 <= window.innerHeight
      const top = (fitsBelow ? caret.bottom + 6 : caret.top - menuHeight - 6) - hostRect.top
      const maxLeft = Math.max(8, hostRect.width - (menuRef.current?.offsetWidth ?? 0) - 8)
      setPosition({ top: Math.max(8, top), left: Math.max(8, Math.min(caret.left - hostRect.left, maxLeft)) })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [editor, range?.to, open])
  if (!editor || !open || !range || !filtered.length) return null
  const choose = (item: SlashMenuItem) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    commitSlashMenuItem(editor, range, item)
  }
  return (
    <div {...props} ref={menuRef} id={menuId} style={{ ...props.style, ...position }}
      className={['incantly-document-slash-menu', className].filter(Boolean).join(' ')}
      role="menu" aria-label={props['aria-label'] ?? 'Insert block'}>
      {filtered.map((item, index) => (
        <button key={item.id} type="button" role="menuitem" aria-current={index === selectedIndex ? 'true' : undefined}
          onMouseEnter={() => setSnapshot((current) => ({ ...current, selectedIndex: index }))} onMouseDown={choose(item)}>
          {renderItem ? renderItem(item) : <><strong>{item.label}</strong>{item.description ? <span>{item.description}</span> : null}</>}
        </button>
      ))}
    </div>
  )
}
