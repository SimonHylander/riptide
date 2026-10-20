import { isOffline, type EpochMillis, type Sample } from "@riptide/domain"
import { useState, type ReactNode } from "react"

import { useHeartbeat, useHosts, useLive } from "~/feed/context"
import type { FeedFailure, HostSummary, LiveSnapshot } from "~/feed/port"

import { formatAgo } from "./format"
import { CpuTile, DisksTile, FansTile, GpuTile, LoadTile, MemoryTile, TempsTile, UptimeTile } from "./tiles"
import { useIsOffline, useNow } from "./useNow"

/** The most recently updated host, the default selection. */
export const mostRecentHost = (hosts: ReadonlyArray<HostSummary>): string | undefined =>
  hosts.reduce<HostSummary | undefined>((latest, host) => (latest && latest.updatedAt >= host.updatedAt ? latest : host), undefined)
    ?.host

/** Live dashboard: host picker, then tiles for the selected host. Sends presence heartbeats while visible. */
export const Dashboard = () => {
  useHeartbeat()
  const hosts = useHosts()
  const [picked, setPicked] = useState<string>()

  if (hosts._tag === "Loading") return <Shell><Notice>Loading hosts…</Notice></Shell>
  if (hosts._tag === "Failed") return <Shell><FailureNotice reason={hosts.reason} /></Shell>

  const known = picked !== undefined && hosts.value.some(({ host }) => host === picked)
  const selected = known ? picked : mostRecentHost(hosts.value)
  if (selected === undefined) return <Shell><Notice>No host has reported yet.</Notice></Shell>

  return (
    <Shell picker={<HostPicker hosts={hosts.value} selected={selected} onSelect={setPicked} />}>
      <LiveSection key={selected} host={selected} />
      {/* History charts for `selected` go here, below the live tiles. */}
    </Shell>
  )
}

const Shell = ({ picker, children }: { readonly picker?: ReactNode; readonly children: ReactNode }) => (
  <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <span className="text-xs font-semibold tracking-[0.3em] uppercase">Riptide</span>
      {picker}
    </header>
    <main className="mt-6 space-y-8">{children}</main>
  </div>
)

const Notice = ({ children }: { readonly children: ReactNode }) => <p className="py-12 text-center text-sm text-muted">{children}</p>

const FailureNotice = ({ reason }: { readonly reason: FeedFailure }) => (
  <Notice>{reason === "unauthorized" ? "Not authorized to read metrics." : "Metrics are unavailable right now."}</Notice>
)

const HostPicker = ({
  hosts,
  selected,
  onSelect,
}: {
  readonly hosts: ReadonlyArray<HostSummary>
  readonly selected: string
  readonly onSelect: (host: string) => void
}) => (
  <div role="radiogroup" aria-label="Host" className="flex flex-wrap gap-1">
    {hosts.map((summary) => (
      <HostOption key={summary.host} summary={summary} checked={summary.host === selected} onSelect={onSelect} />
    ))}
  </div>
)

const HostOption = ({
  summary,
  checked,
  onSelect,
}: {
  readonly summary: HostSummary
  readonly checked: boolean
  readonly onSelect: (host: string) => void
}) => {
  const offline = useIsOffline(summary.updatedAt)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={() => onSelect(summary.host)}
      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
        checked ? "border-line bg-panel text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      <StatusDot offline={offline} />
      {summary.host}
    </button>
  )
}

const StatusDot = ({ offline }: { readonly offline: boolean | null }) => (
  <span
    aria-hidden
    className={`size-1.5 rounded-full ${offline === null ? "bg-line" : offline ? "bg-crit" : "bg-ok"}`}
  />
)

/** Live tiles for one host, with its online/offline state. */
const LiveSection = ({ host }: { readonly host: string }) => {
  const live = useLive(host)
  const now = useNow()

  if (live._tag === "Loading") return <Notice>Loading {host}…</Notice>
  if (live._tag === "Failed") return <FailureNotice reason={live.reason} />
  if (live.value === null) return <Notice>No sample from {host} yet.</Notice>

  const offline = now !== null && isOffline(live.value.updatedAt, now)
  return (
    <section aria-label={`${host} live`} className="space-y-4">
      <HostHeader snapshot={live.value} now={now} />
      <div className={`transition-opacity ${offline ? "opacity-60" : ""}`}>
        <HostTiles sample={live.value.sample} />
      </div>
    </section>
  )
}

const HostHeader = ({ snapshot, now }: { readonly snapshot: LiveSnapshot; readonly now: EpochMillis | null }) => (
  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
    <h1 className="text-2xl font-semibold tracking-tight">{snapshot.host}</h1>
    {now !== null && <HostStatus updatedAt={snapshot.updatedAt} now={now} />}
  </div>
)

/** Offline badge with "last seen", or a live marker with "updated". */
const HostStatus = ({ updatedAt, now }: { readonly updatedAt: EpochMillis; readonly now: EpochMillis }) =>
  isOffline(updatedAt, now) ? (
    <p className="flex items-center gap-2 text-xs">
      <span className="rounded border border-crit/40 bg-crit/10 px-1.5 py-0.5 font-medium tracking-[0.12em] text-crit uppercase">
        Offline
      </span>
      <span className="text-muted">last seen {formatAgo(now - updatedAt)}</span>
    </p>
  ) : (
    <p className="flex items-center gap-2 text-xs">
      <span className="flex items-center gap-1.5 font-medium tracking-[0.12em] text-ok uppercase">
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-ok" />
        Live
      </span>
      <span className="text-muted">updated {formatAgo(now - updatedAt)}</span>
    </p>
  )

/** The tile grid. Tiles appear only for readings the host reports. */
const HostTiles = ({ sample }: { readonly sample: Sample }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <CpuTile cpu={sample.cpu} />
    <MemoryTile memory={sample.memory} />
    <div className="grid gap-3">
      <LoadTile host={sample.host} cores={sample.cpu.coresPct.length} />
      <UptimeTile uptimeSeconds={sample.host.uptimeSeconds} />
    </div>
    {sample.gpus.map((gpu) => (
      <GpuTile key={gpu.index} gpu={gpu} />
    ))}
    {sample.sensors.temps.length > 0 && <TempsTile temps={sample.sensors.temps} />}
    {sample.sensors.fans.length > 0 && <FansTile fans={sample.sensors.fans} />}
    {sample.disks.length > 0 && <DisksTile disks={sample.disks} />}
  </div>
)
