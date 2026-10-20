// Fixture adapters for every port: plausible, slowly varying readings with no
// I/O. For tests and for local runs on machines that are not Linux.
import { Effect, Layer, Ref } from "effect"

import { CpuSource } from "../../ports/CpuSource"
import { DiskSource } from "../../ports/DiskSource"
import { GpuSource } from "../../ports/GpuSource"
import { HostInfo } from "../../ports/HostInfo"
import { MemorySource } from "../../ports/MemorySource"
import { SensorSource } from "../../ports/SensorSource"

const GiB = 1024 ** 3

// Wave in [0, 1] advancing one step per call, so values drift but stay in range.
const wave = (n: number, period: number, phase = 0) => (Math.sin((2 * Math.PI * (n + phase)) / period) + 1) / 2

/** Builds `latest` from a call counter, so each call returns the next reading. */
const counted = <A>(reading: (n: number) => A) =>
  Ref.make(0).pipe(Effect.map((calls) => Ref.getAndUpdate(calls, (n) => n + 1).pipe(Effect.map(reading))))

/** An 8-core CPU with load drifting between cores. */
export const FixtureCpuSource = Layer.effect(
  CpuSource,
  counted((n) => {
    const coresPct = Array.from({ length: 8 }, (_, core) => Math.round(5 + 60 * wave(n, 30, core * 3)))
    return { totalPct: coresPct.reduce((sum, pct) => sum + pct, 0) / coresPct.length, coresPct }
  }).pipe(Effect.map((latest) => ({ latest }))),
)

/** 32 GiB of RAM, roughly a third used, with an 8 GiB mostly idle swap. */
export const FixtureMemorySource = Layer.effect(
  MemorySource,
  counted((n) => {
    const usedBytes = Math.round((10 + 2 * wave(n, 60)) * GiB)
    return {
      totalBytes: 32 * GiB,
      usedBytes,
      availableBytes: 32 * GiB - usedBytes,
      swapTotalBytes: 8 * GiB,
      swapUsedBytes: 256 * 1024 ** 2,
    }
  }).pipe(Effect.map((latest) => ({ latest }))),
)

/** A host named `fixture` that booted a day before the first call. */
export const FixtureHostInfo = Layer.effect(
  HostInfo,
  counted((n) => ({
    load1: 1 + 2 * wave(n, 20),
    load5: 1.5,
    load15: 1.25,
    uptimeSeconds: 86_400 + n,
  })).pipe(Effect.map((latest) => ({ hostname: "fixture", latest }))),
)

/** A CPU, an NVMe drive and a Super I/O chip with one stopped fan. */
export const FixtureSensorSource = Layer.effect(
  SensorSource,
  counted((n) => ({
    temps: [
      { chip: "k10temp", label: "Tctl", celsius: 45 + 15 * wave(n, 30) },
      { chip: "nvme", label: "Composite", celsius: 38 },
      { chip: "nct6798", label: "SYSTIN", celsius: 31 },
    ],
    fans: [
      { chip: "nct6798", label: "fan1", rpm: Math.round(900 + 400 * wave(n, 30)) },
      { chip: "nct6798", label: "fan2", rpm: 0 },
    ],
  })).pipe(Effect.map((latest) => ({ latest }))),
)

/** A root and a data filesystem. */
export const FixtureDiskSource = Layer.succeed(DiskSource, {
  latest: Effect.succeed([
    { mount: "/", device: "/dev/nvme0n1p2", fsType: "ext4", totalBytes: 1000 * GiB, usedBytes: 412 * GiB },
    { mount: "/data", device: "/dev/sda1", fsType: "xfs", totalBytes: 4000 * GiB, usedBytes: 2650 * GiB },
  ]),
})

/** One GPU reporting every optional field. */
export const FixtureGpuSource = Layer.effect(
  GpuSource,
  counted((n) => [
    {
      index: 0,
      name: "Fixture GPU",
      utilizationPct: Math.round(80 * wave(n, 40)),
      memoryUsedBytes: 2 * GiB,
      memoryTotalBytes: 16 * GiB,
      temperatureCelsius: 40 + Math.round(20 * wave(n, 40)),
      powerWatts: 30 + Math.round(200 * wave(n, 40)),
    },
  ]).pipe(Effect.map((latest) => ({ latest }))),
)

/** Every port backed by its fixture adapter. Needs nothing. */
export const FixturePlatform = Layer.mergeAll(
  FixtureCpuSource,
  FixtureMemorySource,
  FixtureHostInfo,
  FixtureSensorSource,
  FixtureDiskSource,
  FixtureGpuSource,
)
