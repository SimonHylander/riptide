import { Table } from "@confect/core"
import { EpochMillis, Sample } from "@riptide/domain"
import * as Schema from "effect/Schema"

/** Latest sample per host, patched in place on every report. */
export default Table.make(() =>
  Schema.Struct({
    host: Schema.String,
    /** Server time of the last report, epoch ms. */
    updatedAt: EpochMillis,
    sample: Sample,
  }),
).index("by_host", ["host"])
