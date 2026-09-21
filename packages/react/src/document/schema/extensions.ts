import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { incantlyDocumentMarks } from './marks.js'
import { IncantlyNodeIds } from './nodeIds.js'
import { incantlyDocumentNodes } from './nodes.js'

const restrictedStarterKit = StarterKit.configure({
  document: false,
  text: false,
  paragraph: false,
  heading: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  listKeymap: false,
  horizontalRule: false,
  codeBlock: false,
  underline: false,
  trailingNode: false,
  link: {
    openOnClick: false,
    autolink: false,
    linkOnPaste: false,
    protocols: ['http', 'https', 'mailto', 'tel'],
  },
})

/**
 * The complete v1 editing schema. Keep this list explicit: adding an extension is
 * a persisted-format decision and must be paired with core schema support.
 */
export interface IncantlyDocumentExtensionOptions {
  placeholder?: string | (() => string)
}

export function createIncantlyDocumentExtensions(
  options: IncantlyDocumentExtensionOptions = {},
): Extensions {
  const placeholder = options.placeholder
  return [
    restrictedStarterKit,
    Underline,
    Placeholder.configure({
      placeholder: typeof placeholder === 'function' ? () => placeholder() : placeholder ?? 'Start writing…',
      showOnlyCurrent: true,
      showOnlyWhenEditable: true,
      includeChildren: false,
    }),
    ...incantlyDocumentNodes,
    ...incantlyDocumentMarks,
    IncantlyNodeIds,
  ]
}

export const incantlyDocumentExtensions: Extensions = createIncantlyDocumentExtensions()
