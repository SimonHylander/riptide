import type { GpuReading } from "@riptide/domain"
import { Clock, Duration, Effect, Layer, Option, Ref, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { GpuSource } from "../../ports/GpuSource"
import { gpuLineIndex, parseGpuLine, queryFields } from "./parse"

/** The long-lived query: one CSV line per GPU, every second. */
export const nvidiaSmiQuery = ChildProcess.make(
  "nvidia-smi",
  [`--query-gpu=${queryFields.join(",")}`, "--format=csv,noheader,nounits", "-lms", "1000"],
  { stderr: "ignore" },
)

/** How long to wait before restarting an `nvidia-smi` that exited. */
export const restartDelay = Duration.seconds(1)

/** A GPU without a new line for longer than this (a few query intervals) is dropped. */
export const staleAfter = Duration.seconds(3)

interface Entry {
  readonly gpu: GpuReading
  /** Clock time of the line, in ms. */
  readonly at: number
}

/**
 * GpuSource backed by one `nvidia-smi -lms 1000` process, owned by the layer's
 * scope. Each line updates that GPU's entry, so `latest` holds one reading per
 * GPU. A line naming a GPU but missing a required field drops that GPU, and so
 * does going `staleAfter` without a line. When the process exits, its readings
 * are dropped and it is restarted after `restartDelay`.
 */
export const NvidiaGpuSource = Layer.effect(
  GpuSource,
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const entries = yield* Ref.make<ReadonlyMap<number, Entry>>(new Map())

    const record = (gpu: GpuReading) =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((at) => Ref.update(entries, (current) => new Map(current).set(gpu.index, { gpu, at }))),
      )
    const forget = (index: number) =>
      Ref.update(entries, (current) => {
        const next = new Map(current)
        next.delete(index)
        return next
      })
    const onLine = (line: string) =>
      Option.match(parseGpuLine(line), {
        onSome: record,
        onNone: () => Option.match(gpuLineIndex(line), { onNone: () => Effect.void, onSome: forget }),
      })

    yield* spawner.streamLines(nvidiaSmiQuery).pipe(
      Stream.runForEach(onLine),
      Effect.catch((error) => Effect.logWarning("nvidia-smi failed", error)),
      Effect.andThen(Ref.set(entries, new Map())),
      Effect.andThen(Effect.logWarning("nvidia-smi exited, restarting")),
      Effect.andThen(Effect.sleep(restartDelay)),
      Effect.forever,
      Effect.forkScoped,
    )

    const latest = Effect.gen(function*() {
      const now = yield* Clock.currentTimeMillis
      const fresh = [...(yield* Ref.get(entries)).values()].filter((entry) => now - entry.at <= Duration.toMillis(staleAfter))
      return fresh.map((entry) => entry.gpu).sort((a, b) => a.index - b.index)
    })
    return GpuSource.of({ latest })
  }),
)

/** True when `nvidia-smi` is on PATH and `nvidia-smi -L` lists GPUs. The composition root uses it to pick a GpuSource. */
export const nvidiaSmiAvailable = Effect.gen(function*() {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const code = yield* spawner.exitCode(ChildProcess.make("nvidia-smi", ["-L"], { stdout: "ignore", stderr: "ignore" }))
  return code === ChildProcessSpawner.ExitCode(0)
}).pipe(
  Effect.timeout("5 seconds"),
  Effect.orElseSucceed(() => false),
)
