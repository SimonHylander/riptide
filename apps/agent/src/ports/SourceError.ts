import { Schema } from "effect"

/**
 * A source could not produce a reading because of a genuine failure (unreadable
 * or malformed kernel file, failed syscall). Missing hardware is not an error:
 * sources report empty lists instead. The core logs this and skips the sample.
 */
export class SourceError extends Schema.TaggedError<SourceError>()("SourceError", {
  /** Which source failed, e.g. `cpu` or `disk`. */
  source: Schema.String,
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}
