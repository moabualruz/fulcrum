/**
 * Root wiring and LangGraph boundary tests.
 *
 * Verifies:
 *   1. Root appRouter mounts canonical inference, routing, and fulcrum_skills routers.
 *   2. Doctor inference check names (inference-sidecar, inference-backends) registered.
 *   3. No @langchain/langgraph or @langchain/core imports leak into agent/orchestration/CLI boundaries.
 */

import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { appRouter } from "../router.ts";

function countInFile(content: string, pattern: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = content.indexOf(pattern, idx)) !== -1) {
    count++;
    idx += pattern.length;
  }
  return count;
}

describe("root wiring — canonical router mounts", () => {
  test("appRouter has inference, routing, and fulcrum_skills keys", () => {
    const keys = Object.keys(appRouter);
    expect(keys).toContain("inference");
    expect(keys).toContain("routing");
    expect(keys).toContain("fulcrum_skills");
  });

  test("router.ts source contains imports for all three canonical routers", async () => {
    const src = await readFile(new URL("../router.ts", import.meta.url), "utf-8");
    expect(src).toContain('inferenceRouter');
    expect(src).toContain('routingRouter');
    expect(src).toContain('skillsRouter');
  });
});

describe("doctor inference check names", () => {
  test("inference-sidecar check is registered", async () => {
    const src = await readFile(join(process.cwd(), "services/platform-core/src/application/health-checks/checks/inference.ts"), "utf-8");
    expect(src).toContain("inference-sidecar");
  });

  test("inference-backends check is registered", async () => {
    const src = await readFile(join(process.cwd(), "services/platform-core/src/application/health-checks/checks/inference.ts"), "utf-8");
    expect(src).toContain("inference-backends");
  });
});

describe("LangGraph/LangChain boundary — no leaks to agent, orchestration, or CLI", () => {
  const BOUNDARY_DIRS = ["services/execution-orchestration/src/application/agent-catalog", "services/execution-orchestration/src/infrastructure/agent-runtime", "apps/cli/src"];
  const FORBIDDEN_PATTERNS = ["@langchain/langgraph", "@langchain/core"];

  /** Walk directory recursively and find any files containing the forbidden pattern. */
  async function findPatternInDir(dirPath: string, pattern: string): Promise<string | null> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        const result = await findPatternInDir(fullPath, pattern);
        if (result) return result;
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        try {
          const content = await readFile(fullPath, "utf-8");
          if (content.includes(pattern)) return fullPath;
        } catch {
          // skip unreadable
        }
      }
    }
    return null;
  }

  for (const dir of BOUNDARY_DIRS) {
    FORBIDDEN_PATTERNS.forEach((pattern) => {
      test(`no '${pattern}' in ${dir}`, async () => {
        const absDir = join(process.cwd(), dir);
        const foundIn = await findPatternInDir(absDir, pattern);
        expect(foundIn).toBeNull();
      });
    });
  }
});
