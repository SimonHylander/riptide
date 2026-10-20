import { isOffline, type EpochMillis } from "@riptide/domain"
import { useEffect, useState } from "react"

/** How often time-derived UI (offline badge, "updated … ago") re-evaluates. */
export const nowTickMs = 5_000

/**
 * Current time, refreshed every `tickMs`. Feed queries only re-run when data
 * changes, so anything that depends on elapsed time reads it from here. `null`
 * until mounted, so the server render and hydration agree.
 */
export const useNow = (tickMs: number = nowTickMs): EpochMillis | null => {
  const [now, setNow] = useState<EpochMillis | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), tickMs)
    return () => clearInterval(timer)
  }, [tickMs])
  return now
}

/** Whether a host last updated at `updatedAt` is offline now. `null` until the clock is known. */
export const useIsOffline = (updatedAt: EpochMillis): boolean | null => {
  const now = useNow()
  return now === null ? null : isOffline(updatedAt, now)
}
