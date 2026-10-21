import { assert, describe, it } from "@effect/vitest"
import { AggregateRow, type GpuReading, type Sample } from "@riptide/domain"
import { Schema } from "effect"

import * as Aggregate from "../../src/core/aggregate"

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)
const minute = 60_000

const gpu = (overrides: Partial<GpuReading> = {}): GpuReading => ({
  index: 0,
  name: "GPU",
  utilizationPct: 50,
  memoryUsedBytes: 1,
  memoryTotalBytes: 8,
  ...overrides,
})

const sample = (at: number, overrides: Partial<Omit<Sample, "at">> = {}): Sample => ({
  at,
  cpu: { totalPct: 10, coresPct: [10, 10] },
  memory: { totalBytes: 100, usedBytes: 40, availableBytes: 60, swapTotalBytes: 10, swapUsedBytes: 0 },
  host: { load1: 1, load5: 1, load15: 1, uptimeSeconds: 1000 },
  sensors: { temps: [], fans: [] },
  disks: [],
  gpus: [],
  ...overrides,
})

/** Pushes samples in order, returning every flushed row, each push's `stale` flag and the final aggregator. */
const pushAll = (samples: ReadonlyArray<Sample>) => {
  let aggregator = Aggregate.empty
  const rows: Array<AggregateRow> = []
  const stale: Array<boolean> = []
  for (const s of samples) {
    const result = Aggregate.push(aggregator, "h", s)
    aggregator = result.aggregator
    rows.push(...result.flushed)
    stale.push(result.stale)
  }
  return { aggregator, rows, stale }
}

/** The open minute bucket as a row. */
const openMinute = (samples: ReadonlyArray<Sample>) => {
  const { minute } = pushAll(samples).aggregator
  assert.isDefined(minute)
  return Aggregate.toRow("h", minute)
}

