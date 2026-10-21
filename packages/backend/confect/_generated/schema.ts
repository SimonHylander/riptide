import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import hosts from "./tables/hosts";
import hours from "./tables/hours";
import live from "./tables/live";
import minutes from "./tables/minutes";
import presence from "./tables/presence";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly hosts: typeof hosts;
  readonly hours: typeof hours;
  readonly live: typeof live;
  readonly minutes: typeof minutes;
  readonly presence: typeof presence;
}> = $DatabaseSchema.make({
  hosts,
  hours,
  live,
  minutes,
  presence,
});

export default databaseSchema;
