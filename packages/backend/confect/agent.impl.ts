import { FunctionImpl, GroupImpl } from "@confect/server"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import databaseSchema from "./_generated/schema"
import agent from "./agent.spec"
import { Unauthorized } from "./errors"

// Stub: checks the token and replies with no viewer seen. Tables arrive in #5.
const report = FunctionImpl.make(databaseSchema, agent, "report", ({ token }) =>
  Effect.gen(function* () {
    const expected = yield* Config.String("AGENT_TOKEN").pipe(Effect.orDie)
    if (token !== expected) return yield* new Unauthorized()
    return { lastSeen: 0 }
  }),
)

export default GroupImpl.make(databaseSchema, agent).pipe(Layer.provide(report), GroupImpl.finalize)
