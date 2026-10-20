import { describe, expect, it } from "@effect/vitest"
import { Duration } from "effect"

import {
  heartbeatInterval,
  idleUploadCadence,
  isOffline,
  isPresenceFresh,
  liveUploadCadence,
  offlineThreshold,
  presenceFreshness,
  rangeWindow,
  retentionCutoff,
  retentionPeriod,
  type HistoryRange,
} from "../src/index"

const second = 1_000
const minute = 60 * second
const hour = 60 * minute
const day = 24 * hour
const now = 1_800_000_000_000

describe("constants", () => {
  it("match the spec", () => {
    expect(Duration.toMillis(heartbeatInterval)).toBe(15 * second)
    expect(Duration.toMillis(liveUploadCadence)).toBe(1 * second)
    expect(Duration.toMillis(idleUploadCadence)).toBe(60 * second)
    expect(Duration.toMillis(presenceFreshness)).toBe(30 * second)
    expect(Duration.toMillis(offlineThreshold)).toBe(2 * minute)
    expect(Duration.toMillis(retentionPeriod)).toBe(30 * day)
  })
})

describe("isPresenceFresh", () => {
  it("is fresh under 30s", () => {
    expect(isPresenceFresh(now - 29 * second, now)).toBe(true)
    expect(isPresenceFresh(now, now)).toBe(true)
  })

  it("is stale at exactly 30s and beyond", () => {
    expect(isPresenceFresh(now - 30 * second, now)).toBe(false)
    expect(isPresenceFresh(now - 31 * second, now)).toBe(false)
  })

  it("is stale when never seen (lastSeen 0)", () => {
    expect(isPresenceFresh(0, now)).toBe(false)
  })
})

describe("isOffline", () => {
  it("is online at exactly 2min and under", () => {
    expect(isOffline(now - 2 * minute, now)).toBe(false)
    expect(isOffline(now - 119 * second, now)).toBe(false)
  })

  it("is offline just over 2min", () => {
    expect(isOffline(now - 2 * minute - 1, now)).toBe(true)
    expect(isOffline(now - hour, now)).toBe(true)
  })
})

describe("retentionCutoff", () => {
  it("is exactly 30 days before now", () => {
    expect(retentionCutoff(now)).toBe(now - 30 * day)
  })
})

describe("rangeWindow", () => {
  const cases: ReadonlyArray<readonly [HistoryRange, "minute" | "hour", number]> = [
    ["1h", "minute", hour],
    ["24h", "minute", day],
    ["7d", "hour", 7 * day],
    ["30d", "hour", 30 * day],
  ]

  it.each(cases)("%s uses %s rows over the matching span", (range, resolution, span) => {
    expect(rangeWindow(range, now)).toEqual({ resolution, from: now - span, to: now })
  })
})
