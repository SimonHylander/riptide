import type { Sample } from "@riptide/domain"

/** Uniform random number in [0, 1). */
export type Random = () => number

/**
 * Seeded PRNG (mulberry32). Deterministic, so the server render and the
 * client's first render produce the same fixture values.
 */
export const seededRandom = (seed: number): Random => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Moves `value` by up to `±step`, kept within `[min, max]`. */
const walk = (random: Random, value: number, step: number, min: number, max: number) =>
  clamp(value + (random() * 2 - 1) * step, min, max)

const average = (values: ReadonlyArray<number>) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

/** Exponential moving average, the same shape as the kernel's load averages. */
const decay = (previous: number, current: number, factor: number) => previous + (current - previous) * factor

/**
 * Next one-second sample after `sample`, taken at `at`. Values drift as a
 * random walk within plausible bounds. Totals, labels and stopped fans stay
 * fixed.
 */
export const nextSample = (sample: Sample, at: number, random: Random): Sample => {
  const coresPct = sample.cpu.coresPct.map((pct) => walk(random, pct, 12, 0, 100))
  const runnable = (average(coresPct) / 100) * coresPct.length
  const { memory } = sample
  const usedBytes = walk(random, memory.usedBytes, memory.totalBytes * 0.004, memory.totalBytes * 0.1, memory.totalBytes * 0.95)

  return {
    at,
    cpu: { totalPct: average(coresPct), coresPct },
    memory: { ...memory, usedBytes, availableBytes: memory.totalBytes - usedBytes },
    host: {
      load1: decay(sample.host.load1, runnable, 0.08),
      load5: decay(sample.host.load5, runnable, 0.016),
      load15: decay(sample.host.load15, runnable, 0.0055),
      uptimeSeconds: sample.host.uptimeSeconds + 1,
    },
    sensors: {
      temps: sample.sensors.temps.map((temp) => ({ ...temp, celsius: walk(random, temp.celsius, 0.6, 25, 95) })),
      fans: sample.sensors.fans.map((fan) => (fan.rpm === 0 ? fan : { ...fan, rpm: walk(random, fan.rpm, 40, 400, 3000) })),
    },
    disks: sample.disks,
    gpus: sample.gpus.map((gpu) => ({
      ...gpu,
      utilizationPct: walk(random, gpu.utilizationPct, 8, 0, 100),
      memoryUsedBytes: walk(random, gpu.memoryUsedBytes, gpu.memoryTotalBytes * 0.01, 0, gpu.memoryTotalBytes),
      ...(gpu.temperatureCelsius === undefined
        ? {}
        : { temperatureCelsius: walk(random, gpu.temperatureCelsius, 0.5, 30, 90) }),
      ...(gpu.powerWatts === undefined ? {} : { powerWatts: walk(random, gpu.powerWatts, 6, 10, 320) }),
    })),
  }
}
