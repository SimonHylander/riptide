import type { ReportBatch, ReportReply } from "@riptide/domain"
import { Context, type Effect, Schema } from "effect"

/**
 * Why a report failed. `Unauthorized` means the backend rejected the agent
 * token, `Transport` covers network and server errors, `Decode` a payload or
 * reply that did not match its schema.
 */
export const GatewayErrorReason = Schema.Literals(["Unauthorized", "Transport", "Decode"])
export type GatewayErrorReason = typeof GatewayErrorReason.Type

/** A failed {@link ReportGateway.report} call. */
export class GatewayError extends Schema.TaggedError<GatewayError>()("GatewayError", {
  reason: GatewayErrorReason,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `report failed: ${this.reason}`
  }
}

/** Uploads a batch to the backend and returns the last dashboard heartbeat. */
export class ReportGateway extends Context.Service<
  ReportGateway,
  {
    report(batch: ReportBatch): Effect.Effect<ReportReply, GatewayError>
  }
>()("@riptide/agent/ports/ReportGateway") {}
