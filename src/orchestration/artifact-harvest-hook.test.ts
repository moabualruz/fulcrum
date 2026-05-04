/**
 * Tests for after_run artifact harvest hook in sandbox-runner (P4#12).
 *
 * Validates: matchArtifactGlob finds files matching default glob;
 * extractArtifacts copies matched files to artifacts/<run_id>/;
 * empty glob match produces zero extractions.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { mkdtemp, writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  matchArtifactGlob,
  extractArtifacts,
  DEFAULT_ARTIFACT_GLOB,
} from "./artifact-harvest-hook.ts";

describe("matchArtifactGlob", () => {
  let worktree: string;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), "glob-test-"));
  });

  test("matches default glob patterns", async () => {
    await mkdir(join(worktree, "dist"), { recursive: true });
    await mkdir(join(worktree, "build"), { recursive: true });
    await writeFile(join(worktree, "dist", "bundle.js"), "code");
    await writeFile(join(worktree, "build", "output.js"), "code");
    await writeFile(join(worktree, "fix.patch"), "patch");
    await writeFile(join(worktree, "changes.diff"), "diff");
    await mkdir(join(worktree, "src"), { recursive: true });
    await writeFile(join(worktree, "src", "main.ts"), "nope"); // should NOT match

    const matches = await matchArtifactGlob(worktree, DEFAULT_ARTIFACT_GLOB);

    const basenames = matches.map((m) => m.split("/").pop()).sort();
    expect(basenames).toContain("bundle.js");
    expect(basenames).toContain("output.js");
    expect(basenames).toContain("fix.patch");
    expect(basenames).toContain("changes.diff");
    expect(basenames).not.toContain("main.ts");
  });

  test("empty worktree yields no matches", async () => {
    const matches = await matchArtifactGlob(worktree, DEFAULT_ARTIFACT_GLOB);
    expect(matches).toHaveLength(0);
  });

  test("custom glob restricts matches", async () => {
    await writeFile(join(worktree, "report.md"), "# Report");
    await mkdir(join(worktree, "dist"), { recursive: true });
    await writeFile(join(worktree, "dist", "x.js"), "code");

    const matches = await matchArtifactGlob(worktree, "*.md");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toContain("report.md");
  });
});

describe("extractArtifacts", () => {
  let worktree: string;
  let workspaceRoot: string;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), "extract-test-"));
    workspaceRoot = await mkdtemp(join(tmpdir(), "ws-root-"));
  });

  test("copies matched files to artifacts/<runId>/", async () => {
    const runId = "run-42";
    await mkdir(join(worktree, "dist"), { recursive: true });
    await writeFile(join(worktree, "dist", "app.js"), "console.log('app');");
    await writeFile(join(worktree, "fix.patch"), "--- a\n+++ b\n");

    const matched = [
      join(worktree, "dist", "app.js"),
      join(worktree, "fix.patch"),
    ];

    const extractedDir = await extractArtifacts(matched, workspaceRoot, runId);

    const files = await readdir(extractedDir);
    expect(files.sort()).toEqual(["app.js", "fix.patch"]);

    const content = await readFile(join(extractedDir, "app.js"), "utf-8");
    expect(content).toBe("console.log('app');");
  });

  test("empty match list produces empty directory", async () => {
    const runId = "run-empty";
    const extractedDir = await extractArtifacts([], workspaceRoot, runId);

    const files = await readdir(extractedDir);
    expect(files).toHaveLength(0);
  });
});
