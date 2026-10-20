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

/**
 * What one charted reading is: enough to label and scale its chart. Totals are
 * the latest known, so a reading that stopped reporting keeps its chart.
 */
export type Metric =
  | { readonly kind: "cpu" }
  | { readonly kind: "memory"; readonly totalBytes: number }
  | { readonly kind: "load1" }
  | { readonly kind: "temp"; readonly chip: string; readonly label: string }
  | { readonly kind: "fan"; readonly chip: string; readonly label: string }
  | { readonly kind: "disk"; readonly mount: string; readonly totalBytes: number }
  | { readonly kind: "gpu"; readonly index: number; readonly field: GpuField; readonly totalBytes?: number }

/** The {@link MetricId} of `metric`. */
export const idOf = (metric: Metric): MetricId => {
  switch (metric.kind) {
    case "cpu":
    case "memory":
    case "load1":
      return metric.kind
    case "temp":
      return metricId.temp(metric.chip, metric.label)
    case "fan":
      return metricId.fan(metric.chip, metric.label)
    case "disk":
      return metricId.disk(metric.mount)
    case "gpu":
      return metricId.gpu(metric.index, metric.field)
  }
}

/** One bucket: its start, the min/avg/max of each metric, and whether it misses samples. */
export interface SeriesPoint {
  readonly at: EpochMillis
  readonly stats: ReadonlyMap<MetricId, Stat>
  /** The first tail bucket: samples between `to` and mount are not in it. */
  readonly partial: boolean
}

/**
 * What the charts draw: points oldest first, inside the visible `[from, to)`,
 * and every metric with at least one visible point.
 */
export interface Series {
  readonly resolution: Resolution
  readonly from: EpochMillis
  readonly to: EpochMillis
  readonly points: ReadonlyArray<SeriesPoint>
  readonly metrics: ReadonlyMap<MetricId, Metric>
}

/** Running min/sum/max of one metric in a tail bucket, over the samples that reported it. */
interface Accumulator {
  readonly min: number
  readonly max: number
  readonly sum: number
  readonly count: number
}

/** One tail bucket, folded from live samples. */
interface TailBucket {
  readonly at: EpochMillis
  readonly values: ReadonlyMap<MetricId, Accumulator>
  readonly partial: boolean
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
  readonly buckets: ReadonlyArray<TailBucket>
  /** Every metric a folded sample reported, latest totals. */
  readonly metrics: ReadonlyMap<MetricId, Metric>
}

const rowEntries = (row: AggregateRow): ReadonlyArray<readonly [Metric, Stat]> => [
  [{ kind: "cpu" }, row.cpu.total],
  [{ kind: "memory", totalBytes: row.memory.total.max }, row.memory.used],
  [{ kind: "load1" }, row.system.load1],
  ...row.sensors.temps.map(({ chip, label, celsius }) => [{ kind: "temp", chip, label }, celsius] as const),
  ...row.sensors.fans.map(({ chip, label, rpm }) => [{ kind: "fan", chip, label }, rpm] as const),
  ...row.disks.map(({ mount, total, used }) => [{ kind: "disk", mount, totalBytes: total.max }, used] as const),
  ...row.gpus.flatMap((gpu): ReadonlyArray<readonly [Metric, Stat]> => [
    [{ kind: "gpu", index: gpu.index, field: "utilization" }, gpu.utilization],
    [{ kind: "gpu", index: gpu.index, field: "memory", totalBytes: gpu.memoryTotal.max }, gpu.memoryUsed],
    ...(gpu.temperature === undefined
      ? []
      : [[{ kind: "gpu", index: gpu.index, field: "temperature" }, gpu.temperature] as const]),
  ]),
]

/** Every charted reading of `sample` with its value. */
export const sampleEntries = (sample: Sample): ReadonlyArray<readonly [Metric, number]> => [
  [{ kind: "cpu" }, sample.cpu.totalPct],
  [{ kind: "memory", totalBytes: sample.memory.totalBytes }, sample.memory.usedBytes],
  [{ kind: "load1" }, sample.host.load1],
  ...sample.sensors.temps.map(({ chip, label, celsius }) => [{ kind: "temp", chip, label }, celsius] as const),
  ...sample.sensors.fans.map(({ chip, label, rpm }) => [{ kind: "fan", chip, label }, rpm] as const),
  ...sample.disks.map(({ mount, totalBytes, usedBytes }) => [{ kind: "disk", mount, totalBytes }, usedBytes] as const),
  ...sample.gpus.flatMap((gpu): ReadonlyArray<readonly [Metric, number]> => [
    [{ kind: "gpu", index: gpu.index, field: "utilization" }, gpu.utilizationPct],
    [{ kind: "gpu", index: gpu.index, field: "memory", totalBytes: gpu.memoryTotalBytes }, gpu.memoryUsedBytes],
    ...(gpu.temperatureCelsius === undefined
      ? []
      : [[{ kind: "gpu", index: gpu.index, field: "temperature" }, gpu.temperatureCelsius] as const]),
  ]),
]

/** Folds one sample's readings into a bucket's accumulators. Each metric counts only the samples that report it. */
const accumulate = (
  values: ReadonlyMap<MetricId, Accumulator>,
  entries: ReadonlyArray<readonly [Metric, number]>,
): ReadonlyMap<MetricId, Accumulator> => {
  const next = new Map(values)
  for (const [metric, value] of entries) {
    const id = idOf(metric)
    const prev = next.get(id)
    next.set(
      id,
      prev === undefined
        ? { min: value, max: value, sum: value, count: 1 }
        : { min: Math.min(prev.min, value), max: Math.max(prev.max, value), sum: prev.sum + value, count: prev.count + 1 },
    )
  }
  return next
}

