import { convexFeed } from "./convex/convexFeed"
import { fixtureFeed } from "./fixture/fixtureFeed"
import type { MetricsFeed } from "./port"

const feeds = { convex: convexFeed, fixture: fixtureFeed } satisfies Record<string, MetricsFeed>

/** Names accepted by `VITE_FEED`. */
export type FeedName = keyof typeof feeds

const defaultFeed: FeedName = "convex"

const isFeedName = (name: string): name is FeedName => Object.hasOwn(feeds, name)

const parseFeedName = (name: string | undefined): FeedName => {
  if (name === undefined || isFeedName(name)) return name ?? defaultFeed
  console.warn(`Unknown VITE_FEED "${name}", using the ${defaultFeed} feed`)
  return defaultFeed
}

/** The adapter named by `VITE_FEED`: `convex` (the default) or `fixture`, which needs no backend. */
export const feedName: FeedName = parseFeedName(import.meta.env.VITE_FEED)

/** The {@link MetricsFeed} adapter for {@link feedName}. */
export const selectedFeed: MetricsFeed = feeds[feedName]

/**
 * Whether pages need WorkOS sign-in and the ALLOWED_USER_ID check. Only the
 * convex feed reads real data. The fixture feed never touches Convex, so there
 * is nothing to protect, and skipping auth lets the UI be built and tested
 * without a backend. Any feed other than `fixture` requires auth.
 */
export const requiresAuth: boolean = feedName !== "fixture"
