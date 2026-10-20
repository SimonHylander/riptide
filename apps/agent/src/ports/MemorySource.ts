import type { MemoryReading } from "@riptide/domain"
import { Context, type Effect } from "effect"

import type { SourceError } from "./SourceError"

/** Current RAM and swap usage. */
export class MemorySource extends Context.Service<MemorySource, {
  readonly latest: Effect.Effect<MemoryReading, SourceError>
}>()("@riptide/agent/ports/MemorySource") {}
