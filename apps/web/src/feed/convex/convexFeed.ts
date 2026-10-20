import { QueryResult, useMutation, useQuery } from "@confect/react"
import refs from "@riptide/backend/confect/_generated/refs"
import * as Result from "effect/Result"
import { useCallback, useMemo } from "react"

import { FeedResult, type MetricsFeed } from "../port"

const dashboard = refs.public.dashboard

/**
 * Maps a Confect query result to a {@link FeedResult}. The backend's
 * `Unauthorized` error becomes `unauthorized`, any other typed error
 * `unavailable`. Untyped errors never get here: Confect's `useQuery` throws
 * them to the nearest error boundary.
 */
export const toFeedResult = <A, E extends { readonly _tag: string }>(
  result: QueryResult.QueryResult<A, E>,
): FeedResult<A> => {
  switch (result._tag) {
    case "Loading":
      return FeedResult.loading
    case "Success":
      return FeedResult.ready(result.value)
    case "Failure":
      return FeedResult.failed(result.error._tag === "Unauthorized" ? "unauthorized" : "unavailable")
  }
}

/** Confect keeps a query result's identity while its data is unchanged, so keying on it keeps the FeedResult stable too. */
const useFeedResult = <A, E extends { readonly _tag: string }>(result: QueryResult.QueryResult<A, E>): FeedResult<A> =>
  useMemo(() => toFeedResult(result), [result])

/**
 * {@link MetricsFeed} over the Convex `dashboard` functions, selected by
 * default. Needs the `ConvexProviderWithAuth` from the router. Every function
 * fails `Unauthorized` unless the viewer is ALLOWED_USER_ID.
 */
export const convexFeed: MetricsFeed = {
  useHosts: () => useFeedResult(useQuery(dashboard.hosts)),
  useLive: (host) => useFeedResult(useQuery(dashboard.live, { host })),
  // `to` is the caller's fixed minute (useFixedTo), so this subscription reads a closed range
  // and does not re-run as new rows land.
  useHistory: ({ host, range, to }) => useFeedResult(useQuery(dashboard.history, { host, range, to })),
  useSendHeartbeat: () => {
    const heartbeat = useMutation(dashboard.heartbeat)
    return useCallback(async () => {
      const result = await heartbeat()
      if (Result.isFailure(result)) throw result.failure
    }, [heartbeat])
  },
}
