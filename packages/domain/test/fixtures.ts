import type { AggregateRow, ReportBatch, Sample } from "../src/index"

export const fullSample: Sample = {
  at: 1_800_000_000_000,
  cpu: { totalPct: 37.5, coresPct: [10, 65, 0, 100] },
  memory: {
    totalBytes: 34_359_738_368,
    usedBytes: 12_000_000_000,
    availableBytes: 22_000_000_000,
    swapTotalBytes: 8_589_934_592,
    swapUsedBytes: 0,
  },
  host: { load1: 0.5, load5: 0.75, load15: 1.25, uptimeSeconds: 86_400 },
  sensors: {
    temps: [
      { chip: "coretemp-isa-0000", label: "Package id 0", celsius: 54.5 },
      { chip: "nvme-pci-0100", label: "Composite", celsius: -3 },
    ],
    fans: [
      { chip: "nct6797-isa-0a20", label: "fan1", rpm: 1200 },
      { chip: "nct6797-isa-0a20", label: "fan2", rpm: 0 },
    ],
  },
  disks: [
    { mount: "/", device: "/dev/nvme0n1p2", fsType: "ext4", totalBytes: 500_000_000_000, usedBytes: 120_000_000_000 },
  ],
  gpus: [
    {
      index: 0,
      name: "Example GPU",
      utilizationPct: 80,
      memoryUsedBytes: 4_000_000_000,
      memoryTotalBytes: 12_000_000_000,
      temperatureCelsius: 66,
      powerWatts: 180.5,
    },
    { index: 1, name: "Bare GPU", utilizationPct: 0, memoryUsedBytes: 0, memoryTotalBytes: 8_000_000_000 },
  ],
}

export const minimalSample: Sample = {
  at: 1_800_000_001_000,
  cpu: { totalPct: 0, coresPct: [] },
  memory: { totalBytes: 1, usedBytes: 0, availableBytes: 1, swapTotalBytes: 0, swapUsedBytes: 0 },
  host: { load1: 0, load5: 0, load15: 0, uptimeSeconds: 0 },
  sensors: { temps: [], fans: [] },
  disks: [],
  gpus: [],
}

const stat = (min: number, avg: number, max: number) => ({ min, avg, max })

export const aggregateRow: AggregateRow = {
  host: "host-a",
  at: 1_799_999_940_000,
  resolution: "minute",
  count: 60,
  cpu: { total: stat(5, 20, 90), cores: [stat(0, 10, 50), stat(10, 30, 100)] },
  memory: {
    totalBytes: 34_359_738_368,
    used: stat(11e9, 12e9, 13e9),
    available: stat(21e9, 22e9, 23e9),
    swapTotalBytes: 8_589_934_592,
    swapUsed: stat(0, 0, 0),
  },
  load: { load1: stat(0.1, 0.5, 2), load5: stat(0.2, 0.7, 1.5), load15: stat(0.3, 0.9, 1.2) },
  sensors: {
    temps: [{ chip: "coretemp-isa-0000", label: "Package id 0", celsius: stat(40, 50, 70) }],
    fans: [{ chip: "nct6797-isa-0a20", label: "fan1", rpm: stat(0, 900, 1300) }],
  },
  disks: [{ mount: "/", totalBytes: 500_000_000_000, used: stat(119e9, 120e9, 121e9) }],
  gpus: [
    {
      index: 0,
      memoryTotalBytes: 12_000_000_000,
      utilization: stat(0, 40, 100),
      memoryUsed: stat(1e9, 2e9, 4e9),
      temperature: stat(40, 55, 70),
      power: stat(20, 90, 180),
    },
    {
      index: 1,
      memoryTotalBytes: 8_000_000_000,
      utilization: stat(0, 0, 0),
      memoryUsed: stat(0, 0, 0),
    },
  ],
}

export const minimalAggregateRow: AggregateRow = {
  host: "host-a",
  at: 1_799_999_940_000,
  resolution: "hour",
  count: 1,
  cpu: { total: stat(0, 0, 0), cores: [] },
  memory: {
    totalBytes: 1,
    used: stat(0, 0, 0),
    available: stat(1, 1, 1),
    swapTotalBytes: 0,
    swapUsed: stat(0, 0, 0),
  },
  load: { load1: stat(0, 0, 0), load5: stat(0, 0, 0), load15: stat(0, 0, 0) },
  sensors: { temps: [], fans: [] },
  disks: [],
  gpus: [],
}

export const reportBatch: ReportBatch = {
  host: "host-a",
  sample: fullSample,
  aggregates: [aggregateRow, minimalAggregateRow],
}
