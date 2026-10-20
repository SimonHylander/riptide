// Pure parsers for the kernel text formats the Linux adapters read.
// Each takes file contents and returns a reading, or a `Result` failure message
// when the text is not in the expected format. No I/O happens here.
import type { CpuReading, DiskReading, FanReading, HostReading, MemoryReading, SensorReading, TempReading } from "@riptide/domain"
import { Result } from "effect"

const clampPct = (value: number) => Math.min(100, Math.max(0, value))

// ---------------------------------------------------------------------------
// /proc/stat

/** Cumulative jiffies of one `cpu` line. `busy` excludes idle and iowait. */
export interface CpuTimes {
  readonly busy: number
  readonly total: number
}

/** The aggregate `cpu` line plus every online `cpuN` line, keyed by N. */
export interface CpuSnapshot {
  readonly total: CpuTimes
  readonly cores: ReadonlyMap<number, CpuTimes>
}

// user nice system idle iowait irq softirq steal [guest guest_nice]. guest and
// guest_nice are already counted in user and nice, so only the first 8 sum up.
const cpuTimes = (fields: ReadonlyArray<string>): CpuTimes | undefined => {
  const values = fields.slice(0, 8).map(Number)
  if (values.length < 4 || values.some((v) => !Number.isFinite(v))) return undefined
  const total = values.reduce((sum, v) => sum + v, 0)
  const idle = (values[3] ?? 0) + (values[4] ?? 0)
  return { busy: total - idle, total }
}

/** Parses the `cpu` lines of `/proc/stat`. Offline cores are absent from the file and so from `cores`. */
export const parseStat = (text: string): Result.Result<CpuSnapshot, string> => {
  let total: CpuTimes | undefined
  const cores = new Map<number, CpuTimes>()
  for (const line of text.split("\n")) {
    const [key, ...fields] = line.trim().split(/\s+/)
    if (key === undefined || !key.startsWith("cpu")) continue
    const times = cpuTimes(fields)
    if (times === undefined) return Result.fail(`malformed /proc/stat line: ${line}`)
    if (key === "cpu") total = times
    else cores.set(Number(key.slice(3)), times)
  }
  return total === undefined ? Result.fail("no aggregate cpu line in /proc/stat") : Result.succeed({ total, cores })
}

const usagePct = (previous: CpuTimes | undefined, next: CpuTimes): number => {
  const busy = next.busy - (previous?.busy ?? 0)
  const total = next.total - (previous?.total ?? 0)
  return total > 0 ? clampPct((busy * 100) / total) : 0
}

/**
 * Utilization between two snapshots. Without a previous snapshot (or for a core
 * that just came online) it is the average since boot. Always in [0, 100].
 */
export const cpuUsage = (previous: CpuSnapshot | undefined, next: CpuSnapshot): CpuReading => ({
  totalPct: usagePct(previous?.total, next.total),
  coresPct: [...next.cores.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, times]) => usagePct(previous?.cores.get(id), times)),
})

// ---------------------------------------------------------------------------
// /proc/meminfo

/** Parses `/proc/meminfo` (values in kB). Used memory is `MemTotal - MemAvailable`, as `free` reports it. */
export const parseMeminfo = (text: string): Result.Result<MemoryReading, string> => {
  const kb = new Map<string, number>()
  for (const line of text.split("\n")) {
    const match = /^(\w+):\s+(\d+)/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) kb.set(match[1], Number(match[2]))
  }
  const field = (key: string) => kb.get(key)
  const total = field("MemTotal")
  const available = field("MemAvailable")
  const swapTotal = field("SwapTotal")
  const swapFree = field("SwapFree")
  if (total === undefined || available === undefined || swapTotal === undefined || swapFree === undefined) {
    return Result.fail("/proc/meminfo lacks MemTotal, MemAvailable, SwapTotal or SwapFree")
  }
  return Result.succeed({
    totalBytes: total * 1024,
    usedBytes: Math.max(0, total - available) * 1024,
    availableBytes: available * 1024,
    swapTotalBytes: swapTotal * 1024,
    swapUsedBytes: Math.max(0, swapTotal - swapFree) * 1024,
  })
}

// ---------------------------------------------------------------------------
// /proc/loadavg and /proc/uptime

const leadingNumbers = (text: string, count: number): ReadonlyArray<number> | undefined => {
  const values = text.trim().split(/\s+/).slice(0, count).map(Number)
  return values.length === count && values.every((v) => Number.isFinite(v) && v >= 0) ? values : undefined
}

/** Parses `/proc/loadavg` and `/proc/uptime` into load averages and uptime seconds. */
export const parseHost = (loadavg: string, uptime: string): Result.Result<HostReading, string> => {
  const load = leadingNumbers(loadavg, 3)
  const up = leadingNumbers(uptime, 1)
  if (load === undefined) return Result.fail(`malformed /proc/loadavg: ${loadavg.trim()}`)
  if (up === undefined) return Result.fail(`malformed /proc/uptime: ${uptime.trim()}`)
  const [load1 = 0, load5 = 0, load15 = 0] = load
  return Result.succeed({ load1, load5, load15, uptimeSeconds: up[0] ?? 0 })
}

// ---------------------------------------------------------------------------
// /proc/mounts

