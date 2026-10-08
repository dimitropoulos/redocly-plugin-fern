import type { OperationInfo } from "./document.js";
import { getRequestBody } from "./document.js";
import {
  isPlainObject,
  isRefNode,
  resolveChild,
  resolveNode,
} from "./resolve.js";
import { refName, schemaTypes } from "./schema.js";
import type { AnyNode, Located, UserContext } from "./types.js";

type Ctx = Pick<UserContext, "resolve">;

/** HTTP methods Fern's OpenAPI importer turns into endpoints. */
export const FERN_HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
]);

/** Whether Fern imports the operation as an HTTP endpoint (not ignored, not a webhook). */
export function isFernEndpoint(operation: OperationInfo): boolean {
  return (
    operation.kind === "path" &&
    FERN_HTTP_METHODS.has(operation.method) &&
    operation.node["x-fern-ignore"] !== true &&
    operation.node["x-fern-webhook"] !== true
  );
}

export interface ParsedMediaType {
  type: string;
  subtype: string;
}

/** Parses the essence of a media type (`type/subtype`), lowercased. */
export function parseMediaType(mediaType: string): ParsedMediaType | undefined {
  const essence = mediaType.split(";")[0]!.trim().toLowerCase();
  const parts = essence.split("/");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    return undefined;
  }
  return { type: parts[0]!, subtype: parts[1]! };
}

export function isMultipartMediaType(mediaType: string): boolean {
  return parseMediaType(mediaType)?.type === "multipart";
}

function isUrlEncodedMediaType(mediaType: string): boolean {
  const parsed = parseMediaType(mediaType);
  return (
    parsed?.type === "application" && parsed.subtype === "x-www-form-urlencoded"
  );
}

/** Media types Fern's importer treats as a raw binary (octet-stream) request body. */
function isBinaryMediaType(mediaType: string): boolean {
  const parsed = parseMediaType(mediaType);
  if (parsed === undefined) {
    return false;
  }
  const { type, subtype } = parsed;
  if (["image", "audio", "video", "font"].includes(type)) {
    return true;
  }
  return (
    type === "application" &&
    [
      "octet-stream",
      "pdf",
      "zip",
      "x-zip-compressed",
      "gzip",
      "x-gzip",
      "tar",
      "x-tar",
      "br",
    ].includes(subtype)
  );
}

/** Fern's importer treats any media type containing `json`, or `*\/*`, as JSON. */
function isJsonLikeMediaType(mediaType: string): boolean {
  return mediaType.includes("json") || mediaType === "*/*";
}

export type FernRequestKind =
  | "octetStream"
  | "multipart"
  | "json"
  | "urlEncoded";

export interface FernRequestMediaType extends Located {
  mediaType: string;
  kind: FernRequestKind;
}

function hasSchema(mediaType: Located | undefined): boolean {
  return isPlainObject(mediaType?.node) && mediaType.node.schema !== undefined;
}

function hasExamples(mediaType: Located): boolean {
  const node = mediaType.node;
  if (!isPlainObject(node)) {
    return false;
  }
  return (
    node.example !== undefined ||
    (isPlainObject(node.examples) && Object.keys(node.examples).length > 0)
  );
}

/** Whether a JSON request schema has a top-level binary property (Fern then prefers multipart). */
function jsonSchemaHasFile(ctx: Ctx, mediaType: Located): boolean {
  const schema = resolveChild(ctx, mediaType, "schema");
  if (schema === undefined || !isPlainObject(schema.node)) {
    return false;
  }
  const properties = schema.node.properties;
  if (!isPlainObject(properties)) {
    return false;
  }
  return Object.values(properties).some(
    property =>
      isPlainObject(property) &&
      !isRefNode(property) &&
      property.type === "string" &&
      (property.format === "binary" ||
        (property.format === undefined &&
          property.contentMediaType === "application/octet-stream")),
  );
}

/**
 * The request body media types Fern's importer converts for an operation, and how it converts
 * each one. Fern converts a single media type (binary first, then JSON or multipart, then
 * form-urlencoded) unless every media type sets `x-fern-sdk-method-name`, in which case each
 * one becomes its own endpoint. GET operations never have a request body in Fern.
 */
