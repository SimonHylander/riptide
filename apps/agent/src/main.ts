import { BunRuntime } from "@effect/platform-bun"
import { Effect } from "effect"

// Entrypoint placeholder. Metric sampling and Convex publishing land in later tickets.
const program = Effect.logInfo("riptide agent starting")

BunRuntime.runMain(program)
