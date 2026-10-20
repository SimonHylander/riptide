import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"

import { Auth } from "./_generated/services"
import { Unauthorized } from "./errors"

/** Compares two secrets without exiting early on the first differing character. */
const sameSecret = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Fails `Unauthorized` unless `token` equals env `AGENT_TOKEN`.
 * A missing `AGENT_TOKEN` also fails `Unauthorized`, so an unconfigured deployment rejects every agent.
 */
export const requireAgentToken = Effect.fnUntraced(function* (token: string) {
  const expected = yield* Config.Redacted("AGENT_TOKEN").pipe(Effect.mapError(() => new Unauthorized()))
  if (!sameSecret(token, Redacted.value(expected))) return yield* new Unauthorized()
})

/**
 * Fails `Unauthorized` unless the caller is signed in as env `ALLOWED_USER_ID`.
 * No identity, or a missing `ALLOWED_USER_ID`, also fails `Unauthorized`. Every dashboard function runs this first.
 */
export const requireAllowedUser = Effect.gen(function* () {
  const auth = yield* Auth
  const identity = yield* auth.getUserIdentity
  const allowed = yield* Config.String("ALLOWED_USER_ID")
  if (identity.subject !== allowed) return yield* new Unauthorized()
}).pipe(Effect.mapError(() => new Unauthorized()))
