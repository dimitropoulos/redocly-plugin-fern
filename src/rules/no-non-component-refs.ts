/**
 * Reports local `$ref`s (`#/...`) in the root document that do not point under `#/components/`,
 * such as references to paths or operations. The whole root document is walked, including `x-*`
 * extension values. Files reached through external `$ref`s are not checked: their local `$ref`s
 * point into those files, which have no `components` section of their own.
 */
import { isPlainObject, isRefNode } from "../utils/resolve.js";
import type {
  AnyNode,
  Location,
  RuleDefinition,
  UserContext,
} from "../utils/types.js";

export const noNonComponentRefs: RuleDefinition = {
  name: "no-non-component-refs",
  fernRules: ["docs/no-non-component-refs"],
  severity: "error",
  description:
    "Local `$ref`s must point to reusable components under `#/components/`.",
  rule: () => ({
    Root: {
      leave(root: AnyNode, ctx: UserContext) {
        const walked = new Set<AnyNode>();
        const reported = new Set<string>();

        const walk = (node: AnyNode, location: Location): void => {
          if (typeof node !== "object" || node === null || walked.has(node)) {
            return;
          }
          walked.add(node);
          if (Array.isArray(node)) {
            node.forEach((item, index) => walk(item, location.child([index])));
            return;
          }
          if (isRefNode(node)) {
            const ref = node.$ref;
            if (ref.startsWith("#/") && !ref.startsWith("#/components/")) {
              const refLocation = location.child("$ref");
              const key = `${refLocation.source.absoluteRef}${refLocation.pointer}`;
              if (!reported.has(key)) {
                reported.add(key);
                ctx.report({
                  message: `Reference "${ref}" points to a non-component location. OpenAPI references should point to reusable components under #/components/ (e.g., #/components/schemas/MySchema, #/components/responses/MyResponse). Direct references to paths, operations, or other spec sections are not supported.`,
                  location: refLocation,
                });
              }
            }
          }
          if (isPlainObject(node)) {
            for (const [key, value] of Object.entries(node)) {
              walk(value, location.child([key]));
            }
          }
        };

        walk(root, ctx.location);
      },
    },
  }),
};
