import { Schema } from "effect"

import { EpochMillis } from "./primitives"

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
 * Mirrors {@link Sample} with every numeric reading replaced by a {@link Stat},
 * capacities and uptime included. Field names drop the unit suffix, units
 * match {@link Sample}. Entries carry their identity key as a plain value:
 * `cpu.cores` is positional (core index), temps and fans use `chip` + `label`,
 * disks use `mount`, gpus use `index`. Device names, filesystem types and GPU
 * names are left out to keep rows small, read them from the latest
 * {@link Sample}. Load and uptime ({@link Sample} `host`) are under `system`
 * because `host` is the host name here.
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
    total: Stat,
    used: Stat,
    available: Stat,
    swapTotal: Stat,
    swapUsed: Stat,
  }),
  system: Schema.Struct({
    load1: Stat,
    load5: Stat,
    load15: Stat,
    uptime: Stat,
  }),
  sensors: Schema.Struct({
    temps: Schema.Array(Schema.Struct({ chip: Schema.String, label: Schema.String, celsius: Stat })),
    fans: Schema.Array(Schema.Struct({ chip: Schema.String, label: Schema.String, rpm: Stat })),
  }),
  disks: Schema.Array(Schema.Struct({ mount: Schema.String, total: Stat, used: Stat })),
  gpus: Schema.Array(
    Schema.Struct({
      index: Schema.Int,
      utilization: Stat,
      memoryUsed: Stat,
      memoryTotal: Stat,
      temperature: Schema.optionalKey(Stat),
      power: Schema.optionalKey(Stat),
    }),
  ),
})
export type AggregateRow = typeof AggregateRow.Type
