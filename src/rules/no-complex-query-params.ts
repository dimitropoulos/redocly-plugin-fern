/**
 * Reports `in: query` parameters whose schema is, or transitively contains, a discriminated union.
 * The search follows `$ref`s, array `items`, map values (`additionalProperties`), object
 * `properties`, `allOf` members and the members of undiscriminated unions, and stops at cycles.
 */
import { getOperations, rootOf } from "../utils/document.js";
import { isPlainObject, isRefNode, resolveNode } from "../utils/resolve.js";
import { refName } from "../utils/schema.js";
import { isDiscriminatedUnion, isFernEndpoint } from "../utils/structure.js";
import type {
  AnyNode,
  Located,
  RuleDefinition,
  UserContext,
} from "../utils/types.js";

interface Found {
  /** Name of the discriminated union: its `$ref` name, or `inline` for inline schemas. */
  name: string | undefined;
  /** Keywords walked from the parameter schema to the union. */
  path: string[];
}

function findDiscriminatedUnion(
  ctx: UserContext,
  start: Located,
): Found | undefined {
  const visited = new Set<string>();

  const visit = (current: Located, path: string[]): Found | undefined => {
    const currentName = isRefNode(current.node)
      ? refName(current.node.$ref)
      : undefined;
    const resolved = resolveNode(ctx, current.node, current.location);
    if (resolved === undefined || !isPlainObject(resolved.node)) {
      return undefined;
    }
    const key = resolved.location.absolutePointer;
    if (visited.has(key)) {
      return undefined;
    }
    visited.add(key);
    const schema = resolved.node;
    if (schema["x-fern-type"] !== undefined) {
      return undefined;
    }
    if (isDiscriminatedUnion(schema)) {
      return { name: currentName, path };
    }
    const child = (
      keys: (string | number)[],
      label: string,
    ): Found | undefined => {
      let node: AnyNode = schema;
      for (const segment of keys) {
        node = node?.[segment];
      }
      if (node === undefined) {
        return undefined;
      }
      return visit({ node, location: resolved.location.child(keys) }, [
        ...path,
        label,
      ]);
    };

    const items = child(["items"], "items");
    if (items !== undefined) {
      return items;
    }
    if (isPlainObject(schema.additionalProperties)) {
      const values = child(["additionalProperties"], "additionalProperties");
      if (values !== undefined) {
        return values;
      }
    }
    if (isPlainObject(schema.properties)) {
      for (const property of Object.keys(schema.properties)) {
        const found = child(["properties", property], `properties.${property}`);
        if (found !== undefined) {
          return found;
        }
      }
    }
    for (const keyword of ["allOf", "oneOf", "anyOf"] as const) {
      const members = schema[keyword];
      if (!Array.isArray(members)) {
        continue;
      }
      for (let index = 0; index < members.length; index++) {
        const found = child([keyword, index], `${keyword}[${index}]`);
        if (found !== undefined) {
          return found;
        }
      }
    }
    return undefined;
  };

  return visit(start, []);
}

export const noComplexQueryParams: RuleDefinition = {
  name: "no-complex-query-params",
  fernRules: ["fern-definition/no-complex-query-params"],
  severity: "error",
  description:
    "Query parameters cannot use schemas that contain discriminated unions.",
  rule: () => ({
    Root: {
      leave(root: AnyNode, ctx: UserContext) {
        const reported = new Set<string>();
        for (const operation of getOperations(ctx, rootOf(root, ctx))) {
          if (!isFernEndpoint(operation)) {
            continue;
          }
          for (const parameter of operation.parameters) {
            if (
              parameter.in !== "query" ||
              parameter.node.schema === undefined ||
              parameter.node["x-fern-ignore"] === true
            ) {
              continue;
            }
            const schemaLocation = parameter.location.child("schema");
            const reportKey = schemaLocation.absolutePointer;
            if (reported.has(reportKey)) {
              continue;
            }
            const found = findDiscriminatedUnion(ctx, {
              node: parameter.node.schema,
              location: schemaLocation,
            });
            if (found === undefined) {
              continue;
            }
            reported.add(reportKey);
            const union =
              found.name === undefined
                ? "an inline discriminated union"
                : `the discriminated union "${found.name}"`;
            const relation =
              found.path.length === 0
                ? `is ${union}`
                : `contains ${union} (at ${found.path.join(" > ")})`;
            ctx.report({
              message: `\`in: query\` parameter "${parameter.name}" has a schema that ${relation}. Discriminated unions (oneOf/anyOf with a discriminator) are not valid in query parameters.`,
              location: schemaLocation.key(),
            });
          }
        }
      },
    },
  }),
};
