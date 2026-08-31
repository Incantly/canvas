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
} from './types/models.js'
export type { DiffSource, Diff, Snapshot } from './types/operations.js'
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