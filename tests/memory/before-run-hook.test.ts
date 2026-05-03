import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BeforeRunContextHook,
  type BeforeRunContextHookCtx,
} from "../../src/memory/hooks/before-run-hook.ts";
import type { ContextBundle } from "../../src/context/assemble.ts";

const TASK_ID = "22222222-2222-2222-2222-222222222222";
const RUN_ID = "40000000-0000-0000-0000-000000000901";

let tempDirs: string[] = [];

afterEach(async () => {
  delete process.env["FULCRUM_CONTEXT_BUNDLE_PATH"];
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("BeforeRunContextHook", () => {
  test("assembles context with run id and writes default workspace context file", async () => {
    const workspacePath = await tempWorkspace();
    const bundle = bundleFixture();
    const assembler = new FakeContextAssembler(bundle);
    const hook = new BeforeRunContextHook(assembler);

    const returned = await hook.handle(RUN_ID, TASK_ID, "codex", { workspacePath });

    expect(returned).toEqual(bundle);
    expect(assembler.calls).toEqual([
      [TASK_ID, { agentType: "codex", runId: RUN_ID }],
    ]);
    const written = JSON.parse(
      await readFile(join(workspacePath, ".fulcrum", "context.json"), "utf8"),
    );
    expect(written).toEqual(bundle);
    expect(Object.keys(written.slices)).toHaveLength(5);
  });

  test("honors configurable relative context bundle path", async () => {
    const workspacePath = await tempWorkspace();
    process.env["FULCRUM_CONTEXT_BUNDLE_PATH"] = "custom/context.bundle.json";
    const hook = new BeforeRunContextHook(new FakeContextAssembler(bundleFixture()));

    await hook.handle(RUN_ID, TASK_ID, "codex", { workspacePath });

    const written = JSON.parse(
      await readFile(join(workspacePath, "custom", "context.bundle.json"), "utf8"),
    );
    expect(written.taskId).toBe(TASK_ID);
  });

  test("writes minimal error bundle and warns when assembler fails", async () => {
    const workspacePath = await tempWorkspace();
    const warnings: string[] = [];
    const ctx: BeforeRunContextHookCtx = {
      workspacePath,
      logger: { warn: (message) => warnings.push(message) },
    };
    const hook = new BeforeRunContextHook(new ThrowingContextAssembler());

    const returned = await hook.handle(RUN_ID, TASK_ID, "codex", ctx);

    expect(returned).toEqual({
      taskId: TASK_ID,
      slices: [],
      tokenCount: 0,
      error: "retriever DB unavailable",
    });
    expect(warnings).toEqual([
      "before_run context assembly failed for run 40000000-0000-0000-0000-000000000901: retriever DB unavailable",
    ]);
    const written = JSON.parse(
      await readFile(join(workspacePath, ".fulcrum", "context.json"), "utf8"),
    );
    expect(written).toEqual(returned);
  });
});

async function tempWorkspace(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "fulcrum-before-run-"));
  tempDirs.push(path);
  return path;
}

function bundleFixture(): ContextBundle {
  return {
    taskId: TASK_ID,
    orgId: "00000000-0000-0000-0000-000000000001",
    projectId: null,
    tokenBudget: 8192,
    tokenCount: 5,
    slices: {
      memories: { content: "memory", tokenCount: 1 },
      linkedDocs: { content: "doc", tokenCount: 1 },
      recentRuns: { content: "run", tokenCount: 1 },
      repoState: { content: "repo", tokenCount: 1 },
      skillPrompts: { content: "skill", tokenCount: 1 },
    },
  };
}

class FakeContextAssembler {
  readonly calls: Array<[string, unknown]> = [];

  constructor(private readonly bundle: ContextBundle) {}

  async assemble(taskId: string, opts: unknown): Promise<{ bundle: ContextBundle; snapshotId: string }> {
    this.calls.push([taskId, opts]);
    return { bundle: this.bundle, snapshotId: "snapshot-1" };
  }
}

class ThrowingContextAssembler {
  async assemble(): Promise<never> {
    throw new Error("retriever DB unavailable");
  }
}
