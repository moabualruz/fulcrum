#!/usr/bin/env bun

import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { coverageStats, mergeLcov, renderMergedLcov, type CoverageMap } from "./test-root-coverage.ts";

const ROOTS = ["scripts", "src", "services", "apps/cli", "apps/server", "apps/tui", "tests"] as const;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "dist", "coverage"]);
const SKIP_PATHS = new Set(["tests/a11y"]);
const args = process.argv.slice(2);
const coverage = args.includes("--coverage") || args.includes("--root-coverage");
const timeoutMs = coverage ? process.env.FULCRUM_ROOT_TEST_TIMEOUT_MS ?? "30000" : null;
const coverageBatchSize = Number.parseInt(process.env.FULCRUM_ROOT_TEST_COVERAGE_BATCH_SIZE ?? "3", 10);
const coverageThreshold = Number.parseFloat(process.env.FULCRUM_ROOT_TEST_COVERAGE_THRESHOLD ?? "0.80");

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

const timeoutArgs = timeoutMs ? [`--timeout=${timeoutMs}`] : [];
const env = coverage ? { ...process.env, FULCRUM_COVERAGE: "1" } : process.env;
let exitCode = 0;

async function runBatch(batch: string[], configPath?: string): Promise<number> {
  const bunArgs = configPath ? [`--config=${configPath}`, "test"] : ["test"];
  const proc = Bun.spawn(["bun", ...bunArgs, "--conditions=svelte", ...timeoutArgs, ...batch], {
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

async function writeCoverageConfig(dir: string, coverageDir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const configPath = join(dir, "bunfig.toml");
  await writeFile(configPath, [
    "[test]",
    "coverage = true",
    "coverageThreshold = 0",
    'coverageReporter = ["lcov"]',
    `coverageDir = ${JSON.stringify(coverageDir)}`,
    'preload = ["./apps/web/src/lib/test/svelte-ssr-preload.ts"]',
    "",
  ].join("\n"));
  return configPath;
}

const batchSize = Number.isFinite(coverageBatchSize) && coverageBatchSize > 0
  ? coverageBatchSize
  : 3;

const tempRoot = await mkdtemp(join(tmpdir(), "fulcrum-root-coverage-"));
const mergedCoverage: CoverageMap = new Map();
try {
  for (let index = 0; index < files.length; index += batchSize) {
    const batch = files.slice(index, index + batchSize);
    const batchDir = join(tempRoot, `batch-${Math.floor(index / batchSize)}`);
    const configPath = await writeCoverageConfig(batchDir, join(batchDir, "coverage"));
    const code = await runBatch(batch, configPath);
    const lcovPath = join(batchDir, "coverage", "lcov.info");
    const lcovPresent = await stat(lcovPath).then((info) => info.isFile(), () => false);
    if (code !== 0 && !(code === 99 && lcovPresent)) {
      console.error(`test-root: coverage batch failed with exit ${code}: ${batch.join(" ")}`);
      exitCode = code;
      break;
    }
    mergeLcov(mergedCoverage, await readFile(lcovPath, "utf8"));
  }

  if (exitCode === 0) {
    const mergedLcov = renderMergedLcov(mergedCoverage);
    const outputPath = join("coverage", "root", "lcov.info");
    await rm(dirname(outputPath), { recursive: true, force: true });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, mergedLcov);

    const stats = coverageStats(mergedCoverage);
    const percent = (stats.ratio * 100).toFixed(2);
    const requiredPercent = (coverageThreshold * 100).toFixed(0);
    console.log(`root coverage lines: ${percent}% (${stats.covered}/${stats.total}), threshold ${requiredPercent}%`);
    if (stats.ratio < coverageThreshold) {
      console.error(`test-root: root line coverage ${percent}% is below ${requiredPercent}%`);
      exitCode = 99;
    }
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

process.exit(exitCode);