describe("aggregate", () => {
  it("computes min/avg/max per field and per core", () => {
    const row = openMinute([
      sample(T0, { cpu: { totalPct: 10, coresPct: [0, 20] } }),
      sample(T0 + 1000, { cpu: { totalPct: 40, coresPct: [30, 50] } }),
      sample(T0 + 2000, { cpu: { totalPct: 70, coresPct: [60, 80] } }),
    ])
    assert.strictEqual(row.count, 3)
    assert.strictEqual(row.at, T0)
    assert.deepStrictEqual(row.cpu, {
      total: { min: 10, avg: 40, max: 70 },
      cores: [{ min: 0, avg: 30, max: 60 }, { min: 20, avg: 50, max: 80 }],
    })
    assert.deepStrictEqual(row.memory.used, { min: 40, avg: 40, max: 40 })
    assert.deepStrictEqual(row.system.uptime, { min: 1000, avg: 1000, max: 1000 })
    Schema.decodeUnknownSync(AggregateRow)(row)
  })

  it("flushes a minute when a sample lands in the next one, not before", () => {
    const before = pushAll([sample(T0), sample(T0 + minute - 1)])
    assert.deepStrictEqual(before.rows, [])

    const { rows, aggregator } = pushAll([sample(T0), sample(T0 + minute - 1), sample(T0 + minute)])
    assert.deepStrictEqual(rows.map((r) => [r.resolution, r.at, r.count]), [["minute", T0, 2]])
    assert.strictEqual(aggregator.minute?.at, T0 + minute)
    assert.strictEqual(aggregator.minute?.count, 1)
    assert.strictEqual(aggregator.hour?.count, 3)
  })

  it("flushes the minute and the hour at an hour boundary", () => {
    const hour = 60 * minute
    const { rows } = pushAll([sample(T0), sample(T0 + 30 * minute), sample(T0 + hour - 1), sample(T0 + hour)])
    assert.deepStrictEqual(rows.map((r) => [r.resolution, r.at, r.count]), [
      ["minute", T0, 1],
      ["minute", T0 + 30 * minute, 1],
      ["minute", T0 + 59 * minute, 1],
      ["hour", T0, 3],
    ])
  })

  it("leaves out samples from before the open bucket when the clock moves back", () => {
    const { aggregator, rows, stale } = pushAll([T0 + 59_000, T0 + minute, T0 + 59_000, T0 + minute].map((t) => sample(t)))
    assert.deepStrictEqual(stale, [false, false, true, false])
    // One row for minute 0; the stale sample neither reopened it nor joined minute 1 or the hour.
    assert.deepStrictEqual(rows.map((r) => [r.resolution, r.at, r.count]), [["minute", T0, 1]])
    assert.deepStrictEqual([aggregator.minute?.at, aggregator.minute?.count], [T0 + minute, 2])
    assert.strictEqual(aggregator.hour?.count, 3)

    // Across an hour boundary the sample is older than both open buckets.
    const hour = 60 * minute
    const afterHour = pushAll([sample(T0 + hour - 1), sample(T0 + hour)]).aggregator
    const back = Aggregate.push(afterHour, "h", sample(T0 + hour - 1))
    assert.isTrue(back.stale)
    assert.strictEqual(back.aggregator, afterHour)
  })

  it("aggregates each keyed entry over the samples that contained it", () => {
    const root = { mount: "/", device: "/dev/a", fsType: "ext4", totalBytes: 100, usedBytes: 10 }
    const data = { mount: "/data", device: "/dev/b", fsType: "xfs", totalBytes: 500, usedBytes: 100 }
    const row = openMinute([
      sample(T0, { disks: [root], gpus: [gpu({ index: 0, utilizationPct: 10 }), gpu({ index: 1, utilizationPct: 90 })] }),
      sample(T0 + 1000, { disks: [root, { ...data, usedBytes: 200 }], gpus: [gpu({ index: 0, utilizationPct: 30 })] }),
      sample(T0 + 2000, { disks: [{ ...root, usedBytes: 40 }, data], gpus: [gpu({ index: 0, utilizationPct: 50 })] }),
    ])
    assert.deepStrictEqual(row.disks, [
      { mount: "/", total: { min: 100, avg: 100, max: 100 }, used: { min: 10, avg: 20, max: 40 } },
      { mount: "/data", total: { min: 500, avg: 500, max: 500 }, used: { min: 100, avg: 150, max: 200 } },
    ])
    assert.deepStrictEqual(row.gpus.map((g) => [g.index, g.utilization]), [
      [0, { min: 10, avg: 30, max: 50 }],
      [1, { min: 90, avg: 90, max: 90 }],
    ])
  })

  it("keys temps and fans by chip and label", () => {
    const row = openMinute([
      sample(T0, {
        sensors: {
          temps: [{ chip: "nvme-a", label: "Composite", celsius: 30 }, { chip: "nvme-b", label: "Composite", celsius: 50 }],
          fans: [{ chip: "nct", label: "fan1", rpm: 0 }],
        },
      }),
      sample(T0 + 1000, {
        sensors: { temps: [{ chip: "nvme-a", label: "Composite", celsius: 40 }], fans: [{ chip: "nct", label: "fan1", rpm: 1000 }] },
      }),
    ])
    assert.deepStrictEqual(row.sensors, {
      temps: [
        { chip: "nvme-a", label: "Composite", celsius: { min: 30, avg: 35, max: 40 } },
        { chip: "nvme-b", label: "Composite", celsius: { min: 50, avg: 50, max: 50 } },
      ],
      fans: [{ chip: "nct", label: "fan1", rpm: { min: 0, avg: 500, max: 1000 } }],
    })
  })

  it("omits optional GPU keys no sample reported, and averages them over the samples that did", () => {
    const row = openMinute([
      sample(T0, { gpus: [gpu({ temperatureCelsius: 40 })] }),
      sample(T0 + 1000, { gpus: [gpu()] }),
      sample(T0 + 2000, { gpus: [gpu({ temperatureCelsius: 60 })] }),
    ])
    const [only] = row.gpus
    assert.isDefined(only)
    assert.deepStrictEqual(only.temperature, { min: 40, avg: 50, max: 60 })
    assert.isFalse("power" in only)
    Schema.decodeUnknownSync(AggregateRow)(row)
  })
})
