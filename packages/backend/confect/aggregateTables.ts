import type { Resolution } from "@riptide/domain"

/** Table that stores aggregate rows of each resolution. */
export const aggregateTables = {
  minute: "minutes",
  hour: "hours",
} as const satisfies Record<Resolution, string>

export type AggregateTable = (typeof aggregateTables)[Resolution]
