import { FunctionSpec, GroupSpec } from "@confect/core"
import { ReportBatch, ReportReply } from "@riptide/domain"
import * as Schema from "effect/Schema"

import { Unauthorized } from "./errors"

/** Functions the host agent calls. Guarded by the shared `AGENT_TOKEN`. */
export default GroupSpec.make().addFunction(
  FunctionSpec.publicMutation({
    name: "report",
    args: () => ({ token: Schema.String, ...ReportBatch.fields }),
    returns: () => ReportReply,
    error: () => Unauthorized,
  }),
)
