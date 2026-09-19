export { createMutex, type Mutex } from "./async/mutex.js";
export { createSerialQueue, type SerialQueue } from "./async/serial-queue.js";
export { debounce, type DebouncedFn } from "./async/debounce.js";
export { snapshotFingerprint } from "./snapshot/fingerprint.js";
export {
  safeParseSnapshot,
  type ParseSnapshotResult,
  type ParseSnapshotError,
} from "./snapshot/parse-json.js";
export {
  shouldAppendPoint,
  DEFAULT_INK_MIN_DIST,
  type Point2,
  type Point3,
} from "./ink/point-filter.js";
export { strokeBoundsHeight } from "./ink/stroke-bounds.js";
export { hitDocumentStroke, removeDocumentStroke } from "./ink/hit-stroke.js";
export {
  splitStrokeByEraser,
  strokePointsBounds,
  eraseCirclesHitBounds,
  strokeEraseLength,
  isErasureFragment,
  hitEraseStroke,
  erasedPointRanges,
  mergeEraseRanges,
  keptPointRuns,
  slicePackedRuns,
  ERASE_FRAGMENT_DIAMETER_RATIO,
  type EraseCircle,
  type StrokeBounds,
} from "./ink/erase.js";
export {
  flattenStrokeXy,
  simplifyPackedStrokePts,
  svgPathFromPackedPts,
  svgRibbonFromPackedPts,
  appendPackedStrokePoint,
  STROKE_POINT_SOFT_CAP,
} from "./ink/stroke-path.js";
export {
  interpolateGapPoints,
  extendLivePath,
  extendLivePathMany,
  LIVE_GAP_MAX_POINTS,
  type LiveGapPoint,
} from "./ink/live-stroke.js";
export {
  DEFAULT_INK_PENS,
  sanitizeInkPenId,
  sanitizeInkPenStyle,
  sanitizeInkPens,
  resolveInkPen,
  isInkPenTool,
  isInkCapturingTool,
  isReservedInkChromeId,
  inkBaseWidthPaper,
  inkWidthAtPressure,
  inkStrokeOpacity,
  sanitizeInkWidth,
  widthSliderToPaper,
  paperToWidthSlider,
  inkOutlineWidthPaper,
  sanitizeEraserMode,
  sanitizeEraserRadius,
  INK_WIDTH_MIN_PAPER,
  INK_WIDTH_MAX_PAPER,
  INK_WIDTH_SLIDER_MIN,
  INK_WIDTH_SLIDER_MAX,
  INK_WIDTH_HARD_MIN,
  INK_WIDTH_HARD_MAX,
  DEFAULT_ERASER_RADIUS_PAPER,
  ERASER_RADIUS_MIN_PAPER,
  ERASER_RADIUS_MAX_PAPER,
  type InkPenDefinition,
  type InkPenStyle,
  type InkStrokeCap,
  type EraserMode,
} from "./ink/ink-pen.js";
export { documentBlocksFingerprint } from "./document/block-fingerprint.js";
export {
  findLastDrawingBlockIndex,
  replaceBlockAt,
  insertBlockAfter,
} from "./document/block-index.js";
export { createLruCache, type LruCache } from "./cache/lru.js";
export {
  createSubscriptionBag,
  type SubscriptionBag,
} from "./dispose/subscription-bag.js";
export { cloneJson } from "./clone-json.js";
export {
  NOTE_W,
  localBounds,
  pageBounds,
  toLocal,
  hitShape,
  sampleLinePts,
  marqueeHits,
  hitTopShape,
  isShapeCreateTool,
  isCursorTool,
  isTypeTool,
} from "./shapes/hit.js";
export {
  TEXT_SHAPE_MAX_CHARS,
  DEFAULT_TEXT_BOX_W,
  DEFAULT_TEXT_BOX_H,
  clampTextPlain,
  isTinyLineish,
  isTinyGeo,
  geoFromDrag,
  packedPtsToDrawLocal,
  sanitizeGeoId,
  createLineishShape,
  createGeoShape,
  createTextShape,
  createDrawShape,
} from "./shapes/create.js";
export { shapeRenderable, parentPageExists, canPutShape, isGeoId } from "./shapes/validate.js";
export {
  CAMERA_ZOOM_MIN,
  CAMERA_ZOOM_MAX,
  DEFAULT_CAMERA,
  clampCameraZoom,
  sanitizeCamera,
  screenToPage,
  pageToScreen,
  panCamera,
  zoomAt,
  pinchCamera,
} from "./shapes/camera.js";
export { geoSvgPath, lineSvgPath, arrowHeadPath, strokeDashArray } from "./shapes/svg-path.js";
export {
  MINIMAP_PAD,
  cameraViewport,
  shapesContentBounds,
  minimapWorld,
  fitMinimap,
  worldToMini,
  miniToWorld,
  cameraToCenter,
  resizeBox,
  hitResizeCorner,
  paperVisibleRect,
  type MinimapLayout,
  type ResizeCorner,
} from "./shapes/minimap.js";
