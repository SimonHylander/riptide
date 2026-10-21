import { FunctionImpl, GroupImpl } from "@confect/server"
import { retentionCutoff, type EpochMillis } from "@riptide/domain"
import * as Clock from "effect/Clock"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import refs from "./_generated/refs"
import databaseSchema from "./_generated/schema"
import { DatabaseReader, DatabaseWriter, Scheduler } from "./_generated/services"
import { aggregateTables, type AggregateTable } from "./aggregateTables"
import retention from "./retention.spec"

/** Rows deleted per table per run. Keeps each mutation well inside Convex write limits. */
export const purgeBatchSize = 500

/** Deletes up to {@link purgeBatchSize} rows with `at < cutoff` and returns how many it deleted. */
const purgeTable = Effect.fnUntraced(function* (table: AggregateTable, cutoff: EpochMillis) {
  const writer = yield* DatabaseWriter
  const batch = yield* (yield* DatabaseReader)
    .table(table)
    .index("by_at", (q) => q.lt("at", cutoff))
    .take(purgeBatchSize)
  yield* Effect.forEach(batch, (doc) => writer.table(table).delete(doc._id), { discard: true })
  return batch.length
})

/** Purges one batch from each aggregate table and reschedules itself while a batch came back full. */
const purge = FunctionImpl.make(databaseSchema, retention, "purge", () =>
  Effect.gen(function* () {
    const cutoff = retentionCutoff(yield* Clock.currentTimeMillis)
    const minutes = yield* purgeTable(aggregateTables.minute, cutoff)
    const hours = yield* purgeTable(aggregateTables.hour, cutoff)
    if (minutes === purgeBatchSize || hours === purgeBatchSize) {
      yield* (yield* Scheduler).runAfter(Duration.zero, refs.internal.retention.purge)
    }
    return null
  }).pipe(Effect.orDie),
)

export default GroupImpl.make(databaseSchema, retention).pipe(Layer.provide(purge), GroupImpl.finalize)
