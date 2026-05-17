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

describe("DEFAULT_ARTIFACT_GLOB — configured vs default", () => {
  test("DEFAULT_ARTIFACT_GLOB is a non-empty string", () => {
    expect(typeof DEFAULT_ARTIFACT_GLOB).toBe("string");
    expect(DEFAULT_ARTIFACT_GLOB.length).toBeGreaterThan(0);
  });

  test("configured glob overrides DEFAULT_ARTIFACT_GLOB when provided", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "configured-glob-"));
    await writeFile(join(worktree, "report.html"), "<html/>");
    await mkdir(join(worktree, "dist"), { recursive: true });
    await writeFile(join(worktree, "dist", "bundle.js"), "code");

    // Only *.html should match — not the dist/ default
    const configuredGlob = "*.html";
    const matches = await matchArtifactGlob(worktree, configuredGlob);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toContain("report.html");
  });

  test("DEFAULT_ARTIFACT_GLOB catches dist/**, build/**, *.patch, *.diff", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "default-glob-"));
    await mkdir(join(worktree, "dist"), { recursive: true });
    await mkdir(join(worktree, "build"), { recursive: true });
    await writeFile(join(worktree, "dist", "out.js"), "js");
    await writeFile(join(worktree, "build", "out.wasm"), "wasm");
    await writeFile(join(worktree, "changes.patch"), "patch");
    await writeFile(join(worktree, "workspace.diff"), "diff");

    const matches = await matchArtifactGlob(worktree, DEFAULT_ARTIFACT_GLOB);
    const bases = matches.map((m) => m.split("/").pop()!).sort();
    expect(bases).toContain("out.js");
    expect(bases).toContain("out.wasm");
    expect(bases).toContain("changes.patch");
    expect(bases).toContain("workspace.diff");
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