export function fernRequestMediaTypes(
  ctx: Ctx,
  operation: OperationInfo,
): FernRequestMediaType[] {
  if (operation.method === "get") {
    return [];
  }
  const requestBody = getRequestBody(ctx, operation);
  const content =
    requestBody === undefined
      ? undefined
      : resolveChild(ctx, requestBody, "content");
  if (content === undefined || !isPlainObject(content.node)) {
    return [];
  }
  const entries: (Located & { mediaType: string })[] = [];
  for (const mediaType of Object.keys(content.node)) {
    const resolved = resolveChild(ctx, content, mediaType);
    if (resolved !== undefined && isPlainObject(resolved.node)) {
      entries.push({ ...resolved, mediaType });
    }
  }
  if (entries.length === 0) {
    return [];
  }

  const allHaveSdkMethodNames = entries.every(
    entry => entry.node["x-fern-sdk-method-name"] !== undefined,
  );
  if (allHaveSdkMethodNames) {
    const result: FernRequestMediaType[] = [];
    for (const entry of entries) {
      if (isBinaryMediaType(entry.mediaType)) {
        result.push({ ...entry, kind: "octetStream" });
      } else if (isMultipartMediaType(entry.mediaType) && hasSchema(entry)) {
        result.push({ ...entry, kind: "multipart" });
      } else if (isJsonLikeMediaType(entry.mediaType)) {
        result.push({ ...entry, kind: "json" });
      } else if (isUrlEncodedMediaType(entry.mediaType) && hasSchema(entry)) {
        result.push({ ...entry, kind: "urlEncoded" });
      }
    }
    return result;
  }

  const binary = entries.find(entry => isBinaryMediaType(entry.mediaType));
  if (binary !== undefined) {
    return [{ ...binary, kind: "octetStream" }];
  }
  const multipart = entries.find(entry =>
    isMultipartMediaType(entry.mediaType),
  );
  const json = entries.find(entry => isJsonLikeMediaType(entry.mediaType));
  if (json !== undefined || multipart !== undefined) {
    const jsonHasSchema = hasSchema(json);
    const multipartHasSchema = hasSchema(multipart);
    if (!jsonHasSchema && !multipartHasSchema) {
      if (json !== undefined && hasExamples(json)) {
        return [{ ...json, kind: "json" }];
      }
    } else if (jsonHasSchema && multipartHasSchema) {
      return jsonSchemaHasFile(ctx, json!)
        ? [{ ...multipart!, kind: "multipart" }]
        : [{ ...json!, kind: "json" }];
    } else if (jsonHasSchema) {
      return [{ ...json!, kind: "json" }];
    } else {
      return [{ ...multipart!, kind: "multipart" }];
    }
  }
  const urlEncoded = entries.find(entry =>
    isUrlEncodedMediaType(entry.mediaType),
  );
  if (urlEncoded !== undefined && hasSchema(urlEncoded)) {
    return [{ ...urlEncoded, kind: "urlEncoded" }];
  }
  return [];
}

/**
 * Whether a multipart property schema is a file (or list of files) in Fern's eyes: an inline
 * `type: string` with `format: binary` (or `contentMediaType: application/octet-stream`),
 * optionally nullable or wrapped in an inline array. `$ref`'d schemas are never files.
 */
export function isFileSchema(node: AnyNode, depth = 0): boolean {
  if (!isPlainObject(node) || isRefNode(node) || depth > 8) {
    return false;
  }
  for (const union of ["oneOf", "anyOf"] as const) {
    const members = node[union];
    if (Array.isArray(members) && members.length === 2) {
      const nonNull = members.filter(
        member => !(isPlainObject(member) && member.type === "null"),
      );
      if (nonNull.length === 1) {
        return isFileSchema(nonNull[0], depth + 1);
      }
    }
  }
  const types = schemaTypes(node).filter(type => type !== "null");
  if (types.length !== 1) {
    return false;
  }
  if (types[0] === "array") {
    return isFileSchema(node.items, depth + 1);
  }
  return (
    types[0] === "string" &&
    node.enum === undefined &&
    node.const === undefined &&
    (node.format === "binary" ||
      (node.format === undefined &&
        node.contentMediaType === "application/octet-stream"))
  );
}

/**
 * Whether Fern's importer turns a schema into a discriminated union: a `oneOf`/`anyOf` with a
 * `discriminator` (unless `x-fern-undiscriminated: true` or `x-fern-discriminated: false`), or a
 * `discriminator.mapping` without `oneOf`/`anyOf`.
 */
