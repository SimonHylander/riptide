import type { ReportBatch } from "@riptide/domain"
import { Clock, Config, Console, Effect, Layer } from "effect"

import { ReportGateway } from "../../ports/ReportGateway"

/**
 * {@link ReportGateway} for local runs without Convex: prints each batch as one
 * JSON line on stdout. Replies with `lastSeen` from `lastSeen`: `"now"` acts as
 * a dashboard that is always open (1s reports), a number is a fixed heartbeat
 * time in epoch ms (0, the default, means never seen: 60s reports).
 */
export const layer = (options: { readonly lastSeen: "now" | number }) =>
  Layer.succeed(ReportGateway, ReportGateway.of({
    report: (batch: ReportBatch) =>
      Console.log(JSON.stringify(batch)).pipe(
        Effect.andThen(options.lastSeen === "now" ? Clock.currentTimeMillis : Effect.succeed(options.lastSeen)),
        Effect.map((lastSeen) => ({ lastSeen })),
      ),
  }))

/** {@link layer} with `lastSeen` from `RIPTIDE_STDOUT_LAST_SEEN` (`now` or epoch ms, default 0). */
export const layerConfig = Layer.unwrap(
  Config.Literal("now", "RIPTIDE_STDOUT_LAST_SEEN").pipe(
    Config.orElse(() => Config.Int("RIPTIDE_STDOUT_LAST_SEEN")),
    Config.withDefault(0),
    Config.map((lastSeen) => layer({ lastSeen })),
  ),
)
