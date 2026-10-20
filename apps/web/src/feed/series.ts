import type { AggregateRow, EpochMillis, RangeWindow, Resolution, Sample, Stat } from "@riptide/domain"

// Chart series for the history section: aggregate rows from `useHistory` plus
// a live tail of samples newer than the window's `to`, both bucketed at the
// window's resolution so every series has one point per minute or hour.

/** Bucket length of each {@link Resolution}, in ms. */
export const resolutionMs = { minute: 60_000, hour: 3_600_000 } as const satisfies Record<Resolution, number>

/** GPU readings that are charted. */
export type GpuField = "utilization" | "memory" | "temperature"

/** Identifies one charted reading, the same for aggregate rows and samples. */
export type MetricId =
  | "cpu"
  | "memory"
  | "load1"
  | `temp/${string}/${string}`
  | `fan/${string}/${string}`
  | `disk/${string}`
  | `gpu/${number}/${GpuField}`

/** Builders for {@link MetricId}. */
export const metricId = {
  temp: (chip: string, label: string): MetricId => `temp/${chip}/${label}`,
  fan: (chip: string, label: string): MetricId => `fan/${chip}/${label}`,
  disk: (mount: string): MetricId => `disk/${mount}`,
  gpu: (index: number, field: GpuField): MetricId => `gpu/${index}/${field}`,
}

/** One bucket: its start, how many samples it holds and the min/avg/max of each metric. */
export interface SeriesPoint {
  readonly at: EpochMillis
  readonly count: number
  readonly stats: ReadonlyMap<MetricId, Stat>
}

/** What the charts draw: points oldest first, inside the visible `[from, to)`. */
export interface Series {
  readonly resolution: Resolution
  readonly from: EpochMillis
  readonly to: EpochMillis
  readonly points: ReadonlyArray<SeriesPoint>
}

/**
 * Live samples at or after `window.to`, folded into buckets as they arrive.
 * Bounded to one range span of buckets, so a page left open never grows it.
 */
export interface LiveTail {
  readonly host: string
  readonly window: RangeWindow
  /** Newest sample folded in. Samples at or before it are ignored. */
  readonly newestAt: EpochMillis | null
  readonly points: ReadonlyArray<SeriesPoint>
}

const rowStats = (row: AggregateRow): ReadonlyMap<MetricId, Stat> =>
  new Map<MetricId, Stat>([
    ["cpu", row.cpu.total],
    ["memory", row.memory.used],
    ["load1", row.system.load1],
    ...row.sensors.temps.map(({ chip, label, celsius }) => [metricId.temp(chip, label), celsius] as const),
    ...row.sensors.fans.map(({ chip, label, rpm }) => [metricId.fan(chip, label), rpm] as const),
    ...row.disks.map(({ mount, used }) => [metricId.disk(mount), used] as const),
    ...row.gpus.flatMap((gpu) => [
      [metricId.gpu(gpu.index, "utilization"), gpu.utilization] as const,
      [metricId.gpu(gpu.index, "memory"), gpu.memoryUsed] as const,
      ...(gpu.temperature === undefined ? [] : [[metricId.gpu(gpu.index, "temperature"), gpu.temperature] as const]),
    ]),
  ])

const exact = (value: number): Stat => ({ min: value, avg: value, max: value })

const sampleStats = (sample: Sample): ReadonlyMap<MetricId, Stat> =>
  new Map<MetricId, Stat>([
    ["cpu", exact(sample.cpu.totalPct)],
    ["memory", exact(sample.memory.usedBytes)],
    ["load1", exact(sample.host.load1)],
    ...sample.sensors.temps.map(({ chip, label, celsius }) => [metricId.temp(chip, label), exact(celsius)] as const),
    ...sample.sensors.fans.map(({ chip, label, rpm }) => [metricId.fan(chip, label), exact(rpm)] as const),
    ...sample.disks.map(({ mount, usedBytes }) => [metricId.disk(mount), exact(usedBytes)] as const),
    ...sample.gpus.flatMap((gpu) => [
      [metricId.gpu(gpu.index, "utilization"), exact(gpu.utilizationPct)] as const,
      [metricId.gpu(gpu.index, "memory"), exact(gpu.memoryUsedBytes)] as const,
      ...(gpu.temperatureCelsius === undefined
        ? []
        : [[metricId.gpu(gpu.index, "temperature"), exact(gpu.temperatureCelsius)] as const]),
    ]),
  ])

