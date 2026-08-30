import type { Diff, BoardRecord } from '../types/index.js'

export const emptyDiff = (): Diff => ({
  added: Object.create(null),
  removed: Object.create(null),
  updated: Object.create(null),
})

export const isDiffEmpty = (d: Diff | null | undefined): boolean =>
  !d ||
  (Object.keys(d.added).length === 0 &&
    Object.keys(d.removed).length === 0 &&
    Object.keys(d.updated).length === 0)

export const invertDiff = (d: Diff): Diff => ({
  added: { ...d.removed },
  removed: { ...d.added },
  updated: Object.fromEntries(
    Object.entries(d.updated).map(([id, [from, to]]) => [id, [to, from] as [BoardRecord, BoardRecord]])
  ),
})

export const composeDiff = (a: Diff, b: Diff): Diff => {
  const out: Diff = {
    added: { ...a.added },
    removed: { ...a.removed },
    updated: { ...a.updated },
  }
  for (const [id, rec] of Object.entries(b.added)) {
    if (out.removed[id]) {
      const before = out.removed[id]
      delete out.removed[id]
      out.updated[id] = [before, rec] as [BoardRecord, BoardRecord]
    } else out.added[id] = rec
  }
  for (const [id, [from, to]] of Object.entries(b.updated)) {
    if (out.added[id]) out.added[id] = to
    else if (out.updated[id])
      out.updated[id] = [out.updated[id][0], to] as [BoardRecord, BoardRecord]
    else out.updated[id] = [from, to]
  }
  for (const [id, rec] of Object.entries(b.removed)) {
    if (out.added[id]) delete out.added[id]
    else if (out.updated[id]) {
      out.removed[id] = out.updated[id][0]
      delete out.updated[id]
    } else out.removed[id] = rec
  }
  return out
}
