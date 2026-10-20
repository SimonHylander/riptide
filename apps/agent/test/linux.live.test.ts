import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import { describe } from "@effect/vitest"
import { Layer } from "effect"

import { LinuxPlatform } from "../src/adapters/linux/LinuxPlatform"
import {
  cpuSourceContract,
  diskSourceContract,
  hostInfoContract,
  memorySourceContract,
  sensorSourceContract,
} from "./support/contracts"

// The real LinuxPlatform against this machine's /proc and /sys. Runs in CI (ubuntu-latest).
describe.skipIf(process.platform !== "linux")("live linux host", () => {
  const live = LinuxPlatform.pipe(Layer.provide(BunFileSystem.layer))
  cpuSourceContract("linux/live", live)
  memorySourceContract("linux/live", live)
  hostInfoContract("linux/live", live)
  sensorSourceContract("linux/live", live)
  diskSourceContract("linux/live", live)
})
