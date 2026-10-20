import { Layer } from "effect"

import { LinuxCpuSource } from "./LinuxCpuSource"
import { LinuxDiskSource } from "./LinuxDiskSource"
import { LinuxFs } from "./LinuxFs"
import { LinuxHostInfo } from "./LinuxHostInfo"
import { LinuxMemorySource } from "./LinuxMemorySource"
import { LinuxSensorSource } from "./LinuxSensorSource"

/** Every Linux source adapter, reading whatever `LinuxFs` points at. GPU is chosen separately. */
export const LinuxSources = Layer.mergeAll(
  LinuxCpuSource,
  LinuxMemorySource,
  LinuxHostInfo,
  LinuxSensorSource,
  LinuxDiskSource,
)

/** The Linux sources reading the real `/proc` and `/sys`. Needs a `FileSystem`. */
export const LinuxPlatform = LinuxSources.pipe(Layer.provide(LinuxFs.live))
