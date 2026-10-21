import { FunctionSpec, GroupSpec } from "@confect/core"
import { ReportBatch, ReportReply } from "@riptide/domain"
import * as Schema from "effect/Schema"

import { InvalidBatch, Unauthorized } from "./errors"

export default GroupSpec.make().addFunction(
  /**
   * Agent upload: upserts `live` and `hosts`, stores aggregate rows, and replies with the last dashboard heartbeat.
   * Needs `AGENT_TOKEN`. Fails `InvalidBatch`, writing nothing, if any aggregate row is for another host.
   */
  FunctionSpec.publicMutation({
    name: "report",
    args: () => ({ token: Schema.String, ...ReportBatch.fields }),
    returns: () => ReportReply,
    error: () => Schema.Union([Unauthorized, InvalidBatch]),
  }),
)
