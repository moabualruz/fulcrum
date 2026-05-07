import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

const EMPTY_DIR_ALLOWLIST = new Set([
  "tests/scripts/license-audit.fixtures/invalid-json",
  "tests/scripts/license-audit.fixtures/missing-license",
  "tests/scripts/license-audit.fixtures/multi-license",
  "tests/scripts/license-audit.fixtures/pretend-agpl",
  "tests/scripts/license-audit.fixtures/pretend-mit",
]);

const GENERATED_OR_VENDOR_DIRS = new Set([
  ".git",
  ".svelte-kit",
  "dist",
  "graphify-out",
  "node_modules",
  "vendor",
]);

const RUNNABLE_SURFACE_DIRS = ["cli", "tui", "web", "api", "router", "server", "trpc"];

async function walkDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const dirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (GENERATED_OR_VENDOR_DIRS.has(entry.name)) continue;

    const path = join(dir, entry.name);
    dirs.push(path);
    dirs.push(...await walkDirs(path));
  }

  return dirs;
}

async function visibleEntries(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .map((entry) => entry.name)
    .filter((name) => !GENERATED_OR_VENDOR_DIRS.has(name) && name !== ".DS_Store");
}

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    if (GENERATED_OR_VENDOR_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

describe("repository structure hygiene", () => {
  test("source tree does not contain empty directories outside explicit fixture allowlist", async () => {
    const dirs = await walkDirs(ROOT);
    const emptyDirs: string[] = [];

    for (const dir of dirs) {
      const rel = relative(ROOT, dir);
      if (EMPTY_DIR_ALLOWLIST.has(rel)) continue;
      if (!rel.startsWith("src/") && !rel.startsWith("apps/") && !rel.startsWith("tests/")) continue;
      if ((await visibleEntries(dir)).length === 0) emptyDirs.push(rel);
    }

    expect(emptyDirs.sort()).toEqual([]);
  });

  test("context ADR directories are created lazily instead of carrying duplicate template-only copies", async () => {
    const canonicalTemplate = await readFile(join(ROOT, "docs/adr/0000-template.md"), "utf8");
    const files = await collectFiles(join(ROOT, "src"));
    const duplicateTemplates: string[] = [];

    for (const file of files) {
      const rel = relative(ROOT, file);
      if (!rel.endsWith("/docs/adr/0000-template.md")) continue;
      if (await readFile(file, "utf8") === canonicalTemplate) duplicateTemplates.push(rel);
    }

    expect(duplicateTemplates.sort()).toEqual([]);
  });

  test("runnable surfaces live under apps instead of root src", async () => {
    const srcEntries = await visibleEntries(join(ROOT, "src"));
    const misplaced = RUNNABLE_SURFACE_DIRS.filter((dir) => srcEntries.includes(dir));

    expect(misplaced).toEqual([]);
  });

  test("local client and server apps have first-class package manifests", async () => {
    const expectedPackages = new Map([
      ["apps/cli/package.json", "@fulcrum/cli"],
      ["apps/server/package.json", "@fulcrum/server"],
      ["apps/tui/package.json", "@fulcrum/tui"],
      ["apps/web/package.json", "@fulcrum/web"],
    ]);

    const missingOrMisnamed: string[] = [];
    for (const [path, name] of expectedPackages) {
      const raw = await readFile(join(ROOT, path), "utf8").catch(() => "");
      if (!raw.includes(`"name": "${name}"`)) missingOrMisnamed.push(path);
    }

    expect(missingOrMisnamed).toEqual([]);
  });
});
