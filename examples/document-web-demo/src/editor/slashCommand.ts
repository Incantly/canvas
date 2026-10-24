import { Extension, type Editor, type Range } from '@tiptap/core'
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion'

export type SlashMenuCommand = (editor: Editor) => unknown

export interface SlashMenuItem {
  id: string
  label: string
  description?: string
  keywords?: readonly string[]
  command: SlashMenuCommand
}

export interface IncantlySlashMenuSnapshot {
  open: boolean
  query: string
  range: Range | null
  items: readonly SlashMenuItem[]
  selectedIndex: number
}

export interface IncantlySlashCommandOptions {
  char?: string
  items?: readonly SlashMenuItem[]
}

interface IncantlySlashCommandStorage extends IncantlySlashMenuSnapshot {
  ui: {
    /** Set by the React menu host; the renderer notifies it outside React state. */
    listener: ((snapshot: IncantlySlashMenuSnapshot) => void) | null
    /** Host-provided item list override (e.g. DocumentSlashMenu `items` prop). */
    itemsOverride: readonly SlashMenuItem[] | null
  }
}

const setParagraph: SlashMenuCommand = (editor) => editor.chain().focus().setNode('paragraph').run()
const setHeading = (level: 1 | 2): SlashMenuCommand => (editor) => editor.chain().focus().setNode('heading', { level }).run()
const toggleBulletList: SlashMenuCommand = (editor) => editor.chain().focus().toggleList('bulletList', 'listItem').run()
const toggleOrderedList: SlashMenuCommand = (editor) => editor.chain().focus().toggleList('orderedList', 'listItem').run()
const toggleBlockquote: SlashMenuCommand = (editor) => editor.chain().focus().toggleWrap('blockquote').run()

export const defaultSlashMenuItems: readonly SlashMenuItem[] = [
  { id: 'paragraph', label: 'Paragraph', keywords: ['text'], command: setParagraph },
  { id: 'heading-1', label: 'Heading 1', keywords: ['title'], command: setHeading(1) },
  { id: 'heading-2', label: 'Heading 2', keywords: ['subtitle'], command: setHeading(2) },
  { id: 'bullet-list', label: 'Bullet list', keywords: ['unordered'], command: toggleBulletList },
  { id: 'numbered-list', label: 'Numbered list', keywords: ['ordered'], command: toggleOrderedList },
  { id: 'blockquote', label: 'Blockquote', keywords: ['quote'], command: toggleBlockquote },
  { id: 'code-block', label: 'Code block', keywords: ['code'], command: (editor) => editor.chain().focus().setNode('codeBlock').run() },
  { id: 'divider', label: 'Divider', keywords: ['rule', 'line'], command: (editor) => editor.chain().focus().insertContent({ type: 'horizontalRule' }).run() },
]

export function filterSlashMenuItems(items: readonly SlashMenuItem[], query: string): SlashMenuItem[] {
  const needle = query.toLowerCase()
  return items.filter((item) => {
    const haystack = [item.label, ...(item.keywords ?? [])].join(' ').toLowerCase()
    return haystack.includes(needle)
  })
}

export function commitSlashMenuItem(editor: Editor, range: Range, item: SlashMenuItem): void {
  editor.chain().focus().deleteRange(range).run()
  item.command(editor)
}

function snapshotOf(storage: IncantlySlashCommandStorage): IncantlySlashMenuSnapshot {
  return { open: storage.open, query: storage.query, range: storage.range, items: storage.items, selectedIndex: storage.selectedIndex }
}

// Tiptap 3 keeps live extension storage on the editor, not on the extension
// object, so the plugin and the React menu must both go through editor.storage.
function slashStorage(editor: Editor | null): IncantlySlashCommandStorage | undefined {
  return (editor?.storage as unknown as Record<string, IncantlySlashCommandStorage | undefined> | undefined)?.[IncantlySlashCommand.name]
}

export function readSlashMenuSnapshot(editor: Editor | null): IncantlySlashMenuSnapshot | null {
  const storage = slashStorage(editor)
  return storage ? snapshotOf(storage) : null
}

export function writeSlashMenuUi(
  editor: Editor | null,
  ui: Partial<IncantlySlashCommandStorage['ui']>,
): void {
  const storage = slashStorage(editor)
  if (storage) Object.assign(storage.ui, ui)
}

export const IncantlySlashCommand = Extension.create<IncantlySlashCommandOptions, IncantlySlashCommandStorage>({
  name: 'incantlySlashCommand',

  addOptions() {
    return { char: '/', items: defaultSlashMenuItems }
  },

  addStorage() {
    return {
      open: false,
      query: '',
      range: null,
      items: [],
      selectedIndex: 0,
      ui: { listener: null, itemsOverride: null },
    }
  },

  addProseMirrorPlugins() {
    const extension = this
    const publish = (): void => {
      extension.storage.ui.listener?.(snapshotOf(extension.storage))
    }
    const sync = (props: SuggestionProps<SlashMenuItem>): void => {
      const storage = extension.storage
      storage.open = true
      storage.query = props.query
      storage.range = props.range
      storage.items = props.items
      storage.selectedIndex = Math.min(storage.selectedIndex, Math.max(0, props.items.length - 1))
      publish()
    }
    const sourceItems = (): readonly SlashMenuItem[] =>
      extension.storage.ui.itemsOverride ?? extension.options.items ?? []
    return [
      Suggestion({
        editor: extension.editor,
        char: extension.options.char ?? '/',
        allow: ({ editor }) => editor.isEditable,
        items: ({ query }) => filterSlashMenuItems(sourceItems(), query),
        command: ({ editor, range, props: item }) => {
          commitSlashMenuItem(editor, range, item)
        },
        render: () => {
          let latest: SuggestionProps<SlashMenuItem> | null = null
          return {
            onStart: (props) => {
              latest = props
              extension.storage.selectedIndex = 0
              sync(props)
            },
            onUpdate: (props) => {
              latest = props
              sync(props)
            },
            onKeyDown: ({ event }) => {
              if (!latest || !extension.storage.open) return false
              const storage = extension.storage
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const direction = event.key === 'ArrowDown' ? 1 : -1
                const count = latest.items.length
                if (count > 0) {
                  storage.selectedIndex = (storage.selectedIndex + direction + count) % count
                  publish()
                }
                return true
              }
              if (event.key === 'Enter') {
                // Handled inside Tiptap's key handling, before ProseMirror's
                // default Enter behavior can split the paragraph.
                event.preventDefault()
                const item = latest.items[storage.selectedIndex]
                if (item) commitSlashMenuItem(extension.editor, latest.range, item)
                return true
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                extension.editor.commands.deleteRange(latest.range)
                return true
              }
              return false
            },
            onExit: () => {
              latest = null
              const storage = extension.storage
              storage.open = false
              storage.query = ''
              storage.range = null
              storage.items = []
              storage.selectedIndex = 0
              publish()
            },
          }
        },
      }),
    ]
  },
})
