import { afterEach, beforeEach } from "@effect/vitest"
import { vi } from "vitest"

import { agentToken, allowedUser, now } from "./fixtures"

/**
 * Registers hooks that set AGENT_TOKEN and ALLOWED_USER_ID and freeze `Date` at {@link now}.
 * Pass `timers: true` to also fake timers, which `finishAllScheduledFunctions` needs.
 */
export const useTestEnv = (options: { readonly timers?: boolean } = {}) => {
  beforeEach(() => {
    vi.useFakeTimers(options.timers ? {} : { toFake: ["Date"] })
    vi.setSystemTime(now)
    process.env.AGENT_TOKEN = agentToken
    process.env.ALLOWED_USER_ID = allowedUser
  })
  afterEach(() => {
    vi.useRealTimers()
    delete process.env.AGENT_TOKEN
    delete process.env.ALLOWED_USER_ID
  })
}
