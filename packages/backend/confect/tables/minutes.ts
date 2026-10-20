import { Table } from "@confect/core"
import { AggregateRow } from "@riptide/domain"

/** Per-minute aggregate rows. `by_host_at` serves history, `by_at` serves retention. */
export default Table.make(() => AggregateRow).index("by_host_at", ["host", "at"]).index("by_at", ["at"])
