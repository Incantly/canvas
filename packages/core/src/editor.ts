import type {
  Camera,
  GridId,
  ThemeId,
  ToolId,
  GeoId,
  ColorId,
  SizeId,
  DashId,
  FillId,
  FontId,
  Bounds,
  Styles,
  ScribbleStroke,
  BoardRecord,
  ShapeRecord,
  AssetRecord,
  Diff,
  Theme,
} from "./types/index.js";
import { Store, newId } from "./store.js";
import {
  themeOf,
  SIZES,
  FONT_SIZES,
  GEO_IDS,
  COLOR_IDS,
  GRID_IDS,
  GRID_STEP,
  GRID_MAJOR,
  FONTS,
} from "./palette.js";
import {
  localBounds,
  pageBounds,
  toLocal,
  drawShape,
  hitShape,
  marqueeHits,
  scaleShape,
  textLayout,
  noteLayout,
  sampleLinePts,
  NOTE_W,
} from "./shapes.js";
import {
  boundsUnion,
  boundsExpand,
  boundsContain,
  clamp,
  rotWith,
} from "./geometry.js";

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;
const HANDLE = 8;
const RESIZE_CURSORS: Record<string, string> = {
  tl: "nwse-resize",
  br: "nwse-resize",
  tr: "nesw-resize",
  bl: "nesw-resize",
  t: "ns-resize",
  b: "ns-resize",
  l: "ew-resize",
  r: "ew-resize",
};
const DEFAULT_STYLES: Styles = {
  color: "blue",
  size: "m",
  dash: "draw",
  fill: "none",
  font: "draw",
};

export const TOOLS: ToolId[] = [
  "select",
  "hand",
  "draw",
  "highlight",
  "eraser",
  "laser",
  "arrow",
  "line",
  "geo",
  "text",
  "note",
];

type XY = { x: number; y: number };

interface SessionPinch {
  type: "pinch";
  dist: number;
  center: XY;
  cam: Camera;
}
interface SessionPanning {
  type: "panning";
  last: XY;
}
interface SessionDrawing {
  type: "drawing";
  id: string;
  last: XY;
}
interface SessionErasing {
  type: "erasing";
  hits: Set<string>;
  trail: number[];
  last: XY;
}
interface SessionLasering {
  type: "lasering";
  stroke: ScribbleStroke;
}
interface SessionLineish {
  type: "lineish";
  id: string;
}
interface SessionGeoCreate {
  type: "geo-create";
  id: string;
  origin: XY;
  dragged: boolean;
}
interface SessionMarquee {
  type: "marquee";
  origin: XY;
  rect: Bounds | null;
  additive: boolean;
  base: string[];
}
interface SessionTranslating {
  type: "translating";
  start: XY;
  orig: Map<string, ShapeRecord>;
}
interface SessionResizing {
  type: "resizing";
  handle: string;
  init: Bounds;
  orig: Map<string, ShapeRecord>;
}
interface SessionRotating {
  type: "rotating";
  center: XY;
  start: number;
  orig: Map<string, ShapeRecord>;
}
interface SessionHandle {
  type: "handle";
  which: "start" | "end" | "bend";
  id: string;
}
interface SessionPressing {
  type: "pressing";
  hit: ShapeRecord | null;
  additive: boolean;
  added: boolean;
  start: XY;
  page: XY;
}
interface SessionPlacing {
  type: "placing";
  tool: ToolId;
  page: XY;
}
type Session =
  | SessionPinch
  | SessionPanning
  | SessionDrawing
  | SessionErasing
  | SessionLasering
  | SessionLineish
  | SessionGeoCreate
  | SessionMarquee
  | SessionTranslating
  | SessionResizing
  | SessionRotating
  | SessionHandle
  | SessionPressing
  | SessionPlacing;

interface Editing {
  id: string;
  field: "text" | "label";
  textarea: HTMLTextAreaElement;
  fresh: boolean;
}
interface FitEase {
  t0: number;
  dur: number;
  dx: number;
  dy: number;
  dz: number;
}
interface HitHandle {
  kind: "handle" | "rotate" | "resize";
  which?: string;
  id?: string;
}
interface PointerTypeMap {
  get(id: number): string | undefined;
  set(id: number, v: string): void;
  delete(id: number): void;
}

const bendMidpoint = (pr: { dx: number; dy: number; bend?: number }): XY => {
  if (!pr.bend) return { x: pr.dx / 2, y: pr.dy / 2 };
  const mid = sampleLinePts(pr, pr.bend);
  const mi = Math.floor(mid.length / 4) * 2;
  return { x: mid[mi], y: mid[mi + 1] };
};

interface EditorCtorOpts {
  container: HTMLElement;
  store?: Store;
  theme?: ThemeId | string;
  grid?: GridId;
  readonly?: boolean;
  camera?: Camera;
  styles?: Partial<Styles>;
  geoKind?: GeoId;
}

export class Editor {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  store: Store;
  theme: Theme;
  grid: GridId;
  readonly: boolean;
  camera: Camera;
  styles: Styles;
  geoKind: GeoId;
  tool: ToolId;
  selection: Set<string>;
  session!: Session | null;
  editing!: Editing | null;
  scribbles!: ScribbleStroke[];
  remoteScribbles!: ScribbleStroke[];
  remoteScribblesAt!: number;
  spaceHeld!: boolean;
  captureCanvas!: HTMLCanvasElement | null;
  captureGate?: () => boolean;
  penMode!: boolean;
  _penSeen!: boolean;
  _penDown!: boolean;
  _events!: Map<string, Set<(...args: any[]) => void>>;
  _raf!: number;
  _camAnim!: number;
  _fitEaseRaf!: number;
  _laserRaf!: number;
  _fitEase!: FitEase | null;
  _pointers!: Map<number, XY>;
  _ptrType!: PointerTypeMap;
  _destroyed!: boolean;
  _themeFade!: HTMLCanvasElement | null;
  _pendingFit!: (() => void) | null;
  _unsubStore!: () => void;
  _unsubHistory!: () => void;
  _crossfadeTheme!: () => void;
  _decodeAssets!: (shapes: ShapeRecord[]) => Promise<void>;
  _drawGrid!: (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    W: number,
    H: number,
    dpr: number,
  ) => void;
  _renderOverlay!: (w: number, h: number, dpr: number) => void;
  _renderCapture!: () => void;
  _onDown!: (e: PointerEvent) => void;
  _onMove!: (e: PointerEvent) => void;
  _onUp!: (e: PointerEvent) => void;
  _onWheel!: (e: WheelEvent) => void;
  _onKeyDown!: (e: KeyboardEvent) => void;
  _onKeyUp!: (e: KeyboardEvent) => void;
  _onDblClick!: (e: MouseEvent) => void;
  _onDrop!: (e: DragEvent) => void;
  _onDragOver!: (e: DragEvent) => void;
  _onPaste!: (e: ClipboardEvent) => void;
  _onBlur!: () => void;
  _ro!: ResizeObserver;

  constructor(
    {
      container,
      store,
      theme = "light",
      grid = "lines",
      readonly = false,
      camera,
      styles,
      geoKind,
    }: EditorCtorOpts = {} as EditorCtorOpts,
  ) {
    this.container = container;
    this.store = store || new Store();
    this.theme = themeOf(theme);
    this.grid = GRID_IDS.includes(grid) ? grid : "lines";
    this.readonly = !!readonly;
    this.camera = camera || { x: 0, y: 0, z: 1 };
    this.styles = { ...DEFAULT_STYLES, ...(styles || {}) };
    this.geoKind = geoKind || "rectangle";
    this.tool = "draw";
    this.selection = new Set();
    this.session = null;
    this.editing = null;
    this.scribbles = [];
    this.remoteScribbles = [];
    this.remoteScribblesAt = 0;
    this.spaceHeld = false;
    this.captureCanvas = null;
    this.penMode = false;
    this._penSeen = false;
    this._penDown = false;
    this._events = new Map();
    this._raf = 0;
    this._camAnim = 0;
    this._fitEaseRaf = 0;
    this._laserRaf = 0;
    this._fitEase = null;
    this._pointers = new Map();
    this._ptrType = new Map();
    this._destroyed = false;
    this._themeFade = null;
    this._pendingFit = null;

    container.classList.add("ic-root");
    container.tabIndex = 0;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "ic-canvas";
    this.overlay = document.createElement("canvas");
    this.overlay.className = "ic-overlay";
    container.prepend(this.overlay);
    container.prepend(this.canvas);

    this._bind();
    this._unsubStore = this.store.listen(() => {
      this._pruneSelection();
      this.requestRender();
      this.emit("change");
    });
    this._unsubHistory = this.store.listenHistory(() => this.emit("history"));
    this.requestRender();
  }

  on(ev: string, fn: (...args: any[]) => void): () => void {
    if (!this._events.has(ev)) this._events.set(ev, new Set());
    this._events.get(ev)!.add(fn);
    return () => {
      this._events.get(ev)!.delete(fn);
    };
  }
  emit(ev: string, ...args: any[]): void {
    const s = this._events.get(ev);
    if (s)
      for (const fn of [...s]) {
        try {
          fn(...args);
        } catch (e) {
          console.warn("board event failed", e);
        }
      }
  }

