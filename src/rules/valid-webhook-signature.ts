/**
 * Validates `x-fern-webhook-signature`, the webhook signature verification config. The document
 * root holds the default for every webhook (an object); a webhook operation (under `webhooks`, or
 * with `x-fern-webhook: true`) may override it with an object or inherit it with a boolean.
 */
import { getOperations, operationLabel, rootOf } from "../utils/document.js";
import { describeValue, isNonEmptyString } from "../utils/extensions.js";
import { isPlainObject } from "../utils/resolve.js";
import type {
  AnyNode,
  Location,
  RuleDefinition,
  UserContext,
} from "../utils/types.js";

const EXTENSION = "x-fern-webhook-signature";
const HMAC_ALGORITHMS = ["sha256", "sha1", "sha384", "sha512"];
const ASYMMETRIC_ALGORITHMS = [
  "rsa-sha256",
  "rsa-sha384",
  "rsa-sha512",
  "ecdsa-sha256",
  "ecdsa-sha384",
  "ecdsa-sha512",
  "ed25519",
];
const ENCODINGS = ["base64", "hex"];
const TIMESTAMP_FORMATS = ["unix-seconds", "unix-millis", "iso8601"];
const PAYLOAD_COMPONENTS = [
  "body",
  "timestamp",
  "notification-url",
  "message-id",
];
const BODY_HASH_ALGORITHMS = ["sha256", "sha1", "sha384", "sha512"];

