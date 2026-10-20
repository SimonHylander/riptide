import { HttpClient } from "@confect/js"
import refs from "@riptide/backend/confect/_generated/refs"
import type { ReportBatch } from "@riptide/domain"
import { Config, Effect, Layer, Redacted } from "effect"

import { GatewayError, ReportGateway } from "../../ports/ReportGateway"

/**
 * {@link ReportGateway} over Confect's HTTP client. Adds the agent token to
 * every call and maps client errors to {@link GatewayError}.
 */
export const layer = (options: { readonly url: string; readonly token: Redacted.Redacted }) =>
  Layer.effect(
    ReportGateway,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const report = Effect.fn("ConvexReportGateway.report")(
        (batch: ReportBatch) => client.mutation(refs.public.agent.report, { token: Redacted.value(options.token), ...batch }),
        Effect.catchTags({
          Unauthorized: (cause) => Effect.fail(new GatewayError({ reason: "Unauthorized", cause })),
          HttpClientError: (cause) => Effect.fail(new GatewayError({ reason: "Transport", cause })),
          SchemaError: (cause) => Effect.fail(new GatewayError({ reason: "Decode", cause })),
        }),
      )
      return ReportGateway.of({ report })
    }),
  ).pipe(Layer.provide(HttpClient.layer(options.url)))

/** {@link layer} configured from `CONVEX_URL` and `RIPTIDE_AGENT_TOKEN`. */
export const layerConfig = Layer.unwrap(
  Effect.gen(function* () {
    const url = yield* Config.String("CONVEX_URL")
    const token = yield* Config.Redacted("RIPTIDE_AGENT_TOKEN")
    return layer({ url, token })
  }),
)
