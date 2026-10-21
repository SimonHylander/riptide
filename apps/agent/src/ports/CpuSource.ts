import type { CpuReading } from "@riptide/domain"
import { Context, type Effect } from "effect"

import type { SourceError } from "./SourceError"

/** CPU utilization since the previous `latest` call, total and per logical core. */
export class CpuSource extends Context.Service<CpuSource, {
  readonly latest: Effect.Effect<CpuReading, SourceError>
}>()("@riptide/agent/ports/CpuSource") {}
