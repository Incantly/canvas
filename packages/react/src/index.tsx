/**
 * Compatibility entry point. React UI stays canvas-only here so adding the document
 * editor never makes existing Canvas consumers load Tiptap/ProseMirror.
 */
export * from '@incantly/canvas'
export { Canvas, useCanvasStore } from './canvas/index.js'
export type { CanvasProps, CanvasRef } from './types/index.js'
