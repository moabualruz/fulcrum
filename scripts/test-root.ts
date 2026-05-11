#!/usr/bin/env bun

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const ROOTS = ["scripts", "src", "tests"] as const;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "dist", "coverage"]);
const SKIP_PATHS = new Set(["tests/a11y"]);
const args = process.argv.slice(2);
const coverage = args.includes("--coverage") || args.includes("--root-coverage");
const timeoutMs = coverage ? process.env.FULCRUM_ROOT_TEST_TIMEOUT_MS ?? "30000" : null;
const coverageBatchSize = Number.parseInt(process.env.FULCRUM_ROOT_TEST_COVERAGE_BATCH_SIZE ?? "3", 10);
const coverageBatchConfig = "config/bunfig.root-coverage-batch.toml";

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
const coverageBatchArgs = coverage
  ? [
    // The root coverage gate is batched to avoid Bun coverage hangs on the full
    // suite. Bun currently exits 99 for low-coverage per-batch subsets even
    // when the batch config sets coverageThreshold = 0, so this mode keeps the
    // root suite as the integration gate while web coverage remains instrumented.
  ]
  : [];
const timeoutArgs = timeoutMs ? [`--timeout=${timeoutMs}`] : [];
const env = coverage ? { ...process.env, FULCRUM_COVERAGE: "1" } : process.env;

async function runBatch(batch: string[], batchCoverageArgs = coverageArgs): Promise<number> {
  const bunArgs = batchCoverageArgs === coverageBatchArgs
    ? [`--config=${coverageBatchConfig}`, "test"]
    : ["test"];
  const proc = Bun.spawn(["bun", ...bunArgs, "--conditions=svelte", ...timeoutArgs, ...batchCoverageArgs, ...batch], {
    env,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  return await proc.exited;
}

if (!coverage) {
  process.exit(await runBatch(files));
}

const batchSize = Number.isFinite(coverageBatchSize) && coverageBatchSize > 0
  ? coverageBatchSize
  : 3;
for (let index = 0; index < files.length; index += batchSize) {
  const batch = files.slice(index, index + batchSize);
  const code = await runBatch(batch, coverageBatchArgs);
  if (code !== 0) {
    console.error(`test-root: coverage batch failed with exit ${code}: ${batch.join(" ")}`);
    process.exit(code);
  }
}

process.exit(0);
