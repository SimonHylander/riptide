import { HttpClient } from "@confect/js"
import refs from "@riptide/backend/confect/_generated/refs"
import type { ReportBatch } from "@riptide/domain"
import { Duration, Effect, Layer, Redacted } from "effect"

import { GatewayError, ReportGateway } from "../../ports/ReportGateway"

/**
 * Every HTTP request is aborted after this. Shorter than the core's
 * `reportTimeout`, so the request has ended by the time the core gives up.
 */
export const requestTimeout = Duration.seconds(25)

/**
 * `base` with every request aborted after `timeout`, on top of any signal the
 * caller passed. ConvexHttpClient runs mutations one at a time, and interrupting
 * the Effect does not cancel the underlying request, so without this a hung
 * request would block every later report.
 */
const withDeadline = (base: typeof globalThis.fetch, timeout: Duration.Duration): typeof globalThis.fetch =>
  // `Object.assign` keeps the runtime's extra fetch members, such as Bun's `preconnect`.
  Object.assign((...[input, init]: Parameters<typeof globalThis.fetch>) => {
    const deadline = AbortSignal.timeout(Duration.toMillis(timeout))
    const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline
    return base(input, { ...init, signal })
  }, base)

/**
 * {@link ReportGateway} over Confect's HTTP client. Adds the agent token to
 * every call and maps client errors to {@link GatewayError}. A request aborted
 * at its deadline fails as an `HttpClientError`, so it maps to `Transport`.
 * `fetch` and `requestTimeout` default to the global fetch and
 * {@link requestTimeout}, and exist for tests.
 */
export const layer = (options: {
  readonly url: string
  readonly token: Redacted.Redacted
  readonly requestTimeout?: Duration.Duration
  readonly fetch?: typeof globalThis.fetch
}) =>
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
  ).pipe(Layer.provide(HttpClient.layer(options.url, {
    fetch: withDeadline(options.fetch ?? globalThis.fetch, options.requestTimeout ?? requestTimeout),
  })))
