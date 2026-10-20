import { Effect, FileSystem, Layer, Option, type PlatformError } from "effect"

import { SensorSource } from "../../ports/SensorSource"
import { SourceError } from "../../ports/SourceError"
import { LinuxFs } from "./LinuxFs"
import { type HwmonChip, sensorInputFile, sensorsFromHwmon } from "./parse"

const isNotFound = (error: PlatformError.PlatformError) => error.reason._tag === "NotFound"

/**
 * SensorSource from `/sys/class/hwmon`. Rediscovers every chip, temperature and
 * fan on each call, with nothing hardcoded per chip. A host without hwmon (a VM)
 * reports empty lists. Individual unreadable sensor files are skipped.
 */
export const LinuxSensorSource = Layer.effect(
  SensorSource,
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const { sys } = yield* LinuxFs
    const root = `${sys}/class/hwmon`

    const readOptional = (path: string) => fs.readFileString(path).pipe(Effect.option)

    const readChip = Effect.fnUntraced(function*(entry: string) {
      const dir = `${root}/${entry}`
      const name = Option.getOrElse(yield* readOptional(`${dir}/name`), () => entry)
      const entries = yield* fs.readDirectory(dir)
      const wanted = entries.filter((file) => sensorInputFile.test(file) || /^(temp|fan)\d+_label$/.test(file))
      const files = new Map<string, string>()
      for (const file of wanted) {
        const content = yield* readOptional(`${dir}/${file}`)
        if (Option.isSome(content)) files.set(file, content.value)
      }
      return { name: name.trim(), files } satisfies HwmonChip
    })

    const latest = fs.readDirectory(root).pipe(
      Effect.catchIf(isNotFound, () => Effect.succeed<Array<string>>([])),
      Effect.map((entries) =>
        entries
          .filter((entry) => /^hwmon\d+$/.test(entry))
          .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
      ),
      Effect.flatMap((dirs) => Effect.forEach(dirs, (entry) => readChip(entry))),
      Effect.map(sensorsFromHwmon),
      Effect.mapError((cause) => new SourceError({ source: "sensors", message: `cannot read ${root}`, cause })),
    )
    return SensorSource.of({ latest })
  }),
)
