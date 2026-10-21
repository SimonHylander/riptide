import { readFileSync } from "node:fs"

import { assert, describe, it } from "@effect/vitest"
import { Effect, FileSystem, Layer } from "effect"

import { LinuxCpuSource } from "../src/adapters/linux/LinuxCpuSource"
import { LinuxFs } from "../src/adapters/linux/LinuxFs"
import { CpuSource } from "../src/ports/CpuSource"
import { fixturePath } from "./support/fixtureHost"

// /proc/stat as it reads on consecutive calls: the fixture snapshot, then one second later.
const snapshots = [readFileSync(fixturePath("vm", "proc/stat"), "utf8"), readFileSync(fixturePath("vm", "proc/stat.next"), "utf8")]

const cpuOnSnapshots = () => {
  let reads = 0
  return LinuxCpuSource.pipe(
    Layer.provide(Layer.succeed(LinuxFs, { proc: "/proc", sys: "/sys", statfs: () => Effect.die("unused") })),
    Layer.provide(FileSystem.layerNoop({
      readFileString: (path) => {
        assert.strictEqual(path, "/proc/stat")
        return Effect.sync(() => snapshots[Math.min(reads++, snapshots.length - 1)] ?? "")
      },
    })),
  )
}

describe("LinuxCpuSource", () => {
  it.effect("reports the since-boot average first, then the delta since the previous call", () =>
    Effect.gen(function*() {
      const cpu = yield* CpuSource
      const first = yield* cpu.latest
      const second = yield* cpu.latest
      const third = yield* cpu.latest
      assert.isTrue(first.totalPct > 0 && first.totalPct < 10)
      assert.deepStrictEqual(second, { totalPct: 3.5, coresPct: [0, 7] })
      // No jiffies passed between the last two reads.
      assert.deepStrictEqual(third, { totalPct: 0, coresPct: [0, 0] })
    }).pipe(Effect.provide(cpuOnSnapshots())))
})
