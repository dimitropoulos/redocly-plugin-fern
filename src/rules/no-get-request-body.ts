import type { AnyNode, RuleDefinition, UserContext } from "../utils/types.js";

export const noGetRequestBody: RuleDefinition = {
  name: "no-get-request-body",
  fernRules: ["fern-definition/no-get-request-body"],
  severity: "error",
  description: "GET and HEAD operations cannot have a request body.",
  rule: () => ({
    Operation(operation: AnyNode, ctx: UserContext) {
      const method = String(ctx.key).toUpperCase();
      if (
        (method === "GET" || method === "HEAD") &&
        operation.requestBody !== undefined
      ) {
        ctx.report({
          message: `Operation is a ${method}, so it cannot have a request body.`,
          location: ctx.location.child("requestBody").key(),
        });
      }
    },
  }),
};
