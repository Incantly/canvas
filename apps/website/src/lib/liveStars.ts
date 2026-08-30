import type { JsonFetcher, StarHistoryPayload } from '../types/index.js'

const REPO = 'quickdrawjs/quickdraw'
const REPO_API = `https://api.github.com/repos/${REPO}`
const SNAPSHOT = `https://raw.githubusercontent.com/${REPO}/main/docs/star-history.json`
const COUNT_KEY = 'qd-star-count'
const HISTORY_KEY = 'qd-star-history'

const json: JsonFetcher = (url) =>
  fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))

function cached<T>(key: string, fetcher: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | undefined
  return () => {
    if (inflight) return inflight
    try {
      const hit = sessionStorage.getItem(key)
      if (hit) {
        inflight = Promise.resolve(JSON.parse(hit) as T)
        return inflight
      }
    } catch {}
    inflight = fetcher().then((value) => {
      try {
        sessionStorage.setItem(key, JSON.stringify(value))
      } catch {}
      return value
    })
    inflight.catch(() => {})
    return inflight
  }
}

export const loadStarCount: () => Promise<number> = cached(COUNT_KEY, () =>
  json<any>(REPO_API).then((repo) => (repo.stargazers_count as number) ?? 0),
)

export const loadStarHistory: () => Promise<StarHistoryPayload> = cached(HISTORY_KEY, () =>
  json<any>(SNAPSHOT).then((data) => ({
    stars: (data.stars as number) ?? 0,
    createdAt: (data.createdAt as string | null) ?? null,
    starredAt: Array.isArray(data.starredAt) ? (data.starredAt as string[]) : [],
    generatedAt: null,
  })),
)
