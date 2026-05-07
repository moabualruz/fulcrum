#!/usr/bin/env bun

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const ROOTS = ["scripts", "src", "tests"] as const;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "dist", "coverage"]);
const SKIP_PATHS = new Set(["tests/a11y"]);
const args = process.argv.slice(2);
const coverage = args.includes("--coverage");

async function collect(root: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(root, entry);
    if (path === "apps/web") continue;
    if (SKIP_PATHS.has(path)) continue;
    const info = await stat(path);
    if (info.isDirectory()) {
      files.push(...await collect(path));
    } else if (TEST_FILE.test(path)) {
      files.push(path);
    }
  }
  return files;
}

const files = (await Promise.all(ROOTS.map(collect))).flat().sort();
if (files.length === 0) {
  console.error("test-root: no test files discovered");
  process.exit(1);
}

const coverageArgs = coverage ? ["--coverage"] : [];
const proc = Bun.spawn(["bun", "test", "--conditions=svelte", ...coverageArgs, ...files], {
  env: coverage ? { ...process.env, FULCRUM_COVERAGE: "1" } : process.env,
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});

process.exit(await proc.exited);
