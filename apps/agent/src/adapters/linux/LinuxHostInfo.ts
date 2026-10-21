import { Effect, FileSystem, Layer } from "effect"

import { HostInfo } from "../../ports/HostInfo"
import { fromParse, LinuxFs, readText } from "./LinuxFs"
import { parseHost } from "./parse"

/** HostInfo from `/proc/loadavg` and `/proc/uptime`. The hostname is read once from `/proc/sys/kernel/hostname`. */
export const LinuxHostInfo = Layer.effect(
  HostInfo,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const { proc } = yield* LinuxFs
    const hostname = (yield* readText(fs, "host", `${proc}/sys/kernel/hostname`)).trim()
    const latest = Effect.all([readText(fs, "host", `${proc}/loadavg`), readText(fs, "host", `${proc}/uptime`)]).pipe(
      Effect.flatMap(([loadavg, uptime]) => fromParse("host", parseHost(loadavg, uptime))),
    )
    return HostInfo.of({ hostname, latest })
  }),
)
