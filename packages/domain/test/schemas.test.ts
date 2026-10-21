import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"

import { AggregateRow, HistoryRange, ReportBatch, ReportReply, Resolution, Sample } from "../src/index"
import { aggregateRow, fullSample, minimalAggregateRow, minimalSample, reportBatch } from "./fixtures"

/** Decode then encode must give back the same plain value, which is what Convex stores. */
const roundTrip = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: S["Type"]) => {
  const encoded = Schema.encodeSync(schema)(value)
  expect(encoded).toEqual(value)
  expect(Schema.decodeUnknownSync(schema)(encoded)).toEqual(value)
  // Plain JSON-compatible values only: nothing is lost through serialization.
  expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded)
}

describe("Sample", () => {
  it("round trips a full sample (sensors, disks, gpus with optional fields)", () => {
    roundTrip(Sample, fullSample)
  })

  it("round trips a minimal sample (empty lists)", () => {
    roundTrip(Sample, minimalSample)
  })

  it("keeps optional gpu fields absent rather than undefined", () => {
    const decoded = Schema.decodeUnknownSync(Sample)(fullSample)
    expect(decoded.gpus[1]).not.toHaveProperty("temperatureCelsius")
    expect(decoded.gpus[1]).not.toHaveProperty("powerWatts")
  })

  it("rejects a cpu percentage above 100", () => {
    const bad = { ...fullSample, cpu: { totalPct: 101, coresPct: [] } }
    expect(() => Schema.decodeUnknownSync(Sample)(bad)).toThrow()
  })

  it("rejects negative bytes and non-finite numbers", () => {
    const negative = { ...fullSample, memory: { ...fullSample.memory, usedBytes: -1 } }
    expect(() => Schema.decodeUnknownSync(Sample)(negative)).toThrow()
    const nan = { ...fullSample, at: Number.NaN }
    expect(() => Schema.decodeUnknownSync(Sample)(nan)).toThrow()
  })

  it("rejects a missing required field", () => {
    const { sensors: _sensors, ...bad } = fullSample
    expect(() => Schema.decodeUnknownSync(Sample)(bad)).toThrow()
  })
})

describe("AggregateRow", () => {
  it("round trips a full row", () => {
    roundTrip(AggregateRow, aggregateRow)
  })

  it("round trips a minimal row", () => {
    roundTrip(AggregateRow, minimalAggregateRow)
  })

  it("rejects an unknown resolution", () => {
    expect(() => Schema.decodeUnknownSync(AggregateRow)({ ...aggregateRow, resolution: "day" })).toThrow()
  })
})

describe("ReportBatch / ReportReply", () => {
  it("round trips a batch", () => {
    roundTrip(ReportBatch, reportBatch)
  })

  it("round trips a batch without aggregates", () => {
    roundTrip(ReportBatch, { host: "host-a", sample: minimalSample, aggregates: [] })
  })

  it("round trips a reply, including never seen", () => {
    roundTrip(ReportReply, { lastSeen: 1_800_000_000_000 })
    roundTrip(ReportReply, { lastSeen: 0 })
  })
})

describe("literals", () => {
  it("accepts only known resolutions and ranges", () => {
    expect(Schema.decodeUnknownSync(Resolution)("minute")).toBe("minute")
    expect(() => Schema.decodeUnknownSync(Resolution)("second")).toThrow()
    expect(Schema.decodeUnknownSync(HistoryRange)("30d")).toBe("30d")
    expect(() => Schema.decodeUnknownSync(HistoryRange)("90d")).toThrow()
  })
})
