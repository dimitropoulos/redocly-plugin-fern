/**
 * Validates Fern type references written in Fern's type syntax: schema-level `x-fern-type` and
 * the `type` of `x-fern-global-headers` / `x-fern-idempotency-headers` entries. Named types must
 * be keys of `components.schemas` (Fern turns anything else into `unknown`), map keys must be
 * primitives, and `file`, `text` and `bytes` cannot be expressed this way. Broken `$ref`s are
 * left to Redocly's `no-unresolved-refs`.
 */
import { rootOf } from "../utils/document.js";
import { describeValue } from "../utils/extensions.js";
import { rootValue } from "../utils/extensions-servers.js";
import {
  formatFernType,
  isTypeNameSyntax,
  namedTypes,
  nonPrimitiveMapKeys,
  parseFernType,
} from "../utils/fern-type.js";
import { isPlainObject, resolveChild } from "../utils/resolve.js";
import type {
  AnyNode,
  Location,
  RuleDefinition,
  UserContext,
} from "../utils/types.js";

interface FernTypeUsage {
  value: AnyNode;
  location: Location;
  label: string;
}

const SPECIAL_TYPES: Record<string, string> = {
  file: "The file type can only be used as properties in inlined requests, which {label} cannot express; use a multipart/form-data request property with type: string and format: binary instead.",
  text: "The text type can only be used as a response or response-stream, which {label} cannot express; use a text/plain response instead.",
  bytes:
    "The bytes type can only be used as a request, which {label} cannot express; use an application/octet-stream request body instead.",
};

function checkUsage(
  ctx: UserContext,
  usage: FernTypeUsage,
  schemaNames: Set<string>,
): void {
  const { value, location, label } = usage;
  if (typeof value !== "string") {
    ctx.report({
      message: `${label} must be a string in Fern's type syntax (for example optional<list<string>>); got ${describeValue(value)}.`,
      location,
    });
    return;
  }
  const parsed = parseFernType(value);
  const reported = new Set<string>();
  for (const name of namedTypes(parsed)) {
    if (reported.has(name)) {
      continue;
    }
    reported.add(name);
    const special = SPECIAL_TYPES[name];
    if (special !== undefined) {
      ctx.report({
        message: special.replace("{label}", label),
        location,
      });
    } else if (!schemaNames.has(name)) {
      ctx.report({
        message: isTypeNameSyntax(name)
          ? `Type ${name} is not defined. ${label} '${value}' references it, but it is neither a Fern primitive nor a key of components.schemas, so Fern treats it as unknown.`
          : `Type ${name} is not defined. ${label} '${value}' is not valid Fern type syntax: '${name}' is neither a primitive, a container such as list<...> or map<..., ...>, nor a key of components.schemas.`,
        location,
      });
    }
  }
  for (const key of nonPrimitiveMapKeys(parsed)) {
    ctx.report({
      message: `${label} '${value}' uses '${formatFernType(key)}' as a map key, but map keys must be primitive types; Fern ignores this type.`,
      location,
    });
  }
}

function headerUsages(
  ctx: UserContext,
  rootNode: AnyNode,
  key: string,
): FernTypeUsage[] {
  const root = rootOf(rootNode, ctx);
  const headers = rootValue(ctx, root, key);
  if (headers === undefined || !Array.isArray(headers.node)) {
    return [];
  }
  const usages: FernTypeUsage[] = [];
  headers.node.forEach((_header: AnyNode, index: number) => {
    const header = resolveChild(ctx, headers, index);
    if (
      header === undefined ||
      !isPlainObject(header.node) ||
      header.node.type === undefined ||
      header.node.type === null
    ) {
      return;
    }
    usages.push({
      value: header.node.type,
      location: header.location.child(["type"]),
      label: `${key} type`,
    });
  });
  return usages;
}

export const noUndefinedTypeReference: RuleDefinition = {
  name: "no-undefined-type-reference",
  fernRules: ["fern-definition/no-undefined-type-reference"],
  severity: "error",
  description:
    "Types written in Fern's type syntax (x-fern-type, header type) parse and reference schemas that exist.",
  rule: () => {
    let usages: FernTypeUsage[] = [];
    return {
      Root: {
        enter() {
          usages = [];
        },
        leave(rootNode: AnyNode, ctx: UserContext) {
          const root = rootOf(rootNode, ctx);
          const components = resolveChild(ctx, root, "components");
          const schemas =
            components === undefined
              ? undefined
              : resolveChild(ctx, components, "schemas");
          const schemaNames = new Set(
            schemas !== undefined && isPlainObject(schemas.node)
              ? Object.keys(schemas.node)
              : [],
          );
          for (const usage of [
            ...headerUsages(ctx, rootNode, "x-fern-global-headers"),
            ...headerUsages(ctx, rootNode, "x-fern-idempotency-headers"),
            ...usages,
          ]) {
            checkUsage(ctx, usage, schemaNames);
          }
        },
      },
      Schema(schema: AnyNode, ctx: UserContext) {
        if (
          !isPlainObject(schema) ||
          schema["x-fern-type"] === undefined ||
          schema["x-fern-type"] === null
        ) {
          return;
        }
        usages.push({
          value: schema["x-fern-type"],
          location: ctx.location.child(["x-fern-type"]),
          label: "x-fern-type",
        });
      },
    };
  },
};
