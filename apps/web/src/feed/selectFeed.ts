import { convexFeed } from "./convex/convexFeed"
import { fixtureFeed } from "./fixture/fixtureFeed"
import type { MetricsFeed } from "./port"

const feeds = { convex: convexFeed, fixture: fixtureFeed } satisfies Record<string, MetricsFeed>

/** Names accepted by `VITE_FEED`. */
export type FeedName = keyof typeof feeds

const defaultFeed: FeedName = "convex"

const isFeedName = (name: string): name is FeedName => Object.hasOwn(feeds, name)

/**
 * Picks the {@link MetricsFeed} adapter named by `VITE_FEED`: `convex` (the
 * default) or `fixture`, which needs no backend.
 */
export const selectFeed = (name: string | undefined = import.meta.env.VITE_FEED): MetricsFeed => {
  if (name === undefined || isFeedName(name)) return feeds[name ?? defaultFeed]
  console.warn(`Unknown VITE_FEED "${name}", using the ${defaultFeed} feed`)
  return feeds[defaultFeed]
}
