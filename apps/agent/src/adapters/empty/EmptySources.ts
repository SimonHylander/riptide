import { Effect, Layer } from "effect"

import { GpuSource } from "../../ports/GpuSource"
import { SensorSource } from "../../ports/SensorSource"

/** SensorSource for hosts that expose no sensors: always empty lists. */
export const EmptySensorSource = Layer.succeed(SensorSource, {
  latest: Effect.succeed({ temps: [], fans: [] }),
})

/** GpuSource for hosts without a supported GPU: always an empty list. */
export const EmptyGpuSource = Layer.succeed(GpuSource, {
  latest: Effect.succeed([]),
})
