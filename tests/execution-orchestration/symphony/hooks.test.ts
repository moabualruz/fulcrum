/**
 * TDD — Symphony lifecycle hooks.
 *
 * RED target: services/execution-orchestration/src/infrastructure/agent-runtime/symphony/hooks.ts missing.
 * GREEN target: typed lifecycle hook dispatch with timeout, event emission,
 * and orchestrator happy-path order.
 */

import { afterEach, describe, expect, it } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { Task } from "@platform-core/infrastructure/application-database/entities/tasks/Task.ts";
import { AgentRun } from "@platform-core/infrastructure/application-database/entities/orchestration/AgentRun.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { createTestOrm, type TestOrm } from "@test-support/index.ts";
import {
  DEFAULT_HOOK_TIMEOUT_MS,
  HookTimeoutError,
  dispatchLifecycleHook,
  type LifecycleHookContext,
  type LifecycleHooks,
} from "@execution-orchestration/infrastructure/agent-runtime/symphony/hooks.ts";
import { dispatchRunWithHooks } from "@execution-orchestration/infrastructure/agent-runtime/symphony/orchestrator.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function seedHookContext(): Promise<LifecycleHookContext> {
  db = await createTestOrm();
  const em = db.em.fork();
  const org = em.getReference(Org, DEFAULT_ORG_ID);
  const task = em.create(Task, {
    id: "30000000-0000-0000-0000-000000000901",
    org,
    createdAt: new Date("2026-05-02T09:00:00.000Z"),
    blockedByIds: [],
    status: "ready",
    priority: 1,
  });
  const run = em.create(AgentRun, {
    id: "40000000-0000-0000-0000-000000000901",
    org,
    task,
    createdAt: new Date("2026-05-02T09:01:00.000Z"),
    startedAt: new Date("2026-05-02T09:01:00.000Z"),
    orchestrationState: "claimed",
    attemptCount: 2,
    workspacePath: "/tmp/fulcrum-hooks-test",
    sandboxMode: "host",
    iterationCount: 0,
  });

  em.persist([task, run]);
  await em.flush();

  return {
    run,
    task,
    workspacePath: "/tmp/fulcrum-hooks-test",
    attempt: 2,
  };
}

async function hookEvents(runId: string): Promise<Event[]> {
  if (!db) throw new Error("missing test db");
  return db.em.fork().find(Event, {
    subjectKind: "agent_run",
    subjectId: runId,
    verb: "hook_dispatched",
  }, { orderBy: { createdAt: "ASC" } });
}

