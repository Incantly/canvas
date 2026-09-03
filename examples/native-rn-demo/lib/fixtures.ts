import type { Snapshot } from '@incantly/canvas-react-native'

const EMPTY_SCHEMA = {
  schemaVersion: 1,
  sequences: {
    'com.incantly.store': 1,
    'com.incantly.shape.text': 1,
    'com.incantly.page.document': 3,
    'com.incantly.notebook.document': 4,
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
        document: {
          blocks: [{ type: 'paragraph', content: [{ text: '' }] }],
        },
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
              content: [{ text: 'SVG ink overlay on the paper sheet' }],
            },
            {
              type: 'drawing',
              height: 120,
              strokes: [],
            },
          ],
        },
      },
    },
  },
}

/** Letter sheet with sample ink in the margin and over the typing column. */
export const INK_DEMO_SNAPSHOT: Snapshot = {
  schema: { ...EMPTY_SCHEMA },
  document: {
    store: {
      'notebook:main': {
        id: 'notebook:main',
        typeName: 'notebook',
        pageLayout: 'vertical',
        pageGap: 24,
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
        document: {
          blocks: [
            {
              type: 'paragraph',
              content: [
                {
                  text: 'Draw on the full sheet, including the margin. Typing stays in this inner box.',
                },
              ],
            },
            {
              type: 'drawing',
              height: 1,
              strokes: [
                {
                  pts: [36, 48, 0.5, 180, 72, 0.5, 420, 56, 0.5, 640, 96, 0.5],
                  color: 'blue',
                  size: 'm',
                  kind: 'draw',
                },
                {
                  pts: [80, 140, 0.5, 280, 148, 0.5, 480, 136, 0.5],
                  color: 'yellow',
                  size: 'l',
                  kind: 'highlight',
                },
              ],
            },
          ],
        },
      },
    },
  },
}

export const EMPTY_SNAPSHOT: Snapshot = {
  document: { store: {} },
}
