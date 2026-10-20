import * as Schema from "effect/Schema"

/** Missing or wrong credentials: bad agent token, no identity, or a user other than ALLOWED_USER_ID. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {}

/** A report the backend refuses to store, such as an aggregate row for a host other than the batch's. */
export class InvalidBatch extends Schema.TaggedError<InvalidBatch>()("InvalidBatch", { reason: Schema.String }) {}
