// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRef, StrictMode } from 'react'
import { render, act, cleanup } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { Canvas, useCanvasStore, Store, newId } from '../src/index.js'

const rect = (id) => ({
  id, typeName: 'shape', type: 'geo', x: 0, y: 0, rot: 0, z: 1,
  props: { geo: 'rectangle', w: 50, h: 50, color: 'blue', size: 'm', dash: 'solid', fill: 'none', font: 'draw' },
})

describe('<Canvas />', () => {
  it('mounts an editor with toolbar and cleans up on unmount', () => {
    const onMount = vi.fn()
    const { container, unmount } = render(<Canvas onMount={onMount} />)
    expect(onMount).toHaveBeenCalledTimes(1)
    const [editor, ui] = onMount.mock.calls[0]
    expect(editor.tool).toBe('draw')
    expect(ui.setHidden).toBeTypeOf('function')
    expect(container.querySelectorAll('canvas').length).toBe(2)
    expect(container.querySelector('.ic-dock, .qd-dock')).toBeTruthy()
    unmount()
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('fires onChange with diffs and onSelectionChange with ids', () => {
    const onChange = vi.fn()
    const onSelectionChange = vi.fn()
    let editor
    render(
      <Canvas
        onMount={(e) => { editor = e }}
        onChange={onChange}
        onSelectionChange={onSelectionChange}
      />
    )
    act(() => {
      editor.store.put({ ...rect(newId()), parentId: editor.currentPageId })
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    const [diff, source] = onChange.mock.calls[0]
    expect(source).toBe('user')
    expect(Object.keys(diff.added).length).toBe(1)

    act(() => editor.selectAll())
    expect(onSelectionChange).toHaveBeenCalled()
    expect(onSelectionChange.mock.calls.at(-1)[0].length).toBe(1)
  })

  it('loads a snapshot on mount', () => {
    const snap = { document: { store: { r1: rect('r1') } } }
    let editor
    render(<Canvas snapshot={snap} onMount={(e) => { editor = e }} />)
    expect(editor.store.shapes().length).toBe(1)
    expect(editor.store.pages().length).toBe(1)
    expect(editor.store.get('r1').props.color).toBe('blue')
    expect(editor.store.canUndo).toBe(false)
  })

  it('renders an external store and live-switches theme/readonly props', () => {
    const store = new Store()
    store.put({ ...rect('r1'), parentId: store.normalizePages('remote') }, 'remote')
    const ref = createRef()
    const { rerender, container } = render(
      <Canvas ref={ref} store={store} theme="light" />
    )
    expect(ref.current.editor.store).toBe(store)
    expect(ref.current.editor.theme.id).toBe('light')

    rerender(<Canvas ref={ref} store={store} theme="dark" readonly />)
    expect(ref.current.editor.theme.id).toBe('dark')
    expect(ref.current.editor.readonly).toBe(true)
    const ui = container.querySelector('.ic-ui, .qd-ui')
    expect(ui?.classList.contains('ic-hidden') || ui?.classList.contains('qd-hidden')).toBe(true)

    rerender(<Canvas ref={ref} store={store} theme="dark" />)
    expect(ref.current.editor.readonly).toBe(false)
    const ui2 = container.querySelector('.ic-ui, .qd-ui')
    expect(ui2?.classList.contains('ic-hidden') || ui2?.classList.contains('qd-hidden')).toBe(false)
  })

  it('drives the grid prop and reports in-board switches back', () => {
    const onThemeChange = vi.fn()
    const onGridChange = vi.fn()
    const ref = createRef()
    const { rerender, container } = render(
      <Canvas ref={ref} grid="lines" onThemeChange={onThemeChange} onGridChange={onGridChange} />
    )
    expect(ref.current.editor.grid).toBe('lines')

    rerender(
      <Canvas ref={ref} grid="dots" onThemeChange={onThemeChange} onGridChange={onGridChange} />
    )
    expect(ref.current.editor.grid).toBe('dots')
    expect(onGridChange).toHaveBeenCalledWith('dots', ref.current.editor)

    // the board menu's own switches report back so host state can follow
    act(() => {
      container.querySelector('.ic-dock button[data-name="menu"], .qd-dock button[data-name="menu"]').click()
    })
    const themeBtns = [...container.querySelectorAll('.ic-menu-row, .qd-menu-row')]
      .find((r) => r.textContent.trim().startsWith('Theme'))
      .querySelectorAll('.ic-seg-btn, .qd-seg-btn')
    act(() => { themeBtns[1].click() })
    expect(onThemeChange).toHaveBeenCalledWith('dark', ref.current.editor)
    expect(
      container.firstChild.dataset.icTheme || container.firstChild.dataset.qdTheme
    ).toBe('dark')
  })

  it('two components sharing one store see the same document', () => {
    const store = new Store()
    const a = createRef(), b = createRef()
    render(
      <div>
        <Canvas ref={a} store={store} />
        <Canvas ref={b} store={store} readonly />
      </div>
    )
    act(() => {
      a.current.editor.store.put({ ...rect('shared'), parentId: a.current.editor.currentPageId })
    })
    expect(b.current.editor.store.get('shared')).toBeTruthy()
  })

  it('useCanvasStore keeps a stable, optionally-seeded store', () => {
    let store1, store2
    function Probe() {
      const s = useCanvasStore({ document: { store: { r1: rect('r1') } } })
      store1 ||= s
      store2 = s
      return null
    }
    const { rerender } = render(<Probe />)
    rerender(<Probe />)
    expect(store1).toBe(store2)
    expect(store1.shapes().length).toBe(1)
    expect(store1.pages().length).toBe(1)
  })

  it('exposes safe snapshot methods and keeps initialization-only props stable', () => {
    const ref = createRef()
    const { rerender } = render(<Canvas ref={ref} initialCamera={{ x: 1, y: 2, z: 1 }} />)
    expect(ref.current.getSnapshot()).toBeTruthy()
    const editor = ref.current.editor
    rerender(<Canvas ref={ref} initialCamera={{ x: 9, y: 9, z: 2 }} />)
    expect(ref.current.editor).toBe(editor)
    expect(ref.current.editor.camera).toEqual({ x: 1, y: 2, z: 1 })
  })

  it('survives the Strict Mode mount-cleanup-mount lifecycle', () => {
    const onMount = vi.fn()
    const { container } = render(<StrictMode><Canvas onMount={onMount} /></StrictMode>)
    expect(onMount).toHaveBeenCalledTimes(2)
    expect(container.querySelectorAll('canvas')).toHaveLength(2)
    expect(container.querySelectorAll('.ic-ui')).toHaveLength(1)
  })

  it('renders an inert host during SSR without touching the DOM', () => {
    expect(() => renderToString(<Canvas className="server-canvas" />)).not.toThrow()
    expect(renderToString(<Canvas className="server-canvas" />)).toContain('server-canvas')
  })

  it('gives stock toolbar controls accessible names and states', () => {
    const { container } = render(<Canvas />)
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('.ic-ui button')]
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.every((button) => Boolean(button.getAttribute('aria-label') || button.textContent?.trim()))).toBe(true)
    const tool = container.querySelector<HTMLButtonElement>('.ic-dock button[data-name="draw"]')
    expect(tool?.getAttribute('aria-pressed')).toBe('true')
  })

  afterEach(cleanup)
})
