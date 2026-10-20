import { fixtureFeed } from "./fixture/fixtureFeed"
import type { MetricsFeed } from "./port"

const feeds = { fixture: fixtureFeed } satisfies Record<string, MetricsFeed>

/** Names accepted by `VITE_FEED`. */
export type FeedName = keyof typeof feeds

const isFeedName = (name: string): name is FeedName => Object.hasOwn(feeds, name)

/**
 * Picks the {@link MetricsFeed} adapter named by `VITE_FEED`. The fixture
 * adapter is the only one and the default. The Convex adapter is registered
 * in `feeds` once the backend lands, and becomes the default then.
 */
export const selectFeed = (name: string | undefined = import.meta.env.VITE_FEED): MetricsFeed => {
  if (name === undefined || isFeedName(name)) return feeds[name ?? "fixture"]
  console.warn(`Unknown VITE_FEED "${name}", using the fixture feed`)
  return feeds.fixture
}
