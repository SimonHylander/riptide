import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Layer, Ref } from "effect"
import { TestClock } from "effect/testing"

import { FixturePlatform } from "../../src/adapters/fixture/FixtureSources"
import * as InMemory from "../../src/adapters/memory/InMemoryReportGateway"
import * as Agent from "../../src/core/Agent"
import { CpuSource } from "../../src/ports/CpuSource"

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)
const minute = 60_000

/** Starts the agent at `T0 + offsetSeconds` on fixture sources and the in-memory gateway, and waits for its first report. */
const start = Effect.fnUntraced(function*(offsetSeconds: number) {
  yield* TestClock.setTime(T0 + offsetSeconds * 1000)
  yield* Effect.forkChild(Agent.run({ host: "fixture" }))
  const gateway = yield* InMemory.InMemoryReportGateway
  yield* gateway.calls.pipe(Effect.tap(() => Effect.yieldNow), Effect.repeat({ until: (calls) => calls.length > 0 }))
  return gateway
})

/** Call times in seconds after T0. */
const seconds = (calls: ReadonlyArray<InMemory.ReportCall>) => calls.map((call) => (call.at - T0) / 1000)

/** Minute offsets (from T0) of the rows each call carried. */
const rowMinutes = (calls: ReadonlyArray<InMemory.ReportCall>) =>
  calls.flatMap((call) => call.batch.aggregates.map((row) => `${row.resolution}:${(row.at - T0) / minute}`))

const TestLayer = Layer.merge(FixturePlatform, InMemory.layer)

describe("Agent", () => {
  it.effect("reports every 1s while presence is fresh, every 60s otherwise", () =>
    Effect.gen(function*() {
      yield* (yield* InMemory.InMemoryReportGateway).setLastSeen(T0)
      const gateway = yield* start(0)
      yield* TestClock.adjust("140 seconds")
      // Fresh until 30s after the heartbeat, then idle.
      const live = Array.from({ length: 31 }, (_, i) => i)
      assert.deepStrictEqual(seconds(yield* gateway.calls), [...live, 90])

      // A heartbeat arrives; the next idle reply carries it and 1s reports resume.
      yield* gateway.setLastSeen(T0 + 140_000)
      yield* TestClock.adjust("13 seconds")
      assert.deepStrictEqual(seconds(yield* gateway.calls).slice(31), [90, 150, 151, 152, 153])
    }).pipe(Effect.provide(TestLayer)))

  it.effect("retries with capped exponential backoff and resends rows in order, once", () =>
    Effect.gen(function*() {
      const gateway = yield* start(30)
      yield* gateway.failNext(["Transport", "Transport", "Unauthorized", "Decode", "Transport", "Transport"])
      yield* TestClock.adjust("190 seconds")

      const calls = yield* gateway.calls
      assert.deepStrictEqual(seconds(calls), [30, 90, 91, 93, 97, 105, 121, 153, 213])
      assert.deepStrictEqual(calls.map((call) => call.outcome), [
        "ok", "Transport", "Transport", "Unauthorized", "Decode", "Transport", "Transport", "ok", "ok",
      ])
      // Failed calls carried the pending rows; the delivered ones arrive in order, each once.
      assert.deepStrictEqual(rowMinutes(calls.slice(1, 2)), ["minute:0"])
      assert.deepStrictEqual(rowMinutes(calls.filter((call) => call.outcome === "ok")), ["minute:0", "minute:1", "minute:2"])
    }).pipe(Effect.provide(TestLayer)))

  it.effect("drops the rows of a rejected batch", () =>
    Effect.gen(function*() {
      const gateway = yield* start(30)
      yield* gateway.failNext(["Rejected"])
      yield* TestClock.adjust("120 seconds")

      const calls = yield* gateway.calls
      assert.deepStrictEqual(seconds(calls), [30, 90, 150])
      assert.deepStrictEqual(calls.map((call) => [call.outcome, rowMinutes([call])]), [
        ["ok", []],
        ["Rejected", ["minute:0"]],
        ["ok", ["minute:1"]],
      ])
    }).pipe(Effect.provide(TestLayer)))

  it.effect("fails when sampling dies, instead of waiting for samples forever", () =>
    Effect.gen(function*() {
      const reads = yield* Ref.make(0)
      const cpu = CpuSource.of({
        latest: Ref.updateAndGet(reads, (n) => n + 1).pipe(
          Effect.flatMap((n) => n === 2 ? Effect.die("cpu source broke") : Effect.succeed({ totalPct: 10, coresPct: [10] })),
        ),
      })
      const fiber = yield* Agent.run({ host: "fixture" }).pipe(Effect.provideService(CpuSource, cpu), Effect.forkChild)
      yield* TestClock.adjust("2 seconds")
      const exit = yield* Effect.exit(Fiber.join(fiber))
      assert.isTrue(Exit.hasDies(exit))
    }).pipe(Effect.provide(TestLayer)))
})
