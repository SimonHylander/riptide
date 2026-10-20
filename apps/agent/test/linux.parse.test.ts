import { readFileSync } from "node:fs"

import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Result } from "effect"

import { LinuxFs } from "../src/adapters/linux/LinuxFs"
import { LinuxSensorSource } from "../src/adapters/linux/LinuxSensorSource"
import {
  cpuUsage,
  parseHost,
  parseMeminfo,
  parseMounts,
  parseStat,
  realMounts,
  sensorsFromHwmon,
} from "../src/adapters/linux/parse"
import { DiskSource } from "../src/ports/DiskSource"
import { HostInfo } from "../src/ports/HostInfo"
import { SensorSource } from "../src/ports/SensorSource"
import { type FixtureHost, fixturePath, linuxFixturePlatform } from "./support/fixtureHost"

const read = (host: FixtureHost, file: string) => readFileSync(fixturePath(host, file), "utf8")
const ok = <A>(result: Result.Result<A, string>): A => Result.getOrThrowWith(result, (message) => new Error(message))
const KiB = 1024

describe("/proc/stat", () => {
  it("lists every logical core", () => {
    assert.strictEqual(ok(parseStat(read("desktop", "proc/stat"))).cores.size, 16)
    assert.strictEqual(ok(parseStat(read("vm", "proc/stat"))).cores.size, 2)
  })

  it("computes utilization between two snapshots", () => {
    // The fixtures' stat.next adds 100 jiffies per core, (core * 7) % 100 of them busy.
    for (const host of ["desktop", "vm"] as const) {
      const before = ok(parseStat(read(host, "proc/stat")))
      const after = ok(parseStat(read(host, "proc/stat.next")))
      const expected = Array.from({ length: before.cores.size }, (_, core) => (core * 7) % 100)
      const usage = cpuUsage(before, after)
      assert.deepStrictEqual(usage.coresPct, expected)
      assert.closeTo(usage.totalPct, expected.reduce((a, b) => a + b, 0) / expected.length, 1e-9)
    }
  })

  it("reports the since-boot average without a previous snapshot", () => {
    const usage = cpuUsage(undefined, ok(parseStat(read("vm", "proc/stat"))))
    // cpu  573668 310 165329 12208033 4072 0 17286 2994: busy = total - idle - iowait.
    const total = 573668 + 310 + 165329 + 12208033 + 4072 + 0 + 17286 + 2994
    assert.closeTo(usage.totalPct, ((total - 12208033 - 4072) / total) * 100, 1e-9)
  })

  it("reports 0 when no time passed and handles a core that came online", () => {
    const snapshot = ok(parseStat("cpu  10 0 10 80 0 0 0 0 0 0\ncpu0 10 0 10 80 0 0 0 0 0 0\n"))
    assert.deepStrictEqual(cpuUsage(snapshot, snapshot), { totalPct: 0, coresPct: [0] })
    const grown = ok(parseStat("cpu  20 0 20 160 0 0 0 0 0 0\ncpu0 10 0 10 80 0 0 0 0 0 0\ncpu1 10 0 10 80 0 0 0 0 0 0\n"))
    assert.deepStrictEqual(cpuUsage(snapshot, grown).coresPct, [0, 20])
  })

  it("rejects text without an aggregate cpu line", () => {
    assert.isTrue(Result.isFailure(parseStat("intr 1 2 3\n")))
    assert.isTrue(Result.isFailure(parseStat("cpu  a b c d\n")))
  })
})

describe("/proc/meminfo", () => {
  it("converts kB and derives used from MemAvailable", () => {
    assert.deepStrictEqual(ok(parseMeminfo(read("desktop", "proc/meminfo"))), {
      totalBytes: 32562372 * KiB,
      usedBytes: (32562372 - 21345678) * KiB,
      availableBytes: 21345678 * KiB,
      swapTotalBytes: 8388604 * KiB,
      swapUsedBytes: (8388604 - 8126460) * KiB,
    })
  })

  it("handles a host without swap", () => {
    const vm = ok(parseMeminfo(read("vm", "proc/meminfo")))
    assert.strictEqual(vm.swapTotalBytes, 0)
    assert.strictEqual(vm.swapUsedBytes, 0)
  })

  it("rejects text missing required keys", () => {
    assert.isTrue(Result.isFailure(parseMeminfo("MemTotal: 100 kB\n")))
  })
})

describe("/proc/loadavg and /proc/uptime", () => {
  it("parses both hosts", () => {
    assert.deepStrictEqual(ok(parseHost(read("desktop", "proc/loadavg"), read("desktop", "proc/uptime"))), {
      load1: 1.84,
      load5: 1.52,
      load15: 1.31,
      uptimeSeconds: 183427.61,
    })
    assert.deepStrictEqual(ok(parseHost(read("vm", "proc/loadavg"), read("vm", "proc/uptime"))), {
      load1: 0.08,
      load5: 0.03,
      load15: 0.01,
      uptimeSeconds: 6213.48,
    })
  })

  it("rejects malformed text", () => {
    assert.isTrue(Result.isFailure(parseHost("", "1.0 2.0")))
    assert.isTrue(Result.isFailure(parseHost("1 2 3 1/1 1", "up")))
  })

  it.effect("reads the hostname once", () =>
    Effect.gen(function*() {
      assert.strictEqual((yield* HostInfo).hostname, "vm-fixture")
    }).pipe(Effect.provide(linuxFixturePlatform("vm"))))
})

