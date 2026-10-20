// The agent loop: samples the source ports, aggregates, and reports.
//
// Sampling. Every second all sources are read concurrently into a `Sample`
// (`at` from `Clock`, taken before the reads). A failing CPU, memory or host
// source skips that tick, since there is no honest stand-in for those numbers.
// A failing sensor, disk or GPU source contributes an empty list for that tick,
// so the rest of the sample still flows and per-key aggregation treats the
// missing entries as absent. Every failure is logged.
//
// Reporting. Each report carries a sample not sent before (the newest one,
// waiting for the next tick if it was already sent) plus up to
// `maxRowsPerReport` of the oldest pending aggregate rows. Reports start every
// 1s while `isPresenceFresh(lastSeen, now)` holds or a full batch of rows is
// still pending, otherwise every 60s. `lastSeen` comes from the previous reply.
// While no sample can be taken, nothing is reported.
//
// Failures. `Rejected` drops that batch's rows (they can never succeed) and
// carries on. Any other `GatewayError`, or a report taking longer than
// `reportTimeout`, is retried with exponential backoff from 1s capped at 60s,
// each retry rebuilding the batch from the newest sample and pending rows.
// Rows leave the outbox only once a report carrying them succeeds, and the
// backend upserts rows by (host, at), so a report interrupted mid-flight (for
// example by SIGTERM) is at worst resent, never half-applied.
import {
  type AggregateRow,
  type EpochMillis,
  idleUploadCadence,
  isPresenceFresh,
  liveUploadCadence,
  type Sample,
} from "@riptide/domain"
import { Clock, Duration, Effect, Option, Queue, Ref, Schedule } from "effect"

import { CpuSource } from "../ports/CpuSource"
import { DiskSource } from "../ports/DiskSource"
import { GpuSource } from "../ports/GpuSource"
import { HostInfo } from "../ports/HostInfo"
import { MemorySource } from "../ports/MemorySource"
import { GatewayError, ReportGateway } from "../ports/ReportGateway"
import { SensorSource } from "../ports/SensorSource"
import type { SourceError } from "../ports/SourceError"
import * as Aggregate from "./aggregate"
import * as Outbox from "./outbox"

/** How often every source is read. */
export const sampleInterval = Duration.seconds(1)
/** Most aggregate rows per report. The rest ride on later reports. */
export const maxRowsPerReport = 120
/** A report still running after this is abandoned and retried. */
export const reportTimeout = Duration.seconds(30)

/** Delay before each retry: 1s, 2s, 4s, ... capped at the idle cadence. Never gives up. */
export const retrySchedule = Schedule.min([Schedule.exponential(liveUploadCadence), Schedule.spaced(idleUploadCadence)])

/** Replaces a failing list source's reading with `empty` for this tick. */
const orEmpty = <A>(latest: Effect.Effect<A, SourceError>, empty: NoInfer<A>): Effect.Effect<A> =>
  latest.pipe(Effect.catch((error) => Effect.logWarning("source failed, using an empty reading", error).pipe(Effect.as(empty))))

/**
 * Runs the agent for `host` until interrupted. Reads the source ports and
 * reports through {@link ReportGateway}.
 */
export const run = Effect.fnUntraced(function*(options: { readonly host: string }) {
  const { host } = options
  const cpu = yield* CpuSource
  const memory = yield* MemorySource
  const hostInfo = yield* HostInfo
  const sensors = yield* SensorSource
  const disks = yield* DiskSource
  const gpus = yield* GpuSource
  const gateway = yield* ReportGateway

  const readSample: Effect.Effect<Sample, SourceError> = Effect.gen(function*() {
    const at = yield* Clock.currentTimeMillis
    const readings = yield* Effect.all({
      cpu: cpu.latest,
      memory: memory.latest,
      host: hostInfo.latest,
      sensors: orEmpty(sensors.latest, { temps: [], fans: [] }),
      disks: orEmpty(disks.latest, []),
      gpus: orEmpty(gpus.latest, []),
    }, { concurrency: "unbounded" })
    return { at, ...readings }
  })

  // Holds the newest sample not yet reported, so each report sends a fresh one.
  const unsent = yield* Queue.sliding<Sample>(1)
  const aggregator = yield* Ref.make(Aggregate.empty)
  const outbox = yield* Ref.make<Outbox.Outbox>([])

  const record = Effect.fnUntraced(function*(sample: Sample) {
    yield* Queue.offer(unsent, sample)
    const flushed = yield* Ref.modify(aggregator, (current) => {
      const { aggregator: next, flushed } = Aggregate.push(current, host, sample)
      return [flushed, next]
    })
    if (flushed.length === 0) return
    const dropped = yield* Ref.modify(outbox, (current) => {
      const { outbox: next, dropped } = Outbox.append(current, flushed)
      return [dropped, next]
    })
    if (dropped > 0) yield* Effect.logWarning(`outbox full, dropped the ${dropped} oldest rows`)
  })

  yield* readSample.pipe(
    Effect.flatMap(record),
    Effect.catch((error) => Effect.logWarning("sample skipped", error)),
    Effect.repeat(Schedule.fixed(sampleInterval)),
    Effect.forkChild,
  )

  /** Removes `rows` from the outbox. */
  const ack = (rows: ReadonlyArray<AggregateRow>) => Ref.update(outbox, Outbox.ack(rows))

  /**
   * One report of the newest unsent sample and the oldest pending rows. Returns
   * when the batch was built and the reply's `lastSeen` (`None` when rejected).
   */
  const attempt = Effect.gen(function*() {
    const sample = yield* Queue.take(unsent)
    const started = yield* Clock.currentTimeMillis
    const rows = Outbox.take(yield* Ref.get(outbox), maxRowsPerReport)
    const lastSeen = yield* gateway.report({ host, sample, aggregates: rows }).pipe(
      Effect.timeoutOrElse({
        duration: reportTimeout,
        orElse: () => Effect.fail(new GatewayError({ reason: "Transport", cause: "report timed out" })),
      }),
      Effect.tap(() => ack(rows)),
      Effect.map(({ lastSeen }) => Option.some(lastSeen)),
      Effect.catchIf((error) => error.reason === "Rejected", (error) =>
        ack(rows).pipe(
          Effect.andThen(Effect.logError(`report rejected, dropped ${rows.length} aggregate rows`, error)),
          Effect.as(Option.none<EpochMillis>()),
        )),
    )
    return { started, lastSeen }
  })

  const report = attempt.pipe(
    Effect.retry(retrySchedule.pipe(
      Schedule.setInputType<GatewayError>(),
      Schedule.tap(({ input, duration }) =>
        Effect.logWarning(`${input.message}, retrying in ${Duration.format(duration)}`, input.cause)
      ),
    )),
    // `retrySchedule` never ends, so the retry never fails.
    Effect.orDie,
  )

  let lastSeen = 0
  let live: boolean | undefined
  while (true) {
    const result = yield* report
    lastSeen = Option.getOrElse(result.lastSeen, () => lastSeen)
    const now = yield* Clock.currentTimeMillis
    const fresh = isPresenceFresh(lastSeen, now)
    if (fresh !== live) {
      live = fresh
      yield* Effect.logInfo(
        `${fresh ? "viewer present, reporting every 1s" : "no viewer, reporting every 60s"} (lastSeen ${lastSeen})`,
      )
    }
    const backlog = (yield* Ref.get(outbox)).length >= maxRowsPerReport
    const interval = fresh || backlog ? liveUploadCadence : idleUploadCadence
    yield* Effect.sleep(Math.max(0, Duration.toMillis(interval) - (now - result.started)))
  }
})
