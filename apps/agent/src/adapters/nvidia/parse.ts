import type { GpuReading } from "@riptide/domain"
import { Option } from "effect"

/** The `--query-gpu` fields, in the column order `parseGpuLine` expects. */
export const queryFields = [
  "index",
  "name",
  "utilization.gpu",
  "memory.used",
  "memory.total",
  "temperature.gpu",
  "power.draw",
] as const

const MiB = 1024 * 1024

// nvidia-smi prints `[N/A]`, `[Not Supported]` and similar for fields a GPU cannot report.
const numberField = (raw: string | undefined): Option.Option<number> => {
  const value = raw === undefined || raw.startsWith("[") ? Number.NaN : Number(raw)
  return Number.isFinite(value) ? Option.some(value) : Option.none()
}

/**
 * Parses one `--format=csv,noheader,nounits` line of `queryFields`. Memory is
 * MiB, converted to bytes. Unreportable temperature or power omit their key.
 * A line missing a required field (index, name, utilization, memory) is `None`.
 */
export const parseGpuLine = (line: string): Option.Option<GpuReading> => {
  const fields = line.split(",").map((field) => field.trim())
  if (fields.length !== queryFields.length) return Option.none()
  const [index, name, utilization, memoryUsed, memoryTotal, temperature, power] = fields
  return Option.all({
    index: numberField(index).pipe(Option.filter(Number.isInteger)),
    name: Option.fromNullishOr(name).pipe(Option.filter((n) => n !== "" && !n.startsWith("["))),
    utilizationPct: numberField(utilization).pipe(Option.map((pct) => Math.min(100, Math.max(0, pct)))),
    memoryUsedBytes: numberField(memoryUsed).pipe(Option.map((mib) => Math.max(0, mib) * MiB)),
    memoryTotalBytes: numberField(memoryTotal).pipe(Option.map((mib) => Math.max(0, mib) * MiB)),
  }).pipe(
    Option.map((gpu): GpuReading => {
      const celsius = numberField(temperature)
      const watts = numberField(power).pipe(Option.filter((w) => w >= 0))
      return {
        ...gpu,
        ...(Option.isSome(celsius) && { temperatureCelsius: celsius.value }),
        ...(Option.isSome(watts) && { powerWatts: watts.value }),
      }
    }),
  )
}
