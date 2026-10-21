import type { HistoryRange } from "@riptide/domain"
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useFixedTo } from "./useFixedTo"

afterEach(cleanup)

const minute = 60_000
const hour = 60 * minute
const start = 1_800_000_000_000 - (1_800_000_000_000 % hour)

/** A clock the test moves by hand. */
const clock = (at: number) => {
  let now = at
  return { now: () => now, set: (next: number) => (now = next) }
}

describe("useFixedTo", () => {
  it("floors the mount time to the minute for 1h and holds it across re-renders", () => {
    const time = clock(start + 42_500)
    const { result, rerender } = renderHook(() => useFixedTo("desktop", "1h", time.now))
    expect(result.current).toBe(start)

    time.set(start + 5 * minute)
    rerender()
    expect(result.current).toBe(start)
  })

  it.each([
    ["1h", start + 30 * minute],
    ["24h", start + 30 * minute],
    ["7d", start],
    ["30d", start],
  ] as const)("floors %s to its resolution, so history only holds completed buckets", (range: HistoryRange, expected) => {
    const time = clock(start + 30 * minute + 10_000)
    const { result } = renderHook(() => useFixedTo("desktop", range, time.now))
    expect(result.current).toBe(expected)
  })

  it("moves to the current bucket when the range or host changes", () => {
    const time = clock(start)
    const { result, rerender } = renderHook(
      ({ host, range }: { host: string; range: HistoryRange }) => useFixedTo(host, range, time.now),
      { initialProps: { host: "desktop", range: "1h" } },
    )

    time.set(start + 3 * minute + 10_000)
    rerender({ host: "desktop", range: "24h" })
    expect(result.current).toBe(start + 3 * minute)

    time.set(start + hour + 8 * minute)
    rerender({ host: "desktop", range: "7d" })
    expect(result.current).toBe(start + hour)

    time.set(start + 2 * hour + 8 * minute)
    rerender({ host: "vm", range: "7d" })
    expect(result.current).toBe(start + 2 * hour)

    time.set(start + 3 * hour)
    rerender({ host: "vm", range: "7d" })
    expect(result.current).toBe(start + 2 * hour)
  })
})
