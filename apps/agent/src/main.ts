import { BunRuntime } from "@effect/platform-bun"
import type { ReportBatch } from "@riptide/domain"
import { Clock, Config, Effect } from "effect"
import { hostname } from "node:os"

import * as ConvexReportGateway from "./adapters/convex/ConvexReportGateway"
import { ReportGateway } from "./ports/ReportGateway"

// Spike entry point: sends one placeholder sample and logs the reply.
// Collectors and the upload loop replace this in later tickets.
const program = Effect.gen(function* () {
  const host = yield* Config.String("RIPTIDE_HOST").pipe(Config.withDefault(hostname()))
  const at = yield* Clock.currentTimeMillis
  const batch: ReportBatch = {
    host,
    sample: {
      at,
      cpu: { totalPct: 0, coresPct: [] },
      memory: { totalBytes: 0, usedBytes: 0, availableBytes: 0, swapTotalBytes: 0, swapUsedBytes: 0 },
      host: { load1: 0, load5: 0, load15: 0, uptimeSeconds: 0 },
      sensors: { temps: [], fans: [] },
      disks: [],
      gpus: [],
    },
    aggregates: [],
  }
  const gateway = yield* ReportGateway
  const { lastSeen } = yield* gateway.report(batch)
  yield* Effect.logInfo("reported", { host, lastSeen })
})

BunRuntime.runMain(program.pipe(Effect.provide(ConvexReportGateway.layerConfig)))
