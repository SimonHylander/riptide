import type { SensorReading } from "@riptide/domain"
import { Context, type Effect } from "effect"

import type { SourceError } from "./SourceError"

/** Every temperature and fan sensor the host exposes. Both lists are empty on hosts without sensors. */
export class SensorSource extends Context.Service<SensorSource, {
  readonly latest: Effect.Effect<SensorReading, SourceError>
}>()("@riptide/agent/ports/SensorSource") {}