function isSet(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function oneOf(values: string[]): string {
  return values.join(", ");
}

function validateSignature(
  ctx: UserContext,
  signature: Record<string, AnyNode>,
  location: Location,
): void {
  const at = (...path: (string | number)[]) => location.child(path);

  if (signature.type !== "hmac" && signature.type !== "asymmetric") {
    ctx.report({
      message: `${EXTENSION} type must be 'hmac' or 'asymmetric'; Fern drops signature verification for ${isSet(signature.type) ? describeValue(signature.type) : "a config without a type"}.`,
      location: isSet(signature.type) ? at("type") : at("type").key(),
    });
  }

  if (!isNonEmptyString(signature.header)) {
    ctx.report({
      message: `${EXTENSION} must specify a header`,
      location: isSet(signature.header) ? at("header") : at("header").key(),
    });
  }

  if (isSet(signature.encoding) && !ENCODINGS.includes(signature.encoding)) {
    ctx.report({
      message: `Invalid encoding ${JSON.stringify(signature.encoding)}. Must be one of: ${oneOf(ENCODINGS)}`,
      location: at("encoding"),
    });
  }

  if (isSet(signature.timestamp)) {
    validateTimestamp(ctx, signature.timestamp, at("timestamp"));
  }

  if (isSet(signature["payload-format"])) {
    validatePayloadFormat(
      ctx,
      signature["payload-format"],
      at("payload-format"),
    );
  }

  if (signature.type === "hmac") {
    if (
      isSet(signature.algorithm) &&
      !HMAC_ALGORITHMS.includes(signature.algorithm)
    ) {
      ctx.report({
        message: `Invalid HMAC algorithm ${JSON.stringify(signature.algorithm)}. Must be one of: ${oneOf(HMAC_ALGORITHMS)}`,
        location: at("algorithm"),
      });
    }
    if (isSet(signature["body-hash-binding"])) {
      validateBodyHashBinding(ctx, signature, at("body-hash-binding"));
    }
    if (isSet(signature["url-normalization"])) {
      validateUrlNormalization(
        ctx,
        signature["url-normalization"],
        at("url-normalization"),
      );
    }
  }

  if (signature.type === "asymmetric") {
    const algorithm = signature["asymmetric-algorithm"];
    if (!ASYMMETRIC_ALGORITHMS.includes(algorithm)) {
      ctx.report({
        message: `Invalid asymmetric algorithm ${isSet(algorithm) ? JSON.stringify(algorithm) : "(missing)"}. Must be one of: ${oneOf(ASYMMETRIC_ALGORITHMS)}. Fern drops signature verification without a valid asymmetric-algorithm.`,
        location: isSet(algorithm)
          ? at("asymmetric-algorithm")
          : at("asymmetric-algorithm").key(),
      });
    }
    if (isSet(signature["key-id-header"]) && !isSet(signature["jwks-url"])) {
      ctx.report({
        message:
          "key-id-header is specified without jwks-url and will be ignored",
        location: at("key-id-header").key(),
        forceSeverity: "warn",
      });
    }
  }
}

function validateTimestamp(
  ctx: UserContext,
  timestamp: AnyNode,
  location: Location,
): void {
  if (!isPlainObject(timestamp)) {
    ctx.report({
      message: `${EXTENSION} timestamp must be an object with a header.`,
      location,
    });
    return;
  }
  if (!isNonEmptyString(timestamp.header)) {
    ctx.report({
      message: `${EXTENSION} timestamp must specify a header`,
      location: isSet(timestamp.header)
        ? location.child(["header"])
        : location.child(["header"]).key(),
    });
  }
  if (
    isSet(timestamp.format) &&
    !TIMESTAMP_FORMATS.includes(timestamp.format)
  ) {
    ctx.report({
      message: `Invalid timestamp format ${JSON.stringify(timestamp.format)}. Must be one of: ${oneOf(TIMESTAMP_FORMATS)}`,
      location: location.child(["format"]),
    });
  }
  if (
    isSet(timestamp.tolerance) &&
    (typeof timestamp.tolerance !== "number" || timestamp.tolerance <= 0)
  ) {
    ctx.report({
      message: `${EXTENSION} timestamp tolerance must be a positive number`,
      location: location.child(["tolerance"]),
    });
  }
}

function validatePayloadFormat(
  ctx: UserContext,
  format: AnyNode,
  location: Location,
): void {
  if (!isPlainObject(format) || !Array.isArray(format.components)) {
    ctx.report({
      message: `${EXTENSION} payload-format must be an object with a list of components (${oneOf(PAYLOAD_COMPONENTS)}).`,
      location: isPlainObject(format)
        ? location.child(["components"])
        : location,
    });
    return;
  }
  format.components.forEach((component: AnyNode, index: number) => {
    if (!PAYLOAD_COMPONENTS.includes(component)) {
      ctx.report({
        message: `Invalid payload-format component ${JSON.stringify(component)}. Must be one of: ${oneOf(PAYLOAD_COMPONENTS)}`,
        location: location.child(["components", index]),
      });
    }
  });
}

function validateBodyHashBinding(
  ctx: UserContext,
  signature: Record<string, AnyNode>,
  location: Location,
): void {
  const binding = signature["body-hash-binding"];
  if (!isPlainObject(binding)) {
    ctx.report({
      message: `${EXTENSION} body-hash-binding must be an object with an algorithm and a location.`,
      location,
    });
    return;
  }
  if (isSet(binding.encoding) && !ENCODINGS.includes(binding.encoding)) {
    ctx.report({
      message: `Invalid body-hash-binding encoding ${JSON.stringify(binding.encoding)}. Must be one of: ${oneOf(ENCODINGS)}`,
      location: location.child(["encoding"]),
    });
  }
  if (!BODY_HASH_ALGORITHMS.includes(binding.algorithm)) {
    ctx.report({
      message: `Invalid body-hash-binding algorithm ${isSet(binding.algorithm) ? JSON.stringify(binding.algorithm) : "(missing)"}. Must be one of: ${oneOf(BODY_HASH_ALGORITHMS)}`,
      location: isSet(binding.algorithm)
        ? location.child(["algorithm"])
        : location.child(["algorithm"]).key(),
    });
  }
  const bindingLocation = binding.location;
  if (
    !isPlainObject(bindingLocation) ||
    bindingLocation.type !== "query-parameter"
  ) {
    ctx.report({
      message: `body-hash-binding location must be {type: query-parameter, name}; Fern ignores the body-hash-binding otherwise.`,
      location: isPlainObject(bindingLocation)
        ? location.child(["location", "type"])
        : isSet(bindingLocation)
          ? location.child(["location"])
          : location.child(["location"]).key(),
    });
    return;
  }
  if (!isNonEmptyString(bindingLocation.name)) {
    ctx.report({
      message: "body-hash-binding query-parameter location must specify a name",
      location: isSet(bindingLocation.name)
        ? location.child(["location", "name"])
        : location.child(["location", "name"]).key(),
    });
  }
  const components = signature["payload-format"]?.components;
  if (!Array.isArray(components) || !components.includes("notification-url")) {
    ctx.report({
      message:
        "A query-parameter body-hash-binding requires payload-format.components to include " +
        '"notification-url", since the body hash is transmitted in the notification URL that is signed.',
      location: location.child(["location"]),
    });
  }
}

function validateUrlNormalization(
  ctx: UserContext,
  normalization: AnyNode,
  location: Location,
): void {
  if (!isPlainObject(normalization)) {
    ctx.report({
      message: `${EXTENSION} url-normalization must be an object with port-variants and/or legacy-query-encoding.`,
      location,
    });
    return;
  }
  let typed = true;
  for (const key of ["port-variants", "legacy-query-encoding"]) {
    if (isSet(normalization[key]) && typeof normalization[key] !== "boolean") {
      typed = false;
      ctx.report({
        message: `url-normalization ${key} must be a boolean; Fern ignores the url-normalization otherwise.`,
        location: location.child([key]),
      });
    }
  }
  if (
    typed &&
    normalization["port-variants"] !== true &&
    normalization["legacy-query-encoding"] !== true
  ) {
    ctx.report({
      message:
        "url-normalization must enable at least one of port-variants or legacy-query-encoding",
      location,
    });
  }
}

export const validWebhookSignature: RuleDefinition = {
  name: "valid-webhook-signature",
  fernRules: ["fern-definition/valid-webhook-signature"],
  severity: "error",
  description:
    "x-fern-webhook-signature is a valid HMAC or asymmetric signature config and is only set on webhooks.",
  rule: () => ({
    Root: {
      leave(rootNode: AnyNode, ctx: UserContext) {
        const root = rootOf(rootNode, ctx);
        const rootSignature = isPlainObject(rootNode)
          ? rootNode[EXTENSION]
          : undefined;
        const rootLocation = root.location.child([EXTENSION]);
        if (isSet(rootSignature)) {
          if (isPlainObject(rootSignature)) {
            validateSignature(ctx, rootSignature, rootLocation);
          } else {
            ctx.report({
              message: `The document-level ${EXTENSION} must be an object (the default config for every webhook); Fern ignores ${describeValue(rootSignature)}.`,
              location: rootLocation,
            });
          }
        }
        const hasRootConfig = isPlainObject(rootSignature);

        for (const operation of getOperations(ctx, root, {
          includeWebhooks: true,
        })) {
          const signature = operation.node[EXTENSION];
          if (!isSet(signature)) {
            continue;
          }
          const location = operation.location.child([EXTENSION]);
          const isWebhook =
            operation.kind === "webhook" ||
            operation.node["x-fern-webhook"] === true;
          if (!isWebhook) {
            ctx.report({
              message: `${EXTENSION} is ignored on ${operationLabel(operation)}: it only applies to webhooks (operations under \`webhooks\`, or with x-fern-webhook: true).`,
              location: location.key(),
            });
            continue;
          }
          if (isPlainObject(signature)) {
            validateSignature(ctx, signature, location);
          } else if (signature === true && !hasRootConfig) {
            ctx.report({
              message: `${EXTENSION}: true inherits the document-level ${EXTENSION}, but the document does not define one, so Fern drops signature verification for this webhook.`,
              location,
            });
          } else if (signature === false && hasRootConfig) {
            ctx.report({
              message: `${EXTENSION}: false does not disable signature verification: Fern treats any boolean as "inherit" and applies the document-level ${EXTENSION} to this webhook.`,
              location,
              forceSeverity: "warn",
            });
          } else if (typeof signature !== "boolean") {
            ctx.report({
              message: `${EXTENSION} on a webhook must be an object, or true to inherit the document-level config; got ${describeValue(signature)}.`,
              location,
            });
          }
        }
      },
    },
  }),
};
