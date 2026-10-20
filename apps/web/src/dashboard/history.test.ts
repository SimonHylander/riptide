import { rangeWindow } from "@riptide/domain"
import { describe, expect, it } from "vitest"

import { fixtureHistory } from "~/feed/fixture/history"
import { desktop } from "~/feed/fixture/hosts"
import { seededRandom } from "~/feed/fixture/simulate"
import { emptyTail, mergeSeries } from "~/feed/series"

import { chartFamilies } from "./history"

const hour = 3_600_000
const to = 1_800_000_000_000 - (1_800_000_000_000 % hour)
const window = rangeWindow("1h", to)
const sample = desktop.initial(to, seededRandom(1))
const series = mergeSeries(fixtureHistory(sample, "desktop", window, to), emptyTail("desktop", window))

const titles = (families: ReturnType<typeof chartFamilies>) => families.map(({ title }) => title)
const optionIds = (families: ReturnType<typeof chartFamilies>, title: string) =>
  families.find((family) => family.title === title)?.options.map(({ id }) => id)

describe("chartFamilies", () => {
  it("keeps charts for readings that stopped reporting but still have history in range", () => {
    // The GPU and the first temperature sensor are gone from the latest sample.
    const [, ...temps] = sample.sensors.temps
    const latest = { ...sample, gpus: [], sensors: { ...sample.sensors, temps } }

    const families = chartFamilies(latest, series)

    expect(titles(families)).toEqual(titles(chartFamilies(sample)))
    // Current readings first, the gone sensor after them.
    expect(optionIds(families, "Temperatures")).toEqual(
      [...temps, sample.sensors.temps[0]].map((temp) => `temp/${temp?.chip}/${temp?.label}`),
    )
    expect(optionIds(families, "GPU 0")).toEqual(["gpu/0/utilization", "gpu/0/memory", "gpu/0/temperature"])
  })

  it("leaves out readings with neither a current value nor visible history", () => {
    const latest = { ...sample, gpus: [], sensors: { temps: [], fans: [] }, disks: [] }

    expect(titles(chartFamilies(latest, mergeSeries([], emptyTail("desktop", window))))).toEqual(["CPU", "Memory", "Load"])
  })
})
