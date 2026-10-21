import { cleanup, renderHook } from "@testing-library/react"
import { Duration } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useHeartbeatLoop } from "./useHeartbeatLoop"

let visibility: DocumentVisibilityState = "visible"

const setVisibility = (next: DocumentVisibilityState) => {
  visibility = next
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = "visible"
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useHeartbeatLoop", () => {
  const interval = Duration.seconds(15)

  it("sends at once and every interval while visible", () => {
    const send = vi.fn(async () => {})
    renderHook(() => useHeartbeatLoop(send, interval))

    expect(send).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(45_000)
    expect(send).toHaveBeenCalledTimes(4)
  })

  it("stops when hidden and resumes immediately when visible again", () => {
    const send = vi.fn(async () => {})
    renderHook(() => useHeartbeatLoop(send, interval))

    setVisibility("hidden")
    vi.advanceTimersByTime(60_000)
    expect(send).toHaveBeenCalledTimes(1)

    setVisibility("visible")
    expect(send).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(15_000)
    expect(send).toHaveBeenCalledTimes(3)
  })

  it("does not send while starting hidden", () => {
    visibility = "hidden"
    const send = vi.fn(async () => {})
    renderHook(() => useHeartbeatLoop(send, interval))

    vi.advanceTimersByTime(60_000)
    expect(send).not.toHaveBeenCalled()
  })

  it("stops on unmount", () => {
    const send = vi.fn(async () => {})
    const { unmount } = renderHook(() => useHeartbeatLoop(send, interval))

    unmount()
    vi.advanceTimersByTime(60_000)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
