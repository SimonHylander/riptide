import { Schema } from "effect"

import { EpochMillis, NonNegative, Pct } from "./primitives"

/** CPU utilization. `coresPct` has one entry per logical core, in core order. */
export const CpuReading = Schema.Struct({
  totalPct: Pct,
  coresPct: Schema.Array(Pct),
})
export type CpuReading = typeof CpuReading.Type

/** RAM and swap in bytes. */
export const MemoryReading = Schema.Struct({
  totalBytes: NonNegative,
  usedBytes: NonNegative,
  availableBytes: NonNegative,
  swapTotalBytes: NonNegative,
  swapUsedBytes: NonNegative,
})
export type MemoryReading = typeof MemoryReading.Type

/** Load averages and uptime. */
export const HostReading = Schema.Struct({
  load1: NonNegative,
  load5: NonNegative,
  load15: NonNegative,
  uptimeSeconds: NonNegative,
})
export type HostReading = typeof HostReading.Type

/** A temperature sensor, identified by `chip` + `label`. */
export const TempReading = Schema.Struct({
  chip: Schema.String,
  label: Schema.String,
  celsius: Schema.Finite,
})
export type TempReading = typeof TempReading.Type

/** A fan sensor, identified by `chip` + `label`. 0 rpm is valid (stopped fan). */
export const FanReading = Schema.Struct({
  chip: Schema.String,
  label: Schema.String,
  rpm: NonNegative,
})
export type FanReading = typeof FanReading.Type

/** Whatever sensors the host exposes. Both lists may be empty. */
export const SensorReading = Schema.Struct({
  temps: Schema.Array(TempReading),
  fans: Schema.Array(FanReading),
})
export type SensorReading = typeof SensorReading.Type

/** A mounted filesystem, identified by `mount`. */
export const DiskReading = Schema.Struct({
  mount: Schema.String,
  device: Schema.String,
  fsType: Schema.String,
  totalBytes: NonNegative,
  usedBytes: NonNegative,
})
export type DiskReading = typeof DiskReading.Type

/**
 * A GPU, identified by `index`. Vendor-neutral: temperature and power are
 * omitted (key absent, never `undefined`) when the vendor cannot report them.
 */
export const GpuReading = Schema.Struct({
  index: Schema.Int,
  name: Schema.String,
  utilizationPct: Pct,
  memoryUsedBytes: NonNegative,
  memoryTotalBytes: NonNegative,
  temperatureCelsius: Schema.optionalKey(Schema.Finite),
  powerWatts: Schema.optionalKey(NonNegative),
})
export type GpuReading = typeof GpuReading.Type

/** One-second snapshot of a host. Every list may be empty. */
export const Sample = Schema.Struct({
  /** Epoch ms when the sample was taken. */
  at: EpochMillis,
  cpu: CpuReading,
  memory: MemoryReading,
  host: HostReading,
  sensors: SensorReading,
  disks: Schema.Array(DiskReading),
  gpus: Schema.Array(GpuReading),
})
export type Sample = typeof Sample.Type
