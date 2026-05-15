import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

const root = process.cwd();
const submoduleDir = join(root, "vendor/openai-symphony");
const specPath = join(submoduleDir, "SPEC.md");
const lockPath = join(root, ".symphony-spec.lock");

function parseLock(): Record<string, string> {
  const text = readFileSync(lockPath, "utf8");
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"))
      .map((line) => {
        const [key, ...value] = line.split("=");
        return [key!, value.join("=")];
      }),
  );
}

function git(args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function requireLockValue(lock: Record<string, string>, key: string): string {
  const value = lock[key];
  expect(value).toBeDefined();
  return value!;
}

describe("Symphony SPEC lock", () => {
  it("pins the openai/symphony submodule commit and SPEC.md content hash", () => {
    expect(existsSync(specPath)).toBe(true);
    expect(existsSync(lockPath)).toBe(true);

    const lock = parseLock();
    const lockedCommit = requireLockValue(lock, "submodule_commit");
    const lockedSpecSha = requireLockValue(lock, "spec_sha256");
    expect(lockedCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(lockedSpecSha).toMatch(/^[0-9a-f]{64}$/);

    const actualCommit = git(["-C", submoduleDir, "rev-parse", "HEAD"]);
    const actualSpecSha = createHash("sha256").update(readFileSync(specPath)).digest("hex");

    expect(actualCommit).toBe(lockedCommit);
    expect(actualSpecSha).toBe(lockedSpecSha);
  });
});
