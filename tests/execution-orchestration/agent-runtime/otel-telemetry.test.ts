import { describe, expect, mock, test } from "bun:test";

import {
  initTracer,
  traceTransition,
  type SpanRecord,
} from "@execution-orchestration/infrastructure/agent-runtime/symphony/telemetry.ts";
import {
  tick,
  type TickDeps,
} from "@execution-orchestration/infrastructure/agent-runtime/symphony/dispatch.ts";
import type { WorkflowConfig } from "@execution-orchestration/infrastructure/agent-runtime/symphony/schemas.ts";

const DEFAULT_CONFIG: WorkflowConfig = {
  stallTimeoutMs: 300_000,
  maxRetryBackoffMs: 300_000,
  keepOnFailure: false,
  maxAttempts: 3,
};

function makeCandidate(id: string) {
  return {
    id,
    identifier: id,
    title: `Task ${id}`,
    state: "ready",
    status: "ready" as const,
    priority: 1,
    createdAt: new Date(),
    blockedByIds: [],
    workflowId: null,
  };
}

function makeRun(id: string, taskId: string, orgId: string) {
  return {
    id,
    org: { id: orgId },
    task: { id: taskId, org: { id: orgId } },
    attemptCount: 2,
  };
}

function makeDeps(overrides: Partial<TickDeps> = {}): TickDeps {
  return {
    orgId: "org-otel",
    instanceId: "inst-otel",
    maxConcurrency: 1,
    config: DEFAULT_CONFIG,
    fetchCandidateIssues: mock(async () => [makeCandidate("task-otel")]),
    claimRun: mock(async () => ({ runId: "run-otel" })),
    getRunEntity: mock(async () => makeRun("run-otel", "task-otel", "org-otel")),
    createWorkspace: mock(async () => "/tmp/ws/otel"),
    renderPrompt: mock(async () => "prompt"),
    dispatchToRunner: mock(async () => ({ success: true })),
    destroyWorkspace: mock(async () => {}),
    transitionState: mock(async () => {}),
    dispatchHook: mock(async () => {}),
    emitSpan: mock(() => {}),
    countRunningRuns: mock(async () => 0),
    ...overrides,
  };
}

describe("orchestration OTel telemetry", () => {
  test("traceTransition creates a span with transition metadata", () => {
    const spans: SpanRecord[] = [];
    const tracer = initTracer("fulcrum-test", { spanRecorder: (span) => spans.push(span) });

    traceTransition(tracer, "claimed", "running", {
      org_id: "org-1",
      run_id: "run-1",
      attempt_count: 3,
    });

    expect(spans).toEqual([
      {
        name: "symphony.state_transition",
        attributes: {
          from_state: "claimed",
          to_state: "running",
          org_id: "org-1",
          run_id: "run-1",
          attempt_count: 3,
        },
      },
    ]);
  });

  test("initTracer falls back to no-op when exporter is unset", () => {
    const previousEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
    delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
    try {
      const tracer = initTracer("fulcrum-test");
      expect(() => {
        traceTransition(tracer, "unclaimed", "claimed", {
          org_id: "org-1",
          run_id: "run-1",
          attempt_count: 1,
        });
      }).not.toThrow();
    } finally {
      if (previousEndpoint === undefined) {
        delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
      } else {
        process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] = previousEndpoint;
      }
    }
  });

  test("dispatch loop emits one OTel state-transition span per transition", async () => {
    const spans: SpanRecord[] = [];
    const tracer = initTracer("fulcrum-test", { spanRecorder: (span) => spans.push(span) });

    await tick(makeDeps({ tracer }));

    expect(spans.map((span) => span.attributes.from_state)).toEqual([
      "unclaimed",
      "claimed",
      "running",
    ]);
    expect(spans.map((span) => span.attributes.to_state)).toEqual([
      "claimed",
      "running",
      "succeeded",
    ]);
    expect(spans.every((span) => span.name === "symphony.state_transition")).toBe(true);
    expect(spans.every((span) => span.attributes.org_id === "org-otel")).toBe(true);
    expect(spans.every((span) => span.attributes.run_id === "run-otel")).toBe(true);
    expect(spans.every((span) => span.attributes.attempt_count === 2)).toBe(true);
  });
});
