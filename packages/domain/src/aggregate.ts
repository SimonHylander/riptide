import { Schema } from "effect"

import { EpochMillis, NonNegative } from "./primitives"

/** Bucket granularity of an {@link AggregateRow}. */
export const Resolution = Schema.Literals(["minute", "hour"])
export type Resolution = typeof Resolution.Type

/** Min, average and max of one numeric field over a bucket. */
export const Stat = Schema.Struct({
  min: Schema.Finite,
  avg: Schema.Finite,
  max: Schema.Finite,
})
export type Stat = typeof Stat.Type

/**
 * Min/avg/max of a host's samples over one minute or hour.
 *
 * Mirrors {@link Sample} with numeric leaves replaced by {@link Stat}. Static
 * facts (memory and disk totals) stay plain numbers, taken from the last
 * sample. Entries carry their identity key: `cpu.cores` is positional (core
 * index), temps and fans use `chip` + `label`, disks use `mount`, gpus use
 * `index`. Device names, filesystem types, GPU names and uptime are left out
 * to keep rows small, read them from the latest {@link Sample}. The load
 * averages are under `load` because `host` is the host name here.
 */
export const AggregateRow = Schema.Struct({
  host: Schema.String,
  /** Bucket start, epoch ms. */
  at: EpochMillis,
  resolution: Resolution,
  /** Number of samples in the bucket. */
  count: Schema.Int,
  cpu: Schema.Struct({
    total: Stat,
    cores: Schema.Array(Stat),
  }),
  memory: Schema.Struct({
    totalBytes: NonNegative,
    used: Stat,
    available: Stat,
    swapTotalBytes: NonNegative,
    swapUsed: Stat,
  }),
  load: Schema.Struct({
    load1: Stat,
    load5: Stat,
    load15: Stat,
  }),
  sensors: Schema.Struct({
    temps: Schema.Array(Schema.Struct({ chip: Schema.String, label: Schema.String, celsius: Stat })),
    fans: Schema.Array(Schema.Struct({ chip: Schema.String, label: Schema.String, rpm: Stat })),
  }),
  disks: Schema.Array(Schema.Struct({ mount: Schema.String, totalBytes: NonNegative, used: Stat })),
  gpus: Schema.Array(
    Schema.Struct({
      index: Schema.Int,
      memoryTotalBytes: NonNegative,
      utilization: Stat,
      memoryUsed: Stat,
      temperature: Schema.optionalKey(Stat),
      power: Schema.optionalKey(Stat),
    }),
  ),
})
export type AggregateRow = typeof AggregateRow.Type
