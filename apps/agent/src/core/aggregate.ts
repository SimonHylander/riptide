// Pure min/avg/max aggregation of samples into minute and hour buckets.
//
// Every sample is added to the open minute bucket and the open hour bucket. A
// sample whose bucket start differs from the open bucket's flushes the open
// bucket as an `AggregateRow` and starts a new one, so rows appear when the
// first sample of the next bucket arrives. Keyed lists (cores by index, temps
// and fans by chip + label, disks by mount, gpus by index) are aggregated per
// key over the samples that contained that key. Optional GPU readings get a
// stat only if at least one sample in the bucket had them.
import type {
  AggregateRow,
  DiskReading,
  EpochMillis,
  FanReading,
  GpuReading,
  MemoryReading,
  HostReading,
  Resolution,
  Sample,
  Stat,
  TempReading,
} from "@riptide/domain"
import { Duration, Record } from "effect"

/** Bucket length per resolution. */
export const bucketSize: Record.ReadonlyRecord<Resolution, Duration.Duration> = {
  minute: Duration.minutes(1),
  hour: Duration.hours(1),
}

/** Start of the bucket containing `at`. */
export const bucketStart = (at: EpochMillis, resolution: Resolution): EpochMillis => {
  const size = Duration.toMillis(bucketSize[resolution])
  return at - (at % size)
}

/** Running min, sum and max of one reading over the `count` samples that had it. */
interface Acc {
  readonly min: number
  readonly sum: number
  readonly max: number
  readonly count: number
}

const add = (acc: Acc | undefined, value: number): Acc =>
  acc === undefined
    ? { min: value, sum: value, max: value, count: 1 }
    : { min: Math.min(acc.min, value), sum: acc.sum + value, max: Math.max(acc.max, value), count: acc.count + 1 }

const addOptional = (acc: Acc | undefined, value: number | undefined): Acc | undefined =>
  value === undefined ? acc : add(acc, value)

const toStat = (acc: Acc): Stat => ({ min: acc.min, avg: acc.sum / acc.count, max: acc.max })

/** Named readings taken from one source reading, e.g. `used` from `MemoryReading.usedBytes`. */
type Fields<R, K extends string> = Record.ReadonlyRecord<K, (reading: R) => number>
type Accs<K extends string> = Record.ReadonlyRecord<K, Acc>

const addFields = <R, K extends string>(fields: Fields<R, K>, accs: Accs<K> | undefined, reading: R): Accs<K> =>
  Record.map(fields, (get, key) => add(accs?.[key], get(reading)))

const toStats = <K extends string>(accs: Accs<K>): Record.ReadonlyRecord<K, Stat> => Record.map(accs, toStat)

/** Adds each reading to the entry under its key. Keys missing from `readings` keep their entry unchanged. */
const addKeyed = <R, E>(
  entries: ReadonlyMap<string, E>,
  readings: ReadonlyArray<R>,
  key: (reading: R) => string,
  addTo: (entry: E | undefined, reading: R) => E,
): ReadonlyMap<string, E> => {
  const next = new Map(entries)
  for (const reading of readings) {
    const k = key(reading)
    next.set(k, addTo(next.get(k), reading))
  }
  return next
}

const memoryFields = {
  total: (m) => m.totalBytes,
  used: (m) => m.usedBytes,
  available: (m) => m.availableBytes,
  swapTotal: (m) => m.swapTotalBytes,
  swapUsed: (m) => m.swapUsedBytes,
} satisfies Fields<MemoryReading, keyof AggregateRow["memory"]>

const systemFields = {
  load1: (h) => h.load1,
  load5: (h) => h.load5,
  load15: (h) => h.load15,
  uptime: (h) => h.uptimeSeconds,
} satisfies Fields<HostReading, keyof AggregateRow["system"]>

const diskFields = {
  total: (d) => d.totalBytes,
  used: (d) => d.usedBytes,
} satisfies Fields<DiskReading, "total" | "used">

const gpuFields = {
  utilization: (g) => g.utilizationPct,
  memoryUsed: (g) => g.memoryUsedBytes,
  memoryTotal: (g) => g.memoryTotalBytes,
} satisfies Fields<GpuReading, "utilization" | "memoryUsed" | "memoryTotal">

interface SensorEntry {
  readonly chip: string
  readonly label: string
  readonly value: Acc
}

interface DiskEntry {
  readonly mount: string
  readonly accs: Accs<keyof typeof diskFields>
}

interface GpuEntry {
  readonly index: number
  readonly accs: Accs<keyof typeof gpuFields>
  readonly temperature?: Acc
  readonly power?: Acc
}

