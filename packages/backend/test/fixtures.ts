import type { AggregateRow, ReportBatch, Resolution, Sample } from "@riptide/domain"

export const agentToken = "agent-secret"
export const allowedUser = "user_allowed"

const minute = 60_000
const day = 24 * 60 * minute

/** Fixed server time for tests, epoch ms. */
export const now = 1_800_000_000_000
export { day, minute }

export const sample = (at: number): Sample => ({
  at,
  cpu: { totalPct: 12.5, coresPct: [10, 15] },
  memory: { totalBytes: 16e9, usedBytes: 4e9, availableBytes: 12e9, swapTotalBytes: 0, swapUsedBytes: 0 },
  host: { load1: 0.5, load5: 0.4, load15: 0.3, uptimeSeconds: 3600 },
  sensors: { temps: [], fans: [] },
  disks: [],
  gpus: [],
})

const stat = (value: number) => ({ min: value, avg: value, max: value })

/** A minimal aggregate row. `count` lets a test tell a resend apart from the original. */
export const row = (host: string, at: number, resolution: Resolution = "minute", count = 60): AggregateRow => ({
  host,
  at,
  resolution,
  count,
  cpu: { total: stat(12.5), cores: [] },
  memory: { total: stat(16e9), used: stat(4e9), available: stat(12e9), swapTotal: stat(0), swapUsed: stat(0) },
  system: { load1: stat(0.5), load5: stat(0.4), load15: stat(0.3), uptime: stat(3600) },
  sensors: { temps: [], fans: [] },
  disks: [],
  gpus: [],
})

export const batch = (host: string, aggregates: ReadonlyArray<AggregateRow> = []): ReportBatch => ({
  host,
  sample: sample(now),
  aggregates,
})
