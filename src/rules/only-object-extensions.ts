/**
 * Reports `allOf` `$ref` members that Fern turns into `extends` but that do not resolve to an
 * object. Fern only creates `extends` for schemas it imports as objects (`properties` or `allOf`,
 * not a single-member `allOf`, which is an alias). `$ref`s to discriminated unions, to
 * `oneOf`/`anyOf` schemas (whose properties Fern inlines) and to local targets outside
 * `#/components/schemas/` are not inherited and are skipped.
 */
import { isPlainObject, isRefNode, resolveNode } from "../utils/resolve.js";
import { refName } from "../utils/schema.js";
import {
  convertsToObject,
  describeKind,
  fernSchemaKind,
} from "../utils/structure.js";
import type { AnyNode, RuleDefinition, UserContext } from "../utils/types.js";

export const onlyObjectExtensions: RuleDefinition = {
  name: "only-object-extensions",
  fernRules: ["fern-definition/only-object-extensions"],
  severity: "error",
  description:
    "Schemas referenced from `allOf` (Fern `extends`) must be objects.",
  rule: () => ({
    Schema(schema: AnyNode, ctx: UserContext) {
      if (!isPlainObject(schema) || !Array.isArray(schema.allOf)) {
        return;
      }
      const located = { node: schema, location: ctx.location };
      if (!convertsToObject(ctx, located)) {
        return;
      }
      schema.allOf.forEach((member: AnyNode, index: number) => {
        if (!isRefNode(member)) {
          return;
        }
        const ref = member.$ref;
        if (ref.startsWith("#") && !ref.startsWith("#/components/schemas/")) {
          return;
        }
        const location = ctx.location.child(["allOf", index]);
        const target = resolveNode(ctx, member, location);
        if (target === undefined || !isPlainObject(target.node)) {
          return;
        }
        const discriminator = target.node.discriminator;
        if (
          (isPlainObject(discriminator) && discriminator.mapping != null) ||
          target.node.oneOf != null ||
          target.node.anyOf != null
        ) {
          return;
        }
        const { kind, schema: resolved } = fernSchemaKind(ctx, target);
        if (kind === "object" || kind === "custom") {
          return;
        }
        const name = refName(ref);
        ctx.report({
          message: `Objects can only extend other objects, and "${name}" is not an object: it is ${describeKind(kind, resolved.node)}. Fern turns this \`allOf\` \`$ref\` into an \`extends\`, so the referenced schema must be an object schema with \`properties\`.`,
          location: location.child("$ref").key(),
        });
      });
    },
  }),
};
