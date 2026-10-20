import type { EpochMillis, HistoryRange } from "@riptide/domain"
import { useState } from "react"

/** `at` rounded down to the start of its minute. */
export const floorToMinute = (at: EpochMillis): EpochMillis => Math.floor(at / 60_000) * 60_000

/**
 * End of the history window: the current minute, floored, taken on mount.
 * It stays fixed across re-renders and only moves when `range` or `host`
 * changes, so the history read is a closed range and newer data arrives
 * through the live tail instead.
 */
export const useFixedTo = (host: string, range: HistoryRange, now: () => EpochMillis = Date.now): EpochMillis => {
  const [fixed, setFixed] = useState(() => ({ host, range, to: floorToMinute(now()) }))
  if (fixed.host === host && fixed.range === range) return fixed.to

  // Adjusting state during render: React re-renders before committing.
  const next = { host, range, to: floorToMinute(now()) }
  setFixed(next)
  return next.to
}
