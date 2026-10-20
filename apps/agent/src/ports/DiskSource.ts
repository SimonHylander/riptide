import type { DiskReading } from "@riptide/domain"
import { Context, type Effect } from "effect"

import type { SourceError } from "./SourceError"

/** Usage of every real (non-pseudo) mounted filesystem, one entry per device. */
export class DiskSource extends Context.Service<DiskSource, {
  readonly latest: Effect.Effect<ReadonlyArray<DiskReading>, SourceError>
}>()("@riptide/agent/ports/DiskSource") {}
