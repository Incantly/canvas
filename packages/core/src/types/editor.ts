import type { Camera, GridId, ThemeId, ToolId, GeoId } from './base.js'
import type { Styles, ScribbleStroke } from './styles.js'
import type {
  BoardRecord,
  ShapeRecord,
  AssetRecord,
  ShapeProps,
} from './models.js'
import type { Diff, DiffSource, Snapshot } from './operations.js'
import type { Theme } from './themes.js'

export interface EditorOptions {
  container: HTMLElement
  store?: Store
  theme?: ThemeId | string
  grid?: GridId
  readonly?: boolean
  camera?: Camera
  styles?: Partial<Styles>
  geoKind?: GeoId
}

export type EditorEvent =
  | 'change'
  | 'history'
  | 'camera'
  | 'tool'
  | 'styles'
  | 'selection'
  | 'theme'
  | 'grid'
  | 'edit'
  | 'scribbles'
  | 'penmode'

type BoardPatchProps = Partial<ShapeProps> & { [key: string]: unknown }

export interface Store {
  records: Map<string, BoardRecord>
  undos: Diff[]
  redos: Diff[]

  get(id: string): BoardRecord | undefined
  has(id: string): boolean
  ids(): string[]
  all(): BoardRecord[]
  shapes(): ShapeRecord[]
  asset(id: string): AssetRecord | null
  readonly size: number

  listen(
    fn: (diff: Diff, source: DiffSource) => void,
    opts?: { source?: DiffSource | 'all' }
  ): () => void

  listenHistory(fn: () => void): () => void

  transact(fn: () => void, source?: DiffSource): void
  put(rec: BoardRecord, source?: DiffSource): void
  update(
    id: string,
    patch: Partial<BoardRecord> & { props?: BoardPatchProps },
    source?: DiffSource
  ): void
  remove(ids: string[], source?: DiffSource): void
  applyDiff(diff: Diff, source?: DiffSource): void

  beginBatch(): void
  endBatch(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
  undo(): void
  redo(): void

  getSnapshot(): Snapshot
  loadSnapshot(snap: Snapshot, source?: DiffSource): void
  clear(source?: DiffSource): void
  maxZ(): number
  minZ(): number
}

type EditorListenerMap = {
  change: (diff: Diff, source: DiffSource) => void
  history: () => void
  camera: (camera: Camera) => void
  tool: (tool: ToolId) => void
  styles: (styles: Styles) => void
  selection: (ids: Set<string>) => void
  theme: (theme: Theme) => void
  grid: (grid: GridId) => void
  edit: (editing: string | null) => void
  scribbles: (strokes: ScribbleStroke[]) => void
  penmode: (penMode: boolean) => void
}

export interface Editor {
  container: HTMLElement
  canvas: HTMLCanvasElement
  overlay: HTMLCanvasElement
  store: Store
  theme: Theme
  grid: GridId
  readonly: boolean
  camera: Camera
  styles: Styles
  geoKind: GeoId
  tool: ToolId
  selection: Set<string>
  penMode: boolean

  on<E extends EditorEvent>(ev: E, fn: EditorListenerMap[E]): () => void
  emit<E extends EditorEvent>(ev: E, ...args: Parameters<EditorListenerMap[E]>): void

  viewSize(): { w: number; h: number }
  screenToPage(sx: number, sy: number): { x: number; y: number }
  pageToScreen(px: number, py: number): { x: number; y: number }
  viewportPageBounds(): import('./base.js').Bounds
  setCamera(cam: Camera, opts?: { animate?: number }): void
  pan(dxScreen: number, dyScreen: number): void
  zoomAt(sx: number, sy: number, mult: number, opts?: { animate?: number }): void
  contentBounds(): import('./base.js').Bounds | null
  fitContent(opts?: {
    margin?: number
    maxZoom?: number
    animate?: number
    ease?: number
  }): void
  followBounds(b: import('./base.js').Bounds, opts?: { animate?: number; ease?: number }): void

  setTool(tool: ToolId): void
  setGeoKind(kind: GeoId): void
  setTheme(id: ThemeId | string): void
  setGrid(id: GridId): void
  setReadonly(ro: boolean): void
  setPenMode(on: boolean): void
  setStyle<K extends keyof Styles>(key: K, value: Styles[K]): void
  currentStyles(): Partial<Record<keyof Styles, string | null>>

  setSelection(ids: string[]): void
  selectionBounds(): import('./base.js').Bounds | null
  deleteSelection(): void
  clearBoard(): void
  selectAll(): void
  duplicateSelection(offset?: number): void
  bringToFront(): void
  sendToBack(): void
  shapesSorted(): ShapeRecord[]
  hitTest(px: number, py: number): ShapeRecord | null

  setRemoteScribbles(list: ScribbleStroke[]): void
  getScribbles(): ScribbleStroke[]

  copySelection(): Promise<void>
  pasteFromClipboard(): Promise<void>
  importImageBlobs(blobs: Blob[] | File[], at?: { x: number; y: number }): Promise<void>
  pickImage(): void

  exportImage(opts?: {
    background?: boolean
    scale?: number
    margin?: number
    ids?: Set<string> | null
  }): Promise<Blob | null>

  requestRender(): void
  render(): void
  resize(): void
  renderScene(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    w: number,
    h: number,
    opts?: { dpr?: number; background?: boolean; hideEditing?: boolean }
  ): void
  setCaptureCanvas(canvas: HTMLCanvasElement | null): void
  renderCaptureTick(): void

  destroy(): void
}

export interface BoardUI {
  setHidden(hidden: boolean): void
  setOptions(opts: { themeToggle?: boolean; gridControl?: boolean }): void
  destroy(): void
}

export interface BuildUIOptions {
  hidden?: boolean
  onSave?: (blob: Blob, background: boolean) => void
  themeToggle?: boolean
  gridControl?: boolean
}

export interface CanvasInstance {
  editor: Editor
  ui: BoardUI
  destroy(): void
}

export interface CreateCanvasOptions extends EditorOptions {
  hideUi?: boolean
  onSave?: (blob: Blob, background: boolean) => void
  themeToggle?: boolean
  gridControl?: boolean
  watermark?: boolean
}
export type { EditorListenerMap }
