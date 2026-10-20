import { ConvexFunctionDefinitions, RegisteredConvexFunction, type RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import groupLayer from "../../dashboard.impl";

const forward = <Ctx, Args, Returns>(handler: (ctx: Ctx, args: Args) => Promise<Returns>) => (ctx: Ctx, args: Args) => handler(ctx, args);

const definitions = ConvexFunctionDefinitions.buildForGroup<typeof import("../../dashboard.spec")["default"]>(databaseSchema, groupLayer);

export default {
["heartbeat"]: RegisteredConvexFunction.register({ ...definitions["heartbeat"], handler: forward(definitions["heartbeat"].handler) }),
["hosts"]: RegisteredConvexFunction.register({ ...definitions["hosts"], handler: forward(definitions["hosts"].handler) }),
["live"]: RegisteredConvexFunction.register({ ...definitions["live"], handler: forward(definitions["live"].handler) }),
["history"]: RegisteredConvexFunction.register({ ...definitions["history"], handler: forward(definitions["history"].handler) }),
} as RegisteredFunctions.RegisteredFunctionsForGroupSpec<typeof import("../../dashboard.spec")["default"]>;
