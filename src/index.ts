import { ruleDefinitions } from "./rules/index.js";
import type {
  Oas2Rule,
  Oas3Rule,
  RuleDefinition,
  Severity,
} from "./utils/types.js";

export const PLUGIN_ID = "fern";

/**
 * Built-in Redocly rules that already implement checks Fern performs. The plugin does not
 * re-implement these; `fern/recommended` turns them on instead.
 */
export const builtInRules: Record<
  string,
  { severity: Severity; fernRules: string[] }
> = {
  struct: {
    severity: "error",
    fernRules: ["fern-definition/valid-endpoint-path"],
  },
  "no-unresolved-refs": {
    severity: "error",
    fernRules: [
      "fern-definition/import-file-exists",
      "fern-definition/no-undefined-type-reference",
      "docs/valid-local-references",
    ],
  },
  "path-params-defined": {
    severity: "error",
    fernRules: ["fern-definition/no-undefined-path-parameters"],
  },
  "no-duplicated-enum-values": {
    severity: "error",
    fernRules: ["fern-definition/no-duplicate-enum-values"],
  },
  "no-invalid-media-type-examples": {
    severity: "error",
    fernRules: [
      "fern-definition/valid-example-error",
      "docs/valid-openapi-examples",
    ],
  },
  "no-invalid-schema-examples": {
    severity: "error",
    fernRules: ["fern-definition/valid-example-type"],
  },
  "security-defined": {
    severity: "error",
    fernRules: ["fern-definition/no-missing-auth"],
  },
  "operation-operationId-unique": {
    severity: "error",
    fernRules: ["fern-definition/no-duplicate-declarations"],
  },
};

function rulesFor(spec: "oas3" | "oas2"): Record<string, Oas3Rule | Oas2Rule> {
  const result: Record<string, Oas3Rule | Oas2Rule> = {};
  for (const definition of ruleDefinitions) {
    if ((definition.spec ?? "oas3") === spec) {
      result[definition.name] = definition.rule;
    }
  }
  return result;
}

function recommendedRules(): Record<string, Severity> {
  const rules: Record<string, Severity> = {};
  for (const [name, { severity }] of Object.entries(builtInRules)) {
    rules[name] = severity;
  }
  for (const definition of ruleDefinitions) {
    rules[`${PLUGIN_ID}/${definition.name}`] = definition.severity;
  }
  return rules;
}

export default function fernPlugin() {
  const recommended = recommendedRules();
  return {
    id: PLUGIN_ID,
    rules: {
      oas3: rulesFor("oas3") as Record<string, Oas3Rule>,
      oas2: rulesFor("oas2") as Record<string, Oas2Rule>,
    },
    configs: {
      recommended: { rules: recommended },
    },
  };
}

export { ruleDefinitions };
export type { RuleDefinition };
