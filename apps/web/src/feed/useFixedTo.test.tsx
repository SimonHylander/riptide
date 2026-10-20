import type { HistoryRange } from "@riptide/domain"
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useFixedTo } from "./useFixedTo"

afterEach(cleanup)

const minute = 60_000
const start = 1_800_000_000_000 - (1_800_000_000_000 % minute)

/** A clock the test moves by hand. */
const clock = (at: number) => {
  let now = at
  return { now: () => now, set: (next: number) => (now = next) }
}

describe("useFixedTo", () => {
  it("floors the mount time to the minute and holds it across re-renders", () => {
    const time = clock(start + 42_500)
    const { result, rerender } = renderHook(() => useFixedTo("desktop", "1h", time.now))
    expect(result.current).toBe(start)

    time.set(start + 5 * minute)
    rerender()
    expect(result.current).toBe(start)
  })

  it("moves to the current minute when the range or host changes", () => {
    const time = clock(start)
    const { result, rerender } = renderHook(
      ({ host, range }: { host: string; range: HistoryRange }) => useFixedTo(host, range, time.now),
      { initialProps: { host: "desktop", range: "1h" } },
    )

    time.set(start + 3 * minute + 10_000)
    rerender({ host: "desktop", range: "7d" })
    expect(result.current).toBe(start + 3 * minute)

    time.set(start + 8 * minute)
    rerender({ host: "vm", range: "7d" })
    expect(result.current).toBe(start + 8 * minute)

    time.set(start + 9 * minute)
    rerender({ host: "vm", range: "7d" })
    expect(result.current).toBe(start + 8 * minute)
  })
})
