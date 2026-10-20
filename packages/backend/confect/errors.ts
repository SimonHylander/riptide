import * as Schema from "effect/Schema"

/** Missing or wrong credentials: bad agent token, no identity, or a user other than ALLOWED_USER_ID. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {}
