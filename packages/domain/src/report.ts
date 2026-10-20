import { Schema } from "effect"

import { AggregateRow } from "./aggregate"
import { EpochMillis } from "./primitives"
import { Sample } from "./sample"

/** The `report` payload: the latest sample plus aggregate rows not yet uploaded. */
export const ReportBatch = Schema.Struct({
  host: Schema.String,
  sample: Sample,
  aggregates: Schema.Array(AggregateRow),
})
export type ReportBatch = typeof ReportBatch.Type

/** The `report` reply. `lastSeen` is the last dashboard heartbeat in epoch ms, 0 if never. */
export const ReportReply = Schema.Struct({
  lastSeen: EpochMillis,
})
export type ReportReply = typeof ReportReply.Type
