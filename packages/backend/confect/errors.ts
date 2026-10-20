import * as Schema from "effect/Schema"

/** The caller's credentials were missing or wrong. Shared by every guarded function. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {}
