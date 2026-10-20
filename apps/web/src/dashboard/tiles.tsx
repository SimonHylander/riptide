import type {
  CpuReading,
  DiskReading,
  FanReading,
  GpuReading,
  HostReading,
  MemoryReading,
  TempReading,
} from "@riptide/domain"

import {
  formatBytes,
  formatCelsius,
  formatLoad,
  formatPct,
  formatRpm,
  formatUptime,
  formatWatts,
} from "./format"
import {
  fillClass,
  MeterRow,
  Meter, ReadingRow, Readout, Tile, tempThresholds, textClass, toneOf, usageThresholds } from "./ui"

const pctOf = (part: number, whole: number) => (whole === 0 ? 0 : (part / whole) * 100)

/** Total utilization plus one bar per logical core. */
export const CpuTile = ({ cpu }: { readonly cpu: CpuReading }) => (
  <Tile title="CPU" aside={`${cpu.coresPct.length} cores`} className="sm:col-span-2">
    <div className="flex items-end gap-6">
      <Readout value={formatPct(cpu.totalPct)} unit="%" tone={toneOf(cpu.totalPct, usageThresholds)} />
      <div className="mb-1 flex-1">
        <Meter pct={cpu.totalPct} label="CPU total" />
      </div>
    </div>
    <ol aria-label="Per-core usage" className="mt-4 flex h-24 items-end gap-1">
      {cpu.coresPct.map((pct, core) => (
        <li
          key={core}
          title={`core ${core}: ${formatPct(pct)}%`}
          className="relative h-full flex-1 overflow-hidden rounded-[2px] bg-track"
        >
          <span className="sr-only">{`core ${core} ${formatPct(pct)}%`}</span>
          <span
            aria-hidden
            className={`absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out ${fillClass[toneOf(pct, usageThresholds)]}`}
            style={{ height: `${pct}%` }}
          />
        </li>
      ))}
    </ol>
  </Tile>
)

/** RAM in use against total, plus swap when the host has any. */
export const MemoryTile = ({ memory }: { readonly memory: MemoryReading }) => {
  const usedPct = pctOf(memory.usedBytes, memory.totalBytes)
  return (
    <Tile title="Memory" aside={`${formatBytes(memory.availableBytes)} available`}>
      <Readout value={formatBytes(memory.usedBytes)} unit={`of ${formatBytes(memory.totalBytes)}`} />
      <div className="mt-3 space-y-3">
        <Meter pct={usedPct} label="Memory used" />
        {memory.swapTotalBytes > 0 && (
          <MeterRow
            label="swap"
            value={`${formatBytes(memory.swapUsedBytes)} / ${formatBytes(memory.swapTotalBytes)}`}
            pct={pctOf(memory.swapUsedBytes, memory.swapTotalBytes)}
          />
        )}
      </div>
    </Tile>
  )
}

/** 1, 5 and 15 minute load averages. Load at or above the core count reads as warn. */
export const LoadTile = ({ host, cores }: { readonly host: HostReading; readonly cores: number }) => {
  const averages = [
    ["1m", host.load1],
    ["5m", host.load5],
    ["15m", host.load15],
  ] as const
  return (
    <Tile title="Load" aside={`${cores} cores`}>
      <dl className="grid grid-cols-3 gap-3">
        {averages.map(([window, load]) => (
          <div key={window}>
            <dt className="text-[11px] text-muted">{window}</dt>
            <dd className={`mt-1 text-xl font-semibold ${textClass[cores > 0 && load >= cores ? "warn" : "normal"]}`}>
              {formatLoad(load)}
            </dd>
          </div>
        ))}
      </dl>
    </Tile>
  )
}

export const UptimeTile = ({ uptimeSeconds }: { readonly uptimeSeconds: number }) => (
  <Tile title="Uptime">
    <Readout value={formatUptime(uptimeSeconds)} />
  </Tile>
)

const groupByChip = <T extends { readonly chip: string }>(readings: ReadonlyArray<T>) =>
  readings.reduce((groups, reading) => {
    groups.set(reading.chip, [...(groups.get(reading.chip) ?? []), reading])
    return groups
  }, new Map<string, ReadonlyArray<T>>())

/** Temperatures grouped by chip, in the order the host reports them. */
export const TempsTile = ({ temps }: { readonly temps: ReadonlyArray<TempReading> }) => (
  <Tile title="Temperatures">
    <div className="space-y-3">
      {[...groupByChip(temps)].map(([chip, readings]) => (
        <div key={chip}>
          <h3 className="mb-1 truncate text-[11px] text-muted">{chip}</h3>
          {readings.map((temp) => (
            <ReadingRow key={temp.label} label={temp.label}>
              <span className={textClass[toneOf(temp.celsius, tempThresholds)]}>{formatCelsius(temp.celsius)}</span>
            </ReadingRow>
          ))}
        </div>
      ))}
    </div>
  </Tile>
)

/** Fan speeds. A stopped fan shows as idle in the muted color, never as an error. */
export const FansTile = ({ fans }: { readonly fans: ReadonlyArray<FanReading> }) => (
  <Tile title="Fans">
    {fans.map((fan) => (
      <ReadingRow
        key={`${fan.chip}/${fan.label}`}
        label={
          <>
            {fan.label} <span className="text-muted">{fan.chip}</span>
          </>
        }
      >
        <span className={fan.rpm === 0 ? "text-muted" : undefined}>{formatRpm(fan.rpm)}</span>
      </ReadingRow>
    ))}
  </Tile>
)

/** Used against total for each mount. */
export const DisksTile = ({ disks }: { readonly disks: ReadonlyArray<DiskReading> }) => (
  <Tile title="Disks">
    <div className="space-y-3">
      {disks.map((disk) => (
        <MeterRow
          key={disk.mount}
          label={disk.mount}
          value={`${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}`}
          pct={pctOf(disk.usedBytes, disk.totalBytes)}
          detail={`${disk.fsType} · ${disk.device}`}
        />
      ))}
    </div>
  </Tile>
)

/** One GPU: utilization and memory, plus temperature and power when the vendor reports them. */
export const GpuTile = ({ gpu }: { readonly gpu: GpuReading }) => (
  <Tile title={`GPU ${gpu.index}`} aside={gpu.name}>
    <div className="space-y-3">
      <MeterRow label="utilization" value={`${formatPct(gpu.utilizationPct)}%`} pct={gpu.utilizationPct} />
      <MeterRow
        label="memory"
        value={`${formatBytes(gpu.memoryUsedBytes)} / ${formatBytes(gpu.memoryTotalBytes)}`}
        pct={pctOf(gpu.memoryUsedBytes, gpu.memoryTotalBytes)}
      />
      {gpu.temperatureCelsius !== undefined && (
        <ReadingRow label="temperature">
          <span className={textClass[toneOf(gpu.temperatureCelsius, tempThresholds)]}>
            {formatCelsius(gpu.temperatureCelsius)}
          </span>
        </ReadingRow>
      )}
      {gpu.powerWatts !== undefined && <ReadingRow label="power">{formatWatts(gpu.powerWatts)}</ReadingRow>}
    </div>
  </Tile>
)
