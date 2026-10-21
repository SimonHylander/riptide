import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useIsOffline } from "./useNow"

const start = 1_800_000_000_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(start)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useIsOffline", () => {
  it("flips to offline as time passes without new data", () => {
    // Updated 110s ago: online now, past the 2 minute threshold within 15s.
    const { result } = renderHook(() => useIsOffline(start - 110_000))
    expect(result.current).toBe(false)

    act(() => vi.advanceTimersByTime(5_000))
    expect(result.current).toBe(false)

    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current).toBe(true)
  })

  it("comes back online when the host updates", () => {
    const { result, rerender } = renderHook(({ updatedAt }) => useIsOffline(updatedAt), {
      initialProps: { updatedAt: start - 300_000 },
    })
    expect(result.current).toBe(true)

    rerender({ updatedAt: start })
    expect(result.current).toBe(false)
  })
})
