/**
 * Validates `x-fern-sdk-return-value` on operations: the SDK returns that top-level property of
 * the JSON success response instead of the whole response, so the response must be an object that
 * declares the property.
 */
import {
  endpointId,
  getJsonMediaType,
  getMediaType,
  getOperations,
  getSuccessResponse,
  rootOf,
  schemaOfMediaType,
  type OperationInfo,
} from "../utils/document.js";
import {
  describeMissingResponse,
  getFernResponse,
  isIgnored,
  streamingMode,
} from "../utils/property-path.js";
import { isPlainObject } from "../utils/resolve.js";
import {
  collectProperties,
  isObjectSchema,
  unwrapSchema,
} from "../utils/schema.js";
import type {
  AnyNode,
  Located,
  RuleDefinition,
  UserContext,
} from "../utils/types.js";

const EXTENSION = "x-fern-sdk-return-value";

type Target =
  | { kind: "schema"; schema: Located | undefined }
  | { kind: "ignored"; reason: string };

/** The schema whose property the SDK returns, following Fern's importer. */
function targetSchema(ctx: UserContext, operation: OperationInfo): Target {
  const mode = streamingMode(operation.node);
  const streaming = operation.node["x-fern-streaming"];
  if (mode === "stream-condition") {
    return isPlainObject(streaming) && streaming.response != null
      ? {
          kind: "schema",
          schema: {
            node: streaming.response,
            location: operation.location.child([
              "x-fern-streaming",
              "response",
            ]),
          },
        }
      : {
          kind: "ignored",
          reason:
            "its x-fern-streaming stream-condition has no response schema",
        };
  }
  if (mode === "stream") {
    if (isPlainObject(streaming) && streaming.format === "sse") {
      return {
        kind: "ignored",
        reason: "it streams server-sent events (x-fern-streaming format: sse)",
      };
    }
    const response = getSuccessResponse(ctx, operation);
    const media =
      getMediaType(ctx, response, "text/event-stream") ??
      getJsonMediaType(ctx, response);
    return media === undefined
      ? { kind: "ignored", reason: "its success response has no JSON content" }
      : { kind: "schema", schema: schemaOfMediaType(media) };
  }
  const response = getFernResponse(ctx, operation);
  return response.kind === "json"
    ? { kind: "schema", schema: response.schema }
    : { kind: "ignored", reason: describeMissingResponse(response.reason) };
}

/** Whether Fern imports the schema as a map rather than an object with properties. */
function isMap(ctx: UserContext, schema: Located | undefined): boolean {
  const resolved = unwrapSchema(ctx, schema);
  if (resolved === undefined || !isPlainObject(resolved.node)) {
    return false;
  }
  const additional = resolved.node.additionalProperties;
  return (
    (additional === true || isPlainObject(additional)) &&
    collectProperties(ctx, resolved).length === 0
  );
}

export const noResponseProperty: RuleDefinition = {
  name: "no-response-property",
  fernRules: ["fern-definition/no-response-property"],
  severity: "error",
  description:
    "x-fern-sdk-return-value must name a top-level property of the JSON success response.",
  rule: () => ({
    Root: {
      leave(root: AnyNode, ctx: UserContext) {
        for (const operation of getOperations(ctx, rootOf(root, ctx))) {
          if (isIgnored(operation.node)) {
            continue;
          }
          const value = operation.node[EXTENSION];
          if (value === undefined) {
            continue;
          }
          const location = operation.location.child(EXTENSION);
          if (typeof value !== "string") {
            ctx.report({
              message: `${EXTENSION} must be a string naming a top-level property of the response.`,
              location,
            });
            continue;
          }
          const target = targetSchema(ctx, operation);
          if (target.kind === "ignored") {
            ctx.report({
              message: `${EXTENSION} has no effect on endpoint ${endpointId(operation)}: ${target.reason}, and Fern only applies it to JSON responses.`,
              location,
            });
            continue;
          }
          if (
            !isObjectSchema(ctx, target.schema) ||
            isMap(ctx, target.schema)
          ) {
            ctx.report({
              message: `Response must be an object in order to return a property as a response: the response of endpoint ${endpointId(operation)} is not an object schema with properties, so ${EXTENSION} cannot select a property from it.`,
              location,
            });
            continue;
          }
          const exists = collectProperties(ctx, target.schema).some(
            property => property.key === value,
          );
          if (!exists) {
            ctx.report({
              message: `Response does not have a property named ${value}. ${EXTENSION} must name a top-level property of the response of endpoint ${endpointId(operation)}.`,
              location,
            });
          }
        }
      },
    },
  }),
};
