import { rangeWindow, type EpochMillis, type HistoryRange } from "@riptide/domain"
import { useState } from "react"

import { resolutionMs } from "./series"

/** `at` rounded down to the start of its `range`'s bucket: the minute for 1h and 24h, the hour for 7d and 30d. */
export const floorToResolution = (range: HistoryRange, at: EpochMillis): EpochMillis => {
  const step = resolutionMs[rangeWindow(range, at).resolution]
  return Math.floor(at / step) * step
}

/**
 * End of the history window: the current time floored to the range's
 * resolution, taken on mount. Every history row before it is a completed
 * bucket, so history and the live tail never share one. It stays fixed across
 * re-renders and only moves when `range` or `host` changes, so the history
 * read is a closed range and newer data arrives through the live tail instead.
 */
export const useFixedTo = (host: string, range: HistoryRange, now: () => EpochMillis = Date.now): EpochMillis => {
  const [fixed, setFixed] = useState(() => ({ host, range, to: floorToResolution(range, now()) }))
  if (fixed.host === host && fixed.range === range) return fixed.to

  // Adjusting state during render: React re-renders before committing.
  const next = { host, range, to: floorToResolution(range, now()) }
  setFixed(next)
  return next.to
}