/** One `/proc/mounts` line, with octal escapes (`\040` for space) decoded. */
export interface MountEntry {
  readonly device: string
  readonly mount: string
  readonly fsType: string
}

const unescapeOctal = (field: string) =>
  field.replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))

/** Parses `/proc/mounts`. Lines with fewer than three fields are skipped. */
export const parseMounts = (text: string): ReadonlyArray<MountEntry> =>
  text.split("\n").flatMap((line) => {
    const [device, mount, fsType] = line.trim().split(/\s+/)
    return device && mount && fsType ? [{ device: unescapeOctal(device), mount: unescapeOctal(mount), fsType }] : []
  })

/** Kernel and userspace pseudo filesystems that never hold user data. */
const pseudoFsTypes: ReadonlySet<string> = new Set([
  "autofs", "binfmt_misc", "bpf", "configfs", "debugfs", "devpts", "devtmpfs", "efivarfs", "fusectl",
  "fuse.gvfsd-fuse", "fuse.lxcfs", "fuse.portal", "hugetlbfs", "mqueue", "nsfs", "overlay", "proc",
  "pstore", "ramfs", "rootfs", "rpc_pipefs", "securityfs", "selinuxfs", "squashfs", "sysfs", "tmpfs",
  "tracefs",
])

const isPseudo = (fsType: string) => pseudoFsTypes.has(fsType) || fsType.startsWith("cgroup")

/**
 * Keeps only the visible mount per path (the last one listed, when something is
 * mounted over it), drops pseudo filesystems and collapses bind mounts: per
 * device only the shortest mount path survives. Result is sorted by mount path.
 */
export const realMounts = (entries: ReadonlyArray<MountEntry>): ReadonlyArray<MountEntry> => {
  const visible = new Map(entries.map((entry) => [entry.mount, entry]))
  const byDevice = new Map<string, MountEntry>()
  for (const entry of visible.values()) {
    if (isPseudo(entry.fsType)) continue
    const kept = byDevice.get(entry.device)
    if (kept === undefined || entry.mount.length < kept.mount.length) byDevice.set(entry.device, entry)
  }
  return [...byDevice.values()].sort((a, b) => (a.mount < b.mount ? -1 : a.mount > b.mount ? 1 : 0))
}

/** Byte sizes of a mounted filesystem, as `statfs(2)` reports them. */
export interface FsSize {
  readonly totalBytes: number
  readonly usedBytes: number
}

/** Joins a mount with its size. Zero-sized filesystems are pseudo filesystems we did not list, so they are dropped. */
export const diskReading = (entry: MountEntry, size: FsSize): ReadonlyArray<DiskReading> =>
  size.totalBytes > 0 ? [{ ...entry, totalBytes: size.totalBytes, usedBytes: Math.min(size.usedBytes, size.totalBytes) }] : []

// ---------------------------------------------------------------------------
// /sys/class/hwmon

/**
 * One `hwmonN` directory: its `name` and the raw contents of its `temp*_input`,
 * `temp*_label`, `fan*_input` and `fan*_label` files. Unreadable files are absent.
 */
export interface HwmonChip {
  readonly name: string
  readonly files: ReadonlyMap<string, string>
}

/** Matches the sensor input files the hwmon adapter reads, capturing kind and channel number. */
export const sensorInputFile = /^(temp|fan)(\d+)_input$/

const channels = (chip: HwmonChip, kind: "temp" | "fan") =>
  [...chip.files.keys()]
    .flatMap((file) => {
      const match = sensorInputFile.exec(file)
      return match?.[1] === kind && match[2] !== undefined ? [Number(match[2])] : []
    })
    .sort((a, b) => a - b)

/**
 * Turns hwmon chips into sensor readings. Temperatures are millidegrees, fans rpm.
 * Labels fall back to `tempN` / `fanN`. Chips sharing a name (two NVMe drives)
 * get a `-0`, `-1` suffix in hwmon order. Unparsable values are skipped.
 */
export const sensorsFromHwmon = (chips: ReadonlyArray<HwmonChip>): SensorReading => {
  const nameCounts = new Map<string, number>()
  for (const chip of chips) nameCounts.set(chip.name, (nameCounts.get(chip.name) ?? 0) + 1)
  const seen = new Map<string, number>()
  const temps: Array<TempReading> = []
  const fans: Array<FanReading> = []

  for (const chip of chips) {
    const nth = seen.get(chip.name) ?? 0
    seen.set(chip.name, nth + 1)
    const chipId = (nameCounts.get(chip.name) ?? 0) > 1 ? `${chip.name}-${nth}` : chip.name
    const read = (kind: "temp" | "fan", n: number) => {
      const raw = chip.files.get(`${kind}${n}_input`)?.trim()
      const value = raw === undefined || raw === "" ? Number.NaN : Number(raw)
      const label = chip.files.get(`${kind}${n}_label`)?.trim() || `${kind}${n}`
      return { value, label }
    }
    for (const n of channels(chip, "temp")) {
      const { value, label } = read("temp", n)
      if (Number.isFinite(value)) temps.push({ chip: chipId, label, celsius: value / 1000 })
    }
    for (const n of channels(chip, "fan")) {
      const { value, label } = read("fan", n)
      if (Number.isFinite(value) && value >= 0) fans.push({ chip: chipId, label, rpm: value })
    }
  }
  return { temps, fans }
}
