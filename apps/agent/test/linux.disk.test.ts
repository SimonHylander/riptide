import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, FileSystem, Layer } from "effect"
import { TestClock } from "effect/testing"

import { LinuxDiskSource, statfsWait } from "../src/adapters/linux/LinuxDiskSource"
import { LinuxFs } from "../src/adapters/linux/LinuxFs"
import { DiskSource } from "../src/ports/DiskSource"

const mounts = "/dev/sda1 / ext4 rw 0 0\nnas:/hung /hung nfs4 rw 0 0\nnas:/slow /slow nfs4 rw 0 0\n"
const size = { totalBytes: 100, usedBytes: 40 }

// `/` always answers, `/hung` never does, `/slow` answers its first call and then never again.
const diskOnStaleShares = () => {
  const calls = new Map<string, number>()
  const statfs = (mount: string) =>
    Effect.suspend(() => {
      const n = (calls.get(mount) ?? 0) + 1
      calls.set(mount, n)
      return mount === "/" || (mount === "/slow" && n === 1) ? Effect.succeed(size) : Effect.never
    })
  const layer = LinuxDiskSource.pipe(
    Layer.provide(Layer.succeed(LinuxFs, { proc: "/proc", sys: "/sys", statfs })),
    Layer.provide(FileSystem.layerNoop({ readFileString: () => Effect.succeed(mounts) })),
  )
  return { layer, calls: (mount: string) => calls.get(mount) ?? 0 }
}

describe("LinuxDiskSource", () => {
  const fake = diskOnStaleShares()

  it.effect("keeps one statfs per mount in flight and does not wait on a pending one", () =>
    Effect.gen(function*() {
      const disks = yield* DiskSource
      // Waits up to statfsWait for the calls it starts, then reports what it knows.
      const waited = Effect.gen(function*() {
        const fiber = yield* Effect.forkChild(disks.latest)
        yield* TestClock.adjust(statfsWait)
        return (yield* Fiber.join(fiber)).map((d) => d.mount)
      })
      assert.deepStrictEqual(yield* waited, ["/", "/slow"])
      // `/slow` hangs now and reports its last known size.
      assert.deepStrictEqual(yield* waited, ["/", "/slow"])
      // Both shares are pending: no new calls, no waiting (the clock does not move).
      assert.deepStrictEqual((yield* disks.latest).map((d) => d.mount), ["/", "/slow"])
      assert.deepStrictEqual([fake.calls("/"), fake.calls("/hung"), fake.calls("/slow")], [3, 1, 2])
    }).pipe(Effect.provide(fake.layer)))
})
