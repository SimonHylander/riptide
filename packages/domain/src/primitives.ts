import { Schema } from "effect"

/** Epoch milliseconds. Integer, so it stays a plain Convex number. */
export const EpochMillis = Schema.Int
export type EpochMillis = typeof EpochMillis.Type

/** Percentage from 0 to 100. */
export const Pct = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 }))
export type Pct = typeof Pct.Type

/** Finite number that is zero or greater: bytes, rpm, load, watts. */
export const NonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
export type NonNegative = typeof NonNegative.Type
