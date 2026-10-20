import type { HostReading } from "@riptide/domain"
import { Context, type Effect } from "effect"

import type { SourceError } from "./SourceError"

/** The host's name (resolved once when the layer is built) plus its current load and uptime. */
export class HostInfo extends Context.Service<HostInfo, {
  readonly hostname: string
  readonly latest: Effect.Effect<HostReading, SourceError>
}>()("@riptide/agent/ports/HostInfo") {}
