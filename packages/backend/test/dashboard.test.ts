import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"

import refs from "../confect/_generated/refs"
import { Unauthorized } from "../confect/errors"
import { useTestEnv } from "./env"
import { agentToken, allowedUser, batch, day, minute, now, row } from "./fixtures"
import * as TestConfect from "./TestConfect"

useTestEnv()

const { heartbeat, hosts, live, history } = refs.public.dashboard

describe("dashboard auth", () => {
  it.effect("rejects no identity and a wrong subject on every function", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      for (const caller of [c, c.withIdentity({ subject: "someone_else" })]) {
        const errors = [
          yield* caller.mutation(heartbeat).pipe(Effect.flip),
          yield* caller.query(hosts).pipe(Effect.flip),
          yield* caller.query(live, { host: "a" }).pipe(Effect.flip),
          yield* caller.query(history, { host: "a", range: "1h", to: now }).pipe(Effect.flip),
        ]
        for (const error of errors) expect(error).toBeInstanceOf(Unauthorized)
      }
    }).pipe(Effect.provide(TestConfect.layer)),
  )
})

describe("dashboard queries", () => {
  it.effect("hosts and live return what the agent reported", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      const user = c.withIdentity({ subject: allowedUser })
      expect(yield* user.query(live, { host: "a" })).toBeNull()

      yield* c.mutation(refs.public.agent.report, { token: agentToken, ...batch("b") })
      yield* c.mutation(refs.public.agent.report, { token: agentToken, ...batch("a") })

      expect(yield* user.query(hosts)).toEqual([
        { host: "a", updatedAt: now },
        { host: "b", updatedAt: now },
      ])
      expect(yield* user.query(live, { host: "a" })).toEqual({ host: "a", updatedAt: now, sample: batch("a").sample })
    }).pipe(Effect.provide(TestConfect.layer)),
  )

  it.effect("history reads [from, to) from the table the range picks", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      const user = c.withIdentity({ subject: allowedUser })
      const hourFrom = now - 60 * minute
      const weekFrom = now - 7 * day
      const aggregates = [
        row("a", hourFrom - minute),
        row("a", hourFrom),
        row("a", now - minute),
        row("a", now),
        row("a", weekFrom - 60 * minute, "hour"),
        row("a", weekFrom, "hour"),
        row("a", now, "hour"),
      ]
      yield* c.mutation(refs.public.agent.report, { token: agentToken, ...batch("a", aggregates) })
      yield* c.mutation(refs.public.agent.report, { token: agentToken, ...batch("b", [row("b", hourFrom)]) })

      const lastHour = yield* user.query(history, { host: "a", range: "1h", to: now })
      expect(lastHour.map((r) => [r.resolution, r.at])).toEqual([
        ["minute", hourFrom],
        ["minute", now - minute],
      ])
      expect(lastHour[0]).toEqual(row("a", hourFrom))

      const lastWeek = yield* user.query(history, { host: "a", range: "7d", to: now })
      expect(lastWeek.map((r) => [r.resolution, r.at])).toEqual([["hour", weekFrom]])
    }).pipe(Effect.provide(TestConfect.layer)),
  )
})
