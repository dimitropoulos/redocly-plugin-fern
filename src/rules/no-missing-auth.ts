/**
 * Reports `security` requirements that Fern cannot honor because none of the security schemes
 * they name are types Fern imports. Fern imports `apiKey` in a header, `http` bearer and basic,
 * `oauth2` and `openIdConnect`; other schemes (`apiKey` in a query or cookie, `mutualTLS`, other
 * `http` schemes) are skipped, so the endpoint requires auth but no auth is defined for it.
 *
 * The root `security` is reported once, when at least one operation inherits it. An empty
 * requirement (`{}`) makes auth optional and is never reported. Scheme names that are not
 * defined in `components.securitySchemes` are reported by Redocly's `security-defined`.
 */
import { getOperations, rootOf } from "../utils/document.js";
import { isPlainObject, resolveChild } from "../utils/resolve.js";
import { isFernEndpoint } from "../utils/structure.js";
import type {
  AnyNode,
  Located,
  RuleDefinition,
  UserContext,
} from "../utils/types.js";

/** Why Fern skips a security scheme, or undefined when Fern supports it. */
function unsupportedReason(scheme: AnyNode): string | undefined {
  if (!isPlainObject(scheme)) {
    return "not a security scheme object";
  }
  const type = scheme.type;
  if (type === "apiKey") {
    return scheme.in === "header"
      ? undefined
      : `apiKey in ${typeof scheme.in === "string" ? scheme.in : "an unknown location"}`;
  }
  if (type === "http") {
    const httpScheme =
      typeof scheme.scheme === "string" ? scheme.scheme.toLowerCase() : "";
    return httpScheme === "bearer" || httpScheme === "basic"
      ? undefined
      : `http ${httpScheme === "" ? "without a scheme" : httpScheme}`;
  }
  if (type === "openIdConnect") {
    return undefined;
  }
  if (type === "oauth2") {
    return scheme.flows == null ? "oauth2 without flows" : undefined;
  }
  return typeof type === "string" ? type : "a scheme without a type";
}

interface Verdict {
  /** Names and reasons of the unsupported schemes, when no requirement is usable. */
  unsupported: string[];
}

/**
 * Checks a `security` array. Returns undefined when Fern can authenticate (or auth is optional,
 * absent, or only names undefined schemes).
 */
function checkSecurity(
  security: AnyNode,
  schemes: Record<string, string | undefined>,
): Verdict | undefined {
  if (!Array.isArray(security) || security.length === 0) {
    return undefined;
  }
  const unsupported: string[] = [];
  for (const requirement of security) {
    if (!isPlainObject(requirement)) {
      continue;
    }
    const names = Object.keys(requirement);
    if (names.length === 0) {
      return undefined;
    }
    for (const name of names) {
      if (!(name in schemes)) {
        continue;
      }
      const reason = schemes[name];
      if (reason === undefined) {
        return undefined;
      }
      const description = `${name} (${reason})`;
      if (!unsupported.includes(description)) {
        unsupported.push(description);
      }
    }
  }
  return unsupported.length === 0 ? undefined : { unsupported };
}

function securitySchemes(
  ctx: UserContext,
  root: Located,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  const components = resolveChild(ctx, root, "components");
  const schemes =
    components === undefined
      ? undefined
      : resolveChild(ctx, components, "securitySchemes");
  if (schemes === undefined || !isPlainObject(schemes.node)) {
    return result;
  }
  for (const name of Object.keys(schemes.node)) {
    result[name] = unsupportedReason(resolveChild(ctx, schemes, name)?.node);
  }
  return result;
}

const SUPPORTED =
  "Fern supports apiKey in a header, http bearer, http basic, oauth2 and openIdConnect security schemes.";

export const noMissingAuth: RuleDefinition = {
  name: "no-missing-auth",
  fernRules: ["fern-definition/no-missing-auth"],
  severity: "error",
  description:
    "Operations that require auth must use security schemes Fern supports.",
  rule: () => ({
    Root: {
      leave(root: AnyNode, ctx: UserContext) {
        const document = rootOf(root, ctx);
        const schemes = securitySchemes(ctx, document);
        let inheritsRootSecurity = false;
        for (const operation of getOperations(ctx, document)) {
          if (!isFernEndpoint(operation)) {
            continue;
          }
          if (operation.node.security === undefined) {
            inheritsRootSecurity = true;
            continue;
          }
          const verdict = checkSecurity(operation.node.security, schemes);
          if (verdict !== undefined) {
            ctx.report({
              message: `Operation requires auth, but no auth is defined: Fern does not support any of the security schemes in its \`security\`: ${verdict.unsupported.join(", ")}. ${SUPPORTED}`,
              location: operation.location.child("security").key(),
            });
          }
        }
        if (!inheritsRootSecurity || !isPlainObject(root)) {
          return;
        }
        const verdict = checkSecurity(root.security, schemes);
        if (verdict !== undefined) {
          ctx.report({
            message: `The root \`security\` requires auth, but no auth is defined: Fern does not support any of its security schemes: ${verdict.unsupported.join(", ")}. ${SUPPORTED}`,
            location: ctx.location.child("security").key(),
          });
        }
      },
    },
  }),
};
