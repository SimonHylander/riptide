// Composition root: the only module that names concrete adapters.
//
// Config (all through Effect `Config`):
//   RIPTIDE_PLATFORM          `linux` (default) or `fixture` (fake readings, for local runs on macOS)
//   RIPTIDE_GATEWAY           `convex` (default) or `stdout` (one JSON batch per line)
//   RIPTIDE_HOST              host name to report as, default the platform's hostname
//   CONVEX_URL                deployment URL, convex gateway only
//   CREDENTIALS_DIRECTORY     set by systemd; the token is read from `$CREDENTIALS_DIRECTORY/token`
//   RIPTIDE_AGENT_TOKEN       agent token when CREDENTIALS_DIRECTORY is unset (local dev)
//   RIPTIDE_STDOUT_LAST_SEEN  stdout gateway only: `now` or epoch ms, see StdoutReportGateway
//
// Logs go to stderr, so stdout carries only the stdout gateway's batches.
// SIGTERM/SIGINT interrupt the agent through `runMain`.
import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import { Config, Effect, FileSystem, Layer, Option, Path, Redacted, References } from "effect"

import * as ConvexReportGateway from "./adapters/convex/ConvexReportGateway"
import { EmptyGpuSource } from "./adapters/empty/EmptySources"
import { FixturePlatform } from "./adapters/fixture/FixtureSources"
import { LinuxPlatform } from "./adapters/linux/LinuxPlatform"
import { NvidiaGpuSource, nvidiaSmiAvailable } from "./adapters/nvidia/NvidiaGpuSource"
import * as StdoutReportGateway from "./adapters/stdout/StdoutReportGateway"
import * as Agent from "./core/Agent"
import { HostInfo } from "./ports/HostInfo"

/** The source ports: Linux with the GPU source picked by probing `nvidia-smi`, or fixtures. */
const Platform = Layer.unwrap(
  Effect.gen(function*() {
    const platform = yield* Config.Literals(["linux", "fixture"], "RIPTIDE_PLATFORM").pipe(Config.withDefault("linux"))
    if (platform === "fixture") return FixturePlatform
    const nvidia = yield* nvidiaSmiAvailable
    return Layer.merge(LinuxPlatform, nvidia ? NvidiaGpuSource : EmptyGpuSource)
  }),
)

/** The agent token from the systemd credential if present, else `RIPTIDE_AGENT_TOKEN`. */
const agentToken = Effect.gen(function*() {
  const credentials = yield* Config.option(Config.String("CREDENTIALS_DIRECTORY"))
  if (Option.isNone(credentials)) return yield* Config.Redacted("RIPTIDE_AGENT_TOKEN")
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const token = yield* fs.readFileString(path.join(credentials.value, "token"))
  return Redacted.make(token.trim())
})

const Gateway = Layer.unwrap(
  Effect.gen(function*() {
    const gateway = yield* Config.Literals(["convex", "stdout"], "RIPTIDE_GATEWAY").pipe(Config.withDefault("convex"))
    if (gateway === "stdout") return StdoutReportGateway.layerConfig
    const url = yield* Config.String("CONVEX_URL")
    const token = yield* agentToken
    return ConvexReportGateway.layer({ url, token })
  }),
)

const program = Effect.gen(function*() {
  const { hostname } = yield* HostInfo
  const host = yield* Config.String("RIPTIDE_HOST").pipe(Config.withDefault(hostname))
  yield* Effect.logInfo(`riptide-agent reporting as ${host}`)
  return yield* Agent.run({ host })
})

program.pipe(
  Effect.provide(Layer.merge(Platform, Gateway).pipe(Layer.provide(BunServices.layer))),
  Effect.provideService(References.LogToStderr, true),
  BunRuntime.runMain,
)
