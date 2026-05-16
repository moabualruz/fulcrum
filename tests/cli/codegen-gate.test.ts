import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { checkGeneratedSnapshot } from "../../scripts/ci/codegen.ts";
import { STEPS } from "../../scripts/ci.ts";

async function tempDir(name: string): Promise<string> {
  const dir = join(tmpdir(), `${name}-${crypto.randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("ci:codegen snapshot gate", () => {
  test("passes when fresh codegen output matches committed generated snapshot", async () => {
    const committedDir = await tempDir("fulcrum-committed-generated");
    const freshDir = await tempDir("fulcrum-fresh-generated");
    try {
      await writeFile(join(committedDir, "projects.ts"), "export const same = true;\n");
      await writeFile(join(freshDir, "projects.ts"), "export const same = true;\n");

      const result = await checkGeneratedSnapshot({ committedDir, freshDir });

      expect(result.ok).toBe(true);
      expect(result.changedFiles).toEqual([]);
      expect(result.message).toBe("ci:codegen OK — generated snapshot matches fresh codegen");
    } finally {
      await rm(committedDir, { recursive: true, force: true });
      await rm(freshDir, { recursive: true, force: true });
    }
  });

  test("fails with regeneration guidance when generated snapshot diverges", async () => {
    const committedDir = await tempDir("fulcrum-committed-generated");
    const freshDir = await tempDir("fulcrum-fresh-generated");
    try {
      await writeFile(join(committedDir, "projects.ts"), "export const same = false;\n");
      await writeFile(join(freshDir, "projects.ts"), "export const same = true;\n");

      const result = await checkGeneratedSnapshot({ committedDir, freshDir });

      expect(result.ok).toBe(false);
      expect(result.changedFiles).toEqual(["projects.ts"]);
      expect(result.message).toContain("AppRouter changed without regenerating snapshots; run: bun run codegen");
    } finally {
      await rm(committedDir, { recursive: true, force: true });
      await rm(freshDir, { recursive: true, force: true });
    }
  });

  test("runs ci:codegen before build:all in bun run ci", () => {
    const names = STEPS.map((step) => step.name);

    expect(names).toContain("ci:codegen");
    expect(names.indexOf("ci:codegen")).toBeLessThan(names.indexOf("build"));

    const step = STEPS.find((candidate) => candidate.name === "ci:codegen");
    expect(step?.cmd).toEqual(["bun", "run", "scripts/ci/codegen.ts"]);
  });
});
