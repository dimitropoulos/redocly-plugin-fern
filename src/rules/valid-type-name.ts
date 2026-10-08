/**
 * Checks that the type names Fern declares begin with a letter: `x-fern-type-name` values on
 * component and inline schemas, `x-fern-request-name` / `x-request-name` values, and the names
 * Fern generates from `components.schemas` keys. Fern spells out leading numbers (`2fa` becomes
 * `two_Fa`), so generated names only fail for keys made only of symbols, keys starting with a
 * number above 9999 and keys starting with a non-ASCII letter.
 *
 * Redocly's `spec-components-invalid-map-name` only restricts keys to `^[a-zA-Z0-9.\-_]+$`.
 */
import { getOperations, rootOf } from "../utils/document.js";
import { requestNameOverride, TYPE_NAME_REGEX } from "../utils/type-names.js";
import {
  collectDeclarations,
  isInlineTypeDeclaration,
  type Declaration,
} from "../utils/type-names-declarations.js";
import type {
  AnyNode,
  Located,
  RuleDefinition,
  UserContext,
} from "../utils/types.js";

function message(declaration: Declaration): string | undefined {
  const name = `"${declaration.name}"`;
  switch (declaration.source) {
    case "schema-key":
      return `Type name must begin with a letter: Fern generates the type name ${name} from the components.schemas key "${declaration.schemaKey}". Add x-fern-type-name with a name that begins with a letter.`;
    case "x-fern-type-name":
    case "request-body-type-name":
      return `Type name must begin with a letter, but x-fern-type-name is ${name}.`;
    case "request-body-schema":
      return `Type name must begin with a letter: ${declaration.description} is named ${name}. Rename it with x-fern-request-name on the operation.`;
    default:
      return undefined;
  }
}

export const validTypeName: RuleDefinition = {
  name: "valid-type-name",
  fernRules: ["fern-definition/valid-type-name"],
  severity: "error",
  description: "Type names Fern declares must begin with a letter.",
  rule: () => {
    const inlineTypes: Located[] = [];
    let rootRef = "";
    return {
      Root: {
        enter(_root: AnyNode, ctx: UserContext) {
          rootRef = ctx.location.source.absoluteRef;
        },
        leave(root: AnyNode, ctx: UserContext) {
          const located = rootOf(root, ctx);
          for (const operation of getOperations(ctx, located, {
            includeWebhooks: true,
          })) {
            const override = requestNameOverride(operation.node);
            if (
              override !== undefined &&
              !TYPE_NAME_REGEX.test(override.name)
            ) {
              ctx.report({
                message: `Type name must begin with a letter, but ${override.extension} is "${override.name}".`,
                location: operation.location.child(override.extension),
              });
            }
          }
          const { declarations } = collectDeclarations(
            ctx,
            located,
            inlineTypes,
          );
          for (const declaration of declarations) {
            if (TYPE_NAME_REGEX.test(declaration.name)) {
              continue;
            }
            const text = message(declaration);
            if (text !== undefined) {
              ctx.report({ message: text, location: declaration.location });
            }
          }
        },
      },
      Schema(schema: AnyNode, ctx: UserContext) {
        const located = { node: schema, location: ctx.location };
        if (isInlineTypeDeclaration(ctx, located, rootRef)) {
          inlineTypes.push(located);
        }
      },
    };
  },
};
