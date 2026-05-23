import { describe, expect, test } from "bun:test";

import {
  createRuntimeReadiness,
  featureEnabled,
  markRuntimeReady,
  recordStartupFailure,
  recordStartupStep,
  resolveExplicitPort,
  SERVER_STARTUP_ORDER,
  startOptionalRuntimeComponents,
} from "./server-lifecycle.ts";

describe("server runtime lifecycle", () => {
  test("records deterministic startup order for readiness and doctor output", () => {
    const readiness = createRuntimeReadiness();
    const events: string[] = [];

    for (const step of SERVER_STARTUP_ORDER) {
      recordStartupStep(readiness, step, (event) => {
        if (event.step) events.push(event.step);
      });
    }
    markRuntimeReady(readiness);

    expect(readiness.status).toBe("ready");
    expect(readiness.completed).toEqual([
      "config",
      "database",
      "migrations",
      "nest",
      "streams-workers",
    ]);
    expect(events).toEqual(readiness.completed);
  });

  test("records actionable startup failure state", () => {
    const readiness = createRuntimeReadiness();

    recordStartupStep(readiness, "config");
    recordStartupFailure(readiness, "database", new Error("database unavailable"));

    expect(readiness).toEqual({
      status: "failed",
      completed: ["config"],
      components: [],
      failure: {
        step: "database",
        message: "database unavailable",
      },
    });
  });

  test("parses feature flags and rejects invalid explicit ports", () => {
    expect(featureEnabled({ FULCRUM_FEATURES: "public-api, real-time-collab-server" }, "real-time-collab-server")).toBe(true);
    expect(featureEnabled({ FULCRUM_FEATURES: "public-api" }, "real-time-collab-server")).toBe(false);
    expect(resolveExplicitPort({ FULCRUM_YJS_PORT: "43210" }, "FULCRUM_YJS_PORT")).toBe(43210);
    expect(resolveExplicitPort({}, "FULCRUM_YJS_PORT")).toBeNull();
    expect(() => resolveExplicitPort({ FULCRUM_YJS_PORT: "hidden-default" }, "FULCRUM_YJS_PORT")).toThrow(
      "Invalid FULCRUM_YJS_PORT: hidden-default",
    );
  });

  test("keeps optional Yjs server disabled until both feature flag and explicit port are present", async () => {
    const noFeature = await startOptionalRuntimeComponents({
      dataSource: null,
      env: {},
    });
    const noPort = await startOptionalRuntimeComponents({
      dataSource: null,
      env: { FULCRUM_FEATURES: "real-time-collab-server" },
    });

    expect(noFeature.components).toEqual([{
      name: "yjs-collaboration",
      status: "disabled",
      detail: "feature flag real-time-collab-server disabled",
    }]);
    expect(noPort.components).toEqual([{
      name: "yjs-collaboration",
      status: "disabled",
      detail: "set FULCRUM_YJS_PORT to enable Yjs collaboration server",
    }]);
    expect(noFeature.closeables).toEqual([]);
    expect(noPort.closeables).toEqual([]);
  });
});
