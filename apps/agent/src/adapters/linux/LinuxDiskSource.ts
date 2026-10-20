import { Effect, FileSystem, Layer } from "effect"

import { DiskSource } from "../../ports/DiskSource"
import { LinuxFs, readText } from "./LinuxFs"
import { diskReading, parseMounts, realMounts } from "./parse"

/**
 * DiskSource from `/proc/mounts` plus `statfs(2)` per real mount. A mount whose
 * statfs fails or hangs (stale network share) is left out of that reading
 * rather than failing the whole list.
 */
export const LinuxDiskSource = Layer.effect(
  DiskSource,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const linux = yield* LinuxFs

    const latest = readText(fs, "disk", `${linux.proc}/mounts`).pipe(
      Effect.map((text) => realMounts(parseMounts(text))),
      Effect.flatMap((mounts) =>
        Effect.forEach(mounts, (entry) =>
          linux.statfs(entry.mount).pipe(
            Effect.timeout("2 seconds"),
            Effect.map((size) => diskReading(entry, size)),
            Effect.tapError((error) => Effect.logDebug(`skipping ${entry.mount}`, error)),
            Effect.orElseSucceed(() => []),
          ), { concurrency: "unbounded" })
      ),
      Effect.map((readings) => readings.flat()),
    )
    return DiskSource.of({ latest })
  }),
)
