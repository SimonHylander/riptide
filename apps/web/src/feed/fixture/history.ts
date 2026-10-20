import type { AggregateRow, EpochMillis, RangeWindow, Sample, Stat } from "@riptide/domain"

import { resolutionMs } from "../series"
import { seededRandom, type Random } from "./simulate"

const day = 86_400_000
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Stable 32-bit hash of a string (FNV-1a), to seed each host differently. */
const hash = (text: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/**
 * Generates one bucket. Every metric follows a daily cycle plus a faster
 * wiggle, offset by its own phase, with per-bucket noise seeded by host and
 * bucket start. So the same bucket has the same values in every range.
 */
const row = (template: Sample, host: string, at: EpochMillis, resolution: RangeWindow["resolution"]): AggregateRow => {
  const random: Random = seededRandom(hash(host) ^ Math.floor(at / resolutionMs[resolution]))
  const hourly = resolution === "hour"
  let phase = 0

  /** Relative swing in [-1, 1] for the next metric. */
  const swing = () => {
    phase += 1.7
    const t = (at / day) * 2 * Math.PI
    return clamp(0.65 * Math.sin(t + phase) + 0.25 * Math.sin(t * 14.8 + phase * 3) + 0.2 * (random() - 0.5), -1, 1)
  }

  /** Stat around `center`, `spread` wide at minute resolution and wider for hours. */
  const stat = (center: number, spread: number, min: number, max: number): Stat => {
    const width = spread * (hourly ? 2.5 : 1)
    const avg = clamp(center, min, max)
    return { min: clamp(avg - width * random(), min, max), avg, max: clamp(avg + width * random(), min, max) }
  }
  const steady = (value: number): Stat => ({ min: value, avg: value, max: value })
  const pct = (base: number) => stat(base * (1 + 0.7 * swing()), 8, 0, 100)

  const { cpu, memory, host: system, sensors, disks, gpus } = template
  const used = stat(memory.usedBytes * (1 + 0.15 * swing()), memory.totalBytes * 0.01, 0, memory.totalBytes)
  // Uptime at the bucket, counting back from the template, never below zero.
  const uptime = Math.max(0, system.uptimeSeconds - (template.at - at) / 1000)

  return {
    host,
    at,
    resolution,
    count: hourly ? 3_600 : 60,
    cpu: { total: pct(cpu.totalPct), cores: cpu.coresPct.map(pct) },
    memory: {
      total: steady(memory.totalBytes),
      used,
      available: { min: memory.totalBytes - used.max, avg: memory.totalBytes - used.avg, max: memory.totalBytes - used.min },
      swapTotal: steady(memory.swapTotalBytes),
      swapUsed: stat(memory.swapUsedBytes * (1 + 0.3 * swing()), 0, 0, memory.swapTotalBytes),
    },
    system: {
      load1: stat(system.load1 * (1 + 0.6 * swing()), system.load1 * 0.3, 0, Infinity),
      load5: stat(system.load5 * (1 + 0.5 * swing()), system.load5 * 0.15, 0, Infinity),
      load15: stat(system.load15 * (1 + 0.4 * swing()), system.load15 * 0.08, 0, Infinity),
      uptime: { min: uptime, avg: uptime + resolutionMs[resolution] / 2000, max: uptime + resolutionMs[resolution] / 1000 },
    },
    sensors: {
      temps: sensors.temps.map(({ chip, label, celsius }) => ({
        chip,
        label,
        celsius: stat(celsius + 7 * swing(), 1.5, 20, 100),
      })),
      fans: sensors.fans.map(({ chip, label, rpm }) => ({
        chip,
        label,
        rpm: rpm === 0 ? steady(0) : stat(rpm * (1 + 0.2 * swing()), rpm * 0.05, 0, 3_000),
      })),
    },
    disks: disks.map(({ mount, totalBytes, usedBytes }) => ({
      mount,
      total: steady(totalBytes),
      // Disks fill slowly: about 3% less used 30 days back.
      used: steady(usedBytes * (1 - (0.03 * (template.at - at)) / (30 * day))),
    })),
    gpus: gpus.map((gpu) => ({
      index: gpu.index,
      utilization: pct(gpu.utilizationPct),
      memoryUsed: stat(gpu.memoryUsedBytes * (1 + 0.4 * swing()), gpu.memoryTotalBytes * 0.02, 0, gpu.memoryTotalBytes),
      memoryTotal: steady(gpu.memoryTotalBytes),
      ...(gpu.temperatureCelsius === undefined
        ? {}
        : { temperature: stat(gpu.temperatureCelsius + 9 * swing(), 2, 25, 95) }),
      ...(gpu.powerWatts === undefined ? {} : { power: stat(gpu.powerWatts * (1 + 0.6 * swing()), 20, 0, 450) }),
    })),
  }
}

/**
 * Deterministic aggregate rows shaped like `template` (same cores, sensors,
 * disks and GPUs), one per bucket start in `[from, to)` of `window` and at or
 * before `lastAt`, so a host that stopped reporting has no newer rows.
 */
export const fixtureHistory = (
  template: Sample,
  host: string,
  window: RangeWindow,
  lastAt: EpochMillis,
): ReadonlyArray<AggregateRow> => {
  const step = resolutionMs[window.resolution]
  const rows: Array<AggregateRow> = []
  for (let at = Math.ceil(window.from / step) * step; at < window.to && at <= lastAt; at += step) {
    rows.push(row(template, host, at, window.resolution))
  }
  return rows
}
