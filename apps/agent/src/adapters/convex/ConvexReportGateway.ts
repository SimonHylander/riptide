import { HttpClient } from "@confect/js"
import refs from "@riptide/backend/confect/_generated/refs"
import type { ReportBatch } from "@riptide/domain"
import { Effect, Layer, Redacted } from "effect"

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
          InvalidBatch: (cause) => Effect.fail(new GatewayError({ reason: "Rejected", cause })),
          HttpClientError: (cause) => Effect.fail(new GatewayError({ reason: "Transport", cause })),
          SchemaError: (cause) => Effect.fail(new GatewayError({ reason: "Decode", cause })),
        }),
      )
      return ReportGateway.of({ report })
    }),
  ).pipe(Layer.provide(HttpClient.layer(options.url)))
