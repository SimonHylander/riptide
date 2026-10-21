import { describe, expect, it } from "vitest"

import { formatAgo, formatBytes, formatRpm, formatUptime } from "./format"

describe("format", () => {
  it.each([
    [512, "512 B"],
    [1536, "1.5 KiB"],
    [21.4 * 1024 ** 3, "21.4 GiB"],
    [500 * 1024 ** 3, "500 GiB"],
    [2e12, "1.8 TiB"],
  ])("formatBytes(%d) = %s", (bytes, expected) => expect(formatBytes(bytes)).toBe(expected))

  it.each([
    [30, "30s"],
    [42 * 60, "42m"],
    [5 * 3_600 + 12 * 60, "5h 12m"],
    [3 * 86_400 + 4 * 3_600 + 59, "3d 4h"],
    [2 * 86_400 + 5 * 60, "2d"],
  ])("formatUptime(%d) = %s", (seconds, expected) => expect(formatUptime(seconds)).toBe(expected))

  it.each([
    [0, "idle"],
    [1180, "1,180 rpm"],
  ])("formatRpm(%d) = %s", (rpm, expected) => expect(formatRpm(rpm)).toBe(expected))

  it.each([
    [-2_000, "just now"],
    [12_000, "12s ago"],
    [7 * 60_000, "7m ago"],
  ])("formatAgo(%d) = %s", (ms, expected) => expect(formatAgo(ms)).toBe(expected))
})
