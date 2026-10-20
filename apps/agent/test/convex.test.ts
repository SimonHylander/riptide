import { assert, describe, it } from "@effect/vitest"
import type { ReportBatch } from "@riptide/domain"
import { Duration, Effect, Fiber, Redacted } from "effect"

import * as ConvexReportGateway from "../src/adapters/convex/ConvexReportGateway"
import { ReportGateway } from "../src/ports/ReportGateway"

const batch: ReportBatch = {
  host: "h",
  sample: {
    at: Date.UTC(2026, 0, 1),
    cpu: { totalPct: 10, coresPct: [10] },
    memory: { totalBytes: 100, usedBytes: 40, availableBytes: 60, swapTotalBytes: 0, swapUsedBytes: 0 },
    host: { load1: 1, load5: 1, load15: 1, uptimeSeconds: 1000 },
    sensors: { temps: [], fans: [] },
    disks: [],
    gpus: [],
  },
  aggregates: [],
}

/**
 * A fetch whose first request never answers (it only settles when its signal
 * aborts, as a real fetch does) and whose later requests succeed. Records each
 * request's signal.
 */
const hangFirst = () => {
  const signals: Array<AbortSignal | null | undefined> = []
  const fetch = Object.assign((...[, init]: Parameters<typeof globalThis.fetch>) => {
    signals.push(init?.signal)
    if (signals.length > 1) return Promise.resolve(Response.json({ status: "success", value: { lastSeen: 123 }, logLines: [] }))
    return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))
  }, globalThis.fetch)
  return { fetch, signals }
}

describe("ConvexReportGateway", () => {
  // Live clock: the deadline is a real `AbortSignal.timeout`.
  it.live("aborts a hung request at its deadline, so the report queued behind it goes through", () => {
    const { fetch, signals } = hangFirst()
    const layer = ConvexReportGateway.layer({
      url: "https://test-123.convex.cloud",
      token: Redacted.make("token"),
      requestTimeout: Duration.millis(50),
      fetch,
    })
    return Effect.gen(function*() {
      const gateway = yield* ReportGateway
      const hung = yield* Effect.forkChild(Effect.flip(gateway.report(batch)))
      yield* Effect.yieldNow.pipe(Effect.repeat({ until: () => signals.length > 0 }))

      // ConvexHttpClient runs mutations one at a time, so this waits for the hung one to end.
      assert.deepStrictEqual(yield* gateway.report(batch), { lastSeen: 123 })
      assert.strictEqual((yield* Fiber.join(hung)).reason, "Transport")
      assert.isTrue(signals[0]?.aborted)
      assert.strictEqual(signals.length, 2)
    }).pipe(Effect.provide(layer))
  })
})
