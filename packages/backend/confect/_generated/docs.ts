import type { Document } from "@confect/server";
import type schemaDefinition from "./schema";

export type HoursDoc = Document.Document<typeof schemaDefinition, "hours">;
export type LiveDoc = Document.Document<typeof schemaDefinition, "live">;
export type MinutesDoc = Document.Document<typeof schemaDefinition, "minutes">;
export type PresenceDoc = Document.Document<typeof schemaDefinition, "presence">;

export interface Docs {
  hours: HoursDoc;
  live: LiveDoc;
  minutes: MinutesDoc;
  presence: PresenceDoc;
}
