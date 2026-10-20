import { Table } from "@confect/core"
import { EpochMillis } from "@riptide/domain"
import * as Schema from "effect/Schema"

/**
 * One doc per reported host. `report` refreshes `updatedAt` at most once a minute,
 * so the `hosts` query does not re-run on every report the way a read of `live` would.
 */
export default Table.make(() =>
  Schema.Struct({
    host: Schema.String,
    /** Server time of a recent report, epoch ms. Up to a minute behind `live.updatedAt`. */
    updatedAt: EpochMillis,
  }),
).index("by_host", ["host"])
