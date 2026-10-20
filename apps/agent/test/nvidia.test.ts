import { readFileSync } from "node:fs"

import { assert, describe, it } from "@effect/vitest"
import type { GpuReading } from "@riptide/domain"
import { Effect, Layer, Option } from "effect"
import { TestClock } from "effect/testing"

import { NvidiaGpuSource, nvidiaSmiAvailable, restartDelay } from "../src/adapters/nvidia/NvidiaGpuSource"
import { parseGpuLine } from "../src/adapters/nvidia/parse"
import { GpuSource } from "../src/ports/GpuSource"
import { fakeSpawner, fixturePath } from "./support/fixtureHost"

const MiB = 1024 * 1024
const desktopCsv = readFileSync(fixturePath("desktop", "nvidia-smi.csv"), "utf8")

/** Polls `latest` until it satisfies `done`, letting the adapter's background fiber run. */
const latestWhen = Effect.fnUntraced(function*(done: (gpus: ReadonlyArray<GpuReading>) => boolean) {
  const source = yield* GpuSource
  return yield* source.latest.pipe(Effect.tap(() => Effect.yieldNow), Effect.repeat({ until: done }))
})

describe("parseGpuLine", () => {
  it("parses the desktop's nvidia-smi output, MiB to bytes", () => {
    const lines = desktopCsv.trim().split("\n")
    assert.strictEqual(lines.length, 3)
    assert.deepStrictEqual(Option.getOrThrow(parseGpuLine(lines[2] ?? "")), {
      index: 0,
      name: "NVIDIA GeForce RTX 4070 SUPER",
      utilizationPct: 41,
      memoryUsedBytes: 2318 * MiB,
      memoryTotalBytes: 12282 * MiB,
      temperatureCelsius: 39,
      powerWatts: 87.36,
    })
  })

  it("omits optional keys nvidia-smi cannot report", () => {
    const gpu = Option.getOrThrow(parseGpuLine("1, Tesla K80, 0, 0, 11441, [N/A], [Not Supported]"))
    assert.deepStrictEqual(gpu, { index: 1, name: "Tesla K80", utilizationPct: 0, memoryUsedBytes: 0, memoryTotalBytes: 11441 * MiB })
    assert.isFalse("temperatureCelsius" in gpu)
    assert.isFalse("powerWatts" in gpu)
  })

  it("drops lines missing a required field or in the wrong shape", () => {
    assert.isTrue(Option.isNone(parseGpuLine("0, NVIDIA A100, [N/A], 10, 40960, 30, 50")))
    assert.isTrue(Option.isNone(parseGpuLine("No devices were found")))
    assert.isTrue(Option.isNone(parseGpuLine("")))
  })
})

describe("NvidiaGpuSource", () => {
  it.effect("keeps one reading per GPU, the latest line of each, ordered by index", () =>
    Effect.gen(function*() {
      const gpus = yield* latestWhen((g) => g.length === 2 && g[1]?.utilizationPct === 99)
      assert.deepStrictEqual(gpus.map((g) => [g.index, g.utilizationPct]), [[0, 41], [1, 99]])
    }).pipe(Effect.provide(NvidiaGpuSource.pipe(Layer.provide(fakeSpawner([{
      stdout: "1, GPU B, 10, 1, 2, 30, 40\n0, GPU A, 5, 1, 2, 30, 40\n0, GPU A, 41, 1, 2, 30, 40\n1, GPU B, 99, 1, 2, 30, 40\n",
      exitCode: 0,
      stayOpen: true,
    }]).layer)))))

  it.effect("drops readings when nvidia-smi exits and restarts it after the delay", () => {
    const fake = fakeSpawner([{ stdout: desktopCsv, exitCode: 1 }])
    return Effect.gen(function*() {
      yield* latestWhen((g) => g.length === 0 && fake.spawns() === 1)
      yield* TestClock.adjust(restartDelay)
      yield* latestWhen(() => fake.spawns() === 2)
      yield* TestClock.adjust(restartDelay)
      yield* latestWhen(() => fake.spawns() === 3)
    }).pipe(Effect.provide(NvidiaGpuSource.pipe(Layer.provide(fake.layer))))
  })

  it.effect("probe is true only when nvidia-smi -L succeeds", () =>
    Effect.gen(function*() {
      assert.isTrue(yield* nvidiaSmiAvailable.pipe(Effect.provide(fakeSpawner([{ stdout: "GPU 0: x\n", exitCode: 0 }]).layer)))
      assert.isFalse(yield* nvidiaSmiAvailable.pipe(Effect.provide(fakeSpawner([{ stdout: "", exitCode: 6 }]).layer)))
    }))
})
