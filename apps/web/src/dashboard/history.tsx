import { HistoryRange, type EpochMillis, type Sample } from "@riptide/domain"
import { ClientOnly } from "@tanstack/react-router"
import { useState } from "react"

import { useLive } from "~/feed/context"
import type { FeedResult } from "~/feed/port"
import { bandPoints, idOf, resolutionMs, sampleEntries, type Metric, type MetricId, type Series } from "~/feed/series"
import { useFixedTo } from "~/feed/useFixedTo"
import { useHistorySeries } from "~/feed/useHistorySeries"

import { BandChart, ChartFrame, type Hue, type ValueDomain } from "./charts"
import {
  formatBytes,
  formatCelsius,
  formatClock,
  formatDate,
  formatDateTime,
  formatLoad,
  formatPct,
  formatRpm,
  formatWhole,
} from "./format"
import { FailureNotice, Tile } from "./ui"

/** One selectable series of a chart. */
interface ChartOption {
  readonly id: MetricId
  readonly label: string
  /** Selector group, e.g. the sensor chip. */
  readonly group?: string
  readonly domain: ValueDomain
  readonly format: (value: number) => string
  /** Y axis label when it differs from `format`. */
  readonly axis?: (value: number) => string
}

/** One small multiple: a metric family in one hue, showing one of its options at a time. */
interface ChartFamily {
  readonly title: string
  readonly hue: Hue
  readonly options: ReadonlyArray<ChartOption>
}

const percent = (value: number) => `${formatPct(value)}%`

/** Where a metric is charted: its family, ordered by `order`, and its option there. */
interface Placement {
  readonly order: number
  readonly title: string
  readonly hue: Hue
  readonly option: ChartOption
}

const placementOf = (metric: Metric): Placement => {
  const id = idOf(metric)
  switch (metric.kind) {
    case "cpu":
      return { order: 0, title: "CPU", hue: "cpu", option: { id, label: "total", domain: [0, 100], format: percent } }
    case "memory":
      return {
        order: 1,
        title: "Memory",
        hue: "memory",
        option: { id, label: "used", domain: [0, metric.totalBytes], format: formatBytes },
      }
    case "load1":
      return { order: 2, title: "Load", hue: "load", option: { id, label: "1m", domain: [0, "auto"], format: formatLoad } }
    case "temp":
      return {
        order: 3,
        title: "Temperatures",
        hue: "temp",
        option: { id, label: metric.label, group: metric.chip, domain: ["auto", "auto"], format: formatCelsius },
      }
    case "fan":
      return {
        order: 4,
        title: "Fans",
        hue: "fan",
        option: { id, label: metric.label, group: metric.chip, domain: [0, "auto"], format: formatRpm, axis: formatWhole },
      }
    case "disk":
      return {
        order: 5,
        title: "Disks",
        hue: "disk",
        option: { id, label: metric.mount, domain: [0, metric.totalBytes], format: formatBytes },
      }
    case "gpu": {
      const gpu = { order: 6 + metric.index, title: `GPU ${metric.index}`, hue: "gpu" } as const
      switch (metric.field) {
        case "utilization":
          return { ...gpu, option: { id, label: "utilization", domain: [0, 100], format: percent } }
        case "memory":
          return { ...gpu, option: { id, label: "memory", domain: [0, metric.totalBytes ?? "auto"], format: formatBytes } }
        case "temperature":
          return { ...gpu, option: { id, label: "temperature", domain: ["auto", "auto"], format: formatCelsius } }
      }
    }
  }
}

/**
 * The charts a host gets: every metric in its latest sample or with a visible
 * point in `series`, so a sensor that stops reporting keeps its chart while its
 * history is in range. Current readings come first and set the totals.
 * Families without a metric are left out.
 */
export const chartFamilies = (sample: Sample, series?: Series): ReadonlyArray<ChartFamily> => {
  const metrics = new Map(sampleEntries(sample).map(([metric]) => [idOf(metric), metric] as const))
  for (const [id, metric] of series?.metrics ?? []) if (!metrics.has(id)) metrics.set(id, metric)

  const families = new Map<string, { readonly order: number; readonly family: ChartFamily }>()
  for (const metric of metrics.values()) {
    const { order, title, hue, option } = placementOf(metric)
    const options = families.get(title)?.family.options ?? []
    families.set(title, { order, family: { title, hue, options: [...options, option] } })
  }
  return [...families.values()].toSorted((a, b) => a.order - b.order).map(({ family }) => family)
}

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

/** X axis tick spacing and label per range. */
const rangeAxis = {
  "1h": { step: 15 * minute, label: formatClock },
  "24h": { step: 6 * hour, label: formatClock },
  "7d": { step: 2 * day, label: formatDate },
  "30d": { step: 7 * day, label: formatDate },
} satisfies Record<HistoryRange, { readonly step: number; readonly label: (at: EpochMillis) => string }>

