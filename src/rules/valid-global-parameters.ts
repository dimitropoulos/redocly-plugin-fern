/**
 * Validates `x-fern-global-parameters` (document root) and the per-operation
 * `x-fern-global-parameter` opt-in: declarations need a string `name`, a known `in` and `apply`,
 * a known `type`, and unique names; operations may only reference declared parameters.
 */
import { endpointId, getOperations, rootOf } from "../utils/document.js";
import { describeValue, readExtension } from "../utils/extensions.js";
import { rootValue } from "../utils/extensions-servers.js";
import { isPlainObject, resolveChild } from "../utils/resolve.js";
import type { AnyNode, RuleDefinition, UserContext } from "../utils/types.js";

const VALID_LOCATIONS = ["body", "query", "header", "path"];
const VALID_APPLY_MODES = ["explicit", "auto"];
const VALID_TYPES = ["string", "integer", "double", "number", "boolean"];

export const validGlobalParameters: RuleDefinition = {
  name: "valid-global-parameters",
  fernRules: ["fern-definition/valid-global-parameters"],
  severity: "error",
  description:
    "x-fern-global-parameters declarations are well formed and x-fern-global-parameter only references declared parameters.",
  rule: () => ({
    Root: {
      leave(rootNode: AnyNode, ctx: UserContext) {
        const root = rootOf(rootNode, ctx);
        const declared = new Map<string, number>();
        const declarations = rootValue(ctx, root, "x-fern-global-parameters");
        if (declarations !== undefined && !Array.isArray(declarations.node)) {
          ctx.report({
            message:
              "x-fern-global-parameters must be a list of global parameter declarations, each with a name.",
            location: declarations.location,
          });
        } else if (declarations !== undefined) {
          declarations.node.forEach((_entry: AnyNode, index: number) => {
            const entry = resolveChild(ctx, declarations, index);
            const location =
              entry?.location ?? declarations.location.child([index]);
            if (
              entry === undefined ||
              !isPlainObject(entry.node) ||
              typeof entry.node.name !== "string"
            ) {
              ctx.report({
                message: `Global parameter at index ${index} has no string \`name\`, so Fern ignores it.`,
                location: isPlainObject(entry?.node)
                  ? location.child(["name"])
                  : location,
              });
              return;
            }
            const param = entry.node;
            const name: string = param.name;
            const previous = declared.get(name);
            if (previous !== undefined) {
              ctx.report({
                message: `Global parameter '${name}' is declared more than once (also at index ${previous}); Fern keeps only the last declaration.`,
                location: location.child(["name"]),
              });
            }
            declared.set(name, index);
            if (
              param.in !== undefined &&
              param.in !== null &&
              !VALID_LOCATIONS.includes(param.in)
            ) {
              ctx.report({
                message: `Global parameter '${name}' has invalid location ${describeValue(param.in)}; expected one of: ${VALID_LOCATIONS.join(", ")}`,
                location: location.child(["in"]),
              });
            }
            if (
              param.apply !== undefined &&
              param.apply !== null &&
              !VALID_APPLY_MODES.includes(param.apply)
            ) {
              ctx.report({
                message: `Global parameter '${name}' has invalid apply mode ${describeValue(param.apply)}; expected one of: ${VALID_APPLY_MODES.join(", ")}`,
                location: location.child(["apply"]),
              });
            }
            if (
              param.type !== undefined &&
              param.type !== null &&
              !VALID_TYPES.includes(param.type)
            ) {
              ctx.report({
                message: `Global parameter '${name}' has unknown type ${describeValue(param.type)}; expected one of: ${VALID_TYPES.join(", ")}. Defaulting to string.`,
                location: location.child(["type"]),
                forceSeverity: "warn",
              });
            }
          });
        }

        const declaredList =
          declared.size > 0 ? [...declared.keys()].join(", ") : "(none)";
        for (const operation of getOperations(ctx, root)) {
          const located = {
            node: operation.node,
            location: operation.location,
          };
          if (
            operation.node["x-fern-global-parameter"] === undefined ||
            operation.node["x-fern-global-parameter"] === null
          ) {
            continue;
          }
          const reference = readExtension(
            ctx,
            located,
            "x-fern-global-parameter",
          )!;
          const ids: { id: AnyNode; location: typeof reference.location }[] =
            Array.isArray(reference.node)
              ? reference.node.map((id: AnyNode, index: number) => ({
                  id,
                  location: reference.location.child([index]),
                }))
              : [{ id: reference.node, location: reference.location }];
          if (
            typeof reference.node !== "string" &&
            !Array.isArray(reference.node)
          ) {
            ctx.report({
              message:
                "x-fern-global-parameter must be a global parameter name or a list of names; Fern ignores this value.",
              location: reference.location,
            });
            continue;
          }
          for (const { id, location } of ids) {
            if (typeof id !== "string") {
              ctx.report({
                message: `x-fern-global-parameter entries must be strings; Fern ignores ${describeValue(id)}.`,
                location,
              });
            } else if (!declared.has(id)) {
              ctx.report({
                message: `Endpoint '${endpointId(operation)}' references undeclared global parameter '${id}'. Declared parameters in x-fern-global-parameters: ${declaredList}`,
                location,
              });
            }
          }
        }
      },
    },
  }),
};
