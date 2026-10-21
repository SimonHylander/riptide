import { assert, describe, it } from "@effect/vitest"
import type { AggregateRow, Resolution, Stat } from "@riptide/domain"

import * as Outbox from "../../src/core/outbox"

const stat: Stat = { min: 0, avg: 0, max: 0 }
const row = (resolution: Resolution, at: number): AggregateRow => ({
  host: "h",
  at,
  resolution,
  count: 1,
  cpu: { total: stat, cores: [] },
  memory: { total: stat, used: stat, available: stat, swapTotal: stat, swapUsed: stat },
  system: { load1: stat, load5: stat, load15: stat, uptime: stat },
  sensors: { temps: [], fans: [] },
  disks: [],
  gpus: [],
})

describe("outbox", () => {
  it("drops the oldest rows of a resolution over its cap, keeping order", () => {
    const hour = row("hour", -1)
    const minutes = Array.from({ length: Outbox.capacity.minute + 2 }, (_, i) => row("minute", i))
    const { outbox, dropped } = Outbox.append([hour], minutes)
    assert.strictEqual(dropped, 2)
    assert.strictEqual(outbox.length, Outbox.capacity.minute + 1)
    assert.deepStrictEqual(outbox.slice(0, 2).map((r) => r.at), [-1, 2])
    assert.strictEqual(outbox.at(-1)?.at, Outbox.capacity.minute + 1)
  })

  it("acks only the rows that were sent, even if others arrived meanwhile", () => {
    const a = row("minute", 0)
    const b = row("minute", 1)
    const c = row("minute", 2)
    const sent = Outbox.take([a, b], 120)
    assert.deepStrictEqual(Outbox.ack(sent)([a, b, c]), [c])
  })
})
