import { describe, expect, it } from 'vitest'
import { sanitizeInkPens } from '@incantly/canvas/headless'
import { resolveInkBarItems } from '../src/ink/ink-bar-config.js'

describe('resolveInkBarItems', () => {
  it('lists type, pens, and eraser with icon/name overrides', () => {
    const pens = sanitizeInkPens([
      { id: 'draw', name: 'Pen', style: { kind: 'draw' } },
      { id: 'pencil', name: 'Pencil', style: { kind: 'draw', pressureWidth: true } },
    ])
    const items = resolveInkBarItems(pens, {
      select: { name: 'Text' },
      draw: { hidden: true },
      pencil: { name: 'Graphite' },
      eraser: { name: 'Rub' },
    })
    expect(items.map((i) => i.id)).toEqual(['type', 'select', 'pencil', 'eraser', 'line', 'arrow', 'geo'])
    expect(items.find((i) => i.id === 'select')?.name).toBe('Text')
    expect(items.find((i) => i.id === 'pencil')?.name).toBe('Graphite')
    expect(items.find((i) => i.id === 'eraser')?.name).toBe('Rub')
  })

  it('notes mode lists type then cursor before pens', () => {
    const pens = sanitizeInkPens([{ id: 'draw', name: 'Pen', style: { kind: 'draw' } }])
    const items = resolveInkBarItems(pens, undefined, 'notes')
    expect(items.map((i) => i.id).slice(0, 4)).toEqual(['type', 'select', 'draw', 'eraser'])
    expect(items.find((i) => i.id === 'select')?.name).toBe('Cursor')
    expect(items.find((i) => i.id === 'type')?.name).toBe('Type')
  })

  it('board mode prepends hand/select and appends text', () => {
    const pens = sanitizeInkPens([{ id: 'draw', name: 'Pen', style: { kind: 'draw' } }])
    const items = resolveInkBarItems(pens, undefined, 'board')
    expect(items.map((i) => i.id)).toEqual([
      'hand',
      'select',
      'draw',
      'eraser',
      'line',
      'arrow',
      'geo',
      'text',
    ])
    expect(items.find((i) => i.id === 'select')?.name).toBe('Cursor')
  })
})
