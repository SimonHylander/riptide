import { FunctionSpec, GroupSpec } from "@confect/core"
import { ReportBatch, ReportReply } from "@riptide/domain"
import * as Schema from "effect/Schema"

import { Unauthorized } from "./errors"

export default GroupSpec.make().addFunction(
  /** Agent upload: upserts `live`, stores aggregate rows, and replies with the last dashboard heartbeat. Needs `AGENT_TOKEN`. */
  FunctionSpec.publicMutation({
    name: "report",
    args: () => ({ token: Schema.String, ...ReportBatch.fields }),
    returns: () => ReportReply,
    error: () => Unauthorized,
  }),
)
