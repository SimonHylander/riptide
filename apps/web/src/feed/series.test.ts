import { rangeWindow, type AggregateRow, type Resolution, type Sample, type Stat } from "@riptide/domain"
import { describe, expect, it } from "vitest"

import { appendSample, bandPoints, emptyTail, mergeSeries, tailFor, type LiveTail, type Series } from "./series"

const minute = 60_000
const hour = 60 * minute
// A whole hour, so minute and hour buckets both start at `to`.
const to = 1_800_000_000_000 - (1_800_000_000_000 % hour)
const oneHour = rangeWindow("1h", to)
const sevenDays = rangeWindow("7d", to)

const stat = (min: number, avg: number, max: number): Stat => ({ min, avg, max })

const sample = (at: number, cpu: number): Sample => ({
  at,
  cpu: { totalPct: cpu, coresPct: [cpu] },
  memory: { totalBytes: 100, usedBytes: 40, availableBytes: 60, swapTotalBytes: 0, swapUsedBytes: 0 },
  host: { load1: 1, load5: 1, load15: 1, uptimeSeconds: 10 },
  sensors: { temps: [{ chip: "k10temp", label: "Tctl", celsius: 50 }], fans: [] },
  disks: [],
  gpus: [],
})

const row = (at: number, cpu: Stat, { host = "desktop", resolution = "minute" as Resolution, count = 60 } = {}): AggregateRow => ({
  host,
  at,
  resolution,
  count,
  cpu: { total: cpu, cores: [cpu] },
  memory: { total: stat(100, 100, 100), used: stat(40, 40, 40), available: stat(60, 60, 60), swapTotal: stat(0, 0, 0), swapUsed: stat(0, 0, 0) },
  system: { load1: stat(1, 1, 1), load5: stat(1, 1, 1), load15: stat(1, 1, 1), uptime: stat(10, 10, 10) },
  sensors: { temps: [], fans: [] },
  disks: [],
  gpus: [],
})

const append = (tail: LiveTail, ...samples: ReadonlyArray<Sample>) => samples.reduce(appendSample, tail)
const cpu = (series: Series) => series.points.map(({ at, stats }) => [at, stats.get("cpu")])

describe("mergeSeries", () => {
  it("is empty over the query window with no history and no tail", () => {
    expect(mergeSeries([], emptyTail("desktop", oneHour))).toEqual({
      resolution: "minute",
      from: oneHour.from,
      to: oneHour.to,
      points: [],
    })
  })

  it("keeps history rows of the host inside [from, to), oldest first", () => {
    const rows = [
      row(to - 2 * minute, stat(1, 2, 3)),
      row(to - 3 * minute, stat(4, 5, 6)),
      row(to, stat(0, 0, 0)), // at `to`: belongs to the tail
      row(oneHour.from - minute, stat(0, 0, 0)), // before `from`
      row(to - minute, stat(0, 0, 0), { host: "vm" }),
    ]

    expect(cpu(mergeSeries(rows, emptyTail("desktop", oneHour)))).toEqual([
      [to - 3 * minute, stat(4, 5, 6)],
      [to - 2 * minute, stat(1, 2, 3)],
    ])
  })

  it("buckets tail samples at the window's resolution", () => {
    const tail = append(emptyTail("desktop", oneHour), sample(to + 1_000, 10), sample(to + 2_000, 30), sample(to + minute, 50))
    const series = mergeSeries([], tail)

    expect(cpu(series)).toEqual([
      [to, stat(10, 20, 30)],
      [to + minute, stat(50, 50, 50)],
    ])
    expect(series.points[0]?.stats.get("temp/k10temp/Tctl")).toEqual(stat(50, 50, 50))
    expect(series.to).toBe(to + 2 * minute)
  })

  it("starts the tail at exactly `to` and ignores samples before it", () => {
    const tail = append(emptyTail("desktop", oneHour), sample(to - 1, 99), sample(to, 10))

    expect(cpu(mergeSeries([row(to - minute, stat(1, 2, 3))], tail))).toEqual([
      [to - minute, stat(1, 2, 3)],
      [to, stat(10, 10, 10)],
    ])
  })

  it("combines the partial history bucket at `to` with the tail, weighted by count", () => {
    // 7d reads hour rows. `to` mid-hour leaves the current hour split between both.
    const midHour = rangeWindow("7d", to + 30 * minute)
    const history = [row(to, stat(10, 20, 30), { resolution: "hour", count: 3 })]
    const tail = append(emptyTail("desktop", midHour), sample(to + 30 * minute, 40))

    expect(cpu(mergeSeries(history, tail))).toEqual([[to, stat(10, 25, 40)]])
  })

  it("ignores duplicate and late samples", () => {
    const tail = append(emptyTail("desktop", oneHour), sample(to + 5_000, 10))

    expect(appendSample(tail, sample(to + 5_000, 10))).toBe(tail)
    expect(appendSample(tail, sample(to + 4_000, 90))).toBe(tail)
    expect(cpu(mergeSeries([], tail))).toEqual([[to, stat(10, 10, 10)]])
  })

  it("starts over on a host or window switch", () => {
    const tail = append(emptyTail("desktop", oneHour), sample(to + 5_000, 10))

    expect(tailFor(tail, "desktop", oneHour)).toBe(tail)
    expect(tailFor(tail, "vm", oneHour)).toEqual(emptyTail("vm", oneHour))
    expect(tailFor(tail, "desktop", sevenDays)).toEqual(emptyTail("desktop", sevenDays))
    expect(mergeSeries([row(to - minute, stat(1, 2, 3))], tailFor(tail, "vm", oneHour)).points).toEqual([])
  })

  it("keeps one span as the tail outgrows the range", () => {
    const history = [row(oneHour.from, stat(1, 1, 1)), row(to - minute, stat(2, 2, 2))]
    const samples = Array.from({ length: 90 }, (_, i) => sample(to + i * minute, i))
    const tail = append(emptyTail("desktop", oneHour), ...samples)
    const series = mergeSeries(history, tail)

    expect(tail.points).toHaveLength(60)
    expect(series.to).toBe(to + 90 * minute)
    expect(series.from).toBe(to + 30 * minute)
    expect(series.points).toHaveLength(60)
    expect(series.points[0]?.at).toBe(to + 30 * minute)
  })
})

describe("bandPoints", () => {
  it("breaks the line over missing buckets", () => {
    const series = mergeSeries([row(to - 5 * minute, stat(1, 2, 3)), row(to - 2 * minute, stat(4, 5, 6))], emptyTail("desktop", oneHour))

    expect(bandPoints(series, "cpu")).toEqual([
      { at: to - 5 * minute, avg: 2, band: [1, 3] },
      { at: to - 4 * minute, avg: null, band: null },
      { at: to - 2 * minute, avg: 5, band: [4, 6] },
    ])
  })
})