describe("/proc/mounts", () => {
  it("decodes octal escapes", () => {
    const games = parseMounts(read("desktop", "proc/mounts")).find((m) => m.device === "/dev/sda1")
    assert.deepStrictEqual(games, { device: "/dev/sda1", mount: "/mnt/Games Library", fsType: "ntfs3" })
  })

  it("drops pseudo filesystems and keeps the shortest bind mount per device", () => {
    assert.deepStrictEqual(realMounts(parseMounts(read("desktop", "proc/mounts"))), [
      { device: "/dev/nvme0n1p2", mount: "/", fsType: "ext4" },
      { device: "/dev/nvme0n1p1", mount: "/boot/efi", fsType: "vfat" },
      { device: "/dev/nvme1n1p1", mount: "/data", fsType: "ext4" },
      { device: "/dev/sda1", mount: "/mnt/Games Library", fsType: "ntfs3" },
    ])
    assert.deepStrictEqual(realMounts(parseMounts(read("vm", "proc/mounts"))).map((m) => m.mount), [
      "/",
      "/boot",
      "/boot/efi",
    ])
  })

  it("keeps only the filesystem mounted last over a path", () => {
    const mounts = parseMounts("/dev/sdb1 /mnt ext4 rw 0 0\ntmpfs /mnt tmpfs rw 0 0\n/dev/sdc1 /srv xfs rw 0 0\n/dev/sdd1 /srv ext4 rw 0 0\n")
    assert.deepStrictEqual(realMounts(mounts), [{ device: "/dev/sdd1", mount: "/srv", fsType: "ext4" }])
  })

  it.effect("joins mounts with statfs sizes", () =>
    Effect.gen(function*() {
      const disks = yield* (yield* DiskSource).latest
      assert.deepStrictEqual(disks, [
        { device: "/dev/vda1", mount: "/", fsType: "ext4", totalBytes: 29890060288, usedBytes: 2463723520 },
        { device: "/dev/vda16", mount: "/boot", fsType: "ext4", totalBytes: 924536832, usedBytes: 116281344 },
        { device: "/dev/vda15", mount: "/boot/efi", fsType: "vfat", totalBytes: 109422592, usedBytes: 6324224 },
      ])
    }).pipe(Effect.provide(linuxFixturePlatform("vm"))))
})

describe("hwmon", () => {
  it.effect("discovers every chip, label and fan on the desktop", () =>
    Effect.gen(function*() {
      const { temps, fans } = yield* (yield* SensorSource).latest
      assert.deepStrictEqual(temps, [
        { chip: "nvme-0", label: "Composite", celsius: 41.85 },
        { chip: "nvme-0", label: "Sensor 1", celsius: 41.85 },
        { chip: "nvme-0", label: "Sensor 2", celsius: 46.85 },
        { chip: "nvme-1", label: "Composite", celsius: 35.85 },
        { chip: "nvme-1", label: "Sensor 1", celsius: 35.85 },
        { chip: "k10temp", label: "Tctl", celsius: 48.75 },
        { chip: "k10temp", label: "Tccd1", celsius: 42.125 },
        { chip: "amdgpu", label: "edge", celsius: 41 },
        { chip: "mt7921_phy0", label: "temp1", celsius: 44 },
        { chip: "nct6798", label: "SYSTIN", celsius: 32 },
        { chip: "nct6798", label: "CPUTIN", celsius: 39.5 },
        { chip: "nct6798", label: "AUXTIN0", celsius: 26 },
        { chip: "nct6798", label: "AUXTIN1", celsius: -62 },
        { chip: "nct6798", label: "SMBUSMASTER 0", celsius: 48.5 },
      ])
      assert.deepStrictEqual(fans, [
        { chip: "nct6798", label: "fan1", rpm: 1152 },
        { chip: "nct6798", label: "fan2", rpm: 863 },
        ...[3, 4, 5, 6, 7].map((n) => ({ chip: "nct6798", label: `fan${n}`, rpm: 0 })),
      ])
    }).pipe(Effect.provide(linuxFixturePlatform("desktop"))))

  it.effect("reports nothing on a VM with an empty hwmon class", () =>
    Effect.gen(function*() {
      assert.deepStrictEqual(yield* (yield* SensorSource).latest, { temps: [], fans: [] })
    }).pipe(Effect.provide(linuxFixturePlatform("vm"))))

  it.effect("reports nothing when /sys/class/hwmon does not exist", () =>
    Effect.gen(function*() {
      assert.deepStrictEqual(yield* (yield* SensorSource).latest, { temps: [], fans: [] })
    }).pipe(
      Effect.provide(LinuxSensorSource.pipe(
        Layer.provide(Layer.succeed(LinuxFs, { proc: "/nonexistent/proc", sys: "/nonexistent/sys", statfs: () => Effect.die("unused") })),
        Layer.provide(BunFileSystem.layer),
      )),
    ))

  it("skips unparsable values and falls back to channel labels", () => {
    const files = new Map([
      ["temp1_input", "\n"],
      ["temp2_input", "51000\n"],
      ["temp2_label", "\n"],
      ["fan1_input", "garbage"],
      ["fan2_input", "700\n"],
      ["fan2_label", "Pump\n"],
    ])
    assert.deepStrictEqual(sensorsFromHwmon([{ name: "chip", files }]), {
      temps: [{ chip: "chip", label: "temp2", celsius: 51 }],
      fans: [{ chip: "chip", label: "Pump", rpm: 700 }],
    })
  })
})
