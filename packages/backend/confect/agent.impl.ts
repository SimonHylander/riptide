import { FunctionImpl, GroupImpl } from "@confect/server"
import type { AggregateRow, EpochMillis, ReportBatch } from "@riptide/domain"
import * as Clock from "effect/Clock"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import databaseSchema from "./_generated/schema"
import { DatabaseReader, DatabaseWriter } from "./_generated/services"
import { requireAgentToken } from "./access"
import agent from "./agent.spec"
import { aggregateTables } from "./aggregateTables"
import { InvalidBatch } from "./errors"

/** Minimum age of a `hosts.updatedAt` before a report rewrites it. */
export const hostsRefreshInterval = Duration.minutes(1)

/** Fails `InvalidBatch` if any aggregate row belongs to a host other than the batch's. */
const requireOwnRows = Effect.fnUntraced(function* ({ host, aggregates }: ReportBatch) {
  const foreign = aggregates.find((row) => row.host !== host)
  if (foreign) return yield* new InvalidBatch({ reason: `aggregate row for host "${foreign.host}" in a report for "${host}"` })
})

/** Patches the host's `live` doc, or inserts it on the first report. */
const upsertLive = Effect.fnUntraced(function* ({ host, sample }: ReportBatch, now: EpochMillis) {
  const reader = yield* DatabaseReader
  const writer = yield* DatabaseWriter
  const existing = yield* reader.table("live").index("by_host", (q) => q.eq("host", host)).first()
  yield* Option.match(existing, {
    onNone: () => writer.table("live").insert({ host, updatedAt: now, sample }),
    onSome: (doc) => writer.table("live").patch(doc._id, { updatedAt: now, sample }),
  })
})

/** Inserts the host's `hosts` doc, or refreshes `updatedAt` once it is {@link hostsRefreshInterval} old. */
const upsertHost = Effect.fnUntraced(function* (host: string, now: EpochMillis) {
  const reader = yield* DatabaseReader
  const writer = yield* DatabaseWriter
  const existing = yield* reader.table("hosts").index("by_host", (q) => q.eq("host", host)).first()
  yield* Option.match(existing, {
    onNone: () => writer.table("hosts").insert({ host, updatedAt: now }),
    onSome: (doc) =>
      now - doc.updatedAt < Duration.toMillis(hostsRefreshInterval)
        ? Effect.void
        : writer.table("hosts").patch(doc._id, { updatedAt: now }),
  })
})

/** Stores a row in its resolution's table. A resend of the same `(host, at)` replaces the stored row. */
const upsertAggregate = Effect.fnUntraced(function* (row: AggregateRow) {
  const table = aggregateTables[row.resolution]
  const reader = yield* DatabaseReader
  const writer = yield* DatabaseWriter
  const existing = yield* reader
    .table(table)
    .index("by_host_at", (q) => q.eq("host", row.host).eq("at", row.at))
    .first()
  yield* Option.match(existing, {
    onNone: () => writer.table(table).insert(row),
    onSome: (doc) => writer.table(table).replace(doc._id, row),
  })
})

/** Writes the batch and reads the last heartbeat, 0 if the dashboard was never opened. */
const storeBatch = Effect.fnUntraced(function* (batch: ReportBatch) {
  const now = yield* Clock.currentTimeMillis
  yield* upsertLive(batch, now)
  yield* upsertHost(batch.host, now)
  yield* Effect.forEach(batch.aggregates, upsertAggregate, { discard: true })
  const presence = yield* (yield* DatabaseReader).table("presence").index("by_creation_time").first()
  return { lastSeen: Option.match(presence, { onNone: () => 0, onSome: (doc) => doc.lastSeen }) }
}, Effect.orDie)

/** Checks the agent token and that every row is the batch host's, then stores the batch. */
const report = FunctionImpl.make(databaseSchema, agent, "report", ({ token, ...batch }) =>
  requireAgentToken(token).pipe(Effect.andThen(requireOwnRows(batch)), Effect.andThen(storeBatch(batch))),
)

export default GroupImpl.make(databaseSchema, agent).pipe(Layer.provide(report), GroupImpl.finalize)
