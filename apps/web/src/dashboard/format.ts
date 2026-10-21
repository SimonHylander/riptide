// Display formatting for tiles. Fixed to en-US so server and client render the same text.

const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const

const decimal = (digits: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
const oneDecimal = decimal(1)
const twoDecimals = decimal(2)
const whole = decimal(0)

/** Binary byte size, e.g. `21.4 GiB`. One decimal below 100, none above. */
export const formatBytes = (bytes: number): string => {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 || value >= 100 ? whole.format(value) : oneDecimal.format(value)} ${units[unit]}`
}

/** Coarse uptime: the two largest units, e.g. `3d 4h`, `5h 12m`, `42m`, `30s`. */
export const formatUptime = (seconds: number): string => {
  const parts = [
    [Math.floor(seconds / 86_400), "d"],
    [Math.floor((seconds % 86_400) / 3_600), "h"],
    [Math.floor((seconds % 3_600) / 60), "m"],
  ] as const
  const first = parts.findIndex(([value]) => value > 0)
  if (first === -1) return `${Math.floor(seconds)}s`
  return parts
    .slice(first, first + 2)
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value}${unit}`)
    .join(" ")
}

/** Fan speed. A stopped fan is `idle`, which is a normal state for fan curves. */
export const formatRpm = (rpm: number): string => (rpm === 0 ? "idle" : `${whole.format(rpm)} rpm`)

/** Percentage without the sign, rounded to a whole number. */
export const formatPct = (pct: number): string => whole.format(pct)

/** Load average with two decimals. */
export const formatLoad = (load: number): string => twoDecimals.format(load)

/** Temperature in °C with one decimal. */
export const formatCelsius = (celsius: number): string => `${oneDecimal.format(celsius)}°C`

/** Power in whole watts. */
export const formatWatts = (watts: number): string => `${whole.format(watts)} W`

/** Whole number with grouping, e.g. `1,180`. */
export const formatWhole = (value: number): string => whole.format(value)

// Chart times are in the viewer's time zone. Charts render client-only, so
// server and client never disagree on them.
const clock = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** Time of day, e.g. `14:05`. */
export const formatClock = (at: number): string => clock.format(at)

/** Calendar day, e.g. `Oct 20`. */
export const formatDate = (at: number): string => date.format(at)

/** Day and time, e.g. `Oct 20, 14:05`. */
export const formatDateTime = (at: number): string => dateTime.format(at)

/** Elapsed time for "updated … ago" labels. Under 5s reads `just now`. */
export const formatAgo = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 5) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  return `${formatUptime(seconds)} ago`
}
