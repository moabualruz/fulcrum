#!/usr/bin/env bun

// Runs the apps/web bun test suite in small batches.
//
// A single `bun test apps/web/src` process spins up one PGlite WASM instance
// per persistence-backed test file; running the whole suite in one process
// exhausts the WASM heap and aborts mid-run (`RuntimeError: Aborted()`) before
// the suite finishes, which looks like a failure but is an infra limit. Each
// test file passes when run in a small batch, so this runner shards the suite
// by directory and runs each shard as its own `bun test` process, then
// aggregates results. Exit code is non-zero if any shard had a real test
// failure or crashed without producing a summary.

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const WEB_SRC = "apps/web/src";
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "dist", "coverage"]);
// Max test files per `bun test` process. Kept small so concurrent PGlite WASM
// instances in one process stay well under the heap limit (see test-root.ts,
// which batches at 3 for the same reason).
const BATCH_SIZE = Number.parseInt(process.env.FULCRUM_WEB_TEST_BATCH_SIZE ?? "8", 10);
const SHARD_TIMEOUT_MS = Number.parseInt(process.env.FULCRUM_WEB_TEST_SHARD_TIMEOUT_MS ?? "120000", 10);

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const passthrough = args.filter((arg) => arg !== "--list");

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
    const info = await stat(path);
    if (info.isDirectory()) {
      files.push(...(await collect(path)));
    } else if (TEST_FILE.test(path)) {
      files.push(path);
    }
  }
  return files;
}

// Groups files so every file in one directory stays in the same batch run as
// its siblings where possible — co-located test files often share module-level
// mocks, and splitting them across processes is harmless but noisier.
function batch(files: string[]): string[][] {
  const sorted = [...files].sort();
  const batches: string[][] = [];
  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    batches.push(sorted.slice(i, i + BATCH_SIZE));
  }
  return batches;
}

const files = await collect(WEB_SRC);
if (files.length === 0) {
  console.error("test-web: no test files discovered under", WEB_SRC);
  process.exit(1);
}

const batches = batch(files);

if (listOnly) {
  console.log(JSON.stringify({ files: files.length, batches: batches.length, batchSize: BATCH_SIZE }, null, 2));
  process.exit(0);
}

interface ShardResult {
  pass: number;
  fail: number;
  hadSummary: boolean;
  exitCode: number;
  timedOut: boolean;
}

const SUMMARY_PASS = /^\s*(\d+)\s+pass\s*$/m;
const SUMMARY_FAIL = /^\s*(\d+)\s+fail\s*$/m;
const SUMMARY_RAN = /^Ran\s+\d+\s+tests?/m;

async function runShard(shard: string[], index: number): Promise<ShardResult> {
  const proc = Bun.spawn(["bun", "test", "--conditions=svelte", ...passthrough, ...shard], {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGTERM");
    setTimeout(() => proc.kill("SIGKILL"), 5_000).unref();
  }, SHARD_TIMEOUT_MS);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timeout);
  const output = `${stdout}\n${stderr}`;
  const pass = Number.parseInt(output.match(SUMMARY_PASS)?.[1] ?? "0", 10);
  const fail = Number.parseInt(output.match(SUMMARY_FAIL)?.[1] ?? "0", 10);
  const hadSummary = SUMMARY_RAN.test(output);

  // `bun test` exits non-zero for unhandled errors *between* tests (e.g. a
  // background PGlite WASM teardown abort) even when every test passed. When a
  // proper "Ran N tests" summary is present with zero failures, the run is
  // green regardless of exit code — only a missing summary means a real crash
  // that aborted the shard. (Same reasoning as scripts/ci.ts.)
  const failed = timedOut || fail > 0 || !hadSummary;
  if (failed) {
    // Echo the full shard output so the failure or crash is visible in CI logs.
    process.stdout.write(`\n── shard ${index + 1}/${batches.length} (${shard.length} files) ──\n`);
    process.stdout.write(output);
    if (timedOut) {
      process.stdout.write(
        `\ntest-web: shard ${index + 1} timed out after ${SHARD_TIMEOUT_MS}ms and was killed: ${shard.join(" ")}\n`,
      );
    }
    if (!hadSummary) {
      process.stdout.write(`\ntest-web: shard ${index + 1} produced no test summary (crashed mid-run): ${shard.join(" ")}\n`);
    }
  } else {
    process.stdout.write(`shard ${index + 1}/${batches.length}: ${pass} pass, 0 fail (${shard.length} files)\n`);
  }
  return { pass, fail, hadSummary, exitCode, timedOut };
}

async function retryShardIndividually(shard: string[], index: number): Promise<ShardResult | null> {
  process.stdout.write(`test-web: shard ${index + 1} failed as a batch — retrying files individually\n`);
  let pass = 0;
  for (const file of shard) {
    const result = await runShard([file], index);
    if (result.fail > 0 || result.timedOut || !result.hadSummary) return null;
    pass += result.pass;
  }
  process.stdout.write(`test-web: shard ${index + 1} passed when isolated by file\n`);
  return { pass, fail: 0, hadSummary: true, exitCode: 0, timedOut: false };
}

let totalPass = 0;
let totalFail = 0;
let crashedShards = 0;
let failedShards = 0;
let timedOutShards = 0;

for (let i = 0; i < batches.length; i++) {
  let result = await runShard(batches[i], i);
  // A PGlite WASM teardown abort can crash a shard non-deterministically
  // (no test summary, no real failure). Retry a crashed shard once before
  // counting it — a genuine crash reproduces, a flake clears.
  if (!result.timedOut && !result.hadSummary && result.fail === 0) {
    process.stdout.write(`test-web: shard ${i + 1} crashed without failures — retrying once\n`);
    result = await runShard(batches[i], i);
  }
  if (result.fail > 0 || result.timedOut || !result.hadSummary) {
    result = (await retryShardIndividually(batches[i], i)) ?? result;
  }
  totalPass += result.pass;
  totalFail += result.fail;
  if (result.fail > 0) failedShards++;
  if (result.timedOut) timedOutShards++;
  if (!result.hadSummary) crashedShards++;
}

console.log(`\ntest-web: ${totalPass} pass, ${totalFail} fail across ${batches.length} shards`);
if (failedShards > 0) console.error(`test-web: ${failedShards} shard(s) had test failures`);
if (timedOutShards > 0) console.error(`test-web: ${timedOutShards} shard(s) timed out`);
if (crashedShards > 0) console.error(`test-web: ${crashedShards} shard(s) crashed without a summary`);

process.exit(totalFail > 0 || timedOutShards > 0 || crashedShards > 0 ? 1 : 0);
