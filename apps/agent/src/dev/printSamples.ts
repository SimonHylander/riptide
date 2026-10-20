// Dev tool: composes a platform and prints one JSON `Sample` per second.
//   bun run sample                        # linux on Linux, fixture elsewhere
//   RIPTIDE_PLATFORM=fixture bun run sample
import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import type { Sample } from "@riptide/domain"
import { Clock, Config, Console, Effect, Layer, Schedule } from "effect"

import { EmptyGpuSource } from "../adapters/empty/EmptySources"
import { FixturePlatform } from "../adapters/fixture/FixtureSources"
import { LinuxPlatform } from "../adapters/linux/LinuxPlatform"
import { NvidiaGpuSource, nvidiaSmiAvailable } from "../adapters/nvidia/NvidiaGpuSource"
import { CpuSource } from "../ports/CpuSource"
import { DiskSource } from "../ports/DiskSource"
import { GpuSource } from "../ports/GpuSource"
import { HostInfo } from "../ports/HostInfo"
import { MemorySource } from "../ports/MemorySource"
import { SensorSource } from "../ports/SensorSource"

const platformName = Config.Literals(["linux", "fixture"], "RIPTIDE_PLATFORM").pipe(
  Config.withDefault(process.platform === "linux" ? "linux" : "fixture"),
)

const linux = Layer.unwrap(
  nvidiaSmiAvailable.pipe(Effect.map((nvidia) => Layer.merge(LinuxPlatform, nvidia ? NvidiaGpuSource : EmptyGpuSource))),
)

const Platform = Layer.unwrap(
  Effect.gen(function*() {
    return (yield* platformName) === "linux" ? linux : FixturePlatform
  }),
).pipe(Layer.provide(BunServices.layer))

const program = Effect.gen(function*() {
  const cpu = yield* CpuSource
  const memory = yield* MemorySource
  const host = yield* HostInfo
  const sensors = yield* SensorSource
  const disks = yield* DiskSource
  const gpus = yield* GpuSource
  yield* Effect.logInfo(`sampling ${host.hostname}`)

  const sample = Effect.gen(function*() {
    const readings = yield* Effect.all({
      cpu: cpu.latest,
      memory: memory.latest,
      host: host.latest,
      sensors: sensors.latest,
      disks: disks.latest,
      gpus: gpus.latest,
    }, { concurrency: "unbounded" })
    const at = yield* Clock.currentTimeMillis
    return { at, ...readings } satisfies Sample
  })

  yield* sample.pipe(
    Effect.flatMap((s) => Console.log(JSON.stringify(s))),
    Effect.catch((error) => Effect.logError("sample failed", error)),
    Effect.repeat(Schedule.spaced("1 second")),
  )
})

BunRuntime.runMain(program.pipe(Effect.provide(Platform)))
