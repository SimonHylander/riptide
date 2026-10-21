import { fileURLToPath } from "node:url"

import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import { Effect, FileSystem, Layer, Schema, Sink, Stream } from "effect"
import { ChildProcessSpawner } from "effect/process"

import { LinuxFs } from "../../src/adapters/linux/LinuxFs"
import { LinuxSources } from "../../src/adapters/linux/LinuxPlatform"
import { SourceError } from "../../src/ports/SourceError"

export type FixtureHost = "desktop" | "vm"
export const fixtureHosts: ReadonlyArray<FixtureHost> = ["desktop", "vm"]

/** Absolute path of a file inside a fixture host tree. */
export const fixturePath = (host: FixtureHost, file = "") =>
  fileURLToPath(new URL(`../fixtures/${host}/${file}`, import.meta.url))

const StatfsFixture = Schema.Record(Schema.String, Schema.Struct({ totalBytes: Schema.Number, usedBytes: Schema.Number }))

/** `LinuxFs` rooted at a fixture host, with `statfs` answered from its `statfs.json`. */
export const fixtureLinuxFs = (host: FixtureHost) =>
  Layer.effect(
    LinuxFs,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const sizes = yield* fs.readFileString(fixturePath(host, "statfs.json")).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(StatfsFixture))),
        Effect.orDie,
      )
      return LinuxFs.of({
        proc: fixturePath(host, "proc"),
        sys: fixturePath(host, "sys"),
        statfs: (mount) => {
          const size = sizes[mount]
          return size === undefined
            ? Effect.fail(new SourceError({ source: "disk", message: `no statfs fixture for ${mount}` }))
            : Effect.succeed(size)
        },
      })
    }),
  )

/** All Linux sources reading a fixture host through the real file system. */
export const linuxFixturePlatform = (host: FixtureHost) =>
  LinuxSources.pipe(Layer.provide(fixtureLinuxFs(host)), Layer.provide(BunFileSystem.layer))

/** One scripted fake process run: what it prints on stdout and its exit code. */
export interface FakeRun {
  readonly stdout: string
  readonly exitCode: number
  /** Keep stdout open after printing, like a looping `nvidia-smi -lms`. */
  readonly stayOpen?: boolean
}

/**
 * A ChildProcessSpawner whose n-th spawn plays `runs[n]` (the last run repeats).
 * `spawns` counts how often it was asked to spawn.
 */
export const fakeSpawner = (runs: ReadonlyArray<FakeRun>) => {
  let spawns = 0
  const encoder = new TextEncoder()
  const spawner = ChildProcessSpawner.make(() =>
    Effect.sync(() => {
      const run = runs[Math.min(spawns, runs.length - 1)] ?? { stdout: "", exitCode: 0 }
      spawns += 1
      const output = Stream.make(encoder.encode(run.stdout))
      const stdout = run.stayOpen === true ? Stream.concat(output, Stream.never) : output
      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1000 + spawns),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(run.exitCode)),
        isRunning: Effect.succeed(run.stayOpen === true),
        kill: () => Effect.void,
        stdin: Sink.drain,
        stdout,
        stderr: Stream.empty,
        all: stdout,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      })
    })
  )
  return {
    layer: Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
    spawns: () => spawns,
  }
}
