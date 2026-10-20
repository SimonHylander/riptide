import { HistoryRange, type EpochMillis, type Sample } from "@riptide/domain"
import { ClientOnly } from "@tanstack/react-router"
import { useState } from "react"

import { useLive } from "~/feed/context"
import type { FeedResult } from "~/feed/port"
import { bandPoints, metricId, type MetricId, type Series } from "~/feed/series"
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

/** The charts a host gets, from its latest sample. Families it does not report are left out. */
export const chartFamilies = (sample: Sample): ReadonlyArray<ChartFamily> => {
  const families: ReadonlyArray<ChartFamily> = [
    { title: "CPU", hue: "cpu", options: [{ id: "cpu", label: "total", domain: [0, 100], format: percent }] },
    {
      title: "Memory",
      hue: "memory",
      options: [{ id: "memory", label: "used", domain: [0, sample.memory.totalBytes], format: formatBytes }],
    },
    { title: "Load", hue: "load", options: [{ id: "load1", label: "1m", domain: [0, "auto"], format: formatLoad }] },
    {
      title: "Temperatures",
      hue: "temp",
      options: sample.sensors.temps.map(({ chip, label }) => ({
        id: metricId.temp(chip, label),
        label,
        group: chip,
        domain: ["auto", "auto"],
        format: formatCelsius,
      })),
    },
    {
      title: "Fans",
      hue: "fan",
      options: sample.sensors.fans.map(({ chip, label }) => ({
        id: metricId.fan(chip, label),
        label,
        group: chip,
        domain: [0, "auto"],
        format: formatRpm,
        axis: formatWhole,
      })),
    },
    {
      title: "Disks",
      hue: "disk",
      options: sample.disks.map(({ mount, totalBytes }) => ({
        id: metricId.disk(mount),
        label: mount,
        domain: [0, totalBytes],
        format: formatBytes,
      })),
    },
    ...sample.gpus.map((gpu): ChartFamily => ({
        title: `GPU ${gpu.index}`,
        hue: "gpu",
        options: [
          { id: metricId.gpu(gpu.index, "utilization"), label: "utilization", domain: [0, 100], format: percent },
          {
            id: metricId.gpu(gpu.index, "memory"),
            label: "memory",
            domain: [0, gpu.memoryTotalBytes],
            format: formatBytes,
          },
          ...(gpu.temperatureCelsius === undefined
            ? []
            : [
                {
                  id: metricId.gpu(gpu.index, "temperature"),
                  label: "temperature",
                  domain: ["auto", "auto"],
                  format: formatCelsius,
                } satisfies ChartOption,
              ]),
        ],
      })),
  ]
  return families.filter((family) => family.options.length > 0)
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
  const families = chartFamilies(live.value.sample)

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
