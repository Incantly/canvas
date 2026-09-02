import type { Snapshot } from '@incantly/canvas-react-native'

const EMPTY_SCHEMA = {
  schemaVersion: 1,
  sequences: {
    'com.incantly.store': 1,
    'com.incantly.shape.text': 1,
    'com.incantly.page.document': 2,
    'com.incantly.notebook.document': 3,
  },
} as const

/** Blank notebook for Document mode — start typing from scratch. */
export const EMPTY_DOCUMENT_SNAPSHOT: Snapshot = {
  schema: { ...EMPTY_SCHEMA },
  document: {
    store: {
      'notebook:main': {
        id: 'notebook:main',
        typeName: 'notebook',
        pageLayout: 'vertical',
        pageGap: 24,
        document: {
          blocks: [{ type: 'paragraph', content: [{ text: '' }] }],
        },
      },
      'page:1': {
        id: 'page:1',
        typeName: 'page',
        index: 0,
        x: 0,
        y: 0,
        width: 816,
        height: 1056,
        name: 'Page 1',
      },
    },
  },
}

/** Sample notebook with text + drawing stub (headless / storage / versions demos). */
export const DOCUMENT_DEMO_SNAPSHOT: Snapshot = {
  schema: { ...EMPTY_SCHEMA },
  document: {
    store: {
      'notebook:main': {
        id: 'notebook:main',
        typeName: 'notebook',
        pageLayout: 'vertical',
        pageGap: 24,
        document: {
          blocks: [
            {
              type: 'heading1',
              content: [{ text: 'Native RN renderer demo' }],
            },
            {
              type: 'paragraph',
              content: [
                { text: 'This notebook loads via ' },
                { text: '@incantly/canvas-react-native', code: true },
                { text: ' (headless APIs re-exported).' },
              ],
            },
            {
              type: 'bulletList',
              content: [{ text: 'Document mode text blocks' }],
            },
            {
              type: 'bulletList',
              content: [{ text: 'Ink overlay (Phase 2)' }],
            },
            {
              type: 'drawing',
              height: 120,
              strokes: [],
            },
          ],
        },
      },
      'page:1': {
        id: 'page:1',
        typeName: 'page',
        index: 0,
        x: 0,
        y: 0,
        width: 816,
        height: 1056,
        name: 'Page 1',
      },
    },
  },
}

export const EMPTY_SNAPSHOT: Snapshot = {
  document: { store: {} },
}