export function isDiscriminatedUnion(schema: AnyNode): boolean {
  if (!isPlainObject(schema) || schema["x-fern-discriminated"] === false) {
    return false;
  }
  const discriminator = schema.discriminator;
  if (!isPlainObject(discriminator)) {
    return false;
  }
  const hasMembers =
    (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) ||
    (Array.isArray(schema.anyOf) && schema.anyOf.length > 0);
  if (hasMembers) {
    return (
      schema["x-fern-undiscriminated"] !== true ||
      schema["x-fern-discriminated"] === true
    );
  }
  return (
    isPlainObject(discriminator.mapping) &&
    Object.keys(discriminator.mapping).length > 0
  );
}

export type FernSchemaKind =
  | "object"
  | "map"
  | "list"
  | "primitive"
  | "enum"
  | "union"
  | "nullable"
  | "unknown"
  | "custom";

type Classification =
  | { kind: FernSchemaKind; schema: Located }
  | { alias: Located };

function hasNoProperties(schema: Record<string, AnyNode>): boolean {
  return (
    !isPlainObject(schema.properties) ||
    Object.keys(schema.properties).length === 0
  );
}

function isNullMember(member: AnyNode): boolean {
  return isPlainObject(member) && !isRefNode(member) && member.type === "null";
}

function isValidAllOfObject(member: AnyNode, depth = 0): boolean {
  if (!isPlainObject(member) || depth > 16) {
    return false;
  }
  if (
    isRefNode(member) ||
    member.type === "object" ||
    member.properties != null
  ) {
    return true;
  }
  for (const key of ["allOf", "oneOf", "anyOf"] as const) {
    if (Array.isArray(member[key])) {
      return member[key].every((element: AnyNode) =>
        isValidAllOfObject(element, depth + 1),
      );
    }
  }
  return false;
}

/** A `oneOf` whose branches only declare `required` constrains the sibling object; it is not a union. */
function isPresenceConstraint(schema: Record<string, AnyNode>): boolean {
  return (
    isPlainObject(schema.properties) &&
    Array.isArray(schema.oneOf) &&
    schema.oneOf.length > 0 &&
    schema.oneOf.every(
      (member: AnyNode) =>
        isPlainObject(member) &&
        !isRefNode(member) &&
        Object.keys(member).every(key => key === "required"),
    )
  );
}

/**
 * One step of Fern's schema conversion: either the kind of type the schema becomes, or the schema
 * it is an alias of (`$ref`, single-member `oneOf`/`anyOf`/`allOf`).
 */
function classifyOnce(ctx: Ctx, located: Located): Classification {
  if (isRefNode(located.node)) {
    const resolved = resolveNode(ctx, located.node, located.location);
    return resolved === undefined
      ? { kind: "unknown", schema: located }
      : { alias: resolved };
  }
  const schema = located.node;
  if (!isPlainObject(schema)) {
    return { kind: "unknown", schema: located };
  }
  const result = (kind: FernSchemaKind): Classification => ({
    kind,
    schema: located,
  });
  const member = (key: string, index: number): Classification => ({
    alias: {
      node: schema[key][index],
      location: located.location.child([key, index]),
    },
  });
  if (schema["x-fern-type"] !== undefined) {
    return result("custom");
  }
  const types = schemaTypes(schema);
  const nonNull = types.filter(type => type !== "null");
  if (types.includes("null")) {
    return result("nullable");
  }
  if (nonNull.length > 1) {
    return result("union");
  }
  const type = nonNull[0];
  if (
    (schema.const !== undefined || Array.isArray(schema.enum)) &&
    (type === undefined || type === "string")
  ) {
    return result("enum");
  }
  if (
    type === "string" ||
    type === "integer" ||
    type === "number" ||
    type === "boolean"
  ) {
    return result("primitive");
  }
  if (type === "array") {
    return result("list");
  }
  if (
    schema.additionalProperties != null &&
    schema.additionalProperties !== false &&
    hasNoProperties(schema) &&
    schema.allOf == null
  ) {
    return result("map");
  }
  const hasMapping =
    isPlainObject(schema.discriminator) &&
    isPlainObject(schema.discriminator.mapping);
  const oneOf = isPresenceConstraint(schema) ? undefined : schema.oneOf;
  if (type === "object" && hasMapping) {
    return result("union");
  }
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    if (hasMapping && Object.keys(schema.discriminator.mapping).length > 0) {
      return result("union");
    }
    if (oneOf.length === 1) {
      return member("oneOf", 0);
    }
    if (oneOf.length === 2) {
      if (isNullMember(oneOf[0]) || isNullMember(oneOf[1])) {
        return result("nullable");
      }
    }
    const allEnums = oneOf.every(
      (variant: AnyNode) =>
        isPlainObject(variant) &&
        !isRefNode(variant) &&
        (Array.isArray(variant.enum) || variant.const !== undefined),
    );
    return result(allEnums ? "enum" : "union");
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    if (schema.anyOf.length === 1) {
      return member("anyOf", 0);
    }
    if (
      schema.anyOf.length === 2 &&
      (isNullMember(schema.anyOf[0]) || isNullMember(schema.anyOf[1]))
    ) {
      return result("nullable");
    }
    return result("union");
  }
  if (hasMapping && Object.keys(schema.discriminator.mapping).length > 0) {
    return result("union");
  }
  if (schema.allOf != null || schema.properties != null) {
    const allOf: AnyNode[] = Array.isArray(schema.allOf) ? schema.allOf : [];
    const indexed = allOf.map((element, index) => ({ element, index }));
    const filtered = indexed.filter(
      ({ element }) =>
        isRefNode(element) ||
        (isPlainObject(element) && Object.keys(element).length > 0),
    );
    const canShortCircuit =
      hasNoProperties(schema) &&
      (schema.additionalProperties == null ||
        schema.additionalProperties === false);
    if (canShortCircuit && filtered.length === 1) {
      return member("allOf", filtered[0]!.index);
    }
    const objects = filtered.filter(({ element }) =>
      isValidAllOfObject(element),
    );
    if (canShortCircuit && objects.length === 1) {
      return member("allOf", objects[0]!.index);
    }
    return result("object");
  }
  if (type === "object") {
    return result("map");
  }
  return result("unknown");
}

