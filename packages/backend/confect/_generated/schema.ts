import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import hours from "./tables/hours";
import live from "./tables/live";
import minutes from "./tables/minutes";
import presence from "./tables/presence";

const databaseSchema: $DatabaseSchema.DatabaseSchema<{
  readonly hours: typeof hours;
  readonly live: typeof live;
  readonly minutes: typeof minutes;
  readonly presence: typeof presence;
}> = $DatabaseSchema.make({
  hours,
  live,
  minutes,
  presence,
});

export default databaseSchema;
