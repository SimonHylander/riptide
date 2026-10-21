import { defineSchema as $defineSchema } from "convex/server";
import { Table as $Table } from "@confect/server";

import hosts from "./tables/hosts";
import hours from "./tables/hours";
import live from "./tables/live";
import minutes from "./tables/minutes";
import presence from "./tables/presence";

export default $defineSchema({
  hosts: $Table.tableDefinition(hosts),
  hours: $Table.tableDefinition(hours),
  live: $Table.tableDefinition(live),
  minutes: $Table.tableDefinition(minutes),
  presence: $Table.tableDefinition(presence),
});
