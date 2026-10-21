import { heartbeatInterval } from "@riptide/domain"
import { Duration } from "effect"
import { useEffect, useEffectEvent } from "react"

/**
 * Calls `send` immediately and then every `interval` while the tab is visible.
 * Hiding the tab stops the timer, showing it again sends at once and restarts
 * it. Shared by every adapter, which only supplies `send`. Failed sends are
 * logged and the loop keeps going.
 */
export const useHeartbeatLoop = (
  send: () => Promise<void>,
  interval: Duration.Duration = heartbeatInterval,
): void => {
  const beat = useEffectEvent(() => {
    send().catch((error: unknown) => console.warn("heartbeat failed", error))
  })
  const intervalMs = Duration.toMillis(interval)

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined

    const sync = () => {
      if (document.visibilityState === "visible") {
        if (timer !== undefined) return
        beat()
        timer = setInterval(beat, intervalMs)
      } else {
        clearInterval(timer)
        timer = undefined
      }
    }

    sync()
    document.addEventListener("visibilitychange", sync)
    return () => {
      document.removeEventListener("visibilitychange", sync)
      clearInterval(timer)
    }
  }, [intervalMs])
}
