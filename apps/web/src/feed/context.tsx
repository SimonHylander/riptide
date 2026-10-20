import { createContext, use, type ReactNode } from "react"

import type { HistoryQuery, MetricsFeed } from "./port"
import { useHeartbeatLoop } from "./useHeartbeatLoop"

const FeedContext = createContext<MetricsFeed | null>(null)

/** Provides the {@link MetricsFeed} adapter to the tree. Pass one stable adapter for the app's lifetime. */
export const FeedProvider = ({ feed, children }: { readonly feed: MetricsFeed; readonly children: ReactNode }) => (
  <FeedContext value={feed}>{children}</FeedContext>
)

const useFeed = (): MetricsFeed => {
  const feed = use(FeedContext)
  if (feed === null) throw new Error("useFeed must be used inside <FeedProvider>")
  return feed
}

/** All hosts that have reported. */
export const useHosts = () => useFeed().useHosts()

/** Latest sample for `host`. */
export const useLive = (host: string) => useFeed().useLive(host)

/** Aggregate rows for a closed history window. */
export const useHistory = (query: HistoryQuery) => useFeed().useHistory(query)

/** Sends presence heartbeats while the tab is visible. Mount once per page. */
export const useHeartbeat = (): void => useHeartbeatLoop(useFeed().useSendHeartbeat())
