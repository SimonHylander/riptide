import { statfs } from "node:fs/promises"

import { Context, Effect, type FileSystem, Layer, type Result } from "effect"

import { SourceError } from "../../ports/SourceError"
import type { FsSize } from "./parse"

/**
 * Where the Linux adapters read the kernel's view of the host. `live` reads the
 * real `/proc`, `/sys` and `statfs(2)`. Tests point it at a fixture tree so the
 * adapters run deterministically on any OS.
 */
export class LinuxFs extends Context.Service<LinuxFs, {
  /** Root of procfs, normally `/proc`. */
  readonly proc: string
  /** Root of sysfs, normally `/sys`. */
  readonly sys: string
  /** Size of the filesystem mounted at `mount` (a real path, never under `proc`). */
  readonly statfs: (mount: string) => Effect.Effect<FsSize, SourceError>
}>()("@riptide/agent/adapters/linux/LinuxFs") {
  static readonly live = Layer.succeed(LinuxFs, {
    proc: "/proc",
    sys: "/sys",
    statfs: (mount) =>
      Effect.tryPromise({
        try: () => statfs(mount),
        catch: (cause) => new SourceError({ source: "disk", message: `statfs ${mount} failed`, cause }),
      }).pipe(
        // `used` matches df: blocks minus free blocks, including root-reserved ones.
        Effect.map((s) => ({ totalBytes: s.blocks * s.bsize, usedBytes: (s.blocks - s.bfree) * s.bsize })),
      ),
  })
}

/** Reads a kernel text file, mapping I/O failures to a `SourceError` for `source`. */
export const readText = (fs: FileSystem.FileSystem, source: string, path: string) =>
  fs.readFileString(path).pipe(
    Effect.mapError((cause) => new SourceError({ source, message: `cannot read ${path}`, cause })),
  )

/** Lifts a parser result into an effect failing with a `SourceError` for `source`. */
export const fromParse = <A>(source: string, result: Result.Result<A, string>) =>
  Effect.fromResult(result).pipe(Effect.mapError((message) => new SourceError({ source, message })))