/** The kind of Fern type a schema converts to, following aliases. */
export function fernSchemaKind(
  ctx: Ctx,
  located: Located,
): { kind: FernSchemaKind; schema: Located } {
  const seen = new Set<string>();
  let current = located;
  for (;;) {
    const key = `${current.location.absolutePointer}`;
    if (seen.has(key) || seen.size > 64) {
      return { kind: "unknown", schema: current };
    }
    seen.add(key);
    const classification = classifyOnce(ctx, current);
    if ("alias" in classification) {
      current = classification.alias;
      continue;
    }
    return classification;
  }
}

/** Whether the schema itself (without following aliases) converts to a Fern object with `extends`. */
export function convertsToObject(ctx: Ctx, located: Located): boolean {
  const classification = classifyOnce(ctx, located);
  return "kind" in classification && classification.kind === "object";
}

/**
 * The `allOf` member Fern short-circuits a schema to (a schema whose only content is a single
 * `allOf` member), if any.
 */
export function allOfAliasTarget(
  ctx: Ctx,
  located: Located,
): Located | undefined {
  if (!isPlainObject(located.node) || !Array.isArray(located.node.allOf)) {
    return undefined;
  }
  const classification = classifyOnce(ctx, located);
  if (!("alias" in classification)) {
    return undefined;
  }
  const pointer = classification.alias.location.pointer;
  return pointer.startsWith(`${located.location.pointer}/allOf/`)
    ? classification.alias
    : undefined;
}

/** Describes a Fern schema kind in OpenAPI terms, for messages. */
export function describeKind(kind: FernSchemaKind, schema: AnyNode): string {
  switch (kind) {
    case "object":
      return "an object";
    case "map":
      return isPlainObject(schema) &&
        schema.additionalProperties != null &&
        schema.additionalProperties !== false
        ? "a map (additionalProperties without properties)"
        : "an object without properties, which Fern imports as a map";
    case "list":
      return "an array";
    case "primitive": {
      const type = schemaTypes(schema).find(candidate => candidate !== "null");
      return type === "integer" ? "an integer" : `a ${type ?? "primitive"}`;
    }
    case "enum":
      return "an enum";
    case "union":
      return "a union (oneOf/anyOf)";
    case "nullable":
      return "nullable, which Fern imports as a nullable alias rather than an object";
    case "custom":
      return "a custom x-fern-type";
    case "unknown":
      return "a schema without a type, which Fern imports as unknown";
  }
}

/** A short name for a schema in messages: the `$ref` target name or `inline schema`. */
export function schemaName(node: AnyNode): string {
  return isRefNode(node) ? refName(node.$ref) : "inline schema";
}
