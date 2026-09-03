export type SceneStatus = 'ready' | 'partial' | 'planned'

export interface PlaygroundScene {
  id: string
  title: string
  description: string
  workstream: string
  phase: string
  status: SceneStatus
  route: string
}

/** Scenes aligned with roadmap/17-native-rn-renderer.md workstreams. */
export const PLAYGROUND_SCENES: PlaygroundScene[] = [
  {
    id: 'headless',
    title: 'Headless store + utils',
    description: 'Store, migrations, snapshot fingerprint, safeParseSnapshot',
    workstream: 'W1',
    phase: 'Phase 0',
    status: 'ready',
    route: '/playground/headless',
  },
  {
    id: 'markdown',
    title: 'Markdown serialize',
    description: 'TextBlock ↔ markdown round-trip display',
    workstream: 'W2',
    phase: 'Phase 0',
    status: 'ready',
    route: '/playground/markdown',
  },
  {
    id: 'document',
    title: 'Document mode',
    description: 'Notes-style typing — toolbar H1/List/Bold, Return for new line',
    workstream: 'W3',
    phase: 'Phase 1',
    status: 'ready',
    route: '/playground/document',
  },
  {
    id: 'pages',
    title: 'Paper pages',
    description: 'Discrete sheets — A4/Letter, Rule/Grid/Dot, add/switch pages, zoom',
    workstream: '18',
    phase: 'Doc 18',
    status: 'ready',
    route: '/playground/pages',
  },
  {
    id: 'store-bridge',
    title: 'CanvasRef / undo',
    description: 'Imperative API: undo, redo, getSnapshot, setTool',
    workstream: 'W3',
    phase: 'Phase 1',
    status: 'ready',
    route: '/playground/store-bridge',
  },
  {
    id: 'storage',
    title: 'Persistence',
    description: 'AsyncStorage save/load via notebook persistence',
    workstream: 'W6',
    phase: 'Phase 4',
    status: 'ready',
    route: '/playground/storage',
  },
  {
    id: 'versions',
    title: 'Version history',
    description: 'SQLite checkpoints — save, list, revert, survives restart',
    workstream: 'W6',
    phase: 'Phase 4',
    status: 'ready',
    route: '/playground/versions',
  },
  {
    id: 'ink',
    title: 'Ink overlay (SVG)',
    description: 'Draw, highlighter, eraser on the full paper sheet',
    workstream: 'W4',
    phase: 'Phase 2',
    status: 'ready',
    route: '/playground/ink',
  },
  {
    id: 'shapes',
    title: 'Shapes (line/arrow/geo)',
    description: 'SVG line, arrow, and geo on the paper sheet',
    workstream: 'W5',
    phase: 'Phase 3',
    status: 'ready',
    route: '/playground/shapes',
  },
  {
    id: 'open-canvas',
    title: 'Open canvas',
    description: 'Infinite board — pan/pinch, movable text boxes, ink + shapes',
    workstream: 'W5',
    phase: 'Phase 3',
    status: 'ready',
    route: '/playground/open-canvas',
  },
]

export function sceneById(id: string): PlaygroundScene | undefined {
  return PLAYGROUND_SCENES.find((s) => s.id === id)
}