describe("dispatchLifecycleHook", () => {
  it("dispatches before_run, after_run, on_failure, and on_cancel hooks", async () => {
    const ctx = await seedHookContext();
    const seen: string[] = [];
    const hooks: LifecycleHooks = {
      before_run: () => { seen.push("before_run"); },
      after_run: () => { seen.push("after_run"); },
      on_failure: () => { seen.push("on_failure"); },
      on_cancel: () => { seen.push("on_cancel"); },
    };

    await dispatchLifecycleHook(db!.em, "before_run", ctx, hooks);
    await dispatchLifecycleHook(db!.em, "after_run", ctx, hooks);
    await dispatchLifecycleHook(db!.em, "on_failure", ctx, hooks);
    await dispatchLifecycleHook(db!.em, "on_cancel", ctx, hooks);

    expect(seen).toEqual(["before_run", "after_run", "on_failure", "on_cancel"]);
  });

  it("uses the default 60s timeout when no per-hook override is provided", async () => {
    const ctx = await seedHookContext();
    const observedTimeouts: number[] = [];

    await dispatchLifecycleHook(db!.em, "before_run", ctx, {
      before_run: (_ctx, meta) => {
        observedTimeouts.push(meta.timeoutMs);
      },
    });

    expect(observedTimeouts).toEqual([DEFAULT_HOOK_TIMEOUT_MS]);
  });

  it("calls the Pillar 8 context assembler boundary before before_run hooks", async () => {
    const ctx = await seedHookContext();
    const order: string[] = [];

    await dispatchLifecycleHook(
      db!.em,
      "before_run",
      ctx,
      {
        before_run: () => { order.push("before_run"); },
      },
      {},
      {
        contextAssembler: {
          assemble: async () => { order.push("assemble_context"); },
        },
      },
    );

    expect(order).toEqual(["assemble_context", "before_run"]);
  });

  it("calls the before-run context hook with run, task, agent type, and workspace before before_run hooks", async () => {
    const ctx = await seedHookContext();
    ctx.run.agentName = "codex";
    const order: string[] = [];
    const calls: unknown[] = [];

    await dispatchLifecycleHook(
      db!.em,
      "before_run",
      ctx,
      {
        before_run: () => { order.push("before_run"); },
      },
      {},
      {
        beforeRunContextHook: {
          handle: async (...args: unknown[]) => {
            order.push("before_run_context");
            calls.push(args);
            return { slices: [], tokenCount: 0 };
          },
        },
      },
    );

    expect(order).toEqual(["before_run_context", "before_run"]);
    expect(calls).toEqual([
      [ctx.run.id, ctx.task.id, "codex", { workspacePath: ctx.workspacePath }],
    ]);
  });

  it("rejects hooks exceeding their per-hook timeout with HookTimeoutError", async () => {
    const ctx = await seedHookContext();

    await expect(
      dispatchLifecycleHook(
        db!.em,
        "before_run",
        ctx,
        {
          before_run: () => new Promise((resolve) => {
            setTimeout(resolve, 30);
          }),
        },
        { before_run_timeout_ms: 5 },
      ),
    ).rejects.toBeInstanceOf(HookTimeoutError);
  });

  it("emits hook_dispatched events with hookName and durationMs", async () => {
    const ctx = await seedHookContext();

    await dispatchLifecycleHook(db!.em, "after_run", ctx, {
      after_run: () => undefined,
    });

    const events = await hookEvents(ctx.run.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.payload?.hookName).toBe("after_run");
    expect(typeof events[0]?.payload?.durationMs).toBe("number");
  });
});

describe("dispatchRunWithHooks", () => {
  it("runs before_run, agent dispatch, and after_run in happy-path order", async () => {
    const ctx = await seedHookContext();
    const order: string[] = [];

    const result = await dispatchRunWithHooks(
      db!.em,
      ctx,
      async () => {
        order.push("agent");
        return { status: "ok" };
      },
      {
        before_run: () => { order.push("before_run"); },
        after_run: () => { order.push("after_run"); },
      },
    );

    expect(result).toEqual({ status: "ok" });
    expect(order).toEqual(["before_run", "agent", "after_run"]);
    expect((await hookEvents(ctx.run.id)).map((event) => event.payload?.hookName))
      .toEqual(["before_run", "after_run"]);
  });

  it("dispatches on_failure when the agent dispatch fails", async () => {
    const ctx = await seedHookContext();
    const order: string[] = [];

    await expect(
      dispatchRunWithHooks(
        db!.em,
        ctx,
        async () => {
          order.push("agent");
          throw new Error("agent failed");
        },
        {
          before_run: () => { order.push("before_run"); },
          on_failure: () => { order.push("on_failure"); },
        },
      ),
    ).rejects.toThrow("agent failed");

    expect(order).toEqual(["before_run", "agent", "on_failure"]);
    expect((await hookEvents(ctx.run.id)).map((event) => event.payload?.hookName))
      .toEqual(["before_run", "on_failure"]);
  });

  it("dispatches on_cancel when the agent dispatch is cancelled", async () => {
    const ctx = await seedHookContext();
    const order: string[] = [];
    const cancelError = new Error("cancelled");
    cancelError.name = "AbortError";

    await expect(
      dispatchRunWithHooks(
        db!.em,
        ctx,
        async () => {
          order.push("agent");
          throw cancelError;
        },
        {
          before_run: () => { order.push("before_run"); },
          on_cancel: () => { order.push("on_cancel"); },
        },
      ),
    ).rejects.toThrow("cancelled");

    expect(order).toEqual(["before_run", "agent", "on_cancel"]);
    expect((await hookEvents(ctx.run.id)).map((event) => event.payload?.hookName))
      .toEqual(["before_run", "on_cancel"]);
  });
});
