import { FunctionSpec, GroupSpec } from "@confect/core"
import { AggregateRow, EpochMillis, HistoryRange } from "@riptide/domain"
import * as Schema from "effect/Schema"

import live from "./_generated/tables/live"
import { Unauthorized } from "./errors"

/** A host the agent has reported, with the server time of its last report. */
export const HostSummary = Schema.Struct({ host: Schema.String, updatedAt: EpochMillis })
export type HostSummary = typeof HostSummary.Type

// Every function requires the signed-in user to be ALLOWED_USER_ID.
export default GroupSpec.make()
  .addFunction(
    /** Marks a viewer as present by setting `presence.lastSeen` to now. */
    FunctionSpec.publicMutation({
      name: "heartbeat",
      returns: () => Schema.Null,
      error: () => Unauthorized,
    }),
  )
  .addFunction(
    /** Every reported host, ordered by host name. */
    FunctionSpec.publicQuery({
      name: "hosts",
      returns: () => Schema.Array(HostSummary),
      error: () => Unauthorized,
    }),
  )
  .addFunction(
    /** The latest sample of `host`, or null if it never reported. */
    FunctionSpec.publicQuery({
      name: "live",
      args: () => ({ host: Schema.String }),
      returns: () => Schema.NullOr(live.Fields),
      error: () => Unauthorized,
    }),
  )
  .addFunction(
    /** Aggregate rows of `host` in `[to - span, to)` for `range`, oldest first. `to` comes from the caller. */
    FunctionSpec.publicQuery({
      name: "history",
      args: () => ({ host: Schema.String, range: HistoryRange, to: EpochMillis }),
      returns: () => Schema.Array(AggregateRow),
      error: () => Unauthorized,
    }),
  )
