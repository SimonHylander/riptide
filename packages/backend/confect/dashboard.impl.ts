import { FunctionImpl, GroupImpl } from "@confect/server"
import { rangeWindow } from "@riptide/domain"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import databaseSchema from "./_generated/schema"
import { DatabaseReader, DatabaseWriter } from "./_generated/services"
import { requireAllowedUser } from "./access"
import { aggregateTables } from "./aggregateTables"
import dashboard from "./dashboard.spec"

// Queries below never read the clock: time must not drive query results or reactivity.

/** Sets `presence.lastSeen` to now, creating the doc on the first heartbeat. */
const heartbeat = FunctionImpl.make(databaseSchema, dashboard, "heartbeat", () =>
  requireAllowedUser.pipe(
    Effect.andThen(
      Effect.gen(function* () {
        const lastSeen = yield* Clock.currentTimeMillis
        const reader = yield* DatabaseReader
        const writer = yield* DatabaseWriter
        const existing = yield* reader.table("presence").index("by_creation_time").first()
        yield* Option.match(existing, {
          onNone: () => writer.table("presence").insert({ lastSeen }),
          onSome: (doc) => writer.table("presence").patch(doc._id, { lastSeen }),
        })
        return null
      }).pipe(Effect.orDie),
    ),
  ),
)

/** Reads every `live` doc. One per host, so the read stays small. */
const hosts = FunctionImpl.make(databaseSchema, dashboard, "hosts", () =>
  requireAllowedUser.pipe(
    Effect.andThen(
      Effect.gen(function* () {
        const docs = yield* (yield* DatabaseReader).table("live").index("by_host").collect()
        return docs.map(({ host, updatedAt }) => ({ host, updatedAt }))
      }).pipe(Effect.orDie),
    ),
  ),
)

/** Reads the host's `live` doc without system fields. */
const live = FunctionImpl.make(databaseSchema, dashboard, "live", ({ host }) =>
  requireAllowedUser.pipe(
    Effect.andThen(
      Effect.gen(function* () {
        const doc = yield* (yield* DatabaseReader).table("live").index("by_host", (q) => q.eq("host", host)).first()
        return Option.match(doc, {
          onNone: () => null,
          onSome: ({ host, updatedAt, sample }) => ({ host, updatedAt, sample }),
        })
      }).pipe(Effect.orDie),
    ),
  ),
)

/** Reads `[from, to)` from the range's table on `by_host_at` and strips system fields. */
const history = FunctionImpl.make(databaseSchema, dashboard, "history", ({ host, range, to }) =>
  requireAllowedUser.pipe(
    Effect.andThen(
      Effect.gen(function* () {
        const { resolution, from } = rangeWindow(range, to)
        const docs = yield* (yield* DatabaseReader)
          .table(aggregateTables[resolution])
          .index("by_host_at", (q) => q.eq("host", host).gte("at", from).lt("at", to))
          .collect()
        return docs.map(({ _id, _creationTime, ...row }) => row)
      }).pipe(Effect.orDie),
    ),
  ),
)

export default GroupImpl.make(databaseSchema, dashboard).pipe(
  Layer.provide(heartbeat),
  Layer.provide(hosts),
  Layer.provide(live),
  Layer.provide(history),
  GroupImpl.finalize,
)
