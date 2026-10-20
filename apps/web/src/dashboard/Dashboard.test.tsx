import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { useSyncExternalStore } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FeedProvider } from "~/feed/context"
import { createFixtureFeed } from "~/feed/fixture/fixtureFeed"
import { FeedResult, type HostSummary, type MetricsFeed } from "~/feed/port"

import { Dashboard } from "./Dashboard"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const renderDashboard = (feed: MetricsFeed = createFixtureFeed({ onHeartbeat: () => {} })) =>
  render(
    <FeedProvider feed={feed}>
      <Dashboard />
    </FeedProvider>,
  )

const section = (name: RegExp) => screen.getByRole("region", { name })
const tile = (name: string) => within(section(/ live$/)).queryByRole("region", { name })
const chart = (name: string) => within(section(/ history$/)).queryByRole("region", { name })

const checkedHost = () =>
  within(screen.getByRole("radiogroup", { name: "Host" }))
    .getAllByRole("radio")
    .find((radio) => radio.getAttribute("aria-checked") === "true")?.textContent

/** The fixture feed with a host list the test controls. */
const withHosts = (initial: ReadonlyArray<HostSummary>) => {
  let hosts = initial
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const feed: MetricsFeed = {
    ...createFixtureFeed({ onHeartbeat: () => {} }),
    useHosts: () => FeedResult.ready(useSyncExternalStore(subscribe, () => hosts)),
  }
  const setHosts = (next: ReadonlyArray<HostSummary>) =>
    act(() => {
      hosts = next
      for (const listener of listeners) listener()
    })
  return { feed, setHosts }
}

describe("Dashboard", () => {
  it("defaults to the most recent host and renders every tile it reports", () => {
    renderDashboard()

    expect(screen.getByRole("radio", { name: "desktop" }).getAttribute("aria-checked")).toBe("true")
    for (const name of ["CPU", "Memory", "Load", "Uptime", "GPU 0", "Temperatures", "Fans", "Disks"]) {
      expect(tile(name), name).not.toBeNull()
    }
    expect(screen.getAllByText("idle")).toHaveLength(1)
    expect(screen.queryByText("Offline")).toBeNull()
  })

  it("omits GPU and sensor tiles for a host without them and shows it offline", () => {
    renderDashboard()

    act(() => fireEvent.click(screen.getByRole("radio", { name: "vm" })))

    for (const name of ["CPU", "Memory", "Load", "Uptime", "Disks"]) {
      expect(tile(name), name).not.toBeNull()
    }
    for (const name of ["GPU 0", "Temperatures", "Fans"]) {
      expect(tile(name), name).toBeNull()
    }
    expect(screen.getByText("Offline")).not.toBeNull()
  })

  it("keeps the default host when another host reports more recently", () => {
    const { feed, setHosts } = withHosts([
      { host: "desktop", updatedAt: 2_000 },
      { host: "vm", updatedAt: 1_000 },
    ])
    renderDashboard(feed)
    expect(checkedHost()).toBe("desktop")

    setHosts([
      { host: "desktop", updatedAt: 2_000 },
      { host: "vm", updatedAt: 3_000 },
    ])

    expect(checkedHost()).toBe("desktop")
  })

  it("falls back to the most recent host when the selected one leaves the list", () => {
    const { feed, setHosts } = withHosts([
      { host: "desktop", updatedAt: 2_000 },
      { host: "vm", updatedAt: 1_000 },
    ])
    renderDashboard(feed)

    setHosts([{ host: "vm", updatedAt: 1_000 }])

    expect(checkedHost()).toBe("vm")
  })

  it("shows thrown feed errors as unavailable and recovers on retry", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const fixture = createFixtureFeed({ onHeartbeat: () => {} })
    let fail = true
    renderDashboard({
      ...fixture,
      useHosts: () => {
        if (fail) throw new Error("network down")
        return fixture.useHosts()
      },
    })
    expect(screen.getByText("Metrics are unavailable right now.")).not.toBeNull()

    fail = false
    act(() => fireEvent.click(screen.getByRole("button", { name: "Retry" })))

    expect(checkedHost()).toBe("desktop")
  })

  it("charts every history metric the host reports", () => {
    renderDashboard()

    for (const name of ["CPU", "Memory", "Load", "Temperatures", "Fans", "Disks", "GPU 0"]) {
      expect(chart(name), name).not.toBeNull()
    }
    expect(screen.getByRole("radio", { name: "1h" }).getAttribute("aria-checked")).toBe("true")
  })

  it("omits GPU and sensor charts for a host without them", () => {
    renderDashboard()

    act(() => fireEvent.click(screen.getByRole("radio", { name: "vm" })))

    for (const name of ["CPU", "Memory", "Load", "Disks"]) {
      expect(chart(name), name).not.toBeNull()
    }
    for (const name of ["GPU 0", "Temperatures", "Fans"]) {
      expect(chart(name), name).toBeNull()
    }
  })
})
