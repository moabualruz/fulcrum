import { describe, expect, test } from "bun:test";

import { createGracefulShutdown } from "@platform-core/application/platform-operations/shutdown-coordinator.ts";

describe("createGracefulShutdown", () => {
  test("runs shutdown hooks in infrastructure-safe order", async () => {
    const calls: string[] = [];
    const shutdown = createGracefulShutdown({
      stopWorkers: async () => { calls.push("stopWorkers"); },
      closeSubscriptions: async () => { calls.push("closeSubscriptions"); },
      closeHttpServer: async () => { calls.push("closeHttpServer"); },
      closeDatabase: async () => { calls.push("closeDatabase"); },
      cleanupWorkspaces: async () => { calls.push("cleanupWorkspaces"); },
      log: () => undefined,
    });

    const result = await shutdown.shutdown("SIGTERM");

    expect(result).toEqual({
      ok: true,
      signal: "SIGTERM",
      completed: [
        "stopWorkers",
        "closeSubscriptions",
        "closeHttpServer",
        "closeDatabase",
        "cleanupWorkspaces",
      ],
    });
    expect(calls).toEqual(result.completed);
  });

  test("returns cached completion result for repeated signal", async () => {
    let calls = 0;
    const shutdown = createGracefulShutdown({
      stopWorkers: async () => { calls += 1; },
      closeSubscriptions: async () => { calls += 1; },
      closeHttpServer: async () => { calls += 1; },
      closeDatabase: async () => { calls += 1; },
      cleanupWorkspaces: async () => { calls += 1; },
      log: () => undefined,
    });

    const first = await shutdown.shutdown("SIGTERM");
    const second = await shutdown.shutdown("SIGTERM");

    expect(second).toBe(first);
    expect(calls).toBe(5);
  });

  test("concurrent shutdown calls share one completion promise", async () => {
    let calls = 0;
    const shutdown = createGracefulShutdown({
      stopWorkers: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 1));
      },
      closeSubscriptions: async () => { calls += 1; },
      closeHttpServer: async () => { calls += 1; },
      closeDatabase: async () => { calls += 1; },
      cleanupWorkspaces: async () => { calls += 1; },
      log: () => undefined,
    });

    const [first, second] = await Promise.all([
      shutdown.shutdown("SIGINT"),
      shutdown.shutdown("SIGTERM"),
    ]);

    expect(second).toBe(first);
    expect(calls).toBe(5);
  });

  test("reports the failed shutdown hook without running later cleanup", async () => {
    const calls: string[] = [];
    const shutdown = createGracefulShutdown({
      stopWorkers: async () => { calls.push("stopWorkers"); },
      closeSubscriptions: async () => { throw new Error("websocket close failed"); },
      closeHttpServer: async () => { calls.push("closeHttpServer"); },
      closeDatabase: async () => { calls.push("closeDatabase"); },
      cleanupWorkspaces: async () => { calls.push("cleanupWorkspaces"); },
      log: () => undefined,
    });

    const result = await shutdown.shutdown("SIGTERM");

    expect(result).toEqual({
      ok: false,
      signal: "SIGTERM",
      completed: ["stopWorkers"],
      failed: "closeSubscriptions",
      error: "websocket close failed",
    });
    expect(calls).toEqual(["stopWorkers"]);
  });

  test("allows callers to omit hooks for runtime components that are disabled", async () => {
    const shutdown = createGracefulShutdown({
      closeDatabase: async () => undefined,
      log: () => undefined,
    });

    const result = await shutdown.shutdown("SIGTERM");

    expect(result.ok).toBe(true);
    expect(result.completed).toEqual([
      "stopWorkers",
      "closeSubscriptions",
      "closeHttpServer",
      "closeDatabase",
      "cleanupWorkspaces",
    ]);
  });
});
