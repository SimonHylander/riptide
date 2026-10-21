// Contract suites, one per port. Every adapter of a port runs its port's suite:
// readings decode with the domain schema, missing hardware yields empty lists
// rather than failures, and CPU percentages stay in [0, 100].
import { assert, layer } from "@effect/vitest"
import { CpuReading, DiskReading, GpuReading, HostReading, MemoryReading, SensorReading } from "@riptide/domain"
import { Effect, type Layer, Schema } from "effect"

import { CpuSource } from "../../src/ports/CpuSource"
import { DiskSource } from "../../src/ports/DiskSource"
import { GpuSource } from "../../src/ports/GpuSource"
import { HostInfo } from "../../src/ports/HostInfo"
import { MemorySource } from "../../src/ports/MemorySource"
import { SensorSource } from "../../src/ports/SensorSource"

/** `empty`: the adapter runs against a host without this hardware and must report nothing. */
export interface ContractOptions {
  readonly empty?: boolean
}

const readings = 3

export const cpuSourceContract = (name: string, adapter: Layer.Layer<CpuSource, unknown>) =>
  layer(adapter)(`CpuSource contract: ${name}`, (it) => {
    it.effect("every reading decodes and every percentage is in [0, 100]", () =>
      Effect.gen(function*() {
        const cpu = yield* CpuSource
        for (let i = 0; i < readings; i++) {
          const reading = yield* Schema.decodeUnknownEffect(CpuReading)(yield* cpu.latest)
          for (const pct of [reading.totalPct, ...reading.coresPct]) assert.isTrue(pct >= 0 && pct <= 100, `${pct}`)
          assert.isAbove(reading.coresPct.length, 0)
        }
      }))
  })

export const memorySourceContract = (name: string, adapter: Layer.Layer<MemorySource, unknown>) =>
  layer(adapter)(`MemorySource contract: ${name}`, (it) => {
    it.effect("readings decode and used memory fits in total", () =>
      Effect.gen(function*() {
        const memory = yield* MemorySource
        const reading = yield* Schema.decodeUnknownEffect(MemoryReading)(yield* memory.latest)
        assert.isAtMost(reading.usedBytes, reading.totalBytes)
        assert.isAtMost(reading.swapUsedBytes, reading.swapTotalBytes)
      }))
  })

export const hostInfoContract = (name: string, adapter: Layer.Layer<HostInfo, unknown>) =>
  layer(adapter)(`HostInfo contract: ${name}`, (it) => {
    it.effect("has a hostname and readings decode", () =>
      Effect.gen(function*() {
        const host = yield* HostInfo
        assert.isAbove(host.hostname.length, 0)
        yield* Schema.decodeUnknownEffect(HostReading)(yield* host.latest)
      }))
  })

export const sensorSourceContract = (name: string, adapter: Layer.Layer<SensorSource, unknown>, options: ContractOptions = {}) =>
  layer(adapter)(`SensorSource contract: ${name}`, (it) => {
    it.effect(options.empty ? "reports empty lists" : "readings decode", () =>
      Effect.gen(function*() {
        const sensors = yield* SensorSource
        const reading = yield* Schema.decodeUnknownEffect(SensorReading)(yield* sensors.latest)
        if (options.empty) assert.deepStrictEqual(reading, { temps: [], fans: [] })
      }))
  })

export const diskSourceContract = (name: string, adapter: Layer.Layer<DiskSource, unknown>, options: ContractOptions = {}) =>
  layer(adapter)(`DiskSource contract: ${name}`, (it) => {
    it.effect(options.empty ? "reports an empty list" : "readings decode, one per mount", () =>
      Effect.gen(function*() {
        const disks = yield* DiskSource
        const reading = yield* Schema.decodeUnknownEffect(Schema.Array(DiskReading))(yield* disks.latest)
        if (options.empty) assert.deepStrictEqual(reading, [])
        assert.strictEqual(new Set(reading.map((disk) => disk.mount)).size, reading.length)
        for (const disk of reading) assert.isAtMost(disk.usedBytes, disk.totalBytes)
      }))
  })

export const gpuSourceContract = (name: string, adapter: Layer.Layer<GpuSource, unknown>, options: ContractOptions = {}) =>
  layer(adapter)(`GpuSource contract: ${name}`, (it) => {
    it.effect(options.empty ? "reports an empty list" : "readings decode, one per GPU index", () =>
      Effect.gen(function*() {
        const gpus = yield* GpuSource
        const reading = yield* Schema.decodeUnknownEffect(Schema.Array(GpuReading))(yield* gpus.latest)
        if (options.empty) assert.deepStrictEqual(reading, [])
        assert.strictEqual(new Set(reading.map((gpu) => gpu.index)).size, reading.length)
      }))
  })
