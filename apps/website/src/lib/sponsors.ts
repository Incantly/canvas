import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Sponsor, SponsorSnapshot, SponsorSnapshotRow } from '../../src/types/index.js'

export const SPONSOR_URL = 'https://github.com/sponsors/quickdrawjs'

export const OVERRIDES: Record<string, Partial<Sponsor>> = {}

function readSnapshot(): SponsorSnapshotRow[] {
  const path = fileURLToPath(new URL('../../../../docs/sponsors.json', import.meta.url))
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as SponsorSnapshot
    return Array.isArray(data.sponsors) ? data.sponsors : []
  } catch {
    return []
  }
}

export function sponsors(): Sponsor[] {
  return readSnapshot()
    .slice()
    .sort(
      (a, b) =>
        (b.monthly ?? 0) - (a.monthly ?? 0) ||
        (a.since ?? '').localeCompare(b.since ?? ''),
    )
    .map((s) => ({
      name: s.name || s.login || 'Anonymous',
      url: s.url || `https://github.com/${s.login}`,
      avatar: s.avatar || null,
      logo: null,
      monthly: s.monthly ?? 0,
      ...OVERRIDES[s.login || ''],
    }))
}
