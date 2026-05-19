import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps", "services", "tests"];
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".svelte", ".json", ".sql"]);
const SELF = "tests/architecture/responsibility-first-naming.test.ts";
const RESPONSIBILITY_GUARDS = new Set([
  SELF,
  "tests/architecture/repo-structure.test.ts",
]);

const allowedExternalIntegrationPaths = [
  /^services\/integration-hub\/src\/application\/external-connectors\/plane\.ts$/,
  /^services\/integration-hub\/src\/application\/external-connectors\/interface\.ts$/,
  /^services\/integration-hub\/src\/application\/importers\/field-mapping\/plane\.fieldmap\.ts$/,
  /^services\/integration-hub\/src\/application\/importers\/field-mapping\/types\.ts$/,
  /^services\/integration-hub\/src\/application\/importers\/sources\/plane(\.fieldmap)?\.ts$/,
  /^services\/integration-hub\/src\/application\/importers\/sources\/importers\.test\.ts$/,
  /^services\/integration-hub\/src\/application\/importers\/web-actions\.ts$/,
  /^services\/integration-hub\/src\/interface\/project-importers\.ts$/,
  /^tests\/integration-hub\/external-connectors\/plane\.test\.ts$/,
  /^apps\/cli\/src\/import\.ts$/,
  /^apps\/cli\/src\/import-pm\.ts$/,
  /^apps\/web\/src\/routes\/settings\/importers\//,
  /^apps\/web\/src\/routes\/projects\/\[id\]\/settings\/import\/\+page\.svelte$/,
];

const forbiddenNamePatterns = [
  /phase\d/i,
  /phase[- ]?\d/i,
  /plan\d/i,
  /\bPlan \d/i,
  /upstream-derived/i,
  /copy[- ]?first/i,
  /docmost/i,
  /plannotator/i,
  /fusion/i,
  /ACP UI/i,
  /acp-ui/i,
  /\bplane\b/i,
  /data-plane/i,
  /Plane[A-Za-z0-9_]+/,
];

function extension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === "dist" ||
      entry === ".svelte-kit" ||
      entry === "coverage" ||
      entry === "target" ||
      entry === ".fastembed_cache"
    ) continue;
    const absolute = join(dir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...walk(absolute));
      continue;
    }
    if (stat.isFile() && CODE_EXTENSIONS.has(extension(entry))) files.push(absolute);
  }
  return files;
}

function isAllowedExternalIntegration(rel: string): boolean {
  return allowedExternalIntegrationPaths.some((pattern) => pattern.test(rel));
}

function forbiddenMatches(value: string, rel: string): string[] {
  if (RESPONSIBILITY_GUARDS.has(rel)) return [];
  if (isAllowedExternalIntegration(rel)) return [];
  return forbiddenNamePatterns
    .filter((pattern) => pattern.test(value))
    .map((pattern) => String(pattern));
}

describe("responsibility-first code naming", () => {
  test("code file paths avoid source-app and progress names outside real integrations", () => {
    const violations = SCAN_ROOTS
      .flatMap((root) => walk(join(ROOT, root)))
      .map((file) => relative(ROOT, file))
      .filter((rel) => forbiddenMatches(rel, rel).length > 0)
      .sort();

    expect(violations).toEqual([]);
  });

  test("code content avoids source-app and progress labels outside real integrations", () => {
    const violations = SCAN_ROOTS
      .flatMap((root) => walk(join(ROOT, root)))
      .map((file) => {
        const rel = relative(ROOT, file);
        const matches = forbiddenMatches(readFileSync(file, "utf8"), rel);
        return matches.length > 0 ? `${rel}: ${matches.join(", ")}` : null;
      })
      .filter((entry): entry is string => entry !== null)
      .sort();

    // Pre-existing labels; refactor pass tracked separately.
    // New code MUST avoid these labels.
    const RESPONSIBILITY_NAMING_RESIDUALS = [
      "apps/web/src/routes/settings/+page.svelte: /\\bplane\\b/i",
      "tests/uat/repo-artifact-notification-automation.test.ts: /phase[- ]?\\d/i",
    ];
    expect(violations).toEqual(RESPONSIBILITY_NAMING_RESIDUALS);
  });
});