/** The running aggregate of one minute or hour. */
export interface Bucket {
  readonly resolution: Resolution
  /** Bucket start, epoch ms. */
  readonly at: EpochMillis
  readonly count: number
  readonly cpuTotal: Acc
  readonly cores: ReadonlyMap<string, Acc>
  readonly memory: Accs<keyof typeof memoryFields>
  readonly system: Accs<keyof typeof systemFields>
  readonly temps: ReadonlyMap<string, SensorEntry>
  readonly fans: ReadonlyMap<string, SensorEntry>
  readonly disks: ReadonlyMap<string, DiskEntry>
  readonly gpus: ReadonlyMap<string, GpuEntry>
}

const sensorKey = (s: { readonly chip: string; readonly label: string }) => `${s.chip}\u0000${s.label}`

const addTemp = (entry: SensorEntry | undefined, t: TempReading): SensorEntry => ({
  chip: t.chip,
  label: t.label,
  value: add(entry?.value, t.celsius),
})

const addFan = (entry: SensorEntry | undefined, f: FanReading): SensorEntry => ({
  chip: f.chip,
  label: f.label,
  value: add(entry?.value, f.rpm),
})

const addGpu = (entry: GpuEntry | undefined, g: GpuReading): GpuEntry => {
  const temperature = addOptional(entry?.temperature, g.temperatureCelsius)
  const power = addOptional(entry?.power, g.powerWatts)
  return {
    index: g.index,
    accs: addFields(gpuFields, entry?.accs, g),
    ...(temperature && { temperature }),
    ...(power && { power }),
  }
}

/** Adds `sample` to `bucket`, or starts a bucket of `resolution` from it. The caller checks the sample belongs. */
export const addSample = (bucket: Bucket | undefined, resolution: Resolution, sample: Sample): Bucket => ({
  resolution,
  at: bucket?.at ?? bucketStart(sample.at, resolution),
  count: (bucket?.count ?? 0) + 1,
  cpuTotal: add(bucket?.cpuTotal, sample.cpu.totalPct),
  cores: addKeyed(
    bucket?.cores ?? new Map(),
    sample.cpu.coresPct.map((pct, index) => ({ index, pct })),
    (core) => `${core.index}`,
    (acc, core) => add(acc, core.pct),
  ),
  memory: addFields(memoryFields, bucket?.memory, sample.memory),
  system: addFields(systemFields, bucket?.system, sample.host),
  temps: addKeyed(bucket?.temps ?? new Map(), sample.sensors.temps, sensorKey, addTemp),
  fans: addKeyed(bucket?.fans ?? new Map(), sample.sensors.fans, sensorKey, addFan),
  disks: addKeyed(bucket?.disks ?? new Map(), sample.disks, (d) => d.mount, (entry, d) => ({
    mount: d.mount,
    accs: addFields(diskFields, entry?.accs, d),
  })),
  gpus: addKeyed(bucket?.gpus ?? new Map(), sample.gpus, (g) => `${g.index}`, addGpu),
})

/** The row for a bucket. Cores keep index order, other lists the order keys first appeared in. */
export const toRow = (host: string, bucket: Bucket): AggregateRow => ({
  host,
  at: bucket.at,
  resolution: bucket.resolution,
  count: bucket.count,
  cpu: {
    total: toStat(bucket.cpuTotal),
    cores: [...bucket.cores].sort(([a], [b]) => Number(a) - Number(b)).map(([, acc]) => toStat(acc)),
  },
  memory: toStats(bucket.memory),
  system: toStats(bucket.system),
  sensors: {
    temps: Array.from(bucket.temps.values(), ({ chip, label, value }) => ({ chip, label, celsius: toStat(value) })),
    fans: Array.from(bucket.fans.values(), ({ chip, label, value }) => ({ chip, label, rpm: toStat(value) })),
  },
  disks: Array.from(bucket.disks.values(), ({ mount, accs }) => ({ mount, ...toStats(accs) })),
  gpus: [...bucket.gpus.values()].sort((a, b) => a.index - b.index).map((gpu) => ({
    index: gpu.index,
    ...toStats(gpu.accs),
    ...(gpu.temperature && { temperature: toStat(gpu.temperature) }),
    ...(gpu.power && { power: toStat(gpu.power) }),
  })),
})

/** The open minute and hour buckets. */
export interface Aggregator {
  readonly minute: Bucket | undefined
  readonly hour: Bucket | undefined
}

export const empty: Aggregator = { minute: undefined, hour: undefined }

/** Adds `sample` to both buckets. Returns rows for buckets the sample closed, minute before hour. */
export const push = (
  aggregator: Aggregator,
  host: string,
  sample: Sample,
): { readonly aggregator: Aggregator; readonly flushed: ReadonlyArray<AggregateRow> } => {
  const flushed: Array<AggregateRow> = []
  const step = (resolution: Resolution): Bucket => {
    const open = aggregator[resolution]
    if (open !== undefined && open.at !== bucketStart(sample.at, resolution)) {
      flushed.push(toRow(host, open))
      return addSample(undefined, resolution, sample)
    }
    return addSample(open, resolution, sample)
  }
  const minute = step("minute")
  const hour = step("hour")
  return { aggregator: { minute, hour }, flushed }
}
