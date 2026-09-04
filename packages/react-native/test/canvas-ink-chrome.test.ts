/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderHook } from '@testing-library/react'
import {
  CanvasInkChromeContext,
  useCanvasInkChrome,
  type CanvasInkChromeContextValue,
} from '../src/ink/canvas-ink-chrome-context.js'

const mockChrome: CanvasInkChromeContextValue = {
  readonly: false,
  tool: 'draw',
  color: 'black',
  size: 'm',
  pens: [],
  mode: 'board',
  geoKind: 'rectangle',
  fill: 'none',
  showFill: false,
  onTool: () => {},
  onColor: () => {},
  onSize: () => {},
  onGeoKind: () => {},
  onFill: () => {},
}

describe('useCanvasInkChrome', () => {
  it('throws outside Canvas', () => {
    expect(() => renderHook(() => useCanvasInkChrome())).toThrow(
      /within <Canvas>/,
    )
  })

  it('returns chrome state inside provider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(CanvasInkChromeContext.Provider, { value: mockChrome }, children)
    const { result } = renderHook(() => useCanvasInkChrome(), { wrapper })
    expect(result.current.tool).toBe('draw')
    expect(result.current.mode).toBe('board')
  })
})
