import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
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
export const incantlyDocumentExtensions: Extensions = [
  restrictedStarterKit,
  Underline,
  ...incantlyDocumentNodes,
  ...incantlyDocumentMarks,
  IncantlyNodeIds,
]