const toPoint = ({ at, values, partial }: TailBucket): SeriesPoint => ({
  at,
  partial,
  stats: new Map([...values].map(([id, { min, max, sum, count }]) => [id, { min, avg: sum / count, max }] as const)),
})

const bucketOf = (at: EpochMillis, resolution: Resolution): EpochMillis =>
  Math.floor(at / resolutionMs[resolution]) * resolutionMs[resolution]

const spanOf = (window: RangeWindow) => window.to - window.from

const sameWindow = (a: RangeWindow, b: RangeWindow) =>
  a.from === b.from && a.to === b.to && a.resolution === b.resolution

/** An empty tail for `host` and `window`. */
export const emptyTail = (host: string, window: RangeWindow): LiveTail => ({
  host,
  window,
  newestAt: null,
  buckets: [],
  metrics: new Map(),
})

/** `tail` if it belongs to `host` and `window`, else a fresh one. A host or range switch starts over. */
export const tailFor = (tail: LiveTail, host: string, window: RangeWindow): LiveTail =>
  tail.host === host && sameWindow(tail.window, window) ? tail : emptyTail(host, window)

/**
 * Folds one live sample into the tail. Samples before `window.to` are covered
 * by history and ignored, a sample at exactly `to` is the tail's first.
 * Samples at or before the newest one seen (duplicates, late arrivals) are
 * ignored, so the same sample can be offered on every render. The first
 * sample's bucket is `partial`: the live read only has the latest sample, so
 * earlier samples of that bucket were never seen. Buckets older than one span
 * before the newest are dropped. Returns `tail` itself when nothing changed.
 */
export const appendSample = (tail: LiveTail, sample: Sample): LiveTail => {
  const { window } = tail
  if (sample.at < window.to || (tail.newestAt !== null && sample.at <= tail.newestAt)) return tail

  const entries = sampleEntries(sample)
  const at = bucketOf(sample.at, window.resolution)
  const last = tail.buckets.at(-1)
  const buckets =
    last?.at === at
      ? [...tail.buckets.slice(0, -1), { ...last, values: accumulate(last.values, entries) }]
      : [...tail.buckets, { at, values: accumulate(new Map(), entries), partial: tail.newestAt === null }]
  const oldest = at + resolutionMs[window.resolution] - spanOf(window)
  const metrics = new Map(tail.metrics)
  for (const [metric] of entries) metrics.set(idOf(metric), metric)

  return { ...tail, newestAt: sample.at, buckets: buckets.filter((bucket) => bucket.at >= oldest), metrics }
}

/**
 * Merges history rows with the live tail into one series.
 *
 * - Rows of another host or outside the tail's `[from, to)` are ignored.
 * - `to` is a bucket boundary (see `useFixedTo`), so history holds only
 *   completed buckets and the tail only buckets at or after `to`. They never
 *   share a bucket.
 * - The visible window is one span ending at the later of `to` and the end of
 *   the newest tail bucket. Older points are trimmed, so the chart slides as
 *   the tail grows.
 */
export const mergeSeries = (history: ReadonlyArray<AggregateRow>, tail: LiveTail): Series => {
  const { window } = tail
  const newest = tail.buckets.at(-1)
  const to = Math.max(window.to, newest === undefined ? 0 : newest.at + resolutionMs[window.resolution])
  const from = to - spanOf(window)

  const points: Array<SeriesPoint> = []
  const metrics = new Map<MetricId, Metric>()
  const rows = history.filter((row) => row.host === tail.host && row.at >= Math.max(from, window.from) && row.at < window.to)
  for (const row of rows.toSorted((a, b) => a.at - b.at)) {
    const entries = rowEntries(row)
    points.push({ at: row.at, partial: false, stats: new Map(entries.map(([metric, stat]) => [idOf(metric), stat] as const)) })
    // Rows are oldest first, so newer totals win.
    for (const [metric] of entries) metrics.set(idOf(metric), metric)
  }
  for (const bucket of tail.buckets) {
    if (bucket.at < from) continue
    points.push(toPoint(bucket))
    for (const id of bucket.values.keys()) {
      const metric = tail.metrics.get(id)
      if (metric !== undefined) metrics.set(id, metric)
    }
  }

  return { resolution: window.resolution, from, to, points, metrics }
}

/** One chart point: a band from min to max and the average line. `null` breaks the line over a gap. */
export interface BandPoint {
  readonly at: EpochMillis
  readonly avg: number | null
  readonly band: readonly [number, number] | null
  /** See {@link SeriesPoint.partial}. */
  readonly partial: boolean
}

/**
 * The `id` metric of `series` as band points. A missing bucket (host offline,
 * metric absent) becomes a `null` point so the chart shows a gap instead of
 * interpolating across it.
 */
export const bandPoints = (series: Series, id: MetricId): ReadonlyArray<BandPoint> => {
  const step = resolutionMs[series.resolution]
  const out: Array<BandPoint> = []
  for (const { at, stats, partial } of series.points) {
    const stat = stats.get(id)
    if (stat === undefined) continue
    const prev = out.at(-1)
    if (prev !== undefined && at - prev.at > step) out.push({ at: prev.at + step, avg: null, band: null, partial: false })
    out.push({ at, avg: stat.avg, band: [stat.min, stat.max], partial })
  }
  return out
}
