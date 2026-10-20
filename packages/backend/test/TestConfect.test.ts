import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import * as TestConfect from "./TestConfect"

describe("TestConfect harness", () => {
  it.effect("boots an empty backend", () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      expect(c).toBeDefined()
    }).pipe(Effect.provide(TestConfect.layer)),
  )
})
