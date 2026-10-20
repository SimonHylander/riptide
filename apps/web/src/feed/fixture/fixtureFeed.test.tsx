import { rangeWindow, type HistoryRange } from "@riptide/domain"
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { HistoryQuery } from "../port"
import { floorToResolution } from "../useFixedTo"
import { createFixtureFeed } from "./fixtureFeed"
import { vm } from "./hosts"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const minute = 60_000
const startedAt = 1_800_000_000_000 - (1_800_000_000_000 % minute)
// Page load a little after the feed started, `to` floored to the minute.
const to = startedAt + 10 * minute

const readHistory = (query: HistoryQuery) => {
  vi.useFakeTimers()
  vi.setSystemTime(startedAt)
  const feed = createFixtureFeed({ onHeartbeat: () => {} })
  const { result } = renderHook(() => feed.useHistory(query))
  if (result.current._tag !== "Ready") throw new Error("fixture history is always ready")
  return result.current.value
}

describe("fixture useHistory", () => {
  it.each([
    ["1h", "minute", 60_000, 60],
    ["24h", "minute", 60_000, 1_440],
    ["7d", "hour", 3_600_000, 168],
    ["30d", "hour", 3_600_000, 720],
  ] as const)("%s reads %s rows inside [from, to)", (range: HistoryRange, resolution, step, count) => {
    const rangeTo = floorToResolution(range, to)
    const { from } = rangeWindow(range, rangeTo)
    const rows = readHistory({ host: "desktop", range, to: rangeTo })

    expect(rows).toHaveLength(count)
    for (const [i, row] of rows.entries()) {
      expect(row.resolution).toBe(resolution)
      expect(row.at % step).toBe(0)
      expect(row.at).toBeGreaterThanOrEqual(from)
      expect(row.at).toBeLessThan(rangeTo)
      if (i > 0) expect(row.at - (rows[i - 1]?.at ?? 0)).toBe(step)
    }
  })

  it("leaves out the bucket in progress at `to`", () => {
    const rows = readHistory({ host: "desktop", range: "7d", to })

    expect(rows.at(-1)?.at).toBe(floorToResolution("7d", to) - 3_600_000)
  })

  it("gives the same bucket the same values whatever the window", () => {
    const short = readHistory({ host: "desktop", range: "1h", to })
    const long = readHistory({ host: "desktop", range: "24h", to })

    expect(long.slice(-60)).toEqual(short)
  })

  it("shapes rows like the host and stops at its last report", () => {
    const [desktopRow] = readHistory({ host: "desktop", range: "1h", to })
    const vmRows = readHistory({ host: "vm", range: "1h", to })

    expect(desktopRow?.gpus).toHaveLength(1)
    expect(desktopRow?.sensors.temps.length).toBeGreaterThan(0)
    expect(vmRows.every((row) => row.gpus.length === 0 && row.sensors.temps.length === 0)).toBe(true)
    expect(vmRows.at(-1)?.at).toBe(startedAt - vm.staleForMs)
  })

  it("has no rows for an unknown host", () => {
    expect(readHistory({ host: "nope", range: "1h", to })).toEqual([])
  })
})
