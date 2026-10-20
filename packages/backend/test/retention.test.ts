import { describe, expect, it } from "@effect/vitest"
import { retentionCutoff } from "@riptide/domain"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { vi } from "vitest"

import refs from "../confect/_generated/refs"
import { DatabaseReader, DatabaseWriter } from "../confect/_generated/services"
import { purgeBatchSize } from "../confect/retention.impl"
import { useTestEnv } from "./env"
import { minute, now, row } from "./fixtures"
import * as TestConfect from "./TestConfect"

useTestEnv({ timers: true })

const cutoff = retentionCutoff(now)

const remaining = Effect.gen(function* () {
  const reader = yield* DatabaseReader
  const minutes = yield* reader.table("minutes").index("by_at").collect()
  const hours = yield* reader.table("hours").index("by_at").collect()
  return { minutes: minutes.map((r) => r.at), hours: hours.map((r) => r.at) }
}).pipe(Effect.orDie)

// `c.run` return schemas must encode to Convex values, whose arrays are mutable.
const Remaining = Schema.Struct({ minutes: Schema.mutable(Schema.Array(Schema.Number)), hours: Schema.mutable(Schema.Array(Schema.Number)) })

describe("retention.purge", () => {
  it.effect("deletes rows before the 30 day cutoff across rescheduled batches", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter
          const old = Array.from({ length: purgeBatchSize + 1 }, (_, i) => row("a", cutoff - (i + 1) * minute))
          const kept = [row("a", cutoff), row("a", now)]
          yield* Effect.forEach([...old, ...kept], (r) => writer.table("minutes").insert(r), { discard: true })
          const hours = [row("a", cutoff - 1, "hour"), row("a", cutoff, "hour")]
          yield* Effect.forEach(hours, (r) => writer.table("hours").insert(r), { discard: true })
        }).pipe(Effect.orDie),
      )

      yield* c.mutation(refs.internal.retention.purge)
      const afterFirst = yield* c.run(remaining, Remaining)
      // Oldest go first, so the newest stale row survives the first batch.
      expect(afterFirst.minutes).toEqual([cutoff - minute, cutoff, now])
      expect(afterFirst.hours).toEqual([cutoff])

      yield* c.finishAllScheduledFunctions(() => vi.runAllTimers())
      expect(yield* c.run(remaining, Remaining)).toEqual({ minutes: [cutoff, now], hours: [cutoff] })
    }).pipe(Effect.provide(TestConfect.layer)),
  )
})
