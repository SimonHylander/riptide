import type { GpuReading } from "@riptide/domain"
import { Duration, Effect, Layer, Option, Ref, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { GpuSource } from "../../ports/GpuSource"
import { parseGpuLine, queryFields } from "./parse"

/** The long-lived query: one CSV line per GPU, every second. */
export const nvidiaSmiQuery = ChildProcess.make(
  "nvidia-smi",
  [`--query-gpu=${queryFields.join(",")}`, "--format=csv,noheader,nounits", "-lms", "1000"],
  { stderr: "ignore" },
)

/** How long to wait before restarting an `nvidia-smi` that exited. */
export const restartDelay = Duration.seconds(1)

/**
 * GpuSource backed by one `nvidia-smi -lms 1000` process, owned by the layer's
 * scope. Each line updates that GPU's entry, so `latest` holds one reading per
 * GPU. When the process exits, its readings are dropped and it is restarted
 * after `restartDelay`.
 */
export const NvidiaGpuSource = Layer.effect(
  GpuSource,
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const readings = yield* Ref.make<ReadonlyMap<number, GpuReading>>(new Map())

    const record = (gpu: GpuReading) => Ref.update(readings, (current) => new Map(current).set(gpu.index, gpu))

    yield* spawner.streamLines(nvidiaSmiQuery).pipe(
      Stream.runForEach((line) => Option.match(parseGpuLine(line), { onNone: () => Effect.void, onSome: record })),
      Effect.catch((error) => Effect.logWarning("nvidia-smi failed", error)),
      Effect.andThen(Ref.set(readings, new Map())),
      Effect.andThen(Effect.logWarning("nvidia-smi exited, restarting")),
      Effect.andThen(Effect.sleep(restartDelay)),
      Effect.forever,
      Effect.forkScoped,
    )

    const latest = Ref.get(readings).pipe(
      Effect.map((current) => [...current.values()].sort((a, b) => a.index - b.index)),
    )
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
