export { Store, newId, isDiffEmpty, invertDiff, composeDiff } from './store.js'
export {
  PAGE_GAP_PRESETS,
  PAGE_GAP_STEP,
  DEFAULT_PAGE_GAP,
  MAX_PAGE_GAP,
} from './pages.js'
export { buildUI } from './ui.js'
export {
  themeOf, THEMES, COLOR_IDS, SIZE_IDS, DASH_IDS, FILL_IDS, GEO_IDS, GRID_IDS,
  SIZES, FONT_SIZES, FONTS,
} from './palette.js'
export { pageBounds, localBounds, drawShape, hitShape } from './shapes.js'
export { strokeOutline } from './freehand.js'

import { Editor, TOOLS } from './editor.js'
export { Editor, TOOLS }

export type {
  Camera, ToolId, ColorId, SizeId, FontId, DashId, FillId, GeoId, ThemeId, GridId, PageLayout, PageGapPreset,
  Bounds,
} from './types/base.js'
export type { Styles, ScribbleStroke } from './types/styles.js'
export type {
  ShapeType, ShapeRecord, AssetRecord, BoardRecord, PageRecord, NotebookRecord,
  DrawShapeProps, LineishShapeProps, GeoShapeProps,
  TextShapeProps, NoteShapeProps, ImageShapeProps,
  PageDocumentRecord,
} from './types/models.js'
export type { BlockType, InlineSpan, TextBlock, DrawingBlock, DrawingStroke, ImageBlock, DocumentBlock, RichTextLink } from './rich-text/types.js'
export { isDrawingBlock, isImageBlock, isTextBlock } from './rich-text/types.js'
export {
  PAGE_DOC_MARGIN_X,
  PAGE_DOC_MARGIN_Y,
  PAGE_DOC_FONT_SIZE,
  pageContentRect,
  getPageDocument,
  pointInPageContent,
  notesPageContentRect,
  pointInNotesContent,
} from './page-document.js'
export {
  NOTES_MIN_BODY_HEIGHT,
  notesContentWidth,
  notesPaperHeight,
  notesPaperBounds,
  virtualPrintPages,
  mergePageDocumentsIntoNotebook,
} from './notebook-document.js'
export type { VirtualPrintPage } from './notebook-document.js'
export {
  validateDocumentBlocks,
  layoutPageDocument,
  DRAWING_BLOCK_MIN_HEIGHT,
  drawingBlockHeight,
} from './page-document-blocks.js'
export {
  emptyDocument,
  textToBlocks,
  blocksToPlainText,
  isEmptyDocument,
  validateBlocks,
  migrateTextProps,
  layoutRichText,
  drawRichTextLayout,
} from './rich-text/index.js'
export {
  defaultDocumentBackground,
  normalizeCssColor,
  contrastDocumentText,
} from './document-background.js'
export type { DiffSource, Diff, Snapshot } from './types/operations.js'
export type { SerializedSchema } from './types/schema.js'
export { CURRENT_SCHEMA } from './types/schema.js'
export { migrateSnapshot } from './migrations/index.js'
export {
  createVersionManager,
  type VersionManager,
  type VersionManagerOptions,
  type VersionManagerStore,
  type DocumentVersion,
  type VersionStorage,
  type VersionKind,
} from './version-history.js'
export { MemoryVersionStorage } from './storage/memory-version-storage.js'
export { IndexedDbVersionStorage } from './storage/indexed-db-version-storage.js'
export type { Theme, ThemePaletteEntry, ThemeGridConfig } from './types/themes.js'
export type {
  EditorOptions, EditorEvent, BoardUI, BuildUIOptions,
  CanvasInstance, CreateCanvasOptions,
} from './types/editor.js'

import type { CreateCanvasOptions, CanvasInstance } from './types/index.js'
import { buildUI } from './ui.js'

export function buildWatermark(editor: Editor): HTMLAnchorElement {
  const a = document.createElement('a')
  a.className = 'ic-watermark'
  a.href = 'https://github.com/Incantly/canvas'
  a.target = '_blank'
  a.rel = 'noopener'
  a.setAttribute('aria-label', 'Made with Incantly Canvas')
  a.innerHTML =
    `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">` +
    `<path d="M7 21 C7 12, 13 6.5, 20 7.5 C26.5 8.5, 27.5 16, 22 18.8 C17.5 21, 13 19.5, 14 15" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>` +
    `<circle cx="24.5" cy="24.5" r="2.6" fill="#2f6fed"/>` +
    `</svg><span>Incantly Canvas</span>`
  a.addEventListener('pointerdown', (e) => e.stopPropagation())
  editor.container.appendChild(a)
  return a
}

export function createCanvas(opts: CreateCanvasOptions): CanvasInstance {
  const editor = new Editor(opts as any)
  editor.container.dataset.icTheme = editor.theme.id
  const ui = buildUI(editor, {
    hidden: opts.hideUi || opts.readonly,
    onSave: opts.onSave,
    themeToggle: opts.themeToggle,
    gridControl: opts.gridControl,
    tools: opts.uiTools,
    icons: opts.uiIcons,
    hidePagesBar: opts.hidePagesBar,
  })
  const watermark = opts.watermark === false ? null : buildWatermark(editor)
  return {
    editor,
    ui,
    destroy() {
      watermark?.remove()
      ui.destroy()
      editor.destroy()
    },
  }
}

/** @deprecated Use {@link createCanvas} */