/** Ticks every `step` inside `[from, to]`, aligned to local midnight so day ticks land on dates. */
const timeTicks = (from: EpochMillis, to: EpochMillis, step: number): ReadonlyArray<EpochMillis> => {
  const offset = new Date(from).getTimezoneOffset() * minute
  const ticks: Array<EpochMillis> = []
  for (let at = Math.ceil((from - offset) / step) * step + offset; at <= to; at += step) ticks.push(at)
  return ticks
}

/** History charts for `host` below its live tiles, with a range picker. */
export const HistorySection = ({ host }: { readonly host: string }) => {
  const live = useLive(host)
  const [range, setRange] = useState<HistoryRange>("1h")
  const to = useFixedTo(host, range)
  const series = useHistorySeries(host, range, to)

  if (live._tag !== "Ready" || live.value === null) return null
  const families = chartFamilies(live.value.sample, series._tag === "Ready" ? series.value : undefined)

  return (
    <section aria-label={`${host} history`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">History</h2>
        <RangePicker range={range} onSelect={setRange} />
      </div>
      {series._tag === "Failed" ? (
        <FailureNotice reason={series.reason} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {families.map((family) => (
            <ChartTile key={family.title} family={family} series={series} range={range} />
          ))}
        </div>
      )}
    </section>
  )
}

const RangePicker = ({
  range,
  onSelect,
}: {
  readonly range: HistoryRange
  readonly onSelect: (range: HistoryRange) => void
}) => (
  <div role="radiogroup" aria-label="Range" className="flex gap-1">
    {HistoryRange.literals.map((option) => (
      <button
        key={option}
        type="button"
        role="radio"
        aria-checked={option === range}
        onClick={() => onSelect(option)}
        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
          option === range ? "border-line bg-panel text-ink" : "border-transparent text-muted hover:text-ink"
        }`}
      >
        {option}
      </button>
    ))}
  </div>
)

/** One family's chart, with a selector when the family has several series. */
const ChartTile = ({
  family,
  series,
  range,
}: {
  readonly family: ChartFamily
  readonly series: FeedResult<Series>
  readonly range: HistoryRange
}) => {
  const [picked, setPicked] = useState<MetricId>()
  const option = family.options.find(({ id }) => id === picked) ?? family.options[0]
  if (option === undefined) return null

  return (
    <Tile
      title={family.title}
      aside={
        family.options.length > 1 ? (
          <OptionSelect family={family} selected={option.id} onSelect={setPicked} />
        ) : (
          option.label
        )
      }
    >
      <ClientOnly fallback={<ChartFrame />}>
        <ChartBody series={series} option={option} family={family} range={range} />
      </ClientOnly>
    </Tile>
  )
}

const ChartBody = ({
  series,
  option,
  family,
  range,
}: {
  readonly series: FeedResult<Series>
  readonly option: ChartOption
  readonly family: ChartFamily
  readonly range: HistoryRange
}) => {
  if (series._tag !== "Ready") return <ChartFrame>Loading…</ChartFrame>
  const points = bandPoints(series.value, option.id)
  if (points.length === 0) return <ChartFrame>No data in this range.</ChartFrame>

  const { from, to } = series.value
  const axis = rangeAxis[range]
  return (
    <BandChart
      points={points}
      from={from}
      to={to}
      step={resolutionMs[series.value.resolution]}
      ticks={timeTicks(from, to, axis.step)}
      hue={family.hue}
      domain={option.domain}
      formatTick={axis.label}
      formatTime={formatDateTime}
      formatValue={option.format}
      formatAxis={option.axis ?? option.format}
    />
  )
}

const groupOptions = (options: ReadonlyArray<ChartOption>) =>
  options.reduce((groups, option) => {
    const group = option.group ?? ""
    groups.set(group, [...(groups.get(group) ?? []), option])
    return groups
  }, new Map<string, ReadonlyArray<ChartOption>>())

const OptionSelect = ({
  family,
  selected,
  onSelect,
}: {
  readonly family: ChartFamily
  readonly selected: MetricId
  readonly onSelect: (id: MetricId) => void
}) => (
  <select
    aria-label={`${family.title} series`}
    value={selected}
    onChange={(event) => {
      const next = family.options.find(({ id }) => id === event.target.value)
      if (next !== undefined) onSelect(next.id)
    }}
    className="max-w-40 truncate rounded border border-line bg-panel px-1 py-0.5 text-[11px] text-ink"
  >
    {[...groupOptions(family.options)].map(([group, options]) => {
      const items = options.map(({ id, label }) => (
        <option key={id} value={id}>
          {label}
        </option>
      ))
      return group === "" ? items : <optgroup key={group} label={group}>{items}</optgroup>
    })}
  </select>
)
