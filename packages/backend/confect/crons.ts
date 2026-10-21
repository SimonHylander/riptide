import { CronJob, CronJobs } from "@confect/server"
import * as Cron from "effect/Cron"

import refs from "./_generated/refs"

/** Daily retention purge at 03:00 UTC. */
export default CronJobs.make().add(
  CronJob.make("retention-purge", Cron.parseUnsafe("0 3 * * *"), refs.internal.retention.purge),
)
