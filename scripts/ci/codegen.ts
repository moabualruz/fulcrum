#!/usr/bin/env bun

import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { generateCliFiles } from "../cli/codegen.ts";

export type SnapshotGateOptions = {
  committedDir: string;
  freshDir: string;
};

export type SnapshotGateResult = {
  ok: boolean;
  changedFiles: string[];
  message: string;
};

const DIVERGENCE_MESSAGE = "AppRouter changed without regenerating snapshots; run: bun run codegen";

export async function checkGeneratedSnapshot(options: SnapshotGateOptions): Promise<SnapshotGateResult> {
  const committed = await readTree(options.committedDir);
  const fresh = await readTree(options.freshDir);
  const names = [...new Set([...Object.keys(committed), ...Object.keys(fresh)])].sort();
  const changedFiles = names.filter((name) => committed[name] !== fresh[name]);

  if (changedFiles.length === 0) {
    return {
      ok: true,
      changedFiles,
      message: "ci:codegen OK — generated snapshot matches fresh codegen",
    };
  }

  return {
    ok: false,
    changedFiles,
    message: `${DIVERGENCE_MESSAGE}\nChanged generated files:\n${changedFiles.map((file) => `  - ${file}`).join("\n")}`,
  };
}

async function readTree(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parentPath = "parentPath" in entry ? entry.parentPath : dir;
    const absolutePath = join(parentPath, entry.name);
    const name = relative(dir, absolutePath).split("\\").join("/");
    files[name] = await readFile(absolutePath, "utf8");
  }
  return files;
}

async function assertCompletionScriptsNonEmpty(dir: string): Promise<void> {
  const files = ["completions.sh", "completions.zsh", "completions.fish"];
  for (const file of files) {
    const path = join(dir, file);
    const info = await stat(path);
    if (info.size === 0) {
      throw new Error(`ci:codegen FAIL — ${file} is empty`);
    }
  }
}

export async function runCodegenSnapshotGate(root = resolve(import.meta.dir, "../..")): Promise<SnapshotGateResult> {
  const scratch = await mkdtemp(join(tmpdir(), "fulcrum-ci-codegen-"));
  const freshDir = join(scratch, "generated");
  const freshCompletionsDir = join(scratch, "completions");

  try {
    await runSchemaRegistryCheck(root);
    await generateCliFiles({
      routerPath: join(root, "src/server/trpc/router.ts"),
      outDir: freshDir,
      completionsDir: freshCompletionsDir,
      useAst: true,
    });
    await assertCompletionScriptsNonEmpty(freshCompletionsDir);
    return await checkGeneratedSnapshot({
      committedDir: join(root, "src/cli/generated"),
      freshDir,
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function runSchemaRegistryCheck(root: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const proc = spawn("bun", ["run", "scripts/ci-schemas.ts"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    proc.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error("ci:codegen FAIL — schema registry check failed"));
    });
  });
}

if (import.meta.main) {
  const start = performance.now();
  try {
    const result = await runCodegenSnapshotGate();
    console[result.ok ? "log" : "error"](result.message);
    const elapsed = performance.now() - start;
    console.log(`ci:codegen elapsed ${(elapsed / 1000).toFixed(2)}s`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
