import { useSyncExternalStore } from "react"

import { FeedResult, type HostSummary, type LiveSnapshot, type MetricsFeed } from "../port"
import { fixtureHosts, type FixtureHost } from "./hosts"
import { nextSample, seededRandom } from "./simulate"

export interface FixtureFeedOptions {
  readonly hosts?: ReadonlyArray<FixtureHost>
  readonly seed?: number
  readonly tickMs?: number
  /** Called on every heartbeat. Defaults to a debug log. */
  readonly onHeartbeat?: () => void
}

interface FixtureState {
  readonly entries: ReadonlyArray<{ readonly fixture: FixtureHost; readonly snapshot: LiveSnapshot }>
  readonly hosts: ReadonlyArray<HostSummary>
  readonly live: ReadonlyMap<string, LiveSnapshot>
}

const toState = (entries: FixtureState["entries"]): FixtureState => ({
  entries,
  hosts: entries.map(({ snapshot }) => ({ host: snapshot.host, updatedAt: snapshot.updatedAt })),
  live: new Map(entries.map(({ snapshot }) => [snapshot.host, snapshot])),
})

/**
 * In-memory {@link MetricsFeed} for building and testing the UI without a
 * backend. Ticking hosts get a new random-walk sample every `tickMs` while
 * anything is subscribed. Other hosts keep their first sample, so a host with
 * a large `staleForMs` reads as offline. The first state is seeded, so server
 * and client render the same values.
 */
export const createFixtureFeed = ({
  hosts = fixtureHosts,
  seed = 9,
  tickMs = 1000,
  onHeartbeat = () => console.debug("[fixture feed] heartbeat", new Date().toISOString()),
}: FixtureFeedOptions = {}): MetricsFeed => {
  const random = seededRandom(seed)
  const startedAt = Date.now()
  const initial = toState(
    hosts.map((fixture) => {
      const at = startedAt - fixture.staleForMs
      return { fixture, snapshot: { host: fixture.host, updatedAt: at, sample: fixture.initial(at, random) } }
    }),
  )

  let state = initial
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setInterval> | undefined

  const tick = () => {
    const at = Date.now()
    state = toState(
      state.entries.map((entry) =>
        entry.fixture.ticks
          ? {
              fixture: entry.fixture,
              snapshot: { host: entry.snapshot.host, updatedAt: at, sample: nextSample(entry.snapshot.sample, at, random) },
            }
          : entry,
      ),
    )
    for (const listener of listeners) listener()
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    timer ??= setInterval(tick, tickMs)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        clearInterval(timer)
        timer = undefined
      }
    }
  }

  const useFixtureState = () =>
    useSyncExternalStore(
      subscribe,
      () => state,
      () => initial,
    )

  const sendHeartbeat = async () => onHeartbeat()

  return {
    useHosts: () => FeedResult.ready(useFixtureState().hosts),
    useLive: (host) => FeedResult.ready(useFixtureState().live.get(host) ?? null),
    useSendHeartbeat: () => sendHeartbeat,
  }
}

/** The app-wide fixture feed, selected with `VITE_FEED=fixture`. */
export const fixtureFeed = createFixtureFeed()
