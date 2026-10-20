import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { vi } from "vitest"

import refs from "../confect/_generated/refs"
import { DatabaseReader } from "../confect/_generated/services"
import { Unauthorized } from "../confect/errors"
import { useTestEnv } from "./env"
import { agentToken, allowedUser, batch, now, row } from "./fixtures"
import * as TestConfect from "./TestConfect"

const report = refs.public.agent.report

useTestEnv()

describe("agent.report", () => {
  it.effect("upserts one live doc per host, patched in place", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      yield* c.mutation(report, { token: agentToken, ...batch("a") })
      yield* c.mutation(report, { token: agentToken, ...batch("b") })
      vi.setSystemTime(now + 1000)
      yield* c.mutation(report, { token: agentToken, ...batch("a") })

      const docs = yield* c.run(
        Effect.gen(function* () {
          const all = yield* (yield* DatabaseReader).table("live").index("by_host").collect()
          return all.map(({ host, updatedAt }) => ({ host, updatedAt }))
        }).pipe(Effect.orDie),
        Schema.mutable(Schema.Array(Schema.Struct({ host: Schema.String, updatedAt: Schema.Number }))),
      )
      expect(docs).toEqual([
        { host: "a", updatedAt: now + 1000 },
        { host: "b", updatedAt: now },
      ])
    }).pipe(Effect.provide(TestConfect.layer)),
  )

  it.effect("stores rows by resolution and replaces a resent (host, at)", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      const at = now - 60_000
      yield* c.mutation(report, { token: agentToken, ...batch("a", [row("a", at), row("a", at, "hour")]) })
      yield* c.mutation(report, { token: agentToken, ...batch("a", [row("a", at, "minute", 59)]) })

      const counts = yield* c.run(
        Effect.gen(function* () {
          const reader = yield* DatabaseReader
          const minutes = yield* reader.table("minutes").index("by_host_at").collect()
          const hours = yield* reader.table("hours").index("by_host_at").collect()
          return { minutes: minutes.map((r) => r.count), hours: hours.map((r) => r.resolution) }
        }).pipe(Effect.orDie),
        Schema.Struct({ minutes: Schema.mutable(Schema.Array(Schema.Number)), hours: Schema.mutable(Schema.Array(Schema.String)) }),
      )
      expect(counts).toEqual({ minutes: [59], hours: ["hour"] })
    }).pipe(Effect.provide(TestConfect.layer)),
  )

  it.effect("rejects a bad token and a missing AGENT_TOKEN", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      const bad = yield* c.mutation(report, { token: "wrong", ...batch("a") }).pipe(Effect.flip)
      expect(bad).toBeInstanceOf(Unauthorized)

      delete process.env.AGENT_TOKEN
      const unset = yield* c.mutation(report, { token: agentToken, ...batch("a") }).pipe(Effect.flip)
      expect(unset).toBeInstanceOf(Unauthorized)
    }).pipe(Effect.provide(TestConfect.layer)),
  )

  it.effect("returns lastSeen 0 before any heartbeat, then the heartbeat time", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      expect(yield* c.mutation(report, { token: agentToken, ...batch("a") })).toEqual({ lastSeen: 0 })

      vi.setSystemTime(now + 5000)
      yield* c.withIdentity({ subject: allowedUser }).mutation(refs.public.dashboard.heartbeat)
      vi.setSystemTime(now + 6000)
      expect(yield* c.mutation(report, { token: agentToken, ...batch("a") })).toEqual({ lastSeen: now + 5000 })
    }).pipe(Effect.provide(TestConfect.layer)),
  )
})
