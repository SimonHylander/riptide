import { GroupSpec, Spec } from "@confect/core";
import agent from "../agent.spec";

const spec: Spec.Spec<{
  readonly agent: GroupSpec.NamedAt<typeof agent, "agent">;
}> = Spec.fromGroups({
  ["agent"]: agent,
}) as typeof spec;

export default spec;
