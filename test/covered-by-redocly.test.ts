import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { builtInRules } from "../src/index.js";
import {
  lintCase,
  listDirectories,
  readExpected,
  shouldUpdate,
  writeExpected,
} from "./harness.js";

/**
 * Each directory here is named after a Fern rule that Redocly already implements with a built-in
 * rule. The fixtures prove the built-in rule (configured in the case's redocly.yaml) reports the
 * same problem, which is why this plugin does not re-implement it.
 */
const FIXTURES = join(import.meta.dirname, "covered-by-redocly");

describe("Fern rules covered by built-in Redocly rules", () => {
  for (const fernRule of listDirectories(FIXTURES)) {
    describe(fernRule, () => {
      for (const caseName of listDirectories(join(FIXTURES, fernRule))) {
        const caseDirectory = join(FIXTURES, fernRule, caseName);
        test(caseName, async () => {
          expect(
            existsSync(join(caseDirectory, "redocly.yaml")),
            "each case needs a redocly.yaml",
          ).toBe(true);
          const problems = await lintCase(caseDirectory, {});
          if (shouldUpdate) {
            writeExpected(caseDirectory, problems);
            return;
          }
          expect(problems).toEqual(readExpected(caseDirectory));
          expect(
            problems.length,
            "the built-in rule should report the problem",
          ).toBeGreaterThan(0);
        });
      }
    });
  }

  test("every built-in rule enabled by fern/recommended has a fixture", () => {
    const covered = new Set(listDirectories(FIXTURES));
    const missing: string[] = [];
    for (const { fernRules } of Object.values(builtInRules)) {
      for (const fernRule of fernRules) {
        if (!covered.has(fernRule.split("/")[1]!)) {
          missing.push(fernRule);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
