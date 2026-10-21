import { Duration, Effect, Exit, Fiber, FileSystem, Layer, Option, Ref } from "effect"

import { DiskSource } from "../../ports/DiskSource"
import { LinuxFs, readText } from "./LinuxFs"
import { diskReading, type FsSize, parseMounts, realMounts } from "./parse"

/** How long a reading waits for a `statfs` call it started. */
export const statfsWait = Duration.millis(500)

/** Per mount: whether a `statfs` call is still running, and the size it last returned. */
interface MountState {
  readonly pending: boolean
  readonly last: Option.Option<FsSize>
}

/**
 * DiskSource from `/proc/mounts` plus `statfs(2)` per real mount. Each mount has
 * at most one `statfs` in flight. A reading starts a call for every mount without
 * one and waits up to `statfsWait` for it. A call still running after that (a
 * stale network share) keeps running in the background, and until it settles the
 * mount reports its last known size, or is left out if it has none. A failed call
 * leaves the mount out. So a hung mount delays at most the one reading that
 * started its call, and never piles up calls.
 */
export const LinuxDiskSource = Layer.effect(
  DiskSource,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const linux = yield* LinuxFs
    const scope = yield* Effect.scope
    const states = yield* Ref.make<ReadonlyMap<string, MountState>>(new Map())

    const settle = (mount: string, last: Option.Option<FsSize>) =>
      Ref.update(states, (current) => new Map(current).set(mount, { pending: false, last }))

    // Marks `mount` pending unless it already is. True when the caller should start the call.
    const claim = (mount: string) =>
      Ref.modify(states, (current) => {
        const state = current.get(mount)
        if (state?.pending === true) return [false, current]
        return [true, new Map(current).set(mount, { pending: true, last: state?.last ?? Option.none() })]
      })

    const size = Effect.fnUntraced(function*(mount: string) {
      if (yield* claim(mount)) {
        const call = yield* linux.statfs(mount).pipe(
          Effect.tapError((error) => Effect.logDebug(`skipping ${mount}`, error)),
          // Settles on any exit, defects included, so the mount never stays pending.
          Effect.exit,
          Effect.flatMap((exit) => settle(mount, Exit.getSuccess(exit))),
          Effect.forkIn(scope),
        )
        yield* Fiber.await(call).pipe(Effect.timeoutOption(statfsWait))
      }
      return (yield* Ref.get(states)).get(mount)?.last ?? Option.none()
    })

    const latest = readText(fs, "disk", `${linux.proc}/mounts`).pipe(
      Effect.map((text) => realMounts(parseMounts(text))),
      Effect.flatMap((mounts) =>
        Effect.forEach(mounts, (entry) =>
          size(entry.mount).pipe(
            Effect.map(Option.match({ onNone: () => [], onSome: (fsSize) => diskReading(entry, fsSize) })),
          ), { concurrency: "unbounded" })
      ),
      Effect.map((readings) => readings.flat()),
    )
    return DiskSource.of({ latest })
  }),
)
