import { useId, type ReactNode } from "react"

/** Value bands for status color. Values below `warnAt` use the neutral magnitude hue. */
export interface Thresholds {
  readonly warnAt: number
  readonly critAt: number
}

export const usageThresholds: Thresholds = { warnAt: 85, critAt: 95 }
export const tempThresholds: Thresholds = { warnAt: 80, critAt: 90 }

export type Tone = "normal" | "warn" | "crit"

export const toneOf = (value: number, { warnAt, critAt }: Thresholds): Tone =>
  value >= critAt ? "crit" : value >= warnAt ? "warn" : "normal"

export const fillClass = { normal: "bg-meter", warn: "bg-warn", crit: "bg-crit" } satisfies Record<Tone, string>
export const textClass = { normal: "text-ink", warn: "text-warn", crit: "text-crit" } satisfies Record<Tone, string>

/** A titled panel. Its title names the region for assistive tech and tests. */
export const Tile = ({
  title,
  aside,
  className = "",
  children,
}: {
  readonly title: string
  readonly aside?: ReactNode
  readonly className?: string
  readonly children: ReactNode
}) => {
  const id = useId()
  return (
    <section aria-labelledby={id} className={`rounded-md border border-line bg-panel p-4 ${className}`}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">
          {title}
        </h2>
        {aside === undefined ? null : <span className="truncate text-[11px] text-muted">{aside}</span>}
      </header>
      {children}
    </section>
  )
}

/** The headline number of a tile, with an optional muted unit. */
export const Readout = ({ value, unit, tone = "normal" }: { readonly value: string; readonly unit?: string; readonly tone?: Tone }) => (
  <p className={`text-3xl leading-none font-semibold tracking-tight ${textClass[tone]}`}>
    {value}
    {unit === undefined ? null : <span className="ml-1.5 text-sm font-normal text-muted">{unit}</span>}
  </p>
)

/** Horizontal 0–100% bar. Turns warn/crit when `pct` crosses `thresholds`. */
export const Meter = ({
  pct,
  label,
  thresholds = usageThresholds,
}: {
  readonly pct: number
  readonly label: string
  readonly thresholds?: Thresholds | undefined
}) => (
  <div
    role="meter"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(pct)}
    className="h-1.5 w-full overflow-hidden rounded-full bg-track"
  >
    <div
      className={`h-full rounded-full transition-[width] duration-700 ease-out ${fillClass[toneOf(pct, thresholds)]}`}
      style={{ width: `${pct}%` }}
    />
  </div>
)

/** A labelled meter: label and value on one line, the bar under them. */
export const MeterRow = ({
  label,
  value,
  pct,
  detail,
  thresholds,
}: {
  readonly label: string
  readonly value: string
  readonly pct: number
  readonly detail?: string
  readonly thresholds?: Thresholds
}) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-muted">{value}</span>
    </div>
    <Meter pct={pct} label={label} thresholds={thresholds} />
    {detail === undefined ? null : <p className="truncate text-[11px] text-muted">{detail}</p>}
  </div>
)

/** Label/value line for sensor lists. */
export const ReadingRow = ({ label, children }: { readonly label: ReactNode; readonly children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
    <span className="truncate">{label}</span>
    <span className="shrink-0">{children}</span>
  </div>
)
