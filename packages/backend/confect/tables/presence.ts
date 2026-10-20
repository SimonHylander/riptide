import { Table } from "@confect/core"
import { EpochMillis } from "@riptide/domain"
import * as Schema from "effect/Schema"

/** Single doc holding the last dashboard heartbeat. */
export default Table.make(() => Schema.Struct({ lastSeen: EpochMillis }))
