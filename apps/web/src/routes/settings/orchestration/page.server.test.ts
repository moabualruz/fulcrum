import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; input?: Record<string, unknown> }> = [];
let config: Record<string, unknown> | null = null;
const workflows = [{ id: "workflow-1", name: "Default workflow" }];

mock.module("$lib/server/orchestration-config-api", () => ({
  createOrchestrationConfigApiForEvent: () => ({
    orchestration: {
      getConfig: async () => {
        calls.push({ method: "getConfig" });
        return config;
      },
      saveConfig: async (input: Record<string, unknown>) => {
        calls.push({ method: "saveConfig", input });
        config = {
          poll_interval_s: input.pollIntervalS,
          max_concurrency: input.maxConcurrency,
          stall_timeout_s: input.stallTimeoutS,
          workspace_root: input.workspaceRoot,
        };
        return config;
      },
    },
    workflows: {
      list: async () => {
        calls.push({ method: "workflows.list" });
        return workflows;
      },
    },
  }),
}));

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

function event(data: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  const url = new URL("http://localhost/settings/orchestration");
  return {
    url,
    locals: { activeProjectId: null },
    request: new Request(url, { method: "POST", body: fd }),
    fetch,
  };
}

describe("/settings/orchestration +page.server.ts", () => {
  beforeEach(() => {
    calls.splice(0, calls.length);
    config = null;
  });

  test("load returns default config when none exists", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(event() as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ config: { poll_interval_s: number }; workflows: unknown[] }>(result);
    expect(payload.config.poll_interval_s).toBe(5);
    expect(payload.workflows).toEqual(workflows);
    expect(calls).toEqual([{ method: "getConfig" }, { method: "workflows.list" }]);
  });

  test("save action creates config through the public API", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.actions.save(
      event({
        poll_interval_s: "10",
        max_concurrency: "8",
        stall_timeout_s: "600",
        workspace_root: "/ws",
      }) as Parameters<typeof mod.actions.save>[0],
    );
    expect(result).toEqual({ ok: true, message: "Orchestration config saved" });
    expect(config).toEqual({
      poll_interval_s: 10,
      max_concurrency: 8,
      stall_timeout_s: 600,
      workspace_root: "/ws",
    });
    expect(calls).toEqual([
      {
        method: "saveConfig",
        input: { pollIntervalS: 10, maxConcurrency: 8, stallTimeoutS: 600, workspaceRoot: "/ws" },
      },
    ]);
  });

  test("save action rejects invalid poll interval", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.actions.save(
      event({ poll_interval_s: "0", max_concurrency: "4", stall_timeout_s: "300" }) as Parameters<typeof mod.actions.save>[0],
    );
    expect(result).toMatchObject({ status: 400, data: { error: "Poll interval must be 1-3600s" } });
    expect(calls).toEqual([]);
  });
});
