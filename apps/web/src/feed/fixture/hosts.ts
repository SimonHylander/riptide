import type { Sample } from "@riptide/domain"

import type { Random } from "./simulate"

const GiB = 1024 ** 3
const TB = 1000 ** 4

/** A fixture host: its name and first sample. `ticks` hosts get a new sample every second. */
export interface FixtureHost {
  readonly host: string
  /** How long ago the host last reported when the feed starts, in ms. */
  readonly staleForMs: number
  readonly ticks: boolean
  readonly initial: (at: number, random: Random) => Sample
}

/** Desktop with 16 cores, sensors on several chips, a stopped fan, three disks and one GPU. Live. */
export const desktop: FixtureHost = {
  host: "desktop",
  staleForMs: 0,
  ticks: true,
  initial: (at, random) => {
    const coresPct = Array.from({ length: 16 }, () => 5 + random() * 45)
    return {
      at,
      cpu: { totalPct: coresPct.reduce((sum, pct) => sum + pct, 0) / coresPct.length, coresPct },
      memory: {
        totalBytes: 64 * GiB,
        usedBytes: 21.4 * GiB,
        availableBytes: 42.6 * GiB,
        swapTotalBytes: 8 * GiB,
        swapUsedBytes: 0.3 * GiB,
      },
      host: { load1: 3.2, load5: 2.8, load15: 2.4, uptimeSeconds: 3 * 86_400 + 4 * 3_600 + 12 * 60 },
      sensors: {
        temps: [
          { chip: "k10temp-pci-00c3", label: "Tctl", celsius: 58.4 },
          { chip: "k10temp-pci-00c3", label: "Tccd1", celsius: 52.1 },
          { chip: "k10temp-pci-00c3", label: "Tccd2", celsius: 50.7 },
          { chip: "nvme-pci-0100", label: "Composite", celsius: 41.9 },
          { chip: "nvme-pci-0100", label: "Sensor 1", celsius: 39.2 },
          { chip: "nct6799-isa-0290", label: "SYSTIN", celsius: 33.0 },
        ],
        fans: [
          { chip: "nct6799-isa-0290", label: "fan1", rpm: 1180 },
          { chip: "nct6799-isa-0290", label: "fan2", rpm: 2410 },
          { chip: "nct6799-isa-0290", label: "fan3", rpm: 0 },
        ],
      },
      disks: [
        { mount: "/", device: "/dev/nvme0n1p2", fsType: "ext4", totalBytes: 1 * TB, usedBytes: 0.41 * TB },
        { mount: "/home", device: "/dev/nvme1n1p1", fsType: "btrfs", totalBytes: 2 * TB, usedBytes: 1.72 * TB },
        { mount: "/boot", device: "/dev/nvme0n1p1", fsType: "vfat", totalBytes: 1 * GiB, usedBytes: 0.22 * GiB },
      ],
      gpus: [
        {
          index: 0,
          name: "NVIDIA GeForce RTX 4080",
          utilizationPct: 34,
          memoryUsedBytes: 5.1 * GiB,
          memoryTotalBytes: 16 * GiB,
          temperatureCelsius: 54,
          powerWatts: 96,
        },
      ],
    }
  },
}

/** Small VM with 2 cores, one disk, no sensors and no GPU. Last reported 7 minutes ago, so it reads offline. */
export const vm: FixtureHost = {
  host: "vm",
  staleForMs: 7 * 60_000,
  ticks: false,
  initial: (at) => ({
    at,
    cpu: { totalPct: 6.5, coresPct: [8, 5] },
    memory: {
      totalBytes: 4 * GiB,
      usedBytes: 1.3 * GiB,
      availableBytes: 2.7 * GiB,
      swapTotalBytes: 0,
      swapUsedBytes: 0,
    },
    host: { load1: 0.08, load5: 0.12, load15: 0.1, uptimeSeconds: 19 * 86_400 + 2 * 3_600 },
    sensors: { temps: [], fans: [] },
    disks: [{ mount: "/", device: "/dev/vda1", fsType: "ext4", totalBytes: 40e9, usedBytes: 17.3e9 }],
    gpus: [],
  }),
}

export const fixtureHosts: ReadonlyArray<FixtureHost> = [desktop, vm]
