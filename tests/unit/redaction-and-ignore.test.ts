import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadIgnoredPathPolicy } from "@fulcrum/core";
import { redactText } from "@fulcrum/policy";

describe("redaction and ignored path behavior", () => {
  it("redacts registered secret patterns", () => {
    const result = redactText("token=abc123 and Authorization: Bearer abcdefghijklmnopqrstuvwxyz");
    expect(result.redacted).toBe(true);
    expect(result.text).toContain("token=[REDACTED]");
    expect(result.text).toContain("Bearer [REDACTED]");
  });

  it("loads ignore sources and matches simple patterns", async () => {
    const root = await mkdir(path.join(os.tmpdir(), `fulcrum-ignore-${Date.now()}`), {
      recursive: true
    });
    await writeFile(path.join(root, ".gitignore"), "node_modules/\n.env*\n");
    await writeFile(path.join(root, ".fulcrumignore"), "secrets/\n");

    const policy = await loadIgnoredPathPolicy(root);
    expect(policy.sources.sort()).toEqual([".fulcrumignore", ".gitignore"]);
    expect(policy.isIgnored("node_modules/pkg/index.js")).toBe(true);
    expect(policy.isIgnored(".env.local")).toBe(true);
    expect(policy.isIgnored("src/index.ts")).toBe(false);
  });
});
