import { rangeWindow, type EpochMillis, type HistoryRange } from "@riptide/domain"
import { useEffect, useMemo, useState } from "react"

import { useHistory, useLive } from "./context"
import { FeedResult } from "./port"
import { appendSample, emptyTail, mergeSeries, tailFor, type Series } from "./series"

/**
 * Chart series for `host` over `range`: the closed history read ending at
 * `to`, extended by live samples at or after `to`. The tail lives in this
 * hook's state and starts over when `host`, `range` or `to` changes.
 *
 * `useLive` only has the latest sample, so samples between `to` and mount are
 * never seen, up to one bucket's worth (59 minutes for 7d and 30d). The series
 * marks that first tail bucket `partial`.
 */
export const useHistorySeries = (host: string, range: HistoryRange, to: EpochMillis): FeedResult<Series> => {
  const history = useHistory({ host, range, to })
  const live = useLive(host)
  const window = useMemo(() => rangeWindow(range, to), [range, to])
  const [stored, setTail] = useState(() => emptyTail(host, window))
  const tail = useMemo(() => tailFor(stored, host, window), [stored, host, window])

  const sample = live._tag === "Ready" ? live.value?.sample : undefined
  useEffect(() => {
    if (sample !== undefined) setTail((prev) => appendSample(tailFor(prev, host, window), sample))
  }, [sample, host, window])

  return useMemo(
    () => (history._tag === "Ready" ? FeedResult.ready(mergeSeries(history.value, tail)) : history),
    [history, tail],
  )
}
