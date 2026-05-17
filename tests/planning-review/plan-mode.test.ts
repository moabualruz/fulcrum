import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

import {
  getPlanDirectory,
  normalizeEditPermission,
  stripConflictingPlanModeRules,
  validatePlanPath,
} from "@planning-review/application/plan-mode.ts";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "fulcrum-plan-review-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("review planning behavior behavior", () => {
  test("returns XDG-based OpenCode plans path by default", () => {
    const previous = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = "/tmp/fulcrum-data-home";
    try {
      expect(getPlanDirectory()).toBe(path.join("/tmp/fulcrum-data-home", "opencode", "plans"));
    } finally {
      if (previous === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = previous;
    }
  });

  test("rejects non-absolute plan paths", () => {
    const result = validatePlanPath("relative/plan.md", makeTempDir());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Path must be absolute");
  });

  test("rejects missing plan files", () => {
    const planDir = makeTempDir();
    const missingPath = path.join(planDir, "missing.md");
    const result = validatePlanPath(missingPath, planDir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("No plan file found");
  });

  test("rejects whitespace-only plan files", () => {
    const planDir = makeTempDir();
    const planPath = path.join(planDir, "empty.md");
    writeFileSync(planPath, " \n\t ");
    const result = validatePlanPath(planPath, planDir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("is empty");
  });

  test("accepts valid plan files and re-reads updated content", () => {
    const planDir = makeTempDir();
    const planPath = path.join(planDir, "plan.md");
    writeFileSync(planPath, "# Plan v1");
    const first = validatePlanPath(planPath, planDir);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.content).toBe("# Plan v1");

    writeFileSync(planPath, "# Plan v2 - addressed feedback");
    const second = validatePlanPath(planPath, planDir);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.content).toBe("# Plan v2 - addressed feedback");
  });

  test("normalizes string edit permissions before merging markdown allowance", () => {
    expect(normalizeEditPermission(undefined)).toEqual({});
    expect(normalizeEditPermission("deny")).toEqual({ "*": "deny" });
    expect(normalizeEditPermission("allow")).toEqual({ "*": "allow" });
    expect(normalizeEditPermission("ask")).toEqual({ "*": "ask" });
    const merged: Record<string, string> = { ...normalizeEditPermission("deny"), "*.md": "allow" };
    expect(merged).toEqual({ "*": "deny", "*.md": "allow" });
    expect(Object.keys(merged)).not.toContain("0");
  });

  test("strips conflicting OpenCode plan-mode rules while preserving useful text", () => {
    expect(
      stripConflictingPlanModeRules([
        "Read-only mode\nSTRICTLY FORBIDDEN: ANY file edits.\nUse tools carefully.",
        "The plan lives only in the agent's conversation, not on disk.\nKeep the plan concise.",
        "Create your plan at /tmp/.opencode/plans/1234-test.md\nCall plan_exit when ready.\nKeep real context.",
      ]),
    ).toEqual(["Read-only mode\nUse tools carefully.", "Keep the plan concise.", "Keep real context."]);
  });
});
