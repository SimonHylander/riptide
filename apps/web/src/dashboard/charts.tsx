import type { EpochMillis } from "@riptide/domain"
import { useMemo, type ReactNode } from "react"
import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts"

import type { BandPoint } from "~/feed/series"

/** Chart hue per metric family, see the `--color-chart-*` tokens in `app.css`. */
export type Hue = "cpu" | "memory" | "load" | "temp" | "fan" | "disk" | "gpu"

/** Y axis bounds: a fixed value or `auto` to fit the data. */
export type ValueDomain = readonly [number | "auto", number | "auto"]

/** Plot height of every history chart, in px. Placeholders use it too, so nothing shifts on mount. */
export const chartHeight = 112

/** Fixed-height box for a chart's loading, empty and server-rendered states. */
export const ChartFrame = ({ children }: { readonly children?: ReactNode }) => (
  <div style={{ height: chartHeight }} className="flex items-center justify-center text-[11px] text-muted">
    {children}
  </div>
)

const axisTick = { fontSize: 10, fill: "var(--color-muted)" }

/** Recharts wraps tick labels at spaces, keep `21.4 GiB` on one line. */
const noWrap = (format: (value: number) => string) => (value: number) => format(value).replaceAll(" ", "\u00a0")

/**
 * Small-multiple history chart: the min–max range as a translucent band and
 * the average as a line, in one hue. `null` points leave gaps. Render it
 * client-only, its size and time labels depend on the browser.
 */
export const BandChart = ({
  points,
  from,
  to,
  ticks,
  hue,
  domain,
  formatTick,
  formatTime,
  formatValue,
  formatAxis,
}: {
  readonly points: ReadonlyArray<BandPoint>
  readonly from: EpochMillis
  readonly to: EpochMillis
  readonly ticks: ReadonlyArray<EpochMillis>
  readonly hue: Hue
  readonly domain: ValueDomain
  /** X axis tick label. */
  readonly formatTick: (at: EpochMillis) => string
  /** Bucket time in the tooltip. */
  readonly formatTime: (at: EpochMillis) => string
  readonly formatValue: (value: number) => string
  /** Y axis tick label. */
  readonly formatAxis: (value: number) => string
}) => {
  const color = `var(--color-chart-${hue})`
  const byAt = useMemo(() => new Map(points.map((point) => [point.at, point])), [points])

  return (
    <ComposedChart
      data={points}
      responsive
      style={{ width: "100%", height: chartHeight }}
      margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
    >
      <CartesianGrid vertical={false} stroke="var(--color-line)" />
      <XAxis
        dataKey="at"
        type="number"
        scale="time"
        domain={[from, to]}
        ticks={ticks}
        tickFormatter={formatTick}
        tick={axisTick}
        tickLine={false}
        axisLine={{ stroke: "var(--color-line)" }}
        height={18}
      />
      <YAxis
        domain={domain}
        tickFormatter={noWrap(formatAxis)}
        tick={axisTick}
        tickCount={3}
        tickLine={false}
        axisLine={false}
        width={66}
      />
      <Tooltip
        isAnimationActive={false}
        cursor={{ stroke: "var(--color-muted)", strokeDasharray: "2 2" }}
        content={({ active, label }) => {
          const point = typeof label === "number" ? byAt.get(label) : undefined
          if (!active || point?.band == null || point.avg === null) return null
          return (
            <div className="rounded border border-line bg-panel px-2 py-1.5 text-[11px] shadow-sm">
              <p className="text-muted">{formatTime(point.at)}</p>
              <p className="mt-0.5">
                <span className="text-muted">avg</span> {formatValue(point.avg)}
              </p>
              <p className="text-muted">
                {formatValue(point.band[0])} – {formatValue(point.band[1])}
              </p>
            </div>
          )
        }}
      />
      <Area
        dataKey="band"
        stroke="none"
        fill={color}
        fillOpacity={0.2}
        activeDot={false}
        isAnimationActive={false}
      />
      <Line
        dataKey="avg"
        stroke={color}
        strokeWidth={1.5}
        dot={false}
        activeDot={{ r: 2.5, strokeWidth: 0, fill: color }}
        isAnimationActive={false}
      />
    </ComposedChart>
  )
}