/** Folds two points of the same bucket: outer min/max, count-weighted avg. */
const combine = (a: SeriesPoint, b: SeriesPoint): SeriesPoint => {
  const count = a.count + b.count
  const weight = count === 0 ? 0.5 : a.count / count
  const stats = new Map(a.stats)
  for (const [id, next] of b.stats) {
    const prev = stats.get(id)
    stats.set(
      id,
      prev === undefined
        ? next
        : {
            min: Math.min(prev.min, next.min),
            avg: prev.avg * weight + next.avg * (1 - weight),
            max: Math.max(prev.max, next.max),
          },
    )
  }
  return { at: a.at, count, stats }
}

const bucketOf = (at: EpochMillis, resolution: Resolution): EpochMillis =>
  Math.floor(at / resolutionMs[resolution]) * resolutionMs[resolution]

const spanOf = (window: RangeWindow) => window.to - window.from

const sameWindow = (a: RangeWindow, b: RangeWindow) =>
  a.from === b.from && a.to === b.to && a.resolution === b.resolution

/** An empty tail for `host` and `window`. */
export const emptyTail = (host: string, window: RangeWindow): LiveTail => ({ host, window, newestAt: null, points: [] })

/** `tail` if it belongs to `host` and `window`, else a fresh one. A host or range switch starts over. */
export const tailFor = (tail: LiveTail, host: string, window: RangeWindow): LiveTail =>
  tail.host === host && sameWindow(tail.window, window) ? tail : emptyTail(host, window)

/**
 * Folds one live sample into the tail. Samples before `window.to` are covered
 * by history and ignored, a sample at exactly `to` is the tail's first.
 * Samples at or before the newest one seen (duplicates, late arrivals) are
 * ignored, so the same sample can be offered on every render. Buckets older
 * than one span before the newest are dropped. Returns `tail` itself when
 * nothing changed.
 */
export const appendSample = (tail: LiveTail, sample: Sample): LiveTail => {
  const { window } = tail
  if (sample.at < window.to || (tail.newestAt !== null && sample.at <= tail.newestAt)) return tail

  const point: SeriesPoint = { at: bucketOf(sample.at, window.resolution), count: 1, stats: sampleStats(sample) }
  const last = tail.points.at(-1)
  const points =
    last?.at === point.at ? [...tail.points.slice(0, -1), combine(last, point)] : [...tail.points, point]
  const oldest = point.at + resolutionMs[window.resolution] - spanOf(window)

  return { ...tail, newestAt: sample.at, points: points.filter(({ at }) => at >= oldest) }
}

/**
 * Merges history rows with the live tail into one series.
 *
 * - Rows of another host or outside the tail's `[from, to)` are ignored.
 * - A tail bucket that shares its start with a row (the partial hour at `to`
 *   for 7d/30d) is combined with it, so each bucket appears once.
 * - The visible window is one span ending at the later of `to` and the end of
 *   the newest tail bucket. Older points are trimmed, so the chart slides as
 *   the tail grows.
 */
export const mergeSeries = (history: ReadonlyArray<AggregateRow>, tail: LiveTail): Series => {
  const { window } = tail
  const buckets = new Map<EpochMillis, SeriesPoint>()
  const add = (point: SeriesPoint) => {
    const prev = buckets.get(point.at)
    buckets.set(point.at, prev === undefined ? point : combine(prev, point))
  }

  for (const row of history) {
    if (row.host === tail.host && row.at >= window.from && row.at < window.to) {
      add({ at: row.at, count: row.count, stats: rowStats(row) })
    }
  }
  for (const point of tail.points) add(point)

  const newest = tail.points.at(-1)
  const to = Math.max(window.to, newest === undefined ? 0 : newest.at + resolutionMs[window.resolution])
  const from = to - spanOf(window)
  const points = [...buckets.values()].filter(({ at }) => at >= from).sort((a, b) => a.at - b.at)

  return { resolution: window.resolution, from, to, points }
}

/** One chart point: a band from min to max and the average line. `null` breaks the line over a gap. */
export interface BandPoint {
  readonly at: EpochMillis
  readonly avg: number | null
  readonly band: readonly [number, number] | null
}

/**
 * The `id` metric of `series` as band points. A missing bucket (host offline,
 * metric absent) becomes a `null` point so the chart shows a gap instead of
 * interpolating across it.
 */
export const bandPoints = (series: Series, id: MetricId): ReadonlyArray<BandPoint> => {
  const step = resolutionMs[series.resolution]
  const out: Array<BandPoint> = []
  for (const { at, stats } of series.points) {
    const stat = stats.get(id)
    if (stat === undefined) continue
    const prev = out.at(-1)
    if (prev !== undefined && at - prev.at > step) out.push({ at: prev.at + step, avg: null, band: null })
    out.push({ at, avg: stat.avg, band: [stat.min, stat.max] })
  }
  return out
}