  viewSize(): { w: number; h: number } {
    return {
      w: this.container.clientWidth || 1,
      h: this.container.clientHeight || 1,
    };
  }
  screenToPage(sx: number, sy: number): XY {
    const c = this.camera;
    return { x: sx / c.z - c.x, y: sy / c.z - c.y };
  }
  pageToScreen(px: number, py: number): XY {
    const c = this.camera;
    return { x: (px + c.x) * c.z, y: (py + c.y) * c.z };
  }
  viewportPageBounds(): Bounds {
    const { w, h } = this.viewSize();
    const c = this.camera;
    return { x: -c.x, y: -c.y, w: w / c.z, h: h / c.z };
  }
  setCamera(cam: Camera, { animate = 0 }: { animate?: number } = {}): void {
    this._cancelFitEase();
    cancelAnimationFrame(this._camAnim);
    if (!animate) {
      this.camera = { ...cam };
      this._afterCamera();
      return;
    }
    const from = { ...this.camera };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / animate);
      const e = 1 - Math.pow(1 - t, 3);
      this.camera = {
        x: from.x + (cam.x - from.x) * e,
        y: from.y + (cam.y - from.y) * e,
        z: from.z + (cam.z - from.z) * e,
      };
      this._afterCamera();
      if (t < 1) this._camAnim = requestAnimationFrame(step);
    };
    this._camAnim = requestAnimationFrame(step);
  }
  _afterCamera(): void {
    this.requestRender();
    this.emit("camera");
  }
  pan(dxScreen: number, dyScreen: number): void {
    const c = this.camera;
    this.setCamera({ ...c, x: c.x + dxScreen / c.z, y: c.y + dyScreen / c.z });
  }
  zoomAt(
    sx: number,
    sy: number,
    mult: number,
    opts?: { animate?: number },
  ): void {
    const c = this.camera;
    const z = clamp(c.z * mult, ZOOM_MIN, ZOOM_MAX);
    const p = this.screenToPage(sx, sy);
    this.setCamera({ z, x: sx / z - p.x, y: sy / z - p.y }, opts);
  }
  contentBounds(): Bounds | null {
    let b: Bounds | null = null;
    for (const s of this.store.shapes()) b = boundsUnion(b, pageBounds(s));
    return b;
  }
  fitContent({
    margin = 0.08,
    maxZoom = 1,
    animate = 0,
    ease = 0,
  }: {
    margin?: number;
    maxZoom?: number;
    animate?: number;
    ease?: number;
  } = {}): void {
    if (
      this._deferFit(() => this.fitContent({ margin, maxZoom, animate, ease }))
    )
      return;
    const fitNow = (): Camera | null => {
      const b = this.contentBounds();
      if (!b || b.w <= 0 || b.h <= 0) return null;
      const { w, h } = this.viewSize();
      const inset = Math.min(w, h) * margin;
      const z = clamp(
        Math.min(maxZoom, (w - inset * 2) / b.w, (h - inset * 2) / b.h),
        ZOOM_MIN,
        ZOOM_MAX,
      );
      if (!isFinite(z) || z <= 0) return null;
      return {
        z,
        x: w / 2 / z - (b.x + b.w / 2),
        y: h / 2 / z - (b.y + b.h / 2),
      };
    };
    if (!ease) {
      const fit = fitNow();
      if (fit) this.setCamera(fit, { animate });
      return;
    }
    this._easeToFit(fitNow, ease);
  }
  followBounds(
    b: Bounds,
    { animate = 0, ease = 0 }: { animate?: number; ease?: number } = {},
  ): void {
    if (!b || !(b.w > 0) || !(b.h > 0)) return;
    if (this._deferFit(() => this.followBounds(b, { animate, ease }))) return;
    const fitNow = (): Camera | null => {
      const { w, h } = this.viewSize();
      const z = clamp(Math.max(w / b.w, h / b.h), ZOOM_MIN, ZOOM_MAX);
      if (!isFinite(z) || z <= 0) return null;
      return {
        z,
        x: w / 2 / z - (b.x + b.w / 2),
        y: h / 2 / z - (b.y + b.h / 2),
      };
    };
    if (!ease) {
      const fit = fitNow();
      if (fit) this.setCamera(fit, { animate });
      return;
    }
    this._easeToFit(fitNow, ease);
  }
  _deferFit(retry: () => void): boolean {
    const { w, h } = this.viewSize();
    if (w > 1 && h > 1) return false;
    this._pendingFit = retry;
    return true;
  }
  _easeToFit(fitNow: () => Camera | null, ease: number): void {
    if (this._fitEase) return;
    const fit0 = fitNow();
    if (!fit0) return;
    const c = this.camera;
    const fe: FitEase = (this._fitEase = {
      t0: 0,
      dur: ease,
      dx: c.x - fit0.x,
      dy: c.y - fit0.y,
      dz: c.z - fit0.z,
    });
    cancelAnimationFrame(this._camAnim);
    const step = (now: number) => {
      if (this._fitEase !== fe || this._destroyed) return;
      if (!fe.t0) fe.t0 = now;
      const t = Math.min(1, (now - fe.t0) / fe.dur);
      const e = 1 - Math.pow(1 - t, 3);
      const fit = fitNow();
      if (fit) {
        this.camera = {
          z: fit.z + fe.dz * (1 - e),
          x: fit.x + fe.dx * (1 - e),
          y: fit.y + fe.dy * (1 - e),
        };
        this.render();
        this.emit("camera");
      }
      if (t < 1) this._fitEaseRaf = requestAnimationFrame(step);
      else this._fitEase = null;
    };
    this._fitEaseRaf = requestAnimationFrame(step);
  }
  _cancelFitEase(): void {
    this._fitEase = null;
    cancelAnimationFrame(this._fitEaseRaf);
  }

  setTool(tool: ToolId): void {
    if (!TOOLS.includes(tool)) return;
    this._commitText();
    this.tool = tool;
    if (tool !== "select") this.setSelection([]);
    this._syncCursor();
    this.emit("tool");
    this.requestRender();
  }
  setGeoKind(kind: GeoId): void {
    if (GEO_IDS.includes(kind)) {
      this.geoKind = kind;
      this.emit("tool");
    }
  }
  setTheme(id: ThemeId | string): void {
    const t = themeOf(id);
    if (t === this.theme) return;
    this._crossfadeTheme();
    this.theme = t;
    this.container.dataset.icTheme = t.id;
    this.requestRender();
    this.emit("theme");
  }
  _crossfadeThemeFn(): void {
    if (this._destroyed) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const w = this.canvas.width,
      h = this.canvas.height;
    if (!w || !h) return;
    try {
      const snap = document.createElement("canvas");
      snap.width = w;
      snap.height = h;
      snap.getContext("2d")!.drawImage(this.canvas, 0, 0);
      snap.className = "ic-theme-fade";
      this._themeFade?.remove();
      this._themeFade = snap;
      this.overlay.after(snap);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          snap.style.opacity = "0";
        }),
      );
      const done = () => {
        snap.remove();
        if (this._themeFade === snap) this._themeFade = null;
      };
      snap.addEventListener("transitionend", done, { once: true });
      setTimeout(done, 600);
    } catch {}
  }
  setGrid(id: GridId): void {
    if (!GRID_IDS.includes(id) || id === this.grid) return;
    this.grid = id;
    this.requestRender();
    this.emit("grid");
  }
  setReadonly(ro: boolean): void {
    this.readonly = !!ro;
    if (ro) {
      this._cancelSession();
      this._commitText();
      this.setSelection([]);
    }
    this._syncCursor();
  }
  setPenMode(on: boolean): void {
    on = !!on;
    if (this.penMode === on) return;
    this.penMode = on;
    this.emit("penmode");
  }
  _pinchPoints(): XY[] {
    const pts: XY[] = [];
    for (const [id, p] of this._pointers) {
      if (this.penMode && this._ptrType.get(id) === "pen") continue;
      pts.push(p);
    }
    return pts;
  }
  setStyle<K extends keyof Styles>(key: K, value: Styles[K]): void {
    this.styles = { ...this.styles, [key]: value };
    if (this.selection.size) {
      const APPLIES: Record<string, string[]> = {
        color: ["draw", "highlight", "geo", "arrow", "line", "text", "note"],
        size: ["draw", "highlight", "geo", "arrow", "line", "text", "note"],
        dash: ["draw", "geo", "arrow", "line"],
        fill: ["geo"],
        font: ["text", "note", "geo"],
      };
      this.store.transact(() => {
        for (const id of this.selection) {
          const s = this.store.get(id) as ShapeRecord | undefined;
          if (s && APPLIES[key]?.includes(s.type))
            this.store.update(id, { props: { [key]: value } as any });
        }
      });
    }
    this.emit("styles");
  }
  currentStyles(): Partial<Record<keyof Styles, Styles[keyof Styles] | null>> {
    if (!this.selection.size) return { ...this.styles };
    const out: Partial<Record<keyof Styles, Styles[keyof Styles] | null>> = {};
    for (const id of this.selection) {
      const s = this.store.get(id) as ShapeRecord | undefined;
      if (!s) continue;
      const props = s.props as unknown as Record<string, Styles[keyof Styles] | undefined>;
      for (const k of ["color", "size", "dash", "fill", "font"] as const) {
        if (props[k] === undefined) continue;
        if (!(k in out)) out[k] = props[k];
        else if (out[k] !== props[k]) out[k] = null;
      }
    }
    return { ...this.styles, ...out };
  }

  setSelection(ids: string[]): void {
    this.selection = new Set(ids);
    this.requestRender();
    this.emit("selection");
  }
  _pruneSelection(): void {
    let dirty = false;
    for (const id of this.selection)
      if (!this.store.has(id)) {
        this.selection.delete(id);
        dirty = true;
      }
    if (dirty) this.emit("selection");
  }
  selectionBounds(): Bounds | null {
    let b: Bounds | null = null;
    for (const id of this.selection) {
      const s = this.store.get(id) as ShapeRecord | undefined;
      if (s) b = boundsUnion(b, pageBounds(s));
    }
    return b;
  }
  deleteSelection(): void {
    if (!this.selection.size) return;
    this.store.remove([...this.selection]);
    this.setSelection([]);
  }
  clearBoard(): void {
    if (!this.store.ids().length) return;
    this._cancelSession();
    this._commitText();
    this.store.clear();
    this.setSelection([]);
  }
  selectAll(): void {
    if (this.tool !== "select") this.setTool("select");
    this.setSelection(this.store.shapes().map((s) => s.id));
  }
  duplicateSelection(offset = 16): void {
    if (!this.selection.size) return;
    const ids: string[] = [];
    let z = this.store.maxZ();
    this.store.transact(() => {
      for (const id of this.selection) {
        const s = this.store.get(id);
        if (!s || s.typeName === "asset") continue;
        const copy: ShapeRecord = {
          ...s,
          id: newId(),
          x: s.x + offset,
          y: s.y + offset,
          z: ++z,
        } as ShapeRecord;
        this.store.put(copy);
        ids.push(copy.id);
      }
    });
    this.setSelection(ids);
  }
  bringToFront(): void {
    let z = this.store.maxZ();
    const sel = this.store
      .shapes()
      .filter((s) => this.selection.has(s.id))
      .sort((a, b) => a.z - b.z);
    this.store.transact(() => {
      for (const s of sel) this.store.update(s.id, { z: ++z });
    });
  }
  sendToBack(): void {
    let z = this.store.minZ();
    const sel = this.store
      .shapes()
      .filter((s) => this.selection.has(s.id))
      .sort((a, b) => b.z - a.z);
    this.store.transact(() => {
      for (const s of sel) this.store.update(s.id, { z: --z });
    });
  }

  shapesSorted(): ShapeRecord[] {
    return this.store
      .shapes()
      .sort(
        (a: ShapeRecord, b: ShapeRecord) =>
          (a.type === "highlight" ? 0 : 1) - (b.type === "highlight" ? 0 : 1) ||
          a.z - b.z ||
          (a.id < b.id ? -1 : 1),
      );
  }
  hitTest(px: number, py: number): ShapeRecord | null {
    const tol = 8 / this.camera.z;
    const list = this.shapesSorted();
    for (let i = list.length - 1; i >= 0; i--) {
      if (hitShape(list[i], px, py, tol, this.store)) return list[i];
    }
    return null;
  }

  _bind(): void {
    const c = this.container;
    this._onDown = (e) => this._pointerDown(e);
    this._onMove = (e) => this._pointerMove(e);
    this._onUp = (e) => this._pointerUp(e);
    this._onWheel = (e) => this._wheel(e);
    this._onKeyDown = (e) => this._keyDown(e);
    this._onKeyUp = (e) => this._keyUp(e);
    this._onDblClick = (e) => this._dblClick(e);
    this._onDrop = (e) => this._drop(e);
    this._onDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    this._onPaste = (e) => this._paste(e);
    c.addEventListener("pointerdown", this._onDown);
    c.addEventListener("pointermove", this._onMove);
    c.addEventListener("pointerup", this._onUp);
    c.addEventListener("pointercancel", this._onUp);
    c.addEventListener("wheel", this._onWheel, { passive: false });
    c.addEventListener("keydown", this._onKeyDown);
    c.addEventListener("keyup", this._onKeyUp);
    c.addEventListener("dblclick", this._onDblClick);
    c.addEventListener("drop", this._onDrop);
    c.addEventListener("dragover", this._onDragOver);
    c.addEventListener("paste", this._onPaste);
    this._onBlur = () => {
      this.spaceHeld = false;
      this._syncCursor();
    };
    c.addEventListener("blur", this._onBlur);
    this._ro = new ResizeObserver(() => this.requestRender());
    this._ro.observe(c);
    this._crossfadeTheme = () => this._crossfadeThemeFn();
    this._decodeAssets = (shapes) => this._decodeAssetsFn(shapes);
    this._drawGrid = (ctx, cam, W, H, dpr) =>
      this._drawGridFn(ctx, cam, W, H, dpr);
    this._renderOverlay = (w, h, dpr) => this._renderOverlayFn(w, h, dpr);
    this._renderCapture = () => this._renderCaptureFn();
  }

  _evPoint(e: { clientX: number; clientY: number }): XY {
    const r = this.container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _pointerDown(e: PointerEvent): void {
    if (this.readonly) return;
    if (
      e.target !== this.canvas &&
      e.target !== this.overlay &&
      e.target !== this.container
    )
      return;
    if (e.button === 2) return;
    if (this.editing) this._commitText();
    this.container.focus({ preventScroll: true });
    const s = this._evPoint(e);
    this._pointers.set(e.pointerId, s);
    this._ptrType.set(e.pointerId, e.pointerType);
    try {
      this.container.setPointerCapture(e.pointerId);
    } catch {}

    if (e.pointerType === "pen") {
      this._penDown = true;
      if (!this._penSeen) {
        this._penSeen = true;
        this.setPenMode(true);
      }
    }

    if (!this.penMode || e.pointerType !== "pen") {
      const pp = this._pinchPoints();
      if (pp.length === 2 && !(this.penMode && this._penDown)) {
        this._abortForPinch();
        const [a, b] = pp;
        this.session = {
          type: "pinch",
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          cam: { ...this.camera },
        };
        return;
      }
      if (pp.length > 2) return;
    }
    if (this.penMode && e.pointerType === "touch") return;
    if (this._pointers.size > 2) return;
    if (this.session?.type === "pinch") return;

    const p = this.screenToPage(s.x, s.y);
    if (e.button === 1 || this.spaceHeld || this.tool === "hand") {
      this.session = { type: "panning", last: s };
      this._syncCursor("grabbing");
      return;
    }

    switch (this.tool) {
      case "draw":
      case "highlight":
        return this._beginDraw(e, p);
      case "eraser":
        return this._beginErase(p);
      case "laser":
        return this._beginLaser(p);
      case "arrow":
      case "line":
        return this._beginLineish(this.tool, p, e);
      case "geo":
        return this._beginGeo(p, e);
      case "text":
      case "note":
        this.session = { type: "placing", tool: this.tool, page: p };
        return;
      case "select":
        return this._beginSelect(e, s, p);
    }
  }

  _pointerMove(e: PointerEvent): void {
    if (this.readonly) return;
    if (this._pointers.has(e.pointerId))
      this._pointers.set(e.pointerId, this._evPoint(e));
    const ss = this.session;
    if (!ss) {
      this._hoverCursor(e);
      return;
    }
    if (
      this.penMode &&
      e.pointerType === "touch" &&
      ss.type !== "pinch" &&
      ss.type !== "panning"
    )
      return;
    const s = this._evPoint(e);
    const p = this.screenToPage(s.x, s.y);

    switch (ss.type) {
      case "pinch": {
        const pp = this._pinchPoints();
        if (pp.length < 2) return;
        const [a, b] = pp;
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const z = clamp(ss.cam.z * (dist / ss.dist), ZOOM_MIN, ZOOM_MAX);
        const p0 = {
          x: ss.center.x / ss.cam.z - ss.cam.x,
          y: ss.center.y / ss.cam.z - ss.cam.y,
        };
        this.setCamera({ z, x: center.x / z - p0.x, y: center.y / z - p0.y });
        return;
      }
      case "panning": {
        this.pan(s.x - ss.last.x, s.y - ss.last.y);
        ss.last = s;
        return;
      }
      case "drawing":
        return this._extendDraw(e, p);
      case "erasing":
        return this._extendErase(p);
      case "lasering":
        return this._extendLaser(p);
      case "lineish":
        return this._dragLineish(p, e);
      case "geo-create":
        return this._dragGeo(p, e);
      case "marquee": {
        ss.rect = {
          x: Math.min(ss.origin.x, p.x),
          y: Math.min(ss.origin.y, p.y),
          w: Math.abs(p.x - ss.origin.x),
          h: Math.abs(p.y - ss.origin.y),
        };
        const hits = this.shapesSorted()
          .filter((sh) => marqueeHits(sh, ss.rect!))
          .map((sh) => sh.id);
        this.setSelection(
          ss.additive ? [...new Set([...ss.base, ...hits])] : hits,
        );
        return;
      }
      case "translating":
        return this._dragTranslate(p, e);
      case "resizing":
        return this._dragResize(p, e);
      case "rotating":
        return this._dragRotate(p, e);
      case "handle":
        return this._dragHandle(p, e);
      case "pressing": {
        if (Math.hypot(s.x - ss.start.x, s.y - ss.start.y) > 4) {
          this.session = null;
          this._beginTranslate(ss.page, e);
          if (this.session) this._dragTranslate(p, e);
        }
        return;
      }
    }
  }

  _pointerUp(e: PointerEvent): void {
    this._pointers.delete(e.pointerId);
    this._ptrType.delete(e.pointerId);
    if (e.pointerType === "pen") this._penDown = false;
    const ss = this.session;
    if (!ss) return;
    if (ss.type === "pinch") {
      if (this._pinchPoints().length < 2) this.session = null;
      return;
    }
    if (this.penMode && e.pointerType === "touch" && ss.type !== "panning")
      return;
    switch (ss.type) {
      case "panning":
        this.session = null;
        this._syncCursor();
        return;
      case "drawing":
        return this._endDraw();
      case "erasing":
        return this._endErase();
      case "lasering":
        return this._endLaser();
      case "lineish":
        return this._endLineish();
      case "geo-create":
        return this._endGeo();
      case "marquee":
        this.session = null;
        this.requestRender();
        return;
      case "translating":
        return this._endTranslate();
      case "placing": {
        this.session = null;
        ss.tool === "note"
          ? this._placeNote(ss.page)
          : this._placeText(ss.page);
        return;
      }
      case "resizing":
      case "rotating":
      case "handle":
        this.store.endBatch();
        this.session = null;
        this._syncCursor();
        this.requestRender();
        return;
      case "pressing": {
        if (ss.hit)
          this.setSelection(
            ss.additive
              ? ss.added
                ? [...this.selection]
                : this._toggled(ss.hit.id)
              : [ss.hit.id],
          );
        else if (!ss.additive) this.setSelection([]);
        this.session = null;
        return;
      }
    }
  }

  _toggled(id: string): string[] {
    const next = new Set(this.selection);
    next.has(id) ? next.delete(id) : next.add(id);
    return [...next];
  }

  _abortForPinch(): void {
    const ss = this.session;
    if (!ss) return;
    if (ss.type === "drawing") {
      this.store.remove([ss.id]);
      this.store.endBatch();
    } else if (ss.type === "lineish" || ss.type === "geo-create") {
      this.store.remove([ss.id]);
      this.store.endBatch();
    } else if (
      ["translating", "resizing", "rotating", "handle", "erasing"].includes(
        ss.type,
      )
    ) {
      this.store.endBatch();
    }
    this.session = null;
  }
  _cancelSession(): void {
    this._abortForPinch();
    this.requestRender();
  }

  _beginDraw(e: PointerEvent, p: XY): void {
    const type: "draw" | "highlight" = this.tool as any;
    const id = newId();
    this.store.beginBatch();
    const anyProps: Record<string, any> = {
      pts: [0, 0, e.pressure || 0.5],
      color: this.styles.color,
      size: this.styles.size,
      done: false,
    };
    if (type === "draw") anyProps.dash = this.styles.dash;
    if (e.pointerType === "pen") anyProps.isPen = true;
    const shape: ShapeRecord = {
      id,
      typeName: "shape",
      type,
      x: p.x,
      y: p.y,
      rot: 0,
      z: this.store.maxZ() + 1,
      props: anyProps,
    } as ShapeRecord;
    this.store.put(shape);
    this.session = { type: "drawing", id, last: p };
  }
  _extendDraw(e: PointerEvent, p: XY): void {
    const ss = this.session as SessionDrawing;
    const shape = this.store.get(ss.id) as ShapeRecord | undefined;
    if (!shape || (shape.type !== "draw" && shape.type !== "highlight")) {
      this.session = null;
      return;
    }
    const minD = 1.25 / this.camera.z;
    if (Math.hypot(p.x - ss.last.x, p.y - ss.last.y) < minD) return;
    ss.last = p;
    const evs = (e as any).getCoalescedEvents
      ? (e as any).getCoalescedEvents()
      : [e];
    const pts = shape.props.pts.slice();
    for (const ce of evs.length ? evs : [e]) {
      const r = this._evPoint(ce);
      const cp = this.screenToPage(r.x, r.y);
      pts.push(cp.x - shape.x, cp.y - shape.y, ce.pressure || 0.5);
    }
    this.store.update(ss.id, { props: { pts } });
  }
  _endDraw(): void {
    const ss = this.session as SessionDrawing;
    if (this.store.get(ss.id))
      this.store.update(ss.id, { props: { done: true } });
    this.store.endBatch();
    this.session = null;
  }

  _beginErase(p: XY): void {
    this.session = {
      type: "erasing",
      hits: new Set(),
      trail: [p.x, p.y],
      last: p,
    };
    this._eraseAt(p);
    this.requestRender();
  }
  _extendErase(p: XY): void {
    const ss = this.session as SessionErasing;
    const steps = Math.max(
      1,
      Math.ceil(
        Math.hypot(p.x - ss.last.x, p.y - ss.last.y) / (6 / this.camera.z),
      ),
    );
    for (let i = 1; i <= steps; i++) {
      this._eraseAt({
        x: ss.last.x + ((p.x - ss.last.x) * i) / steps,
        y: ss.last.y + ((p.y - ss.last.y) * i) / steps,
      });
    }
    ss.trail.push(p.x, p.y);
    if (ss.trail.length > 40) ss.trail.splice(0, ss.trail.length - 40);
    ss.last = p;
    this.requestRender();
  }
  _eraseAt(p: XY): void {
    const hit = this.hitTest(p.x, p.y);
    if (hit) (this.session as SessionErasing).hits.add(hit.id);
  }
  _endErase(): void {
    const hits = [...(this.session as SessionErasing).hits];
    this.session = null;
    if (hits.length) this.store.remove(hits);
    this.requestRender();
  }

  _beginLaser(p: XY): void {
    const stroke: ScribbleStroke = {
      id: newId("scrib"),
      points: [{ x: p.x, y: p.y }],
      opacity: 1,
      done: false,
      at: performance.now(),
    };
    this.scribbles.push(stroke);
    this.session = { type: "lasering", stroke };
    this._laserTick();
    this.emit("scribbles");
  }
  _extendLaser(p: XY): void {
    const st = (this.session as SessionLasering).stroke;
    st.points.push({ x: p.x, y: p.y });
    if (st.points.length > 220) st.points.splice(0, st.points.length - 220);
    st.at = performance.now();
    this.emit("scribbles");
    this.requestRender();
  }
  _endLaser(): void {
    const ss = this.session as SessionLasering;
    ss.stroke.done = true;
    ss.stroke.at = performance.now();
    this.session = null;
    this.emit("scribbles");
  }
  _laserTick(): void {
    if (this._laserRaf) return;
    const tick = () => {
      this._laserRaf = 0;
      const now = performance.now();
      let dirty = false;
      this.scribbles = this.scribbles.filter((st) => {
        if (!st.done) return true;
        const age = now - (st.at || 0);
        const o = 1 - Math.max(0, age - 250) / 850;
        if (o !== (st.opacity ?? 1)) {
          st.opacity = Math.max(0, o);
          dirty = true;
        }
        return o > 0;
      });
      if (dirty) {
        this.emit("scribbles");
        this.requestRender();
      }
      if (this.scribbles.length || this.remoteScribbles.length)
        this._laserRaf = requestAnimationFrame(tick);
    };
    this._laserRaf = requestAnimationFrame(tick);
  }
  setRemoteScribbles(list: ScribbleStroke[]): void {
    this.remoteScribbles = list || [];
    this.remoteScribblesAt = performance.now();
    this._laserTick();
    this.requestRender();
  }
  getScribbles(): ScribbleStroke[] {
    return this.scribbles.map((s) => ({
      points: s.points,
      opacity: s.opacity,
    }));
  }

  _beginLineish(type: "line" | "arrow", p: XY, _e: PointerEvent): void {
    const id = newId();
    this.store.beginBatch();
    this.store.put({
      id,
      typeName: "shape",
      type,
      x: p.x,
      y: p.y,
      rot: 0,
      z: this.store.maxZ() + 1,
      props: {
        dx: 0.01,
        dy: 0.01,
        bend: 0,
        color: this.styles.color,
        size: this.styles.size,
        dash: this.styles.dash === "draw" ? "solid" : this.styles.dash,
      },
    } as ShapeRecord);
    this.session = { type: "lineish", id };
  }
  _dragLineish(p: XY, e: PointerEvent): void {
    const id = (this.session as SessionLineish).id;
    const s = this.store.get(id) as ShapeRecord | undefined;
    if (!s) return;
    let dx = p.x - s.x,
      dy = p.y - s.y;
    if (e.shiftKey) {
      const a =
        Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
      const len = Math.hypot(dx, dy);
      dx = Math.cos(a) * len;
      dy = Math.sin(a) * len;
    }
    this.store.update(s.id, { props: { dx, dy } });
  }
  _endLineish(): void {
    const id = (this.session as SessionLineish).id;
    const s = this.store.get(id) as ShapeRecord | undefined;
    this.session = null;
    if (
      s &&
      Math.hypot((s.props as any).dx, (s.props as any).dy) < 2 / this.camera.z
    )
      this.store.remove([s.id]);
    this.store.endBatch();
    if (s) {
      this.setTool("select");
      this.setSelection([s.id]);
    }
  }

  _beginGeo(p: XY, _e: PointerEvent): void {
    const id = newId();
    this.store.beginBatch();
    this.store.put({
      id,
      typeName: "shape",
      type: "geo",
      x: p.x,
      y: p.y,
      rot: 0,
      z: this.store.maxZ() + 1,
      props: {
        geo: this.geoKind,
        w: 1,
        h: 1,
        color: this.styles.color,
        size: this.styles.size,
        dash: this.styles.dash,
        fill: this.styles.fill,
        font: this.styles.font,
      },
    } as ShapeRecord);
    this.session = { type: "geo-create", id, origin: p, dragged: false };
  }
  _dragGeo(p: XY, e: PointerEvent): void {
    const ss = this.session as SessionGeoCreate;
    const s = this.store.get(ss.id) as ShapeRecord | undefined;
    if (!s) return;
    ss.dragged = true;
    let w = p.x - ss.origin.x;
    let h = p.y - ss.origin.y;
    if (e.shiftKey) {
      const m = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * m;
      h = Math.sign(h || 1) * m;
    }
    this.store.update(ss.id, {
      x: Math.min(ss.origin.x, ss.origin.x + w),
      y: Math.min(ss.origin.y, ss.origin.y + h),
      props: { w: Math.max(1, Math.abs(w)), h: Math.max(1, Math.abs(h)) },
    });
  }
  _endGeo(): void {
    const ss = this.session as SessionGeoCreate;
    this.session = null;
    const s = this.store.get(ss.id) as ShapeRecord | undefined;
    if (
      s &&
      (!ss.dragged || (s.props as any).w < 4 || (s.props as any).h < 4)
    ) {
      this.store.update(s.id, {
        x: s.x - 80,
        y: s.y - 80,
        props: { w: 160, h: 160 },
      });
    }
    this.store.endBatch();
    if (s) {
      this.setTool("select");
      this.setSelection([s.id]);
    }
  }

  _placeText(p: XY): void {
    const id = newId();
    this.store.beginBatch();
    this.store.put({
      id,
      typeName: "shape",
      type: "text",
      x: p.x,
      y: p.y - FONT_SIZES[this.styles.size] * 0.66,
      rot: 0,
      z: this.store.maxZ() + 1,
      props: {
        text: "",
        color: this.styles.color,
        size: this.styles.size,
        font: this.styles.font,
        autosize: true,
        scale: 1,
      },
    } as ShapeRecord);
    this.setTool("select");
    this.setSelection([id]);
    this._startTextEdit(id, "text", { fresh: true });
  }
  _placeNote(p: XY): void {
    const id = newId();
    this.store.beginBatch();
    this.store.put({
      id,
      typeName: "shape",
      type: "note",
      x: p.x - NOTE_W / 2,
      y: p.y - NOTE_W / 2,
      rot: 0,
      z: this.store.maxZ() + 1,
      props: {
        text: "",
        color: (this.styles.color === DEFAULT_STYLES.color
          ? "yellow"
          : this.styles.color) as ColorId,
        size: "m",
        font: this.styles.font,
        scale: 1,
      },
    } as ShapeRecord);
    this.setTool("select");
    this.setSelection([id]);
    this._startTextEdit(id, "text", { fresh: true });
  }

  _startTextEdit(
    id: string,
    field: "text" | "label",
    { fresh = false }: { fresh?: boolean } = {},
  ): void {
    this._commitText();
    const shape = this.store.get(id) as ShapeRecord | undefined;
    if (!shape) return;
    if (!fresh) this.store.beginBatch();
    const ta = document.createElement("textarea");
    ta.className = "ic-text-edit";
    ta.value =
      field === "label"
        ? shape.type === "geo"
          ? shape.props.label || ""
          : ""
        : shape.type === "text" || shape.type === "note"
          ? shape.props.text || ""
          : "";
    ta.spellcheck = false;
    this.container.appendChild(ta);
    this.editing = { id, field, textarea: ta, fresh };
    const sync = () => {
      const patch: Record<string, any> =
        field === "label" ? { label: ta.value } : { text: ta.value };
      this.store.update(id, { props: patch });
      this._layoutTextEditor();
    };
    ta.addEventListener("input", sync);
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (
        e.key === "Escape" ||
        (e.key === "Enter" && (e.metaKey || e.ctrlKey))
      ) {
        e.preventDefault();
        this._commitText();
        this.container.focus({ preventScroll: true });
      }
    });
    ta.addEventListener("pointerdown", (e) => e.stopPropagation());
    ta.addEventListener("blur", () => this._commitText());
    this._layoutTextEditor();
    ta.focus();
    if (!fresh) ta.select();
    this.emit("edit");
    this.requestRender();
  }
  _layoutTextEditor(): void {
    const ed = this.editing;
    if (!ed) return;
    const shape = this.store.get(ed.id) as ShapeRecord | undefined;
    if (!shape) return;
    const z = this.camera.z;
    const ta = ed.textarea;
    let lay: any,
      pos: XY | null = null,
      w: number = 0,
      h: number = 0,
      align: string = "left";
    if (shape.type === "note") {
      lay = noteLayout(shape);
      const s = (shape.props as any).scale || 1;
      const yStart = Math.max(20, lay.boxH / 2 - lay.textH / 2);
      pos = this.pageToScreen(shape.x + 20 * s, shape.y + yStart * s);
      w = (NOTE_W - 40) * s;
      h = lay.textH * s;
      align = "center";
      ta.style.font = `500 ${lay.fontSize * s * z}px ${lay.font}`;
      ta.style.lineHeight = lay.lh * s * z + "px";
    } else if (shape.type === "geo" && ed.field === "label") {
      const p: any = shape.props;
      const fs = FONT_SIZES[(p.labelSize || "s") as SizeId];
      const fam = FONTS[(p.font || "draw") as FontId];
      pos = this.pageToScreen(shape.x + 8, shape.y + 8);
      w = p.w - 16;
      h = p.h - 16;
      align = "center";
      ta.style.font = `500 ${fs * z}px ${fam}`;
      ta.style.lineHeight = fs * 1.3 * z + "px";
      ta.style.paddingTop = Math.max(0, (h * z) / 2 - fs * 1.3 * z) / 2 + "px";
    } else {
      lay = textLayout(shape);
      pos = this.pageToScreen(shape.x, shape.y);
      w = Math.max(lay.w + 4, 40);
      h = lay.h + 4;
      const p: any = shape.props;
      align =
        p.align === "middle" ? "center" : p.align === "end" ? "right" : "left";
      ta.style.font = `500 ${lay.fontSize * z}px ${lay.font}`;
      ta.style.lineHeight = lay.lh * z + "px";
    }
    const colorId = ("color" in shape.props ? shape.props.color : "black") as ColorId;
    const col = this.theme.colors[colorId || "black"];
    ta.style.left = pos!.x + "px";
    ta.style.top = pos!.y + "px";
    ta.style.width = w * z + "px";
    ta.style.height = h * z + "px";
    ta.style.textAlign = align;
    ta.style.color = shape.type === "note" ? this.theme.noteText : col.stroke;
  }
  _commitText(): void {
    const ed = this.editing;
    if (!ed) return;
    this.editing = null;
    const shape = this.store.get(ed.id) as ShapeRecord | undefined;
    ed.textarea.remove();
    if (shape) {
      const value =
        ed.field === "label"
          ? (shape.props as any).label
          : (shape.props as any).text;
      if (
        !String(value || "").trim() &&
        (shape.type === "text" || (shape.type === "note" && ed.fresh))
      ) {
        this.store.remove([ed.id]);
        this.selection.delete(ed.id);
      }
    }
    this.store.endBatch();
    this.emit("edit");
    this.requestRender();
  }

  _beginSelect(e: PointerEvent, s: XY, p: XY): void {
    const additive = e.shiftKey;
    const h = this._hitHandle(s.x, s.y);
    if (h) {
      this.store.beginBatch();
      if (h.kind === "rotate") {
        const b = this.selectionBounds()!;
        this.session = {
          type: "rotating",
          center: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
          start: Math.atan2(p.y - (b.y + b.h / 2), p.x - (b.x + b.w / 2)),
          orig: this._snapshotSelection(),
        };
        this._syncCursor("grabbing");
      } else if (h.kind === "handle") {
        this.session = { type: "handle", which: h.which as any, id: h.id! };
      } else {
        this.session = {
          type: "resizing",
          handle: h.which!,
          init: this.selectionBounds()!,
          orig: this._snapshotSelection(),
        };
        this._syncCursor(RESIZE_CURSORS[h.which!] || "default");
      }
      return;
    }
    const hit = this.hitTest(p.x, p.y);
    if (hit) {
      const wasSelected = this.selection.has(hit.id);
      if (!wasSelected && !additive) this.setSelection([hit.id]);
      else if (additive && !wasSelected)
        this.setSelection([...this.selection, hit.id]);
      this.session = {
        type: "pressing",
        hit,
        additive,
        added: additive && !wasSelected,
        start: s,
        page: p,
      };
    } else {
      this.session = {
        type: "marquee",
        origin: p,
        rect: null,
        additive,
        base: [...this.selection],
      };
      if (!additive) this.setSelection([]);
    }
  }
  _snapshotSelection(): Map<string, ShapeRecord> {
    const m = new Map<string, ShapeRecord>();
    for (const id of this.selection) {
      const sh = this.store.get(id) as ShapeRecord | undefined;
      if (sh) m.set(id, sh);
    }
    return m;
  }
  _beginTranslate(p: XY, e: PointerEvent): void {
    if (!this.selection.size) return;
    this.store.beginBatch();
    if (e.altKey) this.duplicateSelection(0);
    this.session = {
      type: "translating",
      start: p,
      orig: this._snapshotSelection(),
    };
    this._syncCursor("move");
  }
  _dragTranslate(p: XY, e: PointerEvent): void {
    const ss = this.session as SessionTranslating;
    let dx = p.x - ss.start.x;
    let dy = p.y - ss.start.y;
    if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
    this.store.transact(() => {
      for (const [id, orig] of ss.orig) {
        if (this.store.has(id))
          this.store.update(id, { x: orig.x + dx, y: orig.y + dy });
      }
    });
  }
  _endTranslate(): void {
    this.store.endBatch();
    this.session = null;
    this._syncCursor();
    this.requestRender();
  }
  _dragResize(p: XY, e: PointerEvent): void {
    const ss = this.session as SessionResizing;
    const { handle, init } = ss;
    const ax = handle.includes("l") ? init.x + init.w : init.x;
    const ay = handle.includes("t") ? init.y + init.h : init.y;
    let sx =
      handle.includes("l") || handle.includes("r")
        ? (p.x - ax) / ((handle.includes("l") ? init.x : init.x + init.w) - ax)
        : 1;
    let sy =
      handle.includes("t") || handle.includes("b")
        ? (p.y - ay) / ((handle.includes("t") ? init.y : init.y + init.h) - ay)
        : 1;
    sx = isFinite(sx) ? Math.max(0.02, sx) : 1;
    sy = isFinite(sy) ? Math.max(0.02, sy) : 1;
    const corner = handle.length === 2;
    const uniform =
      corner &&
      (e.shiftKey ||
        [...ss.orig.values()].every((sh) =>
          ["image", "note", "text"].includes(sh.type),
        ));
    if (uniform) sx = sy = Math.max(sx, sy);
    this.store.transact(() => {
      for (const [id, orig] of ss.orig) {
        if (!this.store.has(id)) continue;
        const scaled = scaleShape(orig, sx, sy);
        this.store.put({
          ...scaled,
          x: ax + (orig.x - ax) * sx,
          y: ay + (orig.y - ay) * sy,
        } as ShapeRecord);
      }
    });
  }
  _dragRotate(p: XY, e: PointerEvent): void {
    const ss = this.session as SessionRotating;
    let delta = Math.atan2(p.y - ss.center.y, p.x - ss.center.x) - ss.start;
    if (e.shiftKey) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12);
    this.store.transact(() => {
      for (const [id, orig] of ss.orig) {
        if (!this.store.has(id)) continue;
        const lb = localBounds(orig);
        const cx = orig.x + lb.x + lb.w / 2;
        const cy = orig.y + lb.y + lb.h / 2;
        const nc = rotWith(cx, cy, ss.center.x, ss.center.y, delta);
        this.store.update(id, {
          x: orig.x + nc.x - cx,
          y: orig.y + nc.y - cy,
          rot: ((orig.rot || 0) + delta) % (Math.PI * 2),
        });
      }
    });
  }
  _dragHandle(p: XY, e: PointerEvent): void {
    const ss = this.session as SessionHandle;
    const s = this.store.get(ss.id) as ShapeRecord | undefined;
    if (!s) return;
    const pr: any = s.props;
    if (ss.which === "start") {
      const ex = s.x + pr.dx,
        ey = s.y + pr.dy;
      this.store.update(s.id, {
        x: p.x,
        y: p.y,
        props: { dx: ex - p.x, dy: ey - p.y },
      });
    } else if (ss.which === "end") {
      let dx = p.x - s.x,
        dy = p.y - s.y;
      if (e.shiftKey) {
        const a =
          Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
        const len = Math.hypot(dx, dy);
        dx = Math.cos(a) * len;
        dy = Math.sin(a) * len;
      }
      this.store.update(s.id, { props: { dx, dy } });
    } else if (ss.which === "bend") {
      const len = Math.hypot(pr.dx, pr.dy) || 1;
      const nx = -pr.dy / len,
        ny = pr.dx / len;
      const bend =
        (p.x - (s.x + pr.dx / 2)) * nx + (p.y - (s.y + pr.dy / 2)) * ny;
      this.store.update(s.id, {
        props: { bend: Math.abs(bend) < 4 / this.camera.z ? 0 : bend },
      });
    }
  }

  _hoverCursor(e: PointerEvent): void {
    if (this.tool !== "select" || this.spaceHeld || this.editing) return;
    if (
      e.target !== this.canvas &&
      e.target !== this.overlay &&
      e.target !== this.container
    )
      return;
    const s = this._evPoint(e);
    const h = this._hitHandle(s.x, s.y);
    if (h) {
      this._syncCursor(
        h.kind === "rotate"
          ? "grab"
          : h.kind === "handle"
            ? "pointer"
            : RESIZE_CURSORS[h.which!] || "default",
      );
      return;
    }
    const p = this.screenToPage(s.x, s.y);
    const hit = this.hitTest(p.x, p.y);
    this._syncCursor(hit && this.selection.has(hit.id) ? "move" : null);
  }

  _hitHandle(sx: number, sy: number): HitHandle | null {
    if (this.tool !== "select" || !this.selection.size) return null;
    const one =
      this.selection.size === 1
        ? (this.store.get([...this.selection][0]) as ShapeRecord | null)
        : null;
    if (one && (one.type === "arrow" || one.type === "line")) {
      const pr: any = one.props;
      const pts: Array<{
        which: "start" | "end" | "bend";
        x: number;
        y: number;
      }> = [
        { which: "start", x: one.x, y: one.y },
        { which: "end", x: one.x + pr.dx, y: one.y + pr.dy },
      ];
      const bm = bendMidpoint(pr);
      pts.push({ which: "bend", x: one.x + bm.x, y: one.y + bm.y });
      for (const h of pts) {
        const sc = this.pageToScreen(h.x, h.y);
        if (Math.hypot(sc.x - sx, sc.y - sy) <= HANDLE + 3)
          return { kind: "handle", which: h.which, id: one.id };
      }
      return null;
    }
    const b = this.selectionBounds();
    if (!b) return null;
    const tl = this.pageToScreen(b.x, b.y);
    const br = this.pageToScreen(b.x + b.w, b.y + b.h);
    const rotatable = !one || !["arrow", "line"].includes(one.type);
    if (rotatable) {
      const rx = (tl.x + br.x) / 2;
      const ry = tl.y - 22;
      if (Math.hypot(rx - sx, ry - sy) <= HANDLE + 2) return { kind: "rotate" };
    }
    if (one && one.rot) return null;
    const xs: Record<string, number> = {
      l: tl.x,
      m: (tl.x + br.x) / 2,
      r: br.x,
    };
    const ys: Record<string, number> = {
      t: tl.y,
      m: (tl.y + br.y) / 2,
      b: br.y,
    };
    for (const which of ["tl", "tr", "bl", "br", "t", "b", "l", "r"]) {
      const hx =
        which.length === 2
          ? xs[which[1]]
          : which === "l" || which === "r"
            ? xs[which]
            : xs.m;
      const hy =
        which.length === 2
          ? ys[which[0]]
          : which === "t" || which === "b"
            ? ys[which]
            : ys.m;
      if (Math.abs(hx - sx) <= HANDLE && Math.abs(hy - sy) <= HANDLE) {
        return { kind: "resize", which };
      }
    }
    return null;
  }

  _dblClick(e: MouseEvent): void {
    if (this.readonly || this.tool !== "select") return;
    const s = this._evPoint(e);
    const p = this.screenToPage(s.x, s.y);
    const hit = this.hitTest(p.x, p.y);
    if (hit) {
      if (hit.type === "text" || hit.type === "note") {
        this.setSelection([hit.id]);
        this._startTextEdit(hit.id, "text");
        return;
      }
      if (hit.type === "geo") {
        this.setSelection([hit.id]);
        this._startTextEdit(hit.id, "label");
        return;
      }
      return;
    }
    this._placeText(p);
  }

  _keyDown(e: KeyboardEvent): void {
    if (this.readonly || this.editing) return;
    const meta = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (k === " ") {
      if (!this.spaceHeld) {
        this.spaceHeld = true;
        this._syncCursor();
      }
      e.preventDefault();
      return;
    }
    if (meta && k === "z") {
      e.preventDefault();
      e.shiftKey ? this.store.redo() : this.store.undo();
      return;
    }
    if (meta && k === "a") {
      e.preventDefault();
      this.selectAll();
      return;
    }
    if (meta && k === "d") {
      e.preventDefault();
      this.duplicateSelection();
      return;
    }
    if (meta && k === "c") {
      e.preventDefault();
      this.copySelection();
      return;
    }
    if (meta && k === "x") {
      e.preventDefault();
      this.copySelection().then(() => this.deleteSelection());
      return;
    }
    if (meta && k === "v") {
      e.preventDefault();
      this.pasteFromClipboard();
      return;
    }
    if (meta && (k === "=" || k === "+")) {
      e.preventDefault();
      this._zoomCenter(1.25);
      return;
    }
    if (meta && k === "-") {
      e.preventDefault();
      this._zoomCenter(1 / 1.25);
      return;
    }
    if (k === "escape") {
      if (this.session) this._cancelSession();
      else if (this.selection.size) this.setSelection([]);
      else this.setTool("select");
      return;
    }
    if (meta && e.shiftKey && (k === "delete" || k === "backspace")) {
      e.preventDefault();
      this.clearBoard();
      return;
    }
    if (k === "delete" || k === "backspace") {
      this.deleteSelection();
      return;
    }
    if (k === "enter" && this.selection.size === 1) {
      const s = this.store.get([...this.selection][0]) as
        | ShapeRecord
        | undefined;
      if (s && ["text", "note"].includes(s.type)) {
        e.preventDefault();
        this._startTextEdit(s.id, "text");
      } else if (s && s.type === "geo") {
        e.preventDefault();
        this._startTextEdit(s.id, "label");
      }
      return;
    }
    if (k.startsWith("arrow")) {
      const d = (e.shiftKey ? 32 : 4) / 1;
      const dx = k === "arrowleft" ? -d : k === "arrowright" ? d : 0;
      const dy = k === "arrowup" ? -d : k === "arrowdown" ? d : 0;
      if (this.selection.size) {
        e.preventDefault();
        this.store.transact(() => {
          for (const id of this.selection) {
            const s = this.store.get(id) as ShapeRecord | undefined;
            if (s) this.store.update(id, { x: s.x + dx, y: s.y + dy });
          }
        });
      }
      return;
    }
    if (!meta) {
      if (k === "]") {
        this.bringToFront();
        return;
      }
      if (k === "[") {
        this.sendToBack();
        return;
      }
      const toolKeys: Record<string, ToolId> = {
        v: "select",
        "1": "select",
        h: "hand",
        d: "draw",
        p: "draw",
        b: "draw",
        i: "highlight",
        e: "eraser",
        k: "laser",
        a: "arrow",
        l: "line",
        t: "text",
        n: "note",
        g: "geo",
      };
      if (toolKeys[k]) {
        this.setTool(toolKeys[k]);
        return;
      }
      const geoKeys: Record<string, GeoId> = { r: "rectangle", o: "ellipse" };
      if (geoKeys[k]) {
        this.setGeoKind(geoKeys[k]);
        this.setTool("geo");
        return;
      }
      if (e.shiftKey && k === "!") {
        this.fitContent({ animate: 220 });
        return;
      }
    }
    if (e.shiftKey && k === "1") {
      this.fitContent({ animate: 220 });
      return;
    }
    if (e.shiftKey && k === "0") {
      const { w, h } = this.viewSize();
      this.zoomAt(w / 2, h / 2, 1 / this.camera.z, { animate: 180 });
    }
  }
  _keyUp(e: KeyboardEvent): void {
    if (e.key === " ") {
      this.spaceHeld = false;
      this._syncCursor();
    }
  }
  _zoomCenter(mult: number): void {
    const { w, h } = this.viewSize();
    this.zoomAt(w / 2, h / 2, mult, { animate: 140 });
  }

  _wheel(e: WheelEvent): void {
    if (this.readonly) return;
    e.preventDefault();
    const s = this._evPoint(e);
    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(s.x, s.y, Math.exp(-e.deltaY * 0.012));
    } else {
      this.pan(-e.deltaX, -e.deltaY);
    }
  }

  _syncCursor(force: string | null = null): void {
    const cur = force
      ? force
      : this.readonly
        ? "default"
        : this.spaceHeld || this.tool === "hand"
          ? "grab"
          : (
                [
                  "draw",
                  "highlight",
                  "eraser",
                  "laser",
                  "arrow",
                  "line",
                  "geo",
                ] as ToolId[]
              ).includes(this.tool)
            ? "crosshair"
            : this.tool === "text"
              ? "text"
              : "default";
    this.container.style.cursor = cur;
  }

  async copySelection(): Promise<void> {
    if (!this.selection.size) return;
    const shapes: ShapeRecord[] = [];
    const assets: Record<string, AssetRecord> = {};
    for (const id of this.selection) {
      const s = this.store.get(id) as ShapeRecord | undefined;
      if (!s) continue;
      shapes.push(s);
      if (s.type === "image" && (s.props as any).assetId) {
        const a = this.store.asset((s.props as any).assetId);
        if (a) assets[a.id] = a;
      }
    }
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ incantly: 1, shapes, assets }),
      );
    } catch (e) {
      console.warn("board copy failed", e);
    }
  }
  async pasteFromClipboard(): Promise<void> {
    try {
      if ((navigator.clipboard as any).read) {
        const items: any[] = await (navigator.clipboard as any).read();
        for (const it of items) {
          const t = (it.types as string[]).find((t2) =>
            t2.startsWith("image/"),
          );
          if (t) {
            const blob = await it.getType(t);
            this.importImageBlobs([blob]);
            return;
          }
        }
      }
    } catch {}
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text);
      if (data && (data.incantly || data.quickdraw) && Array.isArray(data.shapes))
        this._pasteShapes(data);
    } catch {}
  }
  _pasteShapes(data: {
    shapes: ShapeRecord[];
    assets?: Record<string, AssetRecord>;
  }): void {
    let z = this.store.maxZ();
    const ids: string[] = [];
    this.store.transact(() => {
      const assetMap: Record<string, string> = {};
      for (const a of Object.values(data.assets || {})) {
        const nid = newId("asset");
        assetMap[a.id] = nid;
        this.store.put({ ...a, id: nid });
      }
      for (const s of data.shapes) {
        const nid = newId();
        ids.push(nid);
        const newProps: Record<string, any> =
          s.props && (s.props as any).assetId
            ? {
                ...s.props,
                assetId:
                  assetMap[(s.props as any).assetId] ||
                  (s.props as any).assetId,
              }
            : (s.props as any);
        this.store.put({
          ...s,
          id: nid,
          x: (s as any).x + 16,
          y: (s as any).y + 16,
          z: ++z,
          props: newProps,
        } as ShapeRecord);
      }
    });
    if (this.tool !== "select") this.setTool("select");
    this.setSelection(ids);
  }
  _paste(e: ClipboardEvent): void {
    if (this.readonly || this.editing) return;
    const files = Array.from(e.clipboardData?.files || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length) {
      e.preventDefault();
      this.importImageBlobs(files);
    }
  }
  _drop(e: DragEvent): void {
    if (this.readonly) return;
    const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    const s = this._evPoint(e);
    this.importImageBlobs(files, this.screenToPage(s.x, s.y));
  }
  async importImageBlobs(blobs: Blob[] | File[], at?: XY): Promise<void> {
    let atPos = at ? { ...at } : undefined;
    for (const blob of blobs) {
      try {
        const { src, w, h } = await readImage(blob);
        const vp = this.viewportPageBounds();
        const scale = Math.min(1, (vp.w * 0.6) / w, (vp.h * 0.6) / h);
        const pw = Math.max(8, w * scale);
        const ph = Math.max(8, h * scale);
        const cx = atPos ? atPos.x : vp.x + vp.w / 2;
        const cy = atPos ? atPos.y : vp.y + vp.h / 2;
        const assetId = newId("asset");
        this.store.transact(() => {
          this.store.put({
            id: assetId,
            typeName: "asset",
            src,
            w,
            h,
          } as AssetRecord);
          this.store.put({
            id: newId(),
            typeName: "shape",
            type: "image",
            x: cx - pw / 2,
            y: cy - ph / 2,
            rot: 0,
            z: this.store.maxZ() + 1,
            props: { w: pw, h: ph, assetId },
          } as ShapeRecord);
        });
        if (atPos) {
          atPos = { x: atPos.x + 24, y: atPos.y + 24 };
        }
      } catch (e2) {
        console.warn("image import failed", e2);
      }
    }
  }
  pickImage(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => {
      if (input.files?.length) this.importImageBlobs(Array.from(input.files));
    };
    input.click();
  }

  async exportImage({
    background = true,
    scale = 2,
    margin = 48,
    ids = null,
  }: {
    background?: boolean;
    scale?: number;
    margin?: number;
    ids?: Set<string> | null;
  } = {}): Promise<Blob | null> {
    let b: Bounds | null = null;
    const shapes = this.shapesSorted().filter((s) => !ids || ids.has(s.id));
    for (const s of shapes) b = boundsUnion(b, pageBounds(s));
    if (!b) return null;
    b = boundsExpand(b, margin);
    const cap = Math.sqrt(24e6 / (b.w * b.h));
    const k = Math.min(scale, cap);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(b.w * k));
    canvas.height = Math.max(1, Math.round(b.h * k));
    const ctx = canvas.getContext("2d")!;
    if (background) {
      ctx.fillStyle = this.theme.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this._drawGridFn(
        ctx,
        { x: -b.x, y: -b.y, z: k },
        canvas.width,
        canvas.height,
        1,
      );
    }
    ctx.setTransform(k, 0, 0, k, -b.x * k, -b.y * k);
    await this._decodeAssetsFn(shapes);
    for (const s of shapes)
      drawShape(ctx, s, { theme: this.theme, store: this.store, zoom: k });
    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/png"),
    );
  }
  _decodeAssetsFn(shapes: ShapeRecord[]): Promise<void> {
    const waits: Promise<void>[] = [];
    for (const s of shapes) {
      if (s.type !== "image" || !(s.props as any).assetId) continue;
      const a = this.store.asset((s.props as any).assetId);
      if (!a) continue;
      waits.push(
        new Promise((res) => {
          const img = new Image();
          img.onload = res as any;
          img.onerror = res as any;
          img.src = a.src;
          if (img.complete) res();
        }),
      );
    }
    return Promise.all(waits).then(() => {});
  }

  requestRender(): void {
    if (this._raf || this._destroyed) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.render();
    });
  }
  resize(): void {
    this.requestRender();
  }

  renderScene(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    w: number,
    h: number,
    {
      dpr = 1,
      background = true,
      hideEditing = false,
    }: { dpr?: number; background?: boolean; hideEditing?: boolean } = {},
  ): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (background) {
      ctx.fillStyle = this.theme.background;
      ctx.fillRect(0, 0, w * dpr, h * dpr);
    } else {
      ctx.clearRect(0, 0, w * dpr, h * dpr);
    }
    if (background) this._drawGridFn(ctx, cam, w * dpr, h * dpr, dpr);
    ctx.setTransform(
      cam.z * dpr,
      0,
      0,
      cam.z * dpr,
      cam.x * cam.z * dpr,
      cam.y * cam.z * dpr,
    );
    const vp = { x: -cam.x, y: -cam.y, w: w / cam.z, h: h / cam.z };
    const pad = 64 / cam.z;
    const vis = boundsExpand(vp, pad);
    for (const s of this.shapesSorted()) {
      const pb = pageBounds(s);
      if (
        pb.x + pb.w < vis.x ||
        pb.x > vis.x + vis.w ||
        pb.y + pb.h < vis.y ||
        pb.y > vis.y + vis.h
      )
        continue;
      drawShape(ctx, s, {
        theme: this.theme,
        store: this.store,
        zoom: cam.z,
        ghost:
          this.session?.type === "erasing" &&
          (this.session as SessionErasing).hits.has(s.id),
        hideText:
          hideEditing && this.editing?.id === s.id
            ? this.editing.field
            : undefined,
        onAssetLoad: () => this.requestRender(),
      });
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  _drawGridFn(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    W: number,
    H: number,
    dpr: number,
  ): void {
    if (this.grid === "none" || !(cam.z > 0)) return;
    const isDotGrid = ["dots", "crosses"].includes(this.grid);
    const g: any = (this.theme.grid as any)?.[isDotGrid ? "dot" : "line"];
    if (!g) return;
    let step = GRID_STEP;
    while (step * cam.z < 18) step *= 2;
    while (step * cam.z > 72) step /= 2;
    const fade = clamp((step * cam.z - 16) / 14, 0, 1);
    if (fade <= 0) return;
    const z = cam.z * dpr;
    const n0 = Math.ceil(-cam.x / step);
    const m0 = Math.ceil(-cam.y / step);
    const isMajor = (i: number) => i % GRID_MAJOR === 0;
    const cols: Array<[number, boolean]> = [],
      rows: Array<[number, boolean]> = [];
    for (let n = n0, x = (n0 * step + cam.x) * z; x <= W; n++, x += step * z)
      cols.push([x, isMajor(n)]);
    for (let m = m0, y = (m0 * step + cam.y) * z; y <= H; m++, y += step * z)
      rows.push([y, isMajor(m)]);

    ctx.save();
    if (this.grid === "lines" || this.grid === "ruled") {
      for (const major of [false, true]) {
        ctx.beginPath();
        if (this.grid === "lines") {
          for (const [x, m] of cols)
            if (m === major) {
              const p = Math.round(x) + 0.5;
              ctx.moveTo(p, 0);
              ctx.lineTo(p, H);
            }
        }
        for (const [y, m] of rows)
          if (m === major) {
            const p = Math.round(y) + 0.5;
            ctx.moveTo(0, p);
            ctx.lineTo(W, p);
          }
        ctx.strokeStyle = major ? g.major : g.minor;
        ctx.globalAlpha = fade;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else if (this.grid === "crosses") {
      for (const major of [false, true]) {
        const arm = (major ? 4.5 : 3) * dpr;
        ctx.beginPath();
        for (const [y, my] of rows) {
          const py = Math.round(y) + 0.5;
          for (const [x, mx] of cols) {
            if ((mx && my) !== major) continue;
            const px = Math.round(x) + 0.5;
            ctx.moveTo(px - arm, py);
            ctx.lineTo(px + arm, py);
            ctx.moveTo(px, py - arm);
            ctx.lineTo(px, py + arm);
          }
        }
        ctx.strokeStyle = major ? g.major : g.minor;
        ctx.globalAlpha = fade;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else if (this.grid === "iso") {
      const s = Math.tan(Math.PI / 6);
      ctx.beginPath();
      for (const sign of [1, -1]) {
        const slope = sign * s;
        const b0 = -slope * cam.x + cam.y;
        const lo = Math.min(0, -slope * (W / z));
        const hi = Math.max(H / z, H / z - slope * (W / z));
        const k0 = Math.ceil((lo - b0) / step);
        const k1 = Math.floor((hi - b0) / step);
        for (let k = k0; k <= k1; k++) {
          const b = (b0 + k * step) * z;
          ctx.moveTo(0, b);
          ctx.lineTo(W, b + slope * W);
        }
      }
      ctx.strokeStyle = g.minor;
      ctx.globalAlpha = fade;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      const r = 1.6 * dpr;
      ctx.beginPath();
      for (const [y] of rows) {
        for (const [x] of cols) {
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = g.minor;
      ctx.globalAlpha = fade;
      ctx.fill();
    }
    ctx.restore();
  }

  render(): void {
    if (this._destroyed) return;
    if (this._pendingFit) {
      const { w: pw, h: ph } = this.viewSize();
      if (pw > 1 && ph > 1) {
        const fit = this._pendingFit;
        this._pendingFit = null;
        fit();
      }
    }
    const { w, h } = this.viewSize();
    const dpr = Math.min(2, (window as any).devicePixelRatio || 1);
    for (const c of [this.canvas, this.overlay]) {
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
    }
    const ctx = this.canvas.getContext("2d")!;
    this.renderScene(ctx, this.camera, w, h, { dpr, hideEditing: true });
    this._renderOverlayFn(w, h, dpr);
    this._renderCaptureFn();
    if (this.editing) this._layoutTextEditor();
  }

  _renderOverlayFn(w: number, h: number, dpr: number): void {
    const ctx = this.overlay.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.scale(dpr, dpr);
    const cam = this.camera;
    const t = this.theme;

    if (this.tool === "select" && this.selection.size && !this.editing) {
      const one =
        this.selection.size === 1
          ? (this.store.get([...this.selection][0]) as ShapeRecord | null)
          : null;
      ctx.strokeStyle = t.selection;
      ctx.fillStyle = (t as any).handleFill;
      ctx.lineWidth = 1.5;
      if (one && (one.type === "arrow" || one.type === "line")) {
        const pr: any = one.props;
        const hs = [
          this.pageToScreen(one.x, one.y),
          this.pageToScreen(one.x + pr.dx, one.y + pr.dy),
        ];
        const bm = bendMidpoint(pr);
        hs.push(this.pageToScreen(one.x + bm.x, one.y + bm.y));
        for (const p2 of hs) {
          ctx.beginPath();
          ctx.arc(p2.x, p2.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else {
        if (one && one.rot) {
          const lb = localBounds(one);
          const cx = one.x + lb.x + lb.w / 2;
          const cy = one.y + lb.y + lb.h / 2;
          ctx.beginPath();
          const corners = [
            [one.x + lb.x, one.y + lb.y],
            [one.x + lb.x + lb.w, one.y + lb.y],
            [one.x + lb.x + lb.w, one.y + lb.y + lb.h],
            [one.x + lb.x, one.y + lb.y + lb.h],
          ].map(([px, py]) => {
            const r = rotWith(px, py, cx, cy, one.rot);
            return this.pageToScreen(r.x, r.y);
          });
          ctx.moveTo(corners[0].x, corners[0].y);
          for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
          ctx.closePath();
          ctx.stroke();
        }
        const b = this.selectionBounds();
        if (b) {
          const tl = this.pageToScreen(b.x, b.y);
          const br = this.pageToScreen(b.x + b.w, b.y + b.h);
          if (!(one && one.rot))
            ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
          const rx = (tl.x + br.x) / 2;
          const ry = tl.y - 22;
          ctx.beginPath();
          ctx.moveTo(rx, tl.y);
          ctx.lineTo(rx, ry + 5);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(rx, ry, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (!(one && one.rot)) {
            for (const [hx, hy] of [
              [tl.x, tl.y],
              [br.x, tl.y],
              [tl.x, br.y],
              [br.x, br.y],
              [(tl.x + br.x) / 2, tl.y],
              [(tl.x + br.x) / 2, br.y],
              [tl.x, (tl.y + br.y) / 2],
              [br.x, (tl.y + br.y) / 2],
            ]) {
              ctx.beginPath();
              ctx.rect(hx - 4.5, hy - 4.5, 9, 9);
              ctx.fill();
              ctx.stroke();
            }
          }
        }
      }
    }

    if (this.session?.type === "marquee" && this.session.rect) {
      const r = this.session.rect;
      const tl = this.pageToScreen(r.x, r.y);
      ctx.fillStyle = (t as any).selectionFill;
      ctx.strokeStyle = t.selection;
      ctx.lineWidth = 1;
      ctx.fillRect(tl.x, tl.y, r.w * cam.z, r.h * cam.z);
      ctx.strokeRect(tl.x, tl.y, r.w * cam.z, r.h * cam.z);
    }

    if (this.session?.type === "erasing" && this.session.trail.length > 2) {
      ctx.strokeStyle =
        t.id === "dark" ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const tr = this.session.trail;
      for (let i = 0; i < tr.length; i += 2) {
        const sp = this.pageToScreen(tr[i], tr[i + 1]);
        i === 0 ? ctx.moveTo(sp.x, sp.y) : ctx.lineTo(sp.x, sp.y);
      }
      ctx.stroke();
    }

    const remoteAlive =
      this.remoteScribbles.length &&
      performance.now() - this.remoteScribblesAt < 2500;
    const all = [
      ...this.scribbles,
      ...(remoteAlive ? this.remoteScribbles : []),
    ];
    for (const sc of all) {
      const pts = sc.points || [];
      if (pts.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const sp = this.pageToScreen(pts[i].x, pts[i].y);
        i === 0 ? ctx.moveTo(sp.x, sp.y) : ctx.lineTo(sp.x, sp.y);
      }
      ctx.strokeStyle = t.scribble;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = t.scribble;
      ctx.shadowBlur = 9;
      ctx.globalAlpha = sc.opacity ?? 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  setCaptureCanvas(canvas: HTMLCanvasElement | null): void {
    this.captureCanvas = canvas;
    if (canvas) this.requestRender();
  }
  renderCaptureTick(): void {
    this._renderCaptureFn();
  }
  _renderCaptureFn(): void {
    const c = this.captureCanvas;
    if (!c) return;
    if (this.captureGate && !this.captureGate()) return;
    const { w, h } = this.viewSize();
    if (!w || !h) return;
    const cam = this.camera;
    const vp = { x: -cam.x, y: -cam.y, w: w / cam.z, h: h / cam.z };
    const z2 = Math.min(c.width / vp.w, c.height / vp.h);
    const cam2: Camera = {
      z: z2,
      x: c.width / 2 / z2 - (vp.x + vp.w / 2),
      y: c.height / 2 / z2 - (vp.y + vp.h / 2),
    };
    const ctx = c.getContext("2d", { alpha: false, desynchronized: true })!;
    this.renderScene(ctx, cam2, c.width, c.height, { dpr: 1 });
    const remoteAlive =
      this.remoteScribbles.length &&
      performance.now() - this.remoteScribblesAt < 2500;
    if (remoteAlive || this.scribbles.length) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const sc of [
        ...this.scribbles,
        ...(remoteAlive ? this.remoteScribbles : []),
      ]) {
        const pts = sc.points || [];
        if (pts.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const x = (pts[i].x + cam2.x) * cam2.z;
          const y = (pts[i].y + cam2.y) * cam2.z;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = this.theme.scribble;
        ctx.lineWidth = 3.5 * (z2 / cam.z);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = this.theme.scribble;
        ctx.shadowBlur = 9;
        ctx.globalAlpha = sc.opacity ?? 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
    }
  }

  destroy(): void {
    this._destroyed = true;
    this._commitText();
    this._themeFade?.remove();
    this._themeFade = null;
    cancelAnimationFrame(this._raf);
    cancelAnimationFrame(this._camAnim);
    cancelAnimationFrame(this._fitEaseRaf || 0);
    cancelAnimationFrame(this._laserRaf || 0);
    this._unsubStore();
    this._unsubHistory();
    this._ro.disconnect();
    const c = this.container;
    c.removeEventListener("pointerdown", this._onDown);
    c.removeEventListener("pointermove", this._onMove);
    c.removeEventListener("pointerup", this._onUp);
    c.removeEventListener("pointercancel", this._onUp);
    c.removeEventListener("wheel", this._onWheel);
    c.removeEventListener("keydown", this._onKeyDown);
    c.removeEventListener("keyup", this._onKeyUp);
    c.removeEventListener("dblclick", this._onDblClick);
    c.removeEventListener("drop", this._onDrop);
    c.removeEventListener("dragover", this._onDragOver);
    c.removeEventListener("paste", this._onPaste);
    c.removeEventListener("blur", this._onBlur);
    this.canvas.remove();
    this.overlay.remove();
    c.classList.remove("ic-root");
  }
}

async function readImage(
  blob: Blob,
): Promise<{ src: string; w: number; h: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = url;
    });
    let { width: w, height: h } = img;
    const MAX = 2048;
    const k = Math.min(1, MAX / Math.max(w, h));
    if (k < 1 || blob.type === "image/heic") {
      const c = document.createElement("canvas");
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const isPhoto = blob.type === "image/jpeg" || blob.size > 600_000;
      return {
        src: c.toDataURL(isPhoto ? "image/jpeg" : "image/png", 0.85),
        w: c.width,
        h: c.height,
      };
    }
    const src = await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.readAsDataURL(blob);
    });
    return { src, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
