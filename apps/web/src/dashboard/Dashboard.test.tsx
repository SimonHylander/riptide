import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { FeedProvider } from "~/feed/context"
import { createFixtureFeed } from "~/feed/fixture/fixtureFeed"

import { Dashboard } from "./Dashboard"

afterEach(cleanup)

const renderDashboard = () =>
  render(
    <FeedProvider feed={createFixtureFeed({ onHeartbeat: () => {} })}>
      <Dashboard />
    </FeedProvider>,
  )

const tile = (name: string) => screen.queryByRole("region", { name })

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
})
