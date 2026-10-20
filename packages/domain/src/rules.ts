import { Duration, Schema } from "effect"

import { type Resolution } from "./aggregate"
import { type EpochMillis } from "./primitives"

/** How often the dashboard sends a presence heartbeat while visible. */
export const heartbeatInterval = Duration.seconds(15)
/** Agent upload cadence while a viewer is present. */
export const liveUploadCadence = Duration.seconds(1)
/** Agent upload cadence with no viewer. */
export const idleUploadCadence = Duration.seconds(60)
/** A heartbeat younger than this counts as a present viewer. */
export const presenceFreshness = Duration.seconds(30)
/** A host not updated for longer than this is offline. */
export const offlineThreshold = Duration.minutes(2)
/** Rows older than this are deleted. */
export const retentionPeriod = Duration.days(30)

/** True when the last heartbeat is under {@link presenceFreshness} old. 0 (never seen) is stale. */
export const isPresenceFresh = (lastSeen: EpochMillis, now: EpochMillis): boolean =>
  now - lastSeen < Duration.toMillis(presenceFreshness)

/** True when the host's last update is more than {@link offlineThreshold} old. */
export const isOffline = (updatedAt: EpochMillis, now: EpochMillis): boolean =>
  now - updatedAt > Duration.toMillis(offlineThreshold)

/** Rows with `at` before this are deleted. */
export const retentionCutoff = (now: EpochMillis): EpochMillis => now - Duration.toMillis(retentionPeriod)

/** Time ranges the dashboard can chart. */
export const HistoryRange = Schema.Literals(["1h", "24h", "7d", "30d"])
export type HistoryRange = typeof HistoryRange.Type

/** Query window for a {@link HistoryRange}: which rows to read and between which times. */
export interface RangeWindow {
  readonly resolution: Resolution
  readonly from: EpochMillis
  readonly to: EpochMillis
}

const ranges: Record<HistoryRange, { readonly resolution: Resolution; readonly span: Duration.Duration }> = {
  "1h": { resolution: "minute", span: Duration.hours(1) },
  "24h": { resolution: "minute", span: Duration.hours(24) },
  "7d": { resolution: "hour", span: Duration.days(7) },
  "30d": { resolution: "hour", span: Duration.days(30) },
}

/** Resolution and `[from, to]` window for a range ending at `to`. */
export const rangeWindow = (range: HistoryRange, to: EpochMillis): RangeWindow => {
  const { resolution, span } = ranges[range]
  return { resolution, from: to - Duration.toMillis(span), to }
}
