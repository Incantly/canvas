import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { StarHistoryPayload } from '../../src/types/index.js'

const EMPTY: StarHistoryPayload = {
  stars: 0,
  createdAt: null,
  starredAt: [],
  generatedAt: null,
}

export function readStarHistory(): StarHistoryPayload {
  const path = fileURLToPath(new URL('../../../../docs/star-history.json', import.meta.url))
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<StarHistoryPayload> & {
      stars?: unknown
      createdAt?: unknown
      starredAt?: unknown
      generatedAt?: unknown
    }
    return {
      stars: typeof data.stars === 'number' ? data.stars : 0,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : null,
      starredAt: Array.isArray(data.starredAt) ? (data.starredAt as string[]) : [],
      generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : null,
    }
  } catch (err) {
    const e = err as { code?: string; message?: string }
    console.warn(
      `[star-history] no snapshot at docs/star-history.json (${e.code ?? e.message}) — ` +
        'the chart will fill in from the browser. Run `npm run star-history` to seed it.',
    )
    return EMPTY
  }
}
