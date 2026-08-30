import type {
  ChartView,
  ChartYTick,
  ChartXTick,
  StarChartResult,
  BuildStarChartOptions,
} from '../../src/types/index.js'

export const VIEW: ChartView = { w: 720, h: 260, padL: 46, padR: 20, padT: 20, padB: 34 }

const DAY = 86400000

function niceMax(n: number): number {
  if (n <= 5) return 5
  const mag = 10 ** Math.floor(Math.log10(n))
  const step = [1, 2, 2.5, 5, 10].find((s) => n <= s * mag) ?? 10
  return step * mag
}

function fmtDate(ms: number, spanDays: number): string {
  const d = new Date(ms)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  if (spanDays > 120) return `${month} ${d.getUTCFullYear()}`
  return `${month} ${d.getUTCDate()}`
}

export function buildStarChart(
  times: string[] | undefined,
  opts: BuildStarChartOptions = {},
): StarChartResult | null {
  const stamps = (times || [])
    .map((t) => Date.parse(t))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
  if (!stamps.length) return null

  const now = opts.now ?? stamps[stamps.length - 1]
  const total = Math.max(opts.total ?? 0, stamps.length)

  const created = Date.parse(opts.createdAt ?? '')
  const first = stamps[0]
  const zeroAt = Number.isFinite(created) && created < first ? created : first - DAY
  interface SeriesPt {
    t: number
    v: number
  }
  const pts: SeriesPt[] = [
    { t: zeroAt, v: 0 },
    ...stamps.map((t, i) => ({ t, v: i + 1 })),
  ]

  if (total > stamps.length) pts.push({ t: now, v: total })
  else if (now > stamps[stamps.length - 1]) pts.push({ t: now, v: stamps.length })

  const t0 = pts[0].t
  const t1 = Math.max(pts[pts.length - 1].t, t0 + DAY)
  const vMax = niceMax(total)

  const { w, h, padL, padR, padT, padB }: ChartView = { ...VIEW, ...opts.view }
  const plotW = w - padL - padR
  const plotH = h - padT - padB
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * plotW
  const y = (v: number) => padT + plotH - (v / vMax) * plotH

  const MAX_POINTS = 260
  const stride = Math.ceil(pts.length / MAX_POINTS)
  const drawn =
    stride > 1
      ? [...pts.filter((_, i) => i % stride === 0), pts[pts.length - 1]]
      : pts

  const coords: [number, number][] = drawn.map((p) => [
    +x(p.t).toFixed(1),
    +y(p.v).toFixed(1),
  ])
  const line = coords
    .map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`)
    .join(' ')
  const baseY = padT + plotH
  const area = `${line} L${coords[coords.length - 1][0]} ${baseY} L${coords[0][0]} ${baseY} Z`

  const yTicks: ChartYTick[] = [0, vMax / 2, vMax].map((v) => ({
    v,
    y: +y(v).toFixed(1),
  }))
  const spanDays = (t1 - t0) / DAY
  const xTicks: ChartXTick[] = [t0, (t0 + t1) / 2, t1].map((t) => ({
    label: fmtDate(t, spanDays),
    x: +x(t).toFixed(1),
  }))

  return {
    line,
    area,
    yTicks,
    xTicks,
    last: { x: coords[coords.length - 1][0], y: coords[coords.length - 1][1] },
    total,
  }
}
