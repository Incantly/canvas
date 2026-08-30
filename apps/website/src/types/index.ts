export interface Sponsor {
  name: string
  url: string
  avatar: string | null
  logo: string | null
  monthly: number
  [key: string]: any
}

export interface SponsorSnapshotRow {
  name?: string
  login?: string
  url?: string
  avatar?: string
  monthly?: number
  since?: string
  [key: string]: any
}

export interface SponsorSnapshot {
  sponsors?: SponsorSnapshotRow[]
  [key: string]: any
}

export interface StarHistoryPayload {
  stars: number
  createdAt: string | null
  starredAt: string[]
  generatedAt: string | null
}

export interface ChartView {
  w: number
  h: number
  padL: number
  padR: number
  padT: number
  padB: number
}

export interface ChartYTick {
  v: number
  y: number
}

export interface ChartXTick {
  label: string
  x: number
}

export interface StarChartResult {
  line: string
  area: string
  yTicks: ChartYTick[]
  xTicks: ChartXTick[]
  last: { x: number; y: number }
  total: number
}

export interface BuildStarChartOptions {
  createdAt?: string
  now?: number
  total?: number
  view?: Partial<ChartView>
}

export type JsonFetcher = <T = any>(url: string) => Promise<T>
