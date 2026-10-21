import { FunctionSpec, GroupSpec } from "@confect/core"
import * as Schema from "effect/Schema"

export default GroupSpec.make().addFunction(
  /** Deletes aggregate rows older than `retentionCutoff(now)` in batches, rescheduling itself until none are left. */
  FunctionSpec.internalMutation({
    name: "purge",
    returns: () => Schema.Null,
  }),
)
