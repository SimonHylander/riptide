// Pure bounded buffer of aggregate rows waiting to be uploaded, in flush order.
//
// Each resolution has its own cap: 24 hours of minute rows and 30 days of hour
// rows. Past a cap the oldest rows of that resolution are dropped, so during a
// long outage minute rows go first (they fill their cap after a day) and hour
// rows keep the coarse history. Rows are acknowledged by identity, so rows
// appended or dropped while a report is in flight are handled correctly.
import type { AggregateRow, Resolution } from "@riptide/domain"
import type { Record } from "effect"

export type Outbox = ReadonlyArray<AggregateRow>

/** Most rows kept per resolution. */
export const capacity: Record.ReadonlyRecord<Resolution, number> = {
  minute: 24 * 60,
  hour: 30 * 24,
}

/** Appends rows, then drops the oldest rows of any resolution over its cap. */
export const append = (
  outbox: Outbox,
  rows: ReadonlyArray<AggregateRow>,
): { readonly outbox: Outbox; readonly dropped: number } => {
  const all = [...outbox, ...rows]
  const excess = { minute: -capacity.minute, hour: -capacity.hour }
  for (const row of all) excess[row.resolution]++
  const kept = all.filter((row) => excess[row.resolution]-- <= 0)
  return { outbox: kept, dropped: all.length - kept.length }
}

/** The oldest `max` rows, the next report's `aggregates`. */
export const take = (outbox: Outbox, max: number): ReadonlyArray<AggregateRow> => outbox.slice(0, max)

/** Removes rows that were delivered (or rejected for good). */
export const ack = (sent: ReadonlyArray<AggregateRow>) => (outbox: Outbox): Outbox => {
  const done = new Set(sent)
  return outbox.filter((row) => !done.has(row))
}
