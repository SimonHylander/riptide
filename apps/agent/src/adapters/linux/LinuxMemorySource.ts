import { Effect, FileSystem, Layer } from "effect"

import { MemorySource } from "../../ports/MemorySource"
import { fromParse, LinuxFs, readText } from "./LinuxFs"
import { parseMeminfo } from "./parse"

/** MemorySource from `/proc/meminfo`. */
export const LinuxMemorySource = Layer.effect(
  MemorySource,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const { proc } = yield* LinuxFs
    const latest = readText(fs, "memory", `${proc}/meminfo`).pipe(
      Effect.flatMap((text) => fromParse("memory", parseMeminfo(text))),
    )
    return MemorySource.of({ latest })
  }),
)
