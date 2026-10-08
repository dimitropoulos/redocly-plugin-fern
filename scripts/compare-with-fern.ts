/**
 * Runs the real `fern check` on every fixture and prints, per case, what this plugin reports
 * (from output.json) next to what Fern reports. Requires the `fern` CLI on PATH.
 *
 *   node scripts/compare-with-fern.ts [filter] > comparison.txt
 *
 * `filter` is an optional substring matched against `<tree>/<rule>/<case>`.
 */
import { execFile } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = join(import.meta.dirname, "..", "test");
const trees = ["fixtures", "covered-by-redocly"];
const filter = process.argv[2] ?? "";

function directories(path: string): string[] {
  return existsSync(path)
    ? readdirSync(path)
        .filter(entry => statSync(join(path, entry)).isDirectory())
        .sort()
    : [];
}

const cases = trees.flatMap(tree =>
  directories(join(root, tree)).flatMap(rule =>
    directories(join(root, tree, rule)).map(name => ({
      id: `${tree}/${rule}/${name}`,
      directory: join(root, tree, rule, name),
    })),
  ),
);

async function fernCheck(directory: string): Promise<string> {
  const entry = ["openapi.yaml", "openapi.json", "swagger.yaml"].find(file =>
    existsSync(join(directory, file)),
  );
  if (entry === undefined) {
    return "(no entry file)";
  }
  const work = mkdtempSync(join(tmpdir(), "fern-compare-"));
  try {
    cpSync(directory, join(work, "fern", "spec"), { recursive: true });
    writeFileSync(
      join(work, "fern", "fern.config.json"),
      JSON.stringify({ organization: "scratch", version: fernVersion }),
    );
    // An SDK group is required: `fern check` skips API validation without one.
    writeFileSync(
      join(work, "fern", "generators.yml"),
      [
        "api:",
        "  specs:",
        `    - openapi: spec/${entry}`,
        "groups:",
        "  sdk:",
        "    generators:",
        "      - name: fernapi/fern-typescript-sdk",
        "        version: 3.0.0",
        "",
      ].join("\n"),
    );
    try {
      const { stdout, stderr } = await run(
        "fern",
        ["check", "--warnings", "--local"],
        { cwd: work, timeout: 120_000 },
      );
      return stdout + stderr;
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      return (failure.stdout ?? "") + (failure.stderr ?? "");
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function summarize(output: string): string[] {
  // oxlint-disable-next-line no-control-regex
  const clean = output.replace(/\u001b\[[0-9;]*m/g, "");
  const issues = [
    ...clean.matchAll(/\[(error|warning)\]\n(?:\s+path:.*\n)?\s+issue: (.*)/g),
  ].map(match => `  FERN ${match[1]![0]!.toUpperCase()}: ${match[2]}`);
  const failures = clean
    .split("\n")
    .filter(line => /Failed to|Error:|is not a function|Cannot read/.test(line))
    .map(line => `  FERN !: ${line.trim()}`);
  return [...issues, ...failures];
}

// Pin the project to the installed CLI version; `"*"` can resolve to an older cached release.
const { stdout: installedVersion } = await run("fern", ["--version"], {
  cwd: tmpdir(),
});
const fernVersion = installedVersion.trim();

const selected = cases.filter(({ id }) => id.includes(filter));
const results = new Map<string, string[]>();
let next = 0;
await Promise.all(
  Array.from({ length: Math.max(1, availableParallelism() / 2) }, async () => {
    while (next < selected.length) {
      const current = selected[next++]!;
      const ours = JSON.parse(
        readFileSync(join(current.directory, "output.json"), "utf8"),
      ) as { ruleId: string; severity: string; message: string }[];
      results.set(current.id, [
        ...ours.map(
          problem =>
            `  OURS ${problem.severity[0]!.toUpperCase()}: [${problem.ruleId}] ${problem.message}`,
        ),
        ...summarize(await fernCheck(current.directory)),
      ]);
    }
  }),
);

for (const { id } of selected) {
  console.log(`### ${id}`);
  for (const line of results.get(id) ?? []) {
    console.log(line);
  }
}
