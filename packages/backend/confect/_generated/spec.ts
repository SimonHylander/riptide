import { GroupSpec, Spec } from "@confect/core";
import agent from "../agent.spec";
import dashboard from "../dashboard.spec";
import retention from "../retention.spec";

const spec: Spec.Spec<{
  readonly agent: GroupSpec.NamedAt<typeof agent, "agent">;
  readonly dashboard: GroupSpec.NamedAt<typeof dashboard, "dashboard">;
  readonly retention: GroupSpec.NamedAt<typeof retention, "retention">;
}> = Spec.fromGroups({
  ["agent"]: agent,
  ["dashboard"]: dashboard,
  ["retention"]: retention,
}) as typeof spec;

export default spec;
