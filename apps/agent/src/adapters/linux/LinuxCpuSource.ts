import { Effect, FileSystem, Layer, Ref } from "effect"

import { CpuSource } from "../../ports/CpuSource"
import { fromParse, LinuxFs, readText } from "./LinuxFs"
import { type CpuSnapshot, cpuUsage, parseStat } from "./parse"

/**
 * CpuSource from `/proc/stat`. Keeps the previous snapshot so each `latest` call
 * reports utilization since the call before it. The first call reports the
 * average since boot.
 */
export const LinuxCpuSource = Layer.effect(
  CpuSource,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const { proc } = yield* LinuxFs
    const previous = yield* Ref.make<CpuSnapshot | undefined>(undefined)

    const latest = readText(fs, "cpu", `${proc}/stat`).pipe(
      Effect.flatMap((text) => fromParse("cpu", parseStat(text))),
      Effect.flatMap((next) => Ref.modify(previous, (prev) => [cpuUsage(prev, next), next])),
    )
    return CpuSource.of({ latest })
  }),
)
