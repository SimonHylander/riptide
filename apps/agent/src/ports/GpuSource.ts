import type { GpuReading } from "@riptide/domain"
import { Context, type Effect } from "effect"

import type { SourceError } from "./SourceError"

/** The most recent reading of every GPU, ordered by index. Empty on hosts without a supported GPU. */
export class GpuSource extends Context.Service<GpuSource, {
  readonly latest: Effect.Effect<ReadonlyArray<GpuReading>, SourceError>
}>()("@riptide/agent/ports/GpuSource") {}
