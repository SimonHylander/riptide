import type { EpochMillis, Sample } from "@riptide/domain"

/** Why a feed read failed. `unauthorized` is the backend's `Unauthorized` error. */
export type FeedFailure = "unauthorized" | "unavailable"

/** State of one feed read: still loading, a value, or a failure. */
export type FeedResult<A> =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Ready"; readonly value: A }
  | { readonly _tag: "Failed"; readonly reason: FeedFailure }

/** Constructors for {@link FeedResult}. */
export const FeedResult = {
  loading: { _tag: "Loading" } as const satisfies FeedResult<never>,
  ready: <A>(value: A): FeedResult<A> => ({ _tag: "Ready", value }),
  failed: (reason: FeedFailure): FeedResult<never> => ({ _tag: "Failed", reason }),
}

/** A host that has reported at least once, with its last update time. */
export interface HostSummary {
  readonly host: string
  readonly updatedAt: EpochMillis
}

/** The latest sample of a host. */
export interface LiveSnapshot extends HostSummary {
  readonly sample: Sample
}

/**
 * The dashboard's only data source. Components never talk to a backend
 * directly, they call the hooks in `./context`, which delegate to the adapter
 * provided by `FeedProvider`.
 *
 * Every member is a React hook. An adapter is chosen once at startup and never
 * swapped, so calling its hooks keeps the rules of hooks. New reads (history)
 * are added as new members without changing the existing ones.
 */
export interface MetricsFeed {
  /** All hosts that have reported. */
  readonly useHosts: () => FeedResult<ReadonlyArray<HostSummary>>
  /** Latest sample for `host`, `null` when the host has never reported. */
  readonly useLive: (host: string) => FeedResult<LiveSnapshot | null>
  /** Returns a function that records one presence heartbeat. */
  readonly useSendHeartbeat: () => () => Promise<void>
}
