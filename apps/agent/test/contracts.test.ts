import { readFileSync } from "node:fs"

import { Layer } from "effect"

import { EmptyGpuSource, EmptySensorSource } from "../src/adapters/empty/EmptySources"
import {
  FixtureCpuSource,
  FixtureDiskSource,
  FixtureGpuSource,
  FixtureHostInfo,
  FixtureMemorySource,
  FixtureSensorSource,
} from "../src/adapters/fixture/FixtureSources"
import { NvidiaGpuSource } from "../src/adapters/nvidia/NvidiaGpuSource"
import {
  cpuSourceContract,
  diskSourceContract,
  gpuSourceContract,
  hostInfoContract,
  memorySourceContract,
  sensorSourceContract,
} from "./support/contracts"
import { fakeSpawner, fixturePath, linuxFixturePlatform } from "./support/fixtureHost"

// Linux adapters on every fixture host. The VM has no hwmon chips.
for (const host of ["desktop", "vm"] as const) {
  const linux = linuxFixturePlatform(host)
  cpuSourceContract(`linux/${host}`, linux)
  memorySourceContract(`linux/${host}`, linux)
  hostInfoContract(`linux/${host}`, linux)
  sensorSourceContract(`linux/${host}`, linux, { empty: host === "vm" })
  diskSourceContract(`linux/${host}`, linux)
}

// nvidia-smi adapter on a fake process: the desktop's output, and a host with no GPU.
const desktopCsv = readFileSync(fixturePath("desktop", "nvidia-smi.csv"), "utf8")
gpuSourceContract(
  "nvidia/desktop",
  NvidiaGpuSource.pipe(Layer.provide(fakeSpawner([{ stdout: desktopCsv, exitCode: 0, stayOpen: true }]).layer)),
)
gpuSourceContract(
  "nvidia/no-gpu",
  NvidiaGpuSource.pipe(Layer.provide(fakeSpawner([{ stdout: "No devices were found\n", exitCode: 6 }]).layer)),
  { empty: true },
)

sensorSourceContract("empty", EmptySensorSource, { empty: true })
gpuSourceContract("empty", EmptyGpuSource, { empty: true })

cpuSourceContract("fixture", FixtureCpuSource)
memorySourceContract("fixture", FixtureMemorySource)
hostInfoContract("fixture", FixtureHostInfo)
sensorSourceContract("fixture", FixtureSensorSource)
diskSourceContract("fixture", FixtureDiskSource)
gpuSourceContract("fixture", FixtureGpuSource)
