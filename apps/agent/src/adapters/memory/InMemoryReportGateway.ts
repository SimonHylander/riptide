import type { EpochMillis, ReportBatch } from "@riptide/domain"
import { Clock, Context, Effect, Layer, Ref } from "effect"

import { GatewayError, type GatewayErrorReason, ReportGateway } from "../../ports/ReportGateway"

/** One `report` call: when it happened, what it carried, and whether it succeeded. */
export interface ReportCall {
  readonly at: EpochMillis
  readonly batch: ReportBatch
  readonly outcome: "ok" | GatewayErrorReason
}

/** Test controls for the in-memory {@link ReportGateway}. */
export class InMemoryReportGateway extends Context.Service<InMemoryReportGateway, {
  /** Every call so far, oldest first. */
  readonly calls: Effect.Effect<ReadonlyArray<ReportCall>>
  /** The `lastSeen` that successful calls reply with. Starts at 0. */
  setLastSeen(lastSeen: EpochMillis): Effect.Effect<void>
  /** Makes the next calls fail with these reasons, one per call. */
  failNext(reasons: ReadonlyArray<GatewayErrorReason>): Effect.Effect<void>
}>()("@riptide/agent/adapters/memory/InMemoryReportGateway") {}

/** A {@link ReportGateway} that records batches in memory, plus its {@link InMemoryReportGateway} controls. */
export const layer = Layer.effectContext(
  Effect.gen(function*() {
    const calls = yield* Ref.make<ReadonlyArray<ReportCall>>([])
    const lastSeen = yield* Ref.make(0)
    const failures = yield* Ref.make<ReadonlyArray<GatewayErrorReason>>([])

    const report = Effect.fnUntraced(function*(batch: ReportBatch) {
      const at = yield* Clock.currentTimeMillis
      const [failure] = yield* Ref.getAndUpdate(failures, (pending) => pending.slice(1))
      const call: ReportCall = { at, batch, outcome: failure ?? "ok" }
      yield* Ref.update(calls, (all) => [...all, call])
      if (failure !== undefined) return yield* new GatewayError({ reason: failure, cause: "scripted failure" })
      return { lastSeen: yield* Ref.get(lastSeen) }
    })

    return Context.make(ReportGateway, ReportGateway.of({ report })).pipe(
      Context.add(InMemoryReportGateway, InMemoryReportGateway.of({
        calls: Ref.get(calls),
        setLastSeen: (value) => Ref.set(lastSeen, value),
        failNext: (reasons) => Ref.update(failures, (pending) => [...pending, ...reasons]),
      })),
    )
  }),
)
