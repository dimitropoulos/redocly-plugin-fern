/**
 * Reports operations that claim an SDK method another operation already claims: the same
 * `x-fern-sdk-group-name` (a string, or an array joined with `.`) and `x-fern-sdk-method-name`,
 * for overlapping `x-fern-audiences` (no audiences means every audience). Operations with
 * `x-fern-ignore: true` are skipped.
 *
 * Options:
 * - `namespace` (string): the namespace the document is imported under in generators.yml. It is
 *   prepended to the SDK method path in messages.
 */
import { HTTP_METHODS, rootOf } from "../utils/document.js";
import { isPlainObject, resolveChild } from "../utils/resolve.js";
import type { AnyNode, RuleDefinition, UserContext } from "../utils/types.js";

const METHODS = new Set<string>(HTTP_METHODS);

function sdkGroupName(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.every(part => typeof part === "string")) {
    return value.join(".");
  }
  return undefined;
}

function audiencesOf(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((audience): audience is string => typeof audience === "string")
    .map(audience => audience.trim())
    .filter(audience => audience.length > 0);
}

/** Empty audience lists match every audience. */
function audiencesIntersect(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) {
    return true;
  }
  return left.some(audience => right.includes(audience));
}

export const noDuplicateOverrides: RuleDefinition = {
  name: "no-duplicate-overrides",
  fernRules: ["oss/no-duplicate-overrides"],
  severity: "error",
  description:
    "Two operations must not share the same x-fern-sdk-group-name and x-fern-sdk-method-name for overlapping audiences.",
  rule: (options: { namespace?: unknown } = {}) => ({
    Root: {
      leave(root: AnyNode, ctx: UserContext) {
        const namespace =
          typeof options.namespace === "string" && options.namespace.length > 0
            ? options.namespace
            : undefined;
        const seen = new Map<string, string[][]>();
        const paths = resolveChild(ctx, rootOf(root, ctx), "paths");
        if (paths === undefined || !isPlainObject(paths.node)) {
          return;
        }
        for (const path of Object.keys(paths.node)) {
          if (path.startsWith("x-")) {
            continue;
          }
          const pathItem = resolveChild(ctx, paths, path);
          if (pathItem === undefined || !isPlainObject(pathItem.node)) {
            continue;
          }
          for (const method of Object.keys(pathItem.node)) {
            if (!METHODS.has(method)) {
              continue;
            }
            const operation = resolveChild(ctx, pathItem, method);
            const node = operation?.node;
            if (operation === undefined || !isPlainObject(node)) {
              continue;
            }
            if (node["x-fern-ignore"] === true) {
              continue;
            }
            const groupName = sdkGroupName(node["x-fern-sdk-group-name"]);
            const methodName = node["x-fern-sdk-method-name"];
            if (
              groupName === undefined ||
              groupName.length === 0 ||
              typeof methodName !== "string" ||
              methodName.length === 0
            ) {
              continue;
            }
            const audiences = audiencesOf(node["x-fern-audiences"]);
            const key = `${groupName}:${methodName}`;
            const previous = seen.get(key) ?? [];
            if (previous.some(other => audiencesIntersect(audiences, other))) {
              const displayGroup =
                namespace === undefined
                  ? groupName
                  : `${namespace}.${groupName}`;
              ctx.report({
                message: `SDK method ${displayGroup}.${methodName} already exists (x-fern-sdk-group-name: ${groupName}, x-fern-sdk-method-name: ${methodName})`,
                location: operation.location.child("x-fern-sdk-method-name"),
              });
            }
            previous.push(audiences);
            seen.set(key, previous);
          }
        }
      },
    },
  }),
};
